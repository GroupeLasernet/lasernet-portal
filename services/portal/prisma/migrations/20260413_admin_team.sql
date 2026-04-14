-- ============================================================
-- Migration: admin team management (invites, expiring tokens, superadmin role)
-- Date: 2026-04-13 (session 4)
-- Idempotent, transactional.
--
-- Run against Neon BEFORE `npx prisma db push`.
-- ============================================================

BEGIN;

-- 1. Add expiring-invite column (nullable; legacy rows unaffected).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "inviteExpiresAt" TIMESTAMP(3);

-- 2. Ensure the bootstrap owner is an admin so they can manage the team.
--    No-op if the user doesn't exist yet.
UPDATE "User"
SET "role" = 'admin'
WHERE lower("email") = 'finance@atelierdsm.com'
  AND "role" = 'client';

COMMIT;
