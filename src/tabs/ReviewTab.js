import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet, Alert } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { Chip } from "../components/ui";
import { listClips, deleteClip, reassignClip } from "../lib/clips";

export default function ReviewTab({ group, session }) {
  const { registry } = useApp();
  const [clips, setClips] = useState(() => safeList(group.id));
  const [filter, setFilter] = useState("Alla");
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(() => setClips(safeList(group.id)), [group.id]);

  const present = session.presentIds
    .map((id) => registry.find((r) => r.id === id))
    .filter(Boolean);

  const hasGuests = clips.some((c) => c.guest);
  const filters = ["Alla", ...present.map((p) => p.name), ...(hasGuests ? ["Gäster"] : [])];
  const shown = clips.filter((c) =>
    filter === "Alla" ? true : filter === "Gäster" ? c.guest : c.player === filter && !c.guest
  );

  const confirmDelete = (clip) => {
    Alert.alert("Ta bort klipp?", `${clip.player} · ${clip.moment}`, [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Ta bort",
        style: "destructive",
        onPress: () => {
          deleteClip(clip.file);
          if (selected?.file === clip.file) setSelected(null);
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={s.filterRow}
      >
        {filters.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {selected && <Player key={selected.uri} clip={selected} />}

      <FlatList
        data={shown}
        keyExtractor={(c) => c.file}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={s.empty}>
            Inga klipp än.{"\n"}Gå till Filma och fånga ett skott – klippen dyker upp här,
            sorterade per spelare.
          </Text>
        }
        renderItem={({ item }) => (
          <ClipCard
            clip={item}
            isSelected={selected?.file === item.file}
            onPlay={() => setSelected(selected?.file === item.file ? null : item)}
            onDelete={() => confirmDelete(item)}
            present={present}
            onReassigned={refresh}
          />
        )}
      />
    </View>
  );
}

function safeList(groupId) {
  try {
    return listClips(groupId);
  } catch (e) {
    console.warn("Kunde inte lista klipp:", e);
    return [];
  }
}

function ClipCard({ clip, isSelected, onPlay, onDelete, present, onReassigned }) {
  const [assigning, setAssigning] = useState(false);

  const time = clip.ts
    ? new Date(clip.ts).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : "";
  const len = clip.durationMs ? fmtDur(clip.durationMs) : null;

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

        <Text style={s.status}>
          {clip.guest
            ? "◌ I gruppens gästhög – delas inte med någon"
            : "✓ Sparat lokalt · Drive-uppladdning kommer i steg 3"}
        </Text>
      </View>
      <Text style={s.playIcon}>{isSelected ? "▮▮" : "▶"}</Text>
    </Pressable>
  );
}

function Player({ clip }) {
  const player = useVideoPlayer(clip.uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <View style={s.playerWrap}>
      <VideoView player={player} style={s.player} contentFit="contain" nativeControls />
    </View>
  );
}

const fmtDur = (ms) => {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};

const s = StyleSheet.create({
  filterRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
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
  status: { color: T.dim, fontFamily: F.body, fontSize: 12, marginTop: 8 },
  playIcon: { color: T.accent, fontSize: 16, alignSelf: "center", padding: 4 },
  playerWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  player: { width: "100%", height: 240 },
});
