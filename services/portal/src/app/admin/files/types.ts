// ============================================================
// Types + sentinel constants shared by every file in /admin/files
// ============================================================

// Sentinel selection values used by the folder tree.
export const SEL_ALL = '__all__';     // no filter (show everything)
export const SEL_UNCAT = '__uncat__'; // show only rows where category IS NULL

export interface BusinessRef {
  id: string;
  displayName?: string;
  name?: string;
}

export interface FileAssetRow {
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

export interface VideoAssetRow {
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

// Persisted folder row from /api/files/folders.
// parent === null → top-level category; otherwise the parent
// category's name. 2-level tree only.
export interface FileFolderRow {
  id: string;
  name: string;
  parent: string | null;
  createdAt: string;
  updatedAt: string;
}

// Payload written to dataTransfer when a row is dragged toward the sidebar.
export type DragPayload = { kind: 'doc' | 'video'; id: string };

// Kind discriminator reused across move/delete actions.
export type AssetKind = 'doc' | 'video';
