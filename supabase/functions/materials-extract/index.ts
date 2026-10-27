import { unzipSync } from "npm:fflate@0.8.2";
import {
  authenticate,
  type AuthenticatedCaller,
} from "../_shared/auth.ts";
import {
  bytesToBase64,
  extractPptxSlides,
  MAX_EXTRACTED_CHARS,
  MAX_INLINE_PDF_BYTES,
  normalizeExtractedText,
  ooxmlXmlToText,
  PDF_EXTRACTION_PROMPT,
  validateMaterialFile,
  type MaterialMimeType,
} from "../_shared/documents.ts";
import {
  callGemini,
  DEFAULT_GEMINI_FALLBACK_MODEL,
  deleteGeminiFile,
  uploadGeminiFile,
} from "../_shared/gemini.ts";
import { handlePreflight, json, readJsonBody } from "../_shared/http.ts";
import { loadAiSettings } from "../_shared/settings.ts";
import { checkDailyQuota, recordUsage } from "../_shared/usage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const MAX_OOXML_PART_BYTES = 16 * 1024 * 1024;

type MaterialRow = {
  id: string;
  title: string;
  teacher_id: string;
  file_path: string | null;
  file_name: string;
  file_mime: string;
};

async function markFailed(
  caller: AuthenticatedCaller,
  materialId: string,
  message: string,
): Promise<void> {
  const { error } = await caller.admin
    .from("materials")
    .update({
      extraction_status: "failed",
      extraction_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId);

  if (error) {
    console.error("Could not mark extraction as failed:", error.code);
  }
}

async function failure(
  caller: AuthenticatedCaller,
  materialId: string,
  message: string,
  status: number,
): Promise<Response> {
  await markFailed(caller, materialId, message);
  return json({ error: message }, status);
}

function extractDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: (file) =>
      file.name === "word/document.xml" &&
      file.originalSize <= MAX_OOXML_PART_BYTES,
  });

  const documentXml = files["word/document.xml"];

  if (!documentXml) {
    throw new Error("The Word document does not contain readable text.");
  }

  return ooxmlXmlToText(new TextDecoder().decode(documentXml));
}

function extractPptx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: (file) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(file.name) &&
      file.originalSize <= MAX_OOXML_PART_BYTES,
  });

  return extractPptxSlides(files);
}

async function extractPdfText(
  caller: AuthenticatedCaller,
  bytes: Uint8Array,
  model: string,
): Promise<
  | { ok: true; text: string }
  | { ok: false; message: string; status: number }
> {
  const quota = await checkDailyQuota(
    caller.admin,
    caller.user.id,
    caller.profile.role,
  );

  if (!quota.ok) {
    if ("unavailable" in quota) {
      return {
        ok: false,
        status: 503,
        message:
          "AI usage tracking is unavailable. Ask an administrator to run the AI database setup.",
      };
    }

    return {
      ok: false,
      status: 429,
      message: `You have reached today's AI limit (${quota.limit} requests). Try again after the limit resets.`,
    };
  }

  const useFilesApi = bytes.byteLength > MAX_INLINE_PDF_BYTES;
  let uploadedFile: { name: string; uri: string } | null = null;

  if (useFilesApi) {
    const upload = await uploadGeminiFile({
      apiKey: GEMINI_API_KEY,
      bytes,
      mimeType: "application/pdf",
      displayName: "StudyMate material",
      timeoutMs: 90000,
    });

    if (!upload.ok) {
      if (upload.detail) {
        console.error("Gemini PDF upload failed:", upload.status, upload.detail);
      }

      return {
        ok: false,
        status:
          upload.status === "rate_limited"
            ? 429
            : upload.status === "timeout"
              ? 504
              : 502,
        message: upload.message,
      };
    }

    uploadedFile = { name: upload.name, uri: upload.uri };
  }

  const result = await callGemini({
    apiKey: GEMINI_API_KEY,
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: PDF_EXTRACTION_PROMPT },
          uploadedFile
            ? {
                fileData: {
                  mimeType: "application/pdf",
                  fileUri: uploadedFile.uri,
                },
              }
            : {
                inlineData: {
                  mimeType: "application/pdf",
                  data: bytesToBase64(bytes),
                },
              },
        ],
      },
    ],
    maxOutputTokens: 8192,
    thinkingLevel: "low",
    timeoutMs: 120000,
    fallbackModel: DEFAULT_GEMINI_FALLBACK_MODEL,
  });

  if (uploadedFile) {
    await deleteGeminiFile({
      apiKey: GEMINI_API_KEY,
      name: uploadedFile.name,
    });
  }

  if (!result.ok) {
    if (result.detail) {
      console.error("PDF extraction failed:", result.status, result.detail);
    }

    return {
      ok: false,
      status:
        result.status === "rate_limited"
          ? 429
          : result.status === "timeout"
            ? 504
            : 502,
      message: result.message,
    };
  }

  await recordUsage(caller.admin, {
    userId: caller.user.id,
    role: caller.profile.role,
    feature: "materials_extract",
    model,
    promptTokens: result.promptTokens,
    outputTokens: result.outputTokens,
  });

  return { ok: true, text: normalizeExtractedText(result.text) };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SERVICE_ROLE_KEY ||
    !GEMINI_API_KEY
  ) {
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  const caller = await authenticate(req, {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    serviceRoleKey: SERVICE_ROLE_KEY,
  });

  if (caller instanceof Response) return caller;

  if (
    caller.profile.approval_status !== "approved" ||
    (caller.profile.role !== "teacher" && caller.profile.role !== "admin")
  ) {
    return json(
      { error: "Only approved teachers can extract material files." },
      403,
    );
  }

  const settings = await loadAiSettings(caller.admin, {
    AI_ENABLED: Deno.env.get("AI_ENABLED"),
    GEMINI_MODEL: Deno.env.get("GEMINI_MODEL"),
    GEMINI_EMBEDDING_MODEL: Deno.env.get("GEMINI_EMBEDDING_MODEL"),
  });

  if (!settings.enabled || !settings.teacherEnabled) {
    return json({ error: "StudyMate AI is currently disabled." }, 503);
  }

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;

  const materialId =
    typeof (parsedBody.value as { materialId?: unknown }).materialId === "string"
      ? (parsedBody.value as { materialId: string }).materialId.trim()
      : "";

  if (!materialId) {
    return json({ error: "A material id is required." }, 400);
  }

  const { data, error } = await caller.admin
    .from("materials")
    .select("id, title, teacher_id, file_path, file_name, file_mime")
    .eq("id", materialId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703") {
      return json(
        {
          error:
            "Material files are not available yet. Run supabase/teacher_features.sql first.",
        },
        503,
      );
    }

    console.error("Material file lookup failed:", error.code);
    return json({ error: "The material could not be loaded." }, 500);
  }

  const material = data as MaterialRow | null;

  if (!material) {
    return json({ error: "That material was not found." }, 404);
  }

  if (
    material.teacher_id !== caller.user.id &&
    caller.profile.role !== "admin"
  ) {
    return json({ error: "You do not have access to that material." }, 403);
  }

  if (!material.file_path) {
    return json({ error: "This material does not have an attached file." }, 400);
  }

  const { data: file, error: downloadError } = await caller.admin.storage
    .from("materials")
    .download(material.file_path);

  if (downloadError || !file) {
    console.error("Material download failed:", downloadError?.message);
    return failure(
      caller,
      materialId,
      "The attached file could not be downloaded from Storage. Run supabase/teacher_features.sql and try again.",
      502,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const validation = validateMaterialFile({
    name: material.file_name || material.file_path,
    mimeType: material.file_mime || file.type,
    size: buffer.byteLength,
  });

  if (!validation.ok) {
    return failure(caller, materialId, validation.message, 400);
  }

  const mimeType: MaterialMimeType = validation.mimeType;

  const { error: processingError } = await caller.admin
    .from("materials")
    .update({
      extraction_status: "processing",
      extraction_error: "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId);

  if (processingError) {
    console.error("Extraction status update failed:", processingError.code);
    return json(
      { error: "The material could not be marked for extraction." },
      500,
    );
  }

  let extracted = "";
  let model = "";

  try {
    if (mimeType === "application/pdf") {
      model = settings.model;
      const result = await extractPdfText(caller, buffer, model);

      if (!result.ok) {
        return failure(caller, materialId, result.message, result.status);
      }

      extracted = result.text;
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extracted = extractDocx(buffer);
    } else {
      extracted = extractPptx(buffer);
    }
  } catch (extractionError) {
    console.error("Material extraction error:", extractionError);

    return failure(
      caller,
      materialId,
      "The file could not be read. Make sure it is a valid PDF, DOCX, or PPTX document.",
      422,
    );
  }

  const content = normalizeExtractedText(extracted).slice(
    0,
    MAX_EXTRACTED_CHARS,
  );

  if (content.length < 10) {
    return failure(
      caller,
      materialId,
      mimeType === "application/pdf"
        ? "No readable text was found in this PDF. Scanned pages must contain selectable text or clear print."
        : "No readable text was found in this document.",
      422,
    );
  }

  const { error: contentError } = await caller.admin
    .from("materials")
    .update({
      content,
      extraction_status: "ready",
      extraction_error: "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId);

  if (contentError) {
    console.error("Extracted content save failed:", contentError.code);
    return failure(
      caller,
      materialId,
      "The text was extracted but could not be saved.",
      500,
    );
  }

  return json({
    status: "ok",
    materialId,
    contentLength: content.length,
    model: model || "local-extraction",
  });
});
