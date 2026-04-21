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
//
// This file is intentionally thin: presentation + row rendering
// lives in FolderSubtree/FolderRow/InlineNameInput. What stays
// here is the inline edit state (rename draft, create-child
// draft) that has to be singular across the whole sidebar.
// ============================================================

import { useState } from 'react';
import { SEL_ALL, SEL_UNCAT } from './types';
import type { FolderNode } from './types';
import { FolderRow } from './FolderRow';
import { FolderSubtree } from './FolderSubtree';
import { InlineNameInput } from './InlineNameInput';

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
