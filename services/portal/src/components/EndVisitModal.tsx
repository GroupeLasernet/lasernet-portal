'use client';

// ============================================================
// EndVisitModal — centered popup used to finalize a visit
// (from Live Visits) or complete a meeting (from Leads →
// Visits → Meetings). Same flow, same backend contract.
//
// Flow:
//   1. Operator sees two columns: Present / Not present,
//      seeded from the visit/meeting and the business' other
//      main contacts + leads.
//   2. Operator stars one row as the main contact.
//   3. Operator checks the rows to attach as co-leads of the
//      project (star is always attached automatically).
//   4. Operator picks a project from the active-projects list,
//      OR clicks "+ Create new project" (inline name+stage).
//   5. Hit Finish. If project isn't chosen, a second popup
//      asks Link-existing or Create-new before committing.
//
// Added 2026-04-20.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/lib/ToastContext';

interface PersonRow {
  key: string;
  leadId: string | null;
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  photo: string | null;
  role: string | null;
}

interface ActiveProject {
  id: string;
  name: string;
  stage: string;
  leadNames: string[];
}

interface ContextPayload {
  source: { visitGroupId: string | null; meetingId: string | null; label: string };
  business: { kind: 'managedClient' | 'localBusiness'; id: string; name: string | null } | null;
  present: PersonRow[];
  absent: PersonRow[];
  activeProjects: ActiveProject[];
}

type Entry =
  | { kind: 'visitGroup'; id: string }
  | { kind: 'meeting'; id: string };

export interface EndVisitModalProps {
  entry: Entry;
  onClose: () => void;
  onFinished?: (result: { projectId: string }) => void;
  // When true (default), operator can toggle checkboxes to
  // promote rows to Leads + attach as co-leads of the project.
  allowPromote?: boolean;
}

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export default function EndVisitModal({ entry, onClose, onFinished, allowPromote = true }: EndVisitModalProps) {
  const { toast } = useToast();
  const [ctx, setCtx] = useState<ContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Per-row UI state
  // - selected: row is checked → attach as co-lead on the project
  // - star: row is the main contact (only one row can be starred)
  // - moved: row was clicked to move from Absent → Present (visually)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Set<string>>(new Set()); // absent rows moved to present
  const [starKey, setStarKey] = useState<string | null>(null);

  // Project selection. 'none' = unselected. 'new' = user chose create new.
  const [pickedProjectId, setPickedProjectId] = useState<string | 'new' | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectStage, setNewProjectStage] = useState('new');

  // Fallback modal for "Finish without project"
  const [askProjectChoice, setAskProjectChoice] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // ── Load context ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const qs = entry.kind === 'visitGroup' ? `visitGroupId=${entry.id}` : `meetingId=${entry.id}`;
        const res = await fetch(`/api/finalize-context?${qs}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (cancelled) return;
        setCtx(data);
        // Default: mark all present rows as selected (attach), no stars yet.
        setSelected(new Set(data.present.map((p: PersonRow) => p.key)));
      } catch (e: any) {
        if (!cancelled) setErr(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry.kind, entry.id]);

  // ── ESC closes ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !askProjectChoice) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, askProjectChoice]);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      // If the starred row is de-selected, clear star too.
      if (starKey === key && !next.has(key)) setStarKey(null);
      return next;
    });
  };

  const toggleStar = (key: string) => {
    setStarKey((prev) => (prev === key ? null : key));
    // Star always implies selected
    setSelected((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const moveToPresent = (key: string) => {
    setMoved((prev) => new Set(prev).add(key));
    setSelected((prev) => new Set(prev).add(key));
  };

  const moveToAbsent = (key: string) => {
    setMoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (starKey === key) setStarKey(null);
  };

  // ── Derived lists ───────────────────────────────────────
  const derived = useMemo(() => {
    if (!ctx) return { presentRows: [] as PersonRow[], absentRows: [] as PersonRow[] };
    const movedRows = ctx.absent.filter((r) => moved.has(r.key));
    const presentRows = [...ctx.present, ...movedRows];
    const absentRows = ctx.absent.filter((r) => !moved.has(r.key));
    return { presentRows, absentRows };
  }, [ctx, moved]);

  // ── Submit ──────────────────────────────────────────────
  const buildPayloadPeople = useCallback(() => {
    if (!ctx) return null;
    const all = [...ctx.present, ...ctx.absent];
    const selectedRows = all.filter((r) => selected.has(r.key));
    const people = selectedRows.map((r) => {
      if (r.leadId) return { kind: 'existingLead' as const, leadId: r.leadId };
      // Row is Contact-only or new → promote to Lead
      return {
        kind: 'newLead' as const,
        tempId: r.key, // stable across UI state
        name: r.name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        fromContactId: r.contactId,
      };
    });
    return { people, all };
  }, [ctx, selected]);

  const buildMainContactPayload = useCallback(() => {
    if (!ctx || !starKey) return null;
    const all = [...ctx.present, ...ctx.absent];
    const row = all.find((r) => r.key === starKey);
    if (!row) return null;
    if (row.leadId) return { kind: 'existingLead' as const, leadId: row.leadId };
    return { kind: 'newLead' as const, tempId: row.key };
  }, [ctx, starKey]);

  const canFinish = !!starKey && selected.has(starKey);

  const performFinalize = useCallback(async (projectPayload: any) => {
    const peoplePayload = buildPayloadPeople();
    const mainContactPayload = buildMainContactPayload();
    if (!peoplePayload || !mainContactPayload) {
      setSaveErr('Pick a main contact (star) before finishing.');
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const url =
        entry.kind === 'visitGroup'
          ? `/api/visit-groups/${entry.id}/finalize`
          : `/api/meetings/${entry.id}/finalize`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: peoplePayload.people,
          mainContact: mainContactPayload,
          project: projectPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Finalize failed');
      toast.success(
        projectPayload?.kind === 'new'
          ? 'Projet créé'
          : entry.kind === 'visitGroup' ? 'Visite terminée' : 'Réunion terminée'
      );
      onFinished?.({ projectId: data.projectId });
      onClose();
    } catch (e: any) {
      setSaveErr(e.message || 'Finalize failed');
      toast.error(e.message || 'Finalize failed');
    } finally {
      setSaving(false);
    }
  }, [buildMainContactPayload, buildPayloadPeople, entry, onClose, onFinished, toast]);

  const onClickFinish = () => {
    if (!canFinish) {
      setSaveErr('Pick a main contact (star) before finishing.');
      return;
    }
    if (pickedProjectId === null) {
      // No project chosen → fallback popup
      setAskProjectChoice(true);
      return;
    }
    if (pickedProjectId === 'new') {
      if (!newProjectName.trim()) {
        setSaveErr('Give the new project a name first.');
        return;
      }
      performFinalize({ kind: 'new', name: newProjectName.trim(), stage: newProjectStage });
      return;
    }
    performFinalize({ kind: 'existing', projectId: pickedProjectId });
  };

  // ── Row UI ──────────────────────────────────────────────
  const PersonCard = ({ row, column }: { row: PersonRow; column: 'present' | 'absent' }) => {
    const isSelected = selected.has(row.key);
    const isStar = starKey === row.key;
    const isNew = !row.leadId;
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
          isSelected
            ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700'
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
        }`}
      >
        {/* Star toggle */}
        <button
          type="button"
          onClick={() => toggleStar(row.key)}
          className={`text-lg leading-none flex-shrink-0 ${isStar ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
          aria-label="Star as main contact"
          title="Set as main contact"
        >
          {isStar ? STAR_FILLED : STAR_EMPTY}
        </button>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {(row.name || '?').charAt(0).toUpperCase()}
        </div>

        {/* Name/email/role */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800 dark:text-gray-100 truncate">{row.name}</span>
            {isNew && (
              <span className="text-[9px] uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-[1px] rounded">
                new lead
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {[row.role, row.email].filter(Boolean).join(' · ')}
          </div>
        </div>

        {/* Checkbox to attach-as-colead */}
        {allowPromote && (
          <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelected(row.key)}
              className="accent-brand-600"
            />
            attach
          </label>
        )}

        {/* Move arrow */}
        {column === 'absent' ? (
          <button
            type="button"
            onClick={() => moveToPresent(row.key)}
            className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
            title="Mark as present"
          >
            ←
          </button>
        ) : moved.has(row.key) ? (
          <button
            type="button"
            onClick={() => moveToAbsent(row.key)}
            className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
            title="Move back to absent"
          >
            →
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Finish this meeting
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {ctx?.source.label || 'Loading…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
            </div>
          ) : err ? (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
              {err}
            </div>
          ) : ctx ? (
            <>
              {/* Legend */}
              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-4">
                <span>★ = main contact</span>
                <span>checkbox = attach as co-lead on the project</span>
                <span>← / → = move between columns</span>
              </div>

              {/* Two-column lists */}
              <div className="grid grid-cols-2 gap-4">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Present
                    <span className="ml-1 text-gray-400">({derived.presentRows.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {derived.presentRows.length === 0 ? (
                      <div className="text-xs text-gray-400 italic p-3 border border-dashed rounded-lg">
                        No one marked present yet.
                      </div>
                    ) : (
                      derived.presentRows.map((row) => (
                        <PersonCard key={row.key} row={row} column="present" />
                      ))
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Not present
                    <span className="ml-1 text-gray-400">({derived.absentRows.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {derived.absentRows.length === 0 ? (
                      <div className="text-xs text-gray-400 italic p-3 border border-dashed rounded-lg">
                        No other main contacts to suggest.
                      </div>
                    ) : (
                      derived.absentRows.map((row) => (
                        <PersonCard key={row.key} row={row} column="absent" />
                      ))
                    )}
                  </div>
                </section>
              </div>

              {/* Project picker */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Link this meeting to a project
                </h3>
                {ctx.activeProjects.length === 0 && pickedProjectId !== 'new' ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                    No active projects for this business yet.
                    <button
                      type="button"
                      onClick={() => setPickedProjectId('new')}
                      className="ml-2 text-brand-600 hover:text-brand-700 font-medium"
                    >
                      + Create one
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {ctx.activeProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPickedProjectId(p.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition ${
                          pickedProjectId === p.id
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {p.leadNames.join(' + ')} · {p.stage}
                          </div>
                        </div>
                        {pickedProjectId === p.id && (
                          <svg className="w-4 h-4 text-brand-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPickedProjectId('new')}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition ${
                        pickedProjectId === 'new'
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <span className="text-brand-600 font-medium">＋ Create a new project</span>
                    </button>
                  </div>
                )}

                {pickedProjectId === 'new' && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">Project name</label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="e.g. 2026 cobot cell upgrade"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:border-brand-500"
                    />
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">Stage</label>
                    <select
                      value={newProjectStage}
                      onChange={(e) => setNewProjectStage(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    >
                      <option value="new">New</option>
                      <option value="qualified">Qualified</option>
                      <option value="demo_scheduled">Demo scheduled</option>
                      <option value="demo_done">Demo done</option>
                      <option value="quote_sent">Quote sent</option>
                      <option value="negotiation">Negotiation</option>
                    </select>
                  </div>
                )}
              </section>
            </>
          ) : null}

          {saveErr && (
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
              {saveErr}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {starKey ? 'Main contact set.' : 'Pick a main contact (★) before finishing.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canFinish || saving}
              onClick={onClickFinish}
              className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Finishing…' : 'Finish this meeting'}
            </button>
          </div>
        </footer>
      </div>

      {/* ── Fallback: Finish pressed without a project picked ── */}
      {askProjectChoice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setAskProjectChoice(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
              No project selected
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Link this meeting to one of the existing projects of this business, or start a new one?
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {(ctx?.activeProjects || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setAskProjectChoice(false);
                    setPickedProjectId(p.id);
                    performFinalize({ kind: 'existing', projectId: p.id });
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {p.leadNames.join(' + ')} · {p.stage}
                  </div>
                </button>
              ))}
            </div>
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAskProjectChoice(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setAskProjectChoice(false);
                  setPickedProjectId('new');
                }}
                className="text-sm px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium"
              >
                ＋ Create new project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
