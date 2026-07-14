import { useState, useEffect, useRef } from "react";

// ——— Design tokens ———————————————————————————————
const T = {
  bg: "#0B1233",
  court: "#152052",
  courtLite: "#1D2B66",
  line: "#EAF0FA",
  orange: "#E0242B",
  orangeDeep: "#A8121B",
  green: "#3FC380",
  red: "#FF5A60",
  mut: "#93A3CF",
  dim: "#5E6DA0",
};

const font = "'Barlow', system-ui, sans-serif";
const cond = "'Barlow Condensed', system-ui, sans-serif";

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
let clipId = 0;
let regId = 100;
let guestCounter = 0;

// ——— Seed: centralt spelarregister + grupper som refererar dit ———
const seedRegistry = [
  { id: 1, name: "Kalle S" }, { id: 2, name: "Olle B" }, { id: 3, name: "Peter" },
  { id: 4, name: "Samuel" }, { id: 5, name: "Elias" }, { id: 6, name: "Hugo" },
  { id: 7, name: "Adam" }, { id: 8, name: "Viktor" },
  { id: 9, name: "Wilma" }, { id: 10, name: "Ebba" }, { id: 11, name: "Alva" },
  { id: 12, name: "Moa" }, { id: 13, name: "Stina" }, { id: 14, name: "Tuva" }, { id: 15, name: "Klara" },
  { id: 16, name: "Melker" }, { id: 17, name: "Sixten" }, { id: 18, name: "Arvid" },
  { id: 19, name: "Nils" }, { id: 20, name: "Loke" },
];

const seedGroups = [
  { id: "gym", name: "Gymnasiet", memberIds: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "dam", name: "Dam", memberIds: [9, 10, 11, 12, 13, 14, 15] },
  { id: "herru", name: "Herr U", memberIds: [16, 17, 18, 19, 20, 2, 4] }, // Olle B & Samuel överlappar
];

// ——— Root ————————————————————————————————————
export default function TranarApp() {
  const [registry, setRegistry] = useState(seedRegistry);
  const [groups, setGroups] = useState(seedGroups);
  const [groupId, setGroupId] = useState(null);
  const [tab, setTab] = useState("prep");
  const [players, setPlayers] = useState([]); // dagens session
  const [moment, setMoment] = useState("Kantskott");
  const [clips, setClips] = useState([]);

  const group = groups.find((g) => g.id === groupId) || null;
  const present = players.filter((p) => p.present);
  const groupClips = clips.filter((c) => c.groupId === groupId);

  const nameOf = (rid) => registry.find((r) => r.id === rid)?.name || "?";

  const openGroup = (g) => {
    setGroupId(g.id);
    setPlayers(g.memberIds.map((rid) => ({ rid, name: nameOf(rid), present: true })));
    setTab("prep");
  };

  const addToRegistry = (name) => {
    const p = { id: ++regId, name };
    setRegistry((prev) => [...prev, p]);
    return p;
  };

  const addClip = ({ playerName, duration, guest = false }) => {
    const c = {
      id: ++clipId,
      groupId,
      player: playerName,
      guest,
      moment,
      duration,
      time: new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
      memo: null,
      status: "uploading",
    };
    setClips((prev) => [c, ...prev]);
    setTimeout(() => {
      setClips((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "done" } : x)));
    }, 1600);
    return c.id;
  };

  const attachMemo = (id, dur) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, memo: { dur }, status: "uploading" } : c)));
    setTimeout(() => setClips((prev) => prev.map((c) => (c.id === id ? { ...c, status: "done" } : c))), 1200);
  };

  const assignGuestClip = (id, playerName) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, player: playerName, guest: false, status: "uploading" } : c)));
    setTimeout(() => setClips((prev) => prev.map((c) => (c.id === id ? { ...c, status: "done" } : c))), 1200);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#060B1F", display: "flex", justifyContent: "center", fontFamily: font, color: T.line }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button, input { font-family: inherit; }
        button { cursor: pointer; border: none; }
        input { outline: none; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes pop { from{transform:scale(.92);opacity:0} to{transform:scale(1);opacity:1} }
        @media (prefers-reduced-motion: reduce){ *{animation:none !important; transition:none !important} }
      `}</style>

      <div style={{ width: "100%", maxWidth: 400, minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        {/* handbollsplan sedd uppifrån: mål, 6 m, 9 m och straffkastlinje */}
        <svg width="100%" height="210" viewBox="0 0 400 210" style={{ position: "absolute", top: 0, left: 0, opacity: 0.13, pointerEvents: "none" }}>
          <line x1="0" y1="12" x2="400" y2="12" stroke={T.line} strokeWidth="2" />
          <rect x="170" y="5" width="60" height="7" fill="none" stroke={T.orange} strokeWidth="2.5" />
          <path d="M 65 12 A 145 145 0 0 0 335 12" fill="none" stroke={T.line} strokeWidth="2.5" />
          <path d="M 22 12 A 195 195 0 0 0 378 12" fill="none" stroke={T.line} strokeWidth="2" strokeDasharray="12 9" />
          <line x1="183" y1="112" x2="217" y2="112" stroke={T.orange} strokeWidth="2.5" />
        </svg>

        {!group ? (
          <Home registry={registry} groups={groups} setGroups={setGroups} openGroup={openGroup} addToRegistry={addToRegistry} />
        ) : (
          <>
            <header style={{ padding: "18px 20px 8px", position: "relative" }}>
              <button onClick={() => setGroupId(null)} style={{ background: "transparent", color: T.mut, fontSize: 14, fontWeight: 600, padding: "2px 0" }}>‹ Grupper</button>
              <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 13, letterSpacing: 3, color: T.orange, textTransform: "uppercase", marginTop: 6 }}>{group.name} · Tisdag</div>
              <h1 style={{ fontFamily: cond, fontWeight: 800, fontSize: 32, margin: "2px 0 0", letterSpacing: 0.5 }}>
                {tab === "prep" && "Förbered passet"}
                {tab === "film" && "Filma"}
                {tab === "review" && "Granska & memo"}
              </h1>
            </header>

            <main style={{ flex: 1, overflowY: "auto", padding: "12px 16px 96px", position: "relative" }}>
              {tab === "prep" && (
                <Prep players={players} setPlayers={setPlayers} moment={moment} setMoment={setMoment} onDone={() => setTab("film")} />
              )}
              {tab === "film" && (
                <Film present={present} moment={moment} addClip={addClip} attachMemo={attachMemo} />
              )}
              {tab === "review" && (
                <Review clips={groupClips} present={present} attachMemo={attachMemo} assignGuestClip={assignGuestClip} />
              )}
            </main>

            <nav style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", background: "#080E26", borderTop: `1px solid ${T.courtLite}` }}>
              {[["prep", "Förbered"], ["film", "Filma"], ["review", "Granska"]].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "14px 0 18px", background: "transparent", color: tab === key ? T.orange : T.dim, fontFamily: cond, fontWeight: 700, fontSize: 16, letterSpacing: 1.5, textTransform: "uppercase", borderTop: tab === key ? `3px solid ${T.orange}` : "3px solid transparent" }}>
                  {label}
                  {key === "review" && groupClips.length > 0 && (
                    <span style={{ marginLeft: 6, background: T.orange, color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 12 }}>{groupClips.length}</span>
                  )}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}

// ——— Hemvyn: Grupper + Spelarregister ————————————————
function Home({ registry, groups, setGroups, openGroup, addToRegistry }) {
  const [view, setView] = useState("groups");
  const [editing, setEditing] = useState(null);
  const [newGroup, setNewGroup] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const toggleMembership = (playerId, gid) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== gid) return g;
      return g.memberIds.includes(playerId)
        ? { ...g, memberIds: g.memberIds.filter((id) => id !== playerId) }
        : { ...g, memberIds: [...g.memberIds, playerId] };
    }));
  };

  const addGroup = () => {
    const name = newGroup.trim();
    if (!name) return;
    const id = "g" + Date.now();
    setGroups((prev) => [...prev, { id, name, memberIds: [] }]);
    setNewGroup("");
    setEditing(id);
  };

  const addPerson = () => {
    const n = newPerson.trim();
    if (!n) return;
    const p = addToRegistry(n);
    setNewPerson("");
    setExpandedId(p.id); // öppna direkt så gruppvalet ligger ett tryck bort
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
      <header style={{ padding: "22px 20px 6px" }}>
        <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 13, letterSpacing: 3, color: T.orange, textTransform: "uppercase" }}>TeamClip</div>
        <h1 style={{ fontFamily: cond, fontWeight: 800, fontSize: 34, margin: "2px 0 10px" }}>{view === "groups" ? "Dina grupper" : "Spelarregister"}</h1>
        <div style={{ display: "flex", background: "#080E26", borderRadius: 12, padding: 4 }}>
          {[["groups", "Grupper"], ["players", "Spelare"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, fontFamily: cond, fontWeight: 700, fontSize: 16, letterSpacing: 1, background: view === k ? T.courtLite : "transparent", color: view === k ? T.line : T.dim }}>{l}</button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "14px 16px 30px" }}>
        {view === "groups" && (
          <>
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} registry={registry} groups={groups} isEditing={editing === g.id}
                onOpen={() => openGroup(g)}
                onToggleEdit={() => setEditing(editing === g.id ? null : g.id)}
                onUpdate={(memberIds) => setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, memberIds } : x)))}
                addToRegistry={addToRegistry} />
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGroup()}
                placeholder="Ny grupp, t.ex. Flickor 08"
                style={{ flex: 1, background: "#080E26", border: `1.5px solid ${T.courtLite}`, borderRadius: 12, padding: "12px 14px", color: T.line, fontSize: 15 }} />
              <button onClick={addGroup} style={{ background: T.courtLite, color: T.orange, borderRadius: 12, padding: "0 18px", fontFamily: cond, fontWeight: 800, fontSize: 22 }}>+</button>
            </div>
            <p style={{ color: T.dim, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
              En spelare kan vara med i flera grupper – Olle B och Samuel ligger t.ex. i både Gymnasiet och Herr U. Alla deras klipp hamnar ändå i samma Drive-mapp, en per spelare.
            </p>
          </>
        )}

        {view === "players" && (
          <>
            {registry.map((p) => {
              const memberOf = groups.filter((g) => g.memberIds.includes(p.id));
              const isOpen = expandedId === p.id;
              return (
                <div key={p.id} style={{ background: T.courtLite, borderRadius: 12, marginBottom: 8, animation: "pop .2s ease", overflow: "hidden" }}>
                  <button onClick={() => setExpandedId(isOpen ? null : p.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "transparent", padding: "11px 14px", color: T.line, textAlign: "left" }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: T.court, display: "grid", placeItems: "center", fontFamily: cond, fontWeight: 800, fontSize: 16, color: T.orange, flexShrink: 0 }}>{p.name[0]}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                    <span style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                      {memberOf.length === 0 && <span style={{ color: T.dim, fontSize: 12 }}>Ingen grupp</span>}
                      {memberOf.map((g) => (
                        <span key={g.id} style={{ fontSize: 11.5, fontWeight: 600, color: T.mut, background: T.court, borderRadius: 99, padding: "3px 9px" }}>{g.name}</span>
                      ))}
                      <span style={{ color: T.dim, fontSize: 12, marginLeft: 4 }}>{isOpen ? "▾" : "▸"}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 14px 12px", animation: "pop .2s ease" }}>
                      <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 8 }}>Grupper – tryck för att lägga till eller ta bort:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {groups.map((g) => {
                          const inGroup = g.memberIds.includes(p.id);
                          return (
                            <button key={g.id} onClick={() => toggleMembership(p.id, g.id)} style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "7px 14px", borderRadius: 99, fontFamily: cond, fontWeight: 700, fontSize: 15, letterSpacing: 0.5,
                              background: inGroup ? T.orange : "transparent",
                              color: inGroup ? "#fff" : T.mut,
                              border: `1.5px solid ${inGroup ? T.orange : T.court}`,
                            }}>
                              {inGroup ? "✓" : "+"} {g.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPerson()}
                placeholder="Ny spelare, t.ex. Olle N"
                style={{ flex: 1, background: "#080E26", border: `1.5px solid ${T.courtLite}`, borderRadius: 12, padding: "12px 14px", color: T.line, fontSize: 15 }} />
              <button onClick={addPerson} style={{ background: T.courtLite, color: T.orange, borderRadius: 12, padding: "0 18px", fontFamily: cond, fontWeight: 800, fontSize: 22 }}>+</button>
            </div>
            <p style={{ color: T.dim, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
              Registret är klubbens sanning: en person, en Drive-mapp, oavsett hur många grupper hen spelar i. Tryck på en spelare för att välja grupper. Tips: använd efternamnsinitial om två spelare heter lika.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function GroupCard({ group, registry, groups, isEditing, onOpen, onToggleEdit, onUpdate, addToRegistry }) {
  const [query, setQuery] = useState("");
  const members = group.memberIds.map((id) => registry.find((r) => r.id === id)).filter(Boolean);

  const q = query.trim().toLowerCase();
  const suggestions = q
    ? registry.filter((r) => !group.memberIds.includes(r.id) && r.name.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const exactExists = registry.some((r) => r.name.toLowerCase() === q);

  const addMember = (rid) => { onUpdate([...group.memberIds, rid]); setQuery(""); };
  const removeMember = (rid) => onUpdate(group.memberIds.filter((id) => id !== rid));
  const createAndAdd = () => {
    const p = addToRegistry(query.trim());
    addMember(p.id);
  };

  const otherGroupsOf = (rid) => groups.filter((g) => g.id !== group.id && g.memberIds.includes(rid)).map((g) => g.name);

  return (
    <div style={{ background: T.courtLite, borderRadius: 16, marginBottom: 12, overflow: "hidden", animation: "pop .25s ease" }}>
      <button onClick={onOpen} style={{ width: "100%", background: "transparent", textAlign: "left", padding: "16px 16px 12px", display: "flex", alignItems: "center", gap: 12, color: T.line }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: `radial-gradient(circle at 32% 28%, ${T.orange}, ${T.orangeDeep} 72%)`, display: "grid", placeItems: "center", fontFamily: cond, fontWeight: 800, fontSize: 20, color: "#fff", flexShrink: 0 }}>
          {group.name[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 24, lineHeight: 1.05 }}>{group.name}</div>
          <div style={{ color: T.mut, fontSize: 13, marginTop: 2 }}>{members.length} spelare i truppen</div>
        </div>
        <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 15, color: T.orange, letterSpacing: 1 }}>ÖPPNA ›</span>
      </button>

      <div style={{ padding: "0 16px 12px" }}>
        <button onClick={onToggleEdit} style={{ background: "transparent", color: T.mut, fontSize: 13, fontWeight: 600, padding: "4px 0" }}>
          {isEditing ? "▾ Klar med truppen" : "▸ Redigera trupp"}
        </button>

        {isEditing && (
          <div style={{ marginTop: 8, animation: "pop .2s ease" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {members.map((m) => (
                <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: T.court, borderRadius: 99, padding: "6px 8px 6px 13px", fontSize: 14, fontWeight: 500 }}>
                  {m.name}
                  {otherGroupsOf(m.id).length > 0 && <span style={{ fontSize: 10.5, color: T.dim }}>även {otherGroupsOf(m.id).join(", ")}</span>}
                  <button onClick={() => removeMember(m.id)} aria-label={`Ta bort ${m.name}`} style={{ background: "#080E26", color: T.red, borderRadius: "50%", width: 20, height: 20, fontSize: 12, lineHeight: 1, display: "grid", placeItems: "center" }}>×</button>
                </span>
              ))}
              {members.length === 0 && <span style={{ color: T.dim, fontSize: 13 }}>Truppen är tom – sök i registret nedan.</span>}
            </div>

            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök i spelarregistret…"
              style={{ width: "100%", marginTop: 10, background: "#080E26", border: `1.5px solid ${T.court}`, borderRadius: 10, padding: "10px 12px", color: T.line, fontSize: 14 }} />

            {q && (
              <div style={{ marginTop: 6 }}>
                {suggestions.map((s) => (
                  <button key={s.id} onClick={() => addMember(s.id)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, background: T.court, borderRadius: 10, padding: "9px 12px", marginBottom: 5, color: T.line, fontSize: 14, textAlign: "left" }}>
                    <span style={{ color: T.green, fontWeight: 700 }}>+</span>
                    <span style={{ flex: 1 }}>{s.name}</span>
                    {otherGroupsOf(s.id).length > 0
                      ? <span style={{ fontSize: 11.5, color: T.mut }}>finns i {otherGroupsOf(s.id).join(", ")}</span>
                      : <span style={{ fontSize: 11.5, color: T.dim }}>i registret</span>}
                  </button>
                ))}
                {!exactExists && (
                  <button onClick={createAndAdd} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, background: "transparent", border: `1.5px dashed ${T.orange}`, borderRadius: 10, padding: "9px 12px", color: T.orange, fontSize: 14, textAlign: "left" }}>
                    <span style={{ fontWeight: 700 }}>+</span> Skapa ny spelare "{query.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ——— Förbered ————————————————————————————————
function Prep({ players, setPlayers, moment, setMoment, onDone }) {
  const toggle = (rid) => setPlayers((prev) => prev.map((p) => (p.rid === rid ? { ...p, present: !p.present } : p)));
  const n = players.filter((p) => p.present).length;
  return (
    <div style={{ animation: "pop .25s ease" }}>
      <SectionLabel>Vilka är på golvet idag?</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {players.map((p) => (
          <button key={p.rid} onClick={() => toggle(p.rid)} style={{
            padding: "13px 12px", borderRadius: 12, textAlign: "left",
            background: p.present ? T.courtLite : "transparent",
            border: `1.5px solid ${p.present ? T.orange : T.courtLite}`,
            color: p.present ? T.line : T.dim, fontWeight: 600, fontSize: 15,
            display: "flex", alignItems: "center", gap: 9,
          }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, background: p.present ? T.orange : "transparent", border: `1.5px solid ${p.present ? T.orange : T.dim}`, display: "grid", placeItems: "center", fontSize: 12, color: "#fff" }}>{p.present ? "✓" : ""}</span>
            {p.name}
          </button>
        ))}
      </div>

      <SectionLabel style={{ marginTop: 26 }}>Dagens moment</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {["Kantskott", "Straffkast", "Genombrott", "Nio meter", "Målvakt"].map((m) => (
          <button key={m} onClick={() => setMoment(m)} style={{
            padding: "9px 16px", borderRadius: 99, fontFamily: cond, fontWeight: 700, fontSize: 16, letterSpacing: 0.8,
            background: moment === m ? T.orange : "transparent", color: moment === m ? "#fff" : T.mut,
            border: `1.5px solid ${moment === m ? T.orange : T.courtLite}`,
          }}>{m}</button>
        ))}
      </div>

      <button onClick={onDone} style={{ marginTop: 30, width: "100%", padding: "16px", borderRadius: 14, background: T.orange, color: "#fff", fontFamily: cond, fontWeight: 800, fontSize: 20, letterSpacing: 1.5, textTransform: "uppercase" }}>
        Starta passet · {n} spelare
      </button>
      <p style={{ color: T.dim, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
        Under passet ser du bara de {n} spelare du bockat i – aldrig hela truppen. Gäster lägger du till direkt i Filma-vyn.
      </p>
    </div>
  );
}

// ——— Filma ——————————————————————————————————
function Film({ present, moment, addClip, attachMemo }) {
  const [mode, setMode] = useState("spont");
  return (
    <div style={{ animation: "pop .25s ease" }}>
      <div style={{ display: "flex", background: "#080E26", borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[["spont", "Spontant"], ["queue", "Kö-läge"]].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: "10px 0", borderRadius: 9, fontFamily: cond, fontWeight: 700, fontSize: 17, letterSpacing: 1, background: mode === k ? T.courtLite : "transparent", color: mode === k ? T.line : T.dim }}>{l}</button>
        ))}
      </div>
      {mode === "spont"
        ? <Spontant present={present} moment={moment} addClip={addClip} attachMemo={attachMemo} />
        : <KoLage present={present} moment={moment} addClip={addClip} />}
    </div>
  );
}

// ——— Spontant läge ————————————————————————————
function Spontant({ present, moment, addClip, attachMemo }) {
  const [phase, setPhase] = useState("pick");
  const [player, setPlayer] = useState(null); // {name, guest}
  const [sec, setSec] = useState(0);
  const [savedId, setSavedId] = useState(null);
  const timer = useRef(null);

  const start = (name, guest = false) => { setPlayer({ name, guest }); setSec(0); setPhase("rec"); };
  useEffect(() => {
    if (phase === "rec") {
      timer.current = setInterval(() => setSec((s) => s + 1), 1000);
      return () => clearInterval(timer.current);
    }
  }, [phase]);

  const stop = () => {
    clearInterval(timer.current);
    const id = addClip({ playerName: player.name, duration: Math.max(sec, 1), guest: player.guest });
    setSavedId(id);
    setPhase("memo");
  };

  if (phase === "pick") return (
    <div>
      <SectionLabel>Tryck på spelaren – kameran startar direkt</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {present.map((p) => (
          <button key={p.rid} onClick={() => start(p.name)} style={{
            padding: "26px 12px", borderRadius: 16, background: T.courtLite, color: T.line,
            fontFamily: cond, fontWeight: 800, fontSize: 24, letterSpacing: 1,
            border: `1px solid #2C3C7E`,
          }}>{p.name}</button>
        ))}
        <button onClick={() => start(`Gäst ${++guestCounter}`, true)} style={{
          padding: "26px 12px", borderRadius: 16, background: "transparent", color: T.mut,
          fontFamily: cond, fontWeight: 800, fontSize: 24, letterSpacing: 1,
          border: `1.5px dashed ${T.dim}`,
        }}>+ Gäst</button>
      </div>
    </div>
  );

  if (phase === "rec") return (
    <RecScreen title={`${player.name} · ${moment}`} sec={sec} onStop={stop} stopLabel="Stopp & spara" />
  );

  return (
    <MemoSheet
      player={player.name} guest={player.guest}
      onMemo={(dur) => { attachMemo(savedId, dur); setPhase("pick"); }}
      onSkip={() => setPhase("pick")}
    />
  );
}

// ——— Kö-läge (med gäster) —————————————————————————
function KoLage({ present, moment, addClip }) {
  const [order, setOrder] = useState(present.map((p) => ({ key: "p" + p.rid, name: p.name, guest: false })));
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [lap, setLap] = useState(1);
  const [segSec, setSegSec] = useState(0);
  const [flash, setFlash] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    setOrder(present.map((p) => ({ key: "p" + p.rid, name: p.name, guest: false })));
  }, [present.length]);

  useEffect(() => {
    if (active) {
      timer.current = setInterval(() => setSegSec((s) => s + 1), 1000);
      return () => clearInterval(timer.current);
    }
  }, [active]);

  const move = (i, dir) => {
    setOrder((o) => {
      const n = [...o]; const j = i + dir;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };

  const addGuest = () => {
    guestCounter += 1;
    setOrder((o) => [...o, { key: "g" + guestCounter, name: `Gäst ${guestCounter}`, guest: true }]);
  };
  const removeFromQueue = (key) => setOrder((o) => o.filter((x) => x.key !== key));

  const cut = () => {
    const shooter = order[idx];
    addClip({ playerName: shooter.name, duration: Math.max(segSec, 1), guest: shooter.guest });
    setFlash(shooter);
    setTimeout(() => setFlash(null), 900);
    setSegSec(0);
    if (idx + 1 >= order.length) { setIdx(0); setLap((l) => l + 1); }
    else setIdx(idx + 1);
  };

  const stopAll = () => { setActive(false); setIdx(0); setLap(1); setSegSec(0); };

  if (!active) return (
    <div>
      <SectionLabel>Skjutordning – kameran klipper åt dig</SectionLabel>
      {order.map((item, i) => (
        <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10, background: item.guest ? "transparent" : T.courtLite, border: item.guest ? `1.5px dashed ${T.dim}` : "none", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
          <span style={{ fontFamily: cond, fontWeight: 800, fontSize: 18, color: T.orange, width: 22 }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: item.guest ? T.mut : T.line }}>
            {item.name}
            {item.guest && <span style={{ fontSize: 11.5, color: T.dim, marginLeft: 8 }}>utanför truppen</span>}
          </span>
          <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "transparent", color: i === 0 ? T.dim : T.line, fontSize: 18, padding: 4 }}>↑</button>
          <button onClick={() => move(i, 1)} disabled={i === order.length - 1} style={{ background: "transparent", color: i === order.length - 1 ? T.dim : T.line, fontSize: 18, padding: 4 }}>↓</button>
          {item.guest && <button onClick={() => removeFromQueue(item.key)} style={{ background: "transparent", color: T.red, fontSize: 16, padding: 4 }}>×</button>}
        </div>
      ))}

      <button onClick={addGuest} style={{ width: "100%", padding: "11px", borderRadius: 12, background: "transparent", border: `1.5px dashed ${T.dim}`, color: T.mut, fontFamily: cond, fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>
        + Lägg till gäst i kön
      </button>

      <button onClick={() => order.length && setActive(true)} style={{ marginTop: 14, width: "100%", padding: "16px", borderRadius: 14, background: T.orange, color: "#fff", fontFamily: cond, fontWeight: 800, fontSize: 20, letterSpacing: 1.5, textTransform: "uppercase" }}>
        Spela in kön · {moment}
      </button>
      <p style={{ color: T.dim, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
        Gästens klipp laddas inte upp till någon spelare – de hamnar i gruppens gästmapp. Kön rullar på som vanligt, och skulle gästen börja i klubben kan du flytta klippen till hens mapp i efterhand.
      </p>
    </div>
  );

  const shooter = order[idx];
  const next = order[(idx + 1) % order.length];

  return (
    <div style={{ textAlign: "center" }}>
      <RecBar sec={segSec} label={`Varv ${lap} · ${moment}`} />
      <div style={{ margin: "26px 0 4px", fontFamily: cond, fontWeight: 700, fontSize: 15, letterSpacing: 2.5, color: T.mut, textTransform: "uppercase" }}>Skjuter nu</div>
      <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 52, lineHeight: 1, color: shooter.guest ? T.mut : T.line }}>
        {shooter.name}
      </div>
      {shooter.guest && <div style={{ color: T.dim, fontSize: 13, marginTop: 4 }}>gäst – klippet delas inte</div>}

      <button onClick={cut} style={{
        margin: "28px auto 6px", width: 168, height: 168, borderRadius: "50%",
        background: `radial-gradient(circle at 32% 28%, ${T.orange}, ${T.orangeDeep} 72%)`,
        color: "#fff", fontFamily: cond, fontWeight: 800, fontSize: 22, letterSpacing: 1.5, textTransform: "uppercase",
        boxShadow: `0 10px 34px rgba(224,36,43,.4), inset 0 -6px 14px rgba(0,0,0,.25)`,
        display: "grid", placeItems: "center",
      }}>
        Skott klart<br /><span style={{ fontSize: 14, fontWeight: 700, opacity: 0.85 }}>klipp & nästa</span>
      </button>

      {flash && (
        <div style={{ animation: "pop .2s ease", color: T.green, fontWeight: 600, fontSize: 14 }}>
          ✓ Klipp sparat {flash.guest ? "i gästmappen" : `till ${flash.name}s mapp`}
        </div>
      )}

      <div style={{ marginTop: 14, color: T.mut, fontSize: 14 }}>Näst på tur: <b style={{ color: T.line }}>{next.name}</b></div>

      <button onClick={stopAll} style={{ marginTop: 26, background: "transparent", color: T.red, fontWeight: 600, fontSize: 15, padding: 10 }}>
        ■ Avsluta kön
      </button>
    </div>
  );
}

// ——— Granska ——————————————————————————————————
function Review({ clips, present, attachMemo, assignGuestClip }) {
  const [filter, setFilter] = useState("Alla");
  const hasGuests = clips.some((c) => c.guest);
  const names = ["Alla", ...present.map((p) => p.name), ...(hasGuests ? ["Gäster"] : [])];
  const shown = clips.filter((c) =>
    filter === "Alla" ? true : filter === "Gäster" ? c.guest : c.player === filter && !c.guest
  );

  return (
    <div style={{ animation: "pop .25s ease" }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }}>
        {names.map((n) => (
          <button key={n} onClick={() => setFilter(n)} style={{
            padding: "7px 15px", borderRadius: 99, whiteSpace: "nowrap", fontFamily: cond, fontWeight: 700, fontSize: 15, letterSpacing: 0.8,
            background: filter === n ? T.orange : "transparent", color: filter === n ? "#fff" : T.mut,
            border: `1.5px solid ${filter === n ? T.orange : T.courtLite}`,
          }}>{n}</button>
        ))}
      </div>

      {shown.length === 0 && (
        <div style={{ textAlign: "center", color: T.dim, padding: "60px 20px", lineHeight: 1.6 }}>
          Inga klipp än.<br />Gå till <b style={{ color: T.mut }}>Filma</b> och fånga ett skott – klippen dyker upp här, sorterade per spelare.
        </div>
      )}

      {shown.map((c) => <ClipCard key={c.id} clip={c} attachMemo={attachMemo} present={present} assignGuestClip={assignGuestClip} />)}
    </div>
  );
}

function ClipCard({ clip, attachMemo, present, assignGuestClip }) {
  const [holding, setHolding] = useState(false);
  const [holdSec, setHoldSec] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const timer = useRef(null);

  const startHold = () => {
    setHolding(true); setHoldSec(0);
    timer.current = setInterval(() => setHoldSec((s) => s + 1), 1000);
  };
  const endHold = () => {
    if (!holding) return;
    clearInterval(timer.current);
    setHolding(false);
    attachMemo(clip.id, Math.max(holdSec, 1));
  };

  return (
    <div style={{ background: T.courtLite, borderRadius: 16, padding: 12, marginBottom: 12, display: "flex", gap: 12, animation: "pop .25s ease", border: clip.guest ? `1.5px dashed ${T.dim}` : "none" }}>
      <div style={{ width: 78, height: 100, borderRadius: 10, flexShrink: 0, background: `linear-gradient(160deg, ${T.court}, #0A1130)`, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
        <svg width="78" height="100" viewBox="0 0 78 100" style={{ position: "absolute", opacity: 0.28 }}>
          <line x1="0" y1="9" x2="78" y2="9" stroke={T.line} strokeWidth="1.5" />
          <rect x="30" y="5" width="18" height="4" fill="none" stroke={T.orange} strokeWidth="1.5" />
          <path d="M 12 9 A 33 33 0 0 0 66 9" fill="none" stroke={T.line} strokeWidth="1.5" />
        </svg>
        <span style={{ fontFamily: cond, fontWeight: 800, fontSize: 30, color: clip.guest ? T.dim : T.orange }}>{clip.guest ? "?" : clip.player[0]}</span>
        <span style={{ position: "absolute", bottom: 6, right: 7, fontSize: 11, background: "rgba(0,0,0,.55)", borderRadius: 5, padding: "1px 6px" }}>{fmt(clip.duration)}</span>
        <span style={{ position: "absolute", top: 6, left: 7, fontSize: 16 }}>▶</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: cond, fontWeight: 800, fontSize: 20, color: clip.guest ? T.mut : T.line }}>{clip.player}</span>
          <span style={{ color: T.dim, fontSize: 12 }}>{clip.time}</span>
        </div>
        <div style={{ color: T.mut, fontSize: 13, marginTop: 1 }}>{clip.moment}</div>

        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {clip.memo ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#123524", color: T.green, borderRadius: 99, padding: "5px 12px", fontSize: 13, fontWeight: 600 }}>
              🎙 Röstmemo · {fmt(clip.memo.dur)}
            </span>
          ) : (
            <button
              onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold}
              style={{
                background: holding ? T.red : "transparent", color: holding ? "#fff" : T.orange,
                border: `1.5px solid ${holding ? T.red : T.orange}`, borderRadius: 99, padding: "6px 14px",
                fontSize: 13, fontWeight: 600, userSelect: "none",
              }}>
              {holding ? `● Spelar in… ${holdSec}s` : "🎙 Håll för röstmemo"}
            </button>
          )}

          {clip.guest && !assigning && (
            <button onClick={() => setAssigning(true)} style={{ background: "transparent", color: T.mut, border: `1.5px solid ${T.dim}`, borderRadius: 99, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>
              Flytta till spelare…
            </button>
          )}
        </div>

        {assigning && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, animation: "pop .2s ease" }}>
            {present.map((p) => (
              <button key={p.rid} onClick={() => { assignGuestClip(clip.id, p.name); setAssigning(false); }}
                style={{ background: T.court, color: T.line, borderRadius: 99, padding: "6px 13px", fontSize: 13, fontWeight: 600 }}>
                {p.name}
              </button>
            ))}
            <button onClick={() => setAssigning(false)} style={{ background: "transparent", color: T.dim, padding: "6px 8px", fontSize: 13 }}>Avbryt</button>
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 12.5, color: clip.status === "done" ? (clip.guest ? T.mut : T.green) : T.mut }}>
          {clip.status === "done"
            ? (clip.guest
                ? <>◌ I gruppens gästmapp – delas inte med någon</>
                : <>✓ I {clip.player}s Drive-mapp{clip.memo ? " · memo bifogat" : ""}</>)
            : <span style={{ animation: "pulse 1.2s infinite" }}>↑ Laddar upp till Drive…</span>}
        </div>
      </div>
    </div>
  );
}

// ——— Delade småkomponenter ———————————————————————
function RecScreen({ title, sec, onStop, stopLabel }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 8 }}>
      <RecBar sec={sec} label={title} />
      <div style={{ margin: "18px auto", height: 300, borderRadius: 18, background: `linear-gradient(165deg, ${T.court}, #0A1130)`, display: "grid", placeItems: "center", position: "relative", overflow: "hidden", border: `1px solid #2C3C7E` }}>
        <svg width="100%" height="160" viewBox="0 0 360 160" style={{ position: "absolute", top: 0, opacity: 0.2 }}>
          <line x1="0" y1="10" x2="360" y2="10" stroke={T.line} strokeWidth="2" />
          <rect x="152" y="4" width="56" height="6" fill="none" stroke={T.orange} strokeWidth="2" />
          <path d="M 55 10 A 130 130 0 0 0 305 10" fill="none" stroke={T.line} strokeWidth="2" />
          <path d="M 18 10 A 175 175 0 0 0 342 10" fill="none" stroke={T.line} strokeWidth="1.5" strokeDasharray="10 8" />
        </svg>
        <div style={{ color: T.dim, fontSize: 14 }}>📱 Kamerasökare<br /><span style={{ fontSize: 12 }}>(här ser du spelaren på riktigt)</span></div>
      </div>
      <button onClick={onStop} style={{ width: 92, height: 92, borderRadius: "50%", background: T.red, color: "#fff", fontFamily: cond, fontWeight: 800, fontSize: 15, letterSpacing: 0.5, boxShadow: "0 8px 26px rgba(255,90,96,.4)" }}>
        ■<br />{stopLabel.split(" ")[0]}
      </button>
      <div style={{ color: T.mut, fontSize: 13, marginTop: 10 }}>{stopLabel}</div>
    </div>
  );
}

function RecBar({ sec, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#080E26", borderRadius: 12, padding: "10px 14px" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: T.red, animation: "pulse 1.1s infinite" }} />
      <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 17, letterSpacing: 1, flex: 1, textAlign: "left" }}>{label}</span>
      <span style={{ fontFamily: cond, fontWeight: 800, fontSize: 20, color: T.red }}>{fmt(sec)}</span>
    </div>
  );
}

function MemoSheet({ player, guest, onMemo, onSkip }) {
  const [holding, setHolding] = useState(false);
  const [sec, setSec] = useState(0);
  const timer = useRef(null);
  const start = () => { setHolding(true); setSec(0); timer.current = setInterval(() => setSec((s) => s + 1), 1000); };
  const end = () => { if (!holding) return; clearInterval(timer.current); setHolding(false); onMemo(Math.max(sec, 1)); };

  return (
    <div style={{ textAlign: "center", paddingTop: 30, animation: "pop .25s ease" }}>
      <div style={{ color: guest ? T.mut : T.green, fontWeight: 600, fontSize: 15 }}>
        ✓ Klipp sparat {guest ? "i gästmappen" : `till ${player}s mapp`}
      </div>
      <h2 style={{ fontFamily: cond, fontWeight: 800, fontSize: 28, margin: "22px 0 6px" }}>Feedback till {player}?</h2>
      <p style={{ color: T.mut, fontSize: 14, margin: "0 30px 26px", lineHeight: 1.5 }}>
        Håll inne knappen och prata – memot fästs på klippet. Eller hoppa över om du inte har något.
      </p>
      <button
        onPointerDown={start} onPointerUp={end} onPointerLeave={end}
        style={{
          width: 150, height: 150, borderRadius: "50%", userSelect: "none",
          background: holding ? T.red : `radial-gradient(circle at 32% 28%, ${T.orange}, ${T.orangeDeep} 72%)`,
          color: "#fff", fontFamily: cond, fontWeight: 800, fontSize: 18, letterSpacing: 1,
          boxShadow: holding ? "0 8px 30px rgba(255,90,96,.5)" : "0 8px 30px rgba(224,36,43,.35)",
        }}>
        {holding ? `● ${sec}s` : "🎙 Håll & prata"}
      </button>
      <div>
        <button onClick={onSkip} style={{ marginTop: 26, background: "transparent", color: T.mut, fontSize: 15, fontWeight: 600, padding: 10 }}>
          Ingen feedback – tillbaka till spelarna →
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children, style }) {
  return <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", color: T.mut, margin: "4px 0 12px", ...style }}>{children}</div>;
}
