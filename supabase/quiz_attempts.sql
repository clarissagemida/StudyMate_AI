-- ============================================================================
-- StudyMate AI - Quiz attempts and results (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent). Nothing is dropped and no existing record,
-- table, trigger, or policy is modified.
--
-- Requires: supabase/quizzes.sql (uses public.quizzes / public.quiz_questions)
--           supabase/profiles_security.sql (uses public.is_admin())
--
-- TABLE public.quiz_attempts
--   id           unique row id
--   quiz_id      the quiz that was taken (kept even if the quiz is edited)
--   student_id   who took it (defaults to the caller)
--   score        number of correct answers at submit time
--   total        number of questions at submit time
--   answers      jsonb array: one entry per question, recording the chosen
--                index and whether it was correct (a snapshot for review)
--   created_at   insert time (server default)
--
-- ROW LEVEL SECURITY (stays enabled)
--   * a student may read and insert only their OWN attempts
--   * administrators may read all attempts
--   * nobody may update or delete attempts from the app (results are final)
--
-- WHY THE SNAPSHOT COLUMNS
--   If a teacher later edits or deletes a quiz, a past attempt must still make
--   sense. Storing score/total/answers at submit time keeps history stable.
--   quiz_id uses ON DELETE CASCADE so a permanently deleted quiz removes the
--   attempts that point at it (there is nothing left to review).
-- ============================================================================

create table if not exists public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null
              references public.quizzes (id) on delete cascade,
  student_id  uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  score       integer not null check (score >= 0),
  total       integer not null check (total >= 0),
  answers     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  check (score <= total)
);

create index if not exists quiz_attempts_student_id_idx
  on public.quiz_attempts (student_id);
create index if not exists quiz_attempts_quiz_id_idx
  on public.quiz_attempts (quiz_id);

alter table public.quiz_attempts enable row level security;

-- Read: your own attempts, or everything if you are an administrator.
drop policy if exists "quiz_attempts_select_access" on public.quiz_attempts;
create policy "quiz_attempts_select_access"
  on public.quiz_attempts
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Create: only for yourself, and only as an approved student.
drop policy if exists "quiz_attempts_insert_self" on public.quiz_attempts;
create policy "quiz_attempts_insert_self"
  on public.quiz_attempts
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and p.approval_status = 'approved'
    )
  );

-- No UPDATE / DELETE policies: results are final and cannot be altered from
-- the app. Administrators manage attempts (if ever needed) via the dashboard.

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * The student quizzes screen shows a clear "not set up" notice until this
--   file has been executed.
-- * This migration stores results only. It does not call any AI service.
-- ============================================================================
