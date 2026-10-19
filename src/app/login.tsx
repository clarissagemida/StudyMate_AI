import { supabase } from "@/lib/supabase";
import { setAppLocked } from "@/utils/appLock";
import { authenticateWithBiometrics } from "@/utils/biometrics";
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

type LoadingMode = "password" | "biometric" | null;

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<LoadingMode>(null);

  const isBusy = loading !== null;

  // Verify the account before opening any dashboard.
  const verifyAccountAndNavigate = async (userId: string) => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, approval_status")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        Alert.alert(
          "Connection Error",
          "We couldn't verify your account. Check your internet connection and try again.",
        );
        return;
      }

      if (!profile) {
        await supabase.auth.signOut();

        Alert.alert(
          "Profile Error",
          "We couldn't find your StudyMate profile. Please contact the administrator.",
        );
        return;
      }

      if (profile.approval_status !== "approved") {
        // Pending or rejected accounts must not retain an authenticated session.
        await supabase.auth.signOut();

        if (profile.approval_status === "rejected") {
          Alert.alert(
            "Registration Not Approved",
            "Your registration was not approved. Please contact the administrator for assistance.",
          );
        } else {
          Alert.alert(
            "Account Pending Approval",
            "Your account is waiting for administrator approval. You can sign in after it has been approved.",
          );
        }

        return;
      }
      // Password or biometric verification succeeded for an approved
      // account: this is the only place the central app lock is cleared.
      setAppLocked(false);

      switch (profile.role) {
        case "student":
          router.replace("/student");
          break;

        case "teacher":
          router.replace("/teacher");
          break;

        case "admin":
          router.replace("/admin/home");
          break;

        default:
          await supabase.auth.signOut();

          Alert.alert(
            "Invalid Role",
            "Your account role could not be verified. Please contact the administrator.",
          );
      }
    } catch {
      Alert.alert(
        "Verification Error",
        "We couldn't verify your account. Please try again.",
      );
    }
  };

  // Standard email and password login.
  const handleLogin = async () => {
    if (loading !== null) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      Alert.alert(
        "Missing Information",
        "Please enter your email address and password.",
      );
      return;
    }

    setLoading("password");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        Alert.alert(
          "Login Failed",
          error?.message ??
            "Please check your email and password and try again.",
        );
        return;
      }

      await verifyAccountAndNavigate(data.user.id);
    } catch {
      Alert.alert(
        "Connection Error",
        "Please check your internet connection and try again.",
      );
    } finally {
      setLoading(null);
    }
  };

  // Biometric unlock requires an existing Supabase session.
  // Fingerprint verification alone never grants account access.
  const handleBiometricLogin = async () => {
    if (loading !== null) return;

    setLoading("biometric");

    try {
      // 1. Check for a saved session before requesting biometrics.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        Alert.alert(
          "Session Error",
          "We couldn't check your saved session. Please check your connection and try again.",
        );
        return;
      }

      if (!session?.user) {
        Alert.alert(
          "Sign In Required",
          "Please sign in with your StudyMate email and password first. Biometric unlock works with an existing saved session.",
        );
        return;
      }

      // 2. Verify the user's fingerprint or supported biometric.
      const result = await authenticateWithBiometrics();

      if (!result.success) {
        Alert.alert("Biometric Verification", result.message);
        return;
      }

      // 3. Validate the Supabase user after biometric authentication.
      const {
        data: { user: verifiedUser },
        error: verificationError,
      } = await supabase.auth.getUser();

      if (verificationError || !verifiedUser) {
        Alert.alert(
          "Session Expired",
          "Your saved session could not be verified. Please sign in again with your email and password.",
        );
        return;
      }

      // 4. Recheck the user's role and approval status.
      await verifyAccountAndNavigate(verifiedUser.id);
    } catch {
      Alert.alert(
        "Biometric Login Error",
        "Unable to complete verification. Please try again or use your StudyMate password.",
      );
    } finally {
      setLoading(null);
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
            {/* StudyMate branding */}
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
                  editable={!isBusy}
                  returnKeyType="next"
                  accessibilityLabel="Email address"
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
                  editable={!isBusy}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="Password"
                />

                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  disabled={isBusy}
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

              {/* Standard login */}
              <Pressable
                style={({ pressed }) => [
                  styles.signInButton,
                  pressed && !isBusy && styles.pressed,
                  isBusy && styles.disabled,
                ]}
                onPress={handleLogin}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Sign in with email and password"
              >
                {loading === "password" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.signInText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </Pressable>

              {/* Separator */}
              <View style={styles.separator}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>OR</Text>
                <View style={styles.separatorLine} />
              </View>

              {/* Biometric unlock */}
              <Pressable
                style={({ pressed }) => [
                  styles.biometricButton,
                  pressed && !isBusy && styles.pressed,
                  isBusy && styles.disabled,
                ]}
                onPress={handleBiometricLogin}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Unlock with biometrics"
              >
                {loading === "biometric" ? (
                  <ActivityIndicator color="#176B45" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={27} color="#176B45" />

                    <View style={styles.biometricButtonText}>
                      <Text style={styles.biometricTitle}>
                        Unlock with Biometrics
                      </Text>
                      <Text style={styles.biometricSubtitle}>
                        Securely access your saved session
                      </Text>
                    </View>

                    <Ionicons
                      name="shield-checkmark-outline"
                      size={21}
                      color="#176B45"
                    />
                  </>
                )}
              </Pressable>

              {/* Registration */}
              <View style={styles.registerRow}>
                <Text style={styles.registerText}>New to StudyMate? </Text>

                <Pressable
                  onPress={() => router.push("/register")}
                  disabled={isBusy}
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
  separator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 19,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E8EDE9",
  },
  separatorText: {
    color: "#9AA59D",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  biometricButton: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBD8C5",
    backgroundColor: "#F5FAF6",
  },
  biometricButtonText: {
    flex: 1,
    gap: 4,
  },
  biometricTitle: {
    color: "#176B45",
    fontSize: 13,
    fontWeight: "700",
  },
  biometricSubtitle: {
    color: "#78877D",
    fontSize: 10,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
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
