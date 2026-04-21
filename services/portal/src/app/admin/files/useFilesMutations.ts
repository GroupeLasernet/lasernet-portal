'use client';

// ============================================================
// useFilesMutations — all API-calling actions for /admin/files.
// These functions live here (not in useFilesState) so state is
// purely about "what's rendered right now" and mutations are
// purely about "what happens on click/drop/submit".
//
// Every mutation calls `state.loadAll()` on success so the UI
// stays in sync with the DB. This is intentionally simple — we
// pay one extra round-trip per write and keep the code very
// obvious to debug.
// ============================================================

import { useCallback } from 'react';
import { useToast } from '@/lib/ToastContext';
import type { AssetKind, DragPayload, FileFolderRow } from './types';
import { SEL_ALL } from './types';
import type { FilesState } from './useFilesState';

export interface FilesMutations {
  uploadFile: (file: File, targetFolderId?: string | null) => Promise<void>;
  deleteAsset: (kind: AssetKind, id: string) => Promise<void>;
  moveAsset: (kind: AssetKind, id: string, targetFolderId: string | null) => Promise<void>;
  handleDrop: (e: React.DragEvent, targetFolderId: string | null) => void;
  createFolder: (parentId: string | null, name: string) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
}

export function useFilesMutations(
  state: FilesState,
  fr: boolean,
  tDelete: { doc: string; video: string },
): FilesMutations {
  const { toast } = useToast();
  const {
    foldersById,
    selectedFolderId,
    loadAll,
    currentUploadFolderId,
    setExpanded,
    setSelectedFolderId,
  } = state;

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
  }, [loadAll, toast, setExpanded, setSelectedFolderId]);

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
      // missing after refetch, the self-heal effect in useFilesState
      // will reset it anyway — this is just a faster path.
      if (selectedFolderId === folderId) {
        setSelectedFolderId(SEL_ALL);
      }
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  }, [foldersById, loadAll, toast, selectedFolderId, fr, setSelectedFolderId]);

  return {
    uploadFile,
    deleteAsset,
    moveAsset,
    handleDrop,
    createFolder,
    renameFolder,
    deleteFolder,
  };
}
