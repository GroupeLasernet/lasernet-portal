"""
Relfar V4 — Web dashboard server.

Talks to the controller via TCP (port 123) using the reverse-engineered
register protocol in relfar_protocol.py. Holds a single persistent
connection in a background thread, polls the cleaning parameter block
every second, and exposes a small HTTP/JSON API for the web UI.
"""
import os
import time
import threading
import logging
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Load .env from this service's directory BEFORE reading env vars below.
# NSSM doesn't inherit a shell's environment, so each station PC's per-device
# config (controller IP, bind NIC, etc.) lives in services/relfar/.env.
try:
    from dotenv import load_dotenv
    _ENV_PATH = Path(__file__).resolve().parent / ".env"
    load_dotenv(_ENV_PATH)
except ImportError:
    # python-dotenv not installed — fall back to process-inherited env only
    pass

from relfar_protocol import (
    RelfarClient, KNOWN_REGISTERS, read_cleaning_params, params_from_cache,
    CMD_READ_RESP, CMD_WRITE,
)
from discover import scan as discover_scan, detect_local_ip

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("relfar")

# ---- Config (override via env if needed) ---------------------------------
# Default to "not configured" — user sets host via the Find controller button
# or by setting RELFAR_HOST. Bind defaults to auto (let Windows pick).
HOST    = os.environ.get("RELFAR_HOST",    "").strip()
PORT    = int(os.environ.get("RELFAR_PORT", "123"))
BIND_IP = os.environ.get("RELFAR_BIND",    "").strip() or None
POLL_S  = float(os.environ.get("RELFAR_POLL", "0.5"))

# ---- App state -----------------------------------------------------------
app = Flask(__name__, static_folder="static")
CORS(app)

state = {
    "connected":   False,
    "host":        HOST,
    "bind":        BIND_IP,
    "last_poll":   None,
    "last_error":  None,
    "params":      {},        # human-readable
    "registers":   {},        # raw addr->value
    "raw_log":     [],        # last N hex frames seen (debug)
}
client = None
client_lock = threading.Lock()
poll_thread = None
poll_stop = threading.Event()


# ---- Connection management ----------------------------------------------
def open_client():
    global client
    if client:
        try: client.close()
        except: pass
    c = RelfarClient(host=state["host"], port=PORT, bind_ip=state["bind"], timeout=3.0)
    c.connect()
    client = c
    state["connected"]  = True
    state["last_error"] = None
    log.info("Connected to %s:%d (bind=%s)", state["host"], PORT, state["bind"])


def close_client():
    global client
    state["connected"] = False
    if client:
        try: client.close()
        except: pass
        client = None


def poll_loop():
    """Background poll: keep connection alive and refresh state every POLL_S."""
    backoff = 1.0
    while not poll_stop.is_set():
        # If no host is configured yet, idle quietly — user will set one via the UI.
        if not state["host"]:
            state["last_error"] = None
            state["connected"]  = False
            poll_stop.wait(1.0)
            continue
        try:
            with client_lock:
                if not state["connected"] or client is None:
                    open_client()
                params = read_cleaning_params(client)
                regs   = {f"0x{a:04X}": v for a, v in client.registers.items()}
            state["params"]    = params
            state["registers"] = regs
            state["last_poll"] = time.strftime("%Y-%m-%d %H:%M:%S")
            backoff = 1.0
        except Exception as e:
            state["last_error"] = f"{type(e).__name__}: {e}"
            state["connected"]  = False
            log.warning("poll error: %s (backoff %.1fs)", e, backoff)
            close_client()
            time.sleep(backoff)
            backoff = min(backoff * 2, 15.0)
            continue
        poll_stop.wait(POLL_S)


def start_polling():
    global poll_thread
    if poll_thread and poll_thread.is_alive(): return
    poll_stop.clear()
    poll_thread = threading.Thread(target=poll_loop, daemon=True)
    poll_thread.start()


# ---- HTTP API ------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/status")
def api_status():
    return jsonify({
        "connected":  state["connected"],
        "host":       state["host"],
        "bind":       state["bind"],
        "last_poll":  state["last_poll"],
        "last_error": state["last_error"],
        "params":     state["params"],
        "registers":  state["registers"],
    })


_ENV_FILE = Path(__file__).resolve().parent / ".env"


def _write_env_var(path: Path, key: str, value: str) -> None:
    """Idempotently upsert KEY=VALUE in a .env file. Creates the file if missing."""
    lines = []
    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
    prefix = f"{key}="
    replaced = False
    new_line = f"{key}={value}"
    for i, ln in enumerate(lines):
        if ln.strip().startswith(prefix) or ln.strip().startswith("#" + prefix):
            lines[i] = new_line
            replaced = True
            break
    if not replaced:
        lines.append(new_line)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@app.route("/api/config", methods=["POST"])
def api_config():
    """Change controller IP / bind IP at runtime.

    Body: {"host": "192.168.20.55", "bind": "192.168.20.224", "persist": true}

    If 'bind' isn't specified but 'host' is, clear bind so Windows auto-picks
    the interface (avoids stale lab-network bind breaking a new network).

    If 'persist' is true, also write the values into services/relfar/.env so
    the service reconnects to the same controller after restart/reboot.
    """
    data = request.get_json(force=True) or {}
    host_changed = False
    if "host" in data:
        state["host"] = (data["host"] or "").strip()
        host_changed = True
    if "bind" in data:
        state["bind"] = (data["bind"] or None)
    elif host_changed:
        state["bind"] = None

    persisted = False
    if data.get("persist"):
        try:
            _write_env_var(_ENV_FILE, "RELFAR_HOST", state["host"] or "")
            _write_env_var(_ENV_FILE, "RELFAR_BIND", state["bind"] or "")
            persisted = True
            log.info("Persisted RELFAR_HOST=%s RELFAR_BIND=%s to %s",
                     state["host"], state["bind"], _ENV_FILE)
        except Exception as e:
            log.warning("Failed to persist config: %s", e)

    with client_lock:
        close_client()
    return jsonify({
        "ok": True,
        "host": state["host"],
        "bind": state["bind"],
        "persisted": persisted,
    })


@app.route("/api/read", methods=["POST"])
def api_read():
    data = request.get_json(force=True) or {}
    addr = int(data["address"], 0) if isinstance(data["address"], str) else int(data["address"])
    with client_lock:
        if not state["connected"]:
            return jsonify({"error": "not connected"}), 503
        v, frames = client.read(addr)
    return jsonify({
        "address": f"0x{addr:04X}",
        "value":   v,
        "name":    KNOWN_REGISTERS.get(addr),
        "frames":  [{"cmd": f"0x{c:02X}", "addr": f"0x{a:04X}", "value": val} for c, a, val in frames],
    })


@app.route("/api/write", methods=["POST"])
def api_write():
    data = request.get_json(force=True) or {}
    addr  = int(data["address"], 0) if isinstance(data["address"], str) else int(data["address"])
    value = int(data["value"])
    with client_lock:
        if not state["connected"]:
            return jsonify({"error": "not connected"}), 503
        frames = client.write(addr, value)
    return jsonify({
        "ok": True, "address": f"0x{addr:04X}", "value": value,
        "ack_frames": [{"cmd": f"0x{c:02X}", "addr": f"0x{a:04X}", "value": val} for c, a, val in frames],
    })


# Convenience: write a named cleaning parameter
PARAM_TO_REG = {
    "para_number":  (0x1303, 1),
    "scan_speed":   (0x1304, 1),
    "laser_power":  (0x1305, 1),
    "laser_freq":   (0x1306, 1),
    "laser_duty":   (0x1307, 1),
    "scan_length":  (0x1308, 10),    # multiply by 10 (1 decimal)
    "scan_width":   (0x1309, 10),
    "scan_type":    (0x130A, 1),    # WRITE goes to 0x130A; controller mirrors it to 0x130B (status)
}


@app.route("/api/param", methods=["POST"])
def api_param():
    """Body: {"name": "laser_power", "value": 1500}"""
    data = request.get_json(force=True) or {}
    name = data.get("name")
    if name not in PARAM_TO_REG:
        return jsonify({"error": f"unknown param '{name}'", "known": list(PARAM_TO_REG)}), 400
    addr, scale = PARAM_TO_REG[name]
    raw = int(round(float(data["value"]) * scale))
    with client_lock:
        if not state["connected"]:
            return jsonify({"error": "not connected"}), 503
        # Write — controller responds within ~17ms with ack frames + updated mirrors
        # Write — controller responds in ~17ms, ack frames already update client.registers
        # via _recv_frames inside .write(). So no extra round-trip needed.
        client.write(addr, raw)
        state["params"]    = params_from_cache(client)
        state["registers"] = {f"0x{a:04X}": v for a, v in client.registers.items()}
        state["last_poll"] = time.strftime("%Y-%m-%d %H:%M:%S")
    return jsonify({
        "ok": True, "name": name, "address": f"0x{addr:04X}", "raw": raw,
        "params": state["params"],
    })


@app.route("/api/reconnect", methods=["POST"])
def api_reconnect():
    with client_lock:
        close_client()
    return jsonify({"ok": True})


@app.route("/api/discover", methods=["POST"])
def api_discover():
    """
    Scan the local subnet for Relfar controllers.
    Optional body: {"cidr": "192.168.0.0/24", "bind_ip": "192.168.0.47"}
    Auto-detects both if not supplied.
    """
    data = request.get_json(silent=True) or {}
    cidr    = data.get("cidr")
    bind_ip = data.get("bind_ip")
    try:
        result = discover_scan(cidr=cidr, bind_ip=bind_ip)
    except Exception as e:
        return jsonify({"error": f"{type(e).__name__}: {e}"}), 500
    return jsonify(result)


@app.route("/api/local-ip")
def api_local_ip():
    """Report the PC's primary IP so the UI can show the scan target subnet."""
    ip = detect_local_ip()
    return jsonify({"local_ip": ip, "suggested_cidr":
                    (".".join(ip.split(".")[:3]) + ".0/24") if ip else None})


# ---- Main ---------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print(" Relfar V4 — Web Dashboard")
    print(f" Controller: {HOST}:{PORT}   bind: {BIND_IP}   poll: {POLL_S}s")
    print(" Open: http://localhost:5000")
    print("=" * 60)
    start_polling()
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
