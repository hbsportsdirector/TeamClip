import { Directory, File, Paths } from "expo-file-system";
import { loadJSON, saveJSON } from "./persist";
import { listClips, sanitize, todayStr } from "./clips";
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

// Bygger arbetslistan: råklipp + färdiga genomgångsvideor som inte laddats
// upp. Allt sorteras i datummappar (TeamClip/Spelare/<Namn>/<ÅÅÅÅ-MM-DD>/);
// delningen ligger på spelarmappen så spelaren ser alla datum. Ljudfilerna
// (m4a) laddas inte upp – genomgångsvideon ersätter dem i Drive.
function pendingWork() {
  const u = getUploads();
  const registry = loadJSON("appstate.json", { registry: [] }).registry;
  const emailOf = (playerId) => registry.find((r) => r.id === playerId)?.email ?? "";
  const work = [];

  for (const clip of listClips(undefined, { includeArchived: true })) {
    const day = todayStr(new Date(clip.ts || Date.now()));
    const target = clip.guest
      ? { folder: ["TeamClip", clip.group || "Grupp", "Gäster", day] }
      : {
          folder: ["TeamClip", "Spelare", clip.player, day],
          sharePath: ["TeamClip", "Spelare", clip.player],
          shareWith: emailOf(clip.playerId),
        };
    if (u[clip.file]?.status !== "done") {
      work.push({ file: clip.file, mime: "video/mp4", ...target });
    }
    const exportVideo = exportVideoName(clip.file);
    if (fileExists(exportVideo) && u[exportVideo]?.status !== "done") {
      work.push({ file: exportVideo, mime: "video/mp4", ...target });
    }
  }

  for (const mr of listMultiReviews(undefined, { includeArchived: true })) {
    const video = multiExportVideoName(mr.name);
    if (fileExists(video) && u[video]?.status !== "done") {
      const d = new Date(mr.createdAt || Date.now());
      const day = todayStr(d);
      const hhmm = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
      work.push({
        file: video,
        mime: "video/mp4",
        driveName: `${day}_Genomgang_${sanitize(mr.player)}_${hhmm}.mp4`,
        folder: ["TeamClip", "Spelare", mr.player, day],
        sharePath: ["TeamClip", "Spelare", mr.player],
        shareWith: emailOf(mr.playerId),
      });
    }
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
