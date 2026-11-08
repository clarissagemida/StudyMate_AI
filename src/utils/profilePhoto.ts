import { supabase } from "@/lib/supabase";

const PHOTO_BUCKET = "profile-photos";

function normalizePhotoPath(value: string, ownerId?: string) {
  const path = value.trim();
  if (!path) return "";

  // Older profile rows may contain a bucket-prefixed path or a Supabase
  // object URL instead of the object key stored by current uploads.
  const objectMarker = `/storage/v1/object/`;
  const markerIndex = path.indexOf(objectMarker);
  if (markerIndex >= 0) {
    const objectPath = path.slice(markerIndex + objectMarker.length);
    const bucketPrefix = `${PHOTO_BUCKET}/`;
    const bucketIndex = objectPath.indexOf(bucketPrefix);
    if (bucketIndex >= 0) return decodeURIComponent(objectPath.slice(bucketIndex + bucketPrefix.length).split(/[?#]/)[0]);
  }

  const cleanPath = path.replace(/^\/+/, "").split(/[?#]/)[0];
  const objectPath = cleanPath.startsWith(`${PHOTO_BUCKET}/`) ? cleanPath.slice(PHOTO_BUCKET.length + 1) : cleanPath;
  return ownerId && !objectPath.includes("/") ? `${ownerId}/${objectPath}` : objectPath;
}

export async function getProfilePhotoUrl(savedPath: string | null | undefined, ownerId?: string) {
  if (!savedPath?.trim()) return null;
  const path = normalizePhotoPath(savedPath, ownerId);
  if (!path) return null;

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(`Could not load profile photo (${path}): ${error.message}`);
  if (!data?.signedUrl) throw new Error("Supabase did not return a profile photo URL.");
  const separator = data.signedUrl.includes("?") ? "&" : "?";
  return `${data.signedUrl}${separator}profile_refresh=${Date.now()}`;
}
