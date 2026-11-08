-- Lightweight reactions for existing one-to-one teacher/student messages.
-- Run after teacher_student_messages.sql.

create table if not exists public.teacher_student_message_reactions (
  message_id uuid not null references public.teacher_student_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists teacher_student_message_reactions_message_idx
  on public.teacher_student_message_reactions(message_id);

alter table public.teacher_student_message_reactions enable row level security;
revoke all on public.teacher_student_message_reactions from public, anon, authenticated;
grant select on public.teacher_student_message_reactions to authenticated, service_role;

drop policy if exists teacher_student_message_reactions_select_thread
  on public.teacher_student_message_reactions;
create policy teacher_student_message_reactions_select_thread
  on public.teacher_student_message_reactions for select to authenticated
  using (exists (
    select 1
    from public.teacher_student_messages m
    where m.id = message_id
      and auth.uid() in (m.teacher_id, m.student_id)
      and public.can_teacher_student_chat(m.teacher_id, m.student_id)
  ));

create or replace function public.toggle_chat_message_reaction(
  p_message_id uuid,
  p_emoji text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_student_id uuid;
  v_existing_emoji text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '😮', '😢') then
    raise exception 'This reaction is not supported' using errcode = '22023';
  end if;

  -- Serialize changes to this message so a rapid double tap reliably toggles.
  select m.teacher_id, m.student_id
    into v_teacher_id, v_student_id
  from public.teacher_student_messages m
  where m.id = p_message_id
  for update;

  if not found
    or auth.uid() not in (v_teacher_id, v_student_id)
    or not public.can_teacher_student_chat(v_teacher_id, v_student_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  select r.emoji into v_existing_emoji
  from public.teacher_student_message_reactions r
  where r.message_id = p_message_id and r.user_id = auth.uid()
  for update;

  if found then
    if v_existing_emoji = p_emoji then
      delete from public.teacher_student_message_reactions
      where message_id = p_message_id and user_id = auth.uid();
    else
      update public.teacher_student_message_reactions
      set emoji = p_emoji, created_at = now()
      where message_id = p_message_id and user_id = auth.uid();
    end if;
  else
    insert into public.teacher_student_message_reactions(message_id, user_id, emoji)
    values (p_message_id, auth.uid(), p_emoji);
  end if;
end;
$$;

revoke all on function public.toggle_chat_message_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_chat_message_reaction(uuid, text) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'teacher_student_message_reactions'
    ) then
    alter publication supabase_realtime add table public.teacher_student_message_reactions;
  end if;
end $$;

notify pgrst, 'reload schema';
