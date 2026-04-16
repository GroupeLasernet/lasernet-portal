"""
v2 probe: test writes that don't overwrite the 0xFF terminator byte.

Targets tried (in order, each one safer than the last):
  - 0x1733 (middle of DNS field — '0' '0') → change to '1' '0'
  - 0x1720 (first half of IP field — '0' '0') → change to '1' '0'
  - high byte only of 0x1734 (keep 0xFF terminator intact) → change '0' to '1'

After each write:
  1. direct read of the target register (some regs respond)
  2. full 0x1504 anchor dump (snapshots the block as-seen)
  3. compare both

If the ack is 0x82 0x1504 0, we take that as 'rejected'. If either readback
shows our new value, write was accepted.
"""
import sys, time, struct
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

def fmt_reg(val):
    if val is None: return "(none)"
    hi = (val >> 8) & 0xFF; lo = val & 0xFF
    ap = ""
    for b in (hi, lo):
        ap += chr(b) if 32 <= b < 127 else f"\\x{b:02X}"
    return f"0x{val:04X} ({val:>5}) '{ap}'"


def block_snapshot(client):
    for a in NETWORK_REGS: client.registers.pop(a, None)
    client.poll_block(0x1504, wait=1.2)
    return {a: client.registers.get(a) for a in NETWORK_REGS}


def print_block(label, snap):
    print(f"  {label}")
    for a in NETWORK_REGS:
        print(f"    0x{a:04X} = {fmt_reg(snap.get(a))}")


def classify_ack(frames, target_addr, target_value):
    """What kind of response did the controller send to our write?"""
    labels = []
    for cmd, a, v in frames:
        if cmd == CMD_WRITE and a == target_addr and v == target_value:
            labels.append("normal-write-ack")
        elif cmd == CMD_READ_RESP and a == 0x1504 and v == 0:
            labels.append("ANCHOR-STATUS-0  (likely 'rejected')")
        elif cmd == CMD_READ_RESP and a == 0x1504:
            labels.append(f"anchor-status-{v}")
        elif a == target_addr:
            labels.append(f"echo-{a:04X}={v}")
        else:
            labels.append(f"other cmd=0x{cmd:02X} a=0x{a:04X} v={v}")
    return labels


def try_write(c, target, new_val, baseline_snap):
    orig = baseline_snap.get(target)
    print("-" * 60)
    print(f"TEST WRITE: 0x{target:04X}")
    print(f"  Baseline: {fmt_reg(orig)}")
    print(f"  Writing:  {fmt_reg(new_val)}")
    ack = c.write(target, new_val)
    print(f"  Ack frames ({len(ack)}):")
    for cmd, a, v in ack:
        print(f"    cmd=0x{cmd:02X}  addr=0x{a:04X}  val={v}  (0x{v:04X})")
    classification = classify_ack(ack, target, new_val)
    print(f"  Classification: {classification}")
    time.sleep(0.4)
    # Direct read of target
    direct, direct_frames = c.read(target)
    print(f"  Direct read 0x{target:04X}: {fmt_reg(direct)}")
    # Anchor re-read
    after = block_snapshot(c)
    anchor_val = after.get(target)
    print(f"  Anchor read 0x{target:04X}: {fmt_reg(anchor_val)}")
    # Interpretation
    if direct == new_val or anchor_val == new_val:
        print("  >>> WRITE ACCEPTED")
        return True, after
    else:
        print("  >>> write NOT reflected in either readback")
        return False, after


def main():
    print("=" * 70)
    print(f"  NETWORK REGS — SAFER WRITE PROBE  host={HOST}  bind={BIND}")
    print("=" * 70)
    c = RelfarClient(host=HOST, bind_ip=BIND, timeout=3.0)
    c.connect()
    print("Connected.\n")

    baseline = block_snapshot(c)
    print_block("BASELINE", baseline)

    accepted_any = False
    # Each test: (target addr, new_value, rationale)
    tests = [
        # 0x1733 is middle of DNS field, currently 0x3030 ("00"), no terminator
        (0x1733, 0x3130, "middle of DNS (no terminator bytes involved)"),
        # 0x1720 is first half of IP field, currently 0x3030
        (0x1720, 0x3130, "first half of IP field"),
        # High byte of 0x1734 (keep low byte 0xFF terminator)
        (0x1734, 0x31FF, "high byte of DNS last reg (preserve 0xFF terminator)"),
    ]
    for addr, val, why in tests:
        print(f"\n### {why}")
        ok, after = try_write(c, addr, val, baseline)
        if ok:
            accepted_any = True
            # Restore
            orig = baseline.get(addr)
            print(f"  Restoring 0x{addr:04X} to {fmt_reg(orig)}")
            c.write(addr, orig)
            time.sleep(0.3)
            block_snapshot(c)  # refresh cache
            break   # don't keep writing after first success

    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    if accepted_any:
        print("  At least one write was accepted — block IS writable with careful format.")
        print("  Next step: write real IP values and reboot to verify EEPROM persistence.")
    else:
        print("  Every write was rejected (ack = anchor-status-0).")
        print("  The block is write-protected.")
        print("  Possibilities:")
        print("    - Requires an 'edit mode' unlock sequence we don't know")
        print("    - Writes must come from a specific client (the HMI, not TCP)")
        print("    - IP config is handled outside this register block entirely")
        print("  Safe recommendation: do NOT brute-force further — use router")
        print("  DHCP reservation for the controller's MAC b8:3d:fb:a7:20:21.")

    c.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
    except Exception as e:
        import traceback
        print(f"\nERROR: {e}")
        traceback.print_exc()
