-- ============================================================
-- 20260420_file_assets
-- ------------------------------------------------------------
-- Add FileAsset (Google Drive-backed documents) and VideoAsset
-- (Vimeo links) tables. Replaces the mockFiles/mockVideos
-- arrays that used to seed the /admin/files page.
--
-- Each asset has a scope ("internal" | "client") and optional
-- nullable links to ManagedClient OR LocalBusiness. Same dual-FK
-- pattern we use on VisitGroup.
--
-- For FileAsset, `driveFileId` is the Google Drive file ID
-- returned by the Drive API on upload. Every read/delete goes
-- through Drive via that ID.
-- ============================================================

CREATE TABLE IF NOT EXISTS "FileAsset" (
  "id"              TEXT PRIMARY KEY,
  "driveFileId"     TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "mimeType"        TEXT NOT NULL,
  "sizeBytes"       BIGINT NOT NULL,

  "category"        TEXT,
  "subCategory"     TEXT,

  "scope"           TEXT NOT NULL DEFAULT 'internal',

  "managedClientId" TEXT,
  "localBusinessId" TEXT,

  "uploadedById"    TEXT,
  "uploadedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FileAsset_managedClientId_fkey"
    FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FileAsset_localBusinessId_fkey"
    FOREIGN KEY ("localBusinessId") REFERENCES "LocalBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "FileAsset_driveFileId_key" ON "FileAsset"("driveFileId");
CREATE INDEX IF NOT EXISTS "FileAsset_scope_idx"            ON "FileAsset"("scope");
CREATE INDEX IF NOT EXISTS "FileAsset_managedClientId_idx"  ON "FileAsset"("managedClientId");
CREATE INDEX IF NOT EXISTS "FileAsset_localBusinessId_idx"  ON "FileAsset"("localBusinessId");
CREATE INDEX IF NOT EXISTS "FileAsset_category_idx"         ON "FileAsset"("category");

CREATE TABLE IF NOT EXISTS "VideoAsset" (
  "id"              TEXT PRIMARY KEY,
  "title"           TEXT NOT NULL,
  "vimeoUrl"        TEXT NOT NULL,
  "vimeoId"         TEXT,
  "description"     TEXT,

  "category"        TEXT,
  "subCategory"     TEXT,

  "scope"           TEXT NOT NULL DEFAULT 'internal',

  "managedClientId" TEXT,
  "localBusinessId" TEXT,

  "uploadedById"    TEXT,
  "uploadedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VideoAsset_managedClientId_fkey"
    FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VideoAsset_localBusinessId_fkey"
    FOREIGN KEY ("localBusinessId") REFERENCES "LocalBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "VideoAsset_scope_idx"            ON "VideoAsset"("scope");
CREATE INDEX IF NOT EXISTS "VideoAsset_managedClientId_idx"  ON "VideoAsset"("managedClientId");
CREATE INDEX IF NOT EXISTS "VideoAsset_localBusinessId_idx"  ON "VideoAsset"("localBusinessId");
CREATE INDEX IF NOT EXISTS "VideoAsset_category_idx"         ON "VideoAsset"("category");
