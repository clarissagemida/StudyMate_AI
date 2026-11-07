import { ScreenSkeleton } from "@/components/ui/screen-skeleton";
import { supabase } from "@/lib/supabase";
import { AdminThemePreference, loadAdminTheme, saveAdminTheme } from "@/utils/adminTheme";
import { showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";

const GREEN = "#176B45";

export default function AdminSettingsScreen() {
  const systemScheme = useColorScheme();
  const dark = systemScheme === "dark";
  const palette = dark ? { bg: "#101A14", card: "#19251D", line: "#2B3A30", text: "#F1F5F2", muted: "#A4B3A8", soft: "#23372A" } : { bg: "#F4F8F5", card: "#FFFFFF", line: "#E5EDE7", text: "#20392B", muted: "#758479", soft: "#E8F3EB" };
  const styles = makeStyles(palette);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [preference, setPreference] = useState<AdminThemePreference>("system");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([loadAdminTheme(), supabase.auth.getUser()]).then(async ([theme, auth]) => {
      if (!active) return;
      setPreference(theme);
      if (auth.error || !auth.data.user) { router.replace("/login"); return; }
      const user = auth.data.user;
      setUserId(user.id);
      setEmail(user.email ?? "");
      const { data, error } = await supabase.from("profiles").select("full_name, role, approval_status").eq("id", user.id).maybeSingle();
      if (!active) return;
      if (error) showNotice("Profile Error", error.message);
      else if (!data || data.role !== "admin" || data.approval_status !== "approved") router.replace("/login");
      else setName(data.full_name ?? "");
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      console.error("Settings load error:", error);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function chooseTheme(value: AdminThemePreference) {
    setPreference(value);
    await saveAdminTheme(value);
  }

  async function saveProfile() {
    const value = name.trim();
    if (!value) return showNotice("Name Required", "Please enter your full name.");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: value }).eq("id", userId);
    setSaving(false);
    if (error) showNotice("Save Failed", error.message);
    else { setName(value); setEditing(false); showNotice("Profile Updated", "Your name has been saved."); }
  }

  if (loading) return <ScreenSkeleton />;

  const choices: { value: AdminThemePreference; label: string; description: string; icon: "phone-portrait-outline" | "sunny-outline" | "moon-outline" }[] = [
    { value: "system", label: "System", description: "Match your device setting", icon: "phone-portrait-outline" },
    { value: "light", label: "Light", description: "Bright and clear", icon: "sunny-outline" },
    { value: "dark", label: "Dark", description: "Comfortable in low light", icon: "moon-outline" },
  ];

  return <SafeAreaView style={styles.safe} edges={["bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View style={styles.headerIcon}><Ionicons name="options-outline" size={23} color={GREEN} /></View><View style={styles.headerCopy}><Text style={styles.eyebrow}>ADMINISTRATION</Text><Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>Manage your profile and personalize your workspace.</Text></View></View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Administrator account</Text><Text style={styles.sectionHint}>Your personal details and access information</Text></View><Pressable onPress={() => editing ? void saveProfile() : setEditing(true)} disabled={saving} style={styles.textAction}><Text style={styles.actionText}>{saving ? "Saving…" : editing ? "Save" : "Edit"}</Text></Pressable></View>
      <View style={styles.card}>
        <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{(name.trim()[0] || "A").toUpperCase()}</Text></View><View style={styles.identityCopy}><Text style={styles.name}>{name || "Administrator"}</Text><Text style={styles.email}>{email}</Text><View style={styles.rolePill}><Ionicons name="shield-checkmark" size={12} color={GREEN} /><Text style={styles.roleText}>ADMINISTRATOR</Text></View></View></View>
        <View style={styles.divider} />
        <Text style={styles.fieldLabel}>Full name</Text>
        <TextInput value={name} onChangeText={setName} editable={editing && !saving} placeholder="Your full name" placeholderTextColor={palette.muted} style={[styles.input, !editing && styles.readonly]} returnKeyType="done" />
        <Text style={styles.fieldLabel}>Email address</Text>
        <View style={[styles.input, styles.readonly, styles.emailRow]}><Text numberOfLines={1} style={styles.emailValue}>{email || "No email on file"}</Text><Ionicons name="lock-closed-outline" size={15} color={palette.muted} /></View>
        <Text style={styles.helper}>Your sign-in email is managed by authentication settings.</Text>
      </View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Appearance</Text><Text style={styles.sectionHint}>Choose how StudyMate looks on this device</Text></View></View>
      <View style={styles.card}>{choices.map((choice, index) => <Pressable key={choice.value} onPress={() => void chooseTheme(choice.value)} accessibilityRole="radio" accessibilityState={{ checked: preference === choice.value }} style={[styles.themeOption, index > 0 && styles.themeDivider]}><View style={styles.themeIcon}><Ionicons name={choice.icon} size={19} color={GREEN} /></View><View style={styles.themeCopy}><Text style={styles.themeLabel}>{choice.label}</Text><Text style={styles.themeDescription}>{choice.description}</Text></View><View style={[styles.radio, preference === choice.value && styles.radioSelected]}>{preference === choice.value ? <View style={styles.radioDot} /> : null}</View></Pressable>)}</View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>About</Text><Text style={styles.sectionHint}>Application information</Text></View></View>
      <View style={styles.card}><View style={styles.aboutRow}><View style={styles.aboutIcon}><Ionicons name="school-outline" size={19} color={GREEN} /></View><View style={styles.aboutCopy}><Text style={styles.aboutTitle}>StudyMate AI</Text><Text style={styles.aboutSubtitle}>Version 1.0.0 · Administrator workspace</Text></View><Ionicons name="checkmark-circle" size={18} color={GREEN} /></View></View>
      <Text style={styles.footer}>Settings are saved on this device. Your account remains protected by your administrator role.</Text>
    </ScrollView>
  </SafeAreaView>;
}

function makeStyles(p: { bg: string; card: string; line: string; text: string; muted: string; soft: string }) {
  return StyleSheet.create({ safe: { flex: 1, backgroundColor: p.bg }, center: { alignItems: "center", justifyContent: "center" }, content: { padding: 20, paddingBottom: 38, gap: 12 }, header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 }, headerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: p.soft, alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1 }, eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: GREEN }, title: { marginTop: 3, color: p.text, fontSize: 25, fontWeight: "800" }, subtitle: { marginTop: 4, color: p.muted, fontSize: 12, lineHeight: 18 }, sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }, sectionTitle: { color: p.text, fontSize: 15, fontWeight: "800" }, sectionHint: { color: p.muted, fontSize: 11, marginTop: 3 }, textAction: { minWidth: 52, minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 11, backgroundColor: p.soft }, actionText: { color: GREEN, fontSize: 12, fontWeight: "800" }, card: { backgroundColor: p.card, borderWidth: 1, borderColor: p.line, borderRadius: 18, padding: 16, gap: 10 }, identity: { flexDirection: "row", alignItems: "center", gap: 13, paddingBottom: 5 }, avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: p.soft, alignItems: "center", justifyContent: "center" }, avatarText: { color: GREEN, fontSize: 24, fontWeight: "800" }, identityCopy: { flex: 1 }, name: { color: p.text, fontSize: 16, fontWeight: "800" }, email: { color: p.muted, fontSize: 12, marginTop: 3 }, rolePill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: p.soft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, marginTop: 8 }, roleText: { color: GREEN, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 }, divider: { height: 1, backgroundColor: p.line, marginVertical: 2 }, fieldLabel: { color: p.muted, fontSize: 11, fontWeight: "700", marginTop: 3 }, input: { minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: 12, paddingHorizontal: 12, color: p.text, fontSize: 13, backgroundColor: p.card }, readonly: { backgroundColor: p.bg }, emailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, emailValue: { flex: 1, color: p.text, fontSize: 13 }, helper: { color: p.muted, fontSize: 10, lineHeight: 15, marginTop: -3 }, themeOption: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12 }, themeDivider: { borderTopWidth: 1, borderTopColor: p.line, paddingTop: 10 }, themeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: p.soft, alignItems: "center", justifyContent: "center" }, themeCopy: { flex: 1 }, themeLabel: { color: p.text, fontSize: 13, fontWeight: "800" }, themeDescription: { color: p.muted, fontSize: 11, marginTop: 3 }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: p.muted, alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: GREEN }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN }, aboutRow: { flexDirection: "row", alignItems: "center", gap: 12 }, aboutIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: p.soft, alignItems: "center", justifyContent: "center" }, aboutCopy: { flex: 1 }, aboutTitle: { color: p.text, fontSize: 13, fontWeight: "800" }, aboutSubtitle: { color: p.muted, fontSize: 11, marginTop: 3 }, footer: { color: p.muted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 6, paddingHorizontal: 12 } });
}
