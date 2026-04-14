"""
Relfar controller network discovery.

Strategy:
  1. Auto-detect the local /24 subnet from the PC's routable IP
     (or use an explicit CIDR / bind IP).
  2. In parallel, TCP-connect to every IP on port 123 with a short timeout.
  3. For each successful connect, send the handshake read frame
     (5A A5 05 58 21 0A 00 01) and check for a 5A A5 05 82 ... response.
  4. For each valid responder, look up its MAC from the Windows ARP
     table and classify by OUI (b8:3d:fb = Shenzhen Bilian = our module).
  5. Return a ranked list of candidates.

This needs no admin/Npcap — pure userspace TCP. It validates the protocol
rather than just "a port is open", so false positives are ~zero.
"""
from __future__ import annotations
import ipaddress
import re
import socket
import struct
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Iterable, Optional

MAGIC = b"\x5A\xA5\x05"
HANDSHAKE_FRAME = MAGIC + b"\x58" + struct.pack(">HH", 0x210A, 1)
KNOWN_OUI = {
    "b8:3d:fb": "Shenzhen Bilian (Relfar WiFi module)",
}
RELFAR_OUI_PREFIX = "b8:3d:fb"


# ---------------------------------------------------------------------------
# Subnet / local IP utilities
# ---------------------------------------------------------------------------

def detect_local_ip() -> Optional[str]:
    """Return the PC's primary IPv4 on the default route, or None."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Doesn't actually send — just picks the interface for that dest.
        s.connect(("8.8.8.8", 53))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def derive_cidr24(ip: str) -> str:
    """'192.168.1.47' -> '192.168.1.0/24'."""
    parts = ip.split(".")
    return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"


def list_ips(cidr: str) -> list[str]:
    net = ipaddress.ip_network(cidr, strict=False)
    return [str(h) for h in net.hosts()]


# ---------------------------------------------------------------------------
# ARP lookup (Windows / cross-platform-ish)
# ---------------------------------------------------------------------------

_MAC_RE = re.compile(r"([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}")


def arp_lookup(ip: str, timeout: float = 1.0) -> Optional[str]:
    """Return MAC address (lowercase, colon-separated) for ip, or None."""
    try:
        # First prime the ARP cache with a small TCP SYN or a ping.
        # We already connected in the probe, so the ARP entry should exist.
        out = subprocess.run(
            ["arp", "-a", ip],
            capture_output=True, text=True, timeout=timeout,
        )
        text = (out.stdout or "") + "\n" + (out.stderr or "")
        # Look for a line containing our IP and extract the MAC.
        for line in text.splitlines():
            if ip in line:
                m = _MAC_RE.search(line)
                if m:
                    return m.group(0).replace("-", ":").lower()
        # Fallback: any MAC in output (arp -a on Windows sometimes lists just adjacent).
        m = _MAC_RE.search(text)
        if m:
            return m.group(0).replace("-", ":").lower()
    except Exception:
        pass
    return None


def oui(mac: str) -> str:
    """'b8:3d:fb:a7:20:21' -> 'b8:3d:fb'."""
    return ":".join(mac.lower().split(":")[:3])


# ---------------------------------------------------------------------------
# Probe one IP
# ---------------------------------------------------------------------------

def _probe_one(ip: str, bind_ip: Optional[str], connect_timeout: float,
               read_timeout: float) -> Optional[dict]:
    """Connect to ip:123, send handshake read, return result dict if valid."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.settimeout(connect_timeout)
        if bind_ip:
            try:
                s.bind((bind_ip, 0))
            except OSError:
                # Bind can fail if the IP isn't on the PC — just try unbound.
                pass
        s.connect((ip, 123))
    except (socket.timeout, ConnectionRefusedError, OSError):
        s.close()
        return None

    try:
        s.sendall(HANDSHAKE_FRAME)
        s.settimeout(read_timeout)
        data = b""
        end = time.time() + read_timeout
        while time.time() < end and len(data) < 128:
            try:
                chunk = s.recv(256)
            except socket.timeout:
                break
            if not chunk:
                break
            data += chunk
            # Stop early once we have at least one full frame starting with MAGIC
            idx = data.find(MAGIC)
            if idx >= 0 and len(data) - idx >= 8:
                break
    finally:
        try: s.close()
        except: pass

    # Validate: must contain at least one proper 5A A5 05 frame
    idx = data.find(MAGIC)
    if idx < 0 or len(data) - idx < 8:
        # Port open but doesn't speak our protocol
        return {
            "ip": ip,
            "match": "port-open-no-protocol",
            "raw": data[:64].hex(),
        }
    frame = data[idx:idx + 8]
    cmd = frame[3]
    addr, value = struct.unpack(">HH", frame[4:8])
    return {
        "ip": ip,
        "match": "relfar-protocol",
        "first_frame": {
            "cmd": f"0x{cmd:02X}",
            "addr": f"0x{addr:04X}",
            "value": value,
        },
        "raw": data[:64].hex(),
    }


# ---------------------------------------------------------------------------
# Public: scan
# ---------------------------------------------------------------------------

def scan(cidr: Optional[str] = None,
         bind_ip: Optional[str] = None,
         connect_timeout: float = 0.7,
         read_timeout: float = 1.0,
         workers: int = 64) -> dict:
    """
    Scan a /24 (or any CIDR) for Relfar controllers.

    Returns:
        {
          "cidr": "192.168.1.0/24",
          "bind_ip": "192.168.1.47",
          "scanned": 254,
          "duration_s": 3.41,
          "candidates": [
             {"ip": "192.168.1.12", "mac": "b8:3d:fb:a7:20:21",
              "oui_label": "Shenzhen Bilian (Relfar WiFi module)",
              "confidence": "high",
              "match": "relfar-protocol",
              "first_frame": {...}}
          ]
        }
    """
    t0 = time.time()
    if bind_ip is None:
        bind_ip = detect_local_ip()
    if cidr is None:
        if not bind_ip:
            raise RuntimeError("Couldn't detect local IP — provide cidr or bind_ip.")
        cidr = derive_cidr24(bind_ip)

    ips = list_ips(cidr)

    results = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for r in ex.map(lambda ip: _probe_one(ip, bind_ip, connect_timeout, read_timeout), ips):
            if r is not None:
                results.append(r)

    # Enrich with MAC / OUI
    candidates = []
    for r in results:
        mac = arp_lookup(r["ip"])
        r["mac"] = mac
        if mac:
            r["oui"] = oui(mac)
            r["oui_label"] = KNOWN_OUI.get(r["oui"])
        else:
            r["oui"] = None
            r["oui_label"] = None

        # Score confidence
        relfar_proto = r.get("match") == "relfar-protocol"
        relfar_oui = (r.get("oui") == RELFAR_OUI_PREFIX)
        if relfar_proto and relfar_oui:
            r["confidence"] = "high"          # ← this is definitely the controller
        elif relfar_proto:
            r["confidence"] = "medium"        # protocol matches but MAC unknown
        elif relfar_oui:
            r["confidence"] = "low"           # right brand but port didn't talk
        else:
            r["confidence"] = "weak"          # TCP:123 open but no protocol or OUI
        candidates.append(r)

    # Rank: high > medium > low > weak
    order = {"high": 0, "medium": 1, "low": 2, "weak": 3}
    candidates.sort(key=lambda c: order.get(c["confidence"], 9))

    return {
        "cidr": cidr,
        "bind_ip": bind_ip,
        "scanned": len(ips),
        "duration_s": round(time.time() - t0, 2),
        "candidates": candidates,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json, sys
    cidr    = sys.argv[1] if len(sys.argv) > 1 else None
    bind_ip = sys.argv[2] if len(sys.argv) > 2 else None
    print(f"Scanning {cidr or '(auto /24)'} from bind={bind_ip or '(auto)'} ...")
    result = scan(cidr=cidr, bind_ip=bind_ip)
    print(json.dumps(result, indent=2))
    print()
    best = [c for c in result["candidates"] if c["confidence"] in ("high", "medium")]
    if best:
        top = best[0]
        print(f"BEST MATCH: {top['ip']}  mac={top['mac']}  confidence={top['confidence']}")
    else:
        print("No Relfar-protocol responders found on this subnet.")
