---
name: Prisma — full architecture & structure reference
description: THE authoritative map of Prisma monorepo — services, PCs, network, paths, services, ports, tech stacks, file layout, deployment. Read this first every new chat.
type: project
originSessionId: 3a63e9c2-18f3-4dee-9dc6-3aa866de22f5
---
# Prisma — full architecture reference

Single source of truth so Hugo doesn't re-explain every session. Every new conversation should read this before asking structural questions.

## 0. Keeping this file accurate (read before editing)

**This file is load-bearing. Two copies exist and MUST stay in sync:**

1. `/sessions/<session>/mnt/.auto-memory/project_prisma_architecture.md` — the memory file, auto-loaded in every new chat.
2. `C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma\architecture reference\prisma_architecture.md` — the in-repo copy (mounted at `/sessions/<session>/mnt/Prisma/architecture reference/prisma_architecture.md` when Hugo grants access).

**When to update — automatic triggers (any chat should act on these without being asked):**
- A new service or PC is added / removed.
- A port, path, entry point, env var, or service name changes.
- A hard convention or rule changes.
- Hardware (cobot / laser / network topology) changes.
- Any statement in this doc is contradicted by what you observe in the code or commands.

**How to update:**
1. Edit the memory file (section 0-14 as relevant).
2. Mirror the same change to the in-repo copy if Prisma is mounted. If it's not mounted, request it via `mcp__cowork__request_cowork_directory` with path `C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma`.
3. Commit the in-repo copy from DEV PC when convenient: `git add "architecture reference/prisma_architecture.md" ; git commit -m "docs(arch): <what changed>"`.

**Hugo's shortcut:** if Hugo types `UPDATE ARCH`, re-read the current repo state (recent git log, ARCHITECTURE.md, BACKLOG.md) and rewrite this file to match, then mirror into the in-repo copy.

## 1. Business context

- **Atelier DSM** — Hugo's company. Sells and rents stations: each station = 1 cobot + 1 laser + 1 PC.
- Brand names in use: "Prisma", "LaserNet", "Summum Liner".
- Long-term: Portal (cloud) owns UI + IP-heavy logic; station PCs become thin executors (anti-cloning strategy — see IP protection memory).

## 2. The monorepo — Prisma

Single active monorepo. Three services under `services/`:

| Service | Tech | Purpose | Port | Persistence |
|---|---|---|---|---|
| `services/portal` | Next.js 14 + TS + Tailwind + Prisma ORM | Web portal — admin, clients, stations, invoices, CRM/onboarding, QuickBooks | deployed on Vercel | Neon Postgres |
| `services/robot` | Python + FastAPI ("Elfin Cobot Studio") | Local controller for the Elfin cobot | 8080 | SQLite |
| `services/relfar` | Python + Flask ("Relfar laser bridge") | Local controller for Relfar V4 laser cleaner | 5000 | SQLite (violates DB rule — refactor backlogged) |

Other repo roots: `shared/`, `scripts/`, `_quarantine/`, `BACKLOG.md`, `HANDOFF.md`, `README.md`, `docker-compose.yml`, `vercel.json`, `start-all.bat`, `push-update.bat`.

**Authoritative docs inside the repo:** `HANDOFF.md` (full system map — paste into a fresh chat), `BACKLOG.md` (in-progress + deferred work), `services/portal/TODO.md` (per-service shipping log). There is no `ARCHITECTURE.md` at the root anymore — older memories that reference it are stale; use `HANDOFF.md` instead. The standalone deep-dive lives at `architecture reference/prisma_architecture.md`.

## 3. The PCs — who runs what

There are (currently) two physical machines in play:

### DEV PC — Hugo's laptop
- Path: `C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma`
- Edits code, commits, pushes to GitHub.
- Runs Portal locally in dev when needed (`next dev`).
- Does NOT run the robot or relfar services in production.

### ROBOT PC — the station PC
- Path: `C:\Prisma`
- Sparse-clones only `services/robot/` and `services/relfar/` (not `portal/`).
- Runs two Windows services via NSSM:
  - `ElfinRobot` — the robot FastAPI (port 8080). Entry: `python run.py` from `C:\Prisma\services\robot`.
  - `RelfarBridge` — the relfar Flask (port 5000). Entry: `relfar_server.py`.
- Connected to the cobot over Ethernet (`192.168.10.10:10003`) and the laser over WiFi (`192.168.20.225:123` on business WiFi — IP varies per network).
- On business WiFi the robot PC itself sits at `192.168.20.15`.

### PORTAL — cloud
- Runs on Vercel serverless. Neon Postgres backs it.
- Accessed from anywhere by Hugo / clients / admins.
- Issues commands down to station PCs; station PCs sync state up.

### (Future) ALWAYS-ON PC
- Not yet deployed. Would host Cloudflare Tunnel + QuickBooks token refresh cron.
- Blocked on Hugo installing a permanent machine at the shop.

## 4. File layout — quick reference

```
Prisma/                                  (monorepo root)
├── HANDOFF.md                           ← full system map, paste into fresh chats
├── BACKLOG.md                           ← active + deferred work
├── README.md
├── docker-compose.yml
├── vercel.json
├── start-all.bat
├── push-update.bat
├── architecture reference/
│   ├── prisma_architecture.md           ← deep-dive architecture doc
│   └── huayan-sdk-reference/            ← Han's Robot SDK samples + manual
├── shared/
├── scripts/
│   └── bootstrap-station.ps1            ← installs robot+relfar on a station PC
├── _quarantine/                         ← PARKED FILES — not deleted, not active.
│   │                                       Missing a file? Look here first.
│   │                                       See _quarantine/README.md for inventory.
│   ├── relfar-reverse-engineering/      ← 20 probe/sniff/scan scripts from protocol RE
│   ├── relfar-scan-artifacts/           ← JSON dumps, pcap, register logs
│   └── branding-assets/                 ← Prisma logo PNG/SVG variants
└── services/
    ├── portal/                          (Next.js, deployed to Vercel)
    │   ├── src/app/
    │   │   └── admin/                   ← admin pages
    │   │       ├── leads/               ← CRM leads (table + calendar + kanban + detail panel)
    │   │       ├── live-visits/         ← kiosk live-visit tracking
    │   │       ├── businesses/          ← entreprises
    │   │       ├── quotes/              ← QB-connected quote builder (requires QB connection)
    │   │       ├── clients/
    │   │       ├── stations/
    │   │       ├── station-pcs/
    │   │       ├── machines/
    │   │       ├── training/
    │   │       ├── inventory/           ← QB inventory browser + add stock
    │   │       ├── tickets/
    │   │       ├── improvements/    ← problem-solving & feature tracking (voice-to-text)
    │   │       ├── files/
    │   │       └── settings/
    │   ├── src/components/
    │   │   └── admin/Sidebar.tsx        ← expandable groups (children property)
    │   ├── src/lib/
    │   │   └── quickbooks.ts            ← QB API helpers incl. createQBEntity()
    │   ├── prisma/                      ← ORM schema + migrations
    │   └── package.json
    ├── robot/                           (Python FastAPI)
    │   ├── run.py                       ← ENTRY POINT
    │   ├── config.py                    ← load_dotenv() is LOAD-BEARING
    │   ├── .env                         ← local secrets (never committed)
    │   ├── requirements.txt
    │   └── app/
    │       ├── main.py                  ← FastAPI app + routes
    │       ├── robot_comm.py            ← TCP client for Elfin cobot
    │       ├── license.py               ← license verification + HMAC
    │       ├── templates/index.html     ← UI
    │       └── static/js/app.js         ← UI logic
    └── relfar/                          (Python Flask — production only, probes quarantined)
        ├── relfar_server.py             ← entry
        ├── relfar_protocol.py           ← 5A A5 frame protocol
        ├── discover.py                  ← "Find controller" network scan
        ├── database.py                  ← SQLAlchemy persistence
        ├── data/relfar.db               ← SQLite
        ├── static/
        ├── requirements.txt
        └── .env
```

## 5. Hardware

### Cobot — HUAYAN Robotics (Han's Robot subsidiary) — confirmed 2026-04-14 via pendant splash
- **Brand: Huayan Robotics** (Shenzhen), a **subsidiary of Han's Robot**. Huayan uses the Han's Robot SDK / TCP protocol — so Han's command names like `DragTeachSwitch`, `Electrify`, `GrpEnable` are correct. Device serial: `GK021450001`.
- Controller is Linux-based with 3 NICs: `enp1s0` = 192.168.156.2 (dedicated cable to pendant), `enp3s0` = 192.168.0.10, `enp4s0` = 192.168.10.10 (robot PC link).
- Pendant (tablet) at 192.168.156.100 talks to the robot over an isolated 192.168.156.0/24 subnet via dedicated cable. Not visible from robot PC's 192.168.10.x network.
- TCP control (from robot PC) at `192.168.10.10:10003`.
- **Protocol status:** `robot_comm.py` uses the Han's Robot TCP command family — correct for this hardware. Verified against **huayan-robotics/SDK_sample** (GitHub, Java source `HansRobotAPI_Base.java`, Oct 2025) — this is the authoritative reference for command wire format.
- **Free Drive / drag teach commands (confirmed 2026-04-14):**
  - ON:  `GrpOpenFreeDriver,0,;`  (NOT `DragTeachSwitch` — that was a wrong guess in the old code)
  - OFF: `GrpCloseFreeDriver,0,;`
  - FSM: StandBy → RobotOpeningFreeDriver → FreeDriver, and back via RobotClosingFreeDriver.
- **Error code meanings (from SDK `ErrorCode.java`):**
  - `20018` = `StateRefuse` — the robot is not in a state that accepts this command. This is why Electrify/StartMaster/GrpEnable return 20018 when the robot is already electrified/connected/enabled. Idempotent, not fatal — just treat as "already in target state".
  - `20005`, `20007` — NOT in the SDK's ErrorCode enum. These are likely controller-side responses for unknown commands or invalid params (20005 was being triggered because `DragTeachSwitch` is not a real command).
  - `39500` isNotConnect, `39501` paramsError, `39502` returnError, `39503` SocketError, `39504` Connect2CPSFailed, `39505` CmdError.
- **Pendant safety login:** username `admin`, password `admin`. Required on pendant before physical Free Mode button works.
- **Physical Free Mode:** button on the arm. When pressed, the pendant UI freezes (drag mode is exclusive to that session). Suggests drag teach may be hardware-gated and not triggerable from TCP at all — to be confirmed.
- NEVER expose port 10003 to the internet. All remote access must go through FastAPI 8080 behind Cloudflare Access.

### Laser — Relfar V4 (RDWelder V4, RuiDa / DWIN)
- TCP control at port `123`. IP depends on network (home 192.168.1.250, business 192.168.20.225, AP mode 192.168.1.5).
- Protocol: transparent UART-to-TCP bridge. Custom 8-byte frames `5A A5 05 TT AAAA VVVV` (DWIN DGUS "USER" variant). Reverse-engineered 2026-04-13.
- WiFi module MAC `b8:3d:fb:a7:20:21` — reserve in router DHCP for stable IP.
- Network-config registers (IP/gw/dns) are UNREACHABLE over TCP — writes are silently dropped on the WiFi module side. Workaround: router DHCP reservation.

## 6. Portal ↔ station sync

- Every write on robot/relfar persists to local SQLite AND pushes to Portal (Neon), keyed by `serial_number`.
- Background worker, 10-second batches, HMAC-signed, exponential backoff.
- Two-way: `POST /api/sync/push` (up) and `GET /api/sync/pull?serial=...&since=...` (down). Pull endpoints NOT YET BUILT on Portal side — backlogged.
- Conflict resolution: last-write-wins on `updated_at`, tiebreak on per-device monotonic `device_clock`.
- Retention: snapshot-only for `projects`, `dxf_files`, `robot_programs`, `robot_settings`. Full event history for `license_state` + program runs + audit-sensitive writes.
- Serial mismatch handling: amber alert in Portal, persistent red ❗ on station card until Reconcile action.

## 7. Windows services (NSSM)

- `ElfinRobot` — the robot FastAPI. **NOT** `PrismaRobot`. Restart: `Restart-Service ElfinRobot` (PowerShell as Administrator).
- `RelfarBridge` — the laser Flask. Restart: `nssm restart RelfarBridge` (cmd as Administrator).
- NSSM does NOT auto-load `.env` — that's why `config.py` calls `python-dotenv`'s `load_dotenv()` at import. This line is load-bearing; removing it breaks every env var.
- PowerShell gotcha: `sc` is aliased to `Set-Content`. Use `sc.exe` or `Get-Service`.

## 8. Env vars (robot service)

Read from `services/robot/.env` via `load_dotenv()` in `config.py`:

| Var | Purpose |
|---|---|
| `ROBOT_SERIAL` | Station identity (e.g. `COBOTDSM-001`) |
| `PORTAL_URL` | Where to push sync events |
| `ROBOT_LICENSE_SECRET` | HMAC key shared with Portal |
| `SYNC_ENABLED` | Toggle Portal sync (currently false until pull endpoints exist) |
| `DEV_SKIP_LICENSE` | Bypass license gate on `/api/robot/*` — dev only, NEVER in production |
| `LICENSE_STRICT` | Hard-fail on unsigned/invalid license responses. Flip to `true` only after `ROBOT_LICENSE_SECRET` is deployed on both sides |

### Portal — Google Drive (files storage)

Documents uploaded through `/admin/files` are stored in a Google Workspace **Shared Drive**. The portal authenticates as a **Service Account** (no per-user OAuth), which must be a Content Manager member of that Shared Drive.

**⚠ Status (2026-04-20):** All code lives on branch **`files-drive`** (commit `fc49e91`) — NOT merged to `main`. Production `/admin/files` still shows the old mock UI with non-working Edit/Delete buttons. The merge is gated on three manual setup steps (see "Pre-merge setup" below); if `files-drive` lands on `main` before those steps, production will 500 the moment anyone opens `/admin/files`.

| Var | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Full Service Account JSON key, pasted as a single-line string. Read by `src/lib/google-drive.ts::driveClient()` and passed to `GoogleAuth` with scope `drive`. |
| `GOOGLE_DRIVE_FOLDER_ID` | Shared Drive root folder ID — every upload lands here. Read by `getDriveFolderId()`. |

Tables backing the UI:
- `FileAsset` — `{ driveFileId, name, mimeType, sizeBytes, category, subCategory, scope, managedClientId?, localBusinessId? }`. Drive holds the bytes, DB holds metadata + ACL.
- `VideoAsset` — Vimeo-linked, no storage on our side. `{ title, vimeoUrl, vimeoId, description, category, subCategory, scope, managedClientId?, localBusinessId? }`.

APIs: `/api/files/documents` (GET list, POST upload multipart), `/api/files/documents/[id]` (PATCH rename/recategorize + Drive rename, DELETE Drive+DB), `/api/files/documents/[id]/download` (GET stream from Drive), `/api/files/videos` (GET, POST), `/api/files/videos/[id]` (PATCH, DELETE).

**Pre-merge setup (required on each environment):**
1. **Google Cloud** — create project `Prisma Portal` → enable "Google Drive API" → create service account `prisma-drive-writer` → Keys tab → Add Key → JSON → download.
2. **Google Workspace** — create Shared Drive `Prisma Files` → Manage members → add the service account email as **Content Manager** (no notify) → copy folder ID from URL after `/folders/`.
3. **Env vars** — paste JSON + folder ID into that environment's env store (`.env.local` for localhost, Vercel project settings for Preview + Production). JSON key must be compacted to a single line (`Get-Content ... | ConvertFrom-Json | ConvertTo-Json -Compress`).
4. **Migration** — run `services/portal/prisma/migrations/20260420_file_assets.sql` against that environment's Neon branch (localhost dev branch via `npx prisma db execute --file ...`, or production branch via Neon SQL editor).
5. **Regenerate Prisma Client** — `npx prisma generate` after pulling the branch; otherwise `prisma.fileAsset` / `prisma.videoAsset` are undefined and every `/api/files/*` call 500s. Next.js hot-reload does NOT pick up a fresh client — restart `npm run dev`.

**Local dev status on DEV_computer (as of 2026-04-20):** step 4 ✓, step 5 ✓, step 3 ✗ (no Google env vars yet → Upload 500s, but Edit/Delete work once rows exist).

**Post-merge gap (not yet addressed):** `src/app/portal/files/page.tsx` and `src/app/portal/videos/page.tsx` (client-facing portal views) still import the emptied `mockFiles` / `mockVideos` arrays from `lib/mock-data.ts` and render empty sections. Wire them to the new `/api/files/*` endpoints with a scope filter as a follow-up.

### Portal — dev-only env vars

| Var | Purpose |
|---|---|
| `DEV_SKIP_AUTH` | When `true` AND `NODE_ENV !== 'production'`, all admin auth guards (`src/lib/auth.ts::requireAdmin`, `src/lib/requireAdmin.ts::requireAdmin`, `src/middleware.ts`, `/api/auth/me`) short-circuit and return a synthetic admin. Hard-gated — production always ignores it. Used by `services/portal/scripts/preview.mjs` to render admin pages in a headless Chromium for visual review. |
| `DEV_ADMIN_ID` / `DEV_ADMIN_EMAIL` / `DEV_ADMIN_NAME` | Override the fields of the synthetic admin returned by `getDevBypassPayload()`. Optional. |

### Portal preview script

`services/portal/scripts/preview.mjs` boots `next dev` with `DEV_SKIP_AUTH=true`, drives headless Chromium via Playwright, and screenshots every admin route into `<repo-root>/previews/<timestamp>/` (gitignored). Run via `npm run preview` after a one-time `npm i -D playwright && npx playwright install chromium`. On Windows the spawn uses `shell: true` (Node 20+ CVE-2024-27980 workaround) and kills the tree with `taskkill /T /F` on exit.

## 9. Licensing & HMAC

- Portal signs license responses: `signLicense()` in `GET /api/machines/license/[serial]` using `createHmac('sha256', ROBOT_LICENSE_SECRET)`.
- Canonical string: `v1|serial|licenseMode|expiresAt|killSwitch|signedAt`.
- Robot verifies via `_verify_portal_signature()` in `services/robot/app/license.py`.
- Soft-pass rollout: unsigned responses still accepted while secret isn't deployed everywhere. Flip `LICENSE_STRICT=true` afterward.

## 10. Key conventions / hard rules

1. **DB-persisted data only** — no cookies-as-storage, no in-memory singletons. Relfar violates this; tracked for refactor.
2. **Never expose robot port 10003 to the internet** — all remote access goes through FastAPI 8080 behind Cloudflare Access.
3. **Windows path quoting** — paths contain spaces. Always quote, use `cd /d` for cross-drive.
4. **Robot entry is `python run.py`** — `python -m app.main` exits immediately.
5. **Command format rule** — every command to Hugo specifies: which PC, which shell, full quoted absolute path. Never assume he's `cd`'d anywhere. See feedback_command_format.md.
6. **Startup scripts** live in `Projects\AAA - Start projects and boot errors\`, not inside service folders.
7. **Secrets via env vars only**, never committed.
8. **Hugo's shortcuts:** `WTB` = add to backlog. `BUILD` = start now. `LIST` = show memory items.

## 11. Network — current state

- Business WiFi: robot PC = `192.168.20.15`, laser controller = `192.168.20.225`.
- Cobot: wired at `192.168.10.10` (separate subnet; PC has two NICs or a bridge).
- Dynamic DNS: `dsmmc3.mycrestron.com` → external port 50000 → neighbour's router → UDR. Used for remote access (pending Cloudflare Tunnel).
- Cloudflare Tunnel: planned, not deployed. Blocked on always-on PC at the shop.

## 12. Deployment loop (dev → robot PC)

1. DEV PC: edit files under `C:\Users\Portable_New_Hugo\Documents\Claude\Projects\Prisma`.
2. DEV PC: commit + push to GitHub.
3. ROBOT PC: `cd /d "C:\Prisma" && git pull`.
4. ROBOT PC (Admin): `Restart-Service ElfinRobot` and/or `nssm restart RelfarBridge`.
5. Portal: Vercel auto-deploys from GitHub main on push.

## 13. Current high-level status (2026-04-16, updated after codebase audit)

**Recently shipped (since 2026-04-14):**
- Three-entity domain model live in production: `Station` ↔ `StationPC` (1:1) ↔ `Machine` (M:N via `StationMachine`). `/admin/station-pcs` CRUD + sidebar nav + assignment audit trail (`StationPCAssignment`).
- StationPC self-registration + heartbeat with approval quarantine; portal-generated one-click installer; "retired" reused on re-assignment.
- Machine taxonomy ON: `category` (robot|accessory) + `subcategory` (laser|traditional_welding|sanding|...) + `model` chips on every Machines card; auto-create on serial entry from the Stations hold-to-save flow.
- Machines list shows: serial + Category/Subcategory/Model chips + nickname + client + IP + city + Station `#<num> — <title>` + Invoice `#<num>` + **Open software** click-through (port 8080 robot, 5000 laser).
- StationPC `localIp` field (migration `20260415_station_pc_local_ip.sql`) — manual LAN IP override so the Open-software button hits a reachable address. `getSoftwareUrl()` prefers `localIp` over public `lastHeartbeatIp`. Editable from the StationPC detail panel.
- Self-heal on `GET /api/machines`: any orphaned Machine (no `StationMachine` row) gets backfilled from `Machine.invoiceId → StationInvoice.stationId`, then from `Station.notes.machineData[].machineId`. `POST /api/machines` also accepts `stationId` and writes the join row at creation time. Idempotent.
- Stations: Google Places autocomplete on address (auto-fills city/province/postal/country), deep-link from clients, multi-invoice chips, deployment address with Street View + map + lock.
- Free Mode button (cobot drag-teach) shipped end-to-end (`GrpOpenFreeDriver` / `GrpCloseFreeDriver`).
- Robot wrist buttons wired client-side; speed multiplier 6x; jog accel boost. **Hardware Free Mode + Waypoint buttons are confirmed working at the controller/pendant level (2026-04-14)** — Prisma still doesn't poll end-flange DI from the SDK, so the wrist buttons don't yet trigger Prisma-side actions.
- Robot licensing + HMAC signing live (`v1|serial|mode|expiresAt|killSwitch|signedAt`); soft-pass while `LICENSE_STRICT=false`.
- Relfar SQLite persistence + dual-homed RDWelder AP deployment pattern.

**Recently shipped (since 2026-04-15):**
- **Admin sidebar restructured:** Five expandable groups: **Follow-up** (Leads, Live Visits, Projects), **Search** (People, Businesses), **Accounting** (Quotes, Invoices, Inventory), **Integration** (Stations, Station PCs, Machines). Top-level items: Training, Tickets, Improvements. Clients tab removed (merged into Businesses). Sidebar supports expandable groups via `children` property, animated expand/collapse (CSS grid `grid-template-rows: 0fr→1fr`), staggered children, bouncy chevron. Drag-and-drop reorder modal (pointer events).
- **Lead model enhanced:** new fields `phone2`, `otherContacts`, `callbackReason`, `objective`, `budget`, `productsOfInterest` (JSON text of QB item selections). New DB index on `nextFollowUpAt`.
- **Leads page rebuilt** (`/admin/leads`): table view (sticky client name column, reason of call, inventory type, phone, business, email, objective, budget), right-side sliding detail panel (~500px, all fields editable, QB inventory multi-select for products of interest, quotes placeholder), 60-day calendar view (leads by `nextFollowUpAt`), pipeline kanban view preserved. New lead modal updated with all new fields.
- **Inventory page** (`/admin/inventory`): dedicated QB inventory browser + Add Stock form (same as settings but as its own admin page).
- **Quotes page** (`/admin/quotes`): full QB-compatible quote builder. Business + Project horizontal selectors, local quotes + QB estimates merged list, line-item editor with QB-matching columns (#, Date, Product/Service, Description, Qty, Price, Amount, Tax), dynamic tax codes fetched from QB API (TaxCode + TaxRate entities), tax summary with per-rate breakdown, quote message textarea (default: "Les prix peuvent fluctuer…"), file drag-and-drop zone (UI only), amount display mode (tax excl/incl/none). **Requires QB connection** — quote creation blocked with warning banner when QB is not connected. New schema fields: `quoteMessage`, `qbEstimateId`, `qbSyncedAt` on Quote; `serviceDate`, `productService`, `taxCode` on QuoteItem.
- **QB connection improvements:** separated try/catch for status vs data fetches (status no longer lost if a query fails); error messages propagated from QB API to UI (not just generic "Failed to fetch"); "Connect QuickBooks" button appears on token expiry / not-connected states; new `createQBEntity()` function in `quickbooks.ts` for POST requests.
- **Live visits improvements:** fullscreen toggle for dark visit container; needs display redesigned (title 14px white, notes inline gray 11px after colon); drag-and-drop fix (`effectAllowed`/`dropEffect` matching); needs note fix (PATCH instead of POST for notes on existing needs); kiosk dedup (prevents duplicate visits when visitor already checked in with active visit).
- **New API endpoints:**
  - `GET /api/quickbooks/accounts` — returns QB Chart of Accounts.
  - `POST /api/quickbooks/inventory` — creates items in QB.
  - `POST /api/visit-groups/cleanup-needs` — one-time cleanup to remove duplicate `VisitNeed` entries.
  - `GET/POST /api/quotes` — list all quotes / create new quote (auto-generates `Q-YYYY-NNN` number).
  - `GET/PATCH/DELETE /api/quotes/[id]` — single quote CRUD (PATCH replaces all items).
  - `POST /api/quotes/[id]/push-qb` — push quote to QB as Estimate (uses `managedClient.qbId` as CustomerRef).
  - `GET /api/quotes/qb-estimates?customerId=` — fetch QB estimates for a business.
  - `GET /api/quotes/qb-tax-codes` — fetch QB TaxCode + TaxRate entities, enriched with computed total rate per code.

**Recently shipped (since 2026-04-16):**
- **Dark/light theme toggle:** `ThemeContext.tsx` provider wraps the app; toggle button (sun/moon icon) in top-right corner of DashboardShell. Tailwind `darkMode: 'class'` enabled; `<html>` gets `dark` class. Preference persisted in localStorage (`lasernet.theme`). Dark mode applied to ALL pages: 14 admin pages, 5 auth pages, 5 portal client pages, kiosk (already dark), and all shared components (Sidebar, PageHeader, QuickBooksStatus, HoldButton). Global CSS classes (`.card`, `.input-field`, `.sidebar-link`, `.btn-secondary`) all have `dark:` variants.
- **People tab** added to Onboarding group in sidebar (`/admin/people`). Placeholder page — will become a unified directory of visitors, leads, employees, and contacts. Translation key `people` (FR: "Personnes", EN: "People").
- **People tab — shipped 2026-04-19:** `/admin/people/page.tsx` now aggregates Users + Contacts + Leads via `GET /api/people` (`src/app/api/people/route.ts`). Every row carries a computed **handle**: Prisma Staff → `@hugob` (@ at front), Client Staff → `ben@abc` (@ in middle), Leads → `ben@companyslug` or `ben@lead`. Handles are derived at read time via `src/lib/handles.ts` (`personSlug`, `companySlug`, `prismaHandle`, `clientHandle`, `leadHandle`) — no schema migration required. Tabs: All / Prisma Staff / Client Staff / Leads. Search + kind badges (admin/sales/maincontact/stage).

**Codebase audit (2026-04-16):**
- Full audit completed: 0 unused files, 0 dead imports, 0 unused npm dependencies, 0 orphaned API routes. All 73 API routes, 8 components, 13 lib modules actively referenced.
- **Fixed:** `escapeHtml()` was duplicated in 3 files (lib/email.ts, api/invite, api/reset-password). Consolidated — now exported from `lib/email.ts`, other two import it.
- **Flagged:** Two `requireAdmin()` implementations coexist: `lib/requireAdmin.ts` (takes NextRequest, 8 callers) and `lib/auth.ts` (reads cookies() internally, 12 callers). Both work; consolidation deferred to avoid touching 20 routes.
- **Code quality:** 79 `: any` usages (gradual fix), 88 console statements (acceptable for now), no error boundaries (add when convenient), 14 files over 500 lines (split incrementally via component extraction), kiosk has inline translations (85 lines, should move to translations.ts).
- **Quarantine:** `_quarantine/relfar-scan-artifacts/` (6 files) safe to archive/delete. `relfar-reverse-engineering/` (20 scripts) and `branding-assets/` (6 files) kept.

**Recently shipped (since 2026-04-17):**
- **CRM — Multi-lead projects (2026-04-20):** `LeadProject` can now have multiple leads via `LeadProjectAssignment` join table (`projectId`, `leadId`, `@@unique([projectId, leadId])`). `LeadProject.leadId` stays as the "primary" (original creator) for backward compat; assignments are the canonical list. Migration `20260420_project_leads_join.sql` creates the table and backfills one assignment per existing project. `/api/projects` now returns `leads[]`; `/api/projects/[id]` PATCH accepts `leadIds[]` to sync the full set (≥1 required); `/api/leads/[id]/projects` GET returns both primary-owned AND co-led projects (via `OR: [{ leadId }, { assignments: { some: { leadId } } }]`). Orphaned rule: project is orphaned iff EVERY attached lead has a business with zero active main contacts. Projects tab (`/admin/projects`) grouped by **unique lead-set** — solo projects in that lead's bloc, co-led projects in a combined bloc with each lead's name in the header (`+` separator, indigo "Shared" badge). New `ProjectLeadsPanel.tsx` drawer manages the lead set per project.
- **CRM — Projects & Quotes system:** `LeadProject` model (name, status, callbackReason, suggestedProducts, objective, budget) + `Quote` model (quoteNumber, status: pending|accepted|refused) + `QuoteItem` model. Full CRUD API at `/api/leads/[id]/projects`, `/api/projects/[id]`, `/api/projects/[id]/quotes`, `/api/projects/[id]/quotes/[quoteId]`. Quote duplication endpoint. "Refuse project" sets all quotes to refused.
- **CRM — Project Meetings:** `ProjectMeeting` model (title, scheduledAt, durationMinutes, location, notes, status: scheduled|completed|cancelled) + `MeetingAttendee` model (linked to Lead or free-text name). API: `/api/projects/[id]/meetings` (GET/POST), `/api/meetings/[id]` (PATCH/DELETE), `/api/meetings/[id]/attendees` (GET/POST/DELETE). Lead search for attendees at `/api/leads/search?q=`. UI in project panel visits tab: meeting cards with drag-and-drop + search to assign attendees.
- **Per-project columns in leads table:** When a lead has multiple active projects, the table renders one row per project. Shared columns (status dot, business name, client name, phone, email) use `rowSpan`; project-specific columns (reason of call, suggested products, objective, budget) repeat per project row with project-level values (fallback to lead-level).
- **Leads table improvements:** Columns reordered (Status → Business Name → Client Name → rest). Percentage-based column widths (`tableLayout: fixed` + `%` on `<th>`). Resizable columns by dragging header borders (mousedown/mousemove/mouseup). Renamed "Inventory Type" → "Suggested Products" (FR: "Produits suggérés").
- **Unified Businesses page** (`/admin/businesses`): Combines ManagedClients (QB) and LocalBusinesses in one view. Source badges ("QuickBooks"/"Local"). QB search modal to import or link. "Link to QB" button on local businesses migrates all relations then deletes the local record. API at `/api/businesses` (unified GET) + `/api/local-businesses/[id]/match-qb` (POST).
- **Kiosk auto-create LocalBusiness:** When a new company name is entered at kiosk check-in and no matching ManagedClient or LocalBusiness exists, a new LocalBusiness is created automatically.
- **Main contact star system** (`/admin/live-visits`): Every visitor gets a clickable star. Only one main contact per meeting. Can't terminate visit without selecting a main contact first.
- **Improvements page** (`/admin/improvements`): New sidebar nav item. DB model `Improvement` (title, description, priority: critical|high|medium|low, status: new|in_progress|done|dismissed, createdBy). Full CRUD API. Page with filter tabs (Active/All/Done), priority-sorted card list, inline edit, status/priority dropdowns, voice-to-text input via Web Speech API (fr-CA).
- **Next.js 14 params fix:** Fixed 17 API route files that used Next.js 15 `params: Promise<>` pattern — changed to synchronous `{ params: { id: string } }` with direct destructuring.
- **Quote status migration:** Changed from draft/sent/accepted/rejected/expired to pending/accepted/refused.

**Recently shipped (since 2026-04-19):**
- **Sidebar reorganization:** "Integration" renamed to "Follow-up" (FR: "Suivi"). New "Integration" parent created for Stations/Station PCs/Machines. New "Accounting" parent holds Quotes + Invoices + Inventory. New "Search" parent holds People + Businesses. Clients tab deleted (merged into Businesses page).
- **Sidebar animations:** smooth expand/collapse using CSS grid `grid-template-rows: 0fr → 1fr`, staggered child fade-in, bouncy chevron rotation. Reorder modal rewritten with pointer events (replacing unreliable HTML5 drag-and-drop).
- **QB-compatible quote builder** (`/admin/quotes`): full editor with Business + Project horizontal selectors, merged local + QB estimates list, line-item table matching QB Estimate layout, dynamic tax codes from QB API (`fetchTaxCodes` + `fetchTaxRates` in `quickbooks.ts`), per-rate tax summary, quote message textarea, file drag-and-drop zone (UI only), amount display mode selector. **QB connection mandatory** — no fallback tax codes; "New Quote" button disabled + amber warning banner when QB is not connected; tax codes are empty array until QB responds.
- **Quote schema updates:** `quoteMessage` (Text), `qbEstimateId`, `qbSyncedAt` on Quote model. `serviceDate`, `productService`, `taxCode` on QuoteItem model. Default status changed from "pending" to "draft".
- **Business dropdown fix:** `/api/managed-clients` returns nested `{ qbClient: { displayName } }` — quotes page now flattens the response correctly.
- **Clients tab removed:** all client functionality merged into Businesses detail panel.
- **Quote printer / PDF** (`/admin/quotes/[id]/print`): new client page — fetches quote + QB tax codes, renders a printable Letter-sized document (letterhead with DSM logo, bill-to, line-item table, tax breakdown, total, customer memo), auto-triggers `window.print()` on mount. Print button in editor footer opens it in a new tab. No server-side PDF generation — browser print-to-PDF is the save path.
- **Quote file attachments:** new `QuoteAttachment` Prisma model (filename, mimeType, size, base64 `data`) + migration `20260419_quote_attachments.sql`. API routes: `GET/POST /api/quotes/[id]/attachments` (list / upload multipart), `GET/DELETE /api/quotes/[id]/attachments/[attachmentId]` (inline download / delete). 10 MB/file cap. Drop zone in editor now accepts drag-drop + click-to-browse, shows upload spinner, lists uploaded files with download + delete. Attachments only enabled after the quote is saved (has an id).
- **Push-to-QB enhancements:** server route now forwards `TaxCodeRef` on each line (id-or-name lookup against QB `TaxCode` list), `ServiceDate` when set, `CustomerMemo` (quote message), and `GlobalTaxCalculation: 'TaxExcluded'` — so pushed Estimates match our local tax math. UI shows green "Synced to QuickBooks" banner after success and keeps the editor open so the QB chip appears.
- **QuickBooks connection — single source of truth:** new `src/lib/QuickBooksContext.tsx` polls `/api/quickbooks/status` every 60 s and publishes `{status, realmId, missingCredentials, refresh, connect}`. `QuickBooksProvider` mounted in `src/app/admin/layout.tsx`. Sidebar chip (`QuickBooksStatus.tsx`) consumes it, pulses a red/amber ring via `qb-flash-ring[-amber]` keyframes when disconnected, and exposes an inline Connect pill (nav key `qbConnectAction`). Quotes page refactored off its private `qbConnected` inference — a tax-code fetch failure is now a *data* error only, never a connection error. The chip and the page can no longer disagree.
- **Unified end-visit / complete-meeting flow (2026-04-20):** the old browser alert + star-picker modal for closing visits is replaced by `src/components/EndVisitModal.tsx` — a centered popup with two columns (Present / Not present), ★ main-contact toggle, attach-as-coleads checkboxes, project picker listing the business's active projects (same filter as Projects tab), and a "＋ Create new project" inline form. Fallback popup when Finish is pressed without a project. Backend helper `src/lib/finalizeVisit.ts → runFinalize()` is one transaction: promotes new rows to `Lead`s linked to the business, resolves the main contact, syncs `LeadProjectAssignment`s on the target project (or creates a new project pre-assigned to everyone selected), re-points the project's primary `leadId`, and writes a `LeadActivity`. Two thin route wrappers: `POST /api/visit-groups/[id]/finalize` (closes the VisitGroup with `status='completed'`, `mainContactId`, `completedAt`, `expectedFollowUpAt = +7d`) and `POST /api/meetings/[id]/finalize` (closes the ProjectMeeting with `status='completed'`). Data endpoint `/api/finalize-context?visitGroupId=…|meetingId=…` returns `{business, present[], absent[], activeProjects[]}`. `CarriedOverMeetings.tsx` + `/api/visit-groups/carried-over` surface any still-active VisitGroup or still-scheduled ProjectMeeting whose start-time < today 00:00 — mounted at the top of the Visits tab in `/admin/leads`; each item reopens the same finalize modal seeded with its context.
- **Files page — real Google Drive backend (2026-04-20, branch `files-drive`, NOT merged to main):** `/admin/files` was 100% mock through 2026-04-19 (Edit/Delete buttons non-functional — the page was seeded from `lib/mock-data.ts` with no DB, API, or storage). Branch `files-drive` (commit `fc49e91`) contains the real implementation: new Prisma models `FileAsset` + `VideoAsset` (both use the nullable `managedClientId`/`localBusinessId` dual-FK pattern mirroring `VisitGroup`, with `scope: internal|client`); migration `prisma/migrations/20260420_file_assets.sql`; `googleapis ^144.0.0` dependency; helper `src/lib/google-drive.ts` (Service Account + `supportsAllDrives: true`, exports `uploadToDrive`/`renameOnDrive`/`deleteFromDrive`/`downloadFromDrive`); five API routes under `/api/files/*` (see Portal — Google Drive section); full rewrite of `src/app/admin/files/page.tsx` with real Upload (hidden file input), Edit modal (name/category/subCategory/scope), Delete with `confirm()` + toast feedback, and Vimeo URL → iframe embed. Old seed arrays `mockFiles` / `mockVideos` emptied from `lib/mock-data.ts` (interfaces preserved for compile compat). Merge gated on manual Google Cloud + Vercel + Neon setup — see "Portal — Google Drive (files storage)" above.
- **Files page — folder-tree UI + modular split (2026-04-20, branch `files-drive`):** `/admin/files` replaced flat-list + dropdown filters with a left folder-tree sidebar. Tree shows All / Uncategorized (conditional) / categories with chevron expand + subcategories; `+ New folder` and `+ New subfolder` buttons create ephemeral folders that persist once a file lands in them (they're re-derived from DB data on reload via `buildTree()`). Document rows and video cards are HTML5-draggable with `{kind, id}` JSON payload; folder nodes are drop targets that PATCH `/api/files/documents/:id` or `/api/files/videos/:id` with `{category, subCategory}`. Upload button pre-fills category/subCategory when a real folder is selected. Drive stays flat — all organization is DB-driven via the existing `category`/`subCategory` columns, no Drive folder API calls. Same commit refactored the monolith into 10 single-concern files under `src/app/admin/files/`: `page.tsx` (174 lines, orchestrator), `useFilesData.ts` (246, hook for all data I/O + tree/selection state), `FolderSidebar.tsx` (220), `DocumentsTable.tsx` (141), `VideosGrid.tsx` (115), `VideoModal.tsx` (108), `EditDocumentModal.tsx` (82), `types.ts` (51, incl. `SEL_ALL`/`SEL_UNCAT` sentinels + `DragPayload`), `utils.ts` (46, `formatSize`/`formatDate`/`buildTree`), `ModalShell.tsx` (44, shared modal chrome). Delete logic collapsed into a single `deleteAsset(kind, id)`. Behavior unchanged; pure refactor.
- **Full-page Project Editor (2026-04-20):** new route `/admin/projects/[id]/edit` (`src/app/admin/projects/[id]/edit/page.tsx`) is the canonical one-page editor for a `LeadProject`. Sections: core fields (name/status/objective/notes/callbackReason/budget/suggestedProducts) → inline leads manager (pills with ✕, search-to-add from `/api/leads`, primary flagged, minimum 1 enforced) → meetings list with inline "＋ Schedule" form (`POST /api/projects/[id]/meetings`) → quotes summary with deep-link to `/admin/quotes?project=…` → Activity timeline. New endpoint `GET /api/projects/[id]/activity` merges `LeadActivity` rows across the primary lead + every co-lead (pulls `leadIds` from `project.leadId ∪ project.assignments[].leadId`). Save flows into the existing `PATCH /api/projects/[id]` with every field + `leadIds[]` in a single call. Entry point: on `/admin/projects`, each project card is now wrapped in `<Link href={/admin/projects/${id}/edit}>`; the inner "Leads" drawer button + "Set main contact" CTA use `e.stopPropagation()` so they still fire without routing.

**Not yet built / blocked:**
- Portal `/api/sync/push` + `/api/sync/pull` — NOT BUILT, sync disabled.
- In-app updater for stations — backlogged (must exist before shipping at scale).
- Cloudflare Tunnel — blocked on always-on PC at the shop. Until then, "Open software" requires same-LAN + manual `localIp`.
- Interactive remote-support iframe in `/admin/station-pcs/[id]` — depends on Cloudflare Tunnel.
- StationPC heartbeat endpoint to update `robotVersion` / `relfarVersion` — partially in place (heartbeat exists, version fields not pushed yet).
- QB token auto-refresh loop — backlogged.
- Elfin 20018/20007 TCP error debug — parked, not blocking (`20018` = StateRefuse / already-in-target-state, idempotent).
- Machine tracking rearchitecture phase 2 (move serial+type from `Station.notes.machineData[]` into Machine rows as source of truth) — partially shipped via auto-create + self-heal; full migration still backlogged.
- Laser source telemetry: stays in Relfar (do NOT model laser sources as separate Machine rows — see `project_laser_source_handling.md`).
- `ROBOT_LICENSE_SECRET` deployed in both Vercel + station `.env`, then flip `LICENSE_STRICT=true`.

**For the demo path (right now):**
1. Robot PC connected to laser's `RDWelder` WiFi (`12345678`).
2. Robot PC: `python run.py` from `C:\Prisma\services\robot` (port 8080).
3. Robot PC: `python relfar_server.py` from `C:\Prisma\services\relfar` (port 5000).
4. Portal: paste Robot PC's LAN IP into `/admin/station-pcs/[id]` → `localIp` field.
5. From any same-LAN browser: `/admin/machines` → click a card → **Open software** → opens `http://<lan-ip>:8080|5000`.

## 14. When in doubt

- Read `HANDOFF.md` in the Prisma root FIRST.
- Check `BACKLOG.md` for "where were we".
- Check `services/portal/TODO.md` for portal-specific shipped/in-progress items.
- Check individual memory files for specifics (see MEMORY.md index).
