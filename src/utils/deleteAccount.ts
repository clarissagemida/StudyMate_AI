import { supabase } from "@/lib/supabase";

// Thin, typed wrapper around the delete-account Edge Function.
//
// The function decides authorization on the server; this helper only calls it
// and normalizes the result so screens can show accurate messages. It never
// sends a role, only an optional target user id.

export type DeleteAccountResult = {
  ok: boolean;
  partial: boolean;
  message: string;
};

type FunctionResponse = {
  status?: "success" | "partial" | "error";
  message?: string;
};

export async function deleteAccount(targetId?: string): Promise<DeleteAccountResult> {
  // Omitting targetId deletes the caller's own account.
  const body = targetId ? { targetId } : {};

  const { data, error } = await supabase.functions.invoke("delete-account", {
    body,
  });

  if (error) {
    // supabase-js throws a FunctionsHttpError for non-2xx responses; the
    // server's JSON message lives on the attached response body.
    let message =
      "The account could not be deleted. Please check your connection and try again.";

    const context = (error as { context?: Response }).context;
    const status = context?.status;
    let serverMessage: string | null = null;

    if (context) {
      try {
        const parsed = (await context.json()) as FunctionResponse;
        if (parsed?.message) {
          serverMessage = parsed.message;
          message = parsed.message;
        }
      } catch {
        // Keep the generic message when the body cannot be read.
      }
    }

    // Make the real cause visible so deployment/config problems are obvious
    // instead of being masked by a generic "check your connection" message.
    if (!serverMessage) {
      if (status === 404) {
        message =
          "The delete-account function is not deployed. Deploy it in Supabase → Edge Functions.";
      } else if (status === 401 || status === 403) {
        message = "Your session is not authorized to delete accounts.";
      } else if (status === 500) {
        message =
          "The function is deployed but not configured. Set the STUDYMATE_SERVICE_ROLE_KEY secret in Supabase → Edge Functions → Secrets.";
      } else {
        message = `${error.message}${status ? ` (HTTP ${status})` : ""}`;
      }
    }

    console.error("delete-account function error:", {
      message: error.message,
      status,
      serverMessage,
      raw: error,
    });
    const diagnostic = serverMessage
      ? `${message}\n\n[diag] HTTP ${status ?? "?"} | ${error.message}`
      : `${message}\n\n[diag] HTTP ${status ?? "?"} | ${error.message}`;
    return { ok: false, partial: false, message: diagnostic };
  }

  const result = (data ?? {}) as FunctionResponse;

  if (result.status === "success") {
    return {
      ok: true,
      partial: false,
      message: result.message ?? "The account has been permanently deleted.",
    };
  }

  if (result.status === "partial") {
    return {
      ok: false,
      partial: true,
      message:
        result.message ??
        "The login was deleted, but some records could not be cleaned up automatically.",
    };
  }

  return {
    ok: false,
    partial: false,
    message: result.message ?? "The account could not be deleted.",
  };
}
