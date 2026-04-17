-- Projects & Quotes (Lead → Project → Quote → QuoteItem)
CREATE TABLE IF NOT EXISTS "LeadProject" (
  "id"        TEXT NOT NULL,
  "leadId"    TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'active',
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadProject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadProject_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LeadProject_leadId_idx" ON "LeadProject"("leadId");

CREATE TABLE IF NOT EXISTS "Quote" (
  "id"            TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "quoteNumber"   TEXT,
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "notes"         TEXT,
  "parentQuoteId" TEXT,
  "sentAt"        TIMESTAMP(3),
  "acceptedAt"    TIMESTAMP(3),
  "rejectedAt"    TIMESTAMP(3),
  "expiresAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Quote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LeadProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Quote_projectId_idx" ON "Quote"("projectId");

CREATE TABLE IF NOT EXISTS "QuoteItem" (
  "id"          TEXT NOT NULL,
  "quoteId"     TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity"    DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unitPrice"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unit"        TEXT,
  "notes"       TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- VisitGroup → TrainingEvent link (auto-create visits for training days)
ALTER TABLE "VisitGroup" ADD COLUMN IF NOT EXISTS "trainingEventId" TEXT;
CREATE INDEX IF NOT EXISTS "VisitGroup_trainingEventId_idx" ON "VisitGroup"("trainingEventId");
ALTER TABLE "VisitGroup" DROP CONSTRAINT IF EXISTS "VisitGroup_trainingEventId_fkey";
ALTER TABLE "VisitGroup" ADD CONSTRAINT "VisitGroup_trainingEventId_fkey"
  FOREIGN KEY ("trainingEventId") REFERENCES "TrainingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
