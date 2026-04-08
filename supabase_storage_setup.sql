-- Storage Bucket fuer Company Documents + RLS-Policies via path-prefix.
-- Plus: documents-Tabelle erweitern um Storage-Pfad, mime_type, status,
-- chunks_indexed und created_by. Idempotent gehalten wo moeglich.

-- 1) Storage Bucket (private)
insert into storage.buckets (id, name, public)
values ('company_documents', 'company_documents', false)
on conflict (id) do nothing;

-- 2) RLS-Policies auf storage.objects
--    Pfad-Convention: {company_id}/{uuid}-{filename}
--    Der erste Pfad-Segment muss die eigene company_id sein.
drop policy if exists "company files: select own" on storage.objects;
create policy "company files: select own" on storage.objects
  for select using (
    bucket_id = 'company_documents'
    and (storage.foldername(name))[1] = (
      select company_id::text from profiles where id = auth.uid()
    )
  );

drop policy if exists "company files: insert own" on storage.objects;
create policy "company files: insert own" on storage.objects
  for insert with check (
    bucket_id = 'company_documents'
    and (storage.foldername(name))[1] = (
      select company_id::text from profiles where id = auth.uid()
    )
  );

drop policy if exists "company files: delete own" on storage.objects;
create policy "company files: delete own" on storage.objects
  for delete using (
    bucket_id = 'company_documents'
    and (storage.foldername(name))[1] = (
      select company_id::text from profiles where id = auth.uid()
    )
  );

-- 3) documents-Tabelle erweitern
alter table documents add column if not exists mime_type text;
alter table documents add column if not exists status text default 'ready';
alter table documents add column if not exists chunks_indexed integer default 0;
alter table documents add column if not exists created_by uuid references auth.users(id);
alter table documents add column if not exists storage_path text;

-- Index fuer schnelle Listen pro Company
create index if not exists idx_documents_company_id on documents(company_id);
create index if not exists idx_documents_uploaded_at on documents(uploaded_at desc);
