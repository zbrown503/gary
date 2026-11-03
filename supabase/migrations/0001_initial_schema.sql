-- Gary V1 — initial schema (GARY_V1_SPEC.md, "Data model").
-- Run once in the Supabase SQL Editor (or with `supabase db push`).
-- Every table carries user_id; row-level security limits each user to their own rows.

create extension if not exists vector with schema extensions;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  number text,
  address text,
  owner text,
  architect text,
  start_date date,
  substantial_completion date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- documents ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('spec', 'contract', 'plan', 'directory', 'other')),
  file_path text not null,
  page_count integer,
  status text not null default 'uploading' check (status in ('uploading', 'indexing', 'ready', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- doc_chunks ----------
-- Embedding size 1536 matches OpenAI text-embedding-3-small. Change before Milestone 2
-- if you pick a different embedding model.
create table public.doc_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  section text,
  title text,
  page integer,
  text text not null,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('english', coalesce(section, '') || ' ' || coalesce(title, '') || ' ' || text)) stored,
  created_at timestamptz not null default now()
);
create index doc_chunks_fts_idx on public.doc_chunks using gin (fts);
create index doc_chunks_embedding_idx on public.doc_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------- contacts ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  company text,
  trade text,
  role text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- activities (look-ahead) ----------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  trade text,
  start_date date,
  finish_date date,
  duration_days integer,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete', 'on_hold')),
  constraints text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- activity_changes (schedule audit trail) ----------
create table public.activity_changes (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  reason text,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz
);

-- ---------- notes (field capture) ----------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text,
  audio_path text,
  tag text check (tag in ('todo', 'rfi_candidate', 'daily_log', 'sub_issue', 'other')),
  location text,
  created_at timestamptz not null default now()
);

-- ---------- todos (includes waiting-on items) ----------
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  owner text,
  due date,
  status text not null default 'open' check (status in ('open', 'waiting', 'done')),
  source_note_id uuid references public.notes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- drafts (everything Gary writes) ----------
-- "to" is a reserved word in SQL, so recipients use *_recipients names.
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('email', 'daily_log', 'rfi')),
  to_recipients text[] not null default '{}',
  cc_recipients text[] not null default '{}',
  bcc_recipients text[] not null default '{}',
  subject text,
  body text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent_to_outlook', 'discarded')),
  graph_message_id text,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz
);

-- ---------- chat_messages ----------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger activities_updated_at before update on public.activities for each row execute function public.set_updated_at();
create trigger todos_updated_at before update on public.todos for each row execute function public.set_updated_at();

-- ---------- lookup indexes ----------
create index on public.documents (project_id);
create index on public.doc_chunks (document_id);
create index on public.doc_chunks (project_id);
create index on public.contacts (project_id);
create index on public.activities (project_id, start_date);
create index on public.activity_changes (activity_id);
create index on public.notes (project_id, created_at desc);
create index on public.todos (project_id, status, due);
create index on public.drafts (project_id, status);
create index on public.chat_messages (project_id, created_at);

-- ---------- row-level security ----------
-- Each signed-in user can read and write only rows where user_id = their own id.
do $$
declare t text;
begin
  foreach t in array array[
    'projects', 'documents', 'doc_chunks', 'contacts', 'activities',
    'activity_changes', 'notes', 'todos', 'drafts', 'chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ---------- storage: private "documents" bucket ----------
-- Files are stored under <user_id>/<project_id>/<filename>; users only touch their own folder.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "own files: read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: update" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
