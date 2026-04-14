"""
Database engine, session, and models for Elfin Cobot Studio.
"""
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Text,
    DateTime, Boolean, ForeignKey, JSON, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

import sys, os
import hmac
import hashlib
import json
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATABASE_URL, ROBOT_LICENSE_SECRET, LICENSE_STRICT

engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Project(Base):
    """A project groups one or more DXF files and their generated programs."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    dxf_files = relationship("DXFFile", back_populates="project", cascade="all, delete-orphan")
    programs = relationship("RobotProgram", back_populates="project", cascade="all, delete-orphan")


class DXFFile(Base):
    """An uploaded DXF file with its parsed path data."""
    __tablename__ = "dxf_files"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(512), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Parsed geometry stored as JSON list of paths
    # Each path = {"type": "line"|"arc"|"circle"|..., "points": [[x,y], ...]}
    parsed_paths = Column(JSON, default=list)

    # Bounding box of the DXF content
    bbox_min_x = Column(Float, default=0.0)
    bbox_min_y = Column(Float, default=0.0)
    bbox_max_x = Column(Float, default=0.0)
    bbox_max_y = Column(Float, default=0.0)

    project = relationship("Project", back_populates="dxf_files")


class RobotProgram(Base):
    """A sequence of robot waypoints generated from DXF paths."""
    __tablename__ = "robot_programs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Robot settings used to generate this program
    speed = Column(Float, default=50.0)
    acceleration = Column(Float, default=100.0)
    blend_radius = Column(Float, default=0.5)

    # Work-plane transform
    origin_x = Column(Float, default=400.0)
    origin_y = Column(Float, default=0.0)
    origin_z = Column(Float, default=200.0)
    orientation_rx = Column(Float, default=180.0)
    orientation_ry = Column(Float, default=0.0)
    orientation_rz = Column(Float, default=0.0)
    approach_height = Column(Float, default=20.0)

    # Waypoints as JSON: [{"x","y","z","rx","ry","rz","type":"move"|"trace"}, ...]
    waypoints = Column(JSON, default=list)

    # Execution status
    status = Column(String(50), default="ready")  # ready | running | paused | done | error

    project = relationship("Project", back_populates="programs")


class RobotSettings(Base):
    """Persisted robot connection and motion settings (singleton-ish)."""
    __tablename__ = "robot_settings"

    id = Column(Integer, primary_key=True, index=True)
    robot_ip = Column(String(50), default="192.168.0.1")
    robot_port = Column(Integer, default=10003)
    speed = Column(Float, default=50.0)
    acceleration = Column(Float, default=100.0)
    blend_radius = Column(Float, default=0.5)
    origin_x = Column(Float, default=400.0)
    origin_y = Column(Float, default=0.0)
    origin_z = Column(Float, default=200.0)
    orientation_rx = Column(Float, default=180.0)
    orientation_ry = Column(Float, default=0.0)
    orientation_rz = Column(Float, default=0.0)
    approach_height = Column(Float, default=20.0)
    # Travel / folded position joint angles (JSON list of 6 floats, degrees)
    travel_joints = Column(JSON, default=lambda: [0.0, -90.0, 135.0, 0.0, 45.0, 0.0])
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SyncEvent(Base):
    """
    Queue of local mutations pending push to Portal.

    Every write to a synced table (projects, dxf_files, robot_programs,
    robot_settings, license_state) inserts one row here via the SQLAlchemy
    after_commit hook registered at the bottom of this module. The background
    sync worker flushes these in 10s batches. Retention policy:
      - snapshot-only tables: row is deleted after successful push.
      - audit tables (license_state, program runs): row is kept and marked
        with synced_at; Portal persists full history.
    """
    __tablename__ = "sync_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    table_name = Column(String(100), nullable=False, index=True)
    row_id = Column(String(100), nullable=False)
    op = Column(String(20), nullable=False)               # insert | update | delete
    payload = Column(JSON, default=dict)                  # full row snapshot
    device_clock = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    synced_at = Column(DateTime, nullable=True, index=True)
    attempts = Column(Integer, default=0)
    last_error = Column(Text, default="")
    is_audit = Column(Boolean, default=False)


class SyncCursor(Base):
    """
    Singleton (id=1) tracking sync progress for this device.

    - local_clock: monotonic counter stamped on every outgoing sync_event
    - last_pulled_clock: highest remote device_clock we've already applied
    - last_pull_at / last_push_at: for observability and UI health display
    """
    __tablename__ = "sync_cursor"

    id = Column(Integer, primary_key=True, index=True)
    local_clock = Column(Integer, default=0)
    last_pulled_clock = Column(Integer, default=0)
    last_pull_at = Column(DateTime, nullable=True)
    last_push_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Tables whose writes should be mirrored to the Portal.
# Key = SQLAlchemy model class; Value = True if full history (audit), False if snapshot-only.
SYNCED_TABLES: dict = {}  # populated after all classes are declared


class LicenseState(Base):
    """Persisted license state (singleton: id=1)."""
    __tablename__ = "license_state"

    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String(255), nullable=False)
    license_mode = Column(String(50), default="unlicensed")  # unlicensed, sold, rented, killed
    expires_at = Column(DateTime, nullable=True)
    kill_switch_active = Column(Boolean, default=False)
    last_portal_check_at = Column(DateTime, nullable=True)
    last_portal_ok_at = Column(DateTime, nullable=True)
    state_hmac = Column(String(255), nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def compute_hmac(self) -> str:
        """Compute HMAC-SHA256 of the license state."""
        if not ROBOT_LICENSE_SECRET:
            return ""
        state_dict = {
            "serial_number": self.serial_number,
            "license_mode": self.license_mode,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "kill_switch_active": self.kill_switch_active,
        }
        state_json = json.dumps(state_dict, sort_keys=True)
        h = hmac.new(
            ROBOT_LICENSE_SECRET.encode("utf-8"),
            state_json.encode("utf-8"),
            hashlib.sha256
        )
        return h.hexdigest()

    def verify(self) -> bool:
        """Verify state_hmac matches computed HMAC."""
        if not ROBOT_LICENSE_SECRET:
            return True
        computed = self.compute_hmac()
        return hmac.compare_digest(computed, self.state_hmac)

    def is_valid_now(self) -> tuple[bool, str]:
        """
        Return (is_valid, reason_if_invalid).
        Valid if: not killed AND not expired AND (mode=='sold' or (mode=='rented' and expires_at > now)) AND hmac is valid.
        """
        if self.kill_switch_active:
            return False, "kill_switch_active"

        if not self.verify():
            if LICENSE_STRICT:
                return False, "hmac_mismatch"
            # In permissive mode, log warning but allow
            import logging
            logging.getLogger("cobot_studio").warning("License HMAC mismatch but operating in permissive mode")

        now = datetime.utcnow()
        if self.license_mode == "sold":
            return True, ""

        if self.license_mode == "rented":
            if self.expires_at is None or self.expires_at <= now:
                return False, "license_expired"
            return True, ""

        if self.license_mode == "unlicensed":
            return False, "license_unlicensed"

        return False, f"unknown_mode:{self.license_mode}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def init_db():
    """Create all tables and apply lightweight column migrations."""
    Base.metadata.create_all(bind=engine)
    # Lightweight migration: add travel_joints column to robot_settings if missing
    from sqlalchemy import text
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(robot_settings)"))]
        if "travel_joints" not in cols:
            conn.execute(text("ALTER TABLE robot_settings ADD COLUMN travel_joints JSON"))

    # Ensure sync_cursor singleton row exists
    db = SessionLocal()
    try:
        if not db.query(SyncCursor).filter(SyncCursor.id == 1).first():
            db.add(SyncCursor(id=1, local_clock=0, last_pulled_clock=0))
            db.commit()
    finally:
        db.close()


def get_db():
    """FastAPI dependency – yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Sync event hooks
# ---------------------------------------------------------------------------
# After each Session commits, mirror any writes to synced tables into the
# sync_events queue. We do the enqueue in a FRESH session so we never recurse
# into our own hooks, and so a failure to enqueue cannot roll back the parent
# commit (sync is best-effort; local persistence is authoritative).

_sync_logger = logging.getLogger("cobot_studio.sync")


def _model_to_snapshot(obj) -> dict:
    """Serialize a mapped SQLAlchemy instance to a JSON-safe dict."""
    out = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name, None)
        if isinstance(val, datetime):
            val = val.isoformat()
        out[col.name] = val
    return out


def _pending_sync_events(session):
    """Collect (model, op, payload) tuples from a flushed session."""
    pending = []
    for obj in session.new:
        cls = type(obj)
        if cls in SYNCED_TABLES:
            pending.append((cls, "insert", _model_to_snapshot(obj), getattr(obj, "id", None)))
    for obj in session.dirty:
        cls = type(obj)
        if cls in SYNCED_TABLES and session.is_modified(obj, include_collections=False):
            pending.append((cls, "update", _model_to_snapshot(obj), getattr(obj, "id", None)))
    for obj in session.deleted:
        cls = type(obj)
        if cls in SYNCED_TABLES:
            pending.append((cls, "delete", _model_to_snapshot(obj), getattr(obj, "id", None)))
    return pending


@event.listens_for(SessionLocal, "before_flush")
def _collect_sync_events(session, flush_context, instances):
    """Capture pending sync events BEFORE flush (so session.new/dirty/deleted are populated).

    Writes performed by the sync pull loop set session.info['_sync_applying_remote']
    so they are NOT re-enqueued for push (which would create an infinite ping-pong
    between robot and Portal).
    """
    if session.info.get("_sync_applying_remote"):
        return
    pending = _pending_sync_events(session)
    if pending:
        session.info.setdefault("_pending_sync", []).extend(pending)


@event.listens_for(SessionLocal, "after_commit")
def _enqueue_sync_events(session):
    """Write stashed sync events to the sync_events queue in a fresh session."""
    pending = session.info.pop("_pending_sync", None)
    if not pending:
        return
    try:
        queue_db = SessionLocal()
        try:
            cursor = queue_db.query(SyncCursor).filter(SyncCursor.id == 1).first()
            if not cursor:
                cursor = SyncCursor(id=1, local_clock=0, last_pulled_clock=0)
                queue_db.add(cursor)
                queue_db.flush()
            for cls, op, payload, row_id in pending:
                cursor.local_clock = (cursor.local_clock or 0) + 1
                is_audit = SYNCED_TABLES.get(cls, False)
                queue_db.add(SyncEvent(
                    table_name=cls.__tablename__,
                    row_id=str(row_id) if row_id is not None else "",
                    op=op,
                    payload=payload,
                    device_clock=cursor.local_clock,
                    is_audit=is_audit,
                ))
            queue_db.commit()
        finally:
            queue_db.close()
    except Exception as e:
        # Never let sync queueing break the app — log and move on
        _sync_logger.error(f"Failed to enqueue sync events: {e}", exc_info=True)


@event.listens_for(SessionLocal, "after_rollback")
def _drop_sync_events(session):
    """Discard stashed events on rollback."""
    session.info.pop("_pending_sync", None)


# Register which tables sync, and whether they're audit (keep history) or snapshot.
# Done at module bottom so all classes are defined.
SYNCED_TABLES.update({
    Project: False,          # snapshot
    DXFFile: False,          # snapshot
    RobotProgram: False,     # snapshot
    RobotSettings: False,    # snapshot (singleton)
    LicenseState: True,      # audit — keep full history of license changes
})
