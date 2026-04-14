'use client';

// ============================================================
// QuickBooksStatus — small chip showing current QB connection state.
// Fetches /api/quickbooks/status on mount and refreshes every 60s.
// Clicking it jumps to /admin/clients where the connect button lives.
// Admin sidebar only.
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type QbState = 'loading' | 'connected' | 'disconnected' | 'missing-creds' | 'error';

export default function QuickBooksStatus() {
  const [state, setState] = useState<QbState>('loading');
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/quickbooks/status', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (!data.credentialsConfigured) setState('missing-creds');
        else if (data.connected) setState('connected');
        else setState('disconnected');
      } catch {
        if (!cancelled) setState('error');
      }
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const styles: Record<QbState, { dot: string; text: string; bg: string; label: string }> = {
    loading:         { dot: 'bg-gray-300 animate-pulse', text: 'text-gray-500', bg: 'hover:bg-gray-50',    label: 'Checking…' },
    connected:       { dot: 'bg-green-500',              text: 'text-green-700', bg: 'hover:bg-green-50',  label: 'Connected' },
    disconnected:    { dot: 'bg-red-500',                text: 'text-red-700',   bg: 'hover:bg-red-50',    label: 'Not connected' },
    'missing-creds': { dot: 'bg-amber-500',              text: 'text-amber-700', bg: 'hover:bg-amber-50',  label: 'Not configured' },
    error:           { dot: 'bg-gray-400',               text: 'text-gray-500',  bg: 'hover:bg-gray-50',   label: 'Unavailable' },
  };
  const s = styles[state];

  return (
    <button
      type="button"
      onClick={() => router.push('/admin/clients')}
      title="Go to client data server connection"
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border border-gray-200 transition-colors ${s.bg}`}
    >
      <span className="flex items-center gap-2 font-medium text-gray-700">
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.657 3.582 3 8 3s8-1.343 8-3V5" />
          <path d="M4 11v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" />
        </svg>
        Clients&rsquo; data server
      </span>
      <span className={`flex items-center gap-1.5 ${s.text}`}>
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        {s.label}
      </span>
    </button>
  );
}
