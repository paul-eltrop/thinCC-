// Lädt einen Tender via apiFetch und gibt parsed_text + persistierten
// Proposal-Draft an die DraftView weiter. Auto-Save mit Debounce schickt
// jede Sektions-Aenderung nach 800ms via PATCH zurueck zur Supabase.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { DraftView, type ProposalMeta } from '@/components/DraftView';
import type { ProposalSection } from '@/components/ProposalEditor';

const SAVE_DEBOUNCE_MS = 800;

export function TenderDraftWrapper({ tenderId }: { tenderId: string }) {
  const [hasParsedText, setHasParsedText] = useState(false);
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [meta, setMeta] = useState<ProposalMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skipSaveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTender = useCallback(async () => {
    try {
      const res = await apiFetch(`/tenders/${tenderId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setHasParsedText(!!(json.parsed_text && String(json.parsed_text).trim().length > 0));
      setSections((json.proposal_sections || []) as ProposalSection[]);
      const m = (json.proposal_meta || {}) as Record<string, unknown>;
      setMeta({
        title: typeof m.title === 'string' ? m.title : undefined,
        contractingAuthority: typeof m.contractingAuthority === 'string'
          ? m.contractingAuthority
          : (typeof m.contracting_authority === 'string' ? m.contracting_authority : undefined),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      skipSaveRef.current = true;
    }
  }, [tenderId]);

  useEffect(() => {
    loadTender();
  }, [loadTender]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      apiFetch(`/tenders/${tenderId}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, meta }),
      }).catch((err) => setError((err as Error).message));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sections, meta, tenderId]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading draft...</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      <DraftView
        tenderId={tenderId}
        hasParsedText={hasParsedText}
        sections={sections}
        onSectionsChange={setSections}
        proposalMeta={meta}
        onMetaChange={setMeta}
      />
    </div>
  );
}
