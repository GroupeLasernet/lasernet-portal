-- Add a manually-entered LAN IP for each Station PC.
--
-- `lastHeartbeatIp` is the public WAN IP the portal sees when the PC calls
-- /api/station-pcs/:id/heartbeat through the client's NAT, which is useless
-- for reaching the local robot (port 8080) / relfar (port 5000) services.
--
-- `localIp` is what the operator enters in the UI after running `ipconfig`
-- on the PC (e.g. 192.168.1.42). The "Open robot/laser software" button in
-- the Machines list prefers `localIp` when set and falls back to
-- `lastHeartbeatIp` otherwise. Longer-term this gets superseded by a
-- Cloudflare Tunnel hostname per PC, but for same-LAN demos this is enough.

ALTER TABLE "StationPC"
  ADD COLUMN IF NOT EXISTS "localIp" TEXT;
