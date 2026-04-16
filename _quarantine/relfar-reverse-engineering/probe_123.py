"""
Probe TCP port 123 on RuiDa controller.
Try multiple payloads to figure out what protocol it speaks.
"""
import socket
import json
from datetime import datetime

IP = "192.168.1.5"
PORT = 123
LOCAL = "192.168.1.2"

def ruida_scramble(b):
    b = (b + 1) & 0xff
    b = ((b >> 7) & 0x01) | ((b << 7) & 0x80) | \
        ((b >> 5) & 0x02) | ((b << 5) & 0x40) | \
        ((b >> 3) & 0x04) | ((b << 3) & 0x20) | \
        ((b >> 1) & 0x08) | ((b << 1) & 0x10)
    return b ^ 0x88

def scramble(cmd):
    return bytes(ruida_scramble(b) for b in cmd)

def probe(label, payload, timeout=3):
    print(f"\n--- {label} ---")
    print(f"  Sending {len(payload)} bytes: {payload.hex() if len(payload) < 40 else payload.hex()[:80]+'...'}")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind((LOCAL, 0))
        s.settimeout(timeout)
        s.connect((IP, PORT))
        # Try to read any banner first
        s.settimeout(1.5)
        banner = b""
        try:
            banner = s.recv(4096)
        except socket.timeout:
            pass
        if banner:
            print(f"  [banner] {banner.hex()}")
            print(f"           {banner!r}")
        # Send payload
        s.settimeout(3)
        s.send(payload)
        resp = b""
        try:
            while True:
                chunk = s.recv(4096)
                if not chunk: break
                resp += chunk
                if len(resp) > 8000: break
        except socket.timeout:
            pass
        s.close()
        if resp:
            print(f"  [response] {len(resp)} bytes: {resp.hex()[:200]}")
            try:
                print(f"             text: {resp[:200].decode('utf-8', errors='replace')}")
            except Exception:
                pass
        else:
            print(f"  [no response]")
        return {"banner": banner.hex() if banner else None,
                "response": resp.hex() if resp else None}
    except Exception as e:
        print(f"  [error] {e}")
        return {"error": str(e)}

results = {"ip": IP, "port": PORT, "timestamp": datetime.now().isoformat(), "probes": {}}

# Test suite
tests = [
    ("empty",           b""),
    ("newline",         b"\r\n"),
    ("http_get",        b"GET / HTTP/1.0\r\nHost: 192.168.1.5\r\n\r\n"),
    ("http_options",    b"OPTIONS * HTTP/1.0\r\n\r\n"),
    ("ntp_request",     bytes([0x1b]) + b"\x00"*47),  # NTP client request
    ("ruida_status",    scramble(bytes([0xda, 0x00, 0x00]))),
    ("ruida_devinfo",   scramble(bytes([0xe7, 0x00]))),
    ("ruida_jobcount",  scramble(bytes([0xda, 0x00, 0x04, 0x05]))),
    ("ruida_raw_da",    bytes([0xda, 0x00, 0x00])),
    ("hello_text",      b"hello\r\n"),
    ("ssh_probe",       b"SSH-2.0-scan\r\n"),
    ("telnet_iac",      bytes([0xff, 0xfb, 0x01])),
    ("modbus_read",     bytes([0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x03, 0x00, 0x00, 0x00, 0x01])),
    ("four_zeros",      b"\x00\x00\x00\x00"),
]

for label, payload in tests:
    results["probes"][label] = probe(label, payload)

with open("probe_123_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\n" + "="*60)
print("  Done - probe_123_results.json saved")
print("="*60)
