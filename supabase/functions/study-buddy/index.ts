import { createClient } from "npm:@supabase/supabase-js@2";

// --------------------------------------------------
// 1. SERVER CONFIGURATION
// --------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-3.8-flash";

// --------------------------------------------------
// 2. LIMITS AND CORS
// --------------------------------------------------

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_ITEMS = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `
You are StudyMate AI, a friendly study assistant for students.

Your responsibilities:
- Explain lessons in simple, student-friendly language.
- Give short examples when helpful.
- Help students understand concepts instead of only memorizing answers.
- Generate practice questions when requested.
- Summarize lessons clearly.
- Explain mistakes in a supportive way.
- Be respectful, accurate, and encouraging.
- If you are unsure about something, say so.
- Keep answers organized and concise.
- Do not claim to access a student's grades, files, or school records
  unless that information is explicitly provided in the conversation.
`;

// --------------------------------------------------
// 3. TYPES
// --------------------------------------------------

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

// --------------------------------------------------
// 4. JSON RESPONSE HELPER
// --------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// --------------------------------------------------
// 5. CLEAN CONVERSATION HISTORY
// --------------------------------------------------

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned: ChatMessage[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;

    if (role !== "user" && role !== "assistant") {
      continue;
    }

    if (typeof content !== "string") {
      continue;
    }

    const trimmed = content.trim();

    if (!trimmed) {
      continue;
    }

    cleaned.push({
      role,
      content: trimmed.slice(0, MAX_MESSAGE_CHARS),
    });
  }

  // Keep only the most recent conversation messages.
  const recent = cleaned.slice(-MAX_HISTORY_ITEMS);

  // Gemini conversations should begin with a user message.
  while (recent.length > 0 && recent[0].role !== "user") {
    recent.shift();
  }

  // Remove consecutive messages with the same role.
  // This helps keep the conversation format consistent.
  const normalized: ChatMessage[] = [];

  for (const message of recent) {
    const previous = normalized[normalized.length - 1];

    if (previous && previous.role === message.role) {
      previous.content += "\n\n" + message.content;
      previous.content = previous.content.slice(0, MAX_MESSAGE_CHARS);
    } else {
      normalized.push({ ...message });
    }
  }

  return normalized;
}

// --------------------------------------------------
// 6. STUDYMATE AI EDGE FUNCTION
// --------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle browser and client preflight requests.
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // Accept POST requests only.
  if (req.method !== "POST") {
    return json(
      {
        status: "error",
        message: "Method not allowed.",
      },
      405,
    );
  }

  try {
    // --------------------------------------------------
    // 7. CHECK SERVER CONFIGURATION
    // --------------------------------------------------

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      console.error("Required Supabase environment variables are missing.");

      return json(
        {
          status: "error",
          message: "Server configuration is incomplete.",
        },
        500,
      );
    }

    // --------------------------------------------------
    // 8. VERIFY SIGNED-IN USER
    // --------------------------------------------------

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return json(
        {
          status: "error",
          message: "Please sign in to use StudyMate AI.",
        },
        401,
      );
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await callerClient.auth.getUser();

    if (authError || !caller) {
      return json(
        {
          status: "error",
          message: "Your session is invalid or expired.",
        },
        401,
      );
    }

    // --------------------------------------------------
    // 9. VERIFY STUDENT ROLE AND APPROVAL
    // --------------------------------------------------

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, approval_status")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError) {
      console.error("Study Buddy profile lookup failed:", profileError.code);

      return json(
        {
          status: "error",
          message: "Your account could not be verified.",
        },
        500,
      );
    }

    if (!profile) {
      return json(
        {
          status: "error",
          message: "Your student profile could not be found.",
        },
        403,
      );
    }

    if (profile.role !== "student" || profile.approval_status !== "approved") {
      return json(
        {
          status: "error",
          message: "AI Buddy is available to approved students only.",
        },
        403,
      );
    }

    // --------------------------------------------------
    // 10. CHECK GEMINI CONFIGURATION
    // --------------------------------------------------

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing.");

      return json(
        {
          status: "not_configured",
          message: "StudyMate AI has not been configured yet.",
        },
        503,
      );
    }

    // --------------------------------------------------
    // 11. READ AND VALIDATE REQUEST
    // --------------------------------------------------

    let body: {
      message?: unknown;
      history?: unknown;
    };

    try {
      body = await req.json();
    } catch {
      return json(
        {
          status: "error",
          message: "Invalid request body.",
        },
        400,
      );
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return json(
        {
          status: "error",
          message: "Please type a question.",
        },
        400,
      );
    }

    if (message.length > MAX_MESSAGE_CHARS) {
      return json(
        {
          status: "error",
          message: `Please keep your question under ${MAX_MESSAGE_CHARS} characters.`,
        },
        400,
      );
    }

    // --------------------------------------------------
    // 12. PREPARE GEMINI CONVERSATION
    // --------------------------------------------------

    const history = sanitizeHistory(body.history);

    const contents = [
      ...history.map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }],
      })),
      {
        role: "user",
        parts: [{ text: message }],
      },
    ];

    // --------------------------------------------------
    // 13. SEND REQUEST TO GEMINI
    // --------------------------------------------------

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 800,
          },
        }),
      },
    );

    // --------------------------------------------------
    // 14. HANDLE GEMINI ERRORS
    // --------------------------------------------------

    if (!aiResponse.ok) {
      const errorDetails = await aiResponse.text();

      console.error(
        "Gemini request failed:",
        aiResponse.status,
        errorDetails.slice(0, 1000),
      );

      if (aiResponse.status === 429) {
        return json(
          {
            status: "error",
            message: "The AI usage limit was reached. Please try again later.",
          },
          429,
        );
      }

      if (
        aiResponse.status === 400 ||
        aiResponse.status === 403 ||
        aiResponse.status === 404
      ) {
        return json(
          {
            status: "error",
            message:
              "Gemini could not process the request. Check the API key, model name, and API access.",
          },
          502,
        );
      }

      return json(
        {
          status: "error",
          message:
            "The AI service is temporarily unavailable. Please try again.",
        },
        502,
      );
    }

    // --------------------------------------------------
    // 15. EXTRACT GEMINI ANSWER
    // --------------------------------------------------

    const result = await aiResponse.json();

    const reply = result.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();

    if (!reply) {
      console.error(
        "Gemini returned no text.",
        result.promptFeedback ?? result.candidates?.[0]?.finishReason,
      );

      return json(
        {
          status: "error",
          message:
            "The AI returned no answer. Please try rephrasing your question.",
        },
        502,
      );
    }

    // --------------------------------------------------
    // 16. RETURN SUCCESSFUL ANSWER
    // --------------------------------------------------

    return json(
      {
        status: "ok",
        reply,
      },
      200,
    );
  } catch (error) {
    console.error("Study Buddy request failed:", error);

    return json(
      {
        status: "error",
        message: "Could not reach StudyMate AI. Please try again.",
      },
      502,
    );
  }
});
