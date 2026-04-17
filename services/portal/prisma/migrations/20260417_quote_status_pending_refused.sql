-- Update Quote default status from 'draft' to 'pending'
ALTER TABLE "Quote" ALTER COLUMN "status" SET DEFAULT 'pending';

-- Rename existing statuses to new scheme
UPDATE "Quote" SET "status" = 'pending' WHERE "status" IN ('draft', 'sent');
UPDATE "Quote" SET "status" = 'refused' WHERE "status" IN ('rejected', 'expired');
