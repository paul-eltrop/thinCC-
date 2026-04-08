'use client';

import React, { useState } from 'react';
import { type Document } from '@/data/dummyData';

interface CompanyDocumentsProps {
  documents: Document[];
  onUpdate: (documents: Document[]) => void;
}

export function CompanyDocuments({ documents, onUpdate }: CompanyDocumentsProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'CV' | 'Project' | 'Boilerplate' | 'Methodology'>('all');

  const filteredDocuments = activeFilter === 'all'
    ? documents
    : documents.filter(doc => doc.type === activeFilter);

  const handleUpload = () => {
    // TODO: Implement file upload
    alert('File upload not implemented yet');
  };

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex gap-6 border-b border-slate-200">
        {[
          { id: 'all', label: 'Alle' },
          { id: 'CV', label: 'CVs' },
          { id: 'Project', label: 'Projekte' },
          { id: 'Boilerplate', label: 'Boilerplate' },
          { id: 'Methodology', label: 'Methodik' },
        ].map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id as any)}
            className={`pb-2 px-1 text-sm font-medium transition-colors ${
              activeFilter === filter.id
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Upload Zone */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center">
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Neue Dokumente hinzufügen</p>
              <p className="text-xs text-slate-500">Agent kategorisiert automatisch</p>
            </div>
            <button
              onClick={handleUpload}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Upload
            </button>
          </div>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {filteredDocuments.map((doc) => (
          <div key={doc.id} className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white font-semibold text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                  <p className="text-xs text-slate-500">{doc.type} • {doc.file.size} bytes • {doc.file.uploadedAt}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="text-slate-400 hover:text-slate-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}