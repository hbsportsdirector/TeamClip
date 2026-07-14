import { View, Text, Pressable, StyleSheet } from "react-native";
import { T, F } from "../theme";
import PrepTab from "../tabs/PrepTab";
import FilmTab from "../tabs/FilmTab";
import ReviewTab from "../tabs/ReviewTab";
import FavoritesTab from "../tabs/FavoritesTab";

const TITLES = {
  prep: "Förbered passet",
  film: "Filma",
  review: "Granska",
  favorites: "Favoriter & arkiv",
};

export default function GroupScreen({
  group,
  session,
  setSession,
  onBack,
  onStartSpont,
  onStartQueue,
  onOpenReview,
  clipCount,
}) {
  const tab = session.tab;
  const setTab = (t) => setSession((s) => ({ ...s, tab: t }));

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={s.back}>‹ Grupper</Text>
        </Pressable>
        <Text style={s.kicker}>{group.name}</Text>
        <Text style={s.title}>{TITLES[tab]}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "prep" && (
          <PrepTab group={group} session={session} setSession={setSession} onDone={() => setTab("film")} />
        )}
        {tab === "film" && (
          <FilmTab
            group={group}
            session={session}
            setSession={setSession}
            onStartSpont={onStartSpont}
            onStartQueue={onStartQueue}
          />
        )}
        {tab === "review" && (
          <ReviewTab group={group} session={session} onOpenReview={onOpenReview} />
        )}
        {tab === "favorites" && <FavoritesTab group={group} onOpenReview={onOpenReview} />}
      </View>

      <View style={s.nav}>
        {[
          ["prep", "Förbered"],
          ["film", "Filma"],
          ["review", "Granska"],
          ["favorites", "⭐"],
        ].map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[s.navBtn, tab === key && s.navBtnActive]}>
            <Text style={[s.navText, tab === key && s.navTextActive]}>{label}</Text>
            {key === "review" && clipCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{clipCount}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  back: { color: T.mut, fontFamily: F.body600, fontSize: 14, paddingVertical: 2 },
  kicker: {
    color: T.accent,
    fontFamily: F.cond800,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 6,
  },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 32, marginTop: 2 },
  nav: {
    flexDirection: "row",
    backgroundColor: "#080E26",
    borderTopWidth: 1,
    borderTopColor: T.courtLite,
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: 3,
    borderTopColor: "transparent",
  },
  navBtnActive: { borderTopColor: T.accent },
  navText: {
    color: T.dim,
    fontFamily: F.cond700,
    fontSize: 14.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  navTextActive: { color: T.accent },
  badge: {
    backgroundColor: T.accent,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  badgeText: { color: "#fff", fontFamily: F.body600, fontSize: 12 },
});
