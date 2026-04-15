-- Add the "approved" quarantine flag to StationPC.
-- Self-registered PCs start with approved=false until an operator reviews them.
-- Existing rows (created manually before auto-registration shipped) are
-- flipped to approved=true so nothing currently visible gets hidden.

ALTER TABLE "StationPC"
  ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather existing rows — anything that existed before this migration was
-- created manually by Hugo, so it's implicitly trusted.
UPDATE "StationPC" SET "approved" = true WHERE "approved" = false;

-- New rows inserted via the admin UI should default to approved=true;
-- self-registration writes approved=false explicitly. Default stays false
-- so we fail safe (quarantine by default).
