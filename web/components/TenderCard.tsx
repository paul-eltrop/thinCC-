import React from 'react';

interface TenderCardProps {
  tender?: {
    id: string;
    name: string;
    client: string;
    status: 'new' | 'fit-check' | 'drafting' | 'submitted';
    deadline?: string | null;
    filename?: string | null;
    uploaded_at?: string | null;
  };
  isNewCard?: boolean;
  onClick?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  uploaded: 'Uploaded',
  'fit-check': 'Fit-Check',
  evaluating: 'Evaluating',
  drafting: 'Drafting',
  review: 'Review',
  submitted: 'Submitted',
};

function getStatusColor(status: string) {
  switch (status) {
    case 'new':
    case 'uploaded':
      return 'bg-amber-100 text-amber-700';
    case 'fit-check':
    case 'evaluating':
      return 'bg-blue-100 text-blue-700';
    case 'drafting':
      return 'bg-purple-100 text-purple-700';
    case 'review':
      return 'bg-amber-100 text-amber-700';
    case 'submitted':
      return 'bg-emerald-100 text-emerald-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getInitialColor(name: string) {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-purple-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-indigo-500',
  ];
  return colors[name.length % colors.length];
}

function formatDeadline(deadline: string): { label: string; urgent: boolean } {
  const d = new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

  if (diff < 0) return { label: `${formatted} (expired)`, urgent: true };
  if (diff === 0) return { label: `${formatted} (today)`, urgent: true };
  if (diff <= 7) return { label: `${formatted} (${diff}d left)`, urgent: true };
  return { label: `${formatted} (${diff}d left)`, urgent: false };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TenderCard({ tender, isNewCard, onClick }: TenderCardProps) {
  if (isNewCard) {
    return (
      <div
        onClick={onClick}
        className="group h-full cursor-pointer rounded-3xl border-2 border-dashed border-slate-300 bg-white/30 p-6 transition-all hover:border-slate-400 hover:bg-white/50"
      >
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
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

  const deadline = tender.deadline ? formatDeadline(tender.deadline) : null;

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
          {tender.client && tender.client !== '—' && (
            <p className="text-sm text-slate-600 truncate">{tender.client}</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {deadline && (
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={deadline.urgent ? 'text-rose-500' : 'text-slate-400'}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className={`text-xs ${deadline.urgent ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
              {deadline.label}
            </span>
          </div>
        )}

        {tender.filename && (
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className="text-xs text-slate-500 truncate">{tender.filename}</span>
          </div>
        )}

        {tender.uploaded_at && (
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="text-xs text-slate-500">{formatDate(tender.uploaded_at)}</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getStatusColor(tender.status)}`}>
          {STATUS_LABELS[tender.status] || tender.status}
        </span>
      </div>
    </div>
  );
}
