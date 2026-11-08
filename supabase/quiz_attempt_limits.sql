-- Teacher-configurable quiz attempt limits and secure student status lookup.
-- Run after quizzes.sql, quiz_attempts.sql, and teacher_features.sql.

alter table public.quizzes
  add column if not exists max_attempts integer not null default 1;

alter table public.quizzes
  alter column max_attempts drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quizzes_max_attempts_check'
      and conrelid = 'public.quizzes'::regclass
  ) then
    alter table public.quizzes
      add constraint quizzes_max_attempts_check
      check (max_attempts is null or max_attempts > 0);
  end if;
end $$;

-- A quiz-row lock serializes simultaneous submissions for the same quiz so
-- two requests cannot both pass the attempt-count check at the same time.
create or replace function public.enforce_quiz_attempt_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_attempts integer;
  v_used_attempts bigint;
  v_status text;
begin
  select q.max_attempts, q.status
    into v_max_attempts, v_status
  from public.quizzes q
  where q.id = new.quiz_id
  for update;

  if not found or v_status <> 'published' then
    raise exception 'This quiz is not available' using errcode = 'P0002';
  end if;

  if auth.uid() is not null and new.student_id <> auth.uid() then
    raise exception 'Students can only submit their own attempts' using errcode = '42501';
  end if;

  if v_max_attempts is not null then
    select count(*) into v_used_attempts
    from public.quiz_attempts a
    where a.quiz_id = new.quiz_id and a.student_id = new.student_id;

    if v_used_attempts >= v_max_attempts then
      raise exception 'You have used all allowed attempts for this quiz.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_quiz_attempt_limit() from public, anon, authenticated;

drop trigger if exists quiz_attempts_enforce_limit on public.quiz_attempts;
create trigger quiz_attempts_enforce_limit
  before insert on public.quiz_attempts
  for each row execute function public.enforce_quiz_attempt_limit();

-- Attempts must be written through submit_quiz_attempt, which grades answers
-- on the server. Do not allow clients to insert arbitrary scores directly.
drop policy if exists "quiz_attempts_insert_self" on public.quiz_attempts;
revoke insert on public.quiz_attempts from anon, authenticated;

create or replace function public.student_quiz_attempt_status()
returns table (
  quiz_id uuid,
  attempts_used bigint,
  max_attempts integer,
  can_take boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
      and p.approval_status = 'approved'
  ) then
    raise exception 'Only approved students can view quiz attempt status' using errcode = '42501';
  end if;

  return query
    select q.id,
      count(a.id),
      q.max_attempts,
      q.max_attempts is null or count(a.id) < q.max_attempts
    from public.quizzes q
    left join public.quiz_attempts a
      on a.quiz_id = q.id and a.student_id = auth.uid()
    where q.status = 'published'
    group by q.id, q.max_attempts;
end;
$$;

revoke all on function public.student_quiz_attempt_status() from public, anon;
grant execute on function public.student_quiz_attempt_status() to authenticated, service_role;

notify pgrst, 'reload schema';
