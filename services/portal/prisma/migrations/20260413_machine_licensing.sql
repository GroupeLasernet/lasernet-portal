-- =============================================================
-- 2026-04-13 — §9.1 Machine licensing / kill-switch fields
-- =============================================================
-- Adds licenseMode, expiresAt, killSwitchActive, licenseLastCheckedAt
-- to the Machine table. Idempotent — safe to re-run.
--
-- `npx prisma db push` would handle this on its own (pure additive,
-- non-destructive), but having it as SQL here keeps the migration
-- history explicit. Run either this OR `prisma db push`, not both.

BEGIN;

ALTER TABLE "Machine"
  ADD COLUMN IF NOT EXISTS "licenseMode" TEXT NOT NULL DEFAULT 'unlicensed';

ALTER TABLE "Machine"
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

ALTER TABLE "Machine"
  ADD COLUMN IF NOT EXISTS "killSwitchActive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Machine"
  ADD COLUMN IF NOT EXISTS "licenseLastCheckedAt" TIMESTAMP(3);

COMMIT;
