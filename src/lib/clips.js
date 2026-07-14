import { Directory, File, Paths } from "expo-file-system";

// Filnamn enligt spec: ÅÅÅÅ-MM-DD_<Grupp>_<Moment>_<Spelare>_<löpnr>.mp4
// Grupper kommer i steg 2 – tills dess används platshållaren "Traning".
const GROUP_PLACEHOLDER = "Traning";

const clipsDir = () => new Directory(Paths.document, "clips");

export function ensureClipsDir() {
  const dir = clipsDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

const SWEDISH = { å: "a", ä: "a", ö: "o", Å: "A", Ä: "A", Ö: "O", é: "e", É: "E" };

export function sanitize(s) {
  return s
    .trim()
    .replace(/[åäöÅÄÖéÉ]/g, (c) => SWEDISH[c])
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildFileName({ moment, player, seq }) {
  return `${todayStr()}_${GROUP_PLACEHOLDER}_${sanitize(moment)}_${sanitize(player)}_${pad(seq, 3)}.mp4`;
}

export function parseFileName(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_([^_]+)_([^_]+)_(\d+)\.mp4$/);
  if (!m) return { date: "", group: "", moment: "", player: name, seq: 0 };
  return {
    date: m[1],
    group: m[2],
    moment: m[3].replace(/-/g, " "),
    player: m[4].replace(/-/g, " "),
    seq: Number(m[5]),
  };
}

// Nästa lediga löpnummer, globalt över alla sparade klipp
export function nextSeq() {
  const files = listClipFiles();
  let max = 0;
  for (const f of files) {
    const { seq } = parseFileName(f.name);
    if (seq > max) max = seq;
  }
  return max + 1;
}

function listClipFiles() {
  const dir = ensureClipsDir();
  return dir.list().filter((f) => f instanceof File && f.name.endsWith(".mp4"));
}

export async function saveClip(tempUri, { moment, player, guest, seq, durationMs }) {
  const dir = ensureClipsDir();
  const name = buildFileName({ moment, player, seq });
  const src = new File(tempUri);
  await src.move(new File(dir, name));
  return { name, uri: src.uri, player, moment, guest, durationMs };
}

export function discardTempClip(tempUri) {
  try {
    const f = new File(tempUri);
    if (f.exists) f.delete();
  } catch {
    // en kvarglömd cachefil är ofarlig – rensas av systemet
  }
}

export function listClips() {
  return listClipFiles()
    .map((f) => ({
      ...parseFileName(f.name),
      name: f.name,
      uri: f.uri,
      size: f.size,
      mtime: f.modificationTime ?? 0,
    }))
    .sort((a, b) => b.mtime - a.mtime || b.seq - a.seq);
}

export function deleteClip(uri) {
  const f = new File(uri);
  if (f.exists) f.delete();
}
