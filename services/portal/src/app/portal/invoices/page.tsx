'use client';

import { useEffect, useState } from 'react';
import { mockInvoices, mockQuotes, type Invoice, type Quote } from '@/lib/mock-data';
import PageHeader from '@/components/PageHeader';

export default function ClientInvoicesPage() {
  const [userId, setUserId] = useState<string>('');
  const [tab, setTab] = useState<'invoices' | 'quotes'>('invoices');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUserId(data.user?.userId || ''));
  }, []);

  const myInvoices = mockInvoices.filter(i => i.clientId === userId);
  const myQuotes = mockQuotes.filter(q => q.clientId === userId);

  return (
    <div>
      <PageHeader title="Invoices & Quotes" subtitle="View your invoices and quotes from LaserNet" />

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit mb-6">
        <button
          onClick={() => setTab('invoices')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'invoices' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Invoices ({myInvoices.length})
        </button>
        <button
          onClick={() => setTab('quotes')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'quotes' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Quotes ({myQuotes.length})
        </button>
      </div>

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <div>
          {myInvoices.length > 0 ? (
            <div className="space-y-3">
              {myInvoices.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className="card flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      inv.status === 'paid' ? 'bg-green-50 text-green-600' :
                      inv.status === 'overdue' ? 'bg-red-50 text-red-600' :
                      'bg-yellow-50 text-yellow-600'
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{inv.invoiceNumber}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Issued {inv.date} • Due {inv.dueDate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">${inv.amount.toLocaleString()}</p>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                      inv.status === 'overdue' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No invoices yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Quotes Tab */}
      {tab === 'quotes' && (
        <div>
          {myQuotes.length > 0 ? (
            <div className="space-y-3">
              {myQuotes.map(quote => (
                <div
                  key={quote.id}
                  onClick={() => setSelectedQuote(quote)}
                  className="card flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      quote.status === 'accepted' ? 'bg-green-50 text-green-600' :
                      quote.status === 'declined' ? 'bg-red-50 text-red-600' :
                      'bg-blue-50 text-blue-600'
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{quote.quoteNumber}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Created {quote.date} • Valid until {quote.validUntil}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">${quote.amount.toLocaleString()}</p>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      quote.status === 'accepted' ? 'bg-green-100 text-green-700' :
                      quote.status === 'declined' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No quotes yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedInvoice(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{selectedInvoice.invoiceNumber}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">From QuickBooks</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {/* Invoice Header */}
              <div className="flex justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Bill To</p>
                  <p className="font-medium">{selectedInvoice.clientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Date: {selectedInvoice.date}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Due: {selectedInvoice.dueDate}</p>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium mt-1 inline-block ${
                    selectedInvoice.status === 'paid' ? 'bg-green-100 text-green-700' :
                    selectedInvoice.status === 'overdue' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedInvoice.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Line Items */}
              <table className="w-full mb-6">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-center pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-right pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Rate</th>
                    <th className="text-right pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedInvoice.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-3 text-sm">{item.description}</td>
                      <td className="py-3 text-sm text-center">{item.quantity}</td>
                      <td className="py-3 text-sm text-right">${item.rate.toLocaleString()}</td>
                      <td className="py-3 text-sm text-right font-medium">${item.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold">${selectedInvoice.amount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Detail Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedQuote(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{selectedQuote.quoteNumber}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">From QuickBooks</p>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="flex justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Prepared For</p>
                  <p className="font-medium">{selectedQuote.clientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Date: {selectedQuote.date}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Valid Until: {selectedQuote.validUntil}</p>
                </div>
              </div>
              <table className="w-full mb-6">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-center pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="text-right pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Rate</th>
                    <th className="text-right pb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedQuote.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-3 text-sm">{item.description}</td>
                      <td className="py-3 text-sm text-center">{item.quantity}</td>
                      <td className="py-3 text-sm text-right">${item.rate.toLocaleString()}</td>
                      <td className="py-3 text-sm text-right font-medium">${item.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold">${selectedQuote.amount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
