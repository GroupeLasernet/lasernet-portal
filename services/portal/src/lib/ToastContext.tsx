'use client';

// ============================================================
// ToastContext — minimal global toast/snackbar for save feedback.
//
// Usage anywhere in the client tree:
//   const { toast } = useToast();
//   toast.saved();               // "Enregistré" / "Saved"
//   toast.success('Projet créé');
//   toast.error('Échec');
//   toast.info('Message');
//
// Mounted once in app/layout.tsx inside LanguageProvider.
// Added 2026-04-20.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLanguage } from './LanguageContext';

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Default "Saved" confirmation — use after successful save/update. */
  saved: (message?: string) => void;
};

const ToastContext = createContext<{ toast: ToastApi } | null>(null);

const DEFAULT_TTL = 2500;
const ERROR_TTL = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setItems((list) => [...list, { id, kind, message }]);
      const ttl = kind === 'error' ? ERROR_TTL : DEFAULT_TTL;
      window.setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
      saved: (m) => push('success', m || (lang === 'fr' ? 'Enregistré' : 'Saved')),
    }),
    [push, lang],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const color =
    item.kind === 'success'
      ? 'bg-emerald-600 text-white'
      : item.kind === 'error'
        ? 'bg-rose-600 text-white'
        : 'bg-slate-800 text-white';
  const icon =
    item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : 'ℹ';
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5 shadow-lg ring-1 ring-black/10 transition-all ${color} animate-toast-in`}
      style={{ minWidth: 200, maxWidth: 420 }}
    >
      <span
        aria-hidden
        className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/20 text-xs font-bold"
      >
        {icon}
      </span>
      <span className="text-sm font-medium">{item.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="ml-auto text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe fallback — won't crash if a component using useToast is
    // rendered outside the provider (e.g. in a test).
    const noop = () => {};
    return {
      toast: { success: noop, error: noop, info: noop, saved: noop } as ToastApi,
    };
  }
  return ctx;
}
