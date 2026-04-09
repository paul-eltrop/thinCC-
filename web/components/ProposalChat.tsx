// Artifacts-Style Chat fuer Proposal-Verbesserungen. Nutzt apiFetch fuer
// Auth + Tenant-Isolation und ruft den nested Endpoint unter /tenders/{id}.
// Wenn Updates kommen, spielt es die merged Sections direkt an die Parent zurueck.

'use client';

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { apiFetch } from '@/lib/api';
import type { ProposalSection } from '@/components/ProposalEditor';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProposalChatProps {
  tenderId: string;
  onSectionUpdates: (updates: ProposalSection[]) => void;
  onGenerateDraft: () => void;
  onEmptyDraft: () => void;
  hasDraft: boolean;
  isGenerating: boolean;
  hasTender: boolean;
}

export interface ProposalChatHandle {
  sendMessage: (text: string) => void;
  prefillInput: (text: string) => void;
}

export const ProposalChat = forwardRef<ProposalChatHandle, ProposalChatProps>(
  function ProposalChat({ tenderId, onSectionUpdates, onGenerateDraft, onEmptyDraft, hasDraft, isGenerating, hasTender }, ref) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const doSend = async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const res = await apiFetch(`/tenders/${tenderId}/proposal/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: messages,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);

        if (data.sections_after_merge?.length) {
          onSectionUpdates(data.sections_after_merge);
        } else if (data.updated_sections?.length) {
          onSectionUpdates(data.updated_sections);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${(err as Error).message}` },
        ]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    };

    useImperativeHandle(ref, () => ({
      sendMessage: (text: string) => doSend(text),
      prefillInput: (text: string) => {
        setInput(text);
        inputRef.current?.focus();
      },
    }));

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend(input);
      }
    };

    const suggestions = hasDraft
      ? [
          'Improve the Executive Summary',
          'Write the Methodology in more detail',
          'What gaps does the draft have?',
          'Make Section 3 more convincing',
        ]
      : [];

    return (
      <div className="flex h-full flex-col rounded-3xl border border-white/60 bg-white/70 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Proposal Assistant</p>
            <p className="text-[10px] text-slate-500">
              {hasDraft ? 'Ask questions or select text in the document' : 'Create a draft to get started'}
            </p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {!hasDraft && messages.length === 0 && (
            <div className="flex flex-col items-center gap-5 pt-16">
              <div className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-50 to-purple-50">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-slate-700">Create Proposal Draft</p>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  Generate a draft based on the tender or start with an empty template.
                </p>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={onGenerateDraft}
                  disabled={isGenerating || !hasTender}
                  className="rounded-full bg-slate-900 px-5 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="size-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Generating...
                    </span>
                  ) : (
                    'Generate draft'
                  )}
                </button>
                <button
                  onClick={onEmptyDraft}
                  disabled={isGenerating}
                  className="rounded-full border border-white/60 bg-white/70 px-5 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors"
                >
                  Empty draft
                </button>
              </div>
            </div>
          )}

          {hasDraft && messages.length === 0 && (
            <div className="space-y-4 pt-8">
              <p className="text-sm text-slate-500 text-center leading-relaxed">
                Describe what you want to change — or select text in the document on the right.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => doSend(suggestion)}
                    className="rounded-2xl border border-white/60 bg-white/50 px-4 py-3 text-left text-xs text-slate-600 hover:bg-white/80 hover:text-slate-900 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white/80 border border-white/60 text-slate-700'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-white/80 border border-white/60 px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                  <span className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                  <span className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasDraft ? 'e.g. "Improve the Executive Summary"...' : 'Ask a question about the tender...'}
              rows={2}
              className="flex-1 resize-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            <button
              onClick={() => doSend(input)}
              disabled={!input.trim() || isLoading}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-900 text-white disabled:opacity-40 hover:bg-slate-800 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
