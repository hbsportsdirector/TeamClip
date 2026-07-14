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
import { loadReview, saveReview, saveMultiReview, loadMultiReview } from "../lib/review";

// Genomgång: tränaren pratar över ett eller flera klipp i följd, pausar
// fritt och ritar med fingret. Ljudet är den obrutna tidslinjen; video-
// händelser (play/pause/seek/klippbyte/sudda) och ritstreck loggas med
// tidsstämplar relativt ljudstarten och spelas upp synkat igen. Videons
// eget ljud är avstängt hela tiden – tränarrösten är ljudspåret.
//
// payload:
//   { kind: "single", clip }                 – ett klipp (spara per klippbas)
//   { kind: "multiRecord", clips, meta }     – spela in över flera klipp
//   { kind: "multiPlay", name }              – spela upp fleklippsgenomgång
export default function ReviewSessionScreen({ payload, mode, onClose }) {
  useKeepAwake();

  if (mode === "record") {
    const playlist = payload.kind === "single" ? [payload.clip] : payload.clips;
    const title =
      payload.kind === "single"
        ? `${payload.clip.player} · ${payload.clip.moment}`
        : `${payload.meta.player} · ${playlist.length} klipp`;
    const onSave = async (audioUri, log) => {
      if (payload.kind === "single") {
        await saveReview(payload.clip.file, audioUri, log);
      } else {
        await saveMultiReview(
          {
            version: 1,
            kind: "multi",
            player: payload.meta.player,
            playerId: payload.meta.playerId ?? null,
            groupId: payload.meta.groupId,
            group: payload.meta.group,
            createdAt: Date.now(),
            clips: playlist.map((c) => ({ file: c.file, player: c.player, moment: c.moment })),
          },
          audioUri,
          log
        );
      }
    };
    return <RecordSession playlist={playlist} title={title} onSave={onSave} onClose={onClose} />;
  }

  return <PlayWrapper payload={payload} onClose={onClose} />;
}

function PlayWrapper({ payload, onClose }) {
  const data = useMemo(() => {
    if (payload.kind === "single") {
      const review = loadReview(payload.clip.file);
      return review
        ? {
            playlist: [payload.clip],
            review,
            title: `${payload.clip.player} · ${payload.clip.moment}`,
          }
        : null;
    }
    const loaded = loadMultiReview(payload.name);
    return loaded
      ? {
          playlist: loaded.clips,
          review: { audioUri: loaded.audioUri, log: loaded.meta },
          title: `${loaded.meta.player} · ${loaded.clips.length} klipp`,
        }
      : null;
  }, [payload]);

  if (!data) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", padding: 30 }]}>
        <Text style={s.error}>Genomgången kunde inte läsas – klippen kan ha tagits bort.</Text>
        <Pressable onPress={() => onClose(false)} style={[s.bigBtn, { marginTop: 20 }]}>
          <Text style={s.bigBtnText}>STÄNG</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <PlaySession
      playlist={data.playlist}
      review={data.review}
      title={data.title}
      onClose={onClose}
    />
  );
}

const swapSource = (video, uri) =>
  video.replaceAsync ? video.replaceAsync(uri) : Promise.resolve(video.replace(uri));

// ——— Inspelning ————————————————————————————————
function RecordSession({ playlist, title, onSave, onClose }) {
  const video = useVideoPlayer(playlist[0].uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { isPlaying } = useEvent(video, "playingChange", { isPlaying: video.playing });

  const [phase, setPhase] = useState("idle"); // idle | recording | saving
  const [elapsed, setElapsed] = useState(0);
  const [clipIdx, setClipIdx] = useState(0);
  const [strokes, setStrokes] = useState([]);
  const [error, setError] = useState(null);

  const t0Ref = useRef(0);
  const eventsRef = useRef([]);
  const strokesRef = useRef([]);
  const phaseRef = useRef("idle");
  const loggedPlayingRef = useRef(false);
  const clipIdxRef = useRef(0);
  const busyRef = useRef(false);

  const now = () => Date.now() - t0Ref.current;
  const log = (ev) => eventsRef.current.push(ev);
  const isMulti = playlist.length > 1;

  useEffect(() => {
    const t = setInterval(() => {
      if (phaseRef.current === "recording") setElapsed(Math.floor(now() / 1000));
    }, 250);
    return () => clearInterval(t);
  }, []);

  // Fångar övergångar som inte kommer från knapparna – i praktiken att
  // klippet spelats till slut. Manuella handlingar loggar själva och
  // uppdaterar loggedPlayingRef först, så de hoppar över det här.
  useEffect(() => {
    if (phaseRef.current !== "recording") return;
    if (isPlaying === loggedPlayingRef.current) return;
    if (isPlaying) {
      loggedPlayingRef.current = true;
      log({ t: now(), type: "play", videoTime: Math.round(video.currentTime * 1000) });
    } else {
      loggedPlayingRef.current = false;
      log({ t: now(), type: "pause", videoTime: Math.round(video.currentTime * 1000) });
      const ended = video.duration > 0 && video.currentTime >= video.duration - 0.15;
      if (ended && isMulti && clipIdxRef.current < playlist.length - 1) {
        advance(clipIdxRef.current + 1);
      }
    }
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
      loggedPlayingRef.current = true;
      log({ t: 0, type: "play", videoTime: 0 });
      video.play();
    } catch (e) {
      setError(`Kunde inte starta inspelningen: ${e?.message ?? e}`);
    }
  };

  const advance = async (next) => {
    if (busyRef.current || next >= playlist.length) return;
    busyRef.current = true;
    try {
      if (loggedPlayingRef.current) {
        loggedPlayingRef.current = false;
        log({ t: now(), type: "pause", videoTime: Math.round(video.currentTime * 1000) });
        video.pause();
      }
      log({ t: now(), type: "clip", index: next });
      clipIdxRef.current = next;
      setClipIdx(next);
      setStrokes([]); // vid uppspelning suddar klippbytet automatiskt
      await swapSource(video, playlist[next].uri);
      loggedPlayingRef.current = true;
      log({ t: now(), type: "play", videoTime: 0 });
      video.play();
    } catch (e) {
      setError(`Kunde inte byta klipp: ${e?.message ?? e}`);
    } finally {
      busyRef.current = false;
    }
  };

  const toggleVideo = () => {
    if (phaseRef.current !== "recording" || busyRef.current) return;
    if (isPlaying) {
      loggedPlayingRef.current = false;
      log({ t: now(), type: "pause", videoTime: Math.round(video.currentTime * 1000) });
      video.pause();
    } else {
      const ended = video.duration > 0 && video.currentTime >= video.duration - 0.15;
      if (ended && isMulti && clipIdxRef.current < playlist.length - 1) {
        advance(clipIdxRef.current + 1);
        return;
      }
      if (ended) {
        video.currentTime = 0;
        log({ t: now(), type: "seek", videoTime: 0 });
      }
      loggedPlayingRef.current = true;
      log({ t: now(), type: "play", videoTime: Math.round(video.currentTime * 1000) });
      video.play();
    }
  };

  const restart = () => {
    if (phaseRef.current !== "recording" || busyRef.current) return;
    video.currentTime = 0;
    log({ t: now(), type: "seek", videoTime: 0 });
    if (!isPlaying) {
      loggedPlayingRef.current = true;
      log({ t: now(), type: "play", videoTime: 0 });
      video.play();
    }
  };

  const clearDrawings = () => {
    if (phaseRef.current !== "recording") return;
    log({ t: now(), type: "clear" });
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
      await onSave(recorder.uri, {
        durationMs: now(),
        events: eventsRef.current,
        strokes: strokesRef.current,
      });
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
  const hasNext = isMulti && clipIdx < playlist.length - 1;

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={cancel} hitSlop={10}>
          <Text style={s.close}>‹ Avbryt</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={s.title}>{title}</Text>
          {isMulti && (
            <Text style={s.clipIndicator}>
              Klipp {clipIdx + 1}/{playlist.length} · {playlist[clipIdx].moment}
            </Text>
          )}
        </View>
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
            {isMulti
              ? `Prata medan klippen rullar – nästa klipp startar automatiskt när ett tar slut. `
              : `Prata medan klippet rullar. `}
            Pausa när du vill och rita med fingret direkt på bilden – allt spelas upp likadant för
            spelaren.
          </Text>
          <Pressable onPress={start} style={s.bigBtn}>
            <Text style={s.bigBtnText}>● STARTA GENOMGÅNG</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.controls}>
          <View style={s.controlRow}>
            <RoundBtn label={isPlaying ? "❚❚" : "▶"} sub={isPlaying ? "Pausa" : "Spela"} onPress={toggleVideo} />
            <RoundBtn label="↺" sub="Om igen" onPress={restart} />
            {hasNext && <RoundBtn label="»" sub="Nästa klipp" onPress={() => advance(clipIdx + 1)} />}
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
function PlaySession({ playlist, review, title, onClose }) {
  const firstUri = (playlist.find(Boolean) ?? {}).uri;
  const video = useVideoPlayer(firstUri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const audio = useAudioPlayer(review.audioUri);
  const audioStatus = useAudioPlayerStatus(audio);

  const [phase, setPhase] = useState("ready"); // ready | playing | paused | done
  const [clipIdx, setClipIdx] = useState(0);
  const [visibleStrokes, setVisibleStrokes] = useState([]);

  const eventIdxRef = useRef(0);
  const clearBeforeRef = useRef(-1);
  const videoShouldPlayRef = useRef(false);
  const tickRef = useRef(null);

  const events = review.log?.events ?? [];
  const allStrokes = review.log?.strokes ?? [];
  const isMulti = playlist.length > 1;

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
        videoShouldPlayRef.current = true;
        video.play();
      } else if (ev.type === "pause") {
        video.pause();
        video.currentTime = ev.videoTime / 1000;
        videoShouldPlayRef.current = false;
      } else if (ev.type === "seek") {
        video.currentTime = ev.videoTime / 1000;
      } else if (ev.type === "clear") {
        clearBeforeRef.current = ev.t;
      } else if (ev.type === "clip") {
        clearBeforeRef.current = ev.t;
        const target = playlist[ev.index];
        setClipIdx(ev.index);
        if (target) {
          video.pause();
          swapSource(video, target.uri)
            .then(() => {
              if (videoShouldPlayRef.current) video.play();
            })
            .catch(() => {});
        }
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

  const playFromStart = async () => {
    eventIdxRef.current = 0;
    clearBeforeRef.current = -1;
    videoShouldPlayRef.current = false;
    setVisibleStrokes([]);
    setClipIdx(0);
    video.pause();
    try {
      if (playlist[0]) await swapSource(video, playlist[0].uri);
    } catch {}
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

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => onClose(false)} hitSlop={10}>
          <Text style={s.close}>‹ Stäng</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={s.title}>{title}</Text>
          {isMulti && (
            <Text style={s.clipIndicator}>
              Klipp {clipIdx + 1}/{playlist.length} · {playlist[clipIdx]?.moment ?? ""}
            </Text>
          )}
        </View>
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
  clipIndicator: { color: T.mut, fontFamily: F.body, fontSize: 12, marginTop: 1 },
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
  controlRow: { flexDirection: "row", gap: 14, marginBottom: 14 },
  roundBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
