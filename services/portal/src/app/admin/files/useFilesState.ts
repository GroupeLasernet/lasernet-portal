'use client';

// ============================================================
// useFilesState — raw data + derived state for /admin/files.
// No mutations here (those live in useFilesMutations). The split
// keeps this file purely about "what's currently on screen" and
// the mutations file purely about "what happens when the user
// clicks something".
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useToast } from '@/lib/ToastContext';
import type {
  FileAssetRow,
  FileFolderRow,
  FolderNode,
  VideoAssetRow,
} from './types';
import { SEL_ALL, SEL_UNCAT } from './types';
import { buildTree, collectDescendantIds, findNode } from './utils';

export interface FilesState {
  // Raw data
  documents: FileAssetRow[];
  videos: VideoAssetRow[];
  folders: FileFolderRow[];
  loading: boolean;
  selectedFolderId: string;
  expanded: Set<string>;

  // Derived
  tree: FolderNode[];
  foldersById: Map<string, FileFolderRow>;
  folderPathById: Map<string, string[]>;
  uncatCount: number;
  filteredDocs: FileAssetRow[];
  filteredVideos: VideoAssetRow[];
  breadcrumb: string;
  /** Returns the folderId new uploads/drops should default to based on current selection. */
  currentUploadFolderId: () => string | null;

  // State setters — exposed so mutations can update state after API calls.
  setDocuments: Dispatch<SetStateAction<FileAssetRow[]>>;
  setVideos: Dispatch<SetStateAction<VideoAssetRow[]>>;
  setFolders: Dispatch<SetStateAction<FileFolderRow[]>>;
  setSelectedFolderId: Dispatch<SetStateAction<string>>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;

  // Actions
  loadAll: () => Promise<void>;
  select: (folderId: string) => void;
  toggleExpanded: (folderId: string) => void;
}

export function useFilesState(fr: boolean): FilesState {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<FileAssetRow[]>([]);
  const [videos, setVideos] = useState<VideoAssetRow[]>([]);
  const [folders, setFolders] = useState<FileFolderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection — a single folder id, or one of the sentinel
  // strings SEL_ALL / SEL_UNCAT.
  const [selectedFolderId, setSelectedFolderId] = useState<string>(SEL_ALL);

  // Expand/collapse — keyed by FileFolder.id
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Load ────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, vRes, fRes] = await Promise.all([
        fetch('/api/files/documents', { cache: 'no-store' }),
        fetch('/api/files/videos', { cache: 'no-store' }),
        fetch('/api/files/folders', { cache: 'no-store' }),
      ]);
      const dData = dRes.ok ? await dRes.json() : [];
      const vData = vRes.ok ? await vRes.json() : [];
      const fData = fRes.ok ? await fRes.json() : [];
      setDocuments(dData);
      setVideos(vData);
      setFolders(fData);
    } catch {
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived state ───────────────────────────────────────
  const tree = useMemo(
    () => buildTree(documents, videos, folders),
    [documents, videos, folders],
  );

  // Lookup helpers keyed on the folders array (not the tree)
  // so breadcrumbs can walk parents without recomputing the
  // tree itself.
  const foldersById = useMemo(() => {
    const m = new Map<string, FileFolderRow>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);

  // id → ["Top", "Sub", "Leaf"] path. Used by the tables + edit
  // modal to render a human-readable folder chip without having
  // to walk parents themselves.
  const folderPathById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of folders) {
      const parts: string[] = [];
      let cursor: string | null = f.id;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const cur = foldersById.get(cursor);
        if (!cur) break;
        parts.unshift(cur.name);
        cursor = cur.parentId;
      }
      m.set(f.id, parts);
    }
    return m;
  }, [folders, foldersById]);

  const uncatCount = useMemo(
    () =>
      documents.filter((d) => !d.folderId).length +
      videos.filter((v) => !v.folderId).length,
    [documents, videos],
  );

  // Set of folder ids included when the user has selected
  // `selectedFolderId`. For a real folder id, includes self +
  // every descendant (so selecting a parent shows everything
  // below). For the sentinels, returns null (= don't filter by
  // descendants, let the match predicate handle it).
  const selectedDescendantIds = useMemo<Set<string> | null>(() => {
    if (selectedFolderId === SEL_ALL || selectedFolderId === SEL_UNCAT) return null;
    const node = findNode(tree, selectedFolderId);
    if (!node) return new Set([selectedFolderId]);
    return new Set(collectDescendantIds(node));
  }, [selectedFolderId, tree]);

  const match = useCallback(
    (r: { folderId: string | null }) => {
      if (selectedFolderId === SEL_ALL) return true;
      if (selectedFolderId === SEL_UNCAT) return r.folderId == null;
      if (r.folderId == null) return false;
      return selectedDescendantIds?.has(r.folderId) ?? false;
    },
    [selectedFolderId, selectedDescendantIds],
  );

  const filteredDocs = useMemo(() => documents.filter(match), [documents, match]);
  const filteredVideos = useMemo(() => videos.filter(match), [videos, match]);

  // Full "Cat › Sub › Leaf" breadcrumb for the header.
  const breadcrumb = useMemo(() => {
    if (selectedFolderId === SEL_ALL) return fr ? 'Tous les fichiers' : 'All files';
    if (selectedFolderId === SEL_UNCAT) return fr ? 'Sans catégorie' : 'Uncategorized';
    const parts: string[] = [];
    let cursor: string | null = selectedFolderId;
    const seen = new Set<string>(); // cycle guard (should never happen, but cheap)
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const f = foldersById.get(cursor);
      if (!f) break;
      parts.unshift(f.name);
      cursor = f.parentId;
    }
    return parts.join(' › ');
  }, [selectedFolderId, foldersById, fr]);

  // For upload/drop: given the current selection, what folderId
  // should new uploads default to? SEL_ALL/SEL_UNCAT → null.
  const currentUploadFolderId = useCallback(() => {
    if (selectedFolderId === SEL_ALL || selectedFolderId === SEL_UNCAT) return null;
    return selectedFolderId;
  }, [selectedFolderId]);

  // Self-heal: if the selected folder was deleted by another
  // tab (or via a subtree delete), snap back to All.
  useEffect(() => {
    if (selectedFolderId === SEL_ALL || selectedFolderId === SEL_UNCAT) return;
    if (!foldersById.has(selectedFolderId)) {
      setSelectedFolderId(SEL_ALL);
    }
  }, [foldersById, selectedFolderId]);

  const toggleExpanded = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(folderId)) n.delete(folderId); else n.add(folderId);
      return n;
    });
  }, []);

  const select = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
  }, []);

  return {
    documents,
    videos,
    folders,
    loading,
    selectedFolderId,
    expanded,
    tree,
    foldersById,
    folderPathById,
    uncatCount,
    filteredDocs,
    filteredVideos,
    breadcrumb,
    currentUploadFolderId,
    setDocuments,
    setVideos,
    setFolders,
    setSelectedFolderId,
    setExpanded,
    loadAll,
    select,
    toggleExpanded,
  };
}
