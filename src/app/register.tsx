import { supabase } from "@/lib/supabase";
import { confirmAction, showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

type UserRole = "student" | "teacher";

const GREEN = "#176B45";
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("student");

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMimeType, setAvatarMimeType] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordChecks = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "One uppercase letter (A–Z)", valid: /[A-Z]/.test(password) },
    { label: "One lowercase letter (a–z)", valid: /[a-z]/.test(password) },
    { label: "One number (0–9)", valid: /[0-9]/.test(password) },
    {
      label: "One special character (!@#$...)",
      valid: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const passwordScore = passwordChecks.filter((item) => item.valid).length;

  const passwordStrength =
    password.length === 0
      ? ""
      : passwordScore <= 2
        ? "Weak"
        : passwordScore <= 4
          ? "Fair"
          : "Strong";

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  const strengthColor =
    passwordStrength === "Strong"
      ? GREEN
      : passwordStrength === "Fair"
        ? "#B7791F"
        : "#D64545";

  const pickProfilePhoto = async () => {
    if (loading) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showNotice(
          "Photo Permission Needed",
          "Allow StudyMate AI to access your photo library to choose a profile picture.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const photo = result.assets[0];

      if (photo.fileSize && photo.fileSize > MAX_PHOTO_SIZE) {
        showNotice(
          "Photo Is Too Large",
          "Please choose an image that is 5 MB or smaller.",
        );
        return;
      }

      if (!photo.base64) {
        showNotice(
          "Photo Error",
          "Expo could not read the selected photo. Please select another image.",
        );
        return;
      }

      setAvatarUri(photo.uri);
      setAvatarMimeType(photo.mimeType ?? "image/jpeg");
      setAvatarBase64(photo.base64);
    } catch (error) {
      console.error("Photo selection failed:", error);
      showNotice(
        "Unable to Select Photo",
        "Please try choosing your photo again.",
      );
    }
  };

  const removeProfilePhoto = () => {
    setAvatarUri(null);
    setAvatarMimeType(null);
    setAvatarBase64(null);
  };

  /**
   * Upload the selected profile photo if Supabase returned a session.
   * If no session is available yet, registration can still continue.
   */
  const uploadProfilePhoto = async (userId: string): Promise<boolean> => {
    if (!avatarBase64) return false;

    try {
      const extension =
        avatarMimeType === "image/png"
          ? "png"
          : avatarMimeType === "image/webp"
            ? "webp"
            : avatarMimeType === "image/heic"
              ? "heic"
              : "jpg";

      const photoPath = `${userId}/profile-${Date.now()}.${extension}`;
      const fileBuffer = decode(avatarBase64);

      if (fileBuffer.byteLength === 0) {
        throw new Error("The selected photo is empty.");
      }

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(photoPath, fileBuffer, {
          contentType: avatarMimeType ?? "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_path: photoPath })
        .eq("id", userId);

      if (profileError) {
        const { error: cleanupError } = await supabase.storage
          .from("profile-photos")
          .remove([photoPath]);

        if (cleanupError) {
          console.error("Photo cleanup failed:", cleanupError.message);
        }

        throw profileError;
      }

      return true;
    } catch (error) {
      console.error("Profile photo upload failed:", error);
      return false;
    }
  };

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
      showNotice(
        "Missing Information",
        "Please complete all required fields.",
      );
      return;
    }

    if (cleanName.length < 2) {
      showNotice("Invalid Name", "Please enter your full name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      showNotice("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!passwordChecks.every((check) => check.valid)) {
      showNotice(
        "Password Requirements Not Met",
        "Use at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.",
      );
      return;
    }

    if (password !== confirmPassword) {
      showNotice(
        "Passwords Do Not Match",
        "Please make sure both passwords are the same.",
      );
      return;
    }

    setLoading(true);

    try {
      // 1. Create the account in Supabase Auth.
      // The database trigger should create the matching profiles row.
      const { data, error } = await supabase.auth.signUp({
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
        const errorCode =
          (error as { code?: string }).code?.toLowerCase() ?? "";

        console.error("Supabase registration error:", {
          message: error.message,
          code: errorCode || "No error code provided",
          status: error.status,
        });

        if (
          errorCode === "user_already_exists" ||
          message.includes("user already registered") ||
          message.includes("email already registered") ||
          message.includes("already registered") ||
          message.includes("email address is already") ||
          message.includes("already exists")
        ) {
          confirmAction(
            "Email Already Registered",
            "This email may already have an account. Try logging in or use another email address.",
            () => router.replace("/login"),
            { confirmLabel: "Go to Login" },
          );
        } else if (
          message.includes("duplicate key") ||
          message.includes("unique constraint") ||
          errorCode === "23505"
        ) {
          showNotice(
            "Information Already Exists",
            "Your Student / School ID or another unique field may already be registered. Check your details and your profiles table.",
          );
        } else if (
          message.includes("over_email_send_rate_limit") ||
          message.includes("rate limit")
        ) {
          showNotice(
            "Too Many Attempts",
            "Supabase has limited registration attempts. Wait before trying again.",
          );
        } else if (
          message.includes("email_address_invalid") ||
          message.includes("validation_failed") ||
          message.includes("invalid format") ||
          message.includes("invalid email")
        ) {
          showNotice("Invalid Email", "Please check your email address.");
        } else if (
          message.includes("weak_password") ||
          message.includes("password should") ||
          message.includes("password is too")
        ) {
          showNotice(
            "Password Rejected",
            "Supabase rejected the password. Check your project's password policy.",
          );
        } else if (
          message.includes("database error saving new user") ||
          message.includes("error creating user")
        ) {
          showNotice(
            "Database Registration Error",
            "Supabase could not finish creating your account. Check the profiles table, database trigger, and required columns.",
          );
        } else if (
          message.includes("network request failed") ||
          message.includes("failed to fetch") ||
          message.includes("network")
        ) {
          showNotice(
            "Connection Problem",
            "Unable to connect to Supabase. Check your internet connection and Supabase configuration.",
          );
        } else {
          showNotice(
            "Registration Failed",
            `${error.message}\n\nError code: ${errorCode || "Not provided"}`,
          );
        }

        return;
      }

      if (!data.user) {
        showNotice(
          "Registration Incomplete",
          "Supabase did not return a user account. Please try again.",
        );
        return;
      }

      const userId = data.user.id;
      let photoUploaded = false;

      // 2. Upload the photo if Supabase returned a session.
      // When there is no session, skip the upload instead of failing signup.
      if (data.session && avatarBase64) {
        photoUploaded = await uploadProfilePhoto(userId);
      }

      // 3. Ask the custom Edge Function to send a six-digit code using Resend.
      // Do not use supabase.auth.resend() for this custom verification flow.
      const { error: sendCodeError } = await supabase.functions.invoke(
        "send-verification-code",
        {
          body: {
            userId,
            email: cleanEmail,
          },
        },
      );

      // 4. Clear any temporary signup session so the user must go through
      // the normal login flow after verification and approval.
      if (data.session) {
        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
          console.error(
            "Could not clear registration session:",
            signOutError.message,
          );
        }
      }

      // 5. Navigate to the custom verification screen.
      // Include userId because the verification Edge Function needs it.
      const goToVerification = () => {
        router.replace({
          pathname: "/verify-email",
          params: {
            email: cleanEmail,
            userId,
          },
        });
      };

      if (sendCodeError) {
        console.error("Sending verification code failed:", {
          message: sendCodeError.message,
          details: sendCodeError,
        });

        confirmAction(
          "Account Created — Email Not Sent",
          "Your account was created, but StudyMate AI could not send the verification code yet. Continue to the verification screen and try sending the code again.",
          goToVerification,
          { confirmLabel: "Continue", cancelLabel: "Stay" },
        );

        return;
      }

      let successMessage =
        `A six-digit verification code has been sent to ${cleanEmail}. ` +
        "Verify your email before logging in. Administrator approval may also be required.";

      if (avatarBase64 && photoUploaded) {
        successMessage += "\n\nYour profile photo was saved.";
      } else if (avatarBase64 && !photoUploaded) {
        successMessage +=
          "\n\nYour photo could not be saved during registration. You can try adding it after signing in.";
      } else if (avatarBase64 && !data.session) {
        successMessage += "\n\nYour photo can be added after you sign in.";
      }

      confirmAction(
        "Registration Successful",
        successMessage,
        goToVerification,
        { confirmLabel: "Verify Email", cancelLabel: "Later" },
      );
    } catch (error: unknown) {
      console.error("Unexpected registration error:", error);

      showNotice(
        "Something Went Wrong",
        error instanceof Error
          ? error.message
          : "Please check your internet connection and try again.",
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
            <Pressable
              style={styles.backButton}
              onPress={() => router.replace("/login")}
              disabled={loading}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={19} color={GREEN} />
              <Text style={styles.backText}>Back to login</Text>
            </Pressable>

            <View style={styles.header}>
              <View style={styles.logoCircle}>
                <Ionicons name="school-outline" size={30} color={GREEN} />
              </View>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>
                Your learning journey starts here.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Personal details</Text>

              <View style={styles.photoSection}>
                <Pressable
                  style={styles.photoPicker}
                  onPress={pickProfilePhoto}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Choose profile photo"
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.profilePhoto}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons
                        name="person-outline"
                        size={38}
                        color="#7A9181"
                      />
                    </View>
                  )}

                  <View style={styles.photoEditBadge}>
                    <Ionicons name="camera" size={15} color="#FFFFFF" />
                  </View>
                </Pressable>

                <Text style={styles.photoTitle}>Profile photo</Text>
                <Text style={styles.photoHint}>
                  Optional · Square image · Maximum 5 MB
                </Text>

                <Pressable
                  onPress={pickProfilePhoto}
                  disabled={loading}
                  style={styles.choosePhotoButton}
                >
                  <Ionicons name="image-outline" size={16} color={GREEN} />
                  <Text style={styles.choosePhotoText}>
                    {avatarUri ? "Change photo" : "Choose photo"}
                  </Text>
                </Pressable>

                {avatarUri && (
                  <Pressable
                    onPress={removeProfilePhoto}
                    disabled={loading}
                    style={styles.removePhotoButton}
                  >
                    <Text style={styles.removePhotoText}>Remove photo</Text>
                  </Pressable>
                )}
              </View>

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
                    color={requestedRole === "student" ? GREEN : "#849188"}
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
                    <Ionicons name="checkmark-circle" size={17} color={GREEN} />
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
                    color={requestedRole === "teacher" ? GREEN : "#849188"}
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
                    <Ionicons name="checkmark-circle" size={17} color={GREEN} />
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
                  Email verification and administrator approval may be required.
                  Choosing Teacher does not automatically grant teacher
                  permissions.
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
                  placeholder="Create a strong password"
                  placeholderTextColor="#9BA69F"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
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

              {password.length > 0 && (
                <View style={styles.passwordStrengthContainer}>
                  <View style={styles.passwordStrengthHeader}>
                    <Text style={styles.passwordStrengthTitle}>
                      Password strength
                    </Text>
                    <Text
                      style={[
                        styles.passwordStrengthValue,
                        { color: strengthColor },
                      ]}
                    >
                      {passwordStrength}
                    </Text>
                  </View>

                  <View style={styles.strengthBars}>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <View
                        key={level}
                        style={[
                          styles.strengthBar,
                          passwordScore >= level && {
                            backgroundColor: strengthColor,
                          },
                        ]}
                      />
                    ))}
                  </View>

                  <View style={styles.passwordChecklist}>
                    {passwordChecks.map((check) => (
                      <View key={check.label} style={styles.passwordCheckRow}>
                        <Ionicons
                          name={
                            check.valid ? "checkmark-circle" : "ellipse-outline"
                          }
                          size={16}
                          color={check.valid ? GREEN : "#9BA69F"}
                        />
                        <Text
                          style={[
                            styles.passwordCheckText,
                            check.valid && styles.passwordCheckValid,
                          ]}
                        >
                          {check.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Text style={styles.label}>Confirm password</Text>
              <View
                style={[
                  styles.inputContainer,
                  confirmPassword.length > 0 &&
                    (passwordsMatch ? styles.inputValid : styles.inputInvalid),
                ]}
              >
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
                  textContentType="newPassword"
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

              {confirmPassword.length > 0 && (
                <Text
                  style={[
                    styles.matchText,
                    { color: passwordsMatch ? GREEN : "#D64545" },
                  ]}
                >
                  {passwordsMatch
                    ? "Passwords match"
                    : "Passwords do not match"}
                </Text>
              )}

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
                  <>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.registerButtonText}>
                      Creating account...
                    </Text>
                  </>
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
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#F4F8F5",
  },
  scrollContent: { flexGrow: 1 },
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
    color: GREEN,
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
  photoSection: {
    alignItems: "center",
    paddingVertical: 18,
    marginTop: 8,
    marginBottom: 2,
    backgroundColor: "#F8FBF8",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5ECE6",
    borderStyle: "dashed",
  },
  photoPicker: {
    width: 104,
    height: 104,
    borderRadius: 52,
    marginBottom: 12,
    position: "relative",
  },
  photoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#E6F0E8",
    borderWidth: 2,
    borderColor: "#D4E5D8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profilePhoto: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: "#D4E5D8",
  },
  photoEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 1,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  photoTitle: {
    color: "#234B36",
    fontSize: 14,
    fontWeight: "800",
  },
  photoHint: {
    color: "#849188",
    fontSize: 11,
    marginTop: 5,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  choosePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EAF4EC",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 12,
  },
  choosePhotoText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "800",
  },
  removePhotoButton: {
    marginTop: 9,
    padding: 4,
  },
  removePhotoText: {
    color: "#C34444",
    fontSize: 11,
    fontWeight: "700",
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
  inputValid: { borderColor: "#5A9A70" },
  inputInvalid: { borderColor: "#D64545" },
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
    color: GREEN,
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
  passwordStrengthContainer: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F7FAF7",
    borderWidth: 1,
    borderColor: "#E5ECE6",
  },
  passwordStrengthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  passwordStrengthTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#52675A",
  },
  passwordStrengthValue: {
    fontSize: 11,
    fontWeight: "800",
  },
  strengthBars: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 12,
  },
  strengthBar: {
    flex: 1,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#E1E8E2",
  },
  passwordChecklist: { gap: 7 },
  passwordCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  passwordCheckText: {
    fontSize: 11,
    color: "#849188",
  },
  passwordCheckValid: {
    color: GREEN,
    fontWeight: "600",
  },
  matchText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  registerButton: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: GREEN,
    borderRadius: 13,
    marginTop: 23,
    paddingHorizontal: 16,
  },
  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  buttonPressed: { opacity: 0.85 },
  disabledButton: { opacity: 0.65 },
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
    color: GREEN,
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
