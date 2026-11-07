import { supabase } from "@/lib/supabase";
import { ActionCard } from "@/components/ui/action-card";
import { Card } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDeep;
const BACKGROUND = colors.background;
const MUTED = colors.textMuted;

type AttemptSummary = {
  id: string;
  quiz_id: string;
  score: number;
  total: number;
  created_at: string;
};
type PublishedQuiz = { id: string; title: string; subject: string };
type StudyProgress = { material_id: string; status: "in_progress" | "completed" };
type StudyMaterial = { id: string; title: string; subject: string };

function isMissingRelation(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StudentHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [quizTitles, setQuizTitles] = useState<Record<string, string>>({});
  const [availableQuizzes, setAvailableQuizzes] = useState<PublishedQuiz[]>([]);
  const [studyProgress, setStudyProgress] = useState<StudyProgress[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<Record<string, StudyMaterial>>({});

  const openScreen = (path: string) => {
    router.push(path as never);
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadOverview = async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (!active || !user) return;

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();

          if (active && profile?.full_name?.trim()) {
            setFullName(profile.full_name.trim());
          }

          const { data, error } = await supabase
            .from("quiz_attempts")
            .select("id, quiz_id, score, total, created_at")
            .eq("student_id", user.id)
            .order("created_at", { ascending: false })
            .limit(10);

          const { data: published, error: publishedError } = await supabase
            .from("quizzes")
            .select("id, title, subject")
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .limit(5);

          if (active && !publishedError) setAvailableQuizzes((published ?? []) as PublishedQuiz[]);

          if (!active) return;

          if (error) {
            if (!isMissingRelation(error)) {
              console.warn("Could not load quiz history:", error.message);
            }
            setAttempts([]);
          } else {
            const rows = (data ?? []) as AttemptSummary[];
            setAttempts(rows);
          }

          const quizIds = Array.from(
            new Set((data ?? []).map((attempt) => (attempt as AttemptSummary).quiz_id)),
          );

          if (quizIds.length > 0) {
            const { data: quizRows, error: quizError } = await supabase
              .from("quizzes")
              .select("id, title")
              .in("id", quizIds);
            if (!active) return;
            if (quizError) console.warn("Could not load quiz titles:", quizError.message);
            else {
              const titles: Record<string, string> = {};
              for (const row of quizRows ?? []) titles[row.id] = row.title;
              setQuizTitles(titles);
            }
          }

          const { data: progressRows, error: progressError } = await supabase
            .from("student_material_progress")
            .select("material_id, status")
            .eq("student_id", user.id)
            .order("last_opened_at", { ascending: false })
            .limit(5);
          if (active && !progressError) {
            const progress = (progressRows ?? []) as StudyProgress[];
            setStudyProgress(progress);
            const materialIds = progress.map((row) => row.material_id);
            if (materialIds.length) {
              const { data: materialRows } = await supabase.from("materials").select("id, title, subject").in("id", materialIds).eq("status", "published");
              if (active) {
                const mapped: Record<string, StudyMaterial> = {};
                for (const row of materialRows ?? []) mapped[row.id] = row as StudyMaterial;
                setStudyMaterials(mapped);
              }
            }
          }
        } catch (error) {
          console.warn("Could not load student overview:", error);
        } finally {
          if (active) setLoading(false);
        }
      };

      void loadOverview();

      return () => {
        active = false;
      };
    }, []),
  );

  const firstName = fullName.split(/\s+/)[0] || "Student";

  if (loading) return <DashboardSkeleton />;

  const totalCorrect = attempts.reduce(
    (sum, attempt) => sum + attempt.score,
    0,
  );
  const totalQuestions = attempts.reduce(
    (sum, attempt) => sum + attempt.total,
    0,
  );
  const averagePercent =
    totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;
  const hasAttempts = attempts.length > 0;

  const latestAttempt = attempts[0];
  const latestPercent =
    latestAttempt && latestAttempt.total > 0
      ? Math.round((latestAttempt.score / latestAttempt.total) * 100)
      : 0;
  const latestTitle = latestAttempt
    ? (quizTitles[latestAttempt.quiz_id] ?? "Quiz")
    : "";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Text style={styles.eyebrow}>STUDYMATE AI</Text>
            <Text style={styles.welcome} numberOfLines={1}>
              Hello, {firstName}!
            </Text>
            <Text style={styles.subtitle}>
              Ready to learn something new today?
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Progress */}
        <View style={styles.goalCard}>
          <View style={styles.goalTop}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>YOUR PROGRESS</Text>
              <Text style={styles.goalTitle}>
                {hasAttempts
                  ? `${averagePercent}% average score`
                  : "No quizzes completed yet"}
              </Text>
              <Text style={styles.goalSubtitle}>
                {hasAttempts
                  ? `Across your last ${attempts.length} ${
                      attempts.length === 1 ? "quiz" : "quizzes"
                    }`
                  : "Take a quiz to start building your progress."}
              </Text>
            </View>

            <View style={styles.goalIcon}>
              <Ionicons name="stats-chart-outline" size={28} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${averagePercent}%` }]}
            />
          </View>
          <Text style={styles.goalProgress}>
            {hasAttempts
              ? `${totalCorrect} of ${totalQuestions} questions answered correctly`
              : "Your results will appear here after your first quiz."}
          </Text>
        </View>

        {/* Quick Actions */}
        <SectionHeader
          title="Ready when you are"
          actionLabel="All quizzes"
          onAction={() => openScreen("/student/quizzes")}
        />
        {availableQuizzes.length ? availableQuizzes.map((quiz) => {
          const quizAttempt = attempts.find((attempt) => attempt.quiz_id === quiz.id);
          const score = quizAttempt && quizAttempt.total > 0 ? Math.round(quizAttempt.score / quizAttempt.total * 100) : null;
          return <TouchableOpacity key={quiz.id} onPress={() => router.push({ pathname: "/student/quiz-attempt", params: { quizId: quiz.id } })} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${quizAttempt ? "Review" : "Take"} ${quiz.title}`}>
            <Card style={styles.availableQuiz}>
              <View style={[styles.availableIcon, quizAttempt && styles.studyIcon]}><Ionicons name={quizAttempt ? "checkmark-circle-outline" : "clipboard-outline"} size={19} color={quizAttempt ? GREEN : GREEN} /></View>
              <View style={styles.activityText}><Text style={styles.activityTitle} numberOfLines={1}>{quiz.title}</Text><Text style={styles.activityDescription} numberOfLines={1}>{quiz.subject} · {quizAttempt ? `Attempted${score === null ? "" : ` · ${score}%`}` : "Upcoming"}</Text></View>
              <Ionicons name="arrow-forward" size={18} color={GREEN} />
            </Card>
          </TouchableOpacity>;
        }) : <TouchableOpacity onPress={() => openScreen("/student/quizzes")} activeOpacity={0.85}><Card style={styles.availableQuiz}><View style={styles.availableIcon}><Ionicons name="search-outline" size={19} color={GREEN} /></View><View style={styles.activityText}><Text style={styles.activityTitle}>Browse quizzes</Text><Text style={styles.activityDescription}>See all quizzes published by teachers</Text></View><Ionicons name="arrow-forward" size={18} color={GREEN} /></Card></TouchableOpacity>}

        <SectionHeader title="Your learning plan" actionLabel="Study" onAction={() => openScreen("/student/study")} />
        {studyProgress.filter((row) => row.status === "in_progress" && studyMaterials[row.material_id]).length ? studyProgress.filter((row) => row.status === "in_progress" && studyMaterials[row.material_id]).map((row) => {
          const material = studyMaterials[row.material_id];
          return <TouchableOpacity key={row.material_id} onPress={() => openScreen("/student/study")} activeOpacity={0.85}><Card style={styles.availableQuiz}><View style={[styles.availableIcon, styles.studyIcon]}><Ionicons name="book-outline" size={19} color="#267B83" /></View><View style={styles.activityText}><Text style={styles.activityTitle} numberOfLines={1}>{material.title}</Text><Text style={styles.activityDescription} numberOfLines={1}>{material.subject} · In progress</Text></View><Ionicons name="arrow-forward" size={18} color={GREEN} /></Card></TouchableOpacity>;
        }) : <Card style={styles.learningEmpty}><Ionicons name="checkmark-circle-outline" size={20} color={GREEN} /><Text style={styles.learningEmptyText}>Your lesson progress will appear here as you study.</Text></Card>}

        {/* Quick Actions */}
        <SectionHeader title="What would you like to do?" />

        <View style={styles.actionGrid}>
          <View style={styles.gridCell}>
            <ActionCard
              icon="book-outline"
              title="Start Studying"
              description="Review your lessons"
              onPress={() => openScreen("/student/study")}
            />
          </View>

          <View style={styles.gridCell}>
            <ActionCard
              icon="clipboard-outline"
              iconColor="#B87519"
              iconBg="#FFF0DA"
              title="Take a Quiz"
              description="Test your knowledge"
              onPress={() => openScreen("/student/quizzes")}
            />
          </View>

          <View style={styles.gridCell}>
            <ActionCard
              icon="chatbubbles-outline"
              iconColor="#176B45"
              iconBg="#E8F3EB"
              title="Message a Teacher"
              description="Ask about your classwork"
              onPress={() => openScreen("/student/messages")}
            />
          </View>

          <View style={styles.gridCell}>
            <ActionCard
              icon="stats-chart-outline"
              iconColor="#267B83"
              iconBg="#DFF1F3"
              title="My Progress"
              description="Review your quiz scores"
              onPress={() => openScreen("/student/quizzes")}
            />
          </View>
        </View>

        {/* Recent Activity */}
        <SectionHeader
          title="Recent Activity"
          actionLabel="View"
          onAction={() => openScreen("/student/quizzes")}
        />

        <TouchableOpacity
          onPress={() => openScreen("/student/quizzes")}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open your quiz history"
        >
          <Card style={styles.activityCard}>
            <View style={styles.activityIcon}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color={GREEN}
              />
            </View>

            <View style={styles.activityText}>
              {latestAttempt ? (
                <>
                  <Text style={styles.activityTitle} numberOfLines={1}>
                    {latestTitle}
                  </Text>
                  <Text style={styles.activityDescription}>
                    Scored {latestAttempt.score}/{latestAttempt.total} (
                    {latestPercent}%) · {formatDate(latestAttempt.created_at)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.activityTitle}>Your quiz history</Text>
                  <Text style={styles.activityDescription}>
                    Your completed quizzes and scores will appear here.
                  </Text>
                </>
              )}
            </View>

            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </Card>
        </TouchableOpacity>

        {/* Study Tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeading}>
            <Ionicons name="bulb-outline" size={22} color={GREEN} />
            <Text style={styles.tipTitle}>Study Tip</Text>
          </View>
          <Text style={styles.tipDescription}>
            Study in short sessions, take breaks, and test yourself to help
            remember what you learn.
          </Text>
        </View>

        <Text style={styles.footer}>Learn smarter with StudyMate AI</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  greeting: {
    flex: 1,
  },
  eyebrow: {
    color: GREEN,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 7,
  },
  welcome: {
    color: DARK_GREEN,
    fontSize: 25,
    fontWeight: "800",
  },
  subtitle: {
    color: MUTED,
    fontSize: 13,
    marginTop: 6,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoftAlt,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
  headerSpacer: { width: 12 },
  goalCard: {
    backgroundColor: GREEN,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
  },
  goalTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalText: {
    flex: 1,
  },
  goalLabel: {
    color: "#D6EBDD",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  goalTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 9,
  },
  goalSubtitle: {
    color: "#E2F1E6",
    fontSize: 12,
    marginTop: 7,
  },
  goalIcon: {
    width: 55,
    height: 55,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
  progressTrack: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginTop: 22,
    overflow: "hidden",
  },
  progressFill: {
    width: "33.33%",
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
  },
  goalProgress: {
    color: "#E2F1E6",
    fontSize: 11,
    marginTop: 9,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
  },
  availableQuiz: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm, paddingVertical: spacing.md },
  availableIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primarySoftAlt, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  studyIcon: { backgroundColor: "#DFF1F3" },
  learningEmpty: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.xxl },
  learningEmptyText: { flex: 1, color: MUTED, fontSize: 12, lineHeight: 18 },
  gridCell: {
    width: "48%",
    marginBottom: spacing.md,
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoftAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  activityText: {
    flex: 1,
  },
  activityTitle: {
    color: DARK_GREEN,
    fontSize: 14,
    fontWeight: "700",
  },
  activityDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  tipCard: {
    backgroundColor: "#E7F2E9",
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  tipHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  tipTitle: {
    color: DARK_GREEN,
    fontSize: 14,
    fontWeight: "800",
    marginLeft: spacing.sm,
  },
  tipDescription: {
    color: "#526C5B",
    fontSize: 12,
    lineHeight: 19,
  },
  footer: {
    textAlign: "center",
    color: MUTED,
    fontSize: 11,
    marginTop: spacing.xxl,
  },
});
