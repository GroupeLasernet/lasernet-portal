'use client';

// ============================================================
// ProjectLeadsPanel — slide-in drawer to manage the set of
// leads attached to a LeadProject. Multi-lead projects were
// added 2026-04-20 (Hugo's co-led opportunities feature).
//
// Behaviour:
//   - Loads the project's current leads via GET /api/projects/[id]
//   - Shows each attached lead with a ✕ to remove
//   - Search box queries GET /api/leads and surfaces un-attached
//     matches; click one to add it to the set
//   - Save sends PATCH /api/projects/[id] with leadIds[] to
//     replace the full set. Must keep ≥1 lead (backend enforces).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';

interface LeadSummary {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

export interface ProjectLeadsPanelProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ProjectLeadsPanel({
  projectId,
  projectName,
  onClose,
  onSaved,
}: ProjectLeadsPanelProps) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fr = lang === 'fr';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadSummary[]>([]); // currently attached
  const [allLeads, setAllLeads] = useState<LeadSummary[]>([]); // pool for search
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Initial load: the project (to get current leads) + the full lead pool.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [projRes, leadsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`, { cache: 'no-store' }),
          fetch('/api/leads', { cache: 'no-store' }),
        ]);
        const projData = await projRes.json();
        const leadsData = await leadsRes.json();
        if (!projRes.ok) throw new Error(projData.error || 'Failed to load project');
        if (!leadsRes.ok) throw new Error(leadsData.error || 'Failed to load leads');
        if (cancelled) return;

        // Pull attached leads from assignments (source of truth).
        const assignments: any[] = projData.project?.assignments || [];
        const attached: LeadSummary[] = assignments
          .map((a) => a.lead)
          .filter(Boolean)
          .map((l: any) => ({
            id: l.id,
            name: l.name,
            email: l.email || null,
            company: l.company || null,
          }));
        setLeads(attached);

        const pool: any[] = leadsData.leads || [];
        setAllLeads(
          pool.map((l) => ({
            id: l.id,
            name: l.name,
            email: l.email || null,
            company: l.company || null,
          }))
        );
      } catch (e: any) {
        if (!cancelled) setErr(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!loading) searchRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const attachedIds = new Set(leads.map((l) => l.id));

  // Simple contains-style search across name/email/company. Excludes
  // already-attached leads. Caps at 8 results to keep the list tidy.
  const q = query.trim().toLowerCase();
  const suggestions = q
    ? allLeads
        .filter((l) => !attachedIds.has(l.id))
        .filter((l) =>
          l.name.toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.company || '').toLowerCase().includes(q)
        )
        .slice(0, 8)
    : [];

  const addLead = (l: LeadSummary) => {
    if (attachedIds.has(l.id)) return;
    setLeads((prev) => [...prev, l]);
    setQuery('');
  };

  const removeLead = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSave = async () => {
    if (leads.length === 0) {
      setSaveErr(fr ? 'Au moins un lead est requis.' : 'At least one lead is required.');
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: leads.map((l) => l.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.saved();
      onSaved?.();
      onClose();
    } catch (e: any) {
      setSaveErr(e.message || 'Save failed');
      toast.error(e.message || (fr ? "Échec de l'enregistrement" : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-[1px]"
      />
      <aside
        className="w-full max-w-xl h-full bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col animate-[slideInRight_180ms_ease-out]"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              {fr ? 'Gérer les leads' : 'Manage leads'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {projectName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={fr ? 'Fermer' : 'Close'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
            </div>
          ) : err ? (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
              {err}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {fr ? 'Leads attachés' : 'Attached leads'}
                  <span className="ml-1 text-gray-400">({leads.length})</span>
                </label>
                {leads.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400 dark:text-gray-500">
                    {fr ? 'Aucun lead attaché à ce projet.' : 'No leads attached to this project.'}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {leads.map((l) => (
                      <span
                        key={l.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs border border-brand-200 dark:border-brand-800"
                      >
                        <span className="font-medium">{l.name}</span>
                        {l.company && <span className="opacity-70">· {l.company}</span>}
                        <button
                          type="button"
                          onClick={() => removeLead(l.id)}
                          aria-label={fr ? 'Retirer' : 'Remove'}
                          className="ml-1 rounded-full hover:bg-brand-200 dark:hover:bg-brand-800 p-0.5"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Ajouter un lead' : 'Add a lead'}
                </label>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={fr ? 'Rechercher par nom, courriel, entreprise…' : 'Search by name, email, company…'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:border-brand-500"
                />
                {q && suggestions.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    {fr ? 'Aucun résultat.' : 'No matches.'}
                  </p>
                )}
                {suggestions.length > 0 && (
                  <ul className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                    {suggestions.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => addLead(l)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                              {l.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {[l.company, l.email].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <span className="text-xs text-brand-600 dark:text-brand-400 flex-shrink-0">
                            {fr ? '+ Ajouter' : '+ Add'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {saveErr && (
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
              {saveErr}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {fr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || leads.length === 0}
            className="px-4 py-1.5 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}
          </button>
        </footer>
      </aside>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
