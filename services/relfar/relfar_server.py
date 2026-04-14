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
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from relfar_protocol import (
    RelfarClient, KNOWN_REGISTERS, read_cleaning_params, params_from_cache,
    CMD_READ_RESP, CMD_WRITE,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("relfar")

# ---- Config (override via env if needed) ---------------------------------
HOST    = os.environ.get("RELFAR_HOST",    "192.168.1.5")
PORT    = int(os.environ.get("RELFAR_PORT", "123"))
BIND_IP = os.environ.get("RELFAR_BIND",    "192.168.1.2")  # local NIC
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


@app.route("/api/config", methods=["POST"])
def api_config():
    """Change controller IP / bind IP at runtime."""
    data = request.get_json(force=True) or {}
    if "host" in data: state["host"] = data["host"]
    if "bind" in data: state["bind"] = data["bind"] or None
    with client_lock:
        close_client()
    return jsonify({"ok": True, "host": state["host"], "bind": state["bind"]})


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


# ---- Main ---------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print(" Relfar V4 — Web Dashboard")
    print(f" Controller: {HOST}:{PORT}   bind: {BIND_IP}   poll: {POLL_S}s")
    print(" Open: http://localhost:5000")
    print("=" * 60)
    start_polling()
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
