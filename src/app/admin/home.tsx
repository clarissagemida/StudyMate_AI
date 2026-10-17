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
  });

  const loadDashboard = useCallback(async () => {
    try {
      // 1. Verify the current authenticated user.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      // 2. Load the administrator's profile.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role, approval_status")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Admin profile query failed:", {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint,
        });

        throw profileError;
      }

      // 3. Ensure this account has administrator access.
      if (
        profile?.role !== "admin" ||
        profile?.approval_status !== "approved"
      ) {
        Alert.alert(
          "Access denied",
          "This page is only available to approved administrators.",
        );

        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setAdminName(profile.full_name?.trim() || "Administrator");

      // 4. Count non-admin profiles.
      const { count: usersCount, error: usersError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .or("role.neq.admin,role.is.null");

      if (usersError) {
        console.error("Total accounts query failed:", {
          message: usersError.message,
          code: usersError.code,
          details: usersError.details,
          hint: usersError.hint,
        });

        throw usersError;
      }

      // 5. Count non-admin profiles awaiting approval.
      const { count: pendingCount, error: pendingError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending")
        .or("role.neq.admin,role.is.null");

      if (pendingError) {
        console.error("Pending accounts query failed:", {
          message: pendingError.message,
          code: pendingError.code,
          details: pendingError.details,
          hint: pendingError.hint,
        });

        throw pendingError;
      }

      // 6. Update the dashboard statistics.
      setStats({
        totalUsers: usersCount ?? 0,
        pendingUsers: pendingCount ?? 0,
      });
    } catch (error: unknown) {
      const err = error as DashboardError;

      console.error("Admin dashboard error:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error,
      });

      Alert.alert(
        "Unable to load dashboard",
        err?.message ||
          "Could not load dashboard data. Check your connection, database schema, and Supabase access policies.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = () => {
    if (refreshing) return;

    setRefreshing(true);
    void loadDashboard();
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
            Manage accounts and monitor registration activity in your StudyMate
            AI application.
          </Text>
        </View>

        {/* Statistics */}
        <Text style={styles.sectionTitle}>Overview</Text>

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.totalCard]}>
            <View style={styles.totalIcon}>
              <Ionicons name="people-outline" size={23} color="#16794A" />
            </View>

            <Text style={styles.statLabel}>Total Accounts</Text>

            <Text style={styles.statValue}>{stats.totalUsers}</Text>

            <Text style={styles.statDescription}>
              Registered non-admin profiles
            </Text>
          </View>

          <View style={[styles.statCard, styles.pendingCard]}>
            <View style={styles.pendingIcon}>
              <Ionicons name="time-outline" size={23} color="#B7791F" />
            </View>

            <Text style={styles.statLabel}>Pending Approval</Text>

            <Text style={styles.pendingValue}>{stats.pendingUsers}</Text>

            <Text style={styles.statDescription}>Accounts awaiting review</Text>
          </View>
        </View>

        {/* Account management */}
        <Text style={styles.sectionTitle}>Management</Text>

        <Pressable
          style={({ pressed }) => [
            styles.managementCard,
            pressed && styles.pressedCard,
          ]}
          onPress={() => router.push("/admin/users")}
          accessibilityRole="button"
          accessibilityLabel="Open user approvals"
        >
          <View style={styles.managementIcon}>
            <Ionicons name="people" size={25} color="#16794A" />
          </View>

          <View style={styles.managementTextContainer}>
            <Text style={styles.managementTitle}>User Approvals</Text>

            <Text style={styles.managementDescription}>
              Review registrations and manage account access.
            </Text>

            {stats.pendingUsers > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>
                  {stats.pendingUsers} awaiting review
                </Text>
              </View>
            )}
          </View>

          <Ionicons name="chevron-forward" size={22} color="#7A8B80" />
        </Pressable>

        {/* Admin account */}
        <Text style={styles.sectionTitle}>Your Account</Text>

        <View style={styles.accountCard}>
          <View style={styles.accountAvatar}>
            <Ionicons name="shield-checkmark" size={25} color="#16794A" />
          </View>

          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{adminName}</Text>

            <Text style={styles.accountRole}>System Administrator</Text>

            <View style={styles.accountStatus}>
              <View style={styles.statusDot} />

              <Text style={styles.statusText}>Authenticated</Text>
            </View>
          </View>
        </View>

        {/* Logout is managed by admin/_layout.tsx */}
        <View style={styles.sidebarHint}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color="#16794A"
          />

          <Text style={styles.sidebarHintText}>
            Use the sidebar menu to access other admin pages and log out.
          </Text>
        </View>

        <Text style={styles.footerText}>StudyMate AI · Administration</Text>
      </ScrollView>
    </SafeAreaView>
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
    marginBottom: 27,
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
  sectionTitle: {
    marginBottom: 13,
    marginTop: 5,
    fontSize: 17,
    fontWeight: "800",
    color: "#203C2B",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 25,
  },
  statCard: {
    flex: 1,
    minHeight: 174,
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
  },
  totalCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E0ECE3",
  },
  pendingCard: {
    backgroundColor: "#FFFCF5",
    borderColor: "#F1E7CF",
  },
  totalIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#E5F4E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },
  pendingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#FFF0CF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#718078",
  },
  statValue: {
    marginTop: 5,
    fontSize: 31,
    fontWeight: "800",
    color: "#16794A",
  },
  pendingValue: {
    marginTop: 5,
    fontSize: 31,
    fontWeight: "800",
    color: "#B7791F",
  },
  statDescription: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 15,
    color: "#849087",
  },
  managementCard: {
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
  managementIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: "#E5F4E9",
    justifyContent: "center",
    alignItems: "center",
  },
  managementTextContainer: {
    flex: 1,
  },
  managementTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#203C2B",
  },
  managementDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#718078",
  },
  pendingBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF0CF",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 9,
  },
  pendingBadgeText: {
    color: "#956417",
    fontSize: 10,
    fontWeight: "700",
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E0ECE3",
    padding: 16,
    marginBottom: 20,
  },
  accountAvatar: {
    width: 51,
    height: 51,
    borderRadius: 17,
    backgroundColor: "#E5F4E9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#203C2B",
  },
  accountRole: {
    marginTop: 4,
    fontSize: 12,
    color: "#718078",
  },
  accountStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#20A05A",
  },
  statusText: {
    fontSize: 11,
    color: "#27834D",
    fontWeight: "600",
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
