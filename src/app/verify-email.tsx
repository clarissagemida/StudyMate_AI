import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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

const GREEN = "#176B45";

// Resend cooldown (seconds). Kept client-side as a courtesy so we do not hammer
// Supabase; Supabase enforces its own rate limit regardless and is the real
// authority.
const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

// Map Supabase Auth errors to friendly messages for the verification flow.
// Supabase is the source of truth; we never validate the code locally.
function describeVerifyError(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (message.includes("expired")) {
    return "This code has expired. Tap Resend to get a new one.";
  }

  if (message.includes("invalid") && message.includes("token")) {
    return "That code is not correct. Please check the 6 digits and try again.";
  }

  if (
    message.includes("rate limit") ||
    message.includes("over_email_send_rate_limit") ||
    message.includes("too many")
  ) {
    return "Too many attempts. Please wait a moment before requesting another code.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "We could not reach the server. Check your internet connection and try again.";
  }

  return rawMessage || "Verification failed. Please try again.";
}

function describeResendError(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (
    message.includes("rate limit") ||
    message.includes("over_email_send_rate_limit") ||
    message.includes("too many")
  ) {
    return "You have requested codes too often. Please wait about a minute before trying again.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "We could not reach the server. Check your internet connection and try again.";
  }

  return rawMessage || "We could not resend the code. Please try again.";
}

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();

  const initialEmail = useMemo(
    () => (typeof params.email === "string" ? params.email.trim().toLowerCase() : ""),
    [params.email],
  );

  const [email] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Seconds remaining before Resend is allowed again.
  const [cooldown, setCooldown] = useState(
    initialEmail ? RESEND_COOLDOWN_SECONDS : 0,
  );

  const inputRef = useRef<TextInput>(null);

  // Countdown ticker for the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const isBusy = verifying || resending;
  const canSubmit = email.length > 0 && code.length === CODE_LENGTH && !isBusy;

  const handleCodeChange = useCallback((value: string) => {
    // Digits only, hard-capped at six characters.
    const digits = value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setStatus((current) => (current.kind === "error" ? { kind: "idle" } : current));
  }, []);

  const handleVerify = useCallback(async () => {
    if (verifying) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setStatus({ kind: "error", message: "Please enter your email address." });
      return;
    }

    if (code.length !== CODE_LENGTH) {
      setStatus({
        kind: "error",
        message: `Please enter the ${CODE_LENGTH}-digit code from your email.`,
      });
      return;
    }

    setVerifying(true);
    setStatus({ kind: "idle" });

    try {
      // type: "signup" confirms the EXISTING signup. A passwordless "email"
      // OTP is not equivalent and must not be used here.
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: code,
        type: "signup",
      });

      if (error) {
        setStatus({ kind: "error", message: describeVerifyError(error.message) });
        return;
      }

      if (!data.session || !data.user) {
        // No session means the code was accepted but no login was created
        // (e.g. the account still needs admin approval). Send them to login;
        // the existing login + approval flow takes over from there.
        setStatus({
          kind: "success",
          message: "Email verified. Please sign in to continue.",
        });

        setTimeout(() => {
          router.replace("/login");
        }, 1200);
        return;
      }

      // The verification created a session. Drop it so the user still goes
      // through the normal login and approval checks — verification must never
      // auto-skip login or unlock a privileged screen.
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        console.error(
          "Could not clear post-verification session:",
          signOutError.message,
        );
      }

      setStatus({
        kind: "success",
        message: "Email verified successfully. Please sign in to continue.",
      });

      setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (error) {
      console.error("Email verification failed:", error);
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? describeVerifyError(error.message)
            : "Verification failed. Please try again.",
      });
    } finally {
      setVerifying(false);
    }
  }, [code, email, verifying]);

  const handleResend = useCallback(async () => {
    if (resending || cooldown > 0) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setStatus({
        kind: "error",
        message: "Please enter your email address to resend the code.",
      });
      return;
    }

    setResending(true);
    setStatus({ kind: "idle" });

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
      });

      if (error) {
        setStatus({
          kind: "error",
          message: describeResendError(error.message),
        });
        return;
      }

      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStatus({
        kind: "success",
        message: "A new code was sent. Check your inbox and spam folder.",
      });
    } catch (error) {
      console.error("Resend code failed:", error);
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? describeResendError(error.message)
            : "We could not resend the code. Please try again.",
      });
    } finally {
      setResending(false);
    }
  }, [cooldown, email, resending]);

  const resendLabel =
    cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code";

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
            <Pressable
              style={styles.backButton}
              onPress={() => router.replace("/register")}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Back to registration"
            >
              <Ionicons name="arrow-back" size={19} color={GREEN} />
              <Text style={styles.backText}>Back to registration</Text>
            </Pressable>

            <View style={styles.header}>
              <View style={styles.logoCircle}>
                <Ionicons name="mail-unread-outline" size={30} color={GREEN} />
              </View>
              <Text style={styles.title}>Verify your email</Text>
              <Text style={styles.subtitle}>
                We sent a {CODE_LENGTH}-digit code to
              </Text>
              <Text style={styles.emailText}>
                {email || "your email address"}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Enter the 6-digit code</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="keypad-outline" size={19} color="#849188" />
                <TextInput
                  ref={inputRef}
                  style={[styles.input, styles.codeInput]}
                  placeholder="000000"
                  placeholderTextColor="#9BA69F"
                  value={code}
                  onChangeText={handleCodeChange}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  editable={!isBusy}
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                  accessibilityLabel="Six digit verification code"
                />
              </View>

              <Text style={styles.helper}>
                Enter the code exactly as shown. It may take a moment to arrive.
              </Text>

              {status.kind !== "idle" ? (
                <View
                  style={[
                    styles.statusBox,
                    status.kind === "error"
                      ? styles.statusError
                      : styles.statusSuccess,
                  ]}
                >
                  <Ionicons
                    name={
                      status.kind === "error"
                        ? "alert-circle-outline"
                        : "checkmark-circle-outline"
                    }
                    size={17}
                    color={status.kind === "error" ? "#B33A3A" : GREEN}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      status.kind === "error"
                        ? styles.statusTextError
                        : styles.statusTextSuccess,
                    ]}
                  >
                    {status.message}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.verifyButton,
                  pressed && !isBusy && styles.buttonPressed,
                  (!canSubmit || verifying) && styles.disabledButton,
                ]}
                onPress={handleVerify}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Verify code"
              >
                {verifying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.verifyButtonText}>Verify</Text>
                    <Ionicons
                      name="checkmark"
                      size={19}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.resendButton,
                  pressed && !isBusy && styles.buttonPressed,
                  (resending || cooldown > 0) && styles.disabledButton,
                ]}
                onPress={handleResend}
                disabled={resending || cooldown > 0}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                {resending ? (
                  <ActivityIndicator color={GREEN} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={17} color={GREEN} />
                    <Text style={styles.resendButtonText}>{resendLabel}</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.loginRow}>
                <Text style={styles.loginHint}>Already verified?</Text>
                <Pressable
                  onPress={() => router.replace("/login")}
                  disabled={isBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.loginLink}> Go to login</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.footer}>
              STUDYMATE AI · LEARN • PRACTICE • IMPROVE
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F4F8F5" },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 8,
    gap: 7,
  },
  backText: { color: GREEN, fontSize: 13, fontWeight: "600" },
  header: { alignItems: "center", marginTop: 14, marginBottom: 22 },
  logoCircle: {
    width: 62,
    height: 62,
    borderRadius: 21,
    backgroundColor: "#E4F1E7",
    borderWidth: 1,
    borderColor: "#D7E8DA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  title: {
    color: "#173D2B",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: { color: "#78877D", fontSize: 13, marginTop: 8 },
  emailText: {
    color: GREEN,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2EBE3",
    shadowColor: "#173D2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    elevation: 2,
  },
  label: {
    color: "#365341",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 7,
  },
  inputContainer: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFCFA",
    borderWidth: 1,
    borderColor: "#E0E8E1",
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#173D2B",
    fontSize: 13,
    paddingVertical: 12,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 8,
    textAlign: "center",
  },
  helper: {
    color: "#849188",
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 11,
    marginTop: 12,
  },
  statusError: { backgroundColor: "#FBEFEF" },
  statusSuccess: { backgroundColor: "#EAF4EC" },
  statusText: { flex: 1, fontSize: 12, lineHeight: 17 },
  statusTextError: { color: "#B33A3A" },
  statusTextSuccess: { color: "#2C6A45" },
  verifyButton: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: GREEN,
    borderRadius: 13,
    marginTop: 18,
    paddingHorizontal: 16,
  },
  verifyButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  resendButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EAF4EC",
    borderRadius: 13,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  resendButtonText: { color: GREEN, fontSize: 13, fontWeight: "800" },
  buttonPressed: { opacity: 0.85 },
  disabledButton: { opacity: 0.55 },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 17,
  },
  loginHint: { color: "#849188", fontSize: 12 },
  loginLink: { color: GREEN, fontSize: 12, fontWeight: "800" },
  footer: {
    color: "#8A9A8F",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    textAlign: "center",
    marginTop: 22,
  },
});
