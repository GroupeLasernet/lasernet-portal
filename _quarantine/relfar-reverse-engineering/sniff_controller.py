"""
Passive sniffer — watch everything involving 192.168.1.250 (the controller).

On WiFi your PC can only see:
  - Traffic to/from your PC
  - Broadcast / multicast (ARP, mDNS, UPnP, DHCP)

It cannot see phone <-> controller unicast (encrypted per-station frames
delivered directly by the AP to the controller's NIC, never to yours).

Still useful for: ARP activity, UPnP announcements, seeing exactly what
our server sends and what comes back (RST? nothing? timeout?).

Requires Npcap (which Wireshark already installs).
"""
import sys, time, struct
from datetime import datetime
from scapy.all import sniff, IP, TCP, UDP, ARP, Raw, Ether

TARGET = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.250"
OUT_PCAP = sys.argv[2] if len(sys.argv) > 2 else "sniff_output.pcap"

MAGIC = b"\x5A\xA5\x05"

print("=" * 70)
print(f"  Sniffing everything involving {TARGET}")
print(f"  Saving to {OUT_PCAP}")
print(f"  Press Ctrl+C to stop")
print("=" * 70)
print()

stats = {"arp": 0, "tcp": 0, "udp": 0, "other": 0, "protocol_frames": 0}
captured = []

def format_proto_frame(data):
    """If data contains Relfar 5A A5 05 frames, parse them."""
    frames = []
    i = 0
    while i + 8 <= len(data):
        if data[i:i+3] == MAGIC:
            cmd = data[i+3]
            addr, val = struct.unpack(">HH", data[i+4:i+8])
            frames.append((cmd, addr, val))
            i += 8
        else:
            i += 1
    return frames


def handle(pkt):
    captured.append(pkt)

    ts = datetime.fromtimestamp(float(pkt.time)).strftime("%H:%M:%S.%f")[:-3]

    # ARP involving target
    if pkt.haslayer(ARP):
        a = pkt[ARP]
        if a.psrc == TARGET or a.pdst == TARGET:
            stats["arp"] += 1
            op = {1: "who-has", 2: "is-at"}.get(a.op, f"op{a.op}")
            print(f"[{ts}] ARP {op}  {a.psrc}({a.hwsrc}) -> {a.pdst}({a.hwdst})")
        return

    if not pkt.haslayer(IP):
        return
    ip = pkt[IP]
    if ip.src != TARGET and ip.dst != TARGET:
        return

    arrow = "->" if ip.src != TARGET else "<-"  # view from target's side
    other = ip.dst if ip.src == TARGET else ip.src

    if pkt.haslayer(TCP):
        stats["tcp"] += 1
        t = pkt[TCP]
        flags = []
        if t.flags & 0x02: flags.append("SYN")
        if t.flags & 0x10: flags.append("ACK")
        if t.flags & 0x01: flags.append("FIN")
        if t.flags & 0x04: flags.append("RST")
        if t.flags & 0x08: flags.append("PSH")
        flag_s = ",".join(flags) or "."
        payload = bytes(pkt[Raw].load) if pkt.haslayer(Raw) else b""
        line = f"[{ts}] TCP {TARGET}:{t.dport if ip.dst==TARGET else t.sport} {arrow} {other}:{t.sport if ip.dst==TARGET else t.dport}  [{flag_s}]  {len(payload)}B"
        if payload:
            line += f"  {payload[:20].hex(' ')}{'...' if len(payload)>20 else ''}"
        print(line)
        # decode Relfar frames
        if payload and MAGIC in payload:
            frames = format_proto_frame(payload)
            for cmd, addr, val in frames:
                stats["protocol_frames"] += 1
                print(f"           -> RELFAR  cmd=0x{cmd:02X}  addr=0x{addr:04X}  val={val} (0x{val:04X})")

    elif pkt.haslayer(UDP):
        stats["udp"] += 1
        u = pkt[UDP]
        payload = bytes(pkt[Raw].load) if pkt.haslayer(Raw) else b""
        sport = u.sport if ip.src == TARGET else u.dport
        dport = u.dport if ip.src == TARGET else u.sport
        line = f"[{ts}] UDP {TARGET}:{sport} {arrow} {other}:{dport}  {len(payload)}B"
        if payload:
            # mDNS/UPnP are text
            try:
                text = payload.decode(errors='replace')[:80].replace('\r','').replace('\n',' | ')
                if any(c.isalpha() for c in text[:20]):
                    line += f"  '{text}'"
                else:
                    line += f"  {payload[:20].hex(' ')}"
            except:
                line += f"  {payload[:20].hex(' ')}"
        print(line)

    else:
        stats["other"] += 1
        print(f"[{ts}] OTHER  {ip.src} -> {ip.dst}  proto={ip.proto}")


try:
    # BPF filter so we don't capture unrelated stuff
    bpf = f"host {TARGET} or arp"
    sniff(prn=handle, store=False, filter=bpf)
except KeyboardInterrupt:
    pass
except Exception as e:
    print(f"\nSniff error: {e}")
    print("If this says 'No libpcap' or similar, install Npcap (https://npcap.com)")
    print("or just use Wireshark directly with filter: host " + TARGET)

print()
print("=" * 70)
print(f"Summary: ARP={stats['arp']}  TCP={stats['tcp']}  UDP={stats['udp']}  "
      f"other={stats['other']}  relfar-frames={stats['protocol_frames']}")
print("=" * 70)

# Save pcap
try:
    from scapy.all import wrpcap
    if captured:
        wrpcap(OUT_PCAP, captured)
        print(f"Saved {len(captured)} packets to {OUT_PCAP}")
except Exception as e:
    print(f"Couldn't save pcap: {e}")
