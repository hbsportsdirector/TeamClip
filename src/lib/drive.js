import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";
import { loadJSON, saveJSON } from "./persist";

// Google Drive REST v3 med enbart scope drive.file: appen ser bara det
// den själv skapat, så mapp-id:n cachas i drive-state.json för att slippa
// sökningar. Mappstruktur enligt spec:
//   TeamClip/Spelare/<Namn>/          – delas EN gång med spelarens e-post
//   TeamClip/<Grupp>/Gäster/          – delas inte med någon
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const STATE_FILE = "drive-state.json";

let state = null;
const getState = () => {
  if (!state) state = loadJSON(STATE_FILE, { folders: {}, shared: {} });
  return state;
};
const persistState = () => saveJSON(STATE_FILE, state);

export function resetDriveCache() {
  state = { folders: {}, shared: {} };
  persistState();
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
  const st = getState();
  const key = path.join("/");
  if (st.folders[key]) {
    // verifiera att cachad mapp finns kvar (kan ha raderats i Drive)
    try {
      await api(token, `/files/${st.folders[key]}?fields=id,trashed`);
      return st.folders[key];
    } catch {
      delete st.folders[key];
    }
  }
  let parentId = "root";
  let walked = [];
  for (const segment of path) {
    walked.push(segment);
    const wKey = walked.join("/");
    if (st.folders[wKey]) {
      parentId = st.folders[wKey];
      continue;
    }
    let id = await findFolder(token, segment, parentId);
    if (!id) id = await createFolder(token, segment, parentId);
    st.folders[wKey] = id;
    persistState();
    parentId = id;
  }
  return parentId;
}

// Delar mappen med läsrättighet – körs EN gång per mapp+e-post
export async function shareFolderOnce(token, folderId, email) {
  const st = getState();
  const shared = st.shared[folderId] ?? [];
  const normalized = email.trim().toLowerCase();
  if (!normalized || shared.includes(normalized)) return false;
  await api(token, `/files/${folderId}/permissions?sendNotificationEmail=true&fields=id`, {
    method: "POST",
    body: { role: "reader", type: "user", emailAddress: normalized },
  });
  st.shared[folderId] = [...shared, normalized];
  persistState();
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
