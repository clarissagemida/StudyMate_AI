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

async function hashCode(userId: string, code: string, secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${code}:${secret}`),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    const CODE_SECRET = Deno.env.get("VERIFICATION_CODE_SECRET") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || CODE_SECRET.length < 32) {
      console.error("A required server secret is missing.");
      return respond(500, { error: "Verification service is not configured." });
    }

    const body = await req.json();
    const userId = String(body.userId ?? "").trim();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const code = String(body.code ?? "").trim();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      !uuidPattern.test(userId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(code)
    ) {
      return respond(400, {
        error: "Enter a valid email and six-digit code.",
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } =
      await admin.auth.admin.getUserById(userId);

    if (
      authError ||
      !authData.user?.email ||
      authData.user.email.toLowerCase() !== email
    ) {
      return respond(400, { error: "Invalid or expired verification code." });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email_verified")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return respond(400, { error: "Unable to verify this account." });
    }

    if (profile.email_verified === true) {
      return respond(200, { message: "Your email is already verified." });
    }

    const { data: record, error: recordError } = await admin
      .from("email_verification_codes")
      .select("code_hash, expires_at, attempts")
      .eq("user_id", userId)
      .maybeSingle();

    if (recordError || !record) {
      return respond(400, { error: "Invalid or expired verification code." });
    }

    if (Number(record.attempts) >= 5) {
      return respond(429, {
        error: "Too many incorrect attempts. Request a new code.",
      });
    }

    if (Date.now() > new Date(record.expires_at).getTime()) {
      return respond(400, {
        error: "This code has expired. Request a new code.",
      });
    }

    const submittedHash = await hashCode(userId, code, CODE_SECRET);

    if (submittedHash !== record.code_hash) {
      const nextAttempts = Number(record.attempts) + 1;

      await admin
        .from("email_verification_codes")
        .update({ attempts: nextAttempts })
        .eq("user_id", userId);

      return respond(400, {
        error: `Incorrect code. ${5 - nextAttempts} attempt(s) remaining.`,
      });
    }

    // Confirm Supabase Auth only after the custom code matches.
    const { error: confirmError } = await admin.auth.admin.updateUserById(
      userId,
      { email_confirm: true },
    );

    if (confirmError) {
      console.error("Supabase Auth confirmation failed:", confirmError.message);
      return respond(500, {
        error: "Could not finish verification. Please try again.",
      });
    }

    // This does NOT approve the user's account.
    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", userId);

    if (updateProfileError) {
      console.error("Profile verification update failed.");
      return respond(500, {
        error: "Email confirmation needs to be finalized. Please try again.",
      });
    }

    await admin.from("email_verification_codes").delete().eq("user_id", userId);

    return respond(200, {
      message:
        "Email verified successfully. Your account still requires approval.",
    });
  } catch (error) {
    console.error("Verify registration function failed:", error);
    return respond(500, { error: "An unexpected error occurred." });
  }
});
