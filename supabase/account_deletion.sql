-- ============================================================================
-- StudyMate AI - Account deletion support (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent). NO data is deleted. NO RLS is changed. NO auth
-- trigger is changed.
--
-- WHY THIS EXISTS
--   When a teacher account is permanently deleted, the learning materials and
--   quizzes they created must NOT disappear: students may still be using them.
--   Today both tables reference profiles(id) with ON DELETE CASCADE, so
--   deleting the teacher would destroy that shared content.
--
--   This migration makes the owning teacher optional and switches those two
--   foreign keys to ON DELETE SET NULL. The content survives; its creator
--   becomes "Deleted teacher" (teacher_id = NULL).
--
--   The profile row itself is still removed by the delete-account Edge
--   Function after the Auth user is deleted, which frees the email and
--   student_id for re-registration.
--
-- WHAT IT TOUCHES
--   * public.materials.teacher_id  -> nullable, FK ON DELETE SET NULL
--   * public.quizzes.teacher_id    -> nullable, FK ON DELETE SET NULL
--
-- WHAT IT DOES NOT TOUCH
--   * public.profiles (columns, RLS, triggers) - unchanged
--   * public.quiz_questions (cascades from quizzes as before) - unchanged
--   * handle_new_user / sync_profile_email / protect_* triggers - unchanged
--   * protect_admin_delete stays in place: admin rows remain undeletable from
--     the client. The Edge Function runs with no JWT, so it is intentionally
--     exempt and can perform a permanent deletion when authorized.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Allow teacher_id to be empty once the creator is gone.
-- ----------------------------------------------------------------------------
alter table public.materials alter column teacher_id drop not null;
alter table public.quizzes   alter column teacher_id drop not null;

-- ----------------------------------------------------------------------------
-- 2. Switch the foreign keys to ON DELETE SET NULL.
--
--    The constraints were created by the original migrations as
--    materials_teacher_id_fkey / quizzes_teacher_id_fkey. We drop each by its
--    exact name (safe whether or not it exists) and re-add it with the new
--    ON DELETE SET NULL rule. Idempotent: re-running just drops and re-adds.
--    This is metadata-only: no rows are read, written, or removed.
-- ----------------------------------------------------------------------------
alter table public.materials drop constraint if exists materials_teacher_id_fkey;
alter table public.materials
  add constraint materials_teacher_id_fkey
  foreign key (teacher_id) references public.profiles (id) on delete set null;

alter table public.quizzes drop constraint if exists quizzes_teacher_id_fkey;
alter table public.quizzes
  add constraint quizzes_teacher_id_fkey
  foreign key (teacher_id) references public.profiles (id) on delete set null;

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * Existing rows are unaffected: a live teacher still owns their content.
--   Only a deleted teacher's rows become teacher_id = NULL.
-- * The app reads published content regardless of the owner, so students keep
--   access. Teacher dashboards filter by teacher_id = auth.uid(), which stays
--   correct for live teachers.
-- * After running this file, set the delete-account Edge Function secret:
--       SUPABASE_SERVICE_ROLE_KEY = <your service_role key>
--   Never place that key in .env or any client file.
-- ============================================================================
