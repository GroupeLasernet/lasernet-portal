'use client';

// ============================================================
// DocumentsTable — draggable rows of FileAsset records.
// Emits callbacks to the parent; knows nothing about fetch/state.
// ============================================================

import { useLanguage } from '@/lib/LanguageContext';
import type { DragPayload, FileAssetRow } from './types';
import { SEL_ALL } from './types';
import { formatDate, formatSize } from './utils';

export function DocumentsTable({
  all,
  filtered,
  loading,
  selCat,
  fr,
  onEdit,
  onDelete,
}: {
  all: FileAssetRow[];
  filtered: FileAssetRow[];
  loading: boolean;
  selCat: string;
  fr: boolean;
  onEdit: (row: FileAssetRow) => void;
  onDelete: (row: FileAssetRow) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          {t('files', 'documents')}
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
            {selCat === SEL_ALL ? all.length : `${filtered.length}/${all.length}`}
          </span>
        </h2>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400 italic">Loading…</div>
      ) : all.length === 0 ? (
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                    {fr ? 'Aucun document dans ce dossier.' : 'No documents in this folder.'}
                  </td>
                </tr>
              ) : (
                filtered.map((file) => (
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
                        onClick={() => onEdit(file)}
                        className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 text-sm font-medium mr-3"
                      >
                        {t('common', 'edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(file)}
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
  );
}
