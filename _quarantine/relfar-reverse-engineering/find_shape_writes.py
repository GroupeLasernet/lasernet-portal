"""
Scan WS.pcapng for any frames touching 0x130B (scan_type) and dump context.

We want to know:
  1. Did the RDWelder app ever write to 0x130B during capture?
  2. If yes, what frames came immediately before/after each write?
     -> reveals any "edit mode" / "commit" sequence the app uses.
  3. If no, we'll need a fresh capture where Hugo specifically toggles shapes.
"""
import sys
from scapy.all import rdpcap, TCP, Raw

PCAP = sys.argv[1] if len(sys.argv) > 1 else "/sessions/wonderful-festive-rubin/mnt/uploads/WS.pcapng"
TARGET_ADDR = 0x130B
CONTEXT = 6  # frames before/after each hit

MAGIC = b"\x5A\xA5\x05"

def parse_frames(payload):
    """Yield (cmd, addr, value) tuples for each 8-byte frame in payload."""
    i = 0
    while i + 8 <= len(payload):
        if payload[i:i+3] != MAGIC:
            i += 1
            continue
        cmd  = payload[i+3]
        addr = int.from_bytes(payload[i+4:i+6], "big")
        val  = int.from_bytes(payload[i+6:i+8], "big")
        yield (cmd, addr, val)
        i += 8

def name_cmd(c):
    return {0x58: "READ_REQ", 0x82: "READ_RSP", 0x83: "WRITE   "}.get(c, f"0x{c:02X}    ")

print(f"Loading {PCAP} ...")
pkts = rdpcap(PCAP)
print(f"Got {len(pkts)} packets.\n")

# Build a flat timeline of (pkt_index, time, src->dst, cmd, addr, val)
timeline = []
for idx, p in enumerate(pkts):
    if TCP not in p or Raw not in p:
        continue
    if p[TCP].sport != 123 and p[TCP].dport != 123:
        continue
    src = f"{p['IP'].src}:{p[TCP].sport}"
    dst = f"{p['IP'].dst}:{p[TCP].dport}"
    direction = "C->S" if p[TCP].dport == 123 else "S->C"
    for f in parse_frames(bytes(p[Raw].load)):
        timeline.append((idx, float(p.time), direction, *f))

print(f"Parsed {len(timeline)} protocol frames on port 123.\n")

# Find every frame mentioning 0x130B
hits = [i for i, e in enumerate(timeline) if e[4] == TARGET_ADDR]
writes = [i for i in hits if timeline[i][3] == 0x83]
reads  = [i for i in hits if timeline[i][3] in (0x58, 0x82)]

print(f"Frames touching 0x{TARGET_ADDR:04X}: {len(hits)} total")
print(f"  WRITES (0x83): {len(writes)}")
print(f"  READS  (req+rsp): {len(reads)}\n")

if not writes:
    print("=> The app never wrote 0x130B during this capture.")
    print("   Need a fresh capture where you toggle scan_type a few times.\n")
else:
    print("=== WRITE EVENTS WITH CONTEXT ===\n")
    for h in writes:
        lo = max(0, h - CONTEXT)
        hi = min(len(timeline), h + CONTEXT + 1)
        print(f"--- write #{h} at t={timeline[h][1]:.3f} ---")
        for i in range(lo, hi):
            idx, t, dir_, cmd, addr, val = timeline[i]
            mark = " <<<<" if i == h else ""
            print(f"  pkt{idx:>5}  t={t:.3f}  {dir_}  {name_cmd(cmd)}  "
                  f"0x{addr:04X} = {val:5d} (0x{val:04X}){mark}")
        print()

# Also show distinct addresses ever written, so we know what the app touched
written_addrs = sorted({e[4] for e in timeline if e[3] == 0x83})
print("All addresses ever written by app:")
for a in written_addrs:
    n_writes = sum(1 for e in timeline if e[3] == 0x83 and e[4] == a)
    print(f"  0x{a:04X}  ({n_writes} writes)")
