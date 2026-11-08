-- Unread reaction alerts for the recipient of a message.
-- Run after chat_message_reactions.sql.

-- Include established message threads as contacts even if no quiz or announcement
-- linked the student and teacher yet. This also returns each profile's private photo path.
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
    join public.announcements n on n.teacher_id = me.id join public.announcement_reads r on r.announcement_id = n.id
    join public.profiles p on p.id = r.student_id and p.role = 'student' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'teacher' and me.approval_status = 'approved'
    union
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.teacher_student_messages m on m.teacher_id = me.id
    join public.profiles p on p.id = m.student_id and p.role = 'student' and p.approval_status = 'approved'
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
    join public.announcement_reads r on r.student_id = me.id join public.announcements n on n.id = r.announcement_id
    join public.profiles p on p.id = n.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
    union
    select p.id, p.full_name, p.avatar_path from public.profiles me
    join public.teacher_student_messages m on m.student_id = me.id
    join public.profiles p on p.id = m.teacher_id and p.role = 'teacher' and p.approval_status = 'approved'
    where me.id = auth.uid() and me.role = 'student' and me.approval_status = 'approved'
  ) linked order by lower(coalesce(linked.full_name, ''));
$$;

revoke all on function public.teacher_chat_contacts_with_photos() from public, anon;
revoke all on function public.student_chat_contacts_with_photos() from public, anon;
grant execute on function public.teacher_chat_contacts_with_photos() to authenticated, service_role;
grant execute on function public.student_chat_contacts_with_photos() to authenticated, service_role;

alter table public.teacher_student_message_reactions
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade,
  add column if not exists read_at timestamptz;

update public.teacher_student_message_reactions r
set recipient_id = case when m.sender_id = r.user_id then
  case when m.teacher_id = r.user_id then m.student_id else m.teacher_id end
  else m.sender_id end
from public.teacher_student_messages m
where m.id = r.message_id and r.recipient_id is null;

create or replace function public.set_chat_reaction_recipient()
returns trigger language plpgsql security definer set search_path = public as $$
declare m public.teacher_student_messages%rowtype;
begin
  select * into m from public.teacher_student_messages where id = new.message_id;
  if not found or auth.uid() is distinct from new.user_id
     or auth.uid() not in (m.teacher_id, m.student_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  new.recipient_id := case when m.sender_id = new.user_id
    then case when m.teacher_id = new.user_id then m.student_id else m.teacher_id end
    else m.sender_id end;
  new.read_at := null;
  return new;
end;
$$;

drop trigger if exists chat_reaction_set_recipient on public.teacher_student_message_reactions;
create trigger chat_reaction_set_recipient
before insert or update of user_id, message_id, emoji on public.teacher_student_message_reactions
for each row execute function public.set_chat_reaction_recipient();

create index if not exists chat_reactions_unread_recipient_idx
  on public.teacher_student_message_reactions(recipient_id) where read_at is null;

create or replace function public.mark_chat_reaction_notifications_seen(p_teacher_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() not in (p_teacher_id, p_student_id)
     or not public.can_teacher_student_chat(p_teacher_id, p_student_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  update public.teacher_student_message_reactions r
  set read_at = now()
  from public.teacher_student_messages m
  where m.id = r.message_id and m.teacher_id = p_teacher_id and m.student_id = p_student_id
    and r.recipient_id = auth.uid() and r.read_at is null;
end;
$$;

revoke all on function public.set_chat_reaction_recipient() from public, anon, authenticated;
revoke all on function public.mark_chat_reaction_notifications_seen(uuid, uuid) from public, anon;
grant execute on function public.mark_chat_reaction_notifications_seen(uuid, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
