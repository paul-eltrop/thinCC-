'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CompanyInfo } from '@/components/CompanyInfo';
import { CompanyDocuments } from '@/components/CompanyDocuments';
import { CompanyTeam } from '@/components/CompanyTeam';
import { dummyCompany, dummyTeam, dummyKnowledgeBase, type Company, type TeamMember, type Document } from '@/data/dummyData';

const tabs = [
  { id: 'general', label: 'General Info' },
  { id: 'documents', label: 'Documents' },
  { id: 'team', label: 'Team' },
];

export default function MyCompany() {
  const [activeTab, setActiveTab] = useState('general');
  const [company, setCompany] = useState<Company>(dummyCompany);
  const [team, setTeam] = useState<TeamMember[]>(dummyTeam);
  const [knowledgeBase, setKnowledgeBase] = useState<Document[]>(dummyKnowledgeBase);

  const handleUpdateCompany = (updates: Partial<Company>) => {
    setCompany(prev => ({ ...prev, ...updates }));
  };

  const handleUpdateTeam = (newTeam: TeamMember[]) => {
    setTeam(newTeam);
  };

  const handleUpdateKnowledgeBase = (newDocs: Document[]) => {
    setKnowledgeBase(newDocs);
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
            <Link
              href="/"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Tenders
            </Link>
            <span className="text-sm font-medium text-slate-900">
              My Company
            </span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-8 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">My Company</h2>
            <p className="text-slate-600">Manage your company information, knowledge base, and team</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-slate-200 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-1 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'general' && (
              <CompanyInfo company={company} onUpdate={handleUpdateCompany} />
            )}
            {activeTab === 'documents' && (
              <CompanyDocuments documents={knowledgeBase} onUpdate={handleUpdateKnowledgeBase} />
            )}
            {activeTab === 'team' && (
              <CompanyTeam team={team} onUpdate={handleUpdateTeam} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}