import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const DAILY_LIMITS = {
  student: 30,
  teacher: 20,
} as const;

export type AiFeature =
  | "study_buddy"
  | "teacher_generator"
  | "materials_index";

export function utcDayStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function quotaResetAt(now: Date = new Date()): string {
  const reset = utcDayStart(now);
  reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.toISOString();
}

export function dailyLimitForRole(role: string): number | null {
  if (role === "student") return DAILY_LIMITS.student;
  if (role === "teacher") return DAILY_LIMITS.teacher;
  return null;
}

export async function checkDailyQuota(
  admin: SupabaseClient,
  userId: string,
  role: string,
  now: Date = new Date(),
): Promise<
  | { ok: true }
  | { ok: false; limit: number; used: number; resetAt: string }
  | { ok: false; unavailable: true }
> {
  const limit = dailyLimitForRole(role);

  if (limit === null) {
    return { ok: true };
  }

  const { count, error } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", utcDayStart(now).toISOString());

  if (error) {
    // Fail closed: without the usage ledger the daily quota cannot be
    // enforced, so AI requests must not run unmetered.
    console.error("AI usage count failed:", error.code);
    return { ok: false, unavailable: true };
  }

  if ((count ?? 0) >= limit) {
    return {
      ok: false,
      limit,
      used: count ?? 0,
      resetAt: quotaResetAt(now),
    };
  }

  return { ok: true };
}

export async function recordUsage(
  admin: SupabaseClient,
  usage: {
    userId: string;
    role: string;
    feature: AiFeature;
    model: string;
    promptTokens?: number;
    outputTokens?: number;
  },
): Promise<void> {
  const { error } = await admin.from("ai_usage").insert({
    user_id: usage.userId,
    role: usage.role === "teacher" ? "teacher" : usage.role === "admin" ? "admin" : "student",
    feature: usage.feature,
    model: usage.model,
    prompt_tokens: Math.max(0, usage.promptTokens ?? 0),
    output_tokens: Math.max(0, usage.outputTokens ?? 0),
  });

  if (error) {
    console.error("Could not record AI usage:", error.code);
  }
}
