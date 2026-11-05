-- Private one-to-one text messaging for teacher/student pairs already linked
-- through a submitted quiz attempt. Run after teacher_features.sql.

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
  check (sender_id = teacher_id or sender_id = student_id)
);
create index if not exists teacher_student_messages_thread_idx
  on public.teacher_student_messages (teacher_id, student_id, created_at);
alter table public.teacher_student_messages enable row level security;
revoke all on public.teacher_student_messages from public, anon;
grant select, insert on public.teacher_student_messages to authenticated, service_role;

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

create or replace function public.teacher_chat_contacts()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Student')
  from public.profiles me
  join public.quizzes q on q.teacher_id = me.id
  join public.quiz_attempts a on a.quiz_id = q.id
  join public.profiles p on p.id = a.student_id and p.role = 'student' and p.approval_status = 'approved'
  where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
  group by p.id, p.full_name order by lower(coalesce(p.full_name, ''));
$$;
create or replace function public.student_chat_contacts()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Teacher')
  from public.profiles me
  join public.quiz_attempts a on a.student_id = me.id
  join public.quizzes q on q.id = a.quiz_id
  join public.profiles p on p.id = q.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
  where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
  group by p.id, p.full_name order by lower(coalesce(p.full_name, ''));
$$;
revoke all on function public.teacher_chat_contacts() from public, anon;
revoke all on function public.student_chat_contacts() from public, anon;
grant execute on function public.teacher_chat_contacts() to authenticated, service_role;
grant execute on function public.student_chat_contacts() to authenticated, service_role;

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
