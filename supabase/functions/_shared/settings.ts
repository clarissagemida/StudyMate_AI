import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AiSettings = {
  enabled: boolean;
  studentEnabled: boolean;
  teacherEnabled: boolean;
  model: string;
  embeddingModel: string;
};

type EnvDefaults = {
  AI_ENABLED?: string;
  GEMINI_MODEL?: string;
  GEMINI_EMBEDDING_MODEL?: string;
};

const FALLBACK_MODEL = "gemini-2.5-flash";
const FALLBACK_EMBEDDING_MODEL = "gemini-embedding-001";

function defaultSettings(env: EnvDefaults): AiSettings {
  return {
    enabled: env.AI_ENABLED !== "false",
    studentEnabled: true,
    teacherEnabled: true,
    model: env.GEMINI_MODEL || FALLBACK_MODEL,
    embeddingModel: env.GEMINI_EMBEDDING_MODEL || FALLBACK_EMBEDDING_MODEL,
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asModel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

// Settings live in app_settings so administrators can change the model or
// disable AI without redeploying. Missing rows/table fall back to env defaults.
export async function loadAiSettings(
  admin: SupabaseClient,
  env: EnvDefaults,
): Promise<AiSettings> {
  const defaults = defaultSettings(env);

  const { data, error } = await admin
    .from("app_settings")
    .select("key, value");

  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("AI settings lookup failed:", error.code);
    }
    return defaults;
  }

  const values = new Map<string, unknown>();

  for (const row of data ?? []) {
    values.set(String((row as { key: unknown }).key), (row as { value: unknown }).value);
  }

  return {
    enabled: asBoolean(values.get("ai_enabled"), defaults.enabled),
    studentEnabled: asBoolean(
      values.get("ai_student_enabled"),
      defaults.studentEnabled,
    ),
    teacherEnabled: asBoolean(
      values.get("ai_teacher_enabled"),
      defaults.teacherEnabled,
    ),
    model: asModel(values.get("ai_model"), defaults.model),
    embeddingModel: asModel(
      values.get("ai_embedding_model"),
      defaults.embeddingModel,
    ),
  };
}
