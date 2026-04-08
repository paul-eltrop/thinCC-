'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Tabs } from '@/components/Tabs';
import { Setup } from '@/components/Setup';
import { AdditionalDocs } from '@/components/AdditionalDocs';
import { dummyTenders } from '@/data/dummyData';

const tabs = [
  { id: 'setup', label: 'Setup' },
  { id: 'fit-check', label: 'Fit-Check' },
  { id: 'draft', label: 'Draft' },
  { id: 'additional-documents', label: 'Additional Documents' },
  { id: 'export', label: 'Export' },
];

export default function TenderDetail() {
  const params = useParams();
  const slug = params.slug as string;
  const [tenders, setTenders] = useState(dummyTenders);
  const tender = tenders.find((t: typeof dummyTenders[0]) => t.slug === slug);

  const [activeTab, setActiveTab] = useState('setup');

  if (!tender) {
    return (
      <div
        className="min-h-screen text-slate-900"
        style={{
          background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
        }}
      >
        <div className="px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-slate-900">Tender not found</h1>
            <p className="text-slate-600 mt-2">The tender you're looking for doesn't exist.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleDelete = () => {
    // TODO: Implement delete functionality
    alert('Delete functionality not implemented yet');
  };

  const handleUpdateTender = (updates: Partial<typeof tender>) => {
    setTenders((prev: typeof dummyTenders) => prev.map((t: typeof dummyTenders[0]) => t.id === tender.id ? { ...t, ...updates } : t));
  };

  const handleStartAnalysis = () => {
    // TODO: Implement analysis start
    setActiveTab('fit-check');
  };

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <div className="px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <Breadcrumb tenderName={tender.name} onDelete={handleDelete} />

          <div className="mt-8">
            <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="mt-8">
              {activeTab === 'setup' && (
                <Setup
                  tender={tender}
                  onUpdate={handleUpdateTender}
                  onStartAnalysis={handleStartAnalysis}
                />
              )}
              {activeTab === 'fit-check' && <div className="text-center py-12 text-slate-500">Fit-Check tab content coming soon</div>}
              {activeTab === 'draft' && <div className="text-center py-12 text-slate-500">Draft tab content coming soon</div>}
              {activeTab === 'additional-documents' && (
                <AdditionalDocs
                  documents={tender.additionalDocuments}
                  onUpdate={(docs) => handleUpdateTender({ additionalDocuments: docs })}
                />
              )}
              {activeTab === 'export' && <div className="text-center py-12 text-slate-500">Export tab content coming soon</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}