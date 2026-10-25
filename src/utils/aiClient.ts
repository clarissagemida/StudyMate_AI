import { supabase } from "@/lib/supabase";

// Central client wrapper for AI Edge Functions.
//
// It never contains prompt text or model names; those live on the server. It
// only normalizes transport failures, timeouts, and structured HTTP errors so
// every screen can show a useful message.

export type AiErrorCode =
  | "not_configured"
  | "disabled"
  | "unauthorized"
  | "quota"
  | "timeout"
  | "network"
  | "error";

export type AiFailure = {
  ok: false;
  code: AiErrorCode;
  message: string;
  resetAt?: string;
};

export type AiSuccess<T> = { ok: true; data: T };

export type AiInvokeResult<T> = AiSuccess<T> | AiFailure;

type ServerError = {
  error?: string;
  message?: string;
  status?: string;
  resetAt?: string;
};

const DEFAULT_TIMEOUT_MS = 60000;

function failure(
  code: AiErrorCode,
  message: string,
  resetAt?: string,
): AiFailure {
  return { ok: false, code, message, resetAt };
}

async function readServerError(context: unknown): Promise<{
  body: ServerError | null;
  status?: number;
}> {
  if (!(context instanceof Response)) return { body: null };

  let body: ServerError | null = null;

  try {
    body = (await context.clone().json()) as ServerError;
  } catch {
    body = null;
  }

  return { body, status: context.status };
}

export async function invokeAi<T>(
  functionName: string,
  body: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<AiInvokeResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error("AI request timed out"));
    }, timeoutMs);
  });

  try {
    const call = supabase.functions.invoke(functionName, { body });
    const { data, error } = await Promise.race([call, timeout]);

    if (error) {
      const { body: parsed, status } = await readServerError(
        (error as { context?: unknown }).context,
      );

      const message =
        parsed?.error ??
        parsed?.message ??
        "The AI service could not answer. Please try again.";

      if (parsed?.status === "not_configured") {
        return failure("not_configured", message);
      }

      if (status === 429 || parsed?.resetAt) {
        return failure("quota", message, parsed?.resetAt);
      }

      if (status === 401 || status === 403) {
        return failure("unauthorized", message);
      }

      if (status === 503) {
        return failure("disabled", message);
      }

      return failure("error", message);
    }

    return { ok: true, data: (data ?? {}) as T };
  } catch (error) {
    if (timedOut) {
      return failure(
        "timeout",
        "The AI is taking too long. Please try again in a moment.",
      );
    }

    console.error(`${functionName} invoke failed:`, error);
    return failure(
      "network",
      "Could not reach AI Buddy. Check your connection and try again.",
    );
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
