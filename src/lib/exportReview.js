import { Directory, File, Paths } from "expo-file-system";
import { listClips } from "./clips";
import { hasReview, loadReview, listMultiReviews, loadMultiReview } from "./review";

// Exporterar genomgångar till färdiga mp4:or: video med tränarens pauser
// inbakade (fryst bild), klippbyten i fleklippsgenomgångar, och ljudmix –
// tränarrösten loudnorm-normaliserad tydligt över, klippens originalljud
// kvar under på lägre volym. Ritningen bränns inte in än (kräver
// rastrering av strecken – eget senare steg).
//
// ffmpeg-kit är pensionerat; binären ligger vendrad i vendor/ (se
// CHECKSUMS.md). I Expo Go/gamla APK:er saknas native-modulen och då
// gör kick() ingenting.
const clipsDir = () => new Directory(Paths.document, "clips");

export const exportVideoName = (clipFile) => clipFile.replace(/\.mp4$/, "_genomgang.mp4");
export const multiExportVideoName = (mrName) => mrName.replace(/\.multireview\.json$/, ".video.mp4");

const statuses = {}; // nyckel (klippfil eller multireview-namn) -> 'exporting' | 'error'
let processing = false;
const listeners = new Set();
const notify = () => listeners.forEach((cb) => cb());

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
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

export const isExportAvailable = () => getFFmpeg() !== null;

const outExists = (name) => {
  try {
    return new File(clipsDir(), name).exists;
  } catch {
    return false;
  }
};

export function getExportStatus(clipFile) {
  if (outExists(exportVideoName(clipFile))) return "done";
  return statuses[clipFile] ?? null;
}

export function getMultiExportStatus(mrName) {
  if (outExists(multiExportVideoName(mrName))) return "done";
  return statuses[mrName] ?? null;
}

// Bygger tidslinjen ur händelseloggen: video-segment när ett klipp rullade
// (med index i spellistan), frys-segment när tränaren pratade i paus.
export function buildTimeline(log) {
  const events = [...(log.events ?? [])].sort((a, b) => a.t - b.t);
  const total = log.durationMs ?? (events.length ? events[events.length - 1].t : 0);
  const segs = [];
  let playing = false;
  let vt = 0;
  let clipIdx = 0;
  let last = 0;

  const emit = (dt) => {
    if (dt < 40) return;
    if (playing) {
      segs.push({ type: "video", clipIdx, from: vt, to: vt + dt });
      vt += dt;
    } else {
      segs.push({ type: "freeze", clipIdx, at: vt, dur: dt });
    }
  };

  for (const ev of events) {
    emit(ev.t - last);
    last = Math.max(last, ev.t);
    if (ev.type === "play") {
      playing = true;
      if (ev.videoTime != null) vt = ev.videoTime;
    } else if (ev.type === "pause") {
      playing = false;
      if (ev.videoTime != null) vt = ev.videoTime;
    } else if (ev.type === "seek") {
      if (ev.videoTime != null) vt = ev.videoTime;
    } else if (ev.type === "clip") {
      clipIdx = ev.index;
      vt = 0;
    }
  }
  emit(total - last);
  return segs;
}

const sec = (ms) => (ms / 1000).toFixed(3);
const AFMT = "aformat=sample_rates=44100:channel_layouts=stereo";

function buildArgs(inputPaths, voicePath, outPath, segs) {
  const f = [];
  segs.forEach((s, i) => {
    const inp = s.clipIdx;
    if (s.type === "video") {
      f.push(`[${inp}:v]trim=start=${sec(s.from)}:end=${sec(s.to)},setpts=PTS-STARTPTS,fps=30[v${i}]`);
      f.push(
        `[${inp}:a]atrim=start=${sec(s.from)}:end=${sec(s.to)},asetpts=PTS-STARTPTS,${AFMT}[a${i}]`
      );
    } else {
      const at = Math.max(0, s.at / 1000 - 0.05).toFixed(3);
      f.push(
        `[${inp}:v]trim=start=${at}:duration=0.05,setpts=PTS-STARTPTS,fps=30,` +
          `tpad=stop_mode=clone:stop_duration=${sec(s.dur)}[v${i}]`
      );
      f.push(`aevalsrc=0:d=${sec(s.dur)},${AFMT}[a${i}]`);
    }
  });
  const pairs = segs.map((_, i) => `[v${i}][a${i}]`).join("");
  f.push(`${pairs}concat=n=${segs.length}:v=1:a=1[vcat][acat]`);
  // Originalljudet (skottet, sargen) kvar under på lägre volym...
  f.push(`[acat]volume=0.3[abg]`);
  // ...och tränarrösten normaliserad så den ligger tydligt över
  const voiceIdx = inputPaths.length;
  f.push(`[${voiceIdx}:a]loudnorm=I=-15:TP=-1.5:LRA=11,${AFMT}[avoc]`);
  f.push(`[abg][avoc]amix=inputs=2:duration=longest:dropout_transition=3:normalize=0[aout]`);

  const args = ["-y"];
  for (const p of inputPaths) args.push("-i", p);
  args.push("-i", voicePath);
  args.push(
    "-filter_complex", f.join(";"),
    "-map", "[vcat]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outPath
  );
  return args;
}

const plainPath = (uri) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

async function runExport(ffmpeg, { clipUris, audioUri, log, outName }) {
  const segs = buildTimeline(log);
  if (segs.length === 0) throw new Error("tom tidslinje");
  for (const s of segs) {
    if (!clipUris[s.clipIdx]) throw new Error("ett klipp i genomgången har tagits bort");
  }
  const dir = clipsDir();
  const outFile = new File(dir, outName);
  const args = buildArgs(
    clipUris.map((u) => plainPath(u)),
    plainPath(audioUri),
    plainPath(outFile.uri),
    segs
  );
  const session = await ffmpeg.FFmpegKit.executeWithArguments(args);
  const rc = await session.getReturnCode();
  if (!ffmpeg.ReturnCode.isSuccess(rc)) {
    try {
      if (outFile.exists) outFile.delete();
    } catch {}
    const logs = await session.getLogsAsString();
    throw new Error(`ffmpeg misslyckades: ${String(logs).slice(-300)}`);
  }
}

// Exporterar alla genomgångar (enklipps + fleklipps) som saknar video
export async function kick() {
  const ffmpeg = getFFmpeg();
  if (processing || !ffmpeg) return;
  processing = true;
  try {
    for (const clip of listClips(undefined, { includeArchived: true })) {
      if (!hasReview(clip.file)) continue;
      if (getExportStatus(clip.file) === "done") continue;
      statuses[clip.file] = "exporting";
      notify();
      try {
        const review = loadReview(clip.file);
        if (!review) throw new Error("genomgången kunde inte läsas");
        await runExport(ffmpeg, {
          clipUris: [clip.uri],
          audioUri: review.audioUri,
          log: review.log,
          outName: exportVideoName(clip.file),
        });
        delete statuses[clip.file];
      } catch (e) {
        console.warn("Export misslyckades:", e?.message ?? e);
        statuses[clip.file] = "error";
      }
      notify();
    }

    for (const mr of listMultiReviews(undefined, { includeArchived: true })) {
      if (getMultiExportStatus(mr.name) === "done") continue;
      statuses[mr.name] = "exporting";
      notify();
      try {
        const data = loadMultiReview(mr.name);
        if (!data) throw new Error("genomgången kunde inte läsas");
        await runExport(ffmpeg, {
          clipUris: data.clips.map((c) => (c ? c.uri : null)),
          audioUri: data.audioUri,
          log: data.meta,
          outName: multiExportVideoName(mr.name),
        });
        delete statuses[mr.name];
      } catch (e) {
        console.warn("Export misslyckades:", e?.message ?? e);
        statuses[mr.name] = "error";
      }
      notify();
    }
  } finally {
    processing = false;
    notify();
  }
}
