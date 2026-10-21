import {
  askStudyBuddy,
  type ChatMessage,
} from "@/utils/askStudyBuddy";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
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

type ChatEntry = ChatMessage & { id: string };

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

export default function StudentAiBuddyScreen() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatEntry>>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();

      if (!question || sending) return;

      const userEntry: ChatEntry = {
        id: makeId(),
        role: "user",
        content: question,
      };

      // History sent to the function is the conversation BEFORE this turn.
      const history: ChatMessage[] = messages.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

      setMessages((current) => [...current, userEntry]);
      setInput("");
      setSending(true);
      setNotice(null);
      scrollToEnd();

      const result = await askStudyBuddy(question, history);

      if (result.status === "ok") {
        setMessages((current) => [
          ...current,
          { id: makeId(), role: "assistant", content: result.reply },
        ]);
      } else {
        setNotice(result.message);
      }

      setSending(false);
      scrollToEnd();
    },
    [messages, sending, scrollToEnd],
  );

  const handleSend = () => {
    void send(input);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Buddy</Text>
        <Text style={styles.headerSubtitle}>Your study companion</Text>
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: DARK_GREEN },
  headerSubtitle: { fontSize: 12, color: "#718078", marginTop: 4 },
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
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
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
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  typingText: { fontSize: 12, color: "#65776B" },
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
