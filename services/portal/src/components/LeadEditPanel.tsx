'use client';

// ============================================================
// LeadEditPanel — reusable slide-in editor for a single Lead row
// ------------------------------------------------------------
// Why this exists: Hugo's rule is that clicking "Edit" on a
// person must NEVER navigate him away from the current tab.
// On /admin/people, clicking Edit on an unassigned/lead row used
// to route to /admin/leads?id=… — functional but wrong context.
// This component lets any surface open the same right-side edit
// drawer *in place*.
//
// Scope: the fields Hugo actually edits when he hits "Modifier"
// on a person — name / email / phone / phone2 / company /
// otherContacts / source / stage / notes / estimatedValue /
// nextFollowUpAt. No calls/visits/activity/projects subtabs —
// those live on /admin/leads where they belong.
//
// API: PATCH /api/leads/[id] (the existing shared endpoint used
// by the leads page itself).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';

type LeadStage =
  | 'new' | 'qualified' | 'demo_scheduled' | 'demo_done'
  | 'quote_sent' | 'negotiation' | 'won' | 'lost';

type LeadSource =
  | 'inbound_call' | 'inbound_email' | 'inbound_form'
  | 'referral' | 'outbound' | 'other';

interface LeadDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  company: string | null;
  otherContacts: string | null;
  source: LeadSource;
  stage: LeadStage;
  notes: string | null;
  estimatedValue: number | null;
  nextFollowUpAt: string | null;
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500';

const STAGE_OPTIONS: LeadStage[] = [
  'new', 'qualified', 'demo_scheduled', 'demo_done',
  'quote_sent', 'negotiation', 'won', 'lost',
];

const SOURCE_OPTIONS: LeadSource[] = [
  'inbound_call', 'inbound_email', 'inbound_form',
  'referral', 'outbound', 'other',
];

const STAGE_LABEL: Record<LeadStage, { en: string; fr: string }> = {
  new:            { en: 'New',             fr: 'Nouveau' },
  qualified:      { en: 'Qualified',       fr: 'Qualifié' },
  demo_scheduled: { en: 'Demo booked',     fr: 'Démo planifiée' },
  demo_done:      { en: 'Demo done',       fr: 'Démo faite' },
  quote_sent:     { en: 'Quote sent',      fr: 'Soumission envoyée' },
  negotiation:    { en: 'Negotiation',     fr: 'Négociation' },
  won:            { en: 'Won',             fr: 'Gagné' },
  lost:           { en: 'Lost',            fr: 'Perdu' },
};

const SOURCE_LABEL: Record<LeadSource, { en: string; fr: string }> = {
  inbound_call:  { en: 'Inbound call',  fr: 'Appel entrant' },
  inbound_email: { en: 'Inbound email', fr: 'Courriel entrant' },
  inbound_form:  { en: 'Web form',      fr: 'Formulaire web' },
  referral:      { en: 'Referral',      fr: 'Référence' },
  outbound:      { en: 'Outbound',      fr: 'Démarchage' },
  other:         { en: 'Other',         fr: 'Autre' },
};

export interface LeadEditPanelProps {
  leadId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function LeadEditPanel({ leadId, onClose, onSaved }: LeadEditPanelProps) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fr = lang === 'fr';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState<LeadDetail | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Fetch lead on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/leads/${leadId}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (cancelled) return;
        const l = data.lead;
        setForm({
          id: l.id,
          name: l.name || '',
          email: l.email || null,
          phone: l.phone || null,
          phone2: l.phone2 || null,
          company: l.company || null,
          otherContacts: l.otherContacts || null,
          source: (l.source || 'inbound_call') as LeadSource,
          stage: (l.stage || 'new') as LeadStage,
          notes: l.notes || null,
          estimatedValue: l.estimatedValue ?? null,
          nextFollowUpAt: l.nextFollowUpAt
            ? String(l.nextFollowUpAt).slice(0, 10)
            : null,
        });
      } catch (e: any) {
        if (!cancelled) setErr(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  // Autofocus the first field once the form is ready.
  useEffect(() => {
    if (!loading && form) nameRef.current?.focus();
  }, [loading, form]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = <K extends keyof LeadDetail>(key: K, value: LeadDetail[K]) => {
    setForm(f => (f ? { ...f, [key]: value } : f));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch(`/api/leads/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          phone2: form.phone2 || null,
          company: form.company || null,
          otherContacts: form.otherContacts || null,
          source: form.source,
          stage: form.stage,
          notes: form.notes || null,
          estimatedValue: form.estimatedValue,
          nextFollowUpAt: form.nextFollowUpAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.saved();
      onSaved?.();
      onClose();
    } catch (e: any) {
      setSaveErr(e.message || 'Save failed');
      toast.error(e.message || (lang === 'fr' ? "Échec de l'enregistrement" : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-[1px]"
      />
      {/* Drawer */}
      <aside
        className="w-full max-w-xl h-full bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col animate-[slideInRight_180ms_ease-out]"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              {fr ? 'Modifier la personne' : 'Edit person'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {fr
                ? 'Modifications enregistrées dans la fiche Prospect.'
                : 'Changes save to the Lead record.'}
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
            </div>
          ) : err ? (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
              {err}
            </div>
          ) : form ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Nom' : 'Name'}
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  onChange={e => patch('name', e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Courriel' : 'Email'}
                </label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={e => patch('email', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Entreprise (texte libre)' : 'Company (free text)'}
                </label>
                <input
                  type="text"
                  value={form.company || ''}
                  onChange={e => patch('company', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Téléphone' : 'Phone'}
                </label>
                <input
                  type="tel"
                  value={form.phone || ''}
                  onChange={e => patch('phone', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Téléphone 2' : 'Phone 2'}
                </label>
                <input
                  type="tel"
                  value={form.phone2 || ''}
                  onChange={e => patch('phone2', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Autres contacts' : 'Other contacts'}
                </label>
                <input
                  type="text"
                  value={form.otherContacts || ''}
                  onChange={e => patch('otherContacts', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Source' : 'Source'}
                </label>
                <select
                  value={form.source}
                  onChange={e => patch('source', e.target.value as LeadSource)}
                  className={INPUT_CLS}
                >
                  {SOURCE_OPTIONS.map(s => (
                    <option key={s} value={s}>{SOURCE_LABEL[s][fr ? 'fr' : 'en']}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Étape' : 'Stage'}
                </label>
                <select
                  value={form.stage}
                  onChange={e => patch('stage', e.target.value as LeadStage)}
                  className={INPUT_CLS}
                >
                  {STAGE_OPTIONS.map(s => (
                    <option key={s} value={s}>{STAGE_LABEL[s][fr ? 'fr' : 'en']}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Valeur estimée ($)' : 'Estimated value ($)'}
                </label>
                <input
                  type="number"
                  value={form.estimatedValue ?? ''}
                  onChange={e => patch('estimatedValue', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Prochain suivi' : 'Next follow-up'}
                </label>
                <input
                  type="date"
                  value={form.nextFollowUpAt || ''}
                  onChange={e => patch('nextFollowUpAt', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Notes' : 'Notes'}
                </label>
                <textarea
                  rows={4}
                  value={form.notes || ''}
                  onChange={e => patch('notes', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>
            </div>
          ) : null}

          {saveErr && (
            <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800">
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
            disabled={saving || loading || !form}
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
