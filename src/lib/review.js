import { Directory, File, Paths } from "expo-file-system";

// En "genomgång" är tränarens inspelade feedback ovanpå ett klipp:
//  - <klippbas>.m4a          tränarens röst, obruten tidslinje
//  - <klippbas>.review.json  händelselogg (play/pause/seek/sudda) och
//    ritstreck med tidsstämplar relativt ljudets start
// Vid uppspelning styr loggen videon medan ljudet rullar. Ljudfilen delar
// basnamn med klippet enligt spec, så den kan laddas upp bredvid i steg 3.
const clipsDir = () => new Directory(Paths.document, "clips");

const base = (clipFile) => clipFile.replace(/\.mp4$/, "");
export const reviewAudioName = (clipFile) => `${base(clipFile)}.m4a`;
export const reviewLogName = (clipFile) => `${base(clipFile)}.review.json`;
const exportVideoName = (clipFile) => `${base(clipFile)}_genomgang.mp4`;

export function hasReview(clipFile) {
  try {
    const dir = clipsDir();
    return (
      new File(dir, reviewAudioName(clipFile)).exists &&
      new File(dir, reviewLogName(clipFile)).exists
    );
  } catch {
    return false;
  }
}

export async function saveReview(clipFile, tempAudioUri, log) {
  const dir = clipsDir();
  deleteReview(clipFile);
  const audio = new File(tempAudioUri);
  await audio.move(new File(dir, reviewAudioName(clipFile)));
  new File(dir, reviewLogName(clipFile)).write(JSON.stringify(log));
}

export function loadReview(clipFile) {
  try {
    const dir = clipsDir();
    const audio = new File(dir, reviewAudioName(clipFile));
    const logFile = new File(dir, reviewLogName(clipFile));
    if (!audio.exists || !logFile.exists) return null;
    return { audioUri: audio.uri, log: JSON.parse(logFile.textSync()) };
  } catch (e) {
    console.warn("Kunde inte läsa genomgång:", e);
    return null;
  }
}

export function deleteReview(clipFile) {
  const dir = clipsDir();
  for (const name of [reviewAudioName(clipFile), reviewLogName(clipFile), exportVideoName(clipFile)]) {
    try {
      const f = new File(dir, name);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn("Kunde inte ta bort genomgångsfil:", e);
    }
  }
}

// Används när ett klipp döps om (gästklipp flyttas till spelare)
export function renameReviewFiles(oldClipFile, newClipFile) {
  const dir = clipsDir();
  const pairs = [
    [reviewAudioName(oldClipFile), reviewAudioName(newClipFile)],
    [reviewLogName(oldClipFile), reviewLogName(newClipFile)],
    [exportVideoName(oldClipFile), exportVideoName(newClipFile)],
  ];
  for (const [from, to] of pairs) {
    try {
      const f = new File(dir, from);
      if (f.exists) f.move(new File(dir, to));
    } catch (e) {
      console.warn("Kunde inte döpa om genomgångsfil:", e);
    }
  }
  renameInMultiReviews(oldClipFile, newClipFile);
}

// ——— Fleklippsgenomgångar ————————————————————————
// En genomgång över flera klipp (t.ex. alla Kalles skott från kön) är en
// egen enhet: <bas>.m4a + <bas>.multireview.json. Loggen innehåller
// 'clip'-händelser som byter videokälla mitt i tidslinjen, och json:en
// bär sin egen klippinfo (fil, spelare, moment) så den är självförsörjande.
const MULTI_SUFFIX = ".multireview.json";

const sanitizeName = (s) =>
  s
    .trim()
    .replace(/[åäö]/gi, (c) => ({ å: "a", ä: "a", ö: "o", Å: "A", Ä: "A", Ö: "O" }[c] ?? c))
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function saveMultiReview(meta, tempAudioUri, log) {
  const dir = clipsDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const base = `${sanitizeName(meta.group)}_${sanitizeName(meta.player)}_genomgang_${meta.createdAt}`;
  const audio = new File(tempAudioUri);
  await audio.move(new File(dir, `${base}.m4a`));
  new File(dir, `${base}${MULTI_SUFFIX}`).write(JSON.stringify({ ...meta, ...log }));
  return `${base}${MULTI_SUFFIX}`;
}

export function listMultiReviews(groupId, { includeArchived = false } = {}) {
  try {
    const dir = clipsDir();
    if (!dir.exists) return [];
    const out = [];
    for (const f of dir.list()) {
      if (!(f instanceof File) || !f.name.endsWith(MULTI_SUFFIX)) continue;
      try {
        const meta = JSON.parse(f.textSync());
        if (groupId && meta.groupId !== groupId) continue;
        if (!includeArchived && meta.archived) continue;
        const audio = new File(dir, f.name.replace(MULTI_SUFFIX, ".m4a"));
        if (!audio.exists) continue;
        out.push({
          name: f.name,
          player: meta.player,
          playerId: meta.playerId ?? null,
          groupId: meta.groupId ?? null,
          group: meta.group ?? "",
          clipCount: meta.clips?.length ?? 0,
          durationMs: meta.durationMs ?? 0,
          createdAt: meta.createdAt ?? 0,
          archived: !!meta.archived,
          merged: !!meta.merged,
        });
      } catch {}
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.warn("Kunde inte lista genomgångar:", e);
    return [];
  }
}

export function archiveMultiReviews(groupId) {
  try {
    const dir = clipsDir();
    if (!dir.exists) return;
    for (const f of dir.list()) {
      if (!(f instanceof File) || !f.name.endsWith(MULTI_SUFFIX)) continue;
      try {
        const meta = JSON.parse(f.textSync());
        if (meta.groupId !== groupId || meta.archived) continue;
        meta.archived = true;
        f.write(JSON.stringify(meta));
      } catch {}
    }
  } catch (e) {
    console.warn("Kunde inte arkivera genomgångar:", e);
  }
}

export function archiveMultiReviewsBeforeToday() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  try {
    const dir = clipsDir();
    if (!dir.exists) return;
    for (const f of dir.list()) {
      if (!(f instanceof File) || !f.name.endsWith(MULTI_SUFFIX)) continue;
      try {
        const meta = JSON.parse(f.textSync());
        if (meta.archived || (meta.createdAt ?? 0) >= startOfToday.getTime()) continue;
        meta.archived = true;
        f.write(JSON.stringify(meta));
      } catch {}
    }
  } catch (e) {
    console.warn("Kunde inte arkivera genomgångar:", e);
  }
}

export function setMultiReviewMerged(name) {
  try {
    const f = new File(clipsDir(), name);
    if (!f.exists) return;
    const meta = JSON.parse(f.textSync());
    if (meta.merged) return;
    meta.merged = true;
    f.write(JSON.stringify(meta));
  } catch (e) {
    console.warn("Kunde inte markera genomgång som sammanslagen:", e);
  }
}

export function loadMultiReview(name) {
  try {
    const dir = clipsDir();
    const logFile = new File(dir, name);
    const audio = new File(dir, name.replace(MULTI_SUFFIX, ".m4a"));
    if (!logFile.exists || !audio.exists) return null;
    const meta = JSON.parse(logFile.textSync());
    // Borttagna klipp behåller sin plats (null) – 'clip'-händelsernas index
    // i loggen pekar på positioner i den ursprungliga listan
    const clips = (meta.clips ?? []).map((c) => {
      const f = new File(dir, c.file);
      return f.exists ? { ...c, uri: f.uri } : null;
    });
    if (!clips.some(Boolean)) return null;
    return { audioUri: audio.uri, meta, clips };
  } catch (e) {
    console.warn("Kunde inte läsa genomgång:", e);
    return null;
  }
}

export function deleteMultiReview(name) {
  const dir = clipsDir();
  for (const n of [
    name,
    name.replace(MULTI_SUFFIX, ".m4a"),
    name.replace(MULTI_SUFFIX, ".video.mp4"),
  ]) {
    try {
      const f = new File(dir, n);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn("Kunde inte ta bort genomgångsfil:", e);
    }
  }
}

function renameInMultiReviews(oldClipFile, newClipFile) {
  try {
    const dir = clipsDir();
    if (!dir.exists) return;
    for (const f of dir.list()) {
      if (!(f instanceof File) || !f.name.endsWith(MULTI_SUFFIX)) continue;
      try {
        const meta = JSON.parse(f.textSync());
        if (!meta.clips?.some((c) => c.file === oldClipFile)) continue;
        meta.clips = meta.clips.map((c) =>
          c.file === oldClipFile ? { ...c, file: newClipFile } : c
        );
        f.write(JSON.stringify(meta));
      } catch {}
    }
  } catch (e) {
    console.warn("Kunde inte uppdatera genomgångsreferenser:", e);
  }
}
