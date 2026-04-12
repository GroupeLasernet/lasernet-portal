"""
Database engine, session, and models for Elfin Cobot Studio.
"""
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Text,
    DateTime, Boolean, ForeignKey, JSON
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATABASE_URL

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
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency – yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
