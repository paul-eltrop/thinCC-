/**
 * Segmented control toggle between the Company and Tenders views.
 * Pure UI: parent owns the active state.
 */

'use client';

export type DashboardView = 'company' | 'tenders';

const items: { id: DashboardView; label: string }[] = [
  { id: 'company', label: 'My Company' },
  { id: 'tenders', label: 'Tenders' },
];

interface DashboardSwitchProps {
  active: DashboardView;
  onChange: (view: DashboardView) => void;
}

export function DashboardSwitch({ active, onChange }: DashboardSwitchProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/60 bg-white/50 p-1 backdrop-blur-xl">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
