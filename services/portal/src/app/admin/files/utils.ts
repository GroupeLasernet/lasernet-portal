// ============================================================
// Pure helpers for /admin/files. No React, no fetch, no state.
// ============================================================

import type {
  FileAssetRow,
  FileFolderRow,
  FolderNode,
  VideoAssetRow,
} from './types';

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

/**
 * Build the recursive folder tree for the sidebar.
 *
 * Inputs:
 *   • `folders` — persisted FileFolder rows (source of truth;
 *     empty folders live here and must still render).
 *   • `docs` / `vids` — used for (a) counting per-folder totals
 *     shown beside each row and (b) tolerating legacy rows that
 *     still carry category/subCategory strings but no folderId.
 *
 * The tree is returned as a forest: every root-level FolderNode
 * is a top-level category. Subfolders hang off children[] at
 * arbitrary depth. Counts include direct children only in
 * docCount/videoCount; aggregates over the subtree land in
 * totalDocCount/totalVideoCount.
 */
export function buildTree(
  docs: FileAssetRow[],
  vids: VideoAssetRow[],
  folders: FileFolderRow[],
): FolderNode[] {
  // Build a lookup from id → node
  const byId = new Map<string, FolderNode>();
  for (const f of folders) {
    byId.set(f.id, {
      id: f.id,
      name: f.name,
      depth: 0, // recomputed after wiring
      children: [],
      docCount: 0,
      videoCount: 0,
      totalDocCount: 0,
      totalVideoCount: 0,
    });
  }

  // Wire children + collect roots
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = byId.get(f.id);
    if (!node) continue;
    if (f.parentId == null) {
      roots.push(node);
    } else {
      const parent = byId.get(f.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan (parentId refers to a folder we didn't fetch) —
        // promote to root so it's still reachable.
        roots.push(node);
      }
    }
  }

  // Sort children alphabetically at each level
  const sortRec = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortRec);
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach(sortRec);

  // Compute depth
  const setDepth = (node: FolderNode, depth: number) => {
    node.depth = depth;
    node.children.forEach((c) => setDepth(c, depth + 1));
  };
  roots.forEach((r) => setDepth(r, 0));

  // Count direct docs/videos per folder by folderId
  for (const d of docs) if (d.folderId) {
    const n = byId.get(d.folderId);
    if (n) n.docCount += 1;
  }
  for (const v of vids) if (v.folderId) {
    const n = byId.get(v.folderId);
    if (n) n.videoCount += 1;
  }

  // Aggregate totals (post-order walk)
  const aggregate = (node: FolderNode): { d: number; v: number } => {
    let d = node.docCount;
    let v = node.videoCount;
    for (const c of node.children) {
      const sub = aggregate(c);
      d += sub.d;
      v += sub.v;
    }
    node.totalDocCount = d;
    node.totalVideoCount = v;
    return { d, v };
  };
  roots.forEach(aggregate);

  return roots;
}

/**
 * Walk a subtree and return every folder id in it (including the
 * root). Useful for "show descendants" filtering — when the user
 * selects a parent folder we want to include files nested below.
 */
export function collectDescendantIds(node: FolderNode): string[] {
  const out: string[] = [node.id];
  for (const c of node.children) out.push(...collectDescendantIds(c));
  return out;
}

/**
 * Find a node anywhere in the forest by id. Returns null if missing.
 */
export function findNode(roots: FolderNode[], id: string): FolderNode | null {
  for (const r of roots) {
    if (r.id === id) return r;
    const hit = findNode(r.children, id);
    if (hit) return hit;
  }
  return null;
}
