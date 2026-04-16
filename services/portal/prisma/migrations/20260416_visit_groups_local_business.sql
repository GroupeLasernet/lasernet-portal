-- ============================================================
-- Visit Groups, Local Businesses, Visit Files, Visit Needs
-- Group visits, business linking, file uploads, visit expectations
-- ============================================================

-- Local Businesses (non-QB prospects)
CREATE TABLE IF NOT EXISTS "LocalBusiness" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"       TEXT NOT NULL,
  "address"    TEXT,
  "city"       TEXT,
  "province"   TEXT,
  "postalCode" TEXT,
  "country"    TEXT DEFAULT 'Canada',
  "phone"      TEXT,
  "email"      TEXT,
  "website"    TEXT,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocalBusiness_pkey" PRIMARY KEY ("id")
);

-- Visit Groups
CREATE TABLE IF NOT EXISTS "VisitGroup" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "managedClientId"   TEXT,
  "localBusinessId"   TEXT,
  "mainContactId"     TEXT,
  "status"            TEXT NOT NULL DEFAULT 'active',
  "notes"             TEXT,
  "expectedFollowUpAt" TIMESTAMP(3),
  "completedAt"       TIMESTAMP(3),
  "summarySentAt"     TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitGroup_managedClientId_fkey" FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE SET NULL,
  CONSTRAINT "VisitGroup_localBusinessId_fkey" FOREIGN KEY ("localBusinessId") REFERENCES "LocalBusiness"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "VisitGroup_status_idx" ON "VisitGroup"("status");
CREATE INDEX IF NOT EXISTS "VisitGroup_managedClientId_idx" ON "VisitGroup"("managedClientId");
CREATE INDEX IF NOT EXISTS "VisitGroup_localBusinessId_idx" ON "VisitGroup"("localBusinessId");

-- Visit Files
CREATE TABLE IF NOT EXISTS "VisitFile" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "visitGroupId"   TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "fileType"       TEXT NOT NULL,
  "fileData"       TEXT NOT NULL,
  "fileSize"       INTEGER,
  "uploadedById"   TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitFile_visitGroupId_fkey" FOREIGN KEY ("visitGroupId") REFERENCES "VisitGroup"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "VisitFile_visitGroupId_idx" ON "VisitFile"("visitGroupId");

-- Visit Needs
CREATE TABLE IF NOT EXISTS "VisitNeed" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "visitGroupId"   TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "description"    TEXT,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "expectedDate"   TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "assignedToId"   TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitNeed_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitNeed_visitGroupId_fkey" FOREIGN KEY ("visitGroupId") REFERENCES "VisitGroup"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "VisitNeed_visitGroupId_idx" ON "VisitNeed"("visitGroupId");

-- Add visitGroupId to Visit
ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "visitGroupId" TEXT;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_visitGroupId_fkey" FOREIGN KEY ("visitGroupId") REFERENCES "VisitGroup"("id") ON DELETE SET NULL;

-- Add localBusinessId to Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "localBusinessId" TEXT;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_localBusinessId_fkey" FOREIGN KEY ("localBusinessId") REFERENCES "LocalBusiness"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Lead_localBusinessId_idx" ON "Lead"("localBusinessId");
