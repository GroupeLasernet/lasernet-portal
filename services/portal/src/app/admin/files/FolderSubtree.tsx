'use client';

// ============================================================
// FolderSubtree — one node + its (possibly expanded) descendants.
// Recursive. All state (selection, expanded, rename draft, create
// child draft) lives in the parent sidebar — this is a pure
// presentational component that just forwards callbacks down.
// ============================================================

import type { FolderNode } from './types';
import { FolderRow } from './FolderRow';
import { InlineNameInput } from './InlineNameInput';

export function FolderSubtree({
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
