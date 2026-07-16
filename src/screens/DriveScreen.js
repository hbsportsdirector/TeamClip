import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { isGoogleConfigured } from "../config";
import * as googleAuth from "../lib/googleAuth";
import * as uploadQueue from "../lib/uploadQueue";
import * as backup from "../lib/backup";
import { localStorageBytes, runCleanup } from "../lib/cleanup";
import ConfirmDialog from "../components/ConfirmDialog";

export default function DriveScreen({ onBack }) {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [restoreInfo, setRestoreInfo] = useState(null);
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

  const confirmRestore = () => {
    setDialog({
      title: "Återställ från säkerhetskopian?",
      message:
        "Registret, grupperna och appens historik ersätts med senaste säkerhetskopian från din Drive. Videofilerna i Drive påverkas inte.",
      confirmLabel: "Återställ",
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          const info = await backup.restoreBackup();
          if (!info) {
            setError("Ingen säkerhetskopia hittades i din Drive.");
          } else {
            setRestoreInfo(info);
          }
        } catch (e) {
          setError(String(e?.message ?? e));
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const reloadApp = async () => {
    try {
      const Updates = require("expo-updates");
      await Updates.reloadAsync();
    } catch {
      setError("Stäng appen helt och öppna den igen så laddas den återställda datan.");
    }
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
              <Pressable
                onPress={disconnect}
                style={({ pressed }) => [s.actionBtnGhost, { marginTop: 14 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.actionBtnGhostText}>Koppla från</Text>
              </Pressable>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Uppladdningar</Text>
              {pending === 0 && stats.error === 0 ? (
                <Text style={[s.cardText, { color: T.green }]}>
                  ✓ Allt uppladdat · {stats.done} {stats.done === 1 ? "fil" : "filer"} i Drive
                </Text>
              ) : (
                <>
                  <Text style={s.cardText}>
                    {stats.uploading > 0
                      ? `↑ Laddar upp… · ${pending} kvar`
                      : `${pending} ${pending === 1 ? "fil" : "filer"} väntar`}
                    {stats.error > 0 ? ` · ${stats.error} misslyckade` : ""}
                  </Text>
                  <View style={{ gap: 10, marginTop: 14 }}>
                    {stats.uploading === 0 && pending > 0 && (
                      <Pressable
                        onPress={() => uploadQueue.kick()}
                        style={({ pressed }) => [s.actionBtn, pressed && s.actionBtnPressed]}
                      >
                        <Text style={s.actionBtnText}>Ladda upp nu</Text>
                      </Pressable>
                    )}
                    {stats.error > 0 && (
                      <Pressable
                        onPress={() => uploadQueue.retryErrors()}
                        style={({ pressed }) => [s.actionBtnGhost, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={s.actionBtnGhostText}>Försök igen med misslyckade</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
              <Text style={s.cardHint}>
                Uppladdningen sköter sig själv – klipp köas direkt när de sparas och görs om
                automatiskt om täckningen sviker.
              </Text>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Säkerhetskopia & lagring</Text>
              {restoreInfo ? (
                <>
                  <Text style={[s.cardText, { color: T.green }]}>
                    ✓ Återställd: {restoreInfo.groups} grupper, {restoreInfo.players} spelare (kopia
                    från{" "}
                    {new Date(restoreInfo.createdAt).toLocaleString("sv-SE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    )
                  </Text>
                  <Pressable onPress={reloadApp} style={[s.actionBtn, { marginTop: 14 }]}>
                    <Text style={s.actionBtnText}>Ladda om appen</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={s.cardText}>
                    {backup.lastBackupAt()
                      ? `Metadatan säkerhetskopieras automatiskt – senast ${new Date(
                          backup.lastBackupAt()
                        ).toLocaleString("sv-SE", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}.`
                      : "Metadatan säkerhetskopieras automatiskt efter första uppladdningen."}
                  </Text>
                  <Text style={[s.cardText, { marginTop: 6 }]}>
                    Lokalt videoutrymme: {(localStorageBytes() / 1024 / 1024).toFixed(0)} MB.
                    Levererat material äldre än 30 dagar rensas automatiskt (favoriter undantagna).
                  </Text>
                  <Pressable
                    onPress={confirmRestore}
                    disabled={busy}
                    style={({ pressed }) => [
                      s.actionBtnGhost,
                      { marginTop: 14 },
                      (pressed || busy) && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={s.actionBtnGhostText}>
                      {busy ? "Arbetar…" : "Återställ från säkerhetskopia"}
                    </Text>
                  </Pressable>
                </>
              )}
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
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
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
  cardHint: { color: T.dim, fontFamily: F.body, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  primaryBtn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: F.cond800, fontSize: 19, letterSpacing: 1.5 },
  actionBtn: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  actionBtnPressed: { backgroundColor: T.accentDeep },
  actionBtnText: { color: "#fff", fontFamily: F.cond700, fontSize: 17, letterSpacing: 0.8 },
  actionBtnGhost: {
    borderWidth: 1.5,
    borderColor: T.courtLite,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionBtnGhostText: { color: T.mut, fontFamily: F.body600, fontSize: 14.5 },
  note: { color: T.dim, fontFamily: F.body, fontSize: 13, lineHeight: 19, marginTop: 6 },
  error: { color: T.rec, fontFamily: F.body600, fontSize: 13, marginTop: 14, lineHeight: 19 },
});
