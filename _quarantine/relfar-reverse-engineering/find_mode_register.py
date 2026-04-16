"""
Find the register that changes when you switch HMI mode (cleaning <-> welding).

Workflow:
  1. Make sure the HMI is on CLEANING mode.
  2. Run this script. It dumps a range of registers (snapshot A).
  3. When prompted, flip the HMI to WELDING mode (touch the HMI tab).
  4. Press ENTER. It dumps again (snapshot B) and prints the diff.

Any register whose value changed between A and B is a candidate for the mode flag.
"""
import sys, time
from relfar_protocol import RelfarClient, build_read

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
BIND = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.2"

# Register ranges to probe — wide net covering known/suspected mode/config blocks.
# Skip the cleaning param block (0x1303..0x130B) since values may legitimately differ
# between cleaning presets and welding presets without indicating a mode flag.
RANGES = [
    (0x1000, 0x10FF),   # IO, mode flags, config block
    (0x1100, 0x11FF),   # mode_xxxx registers we saw in original capture
    (0x1200, 0x12FF),   # unknown territory
    (0x1300, 0x1302),   # block trigger area
    (0x130C, 0x131F),   # status registers (after cleaning params)
    (0x1320, 0x13FF),   # process params + further unknowns
    (0x1400, 0x14FF),   # potential welding-mode block
    (0x1500, 0x15FF),
    (0x1700, 0x17FF),
]

def dump(client):
    """Read every register in RANGES. Returns dict {addr: value}."""
    snap = {}
    total = sum(b - a + 1 for a, b in RANGES)
    n = 0
    for lo, hi in RANGES:
        for a in range(lo, hi + 1):
            n += 1
            try:
                v, _ = client.read(a)
                if v is not None:
                    snap[a] = v
                if n % 50 == 0:
                    print(f"  ...{n}/{total} read", flush=True)
            except Exception as e:
                # some registers may simply not respond — skip
                pass
    return snap


def main():
    print(f"Connecting to {HOST}:123 from {BIND} ...")
    c = RelfarClient(host=HOST, bind_ip=BIND, timeout=2.0)
    c.connect()
    print("Connected.\n")

    print("STEP 1 — make sure HMI is on CLEANING mode, then press ENTER.")
    input()
    print("Dumping snapshot A (this takes ~30s) ...")
    A = dump(c)
    print(f"Got {len(A)} live registers.\n")

    print("STEP 2 — switch the HMI to WELDING mode now, then press ENTER.")
    input()
    time.sleep(0.5)
    print("Dumping snapshot B ...")
    B = dump(c)
    print(f"Got {len(B)} live registers.\n")

    # Diff
    all_addrs = sorted(set(A) | set(B))
    diffs = [(a, A.get(a), B.get(a)) for a in all_addrs if A.get(a) != B.get(a)]

    print("=" * 60)
    print(f"DIFFERENCES: {len(diffs)} registers changed")
    print("=" * 60)
    for a, va, vb in diffs:
        # filter noise: heartbeat status registers are expected to wiggle
        note = ""
        if a in (0x1313, 0x1315):
            note = "  (heartbeat — ignore)"
        print(f"  0x{a:04X}  CLEANING={va!s:>6}  ->  WELDING={vb!s:>6}{note}")

    print()
    print("Most likely mode flag = whichever register is NOT a heartbeat,")
    print("changed cleanly (e.g., 0->1 or 1->2), and isn't a value you'd expect")
    print("to be different across presets.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
