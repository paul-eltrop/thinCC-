// Team-Tab: Liste aller Mitarbeiter mit CV-Status. Erlaubt manuelles Anlegen,
// Loeschen und CV-Verknuepfung sowie einen RAG-Scan der via Gemini neue
// Mitarbeiter aus den indexierten Dokumenten extrahiert.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Seniority = 'junior' | 'mid' | 'senior' | 'lead';

type Member = {
  id: string;
  name: string;
  role: string | null;
  seniority: Seniority | null;
  cv_document_id: string | null;
  cv_document_name: string | null;
  created_by_scan: boolean;
};

type CvOption = { id: string; name: string };

type ScanPhase = { step: string; message: string };

const SENIORITIES: Seniority[] = ['junior', 'mid', 'senior', 'lead'];

export function CompanyTeam() {
  const [members, setMembers] = useState<Member[]>([]);
  const [cvOptions, setCvOptions] = useState<CvOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase | null>(null);
  const [scanFound, setScanFound] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [openCvFor, setOpenCvFor] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [m, c] = await Promise.all([apiFetch('/team'), apiFetch('/team/cv-options')]);
      if (!m.ok) throw new Error(`Members HTTP ${m.status}`);
      if (!c.ok) throw new Error(`CV-Options HTTP ${c.status}`);
      const mj = await m.json();
      const cj = await c.json();
      setMembers(mj.members || []);
      setCvOptions(cj.options || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function addMember(name: string, role: string, seniority: string) {
    setError(null);
    try {
      const res = await apiFetch('/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, seniority: seniority || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      setShowAdd(false);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteMember(id: string) {
    if (!confirm('Mitarbeiter wirklich loeschen?')) return;
    setError(null);
    try {
      const res = await apiFetch(`/team/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function setCv(memberId: string, cvId: string | null) {
    setError(null);
    setOpenCvFor(null);
    const cvName = cvId ? cvOptions.find((o) => o.id === cvId)?.name || null : null;
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, cv_document_id: cvId, cv_document_name: cvName } : m,
      ),
    );
    try {
      const res = await apiFetch(`/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv_document_id: cvId || '' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError((err as Error).message);
      await loadAll();
    }
  }

  async function runScan() {
    setScanning(true);
    setScanFound(0);
    setError(null);
    setScanPhase({ step: 'start', message: 'Starte Scan...' });

    try {
      const res = await apiFetch('/team/scan/stream', { method: 'POST' });
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

          if (currentEvent === 'phase') {
            setScanPhase({ step: payload.step, message: payload.message });
          } else if (currentEvent === 'result' && payload.member) {
            setMembers((prev) => [...prev, payload.member as Member]);
            setScanFound((n) => n + 1);
          } else if (currentEvent === 'error') {
            setError(payload.message || 'Unbekannter Fehler');
          }
          currentEvent = null;
        }
      }
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
      setScanPhase(null);
    }
  }

  const withCv = members.filter((m) => m.cv_document_id).length;
  const locked = scanning;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Team</h3>
            <p className="mt-1 text-xs text-slate-500">
              {members.length} Mitarbeiter ·{' '}
              <span className="text-emerald-700">{withCv} mit CV</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(true)}
              disabled={locked}
              className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Mitarbeiter hinzufuegen
            </button>
            <button
              onClick={runScan}
              disabled={locked || loading}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scanning ? 'Scanne...' : 'RAG scannen'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {scanning && scanPhase && (
        <div className="rounded-3xl border border-white/60 bg-white/70 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">{scanPhase.message}</p>
            <span className="text-xs font-semibold text-slate-600">
              {scanFound} neue Mitarbeiter
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400" />
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Lade Team...</p>
      ) : members.length === 0 ? (
        <div className="rounded-3xl border border-white/60 bg-white/70 p-8 text-center backdrop-blur-xl">
          <p className="text-sm text-slate-500">
            Noch keine Mitarbeiter. Fuege manuell welche hinzu oder scanne den RAG.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              cvOptions={cvOptions}
              locked={locked}
              dropdownOpen={openCvFor === m.id}
              onToggleDropdown={() => setOpenCvFor(openCvFor === m.id ? null : m.id)}
              onPickCv={(cvId) => setCv(m.id, cvId)}
              onDelete={() => deleteMember(m.id)}
            />
          ))}
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSubmit={addMember} />}
    </div>
  );
}

function MemberRow({
  member,
  cvOptions,
  locked,
  dropdownOpen,
  onToggleDropdown,
  onPickCv,
  onDelete,
}: {
  member: Member;
  cvOptions: CvOption[];
  locked: boolean;
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onPickCv: (cvId: string | null) => void;
  onDelete: () => void;
}) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasCv = !!member.cv_document_id;

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400 text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
            <p className="truncate text-xs text-slate-500">
              {member.role || 'Keine Rolle'}
              {member.seniority && (
                <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                  {member.seniority}
                </span>
              )}
              {member.created_by_scan && (
                <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  scan
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <button
            onClick={onToggleDropdown}
            disabled={locked}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${
              hasCv
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title={member.cv_document_name || ''}
          >
            {hasCv ? 'CV vorhanden' : 'kein CV'}
            <span className="text-[9px]">▼</span>
          </button>
          <button
            onClick={onDelete}
            disabled={locked}
            className="rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            aria-label="Loeschen"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-9 z-10 w-64 overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-[0_8px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              <button
                onClick={() => onPickCv(null)}
                className="block w-full px-4 py-2.5 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                Kein CV
              </button>
              {cvOptions.length === 0 ? (
                <p className="px-4 py-2.5 text-xs text-slate-400">
                  Keine CV-Dokumente hochgeladen
                </p>
              ) : (
                cvOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onPickCv(opt.id)}
                    className={`block w-full px-4 py-2.5 text-left text-xs hover:bg-slate-50 ${
                      opt.id === member.cv_document_id
                        ? 'bg-emerald-50 font-medium text-emerald-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {opt.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string, role: string, seniority: string) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [seniority, setSeniority] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_8px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Mitarbeiter hinzufuegen</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm outline-none focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Rolle</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm outline-none focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Seniority</label>
            <select
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm outline-none focus:bg-white"
            >
              <option value="">—</option>
              {SENIORITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
          >
            Abbrechen
          </button>
          <button
            onClick={() => name.trim() && onSubmit(name.trim(), role.trim(), seniority)}
            disabled={!name.trim()}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Hinzufuegen
          </button>
        </div>
      </div>
    </div>
  );
}
