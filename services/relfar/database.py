"""
Relfar - Database engine, session, and models for laser controller persistence.
SQLite-based persistence for controller settings, laser presets, scan results, and register snapshots.
"""

import os
import json
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, event
)
from sqlalchemy.orm import declarative_base, sessionmaker

# Ensure data directory exists
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# Database URL - SQLite file in data/ folder
DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'relfar.db')}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ControllerSettings(Base):
    """
    Singleton controller connection settings.
    Stores persistent Modbus configuration across restarts.
    One row, id=1.
    """
    __tablename__ = "controller_settings"

    id = Column(Integer, primary_key=True, index=True)
    port = Column(String(50), default='COM5')
    baud_rate = Column(Integer, nullable=True)
    parity = Column(String(10), default='N')
    slave_id = Column(Integer, default=1)
    rs485_mode = Column(String(50), default='normal')
    connection_settings_json = Column(Text, nullable=True)  # Serialized dict for extended metadata
    last_connected_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LaserPreset(Base):
    """
    Laser operation preset — register values and connection parameters.
    Syncs with portal's StationLaserPreset shape.
    """
    __tablename__ = "laser_presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    # JSON map of register_address -> value
    registers_json = Column(Text, default='{}')
    port = Column(String(50), nullable=True)
    baud_rate = Column(Integer, nullable=True)
    parity = Column(String(10), nullable=True)
    slave_id = Column(Integer, nullable=True)
    rs485_mode = Column(String(50), nullable=True)
    status = Column(String(50), default='development')  # development | production | archived
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255), nullable=True)


class ScanResult(Base):
    """
    Stores results from full_scan, BLE scan, probe scan, or passive listen.
    Replaces ad-hoc *_results.json files in filesystem.
    """
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True)
    scan_type = Column(String(50))  # 'full', 'ble', 'probe', 'listen', etc.
    result_json = Column(Text)  # Full scan result as JSON
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class StateLog(Base):
    """
    Lightweight rolling log of controller state snapshots.
    Stores point-in-time captures of the full controller_state dict.
    Useful for debugging and historical analysis.
    """
    __tablename__ = "state_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    data_json = Column(Text)  # JSON snapshot of controller_state
    source = Column(String(50), default='relfar')


class RegisterSnapshot(Base):
    """
    Latest successful Modbus register read snapshot.
    Lightweight record of the last known register values;
    in-memory controller_state['registers'] serves as hot cache.
    """
    __tablename__ = "register_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    registers_json = Column(Text)  # JSON map of register_address -> value


# ---------------------------------------------------------------------------
# Initialization & Helpers
# ---------------------------------------------------------------------------

def init_db():
    """
    Create all tables and seed the singleton ControllerSettings row if missing.
    Call this at Flask startup.
    """
    Base.metadata.create_all(bind=engine)

    # Ensure singleton ControllerSettings row exists
    session = SessionLocal()
    try:
        existing = session.query(ControllerSettings).filter_by(id=1).first()
        if not existing:
            default_settings = ControllerSettings(
                id=1,
                port='COM5',
                baud_rate=None,
                parity='N',
                slave_id=1,
                rs485_mode='normal',
                connection_settings_json=None,
                last_connected_at=None
            )
            session.add(default_settings)
            session.commit()
    finally:
        session.close()


def get_db():
    """FastAPI/dependency-injection style DB session getter."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def upsert_controller_settings(session, **kwargs):
    """
    Upsert the singleton ControllerSettings (id=1) with the given fields.
    Used after successful scans or manual connection changes.
    """
    settings = session.query(ControllerSettings).filter_by(id=1).first()
    if not settings:
        settings = ControllerSettings(id=1)
        session.add(settings)

    # Update allowed fields
    for key, value in kwargs.items():
        if hasattr(settings, key):
            setattr(settings, key, value)

    settings.updated_at = datetime.utcnow()
    session.commit()
    return settings


def prune_state_logs(session, max_rows=1000):
    """
    Delete old state logs if count exceeds max_rows, keeping only the newest ones.
    Call periodically to prevent unbounded growth.
    """
    count = session.query(StateLog).count()
    if count > max_rows:
        to_delete = count - max_rows
        old_ids = (
            session.query(StateLog.id)
            .order_by(StateLog.timestamp.asc())
            .limit(to_delete)
            .all()
        )
        for (row_id,) in old_ids:
            session.query(StateLog).filter_by(id=row_id).delete()
        session.commit()
