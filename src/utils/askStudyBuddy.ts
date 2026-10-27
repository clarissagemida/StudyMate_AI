import { AI_ENABLED } from "@/utils/aiFlags";
import { invokeAi } from "@/utils/aiClient";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type AiSource = {
  materialId: string;
  title: string;
};

export type AskResult =
  | { status: "ok"; reply: string; sources: AiSource[] }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

type StudyBuddyResponse = {
  status?: "ok" | "not_configured";
  reply?: string;
  sources?: unknown;
  message?: string;
};

function normalizeSources(value: unknown): AiSource[] {
  if (!Array.isArray(value)) return [];

  const sources: AiSource[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const materialId = (item as { materialId?: unknown }).materialId;
    const title = (item as { title?: unknown }).title;

    if (typeof materialId !== "string" || !materialId.trim()) continue;
    if (typeof title !== "string" || !title.trim()) continue;
    if (seen.has(materialId)) continue;

    seen.add(materialId);
    sources.push({ materialId, title: title.trim() });
  }

  return sources.slice(0, 4);
}

export async function askStudyBuddy(
  message: string,
  history: ChatMessage[] = [],
): Promise<AskResult> {
  if (!AI_ENABLED) {
    return {
      status: "not_configured",
      message: "AI Buddy is turned off in this build.",
    };
  }

  const result = await invokeAi<StudyBuddyResponse>(
    "study-buddy",
    {
      message,
      history,
    },
    { timeoutMs: 120000 },
  );

  if (!result.ok) {
    return {
      status: result.code === "not_configured" ? "not_configured" : "error",
      message: result.message,
    };
  }

  const data = result.data;

  if (data.status === "ok" && typeof data.reply === "string") {
    return {
      status: "ok",
      reply: data.reply,
      sources: normalizeSources(data.sources),
    };
  }

  if (data.status === "not_configured") {
    return {
      status: "not_configured",
      message: data.message ?? "AI Buddy is not connected yet.",
    };
  }

  return {
    status: "error",
    message: data.message ?? "AI Buddy could not answer that.",
  };
}
