import { changePassword } from "@/utils/changePassword";
import { evaluatePasswordStrength, isPasswordStrongEnough } from "@/utils/passwordStrength";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export function ChangePasswordModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: (message: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const strength = evaluatePasswordStrength(newPassword);
  const strengthColor = strength.label === "weak" ? "#C53030" : strength.label === "good" ? "#D49B35" : colors.primary;
  const characterTypeCount = [strength.criteria.hasUppercase, strength.criteria.hasLowercase, strength.criteria.hasNumber, strength.criteria.hasSpecial].filter(Boolean).length;
  const strengthProgress = strength.label === "strong" ? 100 : Math.min(82, Math.max(8, newPassword.length * 8));

  const close = () => {
    if (saving) return;
    setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setError(""); onClose();
  };

  const submit = async () => {
    setError("");
    if (!currentPassword) return setError("Enter your current password.");
    if (!isPasswordStrongEnough(newPassword)) return setError("Use at least 8 characters and include a mix of uppercase, lowercase, numbers, and symbols.");
    if (newPassword !== confirmation) return setError("Your new passwords do not match.");
    setSaving(true);
    try {
      const result = await changePassword({ currentPassword, newPassword, confirmPassword: confirmation });
      if (!result.ok) throw new Error(result.message);
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      onClose();
      onSuccess(result.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update your password. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const passwordField = (label: string, value: string, change: (text: string) => void, visiblePassword: boolean, toggle: () => void, placeholder: string) => <View style={styles.fieldGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <TextInput value={value} onChangeText={(text) => { change(text); if (error) setError(""); }} secureTextEntry={!visiblePassword} autoCapitalize="none" autoCorrect={false} editable={!saving} returnKeyType="next" placeholder={placeholder} placeholderTextColor="#98A49C" style={styles.input} />
      <Pressable onPress={toggle} disabled={saving} hitSlop={10} accessibilityRole="button" accessibilityLabel={visiblePassword ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}><Ionicons name={visiblePassword ? "eye-off-outline" : "eye-outline"} size={19} color="#718078" /></Pressable>
    </View>
  </View>;

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close change password dialog" />
      <View style={styles.sheet}>
        <View style={styles.headingRow}><View style={styles.keyIcon}><Ionicons name="key-outline" size={20} color={colors.primary} /></View><View style={styles.headingCopy}><Text style={styles.title}>Change password</Text><Text style={styles.subtitle}>Your new password is saved securely by Supabase Auth.</Text></View><Pressable onPress={close} disabled={saving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={22} color="#718078" /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          {passwordField("Current password", currentPassword, setCurrentPassword, showCurrent, () => setShowCurrent((value) => !value), "Enter current password")}
          {passwordField("New password", newPassword, setNewPassword, showNew, () => setShowNew((value) => !value), "Create a strong password")}
          {newPassword ? <View style={styles.strengthBox}><View style={styles.strengthHeading}><Text style={[styles.strengthText, { color: strengthColor }]}>Password strength: {strength.label}</Text><Ionicons name={strength.label === "strong" ? "checkmark-circle" : strength.label === "good" ? "remove-circle" : "alert-circle"} size={16} color={strengthColor} /></View><View style={styles.strengthTrack}><View style={[styles.strengthFill, { width: `${strengthProgress}%`, backgroundColor: strengthColor }]} /></View><Text style={styles.help}>{strength.label === "weak" ? "Keep typing; 4 or more characters will show Good." : strength.label === "good" ? characterTypeCount < 3 || !strength.criteria.minLength ? "Add at least 8 characters and 3 character types to enable the update." : "Good password. Add one more character type for Strong." : "Strong password. Your password meets the update requirements."}</Text></View> : null}
          {passwordField("Confirm new password", confirmation, setConfirmation, showConfirmation, () => setShowConfirmation((value) => !value), "Enter new password again")}
          {confirmation ? <Text style={[styles.confirmationStatus, { color: newPassword === confirmation ? colors.primary : "#C53030" }]}>{newPassword === confirmation ? "Passwords match" : "Passwords do not match"}</Text> : null}
          <Text style={styles.privacyNote}>Administrators are notified that your password changed. Your password is never included in that notification.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => void submit()} disabled={saving || !currentPassword || !isPasswordStrongEnough(newPassword) || newPassword !== confirmation} style={({ pressed }) => [styles.submit, pressed && styles.pressed, (saving || !currentPassword || !isPasswordStrongEnough(newPassword) || newPassword !== confirmation) && styles.disabled]} accessibilityRole="button">
            <Ionicons name={saving ? "time-outline" : "checkmark-circle-outline"} size={18} color="#FFFFFF" /><Text style={styles.submitText}>{saving ? "Updating password…" : "Update password"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(14, 32, 22, 0.52)" }, sheet: { width: "100%", maxWidth: 480, maxHeight: "90%", alignSelf: "center", borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg, elevation: 16 }, headingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, keyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, headingCopy: { flex: 1 }, title: { color: colors.textStrong, fontSize: 17, fontWeight: "800" }, subtitle: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 }, form: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm }, fieldGroup: { gap: 6 }, label: { color: colors.textMuted, fontSize: 11, fontWeight: "700" }, inputRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: "#FAFCFA" }, input: { flex: 1, minWidth: 0, minHeight: 46, color: colors.textPrimary, fontSize: 13 }, strengthBox: { gap: 6, padding: 11, borderRadius: radius.md, backgroundColor: "#F3F8F4" }, strengthHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, strengthText: { color: colors.textPrimary, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }, strengthTrack: { height: 6, overflow: "hidden", borderRadius: 4, backgroundColor: "#E0E8E2" }, strengthFill: { height: "100%", borderRadius: 4 }, help: { color: colors.textMuted, fontSize: 10, lineHeight: 15 }, confirmationStatus: { fontSize: 11, fontWeight: "700", marginTop: -spacing.sm }, privacyNote: { color: colors.textMuted, fontSize: 10, lineHeight: 15 }, error: { color: "#B33A3A", fontSize: 11, lineHeight: 16 }, submit: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, submitText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, pressed: { opacity: 0.84 }, disabled: { opacity: 0.5 } });
