// Ren jobblogik (inga expo-beroenden – node-testbar).
// deriveJobs härleder önskade Drive-leveranser ur ett db-snapshot;
// reconcileJobs synkar db.jobs mot önskelistan. Självläkande: saknade,
// felade och föråldrade jobb blir pending, klara jobb med färskt kvitto
// lämnas ifred.

const playerBase = (player, moment) => ["TeamClip", "Spelare", player, moment || "Traning"];
const guestBase = (group, moment) => ["TeamClip", group || "Grupp", "Gäster", moment || "Traning"];

// ctx: { fileExists(name), emailOf(playerId), exportVideoName(f),
//        multiExportVideoName(n), dayOf(ts), now() }
export function deriveJobs(d, ctx) {
  const jobs = [];

  for (const m of d.merges) {
    if (!ctx.fileExists(m.file)) continue;
    const target = m.guest
      ? { folder: [...guestBase(m.group, m.moment), m.day] }
      : {
          folder: [...playerBase(m.player, m.moment), m.day],
          sharePath: ["TeamClip", "Spelare", m.player],
          shareWith: ctx.emailOf(m.playerId),
        };
    jobs.push({
      key: m.file,
      file: m.file,
      driveName: m.driveName,
      mime: "video/mp4",
      minCreatedAt: m.createdAt ?? 0,
      ...target,
    });
  }

  for (const c of d.clips) {
    if (!c.favorite) continue;
    const target = c.guest
      ? { folder: [...guestBase(c.group, c.moment), "Favoriter"] }
      : {
          folder: [...playerBase(c.player, c.moment), "Favoriter"],
          sharePath: ["TeamClip", "Spelare", c.player],
          shareWith: ctx.emailOf(c.playerId),
        };
    if (ctx.fileExists(c.file)) {
      jobs.push({ key: `fav:${c.file}`, file: c.file, mime: "video/mp4", ...target });
    }
    const exp = ctx.exportVideoName(c.file);
    if (ctx.fileExists(exp)) {
      jobs.push({ key: `fav:${exp}`, file: exp, mime: "video/mp4", ...target });
    }
  }

  for (const r of d.reviews) {
    if (!r.favorite) continue;
    const video = ctx.multiExportVideoName(r.name);
    if (!ctx.fileExists(video)) continue;
    jobs.push({
      key: `fav:${video}`,
      file: video,
      driveName: `${ctx.dayOf(r.createdAt)}_Genomgang_${r.player}.mp4`,
      mime: "video/mp4",
      folder: [...playerBase(r.player, r.moment), "Favoriter"],
      sharePath: ["TeamClip", "Spelare", r.player],
      shareWith: ctx.emailOf(r.playerId),
    });
  }

  return jobs;
}

export function reconcileJobs(d, ctx) {
  // ett "running"-jobb vid körningens start är ett lik från en död process
  for (const j of Object.values(d.jobs)) {
    if (j.status === "running") j.status = "pending";
  }
  for (const t of deriveJobs(d, ctx)) {
    const existing = d.jobs[t.key];
    // klart med färskt kvitto? lämna ifred (minCreatedAt skyddar mot att en
    // nyare fil med återanvänd nyckel hoppas över)
    if (existing?.status === "done" && (existing.updatedAt ?? 0) >= (t.minCreatedAt ?? 0)) {
      continue;
    }
    d.jobs[t.key] = {
      ...t,
      status: "pending",
      error: null,
      attempts: existing?.attempts ?? 0,
      updatedAt: ctx.now(),
    };
  }
}
