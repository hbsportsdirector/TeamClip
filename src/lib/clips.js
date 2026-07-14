import { Directory, File, Paths } from "expo-file-system";
import { loadJSON, saveJSON } from "./persist";
import { deleteReview, renameReviewFiles } from "./review";

// Videofilerna ligger i dokumentkatalogen clips/ med spec:ens filnamnsformat:
//   ÅÅÅÅ-MM-DD_<Grupp>_<Moment>_<Spelare>_<löpnr>.mp4
// Metadata (spelar-id, grupp-id, gästflagga, längd) ligger i clips-index.json,
// eftersom filnamnet inte räcker för Drive-kopplingen i steg 3.
const INDEX = "clips-index.json";

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

function buildFileName({ group, moment, player, seq }) {
  return `${todayStr()}_${sanitize(group)}_${sanitize(moment)}_${sanitize(player)}_${pad(seq, 3)}.mp4`;
}

export function parseFileName(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_([^_]+)_([^_]+)_(\d+)\.mp4$/);
  if (!m) return { date: "", group: "", moment: "", player: name, seq: 0 };
  return {
    date: m[1],
    group: m[2].replace(/-/g, " "),
    moment: m[3].replace(/-/g, " "),
    player: m[4].replace(/-/g, " "),
    seq: Number(m[5]),
  };
}

const readIndex = () => loadJSON(INDEX, []);
const writeIndex = (arr) => saveJSON(INDEX, arr);

function nextSeq(index) {
  let max = 0;
  for (const c of index) {
    const { seq } = parseFileName(c.file);
    if (seq > max) max = seq;
  }
  for (const f of listFiles()) {
    const { seq } = parseFileName(f.name);
    if (seq > max) max = seq;
  }
  return max + 1;
}

// Endast filer som följer klippnamnsmönstret räknas som klipp – exportvideor
// (<bas>_genomgang.mp4, <genomgång>.video.mp4) är härledda filer
const CLIP_FILE_RE = /^\d{4}-\d{2}-\d{2}_[^_]+_[^_]+_[^_]+_\d+\.mp4$/;

function listFiles() {
  return ensureClipsDir()
    .list()
    .filter((f) => f instanceof File && CLIP_FILE_RE.test(f.name));
}

// Sparningar serialiseras så att två snabba klipp inte skriver över
// varandras indexrader (läs-uppdatera-skriv utan lås).
let saveChain = Promise.resolve();

export function saveClip(tempUri, meta) {
  const p = saveChain.then(() => doSave(tempUri, meta));
  saveChain = p.catch(() => {});
  return p;
}

async function doSave(tempUri, { player, playerId, groupId, group, moment, guest, durationMs }) {
  const dir = ensureClipsDir();
  const index = readIndex();
  const seq = nextSeq(index);
  const name = buildFileName({ group, moment, player, seq });
  const src = new File(tempUri);
  await src.move(new File(dir, name));
  const entry = {
    file: name,
    player,
    playerId: playerId ?? null,
    groupId: groupId ?? null,
    group,
    moment,
    guest: !!guest,
    durationMs: durationMs ?? 0,
    ts: Date.now(),
  };
  index.push(entry);
  writeIndex(index);
  return { ...entry, uri: src.uri };
}

export function listClips(groupId, { includeArchived = false } = {}) {
  const index = readIndex();
  const files = listFiles();
  const indexed = new Set(index.map((c) => c.file));
  const existing = new Set(files.map((f) => f.name));

  // Adoptera filer som saknar indexrad (t.ex. klipp från steg 1-testerna)
  let changed = false;
  for (const f of files) {
    if (!indexed.has(f.name)) {
      const p = parseFileName(f.name);
      index.push({
        file: f.name,
        player: p.player,
        playerId: null,
        groupId: null,
        group: p.group,
        moment: p.moment,
        guest: false,
        durationMs: 0,
        ts: f.modificationTime ?? 0,
      });
      changed = true;
    }
  }
  // Rensa indexrader vars fil försvunnit
  const alive = index.filter((c) => existing.has(c.file));
  if (changed || alive.length !== index.length) writeIndex(alive);

  const dir = clipsDir();
  const sizes = new Map(files.map((f) => [f.name, f.size]));
  return alive
    .filter((c) => (groupId ? c.groupId === groupId : true))
    .filter((c) => includeArchived || !c.archived)
    .sort((a, b) => b.ts - a.ts)
    .map((c) => ({ ...c, uri: new File(dir, c.file).uri, size: sizes.get(c.file) ?? 0 }));
}

// "Passet klart": göm gruppens klipp från Granska-vyn utan att radera något
export function archiveGroupClips(groupId) {
  const index = readIndex();
  let n = 0;
  for (const c of index) {
    if (c.groupId === groupId && !c.archived) {
      c.archived = true;
      n++;
    }
  }
  if (n > 0) writeIndex(index);
  return n;
}

// Glömt "Passet klart"? Gårdagens (och äldre) klipp arkiveras automatiskt
export function archiveClipsBeforeToday() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const index = readIndex();
  let n = 0;
  for (const c of index) {
    if (!c.archived && (c.ts ?? 0) < startOfToday.getTime()) {
      c.archived = true;
      n++;
    }
  }
  if (n > 0) writeIndex(index);
  return n;
}

export function toggleClipFavorite(fileName) {
  const index = readIndex();
  const entry = index.find((c) => c.file === fileName);
  if (!entry) return false;
  entry.favorite = !entry.favorite;
  writeIndex(index);
  return entry.favorite;
}

// Markerar källfiler som medtagna i en dagssammanställning.
// field: 'merged' (råklipp) eller 'exportMerged' (genomgångsvideo)
export function setClipsMerged(fileNames, field = "merged") {
  const set = new Set(fileNames);
  const index = readIndex();
  let changed = false;
  for (const c of index) {
    if (set.has(c.file) && !c[field]) {
      c[field] = true;
      changed = true;
    }
  }
  if (changed) writeIndex(index);
}

export function clipCountForGroup(groupId) {
  try {
    return listClips(groupId).length;
  } catch {
    return 0;
  }
}

// Gästklipp som flyttas till en riktig spelare: filen döps om så att
// filnamnet fortsätter spegla verkligheten inför Drive-uppladdningen.
export function reassignClip(fileName, { player, playerId }) {
  const index = readIndex();
  const entry = index.find((c) => c.file === fileName);
  if (!entry) return;
  const p = parseFileName(fileName);
  const newName = `${p.date}_${sanitize(entry.group || p.group)}_${sanitize(entry.moment)}_${sanitize(player)}_${pad(p.seq, 3)}.mp4`;
  try {
    new File(clipsDir(), fileName).move(new File(clipsDir(), newName));
    renameReviewFiles(fileName, newName);
    entry.file = newName;
  } catch (e) {
    console.warn("Kunde inte döpa om klippfil:", e);
  }
  entry.player = player;
  entry.playerId = playerId ?? null;
  entry.guest = false;
  writeIndex(index);
}

export function deleteClip(fileName) {
  try {
    const f = new File(clipsDir(), fileName);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn("Kunde inte ta bort klippfil:", e);
  }
  deleteReview(fileName);
  writeIndex(readIndex().filter((c) => c.file !== fileName));
}

export function discardTempClip(tempUri) {
  try {
    const f = new File(tempUri);
    if (f.exists) f.delete();
  } catch {
    // en kvarglömd cachefil är ofarlig – rensas av systemet
  }
}
