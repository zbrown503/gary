-- Switch doc_chunks.embedding to Voyage AI voyage-4 (1024 dimensions).
-- Safe to run now: doc_chunks is empty until Milestone 2 starts indexing.
drop index if exists public.doc_chunks_embedding_idx;
alter table public.doc_chunks alter column embedding type extensions.vector(1024) using null;
create index doc_chunks_embedding_idx on public.doc_chunks using hnsw (embedding extensions.vector_cosine_ops);
