-- ============================================================================
-- StudyMate AI - Admin approval & account security
-- ----------------------------------------------------------------------------
-- Run this once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- It enforces, at the database level, that:
--   1. A student/teacher can read only their own profile.
--   2. Administrators can read every profile.
--   3. Only administrators may change a user's role or approval_status.
--   4. Administrator accounts are IMMUTABLE from the app: not even another
--      admin can change or delete an admin through the client. They can only
--      be managed from the Supabase dashboard (SQL editor / service role).
--   5. No one can create an administrator account from the app.
--
-- Columns used: id, role, approval_status  (confirmed to exist on profiles).
-- Your admin account (e.g. "Clarissa Gemida") should have:
--     role = 'admin'  and  approval_status = 'approved'
-- and is not counted as a student/teacher anywhere in the app.
-- ============================================================================

-- Helper: is the current authenticated user an approved administrator?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.approval_status = 'approved'
  );
$$;

-- Make sure RLS is on.
alter table public.profiles enable row level security;

-- SELECT: own row, or any row when the caller is an admin.
drop policy if exists "profiles_select_access" on public.profiles;
create policy "profiles_select_access"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- UPDATE: own row, or any row when the caller is an admin.
drop policy if exists "profiles_update_access" on public.profiles;
create policy "profiles_update_access"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Guard profile UPDATEs coming from signed-in app users.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT (SQL editor, migrations, service role): allow.
  if auth.uid() is null then
    return new;
  end if;

  -- Admin accounts are immutable from the app.
  if old.role = 'admin' then
    if new.role is distinct from old.role
       or new.approval_status is distinct from old.approval_status then
      raise exception
        'Administrator accounts can only be modified from the Supabase dashboard';
    end if;
    return new;
  end if;

  -- Non-admin accounts: only admins may change role / approval_status.
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.approval_status is distinct from old.approval_status then
      raise exception
        'Only administrators can change a user role or approval status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileges();

-- Block app users from creating administrator accounts.
create or replace function public.protect_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.role = 'admin' or new.requested_role = 'admin') then
    raise exception 'Administrator accounts cannot be created from the app';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_insert on public.profiles;
create trigger protect_profile_insert
  before insert on public.profiles
  for each row
  execute function public.protect_profile_insert();

-- Protect administrators from deletion through the app.
create or replace function public.protect_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and old.role = 'admin' then
    raise exception 'Administrator accounts cannot be deleted from the app';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_admin_delete on public.profiles;
create trigger protect_admin_delete
  before delete on public.profiles
  for each row
  execute function public.protect_admin_delete();

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * New sign-ups should be created by a SECURITY DEFINER trigger on auth.users
--   that forces role in ('student','teacher') and approval_status = 'pending'.
-- * To change or remove an administrator, do it here in the SQL editor, e.g.:
--       update public.profiles set approval_status = 'approved'
--       where full_name = 'Clarissa Gemida' and role = 'admin';
-- * Keep the Supabase service_role key secret; the mobile app must only ever
--   use the publishable (anon) key.
-- ============================================================================
