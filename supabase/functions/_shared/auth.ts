import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2";
import { json } from "./http.ts";

export type CallerProfile = {
  id: string;
  role: "student" | "teacher" | "admin" | string;
  approval_status: "pending" | "approved" | "rejected" | string;
  full_name?: string | null;
};

export type AuthenticatedCaller = {
  user: User;
  profile: CallerProfile;
  admin: SupabaseClient;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export function createAdminClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function authenticate(
  req: Request,
  config: SupabaseConfig,
): Promise<AuthenticatedCaller | Response> {
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    console.error("Required Supabase environment variables are missing.");
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return json({ error: "Please sign in to use this feature." }, 401);
  }

  const callerClient = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: authError,
  } = await callerClient.auth.getUser();

  if (authError || !user) {
    return json({ error: "Your session is invalid or expired." }, 401);
  }

  const admin = createAdminClient(config);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, approval_status, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Profile lookup failed:", profileError.code);
    return json({ error: "Your account could not be verified." }, 500);
  }

  if (!profile) {
    return json({ error: "Your profile could not be found." }, 403);
  }

  return {
    user,
    profile: profile as CallerProfile,
    admin,
  };
}

export function requireApprovedRole(
  caller: AuthenticatedCaller,
  role: "student" | "teacher" | "admin",
): Response | null {
  if (caller.profile.role !== role || caller.profile.approval_status !== "approved") {
    return json({ error: `This feature is available to approved ${role}s only.` }, 403);
  }

  return null;
}
