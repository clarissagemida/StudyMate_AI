-- ============================================================================
-- StudyMate AI - AI answer reports and moderation (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- Requires: supabase/profiles_security.sql (uses public.is_admin()).
--
-- TABLE public.ai_reports
--   A student can flag an AI answer. The excerpt is the reported answer text
--   (never the full conversation), so moderators have enough context to review.
--
-- ROW LEVEL SECURITY
--   students may insert reports for themselves and read their own reports
--   administrators may read and review every report
-- ============================================================================

create table if not exists public.ai_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  feature     text not null default 'study_buddy'
              check (feature in ('study_buddy', 'teacher_generator')),
  excerpt     text not null
              check (char_length(btrim(excerpt)) between 1 and 2000),
  reason      text not null default 'inaccurate'
              check (reason in ('inaccurate', 'unsafe', 'unhelpful', 'other')),
  status      text not null default 'open'
              check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);

create index if not exists ai_reports_status_idx
  on public.ai_reports (status, created_at desc);
create index if not exists ai_reports_user_idx
  on public.ai_reports (user_id, created_at desc);

alter table public.ai_reports enable row level security;

drop policy if exists "ai_reports_insert_self" on public.ai_reports;
create policy "ai_reports_insert_self"
  on public.ai_reports
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and p.approval_status = 'approved'
    )
  );

drop policy if exists "ai_reports_select_access" on public.ai_reports;
create policy "ai_reports_select_access"
  on public.ai_reports
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ai_reports_update_admin" on public.ai_reports;
create policy "ai_reports_update_admin"
  on public.ai_reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
