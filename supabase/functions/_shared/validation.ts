export type GeneratedQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const MAX_QUESTION_PROMPT = 1000;
export const MAX_QUESTION_EXPLANATION = 1000;
export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;
export const MAX_QUIZ_QUESTIONS = 50;

export const QUIZ_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_QUIZ_QUESTIONS,
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          options: {
            type: "array",
            minItems: MIN_OPTIONS,
            maxItems: MAX_OPTIONS,
            items: { type: "string" },
          },
          correctIndex: { type: "integer", minimum: 0 },
          explanation: { type: "string" },
        },
        required: ["prompt", "options", "correctIndex", "explanation"],
      },
    },
  },
  required: ["questions"],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function validateGeneratedQuestions(
  value: unknown,
): { ok: true; questions: GeneratedQuestion[] } | { ok: false; message: string } {
  const record = asRecord(value);
  const raw = record?.questions;

  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "The AI did not return any questions." };
  }

  if (raw.length > MAX_QUIZ_QUESTIONS) {
    return { ok: false, message: "The AI returned too many questions." };
  }

  const questions: GeneratedQuestion[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = asRecord(raw[index]);

    if (!item) {
      return { ok: false, message: "The AI returned an invalid question." };
    }

    const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
    const explanation =
      typeof item.explanation === "string" ? item.explanation.trim() : "";
    const options = Array.isArray(item.options)
      ? item.options
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim())
      : [];

    if (!prompt || prompt.length > MAX_QUESTION_PROMPT) {
      return { ok: false, message: "The AI returned an invalid question." };
    }

    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      return { ok: false, message: "The AI returned invalid answer options." };
    }

    if (options.some((option) => !option)) {
      return { ok: false, message: "The AI returned an empty answer option." };
    }

    if (explanation.length > MAX_QUESTION_EXPLANATION) {
      return { ok: false, message: "The AI returned an invalid explanation." };
    }

    const correctIndex = item.correctIndex;

    if (
      typeof correctIndex !== "number" ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length
    ) {
      return { ok: false, message: "The AI returned an invalid answer key." };
    }

    questions.push({
      prompt,
      options,
      correctIndex,
      explanation,
    });
  }

  return { ok: true, questions };
}

export function trimString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
