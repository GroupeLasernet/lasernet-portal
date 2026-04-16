# Cobot (services/robot) — Short-Term TODO

> Cobot-specific task list — kept separate from the root `BACKLOG.md` so
> wider portal/infra subjects don't dilute cobot work.
> Last updated: 2026-04-14

## In Progress

- [ ] **Wrist Free Mode button still doesn't trigger anything** *(2026-04-14, polling shipped but broken)* — polling via `ReadEndBTN,0,;` was added to `robot_comm.py::_poll_wrist_buttons` and confirmed to compile; commit `8b7add2` pushed. After `nssm restart ElfinRobot` on the robot PC, pressing the physical Free Mode button on the wrist produces **no effect**: no overlay, no drag-teach activation, no toast. Separately, pressing the pendant-equivalent works (hardware is fine, controller-side gate is open). Suspects to investigate next session, in order of likelihood:
    1. **Bit mapping wrong** — we assumed `WRIST_BTN_FREE_MODE_BIT = 0` and `WRIST_BTN_WAYPOINT_BIT = 1`, but the actual bit order in the `ReadEndBTN` response (`nBit1,nBit2,nBit3,nBit4`) was never empirically confirmed. Press each wrist button while tailing the robot service log (wherever NSSM writes stdout — check `nssm dump ElfinRobot`) and see which bit toggles. We may be watching the wrong one, or the physical button Hugo calls "Free Mode" is actually wired to a different DI than `EndBTN`.
    2. **`ReadEndBTN` not supported on Elfin Pro E03** — some Huayan variants only expose `ReadEI,0,<bit>,;` per-bit reads. If the poll silently errors, no edges ever fire. Add a one-shot log on first poll to confirm the controller responded `OK` with 4 numbers.
    3. **`_poll_wrist_buttons` not wired into `_poll_loop`** — double-check the loop actually calls it every cycle. The previous session summary says it was added, but worth verifying against the pushed code.
    4. **Rising-edge logic inverted** — if the buttons are active-low at the flange DI (1→0 on press), our rising-edge detector never fires. Try both edges.
    Only once the Free Mode button works should we worry about Waypoint + the frontend toast.

- [ ] **Arm moves slowly; multiplier plateaus past some speed** *(2026-04-14)* — even with slider at 6×, arm still feels slow, and Hugo reports no further change above a certain multiplier value. Things we already tried this session: raised jog speed cap 180→1080, raised accel ratio from 1.5×speed to 4×speed (+200 floor). Next-session hypotheses:
    1. **Controller joint-accel hard limit** — Elfin E03 Pro likely caps joint accel around 720–2000 °/s². Our 4×speed calc at 6× (= 4320 °/s²) exceeds that; controller silently clips. The plateau Hugo observes is this clip. Fix: dump the controller's advertised joint-accel limits (via pendant or `ReadRobotMaxAcc` if it exists) and stop commanding above them.
    2. **Jog uses `WayPoint` (point-to-point) not streaming jog** — each click sends one WayPoint move. The controller accelerates from zero every click regardless of hold duration. For continuous fast hand-jogging the correct Han's SDK command is `MoveJog` / `LongJog` / `ShortJog` streaming commands. That's the real architectural fix.
    3. **`_prepare_motion` latency** — every jog click runs `GrpStop → GrpEnable → SetOverride` (~100–150 ms) before the move. Skip the prep when state is already `StandBy` and servo enabled.
    4. **Jog step size, not speed** — if Hugo is test-clicking with 5–10 mm step, the move is accel-limited regardless. Try 100 mm step to isolate speed cap from accel bottleneck.

- [ ] **Robot still looks dismantled after exiting Free Mode** *(2026-04-14, flagged again)* — confirmed by Hugo: after hand-guiding in Free Mode and then exiting, the 3D view shows the flange (and sometimes wrist geometry) detached from the kinematic chain. Root cause: `robot3d.js::_buildCADRobot` places STL meshes using STEP-world coords computed once at init; at certain J4/J5/J6 combinations reachable via drag-teach the `worldToLocal` offsets no longer track the moving joint groups. Workaround today: click Position 1 to reset to a known pose — the visual re-syncs. Real fix: re-parent each STL mesh to its joint-local frame so updates follow the joint group transform naturally (no more baked world offsets). Separate focused session — needs care with J4 & J5 thetaOffsets and mesh pivot alignment.
## Deferred / Nice-to-have

- [ ] **DEV_SKIP_LICENSE bypass** — still active; remove once portal licensing fully shipped.

## Recently Shipped

- [x] **Speed multiplier slider — max set to 6×** *(2026-04-14)* — UI slider below the 0–100% Speed slider multiplies the 180 mm/s · 180 °/s base ceiling. Hugo set final max = **6.0×** → absolute ceiling = 1080 mm/s · 1080 °/s. Slider step = 0.1×; backend caps in `robot_comm.py::jog_joint` and `jog_cartesian` raised 180 → 1080.
- [x] **Free Mode overlay fix** *(2026-04-14)* — removed `backdrop-filter: blur` (caused WebGL dismantling on iGPUs); added user-intent latch so stale `drag_mode=true` from poll can't engage overlay on fresh page load.
- [x] **Position 1 / Position 2 saved-pose slots** *(2026-04-14)* — renamed Travel → Position 1; added Position 2 with independent `position2_joints` column + generic `/api/robot/position/{slot}` endpoints. Slot 1 aliases legacy `travel_joints` for backward compat.
- [x] **Free Mode real SDK command fix** *(2026-04-14)* — replaced the fake `DragTeachSwitch` with real `GrpOpenFreeDriver` / `GrpCloseFreeDriver` per Huayan SDK.
