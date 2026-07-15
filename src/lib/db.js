// En databasfil, en skrivväg. All metadata som tidigare låg utspridd över
// clips-index.json, uploads.json, merges.json, drive-state.json och
// multireview-sidofilernas flaggor bor nu i teamclip-db.json:
//
//   clips    – en rad per klipp (alla flaggor: archived/favorite/merged/exportMerged)
//   reviews  – en rad per fleklippsgenomgång (flaggorna; själva inspelnings-
//              datan – händelser/streck – ligger kvar i .multireview.json som
//              är IMMUTABEL efter save)
//   merges   – dagssammanställningarna
//   jobs     – explicit uppladdningskö: en nyckel per leverans, en status
//   drive    – mappcache och delningsminne
//
// All mutation sker via update(fn) där fn är SYNKRON – JS:ets enkeltrådning
// serialiserar då alla skrivningar utan lås. Asynkrona operationer (ffmpeg,
// nätverk) sker utanför och committar sina resultat i en efterföljande
// synkron update. Lagrings-IO är injicerbar så logiken kan testas i node.

export const DB_FILE = "teamclip-db.json";

export const emptyDb = () => ({
  version: 1,
  clips: [],
  reviews: [],
  merges: [],
  jobs: {},
  drive: { folders: {}, shared: {} },
});

// ——— Lagring (injicerbar) ————————————————————————
let storage = null;

function defaultStorage() {
  const { File, Directory, Paths } = require("expo-file-system");
  return {
    readText(name) {
      try {
        const f = new File(Paths.document, name);
        return f.exists ? f.textSync() : null;
      } catch {
        return null;
      }
    },
    writeText(name, text) {
      new File(Paths.document, name).write(text);
    },
    rename(name, to) {
      try {
        const f = new File(Paths.document, name);
        if (f.exists) f.move(new File(Paths.document, to));
      } catch {}
    },
    // multireview-sidofiler behövs vid migreringen (flaggorna flyttar in i db)
    readMultiReviewMetas() {
      const out = [];
      try {
        const dir = new Directory(Paths.document, "clips");
        if (!dir.exists) return out;
        for (const f of dir.list()) {
          if (!(f instanceof File) || !f.name.endsWith(".multireview.json")) continue;
          try {
            out.push({ name: f.name, meta: JSON.parse(f.textSync()) });
          } catch {}
        }
      } catch {}
      return out;
    },
  };
}

export function _initForTests(storageImpl) {
  storage = storageImpl;
  state = null;
}

// ——— Migrering (ren funktion – node-testbar) ————————————
export function dominantMoment(clips) {
  const counts = new Map();
  for (const c of clips ?? []) {
    if (!c.moment) continue;
    counts.set(c.moment, (counts.get(c.moment) ?? 0) + 1);
  }
  let best = "Traning";
  let bestN = 0;
  for (const [m, n] of counts) {
    if (n > bestN) {
      best = m;
      bestN = n;
    }
  }
  return best;
}

export function migrateLegacy({ clipsIndex, uploads, merges, driveState, multiMetas }) {
  const db = emptyDb();

  for (const c of clipsIndex ?? []) {
    db.clips.push({
      file: c.file,
      player: c.player,
      playerId: c.playerId ?? null,
      groupId: c.groupId ?? null,
      group: c.group ?? "",
      moment: c.moment ?? "Traning",
      guest: !!c.guest,
      durationMs: c.durationMs ?? 0,
      ts: c.ts ?? 0,
      archived: !!c.archived,
      favorite: !!c.favorite,
      merged: !!c.merged,
      exportMerged: !!c.exportMerged,
    });
  }

  for (const { name, meta } of multiMetas ?? []) {
    db.reviews.push({
      name,
      player: meta.player,
      playerId: meta.playerId ?? null,
      groupId: meta.groupId ?? null,
      group: meta.group ?? "",
      moment: dominantMoment(meta.clips),
      clipCount: meta.clips?.length ?? 0,
      durationMs: meta.durationMs ?? 0,
      createdAt: meta.createdAt ?? 0,
      archived: !!meta.archived,
      favorite: !!meta.favorite,
      merged: !!meta.merged,
    });
  }

  for (const m of merges ?? []) {
    db.merges.push({ moment: "Traning", ...m });
  }

  // gamla uppladdningsmarkeringar: bara "done" bevaras (som kvitton);
  // väntande/felade återskapas av reconcile med full leveransinfo
  for (const [key, u] of Object.entries(uploads ?? {})) {
    if (u?.status === "done") {
      db.jobs[key] = {
        key,
        status: "done",
        fileId: u.fileId ?? null,
        updatedAt: u.at ?? 0,
      };
    }
  }

  if (driveState?.folders) db.drive.folders = driveState.folders;
  if (driveState?.shared) db.drive.shared = driveState.shared;

  return db;
}

// ——— Store ————————————————————————————————
let state = null;
const listeners = new Set();

function getStorage() {
  if (!storage) storage = defaultStorage();
  return storage;
}

const parse = (text, fallback) => {
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

function load() {
  const st = getStorage();
  const existing = parse(st.readText(DB_FILE), null);
  if (existing && existing.version >= 1) return existing;

  // första körningen: importera från legacy-filerna och pensionera dem
  const db = migrateLegacy({
    clipsIndex: parse(st.readText("clips-index.json"), []),
    uploads: parse(st.readText("uploads.json"), {}),
    merges: parse(st.readText("merges.json"), []),
    driveState: parse(st.readText("drive-state.json"), null),
    multiMetas: st.readMultiReviewMetas(),
  });
  st.writeText(DB_FILE, JSON.stringify(db));
  for (const legacy of ["clips-index.json", "uploads.json", "merges.json", "drive-state.json"]) {
    st.rename(legacy, `${legacy}.migrated`);
  }
  return db;
}

export function getDb() {
  if (!state) state = load();
  return state;
}

// mutator MÅSTE vara synkron – det är hela serialiseringsgarantin
export function update(mutator) {
  const db = getDb();
  const result = mutator(db);
  getStorage().writeText(DB_FILE, JSON.stringify(db));
  for (const cb of listeners) cb();
  return result;
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
