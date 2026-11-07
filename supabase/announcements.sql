-- StudyMate AI announcements. Run in Supabase SQL Editor.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists announcements_created_at_idx on public.announcements(created_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from public, anon;
grant select, insert, update, delete on public.announcements to authenticated;
drop policy if exists announcements_read_approved on public.announcements;
create policy announcements_read_approved on public.announcements for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approval_status = 'approved' and p.role in ('teacher','student','admin')));
drop policy if exists announcements_teacher_insert on public.announcements;
create policy announcements_teacher_insert on public.announcements for insert to authenticated
with check (teacher_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.approval_status = 'approved'));
drop policy if exists announcements_teacher_update on public.announcements;
create policy announcements_teacher_update on public.announcements for update to authenticated
using (teacher_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.approval_status = 'approved'))
with check (teacher_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.approval_status = 'approved'));
drop policy if exists announcements_teacher_delete on public.announcements;
create policy announcements_teacher_delete on public.announcements for delete to authenticated
using (teacher_id = auth.uid() or public.is_admin());
