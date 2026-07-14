import { Directory, File, Paths } from "expo-file-system";
import { loadJSON, saveJSON } from "./persist";
import {
  listClips,
  setClipsMerged,
  archiveClipsBeforeToday,
  sanitize,
  todayStr,
} from "./clips";
import {
  hasReview,
  listMultiReviews,
  setMultiReviewMerged,
  archiveMultiReviewsBeforeToday,
} from "./review";
import { exportVideoName, multiExportVideoName } from "./exportReview";

// Dagssammanställningar: när passet avslutas slås dagens material ihop till
// (max) två filer per spelare – "<dag>_Klipp_<Spelare>.mp4" (alla råklipp i
// följd) och "<dag>_Genomgang_<Spelare>.mp4" (alla genomgångsvideor i följd).
// Det är dessa som laddas upp till Drive; enskilda filer stannar i appen.
// Sammanslagningen är i regel omkodningsfri (concat-demuxern, -c copy) –
// allt material har samma kodningsparametrar.
const MERGES_FILE = "merges.json";

const clipsDir = () => new Directory(Paths.document, "clips");

let merges = null;
const getMerges = () => {
  if (!merges) merges = loadJSON(MERGES_FILE, []);
  return merges;
};
const persist = () => saveJSON(MERGES_FILE, getMerges());

const listeners = new Set();
const notify = () => listeners.forEach((cb) => cb());
export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function listMerges() {
  return getMerges();
}

// Hittar (nyaste) sammanställningen som innehåller en given källfil
export function findMergeFor(sourceFile) {
  const hits = getMerges().filter((m) => m.sources.includes(sourceFile));
  if (hits.length === 0) return null;
  return hits.reduce((a, b) => ((b.createdAt ?? 0) > (a.createdAt ?? 0) ? b : a));
}

function getFFmpeg() {
  try {
    const { NativeModules } = require("react-native");
    if (!NativeModules.FFmpegKitReactNativeModule) return null;
    return require("ffmpeg-kit-react-native");
  } catch {
    return null;
  }
}

const plainPath = (uri) => decodeURIComponent(uri.replace(/^file:\/\//, ""));
const fileIn = (name) => new File(clipsDir(), name);

const AFMT = "aformat=sample_rates=44100:channel_layouts=stereo";

async function concatFiles(ffmpeg, sourceNames, outName) {
  const dir = clipsDir();
  const outFile = fileIn(outName);
  const listFile = fileIn(outName.replace(/\.mp4$/, ".txt"));
  listFile.write(
    sourceNames.map((n) => `file '${plainPath(new File(dir, n).uri)}'`).join("\n")
  );

  const run = async (args) => {
    const session = await ffmpeg.FFmpegKit.executeWithArguments(args);
    const rc = await session.getReturnCode();
    if (!ffmpeg.ReturnCode.isSuccess(rc)) {
      try {
        if (outFile.exists) outFile.delete();
      } catch {}
      const logs = await session.getLogsAsString();
      throw new Error(String(logs).slice(-300));
    }
  };

  try {
    // snabbvägen: ingen omkodning
    await run([
      "-y", "-f", "concat", "-safe", "0",
      "-i", plainPath(listFile.uri),
      "-c", "copy", "-movflags", "+faststart",
      plainPath(outFile.uri),
    ]);
  } catch (e) {
    // olika kodningsparametrar – koda om i stället
    console.warn("Copy-concat misslyckades, kodar om:", e?.message ?? e);
    const f = [];
    sourceNames.forEach((_, i) => {
      f.push(`[${i}:v]fps=30,setpts=PTS-STARTPTS[v${i}]`);
      f.push(`[${i}:a]asetpts=PTS-STARTPTS,${AFMT}[a${i}]`);
    });
    const pairs = sourceNames.map((_, i) => `[v${i}][a${i}]`).join("");
    f.push(`${pairs}concat=n=${sourceNames.length}:v=1:a=1[v][a]`);
    const args = ["-y"];
    for (const n of sourceNames) args.push("-i", plainPath(new File(dir, n).uri));
    args.push(
      "-filter_complex", f.join(";"),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      plainPath(outFile.uri)
    );
    await run(args);
  } finally {
    try {
      if (listFile.exists) listFile.delete();
    } catch {}
  }
}

const dayOf = (ts) => todayStr(new Date(ts || Date.now()));
const hhmm = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

let processing = false;

// Bygger sammanställningar för allt arkiverat som ännu inte slagits ihop
export async function processPending() {
  const ffmpeg = getFFmpeg();
  if (!ffmpeg || processing) return;
  processing = true;
  try {
    await doProcess(ffmpeg);
  } finally {
    processing = false;
    notify();
  }
}

async function doProcess(ffmpeg) {

  const all = listClips(undefined, { includeArchived: true });

  // — Råklipp: gruppera per (grupp, spelare/gäst, dag) —
  const clipGroups = new Map();
  for (const c of all) {
    if (!c.archived || c.merged) continue;
    const key = `${c.groupId}|${c.guest ? "g:" + c.player : c.playerId ?? c.player}|${dayOf(c.ts)}`;
    if (!clipGroups.has(key)) clipGroups.set(key, []);
    clipGroups.get(key).push(c);
  }

  for (const group of clipGroups.values()) {
    const first = group[0];
    const day = dayOf(first.ts);
    const sources = group.sort((a, b) => a.ts - b.ts).map((c) => c.file);
    // Date.now() i namnet: flera "Passet klart" samma dag får inte kollidera
    const outName = `${day}_${sanitize(first.group || "Grupp")}_${sanitize(first.player)}_klipp_${Date.now()}.merged.mp4`;
    try {
      await concatFiles(ffmpeg, sources, outName);
      getMerges().push({
        file: outName,
        driveName: `${day}_Klipp_${sanitize(first.player)}_${hhmm()}.mp4`,
        kind: "klipp",
        player: first.player,
        playerId: first.playerId ?? null,
        groupId: first.groupId,
        group: first.group,
        guest: !!first.guest,
        day,
        sources,
        createdAt: Date.now(),
      });
      persist();
      setClipsMerged(sources, "merged");
    } catch (e) {
      console.warn("Klippsammanställning misslyckades:", e?.message ?? e);
    }
    notify();
  }

  // — Genomgångsvideor: enklipps-exporter + fleklippsvideor per (grupp, spelare, dag) —
  const reviewGroups = new Map();
  for (const c of all) {
    if (!c.archived || c.exportMerged || c.guest) continue;
    if (!hasReview(c.file)) continue;
    const exp = exportVideoName(c.file);
    if (!fileIn(exp).exists) continue; // exporten inte klar än – tas nästa varv
    const key = `${c.groupId}|${c.playerId ?? c.player}|${dayOf(c.ts)}`;
    if (!reviewGroups.has(key)) reviewGroups.set(key, { meta: c, singles: [], multis: [] });
    reviewGroups.get(key).singles.push({ ts: c.ts, file: exp, clipFile: c.file });
  }
  for (const mr of listMultiReviews(undefined, { includeArchived: true })) {
    if (!mr.archived || mr.merged) continue;
    const video = multiExportVideoName(mr.name);
    if (!fileIn(video).exists) continue;
    const key = `${mr.groupId}|${mr.playerId ?? mr.player}|${dayOf(mr.createdAt)}`;
    if (!reviewGroups.has(key)) {
      reviewGroups.set(key, {
        meta: { group: mr.group, groupId: mr.groupId, player: mr.player, playerId: mr.playerId, ts: mr.createdAt },
        singles: [],
        multis: [],
      });
    }
    reviewGroups.get(key).multis.push({ ts: mr.createdAt, file: video, mrName: mr.name });
  }

  for (const g of reviewGroups.values()) {
    const items = [...g.singles, ...g.multis].sort((a, b) => a.ts - b.ts);
    if (items.length === 0) continue;
    const day = dayOf(g.meta.ts);
    const outName = `${day}_${sanitize(g.meta.group || "Grupp")}_${sanitize(g.meta.player)}_genomgang_${Date.now()}.merged.mp4`;
    try {
      await concatFiles(ffmpeg, items.map((i) => i.file), outName);
      getMerges().push({
        file: outName,
        driveName: `${day}_Genomgang_${sanitize(g.meta.player)}_${hhmm()}.mp4`,
        kind: "genomgang",
        player: g.meta.player,
        playerId: g.meta.playerId ?? null,
        groupId: g.meta.groupId,
        group: g.meta.group,
        guest: false,
        day,
        sources: items.map((i) => i.file),
        createdAt: Date.now(),
      });
      persist();
      setClipsMerged(g.singles.map((i) => i.clipFile), "exportMerged");
      for (const m of g.multis) setMultiReviewMerged(m.mrName);
    } catch (e) {
      console.warn("Genomgångssammanställning misslyckades:", e?.message ?? e);
    }
    notify();
  }
}

// Körs vid appstart: avslutar bortglömda pass från tidigare dagar
export function autoArchiveStale() {
  const n = archiveClipsBeforeToday();
  archiveMultiReviewsBeforeToday();
  return n;
}
