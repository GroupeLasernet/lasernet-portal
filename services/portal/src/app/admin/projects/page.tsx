'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────

interface ProjectLead {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  stage: string;
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
  lead: ProjectLead;
  business: ProjectBusiness | null;
  mainContacts: ProjectMainContact[];
  isOrphaned: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'inactive' | 'orphaned'>('active');

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const active = projects.filter((p) => p.status === 'active' && !p.isOrphaned);
  const inactive = projects.filter((p) => p.status !== 'active' && !p.isOrphaned);
  const orphaned = projects.filter((p) => p.isOrphaned);

  const current = tab === 'active' ? active : tab === 'inactive' ? inactive : orphaned;

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
          {fr ? 'Gérez les projets actifs, inactifs et orphelins' : 'Manage active, inactive and orphaned projects'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Actifs' : 'Active'}</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{active.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Inactifs' : 'Inactive'}</p>
          <p className="text-xl font-bold text-gray-600 dark:text-gray-400 mt-1">{inactive.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Orphelins' : 'Orphaned'}</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{orphaned.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['active', 'inactive', 'orphaned'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t === 'active' ? (fr ? 'Actifs' : 'Active') : t === 'inactive' ? (fr ? 'Inactifs' : 'Inactive') : (fr ? 'Orphelins' : 'Orphaned')}
            <span className="ml-1.5 text-xs opacity-70">({t === 'active' ? active.length : t === 'inactive' ? inactive.length : orphaned.length})</span>
          </button>
        ))}
      </div>

      {/* Project list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : current.length === 0 ? (
          <div className="text-center py-16">
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
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {current.map((proj) => (
              <div key={proj.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{proj.name}</h3>
                      {statusBadge(proj.status)}
                      {proj.isOrphaned && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                          {fr ? 'Orphelin' : 'Orphaned'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {proj.business && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          {proj.business.companyName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        {proj.lead.name}
                      </span>
                      <span>{fmtDate(proj.updatedAt)}</span>
                      {proj.quotesCount > 0 && <span>{proj.quotesCount} {fr ? 'soumissions' : 'quotes'}</span>}
                    </div>
                    {proj.objective && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{proj.objective}</p>}
                  </div>

                  {/* Orphaned: show main contacts or link to clients */}
                  {proj.isOrphaned && proj.business && (
                    <div className="flex-shrink-0">
                      {proj.mainContacts.length > 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <p className="font-medium mb-1">{fr ? 'Contacts principaux :' : 'Main contacts:'}</p>
                          {proj.mainContacts.map((mc) => (
                            <p key={mc.id} className="text-gray-700 dark:text-gray-300">{mc.name}</p>
                          ))}
                        </div>
                      ) : (
                        <Link
                          href={`/admin/businesses?pulse=maincontact&client=${proj.business.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors animate-pulse"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                          {fr ? 'Définir un contact principal' : 'Set main contact'}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {current.length} {fr ? 'projets' : 'projects'}
        </p>
      )}
    </div>
  );
}
