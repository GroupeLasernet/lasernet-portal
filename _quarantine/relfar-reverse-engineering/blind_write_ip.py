"""
BLIND write to the IP octet field at 0x1720-0x1722.

Hugo's explicit request after v3 probe showed all writes rejected.
Reasoning: the rejection signal ("anchor-status-0") might be a report-status
frame that we misread, and the write might actually be accepted silently
(especially since the first two v3 writes got ZERO ack frames at all — which
is different from the 0x1504=0 "rejection" we saw earlier).

Strategy:
  - Write "192" encoded as the 5-char field "00192" + 0xFF terminator
    (matches the exact layout we see in the baseline).
      0x1720 = 0x3030  ("00")
      0x1721 = 0x3139  ("19")
      0x1722 = 0x32FF  ("2" + 0xFF terminator preserved)
  - Poll the 0x1504 anchor and snapshot the ENTIRE network block
  - Compare to baseline; print any register that changed
  - Do NOT reboot — just observe. We can restore afterwards if needed.

Safety:
  - Stored originals before writing, so we can restore on demand.
  - Does NOT write to 0x1770/0x1771 (mode flags) so even if this succeeds,
    the controller should stay in DHCP mode and not be bricked.
  - Does NOT write to mask/gateway/DNS — only the first octet field.
"""
import sys, time
from relfar_protocol import RelfarClient, CMD_WRITE, CMD_READ_RESP

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
BIND = sys.argv[2] if len(sys.argv) > 2 else "192.168.1.2"

NETWORK_REGS = [
    0x1720, 0x1721, 0x1722,
    0x1726, 0x1727, 0x1728,
    0x172C, 0x172D, 0x172E,
    0x1732, 0x1733, 0x1734,
    0x1600, 0x1601, 0x1770, 0x1771,
]

# New values for the first octet field — encodes "00192\xFF"
WRITES = [
    (0x1720, 0x3030),  # "00"
    (0x1721, 0x3139),  # "19"
    (0x1722, 0x32FF),  # "2" + 0xFF terminator
]


def fmt(v):
    if v is None: return "(none)"
    hi = (v >> 8) & 0xFF; lo = v & 0xFF
    ap = ""
    for b in (hi, lo):
        ap += chr(b) if 32 <= b < 127 else f"\\x{b:02X}"
    return f"0x{v:04X} '{ap}'"


def snap(c):
    for a in NETWORK_REGS: c.registers.pop(a, None)
    c.poll_block(0x1504, wait=1.2)
    return {a: c.registers.get(a) for a in NETWORK_REGS}


def show(label, s):
    print(f"  {label}")
    for a in NETWORK_REGS:
        print(f"    0x{a:04X} = {fmt(s.get(a))}")


def main():
    print("=" * 70)
    print(f"  BLIND IP-OCTET WRITE  host={HOST}  bind={BIND}")
    print("=" * 70)
    c = RelfarClient(host=HOST, bind_ip=BIND, timeout=3.0)
    c.connect()
    print("Connected.\n")

    before = snap(c)
    show("BEFORE", before)

    print("\n--- Writing 3 registers (first IP octet = '192') ---")
    for addr, val in WRITES:
        print(f"  write 0x{addr:04X} = {fmt(val)}")
        ack = c.write(addr, val)
        for cmd, a, v in ack:
            print(f"    ack cmd=0x{cmd:02X} addr=0x{a:04X} val=0x{v:04X}")
        if not ack:
            print("    ack: (no frames — silent)")
        time.sleep(0.25)

    print("\n--- Re-reading the block ---")
    time.sleep(0.5)
    after = snap(c)
    show("AFTER", after)

    print("\n--- DIFF ---")
    changed = False
    for a in NETWORK_REGS:
        b = before.get(a); x = after.get(a)
        if b != x:
            changed = True
            print(f"  0x{a:04X}:  {fmt(b)}  ->  {fmt(x)}")
    if not changed:
        print("  (no registers changed — writes were rejected or cached only)")
    else:
        print("\n  >>> SOMETHING CHANGED. Do NOT reboot yet.")
        print("      If the IP field looks wrong, restore with:")
        for addr, _ in WRITES:
            orig = before.get(addr)
            print(f"        c.write(0x{addr:04X}, 0x{orig:04X})")

    c.close()
    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
    except Exception as e:
        import traceback
        print(f"\nERROR: {e}")
        traceback.print_exc()
