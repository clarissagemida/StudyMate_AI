import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatPracticeDate, type PracticeAttemptRow } from "@/utils/studentPractice";

const GREEN = colors.primary;
const BG = colors.background;

export default function PracticeHistoryScreen() {
  const [rows, setRows] = useState<PracticeAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("student_practice_attempts")
        .select(
          "id,material_id,difficulty,question_type,question_count,correct_count,score_percentage,duration_seconds,created_at,questions,answers",
        )
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setRows((data || []) as PracticeAttemptRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    void run();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={GREEN} />
        </Pressable>
        <Text style={styles.title}>Practice History</Text>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/student/practice-results",
                params: {
                  attempt: JSON.stringify({
                    questions: item.questions,
                    answers: item.answers,
                    correct: item.correct_count,
                    total: item.question_count,
                    pct: item.score_percentage,
                    duration: item.duration_seconds,
                    materialId: item.material_id,
                  }),
                },
              } as never)
            }
            style={styles.card}
          >
            <View style={styles.row}>
              <Text style={styles.date}>{formatPracticeDate(item.created_at)}</Text>
              <Text style={styles.pct}>{item.score_percentage}%</Text>
            </View>
            <Text style={styles.meta}>
              {item.difficulty} • {item.question_type.replace("_", " ")} •{" "}
              {item.correct_count}/{item.question_count} correct
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No practice attempts yet.</Text> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 6 },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#123D2A" },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5EDE7", padding: 12 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  date: { color: "#5B7163" },
  pct: { fontWeight: "900", color: GREEN },
  meta: { color: "#43584A", marginTop: 4 },
  empty: { textAlign: "center", marginTop: 40, color: "#6B7F72" },
});
