-- Add subrole to User (sales, support, technician) and clientType to Call (existing/new).
-- 2026-04-16.

BEGIN;

-- User sub-role for admin specialization (sales, support, technician)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subrole" TEXT;

-- Call client type: did the caller already buy from us?
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "clientType" TEXT NOT NULL DEFAULT 'new';

COMMIT;
