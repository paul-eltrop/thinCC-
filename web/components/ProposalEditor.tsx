/**
 * Artifact-artiger Proposal-Editor: Header-Bar mit Preview/Code-Toggle,
 * Copy und Close. Markdown-Rendering, Inline-Edit, Floating-Toolbar.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface ProposalSection {
  id: string;
  title: string;
  content: string;
}

export interface TextSelection {
  sectionId: string;
  text: string;
}

export type SelectionAction = 'improve' | 'summarize' | 'chat';

interface ProposalEditorProps {
  sections: ProposalSection[];
  onSectionsChange: (sections: ProposalSection[]) => void;
  isGenerating: boolean;
  onRegenerate: () => void;
  hasTender: boolean;
  onSelectionAction: (selection: TextSelection, action: SelectionAction) => void;
  onClose: () => void;
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold text-slate-800 mt-4 mb-2">$1</h4>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');

  const lines = html.split('\n');
  const result: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (tableRows.length < 2) {
      result.push(...tableRows);
    } else {
      const headerCells = tableRows[0].split('|').filter(Boolean).map((c) => c.trim());
      const bodyRows = tableRows.slice(2);

      let table = '<div class="overflow-x-auto my-3"><table class="w-full text-sm border-collapse">';
      table += '<thead><tr class="bg-slate-800 text-white">';
      headerCells.forEach((c) => { table += `<th class="px-4 py-2.5 text-left text-xs font-semibold">${c}</th>`; });
      table += '</tr></thead><tbody>';

      bodyRows.forEach((row, ri) => {
        const cells = row.split('|').filter(Boolean).map((c) => c.trim());
        const bg = ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';
        table += `<tr class="${bg} border-b border-slate-100">`;
        cells.forEach((c) => { table += `<td class="px-4 py-2 text-slate-700">${c}</td>`; });
        table += '</tr>';
      });

      table += '</tbody></table></div>';
      result.push(table);
    }
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      inTable = true;
      if (!line.trim().match(/^\|[\s-|]+\|$/)) {
        tableRows.push(line);
      } else {
        tableRows.push(line);
      }
      continue;
    }

    if (inTable) flushTable();

    if (line.trim().startsWith('- ')) {
      result.push(`<div class="flex gap-2 ml-1 my-0.5"><span class="text-slate-400 mt-0.5">&#x2022;</span><span>${line.trim().slice(2)}</span></div>`);
    } else if (line.trim() === '') {
      result.push('<div class="h-2"></div>');
    } else {
      result.push(`<p class="leading-relaxed">${line}</p>`);
    }
  }

  if (inTable) flushTable();
  return result.join('\n');
}

function sectionsToMarkdown(sections: ProposalSection[]): string {
  return sections
    .map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.content}`)
    .join('\n\n---\n\n');
}

function markdownToSections(markdown: string, existingSections: ProposalSection[]): ProposalSection[] {
  const blocks = markdown.split(/\n\n---\n\n/);
  return blocks.map((block, i) => {
    const titleMatch = block.match(/^## \d+\.\s*(.+)\n\n([\s\S]*)$/);
    const existing = existingSections[i];
    if (titleMatch) {
      return {
        id: existing?.id || `section-${i}`,
        title: titleMatch[1].trim(),
        content: titleMatch[2].trim(),
      };
    }
    return {
      id: existing?.id || `section-${i}`,
      title: existing?.title || `Section ${i + 1}`,
      content: block.replace(/^## .+\n\n/, '').trim(),
    };
  });
}

export function ProposalEditor({ sections, onSectionsChange, isGenerating, onRegenerate, hasTender, onSelectionAction, onClose }: ProposalEditorProps) {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ x: number; y: number; sectionId: string; text: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleContentChange = (sectionId: string, newContent: string) => {
    onSectionsChange(
      sections.map((s) => (s.id === sectionId ? { ...s, content: newContent } : s))
    );
  };

  const handleTitleChange = (sectionId: string, newTitle: string) => {
    onSectionsChange(
      sections.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s))
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sectionsToMarkdown(sections));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMouseUp = useCallback(() => {
    if (viewMode !== 'preview') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelectionToolbar(null);
      return;
    }

    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (!editorRect) return;

    let node: Node | null = range.startContainer;
    let sectionId: string | null = null;
    while (node) {
      if (node instanceof HTMLElement) {
        const id = node.getAttribute('data-section-id');
        if (id) { sectionId = id; break; }
      }
      node = node.parentNode;
    }

    if (!sectionId) return;

    setSelectionToolbar({
      x: rect.left + rect.width / 2 - editorRect.left,
      y: rect.top - editorRect.top - 8,
      sectionId,
      text,
    });
  }, [viewMode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-selection-toolbar]')) {
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) setSelectionToolbar(null);
        }, 100);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between rounded-t-2xl border border-white/60 bg-white/80 px-5 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
            <span className="text-xs font-medium text-slate-500">Generating proposal...</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative size-12">
              <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">Retrieving RAG context...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={editorRef} className="relative flex h-full flex-col bg-slate-100/50">
      <div className="mx-auto flex w-[210mm] items-center justify-between rounded-t-2xl bg-slate-800 px-5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-full bg-slate-700 p-0.5">
            <button
              onClick={() => { setViewMode('preview'); setEditingSection(null); }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'preview' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => { setViewMode('code'); setEditingSection(null); }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'code' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              Code
            </button>
          </div>
          <span className="text-xs font-medium text-white">Proposal Draft</span>
          <span className="text-[10px] text-slate-400">{sections.length} sections</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="rounded-full px-3 py-1 text-[11px] font-medium text-slate-400 hover:text-white transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onRegenerate}
            disabled={!hasTender}
            className="rounded-full p-1.5 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
            title="Regenerate"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:text-white transition-colors"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div ref={contentRef} className="flex-1 overflow-y-auto py-2">
        {viewMode === 'code' ? (
          <div className="mx-auto w-[210mm] p-6">
            <textarea
              value={sectionsToMarkdown(sections)}
              onChange={(e) => onSectionsChange(markdownToSections(e.target.value, sections))}
              className="w-full min-h-[500px] resize-none rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-blue-300"
            />
          </div>
        ) : (
          <div className="mx-auto w-[210mm] min-h-[297mm] bg-white px-[25mm] py-[20mm] shadow-[0_2px_24px_rgba(15,23,42,0.08)] space-y-8" onMouseUp={handleMouseUp}>
            {sections.map((section, index) => (
              <div
                key={section.id}
                id={`section-${section.id}`}
                data-section-id={section.id}
                className="group"
              >
                <div className="flex items-center gap-3 mb-4 border-b-2 border-slate-800 pb-2">
                  <span className="text-lg font-semibold text-slate-900">{index + 1}.</span>
                  {editingSection === section.id ? (
                    <input
                      value={section.title}
                      onChange={(e) => handleTitleChange(section.id, e.target.value)}
                      onBlur={() => setEditingSection(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingSection(null)}
                      autoFocus
                      className="flex-1 bg-transparent text-lg font-semibold text-slate-900 outline-none"
                    />
                  ) : (
                    <h2
                      className="flex-1 text-lg font-semibold text-slate-900 cursor-text"
                      onDoubleClick={() => setEditingSection(section.id)}
                    >
                      {section.title}
                    </h2>
                  )}
                  <button
                    onClick={() => setEditingSection(editingSection === section.id ? null : section.id)}
                    className="rounded-full p-1.5 text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>

                {editingSection === section.id ? (
                  <div className="relative">
                    <textarea
                      value={section.content}
                      onChange={(e) => handleContentChange(section.id, e.target.value)}
                      rows={Math.max(6, section.content.split('\n').length + 2)}
                      className="w-full resize-none rounded-2xl border border-blue-200 bg-blue-50/30 p-4 text-sm leading-relaxed text-slate-700 outline-none focus:border-blue-300"
                      autoFocus
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => setEditingSection(null)}
                        className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => {
                          onSectionsChange(sections.filter((s) => s.id !== section.id));
                          setEditingSection(null);
                        }}
                        className="rounded-full px-3 py-1 text-[11px] font-medium text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-sm text-slate-700 cursor-text selection:bg-blue-100"
                    onDoubleClick={() => setEditingSection(section.id)}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                  />
                )}
              </div>
            ))}

            <button
              onClick={() => {
                const newSection: ProposalSection = {
                  id: `section-${Date.now()}`,
                  title: 'New Section',
                  content: '',
                };
                onSectionsChange([...sections, newSection]);
                setEditingSection(newSection.id);
              }}
              className="mx-auto flex items-center gap-2 rounded-full border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add section
            </button>
          </div>
        )}
      </div>

      {/* Selection Toolbar */}
      {selectionToolbar && (
        <div
          data-selection-toolbar
          className="absolute z-50 flex items-center gap-1 rounded-2xl border border-white/60 bg-white/95 px-2 py-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          style={{
            left: selectionToolbar.x,
            top: selectionToolbar.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <button
            onClick={() => {
              onSelectionAction({ sectionId: selectionToolbar.sectionId, text: selectionToolbar.text }, 'improve');
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            Improve
          </button>
          <button
            onClick={() => {
              onSelectionAction({ sectionId: selectionToolbar.sectionId, text: selectionToolbar.text }, 'summarize');
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" />
            </svg>
            Summarize
          </button>
          <button
            onClick={() => {
              onSelectionAction({ sectionId: selectionToolbar.sectionId, text: selectionToolbar.text }, 'chat');
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Edit in chat
          </button>
        </div>
      )}
    </div>
  );
}
