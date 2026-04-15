"""
Station PC self-identity + auto-registration with the portal.

What this does
--------------
On boot, the on-prem robot service needs to tell the portal "I exist, here's
my hardware identity". The portal-side model is `StationPC` (serial + MAC +
hostname + nickname). We don't want operators to hand-type any of those fields,
so the PC detects them locally and POSTs them to /api/station-pcs/register.

Flow:
    1. detect_identity()      — read BIOS serial, primary MAC, hostname
    2. load_station_id()      — check local station_id.json (persisted id)
    3. register_if_needed()   — POST /register → portal returns id → save
    4. send_heartbeat()       — POST /heartbeat every 5 min with versions
    5. start_heartbeat_thread() — daemon thread wiring the above together

All requests are signed with HMAC-SHA256(ROBOT_LICENSE_SECRET, canonical)
matching the portal verifier in services/portal/src/lib/stationAuth.ts.

Local persistence
-----------------
station_id.json lives next to config.py (repo root for the service) and is the
ONLY file required to survive across runs — everything else is re-derivable
from the OS. Shape:

    { "id": "<portal-returned cuid>",
      "serial": "<detected at first register>",
      "macAddress": "<detected>",
      "hostname": "<detected>",
      "registeredAt": "<ISO timestamp>" }

Rollout posture mirrors license.py: if ROBOT_LICENSE_SECRET is unset the
request is sent unsigned (portal soft-passes unless LICENSE_STRICT=true).
"""
from __future__ import annotations

import hmac
import hashlib
import json
import logging
import os
import platform
import socket
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import URLError

import config

logger = logging.getLogger("cobot_studio")

# station_id.json lives next to config.py so NSSM-wrapped and manual runs
# share the same file regardless of cwd.
STATION_ID_FILE = os.path.join(config.BASE_DIR, "station_id.json")

# Heartbeat cadence — matches the portal's expectation (see heartbeat/route.ts
# header comment: "every ~5 minutes"). Staleness threshold on the admin page
# is 6 minutes, so 5 gives one miss of headroom.
HEARTBEAT_INTERVAL_SEC = 5 * 60

# Network timeouts — short enough that a bad portal doesn't stall the robot.
REGISTER_TIMEOUT_SEC = 10
HEARTBEAT_TIMEOUT_SEC = 10


# ---------------------------------------------------------------------------
# Identity detection
# ---------------------------------------------------------------------------

def _detect_serial_windows() -> Optional[str]:
    """Read the BIOS/motherboard serial on Windows via wmic.

    wmic is deprecated in Win11 24H2+ but still works on all current deploy
    targets. If it fails we fall back to PowerShell CIM, then give up.
    """
    try:
        out = subprocess.check_output(
            ["wmic", "bios", "get", "serialnumber"],
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).decode("utf-8", errors="ignore")
        # Output shape: "SerialNumber\r\r\nXXXXXXX\r\r\n\r\r\n"
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        if len(lines) >= 2:
            value = lines[1].strip()
            if value and value.lower() not in ("to be filled by o.e.m.", "default string", "system serial number"):
                return value
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass

    # PowerShell fallback — Get-CimInstance works even where wmic is gone.
    try:
        out = subprocess.check_output(
            [
                "powershell.exe",
                "-NoProfile",
                "-Command",
                "(Get-CimInstance -ClassName Win32_BIOS).SerialNumber",
            ],
            stderr=subprocess.DEVNULL,
            timeout=8,
        ).decode("utf-8", errors="ignore").strip()
        if out and out.lower() not in ("to be filled by o.e.m.", "default string"):
            return out
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass

    return None


def _detect_serial_linux() -> Optional[str]:
    """Read /sys/class/dmi/id/product_serial on Linux (needs root for some boards)."""
    for path in ("/sys/class/dmi/id/product_serial", "/sys/class/dmi/id/board_serial"):
        try:
            with open(path, "r") as f:
                value = f.read().strip()
            if value and value.lower() not in ("none", "to be filled by o.e.m."):
                return value
        except (OSError, PermissionError):
            continue
    return None


def _detect_primary_mac() -> Optional[str]:
    """Return the primary NIC MAC in canonical lowercase colon form."""
    # uuid.getnode() returns the MAC of a single NIC as an int. It's not always
    # the "primary" one on multi-homed boxes, but it's stable across reboots
    # and good enough as a secondary identifier (serial is primary).
    try:
        node = uuid.getnode()
        # If getnode() couldn't find a hardware address it returns a random
        # 48-bit value with the multicast bit set. Detect that and bail.
        if (node >> 40) & 0x01:
            return None
        mac = ":".join(f"{(node >> (8 * i)) & 0xff:02x}" for i in reversed(range(6)))
        return mac
    except Exception:
        return None


def _detect_hostname() -> Optional[str]:
    try:
        return socket.gethostname() or None
    except Exception:
        return None


def detect_identity() -> dict:
    """Return {serial, macAddress, hostname} detected from the local OS."""
    system = platform.system()
    if system == "Windows":
        serial = _detect_serial_windows()
    elif system == "Linux":
        serial = _detect_serial_linux()
    else:
        serial = None

    if not serial:
        # Last-ditch: synthesise a stable pseudo-serial from hostname + MAC so
        # registration doesn't fail outright. Operator can edit later.
        host = _detect_hostname() or "unknown"
        mac = _detect_primary_mac() or "nomac"
        serial = f"AUTO-{host}-{mac.replace(':', '')}"
        logger.warning(f"[station_identity] Could not detect BIOS serial; using synthesised '{serial}'")

    return {
        "serial": serial,
        "macAddress": _detect_primary_mac(),
        "hostname": _detect_hostname(),
    }


# ---------------------------------------------------------------------------
# Local persistence (station_id.json)
# ---------------------------------------------------------------------------

def load_station_id() -> Optional[dict]:
    """Read station_id.json, or None if missing/corrupt."""
    if not os.path.isfile(STATION_ID_FILE):
        return None
    try:
        with open(STATION_ID_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("id"), str) and data["id"]:
            return data
    except (OSError, json.JSONDecodeError) as e:
        logger.warning(f"[station_identity] Failed to read {STATION_ID_FILE}: {e}")
    return None


def save_station_id(record: dict) -> None:
    try:
        with open(STATION_ID_FILE, "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2)
        logger.info(f"[station_identity] Saved station id to {STATION_ID_FILE}")
    except OSError as e:
        logger.error(f"[station_identity] Failed to save station id: {e}")


# ---------------------------------------------------------------------------
# HMAC signing — mirrors services/portal/src/lib/stationAuth.ts
# ---------------------------------------------------------------------------

def _sign(canonical: str) -> Optional[str]:
    """Return hex HMAC-SHA256 or None if no secret is configured."""
    secret = config.ROBOT_LICENSE_SECRET
    if not secret:
        return None
    return hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _now_iso() -> str:
    """UTC timestamp in ISO 8601 with 'Z' suffix, matching portal expectations."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _nonce() -> str:
    """Unique per-request nonce."""
    return uuid.uuid4().hex


def _post_json(url: str, body: dict, signature: Optional[str], timeout: int) -> Tuple[int, Optional[dict], Optional[str]]:
    """POST JSON with optional x-station-signature. Returns (status, json_or_None, err)."""
    try:
        data = json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if signature:
            headers["x-station-signature"] = signature
        req = Request(url, data=data, method="POST", headers=headers)
        with urlopen(req, timeout=timeout) as resp:
            status = resp.status
            raw = resp.read().decode("utf-8", errors="ignore")
            try:
                return status, json.loads(raw), None
            except json.JSONDecodeError:
                return status, None, f"non-JSON response: {raw[:200]}"
    except URLError as e:
        return 0, None, f"URLError: {e.reason}"
    except Exception as e:
        return 0, None, f"Exception: {e}"


# ---------------------------------------------------------------------------
# Register + heartbeat
# ---------------------------------------------------------------------------

def register(identity: dict) -> Optional[dict]:
    """POST /api/station-pcs/register. Returns the saved record or None on failure."""
    serial = identity["serial"]
    mac = identity.get("macAddress")
    hostname = identity.get("hostname")

    nonce = _nonce()
    timestamp = _now_iso()
    canonical = "|".join([
        "v1",
        "register",
        serial,
        mac if mac else "null",
        nonce,
        timestamp,
    ])
    signature = _sign(canonical)

    url = f"{config.PORTAL_URL.rstrip('/')}/api/station-pcs/register"
    body = {
        "serial": serial,
        "macAddress": mac,
        "hostname": hostname,
        "nonce": nonce,
        "timestamp": timestamp,
    }

    status, data, err = _post_json(url, body, signature, REGISTER_TIMEOUT_SEC)
    if err:
        logger.error(f"[station_identity] Register POST failed: {err}")
        return None
    if status != 200 or not data or "id" not in data:
        logger.error(f"[station_identity] Register returned HTTP {status}: {data}")
        return None

    record = {
        "id": data["id"],
        "serial": data.get("serial", serial),
        "macAddress": data.get("macAddress", mac),
        "hostname": data.get("hostname", hostname),
        "registeredAt": _now_iso(),
    }
    save_station_id(record)
    approved = data.get("approved", False)
    logger.info(
        f"[station_identity] Registered with portal: id={record['id']} "
        f"approved={approved} signed={data.get('signed', False)}"
    )
    return record


def register_if_needed() -> Optional[dict]:
    """Return the local station record, registering with the portal if missing."""
    existing = load_station_id()
    if existing:
        logger.info(f"[station_identity] Loaded existing station id {existing['id']}")
        return existing

    identity = detect_identity()
    logger.info(
        f"[station_identity] Detected identity: serial={identity['serial']} "
        f"mac={identity['macAddress']} hostname={identity['hostname']}"
    )
    return register(identity)


def _get_versions() -> Tuple[Optional[str], Optional[str]]:
    """Return (robotVersion, relfarVersion) strings to report with the heartbeat.

    Keep the lookup defensive — the relfar service may not be installed and we
    don't want a missing dependency to kill the heartbeat.
    """
    robot_version = None
    try:
        # Lazy import so an unrelated import error here can't break startup.
        from app import __version__ as _v  # type: ignore
        robot_version = str(_v)
    except Exception:
        robot_version = os.getenv("ROBOT_VERSION")

    relfar_version = os.getenv("RELFAR_VERSION")
    return robot_version, relfar_version


def send_heartbeat(pc_id: str) -> bool:
    """POST /api/station-pcs/{id}/heartbeat. Returns True on success."""
    nonce = _nonce()
    timestamp = _now_iso()
    canonical = "|".join(["v1", "heartbeat", pc_id, nonce, timestamp])
    signature = _sign(canonical)

    robot_version, relfar_version = _get_versions()
    url = f"{config.PORTAL_URL.rstrip('/')}/api/station-pcs/{pc_id}/heartbeat"
    body = {
        "robotVersion": robot_version,
        "relfarVersion": relfar_version,
        "nonce": nonce,
        "timestamp": timestamp,
    }

    status, data, err = _post_json(url, body, signature, HEARTBEAT_TIMEOUT_SEC)
    if err:
        logger.warning(f"[station_identity] Heartbeat failed: {err}")
        return False
    if status != 200:
        logger.warning(f"[station_identity] Heartbeat HTTP {status}: {data}")
        # 404 means the portal no longer knows this PC (e.g. hard-deleted).
        # Clear the local file so the next boot re-registers cleanly.
        if status == 404:
            try:
                os.remove(STATION_ID_FILE)
                logger.warning(f"[station_identity] Portal returned 404; cleared {STATION_ID_FILE}")
            except OSError:
                pass
        return False

    logger.debug(f"[station_identity] Heartbeat ok: status={data.get('status')} approved={data.get('approved')}")
    return True


# ---------------------------------------------------------------------------
# Background thread
# ---------------------------------------------------------------------------

def start_heartbeat_thread() -> None:
    """Register (if needed) and spawn a daemon thread that heartbeats forever.

    Safe to call from @app.on_event("startup"). Failures inside the thread are
    logged but never raise — the robot must keep running even if the portal
    is unreachable.
    """
    def _run():
        # First action: make sure we have a portal id.
        record = register_if_needed()

        # If registration failed, keep retrying every heartbeat interval —
        # the portal may come back online later.
        while record is None:
            time.sleep(HEARTBEAT_INTERVAL_SEC)
            try:
                record = register_if_needed()
            except Exception as e:
                logger.error(f"[station_identity] Registration retry crashed: {e}", exc_info=True)

        pc_id = record["id"]

        # Send one heartbeat immediately so the portal shows us as online fast.
        try:
            send_heartbeat(pc_id)
        except Exception as e:
            logger.error(f"[station_identity] Initial heartbeat crashed: {e}", exc_info=True)

        while True:
            time.sleep(HEARTBEAT_INTERVAL_SEC)
            try:
                # If station_id.json got wiped (e.g. 404 cleanup above),
                # re-register before heartbeating again.
                current = load_station_id()
                if not current:
                    current = register_if_needed()
                    if current:
                        pc_id = current["id"]
                    else:
                        continue
                send_heartbeat(pc_id)
            except Exception as e:
                logger.error(f"[station_identity] Heartbeat loop crashed: {e}", exc_info=True)

    thread = threading.Thread(target=_run, daemon=True, name="station-heartbeat")
    thread.start()
    logger.info(f"[station_identity] Heartbeat thread started (interval={HEARTBEAT_INTERVAL_SEC}s)")
