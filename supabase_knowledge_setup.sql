-- Globaler Knowledge-Katalog (company_questions) plus per-company State.
-- Migration vom alten JSON-File backend/data/company_questions.json
-- in Supabase. Idempotent gehalten wo moeglich.

-- 1) Globaler Frage-Katalog (gleich fuer alle Companies)
create table if not exists company_questions (
  id text primary key,
  category text not null,
  text text not null,
  importance text not null check (importance in ('critical','high','medium','low')),
  related_doc_types text[] not null default '{}',
  answer_format text not null,
  display_order integer not null default 0,
  created_at timestamptz default now()
);

-- 2) Per-company State (composite PK)
create table if not exists company_question_states (
  company_id uuid not null references companies(id) on delete cascade,
  question_id text not null references company_questions(id) on delete cascade,
  status text not null default 'unscanned' check (status in ('covered','partial','missing','unscanned')),
  answer text,
  confidence numeric default 0,
  sources jsonb default '[]'::jsonb,
  user_provided boolean default false,
  last_scanned timestamptz,
  notes text,
  updated_at timestamptz default now(),
  primary key (company_id, question_id)
);

create index if not exists idx_question_states_company on company_question_states(company_id);

-- 3) RLS
alter table company_questions enable row level security;
alter table company_question_states enable row level security;

drop policy if exists "auth users read questions" on company_questions;
create policy "auth users read questions" on company_questions
  for select using (auth.role() = 'authenticated');

drop policy if exists "users manage own question states" on company_question_states;
create policy "users manage own question states" on company_question_states
  for all using (
    company_id = (select company_id from profiles where id = auth.uid())
  );

-- 4) Seed: 20 Fragen aus dem alten JSON-Katalog
insert into company_questions (id, category, text, importance, related_doc_types, answer_format, display_order)
values
  ('company_name', 'company_basics', 'Wie heisst das Unternehmen, in welcher Rechtsform und wo ist der Hauptsitz?', 'critical', '{"company_profile","boilerplate"}', 'short_text', 0),
  ('company_history', 'company_basics', 'Seit wann existiert das Unternehmen und was ist die Kernmission?', 'medium', '{"company_profile"}', 'short_text', 1),
  ('team_size', 'company_basics', 'Wie viele Mitarbeitende sind im Unternehmen taetig (FTE)?', 'high', '{"company_profile","boilerplate"}', 'number', 2),
  ('core_services', 'capabilities', 'Welche Hauptdienstleistungen bietet das Unternehmen an?', 'critical', '{"company_profile","methodology"}', 'list', 3),
  ('tech_stack', 'capabilities', 'Welcher Technologie-Stack wird hauptsaechlich genutzt (Programmiersprachen, Frameworks, Cloud-Provider)?', 'high', '{"company_profile","methodology","cv"}', 'list', 4),
  ('industry_focus', 'capabilities', 'In welchen Branchen ist das Unternehmen am staerksten positioniert?', 'high', '{"company_profile","reference_project"}', 'list', 5),
  ('methodologies', 'capabilities', 'Welche Methodiken oder Frameworks werden in Projekten standardmaessig eingesetzt?', 'high', '{"methodology","company_profile"}', 'long_text', 6),
  ('senior_specialists', 'team', 'Welche Senior-Spezialisten gibt es im Team und in welchen Bereichen sind sie taetig?', 'high', '{"cv","company_profile"}', 'long_text', 7),
  ('team_certifications', 'team', 'Welche relevanten Zertifizierungen halten Teammitglieder (z.B. AWS, Azure, PMP, Scrum, CISSP)?', 'medium', '{"cv","boilerplate"}', 'list', 8),
  ('languages_spoken', 'team', 'Welche Arbeitssprachen werden im Team beherrscht und auf welchem Niveau?', 'medium', '{"cv","company_profile"}', 'list', 9),
  ('flagship_projects', 'references', 'Was sind die drei wichtigsten oder groessten Referenzprojekte der letzten drei Jahre?', 'critical', '{"reference_project","company_profile"}', 'long_text', 10),
  ('eu_public_sector_refs', 'references', 'Gibt es Referenzprojekte aus dem EU-Public-Sector (Kommission, Agenturen, Bundesministerien)? Falls ja, welche?', 'high', '{"reference_project"}', 'list', 11),
  ('project_value_range', 'references', 'In welchem Volumen bewegen sich typische Projekte des Unternehmens (Auftragswert von-bis in EUR)?', 'medium', '{"reference_project","company_profile"}', 'short_text', 12),
  ('iso_27001', 'compliance', 'Habt ihr eine ISO 27001 Zertifizierung? Falls ja, seit wann und gueltig bis wann?', 'high', '{"boilerplate","company_profile"}', 'short_text', 13),
  ('iso_9001', 'compliance', 'Habt ihr eine ISO 9001 Zertifizierung fuer Qualitaetsmanagement?', 'medium', '{"boilerplate","company_profile"}', 'yes_no', 14),
  ('gdpr_compliance', 'compliance', 'Wie wird DSGVO-Compliance im Unternehmen sichergestellt? Gibt es einen Datenschutzbeauftragten?', 'high', '{"boilerplate","methodology"}', 'short_text', 15),
  ('nis2_dora_readiness', 'compliance', 'Sind NIS2 oder DORA Compliance-Anforderungen fuer eure Projekte relevant und werden sie erfuellt?', 'medium', '{"boilerplate","methodology"}', 'short_text', 16),
  ('annual_turnover', 'financials', 'Wie hoch war der Jahresumsatz der letzten drei Geschaeftsjahre?', 'high', '{"company_profile","boilerplate"}', 'short_text', 17),
  ('liability_insurance', 'financials', 'Besteht eine Berufs- oder Betriebshaftpflichtversicherung? Mit welcher Deckungssumme?', 'high', '{"boilerplate"}', 'short_text', 18),
  ('financial_solvency', 'financials', 'Gibt es aktuelle Bonitaetsnachweise, Banken-Referenzen oder Wirtschaftsauskuenfte die fuer Tender vorgelegt werden koennen?', 'medium', '{"boilerplate"}', 'yes_no', 19)
on conflict (id) do nothing;
