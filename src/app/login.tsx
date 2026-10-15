import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    if (!email.trim() || !password) {
      Alert.alert("Missing Information", "Enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.user) {
        Alert.alert("Login Failed", error?.message ?? "Please try again.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, approval_status")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        Alert.alert(
          "Profile Error",
          "We couldn't verify your account. Please contact the administrator.",
        );
        return;
      }

      if (profile.approval_status !== "approved") {
        await supabase.auth.signOut();

        if (profile.approval_status === "rejected") {
          Alert.alert(
            "Registration Not Approved",
            "Your registration was not approved by the administrator. Please contact the administrator for assistance.",
          );
        } else {
          Alert.alert(
            "Account Pending Approval",
            "Your account is still waiting for administrator approval. You will be able to sign in once an administrator approves your account.",
          );
        }
        return;
      }

      switch (profile.role) {
        case "student":
        case "teacher":
          router.replace("/home");
          break;
        case "admin":
          router.replace("/admin/home");
          break;
        default:
          await supabase.auth.signOut();
          Alert.alert("Invalid Role", "Please contact the administrator.");
      }
    } catch {
      Alert.alert(
        "Connection Error",
        "Please check your internet connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Single logo and app branding */}
            <View style={styles.brand}>
              <Image
                source={require("../../assets/images/studymate_logo.png")}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="StudyMate AI mascot"
              />

              <Text style={styles.appName}>StudyMate AI</Text>
              <Text style={styles.tagline}>Your personal study companion</Text>
            </View>

            {/* Login form */}
            <View style={styles.form}>
              <Text style={styles.heading}>Welcome back</Text>
              <Text style={styles.description}>
                Sign in to continue learning.
              </Text>

              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputBox}>
                <Ionicons name="mail-outline" size={19} color="#718077" />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#A0AAA3"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!loading}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputBox}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color="#718077"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#A0AAA3"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  disabled={loading}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#718077"
                  />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.signInButton,
                  pressed && !loading && styles.pressed,
                  loading && styles.disabled,
                ]}
                onPress={handleLogin}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.signInText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </Pressable>

              <View style={styles.registerRow}>
                <Text style={styles.registerText}>New to StudyMate? </Text>
                <Pressable
                  onPress={() => router.push("/register")}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  <Text style={styles.registerLink}>Create account</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.footer}>LEARN · PRACTICE · IMPROVE</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#F5F8F5",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 24,
  },
  brand: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 170,
    height: 170,
    marginBottom: 8,
  },
  appName: {
    color: "#176B45",
    fontSize: 29,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: {
    color: "#78877D",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  form: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E7EDE8",
    shadowColor: "#0B2417",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  heading: {
    color: "#203C2D",
    fontSize: 25,
    fontWeight: "700",
  },
  description: {
    color: "#849087",
    fontSize: 13,
    marginTop: 6,
    marginBottom: 16,
  },
  label: {
    color: "#354C3C",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 13,
    marginBottom: 8,
  },
  inputBox: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E1E8E2",
    backgroundColor: "#FBFCFB",
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#203C2D",
    fontSize: 14,
    paddingVertical: 12,
  },
  signInButton: {
    minHeight: 51,
    backgroundColor: "#176B45",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 23,
  },
  signInText: {
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
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 20,
  },
  registerText: {
    color: "#78877D",
    fontSize: 12,
  },
  registerLink: {
    color: "#176B45",
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    color: "#8A978E",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 24,
  },
});
