-- ============================================================================
-- StudyMate AI - AI usage ledger (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- Requires: supabase/profiles_security.sql (uses public.is_admin()).
--
-- TABLE public.ai_usage
--   One row per AI request. Only token counts and routing metadata are stored;
--   prompts and answers are never written to this table.
--
-- ROW LEVEL SECURITY
--   administrators may read all rows
--   no insert/update/delete policies: only the service role (Edge Functions)
--   may write usage, so clients cannot forge or delete their history
-- ============================================================================

create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           text not null check (role in ('student', 'teacher', 'admin')),
  feature        text not null check (feature in (
                   'study_buddy',
                   'teacher_generator',
                   'materials_index',
                   'student_practice'
                 )),
  model          text not null default '',
  prompt_tokens  integer not null default 0 check (prompt_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_created_idx
  on public.ai_usage (created_at desc);
create index if not exists ai_usage_feature_idx
  on public.ai_usage (feature);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_admin" on public.ai_usage;
create policy "ai_usage_select_admin"
  on public.ai_usage
  for select
  to authenticated
  using (public.is_admin());

-- Daily quota queries are indexed by (user_id, created_at).
comment on table public.ai_usage is
  'Per-request AI usage metadata. Written by Edge Functions with the service role only.';
