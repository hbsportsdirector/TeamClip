import * as db from "./db";
import { loadJSON, saveJSON } from "./persist";
import * as googleAuth from "./googleAuth";
import {
  ensureFolderPath,
  findFileByName,
  createTextFile,
  updateTextFile,
  downloadTextFile,
} from "./drive";

// Säkerhetskopia av all metadata (register/grupper + hela db:n) till
// TeamClip/teamclip-backup.json i tränarens Drive. Skrivs över på plats
// (samma fil-id) efter varje lyckad uppladdningskörning. Videofilerna
// behöver ingen backup – de ligger redan i Drive.
//
// Vid återställning på en ny/rensad telefon: registret och grupperna
// kommer tillbaka helt; klipprader vars lokala filer saknas självrensas
// (videorna finns i Drive, bara inte i appens lokala bibliotek).
const BACKUP_NAME = "teamclip-backup.json";

export async function pushBackup(token) {
  const payload = JSON.stringify({
    backupVersion: 1,
    createdAt: Date.now(),
    appstate: loadJSON("appstate.json", { registry: [], groups: [] }),
    db: db.getDb(),
  });

  const folderId = await ensureFolderPath(token, ["TeamClip"]);
  let fileId = db.getDb().drive.backupFileId ?? null;
  if (!fileId) fileId = await findFileByName(token, BACKUP_NAME, folderId);

  if (fileId) {
    try {
      await updateTextFile(token, fileId, payload);
    } catch (e) {
      if (e?.status !== 404) throw e;
      fileId = await createTextFile(token, { name: BACKUP_NAME, parentId: folderId, content: payload });
    }
  } else {
    fileId = await createTextFile(token, { name: BACKUP_NAME, parentId: folderId, content: payload });
  }

  db.update((d) => {
    d.drive.backupFileId = fileId;
    d.drive.lastBackupAt = Date.now();
  });
}

export function lastBackupAt() {
  return db.getDb().drive.lastBackupAt ?? null;
}

// Hämtar säkerhetskopian och ersätter appens metadata. Returnerar en
// sammanfattning, eller null om ingen kopia finns.
export async function restoreBackup() {
  const token = await googleAuth.getAccessToken();
  if (!token) throw new Error("Inte kopplad till Google Drive.");

  const folderId = await ensureFolderPath(token, ["TeamClip"]);
  const fileId = await findFileByName(token, BACKUP_NAME, folderId);
  if (!fileId) return null;

  const payload = JSON.parse(await downloadTextFile(token, fileId));
  if (!payload?.appstate || !payload?.db) throw new Error("Säkerhetskopian är oläslig.");

  saveJSON("appstate.json", payload.appstate);
  db.replaceAll(payload.db);

  return {
    createdAt: payload.createdAt ?? 0,
    groups: payload.appstate.groups?.length ?? 0,
    players: payload.appstate.registry?.length ?? 0,
  };
}
