'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CompanyInfo } from '@/components/CompanyInfo';
import { CompanyDocuments } from '@/components/CompanyDocuments';
import { CompanyTeam } from '@/components/CompanyTeam';
import { createClient } from '@/lib/supabase/client';
import { dummyCompany, dummyTeam, dummyKnowledgeBase, type Company, type TeamMember, type Document } from '@/data/dummyData';

const tabs = [
  { id: 'general', label: 'General Info' },
  { id: 'documents', label: 'Documents' },
  { id: 'team', label: 'Team' },
  { id: 'share', label: 'Share' },
];

export default function MyCompany() {
  const [activeTab, setActiveTab] = useState('general');
  const [company, setCompany] = useState<Company>(dummyCompany);
  const [team, setTeam] = useState<TeamMember[]>(dummyTeam);
  const [knowledgeBase, setKnowledgeBase] = useState<Document[]>(dummyKnowledgeBase);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');

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
            {activeTab === 'share' && (
              <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                <h3 className="text-base font-semibold text-slate-900 mb-1">Share Company Profile</h3>
                <p className="text-sm text-slate-500 mb-6">Generate a link to share a chat interface where others can ask questions about your company.</p>

                {!shareLink ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-2 block">Welcome Message</label>
                      <textarea
                        value={welcomeMessage}
                        onChange={(e) => setWelcomeMessage(e.target.value)}
                        placeholder="e.g. Hi! You're receiving this link because we'd like to share our company profile with you. Feel free to ask any questions."
                        rows={3}
                        className="w-full rounded-2xl border border-white/60 bg-white/50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        const supabase = createClient();
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;

                        const { data: profile } = await supabase
                          .from('profiles')
                          .select('company_id')
                          .eq('id', user.id)
                          .single();
                        if (!profile) return;

                        const id = crypto.randomUUID().slice(0, 8);
                        await supabase.from('share_links').insert({
                          id,
                          company_id: profile.company_id,
                          welcome_message: welcomeMessage,
                          created_by: user.id,
                        });

                        setShareLink(`${window.location.origin}/share/${id}`);
                      }}
                      className="rounded-full bg-slate-900 px-5 py-2 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      Generate Link
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-700 backdrop-blur-xl">
                        {shareLink}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareLink);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="rounded-full bg-slate-900 px-5 py-2 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <button
                      onClick={() => window.open(shareLink, '_blank')}
                      className="rounded-full border border-white/60 bg-white/50 px-5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 backdrop-blur-xl"
                    >
                      Open in new tab
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}