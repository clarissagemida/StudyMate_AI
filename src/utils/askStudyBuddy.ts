import { supabase } from "@/lib/supabase";

// Thin, typed wrapper around the study-buddy Edge Function.
//
// The function holds the AI key and enforces that only approved students can
// ask. This helper only sends text and normalizes the result so the screen can
// render an answer, a "not connected" state, or an error.

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type AskResult =
  | { status: "ok"; reply: string }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

type FunctionResponse = {
  status?: "ok" | "not_configured" | "error";
  reply?: string;
  message?: string;
};

export async function askStudyBuddy(
  message: string,
  history: ChatMessage[] = [],
): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke("study-buddy", {
    // Only text is sent; the system prompt and model live on the server.
    body: { message, history },
  });

  if (error) {
    let errorMessage =
      "Could not reach AI Buddy. Please check your connection and try again.";

    const context = (error as { context?: Response }).context;

    if (context) {
      try {
        const parsed = (await context.json()) as FunctionResponse;
        if (parsed?.message) errorMessage = parsed.message;
      } catch {
        // Keep the generic message when the body cannot be read.
      }
    }

    console.error("study-buddy function error:", error.message);
    return { status: "error", message: errorMessage };
  }

  const result = (data ?? {}) as FunctionResponse;

  if (result.status === "ok" && typeof result.reply === "string") {
    return { status: "ok", reply: result.reply };
  }

  if (result.status === "not_configured") {
    return {
      status: "not_configured",
      message: result.message ?? "AI Buddy is not connected yet.",
    };
  }

  return {
    status: "error",
    message: result.message ?? "AI Buddy could not answer that.",
  };
}
