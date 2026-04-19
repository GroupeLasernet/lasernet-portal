'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

// ── Types ────────────────────────────────────────────────────────────────

interface QuoteItemData {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  notes: string;
}

interface QuoteLead {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  managedClientId?: string | null;
  managedClient?: {
    id: string;
    qbId: string;
    displayName: string;
    companyName: string;
  } | null;
}

interface QuoteProject {
  id: string;
  name: string;
  lead: QuoteLead;
}

interface Quote {
  id: string;
  quoteNumber: string | null;
  status: string;
  notes: string | null;
  qbEstimateId: string | null;
  qbSyncedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unit: string | null;
    notes: string | null;
    sortOrder: number;
  }[];
  project: QuoteProject;
}

interface ProjectOption {
  id: string;
  name: string;
  status: string;
  lead: { id: string; name: string; company: string | null };
}

// ── Helpers ──────────────────────────────────────────────────────────────

const emptyItem = (): QuoteItemData => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
  unit: 'each',
  notes: '',
});

const UNITS = ['each', 'hour', 'day', 'month', 'sqft', 'linear ft', 'lot'];

// ── Component ────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const { lang } = useLanguage();
  const fr = lang === 'fr';

  // ── State ──
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'draft' | 'pending' | 'accepted' | 'refused'>('all');

  // Editor state
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [creating, setCreating] = useState(false);

  // New quote form
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteExpiry, setQuoteExpiry] = useState('');
  const [lineItems, setLineItems] = useState<QuoteItemData[]>([emptyItem()]);

  // Saving / syncing
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Load quotes ──
  const loadQuotes = useCallback(async () => {
    try {
      const res = await fetch('/api/quotes');
      const data = await res.json();
      setQuotes(data.quotes || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  // ── Load projects for new quote ──
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      // ignore
    }
  }, []);

  // ── Filtering ──
  const filtered = tab === 'all' ? quotes : quotes.filter((q) => q.status === tab);

  // ── Totals ──
  const quoteTotal = (items: { quantity: number; unitPrice: number }[]) =>
    items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  // ── Open editor for existing quote ──
  const openEditor = (q: Quote) => {
    setEditingQuote(q);
    setCreating(false);
    setQuoteNotes(q.notes || '');
    setQuoteExpiry(q.expiresAt ? q.expiresAt.split('T')[0] : '');
    setLineItems(
      q.items.length > 0
        ? q.items.map((i) => ({
            id: i.id,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unit: i.unit || 'each',
            notes: i.notes || '',
          }))
        : [emptyItem()],
    );
    setPushError('');
  };

  // ── Open new quote form ──
  const openNew = () => {
    setEditingQuote(null);
    setCreating(true);
    setSelectedProjectId('');
    setQuoteNotes('');
    setQuoteExpiry('');
    setLineItems([emptyItem()]);
    setPushError('');
    loadProjects();
  };

  // ── Close editor ──
  const closeEditor = () => {
    setEditingQuote(null);
    setCreating(false);
  };

  // ── Line items manipulation ──
  const updateItem = (idx: number, field: keyof QuoteItemData, value: any) => {
    setLineItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };
  const addItem = () => setLineItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Save quote ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const itemsPayload = lineItems
        .filter((i) => i.description.trim())
        .map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unit: i.unit,
          notes: i.notes || null,
        }));

      if (editingQuote) {
        // Update
        await fetch(`/api/quotes/${editingQuote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: quoteNotes || null,
            expiresAt: quoteExpiry || null,
            items: itemsPayload,
          }),
        });
      } else if (creating) {
        // Create
        if (!selectedProjectId) {
          setSaving(false);
          return;
        }
        await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProjectId,
            notes: quoteNotes || null,
            expiresAt: quoteExpiry || null,
            items: itemsPayload,
          }),
        });
      }

      closeEditor();
      await loadQuotes();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  // ── Push to QB ──
  const handlePushQB = async (quoteId: string) => {
    setPushing(true);
    setPushError('');
    try {
      const res = await fetch(`/api/quotes/${quoteId}/push-qb`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setPushError(data.error || 'Failed');
        return;
      }
      await loadQuotes();
      closeEditor();
    } catch (e: any) {
      setPushError(e.message || 'Failed');
    } finally {
      setPushing(false);
    }
  };

  // ── Delete quote ──
  const handleDelete = async (id: string) => {
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    closeEditor();
    await loadQuotes();
  };

  // ── Status change ──
  const handleStatusChange = async (quoteId: string, newStatus: string) => {
    await fetch(`/api/quotes/${quoteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadQuotes();
  };

  // ── Formatting ──
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA');
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(n);

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      draft:    { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', label: fr ? 'Brouillon' : 'Draft' },
      pending:  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: fr ? 'En attente' : 'Pending' },
      accepted: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: fr ? 'Acceptée' : 'Accepted' },
      refused:  { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: fr ? 'Refusée' : 'Refused' },
    };
    const info = map[s] || map.draft;
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.bg} ${info.text}`}>
        {info.label}
      </span>
    );
  };

  // ── Stats ──
  const counts = {
    all: quotes.length,
    draft: quotes.filter((q) => q.status === 'draft').length,
    pending: quotes.filter((q) => q.status === 'pending').length,
    accepted: quotes.filter((q) => q.status === 'accepted').length,
    refused: quotes.filter((q) => q.status === 'refused').length,
  };

  const totalValue = quotes
    .filter((q) => q.status === 'accepted')
    .reduce((sum, q) => sum + quoteTotal(q.items), 0);

  // ═══════════════════════════════════════════════════════════════════════
  // EDITOR PANEL (slide-in)
  // ═══════════════════════════════════════════════════════════════════════

  const editorOpen = editingQuote !== null || creating;

  const renderEditor = () => {
    const isNew = creating && !editingQuote;
    const title = isNew
      ? (fr ? 'Nouvelle soumission' : 'New Quote')
      : (fr ? 'Modifier la soumission' : 'Edit Quote');

    const hasQBCustomer = editingQuote?.project?.lead?.managedClient?.qbId;

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/30 z-40" onClick={closeEditor} />

        {/* Slide-in panel */}
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col animate-slideIn">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
              {editingQuote && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {editingQuote.quoteNumber} — {editingQuote.project.lead.name}
                  {editingQuote.project.lead.company && ` (${editingQuote.project.lead.company})`}
                </p>
              )}
            </div>
            <button onClick={closeEditor} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Project picker (new quote only) */}
            {isNew && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {fr ? 'Projet' : 'Project'} *
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="">{fr ? 'Sélectionner un projet...' : 'Select a project...'}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.lead.name}{p.lead.company ? ` (${p.lead.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status + QB info (existing quote) */}
            {editingQuote && (
              <div className="flex items-center gap-3 flex-wrap">
                {statusBadge(editingQuote.status)}
                {editingQuote.qbEstimateId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    QB #{editingQuote.qbEstimateId}
                  </span>
                )}
                {editingQuote.qbSyncedAt && (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {fr ? 'Synchro' : 'Synced'}: {fmtDate(editingQuote.qbSyncedAt)}
                  </span>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fr ? 'Notes' : 'Notes'}
              </label>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none"
                placeholder={fr ? 'Notes internes...' : 'Internal notes...'}
              />
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fr ? 'Date d\'expiration' : 'Expiry Date'}
              </label>
              <input
                type="date"
                value={quoteExpiry}
                onChange={(e) => setQuoteExpiry(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* ── LINE ITEMS ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {fr ? 'Items' : 'Line Items'}
                </h3>
                <button
                  onClick={addItem}
                  className="flex items-center gap-1 px-2.5 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 text-xs font-medium rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {fr ? 'Ajouter' : 'Add'}
                </button>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 mb-2 px-1">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {fr ? 'Description' : 'Description'}
                </span>
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {fr ? 'Qté' : 'Qty'}
                </span>
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {fr ? 'Prix unit.' : 'Unit Price'}
                </span>
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                  {fr ? 'Total' : 'Total'}
                </span>
                <span />
              </div>

              {/* Items */}
              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 items-start group">
                    <div className="space-y-1">
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        placeholder={fr ? 'Description...' : 'Description...'}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100"
                      />
                      {/* Unit selector */}
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                        className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-[11px] text-gray-600 dark:text-gray-300"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 text-right"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 text-right"
                    />
                    <div className="text-sm text-right font-medium text-gray-700 dark:text-gray-200 py-1.5">
                      {fmtMoney(item.quantity * item.unitPrice)}
                    </div>
                    <button
                      onClick={() => removeItem(idx)}
                      className={`p-1.5 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors ${
                        lineItems.length <= 1 ? 'invisible' : ''
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {fr ? 'Total' : 'Total'}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {fmtMoney(quoteTotal(lineItems))}
                  </span>
                </div>
                {/* Tax hint */}
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-right mt-0.5">
                  {fr ? 'Avant taxes' : 'Before tax'}
                </p>
              </div>
            </div>

            {/* Push error */}
            {pushError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                {pushError}
              </div>
            )}
          </div>

          {/* ── Footer actions ── */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-3">
            {/* Delete (existing only) */}
            {editingQuote && (
              deleteConfirm === editingQuote.id ? (
                <div className="flex items-center gap-2 mr-auto">
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {fr ? 'Confirmer ?' : 'Confirm?'}
                  </span>
                  <button
                    onClick={() => handleDelete(editingQuote.id)}
                    className="px-2.5 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
                  >
                    {fr ? 'Oui, supprimer' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    {fr ? 'Annuler' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(editingQuote.id)}
                  className="mr-auto text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  {fr ? 'Supprimer' : 'Delete'}
                </button>
              )
            )}

            {/* Push to QB (existing only, needs QB customer) */}
            {editingQuote && hasQBCustomer && (
              <button
                onClick={() => handlePushQB(editingQuote.id)}
                disabled={pushing || lineItems.filter((i) => i.description.trim()).length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {pushing ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
                {editingQuote.qbEstimateId
                  ? (fr ? 'Re-sync QB' : 'Re-sync QB')
                  : (fr ? 'Envoyer à QB' : 'Push to QB')
                }
              </button>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || (isNew && !selectedProjectId) || lineItems.filter((i) => i.description.trim()).length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
              {fr ? 'Sauvegarder' : 'Save'}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
          .animate-slideIn { animation: slideIn 0.25s ease-out }
        `}</style>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {fr ? 'Soumissions' : 'Quotes'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {fr
              ? 'Créez des soumissions et synchronisez-les avec QuickBooks'
              : 'Create quotes and sync them to QuickBooks'}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {fr ? 'Nouvelle soumission' : 'New Quote'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { key: 'all' as const, label: fr ? 'Toutes' : 'All', color: 'text-gray-600 dark:text-gray-400' },
          { key: 'draft' as const, label: fr ? 'Brouillons' : 'Drafts', color: 'text-gray-500 dark:text-gray-400' },
          { key: 'pending' as const, label: fr ? 'En attente' : 'Pending', color: 'text-amber-600 dark:text-amber-400' },
          { key: 'accepted' as const, label: fr ? 'Acceptées' : 'Accepted', color: 'text-green-600 dark:text-green-400' },
          { key: 'refused' as const, label: fr ? 'Refusées' : 'Refused', color: 'text-red-600 dark:text-red-400' },
        ]).map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`bg-white dark:bg-gray-800 rounded-xl border p-3 text-left transition-colors ${
              tab === key
                ? 'border-brand-300 dark:border-brand-600 ring-1 ring-brand-200 dark:ring-brand-700'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-bold ${color} mt-0.5`}>{counts[key]}</p>
          </button>
        ))}
      </div>

      {/* Accepted total */}
      {totalValue > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            {fr ? 'Valeur totale acceptée' : 'Total Accepted Value'}
          </span>
          <span className="text-lg font-bold text-green-700 dark:text-green-300">{fmtMoney(totalValue)}</span>
        </div>
      )}

      {/* Quote list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-200 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {fr ? 'Aucune soumission' : 'No quotes'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map((q) => (
              <button
                key={q.id}
                onClick={() => openEditor(q)}
                className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {q.quoteNumber || '—'}
                      </span>
                      {statusBadge(q.status)}
                      {q.qbEstimateId && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          QB
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {q.project.lead.name}
                        {q.project.lead.company && ` — ${q.project.lead.company}`}
                      </span>
                      <span>{q.project.name}</span>
                      <span>{fmtDate(q.createdAt)}</span>
                      <span className="text-gray-400">{q.items.length} {fr ? 'items' : 'items'}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {fmtMoney(quoteTotal(q.items))}
                    </p>
                    {q.expiresAt && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {fr ? 'Expire' : 'Expires'}: {fmtDate(q.expiresAt)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick status actions on hover (existing quotes in list) */}
                {q.status === 'pending' && (
                  <div className="mt-2 flex gap-2">
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(q.id, 'accepted'); }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {fr ? 'Accepter' : 'Accept'}
                    </span>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(q.id, 'refused'); }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {fr ? 'Refuser' : 'Refuse'}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {filtered.length} {fr ? 'soumissions' : 'quotes'}
        </p>
      )}

      {/* Editor panel */}
      {editorOpen && renderEditor()}
    </div>
  );
}
