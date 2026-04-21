'use client';

// ============================================================
// ContainerMenu — reusable three-dot kebab menu for a container
// header (e.g. Documents / Vidéos on /admin/files).
//
// Keeps its own open/closed state. Closes on Escape, on click
// outside the button + menu, and after an item is clicked.
// Items are plain data: each is either a real action or a
// divider. A `checked` flag renders a ✓ to the left of the
// label (used to indicate the active sort).
//
// Rendered inline (relative positioning). The menu is absolute-
// positioned below-right of the button so the container header
// layout doesn't shift when opened.
// ============================================================

import { useEffect, useRef, useState } from 'react';

export type ContainerMenuItem =
  | { kind: 'divider' }
  | {
      kind: 'item';
      label: string;
      onClick: () => void;
      checked?: boolean;
    };

export function ContainerMenu({
  items,
  ariaLabel,
}: {
  items: ContainerMenuItem[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/40 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[14rem] rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 py-1"
        >
          {items.map((item, i) => {
            if (item.kind === 'divider') {
              return (
                <div
                  key={`div-${i}`}
                  className="my-1 border-t border-gray-100 dark:border-gray-700"
                />
              );
            }
            return (
              <button
                key={`it-${i}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60"
              >
                <span className="w-4 text-brand-600 dark:text-brand-300">
                  {item.checked ? '✓' : ''}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
