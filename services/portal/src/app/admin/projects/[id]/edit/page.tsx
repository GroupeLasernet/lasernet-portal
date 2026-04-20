'use client';

// ============================================================
// Full-page Project Editor — /admin/projects/[id]/edit
// ------------------------------------------------------------
// Added 2026-04-20. One-page editor for a LeadProject covering:
//   • Core fields (name, status, objective, notes, callback
//     reason, budget, suggested products)
//   • Leads manager inline (add/remove co-leads, same logic as
//     the ProjectLeadsPanel drawer but embedded)
//   • Meetings — list + schedule-new inline form
//   • Quotes — summary with deep-link to the Quotes page
//   • Activity — merged timeline across every attached lead
//
// Reached by clicking a project card on /admin/projects. The
// card is a <Link>, so the whole row navigates here; the Leads
// drawer button on the card stops propagation so it still works
// for the quick-edit case.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';

// ── Types ─────────────────────────────────────────────────────

interface LeadLite {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

interface ProjectAssignment {
  id: string;
  leadId: string;
  createdAt: string;
  lead: LeadLite;
}

interface QuoteItem {
  id: string;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  sortOrder: number;
}

interface QuoteSummary {
  id: string;
  quoteNumber: string | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  items: QuoteItem[];
}

interface ProjectData {
  id: string;
  leadId: string;
  name: string;
  status: string;
  notes: string | null;
  callbackReason: string | null;
  suggestedProducts: string | null;
  objective: string | null;
  budget: number | null;
  createdAt: string;
  updatedAt: string;
  assignments: ProjectAssignment[];
  quotes: QuoteSummary[];
}

interface MeetingAttendee {
  id: string;
  leadId: string;
  present: boolean;
  lead: LeadLite & { phone: string | null; photo: string | null };
}

interface Meeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  location: string | null;
  notes: string | null;
  status: string;
  createdBy: { id: string; name: string } | null;
  attendees: MeetingAttendee[];
  createdAt: string;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  fromStage: string | null;
  toStage: string | null;
  actorName: string | null;
  actor: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
  createdAt: string;
}

// ── Status options ────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: string; labelEn: string; labelFr: string; tone: string }> = [
  { value: 'active',  labelEn: 'Active',  labelFr: 'Actif',     tone: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'on_hold', labelEn: 'On Hold', labelFr: 'En attente', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'won',     labelEn: 'Won',     labelFr: 'Gagné',     tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'lost',    labelEn: 'Lost',    labelFr: 'Perdu',     tone: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
];

// ── Page ──────────────────────────────────────────────────────

export default function ProjectEditPage() {
  const { lang } = useLanguage();
  const fr = lang === 'fr';
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [leadPool, setLeadPool] = useState<LeadLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Editable form state — mirrors ProjectData fields that PATCH accepts.
  const [form, setForm] = useState({
    name: '',
    status: 'active',
    objective: '',
    notes: '',
    callbackReason: '',
    suggestedProducts: '',
    budget: '' as string,
  });
  const [attachedLeads, setAttachedLeads] = useState<LeadLite[]>([]);
  const [leadQuery, setLeadQuery] = useState('');

  // ── Loaders ──────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    try {
      const [pRes, mRes, aRes, lRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`, { cache: 'no-store' }),
        fetch(`/api/projects/${projectId}/meetings`, { cache: 'no-store' }),
        fetch(`/api/projects/${projectId}/activity`, { cache: 'no-store' }),
        fetch('/api/leads', { cache: 'no-store' }),
      ]);

      const pData = await pRes.json();
      if (!pRes.ok) throw new Error(pData.error || 'Failed to load project');
      const proj: ProjectData = pData.project;
      setProject(proj);
      setForm({
        name: proj.name || '',
        status: proj.status || 'active',
        objective: proj.objective || '',
        notes: proj.notes || '',
        callbackReason: proj.callbackReason || '',
        suggestedProducts: proj.suggestedProducts || '',
        budget: proj.budget != null ? String(proj.budget) : '',
      });
      setAttachedLeads(
        (proj.assignments || [])
          .map((a) => a.lead)
          .filter(Boolean)
          .map((l) => ({ id: l.id, name: l.name, email: l.email || null, company: l.company || null }))
      );

      const mData = await mRes.json();
      if (mRes.ok) setMeetings(mData.meetings || []);

      const aData = await aRes.json();
      if (aRes.ok) setActivities(aData.activities || []);

      const lData = await lRes.json();
      if (lRes.ok) {
        setLeadPool(
          (lData.leads || []).map((l: any) => ({
            id: l.id,
            name: l.name,
            email: l.email || null,
            company: l.company || null,
          }))
        );
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Lead search (inline) ─────────────────────────────────────

  const attachedIds = useMemo(() => new Set(attachedLeads.map((l) => l.id)), [attachedLeads]);
  const leadSuggestions = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return [];
    return leadPool
      .filter((l) => !attachedIds.has(l.id))
      .filter((l) =>
        l.name.toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [leadQuery, leadPool, attachedIds]);

  const addLead = (l: LeadLite) => {
    if (attachedIds.has(l.id)) return;
    setAttachedLeads((prev) => [...prev, l]);
    setLeadQuery('');
  };
  const removeLead = (id: string) => {
    if (attachedLeads.length <= 1) return; // backend enforces ≥1
    setAttachedLeads((prev) => prev.filter((l) => l.id !== id));
  };

  // ── Save ─────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!project) return;
    if (!form.name.trim()) {
      setSaveErr(fr ? 'Le nom est requis.' : 'Name is required.');
      return;
    }
    if (attachedLeads.length === 0) {
      setSaveErr(fr ? 'Au moins un lead est requis.' : 'At least one lead is required.');
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const budgetNum = form.budget.trim() === '' ? null : Number(form.budget);
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          status: form.status,
          objective: form.objective || null,
          notes: form.notes || null,
          callbackReason: form.callbackReason || null,
          suggestedProducts: form.suggestedProducts || null,
          budget: budgetNum,
          leadIds: attachedLeads.map((l) => l.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedAt(Date.now());
      await loadAll();
    } catch (e: any) {
      setSaveErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Meetings inline ──────────────────────────────────────────

  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', scheduledAt: '', durationMinutes: 60, location: '', notes: '' });
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [meetingErr, setMeetingErr] = useState<string | null>(null);

  const createMeeting = async () => {
    if (!project) return;
    if (!newMeeting.title.trim() || !newMeeting.scheduledAt) {
      setMeetingErr(fr ? 'Titre et date requis.' : 'Title and date required.');
      return;
    }
    setCreatingMeeting(true);
    setMeetingErr(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMeeting),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setNewMeeting({ title: '', scheduledAt: '', durationMinutes: 60, location: '', notes: '' });
      setShowNewMeeting(false);
      const mRes = await fetch(`/api/projects/${project.id}/meetings`, { cache: 'no-store' });
      const mData = await mRes.json();
      if (mRes.ok) setMeetings(mData.meetings || []);
    } catch (e: any) {
      setMeetingErr(e.message || 'Create failed');
    } finally {
      setCreatingMeeting(false);
    }
  };

  // ── Derived helpers ──────────────────────────────────────────

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA');
  const fmtDateTime = (d: string) => new Date(d).toLocaleString(fr ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });

  const totalQuoteValue = useMemo(() => {
    if (!project) return 0;
    return project.quotes.reduce((sum, q) => {
      const qTotal = q.items.reduce((a, it) => a + (it.totalPrice || 0), 0);
      return sum + qTotal;
    }, 0);
  }, [project]);

  const activeStatus = STATUS_OPTIONS.find((s) => s.value === form.status) || STATUS_OPTIONS[0];

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      </div>
    );
  }

  if (err || !project) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          {err || (fr ? 'Projet introuvable.' : 'Project not found.')}
        </div>
        <div className="mt-4">
          <Link href="/admin/projects" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            ← {fr ? 'Retour aux projets' : 'Back to projects'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb + back */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/admin/projects" className="hover:text-brand-600 dark:hover:text-brand-400">
            {fr ? 'Projets' : 'Projects'}
          </Link>
          <span>/</span>
          <span className="text-gray-800 dark:text-gray-200 truncate max-w-md">{project.name}</span>
        </div>
        <button
          type="button"
          onClick={() => router.push('/admin/projects')}
          className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          ← {fr ? 'Retour' : 'Back'}
        </button>
      </div>

      {/* Header card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
              {form.name || (fr ? 'Nouveau projet' : 'New project')}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${activeStatus.tone}`}>
                {fr ? activeStatus.labelFr : activeStatus.labelEn}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {fr ? 'Créé le' : 'Created'} {fmtDate(project.createdAt)}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {fr ? 'Mis à jour' : 'Updated'} {fmtDate(project.updatedAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && Date.now() - savedAt < 3000 && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {fr ? 'Enregistré' : 'Saved'}
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}
            </button>
          </div>
        </div>
        {saveErr && (
          <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {saveErr}
          </div>
        )}
      </div>

      {/* Core fields */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {fr ? 'Détails du projet' : 'Project details'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Nom' : 'Name'} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Statut' : 'Status'}
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{fr ? s.labelFr : s.labelEn}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Budget' : 'Budget'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Objectif' : 'Objective'}
            </label>
            <input
              type="text"
              value={form.objective}
              onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
              placeholder={fr ? 'Ex. remplacer le poste manuel du secteur A' : 'e.g. replace manual workstation in sector A'}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Raison du suivi' : 'Callback reason'}
            </label>
            <input
              type="text"
              value={form.callbackReason}
              onChange={(e) => setForm((f) => ({ ...f, callbackReason: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Produits suggérés' : 'Suggested products'}
            </label>
            <input
              type="text"
              value={form.suggestedProducts}
              onChange={(e) => setForm((f) => ({ ...f, suggestedProducts: e.target.value }))}
              placeholder={fr ? 'Séparés par des virgules' : 'Comma-separated'}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {fr ? 'Notes' : 'Notes'}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500 resize-y"
            />
          </div>
        </div>
      </section>

      {/* Leads manager */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fr ? 'Leads' : 'Leads'}
            <span className="ml-2 text-xs font-normal text-gray-400">({attachedLeads.length})</span>
          </h2>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            {fr ? 'Minimum 1 lead.' : 'Minimum of 1 lead.'}
          </span>
        </div>

        {attachedLeads.length === 0 ? (
          <div className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400 dark:text-gray-500">
            {fr ? 'Aucun lead attaché.' : 'No leads attached.'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {attachedLeads.map((l, idx) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs border border-brand-200 dark:border-brand-800"
              >
                {idx === 0 && (
                  <span className="text-[10px] uppercase font-bold tracking-wide text-brand-600 dark:text-brand-400">
                    {fr ? 'Principal' : 'Primary'}
                  </span>
                )}
                <span className="font-medium">{l.name}</span>
                {l.company && <span className="opacity-70">· {l.company}</span>}
                {attachedLeads.length > 1 && (
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
                )}
              </span>
            ))}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            {fr ? 'Ajouter un lead' : 'Add a lead'}
          </label>
          <input
            type="search"
            value={leadQuery}
            onChange={(e) => setLeadQuery(e.target.value)}
            placeholder={fr ? 'Rechercher par nom, courriel, entreprise…' : 'Search by name, email, company…'}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:border-brand-500"
          />
          {leadQuery.trim() && leadSuggestions.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              {fr ? 'Aucun résultat.' : 'No matches.'}
            </p>
          )}
          {leadSuggestions.length > 0 && (
            <ul className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
              {leadSuggestions.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => addLead(l)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{l.name}</div>
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
      </section>

      {/* Meetings */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fr ? 'Rencontres' : 'Meetings'}
            <span className="ml-2 text-xs font-normal text-gray-400">({meetings.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowNewMeeting((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
          >
            {showNewMeeting ? (fr ? 'Annuler' : 'Cancel') : (fr ? '+ Planifier' : '+ Schedule')}
          </button>
        </div>

        {showNewMeeting && (
          <div className="mb-4 p-3 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-900/10 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {fr ? 'Titre' : 'Title'} *
                </label>
                <input
                  type="text"
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting((m) => ({ ...m, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {fr ? 'Date et heure' : 'Date & time'} *
                </label>
                <input
                  type="datetime-local"
                  value={newMeeting.scheduledAt}
                  onChange={(e) => setNewMeeting((m) => ({ ...m, scheduledAt: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {fr ? 'Durée (min)' : 'Duration (min)'}
                </label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={newMeeting.durationMinutes}
                  onChange={(e) => setNewMeeting((m) => ({ ...m, durationMinutes: Number(e.target.value) || 60 }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {fr ? 'Lieu' : 'Location'}
                </label>
                <input
                  type="text"
                  value={newMeeting.location}
                  onChange={(e) => setNewMeeting((m) => ({ ...m, location: e.target.value }))}
                  placeholder={fr ? 'Bureau, Zoom, adresse…' : 'Office, Zoom, address…'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {fr ? 'Notes' : 'Notes'}
                </label>
                <textarea
                  value={newMeeting.notes}
                  onChange={(e) => setNewMeeting((m) => ({ ...m, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500 resize-y"
                />
              </div>
            </div>
            {meetingErr && (
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                {meetingErr}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={createMeeting}
                disabled={creatingMeeting}
                className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {creatingMeeting ? (fr ? 'Création…' : 'Creating…') : (fr ? 'Créer' : 'Create')}
              </button>
            </div>
          </div>
        )}

        {meetings.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {fr ? 'Aucune rencontre planifiée.' : 'No meetings scheduled.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {meetings.map((m) => {
              const statusTone =
                m.status === 'completed'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : m.status === 'cancelled'
                  ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
              return (
                <li key={m.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.title}</span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusTone}`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {fmtDateTime(m.scheduledAt)} · {m.durationMinutes} min
                      {m.location ? ` · ${m.location}` : ''}
                    </div>
                    {m.notes && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{m.notes}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Quotes */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fr ? 'Soumissions' : 'Quotes'}
            <span className="ml-2 text-xs font-normal text-gray-400">({project.quotes.length})</span>
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {fr ? 'Total' : 'Total'}: ${totalQuoteValue.toLocaleString(fr ? 'fr-CA' : 'en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {project.quotes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {fr ? 'Aucune soumission.' : 'No quotes.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {project.quotes.map((q) => {
              const qTotal = q.items.reduce((a, it) => a + (it.totalPrice || 0), 0);
              return (
                <li key={q.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {q.quoteNumber || (fr ? 'Soumission' : 'Quote')}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {fmtDate(q.createdAt)} · {q.status} · {q.items.length} {fr ? 'lignes' : 'lines'}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    ${qTotal.toLocaleString(fr ? 'fr-CA' : 'en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3">
          <Link
            href={`/admin/quotes?project=${project.id}`}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            {fr ? 'Gérer les soumissions →' : 'Manage quotes →'}
          </Link>
        </div>
      </section>

      {/* Activity timeline */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {fr ? 'Activité' : 'Activity'}
          <span className="ml-2 text-xs font-normal text-gray-400">({activities.length})</span>
        </h2>

        {activities.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {fr ? 'Aucune activité.' : 'No activity.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {activities.slice(0, 30).map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {fmtDateTime(a.createdAt)}
                    {a.actor?.name && <span> · {a.actor.name}</span>}
                    {a.lead?.name && attachedLeads.length > 1 && <span> · {a.lead.name}</span>}
                    {' · '}<span className="text-gray-400 dark:text-gray-500">{a.type}</span>
                  </div>
                  <div className="text-sm text-gray-800 dark:text-gray-100 break-words">{a.description}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sticky save footer on mobile */}
      <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 md:hidden">
        <button
          type="button"
          onClick={() => router.push('/admin/projects')}
          className="px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {fr ? 'Annuler' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? (fr ? 'Enregistrement…' : 'Saving…') : (fr ? 'Enregistrer' : 'Save')}
        </button>
      </div>
    </div>
  );
}
