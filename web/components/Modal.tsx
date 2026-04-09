import React, { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface NewTenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tenderId: string) => void;
}

const TENDER_BUCKET = 'company_tenders';

export function NewTenderModal({ isOpen, onClose, onCreated }: NewTenderModalProps) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [deadline, setDeadline] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName('');
    setClient('');
    setDeadline('');
    setFile(null);
    setError(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Nur PDF-Dateien werden unterstuetzt.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (!profile?.company_id) throw new Error('Company-ID nicht gefunden.');

      const path = `${profile.company_id}/${crypto.randomUUID()}-${file.name}`;
      const { error: storageErr } = await supabase.storage
        .from(TENDER_BUCKET)
        .upload(path, file, { upsert: false, contentType: 'application/pdf' });
      if (storageErr) throw new Error(`Upload fehlgeschlagen: ${storageErr.message}`);

      const res = await apiFetch('/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: path,
          filename: file.name,
          file_size: file.size,
          name: name.trim(),
          client: client.trim() || null,
          deadline: deadline || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const tender = await res.json();
      reset();
      onClose();
      onCreated(tender.id);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title="Neuer Tender">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Stadtbibliothek Muenchen 2026"
            required
            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm outline-none focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kunde</label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="optional"
            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm outline-none focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Deadline</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm outline-none focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tender PDF</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            className="w-full text-xs text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
          />
          {file && (
            <p className="mt-1 text-xs text-slate-500">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim() || !file}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Lade hoch...' : 'Erstellen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}