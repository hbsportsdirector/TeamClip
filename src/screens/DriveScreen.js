import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { isGoogleConfigured } from "../config";
import * as googleAuth from "../lib/googleAuth";
import * as uploadQueue from "../lib/uploadQueue";

export default function DriveScreen({ onBack }) {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);

  const moduleMissing = googleAuth.isModuleMissing();
  const configured = isGoogleConfigured();

  useEffect(() => {
    googleAuth.getCurrentUser().then(setUser);
    return uploadQueue.subscribe(() => setTick((t) => t + 1));
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const u = await googleAuth.signIn();
      setUser(u);
      uploadQueue.kick();
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await googleAuth.signOut();
    setUser(null);
  };

  const stats = uploadQueue.getStats();
  const pending = uploadQueue.pendingCount();

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={s.back}>‹ Tillbaka</Text>
        </Pressable>
        <Text style={s.title}>Google Drive</Text>
        <Text style={s.subtitle}>
          Klipp och genomgångsljud laddas upp till din Drive och delas per spelare – ingen egen
          server, inget centralt register.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {moduleMissing ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Kräver TeamClip-appen</Text>
            <Text style={s.cardText}>
              Google-inloggning fungerar inte i Expo Go. Installera TeamClip-appen
              (development-bygget) på telefonen så aktiveras Drive-uppladdningen här.
            </Text>
          </View>
        ) : !configured ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Inte konfigurerad än</Text>
            <Text style={s.cardText}>
              Google Cloud-klienten saknas (src/config.js). Slutför OAuth-setupen så aktiveras
              knappen nedan.
            </Text>
          </View>
        ) : user ? (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>✓ Kopplad</Text>
              <Text style={s.cardText}>
                {user.name ? `${user.name} · ` : ""}
                {user.email}
              </Text>
              <Pressable onPress={disconnect} style={s.ghostBtn}>
                <Text style={s.ghostBtnText}>Koppla från</Text>
              </Pressable>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Uppladdningar</Text>
              <Text style={s.cardText}>
                {stats.done} klara{pending > 0 ? ` · ${pending} väntar` : ""}
                {stats.error > 0 ? ` · ${stats.error} fel` : ""}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => uploadQueue.kick()} style={s.primaryBtnSmall}>
                  <Text style={s.primaryBtnSmallText}>Ladda upp nu</Text>
                </Pressable>
                {stats.error > 0 && (
                  <Pressable onPress={() => uploadQueue.retryErrors()} style={s.ghostBtn}>
                    <Text style={s.ghostBtnText}>Försök igen med fel</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={s.note}>
              Mappstruktur: TeamClip/Spelare/&lt;Namn&gt; – varje spelares mapp delas en gång med
              e-posten i registret (läsrättighet). Gästklipp hamnar i gruppens gästmapp och delas
              inte.
            </Text>
          </>
        ) : (
          <>
            <Pressable onPress={connect} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.5 }]}>
              <Text style={s.primaryBtnText}>{busy ? "KOPPLAR…" : "KOPPLA GOOGLE DRIVE"}</Text>
            </Pressable>
            <Text style={s.note}>
              Du loggar in med ditt Google-konto. TeamClip får bara röra filer appen själv skapat
              (scope drive.file) – aldrig resten av din Drive.
            </Text>
          </>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16 },
  back: { color: T.mut, fontFamily: F.body600, fontSize: 15 },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 34, marginTop: 8 },
  subtitle: { color: T.dim, fontFamily: F.body, fontSize: 13, marginTop: 4, lineHeight: 19 },
  card: { backgroundColor: T.courtLite, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { color: T.line, fontFamily: F.cond700, fontSize: 20, marginBottom: 4 },
  cardText: { color: T.mut, fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: F.cond800, fontSize: 19, letterSpacing: 1.5 },
  primaryBtnSmall: {
    backgroundColor: T.accent,
    borderRadius: 99,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  primaryBtnSmallText: { color: "#fff", fontFamily: F.body600, fontSize: 13 },
  ghostBtn: {
    borderWidth: 1.5,
    borderColor: T.dim,
    borderRadius: 99,
    paddingVertical: 7,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    marginTop: 10,
  },
  ghostBtnText: { color: T.mut, fontFamily: F.body600, fontSize: 13 },
  note: { color: T.dim, fontFamily: F.body, fontSize: 13, lineHeight: 19, marginTop: 6 },
  error: { color: T.rec, fontFamily: F.body600, fontSize: 13, marginTop: 14, lineHeight: 19 },
});
