import { View, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export default function InlinePlayer({ uri }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <View style={s.wrap}>
      <VideoView player={player} style={s.player} contentFit="contain" nativeControls />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  player: { width: "100%", height: 240 },
});
