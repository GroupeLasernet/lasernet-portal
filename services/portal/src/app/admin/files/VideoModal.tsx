'use client';

// ============================================================
// VideoModal — create OR edit a Vimeo-linked VideoAsset.
// `row` is null when adding a new one.
// ============================================================

import { useCallback, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';
import { Field, ModalShell } from './ModalShell';
import type { VideoAssetRow } from './types';

export function VideoModal({
  row,
  onClose,
  onSaved,
}: {
  row: VideoAssetRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
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
        title,
        vimeoUrl,
        description: description || null,
        category: category || null,
        subCategory: subCategory || null,
        scope,
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
