import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { supabase } from "@/lib/supabase";
import { showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type DashboardStats = {
  totalUsers: number;
  pendingUsers: number;
  students: number;
  teachers: number;
};

type RecentRegistration = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  requested_role: string | null;
  approval_status: string | null;
  created_at: string | null;
};

type ApprovalStatus = "pending" | "approved" | "rejected";

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRegistrationDate(value: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DashboardError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export default function AdminHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminName, setAdminName] = useState("Administrator");

  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    pendingUsers: 0,
    students: 0,
    teachers: 0,
  });

  const [recentRegistrations, setRecentRegistrations] = useState<
    RecentRegistration[]
  >([]);

  const loadDashboard = useCallback(async () => {
    try {
      // Verify the current authenticated user.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      // Load and verify the administrator's profile.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role, approval_status")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (
        profile?.role !== "admin" ||
        profile?.approval_status !== "approved"
      ) {
        showNotice(
          "Access denied",
          "This page is only available to approved administrators.",
        );

        router.replace("/login");
        return;
      }

      setAdminName(profile.full_name?.trim() || "Administrator");

      // Load all four summary counts.
      const [usersResult, pendingResult, studentsResult, teachersResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .or("role.neq.admin,role.is.null"),

          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending")
            .or("role.neq.admin,role.is.null"),

          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "student"),

          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "teacher"),
        ]);

      const queryError =
        usersResult.error ||
        pendingResult.error ||
        studentsResult.error ||
        teachersResult.error;

      if (queryError) throw queryError;

      setStats({
        totalUsers: usersResult.count ?? 0,
        pendingUsers: pendingResult.count ?? 0,
        students: studentsResult.count ?? 0,
        teachers: teachersResult.count ?? 0,
      });

      // Recent registration activity: the latest non-admin accounts, newest
      // first. Uses real rows only; shows an empty state when there is none.
      const { data: recent, error: recentError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, role, requested_role, approval_status, created_at",
        )
        .or("role.neq.admin,role.is.null")
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentError) {
        // Non-fatal: the dashboard still works without this list.
        console.warn("Could not load recent registrations:", recentError.message);
        setRecentRegistrations([]);
      } else {
        setRecentRegistrations((recent ?? []) as RecentRegistration[]);
      }
    } catch (error: unknown) {
      const err = error as DashboardError;

      console.error("Admin dashboard error:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      });

      showNotice(
        "Unable to load dashboard",
        err?.message ||
          "Please check your internet connection, database schema, and Supabase access policies.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Loader lives inside the effect so no state is applied synchronously
  // while the effect itself runs.
  useEffect(() => {
    const run = async () => {
      await loadDashboard();
    };

    void run();
  }, [loadDashboard]);

  const handleRefresh = () => {
    if (refreshing) return;

    setRefreshing(true);
    void loadDashboard();
  };

  const openPage = (path: string) => {
    router.push(path as "/admin/users");
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {refreshing ? (
        <ProgressIndicator
          style={styles.refreshProgress}
          accessibilityLabel="Refreshing dashboard"
        />
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["transparent"]}
            tintColor="transparent"
            progressBackgroundColor="transparent"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandContainer}>
            <View style={styles.brandIcon}>
              <Ionicons name="school" size={25} color="#FFFFFF" />
            </View>

            <View>
              <Text style={styles.brandName}>StudyMate AI</Text>
              <Text style={styles.brandSubtitle}>ADMINISTRATION</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.pressedButton,
              refreshing && styles.disabledButton,
            ]}
            onPress={handleRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh dashboard"
          >
            {refreshing ? (
              <ProgressIndicator
                size="sm"
                color="#16794A"
                accessibilityLabel="Refreshing dashboard"
              />
            ) : (
              <Ionicons name="refresh-outline" size={22} color="#16794A" />
            )}
          </Pressable>
        </View>

        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={styles.eyebrow}>ADMIN DASHBOARD</Text>

          <Text style={styles.welcomeTitle}>Welcome back,</Text>

          <Text style={styles.adminName}>{adminName}</Text>

          <Text style={styles.welcomeDescription}>
            Manage your users, review registrations, and oversee learning
            resources across StudyMate AI.
          </Text>
        </View>

        {/* Overview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.sectionCaption}>Database summary</Text>
        </View>

        <View style={styles.statsContainer}>
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            description="Non-admin accounts"
            icon="people-outline"
            color="#16794A"
            background="#E5F4E9"
          />

          <StatCard
            title="Pending Approvals"
            value={stats.pendingUsers}
            description="Awaiting review"
            icon="time-outline"
            color="#B7791F"
            background="#FFF0CF"
          />

          <StatCard
            title="Students"
            value={stats.students}
            description="Student accounts"
            icon="school-outline"
            color="#2868B2"
            background="#E7F0FF"
          />

          <StatCard
            title="Teachers"
            value={stats.teachers}
            description="Teacher accounts"
            icon="person-outline"
            color="#7952A5"
            background="#F0E8FA"
          />
        </View>

        {/* Approvals */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Account Approvals</Text>

          {stats.pendingUsers > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {stats.pendingUsers} pending
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.featureCard,
            pressed && styles.pressedCard,
          ]}
          onPress={() => openPage("/admin/users")}
          accessibilityRole="button"
          accessibilityLabel="Manage user approvals"
        >
          <View style={styles.featureIcon}>
            <Ionicons name="person-add-outline" size={25} color="#16794A" />
          </View>

          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Review Registrations</Text>

            <Text style={styles.featureDescription}>
              Review student and teacher registrations and manage account
              access.
            </Text>

            <Text style={styles.featureAction}>
              {stats.pendingUsers > 0
                ? "View pending accounts"
                : "Open user management"}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={21} color="#7A8B80" />
        </Pressable>

        {/* Recent registrations */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Registrations</Text>
          <Text style={styles.sectionCaption}>Latest accounts</Text>
        </View>

        {recentRegistrations.length === 0 ? (
          <View style={styles.recentEmpty}>
            <Ionicons name="person-add-outline" size={22} color="#16794A" />

            <Text style={styles.recentEmptyText}>
              No registrations yet. New student and teacher accounts will appear
              here.
            </Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentRegistrations.map((entry) => {
              const status = (
                entry.approval_status ?? "pending"
              ) as ApprovalStatus;
              const displayRole =
                entry.requested_role ?? entry.role ?? "student";

              return (
                <View key={entry.id} style={styles.recentRow}>
                  <View style={styles.recentAvatar}>
                    <Text style={styles.recentAvatarText}>
                      {(entry.full_name?.trim().charAt(0) || "U").toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.recentInfo}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {entry.full_name || "Unnamed user"}
                    </Text>

                    <Text style={styles.recentMeta} numberOfLines={1}>
                      {capitalize(displayRole)}
                      {" · "}
                      {formatRegistrationDate(entry.created_at)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.recentStatusPill,
                      status === "approved"
                        ? styles.recentPillApproved
                        : status === "rejected"
                          ? styles.recentPillRejected
                          : styles.recentPillPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.recentStatusText,
                        status === "approved"
                          ? styles.recentTextApproved
                          : status === "rejected"
                            ? styles.recentTextRejected
                            : styles.recentTextPending,
                      ]}
                    >
                      {capitalize(status)}
                    </Text>
                  </View>
                </View>
              );
            })}

            <Pressable
              style={({ pressed }) => [
                styles.recentViewAll,
                pressed && styles.pressedButton,
              ]}
              onPress={() => openPage("/admin/users")}
              accessibilityRole="button"
            >
              <Text style={styles.recentViewAllText}>View all users</Text>
              <Ionicons name="arrow-forward" size={15} color="#16794A" />
            </Pressable>
          </View>
        )}

        {/* Quick management */}
        <Text style={styles.sectionTitle}>Quick Management</Text>

        <View style={styles.actionList}>
          <ActionCard
            icon="people-outline"
            title="User Management"
            description="View and manage student and teacher accounts."
            onPress={() => openPage("/admin/users")}
          />

          <ActionCard
            icon="book-outline"
            title="Learning Materials"
            description="Oversee educational resources created by teachers (read-only)."
            onPress={() => openPage("/admin/materials")}
          />

          <ActionCard
            icon="bar-chart-outline"
            title="Reports and Analytics"
            description="View reports for available StudyMate activity data."
            onPress={() => openPage("/admin/reports")}
          />

          <ActionCard
            icon="settings-outline"
            title="Settings"
            description="Access application administration settings."
            onPress={() => openPage("/admin/settings")}
          />
        </View>

        {/* Learning resources */}
        <Text style={styles.sectionTitle}>Learning Resources</Text>

        <View style={styles.resourceCard}>
          <View style={styles.resourceIcon}>
            <Ionicons name="library-outline" size={28} color="#16794A" />
          </View>

          <View style={styles.resourceContent}>
            <Text style={styles.resourceTitle}>
              Learning Materials Management
            </Text>

            <Text style={styles.resourceDescription}>
              Keep educational resources organized and accessible to authorized
              users. Open the materials section to review every teacher&apos;s
              resources.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.resourceButton,
                pressed && styles.pressedButton,
              ]}
              onPress={() => openPage("/admin/materials")}
              accessibilityRole="button"
            >
              <Text style={styles.resourceButtonText}>Review Materials</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Footer information */}
        <View style={styles.sidebarHint}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color="#16794A"
          />

          <Text style={styles.sidebarHintText}>
            Use the sidebar to access your account, manage app resources, lock
            the app, or log out securely.
          </Text>
        </View>

        <Text style={styles.footerText}>StudyMate AI · Administration</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type StatCardProps = {
  title: string;
  value: number;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  background: string;
};

function StatCard({
  title,
  value,
  description,
  icon,
  color,
  background,
}: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>

      <Text style={styles.statLabel}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statDescription}>{description}</Text>
    </View>
  );
}

type ActionCardProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  onPress: () => void;
};

function ActionCard({ icon, title, description, onPress }: ActionCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionCard,
        pressed && styles.pressedCard,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={23} color="#16794A" />
      </View>

      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#7A8B80" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8F5",
  },
  refreshProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    borderRadius: 0,
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F4F8F5",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#E2F2E8",
    justifyContent: "center",
    alignItems: "center",
  },
  loader: {
    marginTop: 24,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 19,
    fontWeight: "700",
    color: "#173D2A",
  },
  loadingSubtitle: {
    marginTop: 7,
    fontSize: 13,
    color: "#718078",
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  brandIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: "#16794A",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#173D2A",
  },
  brandSubtitle: {
    marginTop: 3,
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: "700",
    color: "#6E8174",
  },
  refreshButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#E5F2E9",
    justifyContent: "center",
    alignItems: "center",
  },
  pressedButton: {
    opacity: 0.7,
  },
  disabledButton: {
    opacity: 0.6,
  },
  welcomeSection: {
    marginBottom: 25,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    fontWeight: "800",
    color: "#16794A",
    marginBottom: 10,
  },
  welcomeTitle: {
    fontSize: 25,
    fontWeight: "700",
    color: "#183B29",
  },
  adminName: {
    marginTop: 2,
    fontSize: 29,
    fontWeight: "800",
    color: "#16794A",
  },
  welcomeDescription: {
    marginTop: 11,
    fontSize: 14,
    lineHeight: 21,
    color: "#718078",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
    marginTop: 5,
  },
  sectionTitle: {
    marginBottom: 13,
    marginTop: 7,
    fontSize: 17,
    fontWeight: "800",
    color: "#203C2B",
  },
  sectionCaption: {
    fontSize: 10,
    color: "#849087",
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 135,
    minHeight: 160,
    borderRadius: 19,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0ECE3",
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#718078",
  },
  statValue: {
    marginTop: 5,
    fontSize: 29,
    fontWeight: "800",
  },
  statDescription: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 15,
    color: "#849087",
  },
  countBadge: {
    backgroundColor: "#FFF0CF",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  countBadgeText: {
    color: "#956417",
    fontSize: 10,
    fontWeight: "700",
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E0ECE3",
    padding: 16,
    marginBottom: 24,
    gap: 13,
  },
  pressedCard: {
    opacity: 0.75,
  },
  featureIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: "#E5F4E9",
    justifyContent: "center",
    alignItems: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#203C2B",
  },
  featureDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#718078",
  },
  featureAction: {
    marginTop: 9,
    fontSize: 12,
    fontWeight: "800",
    color: "#16794A",
  },
  actionList: {
    gap: 11,
    marginBottom: 23,
  },
  recentEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0ECE3",
    borderRadius: 17,
    padding: 16,
    marginBottom: 23,
  },
  recentEmptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#718078",
  },
  recentList: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0ECE3",
    borderRadius: 17,
    padding: 6,
    marginBottom: 23,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  recentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#E5F4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  recentAvatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#16794A",
  },
  recentInfo: { flex: 1, minWidth: 0 },
  recentName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#203C2B",
  },
  recentMeta: {
    marginTop: 3,
    fontSize: 11,
    color: "#718078",
  },
  recentStatusPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recentPillApproved: { backgroundColor: "#E5F4E9" },
  recentPillPending: { backgroundColor: "#FFF0CF" },
  recentPillRejected: { backgroundColor: "#FBE3E3" },
  recentStatusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  recentTextApproved: { color: "#16794A" },
  recentTextPending: { color: "#B7791F" },
  recentTextRejected: { color: "#B33A3A" },
  recentViewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "#EEF3EF",
  },
  recentViewAllText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#16794A",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0ECE3",
    borderRadius: 17,
  },
  actionIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#E5F4E9",
    justifyContent: "center",
    alignItems: "center",
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#203C2B",
  },
  actionDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: "#718078",
  },
  resourceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    backgroundColor: "#EAF4ED",
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  resourceIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  resourceContent: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#203C2B",
  },
  resourceDescription: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 19,
    color: "#55705D",
  },
  resourceButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    backgroundColor: "#16794A",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 11,
    marginTop: 13,
  },
  resourceButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sidebarHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#EAF4ED",
    marginTop: 2,
  },
  sidebarHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#42654E",
  },
  footerText: {
    marginTop: 22,
    textAlign: "center",
    fontSize: 11,
    color: "#93A097",
  },
});
