-- ============================================================================
-- StudyMate AI - Learning materials (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent). Nothing is dropped and no existing record,
-- table, trigger, or policy is modified.
--
-- Requires: supabase/profiles_security.sql (this file uses public.is_admin()).
--
-- TABLE public.materials
--   id           unique row id
--   teacher_id   which teacher owns the material (defaults to the caller)
--   title        material title           (2-150 characters)
--   subject      subject name             (1-80 characters)
--   topic        sub-topic                (optional, up to 120 characters)
--   description  summary shown to students (optional, up to 2000 characters)
--   status       'draft' (visible to its teacher only) or 'published'
--                (visible to every approved student)
--   created_at   insert time (server default)
--   updated_at   last change time (set by the app on every update)
--
-- ROW LEVEL SECURITY (stays enabled)
--   select   published rows for any signed-in user; own rows for the owning
--            teacher; everything for administrators
--   insert   approved teachers only, and only for their own teacher_id
--   update   the owning teacher or an administrator
--   delete   the owning teacher or an administrator
-- ============================================================================

create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  title       text not null
              check (char_length(btrim(title)) between 2 and 150),
  subject     text not null
              check (char_length(btrim(subject)) between 1 and 80),
  topic       text not null default ''
              check (char_length(topic) <= 120),
  description text not null default ''
              check (char_length(description) <= 2000),
  status      text not null default 'draft'
              check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists materials_teacher_id_idx
  on public.materials (teacher_id);
create index if not exists materials_status_idx
  on public.materials (status);

alter table public.materials enable row level security;

-- Read: students see published material, teachers see their own (draft and
-- published), administrators see everything.
drop policy if exists "materials_select_access" on public.materials;
create policy "materials_select_access"
  on public.materials
  for select
  to authenticated
  using (
    status = 'published'
    or teacher_id = auth.uid()
    or public.is_admin()
  );

-- Create: only an approved teacher may create material for themself.
drop policy if exists "materials_insert_teacher" on public.materials;
create policy "materials_insert_teacher"
  on public.materials
  for insert
  to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'teacher'
        and p.approval_status = 'approved'
    )
  );

-- Update: the owning teacher or an administrator.
drop policy if exists "materials_update_owner" on public.materials;
create policy "materials_update_owner"
  on public.materials
  for update
  to authenticated
  using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

-- Delete: the owning teacher or an administrator.
drop policy if exists "materials_delete_owner" on public.materials;
create policy "materials_delete_owner"
  on public.materials
  for delete
  to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

-- ============================================================================
-- Notes
-- ----------------------------------------------------------------------------
-- * File/PDF attachments are NOT part of this migration. They would need a
--   dedicated Storage bucket plus storage policies; approve that separately.
-- * The app screens read this table and show a clear "not configured" notice
--   until this file has been executed.
-- ============================================================================
