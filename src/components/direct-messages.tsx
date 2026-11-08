import { supabase } from "@/lib/supabase";
import { useRequireRole } from "@/hooks/useRequireRole";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { ThemedSafeAreaView as SafeAreaView } from "@/components/themed-safe-area-view";

type Role = "teacher" | "student";
type Contact = { id: string; full_name: string; avatar_url: string | null };
type Message = { id: string; sender_id: string; body: string; created_at: string; delivered_at: string | null; read_at: string | null };
type Conversation = Contact & { latest: Message | null; unread: number };
type MessageReaction = { emoji: string; count: number; reactedByMe: boolean };

const GREEN = "#176B45";
const PALE = "#F4F8F5";
const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢"];

function isSameMessageDay(first: string | Date, second: string | Date) {
  const a = typeof first === "string" ? new Date(first) : first;
  const b = typeof second === "string" ? new Date(second) : second;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMessageDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameMessageDay(date, today)) return "Today";
  if (isSameMessageDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function DirectMessages({ role }: { role: Role }) {
  const dark = useColorScheme() === "dark";
  const guard = useRequireRole(role);
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const requestedContactId = typeof params.contactId === "string" ? params.contactId : "";
  const [userId, setUserId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<Record<string, MessageReaction[]>>({});
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [reactionBusy, setReactionBusy] = useState(false);
  const messageListRef = useRef<FlatList<Message>>(null);
  const nearBottomRef = useRef(true);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadInbox = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Your session has expired. Please sign in again.");
    setUserId(user.id);
    const rpc = role === "teacher" ? "teacher_chat_contacts_with_photos" : "student_chat_contacts_with_photos";
    const { data, error: contactError } = await supabase.rpc(rpc);
    if (contactError) throw new Error(contactError.message);
    const contacts: Contact[] = await Promise.all((data ?? []).map(async (row: Record<string, unknown>) => {
      const path = typeof row.avatar_path === "string" ? row.avatar_path : "";
      const signed = path ? await supabase.storage.from("profile-photos").createSignedUrl(path, 3600) : null;
      return {
        id: String(row.id), full_name: typeof row.full_name === "string" ? row.full_name : role === "teacher" ? "Student" : "Teacher",
        avatar_url: signed && !signed.error ? signed.data.signedUrl : null,
      };
    }));
    if (!contacts.length) { setConversations([]); return; }
    const contactIds = contacts.map((contact) => contact.id);
    const pairColumn = role === "teacher" ? "student_id" : "teacher_id";
    const { data: rows, error: messagesError } = await supabase.from("teacher_student_messages")
      .select("id, sender_id, body, created_at, delivered_at, read_at, teacher_id, student_id")
      .eq(role === "teacher" ? "teacher_id" : "student_id", user.id)
      .in(pairColumn, contactIds)
      .order("created_at", { ascending: false });
    if (messagesError) throw new Error(messagesError.message);
    const receivedIds = (rows ?? []).filter((row) => row.sender_id !== user.id && !row.delivered_at).map((row) => row.id);
    if (receivedIds.length) {
      const { error: deliveryError } = await supabase.rpc("mark_chat_messages_delivered", { p_message_ids: receivedIds });
      if (deliveryError) throw new Error(deliveryError.message);
    }
    const grouped = new Map<string, Message[]>();
    for (const row of rows ?? []) {
      const contactId = role === "teacher" ? row.student_id : row.teacher_id;
      const group = grouped.get(contactId) ?? [];
      group.push(row as Message);
      grouped.set(contactId, group);
    }
    const next = contacts.map((contact) => {
      const thread = grouped.get(contact.id) ?? [];
      return { ...contact, latest: thread[0] ?? null, unread: thread.filter((message) => message.sender_id !== user.id && !message.read_at).length };
    }).sort((a, b) => (b.latest?.created_at ?? "").localeCompare(a.latest?.created_at ?? ""));
    setConversations(next);
    if (requestedContactId) {
      const found = next.find((contact) => contact.id === requestedContactId);
      if (found && activeContact?.id !== found.id) setActiveContact(found);
    }
  }, [activeContact?.id, requestedContactId, role]);

  const loadMessages = useCallback(async (contact: Contact) => {
    const teacherId = role === "teacher" ? userId : contact.id;
    const studentId = role === "student" ? userId : contact.id;
    const { data, error: messageError } = await supabase.from("teacher_student_messages")
      .select("id, sender_id, body, created_at, delivered_at, read_at").eq("teacher_id", teacherId).eq("student_id", studentId)
      .order("created_at", { ascending: true }).limit(300);
    if (messageError) throw new Error(messageError.message);
    setMessages((data ?? []) as Message[]);
    const messageIds = (data ?? []).map((message) => message.id);
    if (messageIds.length) {
      const { data: reactionRows, error: reactionError } = await supabase
        .from("teacher_student_message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", messageIds);
      if (reactionError) {
        setMessageReactions({});
      } else {
        const grouped = new Map<string, Map<string, MessageReaction>>();
        for (const reaction of reactionRows ?? []) {
          const byEmoji = grouped.get(reaction.message_id) ?? new Map<string, MessageReaction>();
          const summary = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, reactedByMe: false };
          summary.count += 1;
          if (reaction.user_id === userId) summary.reactedByMe = true;
          byEmoji.set(reaction.emoji, summary);
          grouped.set(reaction.message_id, byEmoji);
        }
        setMessageReactions(Object.fromEntries(Array.from(grouped.entries()).map(([messageId, values]) => [messageId, Array.from(values.values())])));
      }
    } else {
      setMessageReactions({});
    }
    const { error: readError } = await supabase.rpc("mark_chat_messages_seen", { p_teacher_id: teacherId, p_student_id: studentId });
    if (readError) setError("Conversation opened, but read status could not be updated.");
    const { error: reactionReadError } = await supabase.rpc("mark_chat_reaction_notifications_seen", { p_teacher_id: teacherId, p_student_id: studentId });
    if (reactionReadError) setError("Conversation opened, but reaction notifications could not be cleared.");
  }, [role, userId]);

  useEffect(() => {
    if (guard !== "allowed") return;
    let active = true;
    const timer = setTimeout(() => {
      void loadInbox().catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load messages."); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [guard, loadInbox]);

  useEffect(() => {
    if (!activeContact || !userId) return;
    let active = true;
    const refresh = () => {
      void loadMessages(activeContact).then(() => loadInbox()).catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not refresh the conversation.");
      });
    };
    refresh();
    const channel = supabase.channel(`teacher-student-chat-${userId}-${activeContact.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_student_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_student_message_reactions" }, refresh)
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [activeContact, loadInbox, loadMessages, userId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeContact || sending || !userId) return;
    setSending(true); setError("");
    const payload = {
      teacher_id: role === "teacher" ? userId : activeContact.id,
      student_id: role === "student" ? userId : activeContact.id,
      sender_id: userId, body,
    };
    const { error: sendError } = await supabase.from("teacher_student_messages").insert(payload);
    setSending(false);
    if (sendError) { setError("Message could not be sent. Please try again."); return; }
    setDraft("");
    try { await loadMessages(activeContact); await loadInbox(); }
    catch (err) { setError(err instanceof Error ? err.message : "Message sent, but the conversation did not refresh."); }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (reactionBusy || !activeContact) return;
    setReactionBusy(true);
    try {
      const { error: reactionError } = await supabase.rpc("toggle_chat_message_reaction", {
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (reactionError) {
        const missingSetup = reactionError.code === "PGRST202" || reactionError.code === "42883" || reactionError.message.toLowerCase().includes("could not find the function");
        throw new Error(missingSetup ? "Message reactions need to be enabled. Run supabase/chat_message_reactions.sql in Supabase." : reactionError.message);
      }
      setReactingMessageId(null);
      await loadMessages(activeContact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the reaction.");
    } finally {
      setReactionBusy(false);
    }
  };

  const formatTime = (value?: string) => value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const title = useMemo(() => "Messages", []);
  if (guard !== "allowed") return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>{guard === "checking" ? "Loading messages…" : "This account cannot open messages."}</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <View style={[styles.header, dark && styles.headerDark]}>
      <Pressable onPress={() => {
        if (activeContact) { setActiveContact(null); setMessages([]); setError(""); }
        else router.replace(role === "teacher" ? "/teacher" : "/student");
      }} accessibilityRole="button" accessibilityLabel={activeContact ? "Back to conversations" : "Back to dashboard"} style={styles.back}>
        <Ionicons name="arrow-back" size={21} color={GREEN} />
      </Pressable>
      <View style={styles.headerText}><Text style={[styles.title, dark && styles.textDark]}>{activeContact?.full_name ?? title}</Text><Text style={[styles.subtitle, dark && styles.mutedDark]}>{activeContact ? "Private conversation" : role === "teacher" ? "Stay connected with your students" : "Stay connected with your teachers"}</Text></View>
      {activeContact ? <View style={styles.headerAvatar}>{activeContact.avatar_url ? <Image source={{ uri: activeContact.avatar_url }} style={styles.avatarImage} onError={() => setActiveContact((current) => current?.id === activeContact.id ? { ...current, avatar_url: null } : current)} /> : <Text style={styles.avatarText}>{activeContact.full_name.slice(0, 1).toUpperCase()}</Text>}</View> : null}
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {loading ? <View style={styles.center}><Text style={styles.muted}>Loading conversations…</Text></View> : activeContact ? (
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={8}>
        <FlatList ref={messageListRef} data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
          onScroll={(event) => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; nearBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120; }}
          onContentSizeChange={() => { if (nearBottomRef.current) messageListRef.current?.scrollToEnd({ animated: messages.length > 0 }); }}
          ListEmptyComponent={<View style={styles.emptyMessage}><View style={styles.emptyIcon}><Ionicons name="chatbubble-ellipses-outline" size={24} color={GREEN} /></View><Text style={styles.emptyTitle}>Start a conversation</Text><Text style={styles.muted}>Send a message to {activeContact.full_name}.</Text></View>}
          renderItem={({ item, index }) => {
            const mine = item.sender_id === userId;
            const reactions = messageReactions[item.id] ?? [];
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const showDate = !previous || !isSameMessageDay(previous.created_at, item.created_at);
            const groupedWithPrevious = Boolean(previous && previous.sender_id === item.sender_id && isSameMessageDay(previous.created_at, item.created_at));
            const showMeta = !next || next.sender_id !== item.sender_id || !isSameMessageDay(item.created_at, next.created_at);
            return <View style={styles.timelineItem}>
              {showDate ? <View style={styles.dateSeparator}><View style={styles.dateRule} /><Text style={styles.dateLabel}>{formatMessageDay(item.created_at)}</Text><View style={styles.dateRule} /></View> : null}
              <View style={[styles.messageRow, mine && styles.messageRowMine, groupedWithPrevious && styles.messageRowGrouped]}>
                <Pressable onLongPress={() => setReactingMessageId((current) => current === item.id ? null : item.id)} delayLongPress={280} accessibilityRole="button" accessibilityHint="Press and hold to react to this message" style={[styles.bubble, mine ? styles.mine : styles.theirs, groupedWithPrevious && (mine ? styles.mineGrouped : styles.theirsGrouped)]}>
                  <Text style={[styles.body, !mine && dark && styles.textDark, mine && styles.mineText]}>{item.body}</Text>
                  {showMeta ? <View style={styles.messageMeta}><Text style={[styles.time, mine && styles.mineTime]}>{formatTime(item.created_at)}</Text>{mine ? <Text style={styles.seen}>{item.read_at ? "Seen" : item.delivered_at ? "Delivered" : "Sent"}</Text> : null}</View> : null}
                </Pressable>
                {reactingMessageId === item.id ? <View style={[styles.reactionPicker, mine && styles.reactionPickerMine]}>{REACTION_OPTIONS.map((emoji) => <Pressable key={emoji} onPress={() => void toggleReaction(item.id, emoji)} disabled={reactionBusy} accessibilityRole="button" accessibilityLabel={`React ${emoji}`} style={({ pressed }) => [styles.reactionOption, pressed && styles.reactionOptionPressed, reactionBusy && styles.reactionDisabled]}><Text style={styles.reactionEmoji}>{emoji}</Text></Pressable>)}</View> : null}
                {reactions.length ? <View style={[styles.reactionList, mine && styles.reactionListMine]}>{reactions.map((reaction) => <Pressable key={reaction.emoji} onPress={() => void toggleReaction(item.id, reaction.emoji)} disabled={reactionBusy} accessibilityRole="button" accessibilityLabel={`${reaction.emoji}, ${reaction.count} reactions${reaction.reactedByMe ? ", yours" : ""}. Tap to toggle your reaction`} style={[styles.reactionChip, reaction.reactedByMe && styles.reactionChipMine]}><Text style={styles.reactionChipEmoji}>{reaction.emoji}</Text><Text style={[styles.reactionCount, reaction.reactedByMe && styles.reactionCountMine]}>{reaction.count}</Text></Pressable>)}</View> : null}
              </View>
            </View>;
          }}
        />
        <View style={[styles.composer, dark && styles.composerDark]}><TextInput value={draft} onChangeText={setDraft} placeholder="Message…" placeholderTextColor="#87948B" multiline maxLength={4000} style={[styles.input, dark && styles.inputDark]} accessibilityLabel="Message" />
          <Pressable onPress={() => void send()} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send message" style={[styles.send, (!draft.trim() || sending) && styles.disabled]}><Ionicons name="arrow-up" size={19} color="#FFFFFF" /></Pressable>
        </View>
      </KeyboardAvoidingView>
    ) : conversations.length ? (
      <FlatList data={conversations} keyExtractor={(item) => item.id} contentContainerStyle={styles.contacts} renderItem={({ item }) => (
        <Pressable onPress={() => { setActiveContact(item); setError(""); }} style={({ pressed }) => [styles.contact, dark && styles.contactDark, pressed && styles.contactPressed]} accessibilityRole="button">
          <View style={styles.avatar}>{item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} onError={() => setConversations((current) => current.map((conversation) => conversation.id === item.id ? { ...conversation, avatar_url: null } : conversation))} /> : <Text style={styles.avatarText}>{item.full_name.slice(0, 1).toUpperCase()}</Text>}</View>
          <View style={styles.contactCopy}><View style={styles.contactTop}><Text numberOfLines={1} style={[styles.contactName, dark && styles.textDark]}>{item.full_name}</Text><Text style={styles.contactTime}>{formatTime(item.latest?.created_at)}</Text></View>
            <View style={styles.contactBottom}><Text numberOfLines={1} style={[styles.preview, item.unread > 0 && styles.previewUnread]}>{item.latest ? `${item.latest.sender_id === userId ? "You: " : ""}${item.latest.body}` : "Start a conversation"}</Text>{item.unread > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{item.unread > 99 ? "99+" : item.unread}</Text></View> : null}</View>
          </View>
        </Pressable>
      )} />
    ) : <View style={styles.center}><View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={26} color={GREEN} /></View><Text style={styles.emptyTitle}>No conversations yet</Text><Text style={styles.muted}>{role === "teacher" ? "Students appear here after they submit one of your published quizzes." : "Teachers appear here after you submit one of their published quizzes."}</Text></View>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALE }, flex: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: "#E5ECE7", backgroundColor: "#FFFFFF" },
  headerDark: { backgroundColor: "#151F18", borderBottomColor: "#2B392F" },
  textDark: { color: "#EEF4EF" }, mutedDark: { color: "#AAB8AE" },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF6F0" }, headerText: { flex: 1 },
  title: { color: "#173D2A", fontSize: 19, fontWeight: "800" }, subtitle: { color: "#78857D", fontSize: 11, marginTop: 3 }, headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E7F2EA", alignItems: "center", justifyContent: "center" },
  contacts: { paddingHorizontal: 15, paddingVertical: 10 }, contact: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: "#E7EDE8" }, contactPressed: { opacity: 0.7 },
  contactDark: { borderBottomColor: "#2B392F" },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F2EA", overflow: "hidden" }, avatarImage: { width: "100%", height: "100%" }, avatarText: { fontSize: 16, color: GREEN, fontWeight: "800" }, contactCopy: { flex: 1, gap: 7 }, contactTop: { flexDirection: "row", alignItems: "center", gap: 8 }, contactName: { flex: 1, color: "#20392B", fontSize: 14, fontWeight: "700" }, contactTime: { color: "#89958D", fontSize: 10 },
  contactBottom: { flexDirection: "row", alignItems: "center", gap: 9 }, preview: { flex: 1, color: "#77857B", fontSize: 12 }, previewUnread: { color: "#304A39", fontWeight: "700" }, unreadBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" }, unreadText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  messageList: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 15, paddingVertical: 18 }, timelineItem: { width: "100%" }, dateSeparator: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 5 }, dateRule: { flex: 1, height: 1, backgroundColor: "#E3EBE5" }, dateLabel: { color: "#7C8A80", fontSize: 10, fontWeight: "700" }, messageRow: { width: "100%", alignItems: "flex-start", marginTop: 8 }, messageRowMine: { alignItems: "flex-end" }, messageRowGrouped: { marginTop: 2 }, bubble: { maxWidth: "84%", borderRadius: 19, paddingHorizontal: 14, paddingVertical: 10 }, mine: { backgroundColor: GREEN, borderBottomRightRadius: 5 }, theirs: { backgroundColor: "#FFFFFF", borderBottomLeftRadius: 5, borderWidth: 1, borderColor: "#E4EBE6" }, mineGrouped: { borderTopRightRadius: 7 }, theirsGrouped: { borderTopLeftRadius: 7 }, body: { color: "#20392B", fontSize: 14, lineHeight: 20 }, mineText: { color: "#FFFFFF" }, messageMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 4 }, time: { color: "#7D8981", fontSize: 9 }, mineTime: { color: "#D5E9DC" }, seen: { color: "#D5E9DC", fontSize: 9, fontWeight: "700" },
  reactionPicker: { flexDirection: "row", alignSelf: "flex-start", gap: 3, marginTop: -3, paddingHorizontal: 5, paddingVertical: 4, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4EBE6", elevation: 3, shadowColor: "#173D2A", shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } }, reactionPickerMine: { alignSelf: "flex-end" }, reactionOption: { minWidth: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }, reactionOptionPressed: { backgroundColor: "#EAF4EC", transform: [{ scale: 1.08 }] }, reactionDisabled: { opacity: 0.55 }, reactionEmoji: { fontSize: 21 },
  reactionList: { flexDirection: "row", alignSelf: "flex-start", flexWrap: "wrap", gap: 5, marginTop: -4 }, reactionListMine: { alignSelf: "flex-end" }, reactionChip: { minHeight: 25, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1EAE3" }, reactionChipMine: { backgroundColor: "#EAF4EC", borderColor: "#83B390" }, reactionChipEmoji: { fontSize: 13 }, reactionCount: { color: "#64756A", fontSize: 10, fontWeight: "800" }, reactionCountMine: { color: GREEN },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 9, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E4EBE6", paddingHorizontal: 13, paddingVertical: 10 }, input: { flex: 1, maxHeight: 112, minHeight: 44, borderWidth: 1, borderColor: "#DFE7E1", borderRadius: 23, paddingHorizontal: 16, paddingVertical: 11, color: "#20392B", fontSize: 14, backgroundColor: "#FAFCFA" }, send: { width: 43, height: 43, borderRadius: 22, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.45 },
  composerDark: { backgroundColor: "#151F18", borderTopColor: "#2B392F" }, inputDark: { color: "#EEF4EF", backgroundColor: "#202D24", borderColor: "#34463A" },
  emptyIcon: { width: 54, height: 54, borderRadius: 19, backgroundColor: "#E8F3EB", alignItems: "center", justifyContent: "center" }, emptyMessage: { alignItems: "center", gap: 8, padding: 30 }, emptyTitle: { color: "#173D2A", fontSize: 16, fontWeight: "800", textAlign: "center" }, muted: { color: "#728078", textAlign: "center", lineHeight: 20, fontSize: 12 }, error: { color: "#B33A3A", paddingHorizontal: 16, paddingTop: 10, fontSize: 12 },
});
