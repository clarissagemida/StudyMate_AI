import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { showNotice } from "@/utils/notify";
import { invokeAi } from "@/utils/aiClient";
import type { PracticeConfig, PracticeQuestion } from "@/utils/studentPractice";

const GREEN = colors.primary;
const BG = colors.background;

type GenResp =
  | { status: "ok"; questions: PracticeQuestion[] }
  | { status: "error"; message: string };

export default function PracticeTakeScreen() {
  const { config: cfgStr } = useLocalSearchParams<{ config: string }>();
  const config: PracticeConfig | null = useMemo(() => {
    try {
      return cfgStr ? (JSON.parse(cfgStr) as PracticeConfig) : null;
    } catch {
      return null;
    }
  }, [cfgStr]);

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!config) {
        router.back();
        return;
      }
      setLoading(true);
      const res = await invokeAi<GenResp>(
        "student-practice-generator",
        {
          materialId: config.materialId,
          difficulty: config.difficulty,
          questionCount: config.questionCount,
          questionType: config.questionType,
        },
        { timeoutMs: 120000 },
      );
      if (!res.ok) {
        showNotice("Generation Failed", res.message);
        router.back();
        return;
      }
      const data = res.data as any;
      if (data.status !== "ok" || !Array.isArray(data.questions) || data.questions.length === 0) {
        showNotice("Generation Failed", data?.message || "No questions returned");
        router.back();
        return;
      }
      setQuestions(data.questions);
      setLoading(false);
    };
    void run();
  }, [config]);

  const q = questions[idx];
  const total = questions.length;
  const answered = Object.keys(answers).length;

  const pick = (i: number) => {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: i }));
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      let correct = 0;
      for (const qq of questions) {
        const sel = answers[qq.id];
        if (typeof sel === "number" && sel === qq.correctIndex) correct++;
      }
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      const { error } = await supabase.from("student_practice_attempts").insert({
        student_id: user.id,
        material_id: config!.materialId,
        difficulty: config!.difficulty,
        question_type: config!.questionType,
        question_count: total,
        correct_count: correct,
        score_percentage: pct,
        duration_seconds: duration,
        questions,
        answers,
      });
      if (error) throw error;
      router.replace({
        pathname: "/student/practice-results",
        params: {
          attempt: JSON.stringify({
            questions,
            answers,
            correct,
            total,
            pct,
            duration,
            materialTitle: config!.materialTitle,
            materialId: config!.materialId,
          }),
        },
      } as never);
    } catch (e: any) {
      showNotice("Save Failed", e.message || "Could not save attempt");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} />
          <Text style={styles.centerText}>Generating practice questions from material...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (review) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => setReview(false)} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={GREEN} />
          </Pressable>
          <Text style={styles.title}>Review Before Submit</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={styles.sub}>
            Answered {answered}/{total}
          </Text>
          {questions.map((qq, i) => (
            <View key={qq.id} style={styles.revRow}>
              <Text style={styles.revQ}>
                {i + 1}. {qq.prompt}
              </Text>
              <Text style={styles.revA}>
                Your answer:{" "}
                {typeof answers[qq.id] === "number" ? qq.options[answers[qq.id]] : "Not answered"}
              </Text>
            </View>
          ))}
          <Pressable onPress={submit} disabled={submitting} style={[styles.primary, submitting && styles.disabled]}>
            <Text style={styles.primaryText}>{submitting ? "Saving..." : "Submit & Save"}</Text>
          </Pressable>
          <Pressable onPress={() => setReview(false)} style={styles.ghost}>
            <Text style={styles.ghostText}>Back to Questions</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!q) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={GREEN} />
        </Pressable>
        <Text style={styles.title}>
          Question {idx + 1} / {total}
        </Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={styles.progress}>
        <View style={[styles.bar, { width: `${((idx + 1) / total) * 100}%` }]} />
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={styles.prompt}>{q.prompt}</Text>
        {q.options.map((opt, o) => (
          <Pressable
            key={o}
            onPress={() => pick(o)}
            style={[styles.opt, answers[q.id] === o && styles.optActive]}
          >
            <Text style={[styles.optText, answers[q.id] === o && styles.optTextActive]}>{opt}</Text>
          </Pressable>
        ))}
        <View style={styles.nav}>
          <Pressable
            onPress={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={[styles.navBtn, idx === 0 && styles.disabled]}
          >
            <Text style={styles.navText}>Previous</Text>
          </Pressable>
          {idx === total - 1 ? (
            <Pressable onPress={() => setReview(true)} style={styles.primary}>
              <Text style={styles.primaryText}>Review & Submit</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setIdx((i) => Math.min(total - 1, i + 1))} style={styles.primary}>
              <Text style={styles.primaryText}>Next</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  centerText: { color: "#5B7163" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 6 },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#123D2A" },
  progress: { height: 4, backgroundColor: "#E5EDE7", marginHorizontal: 16, marginTop: 8, borderRadius: 999, overflow: "hidden" },
  bar: { height: 4, backgroundColor: GREEN },
  prompt: { fontSize: 15, fontWeight: "800", color: "#123D2A", lineHeight: 22 },
  opt: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5EDE7", padding: 12 },
  optActive: { borderColor: GREEN, backgroundColor: "#F3F9F5" },
  optText: { color: "#20392B" },
  optTextActive: { fontWeight: "800", color: GREEN },
  nav: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  navBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5EDE7", backgroundColor: "#fff" },
  navText: { fontWeight: "700", color: "#43584A" },
  primary: { backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  primaryText: { color: "#fff", fontWeight: "800" },
  ghost: { alignItems: "center", paddingVertical: 10 },
  ghostText: { color: GREEN, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  sub: { color: "#5B7163" },
  revRow: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5EDE7", padding: 10, gap: 4 },
  revQ: { fontWeight: "700", color: "#123D2A" },
  revA: { color: "#5B7163" },
});
