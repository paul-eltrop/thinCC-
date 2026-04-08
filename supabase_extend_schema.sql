-- Schema-Erweiterung fuer Phase 2: Tender Fit-Check Integration.
-- Laesst sich gegen Pauls bestehende Supabase-Instanz mit psql oder
-- dem SQL-Editor ausfuehren. Idempotent gehalten wo moeglich.

-- 1) tenders.id von uuid auf text umstellen, damit unsere stabilen
--    string-IDs ({filename-slug}-{YYYYMMDD-HHMMSS}) reinpassen.
--    ACHTUNG: Wenn du schon Tender-Rows hast, vorher leeren!
alter table tenders drop constraint if exists tenders_pkey;
alter table tenders alter column id drop default;
alter table tenders alter column id type text using id::text;
alter table tenders add primary key (id);

-- 2) Neue Spalten fuer den Fit-Check (Score, Empfehlung, Anzahl).
alter table tenders add column if not exists score numeric;
alter table tenders add column if not exists recommendation text;
alter table tenders add column if not exists requirement_count integer;

-- 3) Fehlende Insert-Policies fuer Signup.
--    Pauls supabase_setup.sql hat nur "for all" Policies — die decken
--    INSERT prinzipiell ab, aber waehrend des Signups ist der User
--    noch nicht in profiles. Daher braucht companies eine
--    permissive INSERT-Policy fuer authenticated users.
drop policy if exists "Authenticated users can create companies" on companies;
create policy "Authenticated users can create companies" on companies
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Users insert own profile" on profiles;
create policy "Users insert own profile" on profiles
  for insert with check (id = auth.uid());

-- 4) Index fuer schnelle Tender-Listen pro Company.
create index if not exists idx_tenders_company_id on tenders(company_id);
