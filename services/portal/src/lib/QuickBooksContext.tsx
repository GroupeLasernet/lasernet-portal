'use client';

// ============================================================
// QuickBooksContext — single source of truth for QB connection
// state AND cached QB data (invoices / customers / inventory /
// accounts / tax codes).
// ------------------------------------------------------------
// HISTORY
//   v1 — status only, 60s polling of /api/quickbooks/status.
//   v2 — added in-memory data cache: invoices/customers/inventory/
//        accounts/taxCodes. Each dataset is fetched once when the
//        provider mounts (if connected), then revalidated in the
//        background every 60s. Page components hydrate instantly
//        from context instead of firing their own fetch on mount.
//
// WHY
//   On Vercel every page mount used to fire its own QB fetch
//   (800-1500ms each). The provider now owns the network calls
//   and pages read from memory. Mutations call `invalidate(key)`
//   to force a fresh fetch.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

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

// ─── Internal cache slot ──────────────────────────────────────────────────

interface CacheSlot<T> {
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

// ─── Fetch definitions ────────────────────────────────────────────────────
// Each entry describes: the endpoint, the JSON field where the array lives,
// and an optional transform. Keeping it declarative so the refresh loop
// stays a one-liner.

interface FetchDef<T> {
  url: string;
  field: string;
  map?: (raw: unknown[]) => T[];
}

const FETCH_DEFS: Record<QBDataKey, FetchDef<unknown>> = {
  invoices:  { url: '/api/quickbooks/invoices',  field: 'invoices'  },
  customers: { url: '/api/quickbooks/customers', field: 'customers' },
  inventory: { url: '/api/quickbooks/inventory', field: 'items'     },
  accounts:  { url: '/api/quickbooks/accounts',  field: 'accounts'  },
  taxCodes:  { url: '/api/quotes/qb-tax-codes',  field: 'taxCodes'  },
};

// ─── Provider ─────────────────────────────────────────────────────────────

export function QuickBooksProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<QbStatus>('loading');
  const [realmId, setRealmId] = useState<string | null>(null);
  const [missingCredentials, setMissingCredentials] = useState<string[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const [invoices, setInvoices] = useState<CacheSlot<QBInvoice>>(emptySlot);
  const [customers, setCustomers] = useState<CacheSlot<QBCustomer>>(emptySlot);
  const [inventory, setInventory] = useState<CacheSlot<QBInventoryItem>>(emptySlot);
  const [accounts, setAccounts] = useState<CacheSlot<QBAccount>>(emptySlot);
  const [taxCodes, setTaxCodes] = useState<CacheSlot<QBTaxCode>>(emptySlot);

  const setters: Record<QBDataKey, React.Dispatch<React.SetStateAction<CacheSlot<any>>>> = useMemo(
    () => ({
      invoices:  setInvoices  as React.Dispatch<React.SetStateAction<CacheSlot<any>>>,
      customers: setCustomers as React.Dispatch<React.SetStateAction<CacheSlot<any>>>,
      inventory: setInventory as React.Dispatch<React.SetStateAction<CacheSlot<any>>>,
      accounts:  setAccounts  as React.Dispatch<React.SetStateAction<CacheSlot<any>>>,
      taxCodes:  setTaxCodes  as React.Dispatch<React.SetStateAction<CacheSlot<any>>>,
    }),
    [],
  );

  const mountedRef = useRef(true);
  const statusRef = useRef<QbStatus>('loading');

  // Keep a ref to latest status so the interval closure reads fresh values.
  useEffect(() => { statusRef.current = status; }, [status]);

  // ─── Connection refresh ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/status', { cache: 'no-store' });
      if (!mountedRef.current) return;
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = await res.json();
      if (!mountedRef.current) return;
      setRealmId(data.realmId || null);
      setMissingCredentials(data.missingCredentials || []);
      if (!data.credentialsConfigured) setStatus('missing-creds');
      else if (data.connected) setStatus('connected');
      else setStatus('disconnected');
      setLastCheckedAt(Date.now());
    } catch {
      if (mountedRef.current) setStatus('error');
    }
  }, []);

  // ─── Connect (OAuth) ───────────────────────────────────────────────────
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

  // ─── Single-dataset fetcher ────────────────────────────────────────────
  const fetchSlot = useCallback(
    async (key: QBDataKey) => {
      const def = FETCH_DEFS[key];
      const setter = setters[key];
      setter((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(def.url, { cache: 'no-store' });
        if (!mountedRef.current) return;
        const data = await res.json();
        if (!mountedRef.current) return;
        const arr = Array.isArray(data[def.field]) ? data[def.field] : [];
        setter({
          data: arr,
          loading: false,
          source: data.source || '',
          error: null,
          fetchedAt: Date.now(),
        });
      } catch (err: any) {
        if (!mountedRef.current) return;
        setter((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || 'Failed to fetch',
        }));
      }
    },
    [setters],
  );

  // ─── Load/refresh all datasets ────────────────────────────────────────
  const refreshAllData = useCallback(async () => {
    // Fire in parallel — each endpoint is independent.
    await Promise.all([
      fetchSlot('invoices'),
      fetchSlot('customers'),
      fetchSlot('inventory'),
      fetchSlot('accounts'),
      fetchSlot('taxCodes'),
    ]);
  }, [fetchSlot]);

  const invalidate = useCallback(
    async (key: QBDataKey) => {
      await fetchSlot(key);
    },
    [fetchSlot],
  );

  const invalidateAll = useCallback(async () => {
    await refreshAllData();
  }, [refreshAllData]);

  // ─── Lifecycle: initial fetch + 60s poll ──────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const statusId = setInterval(refresh, 60_000);
    return () => {
      mountedRef.current = false;
      clearInterval(statusId);
    };
  }, [refresh]);

  // When connection becomes available, kick off the data prefetch, then
  // revalidate every 60 s in the background. Stops polling if the status
  // changes to disconnected / missing-creds / error.
  useEffect(() => {
    if (status !== 'connected') return;
    void refreshAllData();
    const dataId = setInterval(() => {
      if (statusRef.current === 'connected') void refreshAllData();
    }, 60_000);
    return () => clearInterval(dataId);
  }, [status, refreshAllData]);

  // ─── Value ─────────────────────────────────────────────────────────────
  const value = useMemo<QuickBooksContextValue>(
    () => ({
      status, realmId, missingCredentials, lastCheckedAt, refresh, connect,
      invoices, customers, inventory, accounts, taxCodes,
      invalidate, invalidateAll,
    }),
    [
      status, realmId, missingCredentials, lastCheckedAt, refresh, connect,
      invoices, customers, inventory, accounts, taxCodes,
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
