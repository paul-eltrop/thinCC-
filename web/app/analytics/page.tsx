'use client';

/* Analytics Dashboard — Pipeline Overview, Deadline Timeline,
   Performance Analytics und Team-Kapazitaet auf einen Blick. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type Tender = {
  id: string;
  name: string;
  client: string | null;
  status: string;
  deadline: string | null;
  score: number | null;
  recommendation: string | null;
  requirement_count: number | null;
  scan_status: string | null;
  has_critical_gap: boolean | null;
  estimated_value: string | null;
  uploaded_at: string | null;
  created_at: string | null;
  proposal_sections: unknown[];
};

const STATUS_ORDER = ['uploaded', 'pending', 'evaluating', 'drafting', 'review', 'submitted', 'won', 'lost'] as const;

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Discovered',
  pending: 'Discovered',
  evaluating: 'Evaluating',
  drafting: 'Drafting',
  review: 'Review',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
};

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-slate-100 text-slate-600',
  pending: 'bg-slate-100 text-slate-600',
  evaluating: 'bg-blue-100 text-blue-700',
  drafting: 'bg-purple-100 text-purple-700',
  review: 'bg-amber-100 text-amber-700',
  submitted: 'bg-emerald-100 text-emerald-700',
  won: 'bg-emerald-200 text-emerald-800',
  lost: 'bg-rose-100 text-rose-700',
};

const PIPELINE_STAGES = ['uploaded', 'evaluating', 'drafting', 'review', 'submitted'] as const;

const PIPELINE_COLORS: Record<string, string> = {
  uploaded: '#94A3B8',
  evaluating: '#3B82F6',
  drafting: '#8B5CF6',
  review: '#F59E0B',
  submitted: '#10B981',
};

export default function AnalyticsPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTenders = useCallback(async () => {
    try {
      const res = await apiFetch('/tenders');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTenders((json.tenders || []) as Tender[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenders();
  }, [loadTenders]);

  const metrics = useMemo(() => computeMetrics(tenders), [tenders]);
  const pipeline = useMemo(() => computePipeline(tenders), [tenders]);
  const timeline = useMemo(() => computeTimeline(tenders), [tenders]);
  const performance = useMemo(() => computePerformance(tenders), [tenders]);

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-8">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
            Tender Agent
          </h1>
          <nav className="flex gap-6">
            <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Tenders
            </Link>
            <Link href="/company" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              My Company
            </Link>
            <span className="text-sm font-medium text-slate-900">Analytics</span>
          </nav>
        </div>
      </header>

      <main className="px-8 pb-12 space-y-8">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading analytics...</p>
        ) : (
          <>
            <MetricCards metrics={metrics} />
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
              <div className="space-y-6">
                <PipelineBoard pipeline={pipeline} />
                <DeadlineTimeline entries={timeline} />
              </div>
              <div className="space-y-6">
                <PerformanceCard performance={performance} />
                <ScoreDistribution tenders={tenders} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}


function MetricCards({ metrics }: { metrics: ReturnType<typeof computeMetrics> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Active Tenders" value={String(metrics.activeTenders)} sub={`${metrics.totalTenders} total`} />
      <StatCard
        label="Next Deadline"
        value={metrics.nextDeadline ? formatDeadlineShort(metrics.nextDeadline.deadline!) : '—'}
        sub={metrics.nextDeadline ? metrics.nextDeadline.name : 'No deadlines'}
        urgent={metrics.daysUntilNext !== null && metrics.daysUntilNext <= 7}
      />
      <StatCard
        label="Avg Match Score"
        value={metrics.avgScore !== null ? `${metrics.avgScore}%` : '—'}
        sub={`${metrics.scoredCount} scored`}
      />
      <StatCard
        label="Win Rate"
        value={metrics.winRate !== null ? `${metrics.winRate}%` : '—'}
        sub={`${metrics.wonCount}W / ${metrics.lostCount}L`}
      />
    </div>
  );
}

function StatCard({ label, value, sub, urgent }: { label: string; value: string; sub: string; urgent?: boolean }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-[44px] font-semibold leading-none tracking-tight ${urgent ? 'text-rose-600' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{sub}</p>
    </div>
  );
}


function PipelineBoard({ pipeline }: { pipeline: ReturnType<typeof computePipeline> }) {
  const maxCount = Math.max(1, ...PIPELINE_STAGES.map(s => pipeline[s]?.length || 0));

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <h3 className="text-base font-semibold text-slate-900 mb-5">Pipeline</h3>
      <div className="grid grid-cols-5 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const items = pipeline[stage] || [];
          return (
            <div key={stage}>
              <div className="flex items-center gap-2 mb-3">
                <div className="size-2 rounded-full" style={{ background: PIPELINE_COLORS[stage] }} />
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {STATUS_LABELS[stage]}
                </span>
                <span className="ml-auto text-[11px] font-semibold text-slate-400">{items.length}</span>
              </div>

              <div className="h-1.5 rounded-full bg-slate-100 mb-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(items.length / maxCount) * 100}%`,
                    background: PIPELINE_COLORS[stage],
                  }}
                />
              </div>

              <div className="space-y-2">
                {items.map((t) => (
                  <Link key={t.id} href={`/tender/${t.id}`}>
                    <div className="inline-block rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-[0_1px_4px_rgba(15,23,42,0.06)] hover:shadow-[0_2px_8px_rgba(15,23,42,0.1)] transition-all cursor-pointer">
                      <p className="text-[11px] font-semibold text-slate-900 truncate">{t.name}</p>
                    </div>
                  </Link>
                ))}
                {items.length === 0 && (
                  <p className="text-[11px] text-slate-400 text-center py-4">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function DeadlineTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Deadline Timeline</h3>
        <p className="text-sm text-slate-500">No upcoming deadlines in the next 90 days.</p>
      </div>
    );
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 90);
  const totalDays = 90;

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Deadline Timeline</h3>
      <p className="text-xs text-slate-500 mb-5">Next 90 days</p>

      <div className="relative">
        <div className="h-2 rounded-full bg-slate-100" />

        {[0, 30, 60, 90].map((day) => (
          <div
            key={day}
            className="absolute top-4"
            style={{ left: `${(day / totalDays) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <span className="text-[10px] text-slate-400">
              {day === 0 ? 'Today' : `+${day}d`}
            </span>
          </div>
        ))}

        {entries.map((entry) => {
          const pct = Math.max(0, Math.min(100, (entry.daysFromNow / totalDays) * 100));
          const urgent = entry.daysFromNow <= 7;
          return (
            <Link key={entry.id} href={`/tender/${entry.id}`}>
              <div
                className="absolute -top-1.5 group cursor-pointer"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
              >
                <div className={`size-5 rounded-full border-2 border-white shadow-md ${urgent ? 'bg-rose-500' : 'bg-blue-500'}`} />
                <div className="absolute left-1/2 -translate-x-1/2 top-7 hidden group-hover:block z-10">
                  <div className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-white whitespace-nowrap shadow-lg">
                    <p className="font-semibold">{entry.name}</p>
                    <p className="text-slate-300">{entry.deadlineFormatted} · {entry.daysFromNow}d left</p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 space-y-2">
        {entries.slice(0, 5).map((entry) => (
          <Link key={entry.id} href={`/tender/${entry.id}`}>
            <div className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/50 transition-colors">
              <div className={`size-2.5 rounded-full ${entry.daysFromNow <= 7 ? 'bg-rose-500' : 'bg-blue-500'}`} />
              <span className="text-xs font-medium text-slate-900 flex-1 truncate">{entry.name}</span>
              <span className="text-[11px] text-slate-500">{entry.deadlineFormatted}</span>
              <span className={`text-[11px] font-semibold ${entry.daysFromNow <= 7 ? 'text-rose-600' : 'text-slate-400'}`}>
                {entry.daysFromNow}d
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


function PerformanceCard({ performance }: { performance: ReturnType<typeof computePerformance> }) {
  const rows = performance.comparisonRows;
  const hasData = performance.wonCount > 0 || performance.lostCount > 0;

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Performance Insights</h3>
      <p className="text-xs text-slate-500 mb-5">What separates winners from losers</p>

      {!hasData ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400">Not enough data yet.</p>
          <p className="text-xs text-slate-400 mt-1">Mark tenders as won/lost to see insights.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-28 shrink-0">{row.label}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden relative">
                  {row.wonValue !== null && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-400/60"
                      style={{ width: `${row.wonPct}%` }}
                    />
                  )}
                  {row.lostValue !== null && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-rose-400/40"
                      style={{ width: `${row.lostPct}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="text-right w-16 shrink-0">
                {row.delta !== null && (
                  <span className={`text-[11px] font-semibold ${row.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.delta > 0 ? '+' : ''}{row.deltaFormatted}
                  </span>
                )}
              </div>
            </div>
          ))}

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-slate-500">Won ({performance.wonCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-full bg-rose-400" />
              <span className="text-[11px] text-slate-500">Lost ({performance.lostCount})</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ScoreDistribution({ tenders }: { tenders: Tender[] }) {
  const scored = tenders.filter((t) => t.score !== null);
  const buckets = [
    { label: '80–100', min: 80, max: 100, color: '#3B82F6' },
    { label: '60–79', min: 60, max: 79, color: '#60A5FA' },
    { label: '40–59', min: 40, max: 59, color: '#93C5FD' },
    { label: '0–39', min: 0, max: 39, color: '#CBD5E1' },
  ];

  const counts = buckets.map((b) => ({
    ...b,
    count: scored.filter((t) => t.score! >= b.min && t.score! <= b.max).length,
  }));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Score Distribution</h3>
      <p className="text-xs text-slate-500 mb-5">{scored.length} scored tenders</p>

      {scored.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No scores yet.</p>
      ) : (
        <div className="space-y-3">
          {counts.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-12 shrink-0">{bucket.label}</span>
              <div className="flex-1 h-7 rounded-2xl bg-slate-50 overflow-hidden">
                <div
                  className="h-full rounded-2xl transition-all"
                  style={{
                    width: `${(bucket.count / maxCount) * 100}%`,
                    backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 4px, transparent 4px 8px), linear-gradient(180deg, ${bucket.color}, ${bucket.color})`,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600 w-6 text-right">{bucket.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#3B82F6' : score >= 60 ? '#94A3B8' : '#CBD5E1';
  return (
    <div
      className="grid size-7 place-items-center rounded-full text-white"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, #F1F5F9 0deg)` }}
    >
      <div className="grid size-5 place-items-center rounded-full bg-white text-[9px] font-semibold text-slate-700">
        {score}
      </div>
    </div>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline);
  if (days === null) return null;
  const urgent = days <= 7;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
      {days}d
    </span>
  );
}


type TimelineEntry = {
  id: string;
  name: string;
  deadline: string;
  deadlineFormatted: string;
  daysFromNow: number;
};

function computeMetrics(tenders: Tender[]) {
  const terminalStatuses = ['submitted', 'won', 'lost'];
  const active = tenders.filter((t) => !terminalStatuses.includes(t.status));
  const withDeadline = active.filter((t) => t.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const nextDeadline = withDeadline.length > 0 ? withDeadline[0] : null;
  const daysUntilNext = nextDeadline ? daysUntil(nextDeadline.deadline!) : null;

  const scored = tenders.filter((t) => t.score !== null);
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, t) => s + t.score!, 0) / scored.length) : null;

  const won = tenders.filter((t) => t.status === 'won');
  const lost = tenders.filter((t) => t.status === 'lost');
  const decided = won.length + lost.length;
  const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

  return {
    activeTenders: active.length,
    totalTenders: tenders.length,
    nextDeadline,
    daysUntilNext,
    avgScore,
    scoredCount: scored.length,
    winRate,
    wonCount: won.length,
    lostCount: lost.length,
  };
}

function computePipeline(tenders: Tender[]): Record<string, Tender[]> {
  const map: Record<string, Tender[]> = {};
  for (const stage of PIPELINE_STAGES) map[stage] = [];

  for (const t of tenders) {
    const key = PIPELINE_STAGES.includes(t.status as typeof PIPELINE_STAGES[number])
      ? t.status
      : t.status === 'pending' ? 'uploaded' : null;
    if (key) map[key].push(t);
  }
  return map;
}

function computeTimeline(tenders: Tender[]): TimelineEntry[] {
  const now = new Date();
  return tenders
    .filter((t) => t.deadline && !['won', 'lost'].includes(t.status))
    .map((t) => {
      const d = new Date(t.deadline!);
      const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: t.id,
        name: t.name,
        deadline: t.deadline!,
        deadlineFormatted: d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }),
        daysFromNow: diff,
      };
    })
    .filter((e) => e.daysFromNow >= 0 && e.daysFromNow <= 90)
    .sort((a, b) => a.daysFromNow - b.daysFromNow);
}

function computePerformance(tenders: Tender[]) {
  const won = tenders.filter((t) => t.status === 'won');
  const lost = tenders.filter((t) => t.status === 'lost');

  function avg(arr: Tender[], key: keyof Tender): number | null {
    const vals = arr.map((t) => t[key]).filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  const metrics = [
    { label: 'Match Score', key: 'score' as keyof Tender, unit: '%', max: 100 },
    { label: 'Requirements', key: 'requirement_count' as keyof Tender, unit: '', max: 25 },
  ];

  const comparisonRows = metrics.map((m) => {
    const wonVal = avg(won, m.key);
    const lostVal = avg(lost, m.key);
    const delta = wonVal !== null && lostVal !== null ? wonVal - lostVal : null;
    return {
      label: m.label,
      wonValue: wonVal,
      lostValue: lostVal,
      wonPct: wonVal !== null ? (wonVal / m.max) * 100 : 0,
      lostPct: lostVal !== null ? (lostVal / m.max) * 100 : 0,
      delta,
      deltaFormatted: delta !== null ? `${delta}${m.unit}` : '—',
    };
  });

  return { wonCount: won.length, lostCount: lost.length, comparisonRows };
}

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDeadlineShort(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `${days}d`;
}
