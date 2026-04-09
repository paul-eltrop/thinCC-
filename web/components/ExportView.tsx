/**
 * Export-Tab: Druckfertige Preview im Stil einer EU-Institutional-Proposal
 * mit Navy-Headern, Tabellen, Trennlinien. Download als PDF via html2pdf.js.
 */

'use client';

import { useState, useRef } from 'react';
import type { ProposalSection } from '@/components/ProposalEditor';
import type { ProposalMeta } from '@/components/DraftView';

interface ExportViewProps {
  sections: ProposalSection[];
  tenderName: string;
  proposalMeta: ProposalMeta;
}

function renderMarkdownContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={key++} style={{ fontSize: '13px', fontWeight: 700, color: '#1e3a5f', margin: '18px 0 8px' }}>
          {renderInlineMarkdown(line.slice(4))}
        </h4>
      );
      i++;
      continue;
    }

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        if (!lines[i].match(/^\s*\|[\s\-:|]+\|\s*$/)) {
          tableRows.push(lines[i].trim());
        }
        i++;
      }
      if (tableRows.length > 0) {
        elements.push(renderTable(tableRows, key++));
      }
      continue;
    }

    if (line.match(/^\s*[-•]\s+/)) {
      const bullets: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-•]\s+/)) {
        bullets.push(lines[i].replace(/^\s*[-•]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={key++} style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '11px', lineHeight: '1.8' }}>
          {bullets.map((b, j) => (
            <li key={j} style={{ marginBottom: '4px' }}>{renderInlineMarkdown(b)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    elements.push(
      <p key={key++} style={{ fontSize: '11px', lineHeight: '1.8', margin: '6px 0', color: '#334155' }}>
        {renderInlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('[PLACEHOLDER')) {
      return <span key={i} style={{ backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px', color: '#92400e', fontSize: '10px' }}>{part}</span>;
    }
    return part;
  });
}

function renderTable(rows: string[], key: number) {
  const parseRow = (row: string) =>
    row.split('|').slice(1, -1).map((cell) => cell.trim());

  const headerCells = parseRow(rows[0]);
  const bodyRows = rows.slice(1).map(parseRow);

  return (
    <table key={key} style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0', fontSize: '11px' }}>
      <thead>
        <tr>
          {headerCells.map((cell, i) => (
            <th key={i} style={{
              backgroundColor: '#1e3a5f',
              color: '#ffffff',
              padding: '10px 14px',
              textAlign: 'left',
              fontWeight: 600,
              fontSize: '11px',
              borderBottom: '2px solid #1e3a5f',
            }}>
              {renderInlineMarkdown(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bodyRows.map((cells, rowIdx) => (
          <tr key={rowIdx} style={{ backgroundColor: rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
            {cells.map((cell, cellIdx) => (
              <td key={cellIdx} style={{
                padding: '9px 14px',
                borderBottom: '1px solid #e2e8f0',
                color: '#334155',
                lineHeight: '1.5',
              }}>
                {renderInlineMarkdown(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ExportView({ sections, tenderName, proposalMeta }: ExportViewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const hasSections = sections.length > 0;
  const filledSections = sections.filter((s) => s.content.trim().length > 0);
  const emptySections = sections.filter((s) => s.content.trim().length === 0);
  const placeholderSections = sections.filter((s) => s.content.includes('[PLACEHOLDER'));

  const proposalTitle = proposalMeta.title || `Proposal: ${tenderName}`;
  const contractingAuthority = proposalMeta.contractingAuthority;

  const executiveSummary = sections.find((s) => s.id === 'executive-summary');
  const numberedSections = sections.filter((s) => s.id !== 'executive-summary');

  const exportPdf = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);

    const html2pdf = (await import('html2pdf.js')).default;
    const filename = `Proposal_${tenderName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    const opts: Record<string, unknown> = {
      margin: [15, 15, 15, 15],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };
    await html2pdf().set(opts).from(previewRef.current).save();

    setIsExporting(false);
  };

  if (!hasSections) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/70 p-10 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-slate-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">No draft available</p>
          <p className="text-xs text-slate-500">Create a draft in the Draft tab first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compliance Summary */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Pre-Submit Check</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[11px] font-medium text-emerald-700 mb-1">Filled Sections</p>
            <p className="text-2xl font-semibold text-emerald-700">{filledSections.length}/{sections.length}</p>
          </div>
          <div className={`rounded-2xl p-4 ${emptySections.length > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
            <p className={`text-[11px] font-medium mb-1 ${emptySections.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Empty Sections</p>
            <p className={`text-2xl font-semibold ${emptySections.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{emptySections.length}</p>
          </div>
          <div className={`rounded-2xl p-4 ${placeholderSections.length > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
            <p className={`text-[11px] font-medium mb-1 ${placeholderSections.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Open Placeholders</p>
            <p className={`text-2xl font-semibold ${placeholderSections.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{placeholderSections.length}</p>
          </div>
        </div>

        {(emptySections.length > 0 || placeholderSections.length > 0) && (
          <div className="mt-4 space-y-2">
            {emptySections.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-700"><strong>{s.title}</strong> is empty</span>
              </div>
            ))}
            {placeholderSections.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-700"><strong>{s.title}</strong> contains placeholders</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export Button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{sections.length} sections · {filledSections.length} filled</p>
        <button
          onClick={exportPdf}
          disabled={isExporting || filledSections.length === 0}
          className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
        >
          {isExporting ? (
            <>
              <div className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Exporting...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export as PDF
            </>
          )}
        </button>
      </div>

      {/* PDF Preview */}
      <div className="rounded-3xl border border-white/60 bg-white/70 p-2 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div
          ref={previewRef}
          className="rounded-2xl bg-white"
          style={{ fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", color: '#1e293b' }}
        >
          {/* Title Block */}
          <div style={{ backgroundColor: '#f0f4f8', padding: '48px 48px 36px', borderBottom: '4px solid #1e3a5f' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#1e3a5f', lineHeight: 1.3, marginBottom: '8px' }}>
              {proposalTitle}
            </h1>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, letterSpacing: '0.5px' }}>
              Technical Proposal
            </div>
          </div>

          {/* Contracting Authority */}
          {contractingAuthority && (
            <div style={{ padding: '16px 48px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '24px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a5f', minWidth: '160px' }}>Contracting authority</span>
              <span style={{ fontSize: '11px', color: '#334155' }}>{contractingAuthority}</span>
            </div>
          )}

          {/* Body */}
          <div style={{ padding: '36px 48px 48px' }}>
            {/* Executive Summary */}
            {executiveSummary && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a5f', marginBottom: '4px' }}>
                  Executive Summary
                </h2>
                <div style={{ height: '3px', background: '#1e3a5f', marginBottom: '14px' }} />
                {executiveSummary.content ? (
                  renderMarkdownContent(executiveSummary.content)
                ) : (
                  <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>[No content]</p>
                )}
              </div>
            )}

            {/* Numbered Sections */}
            {numberedSections.map((section, index) => (
              <div key={section.id} style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a5f', marginBottom: '4px' }}>
                  {index + 1}. {section.title}
                </h2>
                <div style={{ height: '3px', background: '#1e3a5f', marginBottom: '14px' }} />
                {section.content ? (
                  renderMarkdownContent(section.content)
                ) : (
                  <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>[No content]</p>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 48px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
            Generated with thinCC · {new Date().toLocaleDateString('en-US')}
          </div>
        </div>
      </div>
    </div>
  );
}
