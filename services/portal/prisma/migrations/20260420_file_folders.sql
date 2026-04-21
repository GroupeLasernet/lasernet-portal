-- ============================================================
-- 20260420_file_folders
-- ------------------------------------------------------------
-- Persist user-created folders so they survive page reload,
-- even when empty. Adds rename + delete as first-class ops.
--
-- Design: 2-level tree matches the existing
-- FileAsset.category / .subCategory string columns. A row with
-- `parent = NULL` is a top-level category; a row with
-- `parent = 'Laser'` is a subfolder under Laser.
--
-- NOTE: FileAsset.category and .subCategory are NOT FKs to
-- FileFolder.name — they're kept as denormalized strings so
-- existing queries keep working. Renames/deletes in the folder
-- API must cascade the new value into those columns.
-- ============================================================

CREATE TABLE IF NOT EXISTS "FileFolder" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "parent"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique per (name, parent). NULLS are distinct by default in
-- Postgres so we explicitly coalesce via expression index.
CREATE UNIQUE INDEX IF NOT EXISTS "FileFolder_name_parent_key"
  ON "FileFolder"("name", COALESCE("parent", ''));

CREATE INDEX IF NOT EXISTS "FileFolder_parent_idx" ON "FileFolder"("parent");
