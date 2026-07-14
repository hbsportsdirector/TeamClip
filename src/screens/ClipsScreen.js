import { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { T, F } from "../theme";
import { listClips, deleteClip } from "../lib/clips";

export default function ClipsScreen({ onBack }) {
  const [clips, setClips] = useState([]);
  const [selected, setSelected] = useState(null);

  const refresh = () => setClips(listClips());
  useEffect(refresh, []);

  const confirmDelete = (clip) => {
    Alert.alert("Ta bort klipp?", `${clip.player} · ${clip.moment}`, [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Ta bort",
        style: "destructive",
        onPress: () => {
          deleteClip(clip.uri);
          if (selected?.uri === clip.uri) setSelected(null);
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={s.back}>‹ Ny kö</Text>
        </Pressable>
        <Text style={s.title}>Sparade klipp</Text>
        <Text style={s.subtitle}>
          {clips.length === 0
            ? "Inga klipp än – spela in en kö så dyker de upp här."
            : `${clips.length} klipp på telefonen. Drive-uppladdning kommer i steg 3.`}
        </Text>
      </View>

      {selected && <Player key={selected.uri} clip={selected} />}

      <FlatList
        data={clips}
        keyExtractor={(c) => c.uri}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(selected?.uri === item.uri ? null : item)}
            onLongPress={() => confirmDelete(item)}
            style={[s.card, selected?.uri === item.uri && s.cardActive]}
          >
            <View style={s.badge}>
              <Text style={s.badgeText}>{item.player[0] ?? "?"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardPlayer}>{item.player}</Text>
              <Text style={s.cardMeta}>
                {item.moment} · {item.date} · {(item.size / 1024 / 1024).toFixed(1)} MB
              </Text>
            </View>
            <Text style={s.cardPlay}>{selected?.uri === item.uri ? "▮▮" : "▶"}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<View style={{ height: 40 }} />}
      />
    </View>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  back: { color: T.mut, fontFamily: F.body600, fontSize: 15 },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 34, marginTop: 8 },
  subtitle: { color: T.dim, fontFamily: F.body, fontSize: 13, marginTop: 4, lineHeight: 19 },
  playerWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  player: { width: "100%", height: 260 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.courtLite,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  cardActive: { borderWidth: 1.5, borderColor: T.accent },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: T.court,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: T.accent, fontFamily: F.cond800, fontSize: 18 },
  cardPlayer: { color: T.line, fontFamily: F.cond700, fontSize: 19 },
  cardMeta: { color: T.mut, fontFamily: F.body, fontSize: 12.5, marginTop: 1 },
  cardPlay: { color: T.accent, fontSize: 16, padding: 6 },
});
