import React from 'react';

interface TenderCardProps {
  tender?: {
    id: string;
    name: string;
    client: string;
    status: 'new' | 'fit-check' | 'drafting' | 'submitted';
  };
  isNewCard?: boolean;
  onClick?: () => void;
}

export function TenderCard({ tender, isNewCard, onClick }: TenderCardProps) {
  if (isNewCard) {
    return (
      <div
        onClick={onClick}
        className="group h-full cursor-pointer rounded-3xl border-2 border-dashed border-slate-300 bg-white/30 p-6 transition-all hover:border-slate-400 hover:bg-white/50"
      >
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 group-hover:bg-slate-200">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-600">New Tender</h3>
            <p className="text-sm text-slate-500">Create a new tender project</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tender) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-amber-100 text-amber-700';
      case 'fit-check':
        return 'bg-blue-100 text-blue-700';
      case 'drafting':
        return 'bg-purple-100 text-purple-700';
      case 'submitted':
        return 'bg-emerald-100 text-emerald-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getInitialColor = (name: string) => {
    const colors = [
      'bg-blue-500',
      'bg-emerald-500',
      'bg-purple-500',
      'bg-rose-500',
      'bg-amber-500',
      'bg-indigo-500'
    ];
    const index = name.length % colors.length;
    return colors[index];
  };

  return (
    <div
      onClick={onClick}
      className="h-full cursor-pointer rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-all hover:shadow-[0_2px_32px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start gap-4">
        <div className={`grid size-12 shrink-0 place-items-center rounded-2xl text-white ${getInitialColor(tender.name)}`}>
          <span className="text-lg font-semibold">{tender.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900 truncate">{tender.name}</h3>
          <p className="text-sm text-slate-600 truncate">{tender.client}</p>
          <div className="mt-3">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${getStatusColor(tender.status)}`}>
              {tender.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}