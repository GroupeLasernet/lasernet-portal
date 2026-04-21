'use client';

// ============================================================
// useFilesData — thin composer around useFilesState (data +
// derived) and useFilesMutations (API writes). Kept so that
// page.tsx / DocumentsTable / VideosGrid / EditDocumentModal /
// FolderSidebar can keep importing a single `UseFilesData`
// shape without knowing about the split.
//
// If you need to add new state, do it in useFilesState.
// If you need to add new API mutations, do it in useFilesMutations.
// This file should stay tiny.
// ============================================================

import { useFilesState } from './useFilesState';
import { useFilesMutations } from './useFilesMutations';

export function useFilesData(fr: boolean, tDelete: { doc: string; video: string }) {
  const state = useFilesState(fr);
  const mutations = useFilesMutations(state, fr, tDelete);

  return {
    // raw data
    documents: state.documents,
    videos: state.videos,
    loading: state.loading,
    // tree + selection
    tree: state.tree,
    folderPathById: state.folderPathById,
    uncatCount: state.uncatCount,
    selectedFolderId: state.selectedFolderId,
    expanded: state.expanded,
    filteredDocs: state.filteredDocs,
    filteredVideos: state.filteredVideos,
    breadcrumb: state.breadcrumb,
    // actions (state)
    loadAll: state.loadAll,
    toggleExpanded: state.toggleExpanded,
    select: state.select,
    // actions (mutations)
    uploadFile: mutations.uploadFile,
    deleteAsset: mutations.deleteAsset,
    handleDrop: mutations.handleDrop,
    createFolder: mutations.createFolder,
    renameFolder: mutations.renameFolder,
    deleteFolder: mutations.deleteFolder,
  };
}

export type UseFilesData = ReturnType<typeof useFilesData>;
