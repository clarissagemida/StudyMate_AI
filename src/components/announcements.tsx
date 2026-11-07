import { supabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { showNotice } from "@/utils/notify";

type Announcement = { id: string; teacher_id: string; title: string; body: string; created_at: string };

export function Announcements({ role }: { role: "teacher" | "student" }) {
  const router = useRouter();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);
    const { data, error: queryError } = await supabase.from("announcements").select("id, teacher_id, title, body, created_at").order("created_at", { ascending: false }).limit(50);
    if (queryError) setError(queryError.message); else { setRows((data ?? []) as Announcement[]); setError(""); }
    if (role === "student" && user) {
      const { data: reads } = await supabase.from("announcement_reads").select("announcement_id").eq("student_id", user.id);
      setReadIds(new Set((reads ?? []).map((read) => read.announcement_id)));
    }
    setLoading(false);
  }, [role]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (role !== "student") return;
    const channel = supabase.channel("student-announcements-list").on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => { void load(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, role]);
  const markRead = async (item: Announcement) => {
    if (role !== "student" || !userId || readIds.has(item.id)) return;
    setReadIds((current) => new Set(current).add(item.id));
    const { error: readError } = await supabase.from("announcement_reads").insert({ announcement_id: item.id, student_id: userId });
    if (readError) {
      setReadIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
      setError(readError.message);
    }
  };
  const resetForm = () => { setTitle(""); setBody(""); setEditingId(null); setError(""); };
  const startEdit = (item: Announcement) => { setEditingId(item.id); setTitle(item.title); setBody(item.body); setError(""); };
  const publish = async () => {
    if (title.trim().length < 2 || !body.trim() || saving || !userId) return;
    setSaving(true);
    const result = editingId
      ? await supabase.from("announcements").update({ title: title.trim(), body: body.trim() }).eq("id", editingId).eq("teacher_id", userId)
      : await supabase.from("announcements").insert({ teacher_id: userId, title: title.trim(), body: body.trim() });
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    const wasEditing = Boolean(editingId);
    resetForm();
    await load();
    showNotice(wasEditing ? "Announcement updated successfully" : "Announcement published successfully", wasEditing ? "Your changes are now visible to students." : "Your update is now available to students.");
  };
  const remove = (item: Announcement) => Alert.alert("Delete announcement?", "This announcement will be removed for students.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => { const { error: deleteError } = await supabase.from("announcements").delete().eq("id", item.id).eq("teacher_id", userId); if (deleteError) setError(deleteError.message); else { await load(); showNotice("Announcement deleted", "The announcement has been removed for students."); } } },
  ]);
  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <FlatList data={rows} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} refreshing={loading} onRefresh={() => void load()}
      ListHeaderComponent={<View><View style={styles.pageHeader}><Pressable onPress={() => router.replace(role === "teacher" ? "/teacher" : "/student")} accessibilityRole="button" accessibilityLabel="Back to dashboard" style={styles.backButton}><Ionicons name="arrow-back" size={20} color={colors.primary} /></Pressable><View style={styles.headingCopy}><Text style={styles.eyebrow}>STUDYMATE AI</Text><Text style={styles.heading}>Announcements</Text></View></View><Text style={styles.subheading}>{role === "teacher" ? "Share important updates with your students." : "Updates from your teachers."}</Text>{role === "teacher" ? <View style={styles.form}><View style={styles.formHeading}><View style={styles.formHeadingText}><Text style={styles.label}>{editingId ? "EDIT ANNOUNCEMENT" : "NEW ANNOUNCEMENT"}</Text><Text style={styles.formHint}>{editingId ? "Update the details students will see." : "Write a clear, helpful update for your class."}</Text></View>{editingId ? <Pressable onPress={resetForm} disabled={saving} style={styles.cancelEdit} accessibilityRole="button"><Text style={styles.cancelEditText}>Cancel</Text></Pressable> : null}</View><TextInput value={title} onChangeText={(value) => { setTitle(value); setError(""); }} maxLength={120} placeholder="Announcement title" placeholderTextColor="#98A49C" style={styles.input} accessibilityLabel="Announcement title" /><Text style={styles.counter}>{title.length}/120</Text><TextInput value={body} onChangeText={(value) => { setBody(value); setError(""); }} maxLength={4000} multiline placeholder="Write a clear update for your students…" placeholderTextColor="#98A49C" style={[styles.input, styles.body]} accessibilityLabel="Announcement message" /><Text style={styles.counter}>{body.length}/4000</Text><Pressable onPress={() => void publish()} disabled={saving || title.trim().length < 2 || !body.trim()} style={[styles.publish, (saving || title.trim().length < 2 || !body.trim()) && styles.disabled]}><Ionicons name={saving ? "time-outline" : editingId ? "checkmark-circle-outline" : "send-outline"} size={17} color="#fff" /><Text style={styles.publishText}>{saving ? (editingId ? "Saving changes…" : "Publishing…") : editingId ? "Save changes" : "Publish announcement"}</Text></Pressable></View> : null}{error ? <Text style={styles.error}>{error.includes("announcements") && (error.includes("schema cache") || error.includes("does not exist")) ? "Announcements need to be enabled. Run supabase/announcements.sql in your Supabase project." : error}</Text> : null}</View>}
      ListEmptyComponent={!loading ? <View style={styles.empty}><Ionicons name="megaphone-outline" size={28} color={colors.primary} /><Text style={styles.emptyTitle}>No announcements yet</Text><Text style={styles.emptyCopy}>{role === "teacher" ? "Publish an update to keep your students informed." : "Teacher updates will appear here."}</Text></View> : undefined}
      renderItem={({ item }) => <Pressable onPress={() => void markRead(item)} accessibilityRole={role === "student" ? "button" : undefined} style={[styles.card, role === "student" && !readIds.has(item.id) && styles.unreadCard]}><View style={styles.cardTop}><View style={styles.badge}><Ionicons name="megaphone-outline" size={17} color={colors.primary} /></View><View style={styles.cardHeading}><Text style={styles.cardTitle}>{item.title}</Text><View style={styles.metadataRow}><Text style={styles.date}>{new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</Text>{role === "teacher" ? <Text style={styles.publishedTag}>PUBLISHED</Text> : null}</View></View>{role === "student" && !readIds.has(item.id) ? <View style={styles.unreadDot} /> : null}</View><Text style={styles.copy}>{item.body}</Text>{role === "teacher" && item.teacher_id === userId ? <View style={styles.cardActions}><Pressable onPress={() => startEdit(item)} style={styles.editAction} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`}><Ionicons name="create-outline" size={16} color={colors.primary} /><Text style={styles.editActionText}>Edit announcement</Text></Pressable><Pressable onPress={() => remove(item)} hitSlop={10} style={styles.deleteAction} accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`}><Ionicons name="trash-outline" size={17} color="#B33A3A" /></Pressable></View> : null}</Pressable>}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1 }, eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  heading: { color: colors.textStrong, fontSize: 25, fontWeight: "800", marginTop: 3 },
  subheading: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: spacing.md },
  form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  formHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: 2 },
  formHeadingText: { flex: 1, gap: 4 }, label: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  formHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  cancelEdit: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.md, backgroundColor: "#F1F5F2" },
  cancelEditText: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.textPrimary, fontSize: 14, backgroundColor: "#FCFDFC" },
  body: { minHeight: 110, textAlignVertical: "top", paddingTop: 12 }, counter: { color: colors.textMuted, fontSize: 10, textAlign: "right", marginTop: -spacing.xs },
  publish: { height: 46, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 3 },
  publishText: { color: "#fff", fontSize: 13, fontWeight: "800" }, disabled: { opacity: 0.5 },
  error: { color: "#B33A3A", fontSize: 12, marginBottom: 8 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.textStrong, fontWeight: "800", fontSize: 15 }, emptyCopy: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  unreadCard: { borderColor: colors.primary, backgroundColor: "#F6FBF7" }, unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md }, badge: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  cardHeading: { flex: 1, gap: 4 }, cardTitle: { color: colors.textStrong, fontSize: 15, fontWeight: "800" },
  metadataRow: { flexDirection: "row", alignItems: "center", gap: 8 }, date: { color: colors.textMuted, fontSize: 11 },
  publishedTag: { color: colors.primary, backgroundColor: colors.primarySoft, overflow: "hidden", fontSize: 8, fontWeight: "900", letterSpacing: 0.7, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7 },
  copy: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  editAction: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  editActionText: { color: colors.primary, fontSize: 12, fontWeight: "800" }, deleteAction: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: "#FFF1F0" },
});
