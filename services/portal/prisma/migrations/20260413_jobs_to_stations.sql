-- =============================================================
-- 2026-04-13 — Jobs → Stations rename (8.4B)
-- =============================================================
-- IMPORTANT: Run this SQL against Neon BEFORE `npx prisma db push`.
-- `prisma db push` will otherwise see model renames as DROP+CREATE
-- and destroy all existing data in these tables.
--
-- Idempotent: each statement guarded by IF EXISTS / IF NOT EXISTS.
-- Safe to run multiple times.
--
-- Prerequisite: Neon branch snapshot taken just before running.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. RENAME TABLES
-- ---------------------------------------------------------------
ALTER TABLE IF EXISTS "Job"              RENAME TO "Station";
ALTER TABLE IF EXISTS "JobInvoice"       RENAME TO "StationInvoice";
ALTER TABLE IF EXISTS "JobMachine"       RENAME TO "StationMachine";
ALTER TABLE IF EXISTS "JobRobotProgram"  RENAME TO "StationRobotProgram";
ALTER TABLE IF EXISTS "JobLaserPreset"   RENAME TO "StationLaserPreset";

-- ---------------------------------------------------------------
-- 2. RENAME COLUMNS
-- ---------------------------------------------------------------
-- Station: jobNumber → stationNumber
ALTER TABLE "Station"
  RENAME COLUMN "jobNumber" TO "stationNumber";

-- FK columns: jobId → stationId
ALTER TABLE "StationInvoice"       RENAME COLUMN "jobId" TO "stationId";
ALTER TABLE "StationMachine"       RENAME COLUMN "jobId" TO "stationId";
ALTER TABLE "StationRobotProgram"  RENAME COLUMN "jobId" TO "stationId";
ALTER TABLE "StationLaserPreset"   RENAME COLUMN "jobId" TO "stationId";

-- MachineStateLog keeps its table name, but its FK column renames.
ALTER TABLE "MachineStateLog"      RENAME COLUMN "jobId" TO "stationId";

-- ---------------------------------------------------------------
-- 3. RENAME CONSTRAINTS / INDEXES  (cosmetic — Postgres keeps old
--    names working, but rename so future `prisma db push` is a no-op)
-- ---------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  -- Primary keys (Model_pkey)
  FOR r IN
    SELECT old_name, new_name FROM (VALUES
      ('Job_pkey',             'Station_pkey'),
      ('JobInvoice_pkey',      'StationInvoice_pkey'),
      ('JobMachine_pkey',      'StationMachine_pkey'),
      ('JobRobotProgram_pkey', 'StationRobotProgram_pkey'),
      ('JobLaserPreset_pkey',  'StationLaserPreset_pkey')
    ) AS v(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.old_name) THEN
      EXECUTE format('ALTER INDEX %I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- Unique indexes
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Job_jobNumber_key') THEN
    EXECUTE 'ALTER INDEX "Job_jobNumber_key" RENAME TO "Station_stationNumber_key"';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'JobMachine_jobId_machineId_key') THEN
    EXECUTE 'ALTER INDEX "JobMachine_jobId_machineId_key" RENAME TO "StationMachine_stationId_machineId_key"';
  END IF;

  -- Foreign key constraint names. Prisma generates them as
  --   "<Table>_<column>_fkey". Rename them to match new table+column.
  FOR r IN
    SELECT old_name, new_name, table_name FROM (VALUES
      ('Job_managedClientId_fkey',             'Station_managedClientId_fkey',             'Station'),
      ('JobInvoice_jobId_fkey',                'StationInvoice_stationId_fkey',            'StationInvoice'),
      ('JobMachine_jobId_fkey',                'StationMachine_stationId_fkey',            'StationMachine'),
      ('JobMachine_machineId_fkey',            'StationMachine_machineId_fkey',            'StationMachine'),
      ('JobRobotProgram_jobId_fkey',           'StationRobotProgram_stationId_fkey',       'StationRobotProgram'),
      ('JobRobotProgram_machineId_fkey',       'StationRobotProgram_machineId_fkey',       'StationRobotProgram'),
      ('JobLaserPreset_jobId_fkey',            'StationLaserPreset_stationId_fkey',        'StationLaserPreset'),
      ('JobLaserPreset_machineId_fkey',        'StationLaserPreset_machineId_fkey',        'StationLaserPreset'),
      ('Machine_invoiceId_fkey',               'Machine_invoiceId_fkey',                   'Machine'),
      ('MachineStateLog_jobId_fkey',           'MachineStateLog_stationId_fkey',           'MachineStateLog')
    ) AS v(old_name, new_name, table_name)
  LOOP
    IF r.old_name <> r.new_name
       AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.old_name)
    THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
        r.table_name, r.old_name, r.new_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- After this succeeds:
--   1. run `npx prisma db push` — should report "Database is in sync", no destructive changes.
--   2. smoke-test /admin/stations end-to-end.
