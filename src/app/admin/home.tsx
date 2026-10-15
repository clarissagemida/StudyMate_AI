import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";

export default function AdminHome() {
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [adminName, setAdminName] = useState("Administrator");
  const [totalUsers, setTotalUsers] = useState(0);
  const [pendingUsers, setPendingUsers] = useState(0);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      // Verify the signed-in account's role in Supabase.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role, approval_status")
        .eq("id", user.id)
        .single();

      if (profileError || profile?.role !== "admin") {
        Alert.alert(
          "Access denied",
          "This page is only available to administrators.",
        );
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setAdminName(profile.full_name || "Administrator");

      // Count registered student/teacher accounts (administrators excluded).
      const { count: usersCount, error: usersError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .or("(role.neq.admin,role.is.null)")
        .or("(requested_role.neq.admin,requested_role.is.null)");

      if (usersError) throw usersError;
      setTotalUsers(usersCount ?? 0);

      // Count student/teacher accounts waiting for approval.
      const { count: pendingCount, error: pendingError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "pending")
        .or("(role.neq.admin,role.is.null)")
        .or("(requested_role.neq.admin,requested_role.is.null)");

      if (pendingError) throw pendingError;
      setPendingUsers(pendingCount ?? 0);
    } catch (error) {
      console.error("Admin dashboard error:", error);
      Alert.alert(
        "Unable to load dashboard",
        "Please check your Supabase connection and profiles table policies.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);

          const { error } = await supabase.auth.signOut();

          setSigningOut(false);

          if (error) {
            Alert.alert("Logout failed", error.message);
            return;
          }

          router.replace("/login");
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingText}>Loading admin dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandIcon}>
            <Ionicons name="school" size={25} color="#FFFFFF" />
          </View>

          <View style={styles.brandText}>
            <Text style={styles.brandTitle}>StudyMate AI</Text>
            <Text style={styles.brandSubtitle}>ADMINISTRATOR PANEL</Text>
          </View>

          <Pressable
            style={styles.logoutIcon}
            onPress={handleLogout}
            accessibilityLabel="Log out"
          >
            <Ionicons name="log-out-outline" size={23} color={DARK_GREEN} />
          </Pressable>
        </View>

        <View style={styles.welcomeCard}>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={15} color="#FFFFFF" />
            <Text style={styles.adminBadgeText}>ADMIN ACCESS</Text>
          </View>

          <Text style={styles.welcomeTitle}>Welcome back!</Text>
          <Text style={styles.adminName}>{adminName}</Text>
          <Text style={styles.welcomeDescription}>
            Manage accounts and help keep the StudyMate AI learning community
            organized.
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Pressable onPress={loadDashboard}>
            <Ionicons name="refresh-outline" size={22} color={GREEN} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#E2F1E7" }]}>
              <Ionicons name="people" size={23} color={GREEN} />
            </View>
            <Text style={styles.statLabel}>Total accounts</Text>
            <Text style={styles.statNumber}>{totalUsers}</Text>
            <Text style={styles.statFootnote}>Registered profiles</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#FFF0D8" }]}>
              <Ionicons name="time-outline" size={23} color="#B87515" />
            </View>
            <Text style={styles.statLabel}>Pending approval</Text>
            <Text style={styles.statNumber}>{pendingUsers}</Text>
            <Text style={styles.statFootnote}>Awaiting review</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Account management</Text>

        <Pressable
          style={styles.managementCard}
          onPress={() => router.push("/admin/users")}
        >
          <View style={styles.managementIcon}>
            <Ionicons name="person-add-outline" size={23} color={GREEN} />
          </View>

          <View style={styles.managementContent}>
            <Text style={styles.managementTitle}>User approvals</Text>
            <Text style={styles.managementDescription}>
              Review student and teacher accounts.
            </Text>
          </View>

          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingUsers}</Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#829187" />
        </Pressable>

        <View style={styles.managementCard}>
          <View style={styles.managementIcon}>
            <Ionicons name="shield-outline" size={23} color={GREEN} />
          </View>

          <View style={styles.managementContent}>
            <Text style={styles.managementTitle}>Admin account</Text>
            <Text style={styles.managementDescription}>
              You are signed in with administrator access.
            </Text>
          </View>

          <Ionicons name="checkmark-circle" size={23} color={GREEN} />
        </View>

        <Pressable style={styles.refreshButton} onPress={loadDashboard}>
          <Ionicons name="reload-outline" size={18} color={GREEN} />
          <Text style={styles.refreshButtonText}>Refresh dashboard</Text>
        </Pressable>

        <Pressable
          style={[styles.logoutButton, signingOut && { opacity: 0.6 }]}
          onPress={handleLogout}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              <Text style={styles.logoutButtonText}>Log out</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footer}>
          StudyMate AI · Learn smarter, one session at a time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#63756A",
    fontSize: 14,
  },
  container: {
    padding: 20,
    paddingBottom: 35,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    flex: 1,
    marginLeft: 12,
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: DARK_GREEN,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
    color: "#718277",
    marginTop: 3,
  },
  logoutIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#E7F0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeCard: {
    backgroundColor: GREEN,
    borderRadius: 24,
    padding: 23,
    marginBottom: 27,
  },
  adminBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 19,
  },
  adminBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  welcomeTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  adminName: {
    color: "#D8F0DF",
    fontSize: 17,
    fontWeight: "600",
    marginTop: 5,
  },
  welcomeDescription: {
    color: "#E0F0E5",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 13,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#20392B",
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  statIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  statLabel: {
    fontSize: 12,
    color: "#65776B",
    fontWeight: "600",
  },
  statNumber: {
    fontSize: 30,
    fontWeight: "800",
    color: DARK_GREEN,
    marginTop: 6,
  },
  statFootnote: {
    fontSize: 10,
    color: "#859389",
    marginTop: 4,
  },
  managementCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  managementIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  managementContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 5,
  },
  managementTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#263D2E",
  },
  managementDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: "#758479",
    marginTop: 4,
  },
  pendingBadge: {
    minWidth: 27,
    height: 27,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: "#FFF0D8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  pendingBadgeText: {
    color: "#A9670D",
    fontSize: 12,
    fontWeight: "800",
  },
  refreshButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: 14,
    marginTop: 8,
  },
  refreshButtonText: {
    color: GREEN,
    fontSize: 14,
    fontWeight: "700",
  },
  logoutButton: {
    minHeight: 52,
    backgroundColor: DARK_GREEN,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 5,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#859389",
    marginTop: 24,
    lineHeight: 17,
  },
});
