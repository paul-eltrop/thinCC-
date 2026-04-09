-- Tender Fit-Check Schema: parsed_text + scan_status auf tenders, plus zwei
-- neue Tabellen tender_requirements und tender_coverage. RLS-Policies prueft
-- Tender-Ownership ueber den join auf companies via profiles.

-- 1) tenders Tabelle erweitern
alter table tenders
  add column if not exists parsed_text text,
  add column if not exists scan_status text default 'pending'
    check (scan_status in ('pending','extracting','scanning','completed','error')),
  add column if not exists scanned_at timestamptz,
  add column if not exists has_critical_gap boolean,
  add column if not exists reasoning text;

-- 2) Anforderungen pro Tender
create table if not exists tender_requirements (
  id text primary key,
  tender_id text not null references tenders(id) on delete cascade,
  req_idx integer not null,
  text text not null,
  category text not null,
  importance text not null check (importance in ('critical','high','medium','low')),
  is_critical boolean default false,
  related_doc_types text[] default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_tender_requirements_tender on tender_requirements(tender_id);

-- 3) Coverage pro Anforderung
create table if not exists tender_coverage (
  requirement_id text primary key references tender_requirements(id) on delete cascade,
  status text not null default 'missing' check (status in ('covered','partial','missing')),
  confidence numeric default 0,
  evidence text,
  sources jsonb default '[]'::jsonb,
  user_provided boolean default false,
  notes text,
  updated_at timestamptz default now()
);

-- 4) RLS
alter table tender_requirements enable row level security;
alter table tender_coverage enable row level security;

drop policy if exists "users manage own tender requirements" on tender_requirements;
create policy "users manage own tender requirements" on tender_requirements
  for all using (
    tender_id in (
      select id from tenders where company_id = (
        select company_id from profiles where id = auth.uid()
      )
    )
  );

drop policy if exists "users manage own tender coverage" on tender_coverage;
create policy "users manage own tender coverage" on tender_coverage
  for all using (
    requirement_id in (
      select id from tender_requirements where tender_id in (
        select id from tenders where company_id = (
          select company_id from profiles where id = auth.uid()
        )
      )
    )
  );
