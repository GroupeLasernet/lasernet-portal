"""
WiFi-to-Serial bridge discovery.
Tries the standard discovery protocols used by HLK-RM04, USR-WIFI232,
HF-LPB100, and similar Chinese OEM WiFi modules.
"""
import socket
import json
from datetime import datetime

LOCAL = "192.168.1.2"
TARGET = "192.168.1.5"
BROADCAST = "192.168.1.255"

def udp_send_recv(dest_ip, port, payload, timeout=3, broadcast=False):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.bind((LOCAL, 0))
        if broadcast:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.settimeout(timeout)
        s.sendto(payload, (dest_ip, port))
        responses = []
        try:
            while True:
                data, addr = s.recvfrom(4096)
                responses.append((addr, data))
                if len(responses) > 5: break
        except socket.timeout:
            pass
        s.close()
        return responses
    except Exception as e:
        return f"ERROR: {e}"

tests = [
    # (label, dest, port, payload, broadcast)
    ("HF_assist_direct",    TARGET,    48899, b"HF-A11ASSISTHREAD", False),
    ("HF_assist_broadcast", BROADCAST, 48899, b"HF-A11ASSISTHREAD", True),
    ("HLK_search",          BROADCAST, 988,   b"HLK", True),
    ("HLK_query",           TARGET,    988,   b"HLK", False),
    ("USR_plus",            TARGET,    48899, b"+++", False),
    ("USR_plus_broadcast",  BROADCAST, 48899, b"+++", True),
    ("wwww_broadcast",      BROADCAST, 1901,  b"wwww", True),
    ("at_command",          TARGET,    48899, b"AT+VER\r\n", False),
    ("rd_broadcast_8899",   BROADCAST, 8899,  b"\xda\x00\x00", True),
    ("ruida_discover_udp",  BROADCAST, 50200, b"\xda\x00\x00", True),
    ("query_8899",          TARGET,    8899,  b"\x00", False),
    ("query_9999",          TARGET,    9999,  b"\x00", False),
    ("query_988",           TARGET,    988,   b"\x00", False),
    ("discover_all_F",      BROADCAST, 48899, b"\xff\xff\xff\xff", True),
    ("generic_discover",    BROADCAST, 48899, b"DISCOVER", True),
    # RuiDa cloud/app specific
    ("rd_hello_30000",      TARGET,    30000, b"Hello", False),
    ("rd_hello_40000",      TARGET,    40000, b"Hello", False),
    ("rd_hello_5000",       TARGET,    5000,  b"Hello", False),
    # Also try larger common ranges
    ("query_23456",         TARGET,    23456, b"\x00", False),
    ("query_12345",         TARGET,    12345, b"\x00", False),
]

print("=" * 60)
print("  WiFi-to-Serial Module Discovery")
print(f"  Target: {TARGET}  Broadcast: {BROADCAST}")
print("=" * 60)

results = {"timestamp": datetime.now().isoformat(), "probes": {}}

for label, dest, port, payload, broadcast in tests:
    tag = "BCAST" if broadcast else "UNICAST"
    print(f"\n[{tag}] {label}: {dest}:{port} <- {payload!r}")
    r = udp_send_recv(dest, port, payload, broadcast=broadcast)
    if isinstance(r, str):
        print(f"  {r}")
        results["probes"][label] = {"error": r}
    elif r:
        for addr, data in r:
            print(f"  [+] FROM {addr[0]}:{addr[1]}")
            print(f"      HEX: {data.hex()}")
            try:
                print(f"      TXT: {data.decode('utf-8', errors='replace')[:200]}")
            except: pass
        results["probes"][label] = [
            {"from": f"{a[0]}:{a[1]}", "hex": d.hex(),
             "text": d.decode("utf-8", errors="replace")[:200]}
            for a, d in r
        ]
    else:
        print("  [no response]")
        results["probes"][label] = None

with open("discover_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\n" + "=" * 60)
print("  DISCOVERY COMPLETE - discover_results.json saved")
print("=" * 60)
