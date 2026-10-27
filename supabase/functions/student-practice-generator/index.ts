import {
  authenticate,
  requireApprovedRole,
} from "../_shared/auth.ts";
import {
  callGemini,
  DEFAULT_GEMINI_FALLBACK_MODEL,
} from "../_shared/gemini.ts";
import { handlePreflight, json, readJsonBody } from "../_shared/http.ts";
import { loadAiSettings } from "../_shared/settings.ts";
import {
  checkDailyQuota,
  recordUsage,
} from "../_shared/usage.ts";
import { QUIZ_RESPONSE_SCHEMA, trimString } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const MAX_MATERIAL_CHARS = 9000;

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function makeId(i: number) {
  return `pq_${crypto.randomUUID().slice(0, 8)}_${i}`;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SERVICE_ROLE_KEY ||
    !GEMINI_API_KEY
  ) {
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  const caller = await authenticate(req, {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    serviceRoleKey: SERVICE_ROLE_KEY,
  });
  if (caller instanceof Response) return caller;

  const roleError = requireApprovedRole(caller, "student");
  if (roleError) return roleError;

  const settings = await loadAiSettings(caller.admin, {
    AI_ENABLED: Deno.env.get("AI_ENABLED"),
    GEMINI_MODEL: Deno.env.get("GEMINI_MODEL"),
    GEMINI_EMBEDDING_MODEL: Deno.env.get("GEMINI_EMBEDDING_MODEL"),
  });
  if (!settings.enabled) {
    return json({ error: "StudyMate AI is currently disabled." }, 503);
  }
  if (!settings.studentEnabled) {
    return json({ error: "AI is currently disabled for students." }, 403);
  }

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as any;

  const materialId = trimString(body.materialId, 64);
  const difficulty = trimString(body.difficulty, 10) || "medium";
  const questionType = trimString(body.questionType, 20) || "multiple_choice";
  const requestedCount = Number(body.questionCount ?? 10);

  if (!materialId) return json({ error: "Select a material." }, 400);
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return json({ error: "Invalid difficulty." }, 400);
  }
  if (!["multiple_choice", "true_false", "mixed"].includes(questionType)) {
    return json({ error: "Invalid question type." }, 400);
  }
  const questionCount = Math.max(5, Math.min(20, Math.floor(requestedCount || 10)));

  const quota = await checkDailyQuota(
    caller.admin,
    caller.user.id,
    caller.profile.role,
  );
  if (!quota.ok) {
    if ("unavailable" in quota) {
      return json({ error: "AI usage tracking unavailable." }, 503);
    }
    return json(
      {
        error: `Daily AI limit reached (${quota.limit}).`,
        limit: quota.limit,
        resetAt: quota.resetAt,
      },
      429,
    );
  }

  const { data: material, error: mErr } = await caller.admin
    .from("materials")
    .select("id,title,subject,topic,description,content,file_name,file_mime,status")
    .eq("id", materialId)
    .eq("status", "published")
    .maybeSingle();

  if (mErr) return json({ error: "Could not load material." }, 500);
  if (!material) {
    return json({ error: "Material not found or not published." }, 404);
  }

  const lesson = [material.description, material.content]
    .filter((v: any) => v && String(v).trim())
    .join("\n\n")
    .slice(0, MAX_MATERIAL_CHARS);

  if (!lesson.trim()) {
    return json(
      {
        error:
          "This material has no readable text content. Upload/extract text first or choose another material.",
      },
      400,
    );
  }

  let typeInstruction = "";
  if (questionType === "true_false") {
    typeInstruction =
      'Use ONLY true/false questions. Each must have exactly two options: ["True", "False"].';
  } else if (questionType === "multiple_choice") {
    typeInstruction =
      "Use ONLY multiple-choice questions with exactly four options.";
  } else {
    typeInstruction =
      'Mix multiple-choice and true/false. For true/false use exactly two options ["True","False"], for MCQ use exactly four options.';
  }

  const prompt = `You are creating SELF-STUDY PRACTICE QUESTIONS for an APPROVED STUDENT.
You MUST ONLY use the lesson material below. Do NOT use prior knowledge. Do NOT make up facts.
Create EXACTLY ${questionCount} questions at ${difficulty} difficulty.

${typeInstruction}
Each question needs: prompt, options (array), correctIndex (integer), explanation (short, student-friendly).
Base everything strictly on this material:
Title: ${material.title}
Subject: ${material.subject}${material.topic ? `, Topic: ${material.topic}` : ""}

MATERIAL:
${lesson}

Return JSON matching the schema.`;

  const maxTokens = Math.min(32768, 4096 + questionCount * 700);
  const timeoutMs = Math.min(120000, 60000 + questionCount * 1500);

  const result = await callGemini({
    apiKey: GEMINI_API_KEY,
    model: settings.model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction:
      "You generate exam-style practice questions strictly from supplied material. Never output answer keys outside JSON. Never include teacher assessment metadata.",
    maxOutputTokens: maxTokens,
    thinkingLevel: "low",
    responseMimeType: "application/json",
    responseSchema: QUIZ_RESPONSE_SCHEMA,
    timeoutMs,
    fallbackModel: DEFAULT_GEMINI_FALLBACK_MODEL,
    maxAttempts: 4,
    retryDelayMs: 800,
  });

  if (!result.ok) {
    if (result.status === "rate_limited") {
      return json({ error: result.message }, 429);
    }
    if (result.status === "timeout") {
      return json({ error: result.message }, 504);
    }
    return json({ error: result.message }, 502);
  }

  await recordUsage(caller.admin, {
    userId: caller.user.id,
    role: caller.profile.role,
    feature: "student_practice",
    model: settings.model,
    promptTokens: result.promptTokens,
    outputTokens: result.outputTokens,
  });

  let parsed = parseJsonObject(result.text);
  const rawQuestions = (parsed as any)?.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return json({ error: "AI returned an invalid practice set. Try again." }, 502);
  }

  const questions = rawQuestions
    .slice(0, questionCount)
    .map((q: any, idx: number) => {
      const options = Array.isArray(q.options)
        ? q.options
            .filter((o: any) => typeof o === "string")
            .map((o: string) => o.trim())
            .filter(Boolean)
        : [];
      const correctIndex =
        typeof q.correctIndex === "number" && Number.isInteger(q.correctIndex)
          ? q.correctIndex
          : 0;
      const type =
        questionType === "true_false"
          ? "true_false"
          : options.length === 2 &&
              options[0].toLowerCase() === "true" &&
              options[1].toLowerCase() === "false"
            ? "true_false"
            : "multiple_choice";
      return {
        id: makeId(idx),
        prompt: typeof q.prompt === "string" ? q.prompt.trim() : "",
        type,
        options,
        correctIndex:
          correctIndex >= 0 && correctIndex < options.length ? correctIndex : 0,
        explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
        materialRef: material.title,
      };
    })
    .filter((q: any) => q.prompt && q.options.length >= 2);

  if (questions.length === 0) {
    return json(
      {
        error:
          "AI returned no valid questions. Try again with different material or settings.",
      },
      502,
    );
  }

  return json({ status: "ok", questions });
});
