# Prisma — Backlog & Task List

> Living list of everything on deck. Maintained jointly with Claude.
> Last updated: 2026-04-20 — QB match confirmation modal + QB name wins on ManagedClient

Commands when talking to Claude:
- **LIST** — show what's in this file / in memory
- **WTB** ("wait to build") — add the thing just discussed to the deferred section below
- **BUILD** — start work now on the thing just discussed

---

## In Progress (portal)

*(none)*

## Recently Shipped (2026-04-20)

- [x] **QB match confirmation modal + QB name wins** — on `/admin/businesses`, clicking "Relier / Match" on a QB suggestion now compares the local/lead name against the QB customer name (NFD-folded, lowercased, whitespace-collapsed). If they differ, a confirmation modal opens showing both names side-by-side and explicitly states that the QB name will be adopted as the official name; confirm or cancel. If they match exactly, it links immediately with no extra click. Backend `/api/local-businesses/[id]/match-qb` + `/api/leads/[id]/match-qb` both got an `update` branch so that when the ManagedClient already exists for that `qbId`, its `displayName` + `companyName` are refreshed from QB too — keeps the "QB name is source of truth" rule consistent across first-link and re-link paths.
- [x] **Businesses page layout polish** — the "Businesses not linked yet" container was moved **out of its full-width top strip** and **into the left column**, stacked on top of the Linked Businesses list (so both live inside the same narrow `w-80 / xl:w-96` column). Internal layout collapsed from 1/2 + 1/2 horizontal split to a vertical stack (header → unlinked list → QB search input → QB suggestions). QB search `<input>` got the missing dark-mode classes (`bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`) so the typed text is no longer white-on-white in dark mode.
- [x] **In-place edit panel on People tab** — new `src/components/LeadEditPanel.tsx` is a right-side slide-in drawer that edits a Lead (name, email, phone, phone2, company, otherContacts, source, stage, estimatedValue, nextFollowUpAt, notes) via `PATCH /api/leads/[id]`. `/admin/people` now opens the drawer *in place* when Edit is clicked on a lead/unassigned row instead of navigating to `/admin/leads?id=…`. Users → team settings and contacts → businesses still navigate (same as before) — only the lead case was wrong. Escape closes; saving refetches `/api/people` so the row reflects the change immediately.
- [x] **Fuzzy 4–5 suggestions on business link search (as-you-type)** — new shared `src/lib/fuzzy.ts` (`scoreNameSimilarity` + `topFuzzyMatches`). Wired into `/admin/businesses` QB search (no Enter / no button press) and into the Leads detail-panel biz search (fuzzy filter over a one-time-fetched ManagedClients cache). Both surfaces always show the top 4–5 closest matches — per `feedback_business_link_autocomplete.md`.

## Recently Shipped (2026-04-19 night)

- [x] **People tab — per-row Edit button** — `/admin/people` rows now have a pencil "Modifier" (FR) / "Edit" (EN) button on the right side. Click-through is source-aware: staff (`user`) → `/admin/team?edit=…`, contacts → `/admin/businesses?client=…&contact=…` (falls back to `?contact=…` when unlinked), leads → `/admin/leads?lead=…`.
- [x] **Files tab — container kebab menus with sort** — new `ContainerHeader` component gives both "Documents" and "Vidéos" containers a three-dot menu (right-aligned, closes on click-outside + Escape). Menu items: Upload (stub), divider, sort A-Z / Z-A / newest / oldest / (docs only) largest first. Active sort shows checkmark. Default sort newest-first. `parseSize()` helper parses "2.4 MB" / "890 KB" strings.
- [x] **DEV_SKIP_AUTH bypass + sandbox preview pipeline** — `getDevBypassPayload()` in `src/lib/auth.ts` wired into `requireAdmin`, `requireAdmin.ts`, middleware, and `/api/auth/me`. New `scripts/preview.mjs` boots `next dev` on port 3100, captures admin routes via headless Chromium, writes to `<repo>/previews/<timestamp>/`. Hard-gated: production `NODE_ENV` always rejects. Docs in `services/portal/scripts/README.md`.

## Recently Shipped (2026-04-19 late evening)

- [x] **QuickBooks connection — single source of truth** — new `QuickBooksContext` (`src/lib/QuickBooksContext.tsx`) polls `/api/quickbooks/status` every 60 s and exposes `{status, realmId, missingCredentials, refresh, connect}`. `QuickBooksProvider` mounted in `src/app/admin/layout.tsx`. Sidebar chip (`QuickBooksStatus.tsx`) and quotes page (`/admin/quotes`) both read from it — no more contradictions between "Connected" chip and "not connected" page.
- [x] **Sidebar chip flashes + inline Connect button** — when `status` is `disconnected` the chip gets a red pulsing ring + a red "Connecter/Connect" pill that starts the OAuth flow; `missing-creds` gets the amber treatment. Translation key `qbConnectAction` added (FR: "Connecter", EN: "Connect").
- [x] **Quotes page Connect button** — amber banner now shows a "Connecter QuickBooks" button (when tokens are missing-but-expected) that calls `qbConnect()` from context. Skipped during loading to avoid a flash.

## Recently Shipped (2026-04-19 evening)

- [x] **Quote printer / Save-as-PDF** — new `/admin/quotes/[id]/print` page (letterhead + line items + tax breakdown + customer memo, auto `window.print()`). Print button in editor footer opens it in a new tab.
- [x] **Quote file attachments** — `QuoteAttachment` Prisma model (base64 in DB, 10 MB/file cap), migration `20260419_quote_attachments.sql`, `GET/POST /api/quotes/[id]/attachments` + `GET/DELETE /api/quotes/[id]/attachments/[attachmentId]`. Drop zone wired (drag-drop + click), list with download + delete.
- [x] **Push-to-QB with taxes** — server route forwards `TaxCodeRef` on each line, `ServiceDate`, `CustomerMemo` (quote message), and `GlobalTaxCalculation: 'TaxExcluded'` so QB Estimates match our local tax math. UI shows "Synced to QuickBooks" banner on success.

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
