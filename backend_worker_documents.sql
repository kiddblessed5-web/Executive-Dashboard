-- ============================================================
-- SAGERO CREATIONS — Real worker documents
-- ============================================================
-- Private storage bucket (unlike message-attachments, which is
-- public) since worker documents can include IDs, contracts, and
-- other sensitive personal files. Access requires a signed URL,
-- not a public link.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('worker-documents', 'worker-documents', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload worker documents" on storage.objects;
drop policy if exists "Authenticated users can view worker documents" on storage.objects;
drop policy if exists "Authenticated users can delete worker documents" on storage.objects;

create policy "Authenticated users can upload worker documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'worker-documents');
create policy "Authenticated users can view worker documents" on storage.objects
  for select to authenticated using (bucket_id = 'worker-documents');
create policy "Authenticated users can delete worker documents" on storage.objects
  for delete to authenticated using (bucket_id = 'worker-documents');

create table if not exists worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null references workers(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size_bytes integer,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_worker_documents_worker on worker_documents(worker_id);

alter table worker_documents enable row level security;
create policy "Authenticated users can read worker documents" on worker_documents for select using (auth.role() = 'authenticated');
create policy "Authenticated users can add worker documents" on worker_documents for insert with check (auth.uid() is not null);
create policy "Authenticated users can delete worker documents" on worker_documents for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table worker_documents;
