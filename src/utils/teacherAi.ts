import { invokeAi } from "@/utils/aiClient";
import { AI_ENABLED } from "@/utils/aiFlags";

export type TeacherAiQuestion = {
  questionType: TeacherAiQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  answerText: string;
  explanation: string;
};

export type TeacherAiQuestionType =
  | "multiple_choice"
  | "true_false"
  | "enumeration"
  | "identification";

export type TeacherAiQuestionGroup = {
  questionType: TeacherAiQuestionType;
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
};

export type TeacherAiDraftType = "lesson" | "summary" | "objectives" | "examples" | "review_questions";
export type TeacherAiDetailLevel = "brief" | "balanced" | "detailed";
export type TeacherAiGradeLevel = "general" | "elementary" | "secondary" | "college";

export type TeacherAiRequest = {
  mode: "topic" | "quiz";
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  questionCount?: number;
  questionType?: TeacherAiQuestionType;
  questionGroups?: TeacherAiQuestionGroup[];
  materialId?: string;
  questionTypes?: TeacherAiQuestionType[];
  draftType?: TeacherAiDraftType;
  gradeLevel?: TeacherAiGradeLevel;
  detailLevel?: TeacherAiDetailLevel;
};

export type TeacherAiResult =
  | { status: "ok"; mode: "topic"; content: string }
  | {
      status: "ok";
      mode: "quiz";
      questions: TeacherAiQuestion[];
    }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

type TeacherAiResponse = {
  status?: "ok" | "not_configured" | "error";
  mode?: "topic" | "quiz";
  content?: string;
  questions?: unknown;
  message?: string;
};

const MAX_QUESTIONS = 50;

function normalizeQuestions(value: unknown): TeacherAiQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions: TeacherAiQuestion[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;

    const prompt =
      typeof record.prompt === "string" ? record.prompt.trim() : "";
    const questionType = record.questionType;
    if (![
      "multiple_choice",
      "true_false",
      "enumeration",
      "identification",
    ].includes(String(questionType))) continue;
    const answerText = typeof record.answerText === "string" ? record.answerText.trim() : "";

    const explanation =
      typeof record.explanation === "string" ? record.explanation.trim() : "";

    // Do not silently remove invalid options because
    // doing so could change the correct answer index.
    if (
      (questionType === "multiple_choice" || questionType === "true_false") && (
      !Array.isArray(record.options) ||
      record.options.length < 2 ||
      !record.options.every(
        (option) => typeof option === "string" && option.trim().length > 0,
      )
      )
    ) {
      continue;
    }

    const options = (Array.isArray(record.options) ? record.options : [])
      .filter((option): option is string => typeof option === "string")
      .map((option) => option.trim());

    const correctIndex = record.correctIndex;

    if (!prompt) continue;

    if (
      typeof correctIndex !== "number" ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      ((questionType === "multiple_choice" || questionType === "true_false") && correctIndex >= options.length)
    ) {
      continue;
    }
    if (questionType !== "multiple_choice" && questionType !== "true_false" && !answerText) continue;

    questions.push({
      questionType: questionType as TeacherAiQuestionType,
      prompt,
      options:
        questionType === "multiple_choice" || questionType === "true_false"
          ? options
          : ["", ""],
      correctIndex,
      answerText,
      explanation,
    });
  }

  return questions;
}

function validateRequest(request: TeacherAiRequest): string | null {
  if (!request.subject.trim()) {
    return "Please provide a subject.";
  }

  if (!request.topic.trim()) {
    return "Please provide a topic.";
  }

  if (
    request.mode === "quiz" &&
    request.questionType &&
    !["multiple_choice", "true_false", "enumeration", "identification"].includes(request.questionType)
  ) {
    return "Choose a supported question type.";
  }

  if (request.mode === "quiz" && request.questionGroups) {
    const total = request.questionGroups.reduce((sum, group) => sum + group.questionCount, 0);
    if (
      request.questionGroups.length < 1 ||
      request.questionGroups.length > 6 ||
      request.questionGroups.some((group) =>
        !["multiple_choice", "true_false", "enumeration", "identification"].includes(group.questionType) ||
        !["easy", "medium", "hard"].includes(group.difficulty) ||
        !Number.isInteger(group.questionCount) || group.questionCount < 1
      ) ||
      total > MAX_QUESTIONS
    ) {
      return "Use 1 to 6 question groups with 1 to 50 questions total.";
    }
  }

  if (
    request.mode === "topic" &&
    request.draftType &&
    !["lesson", "summary", "objectives", "examples", "review_questions"].includes(request.draftType)
  ) {
    return "Choose a supported lesson draft type.";
  }

  if (!["easy", "medium", "hard"].includes(request.difficulty)) {
    return "Invalid quiz difficulty.";
  }

  if (request.mode === "quiz") {
    const count = request.questionCount ?? 10;

    if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTIONS) {
      return `Question count must be between 1 and ${MAX_QUESTIONS}.`;
    }

    if (
      request.questionTypes &&
      (request.questionTypes.length === 0 ||
        request.questionTypes.some(
          (type) => !["multiple_choice", "true_false"].includes(type),
        ))
    ) {
      return "Please select a valid question type.";
    }
  }

  return null;
}

export async function generateTeacherAi(
  request: TeacherAiRequest,
): Promise<TeacherAiResult> {
  if (!AI_ENABLED) {
    return {
      status: "not_configured",
      message: "AI tools are currently disabled.",
    };
  }

  const validationError = validateRequest(request);

  if (validationError) {
    return {
      status: "error",
      message: validationError,
    };
  }

  try {
    const result = await invokeAi<TeacherAiResponse>(
      "teacher-ai-generator",
      {
        mode: request.mode,
        subject: request.subject.trim(),
        topic: request.topic.trim(),
        difficulty: request.difficulty,
        questionCount:
          request.mode === "quiz" ? (request.questionCount ?? 10) : undefined,
        questionType:
          request.mode === "quiz"
            ? (request.questionType ?? "multiple_choice")
            : undefined,
        questionGroups:
          request.mode === "quiz" ? request.questionGroups : undefined,
        materialId: request.materialId || undefined,
        questionTypes:
          request.mode === "quiz"
            ? (request.questionTypes ?? ["multiple_choice"])
            : undefined,
        draftType:
          request.mode === "topic" ? (request.draftType ?? "lesson") : undefined,
        gradeLevel:
          request.mode === "topic" ? (request.gradeLevel ?? "general") : undefined,
        detailLevel:
          request.mode === "topic" ? (request.detailLevel ?? "balanced") : undefined,
      },
      {
        timeoutMs: request.mode === "quiz" ? 150000 : 60000,
      },
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
        message: data.message ?? "The AI could not generate a quiz.",
      };
    }

    if (data.mode === "topic" && typeof data.content === "string") {
      return {
        status: "ok",
        mode: "topic",
        content: data.content.trim(),
      };
    }

    if (data.mode === "quiz") {
      const questions = normalizeQuestions(data.questions);

      if (questions.length === 0) {
        return {
          status: "error",
          message: "The AI returned invalid questions. Please try again.",
        };
      }

      return {
        status: "ok",
        mode: "quiz",
        questions,
      };
    }

    return {
      status: "error",
      message: "The AI returned an unexpected response.",
    };
  } catch (error) {
    console.error("[Teacher AI] Generation failed:", error);

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Something went wrong while generating the quiz.",
    };
  }
}
