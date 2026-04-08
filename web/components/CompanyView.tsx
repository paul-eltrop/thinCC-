/**
 * Company view — modular card layout for company-level data.
 * First module: knowledge-base documents card with upload + delete.
 */

'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { dummyKnowledgeBase, dummyTeam, type Document } from '@/data/dummyData';

const typeStyles: Record<Document['type'], string> = {
  CV: 'bg-blue-100 text-blue-700',
  Project: 'bg-emerald-100 text-emerald-700',
  Boilerplate: 'bg-amber-100 text-amber-700',
  Methodology: 'bg-purple-100 text-purple-700',
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CompanyView() {
  const [documents, setDocuments] = useState<Document[]>(dummyKnowledgeBase);
  const [pendingDelete, setPendingDelete] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const added: Document[] = Array.from(files).map((file, i) => ({
      id: `new-${Date.now()}-${i}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      type: 'Project',
      file: {
        id: `f-${Date.now()}-${i}`,
        name: file.name,
        type: file.name.split('.').pop() || 'file',
        size: file.size,
        uploadedAt: today,
      },
    }));

    setDocuments((prev) => [...added, ...prev]);
    e.target.value = '';
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setDocuments((prev) => prev.filter((d) => d.id !== pendingDelete.id));
    setPendingDelete(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Documents</h2>
            <p className="text-xs text-slate-500">
              {documents.length} {documents.length === 1 ? 'file' : 'files'} in your knowledge base
            </p>
          </div>
          <button
            onClick={handleUploadClick}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />
        </div>

        {documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">No documents yet. Upload your first file.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/60">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="group flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 text-blue-600">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{doc.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {doc.file.name} · {formatSize(doc.file.size)} · {doc.file.uploadedAt}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeStyles[doc.type]}`}
                  >
                    {doc.type}
                  </span>
                  <button
                    onClick={() => setPendingDelete(doc)}
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
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Team</h2>
              <p className="text-xs text-slate-500">
                {dummyTeam.length} {dummyTeam.length === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-white/60">
            {dummyTeam.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400 text-[11px] font-semibold text-white">
                    {member.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                    <p className="truncate text-xs text-slate-500">{member.role}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium text-slate-600">
                  €{member.dayRate}/d
                </span>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          onClick={() => {}}
          className="group flex flex-col rounded-3xl border border-white/60 bg-white/70 p-6 text-left shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl transition hover:bg-white/85"
        >
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Conversations</h2>
                <p className="text-xs text-slate-500">Chat history with the agent</p>
              </div>
            </div>
            <span className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-50 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Total</p>
              <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-slate-900">24</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">This week</p>
              <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-slate-900">5</p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Last activity <span className="font-medium text-slate-700">2 hours ago</span>
          </p>
        </button>
      </div>

      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete document?"
      >
        <p className="text-sm text-slate-600">
          You are about to delete{' '}
          <span className="font-semibold text-slate-900">{pendingDelete?.name}</span>. This cannot
          be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
