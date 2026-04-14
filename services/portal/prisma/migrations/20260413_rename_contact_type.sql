-- One-shot data migration: rename Contact.type legacy values to the new vocabulary.
--   "responsible" -> "maincontact"
--   "employee"    -> "staff"
--
-- Run ONCE against the Neon database:
--   psql "$DATABASE_URL" -f prisma/migrations/20260413_rename_contact_type.sql
-- or execute the two UPDATEs from the Neon SQL editor.
--
-- Idempotent: safe to run multiple times (no-ops after first run).

UPDATE "Contact" SET "type" = 'maincontact' WHERE "type" = 'responsible';
UPDATE "Contact" SET "type" = 'staff'        WHERE "type" = 'employee';
