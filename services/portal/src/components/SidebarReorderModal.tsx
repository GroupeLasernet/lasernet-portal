'use client';

import { useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import type { SidebarLink } from './Sidebar';

// ── Storage key ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'prisma_sidebar_order';

export interface SidebarOrder {
  top: string[];            // labelKeys for top-level items, in order
  children: Record<string, string[]>; // parentLabelKey → child labelKeys in order
  bottom: string[];         // labelKeys for bottom items, in order
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
  // Append any items not in the saved order
  byKey.forEach((link) => {
    ordered.push(link);
  });
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

export default function SidebarReorderModal({ links, bottomLinks, open, onClose, onSave }: Props) {
  const { t } = useLanguage();

  // Local working copies
  const [topItems, setTopItems] = useState(() => links.map((l) => l.labelKey));
  const [childItems, setChildItems] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const l of links) {
      if (l.children) m[l.labelKey] = l.children.map((c) => c.labelKey);
    }
    return m;
  });
  const [bottomItems, setBottomItems] = useState(() => bottomLinks.map((l) => l.labelKey));

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const dragList = useRef<'top' | 'bottom' | string>('top');

  // Build labelKey → display name lookup
  const nameMap = useRef<Record<string, string>>({});
  const buildNameMap = useCallback(() => {
    const m: Record<string, string> = {};
    const addLink = (l: SidebarLink) => {
      m[l.labelKey] = t('nav', l.labelKey);
      if (l.children) l.children.forEach(addLink);
    };
    links.forEach(addLink);
    bottomLinks.forEach(addLink);
    nameMap.current = m;
  }, [links, bottomLinks, t]);
  buildNameMap();

  // Check if a top-level item has children
  const hasChildren = (key: string) => !!(childItems[key] && childItems[key].length > 0);

  // ── Generic list reorder via drag ──
  const reorder = (list: string[], from: number, to: number): string[] => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const handleDragStart = (listId: string, idx: number) => {
    dragIdx.current = idx;
    dragList.current = listId;
  };

  const handleDragOver = (e: React.DragEvent, listId: string, idx: number) => {
    e.preventDefault();
    if (dragList.current !== listId || dragIdx.current === null || dragIdx.current === idx) return;

    if (listId === 'top') {
      setTopItems((prev) => reorder(prev, dragIdx.current!, idx));
    } else if (listId === 'bottom') {
      setBottomItems((prev) => reorder(prev, dragIdx.current!, idx));
    } else {
      // It's a child list — listId = parent labelKey
      setChildItems((prev) => ({
        ...prev,
        [listId]: reorder(prev[listId], dragIdx.current!, idx),
      }));
    }
    dragIdx.current = idx;
  };

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
    onSave(null as any); // signal reset
    onClose();
  };

  if (!open) return null;

  // ── Draggable row ──
  const DragRow = ({ listId, idx, labelKey, indent }: { listId: string; idx: number; labelKey: string; indent?: boolean }) => (
    <div
      draggable
      onDragStart={() => handleDragStart(listId, idx)}
      onDragOver={(e) => handleDragOver(e, listId, idx)}
      onDragEnd={() => { dragIdx.current = null; }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-gray-100 dark:hover:bg-gray-600/50 ${indent ? 'ml-6' : ''}`}
    >
      {/* Drag handle */}
      <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
      </svg>
      <span className="text-sm text-gray-700 dark:text-gray-200 flex-1">{nameMap.current[labelKey] || labelKey}</span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('nav', 'reorderTitle')}</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
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
                <DragRow listId="top" idx={idx} labelKey={key} />
                {/* Children of expandable groups */}
                {hasChildren(key) && (
                  <div className="mt-1 space-y-1">
                    {childItems[key].map((ck, ci) => (
                      <DragRow key={ck} listId={key} idx={ci} labelKey={ck} indent />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Separator */}
            {bottomItems.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-600 my-3" />
            )}

            {/* Bottom links */}
            {bottomItems.map((key, idx) => (
              <DragRow key={key} listId="bottom" idx={idx} labelKey={key} />
            ))}
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
    </>
  );
}
