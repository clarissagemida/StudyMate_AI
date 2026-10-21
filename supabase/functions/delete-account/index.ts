import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("STUDYMATE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const PHOTO_BUCKET = "profile-photos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "student" | "teacher" | "admin";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type CallerProfile = {
  id: string;
  role: Role | null;
  approval_status: string | null;
};

export function authorizeDeletion(params: {
  callerIsAdmin: boolean;
  callerIsApprovedAdmin: boolean;
  isSelf: boolean;
  targetIsAdmin: boolean;
}): { status: number; message: string } | null {
  const { callerIsAdmin, callerIsApprovedAdmin, isSelf, targetIsAdmin } =
    params;

  if (isSelf) {
    if (callerIsAdmin) {
      return {
        status: 403,
        message:
          "Administrator accounts cannot be deleted from the app. Use the Supabase dashboard.",
      };
    }
  } else if (!callerIsApprovedAdmin) {
    return {
      status: 403,
      message: "Only administrators can delete other accounts.",
    };
  }

  if (targetIsAdmin) {
    return {
      status: 403,
      message:
        "Administrator accounts cannot be deleted here. Use the Supabase dashboard.",
    };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ status: "error", message: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "delete-account: missing SUPABASE_URL or STUDYMATE_SERVICE_ROLE_KEY",
    );
    return json(
      { status: "error", message: "Server is not configured for deletion." },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return json({ status: "error", message: "You must be signed in." }, 401);
  }

  const callerClient = createClient(
    SUPABASE_URL,
    ANON_KEY || SERVICE_ROLE_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !caller) {
    return json(
      { status: "error", message: "Your session could not be verified." },
      401,
    );
  }

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("id, role, approval_status")
    .eq("id", caller.id)
    .maybeSingle<CallerProfile>();

  if (callerProfileError) {
    console.error("delete-account: caller profile lookup failed", {
      code: callerProfileError.code,
    });
    return json(
      { status: "error", message: "Your account could not be verified." },
      500,
    );
  }

  const callerRole = callerProfile?.role ?? null;
  const callerIsApprovedAdmin =
    callerRole === "admin" && callerProfile?.approval_status === "approved";

  let body: { targetId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body means "delete my own account".
  }

  const requestedTargetId =
    typeof body.targetId === "string" && body.targetId.trim().length > 0
      ? body.targetId.trim()
      : caller.id;

  const isSelf = requestedTargetId === caller.id;

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from("profiles")
    .select("id, role, avatar_path")
    .eq("id", requestedTargetId)
    .maybeSingle<{
      id: string;
      role: Role | null;
      avatar_path: string | null;
    }>();

  if (targetProfileError) {
    console.error("delete-account: target profile lookup failed", {
      code: targetProfileError.code,
    });
    return json(
      { status: "error", message: "The account could not be loaded." },
      500,
    );
  }

  const refusal = authorizeDeletion({
    callerIsAdmin: callerRole === "admin",
    callerIsApprovedAdmin,
    isSelf,
    targetIsAdmin: targetProfile?.role === "admin",
  });

  if (refusal) {
    return json({ status: "error", message: refusal.message }, refusal.status);
  }

  const { error: deleteAuthError } =
    await adminClient.auth.admin.deleteUser(requestedTargetId);

  if (deleteAuthError) {
    const message = (deleteAuthError.message ?? "").toLowerCase();
    const alreadyGone =
      message.includes("not found") || message.includes("user not found");

    if (!alreadyGone) {
      console.error("delete-account: auth deletion failed", {
        code: (deleteAuthError as { code?: string }).code,
      });
      return json(
        {
          status: "error",
          message:
            "The account could not be deleted. Nothing was changed. Please try again.",
        },
        500,
      );
    }
  }

  const { error: deleteProfileError } = await adminClient
    .from("profiles")
    .delete()
    .eq("id", requestedTargetId);

  if (deleteProfileError) {
    console.error("delete-account: profile deletion failed", {
      code: deleteProfileError.code,
    });
    return json({
      status: "partial",
      message:
        "The login was deleted, but the profile record could not be removed automatically. An administrator should remove the leftover profile row in Supabase.",
      deletedAuth: true,
      deletedProfile: false,
      removedFiles: false,
    });
  }

  let removedFiles = false;

  const { data: files, error: listError } = await adminClient.storage
    .from(PHOTO_BUCKET)
    .list(requestedTargetId);

  if (!listError && files && files.length > 0) {
    const paths = files.map((file) => `${requestedTargetId}/${file.name}`);
    const { error: removeError } = await adminClient.storage
      .from(PHOTO_BUCKET)
      .remove(paths);
    removedFiles = !removeError;

    if (removeError) {
      console.error("delete-account: storage cleanup failed", {
        message: removeError.message,
      });
    }
  } else if (listError) {
    console.error("delete-account: storage listing failed", {
      message: listError.message,
    });
  }

  return json({
    status: "success",
    message: isSelf
      ? "Your account has been permanently deleted."
      : "The account has been permanently deleted.",
    deletedAuth: true,
    deletedProfile: true,
    removedFiles,
  });
});
