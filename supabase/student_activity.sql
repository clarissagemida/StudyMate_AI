-- Student announcement read state and learning progress.
-- Run after announcements.sql, teacher_features.sql, profiles_security.sql.

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, student_id)
);
create index if not exists announcement_reads_student_idx
  on public.announcement_reads(student_id, read_at desc);

alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from public, anon, authenticated;
grant select, insert on public.announcement_reads to authenticated;

drop policy if exists announcement_reads_select_own on public.announcement_reads;
create policy announcement_reads_select_own on public.announcement_reads for select to authenticated
using (student_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.approval_status = 'approved'
));
drop policy if exists announcement_reads_insert_own on public.announcement_reads;
create policy announcement_reads_insert_own on public.announcement_reads for insert to authenticated
with check (student_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.approval_status = 'approved'
));

create table if not exists public.student_material_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, material_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index if not exists student_material_progress_student_idx
  on public.student_material_progress(student_id, status, last_opened_at desc);

alter table public.student_material_progress enable row level security;
revoke all on public.student_material_progress from public, anon, authenticated;
grant select, insert, update on public.student_material_progress to authenticated;

drop policy if exists student_material_progress_select_own on public.student_material_progress;
create policy student_material_progress_select_own on public.student_material_progress for select to authenticated
using (student_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.approval_status = 'approved'
));
drop policy if exists student_material_progress_insert_own on public.student_material_progress;
create policy student_material_progress_insert_own on public.student_material_progress for insert to authenticated
with check (student_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.approval_status = 'approved')
  and exists (select 1 from public.materials m where m.id = material_id and m.status = 'published' and m.archived_at is null)
);
drop policy if exists student_material_progress_update_own on public.student_material_progress;
create policy student_material_progress_update_own on public.student_material_progress for update to authenticated
using (student_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.approval_status = 'approved'
))
with check (student_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.approval_status = 'approved')
  and exists (select 1 from public.materials m where m.id = material_id and m.status = 'published' and m.archived_at is null)
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements') then
      alter publication supabase_realtime add table public.announcements;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcement_reads') then
      alter publication supabase_realtime add table public.announcement_reads;
    end if;
  end if;
end $$;
