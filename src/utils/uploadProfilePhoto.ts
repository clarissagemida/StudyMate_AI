import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

const PENDING_PHOTO_PREFIX = "studymate:pending-profile-photo:";

export async function queueProfilePhoto(userId: string, base64: string) {
  await AsyncStorage.setItem(`${PENDING_PHOTO_PREFIX}${userId}`, base64);
}

export async function uploadPendingProfilePhoto(userId: string) {
  const key = `${PENDING_PHOTO_PREFIX}${userId}`;
  const base64 = await AsyncStorage.getItem(key);
  if (!base64) return null;
  const path = await uploadProfilePhotoBase64(userId, base64);
  await AsyncStorage.removeItem(key);
  return path;
}

export async function uploadProfilePhotoBase64(userId: string, base64: string) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.id !== userId) throw new Error("Please sign in to finish saving your profile photo.");
  const filePath = `${user.id}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(filePath, decode(base64), {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
  const { error: profileError } = await supabase.from("profiles").update({ avatar_path: filePath }).eq("id", user.id);
  if (profileError) {
    await supabase.storage.from("profile-photos").remove([filePath]);
    throw new Error(`Photo uploaded, but saving its profile link failed: ${profileError.message}`);
  }
  return filePath;
}

export async function uploadProfilePhoto() {
  // Confirm the user is signed in.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Please sign in before uploading a photo.");
  }

  // Open the phone gallery.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Gallery permission is required to select a photo.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];

  // Prefer the Base64 string from the picker: expo-file-system's web build
  // does not implement readAsStringAsync, so reading the URI directly would
  // throw "cannot be accessed on web".
  const base64 =
    asset.base64 ??
    (await FileSystem.readAsStringAsync(asset.uri, {
      encoding: "base64",
    }));

  if (!base64) {
    throw new Error("The selected photo could not be read. Please try again.");
  }

  // ImagePicker's base64 field is JPEG data even when the source library
  // asset was PNG, HEIC, or another format. Keep the stored extension and
  // Storage content type aligned with those encoded bytes.
  const contentType = asset.base64 ? "image/jpeg" : asset.mimeType ?? "image/jpeg";
  const extension = contentType === "image/png" ? "png"
    : contentType === "image/webp" ? "webp"
      : contentType === "image/heic" ? "heic" : "jpg";

  // Expo's base64 picker data is JPEG; fallback file reads retain source MIME.
  if (contentType !== "image/jpeg") {
    const filePath = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("profile-photos").upload(filePath, decode(base64), { contentType, upsert: false });
    if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
    const { error: profileError } = await supabase.from("profiles").update({ avatar_path: filePath }).eq("id", user.id);
    if (profileError) throw new Error(`Photo uploaded, but profile update failed: ${profileError.message}`);
    return filePath;
  }
  return uploadProfilePhotoBase64(user.id, base64);
}
