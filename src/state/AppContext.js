import { createContext, useContext, useEffect, useRef, useState } from "react";
import { loadJSON, saveJSON } from "../lib/persist";

// Registret är klubbens sanning: en person = en post = (i steg 3) en Drive-mapp.
// Grupper refererar in i registret via memberIds.
const STATE_FILE = "appstate.json";

const Ctx = createContext(null);

let idCounter = 0;
const newId = (prefix) => `${prefix}${Date.now()}${idCounter++}`;

export function AppProvider({ children }) {
  const [state, setState] = useState(() =>
    loadJSON(STATE_FILE, { registry: [], groups: [] })
  );

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveJSON(STATE_FILE, state);
  }, [state]);

  const actions = {
    addPlayer(name, email = "") {
      const player = { id: newId("p"), name: name.trim(), email };
      setState((s) => ({ ...s, registry: [...s.registry, player] }));
      return player;
    },
    setPlayerEmail(playerId, email) {
      setState((s) => ({
        ...s,
        registry: s.registry.map((p) => (p.id === playerId ? { ...p, email } : p)),
      }));
    },
    addGroup(name) {
      const group = { id: newId("g"), name: name.trim(), memberIds: [] };
      setState((s) => ({ ...s, groups: [...s.groups, group] }));
      return group;
    },
    setGroupMembers(groupId, memberIds) {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => (g.id === groupId ? { ...g, memberIds } : g)),
      }));
    },
    toggleMembership(playerId, groupId) {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== groupId) return g;
          return g.memberIds.includes(playerId)
            ? { ...g, memberIds: g.memberIds.filter((id) => id !== playerId) }
            : { ...g, memberIds: [...g.memberIds, playerId] };
        }),
      }));
    },
  };

  return (
    <Ctx.Provider value={{ registry: state.registry, groups: state.groups, ...actions }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
