-- Add deployment-address fields to Station.
--
-- Rationale
-- ---------
-- A Station is where a cobot+laser actually lives. Until now the only
-- address we knew about was the client's QuickBooks billing address on
-- ManagedClient. That works for the common case (shop sold to the same
-- address it ships to) but breaks whenever:
--   - A client has multiple shops / sites.
--   - The station is temporarily lent out or relocated.
--   - The business address and the install site differ (franchise,
--     warehouse, training centre, etc.).
--
-- We model this by storing a full optional address on the Station itself.
-- If the operator picks "use business address", the columns stay NULL and
-- the UI falls back to ManagedClient.*. If they pick "custom", we
-- populate them here.
--
-- `addressLocked` is a small guardrail — once an operator is confident
-- the address is correct (street view / map confirm it), they check the
-- lock box so future edits require explicitly unlocking first. Prevents
-- accidental overwrites in the UI; there is no server-side enforcement.

ALTER TABLE "Station"
  ADD COLUMN IF NOT EXISTS "addressLine"    TEXT,
  ADD COLUMN IF NOT EXISTS "city"           TEXT,
  ADD COLUMN IF NOT EXISTS "province"       TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode"     TEXT,
  ADD COLUMN IF NOT EXISTS "country"        TEXT,
  ADD COLUMN IF NOT EXISTS "addressLocked"  BOOLEAN NOT NULL DEFAULT false;
