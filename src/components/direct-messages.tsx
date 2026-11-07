import { supabase } from "@/lib/supabase";
import { useRequireRole } from "@/hooks/useRequireRole";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Role = "teacher" | "student";
type Contact = { id: string; full_name: string };
type Message = { id: string; sender_id: string; body: string; created_at: string };

const GREEN = "#176B45";
const PALE = "#F4F8F5";

export function DirectMessages({ role }: { role: Role }) {
  const guard = useRequireRole(role);
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const requestedContactId = typeof params.contactId === "string" ? params.contactId : "";
  const [userId, setUserId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadContacts = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Your session has expired. Please sign in again.");
    setUserId(user.id);
    const rpc = role === "teacher" ? "teacher_chat_contacts" : "student_chat_contacts";
    const { data, error: contactError } = await supabase.rpc(rpc);
    if (contactError) throw new Error(contactError.message);
    const next: Contact[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      full_name: typeof row.full_name === "string" ? row.full_name : role === "teacher" ? "Student" : "Teacher",
    }));
    setContacts(next);
    if (requestedContactId) {
      setActiveContact(next.find((contact) => contact.id === requestedContactId) ?? null);
    }
  }, [requestedContactId, role]);

  const loadMessages = useCallback(async (contact: Contact) => {
    const teacherId = role === "teacher" ? userId : contact.id;
    const studentId = role === "student" ? userId : contact.id;
    const { data, error: messageError } = await supabase
      .from("teacher_student_messages")
      .select("id, sender_id, body, created_at")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (messageError) throw new Error(messageError.message);
    setMessages((data ?? []) as Message[]);
  }, [role, userId]);

  useEffect(() => {
    if (guard !== "allowed") return;
    let active = true;
    const run = async () => {
      try {
        await loadContacts();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load messages.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [guard, loadContacts]);

  useEffect(() => {
    if (!activeContact || !userId) return;
    let active = true;
    const refresh = () => void loadMessages(activeContact).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Could not load the conversation.");
    });
    refresh();
    const channel = supabase
      .channel(`teacher-student-chat-${userId}-${activeContact.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_student_messages" }, refresh)
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [activeContact, loadMessages, userId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeContact || sending || !userId) return;
    setSending(true);
    setError("");
    const payload = {
      teacher_id: role === "teacher" ? userId : activeContact.id,
      student_id: role === "student" ? userId : activeContact.id,
      sender_id: userId,
      body,
    };
    const { error: sendError } = await supabase.from("teacher_student_messages").insert(payload);
    setSending(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setDraft("");
    try { await loadMessages(activeContact); } catch (err) {
      setError(err instanceof Error ? err.message : "Message sent, but the conversation did not refresh.");
    }
  };

  const title = useMemo(() => role === "teacher" ? "Messages with students" : "Messages with teachers", [role]);

  if (guard !== "allowed") {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>{guard === "checking" ? "Loading messages…" : "This account cannot open messages."}</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.header, role === "student" && { marginTop: 48 }]}>
        <Pressable onPress={() => {
          if (activeContact) { setActiveContact(null); setMessages([]); }
          else router.replace(role === "teacher" ? "/teacher" : "/student");
        }} accessibilityRole="button" accessibilityLabel={activeContact ? "Back to contacts" : "Back to dashboard"} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={21} color={GREEN} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{activeContact?.full_name ?? title}</Text>
          <Text style={styles.subtitle}>{activeContact ? "Private conversation" : "Students and teachers connected through quiz activity"}</Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <View style={styles.center}><Text style={styles.muted}>Loading contacts…</Text></View> : activeContact ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
          <ScrollView contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled">
            {messages.length === 0 ? <Text style={styles.empty}>Start the conversation with a message.</Text> : messages.map((message) => {
              const mine = message.sender_id === userId;
              return <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.body, mine && styles.mineText]}>{message.body}</Text>
                <Text style={[styles.time, mine && styles.mineTime]}>{new Date(message.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
              </View>;
            })}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor="#87948B" multiline maxLength={4000} style={styles.input} accessibilityLabel="Message" />
            <Pressable onPress={() => void send()} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send message" style={[styles.send, (!draft.trim() || sending) && styles.disabled]}>
              <Ionicons name="send" size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : contacts.length ? (
        <FlatList data={contacts} keyExtractor={(item) => item.id} contentContainerStyle={styles.contacts} renderItem={({ item }) => (
          <Pressable onPress={() => { setActiveContact(item); setError(""); }} style={styles.contact} accessibilityRole="button">
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.full_name.slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.contactName}>{item.full_name}</Text>
            <Ionicons name="chevron-forward" size={18} color="#87948B" />
          </Pressable>
        )} />
      ) : (
        <View style={styles.center}><Ionicons name="chatbubbles-outline" size={34} color={GREEN} /><Text style={styles.emptyTitle}>No contacts yet</Text><Text style={styles.muted}>{role === "teacher" ? "Students appear here after they submit one of your published quizzes." : "Teachers appear here after you submit one of their published quizzes."}</Text></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALE }, flex: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E2EAE4", backgroundColor: "#FFFFFF" },
  headerBack: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF4EC" },
  headerText: { flex: 1 }, title: { color: "#123D2A", fontSize: 18, fontWeight: "800" }, subtitle: { color: "#728078", fontSize: 11, marginTop: 3 },
  contacts: { padding: 16, gap: 10 }, contact: { minHeight: 64, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2EAE4" }, avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F3EB" }, avatarText: { fontSize: 15, color: GREEN, fontWeight: "800" }, contactName: { flex: 1, color: "#20392B", fontSize: 14, fontWeight: "700" },
  messageList: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 10 }, bubble: { maxWidth: "84%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 }, mine: { alignSelf: "flex-end", backgroundColor: GREEN, borderBottomRightRadius: 4 }, theirs: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2EAE4", borderBottomLeftRadius: 4 }, body: { color: "#20392B", fontSize: 14, lineHeight: 20 }, mineText: { color: "#FFFFFF" }, time: { color: "#7D8981", fontSize: 9, marginTop: 4, alignSelf: "flex-end" }, mineTime: { color: "#D5E9DC" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E2EAE4", paddingHorizontal: 12, paddingVertical: 10 }, input: { flex: 1, maxHeight: 110, minHeight: 42, borderWidth: 1, borderColor: "#DDE7E0", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: "#20392B", fontSize: 14 }, send: { width: 42, height: 42, borderRadius: 21, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.45 }, empty: { textAlign: "center", color: "#77857B", fontSize: 13, padding: 20 }, emptyTitle: { color: "#123D2A", fontSize: 16, fontWeight: "800" }, muted: { color: "#728078", textAlign: "center", lineHeight: 20 }, error: { color: "#B33A3A", paddingHorizontal: 16, paddingTop: 10, fontSize: 12 },
});
