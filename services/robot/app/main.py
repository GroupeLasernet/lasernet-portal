"""
Elfin Cobot Studio – FastAPI Application

Main server providing:
  - REST API for projects, DXF files, robot programs, and robot control
  - Web UI served via Jinja2 templates
"""
from __future__ import annotations

import os
import shutil
import threading
import logging
import time as _time

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

from app.database import init_db, get_db, Project, DXFFile, RobotProgram, RobotSettings, LicenseState
from app.dxf_parser import parse_dxf, paths_to_svg
from app.path_planner import generate_waypoints, estimate_travel_distance, estimate_cycle_time
from app.robot_comm import get_robot
from app import license as lic_module
from app import sync as sync_module

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cobot_studio")

# Suppress noisy per-request access logs from uvicorn
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Elfin Cobot Studio", version="1.0.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")

logger.info(f"BASE_DIR: {BASE_DIR}")
logger.info(f"STATIC_DIR: {STATIC_DIR} (exists: {os.path.isdir(STATIC_DIR)})")
logger.info(f"TEMPLATE_DIR: {TEMPLATE_DIR} (exists: {os.path.isdir(TEMPLATE_DIR)})")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

os.makedirs(config.UPLOAD_DIR, exist_ok=True)


@app.on_event("startup")
def startup():
    try:
        init_db()
        logger.info("Database initialized.")

        # Initialize license state if not present
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            lic = db.query(LicenseState).filter(LicenseState.id == 1).first()
            if not lic:
                lic = LicenseState(
                    id=1,
                    serial_number=config.ROBOT_SERIAL,
                    license_mode="unlicensed"
                )
                lic.state_hmac = lic.compute_hmac()
                db.add(lic)
                db.commit()
                logger.info(f"Initialized license state for serial {config.ROBOT_SERIAL}")
            else:
                logger.info(f"Loaded existing license state: mode={lic.license_mode}, serial={lic.serial_number}")

            # Check initial state
            valid, reason = lic.is_valid_now()
            logger.info(f"License check on startup: valid={valid}, reason={reason}")
            logger.info(f"DEV_SKIP_LICENSE={getattr(config, 'DEV_SKIP_LICENSE', False)}")

            # Start the background heartbeat
            lic_module.start_background_heartbeat(
                app,
                portal_url=config.PORTAL_URL,
                serial=config.ROBOT_SERIAL,
                interval_minutes=15
            )

            # Start the device sync worker (push + pull loops)
            try:
                sync_module.start_sync_worker()
            except Exception as e:
                logger.error(f"Failed to start sync worker: {e}", exc_info=True)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Startup failed: {e}", exc_info=True)


@app.on_event("shutdown")
async def shutdown():
    try:
        await sync_module.stop_sync_worker()
    except Exception as e:
        logger.warning(f"Sync worker shutdown: {e}")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# License dependency
# ---------------------------------------------------------------------------

def require_license(db: Session = Depends(get_db)):
    """
    Dependency that checks if the robot is licensed and operational.
    Returns a tuple (allowed, reason) or raises HTTPException if not allowed.
    """
    # Dev bypass: DEV_SKIP_LICENSE=true in environment disables the license gate.
    if getattr(config, "DEV_SKIP_LICENSE", False):
        return
    allowed, reason = lic_module.is_operational(db)
    if not allowed:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "license_invalid",
                "reason": reason
            }
        )


# ---------------------------------------------------------------------------
# License endpoints
# ---------------------------------------------------------------------------

@app.get("/api/license")
def get_license(db: Session = Depends(get_db)):
    """Read current local license state."""
    lic = lic_module.get_local_state(db)
    if not lic:
        return {"error": "License state not initialized"}

    allowed, grace_reason = lic_module.is_operational(db)
    valid, validity_reason = lic.is_valid_now()

    return {
        "serial_number": lic.serial_number,
        "license_mode": lic.license_mode,
        "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
        "kill_switch_active": lic.kill_switch_active,
        "last_portal_check_at": lic.last_portal_check_at.isoformat() if lic.last_portal_check_at else None,
        "last_portal_ok_at": lic.last_portal_ok_at.isoformat() if lic.last_portal_ok_at else None,
        "is_valid_now": valid,
        "validity_reason": validity_reason,
        "is_operational": allowed,
        "operational_reason": grace_reason,
        "updated_at": lic.updated_at.isoformat() if lic.updated_at else None,
    }


@app.get("/api/sync/status")
def get_sync_status():
    """Observability: pending queue size, last push/pull, clocks. For UI health badge."""
    return sync_module.sync_status()


@app.post("/api/license/refresh")
def refresh_license(db: Session = Depends(get_db)):
    """Manually trigger a license sync from the portal."""
    try:
        ok, state_dict, err = lic_module.sync_from_portal(config.PORTAL_URL, config.ROBOT_SERIAL)
        if ok and state_dict:
            lic_module.apply_portal_state(db, state_dict)
            return {"ok": True, "message": "License refreshed from portal"}
        else:
            return {"ok": False, "error": err}
    except Exception as e:
        logger.error(f"License refresh failed: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Web UI routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index():
    index_path = os.path.join(TEMPLATE_DIR, "index.html")
    return FileResponse(index_path, media_type="text/html")


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@app.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "created_at": str(p.created_at),
            "updated_at": str(p.updated_at),
            "dxf_count": len(p.dxf_files),
            "program_count": len(p.programs),
        }
        for p in projects
    ]


@app.post("/api/projects")
def create_project(name: str = Form(...), description: str = Form(""),
                   db: Session = Depends(get_db)):
    p = Project(name=name, description=description)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# DXF upload & parsing
# ---------------------------------------------------------------------------

@app.post("/api/projects/{project_id}/dxf")
async def upload_dxf(project_id: int, file: UploadFile = File(...),
                     db: Session = Depends(get_db)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not file.filename.lower().endswith(".dxf"):
        raise HTTPException(400, "Only .dxf files are accepted")

    # Save file to disk
    dest_dir = os.path.join(config.UPLOAD_DIR, str(project_id))
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, file.filename)

    with open(dest_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Parse DXF
    try:
        result = parse_dxf(dest_path)
    except Exception as e:
        os.remove(dest_path)
        raise HTTPException(400, f"Failed to parse DXF: {e}")

    bbox = result["bbox"]
    dxf_file = DXFFile(
        project_id=project_id,
        filename=file.filename,
        filepath=dest_path,
        parsed_paths=result["paths"],
        bbox_min_x=bbox["min_x"],
        bbox_min_y=bbox["min_y"],
        bbox_max_x=bbox["max_x"],
        bbox_max_y=bbox["max_y"],
    )
    db.add(dxf_file)
    db.commit()
    db.refresh(dxf_file)

    return {
        "id": dxf_file.id,
        "filename": dxf_file.filename,
        "path_count": len(result["paths"]),
        "bbox": bbox,
    }


@app.get("/api/dxf/{dxf_id}")
def get_dxf(dxf_id: int, db: Session = Depends(get_db)):
    dxf = db.query(DXFFile).get(dxf_id)
    if not dxf:
        raise HTTPException(404, "DXF file not found")
    return {
        "id": dxf.id,
        "filename": dxf.filename,
        "paths": dxf.parsed_paths,
        "bbox": {
            "min_x": dxf.bbox_min_x, "min_y": dxf.bbox_min_y,
            "max_x": dxf.bbox_max_x, "max_y": dxf.bbox_max_y,
        },
    }


@app.get("/api/dxf/{dxf_id}/svg")
def get_dxf_svg(dxf_id: int, db: Session = Depends(get_db)):
    dxf = db.query(DXFFile).get(dxf_id)
    if not dxf:
        raise HTTPException(404)
    svg = paths_to_svg(dxf.parsed_paths)
    return HTMLResponse(content=svg, media_type="image/svg+xml")


@app.get("/api/projects/{project_id}/dxf")
def list_dxf_files(project_id: int, db: Session = Depends(get_db)):
    files = db.query(DXFFile).filter(DXFFile.project_id == project_id).all()
    return [
        {
            "id": f.id,
            "filename": f.filename,
            "path_count": len(f.parsed_paths) if f.parsed_paths else 0,
            "bbox": {
                "min_x": f.bbox_min_x, "min_y": f.bbox_min_y,
                "max_x": f.bbox_max_x, "max_y": f.bbox_max_y,
            },
        }
        for f in files
    ]


@app.delete("/api/dxf/{dxf_id}")
def delete_dxf(dxf_id: int, db: Session = Depends(get_db)):
    dxf = db.query(DXFFile).get(dxf_id)
    if not dxf:
        raise HTTPException(404)
    if os.path.exists(dxf.filepath):
        os.remove(dxf.filepath)
    db.delete(dxf)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Robot Program generation & management
# ---------------------------------------------------------------------------

@app.post("/api/programs/generate")
def generate_program(
    dxf_id: int = Form(...),
    _license_ok=Depends(require_license),
    name: str = Form("Program"),
    speed: float = Form(50.0),
    acceleration: float = Form(100.0),
    blend_radius: float = Form(0.5),
    origin_x: float = Form(400.0),
    origin_y: float = Form(0.0),
    origin_z: float = Form(200.0),
    orientation_rx: float = Form(180.0),
    orientation_ry: float = Form(0.0),
    orientation_rz: float = Form(0.0),
    approach_height: float = Form(20.0),
    scale: float = Form(1.0),
    offset_x: float = Form(0.0),
    offset_y: float = Form(0.0),
    db: Session = Depends(get_db),
):
    dxf = db.query(DXFFile).get(dxf_id)
    if not dxf:
        raise HTTPException(404, "DXF file not found")

    waypoints = generate_waypoints(
        paths=dxf.parsed_paths,
        origin_x=origin_x, origin_y=origin_y, origin_z=origin_z,
        orientation_rx=orientation_rx, orientation_ry=orientation_ry,
        orientation_rz=orientation_rz,
        approach_height=approach_height,
        scale=scale, offset_x=offset_x, offset_y=offset_y,
    )

    prog = RobotProgram(
        project_id=dxf.project_id,
        name=name,
        speed=speed,
        acceleration=acceleration,
        blend_radius=blend_radius,
        origin_x=origin_x, origin_y=origin_y, origin_z=origin_z,
        orientation_rx=orientation_rx, orientation_ry=orientation_ry,
        orientation_rz=orientation_rz,
        approach_height=approach_height,
        waypoints=waypoints,
    )
    db.add(prog)
    db.commit()
    db.refresh(prog)

    return {
        "id": prog.id,
        "name": prog.name,
        "waypoint_count": len(waypoints),
        "estimated_distance_mm": estimate_travel_distance(waypoints),
        "estimated_time_s": estimate_cycle_time(waypoints, speed),
    }


@app.get("/api/programs/{program_id}")
def get_program(program_id: int, db: Session = Depends(get_db)):
    prog = db.query(RobotProgram).get(program_id)
    if not prog:
        raise HTTPException(404)
    return {
        "id": prog.id,
        "name": prog.name,
        "speed": prog.speed,
        "waypoints": prog.waypoints,
        "waypoint_count": len(prog.waypoints) if prog.waypoints else 0,
        "status": prog.status,
        "estimated_distance_mm": estimate_travel_distance(prog.waypoints or []),
        "estimated_time_s": estimate_cycle_time(prog.waypoints or [], prog.speed),
    }


@app.get("/api/projects/{project_id}/programs")
def list_programs(project_id: int, db: Session = Depends(get_db)):
    progs = db.query(RobotProgram).filter(RobotProgram.project_id == project_id).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "waypoint_count": len(p.waypoints) if p.waypoints else 0,
            "status": p.status,
            "created_at": str(p.created_at),
        }
        for p in progs
    ]


@app.delete("/api/programs/{program_id}")
def delete_program(program_id: int, db: Session = Depends(get_db)):
    prog = db.query(RobotProgram).get(program_id)
    if not prog:
        raise HTTPException(404)
    db.delete(prog)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Robot control endpoints
# ---------------------------------------------------------------------------

@app.post("/api/robot/connect")
def robot_connect(ip: str = Form("192.168.0.1"), port: int = Form(10003)):
    robot = get_robot(ip, port)
    robot.ip = ip
    robot.port = port
    success = robot.connect()
    return {
        "connected": robot.is_connected,
        "simulation_mode": robot.simulation_mode,
        "message": "Connected" if success else "Robot unreachable – simulation mode active",
    }


@app.post("/api/robot/disconnect")
def robot_disconnect():
    robot = get_robot()
    robot.disconnect()
    return {"connected": False}


@app.get("/api/robot/state")
def robot_state():
    robot = get_robot()
    # Return cached state only – the background poll thread keeps it fresh.
    # Never actively query the robot here; it blocks the web server on timeout.
    state = robot.get_state_dict()
    state["simulation_mode"] = robot.simulation_mode
    return state


@app.get("/api/robot/diag")
def robot_diagnostic():
    """Diagnostic endpoint: read FSM state, robot state, and controller state."""
    robot = get_robot()
    FSM_NAMES = {
        0: "UnInitialize", 1: "Initialize", 2: "ElectricBoxDisconnect",
        3: "ElectricBoxConnecting", 4: "EmergencyStopHandling", 5: "EmergencyStop",
        6: "Blackouting48V", 7: "Blackout_48V", 8: "Electrifying48V",
        9: "SafeguardErrorHandling", 10: "SafeguardError", 11: "SafeguardHandling",
        12: "Safeguarding", 13: "ControllerDisconnecting", 14: "ControllerDisconnect",
        15: "ControllerConnecting", 16: "ControllerVersionError", 17: "EtherCATError",
        18: "ControllerChecking", 19: "Reseting", 20: "RobotOutofSafeSpace",
        21: "RobotCollisionStop", 22: "Error", 23: "RobotEnabling",
        24: "Disable", 25: "Moving", 26: "LongJogMoving",
        27: "RobotStopping", 28: "RobotDisabling", 29: "RobotOpeningFreeDriver",
        30: "RobotClosingFreeDriver", 31: "FreeDriver", 32: "RobotHolding",
        33: "StandBy", 34: "ScriptRunning", 35: "ScriptHoldHandling",
        36: "ScriptHolding", 37: "ScriptStopping", 38: "ScriptStopped",
    }
    try:
        fsm = robot.read_fsm_state()
        rstate = robot.read_robot_state()
        return {
            "fsm_state": fsm,
            "fsm_name": FSM_NAMES.get(fsm, f"Unknown({fsm})"),
            "robot_state": rstate,
            "connected": robot.is_connected,
            "simulation_mode": robot.simulation_mode,
        }
    except ConnectionError as e:
        return {"error": str(e), "connected": robot.is_connected}


@app.post("/api/robot/startup")
def robot_startup(_license_ok=Depends(require_license)):
    """Run the full startup sequence: ConnectToBox → Electrify → StartMaster."""
    robot = get_robot()
    try:
        results = robot.startup_sequence()
        return {"results": results}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.get("/api/robot/test-cmd")
def robot_test_cmd(cmd: str = "ReadCurFSM", args: str = ""):
    """Debug: send a raw command and see the raw response."""
    robot = get_robot()
    try:
        arg_list = [a.strip() for a in args.split(",") if a.strip()] if args else []
        # Build the command string manually to capture raw response
        parts = [cmd, "0"] + [str(a) for a in arg_list]
        cmd_str = ",".join(parts) + ",;"
        import time as _time
        with robot._lock:
            if not robot._sock:
                return {"command": cmd, "error": "Not connected"}
            robot._sock.sendall(cmd_str.encode("ascii"))
            buf = b""
            start = _time.time()
            while True:
                try:
                    chunk = robot._sock.recv(4096)
                    if not chunk:
                        break
                    buf += chunk
                    if b";" in buf:
                        break
                except Exception:
                    if _time.time() - start > 5:
                        break
            raw = buf.decode("ascii", errors="replace").strip()
        return {"command": cmd, "sent": cmd_str, "raw_response": raw, "args": arg_list}
    except Exception as e:
        return {"command": cmd, "error": str(e)}


@app.post("/api/robot/enable")
def robot_enable(_license_ok=Depends(require_license)):
    robot = get_robot()
    try:
        resp = robot.enable_servo()
        return {"response": resp, "servo_enabled": robot.get_state().servo_enabled}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/disable")
def robot_disable(_license_ok=Depends(require_license)):
    robot = get_robot()
    try:
        resp = robot.disable_servo()
        return {"response": resp, "servo_enabled": robot.get_state().servo_enabled}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/stop")
def robot_stop(_license_ok=Depends(require_license)):
    robot = get_robot()
    try:
        resp = robot.stop()
        return {"response": resp}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


# ---------------------------------------------------------------------------
# Station config (Diagnostics & Config card in Settings tab)
# ---------------------------------------------------------------------------
def _env_file_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        ".env",
    )


def _read_env_file() -> dict:
    """Parse the .env file into a dict. Missing file => {}."""
    path = _env_file_path()
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip()
    return out


def _write_env_file(values: dict) -> None:
    """Write the given dict back to .env atomically, preserving canonical order."""
    path = _env_file_path()
    order = [
        "ROBOT_SERIAL", "PORTAL_URL", "ROBOT_LICENSE_SECRET",
        "DEV_SKIP_LICENSE", "SYNC_ENABLED", "LICENSE_STRICT",
    ]
    lines = []
    for k in order:
        v = values.get(k, "")
        lines.append(f"{k}={v}")
    # Preserve any extra keys not in our canonical list
    for k, v in values.items():
        if k not in order:
            lines.append(f"{k}={v}")
    body = "\r\n".join(lines) + "\r\n"
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(body)
    os.replace(tmp, path)


@app.get("/api/robot/config")
def get_robot_config():
    """Return current station config. Secret is never returned — only its presence."""
    env = _read_env_file()
    return {
        "ROBOT_SERIAL": env.get("ROBOT_SERIAL", ""),
        "PORTAL_URL": env.get("PORTAL_URL", ""),
        "DEV_SKIP_LICENSE": env.get("DEV_SKIP_LICENSE", "false"),
        "SYNC_ENABLED": env.get("SYNC_ENABLED", "true"),
        "LICENSE_STRICT": env.get("LICENSE_STRICT", "false"),
        "ROBOT_LICENSE_SECRET_set": bool(env.get("ROBOT_LICENSE_SECRET", "")),
    }


@app.post("/api/robot/config")
async def set_robot_config(request: Request):
    """
    Update station config. Accepts JSON body with any subset of the known keys.
    If ROBOT_LICENSE_SECRET is included and non-empty, it's written. If omitted
    or empty, the existing secret is preserved.
    Changes take effect on next service restart (POST /api/robot/restart).
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    env = _read_env_file()

    # Text fields
    for key in ("ROBOT_SERIAL", "PORTAL_URL"):
        if key in body:
            env[key] = str(body[key]).strip()

    # Boolean-ish fields — normalize to "true"/"false" strings
    for key in ("DEV_SKIP_LICENSE", "SYNC_ENABLED", "LICENSE_STRICT"):
        if key in body:
            val = body[key]
            if isinstance(val, bool):
                env[key] = "true" if val else "false"
            else:
                env[key] = "true" if str(val).lower() in ("true", "1", "yes", "on") else "false"

    # Secret — only overwrite if explicitly provided and non-empty
    if body.get("ROBOT_LICENSE_SECRET"):
        env["ROBOT_LICENSE_SECRET"] = str(body["ROBOT_LICENSE_SECRET"]).strip()

    _write_env_file(env)
    return {"ok": True, "message": "Config saved. Restart service for changes to take effect."}


@app.post("/api/robot/restart")
def restart_robot_service():
    """
    Trigger a service restart by exiting the process. NSSM's default AppExit
    action is 'Restart', so the service will come back up automatically within
    ~1-3 seconds. If run outside NSSM (manual `python run.py`), this will just
    kill the process.
    """
    import threading as _th
    def _delayed_exit():
        _time.sleep(0.4)   # give the HTTP response time to flush
        os._exit(0)        # hard-exit; NSSM restarts us
    _th.Thread(target=_delayed_exit, daemon=True).start()
    return {"ok": True, "message": "Service is restarting. UI will reconnect in a few seconds."}


# ---------------------------------------------------------------------------
# Error / diagnostic log viewer
# ---------------------------------------------------------------------------
@app.post("/api/robot/errors/clear")
def clear_error_log():
    """Truncate stderr.log so the Error Log panel shows a fresh slate."""
    log_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "logs",
        "stderr.log",
    )
    try:
        # Open in write mode truncates. If the file is held open by NSSM it
        # may reopen / continue to append — that's fine, we just want history gone.
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("")
        return {"ok": True, "cleared": log_path}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/robot/errors")
def get_error_log(limit: int = 200):
    """
    Return recent WARNING / ERROR lines from the NSSM stderr log for display
    in the Settings → Error Log panel. Last ~60 KB is scanned so the tail
    stays cheap even if the log has rotated to 10 MB.
    """
    # logs dir is a sibling of the `app/` package, inside services/robot/
    log_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "logs",
        "stderr.log",
    )
    if not os.path.exists(log_path):
        return {"entries": [], "source": log_path, "note": "log file not found"}
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 60_000))
            tail = f.read()

        # Keep each WARNING/ERROR line, and for Tracebacks keep all the indented
        # stack frames that follow (until the next non-indented, non-empty line).
        lines = tail.splitlines()
        entries = []
        i = 0
        while i < len(lines):
            line = lines[i]
            is_alert = ("WARNING" in line or "ERROR" in line
                        or line.startswith("Traceback"))
            if is_alert:
                entries.append(line)
                # Capture the following traceback body: indented lines +
                # the final "ExceptionType: message" line.
                if line.startswith("Traceback"):
                    j = i + 1
                    while j < len(lines):
                        nxt = lines[j]
                        if nxt.startswith((" ", "\t")) or nxt.startswith("  "):
                            entries.append(nxt)
                            j += 1
                        elif nxt and not nxt.startswith(("INFO", "WARNING", "ERROR", "DEBUG")):
                            # Final exception summary line
                            entries.append(nxt)
                            j += 1
                            break
                        else:
                            break
                    i = j
                    continue
            i += 1

        return {"entries": entries[-limit:], "source": log_path, "total": len(entries)}
    except Exception as e:
        return {"entries": [f"(failed to read log: {e})"], "source": log_path}


@app.post("/api/robot/clear-alarm")
def robot_clear_alarm(_license_ok=Depends(require_license)):
    robot = get_robot()
    try:
        resp = robot.clear_alarm()
        return {"response": resp}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/drag-mode")
def robot_drag_mode(payload: dict = None, _license_ok=Depends(require_license)):
    """
    Set or toggle Free Mode (drag teaching / hand-guiding).
    Body: {"enabled": true|false}  — explicit set
          {}  or  omitted           — toggle current state

    The state field `drag_mode_source` is set to "ui" on enable (UI-initiated)
    so the frontend knows this was a user click, not a wrist-button press. The
    wrist-button poll in robot_comm.py sets it to "wrist_button" when the
    hardware button triggers the toggle.
    """
    robot = get_robot()
    try:
        if payload and "enabled" in payload:
            robot.set_drag_mode(bool(payload["enabled"]))
        else:
            robot.toggle_drag_mode()
        # Stamp the source so the UI knows where the toggle came from.
        st = robot.get_state()
        st.drag_mode_source = "ui" if st.drag_mode else ""
        return {"response": "OK", "drag_mode": st.drag_mode, "drag_mode_source": st.drag_mode_source}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/run-program/{program_id}")
def robot_run_program(program_id: int, db: Session = Depends(get_db), _license_ok=Depends(require_license)):
    prog = db.query(RobotProgram).get(program_id)
    if not prog:
        raise HTTPException(404, "Program not found")

    robot = get_robot()
    if not robot.is_connected and not robot.simulation_mode:
        raise HTTPException(400, "Robot not connected. Connect first or use simulation mode.")

    prog.status = "running"
    db.commit()

    def _run():
        nonlocal prog
        success = robot.execute_program(prog.waypoints or [], speed=prog.speed)
        # Update status in a new session
        from app.database import SessionLocal
        s = SessionLocal()
        p = s.query(RobotProgram).get(program_id)
        if p:
            p.status = "done" if success else "error"
            s.commit()
        s.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {
        "message": f"Program '{prog.name}' started" + (" (simulation)" if robot.simulation_mode else ""),
        "simulation_mode": robot.simulation_mode,
    }


@app.post("/api/robot/jog")
def robot_jog(axis: str = Form(...), distance: float = Form(5.0), speed: float = Form(60.0), _license_ok=Depends(require_license)):
    """Jog the robot along a single Cartesian axis using WayPoint MoveL."""
    robot = get_robot()
    axis_map = {"x": 0, "y": 1, "z": 2, "rx": 3, "ry": 4, "rz": 5}
    axis = axis.lower()
    if axis not in axis_map:
        raise HTTPException(400, f"Invalid axis: {axis}")

    axis_id = axis_map[axis]
    direction = 1 if distance >= 0 else 0
    dist = abs(distance)

    try:
        resp = robot.jog_cartesian(axis_id, direction, distance=dist, speed=speed)
        return {"response": resp, "axis": axis, "direction": direction, "distance": dist}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/jog-joint")
def robot_jog_joint(joint: int = Form(...), distance: float = Form(5.0), speed: float = Form(60.0), _license_ok=Depends(require_license)):
    """Jog a single robot joint using WayPoint MoveJ."""
    robot = get_robot()
    if joint < 1 or joint > 6:
        raise HTTPException(400, f"Invalid joint number: {joint}. Must be 1-6.")

    axis_id = joint - 1  # Convert 1-6 to 0-5
    direction = 1 if distance >= 0 else 0
    deg = abs(distance)

    try:
        resp = robot.jog_joint(axis_id, direction, degrees=deg, speed=speed)
        return {"response": resp, "joint": joint, "direction": direction, "degrees": deg}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


# ---------------------------------------------------------------------------
# Move Joint To (absolute position)
# ---------------------------------------------------------------------------

@app.post("/api/robot/move-joint-to")
def robot_move_joint_to(joint: int = Form(...), angle: float = Form(0.0), speed: float = Form(60.0), _license_ok=Depends(require_license)):
    """Move a single joint to an absolute angle. Other joints stay at current position."""
    robot = get_robot()
    if joint < 1 or joint > 6:
        raise HTTPException(400, f"Invalid joint number: {joint}. Must be 1-6.")

    try:
        j = list(robot.get_state().joint_positions)
        p = list(robot.get_state().cartesian_position)
        j[joint - 1] = angle
        speed = min(speed, 180.0)
        accel = max(speed * 1.5, speed + 20)
        robot._prepare_motion()
        robot.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=0,
            use_joint=1, joints=j
        )
        return {"response": "OK", "joint": joint, "target_angle": angle}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/move-joints-to")
def robot_move_joints_to(data: dict, _license_ok=Depends(require_license)):
    """Move all joints to absolute angles simultaneously."""
    robot = get_robot()
    angles = data.get("angles", [0, 0, 0, 0, 0, 0])
    speed = min(data.get("speed", 60.0), 180.0)

    if len(angles) != 6:
        raise HTTPException(400, "Must provide exactly 6 joint angles.")

    try:
        p = list(robot.get_state().cartesian_position)
        accel = max(speed * 1.5, speed + 20)
        robot._prepare_motion()
        robot.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=0,
            use_joint=1, joints=angles
        )
        return {"response": "OK", "target_angles": angles}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/quantum")
def robot_quantum(speed: float = Form(60.0), _license_ok=Depends(require_license)):
    """Move robot to Quantum position — all joints at 0° (pointing straight up)."""
    robot = get_robot()
    speed = min(speed, 180.0)

    try:
        p = list(robot.get_state().cartesian_position)
        accel = max(speed * 1.5, speed + 20)
        robot._prepare_motion()
        robot.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=0,
            use_joint=1, joints=[0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        )
        return {"response": "OK", "message": "Moving to Quantum position (all joints 0°)"}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.get("/api/robot/travel-position")
def get_travel_position(db: Session = Depends(get_db)):
    """Return the saved travel (folded) joint angles."""
    s = db.query(RobotSettings).first()
    if not s:
        s = RobotSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    joints = s.travel_joints or [0.0, -90.0, 135.0, 0.0, 45.0, 0.0]
    return {"joints": joints}


@app.post("/api/robot/travel-position/save")
def save_travel_position(db: Session = Depends(get_db), _license_ok=Depends(require_license)):
    """Capture the robot's CURRENT joint angles and save them as the travel position."""
    robot = get_robot()
    try:
        current = list(robot.get_state().joint_positions)
        if len(current) != 6:
            raise HTTPException(500, "Could not read 6 joint positions from robot")
        s = db.query(RobotSettings).first()
        if not s:
            s = RobotSettings()
            db.add(s)
        s.travel_joints = current
        db.commit()
        return {"response": "OK", "joints": current}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/travel-position")
def go_travel_position(speed: float = Form(60.0), db: Session = Depends(get_db), _license_ok=Depends(require_license)):
    """Move robot to the saved travel (folded) position."""
    robot = get_robot()
    speed = min(speed, 180.0)
    s = db.query(RobotSettings).first()
    joints = (s.travel_joints if s else None) or [0.0, -90.0, 135.0, 0.0, 45.0, 0.0]
    if len(joints) != 6:
        raise HTTPException(500, "Stored travel position does not have 6 joints")

    try:
        p = list(robot.get_state().cartesian_position)
        accel = max(speed * 1.5, speed + 20)
        robot._prepare_motion()
        robot.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=0,
            use_joint=1, joints=joints
        )
        return {"response": "OK", "message": "Moving to travel position", "joints": joints}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


# ---------------------------------------------------------------------------
# Generic saved-position slots (Position 1, Position 2, …)
# Slot 1 aliases the legacy `travel_joints` column so existing saved data
# continues to work unchanged. Slot 2 uses the new `position2_joints` column.
# ---------------------------------------------------------------------------

_POSITION_SLOT_COLUMN = {
    1: "travel_joints",
    2: "position2_joints",
}
_DEFAULT_FOLDED = [0.0, -90.0, 135.0, 0.0, 45.0, 0.0]


def _position_column(slot: int) -> str:
    col = _POSITION_SLOT_COLUMN.get(slot)
    if col is None:
        raise HTTPException(400, f"Unknown position slot {slot}. Valid slots: 1, 2")
    return col


@app.get("/api/robot/position/{slot}")
def get_position(slot: int, db: Session = Depends(get_db)):
    """Return the saved joint angles for the given position slot."""
    col = _position_column(slot)
    s = db.query(RobotSettings).first()
    if not s:
        s = RobotSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    joints = getattr(s, col, None) or list(_DEFAULT_FOLDED)
    return {"slot": slot, "joints": joints}


@app.post("/api/robot/position/{slot}/save")
def save_position(slot: int, db: Session = Depends(get_db), _license_ok=Depends(require_license)):
    """Capture the robot's CURRENT joint angles into the given position slot."""
    col = _position_column(slot)
    robot = get_robot()
    try:
        current = list(robot.get_state().joint_positions)
        if len(current) != 6:
            raise HTTPException(500, "Could not read 6 joint positions from robot")
        s = db.query(RobotSettings).first()
        if not s:
            s = RobotSettings()
            db.add(s)
        setattr(s, col, current)
        db.commit()
        return {"response": "OK", "slot": slot, "joints": current}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


@app.post("/api/robot/position/{slot}")
def go_position(slot: int, speed: float = Form(60.0), db: Session = Depends(get_db), _license_ok=Depends(require_license)):
    """Move robot to the joint angles saved under the given position slot."""
    col = _position_column(slot)
    robot = get_robot()
    speed = min(speed, 180.0)
    s = db.query(RobotSettings).first()
    joints = (getattr(s, col, None) if s else None) or list(_DEFAULT_FOLDED)
    if len(joints) != 6:
        raise HTTPException(500, f"Stored position {slot} does not have 6 joints")

    try:
        p = list(robot.get_state().cartesian_position)
        accel = max(speed * 1.5, speed + 20)
        robot._prepare_motion()
        robot.move_waypoint(
            p[0], p[1], p[2], p[3], p[4], p[5],
            speed=speed, accel=accel, move_type=0,
            use_joint=1, joints=joints
        )
        return {"response": "OK", "message": f"Moving to Position {slot}", "slot": slot, "joints": joints}
    except ConnectionError as e:
        raise HTTPException(503, f"Robot communication error: {e}")


# ---------------------------------------------------------------------------
# Robot settings
# ---------------------------------------------------------------------------

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    s = db.query(RobotSettings).first()
    if not s:
        s = RobotSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return {
        "robot_ip": s.robot_ip,
        "robot_port": s.robot_port,
        "speed": s.speed,
        "acceleration": s.acceleration,
        "blend_radius": s.blend_radius,
        "origin_x": s.origin_x, "origin_y": s.origin_y, "origin_z": s.origin_z,
        "orientation_rx": s.orientation_rx, "orientation_ry": s.orientation_ry,
        "orientation_rz": s.orientation_rz,
        "approach_height": s.approach_height,
    }


@app.post("/api/settings")
def update_settings(
    robot_ip: str = Form("192.168.0.1"),
    robot_port: int = Form(10003),
    speed: float = Form(50.0),
    acceleration: float = Form(100.0),
    blend_radius: float = Form(0.5),
    origin_x: float = Form(400.0),
    origin_y: float = Form(0.0),
    origin_z: float = Form(200.0),
    orientation_rx: float = Form(180.0),
    orientation_ry: float = Form(0.0),
    orientation_rz: float = Form(0.0),
    approach_height: float = Form(20.0),
    db: Session = Depends(get_db),
):
    s = db.query(RobotSettings).first()
    if not s:
        s = RobotSettings()
        db.add(s)

    s.robot_ip = robot_ip
    s.robot_port = robot_port
    s.speed = speed
    s.acceleration = acceleration
    s.blend_radius = blend_radius
    s.origin_x = origin_x
    s.origin_y = origin_y
    s.origin_z = origin_z
    s.orientation_rx = orientation_rx
    s.orientation_ry = orientation_ry
    s.orientation_rz = orientation_rz
    s.approach_height = approach_height
    db.commit()
    return {"ok": True}
