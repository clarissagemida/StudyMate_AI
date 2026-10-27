import { AI_ENABLED } from "@/utils/aiFlags";
import { invokeAi } from "@/utils/aiClient";

export type TeacherAiQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type TeacherAiRequest = {
  mode: "topic" | "quiz";
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  questionCount?: number;
  materialId?: string;
};

export type TeacherAiResult =
  | { status: "ok"; mode: "topic"; content: string }
  | { status: "ok"; mode: "quiz"; questions: TeacherAiQuestion[] }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

type TeacherAiResponse = {
  status?: "ok" | "not_configured" | "error";
  mode?: "topic" | "quiz";
  content?: string;
  questions?: unknown;
  message?: string;
};

function normalizeQuestions(value: unknown): TeacherAiQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions: TeacherAiQuestion[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const options = Array.isArray(record.options)
      ? record.options.filter(
          (option): option is string =>
            typeof option === "string" && option.trim().length > 0,
        ).map((option) => option.trim())
      : [];

    const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
    const explanation =
      typeof record.explanation === "string" ? record.explanation.trim() : "";
    const correctIndex = record.correctIndex;

    if (!prompt || options.length < 2) continue;

    if (
      typeof correctIndex !== "number" ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length
    ) {
      continue;
    }

    questions.push({ prompt, options, correctIndex, explanation });
  }

  return questions;
}

export async function generateTeacherAi(
  request: TeacherAiRequest,
): Promise<TeacherAiResult> {
  if (!AI_ENABLED) {
    return {
      status: "not_configured",
      message: "AI tools are turned off in this build.",
    };
  }

  const result = await invokeAi<TeacherAiResponse>(
    "teacher-ai-generator",
    {
      mode: request.mode,
      subject: request.subject,
      topic: request.topic,
      difficulty: request.difficulty,
      questionCount: request.questionCount,
      materialId: request.materialId || undefined,
    },
    { timeoutMs: request.mode === "quiz" ? 150000 : 60000 },
  );

  if (!result.ok) {
    return {
      status: result.code === "not_configured" ? "not_configured" : "error",
      message: result.message,
    };
  }

  const data = result.data;

  if (data.status === "not_configured") {
    return {
      status: "not_configured",
      message: data.message ?? "AI tools are not connected yet.",
    };
  }

  if (data.status !== "ok") {
    return {
      status: "error",
      message: data.message ?? "The AI could not generate a draft.",
    };
  }

  if (data.mode === "topic" && typeof data.content === "string") {
    return { status: "ok", mode: "topic", content: data.content.trim() };
  }

  if (data.mode === "quiz") {
    const questions = normalizeQuestions(data.questions);

    if (questions.length === 0) {
      return {
        status: "error",
        message: "The AI returned an empty quiz. Please try again.",
      };
    }

    return { status: "ok", mode: "quiz", questions };
  }

  return {
    status: "error",
    message: "The AI returned an unexpected response.",
  };
}
