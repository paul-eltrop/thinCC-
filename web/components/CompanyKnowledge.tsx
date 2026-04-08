// Knowledge-Tab: zeigt 20 Standard-Fragen mit Coverage-Status, Re-evaluate-
// Button mit determinate Progress-Bar via SSE und einen Onboarding-Chat zum
// Beantworten der offenen Fragen.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Status = 'covered' | 'partial' | 'missing' | 'unscanned';

type Question = {
  id: string;
  category: string;
  text: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  related_doc_types: string[];
  answer_format: string;
};

type QuestionState = {
  question_id: string;
  status: Status;
  answer: string | null;
  confidence: number;
  user_provided: boolean;
  last_scanned: string | null;
  notes: string | null;
};

type QuestionWithState = { question: Question; state: QuestionState };

type ScanProgress = {
  current: number;
  total: number;
  questionText: string;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function CompanyKnowledge() {
  const [items, setItems] = useState<QuestionWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [chatDone, setChatDone] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const loadItems = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/company/questions');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setItems(json.questions || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chatMessages, chatStreaming]);

  async function reEvaluate() {
    setScanning(true);
    setError(null);
    setProgress({ current: 0, total: items.length || 20, questionText: 'Starte Scan...' });

    try {
      const res = await apiFetch('/company/scan/stream', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error('Kein Stream-Body');

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

          if (currentEvent === 'start') {
            setProgress({ current: 0, total: payload.total, questionText: 'Starte...' });
          } else if (currentEvent === 'progress') {
            setProgress({
              current: payload.current,
              total: payload.total,
              questionText: payload.question_text,
            });
          } else if (currentEvent === 'result') {
            setItems((prev) =>
              prev.map((it) =>
                it.question.id === payload.question_id
                  ? { ...it, state: { ...it.state, status: payload.status } }
                  : it,
              ),
            );
          } else if (currentEvent === 'done') {
            // handled below
          } else if (currentEvent === 'error') {
            setError(payload.message || 'Unbekannter Fehler');
          }
          currentEvent = null;
        }
      }
      await loadItems();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  async function chatTurn(history: ChatMessage[], qId: string | null) {
    setChatStreaming(true);
    setError(null);
    try {
      const res = await apiFetch('/company/chat/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, current_question_id: qId }),
      });
      if (!res.body) throw new Error('Kein Stream-Body');

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
            setCurrentQuestionId(payload.current_question_id);
            setChatDone(payload.done);
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
      await loadItems();
    }
  }

  async function startChat() {
    setChatOpen(true);
    setChatMessages([]);
    setCurrentQuestionId(null);
    setChatDone(false);
    await chatTurn([], null);
  }

  async function sendChatAnswer() {
    const text = chatInput.trim();
    if (!text || chatStreaming || !currentQuestionId) return;
    setChatInput('');
    const newHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newHistory);
    await chatTurn(newHistory, currentQuestionId);
  }

  function endChat() {
    setChatOpen(false);
    setChatMessages([]);
    setCurrentQuestionId(null);
    setChatDone(false);
    setChatInput('');
  }

  const counts = items.reduce(
    (acc, it) => {
      acc[it.state.status] = (acc[it.state.status] || 0) + 1;
      return acc;
    },
    { covered: 0, partial: 0, missing: 0, unscanned: 0 } as Record<Status, number>,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Knowledge Base</h3>
            <p className="mt-1 text-xs text-slate-500">
              {items.length} Fragen ·{' '}
              <span className="text-emerald-700">{counts.covered} covered</span> ·{' '}
              <span className="text-amber-700">{counts.partial} partial</span> ·{' '}
              <span className="text-rose-700">{counts.missing} missing</span> ·{' '}
              <span className="text-slate-600">{counts.unscanned} unscanned</span>
            </p>
          </div>
          <button
            onClick={reEvaluate}
            disabled={scanning || loading || items.length === 0}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning ? 'Wird ausgewertet...' : 'Re-evaluate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {scanning && progress && <ScanProgressCard progress={progress} />}

      {loading ? (
        <p className="text-sm text-slate-500">Lade Fragen...</p>
      ) : (
        <div className="space-y-3">
          {items.map(({ question, state }) => (
            <QuestionRow key={question.id} question={question} state={state} />
          ))}
        </div>
      )}

      <ChatPanel
        scanning={scanning}
        chatOpen={chatOpen}
        chatMessages={chatMessages}
        chatStreaming={chatStreaming}
        chatDone={chatDone}
        chatInput={chatInput}
        currentQuestionId={currentQuestionId}
        chatScrollRef={chatScrollRef}
        onStart={startChat}
        onEnd={endChat}
        onSend={sendChatAnswer}
        onInput={setChatInput}
      />
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    covered: 'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
    missing: 'bg-rose-100 text-rose-700',
    unscanned: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function QuestionRow({ question, state }: { question: Question; state: QuestionState }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <StatusPill status={state.status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{question.text}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
            {question.importance} · {question.category}
            {state.user_provided && (
              <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                user
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScanProgressCard({ progress }: { progress: ScanProgress }) {
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-900">
          Scanne Frage {progress.current} von {progress.total}
        </p>
        <span className="text-xs font-semibold text-slate-600">{Math.round(pct)}%</span>
      </div>
      <p className="mb-4 truncate text-xs text-slate-500">{progress.questionText}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
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
  currentQuestionId,
  chatScrollRef,
  onStart,
  onEnd,
  onSend,
  onInput,
}: {
  scanning: boolean;
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
  chatDone: boolean;
  chatInput: string;
  currentQuestionId: string | null;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onEnd: () => void;
  onSend: () => void;
  onInput: (v: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Onboarding Chat</h3>
          <p className="mt-1 text-xs text-slate-500">
            Beantworte die offenen Fragen direkt im Chat
          </p>
        </div>
        <div className="flex gap-2">
          {!chatOpen ? (
            <button
              onClick={onStart}
              disabled={scanning}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Chat starten
            </button>
          ) : (
            <button
              onClick={onEnd}
              disabled={chatStreaming}
              className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Beenden
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
              <p className="text-xs text-slate-400">Lade erste Frage...</p>
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
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              disabled={chatStreaming || chatDone || !currentQuestionId}
              className="flex-1 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white disabled:opacity-50"
            />
            <button
              onClick={onSend}
              disabled={chatStreaming || chatDone || !chatInput.trim() || !currentQuestionId}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Senden
            </button>
          </div>
        </>
      )}
    </div>
  );
}
