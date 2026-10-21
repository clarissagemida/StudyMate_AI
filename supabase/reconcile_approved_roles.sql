-- ============================================================================
-- StudyMate AI - Reconcile approved accounts whose role is out of date
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent). Nothing is dropped and no table, trigger,
-- policy, or existing column definition is modified.
--
-- WHY THIS EXISTS
--   Before supabase/approve_registration.sql was applied, approving an account
--   updated only approval_status. Accounts approved during that period can be
--   left with role <> requested_role - most visibly, a teacher request whose
--   row still has role = 'student'. The login screen routes on profiles.role,
--   so such an account opened the student dashboard even though an admin had
--   approved a teacher request.
--
--   approve_registration() fixes this for future approvals, but it only runs
--   when an admin approves a row. Rows that were ALREADY approved before the
--   RPC existed never re-trigger it, so they need this one-time repair.
--
-- WHAT IT DOES
--   For accounts that are ALREADY approved, it copies requested_role into role
--   when the two disagree. Only the two safe values are considered, so it can
--   never grant 'admin'. Pending and rejected rows are never touched, and no
--   role is granted that an administrator did not already approve.
--
-- SECURITY
--   * This grants no NEW privilege: it only aligns role with the requested_role
--     that the account already carried and that an admin already approved.
--   * 'admin' can never be written here: requested_role is filtered to
--     ('student','teacher').
--   * protect_profile_privileges is a BEFORE UPDATE trigger, but it returns
--     early when auth.uid() is null. The SQL editor / service role has no JWT,
--     so this repair is allowed exactly as intended (same as other migrations).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 - BEFORE: list the accounts that are currently out of date.
-- Run this on its own first to see exactly what will change. Expect the
-- teacher(s) that were approved before the RPC was applied.
-- ----------------------------------------------------------------------------
select id, full_name, email, role, requested_role, approval_status
  from public.profiles
 where approval_status = 'approved'
   and role is distinct from requested_role
 order by full_name;

-- ----------------------------------------------------------------------------
-- STEP 2 - REPAIR: align role with the already-approved requested_role.
-- ----------------------------------------------------------------------------
update public.profiles
   set role = requested_role
 where approval_status = 'approved'
   and requested_role in ('student', 'teacher')
   and role is distinct from requested_role;

-- ----------------------------------------------------------------------------
-- STEP 3 - AFTER: this should now return zero rows.
-- ----------------------------------------------------------------------------
select id, full_name, email, role, requested_role, approval_status
  from public.profiles
 where approval_status = 'approved'
   and role is distinct from requested_role
 order by full_name;

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * New approvals are handled by public.approve_registration() and need no
--   manual repair. This file is only for accounts approved before that RPC
--   existed.
-- * If STEP 3 still lists a row, its requested_role is not 'student'/'teacher'
--   (for example an unexpected legacy value). Inspect it before changing
--   anything by hand.
-- ============================================================================
