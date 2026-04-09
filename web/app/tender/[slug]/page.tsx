'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, API_BASE } from '@/lib/api';
import { TenderFitCheck } from '@/components/TenderFitCheck';
import { createClient } from '@/lib/supabase/client';

type TenderRow = {
  id: string;
  name: string;
  client: string | null;
  filename: string | null;
  storage_path: string | null;
  file_size: number | null;
  deadline: string | null;
  status: string;
  uploaded_at: string | null;
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function getToken() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function TenderDetail() {
  const params = useParams();
  const router = useRouter();
  const tenderId = params.slug as string;

  const [tender, setTender] = useState<TenderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentReqId, setCurrentReqId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadTender = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch(`/tenders/${tenderId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      setTender(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    loadTender();
  }, [loadTender]);

  async function handleDelete() {
    if (!tender || !confirm(`Delete tender "${tender.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/tenders/${tender.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  const initChat = async () => {
    if (!tender || currentReqId) return;
    const token = await getToken();
    const res = await fetch(`${API_BASE}/tenders/${tender.id}/chat/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [] }),
    });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let evtType = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event:')) { evtType = line.slice(6).trim(); continue; }
        if (!line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (evtType === 'meta' && data.current_requirement_id) {
            setCurrentReqId(data.current_requirement_id);
          }
        } catch { continue; }
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !tender) return;
    if (!currentReqId) await initChat();

    const userMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/tenders/${tender.id}/chat/turn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          current_requirement_id: currentReqId,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Chat error.' }]);
        setIsLoading(false);
        return;
      }

      let assistantContent = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let evtType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) { evtType = line.slice(6).trim(); continue; }
          if (!line.startsWith('data:')) {
            if (line.trim() === '') evtType = '';
            continue;
          }
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (evtType === 'meta' && data.current_requirement_id) {
              setCurrentReqId(data.current_requirement_id);
            }
            if (data.delta) {
              assistantContent += data.delta;
              setMessages([...updatedMessages, { role: 'assistant', content: assistantContent }]);
            }
            if (evtType === 'token' && data.token) {
              assistantContent += data.token;
              setMessages([...updatedMessages, { role: 'assistant', content: assistantContent }]);
            }
          } catch { continue; }
        }
      }

      if (assistantContent) {
        setMessages([...updatedMessages, { role: 'assistant', content: assistantContent }]);
      }

      setRefreshKey(k => k + 1);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tender) return;

    setMessages(prev => [...prev, { role: 'user', content: `Uploading: ${file.name}` }]);
    setIsLoading(true);

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/tenders/${tender.id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: `${file.name} uploaded and indexed. You can re-run the Fit-Check to update the score.` }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Upload failed.` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-[28px] font-semibold tracking-tight text-slate-900 hover:opacity-70">
            Tender Agent
          </Link>
          <nav className="flex gap-6">
            <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">Tenders</Link>
            <Link href="/company" className="text-sm font-medium text-slate-600 hover:text-slate-900">My Company</Link>
            <Link href="/analytics" className="text-sm font-medium text-slate-600 hover:text-slate-900">Analytics</Link>
          </nav>
        </div>
        {tender && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{tender.name}</p>
              <p className="text-xs text-slate-500">
                {tender.client || 'No client'}{tender.deadline && ` · ${tender.deadline}`}
              </p>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 px-8 pb-24">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <p className="text-sm text-slate-500">Loading tender...</p>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
          ) : tender ? (
            <TenderFitCheck tenderId={tender.id} refreshKey={refreshKey} />
          ) : (
            <p className="text-sm text-slate-500">Tender not found.</p>
          )}
        </div>
      </main>

      {tender && (
        <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 px-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={handleUpload}
            className="hidden"
          />

          {messages.length > 0 && (
            <div className="mb-3 max-h-72 space-y-2 overflow-y-auto overflow-x-hidden px-1">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] break-all whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'border border-white/60 bg-white/70 text-slate-900 shadow-[0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate-400 backdrop-blur-xl">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="flex items-center gap-3 rounded-full border border-white/60 bg-white/80 px-3 py-2.5 shadow-[0_2px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 hover:text-slate-700 disabled:opacity-40"
              title="Upload document"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Upload documents or provide context to close gaps..."
              className="flex-1 bg-transparent px-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
