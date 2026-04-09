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
  {
    id: 'share',
    label: 'Share',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.59 13.51 6.83 3.98" />
        <path d="m15.41 6.51-6.82 3.98" />
      </svg>
    ),
  },
];

export default function MyCompany() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('documents');
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');

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