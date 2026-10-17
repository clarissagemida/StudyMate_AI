import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

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
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];

  // Read the selected image as Base64.
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: "base64",
  });

  const extension = asset.mimeType === "image/png" ? "png" : "jpg";
  const contentType = extension === "png" ? "image/png" : "image/jpeg";

  // Each upload gets a unique file name.
  const filePath = `${user.id}/${Date.now()}.${extension}`;

  // Upload the actual image to Supabase Storage.
  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(filePath, decode(base64), {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  // Save only the file path in the profiles table.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_path: filePath })
    .eq("id", user.id);

  if (profileError) {
    throw new Error(
      `Photo uploaded, but profile update failed: ${profileError.message}`,
    );
  }

  return filePath;
}
