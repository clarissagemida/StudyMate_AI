-- ============================================================================
-- StudyMate AI - Approve a registration (grant the matching role)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard:  Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent). Nothing is dropped and no existing record,
-- table, trigger, or policy is modified.
--
-- WHY THIS EXISTS
--   The admin approval screen used to update approval_status only. An approved
--   teacher therefore kept role = 'student' and was routed to the student
--   dashboard by the login screen. This RPC approves a registration AND grants
--   the role that matches the user's stored requested_role, in one atomic
--   statement.
--
-- SECURITY
--   * SECURITY DEFINER so it can write with RLS enabled, but it performs its
--     OWN explicit admin check first - a non-admin calling it is rejected by
--     the function itself, not merely by RLS.
--   * requested_role is read FROM THE DATABASE, never from the client, so a
--     public user can never assign themself teacher or admin.
--   * Only 'student' and 'teacher' are accepted; anything else raises.
--
-- Requires: supabase/profiles_security.sql (this file uses public.is_admin()).
-- ============================================================================

create or replace function public.approve_registration(target_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested text;
  v_role text;
  v_row public.profiles;
begin
  -- 1. Only an approved administrator may approve. Do not trust the client.
  if not public.is_admin() then
    raise exception 'Only administrators can approve registrations'
      using errcode = '42501';
  end if;

  -- 2. Read requested_role from the database (row locked for the write below).
  select requested_role into v_requested
    from public.profiles
   where id = target_id
   for update;

  if v_requested is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  -- 3. Map requested_role -> role, rejecting anything unsupported.
  case v_requested
    when 'teacher' then v_role := 'teacher';
    when 'student' then v_role := 'student';
    else
      raise exception 'Unsupported requested role: %', v_requested
        using errcode = '22023';
  end case;

  -- 4. Approve and grant the matching role atomically.
  update public.profiles
     set role = v_role,
         approval_status = 'approved'
   where id = target_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.approve_registration(uuid) to authenticated;

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * Student approvals still work: requested_role = 'student' keeps
--   role = 'student' and sets approval_status = 'approved'. The existing
--   reject / set-back-to-pending actions are unchanged and still use a plain
--   profiles update.
-- * protect_profile_privileges is untouched: inside this SECURITY DEFINER call
--   auth.uid() is null, so that trigger returns early and does not block the
--   role write.
-- ============================================================================
