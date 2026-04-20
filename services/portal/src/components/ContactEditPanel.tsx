'use client';

// ============================================================
// ContactEditPanel — reusable slide-in editor for a Client Staff
// (Contact row). Mirrors LeadEditPanel / UserEditPanel so the
// People tab can open an in-place drawer for any person type.
//
// Hugo's rule (2026-04-19): clicking Edit on a person must
// NEVER leave the current tab.
//
// Fields: name / email / phone / role / type (main vs staff).
// API: PATCH /api/managed-clients/[clientId]/contacts/[contactId].
// Requires the owning ManagedClient id — People records carry
// this as `clientId` already.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';

type ContactType = 'maincontact' | 'staff';

interface ContactDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  type: ContactType;
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500';

export interface ContactEditPanelProps {
  contactId: string;
  /** Owning ManagedClient id — required by the PATCH URL. */
  clientId: string;
  /** Client display name, shown in the drawer header for context. */
  clientName?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ContactEditPanel({
  contactId,
  clientId,
  clientName,
  onClose,
  onSaved,
}: ContactEditPanelProps) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fr = lang === 'fr';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState<ContactDetail | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // No per-contact GET exists. The /api/managed-clients list response
  // includes mainContacts + subEmployees per client, which is all we
  // need. Fetch once, find the right client + contact, derive `type`
  // from which array the contact lives in (mainContacts → maincontact,
  // subEmployees → staff — same convention used by BusinessesPage).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch('/api/managed-clients', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (cancelled) return;
        const mc = (data.clients || []).find((x: any) => x.id === clientId);
        if (!mc) throw new Error('Business not found');
        const mains: any[] = mc.mainContacts || [];
        const staff: any[] = mc.subEmployees || [];
        const isMain = mains.some(x => x.id === contactId);
        const c = mains.find(x => x.id === contactId) || staff.find(x => x.id === contactId);
        if (!c) throw new Error('Contact not found');
        setForm({
          id: c.id,
          name: c.name || '',
          email: c.email || '',
          phone: c.phone || null,
          role: c.role || null,
          type: isMain ? 'maincontact' : 'staff',
        });
      } catch (e: any) {
        if (!cancelled) setErr(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, contactId]);

  useEffect(() => {
    if (!loading && form) nameRef.current?.focus();
  }, [loading, form]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = <K extends keyof ContactDetail>(key: K, value: ContactDetail[K]) => {
    setForm(f => (f ? { ...f, [key]: value } : f));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch(`/api/managed-clients/${clientId}/contacts/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          role: form.role || null,
          type: form.type,
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
              {fr ? 'Modifier le contact' : 'Edit contact'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {clientName
                ? (fr ? `Personnel de ${clientName}` : `Staff at ${clientName}`)
                : (fr ? 'Personnel client' : 'Client Staff')}
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
                  value={form.email}
                  onChange={e => patch('email', e.target.value)}
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
                  {fr ? 'Poste' : 'Role'}
                </label>
                <input
                  type="text"
                  value={form.role || ''}
                  onChange={e => patch('role', e.target.value || null)}
                  className={INPUT_CLS}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {fr ? 'Type' : 'Type'}
                </label>
                <select
                  value={form.type}
                  onChange={e => patch('type', e.target.value as ContactType)}
                  className={INPUT_CLS}
                >
                  <option value="maincontact">{fr ? 'Contact principal' : 'Main contact'}</option>
                  <option value="staff">{fr ? 'Personnel' : 'Staff'}</option>
                </select>
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
