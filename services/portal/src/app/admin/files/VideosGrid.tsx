'use client';

// ============================================================
// VideosGrid — draggable cards for Vimeo-linked VideoAsset rows.
// Same contract as DocumentsTable: pure presentation + callbacks.
// ============================================================

import { useLanguage } from '@/lib/LanguageContext';
import type { DragPayload, VideoAssetRow } from './types';
import { SEL_ALL } from './types';
import { formatDate } from './utils';

export function VideosGrid({
  all,
  filtered,
  loading,
  selCat,
  fr,
  onEdit,
  onDelete,
}: {
  all: VideoAssetRow[];
  filtered: VideoAssetRow[];
  loading: boolean;
  selCat: string;
  fr: boolean;
  onEdit: (row: VideoAssetRow) => void;
  onDelete: (row: VideoAssetRow) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          {t('files', 'videos')}
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
            {selCat === SEL_ALL ? all.length : `${filtered.length}/${all.length}`}
          </span>
        </h2>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400 italic">Loading…</div>
      ) : all.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
          {t('files', 'noVideos')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500 italic">
          {fr ? 'Aucune vidéo dans ce dossier.' : 'No videos in this folder.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((video) => (
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
  );
}
