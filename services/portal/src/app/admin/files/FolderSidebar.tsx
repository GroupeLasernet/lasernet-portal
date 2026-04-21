'use client';

// ============================================================
// FolderSidebar — the recursive left tree.
//
// Shows: All files / Uncategorized (if any) / every folder in
// the tree, nested arbitrarily deep. Every folder row has:
//   • click-to-select
//   • chevron toggle (when it has children)
//   • drop target for files + in-page row drags
//   • hover pencil (rename) + trash (delete)
//   • "+ New subfolder" affordance while expanded
//
// "All files" and "Uncategorized" rows are virtual — no rename
// / delete, no children.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { SEL_ALL, SEL_UNCAT } from './types';
import type { FolderNode } from './types';

export function FolderSidebar({
  tree,
  selectedFolderId,
  onSelect,
  expanded,
  onToggle,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDrop,
  uncatCount,
  totalCount,
  fr,
}: {
  tree: FolderNode[];
  selectedFolderId: string;
  onSelect: (folderId: string) => void;
  expanded: Set<string>;
  onToggle: (folderId: string) => void;
  /** parentId=null creates a top-level folder. */
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  /** targetFolderId=null means drop onto the virtual root (no folder). */
  onDrop: (e: React.DragEvent, targetFolderId: string | null) => void;
  uncatCount: number;
  totalCount: number;
  fr: boolean;
}) {
  // Which folder is currently accepting a new child via inline input.
  // `null` = creating a top-level folder. `undefined` = nothing.
  const [creatingChildOf, setCreatingChildOf] = useState<string | null | undefined>(undefined);
  const [childDraft, setChildDraft] = useState('');

  // Inline rename state — single folderId or null.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const startRename = (id: string, currentName: string) => {
    setRenameDraft(currentName);
    setRenamingId(id);
  };
  const cancelRename = () => {
    setRenameDraft('');
    setRenamingId(null);
  };
  const submitRename = (id: string, oldName: string) => {
    const next = renameDraft.trim();
    if (next && next !== oldName) onRenameFolder(id, next);
    cancelRename();
  };

  const startCreateChild = (parentId: string | null) => {
    setChildDraft('');
    setCreatingChildOf(parentId);
  };
  const cancelCreateChild = () => {
    setChildDraft('');
    setCreatingChildOf(undefined);
  };
  const submitCreateChild = (parentId: string | null) => {
    const name = childDraft.trim();
    if (name) onCreateFolder(parentId, name);
    cancelCreateChild();
  };

  return (
    <aside className="w-56 shrink-0 card p-3 sticky top-4 self-start max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 px-1 tracking-wide">
        {fr ? 'Dossiers' : 'Folders'}
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Virtual — All */}
        <FolderRow
          label={fr ? 'Tous les fichiers' : 'All files'}
          icon="all"
          active={selectedFolderId === SEL_ALL}
          count={totalCount}
          onClick={() => onSelect(SEL_ALL)}
          onDrop={(e) => onDrop(e, null)}
          depth={0}
          fr={fr}
        />

        {/* Virtual — Uncategorized (only if any) */}
        {uncatCount > 0 && (
          <FolderRow
            label={fr ? 'Sans catégorie' : 'Uncategorized'}
            icon="uncat"
            active={selectedFolderId === SEL_UNCAT}
            count={uncatCount}
            onClick={() => onSelect(SEL_UNCAT)}
            onDrop={(e) => onDrop(e, null)}
            depth={0}
            fr={fr}
          />
        )}

        {/* Real tree */}
        {tree.map((node) => (
          <FolderSubtree
            key={node.id}
            node={node}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
            onDrop={onDrop}
            renamingId={renamingId}
            renameDraft={renameDraft}
            onChangeRenameDraft={setRenameDraft}
            onStartRename={startRename}
            onSubmitRename={submitRename}
            onCancelRename={cancelRename}
            onDeleteFolder={onDeleteFolder}
            creatingChildOf={creatingChildOf}
            childDraft={childDraft}
            onChangeChildDraft={setChildDraft}
            onStartCreateChild={startCreateChild}
            onSubmitCreateChild={submitCreateChild}
            onCancelCreateChild={cancelCreateChild}
            fr={fr}
          />
        ))}

        {/* "+ New folder" at root */}
        {creatingChildOf === null ? (
          <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
            <InlineNameInput
              value={childDraft}
              onChange={setChildDraft}
              placeholder={fr ? 'Nom du dossier' : 'Folder name'}
              onSubmit={() => submitCreateChild(null)}
              onCancel={cancelCreateChild}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => startCreateChild(null)}
            className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-3 py-2 text-left mt-2 border-t border-gray-100 dark:border-gray-700 pt-2"
          >
            + {fr ? 'Nouveau dossier' : 'New folder'}
          </button>
        )}
      </div>
    </aside>
  );
}

// ============================================================
// FolderSubtree — one node + its (possibly expanded) descendants.
// Recursive. All state lives in the parent sidebar — this is a
// pure presentational component.
// ============================================================
function FolderSubtree({
  node,
  selectedFolderId,
  onSelect,
  expanded,
  onToggle,
  onDrop,
  renamingId,
  renameDraft,
  onChangeRenameDraft,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDeleteFolder,
  creatingChildOf,
  childDraft,
  onChangeChildDraft,
  onStartCreateChild,
  onSubmitCreateChild,
  onCancelCreateChild,
  fr,
}: {
  node: FolderNode;
  selectedFolderId: string;
  onSelect: (folderId: string) => void;
  expanded: Set<string>;
  onToggle: (folderId: string) => void;
  onDrop: (e: React.DragEvent, targetFolderId: string | null) => void;
  renamingId: string | null;
  renameDraft: string;
  onChangeRenameDraft: (v: string) => void;
  onStartRename: (id: string, name: string) => void;
  onSubmitRename: (id: string, oldName: string) => void;
  onCancelRename: () => void;
  onDeleteFolder: (id: string) => void;
  creatingChildOf: string | null | undefined;
  childDraft: string;
  onChangeChildDraft: (v: string) => void;
  onStartCreateChild: (parentId: string | null) => void;
  onSubmitCreateChild: (parentId: string | null) => void;
  onCancelCreateChild: () => void;
  fr: boolean;
}) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedFolderId === node.id;
  const isRenaming = renamingId === node.id;
  // Total count shown beside each folder = direct + descendants.
  const totalCount = node.totalDocCount + node.totalVideoCount;

  return (
    <div>
      <div className="flex items-stretch" style={{ paddingLeft: node.depth * 12 }}>
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className={`px-1.5 flex items-center ${
            hasChildren
              ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              : 'text-transparent pointer-events-none'
          }`}
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

        {isRenaming ? (
          <InlineNameInput
            value={renameDraft}
            onChange={onChangeRenameDraft}
            placeholder={fr ? 'Nouveau nom' : 'New name'}
            onSubmit={() => onSubmitRename(node.id, node.name)}
            onCancel={onCancelRename}
          />
        ) : (
          <FolderRow
            label={node.name}
            icon={node.depth === 0 ? 'folder' : 'subfolder'}
            active={isSelected}
            count={totalCount || undefined}
            onClick={() => onSelect(node.id)}
            onDrop={(e) => onDrop(e, node.id)}
            onRename={() => onStartRename(node.id, node.name)}
            onDelete={() => onDeleteFolder(node.id)}
            onAddChild={() => {
              // Expand when creating a child, so the input is visible.
              if (!isExpanded) onToggle(node.id);
              onStartCreateChild(node.id);
            }}
            depth={node.depth}
            flexOne
            fr={fr}
          />
        )}
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {node.children.map((child) => (
            <FolderSubtree
              key={child.id}
              node={child}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
              onDrop={onDrop}
              renamingId={renamingId}
              renameDraft={renameDraft}
              onChangeRenameDraft={onChangeRenameDraft}
              onStartRename={onStartRename}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              onDeleteFolder={onDeleteFolder}
              creatingChildOf={creatingChildOf}
              childDraft={childDraft}
              onChangeChildDraft={onChangeChildDraft}
              onStartCreateChild={onStartCreateChild}
              onSubmitCreateChild={onSubmitCreateChild}
              onCancelCreateChild={onCancelCreateChild}
              fr={fr}
            />
          ))}

          {/* Inline "+ new subfolder" input row — only on the folder being acted on. */}
          {creatingChildOf === node.id && (
            <div style={{ paddingLeft: (node.depth + 1) * 12 + 22 }}>
              <InlineNameInput
                value={childDraft}
                onChange={onChangeChildDraft}
                placeholder={fr ? 'Nom du sous-dossier' : 'Subfolder name'}
                onSubmit={() => onSubmitCreateChild(node.id)}
                onCancel={onCancelCreateChild}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// FolderRow — single clickable/droppable row. Shares shape for
// virtual nodes (All / Uncategorized) and real folder nodes.
// ============================================================
function FolderRow({
  label,
  icon,
  active,
  count,
  onClick,
  onDrop,
  onRename,
  onDelete,
  onAddChild,
  depth,
  flexOne,
  fr,
}: {
  label: string;
  icon: 'all' | 'uncat' | 'folder' | 'subfolder';
  active: boolean;
  count?: number;
  onClick: () => void;
  onDrop: (e: React.DragEvent) => void;
  onRename?: () => void;
  onDelete?: () => void;
  onAddChild?: () => void;
  depth: number;
  flexOne?: boolean;
  fr?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const editable = Boolean(onRename || onDelete || onAddChild);

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
      onDragOver={(e) => {
        e.preventDefault();
        // OS file drop → 'copy' (some browsers silently reject 'move' for
        // external files). In-page row drag → 'move'.
        const isFile = e.dataTransfer.types.includes('Files');
        e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
        setDragHover(true);
      }}
      onDragLeave={() => setDragHover(false)}
      onDrop={(e) => { setDragHover(false); onDrop(e); }}
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
          {onAddChild && (
            <IconButton
              label={fr ? 'Ajouter un sous-dossier' : 'Add subfolder'}
              onClick={(e) => { e.stopPropagation(); onAddChild(); }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </IconButton>
          )}
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

// ── Sub-components ─────────────────────────────────────────

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
        if (value.trim()) onSubmit(); else onCancel();
      }}
      className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-400 flex-1 w-full"
    />
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