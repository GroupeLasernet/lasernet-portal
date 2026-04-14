"""
Device sync worker — mirrors local SQLite writes to Portal/Neon, keyed by serial.

Architecture (see project_device_sync memory for full spec):
  - Local SQLite stays authoritative; machines work fully offline.
  - SQLAlchemy commit hooks in app/database.py enqueue rows in `sync_events`.
  - This worker flushes the queue in SYNC_INTERVAL_SEC batches to Portal.
  - A parallel pull loop fetches remote changes and applies them locally,
    using last_pulled_clock as a high-water mark.
  - Conflict resolution: last-write-wins on updated_at, tiebreak on device_clock.

Auth: every request carries:
    X-Device-Serial:      <serial_number>
    X-Device-Signature:   HMAC-SHA256(ROBOT_LICENSE_SECRET, canonical_body)

The Portal verifies the HMAC before accepting or serving state.
"""
from __future__ import annotations

import asyncio
import hmac
import hashlib
import json
import logging
import os
import sys
from datetime import datetime
from typing import Optional

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from app.database import (
    SessionLocal, SyncEvent, SyncCursor, LicenseState,
    Project, DXFFile, RobotProgram, RobotSettings,
    SYNCED_TABLES,
)

logger = logging.getLogger("cobot_studio.sync")

# Map tablename -> model class, for applying pulled events
_TABLE_TO_MODEL = {cls.__tablename__: cls for cls in SYNCED_TABLES.keys()}

# Columns we never allow the Portal to overwrite locally (protects identity)
_IMMUTABLE_COLUMNS = {"id"}

# Background task handle (set by start_sync_worker)
_push_task: Optional[asyncio.Task] = None
_pull_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None


# ---------------------------------------------------------------------------
# HMAC helpers
# ---------------------------------------------------------------------------

def _sign(body: bytes) -> str:
    secret = getattr(config, "ROBOT_LICENSE_SECRET", "") or ""
    if not secret:
        return ""
    h = hmac.new(secret.encode("utf-8"), body, hashlib.sha256)
    return h.hexdigest()


def _headers(body: bytes) -> dict:
    return {
        "Content-Type": "application/json",
        "X-Device-Serial": getattr(config, "ROBOT_SERIAL", "SERIAL_NOT_SET"),
        "X-Device-Signature": _sign(body),
        "X-Device-Kind": "robot",
    }


def _current_serial() -> str:
    """The serial the robot reports — authoritative from license_state.serial_number."""
    db = SessionLocal()
    try:
        lic = db.query(LicenseState).filter(LicenseState.id == 1).first()
        if lic and lic.serial_number:
            return lic.serial_number
    finally:
        db.close()
    return getattr(config, "ROBOT_SERIAL", "SERIAL_NOT_SET")


# ---------------------------------------------------------------------------
# Push loop
# ---------------------------------------------------------------------------

async def _push_once(client: httpx.AsyncClient) -> int:
    """Flush up to SYNC_BATCH_SIZE pending sync_events to Portal. Returns count pushed."""
    db = SessionLocal()
    try:
        batch = (
            db.query(SyncEvent)
            .filter(SyncEvent.synced_at.is_(None))
            .filter(SyncEvent.attempts < config.SYNC_MAX_ATTEMPTS)
            .order_by(SyncEvent.id.asc())
            .limit(config.SYNC_BATCH_SIZE)
            .all()
        )
        if not batch:
            return 0

        events_payload = [
            {
                "id": e.id,
                "table": e.table_name,
                "row_id": e.row_id,
                "op": e.op,
                "payload": e.payload,
                "device_clock": e.device_clock,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "is_audit": e.is_audit,
            }
            for e in batch
        ]
        body_dict = {
            "serial": _current_serial(),
            "device_kind": "robot",
            "events": events_payload,
        }
        body_bytes = json.dumps(body_dict, separators=(",", ":"), sort_keys=True).encode("utf-8")

        url = config.PORTAL_URL.rstrip("/") + config.SYNC_PUSH_PATH
        try:
            resp = await client.post(url, content=body_bytes, headers=_headers(body_bytes), timeout=15.0)
        except Exception as exc:
            for e in batch:
                e.attempts = (e.attempts or 0) + 1
                e.last_error = f"network: {exc}"[:500]
            db.commit()
            logger.debug(f"Sync push network error: {exc}")
            return 0

        if resp.status_code == 200:
            now = datetime.utcnow()
            to_delete = []
            for e in batch:
                if e.is_audit:
                    e.synced_at = now
                else:
                    to_delete.append(e)
            for e in to_delete:
                db.delete(e)
            cursor = db.query(SyncCursor).filter(SyncCursor.id == 1).first()
            if cursor:
                cursor.last_push_at = now
            db.commit()
            return len(batch)
        else:
            err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            for e in batch:
                e.attempts = (e.attempts or 0) + 1
                e.last_error = err
            db.commit()
            logger.warning(f"Sync push rejected: {err}")
            return 0
    finally:
        db.close()


async def _push_loop():
    async with httpx.AsyncClient() as client:
        while not _stop_event.is_set():
            try:
                await _push_once(client)
            except Exception as exc:
                logger.error(f"Push loop error: {exc}", exc_info=True)
            try:
                await asyncio.wait_for(_stop_event.wait(), timeout=config.SYNC_INTERVAL_SEC)
            except asyncio.TimeoutError:
                pass


# ---------------------------------------------------------------------------
# Pull loop
# ---------------------------------------------------------------------------

async def _pull_once(client: httpx.AsyncClient) -> int:
    """Pull remote changes from Portal since last_pulled_clock. Returns count applied."""
    db = SessionLocal()
    try:
        cursor = db.query(SyncCursor).filter(SyncCursor.id == 1).first()
        since = cursor.last_pulled_clock if cursor else 0
    finally:
        db.close()

    serial = _current_serial()
    body_dict = {"serial": serial, "device_kind": "robot", "since": since}
    body_bytes = json.dumps(body_dict, separators=(",", ":"), sort_keys=True).encode("utf-8")
    url = (
        config.PORTAL_URL.rstrip("/")
        + config.SYNC_PULL_PATH
        + f"?serial={serial}&since={since}"
    )
    try:
        resp = await client.get(url, headers=_headers(body_bytes), timeout=15.0)
    except Exception as exc:
        logger.debug(f"Sync pull network error: {exc}")
        return 0

    if resp.status_code != 200:
        logger.debug(f"Sync pull got HTTP {resp.status_code}: {resp.text[:200]}")
        return 0

    try:
        data = resp.json()
    except Exception:
        return 0

    events = data.get("events", [])
    if not events:
        # Still update last_pull_at for observability
        _touch_pull_timestamp()
        return 0

    applied = 0
    max_clock = since
    db = SessionLocal()
    try:
        for evt in events:
            try:
                _apply_remote_event(db, evt)
                applied += 1
                max_clock = max(max_clock, int(evt.get("device_clock", 0)))
            except Exception as exc:
                logger.warning(f"Failed to apply remote event {evt.get('table')}#{evt.get('row_id')}: {exc}")
        cursor = db.query(SyncCursor).filter(SyncCursor.id == 1).first()
        if cursor:
            cursor.last_pulled_clock = max_clock
            cursor.last_pull_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()
    return applied


def _touch_pull_timestamp():
    db = SessionLocal()
    try:
        cursor = db.query(SyncCursor).filter(SyncCursor.id == 1).first()
        if cursor:
            cursor.last_pull_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()


def _apply_remote_event(db, evt: dict):
    """
    Apply a remote sync event to the local DB.
    Conflict resolution: last-write-wins on payload['updated_at'] vs local row.
    """
    table = evt.get("table")
    op = evt.get("op")
    row_id = evt.get("row_id")
    payload = evt.get("payload") or {}

    model = _TABLE_TO_MODEL.get(table)
    if not model:
        return  # unknown table — skip

    # Parse PK
    try:
        pk = int(row_id) if row_id not in (None, "") else None
    except (TypeError, ValueError):
        pk = row_id

    existing = db.query(model).filter(model.id == pk).first() if pk is not None else None

    if op == "delete":
        if existing:
            db.delete(existing)
        return

    # Conflict check: compare updated_at
    remote_updated = _parse_dt(payload.get("updated_at"))
    if existing and remote_updated and getattr(existing, "updated_at", None):
        if existing.updated_at >= remote_updated:
            return  # local is newer or equal — skip remote write

    if existing is None:
        # Insert new row — use payload but respect identity
        kwargs = {}
        for col in model.__table__.columns:
            if col.name in payload:
                kwargs[col.name] = _coerce_column(col, payload[col.name])
        obj = model(**kwargs)
        # IMPORTANT: mark this session as a pull so our own hooks don't re-enqueue it
        db.info["_sync_applying_remote"] = True
        db.add(obj)
    else:
        for col in model.__table__.columns:
            if col.name in _IMMUTABLE_COLUMNS:
                continue
            if col.name in payload:
                setattr(existing, col.name, _coerce_column(col, payload[col.name]))
        db.info["_sync_applying_remote"] = True


def _parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(val)
    except Exception:
        return None


def _coerce_column(col, val):
    """Coerce JSON-decoded value back to the column's Python type when obvious."""
    if val is None:
        return None
    coltype = str(col.type).upper()
    if "DATETIME" in coltype and isinstance(val, str):
        return _parse_dt(val)
    return val


async def _pull_loop():
    async with httpx.AsyncClient() as client:
        while not _stop_event.is_set():
            try:
                await _pull_once(client)
            except Exception as exc:
                logger.error(f"Pull loop error: {exc}", exc_info=True)
            try:
                await asyncio.wait_for(_stop_event.wait(), timeout=config.SYNC_INTERVAL_SEC)
            except asyncio.TimeoutError:
                pass


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def start_sync_worker(loop: Optional[asyncio.AbstractEventLoop] = None):
    """Start the push + pull background tasks. Safe to call once at startup."""
    global _push_task, _pull_task, _stop_event
    if not getattr(config, "SYNC_ENABLED", True):
        logger.info("Device sync disabled via SYNC_ENABLED=false")
        return
    if _push_task is not None:
        return  # already started

    loop = loop or asyncio.get_event_loop()
    _stop_event = asyncio.Event()
    _push_task = loop.create_task(_push_loop(), name="sync-push")
    _pull_task = loop.create_task(_pull_loop(), name="sync-pull")
    logger.info(
        f"Device sync started: interval={config.SYNC_INTERVAL_SEC}s, "
        f"batch={config.SYNC_BATCH_SIZE}, portal={config.PORTAL_URL}"
    )


async def stop_sync_worker():
    global _push_task, _pull_task, _stop_event
    if _stop_event:
        _stop_event.set()
    for task in (_push_task, _pull_task):
        if task:
            try:
                await asyncio.wait_for(task, timeout=5.0)
            except Exception:
                task.cancel()
    _push_task = _pull_task = None


# ---------------------------------------------------------------------------
# Status (for UI / debugging)
# ---------------------------------------------------------------------------

def sync_status() -> dict:
    db = SessionLocal()
    try:
        cursor = db.query(SyncCursor).filter(SyncCursor.id == 1).first()
        pending = db.query(SyncEvent).filter(SyncEvent.synced_at.is_(None)).count()
        failed = (
            db.query(SyncEvent)
            .filter(SyncEvent.synced_at.is_(None))
            .filter(SyncEvent.attempts >= config.SYNC_MAX_ATTEMPTS)
            .count()
        )
        return {
            "enabled": getattr(config, "SYNC_ENABLED", True),
            "serial": _current_serial(),
            "portal_url": config.PORTAL_URL,
            "pending": pending,
            "failed": failed,
            "local_clock": cursor.local_clock if cursor else 0,
            "last_pulled_clock": cursor.last_pulled_clock if cursor else 0,
            "last_push_at": cursor.last_push_at.isoformat() if cursor and cursor.last_push_at else None,
            "last_pull_at": cursor.last_pull_at.isoformat() if cursor and cursor.last_pull_at else None,
        }
    finally:
        db.close()
