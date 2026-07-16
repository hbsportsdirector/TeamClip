import { Directory, File, Paths } from "expo-file-system";
import * as db from "./db";
import { deleteClip } from "./clips";
import { hasReview, deleteMultiReview } from "./review";
import { multiExportVideoName } from "./exportReview";
import { selectCleanupTargets } from "./retention";

// Lagringsstädning: raderar lokala kopior av material som är levererat
// till Drive, äldre än gränsen och inte favoritmarkerat. Körs tyst vid
// appstart. Drive är arkivet – raderade klipp försvinner ur appens
// Arkiv-läge men ligger kvar i spelarnas Drive-mappar.
const RETENTION_DAYS = 30;

const clipsDir = () => new Directory(Paths.document, "clips");

export function localStorageBytes() {
  try {
    const dir = clipsDir();
    if (!dir.exists) return 0;
    let total = 0;
    for (const f of dir.list()) {
      if (f instanceof File) total += f.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

export function runCleanup({ days = RETENTION_DAYS } = {}) {
  const ctx = {
    now: () => Date.now(),
    days,
    fileExists: (name) => {
      try {
        return new File(clipsDir(), name).exists;
      } catch {
        return false;
      }
    },
    reviewExists: hasReview,
    multiExportVideoName,
  };

  const targets = selectCleanupTargets(db.getDb(), ctx);

  for (const name of targets.clipFiles) deleteClip(name); // tar sidofiler + raden
  for (const name of targets.reviewNames) deleteMultiReview(name);
  for (const name of targets.mergeFiles) {
    try {
      const f = new File(clipsDir(), name);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn("Kunde inte städa sammanställningsfil:", e?.message ?? e);
    }
  }

  const n = targets.clipFiles.length + targets.reviewNames.length + targets.mergeFiles.length;
  if (n > 0) console.log(`Lagringsstädning: ${n} levererade filer äldre än ${days} dagar raderade lokalt`);
  return n;
}
