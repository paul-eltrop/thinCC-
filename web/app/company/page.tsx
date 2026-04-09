'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CompanyDocuments } from '@/components/CompanyDocuments';
import { CompanyKnowledge } from '@/components/CompanyKnowledge';
import { CompanyTeam } from '@/components/CompanyTeam';
import { Navbar } from '@/components/Navbar';
import { createClient } from '@/lib/supabase/client';

const tabs = [
  {
    id: 'documents',
    label: 'Documents',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      </svg>
    ),
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" />
      </svg>
    ),
  },
  {
    id: 'team',
    label: 'Team',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function MyCompany() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('documents');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login');
    });
  }, [router]);

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <Navbar />

      {/* Main Content */}
      <main className="px-8 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">My Company</h2>
            <p className="text-slate-600">Manage your company information, knowledge base, and team</p>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-full border border-white/60 bg-white/50 p-1 backdrop-blur-xl mb-8 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-white' : 'text-slate-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'documents' && <CompanyDocuments />}
            {activeTab === 'knowledge' && <CompanyKnowledge />}
            {activeTab === 'team' && <CompanyTeam />}
          </div>
        </div>
      </main>
    </div>
  );
}