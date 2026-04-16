"""
Hunt for the registers holding the controller's IP address.

Strategy: scan a wide range of registers and look for any that contain
the known IP octets (192, 168, 1, 5) or the 16-bit halves (0xC0A8, 0x0105).

Once found, you can write to those registers to change the IP without
needing the HMI WiFi page (which on this unit doesn't expose IP settings).
"""
import sys, time
from relfar_protocol import RelfarClient

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
BIND = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.2"

# IP we expect the controller currently has
EXPECTED_IP = (192, 168, 1, 5)
EXPECTED_HALVES = (
    (EXPECTED_IP[0] << 8) | EXPECTED_IP[1],   # 0xC0A8 = 49320
    (EXPECTED_IP[2] << 8) | EXPECTED_IP[3],   # 0x0105 = 261
)

# Also worth flagging — common subnet/gateway/MAC related values
INTERESTING_VALUES = set(EXPECTED_IP) | set(EXPECTED_HALVES) | {
    255, 0xFFFF, 0xFF00,        # subnet mask pieces
    0xC0A80101,                  # full IP as 32-bit (rarely fits in one reg)
}

# Wide scan ranges — IP/network config is usually in a "device config" block
# separate from process params. Common locations on RuiDa controllers:
RANGES = [
    (0x0000, 0x00FF),    # very low addresses — sometimes device config
    (0x0100, 0x01FF),    # network config block on some firmware
    (0x0200, 0x02FF),
    (0x0E00, 0x0EFF),    # WiFi config block on some boards
    (0x0F00, 0x0FFF),
    (0x1000, 0x10FF),    # we've seen IO config here
    (0x1700, 0x17FF),    # we've seen some sensor values here
    (0x2000, 0x20FF),    # 0x210A/B used for handshake — block worth scanning
    (0x2100, 0x21FF),
    (0x2200, 0x22FF),
    (0x3000, 0x30FF),    # config block on some firmware
    (0xF000, 0xF0FF),    # vendor-reserved on some chips
]

def main():
    print(f"Connecting to {HOST}:123 from {BIND} ...")
    c = RelfarClient(host=HOST, bind_ip=BIND, timeout=2.0)
    c.connect()
    print("Connected. Scanning a wide register range — this may take a few minutes...\n")

    snap = {}
    total = sum(b - a + 1 for a, b in RANGES)
    n = 0
    t0 = time.time()
    for lo, hi in RANGES:
        for a in range(lo, hi + 1):
            n += 1
            try:
                v, _ = c.read(a)
                if v is not None:
                    snap[a] = v
            except Exception:
                pass
            if n % 100 == 0:
                pct = 100*n/total
                print(f"  ...{n}/{total} ({pct:.0f}%, {len(snap)} live regs, {time.time()-t0:.0f}s elapsed)",
                      flush=True)

    print(f"\nScan complete: {len(snap)} live registers found.\n")

    # Find any register holding an IP-shaped value
    print("=" * 60)
    print("REGISTERS HOLDING SUSPICIOUS IP-SHAPED VALUES")
    print("=" * 60)
    hits = []
    for a, v in sorted(snap.items()):
        if v in INTERESTING_VALUES:
            label = ""
            if v in EXPECTED_IP: label = f"  ← matches octet {v}"
            if v in EXPECTED_HALVES: label = f"  ← matches 0x{v:04X} (IP half)"
            hits.append((a, v, label))
            print(f"  0x{a:04X}  =  {v:>5} (0x{v:04X}){label}")

    # Look for *consecutive* registers matching consecutive IP octets — the smoking gun
    print()
    print("=" * 60)
    print("CONSECUTIVE-OCTET PATTERNS (most likely the IP field)")
    print("=" * 60)
    found_pattern = False
    addrs = sorted(snap.keys())
    for a in addrs:
        # check 4-octet pattern starting at a
        if all((a+i in snap and snap[a+i] == EXPECTED_IP[i]) for i in range(4)):
            print(f"  *** IP STORED AS 4 BYTES AT 0x{a:04X}..0x{a+3:04X} ***")
            print(f"      0x{a:04X} = 192,  0x{a+1:04X} = 168,  0x{a+2:04X} = 1,  0x{a+3:04X} = 5")
            found_pattern = True
        # check 2-half pattern
        if (a in snap and snap[a] == EXPECTED_HALVES[0]
            and a+1 in snap and snap[a+1] == EXPECTED_HALVES[1]):
            print(f"  *** IP STORED AS 2 WORDS AT 0x{a:04X}..0x{a+1:04X} ***")
            print(f"      0x{a:04X} = 0xC0A8 (192.168),  0x{a+1:04X} = 0x0105 (1.5)")
            found_pattern = True
    if not found_pattern:
        print("  (no consecutive-octet pattern found in scanned ranges)")
        print("  The IP may be in a register range we didn't scan,")
        print("  or stored in a different encoding (e.g., 32-bit across 2 regs).")

    # Save full dump for reference
    out = "register_scan.txt"
    with open(out, "w") as f:
        f.write("# Full register scan\n")
        for a, v in sorted(snap.items()):
            f.write(f"0x{a:04X} = {v} (0x{v:04X})\n")
    print(f"\nFull scan saved to {out} ({len(snap)} registers).")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
