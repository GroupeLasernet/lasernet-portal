'use client';

// ============================================================
// QuickBooksContext — single source of truth for QB connection state.
// ------------------------------------------------------------
// BEFORE: two different components inferred QB state from two
// different endpoints. The sidebar chip hit `/api/quickbooks/status`
// (does the DB have tokens?) while the quotes page hit
// `/api/quotes/qb-tax-codes` (can we actually fetch tax codes right now?)
// — and they could disagree (e.g. tokens exist but the query failed).
//
// NOW: one provider at the admin layout level polls `/api/quickbooks/status`
// every 60 s and publishes `{ status, realmId, refresh, connect }`.
// Any component that needs to know connection state reads `useQuickBooks()`.
// The quotes page stays green-lit whenever the DB has live tokens;
// a tax-code fetch failure is shown as a *data* error, not a connection error.
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

export type QbStatus =
  | 'loading'
  | 'connected'
  | 'disconnected'
  | 'missing-creds'
  | 'error';

interface QuickBooksContextValue {
  status: QbStatus;
  realmId: string | null;
  missingCredentials: string[];
  lastCheckedAt: number | null;
  /** Re-fetch /api/quickbooks/status now (e.g. after completing OAuth). */
  refresh: () => Promise<void>;
  /** Start the OAuth flow. Redirects the current window to Intuit. */
  connect: () => Promise<void>;
}

const QuickBooksContext = createContext<QuickBooksContextValue | null>(null);

export function QuickBooksProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<QbStatus>('loading');
  const [realmId, setRealmId] = useState<string | null>(null);
  const [missingCredentials, setMissingCredentials] = useState<string[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

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

  const connect = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/connect', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.authUrl) {
        // Surface a minimal alert — admin-only UI, full errors go to console
        console.error('QuickBooks connect failed', data);
        alert(data.error || 'Could not start QuickBooks connection.');
        return;
      }
      // Full-page redirect to Intuit consent screen
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('QuickBooks connect error', err);
      alert('Could not start QuickBooks connection.');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  const value = useMemo<QuickBooksContextValue>(
    () => ({ status, realmId, missingCredentials, lastCheckedAt, refresh, connect }),
    [status, realmId, missingCredentials, lastCheckedAt, refresh, connect],
  );

  return <QuickBooksContext.Provider value={value}>{children}</QuickBooksContext.Provider>;
}

/** Read QuickBooks connection state. Must be used inside a QuickBooksProvider. */
export function useQuickBooks(): QuickBooksContextValue {
  const ctx = useContext(QuickBooksContext);
  if (!ctx) {
    // Return a safe fallback so pages render even if the provider wasn't mounted
    // (e.g. during a server render); the real admin layout always supplies it.
    return {
      status: 'loading',
      realmId: null,
      missingCredentials: [],
      lastCheckedAt: null,
      refresh: async () => {},
      connect: async () => {},
    };
  }
  return ctx;
}

/** Derived helper: treat only 'connected' as "good to hit QB". */
export function isQbLive(status: QbStatus): boolean {
  return status === 'connected';
}
