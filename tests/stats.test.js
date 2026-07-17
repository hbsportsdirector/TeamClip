// Körs med: node tests/stats.test.js  (inga beroenden)
import assert from "node:assert/strict";
import { playerCoverage, attentionList, coverageLabel } from "../src/lib/stats.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const DAY = 86400000;
const NOW = 200 * DAY;
const registry = [
  { id: "p1", name: "Olle" },
  { id: "p2", name: "Wilma" },
  { id: "p3", name: "Nils" },
];

test("täckning per spelare: senast filmad, 30-dagarsräkning, varningsflagga", () => {
  const d = {
    clips: [
      { playerId: "p1", ts: NOW - 1 * DAY },
      { playerId: "p1", ts: NOW - 40 * DAY },
      { playerId: "p2", ts: NOW - 20 * DAY },
    ],
    reviews: [{ playerId: "p1", createdAt: NOW - 2 * DAY }],
  };
  const rows = playerCoverage(d, { memberIds: ["p1", "p2", "p3"], registry, now: NOW });
  const olle = rows.find((r) => r.id === "p1");
  assert.equal(olle.clips30d, 1, "40 dagar gamla klipp räknas inte");
  assert.equal(olle.reviews30d, 1);
  assert.equal(olle.daysSince, 1);
  assert.equal(olle.needsAttention, false);

  const wilma = rows.find((r) => r.id === "p2");
  assert.equal(wilma.needsAttention, true, "20 dagar > 14-dagarsgränsen");

  const nils = rows.find((r) => r.id === "p3");
  assert.equal(nils.lastFilmedTs, null);
  assert.equal(nils.needsAttention, true, "aldrig filmad = behöver uppmärksamhet");
});

test("uppmärksamhetslistan: aldrig filmade först, sedan längst väntande", () => {
  const d = {
    clips: [
      { playerId: "p1", ts: NOW - 30 * DAY },
      { playerId: "p2", ts: NOW - 16 * DAY },
    ],
    reviews: [],
  };
  const rows = playerCoverage(d, { memberIds: ["p1", "p2", "p3"], registry, now: NOW });
  const list = attentionList(rows);
  assert.deepEqual(
    list.map((r) => r.name),
    ["Nils", "Olle", "Wilma"],
    "aldrig filmad → äldst → nyast"
  );
});

test("etiketter: idag/igår/dagar/veckor/aldrig", () => {
  const mk = (daysSince, lastFilmedTs = 1) => ({ daysSince, lastFilmedTs });
  assert.equal(coverageLabel({ daysSince: null, lastFilmedTs: null }), "aldrig filmad");
  assert.equal(coverageLabel(mk(0)), "filmad idag");
  assert.equal(coverageLabel(mk(1)), "filmad igår");
  assert.equal(coverageLabel(mk(5)), "5 dagar sedan");
  assert.equal(coverageLabel(mk(7)), "1 vecka sedan");
  assert.equal(coverageLabel(mk(21)), "3 veckor sedan");
});

test("gäster/okända id:n i truppen hoppas över tyst", () => {
  const rows = playerCoverage({ clips: [], reviews: [] }, { memberIds: ["p1", "borttagen"], registry, now: NOW });
  assert.equal(rows.length, 1);
});

console.log(`\n${passed} tester gröna`);
