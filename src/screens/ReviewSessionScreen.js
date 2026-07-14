import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, PanResponder, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";
import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import Svg, { Polyline, Circle } from "react-native-svg";
import { T, F } from "../theme";
import { loadReview, saveReview } from "../lib/review";

// Genomgång: tränaren pratar över klippet, pausar fritt och ritar med
// fingret. Ljudet är den obrutna tidslinjen; video-play/pause/seek och
// ritstreck loggas med tidsstämplar relativt ljudstarten och spelas upp
// synkat igen. Videons eget ljud är avstängt hela tiden – tränarrösten
// är ljudspåret.
export default function ReviewSessionScreen({ clip, mode, onClose }) {
  useKeepAwake();
  return mode === "record" ? (
    <RecordSession clip={clip} onClose={onClose} />
  ) : (
    <PlaySession clip={clip} onClose={onClose} />
  );
}

// ——— Inspelning ————————————————————————————————
function RecordSession({ clip, onClose }) {
  const video = useVideoPlayer(clip.uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { isPlaying } = useEvent(video, "playingChange", { isPlaying: video.playing });

  const [phase, setPhase] = useState("idle"); // idle | recording | saving
  const [elapsed, setElapsed] = useState(0);
  const [strokes, setStrokes] = useState([]);
  const [error, setError] = useState(null);

  const t0Ref = useRef(0);
  const eventsRef = useRef([]);
  const strokesRef = useRef([]);
  const phaseRef = useRef("idle");
  const prevPlayingRef = useRef(false);

  const now = () => Date.now() - t0Ref.current;

  useEffect(() => {
    const t = setInterval(() => {
      if (phaseRef.current === "recording") setElapsed(Math.floor(now() / 1000));
    }, 250);
    return () => clearInterval(t);
  }, []);

  // Alla play/pause-övergångar loggas här – även när klippet tar slut av
  // sig självt – så att uppspelningen speglar exakt vad tränaren såg.
  useEffect(() => {
    if (phaseRef.current === "recording" && prevPlayingRef.current !== isPlaying) {
      eventsRef.current.push({
        t: now(),
        type: isPlaying ? "play" : "pause",
        videoTime: Math.round(video.currentTime * 1000),
      });
    }
    prevPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      try {
        if (phaseRef.current === "recording") recorder.stop();
      } catch {}
    };
  }, []);

  const start = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("TeamClip behöver mikrofonen för genomgången. Aktivera den i inställningarna.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      t0Ref.current = Date.now();
      eventsRef.current = [];
      strokesRef.current = [];
      setStrokes([]);
      phaseRef.current = "recording";
      setPhase("recording");
      video.currentTime = 0;
      video.play();
    } catch (e) {
      setError(`Kunde inte starta inspelningen: ${e?.message ?? e}`);
    }
  };

  const toggleVideo = () => {
    if (phaseRef.current !== "recording") return;
    if (isPlaying) {
      video.pause();
    } else {
      if (video.duration > 0 && video.currentTime >= video.duration - 0.05) {
        video.currentTime = 0;
        eventsRef.current.push({ t: now(), type: "seek", videoTime: 0 });
      }
      video.play();
    }
  };

  const restart = () => {
    if (phaseRef.current !== "recording") return;
    video.currentTime = 0;
    eventsRef.current.push({ t: now(), type: "seek", videoTime: 0 });
    if (!isPlaying) video.play();
  };

  const clearDrawings = () => {
    if (phaseRef.current !== "recording") return;
    eventsRef.current.push({ t: now(), type: "clear" });
    setStrokes([]);
  };

  const onStroke = (points) => {
    if (phaseRef.current !== "recording" || points.length < 2) return;
    const rel = points.map((p) => ({ x: p.x, y: p.y, t: p.t - t0Ref.current }));
    const stroke = { t: rel[0].t, points: rel };
    strokesRef.current.push(stroke);
    setStrokes((s) => [...s, stroke]);
  };

  const stopAndSave = async () => {
    if (phaseRef.current !== "recording") return;
    phaseRef.current = "saving";
    setPhase("saving");
    video.pause();
    try {
      await recorder.stop();
      const log = {
        version: 1,
        createdAt: Date.now(),
        durationMs: now(),
        events: eventsRef.current,
        strokes: strokesRef.current,
      };
      await saveReview(clip.file, recorder.uri, log);
      onClose(true);
    } catch (e) {
      setError(`Kunde inte spara genomgången: ${e?.message ?? e}`);
      phaseRef.current = "idle";
      setPhase("idle");
    }
  };

  const cancel = () => {
    try {
      if (phaseRef.current === "recording") recorder.stop();
    } catch {}
    phaseRef.current = "idle";
    onClose(false);
  };

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={cancel} hitSlop={10}>
          <Text style={s.close}>‹ Avbryt</Text>
        </Pressable>
        <Text style={s.title}>
          {clip.player} · {clip.moment}
        </Text>
        {phase === "recording" ? (
          <View style={s.recPill}>
            <View style={s.recDot} />
            <Text style={s.recTime}>
              {mm}:{ss}
            </Text>
          </View>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <VideoStage player={video} strokes={strokes} drawEnabled={phase === "recording"} onStroke={onStroke} />

      {error && <Text style={s.error}>{error}</Text>}

      {phase === "idle" ? (
        <View style={s.controls}>
          <Text style={s.hint}>
            Prata medan klippet rullar. Pausa när du vill och rita med fingret direkt på bilden –
            allt spelas upp likadant för spelaren.
          </Text>
          <Pressable onPress={start} style={s.bigBtn}>
            <Text style={s.bigBtnText}>● STARTA GENOMGÅNG</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.controls}>
          <View style={s.controlRow}>
            <RoundBtn label={isPlaying ? "❚❚" : "▶"} sub={isPlaying ? "Pausa" : "Spela"} onPress={toggleVideo} />
            <RoundBtn label="↺" sub="Från början" onPress={restart} />
            <RoundBtn label="✕" sub="Sudda" onPress={clearDrawings} />
          </View>
          <Pressable
            onPress={stopAndSave}
            disabled={phase === "saving"}
            style={[s.bigBtn, { backgroundColor: T.green }, phase === "saving" && { opacity: 0.5 }]}
          >
            <Text style={s.bigBtnText}>
              {phase === "saving" ? "SPARAR…" : "■ KLAR – SPARA GENOMGÅNG"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ——— Uppspelning ———————————————————————————————
function PlaySession({ clip, onClose }) {
  const review = useMemo(() => loadReview(clip.file), [clip.file]);
  const video = useVideoPlayer(clip.uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const audio = useAudioPlayer(review ? review.audioUri : null);
  const audioStatus = useAudioPlayerStatus(audio);

  const [phase, setPhase] = useState("ready"); // ready | playing | paused | done
  const [visibleStrokes, setVisibleStrokes] = useState([]);

  const eventIdxRef = useRef(0);
  const clearBeforeRef = useRef(-1);
  const videoShouldPlayRef = useRef(false);
  const tickRef = useRef(null);

  const events = review?.log?.events ?? [];
  const allStrokes = review?.log?.strokes ?? [];

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    return () => stopTick();
  }, []);

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const applyEventsUpTo = (tMs) => {
    while (eventIdxRef.current < events.length && events[eventIdxRef.current].t <= tMs) {
      const ev = events[eventIdxRef.current++];
      if (ev.type === "play") {
        const drift = Math.abs(video.currentTime * 1000 - ev.videoTime);
        if (drift > 400) video.currentTime = ev.videoTime / 1000;
        video.play();
        videoShouldPlayRef.current = true;
      } else if (ev.type === "pause") {
        video.pause();
        video.currentTime = ev.videoTime / 1000;
        videoShouldPlayRef.current = false;
      } else if (ev.type === "seek") {
        video.currentTime = ev.videoTime / 1000;
      } else if (ev.type === "clear") {
        clearBeforeRef.current = ev.t;
      }
    }
  };

  const computeStrokes = (tMs) => {
    const shown = [];
    for (const st of allStrokes) {
      if (st.t <= clearBeforeRef.current || st.t > tMs) continue;
      const pts = st.points.filter((p) => p.t <= tMs);
      if (pts.length >= 2) shown.push({ ...st, points: pts });
    }
    return shown;
  };

  const startTick = () => {
    stopTick();
    tickRef.current = setInterval(() => {
      const tMs = audio.currentTime * 1000;
      applyEventsUpTo(tMs);
      setVisibleStrokes(computeStrokes(tMs));
    }, 100);
  };

  const playFromStart = () => {
    eventIdxRef.current = 0;
    clearBeforeRef.current = -1;
    videoShouldPlayRef.current = false;
    setVisibleStrokes([]);
    video.pause();
    video.currentTime = 0;
    audio.seekTo(0);
    audio.play();
    setPhase("playing");
    startTick();
  };

  const pauseResume = () => {
    if (phase === "playing") {
      audio.pause();
      video.pause();
      stopTick();
      setPhase("paused");
    } else if (phase === "paused") {
      audio.play();
      if (videoShouldPlayRef.current) video.play();
      setPhase("playing");
      startTick();
    }
  };

  useEffect(() => {
    if (audioStatus?.didJustFinish && phase === "playing") {
      stopTick();
      video.pause();
      setPhase("done");
    }
  }, [audioStatus?.didJustFinish]);

  if (!review) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", padding: 30 }]}>
        <Text style={s.error}>Genomgången kunde inte läsas.</Text>
        <Pressable onPress={() => onClose(false)} style={[s.bigBtn, { marginTop: 20 }]}>
          <Text style={s.bigBtnText}>STÄNG</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => onClose(false)} hitSlop={10}>
          <Text style={s.close}>‹ Stäng</Text>
        </Pressable>
        <Text style={s.title}>
          {clip.player} · {clip.moment}
        </Text>
        <View style={{ width: 64 }} />
      </View>

      <VideoStage player={video} strokes={visibleStrokes} drawEnabled={false} />

      <View style={s.controls}>
        {phase === "ready" && (
          <Pressable onPress={playFromStart} style={s.bigBtn}>
            <Text style={s.bigBtnText}>▶ SPELA GENOMGÅNG</Text>
          </Pressable>
        )}
        {(phase === "playing" || phase === "paused") && (
          <View style={s.controlRow}>
            <RoundBtn
              label={phase === "playing" ? "❚❚" : "▶"}
              sub={phase === "playing" ? "Pausa" : "Fortsätt"}
              onPress={pauseResume}
            />
            <RoundBtn label="↺" sub="Från början" onPress={playFromStart} />
          </View>
        )}
        {phase === "done" && (
          <>
            <Text style={s.doneText}>✓ Genomgång klar</Text>
            <Pressable onPress={playFromStart} style={s.bigBtn}>
              <Text style={s.bigBtnText}>↺ SPELA IGEN</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ——— Videoyta med ritlager ————————————————————————
function VideoStage({ player, strokes, drawEnabled, onStroke }) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const drawEnabledRef = useRef(drawEnabled);
  drawEnabledRef.current = drawEnabled;

  // Punkterna stämplas med Date.now(); RecordSession räknar om mot sin t0
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => drawEnabledRef.current,
      onMoveShouldSetPanResponder: () => drawEnabledRef.current,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const { w, h } = sizeRef.current;
        currentRef.current = [{ x: locationX / w, y: locationY / h, ts: Date.now() }];
        setCurrent([...currentRef.current]);
      },
      onPanResponderMove: (evt) => {
        if (!currentRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const { w, h } = sizeRef.current;
        currentRef.current.push({ x: locationX / w, y: locationY / h, ts: Date.now() });
        setCurrent([...currentRef.current]);
      },
      onPanResponderRelease: () => {
        if (currentRef.current) onStrokeEndRef.current(currentRef.current);
        currentRef.current = null;
        setCurrent(null);
      },
      onPanResponderTerminate: () => {
        currentRef.current = null;
        setCurrent(null);
      },
    })
  ).current;

  const onStrokeEndRef = useRef(() => {});
  onStrokeEndRef.current = (rawPoints) => {
    if (onStroke) onStroke(rawPoints.map((p) => ({ x: p.x, y: p.y, t: p.ts })));
  };

  const toSvg = (points) =>
    points.map((p) => `${(p.x * size.w).toFixed(1)},${(p.y * size.h).toFixed(1)}`).join(" ");

  return (
    <View
      style={s.stage}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
        sizeRef.current = { w: width, h: height };
      }}
    >
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        <Svg width="100%" height="100%">
          {strokes.map((st, i) => (
            <Polyline
              key={i}
              points={toSvg(st.points)}
              fill="none"
              stroke={T.rec}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {current && current.length >= 2 && (
            <Polyline
              points={toSvg(current)}
              fill="none"
              stroke={T.rec}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {current && current.length === 1 && (
            <Circle cx={current[0].x * size.w} cy={current[0].y * size.h} r={3} fill={T.rec} />
          )}
        </Svg>
      </View>
    </View>
  );
}

function RoundBtn({ label, sub, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.7 }]}>
      <Text style={s.roundBtnLabel}>{label}</Text>
      <Text style={s.roundBtnSub}>{sub}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  close: { color: T.mut, fontFamily: F.body600, fontSize: 15, width: 64 },
  title: { color: T.line, fontFamily: F.cond700, fontSize: 18, letterSpacing: 0.5 },
  recPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#080E26",
    borderRadius: 99,
    paddingVertical: 4,
    paddingHorizontal: 10,
    width: 64,
    justifyContent: "center",
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.rec },
  recTime: { color: T.rec, fontFamily: F.cond800, fontSize: 14 },
  stage: { flex: 1, marginHorizontal: 12, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  controls: { padding: 16, paddingBottom: 26, alignItems: "center" },
  controlRow: { flexDirection: "row", gap: 18, marginBottom: 14 },
  roundBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: T.courtLite,
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtnLabel: { color: T.line, fontSize: 20, lineHeight: 24 },
  roundBtnSub: { color: T.mut, fontFamily: F.body, fontSize: 10.5, marginTop: 1 },
  bigBtn: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: T.accent,
    alignItems: "center",
  },
  bigBtnText: { color: "#fff", fontFamily: F.cond800, fontSize: 18, letterSpacing: 1.5 },
  hint: { color: T.mut, fontFamily: F.body, fontSize: 13.5, lineHeight: 20, marginBottom: 14, textAlign: "center" },
  error: { color: T.rec, fontFamily: F.body600, fontSize: 13, textAlign: "center", paddingHorizontal: 20, paddingTop: 8 },
  doneText: { color: T.green, fontFamily: F.body600, fontSize: 15, marginBottom: 12 },
});
