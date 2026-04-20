'use client';

// ============================================================
// /admin/files
// ------------------------------------------------------------
// Documents live in Google Drive (Shared Drive) — managed by
// /api/files/documents. Videos are Vimeo links — managed by
// /api/files/videos. Both are category/sub-category filterable
// and can be scoped "internal" or linked to a business.
//
// Everything here is real: Upload / Edit / Delete all call the
// API and show a toast on success / failure. No more mock-data.
//
// Added 2026-04-20.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';
import PageHeader from '@/components/PageHeader';

const ALL = '__all__';

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

export default function AdminFilesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [documents, setDocuments] = useState<FileAssetRow[]>([]);
  const [videos, setVideos] = useState<VideoAssetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [docCat, setDocCat] = useState(ALL);
  const [docSub, setDocSub] = useState(ALL);
  const [vidCat, setVidCat] = useState(ALL);
  const [vidSub, setVidSub] = useState(ALL);

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

  // ── Derived / filtering ─────────────────────────────────
  const filteredDocs = useMemo(() => documents.filter((d) => {
    if (docCat !== ALL && d.category !== docCat) return false;
    if (docSub !== ALL && d.subCategory !== docSub) return false;
    return true;
  }), [documents, docCat, docSub]);

  const filteredVideos = useMemo(() => videos.filter((v) => {
    if (vidCat !== ALL && v.category !== vidCat) return false;
    if (vidSub !== ALL && v.subCategory !== vidSub) return false;
    return true;
  }), [videos, vidCat, vidSub]);

  // ── Upload (documents) ──────────────────────────────────
  const handleFileChosen = useCallback(async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('scope', 'internal'); // Sane default — editable after upload
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
  }, [loadAll, toast]);

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
                  e.target.value = ''; // allow re-uploading same file
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary flex items-center gap-2"
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

      {/* ── Documents ─────────────────────────────── */}
      <div className="card mb-6">
        <ContainerHeader
          title={t('files', 'documents')}
          count={filteredDocs.length}
          totalCount={documents.length}
          items={documents}
          cat={docCat}
          setCat={setDocCat}
          sub={docSub}
          setSub={setDocSub}
        />

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
                      No documents match the filters.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((file) => (
                    <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
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

      {/* ── Videos ───────────────────────────────── */}
      <div className="card">
        <ContainerHeader
          title={t('files', 'videos')}
          count={filteredVideos.length}
          totalCount={videos.length}
          items={videos}
          cat={vidCat}
          setCat={setVidCat}
          sub={vidSub}
          setSub={setVidSub}
        />

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400 italic">Loading…</div>
        ) : videos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
            {t('files', 'noVideos')}
          </p>
        ) : filteredVideos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
            No videos match the filters.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVideos.map((video) => (
              <div key={video.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-md dark:shadow-gray-900/50 transition-shadow">
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
// ContainerHeader — title + category dropdowns
// ============================================================
interface Filterable { category: string | null; subCategory: string | null; }

function ContainerHeader<T extends Filterable>({
  title, count, totalCount, items, cat, setCat, sub, setSub,
}: {
  title: string;
  count: number;
  totalCount: number;
  items: readonly T[];
  cat: string;
  setCat: (v: string) => void;
  sub: string;
  setSub: (v: string) => void;
}) {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[])).sort(),
    [items],
  );
  const subCategories = useMemo(() => {
    const source = cat === ALL ? items : items.filter((i) => i.category === cat);
    return Array.from(new Set(source.map((i) => i.subCategory).filter(Boolean) as string[])).sort();
  }, [items, cat]);

  const filtered = cat !== ALL || sub !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        {title}
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
          {filtered ? `${count}/${totalCount}` : totalCount}
        </span>
      </h2>

      <FilterSelect
        label={t('files', 'category')}
        value={cat}
        onChange={(v) => { setCat(v); setSub(ALL); }}
        allLabel={fr ? 'Toutes' : 'All'}
        options={categories}
      />
      <FilterSelect
        label={t('files', 'subCategory')}
        value={sub}
        onChange={setSub}
        allLabel={fr ? 'Toutes' : 'All'}
        options={subCategories}
        disabled={subCategories.length === 0}
      />

      {filtered && (
        <button
          type="button"
          onClick={() => { setCat(ALL); setSub(ALL); }}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 underline underline-offset-2"
        >
          {fr ? 'Effacer' : 'Clear'}
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, allLabel, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
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
