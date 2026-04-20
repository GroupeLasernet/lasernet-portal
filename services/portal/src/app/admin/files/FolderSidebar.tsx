'use client';

// ============================================================
// FolderSidebar — the left tree.
// Shows: All files / Uncategorized (if any) / categories +
// their subfolders / "+ New folder" affordances. Folder nodes
// are drop targets; the caller owns the drop handler.
// ============================================================

import { useState } from 'react';
import { SEL_ALL, SEL_UNCAT } from './types';

export function FolderSidebar({
  tree,
  selCat,
  selSub,
  onSelect,
  expanded,
  onToggle,
  onCreateCategory,
  onCreateSubcategory,
  onDrop,
  uncatCount,
  totalCount,
  fr,
}: {
  tree: Record<string, string[]>;
  selCat: string;
  selSub: string | null;
  onSelect: (cat: string, sub: string | null) => void;
  expanded: Set<string>;
  onToggle: (cat: string) => void;
  onCreateCategory: () => void;
  onCreateSubcategory: (cat: string) => void;
  onDrop: (e: React.DragEvent, cat: string | null, sub: string | null) => void;
  uncatCount: number;
  totalCount: number;
  fr: boolean;
}) {
  const categories = Object.keys(tree).sort((a, b) => a.localeCompare(b));

  return (
    <aside className="w-56 shrink-0 card p-3 sticky top-4 self-start max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 px-1 tracking-wide">
        {fr ? 'Dossiers' : 'Folders'}
      </div>

      <div className="flex flex-col gap-0.5">
        {/* All — droppable so an OS file dropped here lands uncategorized */}
        <FolderNode
          label={fr ? 'Tous les fichiers' : 'All files'}
          icon="all"
          active={selCat === SEL_ALL}
          count={totalCount}
          onClick={() => onSelect(SEL_ALL, null)}
          droppable
          onDrop={(e) => onDrop(e, null, null)}
        />

        {/* Uncategorized (only if there actually is anything uncategorized) */}
        {uncatCount > 0 && (
          <FolderNode
            label={fr ? 'Sans catégorie' : 'Uncategorized'}
            icon="uncat"
            active={selCat === SEL_UNCAT}
            count={uncatCount}
            onClick={() => onSelect(SEL_UNCAT, null)}
            droppable
            onDrop={(e) => onDrop(e, null, null)}
          />
        )}

        {/* Categories */}
        {categories.map((cat) => {
          const subs = tree[cat];
          const isExpanded = expanded.has(cat);
          const isActiveCat = selCat === cat && selSub == null;
          return (
            <div key={cat}>
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onToggle(cat)}
                  className="px-1.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <FolderNode
                  label={cat}
                  icon="folder"
                  active={isActiveCat}
                  onClick={() => onSelect(cat, null)}
                  droppable
                  onDrop={(e) => onDrop(e, cat, null)}
                  flexOne
                />
              </div>

              {isExpanded && (
                <div className="ml-5 flex flex-col gap-0.5 mt-0.5 border-l border-gray-100 dark:border-gray-700 pl-1">
                  {subs.map((sub) => (
                    <FolderNode
                      key={sub}
                      label={sub}
                      icon="subfolder"
                      active={selCat === cat && selSub === sub}
                      onClick={() => onSelect(cat, sub)}
                      droppable
                      onDrop={(e) => onDrop(e, cat, sub)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onCreateSubcategory(cat)}
                    className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-2 py-1 text-left"
                  >
                    + {fr ? 'Nouveau sous-dossier' : 'New subfolder'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onCreateCategory}
          className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-3 py-2 text-left mt-2 border-t border-gray-100 dark:border-gray-700 pt-2"
        >
          + {fr ? 'Nouveau dossier' : 'New folder'}
        </button>
      </div>
    </aside>
  );
}

// ── Private sub-components ──────────────────────────────

function FolderNode({
  label,
  icon,
  active,
  count,
  onClick,
  droppable,
  onDrop,
  flexOne,
}: {
  label: string;
  icon: 'all' | 'uncat' | 'folder' | 'subfolder';
  active: boolean;
  count?: number;
  onClick: () => void;
  droppable: boolean;
  onDrop?: (e: React.DragEvent) => void;
  flexOne?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const className =
    `text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
      active
        ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
        : hover
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 ring-1 ring-brand-300 dark:ring-brand-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300'
    } ${flexOne ? 'flex-1' : 'w-full'}`;
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHover(true); } : undefined}
      onDragLeave={droppable ? () => setHover(false) : undefined}
      onDrop={droppable && onDrop ? (e) => { setHover(false); onDrop(e); } : undefined}
      className={className}
    >
      <FolderIcon variant={icon} />
      <span className="truncate flex-1">{label}</span>
      {count != null && (
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{count}</span>
      )}
    </button>
  );
}

function FolderIcon({ variant }: { variant: 'all' | 'uncat' | 'folder' | 'subfolder' }) {
  if (variant === 'all') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  if (variant === 'uncat') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (variant === 'subfolder') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h4l2 3h10a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    );
  }
  // folder
  return (
    <svg className="w-4 h-4 shrink-0 text-brand-500 dark:text-brand-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}
