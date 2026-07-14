import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { T, F } from "../theme";

// Ersätter systemets Alert.alert med en dialog i appens formspråk.
// dialog = { title, message, confirmLabel, destructive, onConfirm }
export default function ConfirmDialog({ dialog, onClose }) {
  if (!dialog) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={s.message}>{dialog.message}</Text> : null}
          <View style={s.row}>
            <Pressable onPress={onClose} style={s.cancelBtn} hitSlop={6}>
              <Text style={s.cancelText}>Avbryt</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onClose();
                dialog.onConfirm();
              }}
              style={[s.confirmBtn, dialog.destructive && s.confirmBtnDestructive]}
              hitSlop={6}
            >
              <Text style={s.confirmText}>{dialog.confirmLabel ?? "OK"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4,7,20,0.75)",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    backgroundColor: T.courtLite,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#2C3C7E",
  },
  title: { color: T.line, fontFamily: F.cond800, fontSize: 24 },
  message: { color: T.mut, fontFamily: F.body, fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 20 },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.court,
  },
  cancelText: { color: T.mut, fontFamily: F.body600, fontSize: 14 },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: T.accent,
  },
  confirmBtnDestructive: { backgroundColor: T.accentDeep },
  confirmText: { color: "#fff", fontFamily: F.body600, fontSize: 14 },
});
