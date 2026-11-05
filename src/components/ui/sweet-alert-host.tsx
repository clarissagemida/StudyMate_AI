import {
  registerSweetAlertPresenter,
  type SweetAlertConfig,
  type SweetAlertVariant,
} from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const VARIANT_STYLES: Record<
  SweetAlertVariant,
  { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }
> = {
  success: { icon: "checkmark", color: "#16834A", background: "#E4F6E9" },
  error: { icon: "close", color: "#C53030", background: "#FDE8E8" },
  warning: { icon: "alert", color: "#B7791F", background: "#FFF5D9" },
  info: { icon: "information", color: "#176B45", background: "#E8F3EB" },
};

export function SweetAlertHost() {
  const [alert, setAlert] = useState<SweetAlertConfig | null>(null);

  useEffect(
    () => registerSweetAlertPresenter(setAlert),
    [],
  );

  const dismiss = () => setAlert(null);
  const confirm = () => {
    const current = alert;
    setAlert(null);
    if (!current?.onConfirm) return;
    void Promise.resolve().then(current.onConfirm);
  };

  if (!alert) return null;

  const visual = VARIANT_STYLES[alert.variant];
  const hasCancel = Boolean(alert.cancelLabel);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={styles.dialog}
          accessibilityRole="alert"
        >
          <View style={[styles.icon, { backgroundColor: visual.background }]}>
            <Ionicons name={visual.icon} size={28} color={visual.color} />
          </View>

          <Text style={styles.title}>{alert.title}</Text>
          {alert.message ? (
            <Text style={styles.message}>{alert.message}</Text>
          ) : null}

          <View style={[styles.actions, !hasCancel && styles.singleAction]}>
            {hasCancel ? (
              <Pressable
                onPress={dismiss}
                accessibilityRole="button"
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>{alert.cancelLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirm}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.confirmButton,
                alert.destructive && styles.destructiveButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.confirmText}>{alert.confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15, 35, 24, 0.48)",
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EEE8",
    shadowColor: "#0E2C1E",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  icon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 31,
    marginBottom: 15,
  },
  title: {
    color: "#173A27",
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: "#64756B",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 9,
  },
  actions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },
  singleAction: { justifyContent: "center" },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE7E0",
    backgroundColor: "#F7FAF8",
    paddingHorizontal: 12,
  },
  confirmButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#176B45",
    paddingHorizontal: 12,
  },
  destructiveButton: { backgroundColor: "#C53030" },
  cancelText: { color: "#52645A", fontSize: 13, fontWeight: "700" },
  confirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
