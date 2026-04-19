'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import type { SidebarLink } from './Sidebar';

// ── Storage key ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'prisma_sidebar_order';

export interface SidebarOrder {
  top: string[];
  children: Record<string, string[]>;
  bottom: string[];
}

/** Read saved order from localStorage (null if none saved) */
export function loadSidebarOrder(): SidebarOrder | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Apply saved order to a links array. Unknown items go at the end. */
export function applySidebarOrder(links: SidebarLink[], orderKeys: string[] | undefined): SidebarLink[] {
  if (!orderKeys || orderKeys.length === 0) return links;
  const byKey = new Map(links.map((l) => [l.labelKey, l]));
  const ordered: SidebarLink[] = [];
  for (const key of orderKeys) {
    const link = byKey.get(key);
    if (link) {
      ordered.push(link);
      byKey.delete(key);
    }
  }
  byKey.forEach((link) => { ordered.push(link); });
  return ordered;
}

/** Apply child order within expandable groups */
export function applyChildOrder(links: SidebarLink[], childOrder: Record<string, string[]> | undefined): SidebarLink[] {
  if (!childOrder) return links;
  return links.map((link) => {
    if (link.children && childOrder[link.labelKey]) {
      return { ...link, children: applySidebarOrder(link.children, childOrder[link.labelKey]) };
    }
    return link;
  });
}

// ── Modal component ──────────────────────────────────────────────────────

interface Props {
  links: SidebarLink[];
  bottomLinks: SidebarLink[];
  open: boolean;
  onClose: () => void;
  onSave: (order: SidebarOrder) => void;
}

interface DragState {
  listId: string;
  idx: number;
  key: string;
  startY: number;
  currentY: number;
  rowHeight: number;
}

export default function SidebarReorderModal({ links, bottomLinks, open, onClose, onSave }: Props) {
  const { t } = useLanguage();

  // ── Local working copies ──
  const [topItems, setTopItems] = useState<string[]>([]);
  const [childItems, setChildItems] = useState<Record<string, string[]>>({});
  const [bottomItems, setBottomItems] = useState<string[]>([]);

  // Reset state every time modal opens
  useEffect(() => {
    if (open) {
      setTopItems(links.map((l) => l.labelKey));
      setBottomItems(bottomLinks.map((l) => l.labelKey));
      const m: Record<string, string[]> = {};
      for (const l of links) {
        if (l.children) m[l.labelKey] = l.children.map((c) => c.labelKey);
      }
      setChildItems(m);
    }
  }, [open, links, bottomLinks]);

  // ── Drag state ──
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Build labelKey → display name lookup
  const nameMap: Record<string, string> = {};
  const addLink = (l: SidebarLink) => {
    nameMap[l.labelKey] = t('nav', l.labelKey);
    if (l.children) l.children.forEach(addLink);
  };
  links.forEach(addLink);
  bottomLinks.forEach(addLink);

  const hasChildren = (key: string) => !!(childItems[key] && childItems[key].length > 0);

  // ── Reorder helper ──
  const reorder = (list: string[], from: number, to: number): string[] => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  // ── Pointer-based drag handlers ──
  const getListItems = useCallback((listId: string): string[] => {
    if (listId === 'top') return topItems;
    if (listId === 'bottom') return bottomItems;
    return childItems[listId] || [];
  }, [topItems, bottomItems, childItems]);

  const setListItems = useCallback((listId: string, items: string[]) => {
    if (listId === 'top') setTopItems(items);
    else if (listId === 'bottom') setBottomItems(items);
    else setChildItems((prev) => ({ ...prev, [listId]: items }));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, listId: string, idx: number, key: string) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const rowHeight = target.getBoundingClientRect().height + 6; // 6px = gap
    const state: DragState = {
      listId,
      idx,
      key,
      startY: e.clientY,
      currentY: e.clientY,
      rowHeight,
    };
    dragRef.current = state;
    setDrag(state);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const dy = e.clientY - d.startY;
    const indexShift = Math.round(dy / d.rowHeight);

    if (indexShift !== 0) {
      const list = getListItems(d.listId);
      const newIdx = Math.max(0, Math.min(list.length - 1, d.idx + indexShift));
      if (newIdx !== d.idx) {
        setListItems(d.listId, reorder(list, d.idx, newIdx));
        const next: DragState = {
          ...d,
          idx: newIdx,
          startY: d.startY + (newIdx - d.idx) * d.rowHeight,
          currentY: e.clientY,
        };
        dragRef.current = next;
        setDrag(next);
        return;
      }
    }

    const next = { ...d, currentY: e.clientY };
    dragRef.current = next;
    setDrag(next);
  }, [getListItems, setListItems]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  // ── Save / Reset ──
  const handleSave = () => {
    const order: SidebarOrder = { top: topItems, children: childItems, bottom: bottomItems };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    onSave(order);
    onClose();
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTopItems(links.map((l) => l.labelKey));
    setBottomItems(bottomLinks.map((l) => l.labelKey));
    const m: Record<string, string[]> = {};
    for (const l of links) {
      if (l.children) m[l.labelKey] = l.children.map((c) => c.labelKey);
    }
    setChildItems(m);
    onSave(null as any);
    onClose();
  };

  if (!open) return null;

  // ── Calculate drag offset for the held item ──
  const getDragOffset = (listId: string, idx: number) => {
    if (!drag || drag.listId !== listId || drag.idx !== idx) return 0;
    return drag.currentY - drag.startY;
  };

  const isDragging = (listId: string, idx: number, key: string) =>
    drag !== null && drag.listId === listId && drag.key === key;

  // ── Row component ──
  const renderRow = (listId: string, idx: number, labelKey: string, indent?: boolean) => {
    const active = isDragging(listId, idx, labelKey);
    const offset = getDragOffset(listId, idx);

    return (
      <div
        key={labelKey}
        onPointerDown={(e) => handlePointerDown(e, listId, idx, labelKey)}
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
        className={`flex items-center gap-2 px-3 py-2 rounded-lg select-none ${indent ? 'ml-6' : ''} ${
          active
            ? 'bg-brand-50 dark:bg-brand-900/30 border border-brand-300 dark:border-brand-600 cursor-grabbing'
            : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent cursor-grab hover:bg-gray-100 dark:hover:bg-gray-600/50'
        }`}
      >
        {/* Drag handle */}
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-colors ${
            active ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className={`text-sm flex-1 ${
          active ? 'text-brand-700 dark:text-brand-300 font-medium' : 'text-gray-700 dark:text-gray-200'
        }`}>
          {nameMap[labelKey] || labelKey}
        </span>
        {/* Position indicator */}
        <span className={`text-[10px] font-mono transition-colors ${
          active ? 'text-brand-400 dark:text-brand-500' : 'text-gray-300 dark:text-gray-600'
        }`}>
          {idx + 1}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60] animate-fadeIn" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm max-h-[80vh] flex flex-col animate-modalIn">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {t('nav', 'reorderTitle')}
              </h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                {t('nav', 'reorderHint') || 'Drag to reorder'}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
            {/* Top links */}
            {topItems.map((key, idx) => (
              <div key={key}>
                {renderRow('top', idx, key)}
                {/* Children of expandable groups */}
                {hasChildren(key) && (
                  <div className="mt-1.5 space-y-1.5">
                    {childItems[key].map((ck, ci) =>
                      renderRow(key, ci, ck, true)
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Separator */}
            {bottomItems.length > 0 && (
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Bottom</span>
                <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
              </div>
            )}

            {/* Bottom links */}
            {bottomItems.map((key, idx) =>
              renderRow('bottom', idx, key)
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              {t('nav', 'reorderReset')}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t('nav', 'reorderDone')}
            </button>
          </div>
        </div>
      </div>

      {/* Injected animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out }
        .animate-modalIn { animation: modalIn 0.2s ease-out }
      `}</style>
    </>
  );
}
