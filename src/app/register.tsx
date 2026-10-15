import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type UserRole = "student" | "teacher";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("student");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;

    const cleanName = fullName.trim();
    const cleanStudentId = studentId.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (
      !cleanName ||
      !cleanStudentId ||
      !cleanEmail ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert("Missing information", "Please complete all fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Weak password",
        "Use at least 8 characters for your password.",
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Passwords do not match",
        "Please make sure both passwords are the same.",
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            student_id: cleanStudentId,
            requested_role: requestedRole,
          },
        },
      });

      if (error) {
        const message = error.message.toLowerCase();

        if (
          message.includes("duplicate key") ||
          message.includes("unique constraint")
        ) {
          Alert.alert(
            "Information already exists",
            "This Student / School ID may already be registered. Please check your details.",
          );
        } else if (
          message.includes("already registered") ||
          message.includes("already exists")
        ) {
          Alert.alert(
            "Account may already exist",
            "Try logging in with this email address.",
          );
        } else {
          Alert.alert("Registration failed", error.message);
        }

        return;
      }

      Alert.alert(
        "Registration submitted",
        "Your registration was submitted successfully. Your account may require email verification and administrator approval before you can access StudyMate AI.",
        [
          {
            text: "Go to Login",
            onPress: () => router.replace("/login"),
          },
        ],
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Please check your internet connection and try again.";

      Alert.alert("Something went wrong", message);
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
            <Pressable
              style={styles.backButton}
              onPress={() => router.replace("/login")}
              disabled={loading}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={19} color="#176B45" />
              <Text style={styles.backText}>Back to login</Text>
            </Pressable>

            <View style={styles.header}>
              <View style={styles.logoCircle}>
                <Ionicons name="school-outline" size={30} color="#176B45" />
              </View>

              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>
                Your learning journey starts here.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Personal details</Text>

              <Text style={styles.label}>Full name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={19} color="#849188" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  placeholderTextColor="#9BA69F"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Student / School ID</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="id-card-outline" size={19} color="#849188" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your school ID"
                  placeholderTextColor="#9BA69F"
                  value={studentId}
                  onChangeText={setStudentId}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={19} color="#849188" />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#9BA69F"
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

              <Text style={styles.label}>Register as</Text>
              <View style={styles.roleContainer}>
                <Pressable
                  style={[
                    styles.roleOption,
                    requestedRole === "student" && styles.roleSelected,
                  ]}
                  onPress={() => setRequestedRole("student")}
                  disabled={loading}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: requestedRole === "student",
                  }}
                >
                  <Ionicons
                    name="book-outline"
                    size={20}
                    color={requestedRole === "student" ? "#176B45" : "#849188"}
                  />
                  <Text
                    style={[
                      styles.roleText,
                      requestedRole === "student" && styles.roleTextSelected,
                    ]}
                  >
                    Student
                  </Text>
                  {requestedRole === "student" && (
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color="#176B45"
                    />
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.roleOption,
                    requestedRole === "teacher" && styles.roleSelected,
                  ]}
                  onPress={() => setRequestedRole("teacher")}
                  disabled={loading}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: requestedRole === "teacher",
                  }}
                >
                  <Ionicons
                    name="easel-outline"
                    size={20}
                    color={requestedRole === "teacher" ? "#176B45" : "#849188"}
                  />
                  <Text
                    style={[
                      styles.roleText,
                      requestedRole === "teacher" && styles.roleTextSelected,
                    ]}
                  >
                    Teacher
                  </Text>
                  {requestedRole === "teacher" && (
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color="#176B45"
                    />
                  )}
                </Pressable>
              </View>

              <View style={styles.notice}>
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color="#52765F"
                />
                <Text style={styles.noticeText}>
                  Account access may require administrator approval.
                </Text>
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color="#849188"
                />
                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#9BA69F"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  editable={!loading}
                  returnKeyType="next"
                />
                <Pressable
                  onPress={() => setShowPassword((previous) => !previous)}
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
                    color="#849188"
                  />
                </Pressable>
              </View>

              <Text style={styles.label}>Confirm password</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color="#849188"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password again"
                  placeholderTextColor="#9BA69F"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
                <Pressable
                  onPress={() =>
                    setShowConfirmPassword((previous) => !previous)
                  }
                  disabled={loading}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={20}
                    color="#849188"
                  />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.registerButton,
                  pressed && !loading && styles.buttonPressed,
                  loading && styles.disabledButton,
                ]}
                onPress={handleRegister}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.registerButtonText}>
                      Create account
                    </Text>
                    <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                  </>
                )}
              </Pressable>

              <View style={styles.loginRow}>
                <Text style={styles.loginHint}>Already have an account?</Text>
                <Pressable
                  onPress={() => router.replace("/login")}
                  disabled={loading}
                  hitSlop={8}
                >
                  <Text style={styles.loginLink}> Log in</Text>
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
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#F4F8F5",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
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
  backText: {
    color: "#176B45",
    fontSize: 13,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    marginTop: 14,
    marginBottom: 22,
  },
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
  subtitle: {
    color: "#78877D",
    fontSize: 13,
    marginTop: 6,
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
  sectionTitle: {
    color: "#234B36",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 3,
  },
  label: {
    color: "#365341",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 15,
    marginBottom: 7,
  },
  inputContainer: {
    minHeight: 49,
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
  roleContainer: {
    flexDirection: "row",
    gap: 10,
  },
  roleOption: {
    flex: 1,
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: "#E0E8E1",
    borderRadius: 12,
    backgroundColor: "#FAFCFA",
  },
  roleSelected: {
    backgroundColor: "#EAF4EC",
    borderColor: "#5A9A70",
  },
  roleText: {
    color: "#78877D",
    fontSize: 12,
    fontWeight: "600",
  },
  roleTextSelected: {
    color: "#176B45",
    fontWeight: "800",
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "#F1F7F1",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  noticeText: {
    flex: 1,
    color: "#627967",
    fontSize: 11,
    lineHeight: 16,
  },
  registerButton: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#176B45",
    borderRadius: 13,
    marginTop: 23,
    paddingHorizontal: 16,
  },
  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  disabledButton: {
    opacity: 0.65,
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 17,
  },
  loginHint: {
    color: "#849188",
    fontSize: 12,
  },
  loginLink: {
    color: "#176B45",
    fontSize: 12,
    fontWeight: "800",
  },
  footer: {
    color: "#8A9A8F",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    textAlign: "center",
    marginTop: 22,
  },
});
