-- ============================================================================
-- StudyMate AI - Student-generated practice attempts (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- Requires: supabase/materials.sql, supabase/profiles_security.sql
--
-- TABLE public.student_practice_attempts
--   Stores self-generated practice quiz attempts. Never becomes official
--   teacher assessment. Questions/answers stored as snapshots for review.
-- ============================================================================

create table if not exists public.student_practice_attempts (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null default auth.uid()
                    references public.profiles (id) on delete cascade,
  material_id       uuid not null
                    references public.materials (id) on delete cascade,
  difficulty        text not null check (difficulty in ('easy', 'medium', 'hard')),
  question_type     text not null check (question_type in ('multiple_choice', 'true_false', 'mixed')),
  question_count    integer not null check (question_count >= 1),
  correct_count     integer not null check (correct_count >= 0),
  score_percentage  integer not null check (score_percentage >= 0 and score_percentage <= 100),
  duration_seconds  integer check (duration_seconds >= 0),
  questions         jsonb not null default '[]'::jsonb,
  answers           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  check (correct_count <= question_count)
);

create index if not exists student_practice_attempts_student_id_idx
  on public.student_practice_attempts (student_id, created_at desc);
create index if not exists student_practice_attempts_material_id_idx
  on public.student_practice_attempts (material_id);

alter table public.student_practice_attempts enable row level security;

drop policy if exists "student_practice_attempts_select_access" on public.student_practice_attempts;
create policy "student_practice_attempts_select_access"
  on public.student_practice_attempts
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "student_practice_attempts_insert_self" on public.student_practice_attempts;
create policy "student_practice_attempts_insert_self"
  on public.student_practice_attempts
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and p.approval_status = 'approved'
    )
  );
