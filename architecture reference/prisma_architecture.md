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
| `services/portal` | Next.js 14 + TS + Tailwind + Prisma ORM | Web portal — admin, clients, stations, invoices, QuickBooks | deployed on Vercel | Neon Postgres |
| `services/robot` | Python + FastAPI ("Elfin Cobot Studio") | Local controller for the Elfin cobot | 8080 | SQLite |
| `services/relfar` | Python + Flask ("Relfar laser bridge") | Local controller for Relfar V4 laser cleaner | 5000 | SQLite (violates DB rule — refactor backlogged) |

Other repo roots: `shared/`, `scripts/`, `ARCHITECTURE.md`, `BACKLOG.md`, `REMOTE_ACCESS_HANDOFF.md`, `README.md`, `docker-compose.yml`, `vercel.json`, `start-all.bat`, `push-update.bat`.

**Authoritative docs inside the repo:** `ARCHITECTURE.md` (system map — update FIRST on architectural changes) and `BACKLOG.md` (in-progress + deferred work).

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
├── ARCHITECTURE.md                      ← source of truth, read first
├── BACKLOG.md                           ← active + deferred work
├── REMOTE_ACCESS_HANDOFF.md
├── README.md
├── docker-compose.yml
├── vercel.json
├── start-all.bat
├── push-update.bat
├── shared/
├── scripts/
│   └── bootstrap-station.ps1            ← installs robot+relfar on a station PC
└── services/
    ├── portal/                          (Next.js, deployed to Vercel)
    │   ├── src/app/                     ← pages + API routes
    │   ├── src/components/
    │   ├── src/lib/
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
    └── relfar/                          (Python Flask)
        ├── relfar_server.py             ← entry
        ├── relfar_protocol.py           ← 5A A5 frame protocol
        ├── scanner.py
        ├── discover.py                  ← "Find controller" network scan
        ├── data/relfar.db               ← SQLite
        ├── static/
        ├── requirements.txt
        └── .env
```

## 5. Hardware

### Cobot — Elfin Pro E03 (Han's Robot)
- TCP control at `192.168.10.10:10003`.
- Protocol: Han's Robot SDK text commands (e.g. `DragTeachSwitch, 0, 1`).
- NEVER expose port 10003 to the internet. All remote access must go through FastAPI 8080 behind Cloudflare Access.
- Known error codes: 20018 / 20007 — Prisma's TCP login/command sequence is slightly off vs. the pendant. Arm moves fine from native software, fails on some Prisma commands. Parked (not blocking).

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

## 13. Current high-level status (2026-04-14)

- Free Mode button (cobot drag-teach) shipped end-to-end. Needs `Restart-Service ElfinRobot` to activate.
- Portal `/api/sync/push` + `/api/sync/pull` NOT YET BUILT — sync disabled.
- In-app updater for stations: backlogged.
- Cloudflare Tunnel: blocked on always-on PC.
- QB token auto-refresh loop: backlogged.
- Elfin 20018/20007 TCP error debug: parked, not blocking.
- Machine tracking rearchitecture phase 2: backlogged.

## 14. When in doubt

- Read `ARCHITECTURE.md` in the Prisma root FIRST.
- Check `BACKLOG.md` for "where were we".
- Check individual memory files for specifics (see MEMORY.md index).
