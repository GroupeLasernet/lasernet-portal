// ============================================================
// Types + sentinel constants shared by every file in /admin/files
// ============================================================

// Sentinel selection values used by the folder tree.
// The sidebar's `selectedFolderId` is either one of these or an
// actual FileFolder.id.
export const SEL_ALL = '__all__';     // no filter (show everything)
export const SEL_UNCAT = '__uncat__'; // show only rows where folderId IS NULL

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
  folderId: string | null;
  // LEGACY — kept on the type so we can still read old rows during
  // the migration window. New UI code must use folderId only.
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
  folderId: string | null;
  // LEGACY — see FileAssetRow.
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
// parentId === null → top-level. Any other value → subfolder at
// arbitrary depth (self-referencing FK).
export interface FileFolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Tree shape returned by buildTree() — used for recursive sidebar
// rendering. Files and videos hang off every node (including the
// synthetic root Uncategorized bucket when folderId is null).
export interface FolderNode {
  id: string;            // FileFolder.id, or SEL_UNCAT for the null bucket
  name: string;
  depth: number;         // 0 for top-level, 1 for first subfolder, ...
  children: FolderNode[];
  docCount: number;      // files directly in this folder (not descendants)
  videoCount: number;
  // Aggregate over self + descendants. Displayed in the sidebar
  // so a collapsed parent still shows "how much is in here".
  totalDocCount: number;
  totalVideoCount: number;
}

// Payload written to dataTransfer when a row is dragged toward the sidebar.
export type DragPayload = { kind: 'doc' | 'video'; id: string };

// Kind discriminator reused across move/delete actions.
export type AssetKind = 'doc' | 'video';
