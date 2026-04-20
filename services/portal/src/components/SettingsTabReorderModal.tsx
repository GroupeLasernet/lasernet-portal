'use client';

// ============================================================
// SettingsTabReorderModal — tiny pointer-drag reorder for the
// horizontal tab bar on /admin/settings. Same UX pattern as
// SidebarReorderModal (drag handle, bouncy-scale, position
// number) but flat (no children), and targets a separate
// localStorage key.
//
// Added 2026-04-20 at Hugo's request — he wants the settings
// tab order customizable the same way the sidebar is.
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

const STORAGE_KEY = 'prisma_settings_tab_order';

export interface SettingsTabItem {
  key: string;
  label: string;
}

export function loadSettingsTabOrder(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function applySettingsTabOrder<T extends { key: string }>(tabs: T[], order: string[] | null): T[] {
  if (!order || order.length === 0) return tabs;
  const byKey = new Map(tabs.map((t) => [t.key, t]));
  const ordered: T[] = [];
  for (const key of order) {
    const t = byKey.get(key);
    if (t) { ordered.push(t); byKey.delete(key); }
  }
  byKey.forEach((t) => ordered.push(t));
  return ordered;
}

interface DragState {
  idx: number;
  key: string;
  startY: number;
  currentY: number;
  rowHeight: number;
}

interface Props {
  open: boolean;
  tabs: SettingsTabItem[];
  onClose: () => void;
  onSave: (order: string[]) => void;
}

export default function SettingsTabReorderModal({ open, tabs, onClose, onSave }: Props) {
  const { t } = useLanguage();
  const [items, setItems] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (open) setItems(tabs.map((x) => x.key));
  }, [open, tabs]);

  const nameMap: Record<string, string> = {};
  tabs.forEach((x) => { nameMap[x.key] = x.label; });

  const reorder = (list: string[], from: number, to: number): string[] => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number, key: string) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const rowHeight = target.getBoundingClientRect().height + 6;
    const state: DragState = { idx, key, startY: e.clientY, currentY: e.clientY, rowHeight };
    dragRef.current = state;
    setDrag(state);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const dy = e.clientY - d.startY;
    const shift = Math.round(dy / d.rowHeight);
    if (shift !== 0) {
      setItems((list) => {
        const newIdx = Math.max(0, Math.min(list.length - 1, d.idx + shift));
        if (newIdx === d.idx) return list;
        const next = reorder(list, d.idx, newIdx);
        const st: DragState = {
          ...d,
          idx: newIdx,
          startY: d.startY + (newIdx - d.idx) * d.rowHeight,
          currentY: e.clientY,
        };
        dragRef.current = st;
        setDrag(st);
        return next;
      });
      return;
    }
    const next = { ...d, currentY: e.clientY };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    onSave(items);
    onClose();
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    onSave(tabs.map((x) => x.key));
    onClose();
  };

  if (!open) return null;

  const getOffset = (idx: number) => (drag && drag.idx === idx ? drag.currentY - drag.startY : 0);
  const isActive = (idx: number, key: string) => drag !== null && drag.idx === idx && drag.key === key;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {t('settings', 'reorderTabsTitle')}
              </h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                {t('settings', 'reorderTabsHint')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
            {items.map((key, idx) => {
              const active = isActive(idx, key);
              const offset = getOffset(idx);
              return (
                <div
                  key={key}
                  onPointerDown={(e) => handlePointerDown(e, idx, key)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    transform: active ? `translateY(${offset}px) scale(1.03)` : 'translateY(0) scale(1)',
                    zIndex: active ? 50 : 1,
                    transition: active ? 'none' : 'transform 0.25s cubic-bezier(0.2,0,0,1), box-shadow 0.25s ease',
                    boxShadow: active ? '0 8px 24px rgba(0,0,0,0.18)' : '0 0 0 rgba(0,0,0,0)',
                    position: 'relative',
                    touchAction: 'none',
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg select-none ${
                    active
                      ? 'bg-brand-50 dark:bg-brand-900/30 border border-brand-300 dark:border-brand-600 cursor-grabbing'
                      : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent cursor-grab hover:bg-gray-100 dark:hover:bg-gray-600/50'
                  }`}
                >
                  <svg
                    className={`w-4 h-4 flex-shrink-0 ${active ? 'text-brand-500' : 'text-gray-400 dark:text-gray-500'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span className={`text-sm flex-1 ${active ? 'text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-200'}`}>
                    {nameMap[key] || key}
                  </span>
                  <span className={`text-[10px] font-mono ${active ? 'text-brand-400' : 'text-gray-300 dark:text-gray-600'}`}>
                    {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            >
              {t('settings', 'reorderTabsReset')}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
            >
              {t('settings', 'reorderTabsDone')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
