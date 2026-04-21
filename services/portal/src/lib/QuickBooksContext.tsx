'use client';

// ============================================================
// QuickBooksContext — single source of truth for QB connection
// state AND cached QB data (invoices / customers / inventory /
// accounts / tax codes).
// ------------------------------------------------------------
// HISTORY
//   v1 — status only, 60s polling of /api/quickbooks/status.
//   v2 — added in-memory data cache: invoices/customers/inventory/
//        accounts/taxCodes. Each dataset fetched once when the
//        provider mounted (if connected), then revalidated every
//        60s via setInterval. Manual setState + useRef plumbing.
//   v3 — internals rewritten on top of @tanstack/react-query
//        (Phase 3, 2026-04-21). Public API unchanged so every
//        consumer (`qb.invoices.data`, `qb.invalidate('inventory')`,
//        `qb.status === 'connected'`, …) keeps working. Benefits:
//          - request dedup when two pages mount at once
//          - refetch on window focus
//          - DevTools introspection
//          - ~150 fewer lines of custom cache plumbing
//
// WHY KEEP THE CONTEXT
//   Consumers read from a single shared state (e.g. inventory
//   shown on /admin/inventory, /admin/quotes, /admin/leads,
//   /admin/live-visits). The context + derived `CacheSlot` shape
//   preserves the exact field names (`data`, `loading`, `source`,
//   `error`, `fetchedAt`) pages already consume — the migration
//   is a pure internal refactor.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

// ─── Connection types ──────────────────────────────────────────────────────

export type QbStatus =
  | 'loading'
  | 'connected'
  | 'disconnected'
  | 'missing-creds'
  | 'error';

// ─── Data types (shape after server transform) ────────────────────────────

export interface QBInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  balance: number;
  status: 'paid' | 'unpaid' | 'overdue';
  date: string;
  dueDate: string;
  items: Array<{
    /** QB Item.Id — matches FileAssetSku.skuId for the related-files chip. */
    itemId?: string | null;
    description: string;
    model: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

export interface QBCustomer {
  id: string;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
}

// Shape from /api/quickbooks/inventory — already lowercased by the route.
export interface QBInventoryItem {
  id: string;
  name: string;
  fullName?: string;
  type: string; // 'Inventory' | 'NonInventory' | 'Service' | 'Category'
  description: string | null;
  unitPrice: number;
  qtyOnHand: number | null;
  sku: string | null;
  category: string | null;
  active: boolean;
  [key: string]: unknown;
}

// Shape from /api/quickbooks/accounts — already lowercased by the route.
export interface QBAccount {
  id: string;
  name: string;
  fullName?: string;
  type: string;
  subType?: string;
  classification?: string;
  [key: string]: unknown;
}

// Shape from /api/quotes/qb-tax-codes — already lowercase + enriched with
// totalRate (sum of component rates) and rateDetails (per-component breakdown).
export interface QBTaxCode {
  id: string;
  name: string;
  description?: string;
  taxable?: boolean;
  totalRate: number;
  rateDetails: { name: string; rate: number }[];
  [key: string]: unknown;
}

// ─── Public slot shape — stable across v2/v3 ──────────────────────────────

export interface CacheSlot<T> {
  data: T[];
  loading: boolean;
  source: string; // 'quickbooks' | 'cache' | 'mock' | ''
  error: string | null;
  fetchedAt: number | null;
}

const emptySlot = <T,>(): CacheSlot<T> => ({
  data: [],
  loading: false,
  source: '',
  error: null,
  fetchedAt: null,
});

// ─── Context value ────────────────────────────────────────────────────────

export type QBDataKey = 'invoices' | 'customers' | 'inventory' | 'accounts' | 'taxCodes';

interface QuickBooksContextValue {
  // Connection
  status: QbStatus;
  realmId: string | null;
  missingCredentials: string[];
  lastCheckedAt: number | null;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;

  // Data cache
  invoices: CacheSlot<QBInvoice>;
  customers: CacheSlot<QBCustomer>;
  inventory: CacheSlot<QBInventoryItem>;
  accounts: CacheSlot<QBAccount>;
  taxCodes: CacheSlot<QBTaxCode>;

  /** Force a refetch of a single dataset. Returns when complete. */
  invalidate: (key: QBDataKey) => Promise<void>;
  /** Force a refetch of everything. */
  invalidateAll: () => Promise<void>;
}

const QuickBooksContext = createContext<QuickBooksContextValue | null>(null);

// ─── Query keys (exported for tests + extension) ──────────────────────────

export const qbKeys = {
  all: ['qb'] as const,
  status: ['qb', 'status'] as const,
  dataset: (key: QBDataKey) => ['qb', key] as const,
};

// ─── Fetchers ─────────────────────────────────────────────────────────────

interface StatusPayload {
  connected: boolean;
  credentialsConfigured: boolean;
  missingCredentials?: string[];
  realmId?: string | null;
}

async function fetchStatus(): Promise<StatusPayload> {
  const res = await fetch('/api/quickbooks/status', { cache: 'no-store' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

interface FetchDef {
  url: string;
  field: string;
}
const FETCH_DEFS: Record<QBDataKey, FetchDef> = {
  invoices:  { url: '/api/quickbooks/invoices',  field: 'invoices'  },
  customers: { url: '/api/quickbooks/customers', field: 'customers' },
  inventory: { url: '/api/quickbooks/inventory', field: 'items'     },
  accounts:  { url: '/api/quickbooks/accounts',  field: 'accounts'  },
  taxCodes:  { url: '/api/quotes/qb-tax-codes',  field: 'taxCodes'  },
};

interface DatasetPayload<T> {
  rows: T[];
  source: string;
}

async function fetchDataset<T>(key: QBDataKey): Promise<DatasetPayload<T>> {
  const def = FETCH_DEFS[key];
  const res = await fetch(def.url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  const rows = Array.isArray(json[def.field]) ? (json[def.field] as T[]) : [];
  const source = typeof json.source === 'string' ? json.source : '';
  return { rows, source };
}

// ─── Query → CacheSlot adapter ────────────────────────────────────────────
// Keeps the v2 field names so no consumer file has to change.

function toSlot<T>(q: UseQueryResult<DatasetPayload<T>, Error>): CacheSlot<T> {
  return {
    data: q.data?.rows ?? [],
    // `isFetching` covers both first-load and background revalidation —
    // matches v2 semantics where the setter flipped `loading: true` on
    // every fetch start.
    loading: q.isFetching,
    source: q.data?.source ?? '',
    error: q.error ? q.error.message : null,
    fetchedAt: q.dataUpdatedAt > 0 ? q.dataUpdatedAt : null,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────

export function QuickBooksProvider({ children }: { children: ReactNode }) {
  // Connection — polls every 60s, always enabled.
  const statusQuery = useQuery({
    queryKey: qbKeys.status,
    queryFn: fetchStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const status: QbStatus = (() => {
    if (statusQuery.isError) return 'error';
    if (!statusQuery.data) return 'loading';
    if (!statusQuery.data.credentialsConfigured) return 'missing-creds';
    return statusQuery.data.connected ? 'connected' : 'disconnected';
  })();

  const realmId = statusQuery.data?.realmId ?? null;
  const missingCredentials = useMemo(
    () => statusQuery.data?.missingCredentials ?? [],
    [statusQuery.data?.missingCredentials],
  );
  const lastCheckedAt = statusQuery.dataUpdatedAt > 0 ? statusQuery.dataUpdatedAt : null;

  // Data — enabled only while connected. When status flips to connected,
  // React Query kicks off the initial fetch + revalidates every 60s.
  const connected = status === 'connected';
  const datasetOpts = {
    enabled: connected,
    refetchInterval: connected ? 60_000 : (false as const),
    staleTime: 30_000,
  };

  const invoicesQuery = useQuery({
    queryKey: qbKeys.dataset('invoices'),
    queryFn: () => fetchDataset<QBInvoice>('invoices'),
    ...datasetOpts,
  });
  const customersQuery = useQuery({
    queryKey: qbKeys.dataset('customers'),
    queryFn: () => fetchDataset<QBCustomer>('customers'),
    ...datasetOpts,
  });
  const inventoryQuery = useQuery({
    queryKey: qbKeys.dataset('inventory'),
    queryFn: () => fetchDataset<QBInventoryItem>('inventory'),
    ...datasetOpts,
  });
  const accountsQuery = useQuery({
    queryKey: qbKeys.dataset('accounts'),
    queryFn: () => fetchDataset<QBAccount>('accounts'),
    ...datasetOpts,
  });
  const taxCodesQuery = useQuery({
    queryKey: qbKeys.dataset('taxCodes'),
    queryFn: () => fetchDataset<QBTaxCode>('taxCodes'),
    ...datasetOpts,
  });

  const queryClient = useQueryClient();

  // ─── Imperative API ────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: qbKeys.status });
  }, [queryClient]);

  const connect = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/connect', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.authUrl) {
        console.error('QuickBooks connect failed', data);
        alert(data.error || 'Could not start QuickBooks connection.');
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('QuickBooks connect error', err);
      alert('Could not start QuickBooks connection.');
    }
  }, []);

  const invalidate = useCallback(
    async (key: QBDataKey) => {
      await queryClient.invalidateQueries({ queryKey: qbKeys.dataset(key) });
    },
    [queryClient],
  );

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: qbKeys.all });
  }, [queryClient]);

  // ─── Slots (memoized per-query so reference stays stable across renders
  // where the underlying query hasn't changed). ──────────────────────────

  const invoicesSlot  = useMemo(() => toSlot(invoicesQuery),  [invoicesQuery]);
  const customersSlot = useMemo(() => toSlot(customersQuery), [customersQuery]);
  const inventorySlot = useMemo(() => toSlot(inventoryQuery), [inventoryQuery]);
  const accountsSlot  = useMemo(() => toSlot(accountsQuery),  [accountsQuery]);
  const taxCodesSlot  = useMemo(() => toSlot(taxCodesQuery),  [taxCodesQuery]);

  const value = useMemo<QuickBooksContextValue>(
    () => ({
      status,
      realmId,
      missingCredentials,
      lastCheckedAt,
      refresh,
      connect,
      invoices:  invoicesSlot,
      customers: customersSlot,
      inventory: inventorySlot,
      accounts:  accountsSlot,
      taxCodes:  taxCodesSlot,
      invalidate,
      invalidateAll,
    }),
    [
      status, realmId, missingCredentials, lastCheckedAt, refresh, connect,
      invoicesSlot, customersSlot, inventorySlot, accountsSlot, taxCodesSlot,
      invalidate, invalidateAll,
    ],
  );

  return <QuickBooksContext.Provider value={value}>{children}</QuickBooksContext.Provider>;
}

// ─── Consumer hooks ───────────────────────────────────────────────────────

/** Read QuickBooks connection state. Must be used inside a QuickBooksProvider. */
export function useQuickBooks(): QuickBooksContextValue {
  const ctx = useContext(QuickBooksContext);
  if (!ctx) {
    // Safe fallback so pages render even if the provider wasn't mounted
    // (e.g. during SSR); the real admin layout always supplies it.
    const empty = emptySlot<never>();
    return {
      status: 'loading',
      realmId: null,
      missingCredentials: [],
      lastCheckedAt: null,
      refresh: async () => {},
      connect: async () => {},
      invoices: empty as CacheSlot<QBInvoice>,
      customers: empty as CacheSlot<QBCustomer>,
      inventory: empty as CacheSlot<QBInventoryItem>,
      accounts: empty as CacheSlot<QBAccount>,
      taxCodes: empty as CacheSlot<QBTaxCode>,
      invalidate: async () => {},
      invalidateAll: async () => {},
    };
  }
  return ctx;
}

// Typed shortcuts — nicer import ergonomics than `useQuickBooks().invoices`.
export const useQBInvoices  = () => useQuickBooks().invoices;
export const useQBCustomers = () => useQuickBooks().customers;
export const useQBInventory = () => useQuickBooks().inventory;
export const useQBAccounts  = () => useQuickBooks().accounts;
export const useQBTaxCodes  = () => useQuickBooks().taxCodes;

/** Derived helper: treat only 'connected' as "good to hit QB". */
export function isQbLive(status: QbStatus): boolean {
  return status === 'connected';
}
