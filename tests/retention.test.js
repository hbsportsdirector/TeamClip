// Körs med: node tests/retention.test.js  (inga beroenden)
import assert from "node:assert/strict";
import { selectCleanupTargets } from "../src/lib/retention.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const DAY = 86400000;
const NOW = 100 * DAY;

const ctx = (overrides = {}) => ({
  now: () => NOW,
  days: 30,
  fileExists: () => true,
  reviewExists: () => false,
  multiExportVideoName: (n) => n.replace(/\.multireview\.json$/, ".video.mp4"),
  ...overrides,
});

const baseDb = () => ({ clips: [], reviews: [], merges: [], jobs: {} });

function deliveredMerge(d, file, sources, createdAt) {
  d.merges.push({ file, sources, createdAt });
  d.jobs[file] = { key: file, status: "done", updatedAt: createdAt + 1 };
}

test("gammalt levererat klipp städas", () => {
  const d = baseDb();
  d.clips.push({ file: "c.mp4", ts: NOW - 40 * DAY, archived: true, merged: true, favorite: false });
  deliveredMerge(d, "m.merged.mp4", ["c.mp4"], NOW - 40 * DAY);
  const t = selectCleanupTargets(d, ctx());
  assert.deepEqual(t.clipFiles, ["c.mp4"]);
});

test("favoriter städas ALDRIG", () => {
  const d = baseDb();
  d.clips.push({ file: "c.mp4", ts: NOW - 40 * DAY, archived: true, merged: true, favorite: true });
  deliveredMerge(d, "m.merged.mp4", ["c.mp4"], NOW - 40 * DAY);
  assert.equal(selectCleanupTargets(d, ctx()).clipFiles.length, 0);
});

test("för ungt material städas inte", () => {
  const d = baseDb();
  d.clips.push({ file: "c.mp4", ts: NOW - 5 * DAY, archived: true, merged: true, favorite: false });
  deliveredMerge(d, "m.merged.mp4", ["c.mp4"], NOW - 5 * DAY);
  assert.equal(selectCleanupTargets(d, ctx()).clipFiles.length, 0);
});

test("olevererat städas inte (merge-jobbet ej done)", () => {
  const d = baseDb();
  d.clips.push({ file: "c.mp4", ts: NOW - 40 * DAY, archived: true, merged: true, favorite: false });
  d.merges.push({ file: "m.merged.mp4", sources: ["c.mp4"], createdAt: NOW - 40 * DAY });
  d.jobs["m.merged.mp4"] = { status: "error" };
  assert.equal(selectCleanupTargets(d, ctx()).clipFiles.length, 0);
});

test("klipp med olevererad genomgång städas inte", () => {
  const d = baseDb();
  d.clips.push({
    file: "c.mp4", ts: NOW - 40 * DAY, archived: true, merged: true,
    favorite: false, exportMerged: false,
  });
  deliveredMerge(d, "m.merged.mp4", ["c.mp4"], NOW - 40 * DAY);
  const t = selectCleanupTargets(d, ctx({ reviewExists: () => true }));
  assert.equal(t.clipFiles.length, 0, "genomgången måste vara levererad först");
});

test("levererade sammanställningsfiler städas, olevererade inte", () => {
  const d = baseDb();
  deliveredMerge(d, "old.merged.mp4", [], NOW - 40 * DAY);
  d.merges.push({ file: "pending.merged.mp4", sources: [], createdAt: NOW - 40 * DAY });
  const t = selectCleanupTargets(d, ctx());
  assert.deepEqual(t.mergeFiles, ["old.merged.mp4"]);
});

test("fleklippsgenomgång städas när dess video är levererad", () => {
  const d = baseDb();
  d.reviews.push({ name: "g.multireview.json", createdAt: NOW - 40 * DAY, merged: true, favorite: false });
  deliveredMerge(d, "gm.merged.mp4", ["g.video.mp4"], NOW - 40 * DAY);
  assert.deepEqual(selectCleanupTargets(d, ctx()).reviewNames, ["g.multireview.json"]);
});

test("favoritmarkerad genomgång städas inte", () => {
  const d = baseDb();
  d.reviews.push({ name: "g.multireview.json", createdAt: NOW - 40 * DAY, merged: true, favorite: true });
  deliveredMerge(d, "gm.merged.mp4", ["g.video.mp4"], NOW - 40 * DAY);
  assert.equal(selectCleanupTargets(d, ctx()).reviewNames.length, 0);
});

console.log(`\n${passed} tester gröna`);
