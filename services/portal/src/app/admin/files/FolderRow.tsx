'use client';

// ============================================================
// FolderRow — single clickable/droppable row. Shared shape for
// virtual nodes (All / Uncategorized) and real folder nodes.
//
// Drag-drop note: OS file drops need dropEffect='copy' (some
// browsers silently reject 'move' for external files). In-page
// row drags stay on 'move'. Do not simplify this — regressing it
// will break drag-and-drop uploads in Chrome/Safari.
// ============================================================

import { useState } from 'react';

export function FolderRow({
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

// Small square hover button used for rename/delete/add-child actions.
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

// Four visual variants reused across virtual ("All" / "Uncat") +
// real folder rows.
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
