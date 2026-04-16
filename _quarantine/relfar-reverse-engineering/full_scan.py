"""
Full port scan of RuiDa controller at 192.168.1.5
Scans all 65535 TCP ports + common UDP ports, threaded for speed.
"""
import socket
import json
import threading
from queue import Queue
from datetime import datetime

CONTROLLER_IP = "192.168.1.5"
LOCAL_WIFI_IP = "192.168.1.2"
NUM_THREADS = 200

open_tcp = []
lock = threading.Lock()

def check_tcp(port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind((LOCAL_WIFI_IP, 0))
        s.settimeout(0.8)
        r = s.connect_ex((CONTROLLER_IP, port))
        s.close()
        if r == 0:
            with lock:
                open_tcp.append(port)
                print(f"  [+] TCP {port} OPEN")
    except Exception:
        pass

def worker(q):
    while True:
        port = q.get()
        if port is None:
            break
        check_tcp(port)
        q.task_done()

def udp_probe(port, payload=b"\x00", timeout=1.5):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.bind((LOCAL_WIFI_IP, 0))
        s.settimeout(timeout)
        s.sendto(payload, (CONTROLLER_IP, port))
        data, _ = s.recvfrom(4096)
        s.close()
        return data
    except Exception:
        return None

print("=" * 60)
print(f"  Full TCP scan of {CONTROLLER_IP} (1-65535)")
print("=" * 60)

q = Queue()
threads = []
for _ in range(NUM_THREADS):
    t = threading.Thread(target=worker, args=(q,))
    t.daemon = True
    t.start()
    threads.append(t)

for port in range(1, 65536):
    q.put(port)

q.join()
for _ in range(NUM_THREADS):
    q.put(None)

print(f"\n[*] TCP scan done. Open ports: {sorted(open_tcp)}")

# UDP probe common + RuiDa ports
print(f"\n[*] UDP probes...")
udp_ports_to_try = [53, 67, 68, 69, 123, 137, 161, 500, 520, 1900, 5000, 5353,
                    50200, 50201, 50202, 8000, 23456, 161, 162, 1883, 5683]
udp_results = {}
for p in udp_ports_to_try:
    # Try a few payloads
    for label, payload in [
        ("zero", b"\x00"),
        ("ruida", bytes([0x53, 0x08, 0x08])),  # scrambled DA 00 00
        ("hello", b"hello"),
    ]:
        r = udp_probe(p, payload)
        if r:
            print(f"  [+] UDP {p} ({label}): {r.hex()}")
            udp_results[f"{p}_{label}"] = r.hex()
            break

# Save
results = {
    "timestamp": datetime.now().isoformat(),
    "controller_ip": CONTROLLER_IP,
    "open_tcp_ports": sorted(open_tcp),
    "udp_responses": udp_results,
}
with open("full_scan_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\n" + "=" * 60)
print("  SCAN COMPLETE - full_scan_results.json saved")
print("=" * 60)
