'use client';

// ============================================================
// ReactQueryProvider — single QueryClient for the admin tree.
// ------------------------------------------------------------
// Mounted once inside /admin/layout.tsx above QuickBooksProvider,
// which is now built on top of @tanstack/react-query. Any future
// server-data cache (files, quotes, etc.) should piggy-back on
// this client via useQuery instead of hand-rolling a context.
//
// Defaults chosen to match the old QuickBooksContext behavior:
//   - 30s staleTime — matches the old "fetch once, revalidate
//     on the 60s interval" feel: a consumer that mounts within
//     30s of a refetch sees the cached data immediately.
//   - 5min gcTime — unmounted pages keep their data warm for
//     the common tab-switch pattern.
//   - refetchOnWindowFocus: true — NEW. Old context didn't do
//     this; React Query gives it for free and it's what users
//     expect after alt-tabbing away.
// ============================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  // Lazily construct so each admin session gets exactly one client.
  // React's strict-mode double-mount won't duplicate it thanks to useState.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
