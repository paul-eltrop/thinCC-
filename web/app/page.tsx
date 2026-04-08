/**
 * Dashboard root — single page with header, view switch, and the active view.
 * Switches client-side between the Company and Tenders content components.
 */

'use client';

import { useState } from 'react';
import { DashboardSwitch, type DashboardView } from '@/components/DashboardSwitch';
import { CompanyView } from '@/components/CompanyView';
import { TendersView } from '@/components/TendersView';

export default function Dashboard() {
  const [view, setView] = useState<DashboardView>('company');

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Tender Agent
        </h1>
        <DashboardSwitch active={view} onChange={setView} />
        <div className="w-[140px]" />
      </header>

      <main className="px-8 pb-8">
        {view === 'company' ? <CompanyView /> : <TendersView />}
      </main>
    </div>
  );
}
