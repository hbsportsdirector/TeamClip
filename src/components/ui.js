import { Text, Pressable, StyleSheet } from "react-native";
import { T, F } from "../theme";

export function SectionLabel({ children, style }) {
  return <Text style={[u.sectionLabel, style]}>{children}</Text>;
}

export function Chip({ label, active, dashed, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={[u.chip, active && u.chipActive, dashed && u.chipDashed, style]}
    >
      <Text style={[u.chipText, active && u.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export const u = StyleSheet.create({
  sectionLabel: {
    color: T.mut,
    fontFamily: F.cond700,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 12,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: T.courtLite,
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipDashed: { borderStyle: "dashed", borderColor: T.dim },
  chipText: { color: T.mut, fontFamily: F.cond700, fontSize: 15, letterSpacing: 0.8 },
  chipTextActive: { color: "#fff" },
  input: {
    flex: 1,
    backgroundColor: "#080E26",
    borderWidth: 1.5,
    borderColor: T.courtLite,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: T.line,
    fontFamily: F.body,
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: T.courtLite,
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  addBtnText: { color: T.accent, fontFamily: F.cond800, fontSize: 22 },
  infoText: { color: T.dim, fontFamily: F.body, fontSize: 13, marginTop: 14, lineHeight: 19 },
});
