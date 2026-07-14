import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CameraView } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { T, F } from "../theme";
import { saveClip, discardTempClip, nextSeq } from "../lib/clips";

// Kameran rullar kontinuerligt. Ett tryck på "Skott klart" stoppar inspelningen,
// segmentet sedan förra trycket sparas på skytten som just skjutit, och nästa
// segment startar direkt. expo-camera kan inte klippa utan att starta om
// inspelningen, så det blir en kort lucka (~0,5 s) vid varje klippgräns i
// stället för spec:ens önskade överlapp – skytten som SKA skjuta filmas dock
// hela tiden, luckan hamnar direkt efter att föregående skott sparats.
const MIN_SEGMENT_MS = 700;

export default function QueueRecordScreen({ order, moment, onFinish }) {
  useKeepAwake();

  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [lap, setLap] = useState(1);
  const [segSec, setSegSec] = useState(0);
  const [flash, setFlash] = useState(null);
  const [clipCount, setClipCount] = useState(0);
  const [error, setError] = useState(null);

  const runningRef = useRef(false);
  const recordingRef = useRef(false);
  const cutRef = useRef(false);
  const segStartRef = useRef(0);
  const idxRef = useRef(0);
  const seqRef = useRef(1);
  const savesRef = useRef([]);

  useEffect(() => {
    seqRef.current = nextSeq();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (recordingRef.current) {
        setSegSec(Math.floor((Date.now() - segStartRef.current) / 1000));
      }
    }, 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    runQueue();
    return () => {
      runningRef.current = false;
      camRef.current?.stopRecording();
    };
  }, [ready]);

  async function runQueue() {
    runningRef.current = true;
    let consecutiveErrors = 0;

    while (runningRef.current) {
      const shooter = order[idxRef.current];
      cutRef.current = false;
      segStartRef.current = Date.now();
      setSegSec(0);
      recordingRef.current = true;

      let video = null;
      try {
        video = await camRef.current.recordAsync();
        consecutiveErrors = 0;
      } catch (e) {
        recordingRef.current = false;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          setError(`Kameran svarar inte: ${e?.message ?? e}`);
          runningRef.current = false;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      recordingRef.current = false;

      const durationMs = Date.now() - segStartRef.current;

      if (cutRef.current && video?.uri) {
        const seq = seqRef.current++;
        savesRef.current.push(
          saveClip(video.uri, {
            moment,
            player: shooter.name,
            guest: shooter.guest,
            seq,
            durationMs,
          }).catch((e) => setError(`Kunde inte spara klipp: ${e?.message ?? e}`))
        );
        setClipCount((c) => c + 1);
        setFlash(shooter);
        setTimeout(() => setFlash(null), 1200);

        const next = idxRef.current + 1;
        if (next >= order.length) {
          idxRef.current = 0;
          setLap((l) => l + 1);
        } else {
          idxRef.current = next;
        }
        setIdx(idxRef.current);
      } else if (video?.uri) {
        // "Avsluta kön" mitt i ett segment – halvfärdigt skott slängs
        discardTempClip(video.uri);
      }
    }

    await Promise.allSettled(savesRef.current);
    onFinish();
  }

  const cut = () => {
    const elapsed = Date.now() - segStartRef.current;
    if (!runningRef.current || !recordingRef.current || elapsed < MIN_SEGMENT_MS) return;
    cutRef.current = true;
    camRef.current?.stopRecording();
  };

  const stopAll = () => {
    runningRef.current = false;
    camRef.current?.stopRecording();
    // om inspelningen inte hunnit starta ignoreras första stoppet – försök igen
    setTimeout(() => camRef.current?.stopRecording(), 400);
    if (!recordingRef.current && savesRef.current.length === 0) onFinish();
  };

  const shooter = order[idx];
  const next = order[(idx + 1) % order.length];
  const mm = Math.floor(segSec / 60);
  const ss = String(segSec % 60).padStart(2, "0");

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
        <View style={[s.recDot, !recordingRef.current && { opacity: 0.3 }]} />
        <Text style={s.topLabel}>
          Varv {lap} · {moment} · {clipCount} klipp
        </Text>
        <Text style={s.timer}>
          {mm}:{ss}
        </Text>
      </View>

      <View style={s.bottom}>
        <Text style={s.nowLabel}>Skjuter nu</Text>
        <Text style={[s.shooterName, shooter.guest && { color: T.mut }]}>{shooter.name}</Text>
        {shooter.guest && <Text style={s.guestNote}>gäst – klippet delas inte</Text>}

        <Pressable onPress={cut} style={({ pressed }) => [s.cutBtn, pressed && s.cutBtnPressed]}>
          <Text style={s.cutBtnText}>SKOTT{"\n"}KLART</Text>
          <Text style={s.cutBtnSub}>klipp & nästa</Text>
        </Pressable>

        <View style={s.flashSlot}>
          {flash && (
            <Text style={s.flashText}>✓ Klipp sparat till {flash.name}</Text>
          )}
          {error && <Text style={s.errorText}>{error}</Text>}
          {!ready && !error && <Text style={s.flashTextDim}>Startar kameran…</Text>}
        </View>

        <Text style={s.nextText}>
          Näst på tur: <Text style={s.nextName}>{next.name}</Text>
        </Text>

        <Pressable onPress={stopAll} hitSlop={12}>
          <Text style={s.stopText}>■ Avsluta kön</Text>
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
  topLabel: { flex: 1, color: T.line, fontFamily: F.cond700, fontSize: 16, letterSpacing: 1 },
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
  nowLabel: {
    color: T.mut,
    fontFamily: F.cond700,
    fontSize: 14,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  shooterName: { color: T.line, fontFamily: F.cond800, fontSize: 44, lineHeight: 48, marginTop: 2 },
  guestNote: { color: T.dim, fontSize: 12, fontFamily: F.body },
  cutBtn: {
    marginTop: 14,
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: T.accentDeep,
    elevation: 8,
    shadowColor: T.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  cutBtnPressed: { backgroundColor: T.accentDeep, transform: [{ scale: 0.96 }] },
  cutBtnText: {
    color: "#fff",
    fontFamily: F.cond800,
    fontSize: 24,
    lineHeight: 26,
    textAlign: "center",
    letterSpacing: 1.5,
  },
  cutBtnSub: { color: "rgba(255,255,255,0.85)", fontFamily: F.cond700, fontSize: 14, marginTop: 2 },
  flashSlot: { height: 22, marginTop: 10, justifyContent: "center" },
  flashText: { color: T.green, fontFamily: F.body600, fontSize: 14 },
  flashTextDim: { color: T.dim, fontFamily: F.body, fontSize: 14 },
  errorText: { color: T.rec, fontFamily: F.body600, fontSize: 13 },
  nextText: { color: T.mut, fontFamily: F.body, fontSize: 15, marginTop: 4 },
  nextName: { color: T.line, fontFamily: F.body600 },
  stopText: { color: T.rec, fontFamily: F.body600, fontSize: 15, marginTop: 18, padding: 8 },
});
