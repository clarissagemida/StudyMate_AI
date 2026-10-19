import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
        Alert.alert(
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
    } catch (error: unknown) {
      const err = error as DashboardError;

      console.error("Admin dashboard error:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      });

      Alert.alert(
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
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />

        <View style={styles.loadingIcon}>
          <Ionicons name="school-outline" size={34} color="#16794A" />
        </View>

        <ActivityIndicator size="large" color="#16794A" style={styles.loader} />

        <Text style={styles.loadingTitle}>Loading dashboard</Text>
        <Text style={styles.loadingSubtitle}>
          Please wait while we retrieve your data.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#16794A"]}
            tintColor="#16794A"
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
              <ActivityIndicator size="small" color="#16794A" />
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
            description="Manage educational resources uploaded by teachers."
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
              users. Open the materials section to manage your resources.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.resourceButton,
                pressed && styles.pressedButton,
              ]}
              onPress={() => openPage("/admin/materials")}
              accessibilityRole="button"
            >
              <Text style={styles.resourceButtonText}>Manage Materials</Text>
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
