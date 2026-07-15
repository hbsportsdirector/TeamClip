// Körs med: node tests/db.test.js  (inga beroenden)
import assert from "node:assert/strict";
import {
  emptyDb,
  migrateLegacy,
  dominantMoment,
  _initForTests,
  getDb,
  update,
  subscribe,
  DB_FILE,
} from "../src/lib/db.js";

function memStorage(initialFiles = {}, multiMetas = []) {
  const files = { ...initialFiles };
  return {
    files,
    readText: (n) => (n in files ? files[n] : null),
    writeText: (n, t) => {
      files[n] = t;
    },
    rename: (n, to) => {
      if (n in files) {
        files[to] = files[n];
        delete files[n];
      }
    },
    readMultiReviewMetas: () => multiMetas,
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// ——— dominantMoment ———————————————————————————
test("dominantMoment tar vanligaste momentet", () => {
  assert.equal(
    dominantMoment([{ moment: "Kantskott" }, { moment: "Straffkast" }, { moment: "Kantskott" }]),
    "Kantskott"
  );
  assert.equal(dominantMoment([]), "Traning");
  assert.equal(dominantMoment(undefined), "Traning");
});

// ——— migrateLegacy ———————————————————————————
test("migrering: klippflaggor tvingas till booleans och fält bevaras", () => {
  const db = migrateLegacy({
    clipsIndex: [
      { file: "a.mp4", player: "Olle", moment: "Kantskott", ts: 5, archived: 1, favorite: undefined },
    ],
    uploads: {},
    merges: [],
    driveState: null,
    multiMetas: [],
  });
  assert.equal(db.clips.length, 1);
  assert.equal(db.clips[0].archived, true);
  assert.equal(db.clips[0].favorite, false);
  assert.equal(db.clips[0].moment, "Kantskott");
});

test("migrering: bara done-uppladdningar bevaras som kvitton", () => {
  const db = migrateLegacy({
    clipsIndex: [],
    uploads: {
      "x.mp4": { status: "done", fileId: "f1", at: 100 },
      "y.mp4": { status: "error", error: "nät" },
      "fav:z.mp4": { status: "done", at: 200 },
    },
    merges: [],
    driveState: null,
    multiMetas: [],
  });
  assert.deepEqual(Object.keys(db.jobs).sort(), ["fav:z.mp4", "x.mp4"]);
  assert.equal(db.jobs["x.mp4"].fileId, "f1");
});

test("migrering: reviews byggs från multireview-sidofiler med dominant moment", () => {
  const db = migrateLegacy({
    clipsIndex: [],
    uploads: {},
    merges: [],
    driveState: { folders: { "TeamClip/Spelare": "id1" }, shared: { id1: ["a@b.se"] } },
    multiMetas: [
      {
        name: "g1.multireview.json",
        meta: {
          player: "Olle",
          clips: [{ moment: "Nio meter" }, { moment: "Nio meter" }, { moment: "Kantskott" }],
          createdAt: 42,
          favorite: true,
        },
      },
    ],
  });
  assert.equal(db.reviews[0].moment, "Nio meter");
  assert.equal(db.reviews[0].favorite, true);
  assert.equal(db.reviews[0].archived, false);
  assert.equal(db.drive.folders["TeamClip/Spelare"], "id1");
});

test("migrering: gamla merges får moment-fallback", () => {
  const db = migrateLegacy({
    clipsIndex: [],
    uploads: {},
    merges: [{ file: "m.mp4", day: "2026-07-14" }, { file: "n.mp4", moment: "Kantskott" }],
    driveState: null,
    multiMetas: [],
  });
  assert.equal(db.merges[0].moment, "Traning");
  assert.equal(db.merges[1].moment, "Kantskott");
});

// ——— load + migrering av legacy-filer ————————————————
test("första laddningen migrerar legacy-filer och pensionerar dem", () => {
  const st = memStorage({
    "clips-index.json": JSON.stringify([{ file: "a.mp4", player: "Olle", ts: 1 }]),
    "uploads.json": JSON.stringify({ "a.mp4": { status: "done", at: 1 } }),
  });
  _initForTests(st);
  const db = getDb();
  assert.equal(db.clips.length, 1);
  assert.ok(st.files[DB_FILE], "db-filen skrevs");
  assert.ok(!("clips-index.json" in st.files), "legacy borta");
  assert.ok("clips-index.json.migrated" in st.files, "legacy pensionerad");
});

test("befintlig db-fil läses utan ommigrering", () => {
  const existing = emptyDb();
  existing.clips.push({ file: "x.mp4" });
  const st = memStorage({
    [DB_FILE]: JSON.stringify(existing),
    "clips-index.json": JSON.stringify([{ file: "SKA-INTE-LÄSAS.mp4" }]),
  });
  _initForTests(st);
  assert.equal(getDb().clips[0].file, "x.mp4");
  assert.ok("clips-index.json" in st.files, "legacy rörs inte när db finns");
});

// ——— update ———————————————————————————————
test("update muterar, persisterar och notifierar", () => {
  const st = memStorage();
  _initForTests(st);
  let notified = 0;
  const unsub = subscribe(() => notified++);
  update((db) => {
    db.clips.push({ file: "ny.mp4", favorite: false });
  });
  assert.equal(getDb().clips.length, 1);
  assert.equal(JSON.parse(st.files[DB_FILE]).clips.length, 1);
  assert.equal(notified, 1);
  unsub();
  update((db) => {
    db.clips[0].favorite = true;
  });
  assert.equal(notified, 1, "avprenumererad lyssnare kallas inte");
  assert.equal(JSON.parse(st.files[DB_FILE]).clips[0].favorite, true);
});

console.log(`\n${passed} tester gröna`);
