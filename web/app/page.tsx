'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TenderCard } from '@/components/TenderCard';
import { NewTenderModal } from '@/components/Modal';
import { ToastContainer, useToast } from '@/components/Toast';
import { dummyTenders, type Tender } from '@/data/dummyData';

export default function Dashboard() {
  const [tenders, setTenders] = useState<Tender[]>(dummyTenders);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const handleCreateTender = (name: string, client: string) => {
    const newTender: Tender = {
      id: Date.now().toString(),
      name,
      client,
      slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      status: 'new',
      additionalDocuments: [],
      selectedTeam: []
    };
    setTenders([...tenders, newTender]);
    addToast(`Tender "${name}" created successfully!`, 'success');
  };

  const handleNewTenderClick = () => {
    setIsNewModalOpen(true);
  };

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-8">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
            Tender Agent
          </h1>
          <nav className="flex gap-6">
            <span className="text-sm font-medium text-slate-900">
              Tenders
            </span>
            <Link
              href="/company"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              My Company
            </Link>
          </nav>
        </div>
        <button
          onClick={handleNewTenderClick}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          New Tender
        </button>
      </header>

      {/* Main Content */}
      <main className="px-8 pb-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tenders.map((tender) => (
            <Link key={tender.id} href={`/tender/${tender.slug}`}>
              <TenderCard tender={tender} />
            </Link>
          ))}
          <TenderCard isNewCard onClick={handleNewTenderClick} />
        </div>
      </main>

      {/* Modals */}
      <NewTenderModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateTender}
      />

      {/* Toasts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}