import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CameraView } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { T, F } from "../theme";
import { saveClip, discardTempClip } from "../lib/clips";

const MIN_SEGMENT_MS = 700;

export default function SpontRecordScreen({ player, moment, group, onDone }) {
  useKeepAwake();

  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [sec, setSec] = useState(0);
  const [error, setError] = useState(null);

  const recordingRef = useRef(false);
  const wantSaveRef = useRef(false);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (recordingRef.current) setSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    run();
    return () => {
      doneRef.current = true;
      camRef.current?.stopRecording();
    };
  }, [ready]);

  async function run() {
    startRef.current = Date.now();
    recordingRef.current = true;
    let video = null;
    try {
      video = await camRef.current.recordAsync();
    } catch (e) {
      setError(`Kameran svarar inte: ${e?.message ?? e}`);
      recordingRef.current = false;
      return;
    }
    recordingRef.current = false;
    const durationMs = Date.now() - startRef.current;

    let saved = false;
    if (video?.uri && wantSaveRef.current) {
      try {
        await saveClip(video.uri, {
          player: player.name,
          playerId: player.rid,
          groupId: group.id,
          group: group.name,
          moment,
          guest: player.guest,
          durationMs,
        });
        saved = true;
      } catch (e) {
        setError(`Kunde inte spara klipp: ${e?.message ?? e}`);
      }
    } else if (video?.uri) {
      discardTempClip(video.uri);
    }
    if (!doneRef.current) {
      doneRef.current = true;
      onDone(saved);
    }
  }

  const stopAndSave = () => {
    if (!recordingRef.current || Date.now() - startRef.current < MIN_SEGMENT_MS) return;
    wantSaveRef.current = true;
    camRef.current?.stopRecording();
  };

  const cancel = () => {
    wantSaveRef.current = false;
    if (recordingRef.current) {
      camRef.current?.stopRecording();
      setTimeout(() => camRef.current?.stopRecording(), 400);
    } else if (!doneRef.current) {
      doneRef.current = true;
      onDone(false);
    }
  };

  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, "0");

  return (
    <View style={s.root}>
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        videoQuality="720p"
        onCameraReady={() => setReady(true)}
      />

      <View style={s.topBar}>
        <View style={s.recDot} />
        <Text style={s.topLabel}>
          {player.name} · {moment}
        </Text>
        <Text style={s.timer}>
          {mm}:{ss}
        </Text>
      </View>

      <View style={s.bottom}>
        {error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : !ready ? (
          <Text style={s.dimText}>Startar kameran…</Text>
        ) : null}

        <Pressable onPress={stopAndSave} style={({ pressed }) => [s.stopBtn, pressed && s.stopBtnPressed]}>
          <Text style={s.stopBtnText}>■</Text>
          <Text style={s.stopBtnSub}>Stopp & spara</Text>
        </Pressable>

        <Pressable onPress={cancel} hitSlop={12}>
          <Text style={s.cancelText}>Avbryt utan att spara</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 54,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(8,14,38,0.82)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.rec },
  topLabel: { flex: 1, color: T.line, fontFamily: F.cond700, fontSize: 17, letterSpacing: 1 },
  timer: { color: T.rec, fontFamily: F.cond800, fontSize: 20 },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingBottom: 34,
    paddingTop: 18,
    backgroundColor: "rgba(8,14,38,0.72)",
  },
  stopBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: T.rec,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  stopBtnPressed: { backgroundColor: "#C4444A", transform: [{ scale: 0.96 }] },
  stopBtnText: { color: "#fff", fontSize: 26, lineHeight: 30 },
  stopBtnSub: { color: "#fff", fontFamily: F.cond700, fontSize: 13, marginTop: 2 },
  cancelText: { color: T.mut, fontFamily: F.body600, fontSize: 14, marginTop: 18, padding: 8 },
  dimText: { color: T.dim, fontFamily: F.body, fontSize: 14, marginBottom: 6 },
  errorText: { color: T.rec, fontFamily: F.body600, fontSize: 13, marginBottom: 6 },
});
