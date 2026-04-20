'use client';

// ============================================================
// Projects tab — grouped by lead-set (Hugo, 2026-04-20).
// ------------------------------------------------------------
// Each bloc corresponds to a UNIQUE combination of leads:
//   • Solo projects of Lead A  → bloc "Lead A"
//   • Solo projects of Lead B  → bloc "Lead B"
//   • Projects co-led by A + B → bloc "Lead A + Lead B"
//
// A project never appears in two blocs — the shared one gets its
// own bloc listing every attached lead in the header. The three
// tabs (Active / Inactive / Orphaned) filter which projects appear
// inside the blocs; blocs with zero matching projects are hidden.
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import Link from 'next/link';
import AnimatedNumber from '@/components/AnimatedNumber';
import ProjectLeadsPanel from '@/components/ProjectLeadsPanel';

// ── Types ─────────────────────────────────────────────────────────────────

interface ProjectLeadRef {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  stage: string;
  businessId: string | null;
  businessName: string | null;
}

interface ProjectBusiness {
  id: string;
  displayName: string;
  companyName: string;
}

interface ProjectMainContact {
  id: string;
  name: string;
  email: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  callbackReason: string | null;
  objective: string | null;
  budget: number | null;
  createdAt: string;
  updatedAt: string;
  quotesCount: number;
  leads: ProjectLeadRef[];
  business: ProjectBusiness | null;
  mainContacts: ProjectMainContact[];
  isOrphaned: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { lang } = useLanguage();
  const fr = lang === 'fr';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'inactive' | 'orphaned'>('active');
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);

  const refetch = () => {
    setLoading(true);
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  const active = projects.filter((p) => p.status === 'active' && !p.isOrphaned);
  const inactive = projects.filter((p) => p.status !== 'active' && !p.isOrphaned);
  const orphaned = projects.filter((p) => p.isOrphaned);

  const current = tab === 'active' ? active : tab === 'inactive' ? inactive : orphaned;

  // ── Grouping by lead-set ──
  // Key = sorted lead ids joined by "|". Stable ordering so the
  // same bloc always hashes to the same key regardless of how
  // leads were added. Within a bloc, projects are ordered by the
  // API's `updatedAt DESC` since we preserve input order here.
  const blocs = useMemo(() => {
    const map = new Map<string, { leads: ProjectLeadRef[]; projects: Project[] }>();
    for (const p of current) {
      const ids = p.leads.map((l) => l.id).sort();
      const key = ids.join('|') || '_no_leads';
      if (!map.has(key)) {
        // Preserve the original (non-sorted) display order — it's
        // `createdAt asc` from the API, which matches "primary first,
        // co-leads in add order" for a natural read.
        map.set(key, { leads: p.leads, projects: [] });
      }
      map.get(key)!.projects.push(p);
    }
    // Sort blocs: multi-lead blocs first, then alphabetically by first
    // lead's name so the tab feels organised.
    return Array.from(map.values()).sort((a, b) => {
      if (a.leads.length !== b.leads.length) return b.leads.length - a.leads.length;
      const an = a.leads[0]?.name || '';
      const bn = b.leads[0]?.name || '';
      return an.localeCompare(bn);
    });
  }, [current]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA');

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      active:  { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: fr ? 'Actif' : 'Active' },
      won:     { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: fr ? 'Gagné' : 'Won' },
      lost:    { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: fr ? 'Perdu' : 'Lost' },
      on_hold: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: fr ? 'En attente' : 'On Hold' },
    };
    const info = map[s] || map.active;
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.bg} ${info.text}`}>
        {info.label}
      </span>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {fr ? 'Projets' : 'Projects'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {fr
            ? 'Projets regroupés par lead. Les projets co-dirigés apparaissent dans un bloc dédié aux leads qui les partagent.'
            : 'Projects grouped by lead. Co-led projects appear in a dedicated bloc for the leads that share them.'}
        </p>
      </div>

      {/* Stats — count each project ONCE regardless of how many leads it has. */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Actifs' : 'Active'}</p>
          <div className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
            <AnimatedNumber value={active.length} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Inactifs' : 'Inactive'}</p>
          <div className="text-xl font-bold text-gray-600 dark:text-gray-400 mt-1">
            <AnimatedNumber value={inactive.length} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Orphelins' : 'Orphaned'}</p>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
            <AnimatedNumber value={orphaned.length} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['active', 'inactive', 'orphaned'] as const).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tk
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {tk === 'active' ? (fr ? 'Actifs' : 'Active') : tk === 'inactive' ? (fr ? 'Inactifs' : 'Inactive') : (fr ? 'Orphelins' : 'Orphaned')}
            <span className="ml-1.5 text-xs opacity-70">({tk === 'active' ? active.length : tk === 'inactive' ? inactive.length : orphaned.length})</span>
          </button>
        ))}
      </div>

      {/* Blocs */}
      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : blocs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-center py-16">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-200 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {tab === 'orphaned'
              ? (fr ? 'Aucun projet orphelin' : 'No orphaned projects')
              : (fr ? 'Aucun projet' : 'No projects')}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {blocs.map((bloc) => {
            const blocKey = bloc.leads.map((l) => l.id).sort().join('|');
            const isShared = bloc.leads.length > 1;
            return (
              <div
                key={blocKey}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
              >
                {/* Bloc header — lead names, side by side if shared */}
                <div className={`px-5 py-3 border-b border-gray-100 dark:border-gray-700 ${isShared ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {bloc.leads.map((l, i) => (
                      <span key={l.id} className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                            {l.name.split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?'}
                          </span>
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{l.name}</span>
                          {l.company && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">· {l.company}</span>
                          )}
                        </span>
                        {i < bloc.leads.length - 1 && (
                          <span className="text-indigo-400 dark:text-indigo-300 text-sm font-semibold">+</span>
                        )}
                      </span>
                    ))}
                    {isShared && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-wide">
                        {fr ? 'Partagé' : 'Shared'}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                      {bloc.projects.length} {fr ? (bloc.projects.length === 1 ? 'projet' : 'projets') : (bloc.projects.length === 1 ? 'project' : 'projects')}
                    </span>
                  </div>
                </div>

                {/* Bloc projects */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {bloc.projects.map((proj) => (
                    <div key={proj.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{proj.name}</h3>
                            {statusBadge(proj.status)}
                            {proj.isOrphaned && (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                {fr ? 'Orphelin' : 'Orphaned'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                            {proj.business && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                {proj.business.companyName}
                              </span>
                            )}
                            <span>{fmtDate(proj.updatedAt)}</span>
                            {proj.quotesCount > 0 && <span>{proj.quotesCount} {fr ? 'soumissions' : 'quotes'}</span>}
                          </div>
                          {proj.objective && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{proj.objective}</p>}
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setManaging({ id: proj.id, name: proj.name })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                            title={fr ? 'Gérer les leads' : 'Manage leads'}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="hidden sm:inline">{fr ? 'Leads' : 'Leads'}</span>
                          </button>

                          {proj.isOrphaned && proj.business && proj.mainContacts.length === 0 && (
                            <Link
                              href={`/admin/businesses?pulse=maincontact&client=${proj.business.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors animate-pulse"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                              {fr ? 'Définir un contact principal' : 'Set main contact'}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Count */}
      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {current.length} {fr ? 'projets' : 'projects'} · {blocs.length} {fr ? 'blocs' : 'blocs'}
        </p>
      )}

      {/* Leads drawer */}
      {managing && (
        <ProjectLeadsPanel
          projectId={managing.id}
          projectName={managing.name}
          onClose={() => setManaging(null)}
          onSaved={() => { refetch(); }}
        />
      )}
    </div>
  );
}
