import { AI_ENABLED } from "@/utils/aiFlags";
import { invokeAi } from "@/utils/aiClient";
import type { AskResult, ChatMessage } from "@/utils/askStudyBuddy";

type TeacherBuddyResponse = {
  status?: "ok" | "not_configured";
  reply?: string;
  message?: string;
};

export async function askTeacherAiBuddy(
  message: string,
  history: ChatMessage[] = [],
): Promise<AskResult> {
  if (!AI_ENABLED) {
    return { status: "not_configured", message: "AI Buddy is turned off in this build." };
  }

  const result = await invokeAi<TeacherBuddyResponse>(
    "teacher-ai-buddy",
    { message, history },
    { timeoutMs: 90000 },
  );

  if (!result.ok) {
    return {
      status: result.code === "not_configured" ? "not_configured" : "error",
      message: result.message,
    };
  }

  if (result.data.status === "ok" && typeof result.data.reply === "string") {
    return { status: "ok", reply: result.data.reply, sources: [] };
  }

  if (result.data.status === "not_configured") {
    return {
      status: "not_configured",
      message: result.data.message ?? "Teacher AI Buddy is not connected yet.",
    };
  }

  return {
    status: "error",
    message: result.data.message ?? "Teacher AI Buddy could not answer that.",
  };
}
