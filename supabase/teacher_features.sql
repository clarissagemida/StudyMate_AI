-- ============================================================================
-- StudyMate AI - Teacher materials, secure quiz grading, and student insights
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- Requires, in this order:
--   profiles_security.sql
--   materials.sql
--   ai_grounding.sql
--   quizzes.sql
--   quiz_attempts.sql
--   ai_usage.sql
--
-- WHAT THIS ADDS
--   * Private "materials" Storage bucket + policies for PDF/DOCX/PPTX files.
--   * Material file metadata, archive support, and extraction status.
--   * Teacher profile fields (department, subjects, bio).
--   * Secure question loading and server-side quiz grading. Students can no
--     longer read correct_index directly from public.quiz_questions or insert
--     quiz_attempts directly; submit_quiz_attempt is the only write path.
--   * Teacher-only RPCs for student attempt analytics without exposing the
--     profiles table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- AI usage ledger: PDF text extraction is a distinct metered feature
-- ----------------------------------------------------------------------------
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'study_buddy',
    'teacher_generator',
    'materials_index',
    'materials_extract'
  ));

-- ----------------------------------------------------------------------------
-- Teacher profile fields
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists department text not null default '';
alter table public.profiles add column if not exists subjects text not null default '';
alter table public.profiles add column if not exists bio text not null default '';

-- ----------------------------------------------------------------------------
-- Material files and archive state
-- ----------------------------------------------------------------------------
alter table public.materials add column if not exists content text not null default '';
alter table public.materials add column if not exists file_path text;
alter table public.materials add column if not exists file_name text not null default '';
alter table public.materials add column if not exists file_mime text not null default '';
alter table public.materials add column if not exists file_size bigint not null default 0;
alter table public.materials add column if not exists archived_at timestamptz;
alter table public.materials add column if not exists extraction_status text not null default 'none';
alter table public.materials add column if not exists extraction_error text not null default '';

create unique index if not exists materials_file_path_idx
  on public.materials (file_path)
  where file_path is not null;

-- Students only see published, non-archived materials. Teachers and admins
-- keep access to drafts, archived rows, and their own files.
drop policy if exists "materials_select_access" on public.materials;
create policy "materials_select_access"
  on public.materials
  for select
  to authenticated
  using (
    (status = 'published' and archived_at is null)
    or teacher_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "material_chunks_select_access" on public.material_chunks;
create policy "material_chunks_select_access"
  on public.material_chunks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.materials m
      where m.id = material_id
        and (
          (m.status = 'published' and m.archived_at is null)
          or m.teacher_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- ----------------------------------------------------------------------------
-- Private Storage bucket for teacher files
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "materials_storage_select" on storage.objects;
create policy "materials_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.materials m
        where m.file_path = name
          and m.status = 'published'
          and m.archived_at is null
      )
    )
  );

drop policy if exists "materials_storage_insert" on storage.objects;
create policy "materials_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'teacher'
        and p.approval_status = 'approved'
    )
  );

drop policy if exists "materials_storage_update" on storage.objects;
create policy "materials_storage_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "materials_storage_delete" on storage.objects;
create policy "materials_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- Quiz answer keys must not be readable by students through PostgREST
-- ----------------------------------------------------------------------------
drop policy if exists "quiz_questions_select_access" on public.quiz_questions;
create policy "quiz_questions_select_access"
  on public.quiz_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.quizzes q
      where q.id = quiz_id
        and (q.teacher_id = auth.uid() or public.is_admin())
    )
  );

-- Safe questions for the taking screen: no correct_index, no explanation.
create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table (
  id uuid,
  "position" integer,
  prompt text,
  options jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select qq.id, qq.position, qq.prompt, qq.options
  from public.quiz_questions qq
  join public.quizzes q on q.id = qq.quiz_id
  where qq.quiz_id = p_quiz_id
    and q.status = 'published'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('student', 'teacher')
        and p.approval_status = 'approved'
    )
  order by qq.position asc, qq.created_at asc;
$$;

revoke all on function public.get_quiz_questions(uuid) from public, anon;
grant execute on function public.get_quiz_questions(uuid)
  to authenticated, service_role;

-- Published question counts for the student quiz list. Students cannot read
-- quiz_questions directly after the policy above, but they may see how many
-- questions each published quiz contains.
create or replace function public.get_published_quiz_question_counts()
returns table (
  quiz_id uuid,
  question_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, count(qq.id)
  from public.quizzes q
  left join public.quiz_questions qq on qq.quiz_id = q.id
  where q.status = 'published'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.approval_status = 'approved'
        and (p.role in ('student', 'teacher') or public.is_admin())
    )
  group by q.id;
$$;

revoke all on function public.get_published_quiz_question_counts()
  from public, anon;
grant execute on function public.get_published_quiz_question_counts()
  to authenticated, service_role;

-- Grade and persist an attempt on the server. p_answers is a JSON object:
--   { "<question uuid>": <selected option index>, ... }
create or replace function public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_attempt_id uuid;
  v_total integer := 0;
  v_score integer := 0;
  v_selected integer;
  v_is_correct boolean;
  v_records jsonb := '[]'::jsonb;
  v_review jsonb := '[]'::jsonb;
  v_question record;
begin
  if v_student_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_student_id
      and p.role = 'student'
      and p.approval_status = 'approved'
  ) then
    raise exception 'Only approved students can submit quizzes'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.quizzes q
    where q.id = p_quiz_id
      and q.status = 'published'
  ) then
    raise exception 'This quiz is not available' using errcode = 'P0002';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be a JSON object' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.quiz_questions qq
  where qq.quiz_id = p_quiz_id;

  if v_total = 0 then
    raise exception 'This quiz does not have any questions' using errcode = 'P0002';
  end if;

  for v_question in
    select qq.id, qq.prompt, qq.options, qq.correct_index, qq.explanation
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
    order by qq.position asc, qq.created_at asc
  loop
    v_selected := null;

    if p_answers ? v_question.id::text then
      begin
        v_selected := (p_answers ->> v_question.id::text)::integer;
      exception
        when others then
          v_selected := null;
      end;

      if v_selected is not null
         and (v_selected < 0 or v_selected >= jsonb_array_length(v_question.options)) then
        v_selected := null;
      end if;
    end if;

    v_is_correct := v_selected is not null
      and v_selected = v_question.correct_index;

    if v_is_correct then
      v_score := v_score + 1;
    end if;

    v_records := v_records || jsonb_build_array(
      jsonb_build_object(
        'question_id', v_question.id,
        'selected_index', v_selected,
        'correct_index', v_question.correct_index,
        'is_correct', v_is_correct
      )
    );

    v_review := v_review || jsonb_build_array(
      jsonb_build_object(
        'id', v_question.id,
        'prompt', v_question.prompt,
        'options', v_question.options,
        'correctIndex', v_question.correct_index,
        'explanation', v_question.explanation
      )
    );
  end loop;

  insert into public.quiz_attempts (quiz_id, student_id, score, total, answers)
  values (p_quiz_id, v_student_id, v_score, v_total, v_records)
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attemptId', v_attempt_id,
    'score', v_score,
    'total', v_total,
    'answers', v_records,
    'questions', v_review
  );
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb)
  to authenticated, service_role;

-- submit_quiz_attempt is the only allowed write path. Without this policy a
-- student could bypass grading by inserting an arbitrary score/answers row
-- directly through PostgREST.
drop policy if exists "quiz_attempts_insert_self" on public.quiz_attempts;

-- ----------------------------------------------------------------------------
-- Teacher-only student analytics
-- ----------------------------------------------------------------------------
create or replace function public.teacher_students()
returns table (
  student_id uuid,
  full_name text,
  avatar_path text,
  quiz_count bigint,
  attempt_count bigint,
  average_percent numeric,
  last_attempt_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'teacher'
      and p.approval_status = 'approved'
  ) then
    raise exception 'Only approved teachers can view student insights'
      using errcode = '42501';
  end if;

  return query
    select
      a.student_id,
      coalesce(nullif(btrim(p.full_name), ''), 'Student')::text,
      p.avatar_path,
      count(distinct a.quiz_id)::bigint,
      count(*)::bigint,
      round(
        avg(
          case
            when a.total > 0 then a.score::numeric * 100 / a.total
            else 0
          end
        ),
        1
      )::numeric,
      max(a.created_at)
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id and q.teacher_id = auth.uid()
    join public.profiles p on p.id = a.student_id
    group by a.student_id, p.full_name, p.avatar_path
    order by max(a.created_at) desc;
end;
$$;

revoke all on function public.teacher_students() from public, anon;
grant execute on function public.teacher_students()
  to authenticated, service_role;

create or replace function public.teacher_student_attempts(p_student_id uuid)
returns table (
  quiz_title text,
  score integer,
  total integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'teacher'
      and p.approval_status = 'approved'
  ) then
    raise exception 'Only approved teachers can view student insights'
      using errcode = '42501';
  end if;

  return query
    select q.title, a.score, a.total, a.created_at
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.student_id = p_student_id
      and q.teacher_id = auth.uid()
    order by a.created_at desc
    limit 30;
end;
$$;

revoke all on function public.teacher_student_attempts(uuid) from public, anon;
grant execute on function public.teacher_student_attempts(uuid)
  to authenticated, service_role;

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * Upload paths must start with the teacher's auth uid, e.g.
--   "<teacher uuid>/<timestamp>-lesson.pdf", so Storage policies can scope
--   access without a separate files table.
-- * File extraction is performed by the materials-extract Edge Function. It
--   writes materials.content and extraction_status.
-- * Answers are graded inside submit_quiz_attempt; the app never receives
--   correct_index before submission.
-- ============================================================================
