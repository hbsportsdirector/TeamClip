import { Directory, File, Paths } from "expo-file-system";
import * as db from "./db";
import { reconcileJobs } from "./jobs";
import { loadJSON } from "./persist";
import { todayStr } from "./clips";
import { exportVideoName, multiExportVideoName } from "./exportReview";
import * as googleAuth from "./googleAuth";
import { ensureFolderPath, shareFolderOnce, uploadFile } from "./drive";
import { pushBackup } from "./backup";

// Explicit jobbkö: varje leverans till Drive är en rad i db.jobs med egen
// nyckel och status (pending → running → done/error). reconcileJobs härleder
// önskade leveranser ur db:n (sammanställningar + favoritkopior) och är
// självläkande – saknade eller föråldrade jobb återskapas, klara jobb med
// färskt kvitto lämnas ifred. Kön processar en fil i taget.
//
// Mappstruktur per spelare:
//   TeamClip/Spelare/<Namn>/<Moment>/<ÅÅÅÅ-MM-DD>/  – dagens filer
//   TeamClip/Spelare/<Namn>/<Moment>/Favoriter/     – stjärnmärkta kopior
// Delningen ligger på spelarmappen så spelaren ser allt.

export const subscribe = db.subscribe;

const clipsDir = () => new Directory(Paths.document, "clips");
const fileUri = (name) => new File(clipsDir(), name).uri;

function runtimeCtx() {
  const registry = loadJSON("appstate.json", { registry: [] }).registry;
  return {
    fileExists: (name) => {
      try {
        return new File(clipsDir(), name).exists;
      } catch {
        return false;
      }
    },
    emailOf: (playerId) => registry.find((r) => r.id === playerId)?.email ?? "",
    exportVideoName,
    multiExportVideoName,
    dayOf: (ts) => todayStr(new Date(ts || Date.now())),
    now: () => Date.now(),
  };
}

export function getStatus(key) {
  return db.getDb().jobs[key] ?? null;
}

export function getStats() {
  const all = Object.values(db.getDb().jobs);
  return {
    done: all.filter((j) => j.status === "done").length,
    error: all.filter((j) => j.status === "error").length,
    uploading: all.filter((j) => j.status === "running").length,
  };
}

export function pendingCount() {
  return Object.values(db.getDb().jobs).filter(
    (j) => j.status === "pending" || j.status === "running"
  ).length;
}

let processing = false;

export async function kick() {
  if (processing || !googleAuth.isAvailable()) return;
  const token = await googleAuth.getAccessToken();
  if (!token) return;

  processing = true;
  try {
    db.update((d) => reconcileJobs(d, runtimeCtx()));

    const pending = Object.values(db.getDb().jobs)
      .filter((j) => j.status === "pending")
      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

    for (const job of pending) {
      db.update((d) => {
        d.jobs[job.key] = { ...d.jobs[job.key], status: "running", error: null, updatedAt: Date.now() };
      });
      try {
        const freshToken = (await googleAuth.getAccessToken()) ?? token;
        // delningen ligger på spelarmappen, uppladdningen i mål-mappen
        if (job.sharePath && job.shareWith) {
          try {
            const shareId = await ensureFolderPath(freshToken, job.sharePath);
            await shareFolderOnce(freshToken, shareId, job.shareWith);
          } catch (e) {
            console.warn("Kunde inte dela mapp:", e?.message ?? e);
          }
        }
        const folderId = await ensureFolderPath(freshToken, job.folder);
        const fileId = await uploadFile(freshToken, {
          localUri: fileUri(job.file),
          name: job.driveName ?? job.file,
          mimeType: job.mime,
          folderId,
        });
        db.update((d) => {
          d.jobs[job.key] = { ...d.jobs[job.key], status: "done", fileId, updatedAt: Date.now() };
        });
      } catch (e) {
        db.update((d) => {
          d.jobs[job.key] = {
            ...d.jobs[job.key],
            status: "error",
            error: String(e?.message ?? e),
            attempts: (d.jobs[job.key].attempts ?? 0) + 1,
            updatedAt: Date.now(),
          };
        });
        if (e?.status === 401) break; // token dog – vänta på nästa kick
      }
    }

    // metadatan säkerhetskopieras till Drive efter varje körning
    try {
      await pushBackup(token);
    } catch (e) {
      console.warn("Backup misslyckades:", e?.message ?? e);
    }
  } finally {
    processing = false;
  }
}

// Nollställer felstatus så att kick() försöker igen direkt
export function retryErrors() {
  db.update((d) => {
    for (const j of Object.values(d.jobs)) {
      if (j.status === "error") j.status = "pending";
    }
  });
  return kick();
}
