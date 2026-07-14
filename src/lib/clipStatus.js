import * as uploadQueue from "./uploadQueue";
import * as exportReview from "./exportReview";
import * as dailyMerge from "./dailyMerge";

// Delade statustexter för klipp- och genomgångskort (Granska + Favoriter)

export const fmtDur = (ms) => {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};

export function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Idag";
  if (d.toDateString() === yesterday.toDateString()) return "Igår";
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

export function mergeDeliveryText(sourceFile, doneText) {
  const m = dailyMerge.findMergeFor(sourceFile);
  if (!m) return "◌ Väntar på dagens sammanställning…";
  const up = uploadQueue.getStatus(m.file);
  if (up?.status === "done") return doneText;
  if (up?.status === "uploading") return "↑ Dagens fil laddas upp till Drive…";
  if (up?.status === "error") return "⚠ Uppladdningen misslyckades – görs om automatiskt";
  return "◌ Dagens fil väntar på uppladdning";
}

export function multiExportStatusText(mr) {
  const st = exportReview.getMultiExportStatus(mr.name);
  if (st === "exporting") return "🎬 Skapar genomgångsvideo…";
  if (st === "error") return "⚠ Videoexporten misslyckades";
  if (st === "done") {
    if (!mr.archived) return "🎬 Video klar – skickas när passet är klart";
    return mergeDeliveryText(
      exportReview.multiExportVideoName(mr.name),
      "🎬 Video ✓ i spelarens Drive-mapp (dagens genomgångsfil)"
    );
  }
  return "🎬 Väntar på videoexport";
}

export function exportStatusText(clip) {
  const st = exportReview.getExportStatus(clip.file);
  if (st === "exporting") return "🎬 Skapar genomgångsvideo…";
  if (st === "error") return "⚠ Videoexporten misslyckades";
  if (st === "done") {
    if (!clip.archived) return "🎬 Genomgångsvideo klar – skickas när passet är klart";
    return mergeDeliveryText(
      exportReview.exportVideoName(clip.file),
      "🎬 Genomgång ✓ i Drive (dagens genomgångsfil)"
    );
  }
  return null;
}

export function uploadStatusText(clip) {
  if (!clip.archived) {
    return clip.guest
      ? "◌ Sparat lokalt · skickas till gästmappen när passet är klart"
      : "✓ Sparat lokalt · skickas till Drive när passet är klart";
  }
  return mergeDeliveryText(
    clip.file,
    clip.guest
      ? "✓ I gruppens gästmapp (dagens klippfil)"
      : `✓ I ${clip.player}s Drive-mapp (dagens klippfil)`
  );
}

export function favoriteStatusText(fileName) {
  const st = uploadQueue.getStatus(`fav:${fileName}`);
  if (st?.status === "done") return "⭐ Kopierad till Favoriter-mappen i Drive";
  if (st?.status === "uploading") return "↑ Kopieras till Favoriter-mappen…";
  if (st?.status === "error") return "⚠ Favoritkopian misslyckades – görs om";
  return "◌ Favoritkopian väntar på uppladdning";
}
