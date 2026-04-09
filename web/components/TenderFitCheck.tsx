// Tender Fit-Check Tab. Zeigt einen kombinierten Score+Progress-Ring oben,
// streamt Anforderungen in Echtzeit in eine Tabelle (Phase 1) und scant
// danach die Coverage gegen die Company-RAG (Phase 2) mit Live-Reranking.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

type Importance = 'critical' | 'high' | 'medium' | 'low';
type CoverageStatus = 'covered' | 'partial' | 'missing';
type Recommendation = 'no_go' | 'apply' | 'apply_with_input';
type ScanStatus = 'pending' | 'extracting' | 'scanning' | 'completed' | 'error';

type Requirement = {
  id: string;
  text: string;
  category: string;
  importance: Importance;
  is_critical: boolean;
  related_doc_types: string[];
};

type Coverage = {
  requirement_id: string;
  status: CoverageStatus;
  confidence: number;
  evidence: string | null;
  sources: { source_file: string; score: number }[];
  user_provided: boolean;
  notes: string | null;
};

type Ranking = {
  score: number;
  recommendation: Recommendation;
  has_critical_gap: boolean;
  reasoning: string;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Phase = { step: 'parse' | 'extract' | 'scan'; message: string };

export function TenderFitCheck({ tenderId, refreshKey, hasDraft, onGoToDraft }: { tenderId: string; refreshKey?: number; hasDraft?: boolean; onGoToDraft?: () => void }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [coverage, setCoverage] = useState<Record<string, Coverage>>({});
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('pending');

  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatDone, setChatDone] = useState(false);
  const [currentReqId, setCurrentReqId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [promoting, setPromoting] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const loadTender = useCallback(async () => {
    setError(null);
    try {
      console.log('[FitCheck] loading tender', tenderId);
      const res = await apiFetch(`/tenders/${tenderId}`);
      console.log('[FitCheck] response status', res.status);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('[FitCheck] error body', body);
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      console.log('[FitCheck] loaded keys:', Object.keys(json), 'reqs:', (json.requirements || []).length);
      setRequirements(json.requirements || []);
      setCoverage(json.coverage || {});
      setRanking(json.ranking || null);
      setScanStatus(json.scan_status || 'pending');
    } catch (err) {
      console.error('[FitCheck] catch error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    loadTender();
  }, [loadTender, refreshKey]);

  useEffect(() => {
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`coverage-${tenderId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tender_coverage',
      }, (payload) => {
        const reqId = (payload.new as Record<string, unknown>)?.requirement_id as string;
        if (!reqId?.startsWith(tenderId)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadTender(), 2000);
      })
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [tenderId, loadTender]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chatMessages, chatStreaming]);

  async function runScan() {
    if (scanning) return;
    if (requirements.length > 0 && !confirm('Re-scan will overwrite all existing requirements and answers. Continue?')) {
      return;
    }

    setScanning(true);
    setError(null);
    setProgress(0);
    setRequirements([]);
    setCoverage({});
    setRanking(null);
    setPhase({ step: 'parse', message: 'Starting scan...' });

    try {
      const res = await apiFetch(`/tenders/${tenderId}/scan/stream`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error('No stream body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) {
            if (line.trim() === '') currentEvent = null;
            continue;
          }
          const payload = JSON.parse(line.slice(5).trim());

          if (currentEvent === 'phase') {
            setPhase({ step: payload.step, message: payload.message });
            if (payload.step === 'scan') setProgress(50);
          } else if (currentEvent === 'requirement' && payload.requirement) {
            setRequirements((prev) => [...prev, payload.requirement as Requirement]);
            const count = payload.extracted_count || 0;
            const max = payload.max_expected || 25;
            setProgress(Math.min((count / max) * 50, 50));
          } else if (currentEvent === 'coverage_result' && payload.coverage) {
            const cov = payload.coverage as Coverage;
            setCoverage((prev) => ({ ...prev, [cov.requirement_id]: cov }));
            const cur = payload.current || 0;
            const total = payload.total || 1;
            setProgress(50 + (cur / total) * 50);
          } else if (currentEvent === 'ranking') {
            setRanking(payload as Ranking);
          } else if (currentEvent === 'done') {
            setScanStatus('completed');
            setProgress(100);
          } else if (currentEvent === 'error') {
            setError(payload.message || 'Unknown error');
            setScanStatus('error');
          }
          currentEvent = null;
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
      setPhase(null);
      await loadTender();
    }
  }

  async function chatTurn(history: ChatMessage[], reqId: string | null) {
    setChatStreaming(true);
    setError(null);
    try {
      const res = await apiFetch(`/tenders/${tenderId}/chat/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, current_requirement_id: reqId }),
      });
      if (!res.body) throw new Error('No stream body');

      setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) {
            if (line.trim() === '') currentEvent = null;
            continue;
          }
          const payload = JSON.parse(line.slice(5).trim());

          if (currentEvent === 'meta') {
            setCurrentReqId(payload.current_requirement_id);
            setChatDone(payload.done);
          } else if (currentEvent === 'ranking') {
            setRanking(payload as Ranking);
          } else if (currentEvent === 'error') {
            setError(payload.message);
          } else if (currentEvent !== 'end' && payload.delta) {
            setChatMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: 'assistant',
                content: next[next.length - 1].content + payload.delta,
              };
              return next;
            });
          }
          currentEvent = null;
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChatStreaming(false);
      await loadTender();
    }
  }

  async function startChat() {
    setChatOpen(true);
    setChatMessages([]);
    setCurrentReqId(null);
    setChatDone(false);
    await chatTurn([], null);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatStreaming || !currentReqId) return;
    setChatInput('');
    const newHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newHistory);
    await chatTurn(newHistory, currentReqId);
  }

  function endChat() {
    setChatOpen(false);
    setChatMessages([]);
    setCurrentReqId(null);
    setChatDone(false);
    setChatInput('');
  }

  async function handlePromote() {
    setPromoting(true);
    try {
      const res = await apiFetch(`/tenders/${tenderId}/promote`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      alert(`${json.count} answer(s) promoted to company knowledge.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPromoting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading fit check...</p>;
  }

  const counts = requirements.reduce(
    (acc, r) => {
      const status = coverage[r.id]?.status || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      {hasDraft && onGoToDraft && (
        <button
          onClick={onGoToDraft}
          className="flex w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/70 px-5 py-3 backdrop-blur-xl"
        >
          <span className="text-sm font-medium text-blue-700">A draft already exists for this tender.</span>
          <span className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            Open Draft
          </span>
        </button>
      )}
      <ScoreHeroCard
        ranking={ranking}
        scanning={scanning}
        progress={progress}
        scanStatus={scanStatus}
        onScan={runScan}
        canScan={!scanning && !chatStreaming}
        hasRequirements={requirements.length > 0}
      />

      {phase && (
        <div className="rounded-3xl border border-white/60 bg-white/70 p-5 backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-900">{phase.message}</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {(console.error('[FitCheck] RENDERING ERROR:', error), error)}
        </div>
      )}

      <div className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Requirements</h3>
            <p className="mt-1 text-xs text-slate-500">
              {requirements.length} extracted ·{' '}
              <span className="text-emerald-700">{counts.covered || 0} covered</span> ·{' '}
              <span className="text-amber-700">{counts.partial || 0} partial</span> ·{' '}
              <span className="text-rose-700">{counts.missing || 0} missing</span>
              {counts.pending ? ` · ${counts.pending} pending` : ''}
            </p>
          </div>
        </div>

        {requirements.length === 0 ? (
          <p className="text-sm text-slate-500">
            No requirements yet. Start a scan above.
          </p>
        ) : (
          <div className="max-h-44 space-y-2 overflow-y-auto pr-2">
            {requirements.map((req) => (
              <RequirementRow
                key={req.id}
                req={req}
                cov={coverage[req.id]}
                tenderId={tenderId}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function ScoreHeroCard({
  ranking,
  scanning,
  progress,
  scanStatus,
  onScan,
  canScan,
  hasRequirements,
}: {
  ranking: Ranking | null;
  scanning: boolean;
  progress: number;
  scanStatus: ScanStatus;
  onScan: () => void;
  canScan: boolean;
  hasRequirements: boolean;
}) {
  const score = ranking?.score ?? 0;
  const ringValue = scanning ? progress : score;
  const ringColor = scanning
    ? '#3B82F6'
    : score >= 70
      ? '#10B981'
      : score >= 35
        ? '#F59E0B'
        : '#F43F5E';

  const showScore = !scanning && ranking !== null;
  const recLabel = ranking?.recommendation
    ? ranking.recommendation === 'apply'
      ? 'APPLY'
      : ranking.recommendation === 'apply_with_input'
        ? 'APPLY WITH INPUT'
        : 'DO NOT APPLY'
    : null;
  const recColor = ranking?.recommendation === 'apply'
    ? 'bg-emerald-100 text-emerald-700'
    : ranking?.recommendation === 'apply_with_input'
      ? 'bg-amber-100 text-amber-700'
      : ranking?.recommendation === 'no_go'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-600';

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-start gap-5">
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full text-white transition-all duration-300"
          style={{ background: `conic-gradient(${ringColor} ${ringValue * 3.6}deg, #F1F5F9 0deg)` }}
        >
          <div className="grid size-[4.25rem] place-items-center rounded-full bg-white">
            {showScore ? (
              <div className="text-center">
                <div className="text-xl font-semibold text-slate-900">{Math.round(score)}</div>
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Score</div>
              </div>
            ) : scanning ? (
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-900">{Math.round(progress)}%</div>
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Scanning</div>
              </div>
            ) : (
              <div className="text-center text-[10px] text-slate-400">No scan</div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Fit-Check</h3>
              {recLabel && (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${recColor}`}>
                  {recLabel}
                </span>
              )}
              {ranking?.has_critical_gap && (
                <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  CRITICAL GAP
                </span>
              )}
            </div>
            <button
              onClick={onScan}
              disabled={!canScan}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scanning ? 'Scanning...' : hasRequirements ? 'Re-Scan' : 'Start Fit-Check'}
            </button>
          </div>
          <p className="line-clamp-3 text-xs text-slate-600">
            {ranking?.reasoning || (scanStatus === 'pending'
              ? 'Click "Start Fit-Check" to extract requirements and check them against your company knowledge.'
              : 'No assessment available yet.')}
          </p>
        </div>
      </div>
    </div>
  );
}

function RequirementRow({ req, cov, tenderId }: { req: Requirement; cov: Coverage | undefined; tenderId: string }) {
  const status: CoverageStatus | 'pending' = cov?.status || 'pending';
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const showShare = status === 'missing' || status === 'partial';

  const styles: Record<string, string> = {
    covered: 'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
    missing: 'bg-rose-100 text-rose-700',
    pending: 'bg-slate-100 text-slate-500',
  };

  async function handleShare() {
    setSharing(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSharing(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();
    if (!profile) { setSharing(false); return; }

    const linkId = crypto.randomUUID().slice(0, 8);
    await supabase.from('share_links').insert({
      id: linkId,
      company_id: profile.company_id,
      welcome_message: req.text,
      created_by: user.id,
      tender_id: tenderId,
      requirement_id: req.id,
    });

    const url = `${window.location.origin}/share/${linkId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setSharing(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
          {status}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="break-all text-sm font-medium text-slate-900">{req.text}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
            {req.importance} · {req.category}
            {req.is_critical && (
              <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                critical
              </span>
            )}
            {cov?.user_provided && (
              <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                user
              </span>
            )}
          </p>
          {cov?.evidence && (
            <p className="mt-2 break-all text-xs text-slate-600 italic">{cov.evidence}</p>
          )}
        </div>
        {showShare && (
          <button
            onClick={handleShare}
            disabled={sharing}
            className="shrink-0 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            {copied ? 'Copied!' : sharing ? '...' : 'Share'}
          </button>
        )}
      </div>
    </div>
  );
}

function ChatPanel({
  scanning,
  chatOpen,
  chatMessages,
  chatStreaming,
  chatDone,
  chatInput,
  currentReqId,
  chatScrollRef,
  canStart,
  promoting,
  onStart,
  onEnd,
  onSend,
  onInput,
  onPromote,
}: {
  scanning: boolean;
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
  chatDone: boolean;
  chatInput: string;
  currentReqId: string | null;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  canStart: boolean;
  promoting: boolean;
  onStart: () => void;
  onEnd: () => void;
  onSend: () => void;
  onInput: (v: string) => void;
  onPromote: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Gap Closing Chat</h3>
          <p className="mt-1 text-xs text-slate-500">
            Answer open requirements directly in the chat.
          </p>
        </div>
        <div className="flex gap-2">
          {chatOpen && chatDone && (
            <button
              onClick={onPromote}
              disabled={promoting}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {promoting ? 'Promoting...' : 'Save answers to company knowledge'}
            </button>
          )}
          {!chatOpen ? (
            <button
              onClick={onStart}
              disabled={scanning || !canStart}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start chat
            </button>
          ) : (
            <button
              onClick={onEnd}
              disabled={chatStreaming}
              className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            >
              End chat
            </button>
          )}
        </div>
      </div>

      {chatOpen && (
        <>
          <div
            ref={chatScrollRef}
            className="mb-3 h-80 space-y-3 overflow-y-auto rounded-2xl border border-white/60 bg-white/40 p-4"
          >
            {chatMessages.length === 0 && (
              <p className="text-xs text-slate-400">Loading first question...</p>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-slate-900 text-white'
                    : 'bg-white/80 text-slate-900'
                }`}
              >
                {m.content || (chatStreaming && i === chatMessages.length - 1 ? '...' : '')}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type your answer..."
              value={chatInput}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              disabled={chatStreaming || chatDone || !currentReqId}
              className="flex-1 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white disabled:opacity-50"
            />
            <button
              onClick={onSend}
              disabled={chatStreaming || chatDone || !chatInput.trim() || !currentReqId}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
