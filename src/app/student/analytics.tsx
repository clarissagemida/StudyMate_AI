import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { ThemedSafeAreaView as SafeAreaView } from "@/components/themed-safe-area-view";

const GREEN = colors.primary;
const DARK = colors.primaryDeep;
const MUTED = colors.textMuted;
type Period = "week" | "month";
type Attempt = { id: string; quiz_id: string; score: number; total: number; created_at: string };
type LessonProgress = { material_id: string; completed_at: string | null };
type QuizMeta = { id: string; subject: string };
type MaterialMeta = { id: string; subject: string };
type SubjectStat = { name: string; lessons: number; scores: number[] };

function scorePercent(attempt: Attempt) { return attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0; }

export default function StudentAnalyticsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [lessons, setLessons] = useState<LessonProgress[]>([]);
  const [quizMeta, setQuizMeta] = useState<Record<string, string>>({});
  const [materialMeta, setMaterialMeta] = useState<Record<string, string>>({});

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) { router.replace("/login"); return; }
        const [attemptResult, lessonResult] = await Promise.all([
          supabase.from("quiz_attempts").select("id, quiz_id, score, total, created_at").eq("student_id", user.id).order("created_at", { ascending: false }).limit(500),
          supabase.from("student_material_progress").select("material_id, completed_at").eq("student_id", user.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(500),
        ]);
        if (!active) return;
        const attemptRows = (attemptResult.data ?? []) as Attempt[];
        const lessonRows = (lessonResult.data ?? []) as LessonProgress[];
        setAttempts(attemptRows);
        setLessons(lessonRows);
        const quizIds = Array.from(new Set(attemptRows.map((row) => row.quiz_id)));
        const materialIds = Array.from(new Set(lessonRows.map((row) => row.material_id)));
        const [quizResult, materialResult] = await Promise.all([
          quizIds.length ? supabase.from("quizzes").select("id, subject").in("id", quizIds) : Promise.resolve({ data: [], error: null }),
          materialIds.length ? supabase.from("materials").select("id, subject").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active) return;
        const quizzes: Record<string, string> = {};
        for (const quiz of (quizResult.data ?? []) as QuizMeta[]) quizzes[quiz.id] = quiz.subject || "Other";
        const materials: Record<string, string> = {};
        for (const material of (materialResult.data ?? []) as MaterialMeta[]) materials[material.id] = material.subject || "Other";
        setQuizMeta(quizzes);
        setMaterialMeta(materials);
      } catch (error) {
        console.warn("Student analytics load error:", error);
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [router]));

  const periodDays = period === "week" ? 7 : 30;
  const cutoff = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (periodDays - 1)); return date; }, [periodDays]);
  const recentAttempts = attempts.filter((attempt) => new Date(attempt.created_at) >= cutoff);
  const recentLessons = lessons.filter((lesson) => lesson.completed_at && new Date(lesson.completed_at) >= cutoff);
  const average = recentAttempts.length ? Math.round(recentAttempts.reduce((sum, attempt) => sum + scorePercent(attempt), 0) / recentAttempts.length) : null;

  const activityBars = useMemo(() => {
    const bars: { label: string; value: number }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const countActivity = (start: Date, end: Date) => {
      const inRange = (value: string | null) => { if (!value) return false; const date = new Date(value); return date >= start && date < end; };
      return attempts.filter((attempt) => inRange(attempt.created_at)).length + lessons.filter((lesson) => inRange(lesson.completed_at)).length;
    };
    if (period === "week") {
      for (let ago = 6; ago >= 0; ago--) {
        const start = new Date(today); start.setDate(today.getDate() - ago);
        const end = new Date(start); end.setDate(start.getDate() + 1);
        bars.push({ label: start.toLocaleDateString("en", { weekday: "short" }), value: countActivity(start, end) });
      }
    } else {
      for (let week = 4; week >= 0; week--) {
        const end = new Date(today); end.setDate(today.getDate() - week * 7 + 1);
        const start = new Date(end); start.setDate(end.getDate() - (week === 4 ? 2 : 7));
        bars.push({ label: week === 0 ? "This wk" : `${week} wk`, value: countActivity(start, end) });
      }
    }
    return bars;
  }, [attempts, lessons, period]);

  const scoreBars = [...recentAttempts].slice(0, 7).reverse();
  const subjects = useMemo(() => {
    const result = new Map<string, SubjectStat>();
    for (const lesson of lessons) {
      const name = materialMeta[lesson.material_id] ?? "Other subjects";
      const stat = result.get(name) ?? { name, lessons: 0, scores: [] };
      stat.lessons += 1; result.set(name, stat);
    }
    for (const attempt of attempts) {
      const name = quizMeta[attempt.quiz_id] ?? "Other subjects";
      const stat = result.get(name) ?? { name, lessons: 0, scores: [] };
      stat.scores.push(scorePercent(attempt)); result.set(name, stat);
    }
    return Array.from(result.values()).map((stat) => ({ ...stat, average: stat.scores.length ? Math.round(stat.scores.reduce((a, b) => a + b, 0) / stat.scores.length) : null })).sort((a, b) => (b.lessons + b.scores.length) - (a.lessons + a.scores.length)).slice(0, 6);
  }, [attempts, lessons, materialMeta, quizMeta]);
  const maxActivity = Math.max(1, ...activityBars.map((bar) => bar.value));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={GREEN} /><Text style={styles.muted}>Preparing your learning summary…</Text></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <StatusBar barStyle="dark-content" />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.topRow}><Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}><Ionicons name="arrow-back" size={20} color={DARK} /></Pressable><View style={styles.heading}><Text style={styles.eyebrow}>YOUR LEARNING</Text><Text style={styles.title}>Analytics</Text></View><View style={styles.topIcon}><Ionicons name="analytics-outline" size={21} color={GREEN} /></View></View>
      <Text style={styles.intro}>A clear view of the lessons you’ve completed and how your quiz results are progressing.</Text>

      <View style={styles.periodRow}><Text style={styles.periodLabel}>Activity period</Text><View style={styles.segment}>{(["week", "month"] as Period[]).map((value) => <Pressable key={value} onPress={() => setPeriod(value)} accessibilityRole="button" accessibilityState={{ selected: period === value }} style={[styles.segmentButton, period === value && styles.segmentSelected]}><Text style={[styles.segmentText, period === value && styles.segmentTextSelected]}>{value === "week" ? "7 days" : "30 days"}</Text></Pressable>)}</View></View>

      <View style={styles.statGrid}>
        <Card style={styles.statCard}><View style={styles.statIcon}><Ionicons name="clipboard-outline" size={18} color={GREEN} /></View><Text style={styles.statValue}>{recentAttempts.length}</Text><Text style={styles.statLabel}>Quizzes completed</Text></Card>
        <Card style={styles.statCard}><View style={[styles.statIcon, styles.statIconGold]}><Ionicons name="trending-up-outline" size={18} color="#A66A12" /></View><Text style={styles.statValue}>{average == null ? "—" : `${average}%`}</Text><Text style={styles.statLabel}>Average score</Text></Card>
        <Card style={styles.statCard}><View style={[styles.statIcon, styles.statIconBlue]}><Ionicons name="book-outline" size={18} color="#28747B" /></View><Text style={styles.statValue}>{recentLessons.length}</Text><Text style={styles.statLabel}>Lessons completed</Text></Card>
      </View>

      <SectionHeader title="Learning activity" />
      <Card style={styles.chartCard}><View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Completed work</Text><Text style={styles.chartCaption}>Lessons and quizzes by {period === "week" ? "day" : "week"}</Text></View><View style={styles.legend}><View style={styles.legendDot} /><Text style={styles.legendText}>Activities</Text></View></View>
        {activityBars.every((bar) => bar.value === 0) ? <View style={styles.emptyChart}><Ionicons name="bar-chart-outline" size={25} color="#9BAD9F" /><Text style={styles.emptyText}>Completed lessons and quizzes will appear here.</Text></View> : <View style={styles.barChart}>{activityBars.map((bar, index) => <View key={`${bar.label}-${index}`} style={styles.barColumn}><Text style={styles.barValue}>{bar.value || ""}</Text><View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max(bar.value ? 12 : 0, (bar.value / maxActivity) * 100)}%` }]} /></View><Text style={styles.barLabel}>{bar.label}</Text></View>)}</View>}
        <Text style={styles.footnote}>Each completed quiz or marked-complete lesson counts as one activity.</Text>
      </Card>

      <SectionHeader title="Quiz performance" actionLabel="All quizzes" onAction={() => router.push("/student/quizzes")} />
      <Card style={styles.chartCard}><Text style={styles.chartTitle}>Recent quiz scores</Text><Text style={styles.chartCaption}>Latest {scoreBars.length} submitted {scoreBars.length === 1 ? "quiz" : "quizzes"}</Text>
        {scoreBars.length ? <View style={styles.scoreList}>{scoreBars.map((attempt, index) => { const score = scorePercent(attempt); return <View key={attempt.id} style={styles.scoreRow}><Text style={styles.scoreIndex}>{String(index + 1).padStart(2, "0")}</Text><View style={styles.scoreTrack}><View style={[styles.scoreFill, { width: `${score}%` }]} /></View><Text style={styles.scorePercent}>{score}%</Text></View>; })}</View> : <View style={styles.emptyInline}><Ionicons name="clipboard-outline" size={19} color="#9BAD9F" /><Text style={styles.emptyText}>Your quiz scores will appear after your first submission.</Text></View>}
        <Text style={styles.footnote}>Scores are shown from oldest to newest in this recent set.</Text>
      </Card>

      <SectionHeader title="By subject" />
      {subjects.length ? <View style={styles.subjectList}>{subjects.map((subject) => <Card key={subject.name} style={styles.subjectCard}><View style={styles.subjectIcon}><Ionicons name="library-outline" size={18} color={GREEN} /></View><View style={styles.subjectCopy}><Text style={styles.subjectTitle} numberOfLines={1}>{subject.name}</Text><Text style={styles.subjectCaption}>{subject.lessons} {subject.lessons === 1 ? "lesson" : "lessons"} · {subject.scores.length} {subject.scores.length === 1 ? "quiz" : "quizzes"}</Text></View><Text style={styles.subjectScore}>{subject.average == null ? "—" : `${subject.average}%`}</Text></Card>)}</View> : <Card style={styles.emptyInline}><Ionicons name="library-outline" size={19} color="#9BAD9F" /><Text style={styles.emptyText}>Subject insights will appear as you complete lessons and quizzes.</Text></Card>}

      <View style={styles.note}><Ionicons name="information-circle-outline" size={17} color={GREEN} /><Text style={styles.noteText}>Analytics use saved quiz attempts and lessons you marked complete. Time spent studying is not tracked.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.background }, muted: { color: MUTED, fontSize: 13 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 }, back: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border }, heading: { flex: 1 }, eyebrow: { color: MUTED, fontSize: 9, fontWeight: "800", letterSpacing: 1.25 }, title: { color: DARK, fontSize: 23, fontWeight: "800", marginTop: 2 }, topIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F3EB" }, intro: { color: MUTED, fontSize: 13, lineHeight: 19, marginBottom: 3 },
  periodRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, periodLabel: { color: DARK, fontSize: 12, fontWeight: "700" }, segment: { flexDirection: "row", padding: 3, borderRadius: radius.md, backgroundColor: "#E9F0EB" }, segmentButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 }, segmentSelected: { backgroundColor: "#FFFFFF", elevation: 1 }, segmentText: { color: MUTED, fontSize: 11, fontWeight: "700" }, segmentTextSelected: { color: GREEN },
  statGrid: { flexDirection: "row", gap: 8 }, statCard: { flex: 1, minHeight: 112, padding: 11 }, statIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#E8F3EB", alignItems: "center", justifyContent: "center", marginBottom: 7 }, statIconGold: { backgroundColor: "#FFF1DC" }, statIconBlue: { backgroundColor: "#E5F2F3" }, statValue: { color: DARK, fontSize: 20, fontWeight: "800" }, statLabel: { color: MUTED, fontSize: 9, marginTop: 2 },
  chartCard: { padding: spacing.lg }, chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, chartTitle: { color: DARK, fontSize: 14, fontWeight: "800" }, chartCaption: { color: MUTED, fontSize: 11, marginTop: 4 }, legend: { flexDirection: "row", alignItems: "center", gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }, legendText: { color: MUTED, fontSize: 10 },
  barChart: { height: 145, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 20, gap: 7 }, barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" }, barValue: { height: 15, color: MUTED, fontSize: 9 }, barTrack: { width: "100%", height: 102, justifyContent: "flex-end", backgroundColor: "#F1F5F2", borderRadius: 8, overflow: "hidden" }, bar: { width: "100%", minHeight: 0, borderRadius: 8, backgroundColor: GREEN }, barLabel: { color: MUTED, fontSize: 9, marginTop: 7 }, footnote: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 13 }, emptyChart: { minHeight: 125, justifyContent: "center", alignItems: "center", gap: 9 }, emptyText: { flex: 1, color: MUTED, fontSize: 11, lineHeight: 16 },
  scoreList: { gap: 12, marginTop: 18 }, scoreRow: { flexDirection: "row", alignItems: "center", gap: 9 }, scoreIndex: { width: 22, color: MUTED, fontSize: 10, fontWeight: "700" }, scoreTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: "#EDF2EE", overflow: "hidden" }, scoreFill: { height: "100%", borderRadius: 5, backgroundColor: GREEN }, scorePercent: { width: 34, textAlign: "right", color: DARK, fontSize: 11, fontWeight: "800" }, emptyInline: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 18 },
  subjectList: { gap: 8 }, subjectCard: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingVertical: 10 }, subjectIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#E8F3EB", alignItems: "center", justifyContent: "center", marginRight: 10 }, subjectCopy: { flex: 1 }, subjectTitle: { color: DARK, fontSize: 12, fontWeight: "800" }, subjectCaption: { color: MUTED, fontSize: 10, marginTop: 3 }, subjectScore: { color: GREEN, fontSize: 14, fontWeight: "800" }, note: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderRadius: 13, padding: 12, backgroundColor: "#EAF4EC", marginTop: 2 }, noteText: { flex: 1, color: "#526C5B", fontSize: 10, lineHeight: 15 },
});
