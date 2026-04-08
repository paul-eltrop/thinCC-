/**
 * Tenders view — grid of tender cards plus the create-new flow.
 * Rendered inside the main dashboard when the Tenders tab is active.
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TenderCard } from '@/components/TenderCard';
import { NewTenderModal } from '@/components/Modal';
import { ToastContainer, useToast } from '@/components/Toast';
import { dummyTenders, type Tender } from '@/data/dummyData';

export function TendersView() {
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
      selectedTeam: [],
    };
    setTenders([...tenders, newTender]);
    addToast(`Tender "${name}" created successfully!`, 'success');
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          New Tender
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender) => (
          <Link key={tender.id} href={`/tender/${tender.slug}`}>
            <TenderCard tender={tender} />
          </Link>
        ))}
        <TenderCard isNewCard onClick={() => setIsNewModalOpen(true)} />
      </div>

      <NewTenderModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateTender}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
