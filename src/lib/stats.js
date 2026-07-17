// Ren statistiklogik (inga expo-beroenden – node-testbar).
// Syftet är täckning, inte siffror: hjälp tränaren se vilka spelare som
// inte blivit filmade på länge så att alla blir sedda då och då.

const DAY = 86400000;
export const ATTENTION_DAYS = 14;

// memberIds + registry + db-snapshot → en rad per spelare i truppen
export function playerCoverage(d, { memberIds, registry, now }) {
  const rows = [];
  for (const id of memberIds) {
    const player = registry.find((r) => r.id === id);
    if (!player) continue;
    let lastFilmedTs = null;
    let clips30d = 0;
    let reviews30d = 0;
    for (const c of d.clips) {
      if (c.playerId !== id) continue;
      if (lastFilmedTs === null || c.ts > lastFilmedTs) lastFilmedTs = c.ts;
      if (now - c.ts <= 30 * DAY) clips30d++;
    }
    for (const r of d.reviews) {
      if (r.playerId !== id) continue;
      if (now - r.createdAt <= 30 * DAY) reviews30d++;
    }
    // enklippsgenomgångar räknas via klippen; fleklipps via reviews-raderna
    rows.push({
      id,
      name: player.name,
      lastFilmedTs,
      clips30d,
      reviews30d,
      daysSince: lastFilmedTs === null ? null : Math.floor((now - lastFilmedTs) / DAY),
      needsAttention:
        lastFilmedTs === null || now - lastFilmedTs > ATTENTION_DAYS * DAY,
    });
  }
  return rows;
}

export function attentionList(rows) {
  return rows
    .filter((r) => r.needsAttention)
    .sort((a, b) => {
      // aldrig filmade först, därefter längst sedan sist
      if (a.lastFilmedTs === null && b.lastFilmedTs !== null) return -1;
      if (b.lastFilmedTs === null && a.lastFilmedTs !== null) return 1;
      return (a.lastFilmedTs ?? 0) - (b.lastFilmedTs ?? 0);
    });
}

export function coverageLabel(row) {
  if (row.lastFilmedTs === null) return "aldrig filmad";
  if (row.daysSince === 0) return "filmad idag";
  if (row.daysSince === 1) return "filmad igår";
  if (row.daysSince < 7) return `${row.daysSince} dagar sedan`;
  const weeks = Math.floor(row.daysSince / 7);
  return weeks === 1 ? "1 vecka sedan" : `${weeks} veckor sedan`;
}
