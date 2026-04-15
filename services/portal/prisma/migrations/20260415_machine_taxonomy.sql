-- Machine taxonomy: replace `type` ("robot" | "laser") with a richer
-- Category → Subcategory → Model structure so we can express:
--   Robot / <null subcategory> / E03 | E05 | E10 | E12 | E12+Rail3M | E12+Rail4M
--   Accessory / Laser / Cleaning | Welding
--   Accessory / Traditional welding / ...
--   Accessory / Sanding / ...
-- The subcategory also drives which UI/software interface a machine opens
-- in (robot app, Relfar controller, or none-yet).
--
-- Design note on memory transfer: pathways / obstacles / safety-zone data
-- will eventually live on Machine rows and need to be portable when a
-- client swaps hardware. Nothing in this migration forbids that — keeping
-- Machine as the identity row with transferable JSON blobs is the intent.
-- Serial number stays the unique identifier; a "replace machine" flow
-- later will copy the blobs from the old row to the new one.

BEGIN;

-- Add new columns as nullable so the backfill can run.
ALTER TABLE "Machine" ADD COLUMN IF NOT EXISTS "category"    TEXT;
ALTER TABLE "Machine" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;

-- Backfill from the legacy `type` column:
--   type='robot' → category='robot', subcategory=NULL
--   type='laser' → category='accessory', subcategory='laser'
-- We intentionally don't touch `model` — existing rows keep their current
-- model strings ("UR10e", "Relfar 500W", etc.) and can be relabelled later.
UPDATE "Machine"
SET
  "category"    = CASE
                    WHEN "type" = 'robot' THEN 'robot'
                    WHEN "type" = 'laser' THEN 'accessory'
                    ELSE COALESCE("category", 'robot')
                  END,
  "subcategory" = CASE
                    WHEN "type" = 'laser' THEN 'laser'
                    ELSE "subcategory"
                  END
WHERE "category" IS NULL;

-- Lock category as NOT NULL now that every row has a value.
ALTER TABLE "Machine" ALTER COLUMN "category" SET NOT NULL;

-- Drop the legacy `type` column. Portal API/UI are updated in the same
-- commit; the robot/relfar services don't read this column.
ALTER TABLE "Machine" DROP COLUMN IF EXISTS "type";

COMMIT;
