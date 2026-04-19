'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';

// ── Types (mirroring the editor page) ──

interface QuoteItem {
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
  items: QuoteItem[];
  project: {
    id: string;
    name: string;
    lead: {
      id: string;
      name: string;
      email: string | null;
      company: string | null;
      managedClient: {
        id: string;
        qbId: string;
        displayName: string;
        companyName: string | null;
      } | null;
    };
  };
}

interface QBTaxCodeOption {
  id: string;
  name: string;
  description: string;
  taxable: boolean;
  totalRate: number;
  rateDetails: { name: string; rate: number }[];
}

export default function QuotePrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { lang } = useLanguage();
  const fr = lang === 'fr';

  const [quote, setQuote] = useState<Quote | null>(null);
  const [taxCodes, setTaxCodes] = useState<QBTaxCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [qRes, tcRes] = await Promise.all([
          fetch(`/api/quotes/${id}`),
          fetch('/api/quotes/qb-tax-codes'),
        ]);
        const qData = await qRes.json();
        const tcData = await tcRes.json();
        if (cancelled) return;
        setQuote(qData.quote || null);
        setTaxCodes(tcData.taxCodes || []);
      } catch {
        // ignore — page will render an error state
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Auto-trigger print once the data is on screen
  useEffect(() => {
    if (!loading && quote && !printed) {
      // Small delay so the browser has a chance to lay out the page
      const t = setTimeout(() => {
        window.print();
        setPrinted(true);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [loading, quote, printed]);

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA') : '—';
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(n);

  const taxes = useMemo(() => {
    if (!quote) return { subtotal: 0, breakdown: {} as Record<string, number>, total: 0, totalTax: 0 };
    const codeMap = new Map<string, QBTaxCodeOption>();
    for (const tc of taxCodes) {
      codeMap.set(tc.id, tc);
      codeMap.set(tc.name, tc);
    }
    let subtotal = 0;
    const breakdown: Record<string, number> = {};
    for (const item of quote.items) {
      const amount = item.quantity * item.unitPrice;
      subtotal += amount;
      const tc = item.taxCode ? codeMap.get(item.taxCode) : undefined;
      if (tc) {
        for (const rd of tc.rateDetails) {
          breakdown[rd.name] = (breakdown[rd.name] || 0) + amount * (rd.rate / 100);
        }
      }
    }
    const totalTax = Object.values(breakdown).reduce((s, v) => s + v, 0);
    return { subtotal, breakdown, total: subtotal + totalTax, totalTax };
  }, [quote, taxCodes]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-8">
        <p className="text-gray-600">
          {fr ? 'Soumission introuvable.' : 'Quote not found.'}
        </p>
      </div>
    );
  }

  const client = quote.project.lead;
  const business = client.managedClient;
  const displayName = business?.displayName || business?.companyName || client.company || client.name;

  return (
    <div className="bg-white min-h-screen">
      {/* Print-only CSS: hide browser chrome, zero margins */}
      <style>{`
        @page { size: letter; margin: 15mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        html, body { background: white; color: #111; }
      `}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {fr ? 'Imprimer / Enregistrer en PDF' : 'Print / Save as PDF'}
        </button>
        <button
          onClick={() => window.close()}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          {fr ? 'Fermer' : 'Close'}
        </button>
        <span className="ml-auto text-xs text-gray-500">
          {fr
            ? 'Astuce : utilisez « Enregistrer en PDF » dans le dialogue d\u2019impression.'
            : 'Tip: use "Save as PDF" in the print dialog.'}
        </span>
      </div>

      {/* Printable document */}
      <div className="max-w-[8.5in] mx-auto p-8 text-gray-900 text-[12px] leading-relaxed">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-gray-900">
          <div>
            <img
              src="/logo-dsm.png"
              alt="Atelier DSM"
              className="h-14 object-contain mb-3"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <p className="font-bold text-[13px]">Atelier DSM</p>
            <p className="text-gray-600 text-[11px]">finance@atelierdsm.com</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-tight uppercase">
              {fr ? 'Soumission' : 'Quote'}
            </h1>
            <p className="text-[13px] font-semibold mt-1">
              {quote.quoteNumber || '—'}
            </p>
            <div className="mt-3 text-[11px] text-gray-600 space-y-0.5">
              <p>
                <span className="font-medium text-gray-500">{fr ? 'Date' : 'Date'}: </span>
                {fmtDate(quote.createdAt)}
              </p>
              {quote.expiresAt && (
                <p>
                  <span className="font-medium text-gray-500">{fr ? 'Expire' : 'Expires'}: </span>
                  {fmtDate(quote.expiresAt)}
                </p>
              )}
              {quote.qbEstimateId && (
                <p>
                  <span className="font-medium text-gray-500">QB: </span>#{quote.qbEstimateId}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bill-to */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              {fr ? 'Soumis à' : 'Bill To'}
            </p>
            <p className="font-semibold text-[13px]">{displayName}</p>
            {business?.companyName && business.companyName !== displayName && (
              <p className="text-gray-600">{business.companyName}</p>
            )}
            {client.name && displayName !== client.name && (
              <p className="text-gray-600">{fr ? 'Contact' : 'Contact'}: {client.name}</p>
            )}
            {client.email && <p className="text-gray-600">{client.email}</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              {fr ? 'Projet' : 'Project'}
            </p>
            <p className="font-semibold text-[13px]">{quote.project.name}</p>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full mt-8 border-collapse">
          <thead>
            <tr className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-700">
              <th className="text-left py-2 px-2 w-8">#</th>
              <th className="text-left py-2 px-2 w-24">{fr ? 'Date' : 'Date'}</th>
              <th className="text-left py-2 px-2 w-28">{fr ? 'Produit/Service' : 'Item'}</th>
              <th className="text-left py-2 px-2">Description</th>
              <th className="text-right py-2 px-2 w-12">{fr ? 'Qté' : 'Qty'}</th>
              <th className="text-right py-2 px-2 w-20">{fr ? 'Prix' : 'Price'}</th>
              <th className="text-right py-2 px-2 w-24">{fr ? 'Montant' : 'Amount'}</th>
              <th className="text-left py-2 px-2 w-20">{fr ? 'Taxe' : 'Tax'}</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, idx) => (
              <tr key={item.id} className="border-b border-gray-200 align-top">
                <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                <td className="py-2 px-2 text-gray-600 text-[11px]">
                  {item.serviceDate ? fmtDate(item.serviceDate) : '—'}
                </td>
                <td className="py-2 px-2 text-[11px]">{item.productService || '—'}</td>
                <td className="py-2 px-2 whitespace-pre-wrap">{item.description}</td>
                <td className="py-2 px-2 text-right">{item.quantity}</td>
                <td className="py-2 px-2 text-right">{fmtMoney(item.unitPrice)}</td>
                <td className="py-2 px-2 text-right font-medium">
                  {fmtMoney(item.quantity * item.unitPrice)}
                </td>
                <td className="py-2 px-2 text-[11px] text-gray-600">{item.taxCode || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-72 text-[12px]">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">{fr ? 'Total partiel' : 'Subtotal'}</span>
              <span className="font-medium">{fmtMoney(taxes.subtotal)}</span>
            </div>
            {Object.entries(taxes.breakdown).map(([name, amount]) => {
              let pct = '';
              for (const tc of taxCodes) {
                const rd = tc.rateDetails.find((r) => r.name === name);
                if (rd) { pct = `${rd.rate}\u00a0%`; break; }
              }
              return (
                <div key={name} className="flex justify-between py-1 text-gray-600">
                  <span>{name} {pct}</span>
                  <span>{fmtMoney(amount)}</span>
                </div>
              );
            })}
            <div className="flex justify-between py-2 border-t-2 border-gray-900 mt-1 font-bold text-[14px]">
              <span>Total</span>
              <span>{fmtMoney(taxes.total)}</span>
            </div>
          </div>
        </div>

        {/* Message */}
        {quote.quoteMessage && (
          <div className="mt-8 pt-4 border-t border-gray-200">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
              {fr ? 'Note' : 'Note'}
            </p>
            <p className="whitespace-pre-wrap text-gray-700 text-[11px] leading-relaxed">
              {quote.quoteMessage}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-gray-200 text-center text-[10px] text-gray-400">
          Atelier DSM &mdash; {fr ? 'Merci pour votre confiance.' : 'Thank you for your business.'}
        </div>
      </div>
    </div>
  );
}
