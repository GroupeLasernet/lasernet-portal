# Prisma — Backlog & Task List

> Living list of everything on deck. Maintained jointly with Claude.
> Last updated: 2026-04-14 (late — Station / StationPC / Machine three-entity foundation shipped)

Commands when talking to Claude:
- **LIST** — show what's in this file / in memory
- **WTB** ("wait to build") — add the thing just discussed to the deferred section below
- **BUILD** — start work now on the thing just discussed

---

## In Progress (portal)

*(none)*

## Recently Shipped (2026-04-14)

- [x] **Contact model refactor** — email uniqueness enforced, reassign-to-another-client picker in Contact edit modal, Main Contact + Staff terminology.
- [x] **Stations workflow** — "Jobs" → "Stations" rename complete, `/api/jobs` + `/admin/jobs` redirect stubs deleted, invoice line-item picker wired up (trigger button added in station detail + client-scoped invoice filter).
- [x] **Clients page redesign** — QB client list hidden until search, "My Clients" renamed "Enrolment", left panel merged.
- [x] **Admin header consistency** — all admin + portal pages migrated to the PageHeader component.
- [x] **Sidebar "Client data server" chip** — renamed (no apostrophe-s), FR translation added, labels driven by `t()`.
- [x] **Forgot-password flow** — public `/forgot-password` page, link on login, account-enumeration protection in `POST /api/reset-password` (silent no-op on unknown email).
- [x] **Invite email delivery** — confirmed already shipped via `@/lib/email` + inline Gmail SMTP in `/api/admin/team` + `/api/invite`.
- [x] **Robot licensing / remote kill-switch** — `LicenseState` model, `sync_from_portal` heartbeat, grace-period check, `killSwitchActive` admin toggle, plus **HMAC-SHA256 signing** on `GET /api/machines/license/[serial]` responses with companion verification in `services/robot/app/license.py` (`v1|serial|mode|expiresAt|killSwitch|signedAt` canonical; strict/soft-pass gated by `LICENSE_STRICT`).
- [x] **Relfar DB persistence** — SQLite (`services/relfar/data/relfar.db`) replaces in-memory state; SQLAlchemy models + sessionmaker in `relfar/database.py`.
- [x] **Dual-homed Relfar deployment pattern** — station PC joins controller's RDWelder AP for fixed `192.168.1.5` path (station-mode TCP bridge on HF-LPB100 proved unreliable). `.env.example` + `bootstrap-station.ps1` now write AP-mode defaults and auto-pin the RDWelder WiFi profile.
- [x] **Three-entity domain model (Station / StationPC / Machine)** — `StationPC` model added (serial + MAC + hostname + nickname + status + heartbeat + software versions), 1-to-1 with `Station` via `stationPCId`. `Machine.macAddress` added (unique-if-set) alongside serial. SQL migration `20260414_station_pc_and_mac.sql` is idempotent. Portal now has `/admin/station-pcs` CRUD (list, filter, search, assign/detach station, soft-retire, hard delete) + sidebar nav entry + Station detail view shows assigned PC. `/api/machines` + `/api/stations` serialisers return the new fields. Foundation for remote-support work once the always-on PC + Cloudflare Tunnel land.

## Deferred Backlog

- [ ] **In-app updater for station PCs** *(WTB 2026-04-14)* — robot service self-updates by polling `GET /api/releases/robot/latest` on Portal (returns `{version, download_url, sha256}`), downloads the build, verifies hash, swaps files, restarts. Same pattern for relfar. Reuses the existing HMAC-auth sync channel. Goal: customer PCs never touch SSH or git — installer + Portal URL is the entire setup. Must exist before shipping stations at scale; current SSH+git flow is dev-only.
- [ ] **Machine tracking rearchitecture (phase 2)** — `machineData[]` blob inside `Station.notes` JSON still holds `{ serialNumber, machineType }` per line item. The dedicated `Machine` + `StationMachine` models already exist but aren't the source of truth yet. Needs: (1) migration moving serial+type from notes into Machine rows, (2) MachineItems component rewrite to read/write from Station.machines, (3) backend serializer cleanup. Non-trivial — schedule a dedicated session.
- [ ] **QuickBooks token auto-refresh loop** — token cookie → DB migration already shipped. Still missing: a background/periodic refresh so tokens don't silently expire between user visits. Decide first whether to run it inside a Vercel cron, a Next route hit by an external scheduler, or piggyback on the always-on PC.
- [ ] **Always-on PC at the shop** *(unblocker for everything remote-access)* — repurpose an old laptop OR buy a cheap mini-PC (Beelink / Minisforum / Intel NUC class, €150–250). Runs `python run.py` 24/7 on the Cobots VLAN.
- [ ] **Remote access — Cloudflare Tunnel + Cloudflare Access** — depends on always-on PC above. Domain decision postponed until after the website rebuild. Tunnel must terminate at FastAPI port 8080, NEVER raw robot port 10003.
- [ ] **Interactive remote-support UI in Portal** *(depends on Cloudflare Tunnel + `StationPC.lastHeartbeatIp`)* — embed the station's robot UI + laser UI inside `/admin/station-pcs/[id]` so an operator can see and drive a client's setup from the Portal. Three-entity schema is already in place.
- [ ] **StationPC heartbeat endpoint** — `POST /api/station-pcs/[id]/heartbeat` (or by serial) that the station agent pings every N minutes to update `lastHeartbeatAt`, `lastHeartbeatIp`, `robotVersion`, `relfarVersion`. Wire into the same HMAC sync channel as the robot licensing heartbeat.
- [ ] **Website rebuild** — decide hosting (Vercel vs Cloudflare Pages), then move `atelierdsm.com` DNS to Cloudflare in the same pass. This also unlocks `robot.atelierdsm.com` for the tunnel.
- [ ] **Set `ROBOT_LICENSE_SECRET` in both environments** — portal (Vercel env) + robot (`.env` on always-on PC). Until both are set, license responses soft-pass while `LICENSE_STRICT=false`. Flip `LICENSE_STRICT=true` on robot once both sides carry the secret.

## On Hold / Paused

- **UniFi port-forward rule "Robot Test (temp - remove after testing)"** — WAN 50000 → 192.168.10.10:8080 TCP. Created 2026-04-13, **paused** same day because FastAPI host doesn't live on the LAN yet. Either retarget at the always-on PC's IP and unpause, or delete the rule.

## Open Questions

- Which Raspberry Pi / mini-PC / old laptop for the always-on box?
- Website hosting: Vercel (consistent with portal) or Cloudflare Pages (cheaper + tighter CF integration)?
- License heartbeat: 15 min default fine, or tune down for faster kill-switch effect?

---

*Edit this file directly to check things off or reorder. Claude will also update it when you use WTB / BUILD / LIST.*
