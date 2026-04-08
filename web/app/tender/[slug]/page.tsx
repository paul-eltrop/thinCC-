'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { TenderFitCheck } from '@/components/TenderFitCheck';

type TenderRow = {
  id: string;
  name: string;
  client: string | null;
  filename: string | null;
  storage_path: string | null;
  file_size: number | null;
  deadline: string | null;
  status: string;
  uploaded_at: string | null;
};

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'fit-check', label: 'Fit-Check' },
  { id: 'draft', label: 'Draft' },
  { id: 'export', label: 'Export' },
];

export default function TenderDetail() {
  const params = useParams();
  const router = useRouter();
  const tenderId = params.slug as string;

  const [tender, setTender] = useState<TenderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleting, setDeleting] = useState(false);

  const loadTender = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch(`/tenders/${tenderId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      setTender(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    loadTender();
  }, [loadTender]);

  async function handleDelete() {
    if (!tender) return;
    if (!confirm(`Tender "${tender.name}" wirklich loeschen?`)) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/tenders/${tender.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-[28px] font-semibold tracking-tight text-slate-900 hover:opacity-70">
            Tender Agent
          </Link>
          <nav className="flex gap-6">
            <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Tenders
            </Link>
            <Link href="/company" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              My Company
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-8 pb-8">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <p className="text-sm text-slate-500">Lade Tender...</p>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          ) : !tender ? (
            <p className="text-sm text-slate-500">Tender nicht gefunden.</p>
          ) : (
            <>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">
                    ← Zurueck zu Tenders
                  </Link>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{tender.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {tender.client || 'Kein Kunde angegeben'}
                    {tender.deadline && ` · Deadline: ${tender.deadline}`}
                  </p>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  Loeschen
                </button>
              </div>

              <div className="mb-8 flex gap-6 border-b border-slate-200">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-3 px-1 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'border-b-2 border-blue-500 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && <OverviewTab tender={tender} />}
              {activeTab === 'fit-check' && <TenderFitCheck tenderId={tender.id} />}
              {(activeTab === 'draft' || activeTab === 'export') && (
                <div className="rounded-3xl border border-white/60 bg-white/70 p-12 text-center backdrop-blur-xl">
                  <p className="text-sm text-slate-500">
                    Dieser Tab kommt in einem spaeteren Schritt.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function OverviewTab({ tender }: { tender: TenderRow }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Tender-Dokument</h3>
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{tender.filename || 'Keine Datei'}</p>
            <p className="text-xs text-slate-500">
              {tender.file_size ? `${(tender.file_size / 1024).toFixed(0)} KB · ` : ''}
              Status: {tender.status}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Metadaten</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-900">{tender.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Kunde</dt>
            <dd className="text-slate-900">{tender.client || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Deadline</dt>
            <dd className="text-slate-900">{tender.deadline || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Hochgeladen</dt>
            <dd className="text-slate-900">
              {tender.uploaded_at ? new Date(tender.uploaded_at).toLocaleString('de-DE') : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
