import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { Chip } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";
import InlinePlayer from "../components/InlinePlayer";
import {
  listClips,
  deleteClip,
  toggleClipFavorite,
} from "../lib/clips";
import {
  hasReview,
  listMultiReviews,
  deleteMultiReview,
  toggleMultiReviewFavorite,
} from "../lib/review";
import * as uploadQueue from "../lib/uploadQueue";
import * as exportReview from "../lib/exportReview";
import * as dailyMerge from "../lib/dailyMerge";
import {
  fmtDur,
  dayLabel,
  uploadStatusText,
  favoriteStatusText,
  multiExportStatusText,
} from "../lib/clipStatus";

// Favoriter: spelarens höjdpunkter över tid – spela upp, filtrera på
// spelare och moment. Arkivet (alla avslutade pass) bor här som eget läge.
export default function FavoritesTab({ group, onOpenReview }) {
  const [mode, setMode] = useState("fav"); // fav | arkiv
  const [player, setPlayer] = useState("Alla");
  const [moment, setMoment] = useState("Alla");
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    const clips = safeList(group.id);
    const mrs = safeMultis(group.id);
    return { clips, mrs };
  }, [group.id]);

  const [{ clips, mrs }, setData] = useState(load);
  const refresh = useCallback(() => setData(load()), [load]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const tick = () => setTick((t) => t + 1);
    const un1 = uploadQueue.subscribe(tick);
    const un2 = exportReview.subscribe(tick);
    const un3 = dailyMerge.subscribe(tick);
    return () => {
      un1();
      un2();
      un3();
    };
  }, []);

  useEffect(() => {
    setPlayer("Alla");
    setMoment("Alla");
    setSelected(null);
  }, [mode]);

  const favClips = clips.filter((c) => c.favorite);
  const favMrs = mrs.filter((mr) => mr.favorite);
  const arkClips = clips.filter((c) => c.archived);
  const arkMrs = mrs.filter((mr) => mr.archived);

  const baseClips = mode === "fav" ? favClips : arkClips;
  const baseMrs = mode === "fav" ? favMrs : arkMrs;

  const players = [
    ...new Set([
      ...baseClips.filter((c) => !c.guest).map((c) => c.player),
      ...baseMrs.map((mr) => mr.player),
    ]),
  ].sort();
  const moments = [
    ...new Set([...baseClips.map((c) => c.moment), ...baseMrs.map((mr) => mr.moment)]),
  ]
    .filter(Boolean)
    .sort();

  const byFilter = (p, m, guest) =>
    (player === "Alla" || (player === "Gäster" ? guest : p === player && !guest)) &&
    (moment === "Alla" || m === moment);

  const shownClips = baseClips.filter((c) => byFilter(c.player, c.moment, c.guest));
  const shownMrs = baseMrs.filter((mr) => byFilter(mr.player, mr.moment, false));
  const hasGuests = baseClips.some((c) => c.guest);

  // datumrubriker när listan spänner över flera dagar
  const listData = [];
  {
    let lastKey = null;
    const multiDay = new Set(shownClips.map((c) => new Date(c.ts).toDateString())).size > 1;
    for (const c of shownClips) {
      const key = new Date(c.ts).toDateString();
      if (multiDay && key !== lastKey) {
        listData.push({ isHeader: true, key: `h-${key}`, label: dayLabel(c.ts) });
        lastKey = key;
      }
      listData.push(c);
    }
  }

  const toggleFavClip = (clip) => {
    toggleClipFavorite(clip.file);
    refresh();
    uploadQueue.kick();
  };
  const toggleFavMr = (mr) => {
    toggleMultiReviewFavorite(mr.name);
    refresh();
    uploadQueue.kick();
  };

  const confirmDelete = (clip) => {
    setDialog({
      title: "Ta bort klipp?",
      message: `${clip.player} · ${clip.moment}${hasReview(clip.file) ? " · genomgången följer med" : ""}`,
      confirmLabel: "Ta bort",
      destructive: true,
      onConfirm: () => {
        deleteClip(clip.file);
        if (selected?.file === clip.file) setSelected(null);
        refresh();
      },
    });
  };
  const confirmDeleteMr = (mr) => {
    setDialog({
      title: "Ta bort genomgång?",
      message: `${mr.player} · ${mr.clipCount} klipp i följd. Själva klippen påverkas inte.`,
      confirmLabel: "Ta bort",
      destructive: true,
      onConfirm: () => {
        deleteMultiReview(mr.name);
        refresh();
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.segmented}>
        {[
          ["fav", "⭐ Favoriter"],
          ["arkiv", "Arkiv"],
        ].map(([k, l]) => (
          <Pressable key={k} onPress={() => setMode(k)} style={[s.segBtn, mode === k && s.segBtnActive]}>
            <Text style={[s.segText, mode === k && s.segTextActive]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {(players.length > 0 || hasGuests) && (
        <View style={s.chipWrap}>
          {["Alla", ...players, ...(hasGuests ? ["Gäster"] : [])].map((p) => (
            <Chip key={p} label={p} small active={player === p} onPress={() => setPlayer(p)} />
          ))}
        </View>
      )}
      {moments.length > 0 && (
        <View style={s.chipWrap}>
          {["Alla", ...moments].map((m) => (
            <Chip key={m} label={m} small active={moment === m} onPress={() => setMoment(m)} />
          ))}
        </View>
      )}

      {selected && <InlinePlayer key={selected.uri} uri={selected.uri} />}

      <FlatList
        data={listData}
        keyExtractor={(c) => (c.isHeader ? c.key : c.file)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        ListHeaderComponent={
          <>
            {shownMrs.map((mr) => (
              <Pressable
                key={mr.name}
                onPress={() => onOpenReview({ kind: "multiPlay", name: mr.name }, "play")}
                onLongPress={() => confirmDeleteMr(mr)}
                style={s.mrCard}
              >
                <View style={s.mrBadge}>
                  <Text style={{ fontSize: 18 }}>🎙</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mrTitle}>Genomgång · {mr.player}</Text>
                  <Text style={s.mrMeta}>
                    {mr.moment} · {mr.clipCount} klipp · {fmtDur(mr.durationMs)} ·{" "}
                    {new Date(mr.createdAt).toLocaleDateString("sv-SE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Text>
                  {mode === "fav" ? (
                    <Text style={s.status}>
                      {favoriteStatusText(exportReview.multiExportVideoName(mr.name))}
                    </Text>
                  ) : (
                    <Text style={s.status}>{multiExportStatusText(mr)}</Text>
                  )}
                </View>
                <View style={s.sideCol}>
                  <Text style={s.play}>▶</Text>
                  <Pressable onPress={() => toggleFavMr(mr)} hitSlop={8}>
                    <Text style={[s.star, !mr.favorite && s.starOff]}>
                      {mr.favorite ? "⭐" : "☆"}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteMr(mr)} hitSlop={8}>
                    <Text style={s.trash}>🗑</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </>
        }
        ListEmptyComponent={
          shownMrs.length === 0 ? (
            <Text style={s.empty}>
              {mode === "fav"
                ? "Inga favoriter än.\nStjärnmärk klipp och genomgångar i Granska eller Arkiv så samlas de här."
                : "Arkivet är tomt.\nNär du trycker \"Passet klart\" i Granska flyttas passets material hit."}
            </Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.isHeader ? (
            <Text style={s.dateHeader}>{item.label}</Text>
          ) : (
            <FavClipCard
              clip={item}
              mode={mode}
              isSelected={selected?.file === item.file}
              onPlay={() => setSelected(selected?.file === item.file ? null : item)}
              onOpenReview={onOpenReview}
              onToggleFavorite={() => toggleFavClip(item)}
              onDelete={() => confirmDelete(item)}
            />
          )
        }
      />
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

function FavClipCard({ clip, mode, isSelected, onPlay, onOpenReview, onToggleFavorite, onDelete }) {
  const review = hasReview(clip.file);
  return (
    <Pressable
      onPress={onPlay}
      onLongPress={onDelete}
      style={[s.card, clip.guest && s.cardGuest, isSelected && s.cardActive]}
    >
      <View style={s.badge}>
        <Text style={[s.badgeText, clip.guest && { color: T.dim }]}>
          {clip.guest ? "?" : clip.player[0] ?? "?"}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={[s.cardPlayer, clip.guest && { color: T.mut }]}>{clip.player}</Text>
          <Text style={s.cardTime}>
            {new Date(clip.ts).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
          </Text>
        </View>
        <Text style={s.cardMeta}>
          {clip.moment}
          {clip.durationMs ? ` · ${fmtDur(clip.durationMs)}` : ""}
        </Text>
        {review && (
          <Pressable
            onPress={() => onOpenReview({ kind: "single", clip }, "play")}
            style={s.reviewBtn}
          >
            <Text style={s.reviewBtnText}>▶ Genomgång</Text>
          </Pressable>
        )}
        <Text style={s.status}>
          {mode === "fav" ? favoriteStatusText(clip.file) : uploadStatusText(clip)}
        </Text>
      </View>
      <View style={s.sideCol}>
        <Text style={s.play}>{isSelected ? "▮▮" : "▶"}</Text>
        <Pressable onPress={onToggleFavorite} hitSlop={8}>
          <Text style={[s.star, !clip.favorite && s.starOff]}>{clip.favorite ? "⭐" : "☆"}</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={s.trash}>🗑</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function safeList(groupId) {
  try {
    return listClips(groupId, { includeArchived: true });
  } catch (e) {
    console.warn("Kunde inte lista klipp:", e);
    return [];
  }
}

function safeMultis(groupId) {
  try {
    return listMultiReviews(groupId, { includeArchived: true });
  } catch (e) {
    console.warn("Kunde inte lista genomgångar:", e);
    return [];
  }
}

const s = StyleSheet.create({
  segmented: {
    flexDirection: "row",
    backgroundColor: "#080E26",
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segBtnActive: { backgroundColor: T.courtLite },
  segText: { color: T.dim, fontFamily: F.cond700, fontSize: 17, letterSpacing: 1 },
  segTextActive: { color: T.line },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  empty: {
    color: T.dim,
    fontFamily: F.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  dateHeader: {
    color: T.mut,
    fontFamily: F.cond700,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: T.courtLite,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  cardGuest: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: T.dim,
    borderStyle: "dashed",
  },
  cardActive: { borderWidth: 1.5, borderColor: T.accent, borderStyle: "solid" },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: T.court,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: T.accent, fontFamily: F.cond800, fontSize: 20 },
  cardPlayer: { color: T.line, fontFamily: F.cond700, fontSize: 20 },
  cardTime: { color: T.dim, fontFamily: F.body, fontSize: 12 },
  cardMeta: { color: T.mut, fontFamily: F.body, fontSize: 13, marginTop: 1 },
  reviewBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#123524",
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 13,
  },
  reviewBtnText: { color: T.green, fontFamily: F.body600, fontSize: 13 },
  status: { color: T.dim, fontFamily: F.body, fontSize: 12, marginTop: 8 },
  sideCol: { justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  play: { color: T.accent, fontSize: 16, padding: 4 },
  star: { fontSize: 15, padding: 3 },
  starOff: { opacity: 0.45, color: T.mut },
  trash: { fontSize: 13, opacity: 0.55, padding: 4 },
  mrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#123524",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  mrBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  mrTitle: { color: T.green, fontFamily: F.cond700, fontSize: 18 },
  mrMeta: { color: "#7FBF9E", fontFamily: F.body, fontSize: 12.5, marginTop: 1 },
});
