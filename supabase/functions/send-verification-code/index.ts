import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hashCode(userId: string, code: string, secret: string) {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`${userId}:${code}:${secret}`))
    .then((digest) =>
      Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
    const CODE_SECRET = Deno.env.get("VERIFICATION_CODE_SECRET") ?? "";

    if (
      !SUPABASE_URL ||
      !SERVICE_ROLE_KEY ||
      !RESEND_API_KEY ||
      !RESEND_FROM_EMAIL ||
      CODE_SECRET.length < 32
    ) {
      console.error("A required server secret is missing.");
      return respond(500, { error: "Email service is not configured." });
    }

    const body = await req.json();
    const userId = String(body.userId ?? "").trim();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      !uuidPattern.test(userId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return respond(400, { error: "Invalid registration details." });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify that the supplied user ID and email belong together.
    const { data: authData, error: authError } =
      await admin.auth.admin.getUserById(userId);

    if (
      authError ||
      !authData.user?.email ||
      authData.user.email.toLowerCase() !== email
    ) {
      return respond(400, {
        error: "Unable to process this verification request.",
      });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email_verified")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile lookup failed.");
      return respond(400, {
        error: "Unable to process this verification request.",
      });
    }

    if (profile.email_verified === true) {
      return respond(200, { message: "Email is already verified." });
    }

    // Resend cooldown and per-hour limits.
    const now = new Date();
    const nowMs = now.getTime();

    const { data: existing, error: readError } = await admin
      .from("email_verification_codes")
      .select("last_sent_at, window_started_at, send_count")
      .eq("user_id", userId)
      .maybeSingle();

    if (readError) {
      console.error("Could not read verification record.");
      return respond(500, { error: "Could not send the code." });
    }

    if (existing) {
      const lastSentMs = new Date(existing.last_sent_at).getTime();

      if (nowMs - lastSentMs < 60_000) {
        return respond(429, {
          error: "Please wait 60 seconds before requesting another code.",
        });
      }
    }

    let windowStartedAt = now;
    let sendCount = 1;

    if (
      existing &&
      nowMs - new Date(existing.window_started_at).getTime() < 3_600_000
    ) {
      windowStartedAt = new Date(existing.window_started_at);
      sendCount = Number(existing.send_count) + 1;

      if (sendCount > 5) {
        return respond(429, {
          error: "Too many codes requested. Try again in an hour.",
        });
      }
    }

    // Generate a cryptographically random six-digit code.
    const randomBytes = crypto.getRandomValues(new Uint32Array(1));
    const code = String(randomBytes[0] % 1_000_000).padStart(6, "0");
    const codeHash = await hashCode(userId, code, CODE_SECRET);
    const expiresAt = new Date(nowMs + 10 * 60_000).toISOString();

    // Save only the hash, never the plain code.
    const { error: saveError } = await admin
      .from("email_verification_codes")
      .upsert(
        {
          user_id: userId,
          code_hash: codeHash,
          expires_at: expiresAt,
          attempts: 0,
          last_sent_at: now.toISOString(),
          window_started_at: windowStartedAt.toISOString(),
          send_count: sendCount,
        },
        { onConflict: "user_id" },
      );

    if (saveError) {
      console.error("Could not save verification record.");
      return respond(500, { error: "Could not send the code." });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [email],
        subject: "Your StudyMate AI verification code",
        text:
          `Your StudyMate AI verification code is ${code}.\n\n` +
          "It expires in 10 minutes. Do not share this code with anyone.",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#173b2b">
            <h2 style="color:#176B45">StudyMate AI</h2>
            <p>Use this code to verify your email address:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:18px;background:#F4F8F5;text-align:center">
              ${code}
            </div>
            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p>If you did not request this code, you can ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend rejected the email:", errorText);
      return respond(502, {
        error: "The email could not be sent. Please try again later.",
      });
    }

    return respond(200, {
      message: "If the request is valid, a verification code has been sent.",
    });
  } catch (error) {
    console.error("Send verification function failed:", error);
    return respond(500, { error: "An unexpected error occurred." });
  }
});
