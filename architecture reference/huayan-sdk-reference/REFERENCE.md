# Han's Robot / Huayan SDK — Reference

**Saved 2026-04-14** from `github.com/huayan-robotics/SDK_sample` (last updated Oct 2025).
This is the authoritative source for the Han's Robot TCP SDK that the Elfin Pro E03
controller speaks. Huayan Robotics is a subsidiary of Han's Robot and uses the same
protocol. Keep this folder in the repo so we don't have to re-discover it.

## Folder contents

```
huayan-sdk-reference/
├── REFERENCE.md                          ← this file (index + key findings)
├── java/
│   ├── ErrorCode.java                    ← error code enum (verbatim)
│   ├── FSMState.java                     ← FSM state enum (verbatim)
│   └── VariableType.java                 ← IntData / DoubleData / Position types (verbatim)
└── cpp/
    └── Sample_FreeDrive.cpp              ← force-based free drive sample (verbatim)
```

Companion docs in this folder:
- **`MANUAL_NOTES.md`** — distilled findings from the English pendant manual (esp. §2.7 Zero-Force Demonstration = drag teach, §1.3 startup sequence, §3.4 safety verification).
- **`HansRobot_Operation_Manual_Elfin_Software.pdf`** — the full 128-page manual (verbatim, Hugo uploaded 2026-04-14).

Files that are too large to copy verbatim but are linked below for reference:
- **`HansRobotAPI_Base.java`** — the big one, contains every `HRIF_*` method → TCP-command mapping. https://github.com/huayan-robotics/SDK_sample/blob/master/JavaSDKSourceCode/src/com/hansRobotBaseLib/HansRobotAPI_Base.java
- **`HansSocket.java`** — TCP send/receive framing.
- **`HansRobotAPI.java`** — higher-level wrapper.
- **`HuayanRobot_Library_C++使用示例.pdf`** — Chinese C++ usage guide (PDF at repo root).

The English operation manual is now saved in this folder as
`HansRobot_Operation_Manual_Elfin_Software.pdf` (Hugo uploaded 2026-04-14). Online mirror:
https://www.haascnc.com/content/dam/haascnc/service/guides/how-to/haas-cobot-package---installation/HansRobot_Operation%20Manual%20for%20Elfin%20Software%20(1).pdf

---

## Key wire-protocol facts (confirmed against the Java SDK)

### Command framing
Every command is an ASCII string of the form:

```
CommandName,arg1,arg2,...,argN,;
```

- Trailing `,;` is mandatory (comma then semicolon).
- `rbtID` is always the first arg and always `0` for single-arm controllers.
- `_send_cmd()` in `services/robot/app/robot_comm.py` auto-prepends `rbtID=0`.

### Commands we actually use (verified)

| Our purpose | Wire command | Source |
|---|---|---|
| Connect | `StartMaster,;` | HRIF_Connect2Controller_base |
| Electrify | `Electrify,;` | HRIF_Electrify_base |
| Enable servo | `GrpEnable,0,;` | HRIF_GrpEnable_base |
| Disable servo | `GrpDisable,0,;` | HRIF_GrpDisable_base |
| Reset / clear alarm | `GrpReset,0,;` | HRIF_GrpReset_base |
| Stop motion | `GrpStop,0,;` | HRIF_GrpStop_base |
| Emergency halt (software) | `EnterSafetyGuard,;` | HRIF_EnterSafeGuard_base |
| Set speed override | `SetOverride,0,<ratio>,;` | HRIF_SetOverride_base |
| Read state flags | `ReadRobotState,0,;` | HRIF_ReadRobotState_base |
| Read current FSM state | — (see `ReadCurFSMFromCPS`) | HRIF_ReadCurFSMFromCPS |
| **Open Free Drive (drag teach)** | **`GrpOpenFreeDriver,0,;`** | HRIF_GrpOpenFreeDriver_base |
| **Close Free Drive** | **`GrpCloseFreeDriver,0,;`** | HRIF_GrpCloseFreeDriver_base |
| Force-based free drive (needs F/T sensor) | `SetForceFreeDriveMode,0,0,<1/0>,;` | HRIF_SetForceFreeDriveMode |
| **Read wrist buttons (all 4 at once)** | **`ReadEndBTN,0,;`** → `nBit1,nBit2,nBit3,nBit4` | HRIF_ReadEndBTN_base |
| Read single end-flange DI bit | `ReadEI,0,<bit>,;` → `nVal` | HRIF_ReadEndDI_base |
| Read single end-flange DO bit | `ReadEO,0,<bit>,;` → `nVal` | HRIF_ReadEndDO_base |
| Set end-flange DO bit | `SetEndDO,0,<bit>,<val>,;` | HRIF_SetEndDO_base |
| Read end-flange analog input | `ReadEAI,0,<bit>,;` → `dVal` | HRIF_ReadEndAI_base |

### What `DragTeachSwitch` is
Not a valid command. It was a wrong guess in earlier `robot_comm.py` code. The controller
answers with error `20005` (unknown command / invalid param). Replaced with
`GrpOpenFreeDriver`/`GrpCloseFreeDriver` on 2026-04-14.

---

## Error codes (`ErrorCode.java`)

Only 8 codes are defined in the SDK enum:

| Code | Name | Meaning |
|---|---|---|
| 0 | `REC_Succeed` | Command accepted |
| 20018 | **`StateRefuse`** | Robot is not in a state that accepts this command — idempotent refusal. This is what Electrify/StartMaster/GrpEnable return when already in the target state. **Treat as non-fatal.** |
| 39500 | `isNotConnect` | Not connected |
| 39501 | `paramsError` | Bad parameters |
| 39502 | `returnError` | Controller returned an error |
| 39503 | `SocketError` | TCP socket issue |
| 39504 | `Connect2CPSFailed` | Couldn't connect to CPS (central process server) |
| 39505 | `CmdError` | Command-level error |

Other codes we've seen on the wire (`20005`, `20007`) are NOT in this enum — they come
from deeper inside the controller and almost certainly mean "unknown command" or
"invalid parameter structure". If we ever see them from a command that **is** in the
valid list above, recheck the parameter count.

---

## FSM states (`FSMState.java`)

The big picture — the controller is a finite state machine and many commands only work
in specific states. Full list is in `java/FSMState.java`. Highlights:

| State | # | Meaning / when |
|---|---:|---|
| `StandBy` | **33** | Robot idle, enabled, ready to accept motion or free-drive |
| `Disable` | 24 | Enabled connection but servo off |
| `RobotEnabling` | 23 | Transitioning to enabled |
| `Moving` | 25 | Executing motion (also: force-free-drive active) |
| `RobotOpeningFreeDriver` | 29 | Transition into free drive |
| `FreeDriver` | **31** | ✅ Drag teach active, arm compliant |
| `RobotClosingFreeDriver` | 30 | Transition out of free drive |
| `Error` | 22 | Controller-level error — need `GrpReset` |
| `EmergencyStop` | 5 | E-stop pressed |
| `SafeGuard` | 12 | Safety guard input active |

### Required sequence for drag teach (from StandBy)

```
StandBy (33)
  → send GrpOpenFreeDriver,0,;
  → RobotOpeningFreeDriver (29)
  → FreeDriver (31)   ← arm is now compliant, can be moved by hand

To exit:
FreeDriver (31)
  → send GrpCloseFreeDriver,0,;
  → RobotClosingFreeDriver (30)
  → StandBy (33)
```

Poll `ReadCurFSMFromCPS` (or equivalent) to confirm the transition — the ACK on the TCP
command only means the command was accepted, not that the state has changed.

### Preconditions for Free Drive

1. Controller connected (`StartMaster`)
2. Robot electrified (`Electrify`)
3. Servo enabled (`GrpEnable` — state should reach `Disable` = 24 then `StandBy` = 33)
4. No `Error`, `EmergencyStop`, `SafeGuard`, or `RobotOutofSafeSpace` active
5. *If the pendant has a "Safety Verification" dialog open, it must be confirmed first*
   (on Huayan pendants: user `admin` / password `admin`)

If any precondition fails, `GrpOpenFreeDriver` returns `20018 StateRefuse`.

---

## Force-based vs non-force free drive

There are **two** free-drive mechanisms in the SDK:

- **`GrpOpenFreeDriver` / `GrpCloseFreeDriver`** — simple compliant mode using joint
  torque feedback. Works on cobots WITHOUT a 6-axis F/T sensor. **This is what we
  want for the Elfin Pro E03.**
- **`SetForceFreeDriveMode` + `SetFreeDriveMotionFreedom` + a lot of setup** — uses an
  external F/T sensor for high-quality admittance control. See `cpp/Sample_FreeDrive.cpp`.
  Not applicable to us unless a wrist sensor is fitted.

---

## How to find more

1. When adding a new command to `robot_comm.py`, always check the Java
   `HansRobotAPI_Base.java` first for the exact wire format — do NOT guess.
2. If a command fails with `20018 StateRefuse`, check the current FSM state against the
   preconditions in the docstring for that `HRIF_*_base` method.
3. If the English PDF in this folder gets populated, it will have screenshots of the
   pendant and the canonical startup sequence.
