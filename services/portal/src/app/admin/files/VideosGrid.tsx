'use client';

// ============================================================
// VideosGrid — draggable cards for Vimeo-linked VideoAsset rows.
// Same contract as DocumentsTable: pure presentation + callbacks.
//
// Local UI state (stays here, not in useFilesData):
//   • sort  — active sort order for the cards (applied to
//     `filtered` before rendering). Default 'newest'.
//
// Container kebab (top-right of the h2): Add-video + divider +
// sort options. "Add a Vimeo video" re-uses the parent's add-
// video drawer via the `onAddVideo` callback.
// ============================================================

import { useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { ContainerMenu, type ContainerMenuItem } from './ContainerMenu';
import type { DragPayload, VideoAssetRow } from './types';
import { SEL_ALL } from './types';
import { formatDate } from './utils';

type VideoSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

function applyVideoSort(rows: VideoAssetRow[], sort: VideoSort): VideoAssetRow[] {
  const next = rows.slice();
  const titleCmp = (a: VideoAssetRow, b: VideoAssetRow) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  const dateCmp = (a: VideoAssetRow, b: VideoAssetRow) =>
    new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
  switch (sort) {
    case 'name-asc':  next.sort(titleCmp); break;
    case 'name-desc': next.sort((a, b) => -titleCmp(a, b)); break;
    case 'oldest':    next.sort(dateCmp); break;
    case 'newest':    default: next.sort((a, b) => -dateCmp(a, b)); break;
  }
  return next;
}

export function VideosGrid({
  all,
  filtered,
  loading,
  selectedFolderId,
  folderPathById,
  fr,
  onEdit,
  onDelete,
  onAddVideo,
}: {
  all: VideoAssetRow[];
  filtered: VideoAssetRow[];
  loading: boolean;
  selectedFolderId: string;
  folderPathById?: Map<string, string[]>;
  fr: boolean;
  onEdit: (row: VideoAssetRow) => void;
  onDelete: (row: VideoAssetRow) => void;
  /** Opens the page-level "Add a Vimeo video" drawer. */
  onAddVideo?: () => void;
}) {
  const { t } = useLanguage();
  const [sort, setSort] = useState<VideoSort>('newest');
  const sorted = useMemo(() => applyVideoSort(filtered, sort), [filtered, sort]);

  const pathFor = (row: VideoAssetRow): string[] => {
    if (row.folderId && folderPathById?.get(row.folderId)) {
      return folderPathById.get(row.folderId)!;
    }
    const out: string[] = [];
    if (row.category) out.push(row.category);
    if (row.subCategory) out.push(row.subCategory);
    return out;
  };

  const menuItems: ContainerMenuItem[] = [
    ...(onAddVideo
      ? [{ kind: 'item' as const, label: t('files', 'menuAddVideo'), onClick: onAddVideo }]
      : []),
    ...(onAddVideo ? [{ kind: 'divider' as const }] : []),
    { kind: 'item', label: t('files', 'sortByNewest'),   onClick: () => setSort('newest'),    checked: sort === 'newest' },
    { kind: 'item', label: t('files', 'sortByOldest'),   onClick: () => setSort('oldest'),    checked: sort === 'oldest' },
    { kind: 'item', label: t('files', 'sortByNameAsc'),  onClick: () => setSort('name-asc'),  checked: sort === 'name-asc' },
    { kind: 'item', label: t('files', 'sortByNameDesc'), onClick: () => setSort('name-desc'), checked: sort === 'name-desc' },
  ];

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          {t('files', 'videos')}
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
            {selectedFolderId === SEL_ALL ? all.length : `${filtered.length}/${all.length}`}
          </span>
        </h2>
        <div className="ml-auto">
          <ContainerMenu items={menuItems} ariaLabel={t('files', 'menuLabel')} />
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400 italic">Loading…</div>
      ) : all.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
          {t('files', 'noVideos')}
        </p>
      ) : sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
          {fr ? 'Aucune vidéo dans ce dossier.' : 'No videos in this folder.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((video) => {
            const path = pathFor(video);
            return (
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
                        onClick={() => onEdit(video)}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {t('common', 'edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(video)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        {t('common', 'delete')}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {path.length > 0 && <>{path.join(' › ')} • </>}
                    {formatDate(video.uploadedAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
