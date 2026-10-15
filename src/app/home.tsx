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

const PRIMARY = "#176B45";
const BG = "#F4F8F5";

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [userName, setUserName] = useState("Student");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, student_id, role, approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (profile?.role === "admin") {
          router.replace("/admin/home");
          return;
        }

        if (!profile || profile.approval_status !== "approved") {
          await supabase.auth.signOut();
          Alert.alert(
            "Access Restricted",
            "Your account is no longer approved. Please contact the administrator.",
          );
          router.replace("/login");
          return;
        }

        setUserName(
          profile?.full_name || user.user_metadata?.full_name || "Student",
        );
        setStudentId(
          profile?.student_id || user.user_metadata?.student_id || null,
        );
        setEmail(user.email ?? null);
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      Alert.alert("Error", "Failed to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{userName}</Text>
            {studentId ? (
              <Text style={styles.meta}>Student ID: {studentId}</Text>
            ) : null}
            {email ? <Text style={styles.meta}>{email}</Text> : null}
          </View>
          <View style={styles.avatar}>
            <Ionicons name="school-outline" size={28} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="book-outline" size={22} color={PRIMARY} />
            <Text style={styles.cardTitle}>Your Learning Hub</Text>
          </View>
          <Text style={styles.cardText}>
            Ready to continue your learning journey? Access your study materials,
            quizzes, and AI-powered assistance all in one place.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            onPress={() => Alert.alert("Coming Soon", "Study materials will be available soon.")}
          >
            <Ionicons name="library-outline" size={20} color={PRIMARY} />
            <Text style={styles.actionText}>Study Materials</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            onPress={() => Alert.alert("Coming Soon", "Quizzes feature is coming soon.")}
          >
            <Ionicons name="help-circle-outline" size={20} color={PRIMARY} />
            <Text style={styles.actionText}>Practice Quizzes</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            onPress={() => Alert.alert("Coming Soon", "AI Assistant is coming soon.")}
          >
            <Ionicons name="sparkles-outline" size={20} color={PRIMARY} />
            <Text style={styles.actionText}>AI Study Assistant</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && !signingOut && styles.pressed,
            signingOut && styles.disabled,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#52665A",
    fontSize: 14,
    marginTop: 12,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E7EDE8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  greeting: {
    fontSize: 14,
    color: "#849188",
    fontWeight: "600",
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: "#203C2D",
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    color: "#78877D",
    marginTop: 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E7EDE8",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#203C2D",
  },
  cardText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#52665A",
  },
  actions: {
    gap: 12,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7EDE8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  actionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#203C2D",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: PRIMARY,
    borderRadius: 14,
    padding: 16,
    marginTop: "auto",
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.65,
  },
});
