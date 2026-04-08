'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TenderCard } from '@/components/TenderCard';
import { NewTenderModal } from '@/components/Modal';
import { ToastContainer, useToast } from '@/components/Toast';
import { apiFetch } from '@/lib/api';

type TenderRow = {
  id: string;
  name: string;
  client: string | null;
  status: string;
  filename: string | null;
  deadline: string | null;
  uploaded_at: string | null;
};

export default function Dashboard() {
  const router = useRouter();
  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const loadTenders = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/tenders');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTenders((json.tenders || []) as TenderRow[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenders();
  }, [loadTenders]);

  function handleCreated(tenderId: string) {
    addToast('Tender erstellt!', 'success');
    router.push(`/tender/${tenderId}`);
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
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
            Tender Agent
          </h1>
          <nav className="flex gap-6">
            <span className="text-sm font-medium text-slate-900">Tenders</span>
            <Link
              href="/company"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              My Company
            </Link>
          </nav>
        </div>
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          New Tender
        </button>
      </header>

      <main className="px-8 pb-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Lade Tenders...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tenders.map((tender) => (
              <Link key={tender.id} href={`/tender/${tender.id}`}>
                <TenderCard
                  tender={{
                    id: tender.id,
                    name: tender.name,
                    client: tender.client || '—',
                    status: (tender.status as 'new' | 'fit-check' | 'drafting' | 'submitted') || 'new',
                  }}
                />
              </Link>
            ))}
            <TenderCard isNewCard onClick={() => setIsNewModalOpen(true)} />
          </div>
        )}
      </main>

      <NewTenderModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreated={handleCreated}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
