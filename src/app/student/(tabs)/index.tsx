import { supabase } from "@/lib/supabase";
import { ActionCard } from "@/components/ui/action-card";
import { Card } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { colors, radius, spacing } from "@/theme/tokens";
import { getProfilePhotoUrl } from "@/utils/profilePhoto";
import { uploadPendingProfilePhoto } from "@/utils/uploadProfilePhoto";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemedSafeAreaView as SafeAreaView } from "@/components/themed-safe-area-view";

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
type PublishedQuiz = { id: string; title: string; subject: string; due_at: string | null };
type StudyProgress = { material_id: string; status: "in_progress" | "completed" };
type StudyMaterial = { id: string; title: string; subject: string };
type SubjectSummary = { name: string; lessons: number; quizzes: number };

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

function formatDeadline(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Deadline unavailable";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function StudentHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [completedLessonCount, setCompletedLessonCount] = useState(0);
  const [quizTitles, setQuizTitles] = useState<Record<string, string>>({});
  const [availableQuizzes, setAvailableQuizzes] = useState<PublishedQuiz[]>([]);
  const [quizCanTake, setQuizCanTake] = useState<Record<string, boolean>>({});
  const [studyProgress, setStudyProgress] = useState<StudyProgress[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<Record<string, StudyMaterial>>({});
  const [subjectSummaries, setSubjectSummaries] = useState<SubjectSummary[]>([]);

  const openScreen = (path: string) => {
    router.push(path as never);
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadOverview = async () => {
        setCurrentTime(Date.now());
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (!active || !user) return;

          try {
            await uploadPendingProfilePhoto(user.id);
          } catch (photoError) {
            console.warn("Could not finish saving the selected student photo:", photoError);
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("full_name, avatar_path")
            .eq("id", user.id)
            .maybeSingle();

          if (profileError) console.warn("Student dashboard profile load error:", profileError.message);
          if (active) {
            if (profile?.full_name?.trim()) setFullName(profile.full_name.trim());
            let signedAvatarUrl: string | null = null;
            if (profile?.avatar_path) {
              try {
                signedAvatarUrl = await getProfilePhotoUrl(profile.avatar_path, user.id);
              } catch (photoError) {
                console.warn("Student dashboard photo URL error:", photoError);
              }
            }
            if (active) {
              setAvatarUrl(signedAvatarUrl);
              setAvatarFailed(false);
            }
          }

          const { data, error, count } = await supabase
            .from("quiz_attempts")
            .select("id, quiz_id, score, total, created_at", { count: "exact" })
            .eq("student_id", user.id)
            .order("created_at", { ascending: false })
            .limit(10);

          const { data: published, error: publishedError } = await supabase
            .from("quizzes")
            .select("id, title, subject, due_at")
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .limit(20);

          if (active && !publishedError) setAvailableQuizzes((published ?? []) as PublishedQuiz[]);
          if (active && !publishedError) {
            const { data: statuses, error: statusError } = await supabase.rpc("student_quiz_attempt_status");
            if (active && !statusError && Array.isArray(statuses)) {
              const canTake: Record<string, boolean> = {};
              for (const status of statuses as { quiz_id: string; can_take: boolean }[]) canTake[status.quiz_id] = status.can_take;
              setQuizCanTake(canTake);
            }
          }

          const { data: subjectMaterials, error: subjectMaterialsError } = await supabase
            .from("materials")
            .select("id, subject")
            .eq("status", "published")
            .limit(100);
          if (!active) return;
          if (!subjectMaterialsError) {
            const summary = new Map<string, { lessons: number; quizzes: number }>();
            for (const material of subjectMaterials ?? []) {
              const name = material.subject?.trim();
              if (!name) continue;
              const key = name.toLocaleLowerCase();
              const row = summary.get(key) ?? { lessons: 0, quizzes: 0 };
              row.lessons += 1;
              summary.set(key, row);
            }
            for (const quiz of published ?? []) {
              const name = quiz.subject?.trim();
              if (!name) continue;
              const key = name.toLocaleLowerCase();
              const row = summary.get(key) ?? { lessons: 0, quizzes: 0 };
              row.quizzes += 1;
              summary.set(key, row);
            }
            setSubjectSummaries(Array.from(summary.entries()).map(([key, counts]) => ({
              name: (subjectMaterials ?? []).find((item) => item.subject?.trim().toLocaleLowerCase() === key)?.subject?.trim()
                ?? (published ?? []).find((item) => item.subject?.trim().toLocaleLowerCase() === key)?.subject?.trim()
                ?? key,
              ...counts,
            })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8));
          }

          if (!active) return;

          if (error) {
            if (!isMissingRelation(error)) {
              console.warn("Could not load quiz history:", error.message);
            }
            setAttempts([]);
            setAttemptCount(0);
          } else {
            const rows = (data ?? []) as AttemptSummary[];
            setAttempts(rows);
            setAttemptCount(count ?? rows.length);
          }

          const { count: completedCount, error: completedError } = await supabase
            .from("student_material_progress")
            .select("material_id", { count: "exact", head: true })
            .eq("student_id", user.id)
            .eq("status", "completed");
          if (active && !completedError) setCompletedLessonCount(completedCount ?? 0);

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

  const totalCorrect = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
  const totalQuestions = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
  const averagePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const hasAttempts = attempts.length > 0;

  const latestAttempt = attempts[0];
  const latestPercent =
    latestAttempt && latestAttempt.total > 0
      ? Math.round((latestAttempt.score / latestAttempt.total) * 100)
      : 0;
  const latestTitle = latestAttempt
    ? (quizTitles[latestAttempt.quiz_id] ?? "Quiz")
    : "";
  const availableToTake = availableQuizzes.filter((quiz) => quizCanTake[quiz.id] !== false);
  const upcomingQuizzes = availableToTake
    .filter((quiz) => quiz.due_at && new Date(quiz.due_at).getTime() >= currentTime)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .slice(0, 3);
  const upcomingIds = new Set(upcomingQuizzes.map((quiz) => quiz.id));
  const readyQuizzes = availableToTake.filter((quiz) => !upcomingIds.has(quiz.id)).slice(0, 5);
  const quizAttemptSummary = (quizId: string) => {
    const attempt = attempts.find((item) => item.quiz_id === quizId);
    if (!attempt || attempt.total <= 0) return null;
    return `${Math.round((attempt.score / attempt.total) * 100)}%`;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
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
            onPress={() => router.push("/student/profile")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            style={styles.avatar}
          >
            {avatarUrl && !avatarFailed ? (
              <Image
                key={avatarUrl}
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
                accessibilityLabel="Your profile photo"
                onError={(event) => {
                  console.warn("Student dashboard photo render error:", event.nativeEvent.error);
                  setAvatarFailed(true);
                }}
              />
            ) : (
              <Text style={styles.avatarFallback}>{firstName.slice(0, 1).toUpperCase()}</Text>
            )}
          </TouchableOpacity>
        </View>

        <SectionHeader title="Progress overview" actionLabel="Analytics" onAction={() => router.push("/student/analytics")} />
        <Card style={styles.progressOverview}>
          <View style={styles.progressOverviewTop}><View style={styles.overviewIcon}><Ionicons name="stats-chart-outline" size={18} color={GREEN} /></View><Text style={styles.overviewCaption}>{hasAttempts ? `Average from your ${attempts.length} most recent ${attempts.length === 1 ? "quiz" : "quizzes"}` : "Your learning summary"}</Text><TouchableOpacity onPress={() => router.push("/student/analytics")} accessibilityRole="button" accessibilityLabel="View learning analytics" style={styles.analyticsLink}><Text style={styles.analyticsLinkText}>View</Text><Ionicons name="arrow-forward" size={13} color={GREEN} /></TouchableOpacity></View>
          <View style={styles.metricRow}>
            <View style={styles.metric}><Text style={styles.metricValue}>{hasAttempts ? `${averagePercent}%` : "—"}</Text><Text style={styles.metricLabel}>Quiz average</Text></View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}><Text style={styles.metricValue}>{attemptCount}</Text><Text style={styles.metricLabel}>Quizzes taken</Text></View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}><Text style={styles.metricValue}>{completedLessonCount}</Text><Text style={styles.metricLabel}>Lessons done</Text></View>
          </View>
        </Card>

        <SectionHeader title="Your subjects" actionLabel="All subjects" onAction={() => openScreen("/student/study")} />
        {subjectSummaries.length ? <View style={styles.subjectGrid}>
          {subjectSummaries.map((subject, index) => (
            <TouchableOpacity key={subject.name} activeOpacity={0.86} onPress={() => openScreen(subject.lessons ? `/student/study?subject=${encodeURIComponent(subject.name)}` : `/student/quizzes?subject=${encodeURIComponent(subject.name)}`)} accessibilityRole="button" accessibilityLabel={`Open ${subject.name}`} style={styles.subjectCell}>
              <Card style={styles.subjectCard}>
                <View style={[styles.subjectIcon, index % 2 === 1 && styles.subjectIconAlt]}><Ionicons name={subject.lessons ? "book-outline" : "clipboard-outline"} size={19} color={GREEN} /></View>
                <Text style={styles.subjectName} numberOfLines={1}>{subject.name}</Text>
                <Text style={styles.subjectMeta}>{subject.lessons} {subject.lessons === 1 ? "lesson" : "lessons"} · {subject.quizzes} {subject.quizzes === 1 ? "quiz" : "quizzes"}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View> : <TouchableOpacity onPress={() => openScreen("/student/study")} activeOpacity={0.85}><Card style={styles.learningEmpty}><Ionicons name="library-outline" size={20} color={GREEN} /><Text style={styles.learningEmptyText}>Published subjects will appear here when your teachers share lessons or quizzes.</Text></Card></TouchableOpacity>}

        <SectionHeader
          title="Upcoming quizzes"
          actionLabel="All quizzes"
          onAction={() => openScreen("/student/quizzes")}
        />
        {upcomingQuizzes.length ? upcomingQuizzes.map((quiz) => {
          const score = quizAttemptSummary(quiz.id);
          return <TouchableOpacity key={`upcoming-${quiz.id}`} onPress={() => router.push({ pathname: "/student/quiz-attempt", params: { quizId: quiz.id } })} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Open ${quiz.title}, due ${formatDeadline(quiz.due_at!)}`}>
            <Card style={styles.availableQuiz}>
              <View style={styles.availableIcon}><Ionicons name={score ? "checkmark-circle-outline" : "calendar-outline"} size={19} color={GREEN} /></View>
              <View style={styles.activityText}><Text style={styles.activityTitle} numberOfLines={1}>{quiz.title}</Text><Text style={styles.activityDescription} numberOfLines={1}>{quiz.subject} · {score ? `Attempted · ${score} · ` : ""}Due {formatDeadline(quiz.due_at!)}</Text></View>
              <Ionicons name="arrow-forward" size={18} color={GREEN} />
            </Card>
          </TouchableOpacity>;
        }) : <Card style={styles.learningEmpty}><Ionicons name="calendar-clear-outline" size={20} color={GREEN} /><Text style={styles.learningEmptyText}>No upcoming quiz deadlines. Your available quizzes are below.</Text></Card>}

        <SectionHeader
          title="Browse quizzes"
          actionLabel="All quizzes"
          onAction={() => openScreen("/student/quizzes")}
        />
        {readyQuizzes.length ? readyQuizzes.map((quiz) => {
          const score = quizAttemptSummary(quiz.id);
          return <TouchableOpacity key={quiz.id} onPress={() => router.push({ pathname: "/student/quiz-attempt", params: { quizId: quiz.id } })} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${score ? "Review" : "Take"} ${quiz.title}`}>
            <Card style={styles.availableQuiz}>
              <View style={[styles.availableIcon, score && styles.studyIcon]}><Ionicons name={score ? "checkmark-circle-outline" : "clipboard-outline"} size={19} color={GREEN} /></View>
              <View style={styles.activityText}><Text style={styles.activityTitle} numberOfLines={1}>{quiz.title}</Text><Text style={styles.activityDescription} numberOfLines={1}>{quiz.subject} · {score ? `Attempted · ${score}` : quiz.due_at ? `Due ${formatDeadline(quiz.due_at)}` : "Open now"}</Text></View>
              <Ionicons name="arrow-forward" size={18} color={GREEN} />
            </Card>
          </TouchableOpacity>;
        }) : <TouchableOpacity onPress={() => openScreen("/student/quizzes")} activeOpacity={0.85}><Card style={styles.availableQuiz}><View style={styles.availableIcon}><Ionicons name="search-outline" size={19} color={GREEN} /></View><View style={styles.activityText}><Text style={styles.activityTitle}>Browse quizzes</Text><Text style={styles.activityDescription}>See all quizzes published by teachers</Text></View><Ionicons name="arrow-forward" size={18} color={GREEN} /></Card></TouchableOpacity>}

        {/* Quick Actions */}
        <SectionHeader title="Continue studying" actionLabel="All materials" onAction={() => openScreen("/student/study")} />
        {studyProgress.filter((row) => row.status === "in_progress" && studyMaterials[row.material_id]).length ? studyProgress.filter((row) => row.status === "in_progress" && studyMaterials[row.material_id]).map((row) => {
          const material = studyMaterials[row.material_id];
          return <TouchableOpacity key={row.material_id} onPress={() => openScreen("/student/study")} activeOpacity={0.85}><Card style={styles.availableQuiz}><View style={[styles.availableIcon, styles.studyIcon]}><Ionicons name="book-outline" size={19} color="#267B83" /></View><View style={styles.activityText}><Text style={styles.activityTitle} numberOfLines={1}>{material.title}</Text><Text style={styles.activityDescription} numberOfLines={1}>{material.subject} · In progress</Text></View><Ionicons name="arrow-forward" size={18} color={GREEN} /></Card></TouchableOpacity>;
        }) : <Card style={styles.learningEmpty}><Ionicons name="checkmark-circle-outline" size={20} color={GREEN} /><Text style={styles.learningEmptyText}>Your lesson progress will appear here as you study.</Text></Card>}

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

        <SectionHeader title="Quick actions" />
        <View style={styles.actionGrid}>
          <View style={styles.gridCell}><ActionCard icon="book-outline" title="Start Studying" description="Review your lessons" onPress={() => openScreen("/student/study")} /></View>
          <View style={styles.gridCell}><ActionCard icon="clipboard-outline" iconColor="#B87519" iconBg="#FFF0DA" title="Take a Quiz" description="Test your knowledge" onPress={() => openScreen("/student/quizzes")} /></View>
          <View style={styles.gridCell}><ActionCard icon="chatbubbles-outline" iconColor="#176B45" iconBg="#E8F3EB" title="Message a Teacher" description="Ask about your classwork" onPress={() => openScreen("/student/messages")} /></View>
          <View style={styles.gridCell}><ActionCard icon="analytics-outline" iconColor="#267B83" iconBg="#DFF1F3" title="Learning Analytics" description="Review your progress" onPress={() => router.push("/student/analytics")} /></View>
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
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl + 8,
    gap: spacing.lg,
  },
  header: {
    minHeight: 132,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E6348",
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  greeting: {
    flex: 1,
  },
  eyebrow: {
    color: "#D2E6DA",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  welcome: {
    color: "#FFFFFF",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    marginTop: 5,
  },
  subtitle: {
    color: "#E2EEE7",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
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
  avatar: { width: 88, height: 88, borderRadius: 44, overflow: "hidden", backgroundColor: "#E8F3EB", borderWidth: 3, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", marginLeft: spacing.md },
  avatarImage: { width: "100%", height: "100%" },
  avatarFallback: { color: GREEN, fontSize: 30, fontWeight: "800" },
  progressOverview: { padding: spacing.md + 2 },
  progressOverviewTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  overviewIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primarySoftAlt, alignItems: "center", justifyContent: "center" },
  overviewCaption: { flex: 1, color: MUTED, fontSize: 10, lineHeight: 15 },
  analyticsLink: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 6, paddingLeft: 5 },
  analyticsLinkText: { color: GREEN, fontSize: 10, fontWeight: "800" },
  metricRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  metric: { flex: 1, alignItems: "center", gap: 3 },
  metricValue: { color: DARK_GREEN, fontSize: 17, fontWeight: "900" },
  metricLabel: { color: MUTED, fontSize: 9, textAlign: "center" },
  metricDivider: { width: 1, height: 29, backgroundColor: colors.border },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  subjectCell: { width: "48%" },
  subjectCard: { minHeight: 122, padding: spacing.md },
  subjectIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primarySoftAlt, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  subjectIconAlt: { backgroundColor: "#FFF0DA" },
  subjectName: { color: DARK_GREEN, fontSize: 14, fontWeight: "800" },
  subjectMeta: { color: MUTED, fontSize: 10, marginTop: 5 },
  availableQuiz: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  availableIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primarySoftAlt, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  studyIcon: { backgroundColor: "#DFF1F3" },
  learningEmpty: { flexDirection: "row", alignItems: "center", gap: 10 },
  learningEmptyText: { flex: 1, color: MUTED, fontSize: 12, lineHeight: 18 },
  gridCell: {
    width: "48%",
    marginBottom: spacing.sm,
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
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
