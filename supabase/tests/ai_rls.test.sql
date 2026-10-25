-- ============================================================================
-- StudyMate AI - manual RLS smoke test for the AI tables
-- ----------------------------------------------------------------------------
-- There is no local database in this project, so these checks are meant to be
-- pasted into the Supabase SQL Editor (or `supabase db execute`) after running
-- ai_usage.sql, ai_reports.sql, ai_settings.sql, and ai_grounding.sql.
--
-- The DO block fails loudly if a table is missing, RLS is off, or a policy is
-- absent. It does NOT impersonate users; the query comments show the manual
-- checks to run by signing in as each role in the app.
-- ============================================================================

do $$
declare
  missing_tables text;
begin
  select string_agg(name, ', ')
  into missing_tables
  from (
    values ('ai_usage'), ('ai_reports'), ('app_settings'), ('material_chunks')
  ) as expected(name)
  where not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = expected.name
      and c.relkind = 'r'
  );

  if missing_tables is not null then
    raise exception 'Missing AI tables: %', missing_tables;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('ai_usage', 'ai_reports', 'app_settings', 'material_chunks')
      and not c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on every AI table.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_usage'
      and policyname = 'ai_usage_select_admin'
  ) then
    raise exception 'ai_usage admin policy is missing.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_reports'
      and policyname = 'ai_reports_insert_self'
  ) then
    raise exception 'ai_reports insert policy is missing.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_update_admin'
  ) then
    raise exception 'app_settings admin update policy is missing.';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_material_chunks'
  ) then
    raise exception 'match_material_chunks function is missing.';
  end if;
end $$;

-- Manual role checks (run each as the described user):
--
-- 1. As a student, this must return only their own reports:
--    select id, user_id, status from public.ai_reports;
--
-- 2. As a student, inserting a report for another user must fail:
--    insert into public.ai_reports (user_id, excerpt, reason)
--    values ('00000000-0000-0000-0000-000000000000', 'test', 'other');
--
-- 3. As a student, ai_usage, app_settings, and unfiltered material_chunks
--    (draft parents) must return zero rows.
--
-- 4. As a teacher, app_settings must return zero rows.
--
-- 5. As an admin, all four tables and the open reports must be visible.
--
-- 6. match_material_chunks must only return chunks whose material status is
--    'published' (publish one material, then call it from the app).
