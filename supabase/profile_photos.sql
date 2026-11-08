-- Private profile photo storage for student and teacher accounts.
-- Run after profiles_security.sql and teacher_student_messages.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_select on storage.objects;
create policy profile_photos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1
        from public.profiles viewer
        join public.profiles owner
          on owner.id::text = (storage.foldername(name))[1]
        where viewer.id = auth.uid()
          and viewer.approval_status = 'approved'
          and owner.approval_status = 'approved'
          and (
            (viewer.role = 'teacher' and owner.role = 'student'
              and public.can_teacher_student_chat(viewer.id, owner.id))
            or
            (viewer.role = 'student' and owner.role = 'teacher'
              and public.can_teacher_student_chat(owner.id, viewer.id))
          )
      )
    )
  );

drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('student', 'teacher')
    )
  );

drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
