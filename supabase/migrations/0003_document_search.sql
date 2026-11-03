-- Milestone 2: document indexing fields and search.
-- Both functions run as the calling user (security invoker), so row-level security applies.

alter table public.documents
  add column if not exists chunk_count integer not null default 0,
  add column if not exists error text;

alter table public.doc_chunks
  add column if not exists chunk_index integer not null default 0,
  add column if not exists page_end integer,
  add column if not exists section_page integer;

create index if not exists doc_chunks_section_idx on public.doc_chunks (project_id, section);
create index if not exists doc_chunks_unembedded_idx on public.doc_chunks (document_id) where embedding is null;

-- Exact section lookup: "08 71 00" returns that section's chunks in page order.
-- Also matches sub-sections like "01 50 00.01" when asked for "01 50 00".
create or replace function public.search_doc_section(p_project_id uuid, p_section text, p_limit integer default 20)
returns table (
  id uuid, document_id uuid, document_name text, section text, title text,
  page integer, page_end integer, section_page integer, text text, score double precision, match_type text
)
language sql stable security invoker set search_path = public
as $$
  select c.id, c.document_id, d.name, c.section, c.title, c.page, c.page_end, c.section_page, c.text,
         1.0::double precision, 'section'::text
  from doc_chunks c
  join documents d on d.id = c.document_id
  where c.project_id = p_project_id
    and (c.section = p_section or c.section like p_section || '.%')
  order by c.section, d.name, c.chunk_index
  limit p_limit;
$$;

-- Hybrid search: keyword (exact words, product names, numbers) + meaning (Voyage embeddings),
-- merged with reciprocal rank fusion. Pass p_embedding = null for keyword-only search.
create or replace function public.search_doc_chunks(
  p_project_id uuid,
  p_query text,
  p_embedding extensions.vector(1024) default null,
  p_limit integer default 8
)
returns table (
  id uuid, document_id uuid, document_name text, section text, title text,
  page integer, page_end integer, section_page integer, text text, score double precision, match_type text
)
language sql stable security invoker set search_path = public, extensions
as $$
  with q as (
    -- Quoted text ("08 71 00") must match as a phrase; otherwise any word can match
    -- and chunks matching more of the words rank higher.
    select case
      when position('"' in p_query) > 0 then websearch_to_tsquery('english', p_query)
      else nullif(replace(plainto_tsquery('english', p_query)::text, ' & ', ' | '), '')::tsquery
    end as tsq
  ),
  kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as r
    from doc_chunks c, q
    where c.project_id = p_project_id and c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc
    limit 40
  ),
  vec as (
    select v.id, row_number() over (order by v.dist) as r
    from (
      select c.id, c.embedding <=> p_embedding as dist
      from doc_chunks c
      where p_embedding is not null and c.project_id = p_project_id and c.embedding is not null
      order by c.embedding <=> p_embedding
      limit 40
    ) v
  ),
  fused as (
    select coalesce(kw.id, vec.id) as id,
           coalesce(1.0 / (60 + kw.r), 0) + coalesce(1.0 / (60 + vec.r), 0) as score,
           case when kw.id is not null and vec.id is not null then 'both'
                when kw.id is not null then 'keyword' else 'meaning' end as match_type
    from kw full outer join vec on kw.id = vec.id
  )
  select c.id, c.document_id, d.name, c.section, c.title, c.page, c.page_end, c.section_page, c.text,
         f.score::double precision, f.match_type
  from fused f
  join doc_chunks c on c.id = f.id
  join documents d on d.id = c.document_id
  order by f.score desc
  limit p_limit;
$$;

grant execute on function public.search_doc_section(uuid, text, integer) to authenticated;
grant execute on function public.search_doc_chunks(uuid, text, extensions.vector, integer) to authenticated;
