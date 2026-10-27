import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_HISTORY_ITEMS,
  MAX_MESSAGE_CHARS,
  sanitizeHistory,
} from "../supabase/functions/_shared/chat.ts";
import { chunkText } from "../supabase/functions/_shared/chunking.ts";
import {
  bytesToBase64,
  extractPptxSlides,
  MAX_MATERIAL_FILE_BYTES,
  normalizeMaterialMime,
  ooxmlXmlToText,
  validateMaterialFile,
} from "../supabase/functions/_shared/documents.ts";
import {
  callGemini,
  classifyGeminiHttpError,
  embedText,
  parseGeminiPayload,
  uploadGeminiFile,
} from "../supabase/functions/_shared/gemini.ts";
import {
  MAX_QUIZ_QUESTIONS,
  validateGeneratedQuestions,
} from "../supabase/functions/_shared/validation.ts";
import { loadAiSettings } from "../supabase/functions/_shared/settings.ts";
import {
  checkDailyQuota,
  dailyLimitForRole,
  quotaResetAt,
  utcDayStart,
} from "../supabase/functions/_shared/usage.ts";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------- chat

test("sanitizeHistory drops invalid entries and normalizes turns", () => {
  const history = sanitizeHistory([
    { role: "assistant", content: "orphan" },
    { role: "user", content: "  hello  " },
    { role: "system", content: "ignore me" },
    { role: "user", content: "second" },
    { role: "assistant", content: "" },
    { role: "assistant", content: "answer" },
    "nope",
  ]);

  assert.deepEqual(history, [
    { role: "user", content: "hello\n\nsecond" },
    { role: "assistant", content: "answer" },
  ]);
});

test("sanitizeHistory caps history and message length", () => {
  const long = "x".repeat(MAX_MESSAGE_CHARS + 500);
  const input = Array.from({ length: MAX_HISTORY_ITEMS + 10 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: long,
  }));

  const history = sanitizeHistory(input);

  assert.ok(history.length <= MAX_HISTORY_ITEMS);
  assert.equal(history[0].role, "user");
  for (const message of history) {
    assert.ok(message.content.length <= MAX_MESSAGE_CHARS);
  }
});

test("sanitizeHistory ignores non-arrays", () => {
  assert.deepEqual(sanitizeHistory("nope"), []);
  assert.deepEqual(sanitizeHistory(null), []);
});

test("sanitizeHistory drops a trailing user turn before the new question", () => {
  const history = sanitizeHistory([
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "already sent" },
  ]);

  assert.deepEqual(history, [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
  ]);
});

// ----------------------------------------------------------- validation

test("validateGeneratedQuestions accepts a valid quiz", () => {
  const result = validateGeneratedQuestions({
    questions: [
      {
        prompt: "What is 2 + 2?",
        options: ["3", "4", "5", "6"],
        correctIndex: 1,
        explanation: "2 + 2 = 4.",
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].correctIndex, 1);
});

test("validateGeneratedQuestions accepts up to the maximum question count", () => {
  const makeQuestion = (index) => ({
    prompt: `Question ${index + 1}`,
    options: ["A", "B", "C", "D"],
    correctIndex: index % 4,
    explanation: "",
  });

  const atLimit = validateGeneratedQuestions({
    questions: Array.from({ length: MAX_QUIZ_QUESTIONS }, (_, index) =>
      makeQuestion(index)
    ),
  });
  assert.equal(atLimit.ok, true);
  assert.equal(atLimit.questions.length, MAX_QUIZ_QUESTIONS);

  const overLimit = validateGeneratedQuestions({
    questions: Array.from({ length: MAX_QUIZ_QUESTIONS + 1 }, (_, index) =>
      makeQuestion(index)
    ),
  });
  assert.equal(overLimit.ok, false);
});

test("validateGeneratedQuestions rejects bad answer keys and options", () => {
  const badIndex = validateGeneratedQuestions({
    questions: [
      { prompt: "Q", options: ["A", "B"], correctIndex: 2, explanation: "" },
    ],
  });
  assert.equal(badIndex.ok, false);

  const tooFewOptions = validateGeneratedQuestions({
    questions: [
      { prompt: "Q", options: ["A"], correctIndex: 0, explanation: "" },
    ],
  });
  assert.equal(tooFewOptions.ok, false);

  assert.equal(validateGeneratedQuestions({}).ok, false);
});

test("validateGeneratedQuestions allows two-option questions", () => {
  const result = validateGeneratedQuestions({
    questions: [
      { prompt: "True or false?", options: ["True", "False"], correctIndex: 1, explanation: "" },
    ],
  });

  assert.equal(result.ok, true);
});

// -------------------------------------------------------------- chunking

test("chunkText returns no chunks for empty text", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n  "), []);
});

test("chunkText splits long material and respects maxChunks", () => {
  const text = Array.from({ length: 40 }, (_, index) => `Sentence ${index}.`).join(" ");
  const chunks = chunkText(text, { size: 200, overlap: 40, maxChunks: 5 });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.length <= 5);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
});

// ---------------------------------------------------------------- gemini

test("parseGeminiPayload strips thought parts and reads usage", () => {
  const parsed = parseGeminiPayload({
    candidates: [
      {
        content: {
          parts: [
            { text: "internal reasoning", thought: true },
            { text: "Final answer" },
          ],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
  });

  assert.equal(parsed.text, "Final answer");
  assert.equal(parsed.promptTokens, 12);
  assert.equal(parsed.outputTokens, 34);
  assert.equal(parsed.finishReason, "STOP");
});

test("classifyGeminiHttpError maps quota and config failures", () => {
  assert.equal(classifyGeminiHttpError(429, "").status, "rate_limited");
  assert.equal(classifyGeminiHttpError(403, "").status, "bad_request");
  assert.equal(classifyGeminiHttpError(500, "").status, "unavailable");
});

test("callGemini sends thinking config and filters thoughts", async () => {
  let captured;

  const result = await callGemini({
    apiKey: "test-key",
    model: "gemini-3.8-flash",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    maxOutputTokens: 512,
    thinkingLevel: "low",
    fetchImpl: async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "thinking", thought: true }, { text: "hello" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "hello");
  assert.equal(result.promptTokens, 1);
  assert.equal(captured.body.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.equal(captured.body.generationConfig.maxOutputTokens, 512);
  assert.deepEqual(captured.body.contents, [
    { role: "user", parts: [{ text: "hi" }] },
  ]);
});

test("callGemini reports cut-off answers", async () => {
  const result = await callGemini({
    apiKey: "test-key",
    model: "gemini-3.8-flash",
    contents: [{ role: "user", parts: [{ text: "long" }] }],
    maxOutputTokens: 10,
    fetchImpl: async () =>
      jsonResponse({
        candidates: [
          { content: { parts: [] }, finishReason: "MAX_TOKENS" },
        ],
      }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "empty");
  assert.match(result.message, /cut off/i);
});

test("callGemini classifies HTTP 429", async () => {
  const result = await callGemini({
    apiKey: "test-key",
    model: "gemini-3.8-flash",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    maxOutputTokens: 100,
    fetchImpl: async () => new Response("quota", { status: 429 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "rate_limited");
});

test("callGemini retries temporary 503 responses", async () => {
  let calls = 0;

  const result = await callGemini({
    apiKey: "test-key",
    model: "gemini-3.8-flash",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    maxOutputTokens: 100,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;

      if (calls === 1) {
        return new Response("busy", { status: 503 });
      }

      return jsonResponse({
        candidates: [
          { content: { parts: [{ text: "ok" }] }, finishReason: "STOP" },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "ok");
  assert.equal(calls, 2);
});

test("callGemini falls back when the primary model stays unavailable", async () => {
  const urls = [];

  const result = await callGemini({
    apiKey: "test-key",
    model: "gemini-3.8-flash",
    fallbackModel: "gemini-3.6-flash",
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    maxOutputTokens: 100,
    maxAttempts: 1,
    retryDelayMs: 0,
    fetchImpl: async (url) => {
      urls.push(String(url));

      if (String(url).includes("gemini-3.8-flash")) {
        return new Response("busy", { status: 503 });
      }

      return jsonResponse({
        candidates: [
          { content: { parts: [{ text: "fallback" }] }, finishReason: "STOP" },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "fallback");
  assert.deepEqual(
    urls.map((url) => url.split("/models/")[1].split(":")[0]),
    ["gemini-3.8-flash", "gemini-3.6-flash"],
  );
});

test("uploadGeminiFile sends resumable bytes and returns the file URI", async () => {
  const calls = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });

    if (calls.length === 1) {
      return new Response("{}", {
        status: 200,
        headers: { "x-goog-upload-url": "https://upload.example/session" },
      });
    }

    return jsonResponse({
      file: {
        name: "files/abc",
        uri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
        state: "ACTIVE",
      },
    });
  };

  const result = await uploadGeminiFile({
    apiKey: "test-key",
    bytes,
    mimeType: "application/pdf",
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.name, "files/abc");
  assert.match(result.uri, /files\/abc$/);
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/upload/v1beta/files");
  assert.equal(calls[0].init.headers["X-Goog-Upload-Header-Content-Length"], "3");
  assert.equal(calls[1].url, "https://upload.example/session");
  assert.equal(calls[1].init.body, bytes);
});

test("embedText uses task prefixes for embedding-2 queries", async () => {
  let captured;

  const result = await embedText({
    apiKey: "test-key",
    model: "gemini-embedding-2",
    text: "photosynthesis",
    taskType: "RETRIEVAL_QUERY",
    fetchImpl: async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return jsonResponse({ embedding: { values: [0.1, 0.2, 0.3] } });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.values, [0.1, 0.2, 0.3]);
  assert.match(captured.url, /gemini-embedding-2:embedContent$/);
  assert.equal(captured.body.embedContentConfig.taskType, undefined);
  assert.equal(captured.body.embedContentConfig.outputDimensionality, 768);
  assert.equal(captured.body.embedContentConfig.autoTruncate, true);
  assert.equal(
    captured.body.content.parts[0].text,
    "task: question answering | query: photosynthesis",
  );
});

test("embedText uses title prefixes for embedding-2 documents", async () => {
  let captured;

  await embedText({
    apiKey: "test-key",
    model: "gemini-embedding-2",
    text: "Plants use light.",
    title: "Biology",
    taskType: "RETRIEVAL_DOCUMENT",
    fetchImpl: async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return jsonResponse({ embedding: { values: [1] } });
    },
  });

  assert.equal(captured.body.embedContentConfig.taskType, undefined);
  assert.equal(
    captured.body.content.parts[0].text,
    "title: Biology | text: Plants use light.",
  );
});

test("embedText keeps taskType for embedding-001", async () => {
  let captured;

  await embedText({
    apiKey: "test-key",
    model: "gemini-embedding-001",
    text: "photosynthesis",
    taskType: "RETRIEVAL_QUERY",
    fetchImpl: async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return jsonResponse({ embedding: { values: [1] } });
    },
  });

  assert.equal(
    captured.body.embedContentConfig.taskType,
    "RETRIEVAL_QUERY",
  );
  assert.equal(captured.body.content.parts[0].text, "photosynthesis");
});

test("embedText reports empty vectors", async () => {
  const result = await embedText({
    apiKey: "test-key",
    model: "gemini-embedding-2",
    text: "x",
    taskType: "RETRIEVAL_DOCUMENT",
    fetchImpl: async () => jsonResponse({ embedding: { values: [] } }),
  });

  assert.equal(result.ok, false);
});

// -------------------------------------------------------------- settings

function fakeAdmin(result) {
  return {
    from() {
      return {
        select() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

test("loadAiSettings falls back to environment defaults", async () => {
  const settings = await loadAiSettings(
    fakeAdmin({ data: null, error: { code: "42P01" } }),
    { GEMINI_MODEL: "custom-model", AI_ENABLED: "false" },
  );

  assert.equal(settings.model, "custom-model");
  assert.equal(settings.enabled, false);
  assert.equal(settings.embeddingModel, "gemini-embedding-2");
});

test("loadAiSettings applies stored values", async () => {
  const settings = await loadAiSettings(
    fakeAdmin({
      data: [
        { key: "ai_enabled", value: true },
        { key: "ai_student_enabled", value: false },
        { key: "ai_teacher_enabled", value: true },
        { key: "ai_model", value: "gemini-3.8-pro" },
        { key: "ai_embedding_model", value: "gemini-embedding-2" },
      ],
      error: null,
    }),
    {},
  );

  assert.equal(settings.enabled, true);
  assert.equal(settings.studentEnabled, false);
  assert.equal(settings.teacherEnabled, true);
  assert.equal(settings.model, "gemini-3.8-pro");
});

// ---------------------------------------------------------------- quota

test("quota helpers use UTC days", () => {
  const now = new Date("2026-10-25T23:30:00.000Z");
  assert.equal(utcDayStart(now).toISOString(), "2026-10-25T00:00:00.000Z");
  assert.equal(quotaResetAt(now), "2026-10-26T00:00:00.000Z");
  assert.equal(dailyLimitForRole("student"), 30);
  assert.equal(dailyLimitForRole("teacher"), 20);
  assert.equal(dailyLimitForRole("admin"), null);
});

function fakeUsageAdmin(result) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { gte: async () => result };
            },
          };
        },
      };
    },
  };
}

test("checkDailyQuota fails closed when usage cannot be counted", async () => {
  const now = new Date("2026-10-25T23:30:00.000Z");
  const result = await checkDailyQuota(
    fakeUsageAdmin({ count: null, error: { code: "42P01" } }),
    "user-1",
    "student",
    now,
  );

  assert.deepEqual(result, { ok: false, unavailable: true });
});

test("checkDailyQuota blocks at the limit and allows admins", async () => {
  const now = new Date("2026-10-25T23:30:00.000Z");
  const limited = await checkDailyQuota(
    fakeUsageAdmin({ count: 30, error: null }),
    "user-1",
    "student",
    now,
  );

  assert.equal(limited.ok, false);
  assert.equal(limited.limit, 30);
  assert.equal(limited.resetAt, "2026-10-26T00:00:00.000Z");

  const admin = await checkDailyQuota(
    fakeUsageAdmin({ count: 0, error: null }),
    "admin-1",
    "admin",
    now,
  );

  assert.deepEqual(admin, { ok: true });
});

// ---------------------------------------------------------- material files

test("material file validation accepts supported formats", () => {
  const docx = validateMaterialFile({
    name: "Lesson.DOCX",
    mimeType: "application/octet-stream",
    size: 1024,
  });
  assert.equal(docx.ok, true);
  assert.match(docx.mimeType, /wordprocessingml/);

  const pdf = normalizeMaterialMime("notes.pdf", "");
  assert.equal(pdf, "application/pdf");

  const tooBig = validateMaterialFile({
    name: "notes.pdf",
    mimeType: "application/pdf",
    size: MAX_MATERIAL_FILE_BYTES + 1,
  });
  assert.equal(tooBig.ok, false);

  const unsupported = validateMaterialFile({
    name: "notes.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 100,
  });
  assert.equal(unsupported.ok, false);
});

test("OOXML text extraction keeps paragraphs and decodes entities", () => {
  const xml =
    "<w:document><w:body><w:p><w:r><w:t>Plants &amp; light</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Step 1</w:t></w:r><w:r><w:tab/><w:t>Step 2</w:t></w:r></w:p>" +
    "</w:body></w:document>";

  assert.equal(
    ooxmlXmlToText(xml),
    "Plants & light\n\nStep 1\tStep 2",
  );
});

test("PPTX text extraction follows numeric slide order", () => {
  const encoder = new TextEncoder();
  const text =
    "<p:sld><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:sld>";

  const result = extractPptxSlides({
    "ppt/slides/slide10.xml": encoder.encode(text.replace("First slide", "Tenth slide")),
    "ppt/slides/slide2.xml": encoder.encode(text),
  });

  assert.ok(result.indexOf("Slide 1\nFirst slide") < result.indexOf("Slide 2\nTenth slide"));
});

test("bytesToBase64 handles chunks larger than the stack limit", () => {
  const bytes = new Uint8Array(70000);
  bytes.fill(65);

  const encoded = bytesToBase64(bytes);

  assert.equal(encoded.length, Math.ceil(bytes.length / 3) * 4);
  assert.equal(Buffer.from(encoded, "base64").length, bytes.length);
});
