-- ============================================================
-- 2026-04-14 — StationPC model + Machine.macAddress
--
-- WHY: Separate the physical computer identity (StationPC) from the
-- commercial line (Station) and the physical equipment (Machine). This
-- makes PC swaps / refurbishes / redeployments a 1-row update instead of
-- a migration. Also introduces Machine.macAddress as the reliable network
-- identity (IPs drift; MACs don't).
--
-- Safe for existing data: all new fields are nullable. Machine and Station
-- rows remain valid without modification.
-- ============================================================

-- Machine: add MAC column with a unique index (unique-if-set).
ALTER TABLE "Machine"
  ADD COLUMN IF NOT EXISTS "macAddress" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Machine_macAddress_key"
  ON "Machine"("macAddress")
  WHERE "macAddress" IS NOT NULL;

-- StationPC table.
CREATE TABLE IF NOT EXISTS "StationPC" (
  "id"              TEXT PRIMARY KEY,
  "serial"          TEXT NOT NULL UNIQUE,
  "macAddress"      TEXT,
  "hostname"        TEXT,
  "nickname"        TEXT,
  "installedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "robotVersion"    TEXT,
  "relfarVersion"   TEXT,
  "lastHeartbeatAt" TIMESTAMP(3),
  "lastHeartbeatIp" TEXT,
  "status"          TEXT NOT NULL DEFAULT 'provisioning',
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "StationPC_macAddress_key"
  ON "StationPC"("macAddress")
  WHERE "macAddress" IS NOT NULL;

-- Station: nullable FK to StationPC (one-to-one today, nullable so Stations
-- can exist before a PC is assigned). ON DELETE SET NULL so deleting a PC
-- doesn't cascade-delete a client's Station.
ALTER TABLE "Station"
  ADD COLUMN IF NOT EXISTS "stationPCId" TEXT;

-- Unique so one PC can back at most one Station at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "Station_stationPCId_key"
  ON "Station"("stationPCId")
  WHERE "stationPCId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Station_stationPCId_fkey'
  ) THEN
    ALTER TABLE "Station"
      ADD CONSTRAINT "Station_stationPCId_fkey"
      FOREIGN KEY ("stationPCId") REFERENCES "StationPC"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
