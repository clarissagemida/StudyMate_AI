import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { supabase } from "@/lib/supabase";
import { verifyAccountAndNavigate } from "@/utils/accountAccess";
import { authenticateWithBiometrics } from "@/utils/biometrics";
import { showNotice } from "@/utils/notify";
import {
  completeOAuthCallback,
  describeGoogleAuthError,
  getOAuthRedirectUrl,
} from "@/utils/oauthCallback";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
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

// Completes the browser-based OAuth session when returning to the app.
WebBrowser.maybeCompleteAuthSession();

type LoadingMode = "password" | "google" | "biometric" | "email-code" | null;

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<LoadingMode>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);

  const isBusy = loading !== null;

  const handleGoogleLogin = async () => {
    if (loading !== null) return;
    setLoading("google");

    const redirectTo = getOAuthRedirectUrl();

    try {
      // On the web the browser itself navigates to Google and then returns to
      // /auth/callback, where the code is exchanged for a session.
      if (Platform.OS === "web") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: { prompt: "select_account" },
            scopes: "email profile",
          },
        });

        if (error) throw error;
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
          scopes: "email profile",
        },
      });

      if (error) throw error;
      if (!data?.url) {
        throw new Error("Supabase did not return a Google sign-in URL.");
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );

      if (result.type !== "success" || !result.url) {
        if (result.type === "cancel" || result.type === "dismiss") return;
        if (result.type === "locked") {
          throw new Error(
            "The browser session was locked. Please close the browser and try again.",
          );
        }
        throw new Error("Google sign-in was not completed. Please try again.");
      }

      // Google has already verified the identity behind this address, so the
      // email-code gate is skipped while profile/approval checks still apply.
      const user = await completeOAuthCallback(result.url);

      await verifyAccountAndNavigate(user, { trustedProvider: true });
    } catch (error) {
      console.error("Google sign-in error:", error, { redirectTo });
      showNotice("Google Sign-In Failed", describeGoogleAuthError(error));
    } finally {
      setLoading(null);
    }
  };

  // Standard email and password login.
  const handleLogin = async () => {
    if (loading !== null) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      showNotice(
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
        showNotice(
          "Login Failed",
          error?.message ??
            "Please check your email and password and try again.",
        );
        return;
      }

      await verifyAccountAndNavigate(data.user);
    } catch {
      showNotice(
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
        showNotice(
          "Session Error",
          "We couldn't check your saved session. Please check your connection and try again.",
        );
        return;
      }

      if (!session?.user) {
        showNotice(
          "Sign In Required",
          "Please sign in with your StudyMate email and password first. Biometric unlock works with an existing saved session.",
        );
        return;
      }

      // 2. Verify the user's fingerprint or supported biometric.
      const result = await authenticateWithBiometrics();

      if (!result.success) {
        showNotice("Biometric Verification", result.message);
        return;
      }

      // 3. Validate the Supabase user after biometric authentication.
      const {
        data: { user: verifiedUser },
        error: verificationError,
      } = await supabase.auth.getUser();

      if (verificationError || !verifiedUser) {
        showNotice(
          "Session Expired",
          "Your saved session could not be verified. Please sign in again with your email and password.",
        );
        return;
      }

      // 4. Recheck the user's role and approval status.
      await verifyAccountAndNavigate(verifiedUser, { trustedProvider: true });
    } catch {
      showNotice(
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
                source={require("../../assets/images/image.png")}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="StudyMate AI mascot"
              />

              <Text style={styles.appName}>StudyMate AI</Text>
              {!showLoginForm && (
                <Text style={styles.tagline}>
                  Your personal study companion
                </Text>
              )}
            </View>

            {!showLoginForm ? (
              <View style={styles.initialActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.signInButton,
                    pressed && !isBusy && styles.pressed,
                    isBusy && styles.disabled,
                  ]}
                  onPress={() => setShowLoginForm(true)}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in"
                >
                  <Text style={styles.signInText}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.googleButton,
                    pressed && !isBusy && styles.pressed,
                    isBusy && styles.disabled,
                  ]}
                  onPress={handleGoogleLogin}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                >
                  {loading === "google" ? (
                    <ProgressIndicator
                      size="sm"
                      color="#176B45"
                      accessibilityLabel="Connecting to Google"
                    />
                  ) : (
                    <>
                      <ExpoImage
                        source={require("../../assets/images/google.webp")}
                        style={styles.googleIcon}
                        contentFit="contain"
                        accessibilityLabel="Google"
                      />
                      <Text style={styles.googleButtonText}>
                        Continue with Google
                      </Text>
                    </>
                  )}
                </Pressable>

                <Text style={styles.googleHint}>
                  {"You'll confirm your Google account before continuing."}
                </Text>

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
                    <ProgressIndicator
                      size="sm"
                      color="#176B45"
                      accessibilityLabel="Unlocking with biometrics"
                    />
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
            ) : (
              /* Login form */
              <View style={styles.form}>
                <Pressable
                  style={styles.backToInitial}
                  onPress={() => setShowLoginForm(false)}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <Ionicons name="arrow-back" size={18} color="#176B45" />
                  <Text style={styles.backToInitialText}>Back</Text>
                </Pressable>

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
                    <ProgressIndicator
                      size="sm"
                      color="#FFFFFF"
                      accessibilityLabel="Signing in"
                    />
                  ) : (
                    <>
                      <Text style={styles.signInText}>Sign In</Text>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {!showLoginForm && (
              <Text style={styles.footer}>LEARN · PRACTICE · IMPROVE</Text>
            )}
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
    width: 220,
    height: 220,
    marginBottom: 8,
  },
  appName: {
    color: "#176B45",
    fontSize: 32,
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
  googleButton: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#DCE5DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    paddingHorizontal: 14,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    color: "#294638",
    fontSize: 14,
    fontWeight: "700",
  },
  googleHint: {
    color: "#849087",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: -4,
    paddingHorizontal: 12,
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
  initialActions: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    gap: 12,
  },
  backToInitial: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  backToInitialText: {
    color: "#176B45",
    fontSize: 13,
    fontWeight: "600",
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
