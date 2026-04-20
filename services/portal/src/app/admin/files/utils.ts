// ============================================================
// Pure helpers for /admin/files. No React, no fetch, no state.
// ============================================================

import type { FileAssetRow, VideoAssetRow } from './types';

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
 * Build the { category: [subCategories...] } tree from the current
 * docs + videos + any empty folders the user created this session.
 */
export function buildTree(
  docs: FileAssetRow[],
  vids: VideoAssetRow[],
  ephemeralCats: string[],
  ephemeralSubs: Record<string, string[]>,
): Record<string, string[]> {
  const tree: Record<string, Set<string>> = {};
  const addCat = (cat: string) => { if (!tree[cat]) tree[cat] = new Set(); };
  for (const row of [...docs, ...vids]) {
    if (row.category) {
      addCat(row.category);
      if (row.subCategory) tree[row.category].add(row.subCategory);
    }
  }
  for (const cat of ephemeralCats) addCat(cat);
  for (const [cat, subs] of Object.entries(ephemeralSubs)) {
    addCat(cat);
    for (const s of subs) tree[cat].add(s);
  }
  return Object.fromEntries(
    Object.entries(tree).map(([k, v]) => [k, Array.from(v).sort((a, b) => a.localeCompare(b))]),
  );
}
