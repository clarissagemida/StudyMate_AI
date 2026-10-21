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
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";

export default function AdminSettingsScreen() {
  const [adminName, setAdminName] = useState("Administrator");
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (userError) console.error("Settings load error:", userError.message);
          return;
        }

        if (!active) return;
        setEmail(user.email ?? null);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Settings profile error:", profileError.message);
          return;
        }

        if (!active) return;
        setAdminName(profile?.full_name || "Administrator");
      } catch (error) {
        console.error("Settings load error:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        Alert.alert("Logout failed", error.message);
        return;
      }

      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert(
        "Logout failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {adminName.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.name}>{adminName}</Text>
              <Text style={styles.email}>{email ?? "No email on file"}</Text>
              <View style={styles.rolePill}>
                <Ionicons name="shield-checkmark" size={13} color={GREEN} />
                <Text style={styles.rolePillText}>ADMINISTRATOR</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="notifications-outline" size={20} color={GREEN} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Push notifications</Text>
            <Text style={styles.rowSubtitle}>
              Alerts about new account requests.
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: "#CBD8CE", true: "#8FCBA6" }}
            thumbColor={notifications ? GREEN : "#F4F4F4"}
          />
        </View>

        <Text style={styles.sectionTitle}>About</Text>

        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="information-circle-outline" size={20} color={GREEN} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>StudyMate AI</Text>
            <Text style={styles.rowSubtitle}>Version 1.0.0</Text>
          </View>
        </View>

        <Pressable
          style={[styles.logoutButton, signingOut && styles.disabled]}
          onPress={handleLogout}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              <Text style={styles.logoutText}>Log out</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { padding: 20, paddingBottom: 40, gap: 14 },
  profileCard: {
    backgroundColor: GREEN,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 30, fontWeight: "800", color: "#FFFFFF" },
  name: { fontSize: 20, fontWeight: "800", color: "#FFFFFF", marginTop: 14 },
  email: { fontSize: 13, color: "#D8F0DF", marginTop: 5 },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 16,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: GREEN,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK_GREEN,
    marginTop: 8,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 14, fontWeight: "800", color: "#263D2E" },
  rowSubtitle: { fontSize: 12, color: "#758479", marginTop: 3 },
  logoutButton: {
    minHeight: 52,
    backgroundColor: DARK_GREEN,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 12,
  },
  logoutText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
});
