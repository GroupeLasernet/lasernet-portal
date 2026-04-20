'use client';

// ============================================================
// UserEditPanel — reusable slide-in editor for a User row.
// Handles BOTH Prisma Staff (role=admin) and Portal Clients
// (role=client) — the People tab uses this drawer for any
// person whose `source` is 'user'.
//
// Hugo's rule (2026-04-19): clicking Edit on a person must
// NEVER leave the current tab.
//
// Fields:
//   - Always: name / email / phone
//   - Admin:  subrole (sales/support/technician)
//   - Client: company (which client business they belong to)
//
// API:
//   - GET   /api/admin/team/[id]  (any user, admin-auth)
//   - PATCH /api/admin/team/[id]
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';

type Subrole = '' | 'sales' | 'support' | 'technician';

interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;           // 'admin' | 'client' — drives which extra field is shown
  subrole: Subrole;
  company: string | null; // only meaningful when role === 'client'
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-brand-500';

const SUBROLE_OPTIONS: { value: Subrole; labelEn: string; labelFr: string }[] = [
  { value: '',           labelEn: '—',           labelFr: '—' },
  { value: 'sales',      labelEn: 'Sales',       labelFr: 'Ventes' },
  { value: 'support',    labelEn: 'Support',     labelFr: 'Support' },
  { value: 'technician', labelEn: 'Technician',  labelFr: 'Technicien' },
];

export interface UserEditPanelProps {
  userId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function UserEditPanel({ userId, onClose, onSaved }: UserEditPanelProps) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fr = lang === 'fr';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState<UserDetail | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Single-user GET — works for admins AND client-role users.
  // Previously this fetched /api/admin/team (list) which is filtered
  // to role='admin', so client users triggered "User not found".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/admin/team/${userId}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (cancelled) return;
        const u = data.user;
        if (!u) throw new Error('User not found');
        setForm({
          id: u.id,
          name: u.name || '',
          email: u.email || '',
          phone: u.phone || null,
          role: u.role || 'admin',
          subrole: (u.subrole || '') as Subrole,
          company: u.company || null,
        });
      } catch (e: any) {
        if (!cancelled) setErr(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!loading && form) nameRef.current?.focus();
  }, [loading, form]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = <K extends keyof UserDetail>(key: K, value: UserDetail[K]) => {
    setForm(f => (f ? { ...f, [key]: value } : f));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveErr(null);
    try {
      // Only send fields the current role cares about. Admins get subrole,
      // clients get company — sending both is harmless but noisy.
      const body: any = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
      };
      if (form.role === 'admin') {
        body.subrole = form.subrole || null;
      } else {
        body.company = form.company || null;
      }
      const res = await fetch(`/api/admin/team/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const isAdmin = form?.role === 'admin';
  const headerTitle = fr
    ? (isAdmin ? 'Modifier le membre' : 'Modifier le client')
    : (isAdmin ? 'Edit member' : 'Edit client');
  const headerSubtitle = fr
    ? (isAdmin
        ? 'Personnel Prisma — enregistré dans le compte utilisateur.'
        : 'Compte client du portail — enregistré dans le compte utilisateur.')
    : (isAdmin
        ? 'Prisma Staff — saves to the user account.'
        : 'Portal client account — saves to the user account.');

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
              {headerTitle}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {headerSubtitle}
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

              {isAdmin ? (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {fr ? 'Spécialisation' : 'Specialization'}
                  </label>
                  <select
                    value={form.subrole}
                    onChange={e => patch('subrole', e.target.value as Subrole)}
                    className={INPUT_CLS}
                  >
                    {SUBROLE_OPTIONS.map(s => (
                      <option key={s.value || 'none'} value={s.value}>
                        {fr ? s.labelFr : s.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {fr ? 'Entreprise' : 'Company'}
                  </label>
                  <input
                    type="text"
                    value={form.company || ''}
                    onChange={e => patch('company', e.target.value || null)}
                    className={INPUT_CLS}
                  />
                </div>
              )}
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
