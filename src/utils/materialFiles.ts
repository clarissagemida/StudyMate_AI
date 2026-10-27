import { supabase } from "@/lib/supabase";
import { invokeAi } from "@/utils/aiClient";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

export const MATERIAL_BUCKET = "materials";
export const MAX_MATERIAL_FILE_BYTES = 50 * 1024 * 1024;
export const MATERIAL_FILE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export type MaterialExtractionStatus =
  | "none"
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export type UploadedMaterialFile = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

export type MaterialExtractionResult =
  | { ok: true; contentLength: number }
  | { ok: false; message: string };

function extensionOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";
}

function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);

  return cleaned || "material";
}

export function normalizeMaterialMime(
  name: string,
  mimeType?: string | null,
): string {
  const extensionMime = EXTENSION_MIME[extensionOf(name)];

  if (!extensionMime) return "";

  const normalized = (mimeType ?? "").trim().toLowerCase();

  if (!normalized || normalized === "application/octet-stream") {
    return extensionMime;
  }

  return (MATERIAL_FILE_MIME_TYPES as readonly string[]).includes(normalized)
    ? normalized
    : "";
}

export function validatePickedMaterialFile(
  asset: DocumentPicker.DocumentPickerAsset,
):
  | { ok: true; mimeType: string }
  | { ok: false; message: string } {
  const mimeType = normalizeMaterialMime(asset.name, asset.mimeType);
  const size = asset.size ?? asset.file?.size;

  if (!mimeType) {
    return { ok: false, message: "Choose a PDF, DOCX, or PPTX file." };
  }

  if (typeof size === "number") {
    if (size <= 0) {
      return { ok: false, message: "The selected file is empty." };
    }

    if (size > MAX_MATERIAL_FILE_BYTES) {
      return { ok: false, message: "Files must be 50 MB or smaller." };
    }
  }

  return { ok: true, mimeType };
}

export async function pickMaterialFile(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...MATERIAL_FILE_MIME_TYPES],
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  return result.assets[0];
}

export async function readMaterialFileBytes(
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<ArrayBuffer> {
  if (asset.file) {
    return asset.file.arrayBuffer();
  }

  if (asset.base64) {
    return decode(asset.base64);
  }

  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);

    if (!response.ok) {
      throw new Error("The selected file could not be read.");
    }

    return response.arrayBuffer();
  }

  try {
    const response = await expoFetch(asset.uri);

    if (response.ok) {
      return response.arrayBuffer();
    }
  } catch {
    // Expo's File API applies stricter permission checks than the native file reader.
  }

  return new ExpoFile(asset.uri).arrayBuffer();
}

export async function uploadMaterialFile(
  asset: DocumentPicker.DocumentPickerAsset,
  teacherId: string,
): Promise<UploadedMaterialFile> {
  const validation = validatePickedMaterialFile(asset);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const bytes = await readMaterialFileBytes(asset);

  if (bytes.byteLength <= 0) {
    throw new Error("The selected file is empty.");
  }

  if (bytes.byteLength > MAX_MATERIAL_FILE_BYTES) {
    throw new Error("Files must be 50 MB or smaller.");
  }

  const mimeType = normalizeMaterialMime(asset.name, asset.mimeType);

  if (!mimeType) {
    throw new Error("Choose a PDF, DOCX, or PPTX file.");
  }

  const fileName = safeFileName(asset.name);
  const path = `${teacherId}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from(MATERIAL_BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }

  return {
    path,
    name: asset.name.trim() || fileName,
    mimeType,
    size: bytes.byteLength,
  };
}

export async function removeMaterialFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MATERIAL_BUCKET).remove([path]);

  if (error) {
    console.warn("Material file cleanup failed:", error.message);
  }
}

export async function removeMaterialFileQuietly(
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  await removeMaterialFile(path);
}

export async function requestMaterialExtraction(
  materialId: string,
): Promise<MaterialExtractionResult> {
  type ExtractResponse = {
    contentLength?: number;
    message?: string;
  };

  const result = await invokeAi<ExtractResponse>(
    "materials-extract",
    { materialId },
    { timeoutMs: 180000 },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return {
    ok: true,
    contentLength:
      typeof result.data.contentLength === "number"
        ? result.data.contentLength
        : 0,
  };
}

export async function createMaterialFileUrl(
  filePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(MATERIAL_BUCKET)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "A secure link for this file could not be created.",
    );
  }

  return data.signedUrl;
}

export async function openMaterialFile(filePath: string): Promise<void> {
  const url = await createMaterialFileUrl(filePath);
  await Linking.openURL(url);
}

export async function downloadMaterialFile(options: {
  filePath: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const url = await createMaterialFileUrl(options.filePath);

  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return;
  }

  const available = await Sharing.isAvailableAsync();

  if (!available) {
    await Linking.openURL(url);
    return;
  }

  const destination = new ExpoFile(
    Paths.cache,
    `${Date.now()}-${safeFileName(options.fileName)}`,
  );
  const file = await ExpoFile.downloadFileAsync(url, destination, {
    idempotent: true,
  });

  await Sharing.shareAsync(file.uri, {
    mimeType: options.mimeType,
    dialogTitle: options.fileName,
  });
}

export function formatMaterialFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "Size unavailable";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function materialFileKind(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  if (mimeType.includes("presentationml")) return "PPTX";
  return "FILE";
}

export function extractionStatusLabel(
  status: MaterialExtractionStatus,
): string {
  if (status === "processing") return "Extracting text...";
  if (status === "pending") return "Text extraction queued";
  if (status === "ready") return "Text ready";
  if (status === "failed") return "Text extraction failed";
  return "No extracted text";
}
