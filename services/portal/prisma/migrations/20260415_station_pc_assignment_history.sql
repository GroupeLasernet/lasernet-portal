-- ============================================================
-- 2026-04-15 — StationPCAssignment audit trail
--
-- WHY: Hugo needs a history of which Station each StationPC has been
-- attached to, by whom, and why (manual unassign vs. station deleted vs.
-- reassignment). Today the StationPC just has a single pointer to its
-- current Station via Station.stationPCId — once detached we lose the
-- trail. This table records every assign/detach event.
--
-- Also triggers on station deletion: when a Station that owns a PC is
-- deleted, the PC is detached, sent back to "To be approved" (unless
-- retired), and a 'detached' event with reason='station_deleted' is
-- written. That logic lives in /api/stations/[id] DELETE — this migration
-- just provides the storage.
-- ============================================================

CREATE TABLE IF NOT EXISTS "StationPCAssignment" (
  "id"            TEXT PRIMARY KEY,
  "stationPCId"   TEXT NOT NULL,
  -- Station involved. For 'assigned' events this is the NEW station.
  -- For 'detached' events this is the station the PC was leaving. Nullable
  -- because a 'detached' event can outlive the Station row (e.g. station
  -- was just deleted) — we also snapshot the station number + title below
  -- so the history stays readable.
  "stationId"     TEXT,
  "stationNumber" TEXT,
  "stationTitle"  TEXT,

  -- 'assigned' | 'detached'
  "action"        TEXT NOT NULL,
  -- Free-form reason tag: 'manual', 'station_deleted', 'reassigned',
  -- 'pc_retired', etc. Null = unspecified.
  "reason"        TEXT,

  -- Who did it. Best-effort from the auth-token cookie — null when the
  -- caller is unauthenticated or the token couldn't be decoded.
  "actorEmail"    TEXT,
  "actorName"     TEXT,

  "note"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StationPCAssignment_stationPCId_idx"
  ON "StationPCAssignment"("stationPCId");
CREATE INDEX IF NOT EXISTS "StationPCAssignment_stationId_idx"
  ON "StationPCAssignment"("stationId");
CREATE INDEX IF NOT EXISTS "StationPCAssignment_createdAt_idx"
  ON "StationPCAssignment"("createdAt" DESC);

-- FK to StationPC — when the PC is hard-deleted, its history goes too
-- (soft-retire keeps the PC row and therefore the history).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StationPCAssignment_stationPCId_fkey'
  ) THEN
    ALTER TABLE "StationPCAssignment"
      ADD CONSTRAINT "StationPCAssignment_stationPCId_fkey"
      FOREIGN KEY ("stationPCId") REFERENCES "StationPC"("id") ON DELETE CASCADE;
  END IF;
END$$;

-- No FK on stationId — the Station row may be gone by the time we write
-- the 'station_deleted' event. We keep the snapshot columns instead.
