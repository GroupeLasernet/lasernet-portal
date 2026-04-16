"""
Probe how many scan_type shapes this firmware supports.

Strategy: read original, walk values 1..30, write each, read back,
flag which the controller accepts. Restore original at the end.
Safe: never starts the laser, only writes the pattern selector.
"""
import sys, time
from relfar_protocol import RelfarClient

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
BIND = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.2"
ADDR = 0x130B  # scan_type register
MAX_PROBE = 32

c = RelfarClient(host=HOST, bind_ip=BIND, timeout=3.0)
print(f"Connecting {HOST} (bind={BIND})...")
c.connect()

# Read original (use block dump so we definitely see it)
c.poll_block(0x1300, wait=2.0)
original = c.registers.get(ADDR)
print(f"Original scan_type = {original}\n")

accepted = []
rejected = []
for v in range(1, MAX_PROBE + 1):
    c.write(ADDR, v)
    time.sleep(0.15)
    c.poll_block(0x1300, wait=0.6)
    readback = c.registers.get(ADDR)
    ok = (readback == v)
    flag = "OK " if ok else "no "
    print(f"  write {v:>3}  ->  read back {readback:>3}   [{flag}]")
    (accepted if ok else rejected).append(v)

print()
print(f"Accepted shape IDs: {accepted}")
print(f"Highest accepted ID: {max(accepted) if accepted else 'none'}")
print(f"Rejected           : {rejected}")

# Restore
if original is not None:
    print(f"\nRestoring scan_type = {original}")
    c.write(ADDR, original)

c.close()
print("Done.")
