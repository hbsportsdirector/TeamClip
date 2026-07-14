import { Directory, File, Paths } from "expo-file-system";
import { loadJSON, saveJSON } from "./persist";
import { listMerges } from "./dailyMerge";
import { listClips } from "./clips";
import { listMultiReviews } from "./review";
import { exportVideoName, multiExportVideoName } from "./exportReview";
import * as googleAuth from "./googleAuth";
import { ensureFolderPath, shareFolderOnce, uploadFile } from "./drive";

// Lokal uppladdningskö enligt spec: hallar har dålig täckning, så allt
// sparas först lokalt och laddas upp när det går. Status per fil ligger i
// uploads.json; misslyckade försök görs om vid nästa kick(). Kön bearbetar
// en fil i taget – tränarens mobildata ska inte mättas mitt i passet.
const STATE_FILE = "uploads.json";

let uploads = null;
let processing = false;
const listeners = new Set();

const getUploads = () => {
  if (!uploads) uploads = loadJSON(STATE_FILE, {});
  return uploads;
};
const persist = () => saveJSON(STATE_FILE, getUploads());

const notify = () => listeners.forEach((cb) => cb());

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getStatus(fileName) {
  return getUploads()[fileName] ?? null;
}

export function getStats() {
  const all = Object.values(getUploads());
  return {
    done: all.filter((u) => u.status === "done").length,
    error: all.filter((u) => u.status === "error").length,
    uploading: all.filter((u) => u.status === "uploading").length,
  };
}

function setStatus(fileName, patch) {
  const u = getUploads();
  u[fileName] = { ...(u[fileName] ?? {}), ...patch, at: Date.now() };
  persist();
  notify();
}

const clipsDir = () => new Directory(Paths.document, "clips");
const fileUri = (name) => new File(clipsDir(), name).uri;
const fileExists = (name) => {
  try {
    return new File(clipsDir(), name).exists;
  } catch {
    return false;
  }
};

// Arbetslistan: dagssammanställningarna (byggs av dailyMerge vid "Passet
// klart") + favoritkopior. Mappstruktur per spelare:
//   TeamClip/Spelare/<Namn>/<Moment>/<ÅÅÅÅ-MM-DD>/  – dagens filer
//   TeamClip/Spelare/<Namn>/<Moment>/Favoriter/     – stjärnmärkta kopior
// Delningen ligger på spelarmappen så spelaren ser allt.
function pendingWork() {
  const u = getUploads();
  const registry = loadJSON("appstate.json", { registry: [] }).registry;
  const emailOf = (playerId) => registry.find((r) => r.id === playerId)?.email ?? "";
  const work = [];

  const playerBase = (player, moment) => ["TeamClip", "Spelare", player, moment || "Traning"];
  const guestBase = (group, moment) => ["TeamClip", group || "Grupp", "Gäster", moment || "Traning"];

  for (const m of listMerges()) {
    if (!fileExists(m.file)) continue;
    // "done" gäller bara om uppladdningen skedde EFTER att sammanställningen
    // byggdes – skyddar mot att en nyare fil med samma namn hoppas över
    const st = u[m.file];
    if (st?.status === "done" && (st.at ?? 0) >= (m.createdAt ?? 0)) continue;
    const target = m.guest
      ? { folder: [...guestBase(m.group, m.moment), m.day] }
      : {
          folder: [...playerBase(m.player, m.moment), m.day],
          sharePath: ["TeamClip", "Spelare", m.player],
          shareWith: emailOf(m.playerId),
        };
    work.push({ file: m.file, driveName: m.driveName, mime: "video/mp4", ...target });
  }

  // Favoriter: enskilda kopior, laddas upp direkt (väntar inte på passet)
  for (const c of listClips(undefined, { includeArchived: true })) {
    if (!c.favorite) continue;
    const target = c.guest
      ? { folder: [...guestBase(c.group, c.moment), "Favoriter"] }
      : {
          folder: [...playerBase(c.player, c.moment), "Favoriter"],
          sharePath: ["TeamClip", "Spelare", c.player],
          shareWith: emailOf(c.playerId),
        };
    if (u[c.file]?.status !== "done") {
      work.push({ file: c.file, mime: "video/mp4", ...target });
    }
    const exp = exportVideoName(c.file);
    if (fileExists(exp) && u[exp]?.status !== "done") {
      work.push({ file: exp, mime: "video/mp4", ...target });
    }
  }
  for (const mr of listMultiReviews(undefined, { includeArchived: true })) {
    if (!mr.favorite) continue;
    const video = multiExportVideoName(mr.name);
    if (!fileExists(video) || u[video]?.status === "done") continue;
    const d = new Date(mr.createdAt || Date.now());
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    work.push({
      file: video,
      driveName: `${day}_Genomgang_${mr.player}.mp4`,
      mime: "video/mp4",
      folder: [...playerBase(mr.player, mr.moment), "Favoriter"],
      sharePath: ["TeamClip", "Spelare", mr.player],
      shareWith: emailOf(mr.playerId),
    });
  }

  return work;
}

export function pendingCount() {
  try {
    return pendingWork().length;
  } catch {
    return 0;
  }
}

// Startar bearbetning om inloggad och inte redan igång
export async function kick() {
  if (processing || !googleAuth.isAvailable()) return;
  const token = await googleAuth.getAccessToken();
  if (!token) return;

  processing = true;
  try {
    // filer som felar hoppas över resten av körningen och görs om vid nästa kick
    const failedThisRun = new Set();
    for (;;) {
      const work = pendingWork().filter((w) => !failedThisRun.has(w.file));
      if (work.length === 0) break;
      const item = work[0];
      setStatus(item.file, { status: "uploading", error: null });
      try {
        const freshToken = (await googleAuth.getAccessToken()) ?? token;
        // delningen ligger på spelarmappen, uppladdningen i datummappen
        if (item.sharePath && item.shareWith) {
          try {
            const shareId = await ensureFolderPath(freshToken, item.sharePath);
            await shareFolderOnce(freshToken, shareId, item.shareWith);
          } catch (e) {
            console.warn("Kunde inte dela mapp:", e?.message ?? e);
          }
        }
        const folderId = await ensureFolderPath(freshToken, item.folder);
        const fileId = await uploadFile(freshToken, {
          localUri: fileUri(item.file),
          name: item.driveName ?? item.file,
          mimeType: item.mime,
          folderId,
        });
        setStatus(item.file, { status: "done", fileId });
      } catch (e) {
        setStatus(item.file, { status: "error", error: String(e?.message ?? e) });
        failedThisRun.add(item.file);
        if (e?.status === 401) break; // token dog – vänta på nästa kick
      }
    }
  } finally {
    processing = false;
    notify();
  }
}

// Nollställer felstatus så att kick() försöker igen direkt
export function retryErrors() {
  const u = getUploads();
  for (const [name, s] of Object.entries(u)) {
    if (s.status === "error") u[name] = { ...s, status: "pending" };
  }
  persist();
  notify();
  return kick();
}
