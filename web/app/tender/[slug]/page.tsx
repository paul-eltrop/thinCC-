'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { apiFetch } from '@/lib/api';
import { TenderFitCheck } from '@/components/TenderFitCheck';
import { TenderDraftWrapper } from '@/components/TenderDraftWrapper';
import { TenderExportWrapper } from '@/components/TenderExportWrapper';

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
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
  {
    id: 'fit-check',
    label: 'Fit-Check',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'draft',
    label: 'Draft',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855Z" />
      </svg>
    ),
  },
  {
    id: 'export',
    label: 'Export',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
      </svg>
    ),
  },
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
    if (!confirm(`Delete tender "${tender.name}"?`)) return;
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
      <Navbar />

      <main className="px-8 pb-8">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <p className="text-sm text-slate-500">Loading tender...</p>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          ) : !tender ? (
            <p className="text-sm text-slate-500">Tender not found.</p>
          ) : (
            <>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">
                    ← Back to Tenders
                  </Link>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{tender.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {tender.client || 'No client specified'}
                    {tender.deadline && ` · Deadline: ${tender.deadline}`}
                  </p>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>

              <div className="mb-8 flex items-center gap-1 rounded-full border border-white/60 bg-white/50 p-1 backdrop-blur-xl w-fit">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    <span className={activeTab === tab.id ? 'text-white' : 'text-slate-400'}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && <OverviewTab tender={tender} />}
              {activeTab === 'fit-check' && <TenderFitCheck tenderId={tender.id} />}
              {activeTab === 'draft' && <TenderDraftWrapper tenderId={tender.id} />}
              {activeTab === 'export' && <TenderExportWrapper tenderId={tender.id} />}
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
        <h3 className="mb-4 text-base font-semibold text-slate-900">Tender Document</h3>
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{tender.filename || 'No file'}</p>
            <p className="text-xs text-slate-500">
              {tender.file_size ? `${(tender.file_size / 1024).toFixed(0)} KB · ` : ''}
              Status: {tender.status}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Metadata</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-900">{tender.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Client</dt>
            <dd className="text-slate-900">{tender.client || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Deadline</dt>
            <dd className="text-slate-900">{tender.deadline || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Uploaded</dt>
            <dd className="text-slate-900">
              {tender.uploaded_at ? new Date(tender.uploaded_at).toLocaleString('en-US') : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
