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
  for (const name of [reviewAudioName(clipFile), reviewLogName(clipFile)]) {
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
  ];
  for (const [from, to] of pairs) {
    try {
      const f = new File(dir, from);
      if (f.exists) f.move(new File(dir, to));
    } catch (e) {
      console.warn("Kunde inte döpa om genomgångsfil:", e);
    }
  }
}
