-- Admin activity feed for student and teacher account changes.
-- Run this file once in Supabase SQL Editor after profiles_security.sql.

create table if not exists public.admin_activity_notifications (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'User',
  actor_role text not null check (actor_role in ('teacher', 'student')),
  event_type text not null check (event_type in ('account_created', 'profile_updated', 'account_status_changed', 'password_changed')),
  title text not null,
  details text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_activity_notifications_unread_idx
  on public.admin_activity_notifications(created_at desc) where read_at is null;
create index if not exists admin_activity_notifications_actor_idx
  on public.admin_activity_notifications(actor_id, created_at desc);

alter table public.admin_activity_notifications enable row level security;
revoke all on public.admin_activity_notifications from public, anon;
revoke all on public.admin_activity_notifications from authenticated;
grant select on public.admin_activity_notifications to authenticated;
grant update(read_at) on public.admin_activity_notifications to authenticated;
grant all on public.admin_activity_notifications to service_role;

drop policy if exists admin_activity_notifications_admin_read on public.admin_activity_notifications;
create policy admin_activity_notifications_admin_read
  on public.admin_activity_notifications for select to authenticated
  using (public.is_admin());

drop policy if exists admin_activity_notifications_admin_mark_read on public.admin_activity_notifications;
create policy admin_activity_notifications_admin_mark_read
  on public.admin_activity_notifications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.notify_admin_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_json jsonb := to_jsonb(new);
  old_json jsonb;
  user_role text;
  user_name text;
  changed_fields text[] := '{}';
  field_name text;
  event_name text;
  event_title text;
  event_details text;
begin
  user_role := coalesce(nullif(new_json ->> 'role', ''), nullif(new_json ->> 'requested_role', ''));
  if user_role is null or user_role not in ('teacher', 'student') then return new; end if;
  user_name := coalesce(nullif(btrim(new_json ->> 'full_name'), ''), initcap(user_role));

  if tg_op = 'INSERT' then
    event_name := 'account_created';
    event_title := 'New ' || user_role || ' account registered';
    event_details := user_name || ' registered as a ' || user_role || '.';
  else
    old_json := to_jsonb(old);
    foreach field_name in array array['full_name', 'student_id', 'department', 'subjects', 'bio', 'avatar_path'] loop
      if old_json -> field_name is distinct from new_json -> field_name then
        changed_fields := array_append(changed_fields, replace(initcap(replace(field_name, '_', ' ')), 'Id', 'ID'));
      end if;
    end loop;

    if old_json -> 'approval_status' is distinct from new_json -> 'approval_status'
       or old_json -> 'role' is distinct from new_json -> 'role' then
      event_name := 'account_status_changed';
      event_title := initcap(user_role) || ' account status changed';
      event_details := user_name || '''s account status was updated by an administrator.';
    elsif cardinality(changed_fields) > 0 then
      event_name := 'profile_updated';
      event_title := initcap(user_role) || ' profile updated';
      event_details := user_name || ' updated: ' || array_to_string(changed_fields, ', ') || '.';
    else
      return new;
    end if;
  end if;

  insert into public.admin_activity_notifications(actor_id, actor_name, actor_role, event_type, title, details)
  values (new.id, user_name, user_role, event_name, event_title, event_details);
  return new;
end;
$$;

drop trigger if exists profiles_admin_activity on public.profiles;
create trigger profiles_admin_activity
  after insert or update on public.profiles
  for each row execute function public.notify_admin_profile_activity();
revoke all on function public.notify_admin_profile_activity() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'admin_activity_notifications'
    ) then
    alter publication supabase_realtime add table public.admin_activity_notifications;
  end if;
end $$;
