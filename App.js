import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
} from "@expo-google-fonts/barlow";
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from "@expo-google-fonts/barlow-condensed";
import { T } from "./src/theme";
import { AppProvider, useApp } from "./src/state/AppContext";
import { clipCountForGroup } from "./src/lib/clips";
import { momentsOf } from "./src/data/sports";
import HomeScreen from "./src/screens/HomeScreen";
import GroupScreen from "./src/screens/GroupScreen";
import QueueRecordScreen from "./src/screens/QueueRecordScreen";
import SpontRecordScreen from "./src/screens/SpontRecordScreen";

export default function App() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { groups } = useApp();
  const [route, setRoute] = useState({ name: "home" });
  const [session, setSession] = useState(null);

  const group = session ? groups.find((g) => g.id === session.groupId) : null;

  const openGroup = (g) => {
    setSession({
      groupId: g.id,
      presentIds: [...g.memberIds],
      moment: momentsOf(g)[0],
      tab: "prep",
      filmMode: "spont",
      order: null,
      orderKey: null,
      guestCounter: 0,
    });
    setRoute({ name: "group" });
  };

  const closeGroup = () => {
    setSession(null);
    setRoute({ name: "home" });
  };

  if (route.name === "queue" && group) {
    return (
      <QueueRecordScreen
        order={session.order}
        moment={session.moment}
        group={group}
        onFinish={() => {
          setSession((s) => ({ ...s, tab: "review" }));
          setRoute({ name: "group" });
        }}
      />
    );
  }

  if (route.name === "spont" && group) {
    return (
      <SpontRecordScreen
        player={route.player}
        moment={session.moment}
        group={group}
        onDone={() => setRoute({ name: "group" })}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {route.name === "group" && group ? (
        <GroupScreen
          group={group}
          session={session}
          setSession={setSession}
          onBack={closeGroup}
          onStartSpont={(player) => setRoute({ name: "spont", player })}
          onStartQueue={() => setRoute({ name: "queue" })}
          clipCount={clipCountForGroup(group.id)}
        />
      ) : (
        <HomeScreen openGroup={openGroup} />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
});
