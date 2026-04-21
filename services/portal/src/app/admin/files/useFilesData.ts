'use client';

// ============================================================
// useFilesData — all data I/O + tree/selection state for
// /admin/files. The page component only needs to wire the
// returned values into JSX + own modal state.
//
// Folders are PERSISTED to the DB via /api/files/folders —
// they survive page reload even when empty, and every folder
// supports rename + delete.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/lib/ToastContext';
import type {
  AssetKind,
  DragPayload,
  FileAssetRow,
  FileFolderRow,
  VideoAssetRow,
} from './types';
import { SEL_ALL, SEL_UNCAT } from './types';
import { buildTree } from './utils';

export function useFilesData(fr: boolean, tDelete: { doc: string; video: string }) {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<FileAssetRow[]>([]);
  const [videos, setVideos] = useState<VideoAssetRow[]>([]);
  const [folders, setFolders] = useState<FileFolderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree selection
  const [selCat, setSelCat] = useState<string>(SEL_ALL);
  const [selSub, setSelSub] = useState<string | null>(null);

  // Expand/collapse
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

  const uncatCount = useMemo(
    () =>
      documents.filter((d) => !d.category).length +
      videos.filter((v) => !v.category).length,
    [documents, videos],
  );

  const match = useCallback(
    (r: { category: string | null; subCategory: string | null }) => {
      if (selCat === SEL_ALL) return true;
      if (selCat === SEL_UNCAT) return r.category == null;
      if (r.category !== selCat) return false;
      if (selSub != null && r.subCategory !== selSub) return false;
      return true;
    },
    [selCat, selSub],
  );

  const filteredDocs = useMemo(() => documents.filter(match), [documents, match]);
  const filteredVideos = useMemo(() => videos.filter(match), [videos, match]);

  const breadcrumb = useMemo(() => {
    if (selCat === SEL_ALL) return fr ? 'Tous les fichiers' : 'All files';
    if (selCat === SEL_UNCAT) return fr ? 'Sans catégorie' : 'Uncategorized';
    return selSub ? `${selCat} › ${selSub}` : selCat;
  }, [selCat, selSub, fr]);

  // ── Upload ──────────────────────────────────────────────
  // If caller passes a target cat/sub (e.g. drop from the OS onto a
  // folder node), that wins; otherwise we fall back to the currently
  // selected folder. Pass `null` explicitly to force "uncategorized".
  const uploadFile = useCallback(async (
    file: File,
    targetCat?: string | null,
    targetSub?: string | null,
  ) => {
    const cat =
      targetCat !== undefined
        ? targetCat
        : (selCat !== SEL_ALL && selCat !== SEL_UNCAT ? selCat : null);
    const sub = targetSub !== undefined ? targetSub : (cat ? selSub : null);

    const form = new FormData();
    form.append('file', file);
    form.append('scope', 'internal'); // editable after upload
    if (cat) {
      form.append('category', cat);
      if (sub) form.append('subCategory', sub);
    }
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
  }, [loadAll, toast, selCat, selSub]);

  // ── Delete (one handler for both kinds) ─────────────────
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

  // ── Move via PATCH to category/subCategory ──────────────
  const moveAsset = useCallback(async (
    kind: AssetKind,
    id: string,
    targetCat: string | null,
    targetSub: string | null,
  ) => {
    const endpoint = kind === 'doc' ? '/api/files/documents' : '/api/files/videos';
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: targetCat, subCategory: targetSub }),
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

  const handleDrop = useCallback((
    e: React.DragEvent,
    targetCat: string | null,
    targetSub: string | null,
  ) => {
    e.preventDefault();

    // Case 1 — OS file drop (drag from desktop / explorer): upload
    // every file into the target folder.
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        uploadFile(file, targetCat, targetSub);
      }
      return;
    }

    // Case 2 — in-page row drag: move the asset between folders.
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { kind, id } = JSON.parse(raw) as DragPayload;
      moveAsset(kind, id, targetCat, targetSub);
    } catch {
      /* ignore malformed */
    }
  }, [moveAsset, uploadFile]);

  // ── Folder CRUD (persisted) ─────────────────────────────
  const createCategory = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Create failed');
      }
      toast.saved();
      setExpanded((prev) => {
        const n = new Set(prev);
        n.add(clean);
        return n;
      });
      setSelCat(clean);
      setSelSub(null);
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
    }
  }, [loadAll, toast]);

  const createSubcategory = useCallback(async (cat: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean, parent: cat }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Create failed');
      }
      toast.saved();
      setExpanded((prev) => {
        const n = new Set(prev);
        n.add(cat);
        return n;
      });
      setSelCat(cat);
      setSelSub(clean);
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
    }
  }, [loadAll, toast]);

  // Rename a folder (top-level or sub). `parent` is null for
  // top-level, otherwise the parent category name. If the
  // folder doesn't exist in the DB yet (it's only implied by
  // a file/video's category/subCategory string), we first
  // create it, then rename — so "rename the default bucket"
  // still works.
  const renameFolder = useCallback(async (
    parent: string | null,
    oldName: string,
    newName: string,
  ) => {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;
    try {
      // Find or create the folder row.
      let folder = folders.find(
        (f) => f.name === oldName && (f.parent ?? null) === (parent ?? null),
      );
      if (!folder) {
        const createRes = await fetch('/api/files/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: oldName, parent: parent ?? undefined }),
        });
        if (!createRes.ok) {
          const data = await createRes.json().catch(() => ({}));
          throw new Error(data.error || 'Rename failed');
        }
        folder = await createRes.json();
      }
      const res = await fetch(`/api/files/folders/${folder!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Rename failed');
      }
      toast.saved();
      // Keep the selection pointing at the renamed folder.
      if (parent == null) {
        if (selCat === oldName) setSelCat(clean);
      } else {
        if (selCat === parent && selSub === oldName) setSelSub(clean);
      }
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Rename failed');
    }
  }, [folders, loadAll, toast, selCat, selSub]);

  const deleteFolder = useCallback(async (
    parent: string | null,
    name: string,
  ) => {
    const msg = fr
      ? `Supprimer le dossier "${name}" ? Les fichiers seront déplacés vers Sans catégorie.`
      : `Delete folder "${name}"? Any files inside will be moved to Uncategorized.`;
    if (!confirm(msg)) return;
    try {
      let folder = folders.find(
        (f) => f.name === name && (f.parent ?? null) === (parent ?? null),
      );
      if (!folder) {
        // Folder only exists via file columns — create then delete.
        const createRes = await fetch('/api/files/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parent: parent ?? undefined }),
        });
        if (!createRes.ok) {
          const data = await createRes.json().catch(() => ({}));
          throw new Error(data.error || 'Delete failed');
        }
        folder = await createRes.json();
      }
      const res = await fetch(`/api/files/folders/${folder!.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      toast.saved();
      // If we were viewing the folder we just nuked, go back to All.
      if (parent == null && selCat === name) {
        setSelCat(SEL_ALL);
        setSelSub(null);
      } else if (parent != null && selCat === parent && selSub === name) {
        setSelSub(null);
      }
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  }, [folders, loadAll, toast, selCat, selSub, fr]);

  const toggleExpanded = useCallback((cat: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat); else n.add(cat);
      return n;
    });
  }, []);

  const select = useCallback((cat: string, sub: string | null) => {
    setSelCat(cat);
    setSelSub(sub);
  }, []);

  return {
    // raw data
    documents,
    videos,
    loading,
    // tree + selection
    tree,
    uncatCount,
    selCat,
    selSub,
    expanded,
    filteredDocs,
    filteredVideos,
    breadcrumb,
    // actions
    loadAll,
    uploadFile,
    deleteAsset,
    handleDrop,
    createCategory,
    createSubcategory,
    renameFolder,
    deleteFolder,
    toggleExpanded,
    select,
  };
}
