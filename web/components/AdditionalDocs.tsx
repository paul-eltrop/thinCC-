'use client';

import React, { useState } from 'react';
import { type FileMetadata } from '@/data/dummyData';

interface AdditionalDocsProps {
  documents: FileMetadata[];
  onUpdate: (documents: FileMetadata[]) => void;
}

export function AdditionalDocs({ documents, onUpdate }: AdditionalDocsProps) {
  const handleUpload = () => {
    // TODO: Implement file upload
    alert('File upload not implemented yet');
  };

  const handleMoveToKB = (docId: string) => {
    // TODO: Implement move to knowledge base
    alert('Move to Knowledge Base not implemented yet');
  };

  return (
    <div className="space-y-6">
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
              <p className="text-sm font-medium text-slate-900">Upload tender-specific documents</p>
              <p className="text-xs text-slate-500">PDF, DOCX, TXT</p>
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

      {/* Info Text */}
      <div className="rounded-3xl border border-white/60 bg-blue-50/70 p-4 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <p className="text-sm text-slate-600">
          These documents apply only to this tender. General company data is managed under My Company.
        </p>
      </div>

      {/* Share Link */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Share Link</h3>
            <p className="text-sm text-slate-600">Missing data? Send a link to colleagues.</p>
          </div>
          <button className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
            Copy link
          </button>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {documents.map((doc) => (
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
                  <p className="text-xs text-slate-500">{doc.type} • {doc.size} bytes • {doc.uploadedAt}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleMoveToKB(doc.id)}
                  className="text-xs text-slate-600 hover:text-slate-900 underline"
                >
                  Move to Knowledge Base
                </button>
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