export const EMBEDDING_DIMENSIONS = 768;

export type GeminiFailureStatus =
  | "rate_limited"
  | "bad_request"
  | "unavailable"
  | "empty"
  | "timeout";

export type GeminiSuccess = {
  ok: true;
  text: string;
  finishReason?: string;
  promptTokens: number;
  outputTokens: number;
};

export type GeminiFailure = {
  ok: false;
  status: GeminiFailureStatus;
  message: string;
  httpStatus?: number;
  detail?: string;
};

export type GeminiResult = GeminiSuccess | GeminiFailure;

export type GeminiPart = {
  text?: string;
  thought?: boolean;
};

export type GeminiContent = {
  role: "user" | "model";
  parts: { text: string }[];
};

export type GeminiSafetySetting = {
  category: string;
  threshold: string;
};

export type GeminiRequest = {
  apiKey: string;
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  maxOutputTokens: number;
  thinkingLevel?: "low" | "medium" | "high";
  responseMimeType?: string;
  responseSchema?: unknown;
  safetySettings?: GeminiSafetySetting[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export const DEFAULT_SAFETY_SETTINGS: GeminiSafetySetting[] = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
];

type GeminiPayload = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

export function parseGeminiPayload(payload: GeminiPayload): {
  text: string;
  finishReason?: string;
  blockReason?: string;
  promptTokens: number;
  outputTokens: number;
} {
  const candidate = payload.candidates?.[0];

  // Gemini 3 can return internal reasoning parts flagged with thought: true.
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return {
    text,
    finishReason: candidate?.finishReason,
    blockReason: payload.promptFeedback?.blockReason,
    promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export function classifyGeminiHttpError(
  httpStatus: number,
  detail: string,
): GeminiFailure {
  if (httpStatus === 429) {
    return {
      ok: false,
      status: "rate_limited",
      httpStatus,
      message: "The AI usage limit was reached. Please try again later.",
      detail,
    };
  }

  if (httpStatus === 400 || httpStatus === 403 || httpStatus === 404) {
    return {
      ok: false,
      status: "bad_request",
      httpStatus,
      message:
        "Gemini could not process the request. Check the API key, model name, and API access.",
      detail,
    };
  }

  return {
    ok: false,
    status: "unavailable",
    httpStatus,
    message: "The AI service is temporarily unavailable. Please try again.",
    detail,
  };
}

export async function callGemini(request: GeminiRequest): Promise<GeminiResult> {
  const runner = request.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? 45000,
  );

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxOutputTokens,
  };

  if (request.thinkingLevel) {
    // Gemini 3.6+ replaces temperature/topP/topK with an explicit thinking
    // level, and maxOutputTokens also covers thought tokens.
    generationConfig.thinkingConfig = {
      thinkingLevel: request.thinkingLevel,
    };
  }

  if (request.responseMimeType) {
    generationConfig.responseMimeType = request.responseMimeType;
  }

  if (request.responseSchema) {
    generationConfig.responseSchema = request.responseSchema;
  }

  try {
    const response = await runner(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": request.apiKey,
        },
        body: JSON.stringify({
          system_instruction: request.systemInstruction
            ? { parts: [{ text: request.systemInstruction }] }
            : undefined,
          contents: request.contents,
          safetySettings:
            request.safetySettings ?? DEFAULT_SAFETY_SETTINGS,
          generationConfig,
        }),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      return classifyGeminiHttpError(response.status, detail);
    }

    const payload = (await response.json()) as GeminiPayload;
    const parsed = parseGeminiPayload(payload);

    if (!parsed.text) {
      if (parsed.finishReason === "MAX_TOKENS") {
        return {
          ok: false,
          status: "empty",
          message:
            "The AI response was cut off before it could answer. Please try a shorter request.",
          detail: parsed.finishReason,
        };
      }

      if (
        parsed.blockReason ||
        parsed.finishReason === "SAFETY" ||
        parsed.finishReason === "PROHIBITED_CONTENT"
      ) {
        return {
          ok: false,
          status: "empty",
          message: "The AI could not answer that request. Please rephrase it.",
          detail: parsed.blockReason ?? parsed.finishReason,
        };
      }

      return {
        ok: false,
        status: "empty",
        message: "The AI returned no answer. Please try rephrasing your question.",
        detail: parsed.finishReason,
      };
    }

    return {
      ok: true,
      text: parsed.text,
      finishReason: parsed.finishReason,
      promptTokens: parsed.promptTokens,
      outputTokens: parsed.outputTokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        status: "timeout",
        message: "The AI took too long to answer. Please try again.",
      };
    }

    return {
      ok: false,
      status: "unavailable",
      message: "Could not reach the AI service. Please try again.",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildEmbeddingInput(options: {
  model: string;
  text: string;
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
  title?: string;
}): { text: string; useTaskType: boolean } {
  // gemini-embedding-2 rejects taskType; the task instruction must be part
  // of the text instead. Older models still use the taskType field.
  const isEmbedding2 = /embedding-2/i.test(options.model);

  if (!isEmbedding2) {
    return { text: options.text, useTaskType: true };
  }

  if (options.taskType === "RETRIEVAL_QUERY") {
    return {
      text: `task: question answering | query: ${options.text}`,
      useTaskType: false,
    };
  }

  const title = options.title?.trim() || "none";
  return {
    text: `title: ${title} | text: ${options.text}`,
    useTaskType: false,
  };
}

export async function embedText(options: {
  apiKey: string;
  model: string;
  text: string;
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
  title?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; values: number[]; promptTokens: number }
  | { ok: false; message: string; detail?: string }
> {
  const runner = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30000,
  );

  const input = buildEmbeddingInput(options);

  try {
    const response = await runner(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:embedContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        body: JSON.stringify({
          model: `models/${options.model}`,
          content: { parts: [{ text: input.text }] },
          embedContentConfig: {
            ...(input.useTaskType ? { taskType: options.taskType } : {}),
            outputDimensionality: EMBEDDING_DIMENSIONS,
            autoTruncate: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      return {
        ok: false,
        message: "The embedding service could not process the text.",
        detail: `${response.status}: ${detail}`,
      };
    }

    const payload = (await response.json()) as {
      embedding?: { values?: number[] };
      embeddings?: { values?: number[] }[];
    };

    const values = payload.embeddings?.[0]?.values ?? payload.embedding?.values;

    if (!Array.isArray(values) || values.length === 0) {
      return {
        ok: false,
        message: "The embedding service returned an empty vector.",
      };
    }

    return { ok: true, values, promptTokens: 0 };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name === "AbortError"
          ? "The embedding service took too long to respond."
          : "Could not reach the embedding service.",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
