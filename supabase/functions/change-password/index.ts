import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handlePreflight, json, readJsonBody } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function hasMinLength(p: string) { return p.length >= 8; }
function hasUpper(p: string) { return /[A-Z]/.test(p); }
function hasLower(p: string) { return /[a-z]/.test(p); }
function hasNumber(p: string) { return /[0-9]/.test(p); }
function hasSpecial(p: string) { return /[^A-Za-z0-9]/.test(p); }

function isStrongEnough(p: string) {
  if (!hasMinLength(p)) return false;
  const met = [hasUpper(p), hasLower(p), hasNumber(p), hasSpecial(p)].filter(Boolean).length;
  return met >= 3;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server configuration is incomplete.' }, 500);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Please sign in.' }, 401);

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: Bearer  } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) return json({ error: 'Session invalid.' }, 401);
  if (!user.email) return json({ error: 'Email required.' }, 400);

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as any;

  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');

  if (!currentPassword) return json({ error: 'Current password is required.' }, 400);
  if (!newPassword) return json({ error: 'New password is required.' }, 400);
  if (!confirmPassword) return json({ error: 'Confirm your new password.' }, 400);
  if (newPassword !== confirmPassword) return json({ error: 'Passwords do not match.' }, 400);
  if (!isStrongEnough(newPassword)) {
    return json({ error: 'Password is too weak. Use at least 8 chars with a mix of letters, numbers, and symbols.' }, 400);
  }

  const verify = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await verify.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInErr) return json({ error: 'Current password is incorrect.' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updErr) return json({ error: 'Failed to update password.' }, 500);

  return json({ status: 'ok', message: 'Password updated successfully.' });
});
