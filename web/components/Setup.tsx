'use client';

import React, { useState } from 'react';
import { dummyTeam, type TeamMember, type SelectedTeamMember } from '@/data/dummyData';

interface Tender {
  id: string;
  name: string;
  client: string;
  slug: string;
  reference?: string;
  deadline?: string;
  estimatedValue?: string;
  description?: string;
  status: 'new' | 'fit-check' | 'drafting' | 'submitted';
  tenderDocument?: any; // FileMetadata
  additionalDocuments: any[]; // FileMetadata[]
  selectedTeam: any[]; // SelectedTeamMember[]
}

interface SetupProps {
  tender: Tender;
  onUpdate: (updates: Partial<Tender>) => void;
  onStartAnalysis: () => void;
}

export function Setup({ tender, onUpdate, onStartAnalysis }: SetupProps) {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'tender-document' | 'team-selection'>('general');

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('general')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeSubTab === 'general'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          General Info
        </button>
        <button
          onClick={() => setActiveSubTab('tender-document')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeSubTab === 'tender-document'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Tender Document
        </button>
        <button
          onClick={() => setActiveSubTab('team-selection')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeSubTab === 'team-selection'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Team Selection
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeSubTab === 'general' && <GeneralInfo tender={tender} onUpdate={onUpdate} />}
        {activeSubTab === 'tender-document' && <TenderDocument tender={tender} />}
        {activeSubTab === 'team-selection' && <TeamSelection tender={tender} />}
      </div>

      {/* Action Button */}
      <div className="flex justify-end pt-6 border-t border-slate-200">
        <button
          onClick={onStartAnalysis}
          className="rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Analyse starten →
        </button>
      </div>
    </div>
  );
}

function GeneralInfo({ tender, onUpdate }: { tender: Tender; onUpdate: (updates: Partial<Tender>) => void }) {
  const [formData, setFormData] = useState({
    name: tender.name,
    client: tender.client,
    reference: tender.reference || '',
    deadline: tender.deadline || '',
    estimatedValue: tender.estimatedValue || '',
    description: tender.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Tender name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Contracting authority
          </label>
          <input
            type="text"
            value={formData.client}
            onChange={(e) => setFormData({ ...formData, client: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Reference number
          </label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Deadline
          </label>
          <input
            type="date"
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Estimated value
          </label>
          <input
            type="text"
            value={formData.estimatedValue}
            onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Short description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function TenderDocument({ tender }: { tender: Tender }) {
  return (
    <div className="space-y-6">
      {/* Tender Document Upload */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Tender Document</h3>
        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center">
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Ausschreibung hochladen</p>
              <p className="text-xs text-slate-500">PDF, DOCX, TXT bis 10MB</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function TeamSelection({ tender }: { tender: Tender }) {
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeamMember[]>(
    tender.selectedTeam || []
  );

  const handleTeamChange = (memberId: string, isSelected: boolean, plannedDays: number) => {
    if (isSelected) {
      setSelectedTeam((prev: SelectedTeamMember[]) => [...prev.filter((s: SelectedTeamMember) => s.memberId !== memberId), { memberId, plannedDays }]);
    } else {
      setSelectedTeam((prev: SelectedTeamMember[]) => prev.filter((s: SelectedTeamMember) => s.memberId !== memberId));
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {dummyTeam.map((member) => {
          const isSelected = selectedTeam.some((s: SelectedTeamMember) => s.memberId === member.id);
          const plannedDays = selectedTeam.find((s: SelectedTeamMember) => s.memberId === member.id)?.plannedDays || 0;

          return (
            <div key={member.id} className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleTeamChange(member.id, e.target.checked, plannedDays)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white font-semibold text-sm">
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isSelected && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={plannedDays}
                        onChange={(e) => handleTeamChange(member.id, true, parseInt(e.target.value) || 0)}
                        placeholder="Tage"
                        className="w-16 rounded-lg border border-slate-200 bg-white/70 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">Tage</span>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">€{member.dayRate}/Tag</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}