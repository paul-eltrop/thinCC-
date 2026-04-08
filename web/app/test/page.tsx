/**
 * Backend Test-Page: ein Spielplatz fuer alle TenderAgent-Endpoints.
 * Health, Upload, Company-Questions, Scan, Save/Delete-Answer und Chat (SSE).
 */

'use client';

import { useEffect, useRef, useState } from 'react';

const API_BASE = 'http://localhost:8000';

type QuestionState = {
  question_id: string;
  status: 'covered' | 'partial' | 'missing' | 'unscanned';
  answer: string | null;
  confidence: number;
  sources: { source_file: string; score: number }[];
  user_provided: boolean;
  last_scanned: string | null;
  notes: string | null;
};

type Question = {
  id: string;
  category: string;
  text: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  related_doc_types: string[];
  answer_format: string;
};

type QuestionWithState = { question: Question; state: QuestionState };

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Requirement = {
  id: string;
  text: string;
  category: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  is_critical: boolean;
  related_doc_types: string[];
};

type RequirementCoverage = {
  requirement_id: string;
  status: 'covered' | 'partial' | 'missing';
  confidence: number;
  evidence: string | null;
  sources: { source_file: string; score: number }[];
  user_provided: boolean;
  notes: string | null;
};

type TenderRanking = {
  score: number;
  recommendation: 'no_go' | 'apply' | 'apply_with_input';
  has_critical_gap: boolean;
  reasoning: string;
};

type Tender = {
  id: string;
  filename: string;
  uploaded_at: string;
  requirements: Requirement[];
  coverage: Record<string, RequirementCoverage>;
  ranking: TenderRanking | null;
};

type TenderSummary = {
  id: string;
  filename: string;
  uploaded_at: string;
  score: number | null;
  recommendation: TenderRanking['recommendation'] | null;
  requirement_count: number;
};

export default function TestPage() {
  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <h1 className="text-[28px] font-semibold tracking-tight">Backend Playground</h1>
        <span className="text-xs text-slate-500">{API_BASE}</span>
      </header>

      <main className="grid grid-cols-1 gap-6 px-8 pb-12 lg:grid-cols-2">
        <HealthCard />
        <UploadCard />
        <div className="lg:col-span-2">
          <CompanyCard />
        </div>
        <div className="lg:col-span-2">
          <ChatCard />
        </div>
        <div className="lg:col-span-2">
          <TenderCard />
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: QuestionState['status'] }) {
  const styles: Record<QuestionState['status'], string> = {
    covered: 'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
    missing: 'bg-rose-100 text-rose-700',
    unscanned: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function Json({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  return (
    <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-900/95 p-4 text-[11px] leading-relaxed text-emerald-100">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function HealthCard() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/health`);
      setData(await res.json());
    } catch (err) {
      setData({ error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Health">
      <PrimaryButton onClick={check} disabled={loading}>
        {loading ? 'Pruefe...' : 'GET /health'}
      </PrimaryButton>
      <Json data={data} />
    </Card>
  );
}

function UploadCard() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setData(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      setData(await res.json());
    } catch (err) {
      setData({ error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Document Upload">
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
        />
        <PrimaryButton onClick={upload} disabled={!file || loading}>
          {loading ? 'Indexiere...' : 'POST /documents/upload'}
        </PrimaryButton>
      </div>
      <Json data={data} />
    </Card>
  );
}

function CompanyCard() {
  const [items, setItems] = useState<QuestionWithState[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/company/questions`);
      const json = await res.json();
      setItems(json.questions || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function scanAll() {
    setScanning(true);
    setError(null);
    try {
      await fetch(`${API_BASE}/company/scan`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }

  async function scanOne(id: string) {
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/company/scan/${id}`, { method: 'POST' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveAnswer(id: string) {
    const answer = drafts[id]?.trim();
    if (!answer) return;
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/company/questions/${id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      setDrafts((d) => ({ ...d, [id]: '' }));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAnswer(id: string) {
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/company/questions/${id}/answer`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card title={`Company Questions (${items.length})`}>
      <div className="mb-4 flex items-center gap-2">
        <PrimaryButton onClick={scanAll} disabled={scanning || loading}>
          {scanning ? 'Scanne... (~30-60s)' : 'POST /company/scan'}
        </PrimaryButton>
        <SecondaryButton onClick={load} disabled={loading || scanning}>
          {loading ? 'Lade...' : 'Reload'}
        </SecondaryButton>
      </div>

      {error && <p className="mb-3 text-xs text-rose-700">{error}</p>}

      <div className="space-y-3">
        {items.map(({ question, state }) => (
          <div
            key={question.id}
            className="rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusPill status={state.status} />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {question.importance} · {question.category}
                  </span>
                  {state.user_provided && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      user
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">{question.text}</p>
                {state.answer && (
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="text-slate-400">Antwort:</span> {state.answer}
                  </p>
                )}
                {state.notes && (
                  <p className="mt-1 text-[11px] text-slate-500">Notes: {state.notes}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <SecondaryButton onClick={() => scanOne(question.id)} disabled={busyId === question.id}>
                  Scan
                </SecondaryButton>
                {state.user_provided && (
                  <SecondaryButton onClick={() => deleteAnswer(question.id)} disabled={busyId === question.id}>
                    Loeschen
                  </SecondaryButton>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Antwort eingeben..."
                value={drafts[question.id] || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [question.id]: e.target.value }))}
                className="flex-1 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:bg-white"
              />
              <PrimaryButton onClick={() => saveAnswer(question.id)} disabled={busyId === question.id}>
                Speichern
              </PrimaryButton>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChatCard() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  async function runTurn(history: ChatMessage[], questionId: string | null) {
    setStreaming(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/company/chat/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, current_question_id: questionId }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error('Kein Stream-Body');

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const payload = JSON.parse(line.slice(5).trim());
            if (currentEvent === 'meta') {
              setCurrentQuestionId(payload.current_question_id);
              setDone(payload.done);
            } else if (currentEvent === 'end') {
              // ignore
            } else if (currentEvent === 'error') {
              setError(payload.message);
            } else if (payload.delta) {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: 'assistant',
                  content: next[next.length - 1].content + payload.delta,
                };
                return next;
              });
            }
            currentEvent = null;
          } else if (line.trim() === '') {
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(String(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function startChat() {
    setMessages([]);
    setCurrentQuestionId(null);
    setDone(false);
    await runTurn([], null);
  }

  async function sendAnswer() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const newHistory: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newHistory);
    await runTurn(newHistory, currentQuestionId);
  }

  function abort() {
    abortRef.current?.abort();
  }

  return (
    <Card title="Onboarding Chat">
      <div className="mb-3 flex items-center gap-2">
        <PrimaryButton onClick={startChat} disabled={streaming}>
          Chat starten
        </PrimaryButton>
        {streaming && (
          <SecondaryButton onClick={abort} disabled={false}>
            Stop
          </SecondaryButton>
        )}
        {currentQuestionId && (
          <span className="text-[11px] text-slate-500">
            aktuelle Frage: <span className="font-mono">{currentQuestionId}</span>
          </span>
        )}
        {done && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            done
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-rose-700">{error}</p>}

      <div
        ref={scrollRef}
        className="mb-3 h-80 space-y-3 overflow-y-auto rounded-2xl border border-white/60 bg-white/40 p-4"
      >
        {messages.length === 0 && (
          <p className="text-xs text-slate-400">Noch keine Nachrichten. Klick auf "Chat starten".</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              m.role === 'user'
                ? 'ml-auto bg-slate-900 text-white'
                : 'bg-white/80 text-slate-900'
            }`}
          >
            {m.content || (streaming && i === messages.length - 1 ? '...' : '')}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Antwort tippen..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendAnswer()}
          disabled={streaming || done}
          className="flex-1 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white disabled:opacity-50"
        />
        <PrimaryButton onClick={sendAnswer} disabled={streaming || done || !input.trim()}>
          Senden
        </PrimaryButton>
      </div>
    </Card>
  );
}

function FitScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#3B82F6' : score >= 60 ? '#94A3B8' : '#CBD5E1';
  return (
    <div
      className="grid size-14 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, #F1F5F9 0deg)` }}
    >
      <div className="grid size-11 place-items-center rounded-full bg-white text-sm font-semibold text-slate-900">
        {Math.round(score)}
      </div>
    </div>
  );
}

function RecommendationPill({ recommendation }: { recommendation: TenderRanking['recommendation'] }) {
  const styles: Record<TenderRanking['recommendation'], string> = {
    apply: 'bg-emerald-100 text-emerald-700',
    apply_with_input: 'bg-amber-100 text-amber-700',
    no_go: 'bg-rose-100 text-rose-700',
  };
  const labels: Record<TenderRanking['recommendation'], string> = {
    apply: 'Bewerben',
    apply_with_input: 'Bewerben mit Input',
    no_go: 'Nicht bewerben',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[recommendation]}`}>
      {labels[recommendation]}
    </span>
  );
}

function CoveragePill({ status }: { status: RequirementCoverage['status'] }) {
  const styles: Record<RequirementCoverage['status'], string> = {
    covered: 'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
    missing: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function TenderCard() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tender, setTender] = useState<Tender | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentReqId, setCurrentReqId] = useState<string | null>(null);
  const [chatDone, setChatDone] = useState(false);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [promoteResult, setPromoteResult] = useState<unknown>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chatMessages, chatStreaming]);

  async function loadList() {
    try {
      const res = await fetch(`${API_BASE}/tenders`);
      const json = await res.json();
      setTenders(json.tenders || []);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setBusy(true);
    setError(null);
    resetChat();
    try {
      const res = await fetch(`${API_BASE}/tenders/${id}`);
      const json = await res.json();
      setTender(json);
      setLiveScore(json.ranking?.score ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadTender() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/tenders/upload`, { method: 'POST', body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setFile(null);
      await loadList();
      setTender(json);
      setSelectedId(json.id);
      setLiveScore(json.ranking?.score ?? null);
      resetChat();
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setUploading(false);
    }
  }

  async function recheck() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/tenders/${selectedId}/recheck`, { method: 'POST' });
      const json = await res.json();
      setTender(json);
      setLiveScore(json.ranking?.score ?? null);
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTender(id: string) {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/tenders/${id}`, { method: 'DELETE' });
      if (selectedId === id) {
        setSelectedId(null);
        setTender(null);
        resetChat();
      }
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  function resetChat() {
    setChatMessages([]);
    setCurrentReqId(null);
    setChatDone(false);
    setChatInput('');
    setPromoteResult(null);
  }

  async function runChatTurn(history: ChatMessage[], reqId: string | null) {
    if (!selectedId) return;
    setChatStreaming(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/tenders/${selectedId}/chat/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, current_requirement_id: reqId }),
      });

      if (!res.body) throw new Error('Kein Stream-Body');

      setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const payload = JSON.parse(line.slice(5).trim());
            if (currentEvent === 'meta') {
              setCurrentReqId(payload.current_requirement_id);
              setChatDone(payload.done);
              if (typeof payload.current_score === 'number') setLiveScore(payload.current_score);
            } else if (currentEvent === 'ranking') {
              setLiveScore(payload.score);
              setTender((t) => (t ? { ...t, ranking: payload } : t));
            } else if (currentEvent === 'error') {
              setError(payload.message);
            } else if (currentEvent === 'end') {
              // ignore
            } else if (payload.delta) {
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
          } else if (line.trim() === '') {
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setChatStreaming(false);
      if (selectedId) {
        const res = await fetch(`${API_BASE}/tenders/${selectedId}`);
        if (res.ok) setTender(await res.json());
      }
    }
  }

  async function startChat() {
    resetChat();
    await runChatTurn([], null);
  }

  async function sendChatAnswer() {
    const text = chatInput.trim();
    if (!text || chatStreaming || !currentReqId) return;
    setChatInput('');
    const newHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newHistory);
    await runChatTurn(newHistory, currentReqId);
  }

  async function endChat() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/tenders/${selectedId}/chat/end`, { method: 'POST' });
      setPromoteResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const chatBlocked = tender?.ranking?.recommendation === 'no_go';

  return (
    <Card title={`Tender Fit-Check (${tenders.length})`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
        />
        <PrimaryButton onClick={uploadTender} disabled={!file || uploading}>
          {uploading ? 'Verarbeite... (~30-90s)' : 'POST /tenders/upload'}
        </PrimaryButton>
        <SecondaryButton onClick={loadList} disabled={uploading}>
          Reload
        </SecondaryButton>
      </div>

      {error && <p className="mb-3 text-xs text-rose-700">{error}</p>}

      {tenders.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {tenders.map((t) => (
            <button
              key={t.id}
              onClick={() => loadDetail(t.id)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                selectedId === t.id
                  ? 'border-blue-200 bg-blue-50/60'
                  : 'border-white/60 bg-white/60 hover:bg-white/80'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{t.filename}</p>
                <p className="text-[11px] text-slate-500">
                  {new Date(t.uploaded_at).toLocaleString()} · {t.requirement_count} Reqs
                </p>
              </div>
              <div className="ml-3 flex items-center gap-2">
                {t.score !== null && <FitScoreRing score={t.score} />}
                {t.recommendation && <RecommendationPill recommendation={t.recommendation} />}
              </div>
            </button>
          ))}
        </div>
      )}

      {tender && (
        <div className="space-y-4 rounded-2xl border border-white/60 bg-white/50 p-5 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{tender.id}</p>
              <h3 className="truncate text-base font-semibold">{tender.filename}</h3>
              {tender.ranking && (
                <p className="mt-1 text-xs text-slate-600">{tender.ranking.reasoning}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {tender.ranking && <FitScoreRing score={liveScore ?? tender.ranking.score} />}
              {tender.ranking && <RecommendationPill recommendation={tender.ranking.recommendation} />}
              <div className="flex gap-2">
                <SecondaryButton onClick={recheck} disabled={busy}>
                  Recheck
                </SecondaryButton>
                <SecondaryButton onClick={() => deleteTender(tender.id)} disabled={busy}>
                  Loeschen
                </SecondaryButton>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {tender.requirements.map((req) => {
              const cov = tender.coverage[req.id];
              return (
                <div
                  key={req.id}
                  className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {cov && <CoveragePill status={cov.status} />}
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {req.importance} · {req.category}
                        </span>
                        {req.is_critical && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                            kritisch
                          </span>
                        )}
                        {cov?.user_provided && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            user
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-900">{req.text}</p>
                      {cov?.evidence && (
                        <p className="mt-1 text-xs text-slate-600">
                          <span className="text-slate-400">Evidence:</span> {cov.evidence}
                        </p>
                      )}
                      {cov?.notes && (
                        <p className="mt-1 text-[11px] text-slate-500">Notes: {cov.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 rounded-2xl border border-white/60 bg-white/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={startChat} disabled={chatStreaming || chatBlocked || busy}>
                Tender-Chat starten
              </PrimaryButton>
              <PrimaryButton onClick={endChat} disabled={chatStreaming || busy || !selectedId}>
                Chat beenden + Promote
              </PrimaryButton>
              {chatBlocked && (
                <span className="text-[11px] text-rose-700">
                  No-Go: kein Chat erlaubt.
                </span>
              )}
              {currentReqId && (
                <span className="text-[11px] text-slate-500">
                  aktuelle Req: <span className="font-mono">{currentReqId}</span>
                </span>
              )}
              {chatDone && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  done
                </span>
              )}
            </div>

            <div
              ref={chatScrollRef}
              className="h-72 space-y-3 overflow-y-auto rounded-2xl border border-white/60 bg-white/60 p-4"
            >
              {chatMessages.length === 0 && (
                <p className="text-xs text-slate-400">
                  Klick "Tender-Chat starten" um Luecken zu fuellen.
                </p>
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
                placeholder="Antwort tippen..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatAnswer()}
                disabled={chatStreaming || chatDone || !currentReqId}
                className="flex-1 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white disabled:opacity-50"
              />
              <PrimaryButton
                onClick={sendChatAnswer}
                disabled={chatStreaming || chatDone || !chatInput.trim() || !currentReqId}
              >
                Senden
              </PrimaryButton>
            </div>

            {promoteResult !== null && <Json data={promoteResult} />}
          </div>
        </div>
      )}
    </Card>
  );
}
