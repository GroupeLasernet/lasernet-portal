-- Soft-delete support for contacts (archive instead of hard delete)
ALTER TABLE "Contact" ADD COLUMN "archivedAt" TIMESTAMP(3);
