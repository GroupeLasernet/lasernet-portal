"""
License synchronization and enforcement for the robot.

Handles:
  - Syncing license state from the portal API
  - Applying state updates to the local database
  - Checking operational validity (considering grace periods)
  - Background heartbeat thread for periodic syncs
"""
import hmac
import hashlib
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError
import json

from sqlalchemy.orm import Session
from app.database import SessionLocal, LicenseState
from config import ROBOT_LICENSE_SECRET, LICENSE_STRICT

logger = logging.getLogger("cobot_studio")


def _verify_portal_signature(serial: str, data: dict) -> Tuple[bool, str]:
    """
    Verify the HMAC-SHA256 signature on a portal license response.

    The portal signs responses with ROBOT_LICENSE_SECRET over:
        "v1|<serial>|<licenseMode>|<expiresAtISO or 'null'>|<killSwitch 0/1>|<signedAtISO>"

    Returns (ok, reason). If the env secret is empty, OR the response has no
    signature, this is a soft pass under LICENSE_STRICT=false (rollout-friendly)
    and a hard fail under LICENSE_STRICT=true.
    """
    signature = data.get("signature")
    signed_at = data.get("signedAt")

    if not ROBOT_LICENSE_SECRET:
        return (not LICENSE_STRICT, "ROBOT_LICENSE_SECRET not set")
    if not signature or not signed_at:
        return (not LICENSE_STRICT, "portal response is unsigned")

    canonical = "|".join([
        "v1",
        serial,
        str(data.get("licenseMode", "")),
        str(data.get("expiresAt") or "null"),
        "1" if data.get("killSwitchActive") else "0",
        signed_at,
    ])
    expected = hmac.new(
        ROBOT_LICENSE_SECRET.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        return False, "signature mismatch"
    return True, ""


def sync_from_portal(portal_base_url: str, serial: str, timeout: int = 5) -> Tuple[bool, Optional[dict], Optional[str]]:
    """
    Fetch license state from portal API and verify its HMAC signature.

    GET {portal_base_url}/api/machines/license/{serial}

    Expected response (on 200):
    {
        "licenseMode": "sold" | "rented" | "killed",
        "expiresAt": "2026-05-13T00:00:00Z" | null,
        "killSwitchActive": bool,
        "signedAt": "2026-04-14T12:34:56.789Z",  # present when portal has ROBOT_LICENSE_SECRET
        "signature": "<hex-hmac-sha256>"
    }

    Returns: (success: bool, state_dict_or_None, error_message_or_None)
    """
    url = f"{portal_base_url}/api/machines/license/{serial}"
    try:
        req = Request(url, method="GET")
        with urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                body = response.read().decode("utf-8")
                data = json.loads(body)
                ok, reason = _verify_portal_signature(serial, data)
                if not ok:
                    return False, None, f"signature verification failed: {reason}"
                if reason:
                    logger.warning(f"License response soft-pass: {reason}")
                return True, data, None
            else:
                return False, None, f"HTTP {response.status}"
    except URLError as e:
        return False, None, f"URLError: {e.reason}"
    except json.JSONDecodeError as e:
        return False, None, f"JSON decode error: {e}"
    except Exception as e:
        return False, None, f"Exception: {e}"


def apply_portal_state(db_session: Session, state_dict: dict) -> None:
    """
    Update local LicenseState row from portal response.

    state_dict format:
    {
        "licenseMode": "sold" | "rented" | "killed",
        "expiresAt": "2026-05-13T00:00:00Z" | null,
        "killSwitchActive": bool
    }
    """
    lic = db_session.query(LicenseState).filter(LicenseState.id == 1).first()
    if not lic:
        # Should not happen, but init if missing
        lic = LicenseState(id=1, serial_number="", license_mode="unlicensed")
        db_session.add(lic)

    lic.license_mode = state_dict.get("licenseMode", "unlicensed")
    lic.kill_switch_active = state_dict.get("killSwitchActive", False)

    expires_at_str = state_dict.get("expiresAt")
    if expires_at_str:
        try:
            # Parse ISO 8601, removing 'Z' suffix if present
            lic.expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            lic.expires_at = None
    else:
        lic.expires_at = None

    lic.last_portal_check_at = datetime.utcnow()
    lic.last_portal_ok_at = datetime.utcnow()
    lic.state_hmac = lic.compute_hmac()
    db_session.commit()
    logger.info(f"Applied portal license state: mode={lic.license_mode}, killed={lic.kill_switch_active}, expires={lic.expires_at}")


def get_local_state(db_session: Session) -> Optional[LicenseState]:
    """Read and verify the local license state."""
    lic = db_session.query(LicenseState).filter(LicenseState.id == 1).first()
    return lic


def is_operational(db_session: Session, grace_period_hours: int = 72) -> Tuple[bool, str]:
    """
    Check if the robot is allowed to operate.

    Combines validity + grace period logic:
      - If kill_switch_active or expired or unlicensed: check grace period
      - Grace period: if last_portal_ok_at is within grace_period_hours, allow operation
      - After grace period expires without portal contact: enforce expiration

    Returns: (allowed: bool, reason: str)
    """
    lic = get_local_state(db_session)
    if not lic:
        return False, "No license state found"

    valid, reason = lic.is_valid_now()
    if valid:
        return True, ""

    # State is invalid. Check grace period.
    now = datetime.utcnow()
    if lic.last_portal_ok_at:
        grace_expiry = lic.last_portal_ok_at + timedelta(hours=grace_period_hours)
        if now < grace_expiry:
            hours_left = (grace_expiry - now).total_seconds() / 3600
            return True, f"Operating under grace period ({hours_left:.1f}h remaining); last portal contact: {lic.last_portal_ok_at}"

    return False, f"License invalid: {reason}; grace period exhausted (last portal: {lic.last_portal_ok_at})"


def start_background_heartbeat(app, portal_url: str, serial: str, interval_minutes: int = 15) -> None:
    """
    Start a daemon thread that syncs license state every interval_minutes.

    Logs errors but does not crash on sync failure.
    """
    def _heartbeat():
        while True:
            try:
                time.sleep(interval_minutes * 60)
                logger.debug(f"License heartbeat: syncing with portal...")
                ok, state_dict, err = sync_from_portal(portal_url, serial)
                if ok and state_dict:
                    db = SessionLocal()
                    try:
                        apply_portal_state(db, state_dict)
                    finally:
                        db.close()
                else:
                    logger.warning(f"License sync failed: {err}")
                    # Update last_portal_check_at even on failure
                    db = SessionLocal()
                    try:
                        lic = get_local_state(db)
                        if lic:
                            lic.last_portal_check_at = datetime.utcnow()
                            db.commit()
                    finally:
                        db.close()
            except Exception as e:
                logger.error(f"Heartbeat exception: {e}", exc_info=True)

    thread = threading.Thread(target=_heartbeat, daemon=True)
    thread.start()
    logger.info(f"License heartbeat thread started (interval={interval_minutes}min)")
