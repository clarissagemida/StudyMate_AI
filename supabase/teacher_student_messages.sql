-- Private one-to-one text messaging for teacher/student pairs already linked
-- through a submitted quiz attempt or an announcement they have read.
-- Run after teacher_features.sql, announcements.sql, and student_activity.sql.

create or replace function public.can_teacher_student_chat(p_teacher_id uuid, p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() in (p_teacher_id, p_student_id) and exists (
    select 1
    from public.profiles t
    join public.profiles s on s.id = p_student_id
    join public.quizzes q on q.teacher_id = t.id
    join public.quiz_attempts a on a.quiz_id = q.id and a.student_id = s.id
    where t.id = p_teacher_id and t.role = 'teacher' and t.approval_status = 'approved'
      and s.role = 'student' and s.approval_status = 'approved'
  ) or (
    auth.uid() in (p_teacher_id, p_student_id) and exists (
      select 1 from public.profiles t
      join public.profiles s on s.id = p_student_id
      join public.announcements n on n.teacher_id = p_teacher_id
      join public.announcement_reads r on r.announcement_id = n.id and r.student_id = s.id
      where t.id = p_teacher_id and t.role = 'teacher' and t.approval_status = 'approved'
        and s.role = 'student' and s.approval_status = 'approved'
    )
  );
$$;
revoke all on function public.can_teacher_student_chat(uuid, uuid) from public, anon;
grant execute on function public.can_teacher_student_chat(uuid, uuid) to authenticated, service_role;

create table if not exists public.teacher_student_messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  check (sender_id = teacher_id or sender_id = student_id)
);
alter table public.teacher_student_messages add column if not exists read_at timestamptz;
alter table public.teacher_student_messages add column if not exists delivered_at timestamptz;
create index if not exists teacher_student_messages_thread_idx
  on public.teacher_student_messages (teacher_id, student_id, created_at);
alter table public.teacher_student_messages enable row level security;
revoke all on public.teacher_student_messages from public, anon;
grant select, insert on public.teacher_student_messages to authenticated, service_role;
revoke update (read_at, delivered_at) on public.teacher_student_messages from authenticated;

drop policy if exists "teacher_student_messages_select_pair" on public.teacher_student_messages;
create policy "teacher_student_messages_select_pair"
  on public.teacher_student_messages for select to authenticated
  using (
    (auth.uid() = teacher_id or auth.uid() = student_id)
    and public.can_teacher_student_chat(teacher_id, student_id)
  );
drop policy if exists "teacher_student_messages_insert_pair" on public.teacher_student_messages;
create policy "teacher_student_messages_insert_pair"
  on public.teacher_student_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (sender_id = teacher_id or sender_id = student_id)
    and public.can_teacher_student_chat(teacher_id, student_id)
  );

drop policy if exists "teacher_student_messages_mark_received_read" on public.teacher_student_messages;

create or replace function public.mark_chat_messages_delivered(p_message_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.teacher_student_messages m set delivered_at = now()
  where m.id = any(coalesce(p_message_ids, '{}'::uuid[]))
    and m.sender_id <> auth.uid() and m.delivered_at is null
    and (m.teacher_id = auth.uid() or m.student_id = auth.uid())
    and public.can_teacher_student_chat(m.teacher_id, m.student_id);
end;
$$;

create or replace function public.mark_chat_messages_seen(p_teacher_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() not in (p_teacher_id, p_student_id)
    or not public.can_teacher_student_chat(p_teacher_id, p_student_id) then
    raise exception 'Conversation access denied';
  end if;
  update public.teacher_student_messages m
  set delivered_at = coalesce(m.delivered_at, now()), read_at = coalesce(m.read_at, now())
  where m.teacher_id = p_teacher_id and m.student_id = p_student_id
    and m.sender_id <> auth.uid() and (m.read_at is null or m.delivered_at is null);
end;
$$;
revoke all on function public.mark_chat_messages_delivered(uuid[]) from public, anon;
revoke all on function public.mark_chat_messages_seen(uuid, uuid) from public, anon;
grant execute on function public.mark_chat_messages_delivered(uuid[]) to authenticated, service_role;
grant execute on function public.mark_chat_messages_seen(uuid, uuid) to authenticated, service_role;

create or replace function public.teacher_chat_contacts()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select linked.id, coalesce(nullif(btrim(linked.full_name), ''), 'Student')
  from (
    select p.id, p.full_name from public.profiles me
    join public.quizzes q on q.teacher_id = me.id join public.quiz_attempts a on a.quiz_id = q.id
    join public.profiles p on p.id = a.student_id and p.role = 'student' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
    union
    select p.id, p.full_name from public.profiles me
    join public.announcements n on n.teacher_id = me.id join public.announcement_reads r on r.announcement_id = n.id
    join public.profiles p on p.id = r.student_id and p.role = 'student' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
  ) linked order by lower(coalesce(linked.full_name, ''));
$$;
create or replace function public.student_chat_contacts()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select linked.id, coalesce(nullif(btrim(linked.full_name), ''), 'Teacher')
  from (
    select p.id, p.full_name from public.profiles me
    join public.quiz_attempts a on a.student_id = me.id join public.quizzes q on q.id = a.quiz_id
    join public.profiles p on p.id = q.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
    union
    select p.id, p.full_name from public.profiles me
    join public.announcement_reads r on r.student_id = me.id join public.announcements n on n.id = r.announcement_id
    join public.profiles p on p.id = n.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
  ) linked order by lower(coalesce(linked.full_name, ''));
$$;

-- Return only linked chat contacts and their private object paths. Clients
-- exchange these paths for short-lived signed URLs from the private bucket.
create or replace function public.teacher_chat_contacts_with_photos()
returns table (id uuid, full_name text, avatar_path text)
language sql stable security definer set search_path = public
as $$
  select linked.id, coalesce(nullif(btrim(linked.full_name), ''), 'Student'), linked.avatar_path
  from (
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.quizzes q on q.teacher_id = me.id join public.quiz_attempts a on a.quiz_id = q.id
    join public.profiles p on p.id = a.student_id and p.role = 'student' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
    union
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.teacher_student_messages m on m.teacher_id = me.id
    join public.profiles p on p.id = m.student_id and p.role = 'student' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
    union
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.announcements n on n.teacher_id = me.id join public.announcement_reads r on r.announcement_id = n.id
    join public.profiles p on p.id = r.student_id and p.role = 'student' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
  ) linked order by lower(coalesce(linked.full_name, ''));
$$;

create or replace function public.student_chat_contacts_with_photos()
returns table (id uuid, full_name text, avatar_path text)
language sql stable security definer set search_path = public
as $$
  select linked.id, coalesce(nullif(btrim(linked.full_name), ''), 'Teacher'), linked.avatar_path
  from (
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.quiz_attempts a on a.student_id = me.id join public.quizzes q on q.id = a.quiz_id
    join public.profiles p on p.id = q.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
    union
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.teacher_student_messages m on m.student_id = me.id
    join public.profiles p on p.id = m.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
    union
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.announcement_reads r on r.student_id = me.id join public.announcements n on n.id = r.announcement_id
    join public.profiles p on p.id = n.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
  ) linked order by lower(coalesce(linked.full_name, ''));
$$;
revoke all on function public.teacher_chat_contacts() from public, anon;
revoke all on function public.student_chat_contacts() from public, anon;
revoke all on function public.teacher_chat_contacts_with_photos() from public, anon;
revoke all on function public.student_chat_contacts_with_photos() from public, anon;
grant execute on function public.teacher_chat_contacts() to authenticated, service_role;
grant execute on function public.student_chat_contacts() to authenticated, service_role;
grant execute on function public.teacher_chat_contacts_with_photos() to authenticated, service_role;
grant execute on function public.student_chat_contacts_with_photos() to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'teacher_student_messages'
    ) then
    alter publication supabase_realtime add table public.teacher_student_messages;
  end if;
end $$;
