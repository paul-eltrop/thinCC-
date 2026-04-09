// Lädt Tender + persistierten Proposal-Draft und reicht beides an die
// Print-fertige ExportView. Read-only — Edits passieren im Draft-Tab.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ExportView } from '@/components/ExportView';
import type { ProposalMeta } from '@/components/DraftView';
import type { ProposalSection } from '@/components/ProposalEditor';

export function TenderExportWrapper({ tenderId }: { tenderId: string }) {
  const [tenderName, setTenderName] = useState('');
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [meta, setMeta] = useState<ProposalMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTender = useCallback(async () => {
    try {
      const res = await apiFetch(`/tenders/${tenderId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setTenderName(json.name || '');
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
    }
  }, [tenderId]);

  useEffect(() => {
    loadTender();
  }, [loadTender]);

  if (loading) {
    return <p className="text-sm text-slate-500">Lade Export...</p>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
        {error}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/70 p-12 text-center backdrop-blur-xl">
        <p className="text-sm text-slate-500">
          Noch kein Proposal-Draft vorhanden. Wechsel zum Draft-Tab und generiere einen.
        </p>
      </div>
    );
  }

  return <ExportView sections={sections} tenderName={tenderName} proposalMeta={meta} />;
}
