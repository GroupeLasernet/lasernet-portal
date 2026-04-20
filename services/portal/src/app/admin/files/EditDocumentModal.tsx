'use client';

// ============================================================
// EditDocumentModal — rename + recategorize + set scope on
// an existing FileAsset. PATCHes /api/files/documents/:id.
// ============================================================

import { useCallback, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';
import { Field, ModalShell } from './ModalShell';
import type { FileAssetRow } from './types';

export function EditDocumentModal({
  row,
  onClose,
  onSaved,
}: {
  row: FileAssetRow;
  onClose: () => void;
  onSaved: () => void;
}) {
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
        body: JSON.stringify({
          name,
          category: category || null,
          subCategory: subCategory || null,
          scope,
        }),
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
