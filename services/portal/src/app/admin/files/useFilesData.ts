'use client';

// ============================================================
// useFilesData — all data I/O + tree/selection state for
// /admin/files. The page component only needs to wire the
// returned values into JSX + own modal state.
//
// Folders are PERSISTED to the DB via /api/files/folders and
// form a self-referencing tree (FileFolder.parentId). Files
// and videos point at a folder via their folderId FK, so any
// folder can nest arbitrarily deep without schema changes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/lib/ToastContext';
import type {
  AssetKind,
  DragPayload,
  FileAssetRow,
  FileFolderRow,
  FolderNode,
  VideoAssetRow,
} from './types';
import { SEL_ALL, SEL_UNCAT } from './types';
import { buildTree, collectDescendantIds, findNode } from './utils';

export function useFilesData(fr: boolean, tDelete: { doc: string; video: string }) {
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

  // ── Upload ──────────────────────────────────────────────
  // If the caller passes `targetFolderId` (dropped onto a folder
  // node), that wins. `undefined` means "use the current
  // selection"; `null` means "uncategorized".
  const uploadFile = useCallback(async (
    file: File,
    targetFolderId?: string | null,
  ) => {
    const folderId =
      targetFolderId !== undefined ? targetFolderId : currentUploadFolderId();

    const form = new FormData();
    form.append('file', file);
    form.append('scope', 'internal'); // editable after upload
    if (folderId) form.append('folderId', folderId);

    try {
      const res = await fetch('/api/files/documents', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
      toast.saved();
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    }
  }, [loadAll, toast, currentUploadFolderId]);

  // ── Delete ──────────────────────────────────────────────
  const deleteAsset = useCallback(async (kind: AssetKind, id: string) => {
    const msg = kind === 'doc' ? tDelete.doc : tDelete.video;
    if (!confirm(msg)) return;
    const endpoint = kind === 'doc' ? '/api/files/documents' : '/api/files/videos';
    try {
      const res = await fetch(`${endpoint}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      toast.saved();
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  }, [loadAll, toast, tDelete.doc, tDelete.video]);

  // ── Move via PATCH folderId ─────────────────────────────
  const moveAsset = useCallback(async (
    kind: AssetKind,
    id: string,
    targetFolderId: string | null,
  ) => {
    const endpoint = kind === 'doc' ? '/api/files/documents' : '/api/files/videos';
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Move failed');
      }
      toast.saved();
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Move failed');
    }
  }, [loadAll, toast]);

  // Drop handler — same target format as moveAsset (folderId).
  const handleDrop = useCallback((
    e: React.DragEvent,
    targetFolderId: string | null,
  ) => {
    e.preventDefault();

    // Case 1 — OS file drop: upload every file into the target.
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        uploadFile(file, targetFolderId);
      }
      return;
    }

    // Case 2 — in-page row drag: move between folders.
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { kind, id } = JSON.parse(raw) as DragPayload;
      moveAsset(kind, id, targetFolderId);
    } catch {
      /* ignore malformed */
    }
  }, [moveAsset, uploadFile]);

  // ── Folder CRUD ─────────────────────────────────────────

  // Create a folder at any depth. parentId=null → top-level.
  const createFolder = useCallback(async (
    parentId: string | null,
    name: string,
  ) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean, parentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Create failed');
      }
      const created: FileFolderRow = await res.json();
      toast.saved();
      // Expand the parent so the new folder is visible.
      if (parentId) {
        setExpanded((prev) => {
          const n = new Set(prev);
          n.add(parentId);
          return n;
        });
      }
      setSelectedFolderId(created.id);
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
    }
  }, [loadAll, toast]);

  const renameFolder = useCallback(async (
    folderId: string,
    newName: string,
  ) => {
    const clean = newName.trim();
    if (!clean) return;
    const existing = foldersById.get(folderId);
    if (!existing) return;
    if (clean === existing.name) return;
    try {
      const res = await fetch(`/api/files/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Rename failed');
      }
      toast.saved();
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Rename failed');
    }
  }, [foldersById, loadAll, toast]);

  const deleteFolder = useCallback(async (folderId: string) => {
    const existing = foldersById.get(folderId);
    if (!existing) return;
    const msg = fr
      ? `Supprimer le dossier "${existing.name}" et tous ses sous-dossiers ? Les fichiers seront déplacés vers Sans catégorie.`
      : `Delete folder "${existing.name}" and all its subfolders? Any files inside will be moved to Uncategorized.`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/files/folders/${folderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      toast.saved();
      // If we were viewing any folder in the subtree we just
      // nuked, fall back to All. Easy way: if selected folder is
      // missing after refetch, useEffect below will reset it.
      if (selectedFolderId === folderId) {
        setSelectedFolderId(SEL_ALL);
      }
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  }, [foldersById, loadAll, toast, selectedFolderId, fr]);

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
    // raw data
    documents,
    videos,
    loading,
    // tree + selection
    tree,
    folderPathById,
    uncatCount,
    selectedFolderId,
    expanded,
    filteredDocs,
    filteredVideos,
    breadcrumb,
    // actions
    loadAll,
    uploadFile,
    deleteAsset,
    handleDrop,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleExpanded,
    select,
  };
}

export type UseFilesData = ReturnType<typeof useFilesData>;
