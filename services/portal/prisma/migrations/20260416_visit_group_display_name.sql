-- Add displayName column to VisitGroup for editable container titles
ALTER TABLE "VisitGroup" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
