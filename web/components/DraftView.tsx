// Draft-Tab: Artifacts-Layout mit Chat links und dynamischem Dokument-Artifact
// rechts. Generate ruft den nested Endpoint /tenders/{id}/proposal/generate via
// apiFetch (mit JWT). Sections werden vom Wrapper persistiert.

'use client';

import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { ProposalEditor, type ProposalSection, type TextSelection, type SelectionAction } from '@/components/ProposalEditor';
import { ProposalChat, type ProposalChatHandle } from '@/components/ProposalChat';

const DEFAULT_SECTIONS: ProposalSection[] = [
  { id: 'executive-summary', title: 'Executive Summary', content: '' },
  { id: 'problem-framing', title: 'Problem Framing', content: '' },
  { id: 'approach', title: 'Proposed Approach', content: '' },
  { id: 'methodology', title: 'Methodology', content: '' },
  { id: 'deliverables', title: 'Deliverables', content: '' },
  { id: 'team', title: 'Team', content: '' },
  { id: 'pricing', title: 'Price', content: '' },
];

interface MissingInfo {
  section: string;
  question?: string;
  questions?: string[];
}

interface ParsedProposal {
  sections: ProposalSection[];
  title?: string;
  contractingAuthority?: string;
  missingInfo: MissingInfo[];
}

function parseSectionsFromResponse(raw: string): ParsedProposal | null {
  const jsonMatch = raw.match(/\{[\s\S]*"sections"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.sections)) return null;

    const missingInfo: MissingInfo[] = Array.isArray(parsed.missing_info)
      ? parsed.missing_info.filter((m: { section?: string; question?: string; questions?: string[] }) => m.section && (m.question || m.questions?.length))
      : [];

    return {
      sections: parsed.sections.map((s: { id?: string; title?: string; content?: string }, i: number) => ({
        id: s.id || `section-${i}`,
        title: s.title || `Section ${i + 1}`,
        content: s.content || '',
      })),
      title: parsed.title,
      contractingAuthority: parsed.contracting_authority,
      missingInfo,
    };
  } catch {
    return null;
  }
}

export interface ProposalMeta {
  title?: string;
  contractingAuthority?: string;
}

interface DraftViewProps {
  tenderId: string;
  hasParsedText: boolean;
  sections: ProposalSection[];
  onSectionsChange: (sections: ProposalSection[]) => void;
  proposalMeta: ProposalMeta;
  onMetaChange: (meta: ProposalMeta) => void;
}

export function DraftView({ tenderId, hasParsedText, sections, onSectionsChange, onMetaChange }: DraftViewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactOpen, setArtifactOpen] = useState(sections.length > 0);
  const [artifactVisible, setArtifactVisible] = useState(sections.length > 0);
  const chatRef = useRef<ProposalChatHandle>(null);

  useEffect(() => {
    if (sections.length > 0 && !artifactOpen) {
      setArtifactOpen(true);
      requestAnimationFrame(() => setArtifactVisible(true));
    }
  }, [sections.length, artifactOpen]);

  const openArtifact = () => {
    setArtifactOpen(true);
    requestAnimationFrame(() => setArtifactVisible(true));
  };

  const closeArtifact = () => {
    setArtifactVisible(false);
    setTimeout(() => setArtifactOpen(false), 300);
  };

  const generateDraft = async () => {
    if (!hasParsedText) return;
    if (sections.length > 0 && !confirm('Current draft will be completely replaced. Continue?')) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    openArtifact();
    try {
      const res = await apiFetch(`/tenders/${tenderId}/proposal/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const parsed = parseSectionsFromResponse(data.draft);
      if (parsed) {
        onMetaChange({ title: parsed.title, contractingAuthority: parsed.contractingAuthority });
      }

      const allSections = parsed ? parsed.sections : [...DEFAULT_SECTIONS];
      const missingTitles = new Set((parsed?.missingInfo ?? []).map((m) => m.section.toLowerCase()));

      const isSectionIncomplete = (s: ProposalSection) => {
        if (!s.content.trim()) return true;
        if (missingTitles.has(s.title.toLowerCase())) return true;
        if (/\[placeholder|not available|\[tbd\]|n\/a\]/i.test(s.content)) return true;
        return false;
      };

      const completeSections = allSections.filter((s) => !isSectionIncomplete(s));
      const incompleteSections = allSections.filter((s) => isSectionIncomplete(s));
      onSectionsChange(completeSections);

      if (incompleteSections.length > 0) {
        const blocks = incompleteSections.map((s) => {
          const info = parsed?.missingInfo.find((m) => m.section.toLowerCase() === s.title.toLowerCase());
          const questions = info?.questions ?? (info?.question ? [info.question] : ['Please provide the details for this section.']);
          const questionLines = questions.map((q) => `   - ${q}`).join('\n');
          return `**${s.title}**\n${questionLines}`;
        }).join('\n\n');
        chatRef.current?.injectAssistantMessage(
          `I've drafted the sections where I had enough data. The following sections are not yet in the document because I need more information:\n\n${blocks}\n\nPlease answer the questions above and I'll add the sections to the draft.`
        );
      }
    } catch (err) {
      setError((err as Error).message);
      onSectionsChange(DEFAULT_SECTIONS);
    } finally {
      setIsGenerating(false);
    }
  };

  const createEmptyDraft = () => {
    onSectionsChange([...DEFAULT_SECTIONS]);
    openArtifact();
  };

  const handleSectionUpdates = (updates: ProposalSection[]) => {
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    const merged = sections.map((s) => updateMap.get(s.id) ?? s);
    const newOnes = updates.filter((u) => !sections.some((s) => s.id === u.id));
    onSectionsChange([...merged, ...newOnes]);
  };

  const handleSelectionAction = (selection: TextSelection, action: SelectionAction) => {
    const section = sections.find((s) => s.id === selection.sectionId);
    const sectionLabel = section ? `"${section.title}"` : 'the selected text';

    if (action === 'improve') {
      chatRef.current?.sendMessage(
        `Improve the following section from ${sectionLabel}:\n\n"${selection.text}"`
      );
    } else if (action === 'summarize') {
      chatRef.current?.sendMessage(
        `Summarize the following section from ${sectionLabel}:\n\n"${selection.text}"`
      );
    } else {
      chatRef.current?.prefillInput(
        `Regarding ${sectionLabel}: "${selection.text}"\n\n`
      );
    }
  };

  if (!hasParsedText && sections.length === 0) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-amber-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">Tender not yet parsed</p>
          <p className="text-xs text-slate-500">Start a scan in the Fit-Check tab first, then the parsed text will be available for drafting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4">
      {error && (
        <div className="absolute top-2 right-2 max-w-sm rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      <div className={`min-w-0 transition-all duration-300 ease-out ${artifactOpen ? 'flex-1' : 'w-full max-w-3xl mx-auto'}`}>
        <ProposalChat
          ref={chatRef}
          tenderId={tenderId}
          onSectionUpdates={handleSectionUpdates}
          onGenerateDraft={generateDraft}
          onEmptyDraft={createEmptyDraft}
          hasDraft={sections.length > 0}
          isGenerating={isGenerating}
          hasTender={hasParsedText}
        />
      </div>

      {artifactOpen && (
        <div
          className={`w-[calc(210mm+2rem)] shrink-0 min-w-0 transition-all duration-300 ease-out ${
            artifactVisible
              ? 'translate-x-0 opacity-100'
              : 'translate-x-8 opacity-0'
          }`}
        >
          <ProposalEditor
            sections={sections}
            onSectionsChange={onSectionsChange}
            isGenerating={isGenerating}
            onRegenerate={generateDraft}
            hasTender={hasParsedText}
            onSelectionAction={handleSelectionAction}
            onClose={closeArtifact}
          />
        </div>
      )}

      {!artifactOpen && sections.length > 0 && (
        <button
          onClick={openArtifact}
          className="fixed right-6 top-1/2 -translate-y-1/2 z-30 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/90 px-4 py-3 shadow-[0_4px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl hover:bg-white transition-all hover:shadow-[0_4px_32px_rgba(15,23,42,0.12)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium text-slate-700">Proposal Draft</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
