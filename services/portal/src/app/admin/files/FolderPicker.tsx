'use client';

// ============================================================
// FolderPicker — dropdown for picking a FileFolder from the
// recursive tree. Used by EditDocumentModal + VideoModal so
// users can move an asset into any folder without leaving the
// modal.
// ============================================================

import type { FolderNode } from './types';

/** Flatten the tree into options with indent prefix for visual nesting. */
function flatten(nodes: FolderNode[], acc: { id: string; label: string }[] = []) {
  for (const n of nodes) {
    acc.push({
      id: n.id,
      label: `${'\u00A0\u00A0'.repeat(n.depth)}${n.name}`,
    });
    if (n.children.length) flatten(n.children, acc);
  }
  return acc;
}

export function FolderPicker({
  folders,
  value,
  onChange,
}: {
  folders: FolderNode[];
  value: string | null;
  onChange: (folderId: string | null) => void;
}) {
  const options = flatten(folders);
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="input-field"
    >
      <option value="">— Uncategorized —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
