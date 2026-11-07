import { Card } from "@/components/ui/card";
import { ScreenSkeleton } from "@/components/ui/screen-skeleton";
import { StateView } from "@/components/ui/state-view";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ActivityNotification = {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: "teacher" | "student";
  event_type: "account_created" | "profile_updated" | "account_status_changed" | "password_changed";
  title: string;
  details: string;
  created_at: string;
  read_at: string | null;
};

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01" || /admin_activity_notifications.*(not found|does not exist)|could not find the table/i.test(error.message ?? "");
}

export default function AdminNotificationsScreen() {
  const dark = useColorScheme() === "dark";
  const router = useRouter();
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingSetup, setMissingSetup] = useState(false);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("admin_activity_notifications")
      .select("id, actor_id, actor_name, actor_role, event_type, title, details, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (queryError) {
      setMissingSetup(isMissingTable(queryError));
      setError(queryError.message);
    } else {
      setItems((data ?? []) as ActivityNotification[]);
      setError("");
      setMissingSetup(false);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    const run = async () => { if (alive) await load(); };
    void run();
    const channel = supabase.channel("admin-activity-notifications-screen")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_activity_notifications" }, () => { if (alive) void load(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [load]));

  const markRead = async (item: ActivityNotification) => {
    if (item.read_at) return;
    const at = new Date().toISOString();
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: at } : row));
    const { error: updateError } = await supabase.from("admin_activity_notifications").update({ read_at: at }).eq("id", item.id);
    if (updateError) { setError(updateError.message); await load(); }
  };

  const markAllRead = async () => {
    const unread = items.filter((item) => !item.read_at);
    if (!unread.length || updating) return;
    setUpdating(true);
    const at = new Date().toISOString();
    const { error: updateError } = await supabase.from("admin_activity_notifications").update({ read_at: at }).is("read_at", null);
    setUpdating(false);
    if (updateError) setError(updateError.message); else await load();
  };

  const unreadCount = items.filter((item) => !item.read_at).length;

  if (loading) return <ScreenSkeleton />;

  return <SafeAreaView style={[styles.safe, dark && { backgroundColor: "#101A14" }]} edges={["top"]}>
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshing={loading}
      onRefresh={() => void load()}
      ListHeaderComponent={<View style={styles.header}>
        <Pressable onPress={() => router.replace("/admin/home")} accessibilityRole="button" accessibilityLabel="Back to admin dashboard" style={styles.backButton}><Ionicons name="arrow-back" size={20} color={colors.primary} /></Pressable>
        <View style={styles.headingCopy}><Text style={styles.eyebrow}>ADMIN MONITORING</Text><Text style={styles.heading}>Notifications</Text><Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "Teacher and student account activity"}</Text></View>
        {unreadCount ? <Pressable onPress={() => void markAllRead()} disabled={updating} accessibilityRole="button" style={styles.markAll}><Text style={styles.markAllText}>{updating ? "Saving…" : "Mark all read"}</Text></Pressable> : null}
        {error ? <Text style={styles.error}>{missingSetup ? "Activity monitoring needs setup. Run supabase/admin_activity_notifications.sql in your Supabase project." : error}</Text> : null}
      </View>}
      ListEmptyComponent={!loading ? <View style={styles.empty}><Ionicons name="notifications-outline" size={28} color={colors.primary} /><Text style={styles.emptyTitle}>{missingSetup ? "Notifications not enabled" : "No updates yet"}</Text><Text style={styles.emptyCopy}>{missingSetup ? "Run the admin activity SQL migration to start monitoring teacher and student account changes." : "New registrations, profile changes, and password updates will appear here."}</Text></View> : undefined}
      renderItem={({ item }) => <Pressable onPress={() => void markRead(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.read_at ? "read" : "unread"}`}><Card style={item.read_at ? styles.card : [styles.card, styles.unreadCard]}>
        <View style={styles.cardTop}><View style={[styles.iconBox, item.actor_role === "teacher" ? styles.teacherIcon : styles.studentIcon]}><Ionicons name={item.actor_role === "teacher" ? "easel-outline" : "school-outline"} size={18} color={colors.primary} /></View><View style={styles.cardHeading}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.meta}>{item.actor_name} · {item.actor_role === "teacher" ? "Teacher" : "Student"}</Text></View>{!item.read_at ? <View style={styles.unreadDot} /> : null}</View>
        <Text style={styles.details}>{item.details}</Text><Text style={styles.date}>{new Date(item.created_at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
      </Card></Pressable>}
      ListFooterComponent={error && !missingSetup ? <StateView variant="error" title="Could not load updates" message={error} onRetry={() => void load()} /> : undefined}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }, header: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.sm }, backButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, headingCopy: { flex: 1, minWidth: 180 }, eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, heading: { color: colors.textStrong, fontSize: 25, fontWeight: "800", marginTop: 3 }, subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, markAll: { minHeight: 36, justifyContent: "center", paddingHorizontal: 10 }, markAllText: { color: colors.primary, fontSize: 11, fontWeight: "800" }, error: { width: "100%", color: "#A34141", fontSize: 12, lineHeight: 17 }, empty: { alignItems: "center", gap: 9, padding: spacing.xxl, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }, emptyTitle: { color: colors.textStrong, fontSize: 15, fontWeight: "800" }, emptyCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center" }, card: { padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }, unreadCard: { borderColor: "#A6CEAF", backgroundColor: "#FCFFFC" }, cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md }, iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, teacherIcon: { backgroundColor: "#E8F3EB" }, studentIcon: { backgroundColor: "#E8F2F8" }, cardHeading: { flex: 1 }, cardTitle: { color: colors.textStrong, fontSize: 14, fontWeight: "800" }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 }, unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary }, details: { color: colors.textPrimary, fontSize: 12, lineHeight: 18, marginLeft: 54 }, date: { color: colors.textFaint, fontSize: 10, marginLeft: 54, marginTop: 2 } });
