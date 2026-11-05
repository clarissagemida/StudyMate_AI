-- Add question types and ordered section difficulty while preserving quiz rows.
-- Run after supabase/quizzes.sql and supabase/quiz_attempts.sql. This is safe
-- on existing projects and also refreshes PostgREST's schema cache.

alter table public.quiz_questions
  add column if not exists question_type text not null default 'multiple_choice';
alter table public.quiz_questions
  add column if not exists answer_text text not null default '';
alter table public.quiz_questions
  add column if not exists section_number integer not null default 1;
alter table public.quiz_questions
  add column if not exists section_difficulty text not null default 'medium';

alter table public.quizzes
  drop constraint if exists quizzes_difficulty_check;
alter table public.quizzes
  add constraint quizzes_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard', 'mixed'));

alter table public.quiz_questions
  drop constraint if exists quiz_questions_section_number_check;
alter table public.quiz_questions
  add constraint quiz_questions_section_number_check
  check (section_number >= 1);
alter table public.quiz_questions
  drop constraint if exists quiz_questions_section_difficulty_check;
alter table public.quiz_questions
  add constraint quiz_questions_section_difficulty_check
  check (section_difficulty in ('easy', 'medium', 'hard'));

alter table public.quiz_questions
  drop constraint if exists quiz_questions_question_type_check;
alter table public.quiz_questions
  add constraint quiz_questions_question_type_check
  check (question_type in ('multiple_choice', 'true_false', 'enumeration', 'identification'));

update public.quiz_questions
set question_type = 'true_false'
where options = '["True", "False"]'::jsonb
  and question_type = 'multiple_choice';

drop function if exists public.get_quiz_questions(uuid);
create function public.get_quiz_questions(p_quiz_id uuid)
returns table (id uuid, "position" integer, prompt text, options jsonb, question_type text)
language sql stable security definer set search_path = public
as $$
  select qq.id, qq.position, qq.prompt, qq.options, qq.question_type
  from public.quiz_questions qq
  join public.quizzes q on q.id = qq.quiz_id
  where qq.quiz_id = p_quiz_id
    and q.status = 'published'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('student', 'teacher')
        and p.approval_status = 'approved'
    )
  order by qq.position asc, qq.created_at asc;
$$;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated, service_role;

create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_attempt_id uuid;
  v_total integer := 0;
  v_score integer := 0;
  v_selected integer;
  v_answer text;
  v_is_correct boolean;
  v_records jsonb := '[]'::jsonb;
  v_review jsonb := '[]'::jsonb;
  v_question record;
begin
  if v_student_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_student_id
      and p.role = 'student' and p.approval_status = 'approved'
  ) then
    raise exception 'Only approved students can submit quizzes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and q.status = 'published') then
    raise exception 'This quiz is not available' using errcode = 'P0002';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be a JSON object' using errcode = '22023';
  end if;
  select count(*) into v_total from public.quiz_questions qq where qq.quiz_id = p_quiz_id;
  if v_total = 0 then
    raise exception 'This quiz does not have any questions' using errcode = 'P0002';
  end if;

  for v_question in
    select qq.id, qq.prompt, qq.options, qq.correct_index, qq.explanation,
      qq.question_type, qq.answer_text
    from public.quiz_questions qq where qq.quiz_id = p_quiz_id
    order by qq.position asc, qq.created_at asc
  loop
    v_selected := null;
    v_answer := null;
    if p_answers ? v_question.id::text then
      if v_question.question_type in ('multiple_choice', 'true_false') then
        begin
          v_selected := (p_answers ->> v_question.id::text)::integer;
        exception when others then v_selected := null;
        end;
        if v_selected is not null and
          (v_selected < 0 or v_selected >= jsonb_array_length(v_question.options)) then
          v_selected := null;
        end if;
        v_is_correct := v_selected is not null and v_selected = v_question.correct_index;
      else
        v_answer := btrim(coalesce(p_answers ->> v_question.id::text, ''));
        if v_question.question_type = 'enumeration' then
          v_is_correct := array(
            select lower(regexp_replace(btrim(part), '\s+', ' ', 'g'))
            from regexp_split_to_table(v_answer, E'[,\n]+') as split(part)
            where btrim(part) <> '' order by 1
          ) = array(
            select lower(regexp_replace(btrim(part), '\s+', ' ', 'g'))
            from regexp_split_to_table(v_question.answer_text, E'[,\n]+') as split(part)
            where btrim(part) <> '' order by 1
          );
        else
          v_is_correct := lower(regexp_replace(v_answer, '\s+', ' ', 'g')) =
            lower(regexp_replace(btrim(v_question.answer_text), '\s+', ' ', 'g'));
        end if;
      end if;
    else
      v_is_correct := false;
    end if;
    if v_is_correct then v_score := v_score + 1; end if;
    v_records := v_records || jsonb_build_array(jsonb_build_object(
      'question_id', v_question.id, 'selected_index', v_selected,
      'text_answer', v_answer, 'correct_index', v_question.correct_index,
      'is_correct', v_is_correct
    ));
    v_review := v_review || jsonb_build_array(jsonb_build_object(
      'id', v_question.id, 'prompt', v_question.prompt,
      'options', v_question.options, 'correctIndex', v_question.correct_index,
      'questionType', v_question.question_type,
      'answerText', v_question.answer_text, 'explanation', v_question.explanation
    ));
  end loop;

  insert into public.quiz_attempts (quiz_id, student_id, score, total, answers)
  values (p_quiz_id, v_student_id, v_score, v_total, v_records)
  returning id into v_attempt_id;
  return jsonb_build_object('attemptId', v_attempt_id, 'score', v_score,
    'total', v_total, 'answers', v_records, 'questions', v_review);
end;
$$;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated, service_role;

-- Make PostgREST refresh its cached table/function definitions immediately.
notify pgrst, 'reload schema';
