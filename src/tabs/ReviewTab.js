import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { Chip } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";
import InlinePlayer from "../components/InlinePlayer";
import {
  fmtDur,
  dayLabel,
  uploadStatusText,
  exportStatusText,
  multiExportStatusText,
} from "../lib/clipStatus";
import {
  listClips,
  deleteClip,
  reassignClip,
  archiveGroupClips,
  toggleClipFavorite,
} from "../lib/clips";
import {
  hasReview,
  listMultiReviews,
  deleteMultiReview,
  archiveMultiReviews,
  toggleMultiReviewFavorite,
} from "../lib/review";
import * as uploadQueue from "../lib/uploadQueue";
import * as exportReview from "../lib/exportReview";
import * as dailyMerge from "../lib/dailyMerge";

// export → dagssammanställning → uppladdning, i den ordningen
const runPipeline = () =>
  exportReview
    .kick()
    .then(() => dailyMerge.processPending())
    .then(() => uploadQueue.kick())
    .catch((e) => console.warn("Pipeline:", e?.message ?? e));

// Granska = passets arbetsyta, enbart nutid. Favoriter och Arkiv bor i
// den egna Favoriter-fliken.
export default function ReviewTab({ group, session, onOpenReview }) {
  const { registry } = useApp();
  const [clips, setClips] = useState(() => safeList(group.id));
  const [multiReviews, setMultiReviews] = useState(() => listMultiReviews(group.id));
  const [filter, setFilter] = useState("Alla");
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);

  const refresh = useCallback(() => {
    setClips(safeList(group.id));
    setMultiReviews(listMultiReviews(group.id));
  }, [group.id]);

  const [, setUploadTick] = useState(0);
  useEffect(() => {
    runPipeline();
    const tick = () => setUploadTick((t) => t + 1);
    const un1 = uploadQueue.subscribe(tick);
    const un2 = exportReview.subscribe(tick);
    const un3 = dailyMerge.subscribe(tick);
    return () => {
      un1();
      un2();
      un3();
    };
  }, []);

  const present = session.presentIds
    .map((id) => registry.find((r) => r.id === id))
    .filter(Boolean);

  const hasGuests = clips.some((c) => c.guest);
  const filters = [
    "Alla",
    ...present.map((p) => p.name),
    ...(hasGuests ? ["Gäster"] : []),
  ];
  const shown = clips.filter((c) =>
    filter === "Alla" ? true : filter === "Gäster" ? c.guest : c.player === filter && !c.guest
  );

  const shownMultiReviews = multiReviews.filter((mr) =>
    filter === "Alla" ? true : mr.player === filter
  );

  // Erbjud fleklippsgenomgång så fort alla dagens klipp i vyn hör till en
  // och samma spelare – även under "Alla" när bara en spelare har filmats.
  // Bara dagens: en genomgång gäller passet, inte veckor av gamla klipp.
  let multiCandidate = null;
  const todayKey = new Date().toDateString();
  const eligible = shown.filter(
    (c) => !c.guest && new Date(c.ts).toDateString() === todayKey
  );
  if (eligible.length >= 2 && new Set(eligible.map((c) => c.player)).size === 1) {
    multiCandidate = {
      name: eligible[0].player,
      id: eligible[0].playerId ?? present.find((p) => p.name === eligible[0].player)?.id ?? null,
      clips: eligible,
    };
  }

  // Klipplistan med datumrubriker insprängda när det finns flera dagar
  const listData = [];
  {
    let lastKey = null;
    const multiDay = new Set(shown.map((c) => new Date(c.ts).toDateString())).size > 1;
    for (const c of shown) {
      const key = new Date(c.ts).toDateString();
      if (multiDay && key !== lastKey) {
        listData.push({ isHeader: true, key: `h-${key}`, label: dayLabel(c.ts) });
        lastKey = key;
      }
      listData.push(c);
    }
  }

  const startMultiReview = () => {
    // Klippen i skjutordning (äldst först) så genomgången följer passet
    const playlistClips = [...multiCandidate.clips].sort((a, b) => a.ts - b.ts);
    onOpenReview(
      {
        kind: "multiRecord",
        clips: playlistClips,
        meta: {
          player: multiCandidate.name,
          playerId: multiCandidate.id,
          groupId: group.id,
          group: group.name,
        },
      },
      "record"
    );
  };

  const toggleFav = (clip) => {
    toggleClipFavorite(clip.file);
    refresh();
    uploadQueue.kick();
  };

  const toggleFavMr = (mr) => {
    toggleMultiReviewFavorite(mr.name);
    refresh();
    uploadQueue.kick();
  };

  const confirmFinishSession = () => {
    setDialog({
      title: "Passet klart?",
      message: `${clips.length} klipp${
        multiReviews.length > 0 ? ` och ${multiReviews.length} genomgångar` : ""
      } flyttas till Arkiv. Inget raderas – allt finns kvar där och i Drive.`,
      confirmLabel: "Passet klart",
      onConfirm: () => {
        archiveGroupClips(group.id);
        archiveMultiReviews(group.id);
        setFilter("Alla");
        setSelected(null);
        refresh();
        runPipeline();
      },
    });
  };

  const confirmDeleteMulti = (mr) => {
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

  return (
    <View style={{ flex: 1 }}>
      <View style={s.filterWrap}>
        {filters.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {selected && <InlinePlayer key={selected.uri} uri={selected.uri} />}

      <FlatList
        data={listData}
        keyExtractor={(c) => (c.isHeader ? c.key : c.file)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        ListHeaderComponent={
          <>
            {multiCandidate && (
              <Pressable onPress={startMultiReview} style={s.multiRecordBtn}>
                <Text style={s.multiRecordBtnText}>
                  🎙 Genomgång på {multiCandidate.name}s klipp idag ({multiCandidate.clips.length})
                </Text>
                <Text style={s.multiRecordBtnSub}>
                  Klippen spelas i tur och ordning – prata, pausa och rita rakt igenom
                </Text>
              </Pressable>
            )}
            {shownMultiReviews.map((mr) => (
              <Pressable
                key={mr.name}
                onPress={() => onOpenReview({ kind: "multiPlay", name: mr.name }, "play")}
                onLongPress={() => confirmDeleteMulti(mr)}
                style={s.multiCard}
              >
                <View style={s.multiBadge}>
                  <Text style={s.multiBadgeText}>🎙</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.multiCardTitle}>Genomgång · {mr.player}</Text>
                  <Text style={s.multiCardMeta}>
                    {mr.clipCount} klipp · {fmtDur(mr.durationMs)} ·{" "}
                    {new Date(mr.createdAt).toLocaleTimeString("sv-SE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text style={s.multiCardMeta}>{multiExportStatusText(mr)}</Text>
                </View>
                <View style={s.sideCol}>
                  <Text style={s.multiCardPlay}>▶</Text>
                  <Pressable onPress={() => toggleFavMr(mr)} hitSlop={8}>
                    <Text style={[s.star, !mr.favorite && s.starOff]}>{mr.favorite ? "⭐" : "☆"}</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteMulti(mr)} hitSlop={8}>
                    <Text style={s.trash}>🗑</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </>
        }
        ListEmptyComponent={
          shownMultiReviews.length === 0 ? (
            <Text style={s.empty}>
              Inga klipp än.{"\n"}Gå till Filma och fånga ett skott – klippen dyker upp här,
              sorterade per spelare.
            </Text>
          ) : null
        }
        ListFooterComponent={
          clips.length > 0 ? (
            <Pressable onPress={confirmFinishSession} style={s.finishBtn}>
              <Text style={s.finishBtnText}>✓ Passet klart – rensa vyn</Text>
              <Text style={s.finishBtnSub}>
                Flyttar {clips.length} klipp till Arkiv. Inget raderas.
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) =>
          item.isHeader ? (
            <Text style={s.dateHeader}>{item.label}</Text>
          ) : (
            <ClipCard
              clip={item}
              isSelected={selected?.file === item.file}
              onPlay={() => setSelected(selected?.file === item.file ? null : item)}
              onDelete={() => confirmDelete(item)}
              onToggleFavorite={() => toggleFav(item)}
              present={present}
              onReassigned={refresh}
              onOpenReview={onOpenReview}
              ask={setDialog}
            />
          )
        }
      />
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// Granska visar bara aktiva klipp – arkiverade bor i ⭐-fliken
function safeList(groupId) {
  try {
    return listClips(groupId);
  } catch (e) {
    console.warn("Kunde inte lista klipp:", e);
    return [];
  }
}

function ClipCard({
  clip,
  isSelected,
  onPlay,
  onDelete,
  onToggleFavorite,
  present,
  onReassigned,
  onOpenReview,
  ask,
}) {
  const [assigning, setAssigning] = useState(false);
  const review = hasReview(clip.file);

  const time = clip.ts
    ? new Date(clip.ts).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : "";
  const len = clip.durationMs ? fmtDur(clip.durationMs) : null;

  const confirmRedo = () => {
    ask({
      title: "Gör om genomgången?",
      message: "Den gamla genomgången ersätts – klippet påverkas inte.",
      confirmLabel: "Gör om",
      destructive: true,
      onConfirm: () => onOpenReview({ kind: "single", clip }, "record"),
    });
  };

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
          <Text style={s.cardTime}>{time}</Text>
        </View>
        <Text style={s.cardMeta}>
          {clip.moment}
          {len ? ` · ${len}` : ""}
          {clip.size ? ` · ${(clip.size / 1024 / 1024).toFixed(1)} MB` : ""}
        </Text>

        {clip.guest && !assigning && (
          <Pressable onPress={() => setAssigning(true)} style={s.assignBtn}>
            <Text style={s.assignBtnText}>Flytta till spelare…</Text>
          </Pressable>
        )}
        {assigning && (
          <View style={s.assignRow}>
            {present.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  reassignClip(clip.file, { player: p.name, playerId: p.id });
                  setAssigning(false);
                  onReassigned();
                }}
                style={s.assignChip}
              >
                <Text style={s.assignChipText}>{p.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setAssigning(false)} style={{ padding: 6 }}>
              <Text style={{ color: T.dim, fontFamily: F.body, fontSize: 13 }}>Avbryt</Text>
            </Pressable>
          </View>
        )}

        <View style={s.reviewRow}>
          {review ? (
            <>
              <Pressable
                onPress={() => onOpenReview({ kind: "single", clip }, "play")}
                style={s.reviewBtn}
              >
                <Text style={s.reviewBtnText}>▶ Genomgång</Text>
              </Pressable>
              <Pressable onPress={confirmRedo} style={s.reviewBtnGhost}>
                <Text style={s.reviewBtnGhostText}>Gör om</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => onOpenReview({ kind: "single", clip }, "record")}
              style={s.reviewBtnGhost}
            >
              <Text style={s.reviewBtnGhostText}>🎙 Spela in genomgång</Text>
            </Pressable>
          )}
        </View>

        <Text style={s.status}>{uploadStatusText(clip)}</Text>
        {review && exportStatusText(clip) && (
          <Text style={s.status}>{exportStatusText(clip)}</Text>
        )}
      </View>
      <View style={s.sideCol}>
        <Text style={s.playIcon}>{isSelected ? "▮▮" : "▶"}</Text>
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

const s = StyleSheet.create({
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  assignBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: T.dim,
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 13,
  },
  assignBtnText: { color: T.mut, fontFamily: F.body600, fontSize: 13 },
  assignRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" },
  assignChip: {
    backgroundColor: T.court,
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  assignChipText: { color: T.line, fontFamily: F.body600, fontSize: 13 },
  reviewRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  reviewBtn: {
    backgroundColor: "#123524",
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  reviewBtnText: { color: T.green, fontFamily: F.body600, fontSize: 13 },
  reviewBtnGhost: {
    borderWidth: 1.5,
    borderColor: T.accent,
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 13,
  },
  reviewBtnGhostText: { color: T.accent, fontFamily: F.body600, fontSize: 13 },
  multiRecordBtn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  multiRecordBtnText: { color: "#fff", fontFamily: F.cond700, fontSize: 17, letterSpacing: 0.5 },
  multiRecordBtnSub: { color: "rgba(255,255,255,0.8)", fontFamily: F.body, fontSize: 12, marginTop: 2 },
  multiCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#123524",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  multiBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  multiBadgeText: { fontSize: 18 },
  multiCardTitle: { color: T.green, fontFamily: F.cond700, fontSize: 18 },
  multiCardMeta: { color: "#7FBF9E", fontFamily: F.body, fontSize: 12.5, marginTop: 1 },
  multiCardPlay: { color: T.green, fontSize: 16, padding: 4 },
  dateHeader: {
    color: T.mut,
    fontFamily: F.cond700,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 8,
  },
  finishBtn: {
    marginTop: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.green,
    alignItems: "center",
  },
  finishBtnText: { color: T.green, fontFamily: F.cond700, fontSize: 17, letterSpacing: 0.5 },
  finishBtnSub: { color: T.dim, fontFamily: F.body, fontSize: 12, marginTop: 2 },
  playIcon: { color: T.accent, fontSize: 16, padding: 4 },
  sideCol: { justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  trash: { fontSize: 13, opacity: 0.55, padding: 4 },
  star: { fontSize: 15, padding: 3 },
  starOff: { opacity: 0.45, color: T.mut },
});
