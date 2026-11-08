-- Optional quiz deadlines used by the teacher editor and student dashboard.
-- Run once in the Supabase SQL Editor; safe to run again.

alter table public.quizzes
  add column if not exists due_at timestamptz;

create index if not exists quizzes_published_due_at_idx
  on public.quizzes (due_at)
  where status = 'published' and due_at is not null;

notify pgrst, 'reload schema';
