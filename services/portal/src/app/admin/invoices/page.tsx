'use client';

import { Fragment, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useQuickBooks } from '@/lib/QuickBooksContext';
import AnimatedNumber from '@/components/AnimatedNumber';
import { RelatedFilesChip } from '@/components/RelatedFilesChip';

// ── Types ──────────────────────────────────────────────────────────────────

interface InvoiceItem {
  /** QB Item.Id — powers the RelatedFilesChip on the line item. */
  itemId?: string | null;
  description: string;
  model: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  balance: number;
  status: 'paid' | 'unpaid' | 'overdue';
  date: string;
  dueDate: string;
  items: InvoiceItem[];
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  // Invoices come from QuickBooksContext — prefetched + refreshed in the
  // background every 60s so the page hydrates instantly on navigation.
  const qb = useQuickBooks();
  const invoices = qb.invoices.data as Invoice[];
  const loading = qb.invoices.loading && qb.invoices.data.length === 0;
  const source = qb.invoices.source;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Filters ──
  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (search.length >= 2) {
      const q = search.toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.amount.toString().includes(q)
      );
    }
    return true;
  });

  // ── Helpers ──
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(n);

  const fmtDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA');
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      paid:    { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: fr ? 'Payée' : 'Paid' },
      unpaid:  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: fr ? 'Non payée' : 'Unpaid' },
      overdue: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: fr ? 'En retard' : 'Overdue' },
    };
    const info = map[s] || map.unpaid;
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.bg} ${info.text}`}>
        {info.label}
      </span>
    );
  };

  // ── Stats ──
  const totalAmount = invoices.reduce((s, i) => s + i.amount, 0);
  const totalBalance = invoices.reduce((s, i) => s + i.balance, 0);
  const paidCount = invoices.filter(i => i.status === 'paid').length;
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {fr ? 'Factures' : 'Invoices'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {fr ? 'Recherchez et consultez les factures QuickBooks' : 'Search and view QuickBooks invoices'}
            {source && source !== 'quickbooks' && (
              <span className="ml-2 text-amber-500 text-xs">
                ({source === 'cache' ? (fr ? 'données en cache' : 'cached data') : (fr ? 'données fictives' : 'mock data')})
              </span>
            )}
          </p>
        </div>
        <button
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
          onClick={() => alert(fr ? 'Création de factures bientôt disponible' : 'Invoice creation coming soon')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {fr ? 'Nouvelle facture' : 'New Invoice'}
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Total facturé' : 'Total Invoiced'}</p>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            <AnimatedNumber value={totalAmount} format={fmtCurrency} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Solde restant' : 'Outstanding'}</p>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            <AnimatedNumber value={totalBalance} format={fmtCurrency} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'Payées' : 'Paid'}</p>
          <div className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
            <AnimatedNumber value={paidCount} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{fr ? 'En retard' : 'Overdue'}</p>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
            <AnimatedNumber value={overdueCount} />
          </div>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={fr ? 'Rechercher par numéro, client ou montant...' : 'Search by number, client or amount...'}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'unpaid', 'overdue'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {s === 'all' ? (fr ? 'Toutes' : 'All')
                : s === 'paid' ? (fr ? 'Payées' : 'Paid')
                : s === 'unpaid' ? (fr ? 'Non payées' : 'Unpaid')
                : (fr ? 'En retard' : 'Overdue')}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-200 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {fr ? 'Aucune facture trouvée' : 'No invoices found'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{fr ? 'Client' : 'Client'}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{fr ? 'Date' : 'Date'}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{fr ? 'Échéance' : 'Due'}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{fr ? 'Montant' : 'Amount'}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{fr ? 'Solde' : 'Balance'}</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{fr ? 'Statut' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isExpanded = expandedId === inv.id;
                return (
                  <Fragment key={inv.id}>
                    <tr
                      className={`border-b border-gray-50 dark:border-gray-700/50 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-brand-50/50 dark:bg-brand-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{inv.clientName}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(inv.date)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{fmtCurrency(inv.amount)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {inv.balance > 0 ? fmtCurrency(inv.balance) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(inv.status)}</td>
                    </tr>
                    {isExpanded && inv.items && inv.items.length > 0 && (
                      <tr className="bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="space-y-1.5">
                            {inv.items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
                              >
                                <span className="flex-1 truncate text-gray-900 dark:text-gray-100">
                                  {it.model || it.description || '—'}
                                </span>
                                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                                  {it.quantity} × {fmtCurrency(it.rate)}
                                </span>
                                <span className="w-20 shrink-0 text-right font-medium text-gray-900 dark:text-gray-100">
                                  {fmtCurrency(it.amount)}
                                </span>
                                {it.itemId && <RelatedFilesChip skuId={it.itemId} compact />}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {filtered.length} / {invoices.length} {fr ? 'factures' : 'invoices'}
        </p>
      )}
    </div>
  );
}
