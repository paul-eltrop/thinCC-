'use client';

import React, { useState } from 'react';
import { type Company } from '@/data/dummyData';

interface CompanyInfoProps {
  company: Company;
  onUpdate: (updates: Partial<Company>) => void;
}

export function CompanyInfo({ company, onUpdate }: CompanyInfoProps) {
  const [formData, setFormData] = useState({
    name: company.name,
    website: company.website || '',
    description: company.description || '',
    foundedYear: company.foundedYear || '',
    headquarters: company.headquarters || '',
    employeeCount: company.employeeCount || '',
    industry: company.industry || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Firmenname
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
              Website
            </label>
            <input
              type="text"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Gründungsjahr
            </label>
            <input
              type="text"
              value={formData.foundedYear}
              onChange={(e) => setFormData({ ...formData, foundedYear: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Hauptsitz
            </label>
            <input
              type="text"
              value={formData.headquarters}
              onChange={(e) => setFormData({ ...formData, headquarters: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mitarbeiteranzahl
            </label>
            <input
              type="text"
              value={formData.employeeCount}
              onChange={(e) => setFormData({ ...formData, employeeCount: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Branche/Fokus
            </label>
            <input
              type="text"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Firmenbeschreibung
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
    </div>
  );
}