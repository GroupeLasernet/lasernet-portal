'use client';

// ============================================================
// /admin/files
// ------------------------------------------------------------
// Documents live in Google Drive (Shared Drive) — managed by
// /api/files/documents. Videos are Vimeo links — managed by
// /api/files/videos. Organization happens entirely in the
// portal via the folderId FK on each row — Drive stays flat
// (it's just storage).
//
// UI layout (all sub-components live in this folder):
//   • FolderSidebar     — left tree, recursive / arbitrary depth
//   • DropZone          — dashed-border drop target above the list
//   • DocumentsTable    — draggable rows, right pane top
//   • VideosGrid        — draggable cards, right pane bottom
//   • EditDocumentModal — rename + reassign folder
//   • VideoModal        — create or edit a Vimeo video entry
//
// All data I/O + tree/selection state lives in useFilesData.
// This file just wires that hook into the layout + modal state.
// ============================================================

import { useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import PageHeader from '@/components/PageHeader';

import { DocumentsTable } from './DocumentsTable';
import { EditDocumentModal } from './EditDocumentModal';
import { FolderSidebar } from './FolderSidebar';
import type { FileAssetRow, VideoAssetRow } from './types';
import { SEL_ALL, SEL_UNCAT } from './types';
import { useFilesData } from './useFilesData';
import { VideoModal } from './VideoModal';
import { VideosGrid } from './VideosGrid';

export default function AdminFilesPage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const data = useFilesData(fr, {
    doc: t('files', 'confirmDeleteDoc'),
    video: t('files', 'confirmDeleteVideo'),
  });

  // Modal state stays local to the page
  const [editingDoc, setEditingDoc] = useState<FileAssetRow | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoAssetRow | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isRealFolderSelected =
    data.selectedFolderId !== SEL_ALL && data.selectedFolderId !== SEL_UNCAT;

  // Upload a whole FileList into the currently-selected folder
  // (respects SEL_ALL / SEL_UNCAT = uncategorized).
  const uploadMany = (files: FileList | File[]) => {
    for (const f of Array.from(files)) data.uploadFile(f);
  };

  // Page-level guard: if the user drops files ANYWHERE on this page
  // (even off-target), we preventDefault so the browser doesn't
  // navigate to the file. The drop-zone + folder rows handle the
  // actual upload; this just suppresses the default browser action.
  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  return (
    <div
      onDragOver={(e) => { if (isFileDrag(e)) e.preventDefault(); }}
      onDrop={(e) => { if (isFileDrag(e)) e.preventDefault(); }}
    >
      <PageHeader
        title={t('files', 'title')}
        subtitle={t('files', 'subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = e.target.files;
                if (fs && fs.length) {
                  uploadMany(fs);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary flex items-center gap-2"
              title={
                isRealFolderSelected
                  ? (fr ? `Téléverser dans: ${data.breadcrumb}` : `Upload into: ${data.breadcrumb}`)
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
        <FolderSidebar
          tree={data.tree}
          selectedFolderId={data.selectedFolderId}
          onSelect={data.select}
          expanded={data.expanded}
          onToggle={data.toggleExpanded}
          onCreateFolder={data.createFolder}
          onRenameFolder={data.renameFolder}
          onDeleteFolder={data.deleteFolder}
          onDrop={data.handleDrop}
          uncatCount={data.uncatCount}
          totalCount={data.documents.length + data.videos.length}
          fr={fr}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 text-sm">
            {data.selectedFolderId !== SEL_ALL && (
              <>
                <button
                  type="button"
                  onClick={() => data.select(SEL_ALL)}
                  className="text-xs text-gray-500 hover:text-brand-600 dark:hover:text-brand-300 underline underline-offset-2"
                >
                  {fr ? 'Tous' : 'All'}
                </button>
                <span className="text-gray-400">›</span>
              </>
            )}
            <span className="font-medium text-gray-800 dark:text-gray-100">{data.breadcrumb}</span>
          </div>

          <DropZone
            folderLabel={data.breadcrumb}
            onFilesDropped={uploadMany}
            fr={fr}
          />

          <DocumentsTable
            all={data.documents}
            filtered={data.filteredDocs}
            loading={data.loading}
            selectedFolderId={data.selectedFolderId}
            folderPathById={data.folderPathById}
            fr={fr}
            onEdit={setEditingDoc}
            onDelete={(row) => data.deleteAsset('doc', row.id)}
          />

          <VideosGrid
            all={data.videos}
            filtered={data.filteredVideos}
            loading={data.loading}
            selectedFolderId={data.selectedFolderId}
            folderPathById={data.folderPathById}
            fr={fr}
            onEdit={setEditingVideo}
            onDelete={(row) => data.deleteAsset('video', row.id)}
          />
        </div>
      </div>

      {editingDoc && (
        <EditDocumentModal
          row={editingDoc}
          folders={data.tree}
          onClose={() => setEditingDoc(null)}
          onSaved={() => { setEditingDoc(null); data.loadAll(); }}
        />
      )}
      {(editingVideo || addingVideo) && (
        <VideoModal
          row={editingVideo}
          folders={data.tree}
          onClose={() => { setEditingVideo(null); setAddingVideo(false); }}
          onSaved={() => { setEditingVideo(null); setAddingVideo(false); data.loadAll(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// DropZone — click-or-drop target rendered above the documents
// list. Uploads land in the currently-selected folder (parent
// handles that via the onFilesDropped callback, which delegates
// to useFilesData.uploadFile → currentUploadFolderId()).
// ============================================================
function DropZone({
  folderLabel,
  onFilesDropped,
  fr,
}: {
  folderLabel: string;
  onFilesDropped: (files: FileList | File[]) => void;
  fr: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [active, setActive] = useState(false);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-5 mb-4 text-center cursor-pointer transition-colors select-none ${
        active
          ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-brand-300 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-300'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setActive(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setActive(true);
        }
      }}
      onDragLeave={(e) => {
        // Only de-activate if leaving the element itself (not just a child).
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files?.length) onFilesDropped(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) onFilesDropped(fs);
          e.target.value = '';
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700/40 flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div className="text-sm font-medium">
          {fr ? 'Glissez-déposez des fichiers ici' : 'Drag & drop files here'}
        </div>
        <div className="text-xs">
          {fr
            ? <>ou <span className="underline">cliquez pour parcourir</span> — dossier : <span className="font-semibold">{folderLabel}</span></>
            : <>or <span className="underline">click to browse</span> — folder: <span className="font-semibold">{folderLabel}</span></>}
        </div>
      </div>
    </div>
  );
}
