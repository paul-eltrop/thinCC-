'use client';

import React, { useState } from 'react';
import { type TeamMember } from '@/data/dummyData';

interface CompanyTeamProps {
  team: TeamMember[];
  onUpdate: (team: TeamMember[]) => void;
}

export function CompanyTeam({ team, onUpdate }: CompanyTeamProps) {
  const handleAddMember = () => {
    // TODO: Implement add member modal
    alert('Add member functionality not implemented yet');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-slate-900">Team Members</h3>
        <button
          onClick={handleAddMember}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Mitarbeiter hinzufügen
        </button>
      </div>

      <div className="space-y-3">
        {team.map((member) => (
          <div key={member.id} className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white font-semibold text-sm">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">€{member.dayRate}/Tag</p>
                {member.availability && (
                  <p className="text-xs text-slate-500">{member.availability}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}