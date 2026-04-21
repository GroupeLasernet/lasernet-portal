'use client';

// ============================================================
// SkuPicker — multi-select autocomplete for QuickBooks inventory
// items, sourced from the already-cached QuickBooksContext (no
// extra network per keystroke).
// ------------------------------------------------------------
// Behavior (per feedback_business_link_autocomplete.md):
//   • Always surfaces 4–5 proactive fuzzy matches as the user types.
//   • No "hit Enter" — clicking a suggestion adds it.
//   • Chip row shows what's currently linked; clicking a chip
//     removes that SKU. Blank suggestions on empty input.
// ------------------------------------------------------------
// Used by EditDocumentModal + VideoModal so Hugo can attribute a
// file/video to many SKUs. Downstream, the quote/invoice UI uses
// /api/files/by-sku to surface those files on line items.
// ============================================================

import { useMemo, useState } from 'react';
import { useQuickBooks } from '@/lib/QuickBooksContext';
import { topFuzzyMatches } from '@/lib/fuzzy';
import type { QBInventoryItem } from '@/lib/QuickBooksContext';

export interface SkuPickerValue {
  skuIds: string[];
  skuNames: (string | null)[];
}

export function SkuPicker({
  value,
  onChange,
  placeholder = 'Search SKUs…',
}: {
  value: SkuPickerValue;
  onChange: (next: SkuPickerValue) => void;
  placeholder?: string;
}) {
  const { inventory } = useQuickBooks();
  const [query, setQuery] = useState('');

  // Filter out already-selected + inactive items before ranking.
  const candidates = useMemo(() => {
    const selected = new Set(value.skuIds);
    return (inventory.data as QBInventoryItem[]).filter(
      (i) => !selected.has(i.id) && i.active !== false,
    );
  }, [inventory.data, value.skuIds]);

  // Surface 5 fuzzy matches as the user types. Score against
  // display name, fullName, and the SKU code itself so any of
  // those keystrokes land a hit.
  const suggestions = useMemo(() => {
    return topFuzzyMatches<QBInventoryItem>(
      query,
      candidates,
      [(i) => i.name, (i) => i.fullName ?? null, (i) => i.sku],
      { limit: 5, minScore: 0.15, minFallback: 5 },
    );
  }, [query, candidates]);

  const addSku = (item: QBInventoryItem) => {
    if (value.skuIds.includes(item.id)) return;
    onChange({
      skuIds: [...value.skuIds, item.id],
      skuNames: [...value.skuNames, item.name],
    });
    setQuery('');
  };

  const removeSku = (skuId: string) => {
    const idx = value.skuIds.indexOf(skuId);
    if (idx === -1) return;
    const nextIds = [...value.skuIds];
    const nextNames = [...value.skuNames];
    nextIds.splice(idx, 1);
    nextNames.splice(idx, 1);
    onChange({ skuIds: nextIds, skuNames: nextNames });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Selected SKU chips */}
      {value.skuIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.skuIds.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => removeSku(id)}
              className="group flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-900 hover:bg-red-100 hover:text-red-900 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-red-900/40 dark:hover:text-red-100"
              title="Remove"
            >
              <span>{value.skuNames[i] || id}</span>
              <span className="opacity-40 group-hover:opacity-100">×</span>
            </button>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="input-field"
      />

      {/* Fuzzy suggestions — only rendered while the user is typing. */}
      {query.trim().length > 0 && suggestions.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {suggestions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => addSku(item)}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                <span className="truncate text-gray-900 dark:text-gray-100">
                  {item.name}
                </span>
                {item.sku && (
                  <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {item.sku}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {inventory.loading && value.skuIds.length === 0 && query === '' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading SKUs…</p>
      )}
      {!inventory.loading && inventory.data.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No QuickBooks inventory available — connect QB in Settings.
        </p>
      )}
    </div>
  );
}
