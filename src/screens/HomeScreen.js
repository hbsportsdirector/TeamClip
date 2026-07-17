import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { T, F } from "../theme";
import { useApp } from "../state/AppContext";
import { SectionLabel, Chip, u } from "../components/ui";
import OnboardingCard from "../components/OnboardingCard";
import * as db from "../lib/db";
import { listClips } from "../lib/clips";
import * as googleAuth from "../lib/googleAuth";

export default function HomeScreen({ openGroup, openDrive }) {
  const [view, setView] = useState("groups");
  const { groups } = useApp();
  const [driveConnected, setDriveConnected] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => !!db.getDb().prefs?.onboardingDismissed
  );

  useEffect(() => {
    googleAuth.getCurrentUser().then((u2) => setDriveConnected(!!u2));
  }, []);

  const clipCount = safeClipCount();
  const steps = [
    {
      title: "Skapa din första grupp",
      hint: "Skriv ett namn nedan – t.ex. F14 eller Herrlag – och tryck +.",
      done: groups.length > 0,
    },
    {
      title: "Bygg truppen",
      hint: "Tryck \"Redigera trupp\" på gruppkortet och lägg till spelarna.",
      done: groups.some((g) => g.memberIds.length > 0),
    },
    {
      title: "Filma första klippet",
      hint: "Öppna gruppen → Filma. Prova kö-läget – det är appens signatur!",
      done: clipCount > 0,
    },
    {
      title: "Koppla Google Drive",
      hint: "Så laddas klippen upp och delas med spelarna automatiskt.",
      done: driveConnected === true,
      onPress: openDrive,
    },
  ];
  // visas tills allt är klart eller tränaren döljer det. Medan Drive-
  // kontrollen pågår (null) visas inget för annars färdiga användare –
  // undviker att kortet blinkar förbi för veteraner vid varje start.
  const firstThreeDone = steps.slice(0, 3).every((st) => st.done);
  const showOnboarding =
    !dismissed &&
    view === "groups" &&
    !steps.every((st) => st.done) &&
    !(driveConnected === null && firstThreeDone);

  const dismiss = () => {
    db.update((d) => {
      d.prefs = { ...(d.prefs ?? {}), onboardingDismissed: true };
    });
    setDismissed(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.kicker}>TeamClip</Text>
          <Pressable onPress={openDrive} hitSlop={10}>
            <Text style={s.driveLink}>Drive ⚙</Text>
          </Pressable>
        </View>
        <Text style={s.title}>{view === "groups" ? "Dina grupper" : "Spelarregister"}</Text>
        <View style={s.segmented}>
          {[
            ["groups", "Grupper"],
            ["players", "Spelare"],
          ].map(([k, l]) => (
            <Pressable
              key={k}
              onPress={() => setView(k)}
              style={[s.segBtn, view === k && s.segBtnActive]}
            >
              <Text style={[s.segText, view === k && s.segTextActive]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {showOnboarding && <OnboardingCard steps={steps} onDismiss={dismiss} />}
        {view === "groups" ? <GroupsView openGroup={openGroup} /> : <PlayersView />}
      </ScrollView>
    </View>
  );
}

function safeClipCount() {
  try {
    return listClips(undefined, { includeArchived: true }).length;
  } catch {
    return 0;
  }
}

function GroupsView({ openGroup }) {
  const { groups, addGroup } = useApp();
  const [editing, setEditing] = useState(null);
  const [newGroup, setNewGroup] = useState("");

  const create = () => {
    const name = newGroup.trim();
    if (!name) return;
    const g = addGroup(name);
    setNewGroup("");
    setEditing(g.id);
  };

  return (
    <>
      {groups.length === 0 && (
        <Text style={s.empty}>
          Inga grupper än. Skapa din första nedan – t.ex. "Gymnasiet" eller "Flickor 08".
        </Text>
      )}
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          isEditing={editing === g.id}
          onOpen={() => openGroup(g)}
          onToggleEdit={() => setEditing(editing === g.id ? null : g.id)}
        />
      ))}
      <View style={s.addRow}>
        <TextInput
          value={newGroup}
          onChangeText={setNewGroup}
          onSubmitEditing={create}
          placeholder="Ny grupp, t.ex. Flickor 08"
          placeholderTextColor={T.dim}
          style={u.input}
        />
        <Pressable onPress={create} style={u.addBtn}>
          <Text style={u.addBtnText}>+</Text>
        </Pressable>
      </View>
      <Text style={u.infoText}>
        En spelare kan vara med i flera grupper. Alla spelarens klipp hamnar ändå i samma
        Drive-mapp – en per spelare.
      </Text>
    </>
  );
}

function GroupCard({ group, isEditing, onOpen, onToggleEdit }) {
  const { registry, groups, setGroupMembers, addPlayer } = useApp();
  const [query, setQuery] = useState("");

  const members = group.memberIds
    .map((id) => registry.find((r) => r.id === id))
    .filter(Boolean);

  const q = query.trim().toLowerCase();
  const suggestions = q
    ? registry
        .filter((r) => !group.memberIds.includes(r.id) && r.name.toLowerCase().includes(q))
        .slice(0, 5)
    : [];
  const exactExists = registry.some((r) => r.name.toLowerCase() === q);

  const addMember = (rid) => {
    setGroupMembers(group.id, [...group.memberIds, rid]);
    setQuery("");
  };
  const removeMember = (rid) =>
    setGroupMembers(group.id, group.memberIds.filter((id) => id !== rid));
  const createAndAdd = () => {
    const p = addPlayer(query.trim());
    addMember(p.id);
  };

  const otherGroupsOf = (rid) =>
    groups
      .filter((g) => g.id !== group.id && g.memberIds.includes(rid))
      .map((g) => g.name);

  return (
    <View style={s.card}>
      <Pressable onPress={onOpen} style={s.cardHead}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{group.name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{group.name}</Text>
          <Text style={s.cardSub}>{members.length} spelare i truppen</Text>
        </View>
        <Text style={s.openText}>ÖPPNA ›</Text>
      </Pressable>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Pressable onPress={onToggleEdit} hitSlop={6}>
          <Text style={s.editToggle}>{isEditing ? "▾ Klar med truppen" : "▸ Redigera trupp"}</Text>
        </Pressable>

        {isEditing && (
          <View style={{ marginTop: 8 }}>
            <View style={s.chipsWrap}>
              {members.map((m) => (
                <View key={m.id} style={s.memberChip}>
                  <Text style={s.memberChipText}>{m.name}</Text>
                  {otherGroupsOf(m.id).length > 0 && (
                    <Text style={s.memberChipNote}>även {otherGroupsOf(m.id).join(", ")}</Text>
                  )}
                  <Pressable onPress={() => removeMember(m.id)} hitSlop={8} style={s.removeBtn}>
                    <Text style={s.removeBtnText}>×</Text>
                  </Pressable>
                </View>
              ))}
              {members.length === 0 && (
                <Text style={{ color: T.dim, fontFamily: F.body, fontSize: 13 }}>
                  Truppen är tom – sök i registret nedan.
                </Text>
              )}
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Sök i spelarregistret…"
              placeholderTextColor={T.dim}
              style={[u.input, { flex: 0, marginTop: 10 }]}
            />

            {q !== "" && (
              <View style={{ marginTop: 6 }}>
                {suggestions.map((sug) => (
                  <Pressable key={sug.id} onPress={() => addMember(sug.id)} style={s.suggestion}>
                    <Text style={{ color: T.green, fontFamily: F.body600 }}>+</Text>
                    <Text style={s.suggestionName}>{sug.name}</Text>
                    <Text style={s.suggestionNote}>
                      {otherGroupsOf(sug.id).length > 0
                        ? `finns i ${otherGroupsOf(sug.id).join(", ")}`
                        : "i registret"}
                    </Text>
                  </Pressable>
                ))}
                {!exactExists && (
                  <Pressable onPress={createAndAdd} style={s.createNew}>
                    <Text style={{ color: T.accent, fontFamily: F.body600 }}>
                      + Skapa ny spelare "{query.trim()}"
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function PlayersView() {
  const { registry, groups, addPlayer, setPlayerEmail, toggleMembership } = useApp();
  const [newPerson, setNewPerson] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const create = () => {
    const n = newPerson.trim();
    if (!n) return;
    const p = addPlayer(n);
    setNewPerson("");
    setExpandedId(p.id);
  };

  return (
    <>
      {registry.length === 0 && (
        <Text style={s.empty}>
          Registret är tomt. Lägg till spelare nedan, eller skapa dem direkt när du redigerar en
          trupp.
        </Text>
      )}
      {registry.map((p) => {
        const memberOf = groups.filter((g) => g.memberIds.includes(p.id));
        const isOpen = expandedId === p.id;
        return (
          <View key={p.id} style={s.playerRow}>
            <Pressable
              onPress={() => setExpandedId(isOpen ? null : p.id)}
              style={s.playerHead}
            >
              <View style={s.playerAvatar}>
                <Text style={s.playerAvatarText}>{p.name[0]}</Text>
              </View>
              <Text style={s.playerName}>{p.name}</Text>
              <View style={s.playerGroups}>
                {memberOf.length === 0 && (
                  <Text style={{ color: T.dim, fontFamily: F.body, fontSize: 12 }}>
                    Ingen grupp
                  </Text>
                )}
                {memberOf.map((g) => (
                  <View key={g.id} style={s.groupTag}>
                    <Text style={s.groupTagText}>{g.name}</Text>
                  </View>
                ))}
                <Text style={{ color: T.dim, fontSize: 12, marginLeft: 4 }}>
                  {isOpen ? "▾" : "▸"}
                </Text>
              </View>
            </Pressable>
            {isOpen && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                <Text style={s.expandLabel}>Grupper – tryck för att lägga till eller ta bort:</Text>
                <View style={s.chipsWrap}>
                  {groups.map((g) => {
                    const inGroup = g.memberIds.includes(p.id);
                    return (
                      <Chip
                        key={g.id}
                        label={`${inGroup ? "✓" : "+"} ${g.name}`}
                        active={inGroup}
                        onPress={() => toggleMembership(p.id, g.id)}
                      />
                    );
                  })}
                  {groups.length === 0 && (
                    <Text style={{ color: T.dim, fontFamily: F.body, fontSize: 13 }}>
                      Inga grupper skapade än.
                    </Text>
                  )}
                </View>
                <Text style={[s.expandLabel, { marginTop: 12 }]}>
                  E-post (spelare eller vårdnadshavare – spelarens Drive-mapp delas hit):
                </Text>
                <EmailField player={p} onSave={(email) => setPlayerEmail(p.id, email)} />
              </View>
            )}
          </View>
        );
      })}
      <View style={s.addRow}>
        <TextInput
          value={newPerson}
          onChangeText={setNewPerson}
          onSubmitEditing={create}
          placeholder="Ny spelare, t.ex. Olle N"
          placeholderTextColor={T.dim}
          style={u.input}
        />
        <Pressable onPress={create} style={u.addBtn}>
          <Text style={u.addBtnText}>+</Text>
        </Pressable>
      </View>
      <Text style={u.infoText}>
        Registret är klubbens sanning: en person, en Drive-mapp, oavsett hur många grupper hen
        spelar i. Tips: använd efternamnsinitial om två spelare heter lika.
      </Text>
    </>
  );
}

function EmailField({ player, onSave }) {
  const [editing, setEditing] = useState(!player.email);
  const [value, setValue] = useState(player.email ?? "");
  const [justSaved, setJustSaved] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const email = value.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(email);
    if (email) {
      setEditing(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }
  };

  if (!editing && player.email) {
    return (
      <View style={s.emailLocked}>
        <Text style={s.emailLockedCheck}>✓</Text>
        <Text style={s.emailLockedText} numberOfLines={1}>
          {player.email}
        </Text>
        {justSaved && <Text style={s.emailSavedNote}>Sparad</Text>}
        <Pressable
          onPress={() => {
            setValue(player.email);
            setEditing(true);
          }}
          hitSlop={8}
        >
          <Text style={s.emailEditText}>Ändra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setInvalid(false);
          }}
          onSubmitEditing={save}
          placeholder="namn@exempel.se"
          placeholderTextColor={T.dim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={[u.input, invalid && { borderColor: T.rec }]}
        />
        <Pressable onPress={save} style={s.emailSaveBtn}>
          <Text style={s.emailSaveBtnText}>Spara</Text>
        </Pressable>
      </View>
      {invalid && (
        <Text style={s.emailInvalid}>Det där ser inte ut som en e-postadress – kolla stavningen.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  kicker: {
    color: T.accent,
    fontFamily: F.cond800,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  driveLink: { color: T.mut, fontFamily: F.body600, fontSize: 13 },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 34, marginTop: 2, marginBottom: 10 },
  segmented: { flexDirection: "row", backgroundColor: "#080E26", borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segBtnActive: { backgroundColor: T.courtLite },
  segText: { color: T.dim, fontFamily: F.cond700, fontSize: 16, letterSpacing: 1 },
  segTextActive: { color: T.line },
  empty: { color: T.dim, fontFamily: F.body, fontSize: 14, lineHeight: 21, marginVertical: 14 },
  card: { backgroundColor: T.courtLite, borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: F.cond800, fontSize: 20 },
  cardTitle: { color: T.line, fontFamily: F.cond800, fontSize: 24, lineHeight: 26 },
  cardSub: { color: T.mut, fontFamily: F.body, fontSize: 13, marginTop: 2 },
  openText: { color: T.accent, fontFamily: F.cond700, fontSize: 15, letterSpacing: 1 },
  editToggle: { color: T.mut, fontFamily: F.body600, fontSize: 13, paddingVertical: 4 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: T.court,
    borderRadius: 99,
    paddingVertical: 6,
    paddingLeft: 13,
    paddingRight: 8,
  },
  memberChipText: { color: T.line, fontFamily: F.body500, fontSize: 14 },
  memberChipNote: { color: T.dim, fontFamily: F.body, fontSize: 10.5 },
  removeBtn: {
    backgroundColor: "#080E26",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: T.rec, fontSize: 13, lineHeight: 16 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.court,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 5,
  },
  suggestionName: { flex: 1, color: T.line, fontFamily: F.body, fontSize: 14 },
  suggestionNote: { color: T.dim, fontFamily: F.body, fontSize: 11.5 },
  createNew: {
    borderWidth: 1.5,
    borderColor: T.accent,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  playerRow: { backgroundColor: T.courtLite, borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  playerHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  playerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.court,
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: { color: T.accent, fontFamily: F.cond800, fontSize: 16 },
  playerName: { flex: 1, color: T.line, fontFamily: F.body600, fontSize: 15 },
  playerGroups: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
    justifyContent: "flex-end",
    maxWidth: "55%",
  },
  groupTag: { backgroundColor: T.court, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  groupTagText: { color: T.mut, fontFamily: F.body600, fontSize: 11.5 },
  expandLabel: { color: T.dim, fontFamily: F.body, fontSize: 12.5, marginBottom: 8 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  emailLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.court,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  emailLockedCheck: { color: T.green, fontSize: 14 },
  emailLockedText: { flex: 1, color: T.line, fontFamily: F.body, fontSize: 14 },
  emailSavedNote: { color: T.green, fontFamily: F.body600, fontSize: 12 },
  emailEditText: { color: T.mut, fontFamily: F.body600, fontSize: 13, padding: 2 },
  emailSaveBtn: {
    backgroundColor: T.courtLite,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  emailSaveBtnText: { color: T.accent, fontFamily: F.body600, fontSize: 14 },
  emailInvalid: { color: T.rec, fontFamily: F.body, fontSize: 12.5, marginTop: 6 },
});
