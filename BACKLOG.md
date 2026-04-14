# Prisma — Backlog & Task List

> Living list of everything on deck. Maintained jointly with Claude.
> Last updated: 2026-04-14 (evening)

Commands when talking to Claude:
- **LIST** — show what's in this file / in memory
- **WTB** ("wait to build") — add the thing just discussed to the deferred section below
- **BUILD** — start work now on the thing just discussed

---

## In Progress (portal)

*(none — all five shipped 2026-04-14; remaining sub-items moved to Deferred below.)*

## Recently Shipped (2026-04-14)

- [x] **Contact model refactor** — email uniqueness enforced, reassign-to-another-client picker in Contact edit modal, Main Contact + Staff terminology.
- [x] **Stations workflow** — "Jobs" → "Stations" rename complete, `/api/jobs` + `/admin/jobs` redirect stubs deleted, invoice line-item picker wired up (trigger button added in station detail + client-scoped invoice filter).
- [x] **Clients page redesign** — QB client list hidden until search, "My Clients" renamed "Enrolment", left panel merged.
- [x] **Admin header consistency** — all admin + portal pages migrated to the PageHeader component.

## Deferred Backlog

- [ ] **Machine tracking rearchitecture (phase 2)** — `machineData[]` blob inside `Station.notes` JSON still holds `{ serialNumber, machineType }` per line item. The dedicated `Machine` + `StationMachine` models already exist but aren't the source of truth yet. Needs: (1) migration moving serial+type from notes into Machine rows, (2) MachineItems component rewrite to read/write from Station.machines, (3) backend serializer cleanup. Non-trivial — schedule a dedicated session.
- [ ] **QuickBooks token auto-refresh loop** — token cookie → DB migration already shipped. Still missing: a background/periodic refresh so tokens don't silently expire between user visits. Decide first whether to run it inside a Vercel cron, a Next route hit by an external scheduler, or piggyback on the always-on PC.
- [ ] **Sidebar "Clients' data server" chip — copy + i18n fixes** — rename to **"Client data server"** (no apostrophe-s) and add French translation so it follows the language toggle. Currently hard-coded English + grammatically wrong in both languages.
- [ ] **Always-on PC at the shop** *(unblocker for everything remote-access)* — repurpose an old laptop OR buy a cheap mini-PC (Beelink / Minisforum / Intel NUC class, €150–250). Runs `python run.py` 24/7 on the Cobots VLAN.
- [ ] **Remote access — Cloudflare Tunnel + Cloudflare Access** — depends on always-on PC above. Domain decision postponed until after the website rebuild. Tunnel must terminate at FastAPI port 8080, NEVER raw robot port 10003.
- [ ] **Website rebuild** — decide hosting (Vercel vs Cloudflare Pages), then move `atelierdsm.com` DNS to Cloudflare in the same pass. This also unlocks `robot.atelierdsm.com` for the tunnel.
- [ ] **Robot licensing / remote kill-switch** — admin-controlled 30-day rental timeout, remote disable. Admin-side only, client cannot bypass.
- [ ] **Relfar DB persistence** — replace in-memory state with SQLite (fixes the known DB-persistence rule violation).

## On Hold / Paused

- **UniFi port-forward rule "Robot Test (temp - remove after testing)"** — WAN 50000 → 192.168.10.10:8080 TCP. Created 2026-04-13, **paused** same day because FastAPI host doesn't live on the LAN yet. Either retarget at the always-on PC's IP and unpause, or delete the rule.

## Open Questions

- Which Raspberry Pi / mini-PC / old laptop for the always-on box?
- Website hosting: Vercel (consistent with portal) or Cloudflare Pages (cheaper + tighter CF integration)?
- Relfar refactor — prioritise before or after the portal in-progress items?
- Robot licensing — check-in frequency, offline grace period?

---

*Edit this file directly to check things off or reorder. Claude will also update it when you use WTB / BUILD / LIST.*
