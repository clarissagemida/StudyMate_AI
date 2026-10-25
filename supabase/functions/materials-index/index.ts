import {
  authenticate,
} from "../_shared/auth.ts";
import { chunkText } from "../_shared/chunking.ts";
import { embedText } from "../_shared/gemini.ts";
import { handlePreflight, json, readJsonBody } from "../_shared/http.ts";
import { loadAiSettings } from "../_shared/settings.ts";
import { recordUsage } from "../_shared/usage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const MAX_CONTENT_CHARS = 20000;
const EMBED_BATCH_SIZE = 4;

type MaterialRow = {
  id: string;
  title: string;
  content: string;
  description: string;
  teacher_id: string;
};

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
      { error: "Only approved teachers can index study material." },
      403,
    );
  }

  const settings = await loadAiSettings(caller.admin, {
    AI_ENABLED: Deno.env.get("AI_ENABLED"),
    GEMINI_MODEL: Deno.env.get("GEMINI_MODEL"),
    GEMINI_EMBEDDING_MODEL: Deno.env.get("GEMINI_EMBEDDING_MODEL"),
  });

  if (!settings.enabled) {
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
    .select("id, title, content, description, teacher_id")
    .eq("id", materialId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703") {
      return json(
        {
          error:
            "Material content is not available yet. Run supabase/ai_grounding.sql first.",
        },
        503,
      );
    }

    console.error("Material lookup failed:", error.code);
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

  const source = [material.content, material.description]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n\n")
    .slice(0, MAX_CONTENT_CHARS);

  const chunks = chunkText(source);

  if (chunks.length === 0) {
    await caller.admin.from("material_chunks").delete().eq("material_id", materialId);
    return json({ status: "ok", indexed: 0, materialId });
  }

  // Embed everything before touching the database so a failed embedding
  // cannot leave the material half-indexed.
  const embeddings: number[][] = [];

  for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((chunk) =>
        embedText({
          apiKey: GEMINI_API_KEY,
          model: settings.embeddingModel,
          text: chunk,
          title: material.title,
          taskType: "RETRIEVAL_DOCUMENT",
        })
      ),
    );

    for (const result of results) {
      if (!result.ok) {
        console.error("Material embedding failed:", result.detail);
        return json(
          {
            error:
              "The material could not be indexed because the embedding service failed. Try again later.",
          },
          502,
        );
      }

      embeddings.push(result.values);
    }
  }

  const rows = chunks.map((content, index) => ({
    material_id: materialId,
    chunk_index: index,
    content,
    embedding: JSON.stringify(embeddings[index]),
  }));

  const { error: writeError } = await caller.admin
    .from("material_chunks")
    .upsert(rows, { onConflict: "material_id,chunk_index" });

  if (writeError) {
    console.error("Chunk write failed:", writeError.code);
    return json(
      { error: "The material was saved, but indexing failed. Please try again." },
      500,
    );
  }

  const { error: pruneError } = await caller.admin
    .from("material_chunks")
    .delete()
    .eq("material_id", materialId)
    .gte("chunk_index", rows.length);

  if (pruneError) {
    console.error("Chunk cleanup failed:", pruneError.code);
  }

  await recordUsage(caller.admin, {
    userId: caller.user.id,
    role: caller.profile.role,
    feature: "materials_index",
    model: settings.embeddingModel,
  });

  return json({
    status: "ok",
    indexed: rows.length,
    materialId,
    title: material.title,
  });
});
