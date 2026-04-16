"""
Port-scan the Relfar controller for hidden services.

We've only been talking to it on TCP:123. Many WiFi IoT devices expose a
second config channel — web admin on :80, UDP discovery on :48899 / :6454,
telnet on :23, etc. If we find one, the IP config problem might solve itself.
"""
import sys, socket, time

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
BIND = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.2"

# TCP ports worth checking — web admin, telnet, SSH, common IoT config
TCP_PORTS = [
    21,    # FTP
    22,    # SSH
    23,    # Telnet
    53,    # DNS
    80,    # HTTP — web admin
    81,    # alt HTTP
    102,   # Siemens / industrial
    123,   # our known port
    443,   # HTTPS
    502,   # Modbus-TCP (!)
    554,   # RTSP
    1883,  # MQTT
    2000,  # alt industrial
    4000,
    5000,
    5001,
    7000,
    8000,  # alt HTTP
    8080,  # common web admin
    8888,
    9000,
    9100,
    9999,  # common IoT config
    10000,
    20000,
    48899, # HF-LPB100 (WiFi module!) config port — very common on RuiDa boards
]

# UDP ports — many IoT devices respond to broadcast/discovery
UDP_PORTS = [
    123,
    161,   # SNMP
    1900,  # UPnP
    5353,  # mDNS
    6454,  # Art-Net
    48899, # HF-LPB100 module discovery
    49000,
    50000,
]

def tcp_check(host, port, timeout=0.8):
    """Return True if TCP port accepts a connection."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.bind((BIND, 0))
        r = s.connect_ex((host, port))
        s.close()
        return r == 0
    except Exception as e:
        return False


def http_probe(host, port, timeout=1.5):
    """Try HTTP GET, return first line of response if any."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.bind((BIND, 0))
        s.connect((host, port))
        s.sendall(b"GET / HTTP/1.0\r\nHost: " + host.encode() + b"\r\n\r\n")
        data = b""
        while True:
            try:
                chunk = s.recv(4096)
                if not chunk: break
                data += chunk
                if len(data) > 8192: break
            except socket.timeout:
                break
        s.close()
        return data[:500].decode(errors="replace") if data else None
    except Exception:
        return None


def udp_probe(host, port, payload, timeout=1.0):
    """Send UDP payload, listen for any reply."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.bind((BIND, 0))
        s.settimeout(timeout)
        s.sendto(payload, (host, port))
        data, addr = s.recvfrom(4096)
        s.close()
        return data
    except Exception:
        return None


def main():
    print(f"Scanning {HOST} from {BIND}...\n")

    # ---- TCP scan ----
    print("=" * 60)
    print("TCP PORTS")
    print("=" * 60)
    open_tcp = []
    for port in TCP_PORTS:
        if tcp_check(HOST, port):
            print(f"  [OPEN]  TCP :{port}")
            open_tcp.append(port)
        else:
            print(f"  .       TCP :{port}")

    if not open_tcp:
        print("\n  No extra TCP ports open.")
    elif len(open_tcp) == 1 and open_tcp[0] == 123:
        print("\n  Only TCP:123 open (our known port). No hidden TCP service.")
    else:
        extras = [p for p in open_tcp if p != 123]
        print(f"\n  *** FOUND {len(extras)} extra TCP service(s): {extras} ***")

    # ---- HTTP probe on any open web-ish port ----
    print()
    print("=" * 60)
    print("HTTP PROBES")
    print("=" * 60)
    for port in (80, 81, 8000, 8080, 8888):
        if port in open_tcp:
            print(f"\n  GET http://{HOST}:{port}/")
            resp = http_probe(HOST, port)
            if resp:
                print("  ---- RESPONSE ----")
                for line in resp.splitlines()[:15]:
                    print(f"    {line}")
                print("  ------------------")
            else:
                print("    (no response)")

    # ---- UDP scan ----
    print()
    print("=" * 60)
    print("UDP PROBES (IoT discovery)")
    print("=" * 60)

    # Common discovery payloads
    probes = [
        ("HF-LPB100 module", 48899, b"HF-A11ASSISTHREAD"),
        ("HF-LPB100 broadcast", 48899, b"www.usr.cn"),
        ("generic hello",     48899, b"hello"),
        ("zero probe 123",    123,   b"\x00" * 8),
        ("magic probe 123",   123,   b"\x5A\xA5\x05\x58\x00\x00\x00\x00"),
        ("mdns",              5353,  b"\x00"*12),
    ]
    for name, port, payload in probes:
        reply = udp_probe(HOST, port, payload)
        if reply:
            hex_s = reply[:80].hex(" ")
            ascii_s = "".join(c if 32 <= ord(c) < 127 else "." for c in reply[:80].decode(errors="replace"))
            print(f"  [REPLY] UDP :{port} ({name})")
            print(f"          hex:   {hex_s}")
            print(f"          ascii: {ascii_s}")
        else:
            print(f"  .       UDP :{port} ({name}) — no reply")

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    extras = [p for p in open_tcp if p != 123]
    if extras:
        print(f"  Extra TCP ports: {extras}")
        print(f"  Try opening http://{HOST}:{extras[0]}/ in a browser")
    else:
        print("  No extra TCP service found.")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
