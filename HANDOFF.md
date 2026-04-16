# Prisma — Complete Handoff

> **One file. Paste this into a fresh Claude conversation with the Prisma folder linked.** Contains everything needed to resume work: architecture, current status, in-progress tasks, deferred backlog, remote-access plan, rules, and commands.
>
> **Last updated:** 2026-04-13 (session 4: admin team management (invites, bcrypt migration) done; DB push pending locally)
> **Owner:** Hugo — finance@atelierdsm.com
> **Active folder:** `C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\`

---

## 0. PROMPT TO PASTE IN A FRESH SESSION

Copy everything inside the quote block below and paste it as your first message in a new Cowork conversation (with the Prisma folder linked):

> Read `HANDOFF.md` in full before doing anything. It contains the complete system architecture, current state, in-progress work, backlog, rules, and remote-access plan. After reading, ask me which task I want to work on — do not assume from memory alone.

That's it. The whole project state is in this file.

---

## 1. Business context

Atelier DSM sells and rents cobot + laser units. The system has three parts:

1. **Client-facing portal** — quotes, invoices, tickets, machine tracking (the "Prisma" portal / LaserNet).
2. **Robot control software** — on-prem, drives the Elfin cobot over TCP.
3. **Laser controller (Relfar)** — on-prem, controls the laser via Modbus RTU.

Long-term goal: the portal can remotely configure, monitor, and (later) license-enforce every deployed unit.

---

## 2. Folder structure

```
C:\Users\Portable_New_Hugo\Documents\Claude\Projects\
├── Prisma\                         ← THE ACTIVE monorepo, everything lives here
│   ├── services\
│   │   ├── portal\                 (Next.js 14 + TS, deployed to Vercel, DB on Neon)
│   │   ├── robot\                  (FastAPI, Elfin cobot controller)
│   │   └── relfar\                 (Flask, Relfar laser controller)
│   ├── shared\
│   ├── docker-compose.yml
│   ├── vercel.json
│   ├── start-all.bat
│   ├── push-update.bat
│   ├── HANDOFF.md                  ← THIS FILE
│   └── README.md
│
├── Make a Cobot software\          ← archive / reference only
├── Web site and web portal for clients and admins\  ← archive / reference only
├── Relfar\                         ← archive / reference only
├── Crestron Programming\
└── AAA - Start projects and boot errors\*.bat
```

The old "Merging Projects" folder was retired on 2026-04-13. **Prisma is now the single monorepo.**

---

## 3. Deployment / hosting

| Service | Local dev | Production |
|---|---|---|
| Portal (Next.js) | `localhost:3000` | **Vercel** (serverless) |
| Portal database | local Postgres | **Neon** (serverless Postgres) |
| Robot software | `localhost:8080` | on-prem, runs on dedicated PC |
| Relfar controller | `localhost:5000` | on-prem, runs on dedicated PC |

- **Source control:** GitHub (Prisma repo)
- **Critical constraint:** Vercel is serverless → no persistent TCP connections, no VPN tunnels, no long-running daemons. This shapes the remote-access design (section 7).

---

## 4. Core services — details

### 4.1 Portal — "Prisma" / LaserNet (`services/portal`)
- Next.js 14 + TypeScript + Tailwind
- Prisma ORM → Neon Postgres
- JWT auth in httpOnly cookies, 8h expiry
- QuickBooks OAuth (tokens must be persisted to DB, auto-refresh)
- Local port: 3000
- Key models: `User`, `ManagedClient`, `Contact`, `Ticket`, `Job`/`Station`, `JobInvoice`, `JobRobotProgram`, `JobLaserPreset`, `MachineStateLog`, `Machine`

### 4.2 Robot software — "Elfin Cobot Studio" (`services/robot`)
- Python FastAPI (Uvicorn)
- SQLite via SQLAlchemy (in `data/` folder)
- Local port: 8080 (web UI — this is what remote access should expose, NOT raw 10003)
- Polls `192.168.10.10:10003` every 0.5s (Elfin TCP protocol)
- MQTT on port 1884
- 24h session limit + 15s comms watchdog
- Has simulation mode
- **Entry point: `python run.py`** — NOT `python -m app.main` (the latter exits immediately)

### 4.3 Relfar Controller (`services/relfar`)
- Python Flask
- **In-memory state only** (violates the Data Persistence Rule — flagged for refactor)
- Local port: 5000
- Modbus RTU over RS485 serial, auto-detects baud/slave/parity
- 24h session limit + 15s comms watchdog

### 4.4 Cross-cutting
- All three services are REST-based (no WebSockets).
- Robot and Relfar have **no auth of their own** — the portal proxies them and adds auth.
- All data must be DB-persisted (Relfar currently violates this).

---

## 5. Network / on-prem environment

```
Internet
   │
Neighbour's router 192.168.2.1     (upstream, double-NAT)
   │
UniFi UDR7 — WAN 192.168.2.50 / LAN 192.168.20.1
   │
   ├── Default VLAN   192.168.20.0/24   (PCs, general network)
   ├── Cobots VLAN    192.168.10.0/24   ← robot at 192.168.10.10
   └── DSM Invité     (guest)
```

- **Router model:** UniFi UDR7, UniFi OS 5.0.16, Network app 10.2.105
- **No Docker support on router** (UDR7 is consumer-tier, only official UniFi apps allowed)
- **DDNS:** `dsmmc3.mycrestron.com` (Crestron) — not needed once Cloudflare Tunnel is active
- **External port available:** 50000 (via neighbour's router forward) — NOT used in the chosen design
- **Robot:** `192.168.10.10`, TCP 10003 (API/command) + 1884 (MQTT). **Never expose 10003 to the Internet.**
- **Dedicated always-on PC** (Hugo has one) will host the robot FastAPI software + `cloudflared`. OS, VLAN, and sleep settings TBD.

---

## 6. Rules — non-negotiable

Apply without being asked.

- **Data persistence:** Everything DB-persisted. No cookies-as-storage, no in-memory singletons for real data.
- **Secrets:** Env vars only. Never commit tokens. Neon URL, QuickBooks OAuth creds, future Cloudflare service tokens → Vercel env + local `.env.local`.
- **Git on Windows:** Always `cd /d "full path with quotes"` before git / npm / python commands.
- **Robot entry point:** `python run.py`, never `python -m app.main`.
- **Startup scripts** live in `AAA - Start projects and boot errors\`, not inside service folders.
- **Naming:** "Stations" not "Jobs". "Main Contact" + "Staff" (not "Client" + "User").
- **Contact model:** email is main ID, reassignable between clients.
- **Update this file (HANDOFF.md) on any architectural change.** Do not rely on chat history or memory alone as record.

---

## 7. Remote access plan — Vercel ↔ on-prem robot

### 7.1 Why not WireGuard / VPN?
Initial plan was UniFi WireGuard with the portal as a client. **Rejected** because Vercel is serverless — its functions are ephemeral containers, cannot hold a persistent VPN tunnel. Same reason kills OpenVPN, Tailscale-on-Vercel, and any inbound-port-forward approach where the portal side needs to dial out.

### 7.2 Chosen design — Cloudflare Tunnel

```
Vercel (Next.js API route)
   │  HTTPS + Cloudflare Access service token
   ▼
Cloudflare edge  (auth check — drops unauthenticated traffic)
   │  existing outbound tunnel
   ▼
cloudflared   (on the always-on PC inside Atelier DSM LAN)
   │  local LAN (inter-VLAN rule may be needed)
   ▼
Robot FastAPI  192.168.10.10:8080     ← NOT raw 10003
```

**Why this works:**
- Zero inbound ports opened on the UniFi router
- No public IP needed (solves the double-NAT problem)
- Cloudflare Access enforces auth before traffic reaches the LAN
- Free tier is enough

### 7.3 Open questions to resolve when resuming
1. OS of the dedicated always-on PC (Windows / Linux / macOS)?
2. Is it always on? Sleep/hibernate disabled?
3. Which VLAN is it on (Default or Cobots)? If Default, need inter-VLAN firewall rule for 192.168.10.0/24:8080.
4. Does Hugo have a Cloudflare account + a domain on Cloudflare (e.g. `atelierdsm.com`)?

### 7.4 Setup steps (infrastructure, guided with Hugo)
1. Install `cloudflared` on the dedicated PC.
2. `cloudflared tunnel login` — authenticate to Cloudflare.
3. Create named tunnel (e.g. `dsm-robot-01`) + DNS record (e.g. `robot-01.atelierdsm.com`).
4. Configure ingress: `robot-01.atelierdsm.com` → `http://192.168.10.10:8080`.
5. Run `cloudflared` as a system service (Windows service / systemd unit) — must survive reboots.
6. In Cloudflare Zero Trust, create an **Access Application** for that hostname + a **Service Token** policy.
7. Save service-token values to Vercel env vars: `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
8. Add inter-VLAN firewall rule on UniFi if needed.
9. End-to-end test: `curl` the hostname without headers → should be rejected. `curl` with service-token headers → should return the robot UI.

### 7.5 Robot software changes (`services/robot`)
Add a **Remote Access** settings panel to the robot web UI. All fields DB-persisted:

| Field | Type | Example |
|---|---|---|
| `tunnel_hostname` | string | `robot-01.atelierdsm.com` |
| `tunnel_enabled` | bool | true |
| `robot_internal_port` | int | `8080` |
| `last_reachable_at` | datetime | populated by background check |
| `last_error` | string | populated by background check |

Endpoints:
- `GET /api/remote-access` — current config + reachability status
- `PUT /api/remote-access` — update (admin only)

Dashboard badge: hostname + status dot (green ok / grey unknown / red failed) + copy-to-clipboard.

Background check every 5 min: robot pings its own Cloudflare hostname from outside (or a canary endpoint) and stores result.

Do **NOT** embed the Cloudflare service token on the robot — only the portal needs it.

### 7.6 Portal changes (`services/portal`)
Extend the `Machine` Prisma model:
```prisma
tunnelHostname   String?
tunnelProtocol   String   @default("https")   // https | http
tunnelPort       Int?                          // null for 443
remoteEnabled    Boolean  @default(false)
lastReachableAt  DateTime?
lastReachableErr String?
```

Admin "Edit machine" page:
- Section "Remote Access" with the fields above.
- "Test connection" button — server-side API route does an authenticated request through the tunnel and reports success / latency / error.
- Status badge with `lastReachableAt`.

Server-side proxy route (Next.js):
- `GET /api/machines/[id]/robot-proxy/*`
- Forwards to `https://{tunnelHostname}{path}` with `CF-Access-Client-Id` + `CF-Access-Client-Secret` headers from env.
- Requires admin JWT auth (same as rest of portal).
- NEVER exposes the service token to the browser.

Vercel env vars: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.

### 7.7 Status
**Not yet implemented.** Pending: dedicated PC setup + Cloudflare account/domain decision.

---

## 8. In-progress work (keep moving)

### 8.1 Machine tracking rearchitecture
Replace the old `machineType` string field with an invoice-anchored `Machine` model. Every deployed robot becomes a first-class DB entity linked to the invoice it was sold/rented under.

### 8.2 Contact model refactor
- Email is the main ID for a Contact.
- Contacts are reassignable between `ManagedClient`s.
- Terminology: **Main Contact** (primary) + **Staff** (others on the client).
- **Status (2026-04-13):** Backend done. DB `Contact.type` values renamed `responsible`→`maincontact`, `employee`→`staff`. API routes normalise legacy values in/out, and the `[contactId]` PATCH route now accepts `managedClientId` for the "Alice-moves-companies" reassignment flow (validates target client, handles main-contact-uniqueness on transfer). External API payload keys (`responsiblePerson`, `subEmployees`) unchanged so dependent pages keep working.
- **Pending:** Hugo runs `prisma/migrations/20260413_rename_contact_type.sql` against Neon once (two UPDATE statements, idempotent). Then a follow-up UI pass on `admin/clients/page.tsx` to replace the internal `'responsible'`/`'employee'` literal with `'maincontact'`/`'staff'` (cosmetic — backend normalises so nothing breaks today).

### 8.3 QuickBooks token persistence
Move QB OAuth tokens from cookies → DB with automatic refresh. Must survive server restarts and user logout.
- **Status (2026-04-13): DONE.** `src/lib/quickbooks.ts` no longer has cookie encrypt/decrypt/read/write helpers; DB (`QBToken` row id="singleton") is the sole source of truth. All 4 QB routes (`callback`, `status`, `customers`, `invoices`, `estimates`) now read DB-only. Refresh tokens auto-persist inside `ensureValidToken`. `buildClearLegacyCookie()` kept + aliased as `buildClearTokenCookie` to scrub any stale `qb_tokens` cookie still sitting in admin browsers.

### 8.4 Stations workflow
- Rename "Jobs" → "Stations" everywhere.
- Invoices are clickable → user picks line items → click creates a new Station for those items.
- **Status (2026-04-13, session 2): CODE DONE, DB MIGRATION PENDING.** Full structural rename implemented (option B) + line-item picker (option C). Prisma schema renamed (`Job`→`Station`, `JobInvoice`→`StationInvoice`, `JobMachine`→`StationMachine`, `JobRobotProgram`→`StationRobotProgram`, `JobLaserPreset`→`StationLaserPreset`; `jobNumber`→`stationNumber`; `jobId` FK cols→`stationId`; `MachineStateLog.jobId`→`stationId`); `StationInvoice.lineItemsJson String? @db.Text` added. All 8 API route files moved `src/app/api/jobs/*` → `src/app/api/stations/*` and rewritten to use new Prisma model calls. Admin page moved `src/app/admin/jobs/page.tsx` → `src/app/admin/stations/page.tsx` with full rename + 2-stage invoice modal (stage 1: pick invoice; stage 2: checkbox each line item with editable quantity). Sidebar nav `/admin/jobs` → `/admin/stations`. Cross-cutting refs fixed in `state-log/route.ts` (accepts both `stationId` and legacy `jobId`), `api/machines/route.ts` (now selects `stations`), `admin/machines/page.tsx`, `admin/clients/page.tsx`. The old `app/api/jobs/` and `app/admin/jobs/` files are **redirect stubs** (sandbox couldn't delete) — Hugo needs to `git rm -r src/app/api/jobs src/app/admin/jobs` locally.
- **Status (prior session — left for context):** Not started. Scoping done — three sub-pieces:
  - **A. UI labels:** translations.ts already uses "Stations" vocabulary (keys `stations`, `stationsSection`, `newStation`, `createStation`, `selectLineItems`, `howManyStations`, etc.). Most user-visible text is already "Stations".
  - **B. Structural rename (DO NEXT, in a dedicated session with a Neon backup first):** rename Prisma models `Job`→`Station`, `JobInvoice`→`StationInvoice`, `JobMachine`→`StationMachine`, `JobRobotProgram`→`StationRobotProgram`, `JobLaserPreset`→`StationLaserPreset`; rename FK columns (`jobId`→`stationId`); move folders (`app/admin/jobs`→`app/admin/stations`, `app/api/jobs`→`app/api/stations`); update ~1,800 lines across the 1,136-line jobs page + 7 API route files. **CRITICAL: `prisma db push` will DROP and recreate the renamed tables, destroying data. Must write a hand-crafted SQL migration using `ALTER TABLE ... RENAME TO` and `RENAME COLUMN`, run it FIRST, then `db push`.**
  - **C. Invoice line-item picker feature:** i18n keys exist (`selectLineItems`, `createStation`, `howManyStations`, `addToStation`, `addToExisting`). Likely partially implemented. Feature: click a QB invoice in the admin Stations page → modal lets admin pick line items + quantities → creates a Station (or adds to existing) anchored to those items.

### 8.5 Clients page redesign
- Hide the raw QuickBooks list until the user searches.
- Rename "My Clients" → "Enrolment".
- Merge the Enrolment view into the left panel.
- **Status (2026-04-13 session 2): DONE (layout already matched the spec).** QB search box at top of left panel, results only appear when `qbSearch.trim().length > 0`, Enrolment list below. i18n key `enrolment` already in translations.ts (fr: "Inscription", en: "Enrolment"). As part of the same pass, all internal `'responsible'`/`'employee'` literals in `admin/clients/page.tsx` were migrated to `'maincontact'`/`'staff'` (finishes the cosmetic cleanup deferred from session 1).

### 8.6 Portal — @unique on Contact.email
Cleanup ran (1 duplicate removed). `git push` done (commit `463075d`). Still pending: Hugo runs `npx prisma db push` from `services/portal` on his PC to apply the @unique + the new Contact.type comment to Neon.

---

## 9. Deferred backlog (don't start yet)

### 9.1 Robot licensing / remote kill-switch — DONE (session 3, 2026-04-13)
See §15 for implementation details. Original spec kept below for reference.

Admin-controlled per-robot timeout:
- **Sold** units run indefinitely.
- **Rented** units expire after N days (default 30).
- **Kill-switch**: immediate remote disable, admin-side only, client cannot bypass.
- Schema additions planned on `Machine`: `licenseMode`, `expiresAt`, `killSwitchActive`.
- Robot enforces on startup + periodic heartbeat; short offline grace period.
- Tamper-resistant (client cannot bypass by editing local files).
- **Keep the `Machine` schema extensible now so this can drop in later — but do not implement until Hugo asks.**

### 9.2 Remote access (section 7)
On hold pending dedicated-PC setup and Cloudflare account/domain.

### 9.3 Relfar DB persistence — DONE (session 3, 2026-04-13)
SQLite persistence landed; see §15. Original spec below for reference.

Replace in-memory state with SQLite to honour the Data Persistence Rule.

---

## 10. Useful commands (Windows)

```
# Start robot dev
cd /d "C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\services\robot" && python run.py

# Start portal dev
cd /d "C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\services\portal" && npm run dev

# Apply Prisma DB schema changes
cd /d "C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\services\portal" && npx prisma db push

# Open UniFi admin
https://192.168.20.1
```

---

## 11. Known issues (not project bugs, for context)

Hugo has reported that Cowork chat occasionally surfaces stale/old messages mid-conversation. Reported via thumbs-down and/or `support.claude.com`. Not something Claude can fix — mentioned only so a future session knows the context if Hugo brings it up.

---

## 12. When you pick this up

1. Read this whole file.
2. Ask Hugo: "Which item from §8 do you want to tackle today?" (or §7 if remote access is next).
3. Do the work. Respect all rules in §6.
4. Before ending, update this file:
   - If architecture changed → §2–§5.
   - If status of any in-progress item changed → §8 or §9.
   - Bump "Last updated" at the top.
5. That's it.

---

*End of handoff. Single source of truth — no other docs needed.*

---

## 13. Session log — 2026-04-13

### Completed this session
- **8.2 Contact model refactor (backend only):**
  - `prisma/schema.prisma` — updated Contact model header comment; `type` comment now documents `"maincontact" | "staff"` with legacy migration note.
  - `prisma/migrations/20260413_rename_contact_type.sql` — new one-shot idempotent SQL that migrates legacy `responsible`→`maincontact` and `employee`→`staff`.
  - `src/app/api/managed-clients/route.ts` (GET) — reads both new and legacy type values so nothing breaks mid-transition.
  - `src/app/api/managed-clients/[id]/contacts/route.ts` (POST) — normalises incoming legacy type values, rejects unknown values, only one Main Contact per client (checks both `maincontact` and `responsible`).
  - `src/app/api/managed-clients/[id]/contacts/[contactId]/route.ts` (PATCH) — now accepts `managedClientId` for reassignment ("Alice-moves-companies"), validates target client exists, handles main-contact uniqueness on transfer, normalises type.
  - External API payload keys (`responsiblePerson`, `subEmployees`) deliberately **unchanged** so dependent pages (training, tickets, setup-account, admin/clients) keep working without touching them.
- **8.3 QuickBooks token persistence:**
  - `src/lib/quickbooks.ts` — removed cookie encrypt/decrypt/read/write helpers. DB (`QBToken` row `id="singleton"`) is now the sole source of truth. Kept `buildClearLegacyCookie()` + aliased it as `buildClearTokenCookie` so admin browsers still carrying a stale `qb_tokens` cookie get it cleared on next request.
  - `src/app/api/quickbooks/callback/route.ts` — saves tokens to DB (already did via `handleCallback`); now clears legacy cookie on redirect instead of setting a new one.
  - `src/app/api/quickbooks/status/route.ts` — DB-only.
  - `src/app/api/quickbooks/customers/route.ts`, `invoices/route.ts`, `estimates/route.ts` — DB-only; no Set-Cookie on refresh (auto-refresh still persists to DB inside `ensureValidToken`).
  - Verified: no other code in `src/` still imports the removed helpers.

### Pending local actions for Hugo (run on your PC)
1. **Apply schema changes to Neon (covers 8.6 + 8.2 schema comment):**
   ```
   cd /d "C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\services\portal" && npx prisma db push
   ```
2. **Run the one-shot type rename SQL** against Neon (paste into Neon's SQL editor, or psql):
   ```sql
   UPDATE "Contact" SET "type" = 'maincontact' WHERE "type" = 'responsible';
   UPDATE "Contact" SET "type" = 'staff'       WHERE "type" = 'employee';
   ```
3. **Smoke test** admin/clients: view, add, edit, delete contacts should all work.
4. **Smoke test QB connection:** click Connect → reconnect → verify tokens still work after `npm run dev` restart (prove DB persistence).

### What to pick up next session
The in-progress item is **8.4** (Stations workflow). User has selected **option B — full structural Job→Station rename**. Before starting that work, the next session must:
1. Ask Hugo to take a Neon DB backup (Neon console → branch a snapshot).
2. Draft the full migration plan (table renames, column renames, Prisma schema diff, folder moves, code-level search-and-replace checklist).
3. Write the hand-crafted `ALTER TABLE RENAME`/`RENAME COLUMN` SQL script BEFORE running `prisma db push`.
4. Rename model names in `schema.prisma`, update all `prisma.job.*` calls to `prisma.station.*`.
5. `git mv` the folders `src/app/admin/jobs` → `src/app/admin/stations` and `src/app/api/jobs` → `src/app/api/stations`.
6. Update the sidebar nav entry and any hardcoded `/admin/jobs` / `/api/jobs` strings.
7. After rename ships, do option C (invoice line-item picker feature).

### Untouched but flagged
- `services/portal/.gitignore`, `services/portal/next.config.js`, `services/relfar/*`, `services/robot/app/static/js/robot3d.js` and many untracked `services/relfar/*_results.json`, `*_scanner.py`, `*_scan.py` files were already modified/untracked before this session. Hugo chose to leave them alone. They need their own triage session.
- `admin/clients/page.tsx` still uses internal literal values `'responsible'`/`'employee'` — backend normalises so it works today. Cosmetic cleanup deferred.

### Files touched this session
```
prisma/schema.prisma                                           (comment only)
prisma/migrations/20260413_rename_contact_type.sql             (new)
src/lib/quickbooks.ts                                          (cookie helpers removed)
src/app/api/quickbooks/callback/route.ts
src/app/api/quickbooks/status/route.ts
src/app/api/quickbooks/customers/route.ts
src/app/api/quickbooks/invoices/route.ts
src/app/api/quickbooks/estimates/route.ts
src/app/api/managed-clients/route.ts
src/app/api/managed-clients/[id]/contacts/route.ts
src/app/api/managed-clients/[id]/contacts/[contactId]/route.ts
HANDOFF.md                                                     (this file)
```

### To resume in a new chat
Paste this, exactly, as your first message in a fresh Cowork conversation with the Prisma folder linked:

> Read `HANDOFF.md` in full before doing anything. It contains the complete system architecture, current state, in-progress work, backlog, rules, remote-access plan, AND the §13/§14 session logs from previous chats. After reading, ask me which §8 item I want to tackle today — do not assume from memory alone. Narrate your progress as you work so I don't think you're stuck.

---

## 14. Session log — 2026-04-13 (session 2)

### Completed this session
- **8.4B — Jobs → Stations full structural rename (code complete, DB migration pending).**
  - `prisma/schema.prisma` — models renamed: `Job→Station`, `JobInvoice→StationInvoice`, `JobMachine→StationMachine`, `JobRobotProgram→StationRobotProgram`, `JobLaserPreset→StationLaserPreset`. Column `jobNumber→stationNumber`, FK columns `jobId→stationId` on every child model + `MachineStateLog`. Added `StationInvoice.lineItemsJson String? @db.Text` for 8.4C.
  - `prisma/migrations/20260413_jobs_to_stations.sql` — NEW. Hand-crafted `ALTER TABLE RENAME` / `RENAME COLUMN` + constraint/index renames, all guarded by `IF EXISTS` for idempotency. Wrapped in a single transaction.
  - API folder copied `src/app/api/jobs/*` → `src/app/api/stations/*` (8 route files) and rewritten: `prisma.job*` → `prisma.station*`, `jobId`/`jobNumber` renamed, all relation keys updated, comments + error messages updated, JSON response keys renamed (`{ jobs }` → `{ stations }`, `{ job }` → `{ station }`, `jobNumber` → `stationNumber`). Station number prefix is `STN-`.
  - `src/app/api/stations/[id]/invoices/route.ts` POST now accepts optional `lineItems` array → stores as `lineItemsJson`. Returns the full updated `station` so the frontend can replace state.
  - Admin page copied `src/app/admin/jobs/page.tsx` → `src/app/admin/stations/page.tsx` (1,136 lines) and fully renamed: API URLs, types (`Job`/`JobInvoice` → `Station`/`StationInvoice`), state variables, handler functions (`handleCreateJob` → `handleCreateStation` etc.).
  - Sidebar nav updated in `src/app/admin/layout.tsx` (`/admin/jobs` → `/admin/stations`).
  - Cross-cutting fixes:
    - `src/app/api/state-log/route.ts` — accepts either `stationId` (preferred) or legacy `jobId`, returns both keys in response for back-compat with robot/relfar services.
    - `src/app/api/machines/route.ts` — now `include: { stations: { include: { station: true } } }`, response key `jobs` → `stations` with `stationNumber`.
    - `src/app/admin/machines/page.tsx` — Machine interface + render updated to `stations`.
    - `src/app/admin/clients/page.tsx` — all `/api/jobs` paths → `/api/stations`; internal `'responsible'`/`'employee'` literals → `'maincontact'`/`'staff'` (finishes deferred cleanup from session 1).
  - **Sandbox could not delete files.** Old `src/app/admin/jobs/page.tsx` + all 8 files under `src/app/api/jobs/` have been **overwritten with redirect/410-Gone stubs**. Each stub has a comment at the top with the exact `git rm -r` command for Hugo to run. This is a cleanup action required on Hugo's PC; the app is fully functional in the meantime.
- **8.4C — Invoice line-item picker (DONE).**
  - Existing single-stage "Link Invoice" modal in `admin/stations/page.tsx` replaced with a 2-stage flow: stage 1 is the invoice list (each row has "Select line items" + "Link all" buttons); stage 2 is a checkbox list of the QB invoice's line items with a per-line editable quantity input (defaults to full quantity). Submitting POSTs `{ qbInvoiceId, invoiceNumber, invoiceType, amount, lineItems:[{lineIndex, description, quantity, amount, model?}] }` — amounts are prorated when quantity is reduced.
  - Uses existing i18n keys (`selectLineItems`, `addToStation`, `linkAll`) with English fallbacks for any missing.
- **8.5 — Clients page redesign (DONE).**
  - Layout already matched the spec (QB search box at top, results hidden until `qbSearch.trim().length > 0`, Enrolment list below). i18n key `enrolment` already exists. Internal `'responsible'`/`'employee'` literal cleanup landed as part of 8.4B cross-cutting pass (see above).

### Pending local actions for Hugo (run on your PC)
**Do these in order on `C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\services\portal`:**

1. **Confirm Neon snapshot** (you said you would take it before this session's migration — don't proceed without it).
2. **Run the SQL migration** against Neon (paste into Neon SQL editor, or `psql $DATABASE_URL < prisma/migrations/20260413_jobs_to_stations.sql`). It is idempotent.
3. **If still pending from session 1**, also run the Contact type SQL (session 1's `20260413_rename_contact_type.sql`) and the @unique push.
4. **`npx prisma db push`** — should now report "Database is in sync" with no destructive changes. If it offers to drop `Job*` tables, STOP — the SQL migration didn't run.
5. **Delete the old job folders locally** (sandbox couldn't):
   ```
   cd /d "C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\services\portal"
   git rm -r src/app/api/jobs src/app/admin/jobs
   ```
6. **Smoke test** `/admin/stations`:
   - Create a new station, assign machines, confirm `stationNumber` shows as `STN-NNN`.
   - Click "Link invoice" on a station → both "Select line items" and "Link all" should work.
   - Select a subset of line items with reduced quantities → submit → verify the linked invoice on the station shows only the picked items with prorated amounts.
7. **Smoke test** `/admin/machines` — each machine card should list stations with `stationNumber`.
8. **Smoke test** `/admin/clients` — QB list hidden until typing; Enrolment list loads; main contact + staff flows still work.
9. **Deploy to Vercel** only after local smoke test passes.

### Known risks / things to watch
- Any external callers (robot service, relfar service) that POST to `/api/state-log` with `jobId` will keep working — the field is accepted as an alias. When Hugo updates those services, switch them to `stationId`.
- If a station has machines attached via invoices *only* (not via `StationMachine`), they may not render in admin/stations page yet — the schema supports it (`Station.invoices[].machines`) but the UI currently reads `station.machines` (the many-to-many). Flagged for 8.1 follow-up.
- The `StationInvoice.lineItemsJson` column is new — existing rows will be `NULL`, which is treated as "full invoice linked" (legacy behaviour preserved).

### Files touched this session
```
prisma/schema.prisma                                           (6 models renamed + new field)
prisma/migrations/20260413_jobs_to_stations.sql                (new)
src/app/admin/layout.tsx                                       (nav link)
src/app/admin/clients/page.tsx                                 (paths + literals)
src/app/admin/machines/page.tsx                                (stations relation)
src/app/admin/stations/page.tsx                                (NEW — copied from jobs/)
src/app/admin/jobs/page.tsx                                    (stub — git rm this)
src/app/api/machines/route.ts                                  (include stations)
src/app/api/state-log/route.ts                                 (stationId/jobId alias)
src/app/api/stations/**                                        (NEW — 8 route files)
src/app/api/jobs/**                                            (stubs — git rm these)
HANDOFF.md                                                     (this file)
```

### What to pick up next session
- 8.1 finish — surface machines from `station.invoices[].machines` in the admin UI (dedupe with `StationMachine`-linked machines); also add a UI to link a Machine back to its source invoice when creating it, so invoice-anchoring is enforced.
- 8.6 still pending from session 1: run `npx prisma db push` to apply the @unique on Contact.email + the Contact.type comment change (covered by #4 above if not yet run).
- §9.1 licensing kill-switch (deferred — do not start until Hugo asks).
- §7 remote access (deferred — blocked on dedicated always-on PC).
- §9.3 Relfar DB persistence (deferred).

---

## §15 — Session 3 log (2026-04-13)

Three workstreams completed this session: 8.1 UI polish (invoice-anchored machines), §9.1 licensing kill-switch (portal + robot), §9.3 Relfar SQLite persistence.

### 8.1 — Invoice-anchored machines in admin UI (DONE)
- `src/app/admin/stations/page.tsx` — the station edit panel now merges machines from `editingStation.invoices[].machines` with the `StationMachine` list, de-duplicated by machine id. Machines that reach the station only via an invoice link are now visible.

### §9.1 — Machine licensing / kill-switch (DONE, opt-in from Hugo)
Portal side:
- `prisma/schema.prisma` — `Machine` gains `licenseMode` (default `'unlicensed'`), `expiresAt`, `killSwitchActive` (default `false`), `licenseLastCheckedAt`.
- `prisma/migrations/20260413_machine_licensing.sql` — new, idempotent, transactional `ADD COLUMN IF NOT EXISTS` for the four fields.
- `src/app/api/machines/route.ts` — GET now returns the four license fields for each machine.
- `src/app/api/machines/license/[serial]/route.ts` — NEW. `GET` is the robot heartbeat endpoint (returns `{licenseMode, expiresAt, killSwitchActive}`, updates `licenseLastCheckedAt` best-effort, returns `unlicensed` for unknown serials). `PATCH` is the admin update endpoint (validates `licenseMode ∈ ['unlicensed','sold','rented','killed']`).
- `src/app/admin/machines/page.tsx` — new `LicensePanel` per machine card: mode dropdown, `expiresAt` date input, `killSwitchActive` checkbox, read-only `licenseLastCheckedAt` display.

Robot side (services/robot):
- `app/database.py` — new `LicenseState` model with HMAC-SHA256 integrity (`compute_hmac`, `verify`, `is_valid_now`). Tamper-resistant; local DB edits without the secret will fail verification.
- `app/license.py` — NEW. `sync_from_portal`, `apply_portal_state`, `is_operational` (honours `killed`, `unlicensed`, and `expiresAt` with 72-hour offline grace window from `licenseLastCheckedAt`), `start_background_heartbeat` (15-minute daemon thread).
- `app/main.py` — added `require_license()` dependency on all 12 motion endpoints; added `GET /api/license` and `POST /api/license/refresh`.
- `config.py` — new env vars: `ROBOT_SERIAL`, `PORTAL_URL`, `ROBOT_LICENSE_SECRET`, `LICENSE_STRICT`.

### §9.3 — Relfar SQLite persistence (DONE)
- `services/relfar/database.py` — NEW, 5 SQLAlchemy models (`ControllerSettings` singleton, `LaserPreset`, `ScanResult`, `StateLog`, `RegisterSnapshot`). SQLite at `data/relfar.db`.
- `services/relfar/server.py` — DB init on boot, settings loaded into memory on startup, persist on connect/scan/read. Existing `*_results.json` files still read for backward compat.
- `services/relfar/requirements.txt` — added `SQLAlchemy>=2.0`.

### Pending local actions for Hugo (session 3)
Run in addition to session 2's pending actions (which should be done first):

1. **Run** `prisma/migrations/20260413_machine_licensing.sql` in Neon.
2. **`npx prisma db push`** — should report "Database is in sync" (additive only).
3. **Robot env vars** — set on the robot PC (either via `.env` or system env):
   - `ROBOT_SERIAL` — e.g. `R-001` (must match the `Machine.serialNumber` in the portal).
   - `PORTAL_URL` — e.g. `https://prisma.atelierdsm.com`.
   - `ROBOT_LICENSE_SECRET` — generate a strong random string; set the same value on the portal env (not yet wired in — portal responses aren't HMAC-signed yet; see Risks below).
   - `LICENSE_STRICT` — `true` in production; `false` during initial rollout.
4. **Relfar** — `pip install -r services/relfar/requirements.txt` to pull SQLAlchemy. First boot will create `data/relfar.db` automatically.
5. **Smoke tests:**
   - `/admin/machines` — each card shows the License panel; changing mode/expiry/kill-switch persists.
   - Robot: `GET /api/license` returns current state; flipping `killSwitchActive=true` in portal → within 15 minutes (or after `POST /api/license/refresh`) motion endpoints return 403.
   - Relfar: reboot → preset list and controller settings survive.

### Known risks / follow-ups
- Portal's `GET /api/machines/license/[serial]` response is **not yet HMAC-signed**. Robot's `LicenseState.compute_hmac` exists so the stored state is tamper-evident locally, but a MITM between robot and portal could still forge a response. Tightening this requires portal-side signing with `ROBOT_LICENSE_SECRET` and is planned alongside the §7 Cloudflare Tunnel work — not blocking for internal rollout.
- License endpoint is currently unauthenticated (see comment in route file). Acceptable until Cloudflare Access is in place.
- Relfar DB schema is v1; no migrations framework yet. If fields are added, bump schema manually or drop `data/relfar.db` during development.

### Files touched this session
```
services/portal/prisma/schema.prisma                                       (Machine +4 fields)
services/portal/prisma/migrations/20260413_machine_licensing.sql           (NEW)
services/portal/src/app/admin/machines/page.tsx                            (LicensePanel)
services/portal/src/app/admin/stations/page.tsx                            (invoice-anchored machines merge)
services/portal/src/app/api/machines/route.ts                              (license fields in response)
services/portal/src/app/api/machines/license/[serial]/route.ts             (NEW GET + PATCH)
services/robot/app/database.py                                             (LicenseState model + HMAC)
services/robot/app/license.py                                              (NEW — sync + gate + heartbeat)
services/robot/app/main.py                                                 (require_license on motion)
services/robot/config.py                                                   (license env vars)
services/relfar/database.py                                                (NEW — 5 models)
services/relfar/server.py                                                  (DB integration)
services/relfar/requirements.txt                                           (SQLAlchemy)
HANDOFF.md                                                                 (this file)
```

### What to pick up next session
- Portal-side HMAC signing of license responses (close the MITM gap).
- §7 Cloudflare Tunnel + Access — still blocked on always-on PC.
- Robot and Relfar CI/test harness for the new DB/license code paths.
- Any invoice-anchored-machine UX polish discovered during Hugo's smoke test.

---

## §16 — Session 4 log (2026-04-13): Admin team management

Delivered admin invite / management flow so any admin can add or remove other admins. Plus long-overdue fix of the plaintext password bug.

### Decisions
- **Any admin** (not a special superadmin) can invite/deactivate/remove other admins. Safety rails: you can't deactivate yourself, and the system refuses to remove the last active admin.
- Invite-by-email flow using the existing `inviteToken` field + new `inviteExpiresAt` (48h TTL).
- Passwords migrated from plaintext to bcrypt (`bcryptjs`, 10 rounds). Legacy plaintext rows are transparently rehashed on next successful login — no forced reset.

### Schema + migration
- `prisma/schema.prisma` — `User` gains `inviteExpiresAt DateTime?`; comments updated for role/status enums.
- `prisma/migrations/20260413_admin_team.sql` — adds `inviteExpiresAt` column (idempotent); ensures `finance@atelierdsm.com` is at least an `admin` (no-op if absent).

### New files
- `src/lib/password.ts` — `hashPassword`, `verifyPassword` (with legacy-plaintext fallback + rehash signal), `generateInviteToken`, `isBcryptHash`.
- `src/lib/requireAdmin.ts` — route-guard helper; returns `{ user }` or `{ error: NextResponse }` with 401/403.
- `src/app/api/admin/team/route.ts` — `GET` lists admins; `POST` invites (or re-invites an existing row) and returns a one-use invite URL.
- `src/app/api/admin/team/[id]/route.ts` — `PATCH` updates name/status, resends invite; `DELETE` hard-deletes or falls back to demote-to-client if the row has FK-protected relations.
- `src/app/api/auth/accept-invite/route.ts` — `GET` introspects an invite token; `POST` consumes it (sets bcrypt password, flips `status='active'`, issues `auth-token` cookie so the user is logged in).
- `src/app/accept-invite/page.tsx` — public page to set password.

### Modified
- `src/app/api/auth/login/route.ts` — now uses `verifyPassword`; silently rehashes legacy plaintext on success.
- `src/app/admin/settings/page.tsx` — new Team card above Training Templates: invite form, invite URL display (copy button, 48h note), list of admins with Resend invite / Deactivate / Remove actions, self-guards (`isSelf` disables self-remove and toggle).
- `package.json` — added `bcryptjs` + `@types/bcryptjs`.

### Pending local actions for Hugo (session 4)
1. `cd services/portal && npm install` (pulls bcryptjs).
2. Run `prisma/migrations/20260413_admin_team.sql` against Neon.
3. `npx prisma db push` — should be "in sync" (additive only).
4. Deploy / restart.
5. Smoke test:
   - Log in as `finance@atelierdsm.com` — existing password should still work; DB row's `password` should be rewritten to a `$2b$...` hash after login (check with `prisma studio`).
   - `/admin/settings` → scroll to Team → **Invite admin** → fill name + email → copy the invite URL returned.
   - Open the invite URL in a private window → set a password → should land logged in as the new admin.
   - From the primary account, **Resend invite** / **Deactivate** / **Remove** should all work; try to remove yourself — UI hides the button and API returns 400 if forced.

### Known gaps / follow-ups
- Invite email is **not** sent automatically — the UI just returns the URL for you to share manually. Wiring `nodemailer` (already a dep) or a transactional mail provider is a small follow-up.
- No "forgot password" flow yet. The invite mechanism can be reused: an admin can re-invite themselves via SQL if locked out.
- No audit log of invite / remove actions.
- Role is a free-form string; consider a Prisma enum when we next touch the schema.

### Files touched this session
```
services/portal/prisma/schema.prisma                                 (inviteExpiresAt + comments)
services/portal/prisma/migrations/20260413_admin_team.sql            (NEW)
services/portal/package.json                                         (bcryptjs)
services/portal/src/lib/password.ts                                  (NEW)
services/portal/src/lib/requireAdmin.ts                              (NEW)
services/portal/src/app/api/auth/login/route.ts                      (bcrypt + rehash)
services/portal/src/app/api/auth/accept-invite/route.ts              (NEW)
services/portal/src/app/api/admin/team/route.ts                      (NEW)
services/portal/src/app/api/admin/team/[id]/route.ts                 (NEW)
services/portal/src/app/admin/settings/page.tsx                      (Team card)
services/portal/src/app/accept-invite/page.tsx                       (NEW)
HANDOFF.md                                                           (this file)
```
