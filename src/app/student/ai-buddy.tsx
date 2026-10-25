import { supabase } from "@/lib/supabase";
import {
  askStudyBuddy,
  type AiSource,
  type ChatMessage,
} from "@/utils/askStudyBuddy";
import { confirmAction, showNotice } from "@/utils/notify";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
const BG = "#F4F8F5";

type ChatEntry = ChatMessage & { id: string; sources?: AiSource[] };

let entryCounter = 0;
function makeId(): string {
  entryCounter += 1;
  return `m-${Date.now()}-${entryCounter}`;
}

const SUGGESTIONS = [
  "Explain photosynthesis simply",
  "Give me 3 tips to study better",
  "What is a prime number?",
];

const FOLLOW_UPS = [
  "Explain that more simply",
  "Give me an example",
  "Quiz me on this",
];

const MAX_SAVED_MESSAGES = 60;
const STORAGE_PREFIX = "studymate.aiBuddy.v1.";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function parseStoredMessages(raw: string | null): ChatEntry[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const entries: ChatEntry[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;

      if (role !== "user" && role !== "assistant") continue;
      if (typeof content !== "string" || !content.trim()) continue;

      const rawSources = (item as { sources?: unknown }).sources;
      const sources = Array.isArray(rawSources)
        ? rawSources
            .filter(
              (source): source is AiSource =>
                !!source &&
                typeof source === "object" &&
                typeof (source as { materialId?: unknown }).materialId ===
                  "string" &&
                typeof (source as { title?: unknown }).title === "string",
            )
            .slice(0, 4)
        : undefined;

      entries.push({
        id: makeId(),
        role,
        content: content.slice(0, 4000),
        sources,
      });
    }

    return entries.slice(-MAX_SAVED_MESSAGES);
  } catch {
    return [];
  }
}

export default function StudentAiBuddyScreen() {
  const params = useLocalSearchParams<{ prompt?: string }>();
  const initialPrompt =
    typeof params.prompt === "string" ? params.prompt.trim() : "";

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatEntry>>(null);
  const messagesRef = useRef<ChatEntry[]>([]);
  const sendingRef = useRef(false);
  const userIdRef = useRef("");
  const promptSentRef = useRef(false);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const commitMessages = useCallback((next: ChatEntry[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        userIdRef.current = user?.id ?? "";

        if (user?.id) {
          const raw = await AsyncStorage.getItem(storageKey(user.id));
          if (!active) return;
          commitMessages(parseStoredMessages(raw));
        }
      } catch (error) {
        console.warn("Could not restore AI Buddy chat:", error);
      } finally {
        if (active) setHydrated(true);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [commitMessages]);

  useEffect(() => {
    if (!hydrated) return;

    const userId = userIdRef.current;
    if (!userId) return;

    const payload = messages.slice(-MAX_SAVED_MESSAGES).map((entry) => ({
      role: entry.role,
      content: entry.content,
      sources: entry.sources,
    }));

    AsyncStorage.setItem(storageKey(userId), JSON.stringify(payload)).catch(
      (error) => {
        console.warn("Could not save AI Buddy chat:", error);
      },
    );
  }, [messages, hydrated]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();

      if (!question || sendingRef.current) return;

      const history: ChatMessage[] = messagesRef.current.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

      const userEntry: ChatEntry = {
        id: makeId(),
        role: "user",
        content: question,
      };

      commitMessages([...messagesRef.current, userEntry]);
      setInput("");
      sendingRef.current = true;
      setSending(true);
      setNotice(null);
      scrollToEnd();

      const result = await askStudyBuddy(question, history);

      if (result.status === "ok") {
        commitMessages([
          ...messagesRef.current,
          {
            id: makeId(),
            role: "assistant",
            content: result.reply,
            sources: result.sources,
          },
        ]);
      } else {
        setNotice(result.message);
      }

      sendingRef.current = false;
      setSending(false);
      scrollToEnd();
    },
    [commitMessages, scrollToEnd],
  );

  useEffect(() => {
    if (!hydrated || !initialPrompt || promptSentRef.current) return;

    promptSentRef.current = true;
    void send(initialPrompt);
  }, [hydrated, initialPrompt, send]);

  const handleSend = () => {
    void send(input);
  };

  const clearChat = () => {
    confirmAction(
      "Clear chat?",
      "This removes the conversation from this device.",
      async () => {
        commitMessages([]);
        setNotice(null);
        const userId = userIdRef.current;
        if (userId) {
          await AsyncStorage.removeItem(storageKey(userId));
        }
      },
      { confirmLabel: "Clear", destructive: true },
    );
  };

  const submitReport = useCallback(async (entry: ChatEntry) => {
    setReportingId(entry.id);

    try {
      const { error } = await supabase.from("ai_reports").insert({
        feature: "study_buddy",
        excerpt: entry.content.slice(0, 2000),
        reason: "inaccurate",
      });

      if (error) {
        console.warn("Could not report AI answer:", error.message);
        showNotice(
          "Report not sent",
          "We could not send your report. Please try again later.",
        );
        return;
      }

      showNotice(
        "Report sent",
        "Thank you. An administrator will review this answer.",
      );
    } catch (error) {
      console.warn("Could not report AI answer:", error);
      showNotice(
        "Report not sent",
        "We could not send your report. Please try again later.",
      );
    } finally {
      setReportingId(null);
    }
  }, []);

  const requestReport = (entry: ChatEntry) => {
    confirmAction(
      "Report this answer?",
      "An administrator will review it for accuracy or safety.",
      () => submitReport(entry),
      { confirmLabel: "Report", destructive: true },
    );
  };

  const lastMessage = messages[messages.length - 1];
  const showFollowUps =
    !sending && lastMessage?.role === "assistant" && messages.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>AI Buddy</Text>
          <Text style={styles.headerSubtitle}>Your study companion</Text>
        </View>

        {messages.length > 0 ? (
          <Pressable
            onPress={clearChat}
            accessibilityRole="button"
            accessibilityLabel="Clear chat"
            hitSlop={8}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={19} color={DARK_GREEN} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <Ionicons name="sparkles-outline" size={30} color={GREEN} />
              </View>

              <Text style={styles.introTitle}>Ask me anything about studying</Text>
              <Text style={styles.introText}>
                I can explain concepts, give examples, and help you revise. I
                only answer study-related questions.
              </Text>

              <View style={styles.suggestions}>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => {
                      void send(suggestion);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.suggestion,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={15}
                      color={GREEN}
                    />
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === "user";

            return (
              <View
                style={[
                  styles.bubbleRow,
                  isUser ? styles.bubbleRowUser : styles.bubbleRowBuddy,
                ]}
              >
                {!isUser ? (
                  <View style={styles.avatar}>
                    <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                  </View>
                ) : null}

                <View style={styles.bubbleColumn}>
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleBuddy,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        isUser ? styles.bubbleTextUser : styles.bubbleTextBuddy,
                      ]}
                    >
                      {item.content}
                    </Text>

                    {!isUser && item.sources && item.sources.length > 0 ? (
                      <View style={styles.sources}>
                        {item.sources.map((source) => (
                          <View key={source.materialId} style={styles.sourceChip}>
                            <Ionicons
                              name="book-outline"
                              size={11}
                              color="#4E6B59"
                            />
                            <Text style={styles.sourceText} numberOfLines={1}>
                              {source.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  {!isUser ? (
                    <Pressable
                      onPress={() => requestReport(item)}
                      disabled={reportingId === item.id}
                      accessibilityRole="button"
                      accessibilityLabel="Report this answer"
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.reportButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      {reportingId === item.id ? (
                        <ActivityIndicator size="small" color="#809087" />
                      ) : (
                        <>
                          <Ionicons
                            name="flag-outline"
                            size={12}
                            color="#809087"
                          />
                          <Text style={styles.reportText}>Report</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
        />

        {sending ? (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={styles.typingText}>AI Buddy is thinking...</Text>
          </View>
        ) : null}

        {showFollowUps ? (
          <View style={styles.followUps}>
            {FOLLOW_UPS.map((followUp) => (
              <Pressable
                key={followUp}
                onPress={() => {
                  void send(followUp);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.followUpChip,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.followUpText}>{followUp}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {notice ? (
          <View style={styles.noticeBox}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="#8A6D1F"
            />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask a study question..."
            placeholderTextColor="#9AA69E"
            style={styles.input}
            multiline
            maxLength={2000}
            editable={!sending}
            accessibilityLabel="Message to AI Buddy"
          />

          <Pressable
            onPress={handleSend}
            disabled={sending || input.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed }) => [
              styles.sendButton,
              (sending || input.trim().length === 0) &&
                styles.sendButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: DARK_GREEN },
  headerSubtitle: { fontSize: 12, color: "#718078", marginTop: 4 },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EBE5",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 12 },
  intro: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK_GREEN,
    textAlign: "center",
  },
  introText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#758479",
    textAlign: "center",
  },
  suggestions: { alignSelf: "stretch", gap: 8, marginTop: 6 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EEF7F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#2C4A38" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowBuddy: { justifyContent: "flex-start" },
  bubbleColumn: { maxWidth: "82%", alignItems: "flex-start", gap: 3 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    maxWidth: "100%",
  },
  bubbleUser: { backgroundColor: GREEN, borderBottomRightRadius: 4 },
  bubbleBuddy: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EDE7",
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: "#FFFFFF" },
  bubbleTextBuddy: { color: "#203C2D" },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#EDF2EE",
  },
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F6F2",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 220,
  },
  sourceText: { fontSize: 10, fontWeight: "600", color: "#4E6B59" },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  reportText: { fontSize: 10, color: "#809087", fontWeight: "600" },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  typingText: { fontSize: 12, color: "#65776B" },
  followUps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  followUpChip: {
    backgroundColor: "#EEF7F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#DCEAE0",
  },
  followUpText: { fontSize: 11, fontWeight: "600", color: "#2C4A38" },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FBF3DA",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 6,
  },
  noticeText: { flex: 1, fontSize: 12, color: "#8A6D1F", lineHeight: 17 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#E7EEE9",
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: "#F4F8F5",
    borderWidth: 1,
    borderColor: "#E1E8E2",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: "#203C2D",
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
