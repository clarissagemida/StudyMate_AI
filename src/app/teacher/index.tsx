import { supabase } from "@/lib/supabase";
import { showNotice } from "@/utils/notify";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { StateView } from "@/components/ui/state-view";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDark;
const BG = colors.background;
const PHOTO_BUCKET = "profile-photos";

type MaterialRow = {
  id: string;
  title: string;
  subject: string;
  status: "draft" | "published";
  created_at: string;
};

type DashboardData = {
  fullName: string;
  avatarUrl: string | null;
  // null means "the table does not exist yet" — never a fake number.
  materials: MaterialRow[] | null;
  quizzes: number | null;
  publishedQuizzes: number | null;
};

type LoadMode = "initial" | "refresh";

// PostgREST reports a table that has not been created yet with these codes.
// In that case the dashboard shows "—" instead of inventing statistics.
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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TeacherDashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (mode: LoadMode) => {
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, avatar_path")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);

      let avatarUrl: string | null = null;

      if (profile?.avatar_path) {
        const { data: signed, error: imageError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(profile.avatar_path, 3600);

        if (!imageError) {
          avatarUrl = signed?.signedUrl ?? null;
        }
      }

      // The teacher's own materials, newest first.
      let materials: MaterialRow[] | null = null;
      const { data: materialRows, error: materialsError } = await supabase
        .from("materials")
        .select("id, title, subject, status, created_at")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (isMissingRelation(materialsError)) {
        materials = null;
      } else {
        if (materialsError) throw new Error(materialsError.message);
        materials = (materialRows ?? []) as MaterialRow[];
      }

      // Quizzes appear once the quiz tables have been created.
      let quizzes: number | null = null;
      let publishedQuizzes: number | null = null;

      const { count: quizTotal, error: quizError } = await supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id);

      if (!isMissingRelation(quizError)) {
        if (quizError) throw new Error(quizError.message);

        const { count: quizPublished, error: publishedError } = await supabase
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .eq("teacher_id", user.id)
          .eq("status", "published");

        if (publishedError) throw new Error(publishedError.message);

        quizzes = quizTotal ?? 0;
        publishedQuizzes = quizPublished ?? 0;
      }

      setData({
        fullName: profile?.full_name?.trim() || "Teacher",
        avatarUrl,
        materials,
        quizzes,
        publishedQuizzes,
      });
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Teacher dashboard error:", err);

      if (mode === "refresh") {
        showNotice("Refresh Failed", message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // The loader lives inside the effect so no state is applied synchronously
  // while the effect itself runs.
  useEffect(() => {
    const run = async () => {
      await loadDashboard("initial");
    };

    void run();
  }, [loadDashboard]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    void loadDashboard("initial");
  };

  if (loading && !data) {
    return (
      <StateView
        variant="loading"
        title="Preparing your dashboard"
        message="Loading your profile and teaching statistics..."
      />
    );
  }

  if (error && !data) {
    return (
      <StateView
        variant="error"
        title="Unable to load dashboard"
        message={error}
        onRetry={handleRetry}
      />
    );
  }

  const materials = data?.materials ?? null;
  const quizzes = data?.quizzes ?? null;
  const publishedQuizzes = data?.publishedQuizzes ?? null;
  const recentMaterials = materials ? materials.slice(0, 4) : [];
  const tablesMissing = materials === null || quizzes === null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadDashboard("refresh");
            }}
            tintColor={GREEN}
            colors={[GREEN]}
          />
        }
      >
        {/* Welcome + profile photo */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeText}>
            <Text style={styles.welcomeEyebrow}>TEACHER DASHBOARD</Text>
            <Text style={styles.welcomeTitle}>
              Welcome back, {data?.fullName ?? "Teacher"}!
            </Text>
            <Text style={styles.welcomeSubtitle}>
              Manage your learning materials and track your classes.
            </Text>
          </View>

          <View style={styles.avatar}>
            {data?.avatarUrl ? (
              <Image
                source={{ uri: data.avatarUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
                accessibilityLabel="Your profile photo"
              />
            ) : (
              <Ionicons name="person-outline" size={30} color={GREEN} />
            )}
          </View>
        </View>

        {/* Real statistics; "—" means the table is not configured yet */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="book-outline" size={20} color={GREEN} />
            </View>
            <Text style={styles.statValue}>
              {materials ? materials.length : "—"}
            </Text>
            <Text style={styles.statLabel}>Learning materials</Text>
          </Card>

          <Card style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="clipboard-outline" size={20} color={GREEN} />
            </View>
            <Text style={styles.statValue}>
              {quizzes === null ? "—" : quizzes}
            </Text>
            <Text style={styles.statLabel}>Quizzes</Text>
          </Card>

          <Card style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-done-outline" size={20} color={GREEN} />
            </View>
            <Text style={styles.statValue}>
              {publishedQuizzes === null ? "—" : publishedQuizzes}
            </Text>
            <Text style={styles.statLabel}>Published</Text>
          </Card>
        </View>

        {tablesMissing && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={GREEN} />
            <Text style={styles.noticeText}>
              {materials === null && quizzes === null
                ? "Statistics appear once the materials and quiz tables are added to Supabase (run the SQL files in the supabase/ folder)."
                : materials === null
                  ? "The learning materials table is not set up yet. Run supabase/materials.sql in the Supabase SQL editor to enable material statistics."
                  : "The quiz tables are not set up yet. Run supabase/quizzes.sql in the Supabase SQL editor to enable quiz statistics."}
            </Text>
          </View>
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>

        <Pressable
          onPress={() => router.push("/teacher/material")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
        >
          <View style={styles.primaryActionIcon}>
            <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.primaryActionText}>
            <Text style={styles.primaryActionTitle}>
              Create learning materials
            </Text>
            <Text style={styles.primaryActionSubtitle}>
              Write a new draft or publish it to your students
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
        </Pressable>

        <View style={styles.pendingAction}>
          <View style={styles.pendingActionIcon}>
            <Ionicons name="clipboard-outline" size={22} color={GREEN} />
          </View>
          <View style={styles.primaryActionText}>
            <Text style={styles.pendingActionTitle}>Create a quiz</Text>
            <Text style={styles.pendingActionSubtitle}>
              Add multiple-choice questions and publish them to students
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/teacher/quizzes")}
            accessibilityRole="button"
            accessibilityLabel="Open quizzes"
            hitSlop={6}
          >
            <Ionicons name="chevron-forward" size={20} color={GREEN} />
          </Pressable>
        </View>

        {/* Recent materials */}
        <SectionHeader
          title="Recent materials"
          actionLabel={materials && materials.length > 0 ? "See all" : undefined}
          onAction={
            materials && materials.length > 0
              ? () => router.push("/teacher/material")
              : undefined
          }
        />

        {materials === null ? (
          <Card style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={26} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>No materials yet</Text>
            <Text style={styles.emptyText}>
              Materials you create will be listed here.
            </Text>
          </Card>
        ) : recentMaterials.length === 0 ? (
          <Card style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={26} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              Create your first learning material to get started.
            </Text>
          </Card>
        ) : (
          recentMaterials.map((material) => (
            <Pressable
              key={material.id}
              onPress={() => router.push("/teacher/material")}
              accessibilityRole="button"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card style={styles.materialRow}>
                <View style={styles.materialIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={20}
                    color={GREEN}
                  />
                </View>

                <View style={styles.materialText}>
                  <Text style={styles.materialTitle} numberOfLines={1}>
                    {material.title}
                  </Text>
                  <Text style={styles.materialMeta} numberOfLines={1}>
                    {material.subject} · {formatDate(material.created_at)}
                  </Text>
                </View>

                <Chip
                  label={material.status === "published" ? "Published" : "Draft"}
                  tone={material.status === "published" ? "success" : "warning"}
                />
              </Card>
            </Pressable>
          ))
        )}

        <Text style={styles.footer}>STUDYMATE AI · TEACHER PORTAL</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { padding: spacing.xl, paddingBottom: spacing.xxxl + 8, gap: spacing.md },
  pressed: { opacity: 0.9 },
  welcomeCard: {
    backgroundColor: GREEN,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  welcomeText: { flex: 1 },
  welcomeEyebrow: {
    color: "#C9E6D4",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  welcomeTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  welcomeSubtitle: {
    color: "#DFF1E6",
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  statsRow: { flexDirection: "row", gap: spacing.sm + 2 },
  statCard: {
    flex: 1,
    padding: spacing.md + 2,
    alignItems: "flex-start",
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm + 2,
  },
  statValue: { fontSize: 24, fontWeight: "800", color: DARK_GREEN },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 3,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#3F5A49" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK_GREEN,
    marginTop: spacing.xs,
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: GREEN,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  primaryActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: { flex: 1 },
  primaryActionTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  primaryActionSubtitle: {
    color: "#DFF1E6",
    fontSize: 11,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  pendingAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingActionTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  pendingActionSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  emptyBox: {
    padding: spacing.xxl,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  materialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  materialIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  materialText: { flex: 1 },
  materialTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  materialMeta: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  footer: {
    textAlign: "center",
    color: "#A0AAA3",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: spacing.md,
  },
});
