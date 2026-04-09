'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SharedChat() {
  const { id } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadWelcomeMessage = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('share_links')
        .select('welcome_message')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        setMessages([{
          role: 'assistant',
          content: 'This share link is invalid or no longer exists. Please ask the sender for a new one.',
        }]);
        setLinkInvalid(true);
        setLoaded(true);
        return;
      }

      if (data.welcome_message) {
        setMessages([{
          role: 'assistant',
          content: `Hi! We're preparing a tender and need your help collecting some documents. Specifically: "${data.welcome_message}". Please upload the relevant files below or give context.`,
        }]);
      } else {
        setMessages([{
          role: 'assistant',
          content: `Hi! We're preparing a tender and would appreciate your help. Please upload any relevant documents below or share context via chat.`,
        }]);
      }
      setLoaded(true);
    };
    loadWelcomeMessage();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || linkInvalid) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/share/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_id: id,
          question: input,
          history: messages.slice(1),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody.detail || errBody.error || `Request failed (${res.status})`;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.status === 404
            ? 'This share link no longer exists. Please ask the sender for a new one.'
            : `Sorry, something went wrong: ${detail}`,
        }]);
        return;
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'No response received.',
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Network error. Please check your connection and try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || linkInvalid) return;

    setIsUploading(true);
    setMessages(prev => [...prev, { role: 'user', content: `Uploading ${file.name}...` }]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('share_id', id as string);

    try {
      const res = await fetch(`${API_URL}/share/chat/upload`, { method: 'POST', body: formData });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody.detail || errBody.error || `Upload failed (${res.status})`;
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'user', content: `Failed to upload: ${file.name}` },
          {
            role: 'assistant',
            content: res.status === 404
              ? 'This share link no longer exists. Please ask the sender for a new one.'
              : `Sorry, the upload failed: ${detail}`,
          },
        ]);
        return;
      }

      const data = await res.json();
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'user', content: `Uploaded: ${file.name}` },
        {
          role: 'assistant',
          content: data.reply || `${file.name} has been indexed and is now available in the knowledge base.`,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'user', content: `Failed to upload: ${file.name}` },
        {
          role: 'assistant',
          content: 'Network error during upload. Please check your connection and try again.',
        },
      ]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!loaded) return null;

  return (
    <div
      className="flex min-h-screen flex-col text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <header className="flex items-center px-8 py-5">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Tender Agent
        </h1>
        <span className="ml-3 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
          Shared
        </span>
      </header>

      <main className="flex flex-1 flex-col px-8 pb-8">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto pb-6">
            {messages.length === 0 && (
              <div className="flex flex-1 items-center justify-center pt-32">
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">Ask anything</h2>
                  <p className="text-sm text-slate-500">Ask questions about this company&apos;s profile, team, and capabilities.</p>
                </div>
              </div>
            )}

            {messages.map((message, i) => (
              <div
                key={i}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                    message.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'border border-white/60 bg-white/70 text-slate-900 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm text-slate-400 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="sticky bottom-8">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleUpload}
              className="hidden"
            />
            <div className="flex gap-3 rounded-full border border-white/60 bg-white/70 p-2 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isLoading || linkInvalid}
                className="rounded-full border border-white/60 bg-white/50 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
                title="Upload PDF"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={linkInvalid}
                placeholder={linkInvalid ? 'Share link unavailable' : 'Ask a question...'}
                className="flex-1 bg-transparent px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || linkInvalid}
                className="rounded-full bg-slate-900 px-5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
