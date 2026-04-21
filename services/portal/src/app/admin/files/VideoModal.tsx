'use client';

// ============================================================
// VideoModal — create OR edit a Vimeo-linked VideoAsset.
// `row` is null when adding a new one.
// ============================================================

import { useCallback, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';
import { FolderPicker } from './FolderPicker';
import { SkuPicker, type SkuPickerValue } from './SkuPicker';
import { Field, ModalShell } from './ModalShell';
import type { FolderNode, VideoAssetRow } from './types';

export function VideoModal({
  row,
  folders,
  onClose,
  onSaved,
}: {
  row: VideoAssetRow | null;
  folders: FolderNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const editing = !!row;
  const [title, setTitle] = useState(row?.title || '');
  const [vimeoUrl, setVimeoUrl] = useState(row?.vimeoUrl || '');
  const [description, setDescription] = useState(row?.description || '');
  const [folderId, setFolderId] = useState<string | null>(row?.folderId ?? null);
  const [scope, setScope] = useState<'internal' | 'client'>(row?.scope || 'internal');
  const [skus, setSkus] = useState<SkuPickerValue>({
    skuIds: row?.skuIds ?? [],
    skuNames: (row?.skus ?? []).map((s) => s.name),
  });
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (!title.trim() || !vimeoUrl.trim()) {
      toast.error(t('files', 'title_label') + ' + ' + t('files', 'vimeoUrl'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        vimeoUrl,
        description: description || null,
        folderId,
        scope,
        skuIds: skus.skuIds,
        skuNames: skus.skuNames,
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
  }, [editing, row, title, vimeoUrl, description, folderId, scope, skus.skuIds, skus.skuNames, onSaved, toast, t]);

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
      <Field label={t('files', 'category') || 'Folder'}>
        <FolderPicker folders={folders} value={folderId} onChange={setFolderId} />
      </Field>
      <Field label={t('files', 'scope')}>
        <select value={scope} onChange={(e) => setScope(e.target.value as 'internal' | 'client')} className="input-field">
          <option value="internal">{t('files', 'scopeInternal')}</option>
          <option value="client">{t('files', 'scopeClient')}</option>
        </select>
      </Field>
      <Field label={t('files', 'linkedSkus') || 'Linked SKUs'}>
        <SkuPicker value={skus} onChange={setSkus} />
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
