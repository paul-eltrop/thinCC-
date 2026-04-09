-- Erweitert die existierende team_members Tabelle um Seniority, CV-Verknuepfung
-- und Scan-Metadaten. Die RLS-Policy "Users manage own team" existiert bereits
-- aus supabase_setup.sql und muss nicht angefasst werden.

alter table team_members
  add column if not exists seniority text check (seniority in ('junior','mid','senior','lead')),
  add column if not exists cv_document_id uuid references documents(id) on delete set null,
  add column if not exists created_by_scan boolean default false,
  add column if not exists last_scanned timestamptz,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_team_members_company on team_members(company_id);
create index if not exists idx_team_members_cv on team_members(cv_document_id);
