import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";
import * as db from "./db";

// Google Drive REST v3 med enbart scope drive.file: appen ser bara det
// den själv skapat, så mapp-id:n cachas i drive-state.json för att slippa
// sökningar. Mappstruktur enligt spec:
//   TeamClip/Spelare/<Namn>/          – delas EN gång med spelarens e-post
//   TeamClip/<Grupp>/Gäster/          – delas inte med någon
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// mappcache och delningsminne bor i db:n (db.drive)
export function resetDriveCache() {
  db.update((d) => {
    d.drive = { folders: {}, shared: {} };
  });
}

async function api(token, path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Drive ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const escapeQuery = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ——— Småfiler (backup-json): skapa, uppdatera, söka, ladda ner ————
export async function findFileByName(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${escapeQuery(name)}' and '${parentId}' in parents and trashed=false`
  );
  const data = await api(token, `/files?q=${q}&fields=files(id,name)`);
  return data.files?.[0]?.id ?? null;
}

export async function createTextFile(token, { name, parentId, content, mimeType = "application/json" }) {
  const meta = await api(token, "/files?fields=id", {
    method: "POST",
    body: { name, parents: [parentId], mimeType },
  });
  await updateTextFile(token, meta.id, content, mimeType);
  return meta.id;
}

export async function updateTextFile(token, fileId, content, mimeType = "application/json") {
  const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
    body: content,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Drive update: ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
}

export async function downloadTextFile(token, fileId) {
  const res = await fetch(`${API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Drive download: ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${escapeQuery(name)}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`
  );
  const data = await api(token, `/files?q=${q}&fields=files(id,name)`);
  return data.files?.[0]?.id ?? null;
}

async function createFolder(token, name, parentId) {
  const data = await api(token, "/files?fields=id", {
    method: "POST",
    body: { name, mimeType: FOLDER_MIME, parents: [parentId] },
  });
  return data.id;
}

// path t.ex. ["TeamClip", "Spelare", "Kalle S"] – skapar det som saknas
export async function ensureFolderPath(token, path) {
  const cache = () => db.getDb().drive.folders;
  const key = path.join("/");
  if (cache()[key]) {
    // verifiera att cachad mapp finns kvar (kan ha raderats i Drive)
    try {
      await api(token, `/files/${cache()[key]}?fields=id,trashed`);
      return cache()[key];
    } catch {
      db.update((d) => {
        delete d.drive.folders[key];
      });
    }
  }
  let parentId = "root";
  let walked = [];
  for (const segment of path) {
    walked.push(segment);
    const wKey = walked.join("/");
    if (cache()[wKey]) {
      parentId = cache()[wKey];
      continue;
    }
    let id = await findFolder(token, segment, parentId);
    if (!id) id = await createFolder(token, segment, parentId);
    db.update((d) => {
      d.drive.folders[wKey] = id;
    });
    parentId = id;
  }
  return parentId;
}

// Delar mappen med läsrättighet – körs EN gång per mapp+e-post
export async function shareFolderOnce(token, folderId, email) {
  const shared = db.getDb().drive.shared[folderId] ?? [];
  const normalized = email.trim().toLowerCase();
  if (!normalized || shared.includes(normalized)) return false;
  await api(token, `/files/${folderId}/permissions?sendNotificationEmail=true&fields=id`, {
    method: "POST",
    body: { role: "reader", type: "user", emailAddress: normalized },
  });
  db.update((d) => {
    d.drive.shared[folderId] = [...(d.drive.shared[folderId] ?? []), normalized];
  });
  return true;
}

// Resumable upload: init-anrop ger en sessions-URL, filen PUT:as dit.
// Klippen är små (10–20 MB) så vi kör hela filen i ett svep och låter
// kön göra om från början vid avbrott.
export async function uploadFile(token, { localUri, name, mimeType, folderId }) {
  const initRes = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": mimeType,
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  if (!initRes.ok) {
    const text = await initRes.text().catch(() => "");
    const err = new Error(`Drive upload init: ${initRes.status} ${text.slice(0, 200)}`);
    err.status = initRes.status;
    throw err;
  }
  const sessionUrl = initRes.headers.get("location");
  if (!sessionUrl) throw new Error("Drive upload init: ingen sessions-URL");

  const result = await uploadAsync(sessionUrl, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": mimeType },
  });
  if (result.status !== 200 && result.status !== 201) {
    const err = new Error(`Drive upload: ${result.status} ${String(result.body).slice(0, 200)}`);
    err.status = result.status;
    throw err;
  }
  try {
    return JSON.parse(result.body).id;
  } catch {
    return null;
  }
}
