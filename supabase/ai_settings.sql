-- ============================================================================
-- StudyMate AI - AI runtime settings (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- Requires: supabase/profiles_security.sql (uses public.is_admin()).
--
-- TABLE public.app_settings
--   Small key/value store. Edge Functions read it with the service role so
--   administrators can switch models or disable AI without a redeploy.
--
-- ROW LEVEL SECURITY
--   administrators may select, insert, update, and delete
--   everyone else has no policy (and therefore no access)
-- ============================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_admin" on public.app_settings;
create policy "app_settings_select_admin"
  on public.app_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "app_settings_insert_admin" on public.app_settings;
create policy "app_settings_insert_admin"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "app_settings_update_admin" on public.app_settings;
create policy "app_settings_update_admin"
  on public.app_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "app_settings_delete_admin" on public.app_settings;
create policy "app_settings_delete_admin"
  on public.app_settings
  for delete
  to authenticated
  using (public.is_admin());

insert into public.app_settings (key, value)
values
  ('ai_enabled', 'true'::jsonb),
  ('ai_student_enabled', 'true'::jsonb),
  ('ai_teacher_enabled', 'true'::jsonb),
  ('ai_model', '"gemini-3.8-flash"'::jsonb),
  ('ai_embedding_model', '"gemini-embedding-2"'::jsonb)
on conflict (key) do nothing;
