// Galerie aller Company-Dokumente. Laedt direkt aus Supabase via RLS,
// uploaded zu Storage und triggert das Backend-Indexing in Qdrant.
// Zeigt waehrend Upload + Indexing eine animierte Loading-Card.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import {
  ALLOWED_EXTENSIONS,
  formatBytes,
  isAllowedFilename,
  sanitizeFilename,
  visualForFilename,
} from '@/lib/fileTypes';

type DocumentRow = {
  id: string;
  company_id: string;
  name: string;
  doc_type: string | null;
  mime_type: string | null;
  storage_path: string | null;
  file_size: number | null;
  status: 'indexing' | 'ready' | 'failed' | string;
  chunks_indexed: number | null;
  error_message: string | null;
  uploaded_at: string;
};

type UploadingItem = {
  id: string;
  filename: string;
};

const BUCKET = 'company_documents';

export function CompanyDocuments() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadingItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<DocumentRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const loadDocuments = useCallback(async (cid: string) => {
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', cid)
      .order('uploaded_at', { ascending: false });

    if (err) {
      setError(err.message);
      setDocuments([]);
    } else {
      setDocuments((data || []) as DocumentRow[]);
    }
    setLoading(false);
  }, []);

  const loadCompanyId = useCallback(async (): Promise<string | null> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();
    if (!profile?.company_id) return null;
    setCompanyId(profile.company_id);
    return profile.company_id;
  }, []);

  useEffect(() => {
    (async () => {
      const cid = await loadCompanyId();
      if (cid) {
        await loadDocuments(cid);
      } else {
        setLoading(false);
      }
    })();
  }, [loadCompanyId, loadDocuments]);

  useEffect(() => {
    if (!companyId) return;
    const hasIndexing = documents.some((d) => d.status === 'indexing');
    if (!hasIndexing) return;
    const interval = setInterval(() => loadDocuments(companyId), 3000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments, companyId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!companyId) {
      setError('Company ID not loaded.');
      return;
    }

    for (const file of Array.from(files)) {
      if (!isAllowedFilename(file.name)) {
        setError(`Unsupported format: ${file.name}`);
        continue;
      }
      await uploadOne(file, companyId);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadOne(file: File, cid: string) {
    const safeName = sanitizeFilename(file.name);
    const path = `${cid}/${crypto.randomUUID()}-${safeName}`;
    const itemId = crypto.randomUUID();
    setUploads((prev) => [...prev, { id: itemId, filename: file.name }]);

    const supabase = createClient();
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (storageErr) {
      setUploads((prev) => prev.filter((u) => u.id !== itemId));
      setError(`Upload failed (${file.name}): ${storageErr.message}`);
      return;
    }

    try {
      const res = await apiFetch('/documents/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: path,
          filename: file.name,
          file_size: file.size,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(`Indexing start failed (${file.name}): ${(err as Error).message}`);
    } finally {
      setUploads((prev) => prev.filter((u) => u.id !== itemId));
      await loadDocuments(cid);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      const res = await apiFetch(`/documents/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    } finally {
      if (companyId) await loadDocuments(companyId);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-6">
      <DropZone
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        disabled={uploads.length > 0}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="space-y-3">
          {uploads.map((u) => (
            <UploadingCard key={u.id} item={u} />
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading documents...</p>
      ) : documents.length === 0 && uploads.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/40 px-6 py-12 text-center">
          <p className="text-sm text-slate-500">No documents yet. Upload your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDelete={() => setPendingDelete(doc)} />
          ))}
        </div>
      )}

      {pendingDelete && (
        <DeleteModal
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function DropZone({
  onClick,
  onDrop,
  disabled,
}: {
  onClick: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  disabled: boolean;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onDrop={disabled ? undefined : onDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center backdrop-blur-xl transition ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-white/70'
      }`}
    >
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-900">Upload files</p>
      <p className="mt-1 text-xs text-slate-500">
        Click or drag PDFs, Office documents, text or images here
      </p>
    </div>
  );
}

function UploadingCard({ item }: { item: UploadingItem }) {
  const visual = visualForFilename(item.filename);
  return (
    <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid size-10 shrink-0 place-items-center rounded-2xl ${visual.bg} ${visual.color} text-[11px] font-semibold`}>
            {visual.label}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{item.filename}</p>
            <p className="text-[11px] text-slate-500">Uploading...</p>
          </div>
        </div>
        <Spinner />
      </div>
      <ProgressBar />
    </div>
  );
}

function ProgressBar() {
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-200/70">
      <div className="absolute inset-y-0 w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400" />
      <style jsx>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin text-slate-500" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DocumentCard({ doc, onDelete }: { doc: DocumentRow; onDelete: () => void }) {
  const visual = visualForFilename(doc.name);
  const isIndexing = doc.status === 'indexing';
  const isFailed = doc.status === 'failed';

  return (
    <div
      className={`group relative rounded-3xl border bg-white/70 p-5 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl transition ${
        isFailed ? 'border-rose-200' : 'border-white/60'
      } ${isIndexing ? 'animate-pulse' : ''}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`grid size-12 place-items-center rounded-2xl ${visual.bg} ${visual.color} text-xs font-semibold`}>
          {visual.label}
        </div>
        <button
          onClick={onDelete}
          aria-label={`Delete ${doc.name}`}
          className="grid size-8 place-items-center rounded-full text-slate-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <p className="truncate text-sm font-medium text-slate-900">{doc.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        {visual.label} · {formatBytes(doc.file_size)}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        {new Date(doc.uploaded_at).toLocaleDateString()}
      </p>
      {isIndexing && (
        <p className="mt-3 text-[11px] font-medium text-blue-600">Indexing...</p>
      )}
      {isFailed && (
        <div className="mt-3 space-y-1">
          <p className="text-[11px] font-medium text-rose-600">Indexing failed</p>
          {doc.error_message && (
            <p className="text-[11px] text-rose-500/80 line-clamp-3">{doc.error_message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteModal({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-3xl border border-white/60 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">Delete document?</h3>
        <p className="mt-2 text-sm text-slate-600">
          You are deleting <span className="font-semibold text-slate-900">{name}</span> from storage,
          database and the knowledge base. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
