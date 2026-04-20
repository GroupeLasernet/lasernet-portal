'use client';

// ============================================================
// /admin/files
// ------------------------------------------------------------
// Documents live in Google Drive (Shared Drive) — managed by
// /api/files/documents. Videos are Vimeo links — managed by
// /api/files/videos. Organization happens entirely in the
// portal via the category/subCategory columns on each row —
// Drive stays flat (it's just storage).
//
// UI layout:
//   • Left sidebar = folder tree (category → subCategory)
//   • Right pane   = documents + videos filtered to the
//                    currently-selected folder
//   • Drag a file/video row onto a folder to move it
//   • Upload button uploads into the selected folder
//   • "+ New folder" creates an empty folder you can drop
//     things into (folder persists once something lands in it)
//
// Rewritten 2026-04-20 to replace the flat-list + dropdown
// filters with a proper folder tree.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';
import PageHeader from '@/components/PageHeader';

// Sentinel selection values
const SEL_ALL = '__all__';     // no filter
const SEL_UNCAT = '__uncat__'; // category IS NULL

interface BusinessRef {
  id: string;
  displayName?: string;
  name?: string;
}

interface FileAssetRow {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  subCategory: string | null;
  scope: 'internal' | 'client';
  managedClientId: string | null;
  localBusinessId: string | null;
  managedClient: BusinessRef | null;
  localBusiness: BusinessRef | null;
  uploadedAt: string;
}

interface VideoAssetRow {
  id: string;
  title: string;
  vimeoUrl: string;
  vimeoId: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  scope: 'internal' | 'client';
  managedClientId: string | null;
  localBusinessId: string | null;
  managedClient: BusinessRef | null;
  localBusiness: BusinessRef | null;
  uploadedAt: string;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// Build the { category: [subCategories...] } tree from the current
// docs + videos + any empty folders the user created in this session.
function buildTree(
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

type DragPayload = { kind: 'doc' | 'video'; id: string };

export default function AdminFilesPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';
  const { toast } = useToast();

  const [documents, setDocuments] = useState<FileAssetRow[]>([]);
  const [videos, setVideos] = useState<VideoAssetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree selection: category can be SEL_ALL / SEL_UNCAT / a real category name
  const [selCat, setSelCat] = useState<string>(SEL_ALL);
  const [selSub, setSelSub] = useState<string | null>(null);

  // User-created empty folders (vanish on reload unless populated)
  const [ephemeralCats, setEphemeralCats] = useState<string[]>([]);
  const [ephemeralSubs, setEphemeralSubs] = useState<Record<string, string[]>>({});

  // Tree expand/collapse state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modal state
  const [editingDoc, setEditingDoc] = useState<FileAssetRow | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoAssetRow | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // ── Filtering by tree selection ─────────────────────────
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

  // ── Upload (documents) ──────────────────────────────────
  const handleFileChosen = useCallback(async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('scope', 'internal'); // editable after upload
    // If a real folder is selected, pre-categorize the upload
    if (selCat !== SEL_ALL && selCat !== SEL_UNCAT) {
      form.append('category', selCat);
      if (selSub) form.append('subCategory', selSub);
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

  // ── Delete ──────────────────────────────────────────────
  const deleteDocument = useCallback(async (row: FileAssetRow) => {
    if (!confirm(t('files', 'confirmDeleteDoc'))) return;
    try {
      const res = await fetch(`/api/files/documents/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      toast.saved();
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  }, [loadAll, t, toast]);

  const deleteVideo = useCallback(async (row: VideoAssetRow) => {
    if (!confirm(t('files', 'confirmDeleteVideo'))) return;
    try {
      const res = await fetch(`/api/files/videos/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      toast.saved();
      loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  }, [loadAll, t, toast]);

  // ── Move (drag-drop onto a folder node) ─────────────────
  // targetCat === null  → Uncategorized
  // targetCat === 'X'   → category X, subCategory = targetSub (or null)
  const moveAsset = useCallback(async (
    kind: 'doc' | 'video',
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
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { kind, id } = JSON.parse(raw) as DragPayload;
      moveAsset(kind, id, targetCat, targetSub);
    } catch {
      /* ignore malformed */
    }
  }, [moveAsset]);

  // ── New folder / subfolder ──────────────────────────────
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

  // ── Breadcrumb label ────────────────────────────────────
  const breadcrumb = useMemo(() => {
    if (selCat === SEL_ALL) return fr ? 'Tous les fichiers' : 'All files';
    if (selCat === SEL_UNCAT) return fr ? 'Sans catégorie' : 'Uncategorized';
    return selSub ? `${selCat} › ${selSub}` : selCat;
  }, [selCat, selSub, fr]);

  // ── Render ──────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={t('files', 'title')}
        subtitle={t('files', 'subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  handleFileChosen(f);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary flex items-center gap-2"
              title={
                selCat !== SEL_ALL && selCat !== SEL_UNCAT
                  ? (fr ? `Téléverser dans: ${breadcrumb}` : `Upload into: ${breadcrumb}`)
                  : undefined
              }
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {t('files', 'uploadFile')}
            </button>
            <button
              type="button"
              onClick={() => setAddingVideo(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('files', 'addVideo')}
            </button>
          </div>
        }
      />

      <div className="flex gap-4 items-start">
        {/* ── Sidebar tree ─────────────────────── */}
        <FolderSidebar
          tree={tree}
          selCat={selCat}
          selSub={selSub}
          onSelect={(cat, sub) => { setSelCat(cat); setSelSub(sub); }}
          expanded={expanded}
          onToggle={toggleExpanded}
          onCreateCategory={createCategory}
          onCreateSubcategory={createSubcategory}
          onDrop={handleDrop}
          uncatCount={uncatCount}
          totalCount={documents.length + videos.length}
          fr={fr}
        />

        {/* ── Main pane ────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 text-sm">
            {selCat !== SEL_ALL && (
              <>
                <button
                  type="button"
                  onClick={() => { setSelCat(SEL_ALL); setSelSub(null); }}
                  className="text-xs text-gray-500 hover:text-brand-600 dark:hover:text-brand-300 underline underline-offset-2"
                >
                  {fr ? 'Tous' : 'All'}
                </button>
                <span className="text-gray-400">›</span>
              </>
            )}
            <span className="font-medium text-gray-800 dark:text-gray-100">{breadcrumb}</span>
          </div>

          {/* Documents */}
          <div className="card mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {t('files', 'documents')}
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                  {selCat === SEL_ALL
                    ? documents.length
                    : `${filteredDocs.length}/${documents.length}`}
                </span>
              </h2>
            </div>

            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400 italic">Loading…</div>
            ) : documents.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                {t('files', 'noDocuments')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'fileName')}</th>
                      <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common', 'size')}</th>
                      <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'category')}</th>
                      <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'scope')}</th>
                      <th className="text-left pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('files', 'uploaded')}</th>
                      <th className="text-right pb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common', 'actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                          {fr ? 'Aucun document dans ce dossier.' : 'No documents in this folder.'}
                        </td>
                      </tr>
                    ) : (
                      filteredDocs.map((file) => (
                        <tr
                          key={file.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              'application/json',
                              JSON.stringify({ kind: 'doc', id: file.id } satisfies DragPayload),
                            );
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-move"
                          title={fr ? 'Glisser pour déplacer' : 'Drag to move'}
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="font-medium text-sm">{file.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-sm text-gray-600 dark:text-gray-400">{formatSize(file.sizeBytes)}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5">
                              {file.category && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">{file.category}</span>}
                              {file.subCategory && <span className="text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-1 rounded-full">{file.subCategory}</span>}
                            </div>
                          </td>
                          <td className="py-3 text-xs">
                            {file.scope === 'client' ? (
                              <span className="text-brand-700 dark:text-brand-300">
                                {file.managedClient?.displayName || file.localBusiness?.name || t('files', 'scopeClient')}
                              </span>
                            ) : (
                              <span className="text-gray-500 dark:text-gray-400">{t('files', 'scopeInternal')}</span>
                            )}
                          </td>
                          <td className="py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(file.uploadedAt)}</td>
                          <td className="py-3 text-right">
                            <a
                              href={`/api/files/documents/${file.id}/download`}
                              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm font-medium mr-3"
                              download={file.name}
                            >
                              {t('files', 'download')}
                            </a>
                            <button
                              type="button"
                              onClick={() => setEditingDoc(file)}
                              className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 text-sm font-medium mr-3"
                            >
                              {t('common', 'edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDocument(file)}
                              className="text-red-500 hover:text-red-600 text-sm font-medium"
                            >
                              {t('common', 'delete')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Videos */}
          <div className="card">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {t('files', 'videos')}
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                  {selCat === SEL_ALL
                    ? videos.length
                    : `${filteredVideos.length}/${videos.length}`}
                </span>
              </h2>
            </div>

            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400 italic">Loading…</div>
            ) : videos.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                {t('files', 'noVideos')}
              </p>
            ) : filteredVideos.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                {fr ? 'Aucune vidéo dans ce dossier.' : 'No videos in this folder.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify({ kind: 'video', id: video.id } satisfies DragPayload),
                      );
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-md dark:shadow-gray-900/50 transition-shadow cursor-move"
                    title={fr ? 'Glisser pour déplacer' : 'Drag to move'}
                  >
                    <div className="aspect-video bg-black">
                      {video.vimeoId ? (
                        <iframe
                          src={`https://player.vimeo.com/video/${video.vimeoId}`}
                          className="w-full h-full"
                          allow="autoplay; fullscreen; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <a href={video.vimeoUrl} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center text-white text-sm hover:underline">
                          Open on Vimeo →
                        </a>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-sm flex-1">{video.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingVideo(video)}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {t('common', 'edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteVideo(video)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            {t('common', 'delete')}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {[video.category, video.subCategory].filter(Boolean).join(' • ')}
                        {video.category || video.subCategory ? ' • ' : ''}
                        {formatDate(video.uploadedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────── */}
      {editingDoc && (
        <EditDocumentModal
          row={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={() => { setEditingDoc(null); loadAll(); }}
        />
      )}
      {(editingVideo || addingVideo) && (
        <VideoModal
          row={editingVideo}
          onClose={() => { setEditingVideo(null); setAddingVideo(false); }}
          onSaved={() => { setEditingVideo(null); setAddingVideo(false); loadAll(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// FolderSidebar — the left tree: All / Uncategorized / categories
// ============================================================
function FolderSidebar({
  tree, selCat, selSub, onSelect, expanded, onToggle,
  onCreateCategory, onCreateSubcategory, onDrop,
  uncatCount, totalCount, fr,
}: {
  tree: Record<string, string[]>;
  selCat: string;
  selSub: string | null;
  onSelect: (cat: string, sub: string | null) => void;
  expanded: Set<string>;
  onToggle: (cat: string) => void;
  onCreateCategory: () => void;
  onCreateSubcategory: (cat: string) => void;
  onDrop: (e: React.DragEvent, cat: string | null, sub: string | null) => void;
  uncatCount: number;
  totalCount: number;
  fr: boolean;
}) {
  const categories = Object.keys(tree).sort((a, b) => a.localeCompare(b));

  return (
    <aside className="w-56 shrink-0 card p-3 sticky top-4 self-start max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 px-1 tracking-wide">
        {fr ? 'Dossiers' : 'Folders'}
      </div>

      <div className="flex flex-col gap-0.5">
        {/* All */}
        <FolderNode
          label={fr ? 'Tous les fichiers' : 'All files'}
          icon="all"
          active={selCat === SEL_ALL}
          count={totalCount}
          onClick={() => onSelect(SEL_ALL, null)}
          droppable={false}
        />

        {/* Uncategorized (only if there actually is anything uncategorized) */}
        {uncatCount > 0 && (
          <FolderNode
            label={fr ? 'Sans catégorie' : 'Uncategorized'}
            icon="uncat"
            active={selCat === SEL_UNCAT}
            count={uncatCount}
            onClick={() => onSelect(SEL_UNCAT, null)}
            droppable
            onDrop={(e) => onDrop(e, null, null)}
          />
        )}

        {/* Categories */}
        {categories.map((cat) => {
          const subs = tree[cat];
          const isExpanded = expanded.has(cat);
          const isActiveCat = selCat === cat && selSub == null;
          return (
            <div key={cat}>
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onToggle(cat)}
                  className="px-1.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
                <FolderNode
                  label={cat}
                  icon="folder"
                  active={isActiveCat}
                  onClick={() => onSelect(cat, null)}
                  droppable
                  onDrop={(e) => onDrop(e, cat, null)}
                  flexOne
                />
              </div>

              {isExpanded && (
                <div className="ml-5 flex flex-col gap-0.5 mt-0.5 border-l border-gray-100 dark:border-gray-700 pl-1">
                  {subs.map((sub) => (
                    <FolderNode
                      key={sub}
                      label={sub}
                      icon="subfolder"
                      active={selCat === cat && selSub === sub}
                      onClick={() => onSelect(cat, sub)}
                      droppable
                      onDrop={(e) => onDrop(e, cat, sub)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onCreateSubcategory(cat)}
                    className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-2 py-1 text-left"
                  >
                    + {fr ? 'Nouveau sous-dossier' : 'New subfolder'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onCreateCategory}
          className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 px-3 py-2 text-left mt-2 border-t border-gray-100 dark:border-gray-700 pt-2"
        >
          + {fr ? 'Nouveau dossier' : 'New folder'}
        </button>
      </div>
    </aside>
  );
}

function FolderNode({
  label, icon, active, count, onClick,
  droppable, onDrop, flexOne,
}: {
  label: string;
  icon: 'all' | 'uncat' | 'folder' | 'subfolder';
  active: boolean;
  count?: number;
  onClick: () => void;
  droppable: boolean;
  onDrop?: (e: React.DragEvent) => void;
  flexOne?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const className =
    `text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
      active
        ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
        : hover
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 ring-1 ring-brand-300 dark:ring-brand-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300'
    } ${flexOne ? 'flex-1' : 'w-full'}`;
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHover(true); } : undefined}
      onDragLeave={droppable ? () => setHover(false) : undefined}
      onDrop={droppable && onDrop ? (e) => { setHover(false); onDrop(e); } : undefined}
      className={className}
    >
      <FolderIcon variant={icon} />
      <span className="truncate flex-1">{label}</span>
      {count != null && (
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{count}</span>
      )}
    </button>
  );
}

function FolderIcon({ variant }: { variant: 'all' | 'uncat' | 'folder' | 'subfolder' }) {
  if (variant === 'all') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  if (variant === 'uncat') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (variant === 'subfolder') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h4l2 3h10a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    );
  }
  // folder
  return (
    <svg className="w-4 h-4 shrink-0 text-brand-500 dark:text-brand-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

// ============================================================
// EditDocumentModal — rename + recategorize a document row
// ============================================================
function EditDocumentModal({ row, onClose, onSaved }: { row: FileAssetRow; onClose: () => void; onSaved: () => void; }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [name, setName] = useState(row.name);
  const [category, setCategory] = useState(row.category || '');
  const [subCategory, setSubCategory] = useState(row.subCategory || '');
  const [scope, setScope] = useState<'internal' | 'client'>(row.scope);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/files/documents/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category: category || null, subCategory: subCategory || null, scope }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      toast.saved();
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [row.id, name, category, subCategory, scope, onSaved, toast]);

  return (
    <ModalShell title={t('files', 'editDocument')} onClose={onClose}>
      <Field label={t('files', 'fileName')}>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
      </Field>
      <Field label={t('files', 'category')}>
        <input value={category} onChange={(e) => setCategory(e.target.value)} className="input-field" />
      </Field>
      <Field label={t('files', 'subCategory')}>
        <input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className="input-field" />
      </Field>
      <Field label={t('files', 'scope')}>
        <select value={scope} onChange={(e) => setScope(e.target.value as 'internal' | 'client')} className="input-field">
          <option value="internal">{t('files', 'scopeInternal')}</option>
          <option value="client">{t('files', 'scopeClient')}</option>
        </select>
      </Field>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">{t('files', 'cancel')}</button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? '…' : t('files', 'save')}
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================
// VideoModal — create OR edit a Vimeo video entry
// ============================================================
function VideoModal({ row, onClose, onSaved }: { row: VideoAssetRow | null; onClose: () => void; onSaved: () => void; }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const editing = !!row;
  const [title, setTitle] = useState(row?.title || '');
  const [vimeoUrl, setVimeoUrl] = useState(row?.vimeoUrl || '');
  const [description, setDescription] = useState(row?.description || '');
  const [category, setCategory] = useState(row?.category || '');
  const [subCategory, setSubCategory] = useState(row?.subCategory || '');
  const [scope, setScope] = useState<'internal' | 'client'>(row?.scope || 'internal');
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (!title.trim() || !vimeoUrl.trim()) {
      toast.error(t('files', 'title_label') + ' + ' + t('files', 'vimeoUrl'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title, vimeoUrl, description: description || null,
        category: category || null, subCategory: subCategory || null, scope,
      };
      const res = await fetch(
        editing ? `/api/files/videos/${row!.id}` : '/api/files/videos',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      toast.saved();
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [editing, row, title, vimeoUrl, description, category, subCategory, scope, onSaved, toast, t]);

  return (
    <ModalShell title={editing ? t('files', 'editVideo') : t('files', 'addVideo')} onClose={onClose}>
      <Field label={t('files', 'title_label')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
      </Field>
      <Field label={t('files', 'vimeoUrl')}>
        <input
          value={vimeoUrl}
          onChange={(e) => setVimeoUrl(e.target.value)}
          placeholder="https://vimeo.com/123456789"
          className="input-field"
        />
      </Field>
      <Field label={t('files', 'description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('files', 'category')}>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="input-field" />
        </Field>
        <Field label={t('files', 'subCategory')}>
          <input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className="input-field" />
        </Field>
      </div>
      <Field label={t('files', 'scope')}>
        <select value={scope} onChange={(e) => setScope(e.target.value as 'internal' | 'client')} className="input-field">
          <option value="internal">{t('files', 'scopeInternal')}</option>
          <option value="client">{t('files', 'scopeClient')}</option>
        </select>
      </Field>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">{t('files', 'cancel')}</button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? '…' : t('files', 'save')}
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================
// Small reusable bits
// ============================================================
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode; }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
