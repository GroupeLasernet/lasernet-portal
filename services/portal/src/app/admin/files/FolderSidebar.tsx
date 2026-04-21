'use client';

// ============================================================
// FolderSidebar — the left tree.
// Shows: All files / Uncategorized (if any) / categories +
// their subfolders / "+ New folder" affordances.
//
// Every user-created folder has rename + delete affordances
// (pencil + trash icons, visible on hover). The "All files"
// and "Uncategorized" rows do NOT — they're virtual.
//
// Folder nodes are drop targets; the caller owns the handler.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { SEL_ALL, SEL_UNCAT } from './types';

type FolderAction = {
  onRename: (parent: string | null, oldName: string, newName: string) => void;
  onDelete: (parent: string | null, name: string) => void;
};

export function FolderSidebar({
  tree,
  selCat,
  selSub,
  onSelect,
  expanded,
  onToggle,
  onCreateCategory,
  onCreateSubcategory,
  onRenameFolder,
  onDeleteFolder,
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
  onCreateCategory: (name: string) => void;
  onCreateSubcategory: (cat: string, name: string) => void;
  onRenameFolder: (parent: string | null, oldName: string, newName: string) => void;
  onDeleteFolder: (parent: string | null, name: string) => void;
  onDrop: (e: React.DragEvent, cat: string | null, sub: string | null) => void;
  uncatCount: number;
  totalCount: number;
  fr: boolean;
}) {
  const categories = Object.keys(tree).sort((a, b) => a.localeCompare(b));

  const [creatingCat, setCreatingCat] = useState(false);
  const [catDraft, setCatDraft] = useState('');
  const [creatingSubFor, setCreatingSubFor] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState('');

  // Rename state — keyed by "parent|name" so top vs sub never clash.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const actions: FolderAction = {
    onRename: onRenameFolder,
    onDelete: onDeleteFolder,
  };

  const renameKey = (parent: string | null, name: string) => `${parent ?? ''}|${name}`;

  const startRename = (parent: string | null, name: string) => {
    setRenameDraft(name);
    setRenamingKey(renameKey(parent, name));
  };
  const cancelRename = () => {
    setRenameDraft('');
    setRenamingKey(null);
  };
  const submitRename = (parent: string | null, oldName: string) => {
    const next = renameDraft.trim();
    if (next && next !== oldName) actions.onRename(parent, oldName, next);
    cancelRename();
  };

  return (
    <aside className="w-56 shrink-0 card p-3 sticky top-4 self-start max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 px-1 tracking-wide">
        {fr ? 'Dossiers' : 'Folders'}
      </div>

      <div className="flex flex-col gap-0.5">
        <FolderNode
          label={fr ? 'Tous les fichiers' : 'All files'}
          icon="all"
          active={selCat === SEL_ALL}
          count={totalCount}
          onClick={() => onSelect(SEL_ALL, null)}
          droppable
          onDrop={(e) => onDrop(e, null, null)}
        />

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

        {categories.map((cat) => {
          const subs = tree[cat];
          const isExpanded = expanded.has(cat);
          const isActiveCat = selCat === cat && selSub == null;
          const catRenameKey = renameKey(null, cat);
          const isRenamingCat = renamingKey === catRenameKey;
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
                {isRenamingCat ? (
                  <InlineNameInput
                    value={renameDraft}
                    onChange={setRenameDraft}
                    placeholder={fr ? 'Nouveau nom' : 'New name'}
                    onSubmit={() => submitRename(null, cat)}
                    onCancel={cancelRename}
                  />
                ) : (
                  <FolderNode
                    label={cat}
                    icon="folder"
                    active={isActiveCat}
                    onClick={() => onSelect(cat, null)}
                    droppable
                    onDrop={(e) => onDrop(e, cat, null)}
                    flexOne
                    onRename={() => startRename(null, cat)}
                    onDelete={() => actions.onDelete(null, cat)}
                    fr={fr}
                  />
                )}
              </div>

              {isExpanded && (
                <div className="ml-5 flex flex-col gap-0.5 mt-0.5 border-l border-gray-100 dark:border-gray-700 pl-1">
                  {subs.map((sub) => {
                    const subKey = renameKey(cat, sub);
                    const isRenamingSub = renamingKey === subKey;
                    if (isRenamingSub) {
                      return (
                        <InlineNameInput
                          key={sub}
                          value={renameDraft}
                          onChange={setRenameDraft}
                          placeholder={fr ? 'Nouveau nom' : 'New name'}
                          onSubmit={() => submitRename(cat, sub)}
                          onCancel={cancelRename}
                        />
                      );
                    }
                    return (
                      <FolderNode
                        key={sub}
                        label={sub}
                        icon="subfolder"
                        active={selCat === cat && selSub === sub}
                        onClick={() => onSelect(cat, sub)}
                        droppable
                        onDrop={(e) => onDrop(e, cat, sub)}
                        onRename={() => startRename(cat, sub)}
                        onDelete={() => actions.onDelete(cat, sub)}
                        fr={fr}
                      />
                    );
                  })}
                  {creatingSubFor === cat ? (
                    <InlineNameInput
                      value={subDraft}
                      onChange={setSubDraft}
                      placeholder={fr ? 'Nom du sous-dossier' : 'Subfolder name'}
                      onSubmit={() => {
                        const name = subDraft.trim();
                        if (name) onCreateSubcategory(cat, name);
                        setSubDraft('');
                        setCreatingSubFor(null);
                      }}
                      onCancel={() => {
                        setSubDraft('');
                        setCreatingSubFor(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSubDraft('');
                        setCreatingSubFor(cat);
                      }}
                      className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-2 py-1 text-left"
                    >
                      + {fr ? 'Nouveau sous-dossier' : 'New subfolder'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {creatingCat ? (
          <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
            <InlineNameInput
              value={catDraft}
              onChange={setCatDraft}
              placeholder={fr ? 'Nom du dossier' : 'Folder name'}
              onSubmit={() => {
                const name = catDraft.trim();
                if (name) onCreateCategory(name);
                setCatDraft('');
                setCreatingCat(false);
              }}
              onCancel={() => {
                setCatDraft('');
                setCreatingCat(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCatDraft('');
              setCreatingCat(true);
            }}
            className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-3 py-2 text-left mt-2 border-t border-gray-100 dark:border-gray-700 pt-2"
          >
            + {fr ? 'Nouveau dossier' : 'New folder'}
          </button>
        )}
      </div>
    </aside>
  );
}

// ── Private sub-components ──────────────────────────────

function InlineNameInput({
  value,
  onChange,
  placeholder,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        // Submit-on-blur if the user typed something, otherwise cancel.
        // Avoids losing typed names when the user clicks away.
        if (value.trim()) onSubmit(); else onCancel();
      }}
      className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-400 flex-1 w-full"
    />
  );
}

function FolderNode({
  label,
  icon,
  active,
  count,
  onClick,
  droppable,
  onDrop,
  flexOne,
  onRename,
  onDelete,
  fr,
}: {
  label: string;
  icon: 'all' | 'uncat' | 'folder' | 'subfolder';
  active: boolean;
  count?: number;
  onClick: () => void;
  droppable: boolean;
  onDrop?: (e: React.DragEvent) => void;
  flexOne?: boolean;
  onRename?: () => void;
  onDelete?: () => void;
  fr?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const editable = Boolean(onRename || onDelete);
  const baseClasses =
    `group text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
      active
        ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
        : dragHover
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 ring-1 ring-brand-300 dark:ring-brand-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300'
    } ${flexOne ? 'flex-1' : 'w-full'}`;

  return (
    <div
      className={baseClasses}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragHover(true); } : undefined}
      onDragLeave={droppable ? () => setDragHover(false) : undefined}
      onDrop={droppable && onDrop ? (e) => { setDragHover(false); onDrop(e); } : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
      >
        <FolderIcon variant={icon} />
        <span className="truncate flex-1">{label}</span>
      </button>
      {editable && hover ? (
        <div className="flex items-center gap-0.5 shrink-0">
          {onRename && (
            <IconButton
              label={fr ? 'Renommer' : 'Rename'}
              onClick={(e) => { e.stopPropagation(); onRename(); }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              label={fr ? 'Supprimer' : 'Delete'}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              danger
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              </svg>
            </IconButton>
          )}
        </div>
      ) : (
        count != null && (
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">{count}</span>
        )
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-1 rounded ${
        danger
          ? 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30'
      }`}
    >
      {children}
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
  return (
    <svg className="w-4 h-4 shrink-0 text-brand-500 dark:text-brand-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}
