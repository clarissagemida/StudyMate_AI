-- ============================================================================
-- StudyMate AI - Grounded study materials with pgvector (ADDITIVE migration)
-- ----------------------------------------------------------------------------
-- Run once in the Supabase dashboard: Project -> SQL Editor -> Run.
-- Safe to re-run (idempotent).
--
-- Requires: supabase/materials.sql
--           supabase/profiles_security.sql (uses public.is_admin())
--
-- CHANGES
--   materials.content   long-form lesson text used for AI grounding
--   material_chunks     embedded passages (768-dimension Gemini Embedding 2)
--
-- ROW LEVEL SECURITY
--   chunks are readable when their parent material is visible to the caller
--   only the service role writes chunks (the materials-index Edge Function)
-- ============================================================================

create extension if not exists vector;

alter table public.materials
  add column if not exists content text not null default '';

do $$
begin
  alter table public.materials
    add constraint materials_content_length
    check (char_length(content) <= 20000);
exception
  when duplicate_object then null;
end $$;

create table if not exists public.material_chunks (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null
               references public.materials (id) on delete cascade,
  chunk_index  integer not null check (chunk_index >= 0),
  content      text not null check (char_length(btrim(content)) > 0),
  embedding    vector(768) not null,
  created_at   timestamptz not null default now(),
  unique (material_id, chunk_index)
);

create index if not exists material_chunks_material_idx
  on public.material_chunks (material_id);

create index if not exists material_chunks_embedding_idx
  on public.material_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.material_chunks enable row level security;

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
          m.status = 'published'
          or m.teacher_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- Retrieval for AI Buddy. SECURITY DEFINER lets approved students read
-- published chunks without exposing drafts; only published material is
-- returned, and the result size is clamped.
create or replace function public.match_material_chunks(
  query_embedding vector(768),
  match_count integer default 4
)
returns table (
  material_id uuid,
  title text,
  chunk_index integer,
  content text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    m.id as material_id,
    m.title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.material_chunks c
  join public.materials m on m.id = c.material_id
  where m.status = 'published'
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 4), 8));
$$;

revoke all on function public.match_material_chunks(vector, integer)
  from public, anon;
grant execute on function public.match_material_chunks(vector, integer)
  to authenticated, service_role;
