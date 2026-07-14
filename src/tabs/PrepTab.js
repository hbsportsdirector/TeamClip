import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { SectionLabel, Chip, u } from "../components/ui";
import { SPORTS, momentsOf } from "../data/sports";

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
      <MomentPicker group={group} session={session} setSession={setSession} />

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

function MomentPicker({ group, session, setSession }) {
  const { setGroupMoments } = useApp();
  const [editing, setEditing] = useState(false);
  const [newMoment, setNewMoment] = useState("");
  const moments = momentsOf(group);

  const pick = (m) => setSession((sess) => ({ ...sess, moment: m }));

  const save = (list) => {
    setGroupMoments(group.id, list);
    if (!list.includes(session.moment)) pick(list[0]);
  };

  const add = () => {
    const m = newMoment.trim();
    if (!m || moments.includes(m)) return;
    save([...moments, m]);
    setNewMoment("");
  };

  const remove = (m) => {
    if (moments.length <= 1) return;
    save(moments.filter((x) => x !== m));
  };

  const applyPreset = (sport) => save([...sport.moments]);

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {moments.map((m) =>
          editing ? (
            <Pressable key={m} onPress={() => remove(m)} style={ms.editChip}>
              <Text style={ms.editChipText}>{m}</Text>
              <Text style={[ms.editChipX, moments.length <= 1 && { color: T.dim }]}>×</Text>
            </Pressable>
          ) : (
            <Chip key={m} label={m} active={session.moment === m} onPress={() => pick(m)} />
          )
        )}
        <Chip
          label={editing ? "✓ Klar" : "✎ Redigera"}
          dashed={!editing}
          onPress={() => {
            setEditing(!editing);
            setNewMoment("");
          }}
        />
      </View>

      {editing && (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={newMoment}
              onChangeText={setNewMoment}
              onSubmitEditing={add}
              placeholder="Eget moment, t.ex. Kontring"
              placeholderTextColor={T.dim}
              style={u.input}
            />
            <Pressable onPress={add} style={u.addBtn}>
              <Text style={u.addBtnText}>+</Text>
            </Pressable>
          </View>

          <Text style={ms.presetLabel}>Förslag per idrott – ersätter listan:</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {SPORTS.map((sport) => (
              <Pressable key={sport.name} onPress={() => applyPreset(sport)} style={ms.presetChip}>
                <Text style={ms.presetChipText}>{sport.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={ms.hint}>
            Tryck på ett moment ovan för att ta bort det. Momentnamnet hamnar i klippets filnamn.
          </Text>
        </View>
      )}
    </View>
  );
}

const ms = StyleSheet.create({
  editChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
    paddingLeft: 15,
    paddingRight: 11,
    borderRadius: 99,
    backgroundColor: T.courtLite,
  },
  editChipText: { color: T.line, fontFamily: F.cond700, fontSize: 15, letterSpacing: 0.8 },
  editChipX: { color: T.rec, fontSize: 15, lineHeight: 17 },
  presetLabel: { color: T.dim, fontFamily: F.body, fontSize: 12.5, marginTop: 14, marginBottom: 8 },
  presetChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 99,
    backgroundColor: "#080E26",
    borderWidth: 1.5,
    borderColor: T.courtLite,
  },
  presetChipText: { color: T.mut, fontFamily: F.body600, fontSize: 13 },
  hint: { color: T.dim, fontFamily: F.body, fontSize: 12.5, marginTop: 12, lineHeight: 18 },
});

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
