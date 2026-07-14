import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { T, F } from "../theme";

const MOMENTS = ["Kantskott", "Straffkast", "Genombrott", "Nio meter", "Målvakt"];

export default function QueueSetupScreen({
  order,
  setOrder,
  moment,
  setMoment,
  onStart,
  onShowClips,
  clipCount,
}) {
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [newName, setNewName] = useState("");
  const [guestCounter, setGuestCounter] = useState(0);
  const [permDenied, setPermDenied] = useState(false);

  const move = (i, dir) => {
    setOrder((o) => {
      const n = [...o];
      const j = i + dir;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };

  const remove = (key) => setOrder((o) => o.filter((x) => x.key !== key));

  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    setOrder((o) => [...o, { key: "p" + Date.now(), name, guest: false }]);
    setNewName("");
  };

  const addGuest = () => {
    const n = guestCounter + 1;
    setGuestCounter(n);
    setOrder((o) => [...o, { key: "g" + Date.now(), name: `Gäst ${n}`, guest: true }]);
  };

  const start = async () => {
    if (order.length === 0) return;
    let cam = camPerm;
    let mic = micPerm;
    if (!cam?.granted) cam = await requestCamPerm();
    if (!mic?.granted) mic = await requestMicPerm();
    if (cam?.granted && mic?.granted) {
      setPermDenied(false);
      onStart();
    } else {
      setPermDenied(true);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.kicker}>TeamClip</Text>
        <Text style={s.title}>Kö-läge</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionLabel}>Skjutordning – kameran klipper åt dig</Text>

        {order.map((item, i) => (
          <View key={item.key} style={[s.row, item.guest && s.rowGuest]}>
            <Text style={s.rowNum}>{i + 1}</Text>
            <Text style={[s.rowName, item.guest && { color: T.mut }]}>
              {item.name}
              {item.guest && <Text style={s.rowGuestNote}>  utanför truppen</Text>}
            </Text>
            <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={8} style={s.rowBtn}>
              <Text style={[s.rowBtnText, i === 0 && { color: T.dim }]}>↑</Text>
            </Pressable>
            <Pressable
              onPress={() => move(i, 1)}
              disabled={i === order.length - 1}
              hitSlop={8}
              style={s.rowBtn}
            >
              <Text style={[s.rowBtnText, i === order.length - 1 && { color: T.dim }]}>↓</Text>
            </Pressable>
            <Pressable onPress={() => remove(item.key)} hitSlop={8} style={s.rowBtn}>
              <Text style={[s.rowBtnText, { color: T.rec }]}>×</Text>
            </Pressable>
          </View>
        ))}

        <View style={s.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={addPlayer}
            placeholder="Lägg till spelare, t.ex. Olle B"
            placeholderTextColor={T.dim}
            style={s.input}
          />
          <Pressable onPress={addPlayer} style={s.addBtn}>
            <Text style={s.addBtnText}>+</Text>
          </Pressable>
        </View>

        <Pressable onPress={addGuest} style={s.guestBtn}>
          <Text style={s.guestBtnText}>+ Lägg till gäst i kön</Text>
        </Pressable>

        <Text style={[s.sectionLabel, { marginTop: 26 }]}>Dagens moment</Text>
        <View style={s.chips}>
          {MOMENTS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMoment(m)}
              style={[s.chip, moment === m && s.chipActive]}
            >
              <Text style={[s.chipText, moment === m && s.chipTextActive]}>{m}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={start}
          style={[s.startBtn, order.length === 0 && { opacity: 0.4 }]}
        >
          <Text style={s.startBtnText}>SPELA IN KÖN · {moment.toUpperCase()}</Text>
        </Pressable>

        {permDenied && (
          <Text style={s.permText}>
            TeamClip behöver tillgång till kamera och mikrofon. Aktivera dem för Expo Go i
            telefonens inställningar och försök igen.
          </Text>
        )}

        <Pressable onPress={onShowClips} style={s.clipsLink}>
          <Text style={s.clipsLinkText}>
            Sparade klipp{clipCount > 0 ? ` (${clipCount})` : ""} ›
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  kicker: {
    color: T.accent,
    fontFamily: F.cond800,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 34, marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionLabel: {
    color: T.mut,
    fontFamily: F.cond700,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.courtLite,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowGuest: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: T.dim,
    borderStyle: "dashed",
  },
  rowNum: { color: T.accent, fontFamily: F.cond800, fontSize: 18, width: 24 },
  rowName: { flex: 1, color: T.line, fontFamily: F.body600, fontSize: 16 },
  rowGuestNote: { color: T.dim, fontFamily: F.body, fontSize: 11.5 },
  rowBtn: { padding: 4 },
  rowBtnText: { color: T.line, fontSize: 18 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  input: {
    flex: 1,
    backgroundColor: "#080E26",
    borderWidth: 1.5,
    borderColor: T.courtLite,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: T.line,
    fontFamily: F.body,
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: T.courtLite,
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  addBtnText: { color: T.accent, fontFamily: F.cond800, fontSize: 22 },
  guestBtn: {
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.dim,
    borderStyle: "dashed",
    alignItems: "center",
  },
  guestBtnText: {
    color: T.mut,
    fontFamily: F.cond700,
    fontSize: 16,
    letterSpacing: 1,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: T.courtLite,
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.mut, fontFamily: F.cond700, fontSize: 16, letterSpacing: 0.8 },
  chipTextActive: { color: "#fff" },
  startBtn: {
    marginTop: 30,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: T.accent,
    alignItems: "center",
  },
  startBtnText: {
    color: "#fff",
    fontFamily: F.cond800,
    fontSize: 19,
    letterSpacing: 1.5,
  },
  permText: { color: T.rec, fontFamily: F.body, fontSize: 13, marginTop: 12, lineHeight: 19 },
  clipsLink: { marginTop: 22, alignItems: "center", padding: 8 },
  clipsLinkText: { color: T.mut, fontFamily: F.body600, fontSize: 15 },
});
