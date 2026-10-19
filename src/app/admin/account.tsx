import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

type AdminProfile = {
  full_name: string | null;
  role: string | null;
  approval_status: string | null;
  avatar_path: string | null;
};

type SelectedPhoto = {
  uri: string;
  base64: string;
  mimeType: string;
};

const PHOTO_BUCKET = "profile-photos";
const SIGNED_URL_DURATION = 60 * 60;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Convert the Base64 image returned by Expo into bytes for Supabase Storage.
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const outputLength = Math.floor((cleanBase64.length * 3) / 4);
  const bytes = new Uint8Array(outputLength);

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const character of cleanBase64) {
    const value = alphabet.indexOf(character);

    if (value === -1) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      if (index < outputLength) {
        bytes[index++] = (buffer >> bits) & 255;
      }
    }
  }

  return bytes.slice(0, index).buffer;
}

function getImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export default function AdminAccountScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("admin");
  const [approvalStatus, setApprovalStatus] = useState("approved");

  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(
    null,
  );
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);

  const getSignedPhotoUrl = async (
    path: string | null,
  ): Promise<string | null> => {
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_DURATION);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("Supabase did not return a profile photo URL.");
    }

    // Prevent a previously cached image URL from being reused.
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
        .select("full_name, role, approval_status, avatar_path")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (
        !data ||
        data.role !== "admin" ||
        data.approval_status !== "approved"
      ) {
        Alert.alert(
          "Access denied",
          "Only approved administrators can access this profile.",
        );
        router.replace("/login");
        return;
      }

      const profile = data as AdminProfile;

      setFullName(profile.full_name ?? "");
      setRole(profile.role ?? "admin");
      setApprovalStatus(profile.approval_status ?? "unknown");
      setAvatarPath(profile.avatar_path);
      setAvatarUrl(null);
      setAvatarImageFailed(false);
      setSelectedPhoto(null);

      if (profile.avatar_path) {
        try {
          const url = await getSignedPhotoUrl(profile.avatar_path);
          setAvatarUrl(url);
        } catch (photoError) {
          console.error("Profile photo URL error:", photoError);
          setAvatarImageFailed(true);
        }
      }
    } catch (error) {
      console.error("Unable to load admin profile:", error);

      Alert.alert(
        "Profile Error",
        error instanceof Error
          ? error.message
          : "Unable to load your profile. Check your connection and Supabase permissions.",
      );
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

  const choosePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo Permission Required",
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

      if (result.canceled || !result.assets?.[0]) return;

      const photo = result.assets[0];

      if (!photo.base64) {
        Alert.alert(
          "Photo Error",
          "Expo could not read the selected photo. Please select another image.",
        );
        return;
      }

      const mimeType = photo.mimeType?.toLowerCase() ?? "image/jpeg";

      if (!ALLOWED_TYPES.includes(mimeType)) {
        Alert.alert(
          "Unsupported Image",
          "Please select a JPG, PNG, or WebP image.",
        );
        return;
      }

      setSelectedPhoto({
        uri: photo.uri,
        base64: photo.base64,
        mimeType,
      });

      setAvatarImageFailed(false);
      setEditing(true);
    } catch (error) {
      console.error("Photo picker error:", error);

      Alert.alert(
        "Photo Error",
        error instanceof Error
          ? error.message
          : "Unable to open your photo library.",
      );
    }
  };

  const saveProfile = async () => {
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      Alert.alert("Name Required", "Please enter your full name.");
      return;
    }

    setSaving(true);

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

      let updatedAvatarPath = avatarPath;

      if (selectedPhoto) {
        // Read the selected image from Base64 instead of fetch(localUri).
        const fileData = base64ToArrayBuffer(selectedPhoto.base64);

        if (fileData.byteLength === 0) {
          throw new Error(
            "The selected photo is empty. Please choose another image.",
          );
        }

        const extension = getImageExtension(selectedPhoto.mimeType);
        const newPath = `${user.id}/${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(newPath, fileData, {
            contentType: selectedPhoto.mimeType,
            upsert: false,
            cacheControl: "3600",
          });

        if (uploadError) throw uploadError;

        updatedAvatarPath = newPath;
      }

      // Update the profile only after the image upload succeeds.
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedName,
          avatar_path: updatedAvatarPath,
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updatedProfile) {
        throw new Error(
          "No profile row was updated. Check the profiles table and its row-level security policies.",
        );
      }

      // Generate a fresh URL after the upload and database update.
      let newAvatarUrl: string | null = null;

      if (updatedAvatarPath) {
        newAvatarUrl = await getSignedPhotoUrl(updatedAvatarPath);
      }

      setFullName(trimmedName);
      setAvatarPath(updatedAvatarPath);
      setAvatarUrl(newAvatarUrl);
      setAvatarImageFailed(false);
      setSelectedPhoto(null);
      setEditing(false);

      Alert.alert("Profile Updated", "Your profile changes have been saved.");
    } catch (error) {
      console.error("Unable to save admin profile:", error);

      Alert.alert(
        "Save Failed",
        error instanceof Error
          ? error.message
          : "Your profile could not be saved. Check your connection and Supabase permissions.",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setSelectedPhoto(null);
    setEditing(false);
    setLoading(true);
    void loadProfile();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16794A" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </SafeAreaView>
    );
  }

  const displayedPhoto = selectedPhoto?.uri ?? avatarUrl;
  const showPlaceholder = !displayedPhoto || avatarImageFailed;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>ACCOUNT SETTINGS</Text>
              <Text style={styles.pageTitle}>My Profile</Text>
              <Text style={styles.pageSubtitle}>
                Manage your administrator information.
              </Text>
            </View>

            <View style={styles.headerIcon}>
              <Ionicons
                name="person-circle-outline"
                size={29}
                color="#16794A"
              />
            </View>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.avatarWrapper}>
              {showPlaceholder ? (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color="#16794A" />
                </View>
              ) : (
                <Image
                  key={displayedPhoto}
                  source={{ uri: displayedPhoto! }}
                  style={styles.avatar}
                  resizeMode="cover"
                  onError={(event) => {
                    console.error(
                      "Profile image failed to display:",
                      event.nativeEvent.error,
                    );
                    setAvatarImageFailed(true);
                  }}
                />
              )}

              <Pressable
                style={styles.cameraButton}
                onPress={choosePhoto}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Choose profile photo"
              >
                <Ionicons name="camera" size={18} color="#FFFFFF" />
              </Pressable>
            </View>

            <Text style={styles.profileName}>
              {fullName.trim() || "Administrator"}
            </Text>
            <Text style={styles.profileEmail}>{email || "No email found"}</Text>

            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#16794A" />
              <Text style={styles.roleBadgeText}>Administrator</Text>
            </View>

            <Pressable
              style={styles.photoButton}
              onPress={choosePhoto}
              disabled={saving}
            >
              <Ionicons name="image-outline" size={18} color="#16794A" />
              <Text style={styles.photoButtonText}>
                {selectedPhoto || avatarPath
                  ? "Change Profile Photo"
                  : "Add Profile Photo"}
              </Text>
            </Pressable>

            <Text style={styles.photoHint}>
              Choose a clear square photo from your device.
            </Text>

            {avatarImageFailed && !selectedPhoto && (
              <Text style={styles.photoError}>
                The photo could not be displayed. Try selecting it again.
              </Text>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            {!editing && (
              <Pressable
                style={styles.editButton}
                onPress={() => setEditing(true)}
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={17} color="#16794A" />
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Full Name</Text>

            <View style={[styles.inputWrapper, !editing && styles.readOnly]}>
              <Ionicons name="person-outline" size={19} color="#718078" />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#9AA69E"
                editable={editing && !saving}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>

            <Text style={styles.fieldLabel}>Email Address</Text>

            <View style={[styles.inputWrapper, styles.readOnly]}>
              <Ionicons name="mail-outline" size={19} color="#718078" />
              <TextInput
                style={styles.input}
                value={email}
                editable={false}
                selectTextOnFocus={false}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Ionicons name="lock-closed-outline" size={16} color="#9AA69E" />
            </View>

            <Text style={styles.helperText}>
              Your login email is managed by Supabase Authentication and cannot
              be changed on this page.
            </Text>

            <Text style={styles.fieldLabel}>Account Role</Text>

            <View style={[styles.inputWrapper, styles.readOnly]}>
              <Ionicons name="shield-outline" size={19} color="#718078" />
              <TextInput
                style={styles.input}
                value={role.charAt(0).toUpperCase() + role.slice(1)}
                editable={false}
              />
              <Ionicons name="lock-closed-outline" size={16} color="#9AA69E" />
            </View>

            <Text style={styles.fieldLabel}>Account Status</Text>

            <View style={[styles.inputWrapper, styles.readOnly]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={19}
                color="#16794A"
              />
              <TextInput
                style={styles.input}
                value={
                  approvalStatus.charAt(0).toUpperCase() +
                  approvalStatus.slice(1)
                }
                editable={false}
              />
            </View>

            <Text style={styles.helperText}>
              Role and approval status are read-only to protect administrator
              access.
            </Text>
          </View>

          {editing && (
            <View style={styles.buttonRow}>
              <Pressable
                style={styles.cancelButton}
                onPress={cancelEditing}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.saveButton, saving && styles.savingButton]}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={19}
                    color="#FFFFFF"
                  />
                )}
                <Text style={styles.saveButtonText}>
                  {saving ? "Saving..." : "Save Changes"}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.securityNote}>
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color="#16794A"
            />
            <View style={styles.securityTextContainer}>
              <Text style={styles.securityTitle}>Account Security</Text>
              <Text style={styles.securityDescription}>
                Only your profile name and profile photo are editable here. Your
                administrator role and approval status cannot be changed by this
                form.
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.backButton}
            onPress={() => router.replace("/admin/home")}
          >
            <Ionicons name="arrow-back" size={18} color="#16794A" />
            <Text style={styles.backButtonText}>Back to Dashboard</Text>
          </Pressable>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F4F8F5",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 13,
    fontSize: 14,
    color: "#718078",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 23,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    color: "#16794A",
    marginBottom: 7,
  },
  pageTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: "#183B29",
  },
  pageSubtitle: {
    marginTop: 5,
    fontSize: 13,
    color: "#718078",
  },
  headerIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    backgroundColor: "#E5F4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E0ECE3",
    padding: 22,
    marginBottom: 25,
  },
  avatarWrapper: {
    position: "relative",
    marginBottom: 14,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: "#D8EBDD",
    backgroundColor: "#E5F4E9",
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: "#D8EBDD",
    backgroundColor: "#E5F4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraButton: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: "#16794A",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#203C2B",
    textAlign: "center",
  },
  profileEmail: {
    marginTop: 5,
    fontSize: 13,
    color: "#718078",
    textAlign: "center",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E5F4E9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16794A",
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#BBDCC5",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 15,
    marginTop: 18,
  },
  photoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16794A",
  },
  photoHint: {
    marginTop: 9,
    fontSize: 11,
    color: "#8A968E",
    textAlign: "center",
  },
  photoError: {
    marginTop: 10,
    fontSize: 12,
    color: "#B42318",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#203C2B",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#E5F4E9",
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#16794A",
  },
  formCard: {
    padding: 17,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0ECE3",
  },
  fieldLabel: {
    marginTop: 13,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#42584A",
  },
  inputWrapper: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE8DF",
    backgroundColor: "#FFFFFF",
  },
  readOnly: {
    backgroundColor: "#F2F5F2",
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 9,
    fontSize: 13,
    color: "#203C2B",
  },
  helperText: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 17,
    color: "#87948B",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 11,
    marginTop: 17,
  },
  cancelButton: {
    minHeight: 49,
    flex: 0.8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C8D8CD",
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#52685A",
  },
  saveButton: {
    minHeight: 49,
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: "#16794A",
    paddingHorizontal: 12,
  },
  savingButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    marginTop: 22,
    borderRadius: 15,
    backgroundColor: "#E8F3EB",
  },
  securityTextContainer: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#244B32",
  },
  securityDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#58715F",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    marginTop: 12,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16794A",
  },
});
