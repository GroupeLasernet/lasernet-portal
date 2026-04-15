# Cobot (services/robot) — Short-Term TODO

> Cobot-specific task list — kept separate from the root `BACKLOG.md` so
> wider portal/infra subjects don't dilute cobot work.
> Last updated: 2026-04-14

## In Progress

- [ ] **End-of-arm physical buttons (Free Mode + Waypoint) do nothing** *(2026-04-14)* — the two buttons on the wrist/flange (Free Mode and Waypoint/Teach Point) are not wired up anywhere in Prisma. Current poll loop (`robot_comm.py::_poll_loop`) only reads `ReadActPos` + `ReadRobotState`; no digital-input reads. Priority: the Free Mode button on the arm should toggle drag-teach AND engage the UI blur overlay. Plan:
    1. Identify the correct SDK command for end-flange DI read (probably `ReadEI` — confirm against Huayan SDK source, not saved in `architecture reference/huayan-sdk-reference` yet; fetch from huayan-robotics/SDK_sample on GitHub).
    2. Add button polling to `_poll_loop` (200–500 ms). Cache previous state; trigger on rising edge only, not level.
    3. On Free Mode edge → `self.set_drag_mode(not self._state.drag_mode)`.
    4. On Waypoint edge → capture current pose via `ReadActPos`; decide sink (append to active program? add a 3rd position slot? Hugo to decide).
    5. Expose a `drag_mode_source: "ui" | "wrist_button"` field in `/api/robot/state`. Frontend bypasses the `_freeModeUserIntent` latch when source is wrist_button, so the overlay engages even though the user didn't click.
    6. **Controller-side gate — CONFIRMED OK** *(Hugo 2026-04-14)*: pressing the Free Mode button on the wrist with the pendant logged in puts the arm into drag-teach as expected. Hardware is fine; the bug is purely that Prisma isn't listening. No pendant/permissions detour needed — go straight to SDK polling.

- [ ] **Robot still looks dismantled after exiting Free Mode** *(2026-04-14, flagged again)* — confirmed by Hugo: after hand-guiding in Free Mode and then exiting, the 3D view shows the flange (and sometimes wrist geometry) detached from the kinematic chain. Root cause: `robot3d.js::_buildCADRobot` places STL meshes using STEP-world coords computed once at init; at certain J4/J5/J6 combinations reachable via drag-teach the `worldToLocal` offsets no longer track the moving joint groups. Workaround today: click Position 1 to reset to a known pose — the visual re-syncs. Real fix: re-parent each STL mesh to its joint-local frame so updates follow the joint group transform naturally (no more baked world offsets). Separate focused session — needs care with J4 & J5 thetaOffsets and mesh pivot alignment.
## Deferred / Nice-to-have

- [ ] **DEV_SKIP_LICENSE bypass** — still active; remove once portal licensing fully shipped.

## Recently Shipped

- [x] **Speed multiplier slider — max set to 6×** *(2026-04-14)* — UI slider below the 0–100% Speed slider multiplies the 180 mm/s · 180 °/s base ceiling. Hugo set final max = **6.0×** → absolute ceiling = 1080 mm/s · 1080 °/s. Slider step = 0.1×; backend caps in `robot_comm.py::jog_joint` and `jog_cartesian` raised 180 → 1080.
- [x] **Free Mode overlay fix** *(2026-04-14)* — removed `backdrop-filter: blur` (caused WebGL dismantling on iGPUs); added user-intent latch so stale `drag_mode=true` from poll can't engage overlay on fresh page load.
- [x] **Position 1 / Position 2 saved-pose slots** *(2026-04-14)* — renamed Travel → Position 1; added Position 2 with independent `position2_joints` column + generic `/api/robot/position/{slot}` endpoints. Slot 1 aliases legacy `travel_joints` for backward compat.
- [x] **Free Mode real SDK command fix** *(2026-04-14)* — replaced the fake `DragTeachSwitch` with real `GrpOpenFreeDriver` / `GrpCloseFreeDriver` per Huayan SDK.
