-- CRM module: Leads, Calls, Visits, Messages, Activity log.
-- Sales pipeline & walk-in registration system for Atelier DSM.
-- Added 2026-04-16.

BEGIN;

-- ============================================================
-- LEADS — sales funnel entries (walk-ins, calls, referrals, web)
-- ============================================================
CREATE TABLE IF NOT EXISTS "Lead" (
  "id"              TEXT PRIMARY KEY,
  "managedClientId" TEXT REFERENCES "ManagedClient"("id") ON DELETE SET NULL,
  "name"            TEXT NOT NULL,
  "email"           TEXT,
  "phone"           TEXT,
  "company"         TEXT,
  "photo"           TEXT,  -- base64 selfie from kiosk
  "stage"           TEXT NOT NULL DEFAULT 'new',
  "source"          TEXT NOT NULL,
  "assignedToId"    TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "estimatedValue"  DOUBLE PRECISION,
  "nextFollowUpAt"  TIMESTAMPTZ,
  "wonAt"           TIMESTAMPTZ,
  "lostAt"          TIMESTAMPTZ,
  "lostReason"      TEXT,
  "notes"           TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Lead_managedClientId_idx" ON "Lead"("managedClientId");
CREATE INDEX IF NOT EXISTS "Lead_assignedToId_idx" ON "Lead"("assignedToId");
CREATE INDEX IF NOT EXISTS "Lead_stage_idx" ON "Lead"("stage");

-- ============================================================
-- CALLS — phone interactions linked to a lead
-- ============================================================
CREATE TABLE IF NOT EXISTS "Call" (
  "id"              TEXT PRIMARY KEY,
  "leadId"          TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "loggedById"      TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "type"            TEXT NOT NULL,       -- inbound | outbound
  "duration"        INTEGER,             -- seconds
  "notes"           TEXT,
  "outcome"         TEXT,                -- reached | no_answer | voicemail | callback_scheduled
  "calledAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Call_leadId_idx" ON "Call"("leadId");

-- ============================================================
-- VISITS — walk-in registrations (kiosk or manual)
-- ============================================================
CREATE TABLE IF NOT EXISTS "Visit" (
  "id"              TEXT PRIMARY KEY,
  "leadId"          TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "visitorName"     TEXT NOT NULL,
  "visitorEmail"    TEXT,
  "visitorPhone"    TEXT,
  "visitorCompany"  TEXT,
  "visitorPhoto"    TEXT,                -- base64 selfie
  "receivedById"    TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "purpose"         TEXT,                -- inquiry | demo | meeting | service | other
  "notes"           TEXT,
  "visitedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Visit_leadId_idx" ON "Visit"("leadId");

-- ============================================================
-- LEAD MESSAGES — salesperson ↔ client thread
-- ============================================================
CREATE TABLE IF NOT EXISTS "LeadMessage" (
  "id"              TEXT PRIMARY KEY,
  "leadId"          TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "senderId"        TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "senderName"      TEXT NOT NULL,
  "senderEmail"     TEXT,
  "isFromClient"    BOOLEAN NOT NULL DEFAULT false,
  "content"         TEXT NOT NULL,
  "subject"         TEXT,
  "sentAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "LeadMessage_leadId_idx" ON "LeadMessage"("leadId");

-- ============================================================
-- LEAD ACTIVITY — audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id"              TEXT PRIMARY KEY,
  "leadId"          TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "actorId"         TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "actorName"       TEXT,
  "type"            TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "fromStage"       TEXT,
  "toStage"         TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");

COMMIT;
