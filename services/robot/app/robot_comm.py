"""
Elfin Pro E03 – Robot Communication Module

Implements the Han's Robot TCP SDK protocol (port 10003).
Protocol discovered from the official Java SDK (HansRobotAPI_Base).

Command format:  CommandName,param1,param2,...,;
Response format: CommandName,OK,data1,data2,...;
                 CommandName,Fail,errorCode;

All commands use rbtID=0 for single robot systems.
"""
from __future__ import annotations

import socket
import threading
import time
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("elfin_robot")


@dataclass
class CartesianPose:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    rx: float = 0.0
    ry: float = 0.0
    rz: float = 0.0


@dataclass
class RobotState:
    connected: bool = False
    servo_enabled: bool = False
    moving: bool = False
    error: bool = False
    error_msg: str = ""
    drag_mode: bool = False
    # drag_mode_source tells the UI what caused drag mode to turn on:
    #   "ui"            — user clicked the on-screen Free Mode button
    #   "wrist_button"  — user pressed the physical button on the arm flange
    #   ""              — drag mode is off, source is irrelevant
    # The frontend uses this to decide whether to honor the user-intent latch
    # (the overlay engages for "wrist_button" even though the user didn't click).
    drag_mode_source: str = ""
    pose: CartesianPose = field(default_factory=CartesianPose)
    joint_positions: List[float] = field(default_factory=lambda: [0.0] * 6)
    # Last four wrist-flange button states (raw, from ReadEndBTN). We don't know
    # which bit is Free Mode vs Waypoint vs other until Hugo tests — the poll
    # logs them all and drives logic off the configured bit indices below.
    wrist_buttons: List[int] = field(default_factory=lambda: [0, 0, 0, 0])
    # Monotonic counter of wrist Waypoint presses — lets the UI show a toast
    # and fetch the captured pose on change without needing push notifications.
    waypoint_capture_count: int = 0
    # Last pose captured via the wrist Waypoint button (None until first press).
    last_captured_pose: Optional[List[float]] = None

    @property
    def cartesian_position(self) -> List[float]:
        """Return pose as a list [x, y, z, rx, ry, rz]."""
        p = self.pose
        return [p.x, p.y, p.z, p.rx, p.ry, p.rz]

    def to_dict(self) -> dict:
        return asdict(self)


class ElfinRobot:
    """
    Driver for the Han's Robot Elfin Pro E03 cobot.
    Uses the official TCP SDK protocol on port 10003.

    Safety features:
      - 24h max session: auto-disconnect if connected longer than MAX_SESSION_SECONDS
      - 15s watchdog: auto-disconnect if any command blocks longer than WATCHDOG_TIMEOUT_SECONDS
    """

    MAX_SESSION_SECONDS = 24 * 60 * 60  # 24 hours
    WATCHDOG_TIMEOUT_SECONDS = 15        # 15 seconds

    # Wrist-button bit mapping (zero-indexed into the 4-tuple returned by
    # ReadEndBTN,0,; == [nBit1, nBit2, nBit3, nBit4]). We don't have the
    # official Elfin E03 Pro datasheet mapping, so these defaults are a best
    # guess. If the wrong button triggers Free Mode, swap the two indices.
    # Logs at info level every state change so Hugo can verify on first use.
    WRIST_BTN_FREE_MODE_BIT = 0   # which index of the 4-tuple is Free Mode
    WRIST_BTN_WAYPOINT_BIT  = 1   # which index of the 4-tuple is Waypoint

    def __init__(self, ip: str = "192.168.10.10", port: int = 10003, timeout: float = 10.0):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self._sock: Optional[socket.socket] = None
        self._lock = threading.Lock()
        self._state = RobotState()
        self._poll_thread: Optional[threading.Thread] = None
        self._poll_running = False
        self._simulation_mode = False
        self._connected_at: Optional[float] = None       # timestamp when connected
        self._last_successful_comm: Optional[float] = None  # last successful communication
        self._watchdog_thread: Optional[threading.Thread] = None
        self._watchdog_running = False

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self) -> bool:
        """Open TCP connection to the robot controller."""
        with self._lock:
            try:
                self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self._sock.settimeout(self.timeout)
                self._sock.connect((self.ip, self.port))
                self._state.connected = True
                self._simulation_mode = False
                self._connected_at = time.time()
                self._last_successful_comm = time.time()
                logger.info(f"Connected to Elfin at {self.ip}:{self.port}")
            except (socket.error, OSError) as e:
                logger.warning(f"Connection failed ({e}). Entering simulation mode.")
                self._state.connected = False
                self._simulation_mode = True
                self._connected_at = None
                self._start_polling()
                return False

        # Initial handshake: connect to box & start master
        try:
            self._send_cmd("Electrify")
            time.sleep(0.3)
            self._send_cmd("StartMaster")
            time.sleep(0.3)
            # Set speed override to 100% so robot moves at commanded velocity
            self._send_cmd("SetOverride", 0, 1.0)
            time.sleep(0.1)
        except Exception as e:
            logger.warning(f"Handshake warning (non-fatal): {e}")

        self._start_polling()
        self._start_watchdog()
        return True

    def disconnect(self, reason: str = "user request"):
        """Close the TCP connection."""
        self._stop_watchdog()
        self._stop_polling()
        with self._lock:
            if self._sock:
                try:
                    self._sock.close()
                except OSError:
                    pass
                self._sock = None
            self._state.connected = False
            self._simulation_mode = False
            self._connected_at = None
            self._last_successful_comm = None
        logger.info(f"Disconnected from Elfin. Reason: {reason}")

    @property
    def is_connected(self) -> bool:
        return self._state.connected

    @property
    def simulation_mode(self) -> bool:
        return self._simulation_mode

    # ------------------------------------------------------------------
    # Watchdog: 24h session limit + 15s communication timeout
    # ------------------------------------------------------------------

    def _start_watchdog(self):
        """Start the watchdog thread that monitors session age and communication health."""
        if self._watchdog_running:
            return
        self._watchdog_running = True
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self._watchdog_thread.start()
        logger.info("Connection watchdog started (24h max session, 15s comm timeout)")

    def _stop_watchdog(self):
        self._watchdog_running = False
        if self._watchdog_thread and self._watchdog_thread.is_alive():
            self._watchdog_thread.join(timeout=3)

    def _watchdog_loop(self):
        """Check every 5 seconds whether the connection should be killed."""
        while self._watchdog_running and (self._state.connected or self._simulation_mode):
            now = time.time()

            # Check 24h session limit
            if self._connected_at and (now - self._connected_at) > self.MAX_SESSION_SECONDS:
                logger.warning("WATCHDOG: 24-hour session limit reached. Auto-disconnecting.")
                self._watchdog_running = False
                threading.Thread(target=self.disconnect, args=("24h session limit",), daemon=True).start()
                return

            # Check 15s communication timeout (only for real connections, not simulation)
            if (not self._simulation_mode and self._last_successful_comm and
                    (now - self._last_successful_comm) > self.WATCHDOG_TIMEOUT_SECONDS):
                logger.warning("WATCHDOG: No successful communication for 15s. Auto-disconnecting.")
                self._watchdog_running = False
                threading.Thread(target=self.disconnect, args=("15s communication timeout",), daemon=True).start()
                return

            time.sleep(5)

    # ------------------------------------------------------------------
    # Low-level protocol: send command, receive response
    # ------------------------------------------------------------------

    def _send_cmd(self, command: str, *args) -> List[str]:
        """
        Send a command using the Hans Robot TCP protocol.

        Args:
            command: Command name (e.g. "ReadActPos", "GrpEnable")
            *args: Parameters to append after rbtID=0

        Returns:
            List of response data fields (after CommandName and OK).

        Raises:
            ConnectionError on timeout or communication failure.
        """
        if self._simulation_mode:
            return self._simulate_command(command, *args)

        # Build command string: Command,0,arg1,arg2,...,;
        parts = [command, "0"] + [str(a) for a in args]
        cmd_str = ",".join(parts) + ",;"

        with self._lock:
            if not self._sock:
                raise ConnectionError("Not connected to robot")
            try:
                self._sock.sendall(cmd_str.encode("ascii"))

                # Read response until we see ';'
                buf = b""
                start = time.time()
                while True:
                    try:
                        chunk = self._sock.recv(4096)
                        if not chunk:
                            raise ConnectionError("Connection closed by robot")
                        buf += chunk
                        if b";" in buf:
                            break
                    except socket.timeout:
                        if time.time() - start > self.timeout:
                            raise ConnectionError("Response timeout")

                resp = buf.decode("ascii").strip()
                self._last_successful_comm = time.time()  # Watchdog: mark success
                return self._parse_response(command, resp)

            except (socket.error, OSError) as e:
                self._state.connected = False
                self._state.error = True
                self._state.error_msg = str(e)
                raise ConnectionError(f"Communication error: {e}")

    def _parse_response(self, command: str, resp: str) -> List[str]:
        """Parse Hans Robot response format: CommandName,OK,data,...;"""
        # Remove trailing semicolon
        resp = resp.rstrip(";").strip()
        parts = [p.strip() for p in resp.split(",")]

        if len(parts) < 2:
            logger.warning(f"Malformed response: {resp}")
            return []

        # First field should echo the command name
        resp_cmd = parts[0]
        result = parts[1]

        if result == "OK":
            return parts[2:]  # Return data fields
        elif result == "Fail":
            error_code = parts[2] if len(parts) > 2 else "unknown"
            logger.warning(f"Command {command} failed: error code {error_code}")
            return []
        else:
            # Some commands might have different format
            logger.debug(f"Unexpected response format for {command}: {resp}")
            return parts[1:]

    def _simulate_command(self, command: str, *args) -> List[str]:
        """Return plausible responses when no real robot is available."""
        cmd = command.lower()

        if cmd == "readactpos":
            j = self._state.joint_positions
            p = self._state.pose
            # Return: J1-J6, X,Y,Z,Rx,Ry,Rz, TCP(6), UCS(6) = 24 values
            vals = (
                [f"{v:.4f}" for v in j] +
                [f"{p.x:.4f}", f"{p.y:.4f}", f"{p.z:.4f}",
                 f"{p.rx:.4f}", f"{p.ry:.4f}", f"{p.rz:.4f}"] +
                ["0.0000"] * 12  # TCP and UCS
            )
            return vals

        elif cmd in ("grpenable", "grpdisable", "grpstop", "grpreset",
                      "electrify", "startmaster", "connecttobox"):
            if cmd == "grpenable":
                self._state.servo_enabled = True
            elif cmd == "grpdisable":
                self._state.servo_enabled = False
            elif cmd == "grpstop":
                self._state.moving = False
            elif cmd == "grpreset":
                self._state.error = False
                self._state.error_msg = ""
            return []

        elif cmd == "shortjogj":
            # Simulate: move joint by ~2 degrees
            if len(args) >= 2:
                axis_id = int(args[0])
                direction = int(args[1])
                if 0 <= axis_id < 6:
                    self._state.joint_positions[axis_id] += 2.0 * direction
            return []

        elif cmd == "shortjogl":
            # Simulate: move TCP by ~2mm
            if len(args) >= 2:
                axis_id = int(args[0])
                direction = int(args[1])
                axes = ["x", "y", "z", "rx", "ry", "rz"]
                if 0 <= axis_id < 6:
                    current = getattr(self._state.pose, axes[axis_id])
                    setattr(self._state.pose, axes[axis_id], current + 2.0 * direction)
            return []

        elif cmd == "waypoint":
            # Simulate: update pose to target
            return []

        elif cmd == "readrobotstate":
            # nMovingState, nEnableState, nErrorState, nErrorCode, ...
            moving = "1" if self._state.moving else "0"
            enabled = "1" if self._state.servo_enabled else "0"
            error = "1" if self._state.error else "0"
            return [moving, enabled, error, "0", "0"]

        elif cmd == "readcurfsm":
            return ["0"]  # Idle state

        return []

    # ------------------------------------------------------------------
    # State polling
    # ------------------------------------------------------------------

    def _start_polling(self):
        if self._poll_running:
            return
        self._poll_running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def _stop_polling(self):
        self._poll_running = False
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=3)

    def _poll_loop(self):
        poll_count = 0
        while self._poll_running and (self._state.connected or self._simulation_mode):
            try:
                self._read_actual_position()
                # Read robot state every 2nd poll (~1s) to update enabled/error flags
                if poll_count % 2 == 0:
                    self._read_robot_state_cached()
                # Poll wrist-flange buttons every tick — cheap and we want a
                # fast response when Hugo presses them.
                self._poll_wrist_buttons()
            except Exception as e:
                logger.debug(f"Poll error: {e}")
            poll_count += 1
            time.sleep(0.5)

    def _poll_wrist_buttons(self):
        """
        Read the 4 wrist-flange buttons via ReadEndBTN,0,; and react to rising
        edges (transitions 0 → 1 since the last poll).

        - Free Mode button press → toggles drag mode. If drag mode was on we
          close it; if off we open it. Source marked 'wrist_button' so the UI
          engages the overlay even without a user-intent click.
        - Waypoint button press → captures current pose into
          state.last_captured_pose and bumps waypoint_capture_count so the UI
          can detect the event and toast.

        Safe to skip in simulation mode — the physical buttons don't exist.
        """
        if self._simulation_mode:
            return
        try:
            data = self._send_cmd("ReadEndBTN")
        except Exception as e:
            logger.debug(f"ReadEndBTN poll error: {e}")
            return
        if len(data) < 4:
            return
        try:
            new_states = [int(data[i]) != 0 and 1 or 0 for i in range(4)]
        except (ValueError, IndexError):
            return

        prev_states = self._state.wrist_buttons
        self._state.wrist_buttons = new_states

        # Rising-edge detection per bit
        free_bit = self.WRIST_BTN_FREE_MODE_BIT
        wp_bit   = self.WRIST_BTN_WAYPOINT_BIT

        free_rising = (prev_states[free_bit] == 0 and new_states[free_bit] == 1)
        wp_rising   = (prev_states[wp_bit]   == 0 and new_states[wp_bit]   == 1)

        if free_rising:
            logger.info("Wrist button: Free Mode press detected (bit %d)", free_bit)
            try:
                target = not self._state.drag_mode
                self.set_drag_mode(target)
                self._state.drag_mode_source = "wrist_button" if target else ""
            except Exception as e:
                logger.warning(f"Wrist Free Mode toggle failed: {e}")

        if wp_rising:
            logger.info("Wrist button: Waypoint press detected (bit %d)", wp_bit)
            # Snapshot current pose for the UI to surface.
            self._state.last_captured_pose = list(self._state.cartesian_position)
            self._state.waypoint_capture_count += 1

    def _read_robot_state_cached(self):
        """Read robot state (moving, enabled, error) and cache it."""
        try:
            data = self._send_cmd("ReadRobotState")
            if len(data) >= 3:
                self._state.moving = int(data[0]) != 0
                self._state.servo_enabled = int(data[1]) != 0
                self._state.error = int(data[2]) != 0
        except Exception as e:
            logger.debug(f"ReadRobotState poll error: {e}")

    def _read_actual_position(self):
        """Read joint positions and TCP pose via ReadActPos command."""
        data = self._send_cmd("ReadActPos")
        if len(data) >= 12:
            try:
                # First 6 values: joint angles (degrees)
                self._state.joint_positions = [float(data[i]) for i in range(6)]
                # Next 6 values: Cartesian pose (mm, degrees)
                self._state.pose = CartesianPose(
                    x=float(data[6]), y=float(data[7]), z=float(data[8]),
                    rx=float(data[9]), ry=float(data[10]), rz=float(data[11])
                )
            except (ValueError, IndexError) as e:
                logger.debug(f"Parse error in ReadActPos: {e}")

    # ------------------------------------------------------------------
    # Robot commands
    # ------------------------------------------------------------------

    def enable_servo(self) -> str:
        """Enable the robot servo (power on motors)."""
        self._send_cmd("GrpEnable")
        self._state.servo_enabled = True
        return "OK"

    def disable_servo(self) -> str:
        """Disable the robot servo."""
        self._send_cmd("GrpDisable")
        self._state.servo_enabled = False
        return "OK"

    def clear_alarm(self) -> str:
        """Clear any active alarms / errors."""
        self._send_cmd("GrpReset")
        self._state.error = False
        self._state.error_msg = ""
        return "OK"

    def set_drag_mode(self, enabled: bool) -> str:
        """
        Enable/disable Free Drive (hand-guiding / drag teach).
        When ON, the arm becomes compliant and can be moved by hand.

        Han's Robot SDK (verified against huayan-robotics/SDK_sample Java source
        HansRobotAPI_Base.java, Oct 2025):
            ON  → "GrpOpenFreeDriver,0,;"   (HRIF_GrpOpenFreeDriver_base)
            OFF → "GrpCloseFreeDriver,0,;"  (HRIF_GrpCloseFreeDriver_base)

        FSM transitions: StandBy(33) → RobotOpeningFreeDriver(29) → FreeDriver(31)
                         FreeDriver(31) → RobotClosingFreeDriver(30) → StandBy(33)

        Preconditions:
        - Controller connected (StartMaster)
        - Robot electrified (Electrify)
        - Robot enabled (GrpEnable)  ← if not enabled → error 20018 StateRefuse
        - Not in Error / EmergencyStop / SafeGuard state
        """
        if enabled:
            # _send_cmd auto-prepends rbtID=0 → wire: GrpOpenFreeDriver,0,;
            self._send_cmd("GrpOpenFreeDriver")
        else:
            self._send_cmd("GrpCloseFreeDriver")
        self._state.drag_mode = bool(enabled)
        return "OK"

    def toggle_drag_mode(self) -> bool:
        """Toggle drag mode and return the new state."""
        self.set_drag_mode(not self._state.drag_mode)
        return self._state.drag_mode

    def stop(self) -> str:
        """Immediately stop all motion."""
        self._send_cmd("GrpStop")
        self._state.moving = False
        return "OK"

    def read_pose(self) -> CartesianPose:
        """Read the current Cartesian TCP pose."""
        self._read_actual_position()
        return self._state.pose

    def read_joints(self) -> List[float]:
        """Read current joint positions (degrees)."""
        self._read_actual_position()
        return self._state.joint_positions

    def read_fsm_state(self) -> int:
        """Read the current FSM (finite state machine) state number."""
        data = self._send_cmd("ReadCurFSM")
        if data:
            try:
                return int(data[0])
            except (ValueError, IndexError):
                pass
        return -1

    def read_robot_state(self) -> dict:
        """Read detailed robot state: moving, enabled, error, etc."""
        data = self._send_cmd("ReadRobotState")
        result = {}
        if len(data) >= 3:
            try:
                result["moving"] = int(data[0])
                result["enabled"] = int(data[1])
                result["error"] = int(data[2])
            except (ValueError, IndexError):
                pass
        return result

    def startup_sequence(self) -> dict:
        """
        Run the full startup sequence: ConnectToBox → Electrify → StartMaster.
        Returns status of each step.
        """
        results = {}
        for cmd in ["ConnectToBox", "Electrify", "StartMaster"]:
            try:
                self._send_cmd(cmd)
                results[cmd] = "OK"
            except ConnectionError as e:
                results[cmd] = f"Error: {e}"
            time.sleep(0.5)
        return results

    def short_jog_joint(self, axis_id: int, direction: int) -> str:
        """
        Short jog a single joint. Moves ~2 degrees at max 10°/s.
        axis_id: 0-5 (J1-J6)
        direction: 0 = negative, 1 = positive
        """
        self._send_cmd("ShortJogJ", axis_id, direction)
        return "OK"

    def short_jog_linear(self, axis_id: int, direction: int) -> str:
        """
        Short jog in Cartesian space. Moves ~2mm at max 10mm/s.
        axis_id: 0=X, 1=Y, 2=Z, 3=Rx, 4=Ry, 5=Rz
        direction: 0 = negative, 1 = positive
        """
        self._send_cmd("ShortJogL", axis_id, direction)
        return "OK"

    def move_waypoint(self, x: float, y: float, z: float,
                      rx: float, ry: float, rz: float,
                      speed: float = 50.0, accel: float = 100.0,
                      move_type: int = 0, use_joint: int = 0,
                      joints: list = None) -> str:
        """
        Move to a waypoint using the correct Han's Robot SDK WayPoint format.
        TCP format: WayPoint, rbtID, X,Y,Z,Rx,Ry,Rz, J1-J6, tcpName, ucsName,
                    velocity, accel, radius, moveType, nisUseJoint, nisSeek,
                    nIOBit, nIOState, strCmdID,;
        move_type: 0=MoveJ, 1=MoveL
        use_joint: 0=use cartesian target, 1=use joint angles as target
        speed must be less than accel.
        """
        j = joints if joints else list(self._state.joint_positions)
        self._send_cmd("WayPoint",
                        x, y, z, rx, ry, rz,
                        j[0], j[1], j[2], j[3], j[4], j[5],
                        "TCP", "Base",
                        speed, accel, 0,             # velocity, acceleration, radius
                        move_type, use_joint, 0,     # moveType, nisUseJoint, nisSeek
                        0, 0, "wp")                  # nIOBit, nIOState, strCmdID
        self._state.moving = True
        return "OK"

    def _send_cmd_quiet(self, command: str, *args):
        """Send a command but suppress warning logs for expected failures."""
        try:
            return self._send_cmd(command, *args)
        except Exception:
            return []

    def _prepare_motion(self):
        """
        Prepare the robot for a new motion command.
        Correct sequence: GrpStop → wait → GrpEnable → wait → SetOverride(100%).
        SetOverride requires servo to be enabled, so it must come after GrpEnable.
        All commands use quiet send — failures like 'already enabled' are expected.
        """
        # Temporarily suppress warnings for prep commands
        old_level = logger.level
        logger.setLevel(logging.ERROR)
        try:
            self._send_cmd_quiet("GrpStop")
            time.sleep(0.15)  # Give robot time to fully stop
            self._send_cmd_quiet("GrpEnable")
            time.sleep(0.05)
            self._send_cmd_quiet("SetOverride", 0, 1.0)
            time.sleep(0.05)
        finally:
            logger.setLevel(old_level)

    def jog_joint(self, axis_id: int, direction: int, degrees: float = 5.0,
                  speed: float = 60.0) -> str:
        """
        Jog a single joint by a given number of degrees using WayPoint MoveJ.
        axis_id: 0-5 (J1-J6)
        direction: 0 = negative, 1 = positive
        degrees: how far to move (default 5°)
        speed: velocity in °/s (default 60)
        """
        self._prepare_motion()

        j = list(self._state.joint_positions)
        p = list(self._state.cartesian_position)
        delta = degrees if direction == 1 else -degrees
        j[axis_id] += delta
        # Cap speed to safe max for joints.
        # Raised 180 -> 1080 to let the UI speed multiplier (up to 6×) through.
        speed = min(speed, 1080.0)
        # Accel: short jogs never reach commanded velocity when accel = 1.5×speed.
        # Bumped to 4×speed (+ 200 floor) so jogs actually get off the line.
        # Elfin E03 Pro controller will clip above its mechanical joint-accel limit.
        accel = max(speed * 4.0, speed + 200)
        self.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=0,
            use_joint=1, joints=j
        )
        return "OK"

    def jog_cartesian(self, axis_id: int, direction: int, distance: float = 5.0,
                      speed: float = 60.0) -> str:
        """
        Jog in Cartesian space by a given distance using WayPoint MoveL.
        axis_id: 0=X, 1=Y, 2=Z, 3=Rx, 4=Ry, 5=Rz
        direction: 0 = negative, 1 = positive
        distance: mm for XYZ, degrees for RxRyRz (default 5)
        speed: velocity in mm/s or °/s (default 60)
        """
        self._prepare_motion()

        j = list(self._state.joint_positions)
        p = list(self._state.cartesian_position)
        delta = distance if direction == 1 else -distance
        p[axis_id] += delta
        # Cap speed to safe max (raised 180 -> 1080 for UI multiplier headroom up to 6×).
        speed = min(speed, 1080.0)
        # Accel: short jogs are accel-limited, not speed-limited. Bumped 1.5×→4×.
        accel = max(speed * 4.0, speed + 200)
        self.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=1,
            use_joint=0, joints=j
        )
        return "OK"

    def get_state(self) -> RobotState:
        """Return a snapshot of the current robot state."""
        return self._state

    def get_state_dict(self) -> dict:
        return self._state.to_dict()

    # ------------------------------------------------------------------
    # High-level: execute a waypoint program
    # ------------------------------------------------------------------

    def execute_program(self, waypoints: List[Dict[str, Any]],
                        speed: float = 50.0,
                        on_progress=None) -> bool:
        """
        Execute a list of waypoints sequentially.
        Each waypoint: {"x", "y", "z", "rx", "ry", "rz", "type": "move"|"trace"}
        """
        total = len(waypoints)
        for i, wp in enumerate(waypoints):
            if not self._state.connected and not self._simulation_mode:
                logger.error("Lost connection during program execution.")
                return False

            wp_speed = speed if wp.get("type") == "trace" else speed * 3
            move_type = 1 if wp.get("type") == "trace" else 0  # MoveL for trace, MoveJ for approach
            accel = max(wp_speed * 1.5, wp_speed + 20)

            try:
                self.move_waypoint(
                    wp["x"], wp["y"], wp["z"],
                    wp["rx"], wp["ry"], wp["rz"],
                    speed=wp_speed, accel=accel, move_type=move_type
                )
            except ConnectionError as e:
                logger.error(f"Move failed at waypoint {i}: {e}")
                return False

            if on_progress:
                on_progress(i + 1, total)

            if self._simulation_mode:
                time.sleep(0.01)
            else:
                time.sleep(0.05)

        self._state.moving = False
        return True


# ------------------------------------------------------------------
# Singleton instance
# ------------------------------------------------------------------
_robot_instance: Optional[ElfinRobot] = None


def get_robot(ip: str = "192.168.10.10", port: int = 10003) -> ElfinRobot:
    """Get or create the global robot instance."""
    global _robot_instance
    if _robot_instance is None:
        _robot_instance = ElfinRobot(ip=ip, port=port)
    return _robot_instance
