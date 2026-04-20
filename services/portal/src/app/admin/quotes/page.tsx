'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useQuickBooks } from '@/lib/QuickBooksContext';

// ── Types ────────────────────────────────────────────────────────────────

interface QuoteItemData {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  serviceDate: string;
  productService: string;
  taxCode: string;
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
  quoteMessage: string | null;
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
    serviceDate: string | null;
    productService: string | null;
    taxCode: string | null;
    notes: string | null;
    sortOrder: number;
  }[];
  project: QuoteProject;
}

interface ManagedClient {
  id: string;
  displayName: string;
  companyName: string | null;
  qbId: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  status: string;
  lead: { id: string; name: string; company: string | null; managedClientId?: string | null };
}

interface QBEstimate {
  Id: string;
  DocNumber: string;
  CustomerRef: { value: string; name: string };
  TotalAmt: number;
  TxnDate: string;
  ExpirationDate?: string;
  TxnStatus: string;
  Line: any[];
}

interface QBTaxCodeOption {
  id: string;
  name: string;
  description: string;
  taxable: boolean;
  totalRate: number;  // e.g. 14.975
  rateDetails: { name: string; rate: number }[];
}

// ── Constants ────────────────────────────────────────────────────────────

const PRODUCT_SERVICES = ['Piece', 'Service', 'Notes', "Main d'oeuvre", 'Autre'];


const DEFAULT_QUOTE_MESSAGE =
  "Les prix peuvent fluctuer, sans pr\u00e9avis,\nen fonction des tarifs internationaux en vigueur.\nDevis valide 15 jours";

// ── Helpers ──────────────────────────────────────────────────────────────

const emptyItem = (): QuoteItemData => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
  unit: 'each',
  serviceDate: '',
  productService: 'Service',
  taxCode: 'TPS/TVQ',
  notes: '',
});

// ── Component ────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const { lang } = useLanguage();
  const fr = lang === 'fr';
  // QB connection — single source of truth lives in QuickBooksContext.
  // `status === 'connected'` means DB-persisted tokens are live. We never
  // infer connection state from an individual data-fetch result anymore.
  const qb = useQuickBooks();
  const { status: qbStatus, connect: qbConnect } = qb;
  const qbConnected = qbStatus === 'connected';

  // ── State ──
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'draft' | 'pending' | 'accepted' | 'refused'>('all');

  // Business / project selectors
  const [managedClients, setManagedClients] = useState<ManagedClient[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('');

  // QB estimates
  const [qbEstimates, setQbEstimates] = useState<QBEstimate[]>([]);
  const [loadingQB, setLoadingQB] = useState(false);

  // Editor state
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [viewingQBEstimate, setViewingQBEstimate] = useState<QBEstimate | null>(null);
  const [creating, setCreating] = useState(false);

  // New quote form
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteMessage, setQuoteMessage] = useState(DEFAULT_QUOTE_MESSAGE);
  const [quoteExpiry, setQuoteExpiry] = useState('');
  const [lineItems, setLineItems] = useState<QuoteItemData[]>([emptyItem()]);

  // Saving / syncing
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushSuccess, setPushSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Attachments (existing quote only)
  interface Attachment { id: string; filename: string; mimeType: string; size: number; createdAt: string }
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Amount display mode: 'excl' = tax excluded, 'incl' = tax included, 'none' = no tax
  const [amountDisplay, setAmountDisplay] = useState<'excl' | 'incl' | 'none'>('excl');

  // ── Formatting ──
  const fmtDate = useCallback(
    (d: string) => new Date(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA'),
    [fr],
  );
  const fmtMoney = useCallback(
    (n: number) =>
      new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(n),
    [fr],
  );

  // QB tax codes (dynamic from QuickBooks) — sourced from QuickBooksContext
  // which prefetches them once on provider mount and revalidates every 60 s.
  const qbTaxCodes = qb.taxCodes.data as unknown as QBTaxCodeOption[];

  // ── Load managed clients ──
  const loadManagedClients = useCallback(async () => {
    try {
      const res = await fetch('/api/managed-clients');
      const data = await res.json();
      const raw: any[] = data.clients || data.managedClients || data || [];
      // API returns { id, qbClient: { id, displayName, companyName } } — flatten for our interface
      const mapped: ManagedClient[] = raw.map((c: any) => ({
        id: c.id,
        displayName: c.qbClient?.displayName || c.displayName || '',
        companyName: c.qbClient?.companyName || c.companyName || null,
        qbId: c.qbClient?.id || c.qbId || null,
      }));
      setManagedClients(mapped);
    } catch {
      // ignore
    }
  }, []);

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

  // ── Load projects ──
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      // ignore
    }
  }, []);

  // ── Load QB estimates for a business ──
  const loadQBEstimates = useCallback(async (qbId: string) => {
    if (!qbId) {
      setQbEstimates([]);
      return;
    }
    setLoadingQB(true);
    try {
      const res = await fetch(`/api/quotes/qb-estimates?customerId=${encodeURIComponent(qbId)}`);
      const data = await res.json();
      setQbEstimates(data.estimates || data || []);
    } catch {
      setQbEstimates([]);
    } finally {
      setLoadingQB(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    loadManagedClients();
    loadProjects();
    // QB tax codes are prefetched by QuickBooksContext.
  }, [loadQuotes, loadManagedClients, loadProjects]);

  // When business changes, load QB estimates
  useEffect(() => {
    const biz = managedClients.find((c) => c.id === selectedBusinessId);
    if (biz?.qbId) {
      loadQBEstimates(biz.qbId);
    } else {
      setQbEstimates([]);
    }
    setSelectedProjectFilter('');
  }, [selectedBusinessId, managedClients, loadQBEstimates]);

  // ── Filtered projects (by selected business) ──
  const filteredProjects = useMemo(() => {
    if (!selectedBusinessId) return projects;
    return projects.filter((p) => p.lead?.managedClientId === selectedBusinessId);
  }, [projects, selectedBusinessId]);

  // ── Filtered quotes ──
  const filtered = useMemo(() => {
    let result = quotes;
    if (selectedBusinessId) {
      result = result.filter(
        (q) => q.project?.lead?.managedClient?.id === selectedBusinessId,
      );
    }
    if (selectedProjectFilter) {
      result = result.filter((q) => q.project?.id === selectedProjectFilter);
    }
    if (tab !== 'all') {
      result = result.filter((q) => q.status === tab);
    }
    return result;
  }, [quotes, selectedBusinessId, selectedProjectFilter, tab]);

  // ── Totals ──
  const quoteTotal = (items: { quantity: number; unitPrice: number }[]) =>
    items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  // ── Tax calculations ──
  const calcTaxes = useCallback((items: QuoteItemData[]) => {
    // Build a lookup from tax code id/name to its rate details
    const codeMap = new Map<string, QBTaxCodeOption>();
    for (const tc of qbTaxCodes) {
      codeMap.set(tc.id, tc);
      codeMap.set(tc.name, tc);
    }

    let subtotal = 0;
    const taxTotals: Record<string, number> = {}; // rateName → total tax amount

    for (const item of items) {
      const amount = item.quantity * item.unitPrice;
      subtotal += amount;
      const tc = codeMap.get(item.taxCode);
      if (tc) {
        for (const rd of tc.rateDetails) {
          taxTotals[rd.name] = (taxTotals[rd.name] || 0) + amount * (rd.rate / 100);
        }
      }
    }

    const totalTax = Object.values(taxTotals).reduce((s, v) => s + v, 0);
    return { subtotal, taxBreakdown: taxTotals, totalTax, total: subtotal + totalTax };
  }, [qbTaxCodes]);

  // ── Attachments ──
  const loadAttachments = useCallback(async (quoteId: string) => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/attachments`);
      const data = await res.json();
      setAttachments(data.attachments || []);
    } catch {
      setAttachments([]);
    }
  }, []);

  const uploadFile = async (file: File) => {
    if (!editingQuote) return;
    setUploadingFile(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/quotes/${editingQuote.id}/attachments`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }
      await loadAttachments(editingQuote.id);
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const deleteAttachment = async (attId: string) => {
    if (!editingQuote) return;
    await fetch(`/api/quotes/${editingQuote.id}/attachments/${attId}`, { method: 'DELETE' });
    await loadAttachments(editingQuote.id);
  };

  // ── Open editor for existing quote ──
  const openEditor = (q: Quote) => {
    setEditingQuote(q);
    setViewingQBEstimate(null);
    setCreating(false);
    setQuoteNotes(q.notes || '');
    setQuoteMessage(q.quoteMessage || DEFAULT_QUOTE_MESSAGE);
    setQuoteExpiry(q.expiresAt ? q.expiresAt.split('T')[0] : '');
    setLineItems(
      q.items.length > 0
        ? q.items.map((i) => ({
            id: i.id,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unit: i.unit || 'each',
            serviceDate: i.serviceDate ? i.serviceDate.split('T')[0] : '',
            productService: i.productService || 'Service',
            taxCode: i.taxCode || 'TPS/TVQ',
            notes: i.notes || '',
          }))
        : [emptyItem()],
    );
    setPushError('');
    setPushSuccess(false);
    setUploadError('');
    loadAttachments(q.id);
  };

  // ── Open QB estimate (read-only) ──
  const openQBEstimate = (est: QBEstimate) => {
    setViewingQBEstimate(est);
    setEditingQuote(null);
    setCreating(false);
  };

  // ── Open new quote form ──
  const openNew = () => {
    setEditingQuote(null);
    setViewingQBEstimate(null);
    setCreating(true);
    setSelectedProjectId('');
    setQuoteNotes('');
    setQuoteMessage(DEFAULT_QUOTE_MESSAGE);
    setQuoteExpiry('');
    setLineItems([emptyItem()]);
    setPushError('');
    setPushSuccess(false);
    setUploadError('');
    setAttachments([]);
  };

  // ── Close editor ──
  const closeEditor = () => {
    setEditingQuote(null);
    setViewingQBEstimate(null);
    setCreating(false);
  };

  // ── Line items manipulation ──
  const updateItem = (idx: number, field: keyof QuoteItemData, value: any) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
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
          serviceDate: i.serviceDate || null,
          productService: i.productService,
          taxCode: i.taxCode,
          notes: i.notes || null,
        }));

      if (editingQuote) {
        await fetch(`/api/quotes/${editingQuote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: quoteNotes || null,
            quoteMessage: quoteMessage || null,
            expiresAt: quoteExpiry || null,
            items: itemsPayload,
          }),
        });
      } else if (creating) {
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
            quoteMessage: quoteMessage || null,
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
    setPushSuccess(false);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/push-qb`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setPushError(data.error || 'Failed');
        return;
      }
      const data = await res.json();
      setPushSuccess(true);
      // Refresh list + keep editor open so the user sees the synced chip
      await loadQuotes();
      // Patch the current editingQuote so the QB chip appears without closing
      if (editingQuote && data.qbEstimateId) {
        setEditingQuote({
          ...editingQuote,
          qbEstimateId: data.qbEstimateId,
          qbSyncedAt: new Date().toISOString(),
        });
      }
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

  // ── Status badge ──
  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      draft: {
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-600 dark:text-gray-300',
        label: fr ? 'Brouillon' : 'Draft',
      },
      pending: {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-300',
        label: fr ? 'En attente' : 'Pending',
      },
      accepted: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-300',
        label: fr ? 'Accept\u00e9e' : 'Accepted',
      },
      refused: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-300',
        label: fr ? 'Refus\u00e9e' : 'Refused',
      },
    };
    const info = map[s] || map.draft;
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.bg} ${info.text}`}
      >
        {info.label}
      </span>
    );
  };

  // ── Stats ──
  const counts = useMemo(
    () => ({
      all: quotes.length,
      draft: quotes.filter((q) => q.status === 'draft').length,
      pending: quotes.filter((q) => q.status === 'pending').length,
      accepted: quotes.filter((q) => q.status === 'accepted').length,
      refused: quotes.filter((q) => q.status === 'refused').length,
    }),
    [quotes],
  );

  // ═══════════════════════════════════════════════════════════════════════
  // EDITOR PANEL (slide-in)
  // ═══════════════════════════════════════════════════════════════════════

  const editorOpen = editingQuote !== null || creating || viewingQBEstimate !== null;

  const renderEditor = () => {
    // QB estimate read-only view
    if (viewingQBEstimate) {
      const est = viewingQBEstimate;
      return (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeEditor} />
          <div className="fixed inset-y-0 right-0 w-full max-w-4xl bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col animate-slideIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  QB
                </span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {fr ? 'Estimation QB' : 'QB Estimate'} #{est.DocNumber}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {est.CustomerRef.name} &mdash; {fmtDate(est.TxnDate)}
                  </p>
                </div>
              </div>
              <button
                onClick={closeEditor}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                <span>
                  <strong>{fr ? 'Statut' : 'Status'}:</strong> {est.TxnStatus}
                </span>
                <span>
                  <strong>Total:</strong> {fmtMoney(est.TotalAmt)}
                </span>
                {est.ExpirationDate && (
                  <span>
                    <strong>{fr ? 'Expire' : 'Expires'}:</strong> {fmtDate(est.ExpirationDate)}
                  </span>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                  {fr ? 'Lignes' : 'Lines'}
                </h3>
                <div className="space-y-2">
                  {est.Line?.filter((l: any) => l.DetailType !== 'SubTotalLineDetail').map((line: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-700 rounded-lg text-sm"
                    >
                      <span className="text-gray-800 dark:text-gray-200 flex-1">
                        {line.Description || line.SalesItemLineDetail?.ItemRef?.name || '—'}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 w-16 text-right">
                        {line.SalesItemLineDetail?.Qty ?? '—'}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 w-24 text-right">
                        {line.SalesItemLineDetail?.UnitPrice != null
                          ? fmtMoney(line.SalesItemLineDetail.UnitPrice)
                          : '—'}
                      </span>
                      <span className="font-medium text-gray-800 dark:text-gray-200 w-28 text-right">
                        {fmtMoney(line.Amount ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                {fr
                  ? 'Cette estimation provient de QuickBooks (lecture seule).'
                  : 'This estimate is from QuickBooks (read-only).'}
              </p>
            </div>
          </div>
          <style>{`
            @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
            .animate-slideIn { animation: slideIn 0.25s ease-out }
          `}</style>
        </>
      );
    }

    const isNew = creating && !editingQuote;
    const title = isNew
      ? fr
        ? 'Nouvelle soumission'
        : 'New Quote'
      : fr
        ? 'Modifier la soumission'
        : 'Edit Quote';

    const hasQBCustomer = editingQuote?.project?.lead?.managedClient?.qbId;
    const taxes = calcTaxes(lineItems);

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/30 z-40" onClick={closeEditor} />

        {/* Slide-in panel */}
        <div className="fixed inset-y-0 right-0 w-full max-w-4xl bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col animate-slideIn">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
              {editingQuote && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {editingQuote.quoteNumber} &mdash; {editingQuote.project.lead.name}
                  {editingQuote.project.lead.company && ` (${editingQuote.project.lead.company})`}
                </p>
              )}
            </div>
            <button
              onClick={closeEditor}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
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
                  <option value="">
                    {fr ? 'S\u00e9lectionner un projet...' : 'Select a project...'}
                  </option>
                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} &mdash; {p.lead.name}
                      {p.lead.company ? ` (${p.lead.company})` : ''}
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

            {/* ── LINE ITEMS TABLE ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {fr ? 'Items' : 'Line Items'}
                </h3>
                <div className="flex items-center gap-3">
                  {/* Amount display mode */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {fr ? 'Affichage des montants' : 'Amount display'}
                    </span>
                    <select
                      value={amountDisplay}
                      onChange={(e) => setAmountDisplay(e.target.value as 'excl' | 'incl' | 'none')}
                      className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-xs text-gray-700 dark:text-gray-200"
                    >
                      <option value="excl">{fr ? 'Taxe non comprise' : 'Tax excluded'}</option>
                      <option value="incl">{fr ? 'Taxe comprise' : 'Tax included'}</option>
                      <option value="none">{fr ? 'Hors champ de la taxe' : 'No tax'}</option>
                    </select>
                  </div>
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
              </div>

              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 pr-2 w-8">#</th>
                      <th className="text-left py-2 px-2 w-28">
                        {fr ? 'Date' : 'Date'}
                      </th>
                      <th className="text-left py-2 px-2 w-32">
                        {fr ? 'Produit/Service' : 'Product/Service'}
                      </th>
                      <th className="text-left py-2 px-2">Description</th>
                      <th className="text-right py-2 px-2 w-16">{fr ? 'Qt\u00e9' : 'Qty'}</th>
                      <th className="text-right py-2 px-2 w-24">{fr ? 'Prix' : 'Price'}</th>
                      <th className="text-right py-2 px-2 w-24">{fr ? 'Montant' : 'Amount'}</th>
                      {amountDisplay !== 'none' && (
                        <th className="text-left py-2 px-2 w-32">
                          {fr ? 'Taxe de vente' : 'Sales Tax'}
                        </th>
                      )}
                      <th className="w-8 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className="group align-top">
                        <td className="py-2 pr-2 text-gray-400 dark:text-gray-500 text-xs font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="date"
                            value={item.serviceDate}
                            onChange={(e) => updateItem(idx, 'serviceDate', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <select
                            value={item.productService}
                            onChange={(e) => updateItem(idx, 'productService', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-gray-100"
                          >
                            {PRODUCT_SERVICES.map((ps) => (
                              <option key={ps} value={ps}>
                                {fr ? ps : (ps === 'Piece' ? 'Part' : ps === "Main d'oeuvre" ? 'Labour' : ps === 'Autre' ? 'Other' : ps)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <textarea
                            value={item.description}
                            onChange={(e) => updateItem(idx, 'description', e.target.value)}
                            placeholder={fr ? 'Description...' : 'Description...'}
                            rows={1}
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-gray-100 resize-y min-h-[32px]"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-gray-100 text-right"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-gray-100 text-right"
                          />
                        </td>
                        <td className="py-2 px-2 text-right font-medium text-gray-700 dark:text-gray-200 text-xs whitespace-nowrap">
                          {(() => {
                            const base = item.quantity * item.unitPrice;
                            if (amountDisplay === 'incl') {
                              const tc = qbTaxCodes.find((t) => t.id === item.taxCode || t.name === item.taxCode);
                              const rate = tc ? tc.totalRate / 100 : 0;
                              return fmtMoney(base * (1 + rate));
                            }
                            return fmtMoney(base);
                          })()}
                        </td>
                        {amountDisplay !== 'none' && (
                          <td className="py-2 px-2">
                            <select
                              value={item.taxCode}
                              onChange={(e) => updateItem(idx, 'taxCode', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-gray-100"
                            >
                              {qbTaxCodes.map((tc) => (
                                <option key={tc.id} value={tc.id}>
                                  {tc.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td className="py-2 pl-1">
                          <button
                            onClick={() => removeItem(idx)}
                            className={`p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors ${
                              lineItems.length <= 1 ? 'invisible' : ''
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add row button (below table) */}
              <button
                onClick={addItem}
                className="mt-2 flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {fr ? 'Ajouter une ligne' : 'Add row'}
              </button>
            </div>

            {/* Quote message */}
            <div className="max-w-[45%]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fr ? 'Message affiché sur le devis' : 'Message displayed on quote'}
              </label>
              <textarea
                value={quoteMessage}
                onChange={(e) => setQuoteMessage(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none"
              />
            </div>

            {/* Tax summary */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2 max-w-sm ml-auto">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>{fr ? 'Total partiel' : 'Subtotal'}</span>
                <span className="font-medium">{fmtMoney(taxes.subtotal)}</span>
              </div>
              {amountDisplay !== 'none' && Object.entries(taxes.taxBreakdown).map(([name, amount]) => (
                <div key={name} className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span>
                    {name}{' '}
                    {(() => {
                      // Find the rate percentage for display
                      for (const tc of qbTaxCodes) {
                        const rd = tc.rateDetails.find((r) => r.name === name);
                        if (rd) return `${rd.rate}\u00a0%`;
                      }
                      return '';
                    })()}
                    {' '}{fr ? 'sur' : 'on'} {fmtMoney(taxes.subtotal)}
                  </span>
                  <span className="font-medium">{fmtMoney(amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-600">
                <span>Total</span>
                <span>{fmtMoney(amountDisplay === 'none' ? taxes.subtotal : taxes.total)}</span>
              </div>
            </div>

            {/* File drop zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fr ? 'Pi\u00e8ces jointes' : 'Attachments'}
              </label>

              {!editingQuote ? (
                <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center text-xs text-gray-400 dark:text-gray-500">
                  {fr
                    ? 'Sauvegardez d\'abord la soumission pour joindre des fichiers.'
                    : 'Save the quote first to attach files.'}
                </div>
              ) : (
                <>
                  <label
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const files = Array.from(e.dataTransfer.files);
                      files.forEach((f) => { void uploadFile(f); });
                    }}
                    className={`block border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
                      dragOver
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 dark:hover:border-brand-500'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach((f) => { void uploadFile(f); });
                        e.target.value = '';
                      }}
                    />
                    {uploadingFile ? (
                      <>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {fr ? 'Envoi en cours...' : 'Uploading...'}
                        </p>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-10 h-10 text-gray-300 dark:text-gray-500 mb-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {fr ? 'Glissez et d\u00e9posez des fichiers ici' : 'Drag and drop files here'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {fr ? 'ou cliquez pour parcourir (max 10 Mo)' : 'or click to browse (max 10 MB)'}
                        </p>
                      </>
                    )}
                  </label>

                  {uploadError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
                  )}

                  {attachments.length > 0 && (
                    <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {attachments.map((att) => (
                        <li key={att.id} className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-700/30">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <a
                            href={`/api/quotes/${editingQuote.id}/attachments/${att.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 hover:text-brand-600 dark:hover:text-brand-400 truncate"
                          >
                            {att.filename}
                          </a>
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                            {(att.size / 1024).toFixed(1)} KB
                          </span>
                          <button
                            onClick={() => deleteAttachment(att.id)}
                            className="p-1 text-gray-300 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                            title={fr ? 'Supprimer' : 'Delete'}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Internal notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fr ? 'Notes internes' : 'Internal Notes'}
              </label>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none"
                placeholder={fr ? 'Notes internes...' : 'Internal notes...'}
              />
            </div>

            {/* Push feedback */}
            {pushError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                {pushError}
              </div>
            )}
            {pushSuccess && !pushError && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {fr ? 'Synchronisé avec QuickBooks.' : 'Synced to QuickBooks.'}
              </div>
            )}
          </div>

          {/* ── Footer actions ── */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-3">
            {/* Delete (existing only) */}
            {editingQuote &&
              (deleteConfirm === editingQuote.id ? (
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
              ))}

            {/* Print / Save as PDF (existing quote only) */}
            {editingQuote && (
              <button
                onClick={() => window.open(`/admin/quotes/${editingQuote.id}/print`, '_blank')}
                title={fr ? 'Imprimer / Enregistrer en PDF' : 'Print / Save as PDF'}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                {fr ? 'Imprimer' : 'Print'}
              </button>
            )}

            {/* Push to QB (existing only, needs QB customer) */}
            {editingQuote && hasQBCustomer && (
              <button
                onClick={() => handlePushQB(editingQuote.id)}
                disabled={
                  pushing || lineItems.filter((i) => i.description.trim()).length === 0
                }
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {pushing ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                )}
                {editingQuote.qbEstimateId
                  ? fr
                    ? 'Re-sync QB'
                    : 'Re-sync QB'
                  : fr
                    ? 'Envoyer \u00e0 QB'
                    : 'Push to QB'}
              </button>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={
                saving ||
                (isNew && !selectedProjectId) ||
                lineItems.filter((i) => i.description.trim()).length === 0
              }
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving && (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
              )}
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
              ? 'Cr\u00e9ez des soumissions et synchronisez-les avec QuickBooks'
              : 'Create quotes and sync them to QuickBooks'}
          </p>
        </div>
        <button
          onClick={openNew}
          disabled={!qbConnected}
          title={!qbConnected ? (fr ? 'QuickBooks doit être connecté pour créer des soumissions' : 'QuickBooks must be connected to create quotes') : ''}
          className={`flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl transition-colors shadow-sm ${
            qbConnected
              ? 'bg-brand-600 hover:bg-brand-700'
              : 'bg-gray-400 cursor-not-allowed opacity-60'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {fr ? 'Nouvelle soumission' : 'New Quote'}
        </button>
      </div>

      {/* QB not connected warning — only show when we've actually resolved
          to a non-connected state (skip 'loading' to avoid a flash). */}
      {(qbStatus === 'disconnected' || qbStatus === 'missing-creds' || qbStatus === 'error') && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-3 min-w-0">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">
              {qbStatus === 'missing-creds'
                ? fr
                  ? 'Les identifiants QuickBooks ne sont pas configurés. La création de soumissions est désactivée.'
                  : 'QuickBooks credentials are not configured. Quote creation is disabled.'
                : fr
                  ? 'QuickBooks n\'est pas connecté. La création de soumissions est désactivée tant que la connexion n\'est pas établie.'
                  : 'QuickBooks is not connected. Quote creation is disabled until the connection is established.'}
            </span>
          </div>
          {qbStatus !== 'missing-creds' && (
            <button
              type="button"
              onClick={() => { void qbConnect(); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors"
            >
              {fr ? 'Connecter QuickBooks' : 'Connect QuickBooks'}
            </button>
          )}
        </div>
      )}

      {/* Business / Project selectors */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
            {fr ? 'Entreprise' : 'Business'}
          </label>
          <select
            value={selectedBusinessId}
            onChange={(e) => setSelectedBusinessId(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">{fr ? 'Toutes les entreprises' : 'All businesses'}</option>
            {managedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName || c.companyName || c.id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
            {fr ? 'Projet' : 'Project'}
          </label>
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">{fr ? 'Tous les projets' : 'All projects'}</option>
            {filteredProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {(
          [
            { key: 'all' as const, label: fr ? 'Toutes' : 'All' },
            { key: 'draft' as const, label: fr ? 'Brouillons' : 'Draft' },
            { key: 'pending' as const, label: fr ? 'En attente' : 'Pending' },
            { key: 'accepted' as const, label: fr ? 'Accept\u00e9es' : 'Accepted' },
            { key: 'refused' as const, label: fr ? 'Refus\u00e9es' : 'Refused' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
            <span
              className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] px-1 py-0.5 rounded-full text-[10px] font-bold ${
                tab === key
                  ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Quote list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : filtered.length === 0 && qbEstimates.length === 0 ? (
          <div className="text-center py-16">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-200 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {fr ? 'Aucune soumission' : 'No quotes'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {/* Local quotes */}
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
                        {q.quoteNumber || '\u2014'}
                      </span>
                      {statusBadge(q.status)}
                      {q.qbEstimateId && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          QB
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        {q.project.lead.name}
                        {q.project.lead.company && ` \u2014 ${q.project.lead.company}`}
                      </span>
                      <span>{q.project.name}</span>
                      <span>{fmtDate(q.createdAt)}</span>
                      <span className="text-gray-400">
                        {q.items.length} {fr ? 'items' : 'items'}
                      </span>
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
              </button>
            ))}

            {/* QB Estimates */}
            {loadingQB && (
              <div className="p-4 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                {fr ? 'Chargement des estimations QB...' : 'Loading QB estimates...'}
              </div>
            )}
            {qbEstimates.map((est) => (
              <button
                key={`qb-${est.Id}`}
                onClick={() => openQBEstimate(est)}
                className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        #{est.DocNumber}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        QB
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        {est.TxnStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{est.CustomerRef.name}</span>
                      <span>{fmtDate(est.TxnDate)}</span>
                      {est.ExpirationDate && (
                        <span>
                          {fr ? 'Expire' : 'Expires'}: {fmtDate(est.ExpirationDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {fmtMoney(est.TotalAmt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {filtered.length} {fr ? 'soumissions' : 'quotes'}
          {qbEstimates.length > 0 && (
            <span>
              {' '}
              + {qbEstimates.length} {fr ? 'estimations QB' : 'QB estimates'}
            </span>
          )}
        </p>
      )}

      {/* Editor panel */}
      {editorOpen && renderEditor()}
    </div>
  );
}
