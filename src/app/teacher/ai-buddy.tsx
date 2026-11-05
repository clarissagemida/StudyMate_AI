import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { supabase } from "@/lib/supabase";
import { askTeacherAiBuddy } from "@/utils/askTeacherAiBuddy";
import type { ChatMessage } from "@/utils/askStudyBuddy";
import { confirmAction } from "@/utils/notify";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";
const STORAGE_PREFIX = "studymate.teacherAiBuddy.v1.";
const MAX_SAVED_MESSAGES = 60;
const SUGGESTIONS = [
  "Help me plan a 40-minute lesson",
  "Suggest an engaging class activity",
  "How can I explain a difficult topic simply?",
];
const FOLLOW_UPS = ["Make it shorter", "Give me an example", "Adapt this for younger students"];
const TEACHER_RETURN_PATHS = [
  "/teacher",
  "/teacher/material",
  "/teacher/quizzes",
  "/teacher/messages",
  "/teacher/students",
  "/teacher/profile",
] as const;

type Entry = ChatMessage & { id: string };
let entryCounter = 0;
const makeId = () => `teacher-ai-${Date.now()}-${++entryCounter}`;

function parseMessages(raw: string | null): Entry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry): entry is { role: ChatMessage["role"]; content: string } =>
        !!entry && typeof entry === "object" &&
        ((entry as { role?: unknown }).role === "user" || (entry as { role?: unknown }).role === "assistant") &&
        typeof (entry as { content?: unknown }).content === "string" &&
        Boolean(((entry as { content: string }).content).trim()),
      )
      .slice(-MAX_SAVED_MESSAGES)
      .map((entry) => ({ id: makeId(), role: entry.role, content: entry.content.slice(0, 4000) }));
  } catch {
    return [];
  }
}

export default function TeacherAiBuddyScreen() {
  const guard = useRequireRole("teacher");
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [messages, setMessages] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const userId = useRef("");
  const messagesRef = useRef<Entry[]>([]);
  const sendingRef = useRef(false);
  const listRef = useRef<FlatList<Entry>>(null);

  const commit = useCallback((next: Entry[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        userId.current = user?.id ?? "";
        if (user?.id) {
          const stored = await AsyncStorage.getItem(`${STORAGE_PREFIX}${user.id}`);
          if (active) commit(parseMessages(stored));
        }
      } catch (error) {
        console.warn("Could not restore teacher AI Buddy chat:", error);
      } finally {
        if (active) setHydrated(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, [commit]);

  useEffect(() => {
    if (!hydrated || !userId.current) return;
    const payload = messages.slice(-MAX_SAVED_MESSAGES).map(({ role, content }) => ({ role, content }));
    void AsyncStorage.setItem(`${STORAGE_PREFIX}${userId.current}`, JSON.stringify(payload)).catch((error) => {
      console.warn("Could not save teacher AI Buddy chat:", error);
    });
  }, [messages, hydrated]);

  const send = useCallback(async (value: string) => {
    const question = value.trim();
    if (!hydrated || !question || sendingRef.current) return;
    const history = messagesRef.current
      .slice(-20)
      .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
    const userEntry: Entry = { id: makeId(), role: "user", content: question };
    commit([...messagesRef.current, userEntry]);
    setInput("");
    setNotice("");
    sendingRef.current = true;
    setSending(true);
    scrollToEnd();
    try {
      const result = await askTeacherAiBuddy(question, history);
      if (result.status === "ok") {
        commit([...messagesRef.current, { id: makeId(), role: "assistant", content: result.reply }]);
      } else {
        // Keep a failed request easy to retry: remove its unsent bubble and
        // restore the exact prompt to the composer.
        commit(messagesRef.current.filter((entry) => entry.id !== userEntry.id));
        setInput(question);
        setNotice(result.message);
      }
    } catch (error) {
      commit(messagesRef.current.filter((entry) => entry.id !== userEntry.id));
      setInput(question);
      setNotice(error instanceof Error ? error.message : "Could not reach AI Buddy. Please try again.");
    } finally {
      sendingRef.current = false;
      setSending(false);
      scrollToEnd();
    }
  }, [commit, hydrated, scrollToEnd]);

  const clearChat = () => confirmAction(
    "Start a new chat?",
    "This clears the saved AI Buddy conversation on this device.",
    async () => {
      if (sendingRef.current) return;
      commit([]);
      setNotice("");
      if (userId.current) await AsyncStorage.removeItem(`${STORAGE_PREFIX}${userId.current}`);
    },
    { confirmLabel: "New chat", destructive: true },
  );

  if (guard === "checking") return <DashboardSkeleton />;
  if (guard === "denied") {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.emptyTitle}>This account cannot open Teacher AI Buddy.</Text></View></SafeAreaView>;
  }

  const lastMessage = messages[messages.length - 1];
  const safeReturnTo = TEACHER_RETURN_PATHS.includes(
    returnTo as (typeof TEACHER_RETURN_PATHS)[number],
  )
    ? returnTo
    : "/teacher";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace(safeReturnTo as Href)} accessibilityRole="button" accessibilityLabel="Return to previous teacher screen" style={styles.headerButton}>
          <Ionicons name="arrow-back" size={20} color={DARK_GREEN} />
        </Pressable>
        <View style={styles.headerAvatar}><Ionicons name="sparkles" size={18} color="#FFFFFF" /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Teacher AI Buddy</Text>
          <Text style={styles.headerSubtitle}>Your teaching copilot</Text>
        </View>
        <Pressable onPress={clearChat} disabled={sending} accessibilityRole="button" accessibilityLabel="Start a new chat" style={[styles.headerButton, sending && styles.disabled]}>
          <Ionicons name="create-outline" size={20} color={DARK_GREEN} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View style={styles.intro}>
              <View style={styles.introIcon}><Ionicons name="sparkles" size={28} color={GREEN} /></View>
              <Text style={styles.introTitle}>How can I support your teaching?</Text>
              <Text style={styles.introText}>Plan lessons, brainstorm activities, clarify concepts, and shape classroom materials. Review suggestions before sharing them with students.</Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable key={suggestion} onPress={() => void send(suggestion)} accessibilityRole="button" style={styles.suggestion}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color={GREEN} />
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return <View style={[styles.messageRow, isUser ? styles.userRow : styles.buddyRow]}>
              {!isUser ? <View style={styles.miniAvatar}><Ionicons name="sparkles" size={12} color="#FFFFFF" /></View> : null}
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.buddyBubble]}>
                <Text style={[styles.messageText, isUser ? styles.userText : styles.buddyText]}>{item.content}</Text>
                {!isUser ? (
                  <>
                    <Text style={styles.aiLabel}>AI-generated suggestion · review before sharing</Text>
                    <View style={styles.responseActions}>
                      <Pressable
                        onPress={() => router.push({ pathname: "/teacher/material", params: { aiDraft: item.content } })}
                        accessibilityRole="button"
                        accessibilityLabel="Use this response in a new learning material"
                        style={styles.useDraftButton}
                      >
                        <Ionicons name="document-text-outline" size={14} color={GREEN} />
                        <Text style={styles.useDraftText}>Use in materials</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => router.push({ pathname: "/teacher/quizzes", params: { aiDraft: item.content } })}
                        accessibilityRole="button"
                        accessibilityLabel="Use this response to start a quiz draft"
                        style={styles.useDraftButton}
                      >
                        <Ionicons name="clipboard-outline" size={14} color={GREEN} />
                        <Text style={styles.useDraftText}>Start quiz</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            </View>;
          }}
        />
        {sending ? <View style={styles.typing}><ProgressIndicator size="sm" color={GREEN} accessibilityLabel="AI Buddy is thinking" /><Text style={styles.typingText}>AI Buddy is thinking…</Text></View> : null}
        {!sending && lastMessage?.role === "assistant" ? <View style={styles.followUps}>{FOLLOW_UPS.map((text) => <Pressable key={text} onPress={() => void send(text)} style={styles.followUp}><Text style={styles.followUpText}>{text}</Text></Pressable>)}</View> : null}
        {notice ? <View style={styles.notice}><Ionicons name="information-circle-outline" size={16} color="#8A6D1F" /><Text style={styles.noticeText}>{notice}</Text></View> : null}
        <View style={styles.composer}>
          <TextInput value={input} onChangeText={setInput} placeholder={hydrated ? "Ask for teaching support…" : "Restoring your conversation…"} placeholderTextColor="#89958D" style={styles.input} multiline maxLength={2000} editable={hydrated && !sending} accessibilityLabel="Message Teacher AI Buddy" />
          <Pressable onPress={() => void send(input)} disabled={!hydrated || !input.trim() || sending} accessibilityRole="button" accessibilityLabel="Send message" style={[styles.sendButton, (!hydrated || !input.trim() || sending) && styles.disabled]}>
            <Ionicons name="send" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F8F5" }, flex: { flex: 1 },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E5EDE7" },
  headerButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F8F5" },
  headerAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: GREEN }, headerCopy: { flex: 1 },
  headerTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN }, headerSubtitle: { fontSize: 10, color: "#718078", marginTop: 3 },
  list: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  intro: { marginTop: 20, padding: 22, alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E5EDE7" },
  introIcon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F3EB" },
  introTitle: { color: DARK_GREEN, fontSize: 16, fontWeight: "800", textAlign: "center" }, introText: { color: "#718078", fontSize: 12, lineHeight: 18, textAlign: "center" },
  suggestions: { alignSelf: "stretch", gap: 8, marginTop: 5 }, suggestion: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#EEF7F0", borderRadius: 12 }, suggestionText: { flex: 1, color: "#2C4A38", fontSize: 12, fontWeight: "600" },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 7 }, userRow: { justifyContent: "flex-end" }, buddyRow: { justifyContent: "flex-start" }, miniAvatar: { width: 25, height: 25, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: GREEN },
  bubble: { maxWidth: "84%", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 }, userBubble: { backgroundColor: GREEN, borderBottomRightRadius: 4 }, buddyBubble: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5EDE7", borderBottomLeftRadius: 4 },
  messageText: { fontSize: 13, lineHeight: 19 }, userText: { color: "#FFFFFF" }, buddyText: { color: "#203C2D" }, aiLabel: { marginTop: 7, color: "#839087", fontSize: 9 },
  responseActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  useDraftButton: { minHeight: 34, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#E8F3EB" },
  useDraftText: { color: GREEN, fontSize: 10, fontWeight: "800" },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingBottom: 7 }, typingText: { fontSize: 11, color: "#65776B" },
  followUps: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 7 }, followUp: { borderWidth: 1, borderColor: "#DCEAE0", backgroundColor: "#EEF7F0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }, followUpText: { fontSize: 10, fontWeight: "600", color: "#2C4A38" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginHorizontal: 14, padding: 10, borderRadius: 11, backgroundColor: "#FBF3DA" }, noticeText: { flex: 1, color: "#8A6D1F", fontSize: 11, lineHeight: 16 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 10, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E5EDE7" }, input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: "#E1E8E2", borderRadius: 15, backgroundColor: "#F4F8F5", paddingHorizontal: 13, paddingVertical: 10, fontSize: 13, color: "#203C2D" }, sendButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: GREEN }, disabled: { opacity: 0.45 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, emptyTitle: { fontSize: 15, fontWeight: "700", color: DARK_GREEN },
});
