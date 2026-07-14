import { Directory, File, Paths } from "expo-file-system";
import { listClips } from "./clips";
import { hasReview, loadReview } from "./review";

// Exporterar en genomgång till en enda mp4: klippets video med tränarens
// pauser inbakade (bilden fryser där hen pausade) och ljudet mixat –
// tränarrösten loudnorm-normaliserad tydligt över, klippets originalljud
// kvar under på lägre volym. Ritningen bränns inte in än (kräver
// rastrering av strecken – eget senare steg).
//
// ffmpeg-kit är pensionerat; binären ligger vendrad i vendor/ (se
// CHECKSUMS.md). I Expo Go/gamla APK:er saknas native-modulen och då
// gör kick() ingenting.
const SUFFIX = "_genomgang.mp4";

const clipsDir = () => new Directory(Paths.document, "clips");

export const exportVideoName = (clipFile) => clipFile.replace(/\.mp4$/, SUFFIX);

const statuses = {}; // clipFile -> 'exporting' | 'error'
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

export function getExportStatus(clipFile) {
  try {
    if (new File(clipsDir(), exportVideoName(clipFile)).exists) return "done";
  } catch {}
  return statuses[clipFile] ?? null;
}

// Bygger tidslinjen ur händelseloggen: video-segment när klippet rullade,
// frys-segment (stillbild på pausposition) när tränaren pratade i paus.
export function buildTimeline(log) {
  const events = [...(log.events ?? [])].sort((a, b) => a.t - b.t);
  const total = log.durationMs ?? (events.length ? events[events.length - 1].t : 0);
  const segs = [];
  let playing = false;
  let vt = 0;
  let last = 0;

  const emit = (dt) => {
    if (dt < 40) return;
    if (playing) {
      segs.push({ type: "video", from: vt, to: vt + dt });
      vt += dt;
    } else {
      segs.push({ type: "freeze", at: vt, dur: dt });
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
    }
  }
  emit(total - last);
  return segs;
}

const sec = (ms) => (ms / 1000).toFixed(3);
const AFMT = "aformat=sample_rates=44100:channel_layouts=stereo";

function buildArgs(clipPath, voicePath, outPath, segs) {
  const f = [];
  segs.forEach((s, i) => {
    if (s.type === "video") {
      f.push(`[0:v]trim=start=${sec(s.from)}:end=${sec(s.to)},setpts=PTS-STARTPTS,fps=30[v${i}]`);
      f.push(
        `[0:a]atrim=start=${sec(s.from)}:end=${sec(s.to)},asetpts=PTS-STARTPTS,${AFMT}[a${i}]`
      );
    } else {
      const at = Math.max(0, s.at / 1000 - 0.05).toFixed(3);
      f.push(
        `[0:v]trim=start=${at}:duration=0.05,setpts=PTS-STARTPTS,fps=30,` +
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
  f.push(`[1:a]loudnorm=I=-15:TP=-1.5:LRA=11,${AFMT}[avoc]`);
  f.push(`[abg][avoc]amix=inputs=2:duration=longest:dropout_transition=3:normalize=0[aout]`);

  return [
    "-y",
    "-i", clipPath,
    "-i", voicePath,
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
    outPath,
  ];
}

const plainPath = (uri) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

async function exportOne(clip, ffmpeg) {
  const review = loadReview(clip.file);
  if (!review) throw new Error("genomgången kunde inte läsas");
  const segs = buildTimeline(review.log);
  if (segs.length === 0) throw new Error("tom tidslinje");

  const dir = clipsDir();
  const outFile = new File(dir, exportVideoName(clip.file));
  const args = buildArgs(
    plainPath(clip.uri),
    plainPath(review.audioUri),
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

// Exporterar alla genomgångar som saknar exportvideo, en i taget
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
        await exportOne(clip, ffmpeg);
        delete statuses[clip.file];
      } catch (e) {
        console.warn("Export misslyckades:", e?.message ?? e);
        statuses[clip.file] = "error";
      }
      notify();
    }
  } finally {
    processing = false;
    notify();
  }
}
