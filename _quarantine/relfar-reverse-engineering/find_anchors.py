"""
Find "anchor" registers that trigger block dumps from the controller.

The controller's protocol works like this: reading certain anchor addresses
(e.g. 0x1300 = cleaning block trigger) causes the controller to push back a
whole block of related registers. Reading non-anchor addresses gets nothing.

This script tries lots of candidate anchors quickly and shows what comes back.
We're hunting for the network-config block which presumably contains the IP.
"""
import sys, time, struct, socket
from relfar_protocol import RelfarClient, build_read, MAGIC

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
BIND = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.2"

# Known anchor: 0x1300 → cleaning block dump
# Known: 0x210A/0x210B → handshake values
# Try every multiple of 0x100 across a wide range — these are typical block heads
CANDIDATES = []
# FINER-GRAIN SCAN: every 0x10 in promising regions (network config typically
# lives in low addresses or near vendor-config blocks).
FINE_RANGES = [
    (0x0000, 0x0FFF),     # very low — common network config region
    (0x1700, 0x1FFF),     # we saw 0x1751 in app reads
    (0x2000, 0x2FFF),     # 0x210A/B handshake area
    (0x3000, 0x3FFF),     # next block
]
for lo, hi in FINE_RANGES:
    for a in range(lo, hi + 1, 0x10):
        CANDIDATES.append(a)
# Also keep the coarse 0x100-step scan for higher addresses
for base in range(0x4000, 0xFF00, 0x100):
    CANDIDATES.append(base)

EXPECTED_OCTETS = {192, 168, 1, 5, 250}  # known IP octets

def probe_anchor(client, anchor, wait=0.4):
    """Read an anchor and capture every frame the controller pushes back."""
    with client.lock:
        client.sock.sendall(build_read(anchor))
        client.sock.settimeout(0.05)
        deadline = time.time() + wait
        buf = b""
        while time.time() < deadline:
            try:
                chunk = client.sock.recv(4096)
                if not chunk: break
                buf += chunk
            except socket.timeout:
                continue
            except Exception:
                break
        client.sock.settimeout(client.timeout)
    # parse frames
    frames = []
    i = 0
    while i + 8 <= len(buf):
        if buf[i:i+3] != MAGIC:
            i += 1; continue
        cmd = buf[i+3]
        addr, val = struct.unpack(">HH", buf[i+4:i+8])
        frames.append((cmd, addr, val))
        i += 8
    return frames


def main():
    print(f"Connecting to {HOST}:123 from {BIND} ...")
    c = RelfarClient(host=HOST, bind_ip=BIND, timeout=2.0)
    c.connect()
    print(f"Connected. Probing {len(CANDIDATES)} anchor candidates...\n")

    # Drain initial heartbeat traffic
    time.sleep(0.5)
    try:
        c.sock.settimeout(0.1)
        while True:
            chunk = c.sock.recv(4096)
            if not chunk: break
    except: pass
    c.sock.settimeout(c.timeout)

    productive = []  # anchors that returned something
    ip_block_candidates = []
    t0 = time.time()
    for i, anchor in enumerate(CANDIDATES):
        try:
            frames = probe_anchor(c, anchor)
        except Exception as e:
            print(f"  ERROR at 0x{anchor:04X}: {e}")
            continue
        # filter out heartbeats (0x1313 every 310ms) — we read those a lot
        useful = [(cmd, a, v) for (cmd, a, v) in frames
                  if a != 0x1313 or anchor == 0x1313]
        # also skip if only frame is the anchor itself coming back as 0
        if useful:
            productive.append((anchor, useful))
            # check for IP-octet hits
            octets_present = {v for _,_,v in useful if v in EXPECTED_OCTETS}
            if len(octets_present) >= 3:
                ip_block_candidates.append((anchor, octets_present, useful))
        if (i+1) % 25 == 0:
            print(f"  ...{i+1}/{len(CANDIDATES)} probed, {len(productive)} productive ({time.time()-t0:.0f}s)",
                  flush=True)

    print(f"\nDone in {time.time()-t0:.0f}s.\n")
    print("=" * 70)
    print(f"PRODUCTIVE ANCHORS ({len(productive)} found)")
    print("=" * 70)
    for anchor, frames in productive:
        addrs = sorted({a for _,a,_ in frames})
        print(f"\n  ANCHOR 0x{anchor:04X}  →  block of {len(addrs)} regs: "
              f"{', '.join(f'0x{a:04X}' for a in addrs[:10])}"
              f"{'...' if len(addrs)>10 else ''}")
        for cmd, a, v in frames[:30]:
            mark = ""
            if v in EXPECTED_OCTETS: mark = f"  ← octet candidate ({v})"
            if v in (0xC0A8,): mark = "  ← 0xC0A8 = 192.168 !!!"
            print(f"      0x{a:04X} = {v:>6} (0x{v:04X}){mark}")
        if len(frames) > 30:
            print(f"      ... and {len(frames)-30} more")

    print()
    print("=" * 70)
    print("LIKELY IP BLOCK CANDIDATES (anchor returning ≥3 known IP octets)")
    print("=" * 70)
    if not ip_block_candidates:
        print("  (none — IP block not found in this anchor set)")
    for anchor, octets, frames in ip_block_candidates:
        print(f"\n  ANCHOR 0x{anchor:04X} returned octets {sorted(octets)}:")
        for cmd, a, v in frames:
            tag = "  ← IP octet" if v in EXPECTED_OCTETS else ""
            print(f"      0x{a:04X} = {v}{tag}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
