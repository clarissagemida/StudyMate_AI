import { colors } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const BG = colors.background;

export default function PracticeResultsScreen() {
  const { attempt: s } = useLocalSearchParams<{ attempt: string }>();
  const data = useMemo(() => {
    try {
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }, [s]);

  if (!data) return null;
  const { questions, answers, correct, total, pct, materialTitle } = data as any;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/student/quizzes")} style={styles.back}>
          <Ionicons name="home-outline" size={20} color={GREEN} />
        </Pressable>
        <Text style={styles.title}>Practice Results</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.score}>{pct}%</Text>
          <Text style={styles.sub}>
            {correct}/{total} correct • {materialTitle}
          </Text>
        </View>
        {questions.map((q: any, i: number) => {
          const sel = answers[q.id];
          const ok = typeof sel === "number" && sel === q.correctIndex;
          return (
            <View key={q.id} style={[styles.qcard, ok ? styles.ok : styles.bad]}>
              <Text style={styles.qnum}>
                Q{i + 1} • {ok ? "Correct" : "Incorrect"}
              </Text>
              <Text style={styles.qprompt}>{q.prompt}</Text>
              <Text style={styles.ans}>
                Your answer: {typeof sel === "number" ? q.options[sel] : "—"}
              </Text>
              <Text style={styles.ans}>Correct answer: {q.options[q.correctIndex]}</Text>
              {q.explanation ? <Text style={styles.exp}>Explanation: {q.explanation}</Text> : null}
            </View>
          );
        })}
        <Pressable onPress={() => router.push("/student/practice-history" as never)} style={styles.primary}>
          <Text style={styles.primaryText}>View Practice History</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/student/practice-generate" as never)} style={styles.ghost}>
          <Text style={styles.ghostText}>Generate Another Practice Quiz</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 6 },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#123D2A" },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5EDE7", alignItems: "center", padding: 16 },
  score: { fontSize: 42, fontWeight: "900", color: GREEN },
  sub: { color: "#5B7163", marginTop: 4 },
  qcard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5EDE7", padding: 12, gap: 6 },
  ok: { borderColor: "#B7E3C3" },
  bad: { borderColor: "#F3D4D4" },
  qnum: { fontWeight: "800", color: "#123D2A" },
  qprompt: { fontWeight: "700", color: "#20392B" },
  ans: { color: "#43584A" },
  exp: { color: "#5B7163", fontStyle: "italic" },
  primary: { backgroundColor: GREEN, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "800" },
  ghost: { alignItems: "center", paddingVertical: 10 },
  ghostText: { color: GREEN, fontWeight: "700" },
});
