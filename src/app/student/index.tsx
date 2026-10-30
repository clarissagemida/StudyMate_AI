import { supabase } from "@/lib/supabase";
import { ActionCard } from "@/components/ui/action-card";
import { Card } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { colors, radius, spacing } from "@/theme/tokens";
import { AI_ENABLED } from "@/utils/aiFlags";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
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
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [quizTitles, setQuizTitles] = useState<Record<string, string>>({});

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

          if (!active) return;

          if (error) {
            if (!isMissingRelation(error)) {
              console.warn("Could not load quiz history:", error.message);
            }
            return;
          }

          const rows = (data ?? []) as AttemptSummary[];
          setAttempts(rows);

          const quizIds = Array.from(
            new Set(rows.map((attempt) => attempt.quiz_id)),
          );

          if (quizIds.length === 0) return;

          const { data: quizRows, error: quizError } = await supabase
            .from("quizzes")
            .select("id, title")
            .in("id", quizIds);

          if (!active || quizError) return;

          const titles: Record<string, string> = {};
          for (const row of quizRows ?? []) {
            titles[row.id] = row.title;
          }
          setQuizTitles(titles);
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

          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => openScreen("/student/profile")}
            accessibilityLabel="Open profile"
          >
            <Ionicons name="person-outline" size={24} color={GREEN} />
          </TouchableOpacity>
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

          {AI_ENABLED ? (
            <View style={styles.gridCell}>
              <ActionCard
                icon="chatbubbles-outline"
                iconColor="#6953B8"
                iconBg="#E9E6FA"
                title="AI Buddy"
                description="Ask study questions"
                onPress={() => openScreen("/student/ai-buddy")}
              />
            </View>
          ) : null}

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
    paddingTop: spacing.md,
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
