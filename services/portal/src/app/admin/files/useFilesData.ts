'use client';

// ============================================================
// useFilesData — all data I/O + tree/selection state for
// /admin/files. The page component only needs to wire the
// returned values into JSX + own modal state.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/lib/ToastContext';
import type {
  AssetKind,
  DragPayload,
  FileAssetRow,
  VideoAssetRow,
} from './types';
import { SEL_ALL, SEL_UNCAT } from './types';
import { buildTree } from './utils';

export function useFilesData(fr: boolean, tDelete: { doc: string; video: string }) {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<FileAssetRow[]>([]);
  const [videos, setVideos] = useState<VideoAssetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree selection
  const [selCat, setSelCat] = useState<string>(SEL_ALL);
  const [selSub, setSelSub] = useState<string | null>(null);

  // User-created empty folders (vanish on reload unless populated)
  const [ephemeralCats, setEphemeralCats] = useState<string[]>([]);
  const [ephemeralSubs, setEphemeralSubs] = useState<Record<string, string[]>>({});

  // Expand/collapse
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Load ────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, vRes] = await Promise.all([
        fetch('/api/files/documents', { cache: 'no-store' }),
        fetch('/api/files/videos', { cache: 'no-store' }),
      ]);
      const dData = dRes.ok ? await dRes.json() : [];
      const vData = vRes.ok ? await vRes.json() : [];
      setDocuments(dData);
      setVideos(vData);
    } catch {
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived state ───────────────────────────────────────
  const tree = useMemo(
    () => buildTree(documents, videos, ephemeralCats, ephemeralSubs),
    [documents, videos, ephemeralCats, ephemeralSubs],
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

  // ── New folder / subfolder (ephemeral until populated) ──
  const createCategory = useCallback(() => {
    const name = window.prompt(fr ? 'Nom du nouveau dossier' : 'New folder name');
    if (!name) return;
    const clean = name.trim();
    if (!clean) return;
    setEphemeralCats((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setExpanded((prev) => {
      const n = new Set(prev);
      n.add(clean);
      return n;
    });
    setSelCat(clean);
    setSelSub(null);
  }, [fr]);

  const createSubcategory = useCallback((cat: string) => {
    const name = window.prompt(
      fr ? `Nouveau sous-dossier dans « ${cat} »` : `New subfolder inside "${cat}"`,
    );
    if (!name) return;
    const clean = name.trim();
    if (!clean) return;
    setEphemeralSubs((prev) => ({
      ...prev,
      [cat]: prev[cat]?.includes(clean) ? prev[cat] : [...(prev[cat] || []), clean],
    }));
    setExpanded((prev) => {
      const n = new Set(prev);
      n.add(cat);
      return n;
    });
    setSelCat(cat);
    setSelSub(clean);
  }, [fr]);

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
    toggleExpanded,
    select,
  };
}
