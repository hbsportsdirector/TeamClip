// Körs med: node tests/jobs.test.js  (inga beroenden)
import assert from "node:assert/strict";
import { deriveJobs, reconcileJobs } from "../src/lib/jobs.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const ctx = (existingFiles, nowMs = 1000) => ({
  fileExists: (n) => existingFiles.includes(n),
  emailOf: (id) => (id === "p1" ? "olle@ex.se" : ""),
  exportVideoName: (f) => f.replace(/\.mp4$/, "_genomgang.mp4"),
  multiExportVideoName: (n) => n.replace(/\.multireview\.json$/, ".video.mp4"),
  dayOf: () => "2026-07-15",
  now: () => nowMs,
});

const baseDb = () => ({ clips: [], reviews: [], merges: [], jobs: {} });

// ——— deriveJobs ———————————————————————————————
test("merge-jobb får momentmapp, datummapp och delning på spelarmappen", () => {
  const d = baseDb();
  d.merges.push({
    file: "m1.merged.mp4", driveName: "Klipp_Olle.mp4", kind: "klipp",
    player: "Olle", playerId: "p1", group: "Gym", moment: "Kantskott",
    guest: false, day: "2026-07-15", sources: [], createdAt: 500,
  });
  const jobs = deriveJobs(d, ctx(["m1.merged.mp4"]));
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].folder, ["TeamClip", "Spelare", "Olle", "Kantskott", "2026-07-15"]);
  assert.deepEqual(jobs[0].sharePath, ["TeamClip", "Spelare", "Olle"]);
  assert.equal(jobs[0].shareWith, "olle@ex.se");
  assert.equal(jobs[0].minCreatedAt, 500);
});

test("favoritklipp ger fav:-nycklade jobb till Favoriter-mappen (+ export om den finns)", () => {
  const d = baseDb();
  d.clips.push({
    file: "c1.mp4", player: "Olle", playerId: "p1", group: "Gym",
    moment: "Kantskott", guest: false, favorite: true,
  });
  const jobs = deriveJobs(d, ctx(["c1.mp4", "c1_genomgang.mp4"]));
  assert.deepEqual(jobs.map((j) => j.key).sort(), ["fav:c1.mp4", "fav:c1_genomgang.mp4"]);
  assert.deepEqual(jobs[0].folder, ["TeamClip", "Spelare", "Olle", "Kantskott", "Favoriter"]);
});

test("saknad fil ger inget jobb (exporten kommer i nästa varv)", () => {
  const d = baseDb();
  d.reviews.push({ name: "g1.multireview.json", player: "Olle", playerId: "p1", moment: "Nio meter", favorite: true, createdAt: 1 });
  assert.equal(deriveJobs(d, ctx([])).length, 0);
  assert.equal(deriveJobs(d, ctx(["g1.video.mp4"])).length, 1);
});

// ——— reconcileJobs: regressionstester för de historiska buggarna ————
test("REGRESSION namnkollisionen: nyare merge med samma nyckel gör om done → pending", () => {
  const d = baseDb();
  d.merges.push({
    file: "x.merged.mp4", driveName: "b.mp4", player: "Olle", playerId: "p1",
    group: "Gym", moment: "T", guest: false, day: "d", sources: [], createdAt: 2000,
  });
  d.jobs["x.merged.mp4"] = { key: "x.merged.mp4", status: "done", updatedAt: 1500 };
  reconcileJobs(d, ctx(["x.merged.mp4"], 3000));
  assert.equal(d.jobs["x.merged.mp4"].status, "pending", "gammalt kvitto ska inte blockera ny fil");
});

test("färskt kvitto lämnas ifred", () => {
  const d = baseDb();
  d.merges.push({
    file: "x.merged.mp4", driveName: "b.mp4", player: "Olle", playerId: "p1",
    group: "Gym", moment: "T", guest: false, day: "d", sources: [], createdAt: 2000,
  });
  d.jobs["x.merged.mp4"] = { key: "x.merged.mp4", status: "done", updatedAt: 2500, fileId: "f" };
  reconcileJobs(d, ctx(["x.merged.mp4"], 3000));
  assert.equal(d.jobs["x.merged.mp4"].status, "done");
  assert.equal(d.jobs["x.merged.mp4"].fileId, "f");
});

test("REGRESSION favoritblockeringen: fav-jobb skapas trots att filen levererats under annan nyckel", () => {
  const d = baseDb();
  d.clips.push({
    file: "c1.mp4", player: "Olle", playerId: "p1", group: "Gym",
    moment: "Kantskott", guest: false, favorite: true,
  });
  // filen laddades upp som del av gamla modellen under sin egen nyckel
  d.jobs["c1.mp4"] = { key: "c1.mp4", status: "done", updatedAt: 999 };
  reconcileJobs(d, ctx(["c1.mp4"], 1000));
  assert.equal(d.jobs["fav:c1.mp4"]?.status, "pending", "favoritkopian har egen nyckel");
  assert.equal(d.jobs["c1.mp4"].status, "done", "gamla kvittot orört");
});

test("running-lik från död process blir pending igen", () => {
  const d = baseDb();
  d.jobs["stuck.mp4"] = { key: "stuck.mp4", status: "running", updatedAt: 1 };
  reconcileJobs(d, ctx([]));
  assert.equal(d.jobs["stuck.mp4"].status, "pending");
});

test("felade jobb blir pending igen vid reconcile (självläkning)", () => {
  const d = baseDb();
  d.clips.push({ file: "c1.mp4", player: "Olle", playerId: "p1", moment: "T", guest: false, favorite: true });
  d.jobs["fav:c1.mp4"] = { key: "fav:c1.mp4", status: "error", error: "nät", attempts: 2, updatedAt: 1 };
  reconcileJobs(d, ctx(["c1.mp4"], 50));
  assert.equal(d.jobs["fav:c1.mp4"].status, "pending");
  assert.equal(d.jobs["fav:c1.mp4"].attempts, 2, "försöksräknaren överlever");
});

test("gästklipp levereras till gästmappen utan delning", () => {
  const d = baseDb();
  d.merges.push({
    file: "g.merged.mp4", driveName: "x.mp4", player: "Gäst 1", playerId: null,
    group: "Gym", moment: "Kantskott", guest: true, day: "2026-07-15", sources: [], createdAt: 1,
  });
  const jobs = deriveJobs(d, ctx(["g.merged.mp4"]));
  assert.deepEqual(jobs[0].folder, ["TeamClip", "Gym", "Gäster", "Kantskott", "2026-07-15"]);
  assert.equal(jobs[0].sharePath, undefined);
});

console.log(`\n${passed} tester gröna`);
