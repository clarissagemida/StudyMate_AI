import { supabase } from "@/lib/supabase";
import { setAppLocked } from "@/utils/appLock";
import { deleteAccount } from "@/utils/deleteAccount";
import { confirmAction, showNotice } from "@/utils/notify";
import { uploadProfilePhoto } from "@/utils/uploadProfilePhoto";
import { StatusPill } from "@/components/ui/chip";
import { StateView } from "@/components/ui/state-view";
import { colors } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const BG = colors.background;
const PHOTO_BUCKET = "profile-photos";

type StudentProfile = {
  full_name: string | null;
  student_id: string | null;
  approval_status: string | null;
  avatar_path: string | null;
};

type WorkingState = "photo" | "signingOut" | "deleting" | null;

export default function StudentProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [working, setWorking] = useState<WorkingState>(null);

  // Re-authentication modal for account deletion.
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  const isWorking = working !== null;

  const resolveAvatarUrl = async (path: string | null) => {
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("Supabase did not return a profile photo URL.");
    }

    const separator = data.signedUrl.includes("?") ? "&" : "?";
    return `${data.signedUrl}${separator}profile_refresh=${Date.now()}`;
  };

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, student_id, approval_status, avatar_path")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      const row = (data ?? {
        full_name: null,
        student_id: null,
        approval_status: null,
        avatar_path: null,
      }) as StudentProfile;

      setProfile(row);
      setAvatarFailed(false);
      setLoadError(null);

      try {
        setAvatarUrl(await resolveAvatarUrl(row.avatar_path));
      } catch (photoError) {
        console.error("Profile photo URL error:", photoError);
        setAvatarUrl(null);
        setAvatarFailed(true);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Student profile error:", err);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Loader lives inside the effect so no state is applied synchronously
  // while the effect itself runs.
  useEffect(() => {
    const run = async () => {
      await loadProfile();
    };

    void run();
  }, [loadProfile]);

  const handleChangePhoto = async () => {
    if (isWorking) return;

    setWorking("photo");

    try {
      const newPath = await uploadProfilePhoto();

      if (newPath) {
        setProfile((current) =>
          current ? { ...current, avatar_path: newPath } : current,
        );
        setAvatarUrl(await resolveAvatarUrl(newPath));
        setAvatarFailed(false);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Profile photo upload error:", err);
      showNotice("Photo Upload Failed", message);
    } finally {
      setWorking(null);
    }
  };

  const handleLockApp = () => {
    if (isWorking) return;

    confirmAction(
      "Lock StudyMate AI",
      "Return to the login screen? Your saved session will be preserved.",
      () => {
        // Central lock: every protected layout re-checks it, so a deep
        // link cannot open a student screen before a fresh unlock.
        setAppLocked(true);
        router.replace("/login");
      },
      { confirmLabel: "Lock App" },
    );
  };

  const handleLogout = () => {
    if (isWorking) return;

    confirmAction(
      "Log Out",
      "Are you sure you want to log out of StudyMate AI?",
      async () => {
        setWorking("signingOut");

        try {
          const { error } = await supabase.auth.signOut();

          if (error) throw error;

          setAppLocked(false);
          router.replace("/login");
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Please try again.";
          showNotice("Logout Failed", message);
        } finally {
          setWorking(null);
        }
      },
      { confirmLabel: "Log Out", destructive: true },
    );
  };

  // Step 1: explain the consequences and confirm before asking for a password.
  const handleDeleteAccount = () => {
    if (isWorking) return;

    confirmAction(
      "Delete My Account",
      "This permanently deletes your StudyMate AI account and login.\n\n" +
        "Your email and student ID will be free to register again, but your " +
        "profile, photo, and personal quiz history will be removed.\n\n" +
        "This cannot be undone.",
      () => {
        setDeletePassword("");
        setDeleteError(null);
        setShowDeletePassword(false);
        setDeleteModalVisible(true);
      },
      { confirmLabel: "Continue", destructive: true },
    );
  };

  // Step 2: verify the password, delete on the server, then end the session.
  const confirmDeleteAccount = async () => {
    if (isWorking) return;

    const password = deletePassword;
    const accountEmail = email.trim();

    if (!password) {
      setDeleteError("Enter your password to confirm.");
      return;
    }

    if (!accountEmail) {
      setDeleteError("Your account email could not be verified.");
      return;
    }

    setWorking("deleting");
    setDeleteError(null);

    try {
      // Re-authenticate: proves the person deleting owns the account.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password,
      });

      if (verifyError) {
        setDeleteError("Incorrect password. Please try again.");
        setWorking(null);
        return;
      }

      const result = await deleteAccount();

      if (!result.ok && !result.partial) {
        // The backend did not delete anything; stay signed in and report it.
        setDeleteError(result.message);
        setWorking(null);
        return;
      }

      // Success (or the login was removed but cleanup was partial): the
      // session is no longer usable, so end it and return to login.
      setDeleteModalVisible(false);
      setDeletePassword("");

      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error("Sign out after deletion failed:", signOutError);
      }

      setAppLocked(false);
      router.replace("/login");

      showNotice(
        result.partial ? "Account Deleted (Needs Cleanup)" : "Account Deleted",
        result.message,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Please try again.";
      setDeleteError(message);
    } finally {
      setWorking(null);
    }
  };

  const cancelDeleteAccount = () => {
    if (isWorking) return;

    setDeleteModalVisible(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  if (loading) {
    return <StateView variant="loading" title="Loading your profile..." />;
  }

  if (loadError) {
    return (
      <StateView
        variant="error"
        title="Unable to load profile"
        message={loadError}
        onRetry={() => {
          setLoading(true);
          setLoadError(null);
          void loadProfile();
        }}
      />
    );
  }

  const fullName = profile?.full_name?.trim() || "Student";
  const approvalStatus = profile?.approval_status ?? "unknown";
  const showAvatar = avatarUrl && !avatarFailed;
  const uploadingPhoto = working === "photo";
  const signingOut = working === "signingOut";
  const deleting = working === "deleting";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Profile</Text>

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.avatarWrapper}>
            {showAvatar ? (
              <Image
                key={avatarUrl}
                source={{ uri: avatarUrl! }}
                style={styles.avatar}
                resizeMode="cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={44} color={GREEN} />
              </View>
            )}

            <View
              style={[
                styles.approvalDot,
                approvalStatus === "approved"
                  ? styles.approvalDotApproved
                  : styles.approvalDotPending,
              ]}
            />
          </View>

          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.email}>{email || "No email found"}</Text>

          <View style={styles.badgeRow}>
            <StatusPill icon="school-outline" label="Student" tone="brand" />

            <StatusPill
              icon={
                approvalStatus === "approved"
                  ? "checkmark-circle-outline"
                  : "time-outline"
              }
              label={
                approvalStatus === "approved" ? "Approved" : "Pending approval"
              }
              tone={approvalStatus === "approved" ? "success" : "warning"}
            />
          </View>

          <Pressable
            onPress={() => void handleChangePhoto()}
            disabled={isWorking}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={({ pressed }) => [
              styles.photoButton,
              pressed && styles.pressed,
              isWorking && styles.disabled,
            ]}
          >
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color={GREEN} />
            ) : (
              <Ionicons name="camera-outline" size={17} color={GREEN} />
            )}

            <Text style={styles.photoButtonText}>
              {uploadingPhoto
                ? "Uploading..."
                : profile?.avatar_path
                  ? "Change Profile Photo"
                  : "Add Profile Photo"}
            </Text>
          </Pressable>
        </View>

        {/* Account details */}
        <Text style={styles.sectionTitle}>Account Details</Text>

        <View style={styles.formCard}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <Text style={styles.fieldValue}>{fullName}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <Text style={styles.fieldValue}>{email || "—"}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Student ID</Text>
            <Text style={styles.fieldValue}>
              {profile?.student_id?.trim() || "—"}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Role</Text>
            <Text style={styles.fieldValue}>Student</Text>
          </View>
        </View>

        <Text style={styles.helperText}>
          Role and approval status are managed by administrators and cannot be
          changed from this screen.
        </Text>

        {/* Actions */}
        <Text style={styles.sectionTitle}>Security</Text>

        <Pressable
          onPress={handleLockApp}
          disabled={isWorking}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.pressed,
            isWorking && styles.disabled,
          ]}
        >
          <Ionicons name="lock-closed-outline" size={20} color={GREEN} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Lock App</Text>
            <Text style={styles.actionSubtitle}>
              Return to the login screen; your session stays saved.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color="#9AA69D" />
        </Pressable>

        <Pressable
          onPress={handleLogout}
          disabled={isWorking}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.actionButton,
            styles.logoutButton,
            pressed && styles.pressed,
            isWorking && styles.disabled,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color="#C53030" />
          ) : (
            <Ionicons name="log-out-outline" size={20} color="#C53030" />
          )}

          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, styles.logoutTitle]}>
              {signingOut ? "Logging out..." : "Log Out"}
            </Text>
            <Text style={styles.actionSubtitle}>
              Sign out of StudyMate AI on this device.
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={handleDeleteAccount}
          disabled={isWorking}
          accessibilityRole="button"
          accessibilityLabel="Delete my account permanently"
          style={({ pressed }) => [
            styles.actionButton,
            styles.deleteButton,
            pressed && styles.pressed,
            isWorking && styles.disabled,
          ]}
        >
          <Ionicons name="trash-outline" size={20} color="#C53030" />

          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, styles.logoutTitle]}>
              Delete My Account
            </Text>
            <Text style={styles.actionSubtitle}>
              Permanently remove your account, login, and personal data.
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Re-authentication before the irreversible delete */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelDeleteAccount}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning-outline" size={26} color="#C53030" />
            </View>

            <Text style={styles.modalTitle}>Confirm Account Deletion</Text>
            <Text style={styles.modalMessage}>
              Enter your password to permanently delete your account. This
              cannot be undone.
            </Text>

            <View
              style={[
                styles.modalInput,
                deleteError ? styles.modalInputInvalid : null,
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color="#849188" />
              <TextInput
                style={styles.modalInputField}
                placeholder="Your password"
                placeholderTextColor="#9BA69F"
                value={deletePassword}
                onChangeText={(text) => {
                  setDeletePassword(text);
                  if (deleteError) setDeleteError(null);
                }}
                secureTextEntry={!showDeletePassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!deleting}
                returnKeyType="done"
                onSubmitEditing={confirmDeleteAccount}
              />
              <Pressable
                onPress={() => setShowDeletePassword((value) => !value)}
                disabled={deleting}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  showDeletePassword ? "Hide password" : "Show password"
                }
              >
                <Ionicons
                  name={showDeletePassword ? "eye-off-outline" : "eye-outline"}
                  size={19}
                  color="#849188"
                />
              </Pressable>
            </View>

            {deleteError && (
              <Text style={styles.modalErrorText}>{deleteError}</Text>
            )}

            <View style={styles.modalButtonRow}>
              <Pressable
                onPress={cancelDeleteAccount}
                disabled={deleting}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalCancelButton,
                  pressed && styles.pressed,
                  deleting && styles.disabled,
                ]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void confirmDeleteAccount()}
                disabled={deleting}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalDeleteButton,
                  pressed && styles.pressed,
                  deleting && styles.disabled,
                ]}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete Forever</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 4 },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#123D2A",
    marginBottom: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 22,
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },
  avatarWrapper: { position: "relative", marginBottom: 8 },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: "#D8EBDD",
    backgroundColor: "#E5F4E9",
  },
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: "#D8EBDD",
    backgroundColor: "#E5F4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  approvalDot: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  approvalDotApproved: { backgroundColor: "#20A05A" },
  approvalDotPending: { backgroundColor: "#E0A418" },
  name: { fontSize: 20, fontWeight: "800", color: "#20392B" },
  email: { fontSize: 13, color: "#718078" },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D8E4DB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    alignSelf: "stretch",
    backgroundColor: "#F7FBF8",
  },
  photoButtonText: { fontSize: 13, fontWeight: "700", color: GREEN },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#20392B",
    marginBottom: 10,
    marginTop: 6,
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  field: { paddingVertical: 13, gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#87948B" },
  fieldValue: { fontSize: 14, color: "#20392B" },
  divider: { height: 1, backgroundColor: "#EDF2EE" },
  helperText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#87948B",
    marginTop: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EDE7",
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 14, fontWeight: "800", color: "#20392B" },
  logoutTitle: { color: "#C53030" },
  actionSubtitle: { fontSize: 11, lineHeight: 16, color: "#758479" },
  logoutButton: { backgroundColor: "#FDF6F6", borderColor: "#F3D4D4" },
  deleteButton: { backgroundColor: "#FDF6F6", borderColor: "#E9BEBE" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 32, 24, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    alignItems: "center",
  },
  modalIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#FBE9E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#20392B",
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 12,
    lineHeight: 18,
    color: "#758479",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  modalInput: {
    width: "100%",
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E0E8E1",
    backgroundColor: "#FAFCFA",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  modalInputInvalid: { borderColor: "#D64545" },
  modalInputField: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "#20392B",
    paddingVertical: 12,
  },
  modalErrorText: {
    width: "100%",
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
    color: "#C53030",
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8CD",
    backgroundColor: "#FFFFFF",
  },
  modalCancelText: { fontSize: 13, fontWeight: "700", color: "#52685A" },
  modalDeleteButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#C53030",
  },
  modalDeleteText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
});
