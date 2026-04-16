"""
HF-LPB100 style discovery via UDP broadcast.

High-Flying modules (MAC prefix b8:3d:fb) listen on UDP 48899 for a specific
magic string and respond with their IP, MAC, and module name. This is the
official, documented protocol for finding and configuring them.

The catch: they respond ONLY to broadcast, not unicast. So we broadcast
the magic on 255.255.255.255:48899 and listen for replies.
"""
import sys, socket, time, struct

BIND = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.169"
SUBNET_BCAST = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.255"
ROUNDS = int(sys.argv[3]) if len(sys.argv) > 3 else 10

# Multiple magic strings used across different HF firmware versions
MAGICS = [
    (b"HF-A11ASSISTHREAD", "HF-A11 standard"),
    (b"www.usr.cn",         "USR-IOT variant"),
    (b"WhoAreYou",           "WhoAreYou probe"),
    (b"Who is USR",          "USR alt"),
    (b"HF-A11",              "short HF-A11"),
    (b"\x01\x02\x03\x04\x05\x06\x07\x08", "binary hello"),
]

def main():
    print(f"HF discovery scan: broadcasting on {SUBNET_BCAST}:48899 from {BIND}")
    print(f"(also trying global broadcast 255.255.255.255)\n")

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((BIND, 0))
    s.settimeout(0.5)

    found = {}   # ip -> (last_reply_text, magic_that_worked)

    for round_i in range(ROUNDS):
        for magic, label in MAGICS:
            # Send to subnet broadcast AND global broadcast
            for target in (SUBNET_BCAST, "255.255.255.255"):
                try:
                    s.sendto(magic, (target, 48899))
                except Exception as e:
                    pass
            # Listen for up to 300ms
            t_end = time.time() + 0.3
            while time.time() < t_end:
                try:
                    data, addr = s.recvfrom(4096)
                except socket.timeout:
                    break
                except Exception:
                    break
                ip = addr[0]
                # Ignore our own echoes
                if ip == BIND: continue
                try:
                    text = data.decode(errors="replace")
                except:
                    text = data.hex()
                # Only note new responses
                sig = (ip, text[:200])
                if sig not in found:
                    found[sig] = label
                    print(f"  [REPLY from {ip}]  magic='{label}'")
                    print(f"    raw ({len(data)}B): {text}")
                    print(f"    hex: {data[:80].hex(' ')}")
                    print()

        print(f"  round {round_i+1}/{ROUNDS} done, {len(found)} unique replies so far", flush=True)

    print()
    print("=" * 60)
    if found:
        print(f"FOUND {len(found)} HF-like responder(s)")
    else:
        print("No HF-style responders replied to any probe.")
        print()
        print("Means one of:")
        print("  - The WiFi module's UDP 48899 config is firewalled/disabled")
        print("  - The module is on a different broadcast domain")
        print("  - The module needs a specific non-standard magic string")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
    except Exception as e:
        print(f"Error: {e}")
