import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { StateView } from "@/components/ui/state-view";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDark;
const BG = colors.background;
const PHOTO_BUCKET = "profile-photos";

type StudentRow = {
  student_id: string;
  full_name: string;
  avatar_path: string | null;
  quiz_count: number;
  attempt_count: number;
  average_percent: number | null;
  last_attempt_at: string | null;
};

type AttemptRow = {
  quiz_title: string;
  score: number;
  total: number;
  created_at: string;
};

type LoadMode = "initial" | "refresh";

function isMissingFunction(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "PGRST205" ||
    error.code === "42P01"
  ) {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the function") ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "No attempts yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function percentColor(value: number | null) {
  if (value === null) return colors.textMuted;
  if (value >= 75) return colors.success;
  if (value >= 50) return colors.warning;
  return colors.danger;
}

export default function TeacherStudentsScreen() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  const loadStudents = useCallback(async (mode: LoadMode) => {
    if (mode === "refresh") setRefreshing(true);

    try {
      const { data, error: rpcError } = await supabase.rpc("teacher_students");

      if (rpcError) {
        if (isMissingFunction(rpcError)) {
          setSetupMissing(true);
          setStudents([]);
          setError(null);
          return;
        }
        throw new Error(rpcError.message);
      }

      const rows = (Array.isArray(data) ? data : [])
        .map((value): StudentRow | null => {
          if (!value || typeof value !== "object") return null;

          const row = value as Record<string, unknown>;
          if (typeof row.student_id !== "string") return null;

          const averageRaw = row.average_percent;
          const average =
            averageRaw === null || averageRaw === undefined
              ? null
              : asNumber(averageRaw, 0);

          return {
            student_id: row.student_id,
            full_name:
              typeof row.full_name === "string" && row.full_name.trim()
                ? row.full_name.trim()
                : "Student",
            avatar_path:
              typeof row.avatar_path === "string" ? row.avatar_path : null,
            quiz_count: asNumber(row.quiz_count),
            attempt_count: asNumber(row.attempt_count),
            average_percent: average,
            last_attempt_at:
              typeof row.last_attempt_at === "string"
                ? row.last_attempt_at
                : null,
          };
        })
        .filter((row): row is StudentRow => row !== null);

      setStudents(rows);
      setSetupMissing(false);
      setError(null);

      const urlEntries = await Promise.all(
        rows.map(async (row) => {
          if (!row.avatar_path) return null;

          const { data: signed, error: photoError } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(row.avatar_path, 3600);

          if (photoError || !signed?.signedUrl) return null;

          return [row.student_id, signed.signedUrl] as const;
        }),
      );

      setAvatarUrls(
        Object.fromEntries(
          urlEntries.filter(
            (entry): entry is readonly [string, string] => entry !== null,
          ),
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Teacher students error:", err);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await loadStudents("initial");
    };

    void run();
  }, [loadStudents]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!students || !term) return students ?? [];

    return students.filter((student) =>
      student.full_name.toLowerCase().includes(term),
    );
  }, [students, search]);

  const totalAttempts = useMemo(
    () =>
      (students ?? []).reduce(
        (sum, student) => sum + student.attempt_count,
        0,
      ),
    [students],
  );

  const openStudent = async (student: StudentRow) => {
    setSelected(student);
    setAttempts(null);
    setAttemptError(null);
    setAttemptsLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "teacher_student_attempts",
        { p_student_id: student.student_id },
      );

      if (rpcError) {
        if (isMissingFunction(rpcError)) {
          throw new Error(
            "Student attempts are not configured yet. Run teacher_features.sql in Supabase.",
          );
        }
        throw new Error(rpcError.message);
      }

      const rows = (Array.isArray(data) ? data : [])
        .map((value): AttemptRow | null => {
          if (!value || typeof value !== "object") return null;

          const row = value as Record<string, unknown>;
          if (typeof row.quiz_title !== "string") return null;

          return {
            quiz_title: row.quiz_title,
            score: asNumber(row.score),
            total: asNumber(row.total),
            created_at:
              typeof row.created_at === "string" ? row.created_at : "",
          };
        })
        .filter((row): row is AttemptRow => row !== null);

      setAttempts(rows);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load attempts.";
      setAttemptError(message);
    } finally {
      setAttemptsLoading(false);
    }
  };

  const closeStudent = () => {
    setSelected(null);
    setAttempts(null);
    setAttemptError(null);
    setAttemptsLoading(false);
  };

  if (loading) {
    return (
      <StateView
        variant="loading"
        title="Loading student insights"
        message="Finding students who attempted your quizzes..."
      />
    );
  }

  if (error) {
    return (
      <StateView
        variant="error"
        title="Unable to load students"
        message={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
          void loadStudents("initial");
        }}
      />
    );
  }

  if (setupMissing) {
    return (
      <StateView
        variant="empty"
        icon="construct-outline"
        title="Student insights are not set up"
        message="Run supabase/teacher_features.sql in the Supabase SQL editor, then reload this screen."
        onRetry={() => {
          setLoading(true);
          setSetupMissing(false);
          void loadStudents("initial");
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.student_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadStudents("refresh");
            }}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>Students</Text>
              <Text style={styles.subtitle}>
                Students who attempted at least one of your quizzes.
              </Text>
            </View>

            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Ionicons name="people-outline" size={19} color={GREEN} />
                <Text style={styles.statValue}>{students?.length ?? 0}</Text>
                <Text style={styles.statLabel}>Students</Text>
              </Card>

              <Card style={styles.statCard}>
                <Ionicons name="clipboard-outline" size={19} color={GREEN} />
                <Text style={styles.statValue}>{totalAttempts}</Text>
                <Text style={styles.statLabel}>Attempts</Text>
              </Card>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={colors.textFaint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by student name"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
                accessibilityLabel="Search students"
              />
              {search ? (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear student search"
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={17}
                    color={colors.textFaint}
                  />
                </Pressable>
              ) : null}
            </View>

            {refreshing ? (
              <ProgressIndicator
                style={styles.refreshProgress}
                accessibilityLabel="Refreshing students"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.emptyBox}>
            <Ionicons
              name="people-outline"
              size={28}
              color={colors.textFaint}
            />
            <Text style={styles.emptyTitle}>
              {search ? "No matching students" : "No student attempts yet"}
            </Text>
            <Text style={styles.emptyText}>
              {search
                ? "Try a different name."
                : "Students appear here after they submit one of your published quizzes."}
            </Text>
          </Card>
        }
        renderItem={({ item }) => {
          const avatarUrl = avatarUrls[item.student_id];
          const average = item.average_percent;

          return (
            <Pressable
              onPress={() => {
                void openStudent(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.full_name}'s attempts`}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card style={styles.studentCard}>
                <View style={styles.avatar}>
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.avatarLetter}>
                      {item.full_name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>

                <View style={styles.studentText}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                  <Text style={styles.studentMeta}>
                    {item.quiz_count}{" "}
                    {item.quiz_count === 1 ? "quiz" : "quizzes"} ·{" "}
                    {item.attempt_count}{" "}
                    {item.attempt_count === 1 ? "attempt" : "attempts"}
                  </Text>
                  <Text style={styles.studentDate}>
                    Last attempt: {formatDate(item.last_attempt_at)}
                  </Text>
                </View>

                <View style={styles.averageBox}>
                  <Text
                    style={[
                      styles.averageValue,
                      { color: percentColor(average) },
                    ]}
                  >
                    {formatPercent(average)}
                  </Text>
                  <Text style={styles.averageLabel}>average</Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textFaint}
                />
              </Card>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={closeStudent}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>
                  {selected?.full_name ?? "Student"}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {selected
                    ? `${selected.attempt_count} ${
                        selected.attempt_count === 1 ? "attempt" : "attempts"
                      } across ${selected.quiz_count} ${
                        selected.quiz_count === 1 ? "quiz" : "quizzes"
                      }`
                    : ""}
                </Text>
              </View>

              <Pressable
                onPress={closeStudent}
                accessibilityRole="button"
                accessibilityLabel="Close student details"
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={DARK_GREEN} />
              </Pressable>
            </View>

            {attemptsLoading ? (
              <View style={styles.modalLoading}>
                <ProgressIndicator
                  size="sm"
                  color={GREEN}
                  accessibilityLabel="Loading student attempts"
                />
                <Text style={styles.modalLoadingText}>Loading attempts...</Text>
              </View>
            ) : attemptError ? (
              <Text style={styles.modalError}>{attemptError}</Text>
            ) : attempts && attempts.length > 0 ? (
              <ScrollView
                style={styles.attemptList}
                contentContainerStyle={styles.attemptListContent}
                showsVerticalScrollIndicator={false}
              >
                {attempts.map((attempt, index) => {
                  const percent =
                    attempt.total > 0
                      ? Math.round((attempt.score / attempt.total) * 100)
                      : 0;

                  return (
                    <View
                      key={`${attempt.created_at}-${index}`}
                      style={styles.attemptRow}
                    >
                      <View style={styles.attemptText}>
                        <Text style={styles.attemptTitle} numberOfLines={2}>
                          {attempt.quiz_title}
                        </Text>
                        <Text style={styles.attemptDate}>
                          {formatDate(attempt.created_at)}
                        </Text>
                      </View>

                      <View style={styles.attemptScoreWrap}>
                        <Text
                          style={[
                            styles.attemptScore,
                            { color: percentColor(percent) },
                          ]}
                        >
                          {percent}%
                        </Text>
                        <Text style={styles.attemptFraction}>
                          {attempt.score}/{attempt.total}
                        </Text>
                      </View>

                      <Chip
                        label={percent >= 50 ? "Passed" : "Needs review"}
                        tone={percent >= 50 ? "success" : "warning"}
                      />
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.modalEmpty}>
                <Ionicons
                  name="time-outline"
                  size={24}
                  color={colors.textFaint}
                />
                <Text style={styles.modalEmptyText}>
                  No recent attempts from your quizzes.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl + 8,
    gap: spacing.sm + 2,
  },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  titleBlock: { gap: spacing.xs },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primaryDeep,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  statsRow: { flexDirection: "row", gap: spacing.sm + 2 },
  statCard: {
    flex: 1,
    padding: spacing.md + 2,
    gap: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: DARK_GREEN,
    marginTop: spacing.xs,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  refreshProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    borderRadius: 0,
  },
  pressed: { opacity: 0.85 },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "800",
    color: GREEN,
  },
  studentText: { flex: 1, gap: 2 },
  studentName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  studentMeta: { fontSize: 11, color: colors.textMuted },
  studentDate: { fontSize: 10, color: colors.textFaint },
  averageBox: { alignItems: "flex-end", minWidth: 50 },
  averageValue: { fontSize: 16, fontWeight: "800" },
  averageLabel: { fontSize: 9, color: colors.textMuted, fontWeight: "600" },
  emptyBox: {
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 32, 24, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "78%",
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  modalTitleWrap: { flex: 1, gap: 3 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: DARK_GREEN,
  },
  modalSubtitle: { fontSize: 12, color: colors.textMuted },
  modalLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  modalLoadingText: { fontSize: 12, color: colors.textMuted },
  modalError: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.danger,
    paddingVertical: spacing.lg,
  },
  attemptList: { flexGrow: 0 },
  attemptListContent: { gap: spacing.sm },
  attemptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: "#F7FAF8",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E8F0EB",
    padding: spacing.md,
  },
  attemptText: { flex: 1, gap: 2 },
  attemptTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  attemptDate: { fontSize: 10, color: colors.textMuted },
  attemptScoreWrap: { alignItems: "flex-end" },
  attemptScore: { fontSize: 14, fontWeight: "800" },
  attemptFraction: { fontSize: 9, color: colors.textMuted },
  modalEmpty: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  modalEmptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
});
