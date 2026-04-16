"""
RuiDa RDCleanV4 - WiFi Connection Tool (v2)
Targets the controller directly at 192.168.1.5 via the WiFi interface.
"""
import socket
import json
from datetime import datetime

CONTROLLER_IP = "192.168.1.5"
LOCAL_WIFI_IP = "192.168.1.2"

# RuiDa protocol scramble
def ruida_scramble_byte(b):
    b = ((b + 1) & 0xff)
    b = ((b >> 7) & 0x01) | ((b << 7) & 0x80) | \
        ((b >> 5) & 0x02) | ((b << 5) & 0x40) | \
        ((b >> 3) & 0x04) | ((b << 3) & 0x20) | \
        ((b >> 1) & 0x08) | ((b << 1) & 0x10)
    return b ^ 0x88

def make_ruida_packet(cmd_bytes):
    return bytes(ruida_scramble_byte(b) for b in cmd_bytes)

def bind_wifi(sock):
    try:
        sock.bind((LOCAL_WIFI_IP, 0))
        return True
    except Exception as e:
        print(f"    [!] bind failed: {e}")
        return False

def scan_tcp(ip, port, timeout=1.5):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        bind_wifi(s)
        s.settimeout(timeout)
        r = s.connect_ex((ip, port))
        s.close()
        return r == 0
    except Exception:
        return False

def http_get(ip, port=80):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        bind_wifi(s)
        s.settimeout(3)
        s.connect((ip, port))
        s.send(f"GET / HTTP/1.0\r\nHost: {ip}\r\n\r\n".encode())
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk: break
            data += chunk
            if len(data) > 8000: break
        s.close()
        return data.decode("utf-8", errors="replace")
    except Exception as e:
        return f"ERROR: {e}"

def tcp_send(ip, port, payload, timeout=2):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        bind_wifi(s)
        s.settimeout(timeout)
        s.connect((ip, port))
        s.send(payload)
        data = s.recv(4096)
        s.close()
        return data
    except Exception:
        return None

def udp_send(ip, port, payload, timeout=2):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        bind_wifi(s)
        s.settimeout(timeout)
        s.sendto(payload, (ip, port))
        data, _ = s.recvfrom(4096)
        s.close()
        return data
    except Exception:
        return None

print("=" * 60)
print("  RuiDa RDCleanV4 - WiFi Connection Tool (v2)")
print(f"  Controller: {CONTROLLER_IP}  |  Local WiFi: {LOCAL_WIFI_IP}")
print("=" * 60)

results = {
    "timestamp": datetime.now().isoformat(),
    "controller_ip": CONTROLLER_IP,
    "local_ip": LOCAL_WIFI_IP,
    "tcp_ports": {}, "udp_ports": {}, "http": {},
    "ruida_udp": {}, "ruida_tcp": {},
}

# TCP scan
tcp_ports = [22, 23, 53, 80, 443, 502, 1883, 2000, 4000, 5000, 8000,
             8080, 8888, 9999, 23456, 50200, 50201, 50202]
print(f"\n[*] TCP port scan on {CONTROLLER_IP}...")
open_tcp = []
for p in tcp_ports:
    if scan_tcp(CONTROLLER_IP, p):
        print(f"    [+] TCP {p} OPEN")
        open_tcp.append(p)
        results["tcp_ports"][p] = True
    else:
        results["tcp_ports"][p] = False

if not open_tcp:
    print("    [!] No TCP ports open")

# HTTP probes
for port in [80, 8080, 443]:
    if port in open_tcp:
        print(f"\n[*] HTTP GET {CONTROLLER_IP}:{port}...")
        r = http_get(CONTROLLER_IP, port)
        results["http"][port] = r[:2000] if r else None
        if r and not r.startswith("ERROR"):
            print("    [+] First 500 chars:")
            print("    " + r[:500].replace("\n", "\n    "))
        else:
            print(f"    {r}")

# UDP RuiDa probes
print(f"\n[*] RuiDa UDP probes on {CONTROLLER_IP}:50200...")
commands = {
    "get_job_count": bytes([0xda, 0x00, 0x04, 0x05]),
    "status_query":  bytes([0xda, 0x00, 0x00]),
    "device_info":   bytes([0xe7, 0x00]),
    "read_param":    bytes([0xda, 0x00, 0x06, 0x00]),
    "power_query":   bytes([0xc6, 0x01]),
    "position":      bytes([0xda, 0x00, 0x04, 0x00]),
    "machine_stat":  bytes([0xda, 0x00, 0x12]),
}
for name, cmd in commands.items():
    scrambled = make_ruida_packet(cmd)
    print(f"  [{name}] sending {scrambled.hex()}")
    r = udp_send(CONTROLLER_IP, 50200, scrambled, timeout=2)
    results["ruida_udp"][name] = {"sent": scrambled.hex(),
                                  "recv": r.hex() if r else None}
    if r:
        print(f"    [+] RESPONSE: {r.hex()}")

# Try raw "hello" too
r = udp_send(CONTROLLER_IP, 50200, b"hello", timeout=2)
results["ruida_udp"]["hello_raw"] = r.hex() if r else None
if r: print(f"    [+] hello raw: {r.hex()}")

# TCP RuiDa probes on non-HTTP open ports
for port in open_tcp:
    if port in (80, 443, 8080): continue
    print(f"\n[*] RuiDa TCP probe on {CONTROLLER_IP}:{port}...")
    for name, cmd in list(commands.items())[:3]:
        scrambled = make_ruida_packet(cmd)
        r = tcp_send(CONTROLLER_IP, port, scrambled, timeout=2)
        if r:
            print(f"    [+] {name}: {r.hex()}")
            results["ruida_tcp"].setdefault(str(port), {})[name] = r.hex()

# Broad UDP
print(f"\n[*] UDP broad probe...")
for p in [50200, 50201, 50202, 8000, 23456, 502]:
    r = udp_send(CONTROLLER_IP, p, b"\xda\x00\x00", timeout=1)
    results["udp_ports"][p] = r.hex() if r else None
    if r: print(f"    [+] UDP {p}: {r.hex()}")

with open("wifi_scan_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\n" + "=" * 60)
print("  SCAN COMPLETE - wifi_scan_results.json saved")
print("=" * 60)
