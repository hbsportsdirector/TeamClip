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
import { listClips } from "./src/lib/clips";
import QueueSetupScreen from "./src/screens/QueueSetupScreen";
import QueueRecordScreen from "./src/screens/QueueRecordScreen";
import ClipsScreen from "./src/screens/ClipsScreen";

const seedOrder = [
  { key: "p1", name: "Kalle S", guest: false },
  { key: "p2", name: "Olle B", guest: false },
  { key: "p3", name: "Peter", guest: false },
  { key: "p4", name: "Samuel", guest: false },
];

export default function App() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });

  const [screen, setScreen] = useState("setup");
  const [order, setOrder] = useState(seedOrder);
  const [moment, setMoment] = useState("Kantskott");

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === "record" ? (
        <QueueRecordScreen order={order} moment={moment} onFinish={() => setScreen("clips")} />
      ) : (
        <SafeAreaView style={s.safe}>
          {screen === "setup" && (
            <QueueSetupScreen
              order={order}
              setOrder={setOrder}
              moment={moment}
              setMoment={setMoment}
              onStart={() => setScreen("record")}
              onShowClips={() => setScreen("clips")}
              clipCount={safeClipCount()}
            />
          )}
          {screen === "clips" && <ClipsScreen onBack={() => setScreen("setup")} />}
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

function safeClipCount() {
  try {
    return listClips().length;
  } catch {
    return 0;
  }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
});
