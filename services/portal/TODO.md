# Portal (services/portal) — Short-Term TODO

> Portal-specific task list — kept separate from the root `BACKLOG.md` so
> wider cobot/infra subjects don't dilute portal work.
> Last updated: 2026-04-15

## In Progress

_(nothing actively in flight)_

## Deferred / Nice-to-have

- [ ] **Portal-side licensing gate** — once shipped, drop `DEV_SKIP_LICENSE` in `services/robot/`. Today the robot `/api/robot/*` endpoints are gated by a dev-bypass env var; the Portal is the intended source of truth for per-serial licensing.
- [ ] **Cloudflare Tunnel for Portal** — track in the general backlog; portal side just needs the right `NEXT_PUBLIC_APP_URL` baked in once the subdomain is chosen.
- [ ] **Relfar DB tables + endpoints** — Relfar controller UI is live under `services/relfar/` but Portal has no tables for laser sessions / telemetry yet. Device sync should mirror the robot pattern (serial-keyed, snapshot + audit).
- [ ] **Thin-client migration** — long-term IP-protection goal. Move station-PC logic + UI into Portal so the PC becomes a thin executor. Tracked separately; any new feature should prefer the portal side when there's a choice.

## Recently Shipped

- [x] **Removed Station PC returns to "To be approved"** *(2026-04-15)* — `/api/station-pcs/[id]` PATCH now flips `approved=false` + `status=provisioning` on detach (when `assignToStationId=null` and the caller didn't explicitly pass `approved`), so the PC reappears in the pending queue. Frontend detail panel adds an explicit "Unassign & send back to approval" button plus a confirm dialog explaining the consequence. Reassignment from Station A → Station B leaves `approved=true` untouched.
- [x] **Sidebar reorder — Station PCs above Machines** *(2026-04-15)* — swapped array positions in `src/app/admin/layout.tsx` so operators reach station PC management before the machine list.
- [x] **Google Places autocomplete on station address** *(2026-04-15)* — new `src/components/AddressAutocomplete.tsx` lazy-loads the Places JS library (no `@types/google.maps` dep — local shims). Picking a suggestion auto-fills addressLine / city / province / postalCode / country via `parseComponents` and persists immediately.
- [x] **Station deployment address — business vs. custom, with Street View + map** *(2026-04-15)* — added 6 nullable address columns on `Station` + `addressLocked` boolean (migration `20260415_station_address.sql`, applied to Neon). Radio toggles between ManagedClient/QuickBooks billing address and a custom install address. Locked-by-default checkbox required to edit. Street View + Google Maps iframe render side-by-side when geocoded.
- [x] **Deep link from Clients → Stations tab** *(2026-04-15)* — clicking a station name in the clients page routes to `/admin/stations?stationId=<id>` and the stations page auto-selects that station via a `window.location.search` effect (avoids `useSearchParams` Suspense requirement).
- [x] **Multi-invoice chips on station rows** *(2026-04-15)* — when a station has ≥2 linked invoices, the clients-tab row renders orange `#<invoiceNumber>` chips under the name. Merges invoices from `row.invoices`, legacy `notes.invoices`, and single `notes.invoiceNumber` with dedup.
