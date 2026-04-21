-- ============================================================
-- 20260420_folder_fk_hierarchy
-- ------------------------------------------------------------
-- Replace the flat 2-level folder model with an arbitrary-depth
-- tree:
--
--   • FileFolder gains parentId (self-ref FK, ON DELETE CASCADE)
--     replacing the old `parent` TEXT name column. The old
--     column is kept temporarily — drop in a follow-up once
--     backfill is verified in prod.
--
--   • FileAsset + VideoAsset gain folderId (FK → FileFolder.id,
--     ON DELETE SET NULL) replacing the denormalized
--     category / subCategory string columns. Those two columns
--     are also kept temporarily so the old preview deploy keeps
--     working during rollout.
--
-- Backfill logic:
--   1. Ensure every parent name referenced (by a FileFolder.parent
--      string or by FileAsset/VideoAsset.category) exists as a
--      top-level FileFolder row.
--   2. Wire child FileFolder rows: parentId = id of (name=parent,
--      parent=NULL).
--   3. Ensure every (category, subCategory) pair in FileAsset /
--      VideoAsset exists as a child FileFolder row.
--   4. Set FileAsset.folderId / VideoAsset.folderId to the leaf
--      folder id (subCategory folder if set, else category
--      folder, else NULL → Uncategorized).
--
-- Safe to re-run: every INSERT is gated by WHERE NOT EXISTS and
-- every UPDATE is gated by the target column being NULL.
-- ============================================================

BEGIN;

-- ---------- 1. Add new nullable columns ------------------------

ALTER TABLE "FileFolder" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "FileAsset"  ADD COLUMN IF NOT EXISTS "folderId" TEXT;
ALTER TABLE "VideoAsset" ADD COLUMN IF NOT EXISTS "folderId" TEXT;

-- ---------- 2. Backfill top-level FileFolder rows --------------
-- Every category name referenced anywhere needs a top-level
-- FileFolder row so children can point at it.

WITH referenced_top_names AS (
  SELECT DISTINCT category  AS name FROM "FileAsset"  WHERE category IS NOT NULL  AND category  <> ''
  UNION
  SELECT DISTINCT category  AS name FROM "VideoAsset" WHERE category IS NOT NULL  AND category  <> ''
  UNION
  SELECT DISTINCT "parent"  AS name FROM "FileFolder" WHERE "parent" IS NOT NULL  AND "parent"  <> ''
)
INSERT INTO "FileFolder" (id, name, parent, "createdAt", "updatedAt")
SELECT
  'fbk_' || md5(random()::text || clock_timestamp()::text || r.name),
  r.name,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM referenced_top_names r
WHERE NOT EXISTS (
  SELECT 1 FROM "FileFolder" ff WHERE ff.name = r.name AND ff.parent IS NULL
);

-- ---------- 3. Wire existing subfolders to their parent id -----

UPDATE "FileFolder" AS child
SET "parentId" = top.id
FROM "FileFolder" AS top
WHERE child.parent  IS NOT NULL
  AND child."parentId" IS NULL
  AND top.name   = child.parent
  AND top.parent IS NULL;

-- ---------- 4. Backfill child FileFolder rows from (cat, sub) --

WITH distinct_pairs AS (
  SELECT DISTINCT category AS parent_name, "subCategory" AS name
  FROM "FileAsset"
  WHERE category IS NOT NULL AND category <> ''
    AND "subCategory" IS NOT NULL AND "subCategory" <> ''
  UNION
  SELECT DISTINCT category AS parent_name, "subCategory" AS name
  FROM "VideoAsset"
  WHERE category IS NOT NULL AND category <> ''
    AND "subCategory" IS NOT NULL AND "subCategory" <> ''
)
INSERT INTO "FileFolder" (id, name, parent, "parentId", "createdAt", "updatedAt")
SELECT
  'fbk_' || md5(random()::text || clock_timestamp()::text || dp.parent_name || '/' || dp.name),
  dp.name,
  dp.parent_name,
  top.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM distinct_pairs dp
JOIN "FileFolder" top
  ON top.name = dp.parent_name
 AND top.parent IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "FileFolder" ff
  WHERE ff.name = dp.name AND ff.parent = dp.parent_name
);

-- ---------- 5. Backfill FileAsset.folderId ---------------------

UPDATE "FileAsset" AS f
SET "folderId" = (
  SELECT ff.id FROM "FileFolder" ff
  WHERE ff.name = f."subCategory"
    AND ff.parent = f.category
  LIMIT 1
)
WHERE f.category    IS NOT NULL
  AND f."subCategory" IS NOT NULL
  AND f."folderId"  IS NULL;

UPDATE "FileAsset" AS f
SET "folderId" = (
  SELECT ff.id FROM "FileFolder" ff
  WHERE ff.name = f.category
    AND ff.parent IS NULL
  LIMIT 1
)
WHERE f.category    IS NOT NULL
  AND f."subCategory" IS NULL
  AND f."folderId"  IS NULL;

-- ---------- 6. Backfill VideoAsset.folderId --------------------

UPDATE "VideoAsset" AS v
SET "folderId" = (
  SELECT ff.id FROM "FileFolder" ff
  WHERE ff.name = v."subCategory"
    AND ff.parent = v.category
  LIMIT 1
)
WHERE v.category    IS NOT NULL
  AND v."subCategory" IS NOT NULL
  AND v."folderId"  IS NULL;

UPDATE "VideoAsset" AS v
SET "folderId" = (
  SELECT ff.id FROM "FileFolder" ff
  WHERE ff.name = v.category
    AND ff.parent IS NULL
  LIMIT 1
)
WHERE v.category    IS NOT NULL
  AND v."subCategory" IS NULL
  AND v."folderId"  IS NULL;

-- ---------- 7. Add FK constraints + indexes --------------------

-- Drop old uniqueness/name-based indexes tied to `parent` text column.
DROP INDEX IF EXISTS "FileFolder_name_parent_key";
DROP INDEX IF EXISTS "FileFolder_parent_idx";

ALTER TABLE "FileFolder"
  DROP CONSTRAINT IF EXISTS "FileFolder_parentId_fkey";
ALTER TABLE "FileFolder"
  ADD  CONSTRAINT "FileFolder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "FileFolder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileAsset"
  DROP CONSTRAINT IF EXISTS "FileAsset_folderId_fkey";
ALTER TABLE "FileAsset"
  ADD  CONSTRAINT "FileAsset_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VideoAsset"
  DROP CONSTRAINT IF EXISTS "VideoAsset_folderId_fkey";
ALTER TABLE "VideoAsset"
  ADD  CONSTRAINT "VideoAsset_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "FileFolder_name_parentId_key"
  ON "FileFolder"("name", COALESCE("parentId", ''));

CREATE INDEX IF NOT EXISTS "FileFolder_parentId_idx" ON "FileFolder"("parentId");
CREATE INDEX IF NOT EXISTS "FileAsset_folderId_idx"  ON "FileAsset"("folderId");
CREATE INDEX IF NOT EXISTS "VideoAsset_folderId_idx" ON "VideoAsset"("folderId");

COMMIT;
