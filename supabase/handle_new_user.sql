-- ============================================================================
-- StudyMate AI - New registration -> pending admin approval
-- ----------------------------------------------------------------------------
-- Run this once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- WHAT IT DOES
--   Whenever a student/teacher signs up (a new row in auth.users), this trigger
--   automatically creates a matching row in public.profiles with:
--       email           = the sign-up email address
--       role            = the requested role ('student' or 'teacher')
--       requested_role  = the requested role
--       approval_status = 'pending'
--   A second trigger keeps profiles.email in sync when the address changes
--   later in Supabase Auth, and a back-fill repairs rows created before the
--   email column existed.
--   The account then appears in the admin app's "Pending" list, where the
--   administrator can Approve or Reject it. No one ever has to edit the
--   Supabase table by hand.
--
-- SECURITY
--   * Runs as SECURITY DEFINER so it can insert even with RLS enabled.
--   * NEVER trusts the client for privilege: 'admin' is rejected and forced to
--     'student', so nobody can self-register as an administrator.
--   * Every new account starts 'pending' and cannot sign in until an admin
--     approves it (the login screen enforces this).
-- ============================================================================

-- Ensure the email column exists (older projects pre-date it).
alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested text;
  v_full_name text;
  v_student_id text;
begin
  -- Requested role, restricted to the two safe values.
  v_requested := lower(coalesce(new.raw_user_meta_data->>'requested_role', 'student'));
  if v_requested not in ('student', 'teacher') then
    v_requested := 'student';
  end if;

  v_full_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_student_id := nullif(trim(coalesce(new.raw_user_meta_data->>'student_id', '')), '');

  insert into public.profiles (
    id,
    email,
    full_name,
    student_id,
    role,
    requested_role,
    approval_status
  )
  values (
    new.id,
    new.email,
    coalesce(v_full_name, 'New User'),
    v_student_id,
    v_requested,     -- role is granted with approval gating via approval_status
    v_requested,
    'pending'        -- admin must approve before the account can be used
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Attach the trigger to new auth users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Keep profiles.email in sync when the address changes in Supabase Auth
-- (e.g. the user confirms or edits their email from the auth screens).
-- ----------------------------------------------------------------------------
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = new.email
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_email on auth.users;
create trigger sync_profile_email
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email();

-- ----------------------------------------------------------------------------
-- OPTIONAL: back-fill profiles for any auth users that don't have a row yet.
-- Useful if you registered accounts before this trigger existed.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, student_id, role, requested_role, approval_status)
select
  u.id,
  u.email,
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), 'New User'),
  nullif(trim(u.raw_user_meta_data->>'student_id'), ''),
  case
    when lower(coalesce(u.raw_user_meta_data->>'requested_role','student')) = 'teacher'
      then 'teacher'
    else 'student'
  end,
  case
    when lower(coalesce(u.raw_user_meta_data->>'requested_role','student')) = 'teacher'
      then 'teacher'
    else 'student'
  end,
  'pending'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Repair profiles created before profiles.email existed (or before the
-- sync trigger above was added).
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and u.email is not null
   and (p.email is null or p.email is distinct from u.email);

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * Recommended companion settings:
--     Authentication -> Providers -> Email -> turn OFF "Confirm email" so that
--     sign-up does not depend on the low free-tier email limit. Admin approval
--     is what actually gates access, so this is safe.
-- * All admin/student protections are in supabase/profiles_security.sql. Run
--   both files (order does not matter).
-- ============================================================================
