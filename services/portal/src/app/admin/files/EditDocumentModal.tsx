'use client';

// ============================================================
// EditDocumentModal — rename + reassign folder on an existing
// FileAsset. PATCHes /api/files/documents/:id.
// ============================================================

import { useCallback, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/lib/ToastContext';
import { FolderPicker } from './FolderPicker';
import { Field, ModalShell } from './ModalShell';
import type { FileAssetRow, FolderNode } from './types';

export function EditDocumentModal({
  row,
  folders,
  onClose,
  onSaved,
}: {
  row: FileAssetRow;
  folders: FolderNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [name, setName] = useState(row.name);
  const [folderId, setFolderId] = useState<string | null>(row.folderId);
  const [saving, setSaving] = useState(false);

  // NOTE: scope (internal/client) is intentionally NOT edited here.
  // It's determined elsewhere in the portal — do not add it back to
  // this modal without Hugo explicitly asking for it.
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/files/documents/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folderId }),
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
  }, [row.id, name, folderId, onSaved, toast]);

  return (
    <ModalShell title={t('files', 'editDocument')} onClose={onClose}>
      <Field label={t('files', 'fileName')}>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
      </Field>
      <Field label={t('files', 'category') || 'Folder'}>
        <FolderPicker folders={folders} value={folderId} onChange={setFolderId} />
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
