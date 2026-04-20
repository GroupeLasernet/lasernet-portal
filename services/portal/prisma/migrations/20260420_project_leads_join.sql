-- ============================================================
-- 20260420_project_leads_join
-- ------------------------------------------------------------
-- Add many-to-many between LeadProject and Lead via the
-- LeadProjectAssignment join table. Backfill one assignment per
-- existing LeadProject using its current `leadId` (the primary).
-- ------------------------------------------------------------
-- Rollout note (Hugo, 2026-04-20): LeadProject.leadId stays as
-- "primary lead" for backward compat. The assignment table is
-- the source of truth for the Projects tab grouping and for
-- /api/leads/[id]/projects (so a lead sees projects where they
-- are primary AND projects where they are an assigned co-lead).
-- ============================================================

CREATE TABLE IF NOT EXISTS "LeadProjectAssignment" (
  "id"        TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "leadId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadProjectAssignment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "LeadProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadProjectAssignment_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadProjectAssignment_projectId_leadId_key"
  ON "LeadProjectAssignment"("projectId", "leadId");

CREATE INDEX IF NOT EXISTS "LeadProjectAssignment_projectId_idx"
  ON "LeadProjectAssignment"("projectId");

CREATE INDEX IF NOT EXISTS "LeadProjectAssignment_leadId_idx"
  ON "LeadProjectAssignment"("leadId");

-- Backfill: one assignment per existing project, pointing at its primary lead.
-- `gen_random_uuid()` is built-in on PostgreSQL 13+ (Neon).
INSERT INTO "LeadProjectAssignment" ("id", "projectId", "leadId", "createdAt")
SELECT
  'la_' || replace(gen_random_uuid()::text, '-', ''),
  "id",
  "leadId",
  COALESCE("createdAt", NOW())
FROM "LeadProject"
WHERE NOT EXISTS (
  SELECT 1 FROM "LeadProjectAssignment" a
  WHERE a."projectId" = "LeadProject"."id" AND a."leadId" = "LeadProject"."leadId"
);
