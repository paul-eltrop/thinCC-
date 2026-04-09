-- Storage Bucket fuer Tender PDFs + Spalten-Erweiterung der tenders Tabelle.
-- Pfad-Convention im Bucket: {company_id}/{tender_id}.pdf
-- RLS-Policies analog zu company_documents.

-- 1) Bucket (private)
insert into storage.buckets (id, name, public)
values ('company_tenders', 'company_tenders', false)
on conflict (id) do nothing;

-- 2) RLS auf storage.objects fuer den neuen Bucket
drop policy if exists "tender files: select own" on storage.objects;
create policy "tender files: select own" on storage.objects
  for select using (
    bucket_id = 'company_tenders'
    and (storage.foldername(name))[1] = (
      select company_id::text from profiles where id = auth.uid()
    )
  );

drop policy if exists "tender files: insert own" on storage.objects;
create policy "tender files: insert own" on storage.objects
  for insert with check (
    bucket_id = 'company_tenders'
    and (storage.foldername(name))[1] = (
      select company_id::text from profiles where id = auth.uid()
    )
  );

drop policy if exists "tender files: delete own" on storage.objects;
create policy "tender files: delete own" on storage.objects
  for delete using (
    bucket_id = 'company_tenders'
    and (storage.foldername(name))[1] = (
      select company_id::text from profiles where id = auth.uid()
    )
  );

-- 3) tenders-Tabelle um Upload-Felder erweitern
alter table tenders
  add column if not exists filename text,
  add column if not exists storage_path text,
  add column if not exists file_size integer,
  add column if not exists uploaded_at timestamptz default now(),
  add column if not exists created_by uuid references auth.users(id);

create index if not exists idx_tenders_uploaded_at on tenders(uploaded_at desc);
