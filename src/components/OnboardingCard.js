import { View, Text, Pressable, StyleSheet } from "react-native";
import { T, F } from "../theme";

// Levande kom-igång-checklista på hemskärmen: bockar av sig själv i takt
// med att tränaren kommer igång och försvinner när allt är klart (eller
// döljs manuellt). Nästa ogjorda steg är markerat.
export default function OnboardingCard({ steps, onDismiss }) {
  const allDone = steps.every((s) => s.done);
  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={s.title}>{allDone ? "Du är igång! 🎉" : "Kom igång"}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onDismiss} hitSlop={10}>
          <Text style={s.dismiss}>Dölj</Text>
        </Pressable>
      </View>
      {allDone ? (
        <Text style={s.doneText}>
          Hela flödet funkar: filma, granska, dela. Lycka till på passet!
        </Text>
      ) : (
        steps.map((step, i) => {
          const active = i === activeIdx;
          return (
            <Pressable
              key={step.title}
              onPress={step.onPress}
              disabled={!step.onPress || step.done}
              style={[s.row, active && s.rowActive]}
            >
              <View style={[s.num, step.done && s.numDone, active && s.numActive]}>
                <Text style={s.numText}>{step.done ? "✓" : i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.stepTitle, step.done && s.stepDone]}>{step.title}</Text>
                {active && <Text style={s.hint}>{step.hint}</Text>}
              </View>
              {active && step.onPress && <Text style={s.arrow}>›</Text>}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: T.courtLite,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2C3C7E",
  },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 22 },
  dismiss: { color: T.dim, fontFamily: F.body600, fontSize: 13 },
  doneText: { color: T.green, fontFamily: F.body, fontSize: 14, marginTop: 8, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 4,
  },
  rowActive: { backgroundColor: T.court },
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.dim,
    alignItems: "center",
    justifyContent: "center",
  },
  numActive: { borderColor: T.accent, backgroundColor: T.accent },
  numDone: { borderColor: T.green, backgroundColor: T.green },
  numText: { color: "#fff", fontFamily: F.cond700, fontSize: 14 },
  stepTitle: { color: T.line, fontFamily: F.body600, fontSize: 14.5 },
  stepDone: { color: T.dim, textDecorationLine: "line-through" },
  hint: { color: T.mut, fontFamily: F.body, fontSize: 12.5, marginTop: 2, lineHeight: 18 },
  arrow: { color: T.accent, fontSize: 22, fontFamily: F.cond700 },
});
