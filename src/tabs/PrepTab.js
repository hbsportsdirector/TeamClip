import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { SectionLabel, Chip } from "../components/ui";

export const MOMENTS = ["Kantskott", "Straffkast", "Genombrott", "Nio meter", "Målvakt"];

export default function PrepTab({ group, session, setSession, onDone }) {
  const { registry } = useApp();
  const members = group.memberIds
    .map((id) => registry.find((r) => r.id === id))
    .filter(Boolean);

  const present = new Set(session.presentIds);
  const toggle = (id) =>
    setSession((s) => ({
      ...s,
      presentIds: s.presentIds.includes(id)
        ? s.presentIds.filter((x) => x !== id)
        : [...s.presentIds, id],
    }));

  const n = session.presentIds.length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
    >
      <SectionLabel>Vilka är på golvet idag?</SectionLabel>
      {members.length === 0 && (
        <Text style={s.empty}>
          Truppen är tom. Gå tillbaka till Grupper och tryck "Redigera trupp" för att lägga till
          spelare.
        </Text>
      )}
      <View style={s.grid}>
        {members.map((p) => {
          const isOn = present.has(p.id);
          return (
            <Pressable key={p.id} onPress={() => toggle(p.id)} style={[s.cell, isOn && s.cellOn]}>
              <View style={[s.check, isOn && s.checkOn]}>
                {isOn && <Text style={s.checkMark}>✓</Text>}
              </View>
              <Text style={[s.cellText, !isOn && { color: T.dim }]} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel style={{ marginTop: 26 }}>Dagens moment</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {MOMENTS.map((m) => (
          <Chip
            key={m}
            label={m}
            active={session.moment === m}
            onPress={() => setSession((sess) => ({ ...sess, moment: m }))}
          />
        ))}
      </View>

      <Pressable onPress={onDone} style={[s.startBtn, n === 0 && { opacity: 0.4 }]} disabled={n === 0}>
        <Text style={s.startBtnText}>STARTA PASSET · {n} SPELARE</Text>
      </Pressable>
      <Text style={s.info}>
        Under passet ser du bara de {n} spelare du bockat i – aldrig hela truppen. Gäster lägger du
        till direkt i Filma-vyn.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  empty: { color: T.dim, fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.courtLite,
  },
  cellOn: { backgroundColor: T.courtLite, borderColor: T.accent },
  check: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: T.dim,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: T.accent, borderColor: T.accent },
  checkMark: { color: "#fff", fontSize: 11, lineHeight: 13 },
  cellText: { flex: 1, color: T.line, fontFamily: F.body600, fontSize: 15 },
  startBtn: {
    marginTop: 30,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: T.accent,
    alignItems: "center",
  },
  startBtnText: { color: "#fff", fontFamily: F.cond800, fontSize: 19, letterSpacing: 1.5 },
  info: { color: T.dim, fontFamily: F.body, fontSize: 13, marginTop: 10, lineHeight: 19 },
});
