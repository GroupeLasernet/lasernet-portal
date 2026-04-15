# Elfin Pendant Operation Manual — Key Findings

Source: `HansRobot_Operation_Manual_Elfin_Software.pdf` (128 pages, Shenzhen Han's
Robot Co., Ltd.). Sections below are the parts that actually affect how we drive the
robot from Prisma — the rest of the manual is pendant-UI-specific.

## Vocabulary mapping (pendant ↔ SDK)

| Pendant (manual) term | SDK / wire command |
|---|---|
| **Zero-Force Demonstration** | **GrpOpenFreeDriver / GrpCloseFreeDriver** — this is the drag-teach button on the pendant |
| End Teaching | GrpCloseFreeDriver |
| Power-on / Startup | Electrify |
| Enable | GrpEnable |
| Disable | GrpDisable |
| Inching | jog commands (ShortJogL / ShortJogJ) |
| Teach Point | waypoint set via ReadCurPos |

"Zero-Force Demonstration" being the manual's name for drag teach is the single most
important mapping — we had been calling the command `DragTeachSwitch` which doesn't
exist; the actual name is `GrpOpenFreeDriver` and it puts the arm into the state the
manual calls "zero-force demonstration".

## Startup sequence (manual §1.3)

1. **Login** — username/password dialog. Default admin / admin (confirmed on our pendant).
   Three permission levels: Administrator (all), Operator (subset), Visitor (inching + menu only).
2. **Startup** — press [Startup] on the logo. Robot is powered on but joint brakes are
   still engaged. Logo = yellow (disabled state).
3. **Check params** — TCP, payload, installation angle, mechanical origin, center of gravity.
   **⚠ Wrong params here cause drag-teach to auto-close.**
4. **Enable** — press [Enable]. Brakes release, Logo turns green. Robot is at StandBy.

Logo colors (manual §1.1):
- **Yellow** = disabled
- **Green** = enabled (StandBy)
- **Purple** = running program
- **Blue** = zero-force demonstration (drag teach)
- **Red** = uninitialized / abnormal

## Zero-Force Demonstration / Drag Teach (manual §2.7)

Verbatim from page 28–29:

> "Zero-Force Demonstration" button is green and will be red when enabled;
>
> **Make sure that the origin, load, center of gravity and installation angle of the
> machine are correct before enabling zero-force demonstration. If a parameter is
> wrong, the zero-force demonstration will be automatically closed immediately after
> enabled and there is an error prompt.**
>
> After the zero-force demonstration is enabled, the button turns red [End Teaching],
> and the robot can be dragged freely. When the robot approaches the edge of the safe
> space or the safe limit, it will feel a force in the opposite direction, and if it
> continues to move towards the safe limit, it will cause the robot error. Therefore,
> please drag it within safe limits.
>
> Click "End Teaching" button to exit the zero-force demonstration state.

### Why this matters for Prisma

When we send `GrpOpenFreeDriver,0,;` and the arm stays stiff, or the command returns
`20018 StateRefuse`, the cause is almost always one of:

1. **Robot not enabled** (FSM ≠ 33 StandBy). Fix: call `GrpEnable,0,;` and poll state.
2. **Payload / CoG / install angle / TCP wrong.** Fix: set them via the pendant or via
   SDK calls (`loadIdentify`, `setBaseInstallingAngle`, TCP config).
3. **Robot near or past a safe-space boundary / limit.** Fix: jog it back into safe space.
4. **Safety guard active** (FSM = 12 SafeGuard or 5 EmergencyStop). Fix: clear e-stop /
   safety signal, then `GrpReset,0,;`.

## Safety / safe-limit gate (manual §3.4)

> Configure settings such as safe collision threshold range, robot movement and speed
> range and security IO of the robot, **and need to verify the security password before
> operation**.

So: changing safe-limit parameters requires a password-verified pendant session. This is
the "Safety Verification" dialog in the screenshot. It does NOT gate drag-teach itself —
it only gates *modifying* the safety config. Drag-teach is gated by FSM state, not by
password verification.

**However**, the physical Free Mode button on the arm IS a hardware-level interaction
that requires the pendant to be logged-in with a permission level that allows dragging.
That's the "admin / admin" step Hugo observed.

## Normal vs Reduced safety mode (manual §3.4.1)

- **Normal Mode** — default, permissive.
- **Reduced Mode** — activated when TCP leaves a security boundary OR via a configurable
  input IO signal. Stricter force/speed/momentum limits. Can trip drag-teach if tool is
  near a boundary.

## Status states surfaced in the UI (manual §1.4)

- "The robot has been not powered on currently" — need Electrify.
- "The robot is disabled currently" — electrified but brakes engaged, need GrpEnable.
- "The robot is enabled" — StandBy, ready.
- "The execution error of robot" — check pop-up, usually GrpReset clears it.

## What the pendant does that we don't yet do from Prisma

The pendant's drag-teach button wraps the raw SDK call in a preflight check:

1. Verifies TCP / payload / installation angle are set.
2. Verifies robot is at StandBy (FSM 33).
3. Calls the equivalent of `GrpOpenFreeDriver,0,;`.
4. Polls FSM until it reaches FreeDriver (31), or until an error is surfaced.
5. If the controller auto-closes within a moment (bad params), the pendant shows an
   error prompt.

Prisma's `set_drag_mode` just does step 3 right now. To match pendant reliability, we
should add:
- Pre-check current FSM state via `ReadCurFSM` / `ReadRobotState` — only send
  GrpOpenFreeDriver from StandBy.
- Poll FSM for 1–2 seconds after the call — confirm we reached 31, return error otherwise.
- Log the error code if StateRefuse returned.

These would be incremental improvements — commit after the basic GrpOpenFreeDriver fix
is confirmed working.
