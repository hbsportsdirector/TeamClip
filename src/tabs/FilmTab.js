import { useEffect } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { SectionLabel } from "../components/ui";
import { useAVPermissions } from "../lib/usePermissions";

export default function FilmTab({ group, session, setSession, onStartSpont, onStartQueue }) {
  const mode = session.filmMode ?? "spont";
  const setMode = (m) => setSession((s) => ({ ...s, filmMode: m }));

  return (
    <View style={{ flex: 1 }}>
      <View style={s.segmented}>
        {[
          ["spont", "Spontant"],
          ["queue", "Kö-läge"],
        ].map(([k, l]) => (
          <Pressable key={k} onPress={() => setMode(k)} style={[s.segBtn, mode === k && s.segBtnActive]}>
            <Text style={[s.segText, mode === k && s.segTextActive]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {mode === "spont" ? (
        <SpontPick session={session} setSession={setSession} onStartSpont={onStartSpont} />
      ) : (
        <QueueSetup session={session} setSession={setSession} onStartQueue={onStartQueue} />
      )}
    </View>
  );
}

function usePresent(session) {
  const { registry } = useApp();
  return session.presentIds
    .map((id) => registry.find((r) => r.id === id))
    .filter(Boolean);
}

function SpontPick({ session, setSession, onStartSpont }) {
  const present = usePresent(session);
  const { ensure, denied } = useAVPermissions();

  const start = async (player) => {
    if (await ensure()) onStartSpont(player);
  };

  const startGuest = () => {
    const n = (session.guestCounter ?? 0) + 1;
    setSession((s) => ({ ...s, guestCounter: n }));
    start({ rid: null, name: `Gäst ${n}`, guest: true });
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
      <SectionLabel>Tryck på spelaren – kameran startar direkt</SectionLabel>
      {present.length === 0 && (
        <Text style={s.empty}>
          Ingen är närvarande. Gå till Förbered och bocka i vilka som är på golvet.
        </Text>
      )}
      <View style={s.grid}>
        {present.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => start({ rid: p.id, name: p.name, guest: false })}
            style={s.playerBtn}
          >
            <Text style={s.playerBtnText} numberOfLines={1}>
              {p.name}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={startGuest} style={[s.playerBtn, s.guestBtn]}>
          <Text style={[s.playerBtnText, { color: T.mut }]}>+ Gäst</Text>
        </Pressable>
      </View>
      {denied && (
        <Text style={s.permText}>
          TeamClip behöver tillgång till kamera och mikrofon. Aktivera dem för Expo Go i telefonens
          inställningar och försök igen.
        </Text>
      )}
    </ScrollView>
  );
}

function QueueSetup({ session, setSession, onStartQueue }) {
  const present = usePresent(session);
  const { ensure, denied } = useAVPermissions();

  // Kön byggs om när närvarolistan ändras; egna omflyttningar och gäster
  // behålls så länge samma spelare är på golvet.
  const presentKey = session.presentIds.join(",");
  useEffect(() => {
    if (session.orderKey !== presentKey) {
      setSession((s) => ({
        ...s,
        order: present.map((p) => ({ key: "p" + p.id, rid: p.id, name: p.name, guest: false })),
        orderKey: presentKey,
      }));
    }
  }, [presentKey]);

  const order = session.orderKey === presentKey && session.order ? session.order : [];

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    setSession((s) => ({ ...s, order: n }));
  };

  const removeFromQueue = (key) =>
    setSession((s) => ({ ...s, order: s.order.filter((x) => x.key !== key) }));

  const addGuest = () => {
    const n = (session.guestCounter ?? 0) + 1;
    setSession((s) => ({
      ...s,
      guestCounter: n,
      order: [...s.order, { key: "g" + n, rid: null, name: `Gäst ${n}`, guest: true }],
    }));
  };

  const start = async () => {
    if (order.length === 0) return;
    if (await ensure()) onStartQueue();
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
      <SectionLabel>Skjutordning – kameran klipper åt dig</SectionLabel>
      {order.length === 0 && (
        <Text style={s.empty}>
          Ingen i kön. Gå till Förbered och bocka i vilka som är på golvet.
        </Text>
      )}
      {order.map((item, i) => (
        <View key={item.key} style={[s.row, item.guest && s.rowGuest]}>
          <Text style={s.rowNum}>{i + 1}</Text>
          <Text style={[s.rowName, item.guest && { color: T.mut }]} numberOfLines={1}>
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
          {item.guest && (
            <Pressable onPress={() => removeFromQueue(item.key)} hitSlop={8} style={s.rowBtn}>
              <Text style={[s.rowBtnText, { color: T.rec }]}>×</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Pressable onPress={addGuest} style={s.addGuestBtn}>
        <Text style={s.addGuestText}>+ Lägg till gäst i kön</Text>
      </Pressable>

      <Pressable onPress={start} style={[s.startBtn, order.length === 0 && { opacity: 0.4 }]}>
        <Text style={s.startBtnText}>SPELA IN KÖN · {session.moment.toUpperCase()}</Text>
      </Pressable>

      {denied && (
        <Text style={s.permText}>
          TeamClip behöver tillgång till kamera och mikrofon. Aktivera dem för Expo Go i telefonens
          inställningar och försök igen.
        </Text>
      )}
      <Text style={s.info}>
        Gästens klipp kopplas inte till någon spelare – de hamnar i gruppens gästhög. Börjar gästen
        i klubben kan du flytta klippen till hens mapp under Granska.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  segmented: {
    flexDirection: "row",
    backgroundColor: "#080E26",
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segBtnActive: { backgroundColor: T.courtLite },
  segText: { color: T.dim, fontFamily: F.cond700, fontSize: 17, letterSpacing: 1 },
  segTextActive: { color: T.line },
  empty: { color: T.dim, fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  playerBtn: {
    width: "48%",
    paddingVertical: 26,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: T.courtLite,
    borderWidth: 1,
    borderColor: "#2C3C7E",
    alignItems: "center",
  },
  guestBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: T.dim,
    borderStyle: "dashed",
  },
  playerBtnText: { color: T.line, fontFamily: F.cond800, fontSize: 22, letterSpacing: 1 },
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
  addGuestBtn: {
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.dim,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addGuestText: { color: T.mut, fontFamily: F.cond700, fontSize: 16, letterSpacing: 1 },
  startBtn: {
    marginTop: 14,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: T.accent,
    alignItems: "center",
  },
  startBtnText: { color: "#fff", fontFamily: F.cond800, fontSize: 19, letterSpacing: 1.5 },
  permText: { color: T.rec, fontFamily: F.body, fontSize: 13, marginTop: 12, lineHeight: 19 },
  info: { color: T.dim, fontFamily: F.body, fontSize: 13, marginTop: 10, lineHeight: 19 },
});
