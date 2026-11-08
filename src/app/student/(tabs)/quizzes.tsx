import { supabase } from "@/lib/supabase";
import { showNotice } from "@/utils/notify";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { ScreenTitle } from "@/components/ui/section-header";
import { StateView } from "@/components/ui/state-view";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ThemedSafeAreaView as SafeAreaView } from "@/components/themed-safe-area-view";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDeep;
const BG = colors.background;

type Difficulty = "easy" | "medium" | "hard" | "mixed";

type QuizRow = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  description: string;
  max_attempts: number | null;
  created_at: string;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  score: number;
  total: number;
  created_at: string;
};

type QuizAttemptStatus = { used: number; max: number | null; canTake: boolean };

type LoadMode = "initial" | "refresh";

// PostgREST error codes for a table that has not been created yet.
function isMissingRelation(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function difficultyLabel(value: Difficulty) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function scorePercent(score: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}

export default function StudentQuizzesScreen() {
  const router = useRouter();
  const { subject } = useLocalSearchParams<{ subject?: string | string[] }>();
  const initialSubject = Array.isArray(subject) ? subject[0] : subject;
  const [items, setItems] = useState<QuizRow[] | null>(null);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>(
    {},
  );
  const [bestScores, setBestScores] = useState<
    Record<string, { score: number; total: number }>
  >({});
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptStatus, setAttemptStatus] = useState<Record<string, QuizAttemptStatus>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [search, setSearch] = useState(initialSubject?.trim() ?? "");

  const loadData = useCallback(async (mode: LoadMode) => {
    if (mode === "refresh") setRefreshing(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("quizzes")
        .select(
          "id, title, subject, topic, difficulty, description, max_attempts, created_at",
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (isMissingRelation(error)) {
        setTableMissing(true);
        setItems([]);
        setQuestionCounts({});
        setBestScores({});
        setAttempts([]);
        setAttemptStatus({});
        setLoadError(null);
        return;
      }

      if (error) throw new Error(error.message);

      setTableMissing(false);

      const rows = (data ?? []) as QuizRow[];
      setItems(rows);

      // Question counts come from a safe RPC after students lose direct read
      // access to quiz_questions. Fall back for projects without the migration.
      if (rows.length > 0) {
        const { data: countRows, error: countError } = await supabase.rpc(
          "get_published_quiz_question_counts",
        );

        if (!countError && Array.isArray(countRows)) {
          const counts: Record<string, number> = {};
          for (const value of countRows) {
            if (!value || typeof value !== "object") continue;

            const row = value as Record<string, unknown>;
            if (typeof row.quiz_id !== "string") continue;

            const count = Number(row.question_count);
            counts[row.quiz_id] = Number.isFinite(count) ? count : 0;
          }
          setQuestionCounts(counts);
        } else {
          const { data: questionRows, error: questionError } = await supabase
            .from("quiz_questions")
            .select("quiz_id")
            .in(
              "quiz_id",
              rows.map((row) => row.id),
            );

          if (questionError) {
            console.warn(
              "Could not load question counts:",
              questionError.message,
            );
            setQuestionCounts({});
          } else {
            const counts: Record<string, number> = {};
            for (const row of questionRows ?? []) {
              counts[row.quiz_id] = (counts[row.quiz_id] ?? 0) + 1;
            }
            setQuestionCounts(counts);
          }
        }
      } else {
        setQuestionCounts({});
      }

      // The student's own recent attempts. This table may not exist yet even
      // when quizzes does, so a missing-relation error here is not fatal.
      const { data: attemptRows, error: attemptError } = await supabase
        .from("quiz_attempts")
        .select("id, quiz_id, score, total, created_at")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (attemptError) {
        if (!isMissingRelation(attemptError)) {
          console.warn("Could not load attempts:", attemptError.message);
        }
        setAttempts([]);
        setBestScores({});
        setAttemptStatus({});
      } else {
        const list = (attemptRows ?? []) as AttemptRow[];
        setAttempts(list);

        const { data: statusRows, error: statusError } = await supabase.rpc("student_quiz_attempt_status");
        if (!statusError && Array.isArray(statusRows)) {
          const statuses: Record<string, QuizAttemptStatus> = {};
          for (const row of statusRows as { quiz_id: string; attempts_used: number; max_attempts: number | null; can_take: boolean }[]) {
            statuses[row.quiz_id] = {
              used: Number(row.attempts_used) || 0,
              max: row.max_attempts == null ? null : Number(row.max_attempts),
              canTake: Boolean(row.can_take),
            };
          }
          setAttemptStatus(statuses);
        } else {
          if (statusError) console.warn("Could not load attempt limits:", statusError.message);
          const counts: Record<string, number> = {};
          for (const attempt of list) counts[attempt.quiz_id] = (counts[attempt.quiz_id] ?? 0) + 1;
          const statuses: Record<string, QuizAttemptStatus> = {};
          for (const quiz of rows) {
            const used = counts[quiz.id] ?? 0;
            statuses[quiz.id] = { used, max: quiz.max_attempts, canTake: quiz.max_attempts == null || used < quiz.max_attempts };
          }
          setAttemptStatus(statuses);
        }

        // Best (highest-scoring) attempt per quiz, for the "Your best" badge.
        const best: Record<string, { score: number; total: number }> = {};
        for (const attempt of list) {
          const current = best[attempt.quiz_id];

          if (
            !current ||
            scorePercent(attempt.score, attempt.total) >
              scorePercent(current.score, current.total)
          ) {
            best[attempt.quiz_id] = {
              score: attempt.score,
              total: attempt.total,
            };
          }
        }
        setBestScores(best);
      }

      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Student quizzes error:", err);

      if (mode === "refresh") {
        showNotice("Refresh Failed", message);
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const run = async () => {
      await loadData("initial");
    };

    void run();
  }, [loadData]);

  const visibleItems = useMemo(() => {
    if (!items) return [];

    const term = search.trim().toLowerCase();

    if (!term) return items;

    return items.filter((item) =>
      [item.title, item.subject, item.topic, item.description].some((value) =>
        (value ?? "").toLowerCase().includes(term),
      ),
    );
  }, [items, search]);

  const recentAttempts = useMemo(() => {
    if (!items) return [];

    const titleById = new Map(items.map((item) => [item.id, item.title]));

    return attempts
      .map((attempt) => ({
        ...attempt,
        title: titleById.get(attempt.quiz_id) ?? "Removed quiz",
      }))
      .slice(0, 3);
  }, [attempts, items]);

  const progressSummary = useMemo(() => {
    const completed = new Set(attempts.map((attempt) => attempt.quiz_id)).size;
    const average = attempts.length
      ? Math.round(
          attempts.reduce(
            (sum, attempt) => sum + scorePercent(attempt.score, attempt.total),
            0,
          ) / attempts.length,
        )
      : null;
    return { completed, average };
  }, [attempts]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    void loadData("initial");
  };

  const openQuiz = (item: QuizRow) => {
    const status = attemptStatus[item.id];
    if (status && !status.canTake) {
      showNotice("No Attempts Remaining", "You have used all attempts allowed for this quiz.");
      return;
    }
    if ((questionCounts[item.id] ?? 0) === 0) {
      showNotice(
        "No questions yet",
        "This quiz does not have any questions available to answer.",
      );
      return;
    }

    router.push({
      pathname: "/student/quiz-attempt" as never,
      params: { quizId: item.id },
    });
  };

  if (loading && items === null) {
    return <StateView variant="loading" title="Loading quizzes..." />;
  }

  if (loadError && items === null) {
    return (
      <StateView
        variant="error"
        title="Unable to load quizzes"
        message={loadError}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={{ marginTop: 48 }}><ScreenTitle title="Quizzes" subtitle="Test what you have learned" /></View>

      {refreshing ? (
        <ProgressIndicator
          style={styles.refreshProgress}
          accessibilityLabel="Refreshing quizzes"
        />
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadData("refresh");
            }}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={19} color="#718078" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search subject, topic, or title"
                placeholderTextColor="#9AA69E"
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search quizzes"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color="#9AA69E" />
                </Pressable>
              )}
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeading}>
                <View><Text style={styles.progressTitle}>Your progress</Text><Text style={styles.progressSubtitle}>A quick look at your quiz work</Text></View>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryTile}><View style={styles.summaryIcon}><Ionicons name="checkmark-done-outline" size={17} color={GREEN} /></View><View style={styles.summaryCopy}><Text style={styles.summaryValue}>{progressSummary.completed}</Text><Text style={styles.summaryLabel}>Quizzes completed</Text></View></View>
                <View style={styles.summaryTile}><View style={styles.summaryIcon}><Ionicons name="stats-chart-outline" size={17} color={GREEN} /></View><View style={styles.summaryCopy}><Text style={styles.summaryValue}>{progressSummary.average === null ? "—" : `${progressSummary.average}%`}</Text><Text style={styles.summaryLabel}>Average score</Text></View></View>
              </View>
            </View>

            <Pressable
              onPress={() => router.push({ pathname: "/student/ai-buddy", params: { returnTo: "/student/quizzes" } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.aiPracticeCard, pressed && styles.pressed]}
            >
              <View style={styles.aiPracticeIcon}><Ionicons name="sparkles-outline" size={18} color={GREEN} /></View>
              <View style={styles.aiPracticeCopy}><Text style={styles.aiPracticeTitle}>Practice with AI Buddy</Text><Text style={styles.aiPracticeSubtitle}>Get a practice session tailored to you</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
            <Pressable onPress={() => router.push("/student/practice-history" as never)} accessibilityRole="button" style={styles.practiceHistoryLink}>
              <Ionicons name="time-outline" size={14} color={GREEN} /><Text style={styles.practiceHistoryText}>View AI practice history</Text>
            </Pressable>

            <View style={styles.quizSectionHeading}><View><Text style={styles.quizSectionTitle}>Published quizzes</Text><Text style={styles.quizSectionSubtitle}>Assessments shared by your teachers</Text></View><View style={styles.quizCount}><Text style={styles.quizCountText}>{visibleItems.length}</Text></View></View>
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.emptyBox}>
            <View style={styles.bigIcon}>
              <Ionicons name="clipboard-outline" size={26} color={GREEN} />
            </View>

            <Text style={styles.emptyTitle}>
              {tableMissing
                ? "Quizzes are not available yet"
                : search.trim()
                  ? "No matching quizzes"
                  : "No published quizzes yet"}
            </Text>

            <Text style={styles.emptyText}>
              {tableMissing
                ? "Quizzes will appear here once the quiz library is activated."
                : search.trim()
                  ? "Try a different search term."
                  : "Check back soon — your teachers are preparing quizzes."}
            </Text>
            {!search.trim() && !tableMissing ? <Pressable onPress={() => router.push({ pathname: "/student/ai-buddy", params: { returnTo: "/student/quizzes" } })} accessibilityRole="button" style={styles.emptyPracticeLink}><Ionicons name="sparkles-outline" size={15} color={GREEN} /><Text style={styles.emptyPracticeText}>Practice with AI Buddy</Text><Ionicons name="arrow-forward" size={14} color={GREEN} /></Pressable> : null}
          </Card>
        }
        ListFooterComponent={recentAttempts.length > 0 ? <Card style={styles.resultsCard}>
          <View style={styles.resultsHeader}><Text style={styles.resultsTitle}>Recent quiz attempts</Text></View>
          {recentAttempts.map((attempt) => <View key={attempt.id} style={styles.resultRow}><View style={styles.resultText}><Text style={styles.resultTitle} numberOfLines={1}>{attempt.title}</Text><Text style={styles.resultDate}>{formatDate(attempt.created_at)}</Text></View><Text style={styles.resultScore}>{scorePercent(attempt.score, attempt.total)}%</Text></View>)}
        </Card> : undefined}
        renderItem={({ item }) => {
          const count = questionCounts[item.id] ?? 0;
          const best = bestScores[item.id];
          const status = attemptStatus[item.id];
          const exhausted = status ? !status.canTake : false;
          const canStart = count > 0 && !exhausted;
          const attemptLabel = status
            ? status.max == null ? `${status.used} ${status.used === 1 ? "attempt" : "attempts"}` : `${status.used}/${status.max} attempts`
            : null;

          return (
            <Pressable
              onPress={() => openQuiz(item)}
              disabled={!canStart}
              accessibilityState={{ disabled: !canStart }}
              accessibilityRole="button"
              accessibilityLabel={`${exhausted ? "Completed" : status?.used ? "Retake" : "Start"} quiz ${item.title}`}
              style={({ pressed }) => [pressed && styles.pressed, !canStart && styles.quizUnavailable]}
            >
              <Card style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <Ionicons
                      name="help-circle-outline"
                      size={20}
                      color={GREEN}
                    />
                  </View>

                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {item.subject}
                      {item.topic ? ` · ${item.topic}` : ""}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textFaint}
                  />
                </View>

                {item.description ? (
                  <Text style={styles.cardDescription}>{item.description}</Text>
                ) : null}

                <View style={styles.chipRow}>
                  <Chip label={difficultyLabel(item.difficulty)} />
                  <Chip
                    label={`${count} ${count === 1 ? "question" : "questions"}`}
                  />
                  {best ? (
                    <Chip
                      tone="warning"
                      icon="trophy-outline"
                      label={`Best ${scorePercent(best.score, best.total)}%`}
                    />
                  ) : null}
                  {attemptLabel ? <Chip label={exhausted ? `Completed · ${attemptLabel}` : attemptLabel} tone={exhausted ? "success" : "brand"} /> : null}
                </View>

                <View style={styles.cardActionRow}>
                  <Text style={styles.cardActionMeta}>{count === 0 ? "Questions are being prepared" : exhausted ? "You’ve used all allowed attempts" : status?.used ? "Another attempt is available" : "Ready when you are"}</Text>
                  <View style={[styles.startQuizAction, !canStart && styles.startQuizDisabled]}><Text style={[styles.startQuizText, !canStart && styles.startQuizTextDisabled]}>{count === 0 ? "Unavailable" : exhausted ? "Completed" : status?.used ? "Retake quiz" : "Start quiz"}</Text><Ionicons name={canStart ? "arrow-forward" : "checkmark-circle-outline"} size={14} color={canStart ? "#FFFFFF" : colors.textFaint} /></View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  refreshProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    borderRadius: 0,
    zIndex: 10,
  },
  pressed: { opacity: 0.9 },
  practiceHistoryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "flex-start",
    minHeight: 32,
    paddingHorizontal: 4,
  },
  practiceHistoryText: { color: GREEN, fontWeight: "700", fontSize: 12 },
  aiPracticeCard: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  aiPracticeIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  aiPracticeCopy: { flex: 1, gap: 3 },
  aiPracticeTitle: { color: DARK_GREEN, fontSize: 12, fontWeight: "800" },
  aiPracticeSubtitle: { color: colors.textMuted, fontSize: 10 },
  progressSection: { gap: spacing.sm },
  progressHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { color: DARK_GREEN, fontSize: 14, fontWeight: "800" },
  progressSubtitle: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  summaryTile: { flex: 1, minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  summaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  summaryCopy: { flex: 1, gap: 2 },
  summaryValue: { color: DARK_GREEN, fontSize: 16, fontWeight: "900" },
  summaryLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "700" },
  quizSectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  quizSectionTitle: { color: DARK_GREEN, fontSize: 15, fontWeight: "800" },
  quizSectionSubtitle: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  quizCount: { minWidth: 28, height: 28, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  quizCountText: { color: GREEN, fontSize: 11, fontWeight: "800" },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs },
  cardActionMeta: { flex: 1, color: colors.textMuted, fontSize: 10 },
  startQuizAction: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 11, borderRadius: radius.sm, backgroundColor: GREEN },
  startQuizDisabled: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  startQuizText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  startQuizTextDisabled: { color: colors.textFaint },
  quizUnavailable: { opacity: 0.78 },
  emptyPracticeLink: { minHeight: 40, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: spacing.xs, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  emptyPracticeText: { color: GREEN, fontSize: 11, fontWeight: "800" },
  bigIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + 8,
    gap: spacing.md,
  },
  listHeader: { gap: spacing.md },
  resultsCard: {
    padding: spacing.lg,
    gap: spacing.sm + 2,
  },
  resultsTitle: { fontSize: 14, fontWeight: "800", color: DARK_GREEN },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  resultText: { flex: 1 },
  resultTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  resultDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  resultScore: { fontSize: 14, fontWeight: "800", color: GREEN },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 1,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: colors.textPrimary,
  },
  emptyBox: {
    padding: spacing.xxxl - 4,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm + 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  cardDescription: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
