import { supabase } from "@/lib/supabase";
import { setAppLocked } from "@/utils/appLock";
import { confirmAction, showNotice } from "@/utils/notify";
import { uploadProfilePhoto } from "@/utils/uploadProfilePhoto";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const BG = "#F4F8F5";
const PHOTO_BUCKET = "profile-photos";

type StudentProfile = {
  full_name: string | null;
  student_id: string | null;
  approval_status: string | null;
  avatar_path: string | null;
};

type WorkingState = "photo" | "signingOut" | null;

export default function StudentProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [working, setWorking] = useState<WorkingState>(null);

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

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.centerText}>Loading your profile...</Text>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <View style={[styles.bigIcon, styles.errorIcon]}>
          <Ionicons name="cloud-offline-outline" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.centerTitle}>Unable to load profile</Text>
        <Text style={styles.centerText}>{loadError}</Text>

        <Pressable
          onPress={() => {
            setLoading(true);
            setLoadError(null);
            void loadProfile();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const fullName = profile?.full_name?.trim() || "Student";
  const approvalStatus = profile?.approval_status ?? "unknown";
  const showAvatar = avatarUrl && !avatarFailed;
  const uploadingPhoto = working === "photo";
  const signingOut = working === "signingOut";

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
            <View style={styles.badge}>
              <Ionicons name="school-outline" size={13} color={GREEN} />
              <Text style={styles.badgeText}>Student</Text>
            </View>

            <View
              style={[
                styles.badge,
                approvalStatus === "approved"
                  ? styles.badgeApproved
                  : styles.badgePending,
              ]}
            >
              <Ionicons
                name={
                  approvalStatus === "approved"
                    ? "checkmark-circle-outline"
                    : "time-outline"
                }
                size={13}
                color={approvalStatus === "approved" ? "#16834A" : "#B7791F"}
              />
              <Text
                style={[
                  styles.badgeText,
                  approvalStatus === "approved"
                    ? styles.badgeTextApproved
                    : styles.badgeTextPending,
                ]}
              >
                {approvalStatus === "approved" ? "Approved" : "Pending approval"}
              </Text>
            </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  center: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#20392B",
    textAlign: "center",
  },
  centerText: {
    fontSize: 13,
    color: "#65776B",
    textAlign: "center",
    lineHeight: 19,
  },
  bigIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  errorIcon: { backgroundColor: "#B33A3A" },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingHorizontal: 22,
    minHeight: 48,
    justifyContent: "center",
    marginTop: 6,
  },
  retryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F3EB",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  badgeApproved: { backgroundColor: "#E4F6E9" },
  badgePending: { backgroundColor: "#FFF5D9" },
  badgeText: { fontSize: 12, fontWeight: "700", color: GREEN },
  badgeTextApproved: { color: "#16834A" },
  badgeTextPending: { color: "#B7791F" },
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
});
