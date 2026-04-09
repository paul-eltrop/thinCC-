'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TenderCard } from '@/components/TenderCard';
import { NewTenderModal } from '@/components/Modal';
import { ToastContainer, useToast } from '@/components/Toast';
import { Navbar } from '@/components/Navbar';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

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
  const [authed, setAuthed] = useState(false);
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
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/login');
        return;
      }
      setAuthed(true);
      loadTenders();
    });
  }, [loadTenders, router]);

  if (!authed) return null;

  function handleCreated(tenderId: string) {
    addToast('Tender created!', 'success');
    router.push(`/tender/${tenderId}`);
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
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading tenders...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
            <TenderCard isNewCard onClick={() => setIsNewModalOpen(true)} />
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
