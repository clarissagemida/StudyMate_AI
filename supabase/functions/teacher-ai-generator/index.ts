import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const GEMINI_MODEL = "gemini-3.8-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SERVICE_ROLE_KEY ||
    !GEMINI_API_KEY
  ) {
    return jsonResponse({ error: "Server configuration is incomplete." }, 500);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Please log in first." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Your session is invalid." }, 401);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, approval_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: "Your profile was not found." }, 403);
    }

    if (profile.role !== "teacher" || profile.approval_status !== "approved") {
      return jsonResponse(
        { error: "Only approved teachers can use this feature." },
        403,
      );
    }

    const body = await req.json();
    const mode = body.mode;
    const subject = String(body.subject ?? "").trim();
    const topic = String(body.topic ?? "").trim();
    const difficulty = String(body.difficulty ?? "medium").trim();
    const requestedCount = Number(body.questionCount ?? 5);

    if (!["topic", "quiz"].includes(mode)) {
      return jsonResponse({ error: "Mode must be topic or quiz." }, 400);
    }

    if (!subject || !topic || subject.length > 120 || topic.length > 300) {
      return jsonResponse({ error: "Enter a valid subject and topic." }, 400);
    }

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return jsonResponse({ error: "Invalid difficulty." }, 400);
    }

    const questionCount = Math.max(
      1,
      Math.min(10, Math.floor(requestedCount || 5)),
    );

    const prompt =
      mode === "topic"
        ? `You are a teaching assistant. Create a useful lesson outline.
Subject: ${subject}
Topic: ${topic}
Difficulty/level: ${difficulty}

Include:
1. A clear lesson title
2. Learning objectives
3. Key concepts
4. A short, easy-to-understand explanation
5. Two examples
6. Three review questions

Use accurate, student-friendly language. Format the result clearly.`
        : `You are a teaching assistant creating a draft quiz for teacher review.
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Number of questions: ${questionCount}

Create exactly ${questionCount} multiple-choice questions.
For each question, provide:
- The question
- Four options labeled A, B, C, and D
- The correct answer
- A short explanation of why it is correct

Use accurate content and plausible distractors. Number each question.
Clearly mark this as a draft for teacher review.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    const result = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", result);
      return jsonResponse(
        { error: "AI generation failed. Please try again later." },
        502,
      );
    }

    const generatedText = result?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();

    if (!generatedText) {
      return jsonResponse(
        { error: "The AI returned an empty response. Please try again." },
        502,
      );
    }

    return jsonResponse({
      status: "ok",
      mode,
      content: generatedText,
    });
  } catch (error) {
    console.error("Teacher AI function error:", error);
    return jsonResponse({ error: "An unexpected server error occurred." }, 500);
  }
});
