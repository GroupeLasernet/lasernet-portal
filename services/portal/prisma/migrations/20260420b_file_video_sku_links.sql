-- ============================================================
-- 20260420b_file_video_sku_links
-- ------------------------------------------------------------
-- Multi-SKU attribution on FileAsset + VideoAsset. A file can
-- be linked to many QuickBooks inventory items (skuId = QB
-- Item.Id), so that the quote/invoice UI can surface every
-- file attached to the items on the line items of a document.
--
-- skuId is a plain string — we don't mirror QB items into
-- Postgres, so there is no FK on skuId. skuName is a snapshot
-- used only when the live QuickBooksContext cache is cold.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + IF NOT EXISTS
-- gates on indexes and FKs.
-- ============================================================

BEGIN;

-- ---------- FileAssetSku ---------------------------------------

CREATE TABLE IF NOT EXISTS "FileAssetSku" (
  "id"          TEXT PRIMARY KEY,
  "fileAssetId" TEXT NOT NULL,
  "skuId"       TEXT NOT NULL,
  "skuName"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "FileAssetSku"
  DROP CONSTRAINT IF EXISTS "FileAssetSku_fileAssetId_fkey";
ALTER TABLE "FileAssetSku"
  ADD  CONSTRAINT "FileAssetSku_fileAssetId_fkey"
    FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "FileAssetSku_fileAssetId_skuId_key"
  ON "FileAssetSku"("fileAssetId", "skuId");
CREATE INDEX IF NOT EXISTS "FileAssetSku_skuId_idx"
  ON "FileAssetSku"("skuId");
CREATE INDEX IF NOT EXISTS "FileAssetSku_fileAssetId_idx"
  ON "FileAssetSku"("fileAssetId");

-- ---------- VideoAssetSku --------------------------------------

CREATE TABLE IF NOT EXISTS "VideoAssetSku" (
  "id"           TEXT PRIMARY KEY,
  "videoAssetId" TEXT NOT NULL,
  "skuId"        TEXT NOT NULL,
  "skuName"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "VideoAssetSku"
  DROP CONSTRAINT IF EXISTS "VideoAssetSku_videoAssetId_fkey";
ALTER TABLE "VideoAssetSku"
  ADD  CONSTRAINT "VideoAssetSku_videoAssetId_fkey"
    FOREIGN KEY ("videoAssetId") REFERENCES "VideoAsset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "VideoAssetSku_videoAssetId_skuId_key"
  ON "VideoAssetSku"("videoAssetId", "skuId");
CREATE INDEX IF NOT EXISTS "VideoAssetSku_skuId_idx"
  ON "VideoAssetSku"("skuId");
CREATE INDEX IF NOT EXISTS "VideoAssetSku_videoAssetId_idx"
  ON "VideoAssetSku"("videoAssetId");

COMMIT;
