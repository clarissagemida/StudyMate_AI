import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ThemedSafeAreaView as SafeAreaView } from "@/components/themed-safe-area-view";

type Contact = { id: string; full_name: string | null; avatar_path: string | null };
type UnreadConversation = { studentId: string; name: string; avatarUrl: string | null; body: string; createdAt: string; count: number };
let channelSequence = 0;

export default function TeacherNotificationsScreen() {
  const [items, setItems] = useState<UnreadConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Please sign in again to view notifications.");
    const [contactsResult, messagesResult, reactionsResult] = await Promise.all([
      supabase.rpc("teacher_chat_contacts_with_photos"),
      supabase.from("teacher_student_messages")
        .select("id, student_id, body, created_at")
        .eq("teacher_id", user.id).neq("sender_id", user.id).is("read_at", null)
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("teacher_student_message_reactions")
        .select("message_id, emoji, created_at")
        .eq("recipient_id", user.id).is("read_at", null)
        .order("created_at", { ascending: false }).limit(500),
    ]);
    if (contactsResult.error) throw new Error(contactsResult.error.message);
    if (messagesResult.error) throw new Error(messagesResult.error.message);
    if (reactionsResult.error) throw new Error(reactionsResult.error.message);
    const contacts = new Map<string, Contact>((contactsResult.data ?? []).map((row: Contact) => [row.id, row]));
    const signedUrls = new Map<string, string | null>();
    await Promise.all(Array.from(contacts.values()).map(async (contact) => {
      if (!contact.avatar_path) { signedUrls.set(contact.id, null); return; }
      const { data, error: urlError } = await supabase.storage.from("profile-photos").createSignedUrl(contact.avatar_path, 3600);
      signedUrls.set(contact.id, urlError ? null : data.signedUrl);
    }));
    const grouped = new Map<string, { body: string; createdAt: string; count: number }>();
    for (const message of messagesResult.data ?? []) {
      const current = grouped.get(message.student_id);
      grouped.set(message.student_id, {
        body: current?.body ?? message.body,
        createdAt: current?.createdAt ?? message.created_at,
        count: (current?.count ?? 0) + 1,
      });
    }
    const reactionMessageIds = [...new Set((reactionsResult.data ?? []).map((reaction) => reaction.message_id))];
    if (reactionMessageIds.length) {
      const { data: reactedMessages, error: reactedMessagesError } = await supabase.from("teacher_student_messages")
        .select("id, student_id, body, created_at").in("id", reactionMessageIds);
      if (reactedMessagesError) throw new Error(reactedMessagesError.message);
      const byId = new Map((reactedMessages ?? []).map((message) => [message.id, message]));
      for (const reaction of reactionsResult.data ?? []) {
        const message = byId.get(reaction.message_id);
        if (!message) continue;
        const current = grouped.get(message.student_id);
        const reactionDate = reaction.created_at;
        const isLatest = !current || reactionDate > current.createdAt;
        grouped.set(message.student_id, {
          body: isLatest ? `Reacted ${reaction.emoji} to your message` : current.body,
          createdAt: isLatest ? reactionDate : current.createdAt,
          count: (current?.count ?? 0) + 1,
        });
      }
    }
    setItems(Array.from(grouped.entries()).map(([studentId, message]) => ({
      studentId,
      name: contacts.get(studentId)?.full_name?.trim() || "Student",
      avatarUrl: signedUrls.get(studentId) ?? null,
      ...message,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => { void load().catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load notifications."); }).finally(() => { if (active) setLoading(false); }); };
    refresh();
    channelSequence += 1;
    const channel = supabase.channel(`teacher-message-notifications-${Date.now()}-${channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_student_messages" }, refresh)
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [load]);

  const formatDate = (value: string) => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>TEACHER WORKSPACE</Text><Text style={styles.title}>Notifications</Text></View>
      <View style={styles.headerIcon}><Ionicons name="notifications-outline" size={19} color={colors.primary} /></View>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.subtitle}>New messages and reactions from students appear here. Open a conversation to clear its notifications.</Text>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Unread messages and reactions</Text><Text style={styles.count}>{items.reduce((total, item) => total + item.count, 0)}</Text></View>
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Checking for new messages…</Text></View> : null}
      {error ? <Card style={styles.emptyCard}><Ionicons name="alert-circle-outline" size={19} color={colors.danger} /><Text style={styles.emptyText}>{error}</Text><Pressable onPress={() => { setLoading(true); void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load notifications.")).finally(() => setLoading(false)); }} accessibilityRole="button"><Text style={styles.retry}>Retry</Text></Pressable></Card> : null}
      {!loading && !error && items.length === 0 ? <Card style={styles.emptyCard}><Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} /><Text style={styles.emptyText}>You’re all caught up. New student messages will appear here.</Text></Card> : null}
      {items.map((item) => <Pressable key={item.studentId} onPress={() => router.push({ pathname: "/teacher/messages", params: { contactId: item.studentId } } as never)} style={({ pressed }) => [styles.messageCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Open ${item.name}'s conversation, ${item.count} unread messages`}>
        <View style={styles.avatar}>{item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>}</View>
        <View style={styles.messageCopy}><View style={styles.messageTop}><Text style={styles.studentName} numberOfLines={1}>{item.name}</Text><Text style={styles.date}>{formatDate(item.createdAt)}</Text></View><Text style={styles.preview} numberOfLines={2}>{item.body}</Text></View>
        <View style={styles.unreadBadge}><Text style={styles.unreadText}>{item.count > 99 ? "99+" : item.count}</Text></View>
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  headerCopy: { flex: 1 }, eyebrow: { color: colors.primary, fontSize: 9, fontWeight: "800", letterSpacing: 1.3 }, title: { color: colors.textStrong, fontSize: 18, fontWeight: "800", marginTop: 2 },
  headerIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm }, subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm, marginBottom: 2 }, sectionTitle: { flex: 1, color: colors.textStrong, fontSize: 15, fontWeight: "800" },
  count: { minWidth: 24, height: 24, textAlign: "center", overflow: "hidden", paddingHorizontal: 6, paddingTop: 4, borderRadius: 12, color: colors.primary, backgroundColor: colors.primarySoft, fontSize: 10, fontWeight: "800" },
  loading: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  messageCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed: { opacity: 0.75 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, overflow: "hidden" }, avatarImage: { width: "100%", height: "100%" }, avatarText: { color: colors.primary, fontSize: 16, fontWeight: "800" },
  messageCopy: { flex: 1, gap: 5 }, messageTop: { flexDirection: "row", alignItems: "center", gap: 7 }, studentName: { flex: 1, color: colors.textStrong, fontSize: 13, fontWeight: "800" }, date: { color: colors.textFaint, fontSize: 9 }, preview: { color: colors.textPrimary, fontSize: 11, lineHeight: 16 },
  unreadBadge: { minWidth: 21, height: 21, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }, unreadText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md }, emptyText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 }, retry: { color: colors.primary, fontSize: 11, fontWeight: "800" },
});
