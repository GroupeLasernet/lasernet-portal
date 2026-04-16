'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

// ── Types ──
interface QBItem {
  id: string;
  name: string;
  fullName: string;
  type: string;
  description: string | null;
  unitPrice: number;
  qtyOnHand: number | null;
  sku: string | null;
  category: string | null;
  active: boolean;
}

interface QBAccount {
  id: string;
  name: string;
  fullName: string;
  type: string;
  subType: string;
  classification: string;
}

// ── Main page ──
export default function InventoryPage() {
  const { t } = useLanguage();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('settings', 'stockTitle')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('settings', 'stockDesc')}</p>
      </div>

      {/* Browse existing inventory */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{t('settings', 'stockBrowse')}</h2>
        </div>
        <InventoryBrowser t={t} />
      </div>

      {/* Add new stock item */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{t('settings', 'addStockTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('settings', 'addStockDesc')}</p>
        </div>
        <AddStockForm t={t} />
      </div>
    </div>
  );
}

// ── Inventory Browser ──
function InventoryBrowser({ t }: { t: (s: string, k: string) => string }) {
  const [items, setItems] = useState<QBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QBItem | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch('/api/quickbooks/status');
        const statusData = await statusRes.json();
        setConnected(statusData.connected ?? false);
      } catch {}
      try {
        const invRes = await fetch('/api/quickbooks/inventory');
        const invData = await invRes.json();
        if (invData.error) {
          setError(invData.error);
        }
        setItems(invData.items || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load inventory');
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="p-6">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {t('liveVisits', 'notConnected')}
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="p-6">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const filtered = search.trim()
    ? items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.sku && i.sku.toLowerCase().includes(search.toLowerCase())) ||
        (i.description && i.description.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  const detailRow = (label: string, value: string | number | null | undefined, fallback?: string) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-b-0">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 flex-1">{value !== null && value !== undefined && value !== '' ? String(value) : (fallback || '—')}</span>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex gap-4 min-h-[360px]">
        {/* Left: item list */}
        <div className="w-[280px] flex-shrink-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('settings', 'stockSearch')}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">{t('settings', 'stockNoItems')}</p>
            ) : (
              filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors ${
                    selectedItem?.id === item.id
                      ? 'bg-brand-50 border-l-2 border-l-brand-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${selectedItem?.id === item.id ? 'text-brand-700' : 'text-gray-800'}`}>
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {item.type}{item.sku ? ` · ${item.sku}` : ''}{item.qtyOnHand !== null ? ` · ${item.qtyOnHand} en stock` : ''}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</p>
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden">
          {selectedItem ? (
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-lg font-bold text-gray-900 flex-1">{selectedItem.name}</h4>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  selectedItem.type === 'Inventory' ? 'bg-blue-50 text-blue-700'
                    : selectedItem.type === 'Service' ? 'bg-purple-50 text-purple-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {selectedItem.type}
                </span>
              </div>

              {detailRow(t('settings', 'stockFieldFullName'), selectedItem.fullName)}
              {detailRow(t('settings', 'stockFieldType'), selectedItem.type)}
              {detailRow(t('settings', 'stockFieldSku'), selectedItem.sku)}
              {detailRow(t('settings', 'stockFieldPrice'), selectedItem.unitPrice !== 0 ? `$${selectedItem.unitPrice.toFixed(2)}` : null)}
              {detailRow(t('settings', 'stockFieldQty'), selectedItem.qtyOnHand)}
              {detailRow(t('settings', 'stockFieldCategory'), selectedItem.category)}
              {detailRow(t('settings', 'stockFieldDescription'), selectedItem.description)}
              {detailRow(t('settings', 'stockFieldActive'), selectedItem.active ? t('settings', 'stockYes') : t('settings', 'stockNo'))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-300">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm">{t('settings', 'stockSelectItem')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Stock Form ──
function AddStockForm({ t }: { t: (s: string, k: string) => string }) {
  const [itemType, setItemType] = useState<'Inventory' | 'NonInventory' | 'Service'>('Inventory');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [qtyOnHand, setQtyOnHand] = useState('0');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [assetAccountId, setAssetAccountId] = useState('');

  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [qbConnected, setQbConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch('/api/quickbooks/status');
        const statusData = await statusRes.json();
        setQbConnected(statusData.connected ?? false);
      } catch {}
      try {
        const accRes = await fetch('/api/quickbooks/accounts');
        const accData = await accRes.json();
        setAccounts(accData.accounts || []);
      } catch {}
      setLoadingAccounts(false);
    })();
  }, []);

  const incomeAccounts = accounts.filter(a => a.classification === 'Revenue' || a.type === 'Income');
  const expenseAccounts = accounts.filter(a =>
    a.type === 'Cost of Goods Sold' || a.classification === 'Expense' || a.type === 'Expense'
  );
  const assetAccounts = accounts.filter(a =>
    a.classification === 'Asset' || a.type === 'Other Current Asset'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/quickbooks/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: itemType,
          description: description.trim() || null,
          sku: sku.trim() || null,
          unitPrice: unitPrice ? parseFloat(unitPrice) : null,
          purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
          qtyOnHand: qtyOnHand ? parseInt(qtyOnHand, 10) : 0,
          incomeAccountId: incomeAccountId || null,
          expenseAccountId: expenseAccountId || null,
          assetAccountId: assetAccountId || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: `"${data.item?.name || name}" created in QuickBooks` });
        setName(''); setDescription(''); setSku(''); setUnitPrice(''); setPurchaseCost(''); setQtyOnHand('0');
      } else {
        setResult({ success: false, message: data.error || 'Failed to create item' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Network error' });
    }
    setSubmitting(false);
  };

  if (loadingAccounts) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (!qbConnected) {
    return (
      <div className="p-6">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {t('liveVisits', 'notConnected')}
        </div>
      </div>
    );
  }

  const isInventory = itemType === 'Inventory';

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">

      {/* Type selector */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('settings', 'stockType')}</label>
        <p className="text-xs text-gray-400 mb-2">{t('settings', 'stockTypeHint')}</p>
        <div className="flex gap-2">
          {(['Inventory', 'NonInventory', 'Service'] as const).map(tp => (
            <button
              key={tp}
              type="button"
              onClick={() => setItemType(tp)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                itemType === tp
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tp === 'Inventory' ? t('settings', 'stockInventory')
                : tp === 'NonInventory' ? t('settings', 'stockNonInventory')
                : t('settings', 'stockService')}
            </button>
          ))}
        </div>
      </div>

      {/* Name (required) */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockName')} *</label>
        <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockNameHint')}</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Ex: UR10e Cobot, Laser Head 50W..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockDescription')}</label>
        <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockDescHint')}</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Ex: Universal Robots UR10e collaborative robot arm with teach pendant"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
        />
      </div>

      {/* SKU + Prices row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockSku')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockSkuHint')}</p>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="UR10E-001"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockPrice')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockPriceHint')}</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockCost')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockCostHint')}</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Qty on hand — Inventory only */}
      {isInventory && (
        <div className="max-w-[200px]">
          <label className="block text-sm font-semibold text-gray-700 mb-1">{t('settings', 'stockQty')}</label>
          <p className="text-xs text-gray-400 mb-1.5">{t('settings', 'stockQtyHint')}</p>
          <input
            type="number"
            min="0"
            value={qtyOnHand}
            onChange={(e) => setQtyOnHand(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
      )}

      {/* QB Accounts */}
      <div className="border-t border-gray-100 pt-5">
        <p className="text-sm font-bold text-gray-700 mb-1">{t('settings', 'stockAccounts')}</p>
        <p className="text-xs text-gray-400 mb-4">{t('settings', 'stockAccountsHint')}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {t('settings', 'stockIncomeAccount')} {isInventory ? '*' : ''}
            </label>
            <p className="text-[11px] text-gray-400 mb-1">{t('settings', 'stockIncomeHint')}</p>
            <select
              value={incomeAccountId}
              onChange={(e) => setIncomeAccountId(e.target.value)}
              required={isInventory}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">{t('settings', 'stockSelectAccount')}</option>
              {incomeAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {t('settings', 'stockExpenseAccount')} {isInventory ? '*' : ''}
            </label>
            <p className="text-[11px] text-gray-400 mb-1">{t('settings', 'stockExpenseHint')}</p>
            <select
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
              required={isInventory}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">{t('settings', 'stockSelectAccount')}</option>
              {expenseAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </select>
          </div>

          {isInventory && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {t('settings', 'stockAssetAccount')} *
              </label>
              <p className="text-[11px] text-gray-400 mb-1">{t('settings', 'stockAssetHint')}</p>
              <select
                value={assetAccountId}
                onChange={(e) => setAssetAccountId(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              >
                <option value="">{t('settings', 'stockSelectAccount')}</option>
                {assetAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.fullName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Result message */}
      {result && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          result.success
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {result.message}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {submitting ? t('settings', 'stockCreating') : t('settings', 'stockCreate')}
      </button>
    </form>
  );
}
