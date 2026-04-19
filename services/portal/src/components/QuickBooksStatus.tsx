'use client';

// ============================================================
// QuickBooksStatus — sidebar chip showing current QB connection state.
// ------------------------------------------------------------
// Consumes `QuickBooksContext` (single source of truth). When the
// state is disconnected or missing-creds, the chip flashes and a
// Connect button appears inline. Clicking Connect starts the OAuth
// flow; clicking the rest of the chip navigates to /admin/businesses.
// Admin sidebar only.
// ============================================================

import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { useQuickBooks, type QbStatus } from '@/lib/QuickBooksContext';

export default function QuickBooksStatus() {
  const router = useRouter();
  const { t } = useLanguage();
  const { status, connect } = useQuickBooks();

  const needsAttention = status === 'disconnected' || status === 'missing-creds';

  const styles: Record<
    QbStatus,
    { dot: string; text: string; bg: string; ring: string; labelKey: 'qbChecking' | 'qbConnected' | 'qbDisconnected' | 'qbNotConfigured' | 'qbUnavailable' }
  > = {
    loading: {
      dot: 'bg-gray-300 dark:bg-gray-600 animate-pulse',
      text: 'text-gray-500 dark:text-gray-400',
      bg: 'hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700',
      ring: '',
      labelKey: 'qbChecking',
    },
    connected: {
      dot: 'bg-green-500',
      text: 'text-green-700 dark:text-green-400',
      bg: 'hover:bg-green-50 dark:hover:bg-green-900/30 border-gray-200 dark:border-gray-700',
      ring: '',
      labelKey: 'qbConnected',
    },
    disconnected: {
      dot: 'bg-red-500',
      text: 'text-red-700 dark:text-red-400',
      bg: 'bg-red-50/60 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border-red-300 dark:border-red-700',
      ring: 'qb-flash-ring',
      labelKey: 'qbDisconnected',
    },
    'missing-creds': {
      dot: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50/60 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-amber-300 dark:border-amber-700',
      ring: 'qb-flash-ring-amber',
      labelKey: 'qbNotConfigured',
    },
    error: {
      dot: 'bg-gray-400 dark:bg-gray-500',
      text: 'text-gray-500 dark:text-gray-400',
      bg: 'hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700',
      ring: '',
      labelKey: 'qbUnavailable',
    },
  };
  const s = styles[status];

  return (
    <div className={`relative rounded-lg ${s.ring}`}>
      <div className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border transition-colors ${s.bg}`}>
        <button
          type="button"
          onClick={() => router.push('/admin/businesses')}
          title={t('nav', 'clientDataServerTitle')}
          className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300 min-w-0 flex-1 text-left"
        >
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.657 3.582 3 8 3s8-1.343 8-3V5" />
            <path d="M4 11v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" />
          </svg>
          <span className="truncate">{t('nav', 'clientDataServer')}</span>
        </button>

        <span className={`flex items-center gap-1.5 ${s.text} flex-shrink-0`}>
          <span className={`w-2 h-2 rounded-full ${s.dot} ${needsAttention ? 'animate-pulse' : ''}`} />
          {needsAttention ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void connect(); }}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold text-white transition-colors ${
                status === 'missing-creds'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {t('nav', 'qbConnectAction')}
            </button>
          ) : (
            <span>{t('nav', s.labelKey)}</span>
          )}
        </span>
      </div>

      {/* Flash animation — a pulsing ring for attention when disconnected.
          Scoped via classes so it doesn't bleed into other components. */}
      <style>{`
        .qb-flash-ring { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); animation: qbFlash 1.8s ease-out infinite; }
        .qb-flash-ring-amber { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55); animation: qbFlashAmber 1.8s ease-out infinite; }
        @keyframes qbFlash {
          0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
          70%  { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes qbFlashAmber {
          0%   { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55); }
          70%  { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
      `}</style>
    </div>
  );
}
