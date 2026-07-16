// Ren urvalslogik för lagringsstädning (inga expo-beroenden – node-testbar).
// Lokala filer får raderas när de är LEVERERADE till Drive, äldre än
// gränsen och inte favoritmarkerade. Drive är arkivet; appens lokala
// bibliotek är en arbetsyta.
//
// ctx: { now(), days, fileExists(name), reviewExists(clipFile),
//        multiExportVideoName(name) }

export function selectCleanupTargets(d, ctx) {
  const cutoff = ctx.now() - ctx.days * 86400000;
  const jobDone = (key) => d.jobs[key]?.status === "done";
  const newestMergeWith = (sourceFile) => {
    const hits = d.merges.filter((m) => m.sources.includes(sourceFile));
    if (hits.length === 0) return null;
    return hits.reduce((a, b) => ((b.createdAt ?? 0) > (a.createdAt ?? 0) ? b : a));
  };

  const clipFiles = [];
  const mergeFiles = [];
  const reviewNames = [];

  // levererade sammanställningsfiler (raden och kvittot behålls –
  // deriveJobs hoppar över saknade filer)
  for (const m of d.merges) {
    if ((m.createdAt ?? 0) >= cutoff) continue;
    if (!jobDone(m.file)) continue;
    if (ctx.fileExists(m.file)) mergeFiles.push(m.file);
  }

  // arkiverade klipp vars leverans är klar
  for (const c of d.clips) {
    if (!c.archived || c.favorite) continue;
    if ((c.ts ?? 0) >= cutoff) continue;
    if (!c.merged) continue;
    const m = newestMergeWith(c.file);
    if (!m || !jobDone(m.file)) continue;
    // har klippet en genomgång måste även den vara levererad
    if (ctx.reviewExists(c.file) && !c.exportMerged) continue;
    clipFiles.push(c.file);
  }

  // fleklippsgenomgångar vars video är levererad
  for (const r of d.reviews) {
    if (!r.merged || r.favorite) continue;
    if ((r.createdAt ?? 0) >= cutoff) continue;
    const video = ctx.multiExportVideoName(r.name);
    const m = newestMergeWith(video);
    if (!m || !jobDone(m.file)) continue;
    reviewNames.push(r.name);
  }

  return { clipFiles, mergeFiles, reviewNames };
}
