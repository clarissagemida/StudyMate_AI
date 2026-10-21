-- ============================================================================
-- StudyMate AI - Quizzes and quiz questions (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent). Nothing is dropped and no existing record,
-- table, trigger, or policy is modified.
--
-- Requires: supabase/profiles_security.sql (this file uses public.is_admin()).
--
-- TABLE public.quizzes
--   id           unique row id
--   teacher_id   which teacher owns the quiz (defaults to the caller)
--   title        quiz title                (2-150 characters)
--   subject      subject name              (1-80 characters)
--   topic        sub-topic                 (optional, up to 120 characters)
--   difficulty   'easy' | 'medium' | 'hard'
--   description  summary shown to students (optional, up to 2000 characters)
--   status       'draft' (visible to its teacher only) or 'published'
--                (visible to every approved student)
--   created_at   insert time (server default)
--   updated_at   last change time (set by the app on every update)
--
-- TABLE public.quiz_questions
--   id            unique row id
--   quiz_id       parent quiz (cascade-deleted with the quiz)
--   position      display order within the quiz (1-based)
--   prompt        the question text          (1-1000 characters)
--   options       jsonb array of 2-6 answer strings
--   correct_index 0-based index into options
--   explanation   why the correct answer is right (optional, up to 1000 chars)
--   created_at    insert time (server default)
--
-- ROW LEVEL SECURITY (stays enabled)
--   quizzes          select published for any signed-in user, own rows for the
--                    owning teacher, everything for administrators; insert
--                    approved teachers only; update/delete owner or admin
--   quiz_questions   visible when the parent quiz is visible to the caller;
--                    write access follows the parent quiz's owner or an admin
--
-- NOTE: This migration only stores quizzes. It does not call any AI service.
--       AI question generation, if added later, writes the same rows through a
--       server-side Edge Function that holds the private key.
-- ============================================================================

create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  title       text not null
              check (char_length(btrim(title)) between 2 and 150),
  subject     text not null
              check (char_length(btrim(subject)) between 1 and 80),
  topic       text not null default ''
              check (char_length(topic) <= 120),
  difficulty  text not null default 'medium'
              check (difficulty in ('easy', 'medium', 'hard')),
  description text not null default ''
              check (char_length(description) <= 2000),
  status      text not null default 'draft'
              check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists quizzes_teacher_id_idx on public.quizzes (teacher_id);
create index if not exists quizzes_status_idx on public.quizzes (status);

create table if not exists public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null
                references public.quizzes (id) on delete cascade,
  position      integer not null default 1 check (position >= 1),
  prompt        text not null
                check (char_length(btrim(prompt)) between 1 and 1000),
  options       jsonb not null
                check (jsonb_typeof(options) = 'array'
                       and jsonb_array_length(options) between 2 and 6),
  correct_index integer not null check (correct_index >= 0),
  explanation   text not null default ''
                check (char_length(explanation) <= 1000),
  created_at    timestamptz not null default now()
);

create index if not exists quiz_questions_quiz_id_idx
  on public.quiz_questions (quiz_id);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;

-- Quizzes: students see published quizzes, teachers see their own (draft and
-- published), administrators see everything.
drop policy if exists "quizzes_select_access" on public.quizzes;
create policy "quizzes_select_access"
  on public.quizzes
  for select
  to authenticated
  using (
    status = 'published'
    or teacher_id = auth.uid()
    or public.is_admin()
  );

-- Create: only an approved teacher may create a quiz for themself.
drop policy if exists "quizzes_insert_teacher" on public.quizzes;
create policy "quizzes_insert_teacher"
  on public.quizzes
  for insert
  to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'teacher'
        and p.approval_status = 'approved'
    )
  );

-- Update: the owning teacher or an administrator.
drop policy if exists "quizzes_update_owner" on public.quizzes;
create policy "quizzes_update_owner"
  on public.quizzes
  for update
  to authenticated
  using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

-- Delete: the owning teacher or an administrator.
drop policy if exists "quizzes_delete_owner" on public.quizzes;
create policy "quizzes_delete_owner"
  on public.quizzes
  for delete
  to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

-- Questions: visible when their parent quiz is visible to the caller.
drop policy if exists "quiz_questions_select_access" on public.quiz_questions;
create policy "quiz_questions_select_access"
  on public.quiz_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.quizzes q
      where q.id = quiz_id
        and (
          q.status = 'published'
          or q.teacher_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- Questions: the owning teacher (or an administrator) may add questions.
drop policy if exists "quiz_questions_insert_owner" on public.quiz_questions;
create policy "quiz_questions_insert_owner"
  on public.quiz_questions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.quizzes q
      where q.id = quiz_id
        and (q.teacher_id = auth.uid() or public.is_admin())
    )
  );

-- Questions: the owning teacher (or an administrator) may edit questions.
drop policy if exists "quiz_questions_update_owner" on public.quiz_questions;
create policy "quiz_questions_update_owner"
  on public.quiz_questions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.quizzes q
      where q.id = quiz_id
        and (q.teacher_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.quizzes q
      where q.id = quiz_id
        and (q.teacher_id = auth.uid() or public.is_admin())
    )
  );

-- Questions: the owning teacher (or an administrator) may delete questions.
drop policy if exists "quiz_questions_delete_owner" on public.quiz_questions;
create policy "quiz_questions_delete_owner"
  on public.quiz_questions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.quizzes q
      where q.id = quiz_id
        and (q.teacher_id = auth.uid() or public.is_admin())
    )
  );

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * The app screens read these tables and show a clear "not configured" notice
--   until this file has been executed.
-- * Quiz attempts/results are NOT part of this migration; they would need a
--   separate table plus policies, approved separately.
-- ============================================================================
