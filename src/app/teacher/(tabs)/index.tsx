import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { SectionHeader } from "@/components/ui/section-header";
import { StateView } from "@/components/ui/state-view";
import { useRequireRole } from "@/hooks/useRequireRole";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { type ComponentProps, useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ThemedSafeAreaView as SafeAreaView } from "@/components/themed-safe-area-view";
import { showNotice } from "@/utils/notify";

const GREEN = colors.primary;
const HEADER_GREEN = "#1E6348";
const PHOTO_BUCKET = "profile-photos";

type MaterialRow = {
  id: string;
  title: string;
  subject: string;
  status: "draft" | "published";
  created_at: string;
};

type StudentActivityRow = {
  student_id: string;
  full_name: string;
  last_attempt_at: string | null;
};

type DashboardSummary = {
  materials_count: number;
  quiz_count: number;
  published_quiz_count: number;
  student_count: number;
  quiz_attempt_count: number;
  recent_activity: StudentActivityRow[];
};

type DashboardData = {
  fullName: string;
  avatarUrl: string | null;
  recentMaterials: MaterialRow[] | null;
  summary: DashboardSummary | null;
};

type LoadMode = "initial" | "refresh";

function isMissingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (["PGRST202", "PGRST204", "PGRST205", "42703", "42883", "42P01"].includes(error.code ?? "")) {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return message.includes("could not find the table") ||
    message.includes("could not find the function") ||
    message.includes("does not exist");
}

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MetricCard({
  icon,
  value,
  label,
  detail,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  value: string | number;
  label: string;
  detail: string;
}) {
  return (
    <Card style={styles.metricCard}>
      <View style={styles.metricTop}>
        <View style={styles.metricIcon}>
          <Ionicons name={icon} size={18} color={GREEN} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail} numberOfLines={1}>{detail}</Text>
    </Card>
  );
}

export default function TeacherDashboardScreen() {
  const guard = useRequireRole("teacher");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const loadDashboard = useCallback(async (mode: LoadMode) => {
    if (mode === "refresh") setRefreshing(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/login");
        return;
      }

      // Keep profile/material reads scoped to this teacher. Aggregate counts
      // and activity come from a teacher-verified RPC that omits student scores.
      const [profileResult, recentMaterialsResult, summaryResult] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_path").eq("id", user.id).maybeSingle(),
        supabase.from("materials").select("id, title, subject, status, created_at").eq("teacher_id", user.id).is("archived_at", null).order("created_at", { ascending: false }).limit(4),
        supabase.rpc("teacher_dashboard_summary"),
      ]);

      if (profileResult.error) throw new Error(profileResult.error.message);

      let recentMaterials: MaterialRow[] | null = null;
      if (!isMissingRelation(recentMaterialsResult.error)) {
        if (recentMaterialsResult.error) throw new Error(recentMaterialsResult.error.message);
        recentMaterials = (recentMaterialsResult.data ?? []) as MaterialRow[];
      }

      let summary: DashboardSummary | null = null;
      if (!isMissingRelation(summaryResult.error)) {
        if (summaryResult.error) throw new Error(summaryResult.error.message);
        summary = summaryResult.data as DashboardSummary;
      }

      let avatarUrl: string | null = null;
      if (profileResult.data?.avatar_path) {
        const { data: signed, error: signedError } = await supabase.storage.from(PHOTO_BUCKET)
          .createSignedUrl(profileResult.data.avatar_path, 3600);
        if (signedError) {
          console.warn("Teacher dashboard photo URL error:", signedError.message);
        } else if (signed?.signedUrl) {
          avatarUrl = signed.signedUrl;
        }
      }

      setData({
        fullName: profileResult.data?.full_name?.trim() || "Teacher",
        avatarUrl,
        recentMaterials,
        summary,
      });
      setAvatarFailed(false);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      console.error("Teacher dashboard error:", err);
      if (mode === "refresh") showNotice("Refresh Failed", message);
      else setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (guard === "allowed") void loadDashboard("initial");
  }, [guard, loadDashboard]));

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    void loadDashboard("initial");
  };

  const recentActivity = useMemo(() => data?.summary?.recent_activity ?? [], [data?.summary]);

  if (guard === "checking" || (loading && !data)) return <DashboardSkeleton />;
  if (guard === "denied") {
    return <StateView variant="error" title="Access denied" message="This dashboard is restricted to approved teacher accounts." />;
  }
  if (error && !data) {
    return <StateView variant="error" title="Unable to load dashboard" message={error} onRetry={handleRetry} />;
  }

  const firstName = data?.fullName.split(/\s+/)[0] || "Teacher";
  const recentMaterials = data?.recentMaterials ?? null;
  const missingSetup = data?.recentMaterials === null || data?.summary === null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      {refreshing ? <ProgressIndicator style={styles.refreshProgress} accessibilityLabel="Refreshing teacher dashboard" /> : null}
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadDashboard("refresh")} tintColor="transparent" colors={["transparent"]} progressBackgroundColor="transparent" />}
      >
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
            <Text style={styles.welcomeTitle}>Welcome back, {firstName}</Text>
            <Text style={styles.welcomeSubtitle}>Your classroom at a glance.</Text>
          </View>
          <Pressable onPress={() => router.push("/teacher/profile")} accessibilityRole="button" accessibilityLabel="Open your profile" style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
            {data?.avatarUrl && !avatarFailed ? <Image key={data.avatarUrl} source={{ uri: data.avatarUrl }} style={styles.avatarImage} resizeMode="cover" accessibilityLabel="Your profile photo" onError={() => setAvatarFailed(true)} /> : <Text style={styles.avatarFallback}>{firstName.slice(0, 1).toUpperCase()}</Text>}
          </Pressable>
        </View>

        <SectionHeader title="Overview" />
        <View style={styles.metricsGrid}>
          <MetricCard icon="people-outline" label="Students" value={data?.summary?.student_count ?? "—"} detail="Connected to your quizzes" />
          <MetricCard icon="checkmark-circle-outline" label="Published quizzes" value={data?.summary?.published_quiz_count ?? "—"} detail={data?.summary ? `of ${data.summary.quiz_count} total quizzes` : "Quiz library"} />
          <MetricCard icon="book-outline" label="Learning materials" value={data?.summary?.materials_count ?? "—"} detail="Active drafts and published" />
          <MetricCard icon="bar-chart-outline" label="Quiz submissions" value={data?.summary?.quiz_attempt_count ?? "—"} detail="Across your students" />
        </View>

        {missingSetup ? (
          <View style={styles.setupNotice}>
            <Ionicons name="information-circle-outline" size={17} color={GREEN} />
          <Text style={styles.setupNoticeText}>Some figures are unavailable. Check your connection or database setup.</Text>
          </View>
        ) : null}

        <Pressable onPress={() => router.push("/teacher/material")} accessibilityRole="button" accessibilityLabel="Create a learning material" style={({ pressed }) => [styles.createCard, pressed && styles.pressed]}>
          <View style={styles.createIcon}><Ionicons name="add" size={24} color={GREEN} /></View>
          <View style={styles.createCopy}><Text style={styles.createTitle}>Create learning material</Text><Text style={styles.createSubtitle}>Prepare and share a lesson with your students.</Text></View>
          <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
        </Pressable>

        <SectionHeader title="Quick access" />
        <View style={styles.quickGrid}>
          <Pressable onPress={() => router.push("/teacher/quizzes")} accessibilityRole="button" accessibilityLabel="Create or manage quizzes" style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <View style={styles.quickIcon}><Ionicons name="clipboard-outline" size={19} color={GREEN} /></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>Quizzes</Text><Text style={styles.quickSubtitle}>Create and manage</Text></View><Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
          </Pressable>
          <Pressable onPress={() => router.push("/teacher/messages")} accessibilityRole="button" accessibilityLabel="Open messages" style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <View style={styles.quickIcon}><Ionicons name="chatbubbles-outline" size={19} color={GREEN} /></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>Messages</Text><Text style={styles.quickSubtitle}>Connect with students</Text></View><Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
          </Pressable>
          <Pressable onPress={() => router.push("/teacher/students")} accessibilityRole="button" accessibilityLabel="Open student progress" style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <View style={styles.quickIcon}><Ionicons name="people-outline" size={19} color={GREEN} /></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>Students</Text><Text style={styles.quickSubtitle}>Track class progress</Text></View><Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
          </Pressable>
          <Pressable onPress={() => router.push("/teacher/ai-buddy")} accessibilityRole="button" accessibilityLabel="Open Teacher AI Buddy" style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <View style={styles.quickIcon}><Ionicons name="sparkles-outline" size={19} color={GREEN} /></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>AI Buddy</Text><Text style={styles.quickSubtitle}>Plan a lesson</Text></View><Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
          </Pressable>
        </View>

        <View>
          <SectionHeader title="Recent class activity" actionLabel={recentActivity.length ? "View students" : undefined} onAction={recentActivity.length ? () => router.push("/teacher/students") : undefined} />
          {!data?.summary ? (
            <Card style={styles.emptyBox}><Ionicons name="pulse-outline" size={22} color={colors.textFaint} /><Text style={styles.emptyText}>Class activity is not available yet.</Text></Card>
          ) : recentActivity.length === 0 ? (
            <Card style={styles.emptyBox}><Ionicons name="pulse-outline" size={22} color={colors.textFaint} /><Text style={styles.emptyTitle}>No quiz activity yet</Text><Text style={styles.emptyText}>Student submissions will appear here.</Text></Card>
          ) : (
            <Card style={styles.activityCard}>
              {recentActivity.map((student, index) => (
                <View key={student.student_id} style={[styles.activityRow, index > 0 && styles.activityRowBorder]}>
                  <View style={styles.activityAvatar}><Text style={styles.activityInitial}>{(student.full_name || "S").slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.activityCopy}><Text style={styles.activityName} numberOfLines={1}>{student.full_name || "Student"}</Text><Text style={styles.activityMeta}>Last submission · {formatDate(student.last_attempt_at)}</Text></View>
                  <Ionicons name="checkmark-circle" size={17} color={colors.success} />
                </View>
              ))}
            </Card>
          )}
        </View>

        <View>
          <SectionHeader title="Recent materials" actionLabel={data?.summary?.materials_count ? "See all" : undefined} onAction={data?.summary?.materials_count ? () => router.push("/teacher/material") : undefined} />
          {recentMaterials === null ? (
            <Card style={styles.emptyBox}><Ionicons name="cloud-offline-outline" size={23} color={colors.textFaint} /><Text style={styles.emptyTitle}>Materials unavailable</Text><Text style={styles.emptyText}>Check the Supabase materials setup to show recent work.</Text></Card>
          ) : recentMaterials.length === 0 ? (
            <Card style={styles.emptyBox}><Ionicons name="document-text-outline" size={23} color={colors.textFaint} /><Text style={styles.emptyTitle}>No materials yet</Text><Text style={styles.emptyText}>Create your first lesson resource to get started.</Text></Card>
          ) : (
            <Card style={styles.materialList} padded={false}>
              {recentMaterials.map((material, index) => (
                <Pressable key={material.id} onPress={() => router.push("/teacher/material")} accessibilityRole="button" accessibilityLabel={`Open ${material.title}`} style={({ pressed }) => [styles.materialRow, index > 0 && styles.materialDivider, pressed && styles.rowPressed]}>
                  <View style={styles.materialIcon}><Ionicons name="document-text-outline" size={18} color={GREEN} /></View>
                  <View style={styles.materialText}><Text style={styles.materialTitle} numberOfLines={1}>{material.title}</Text><Text style={styles.materialMeta} numberOfLines={1}>{material.subject || "General"} · {formatDate(material.created_at)}</Text></View>
                  <Chip label={material.status === "published" ? "Published" : "Draft"} tone={material.status === "published" ? "success" : "warning"} />
                </Pressable>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  refreshProgress: { position: "absolute", top: 0, left: 0, width: "100%", height: 3, borderRadius: 0, zIndex: 10 },
  container: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl + 8, gap: spacing.lg },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  welcomeRow: { minHeight: 132, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: HEADER_GREEN, borderRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  welcomeCopy: { flex: 1 },
  eyebrow: { color: "#D2E6DA", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  welcomeTitle: { color: "#FFFFFF", fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 5 },
  welcomeSubtitle: { color: "#E2EEE7", fontSize: 12, lineHeight: 17, marginTop: 5 },
  avatar: { width: 88, height: 88, borderRadius: 44, overflow: "hidden", backgroundColor: "#E8F3EB", borderWidth: 3, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  avatarImage: { width: "100%", height: "100%" },
  avatarFallback: { color: GREEN, fontSize: 30, fontWeight: "800" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metricCard: { width: "48%", flexGrow: 1, minHeight: 116, padding: spacing.md, gap: 5 },
  metricTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metricIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  metricLabel: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  metricValue: { color: colors.textStrong, fontSize: 24, fontWeight: "800", marginTop: 1 },
  metricDetail: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  setupNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md },
  setupNoticeText: { flex: 1, color: colors.textPrimary, fontSize: 11, lineHeight: 16 },
  createCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 88, backgroundColor: GREEN, borderRadius: radius.lg, padding: spacing.lg },
  createIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  createCopy: { flex: 1 },
  createTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  createSubtitle: { color: "#DFF1E6", fontSize: 11, lineHeight: 16, marginTop: 4 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickCard: { width: "48%", flexGrow: 1, minHeight: 82, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2, gap: spacing.sm },
  quickIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  quickCopy: { flex: 1, gap: 3 },
  quickTitle: { color: colors.textStrong, fontSize: 11, fontWeight: "800" },
  quickSubtitle: { color: colors.textMuted, fontSize: 9, lineHeight: 12 },
  activityCard: { paddingVertical: 0, paddingHorizontal: spacing.md },
  activityRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.md },
  activityRowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  activityAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  activityInitial: { color: GREEN, fontSize: 13, fontWeight: "800" },
  activityCopy: { flex: 1, gap: 3 },
  activityName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  activityMeta: { color: colors.textMuted, fontSize: 10 },
  emptyBox: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.textMuted, fontSize: 11, textAlign: "center", lineHeight: 16 },
  materialList: { overflow: "hidden", padding: 0 },
  materialRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  materialDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  materialIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  materialText: { flex: 1, gap: 3 },
  materialTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  materialMeta: { color: colors.textMuted, fontSize: 10 },
});
