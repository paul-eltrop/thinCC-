-- Erweitert tenders Tabelle um JSONB-Spalten fuer den Proposal-Draft.
-- Eine Row pro Tender, kein eigenes Schema. proposal_sections enthaelt
-- die Liste aller Sections, proposal_meta speichert Title + Authority.

alter table tenders
  add column if not exists proposal_sections jsonb default '[]'::jsonb,
  add column if not exists proposal_meta jsonb default '{}'::jsonb,
  add column if not exists proposal_updated_at timestamptz;
