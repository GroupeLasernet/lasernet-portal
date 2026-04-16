"""
Boot-traffic sniffer — capture what the controller says when it joins WiFi.

Run this BEFORE powering on the controller. It captures:
  - DHCP DISCOVER/REQUEST/ACK     (MAC, hostname, vendor class)
  - ARP probes/announcements      (when it claims an IP)
  - DNS queries                    (hostnames it looks up — cloud servers?)
  - mDNS / SSDP / UPnP broadcasts (self-announcements)
  - NTP                            (time sync — uses port 123!)
  - Any traffic to/from its assigned IP once it has one

All of this is broadcast/multicast so we CAN see it even on encrypted WiFi.
"""
import sys, time, struct
from datetime import datetime
from scapy.all import sniff, Ether, IP, TCP, UDP, ARP, Raw
from scapy.layers.dhcp import DHCP, BOOTP
from scapy.layers.dns  import DNS, DNSQR

TARGET_IP = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.250"
OUT_PCAP  = sys.argv[2] if len(sys.argv) > 2 else "boot_sniff.pcap"

print("=" * 72)
print(f"  BOOT SNIFFER — waiting for controller to join WiFi")
print(f"  Expected IP (if DHCP gives same lease): {TARGET_IP}")
print(f"  Saving to: {OUT_PCAP}")
print(f"  Press Ctrl+C when done (after controller has booted & been active)")
print("=" * 72)
print()
print("Now: POWER ON the controller.")
print()

captured = []
controller_mac = None
stats = {"dhcp":0, "arp":0, "dns":0, "mdns":0, "ssdp":0, "ntp":0, "tcp":0, "udp":0}

def ts():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def print_dhcp(pkt):
    global controller_mac
    bootp = pkt[BOOTP]
    opts = {o[0]: o[1] for o in pkt[DHCP].options if isinstance(o, tuple)}
    msg_type = {1:"DISCOVER", 2:"OFFER", 3:"REQUEST", 4:"DECLINE",
                5:"ACK", 6:"NAK", 7:"RELEASE", 8:"INFORM"}.get(opts.get("message-type"), "?")
    mac = bootp.chaddr[:6].hex(":")
    hostname = opts.get("hostname", b"")
    if isinstance(hostname, bytes): hostname = hostname.decode(errors="replace")
    vendor = opts.get("vendor_class_id", b"")
    if isinstance(vendor, bytes): vendor = vendor.decode(errors="replace")
    requested = opts.get("requested_addr", "")
    assigned  = bootp.yiaddr
    print(f"[{ts()}] DHCP-{msg_type:8s}  mac={mac}  host='{hostname}'  vendor='{vendor}'  req={requested}  assigned={assigned}")
    stats["dhcp"] += 1
    # Record controller MAC when we see the discover from it
    if msg_type in ("DISCOVER","REQUEST") and not controller_mac:
        controller_mac = mac
        print(f"           >>> captured controller MAC: {mac}")


def print_arp(pkt):
    a = pkt[ARP]
    op = {1:"who-has", 2:"is-at"}.get(a.op, f"op{a.op}")
    # Only print if involves target, or if it's a gratuitous/probe from controller MAC
    interesting = (a.psrc == TARGET_IP or a.pdst == TARGET_IP or a.hwsrc == controller_mac)
    if not interesting: return
    print(f"[{ts()}] ARP  {op}   src={a.psrc}({a.hwsrc})  dst={a.pdst}({a.hwdst})")
    stats["arp"] += 1


def print_dns(pkt):
    d = pkt[DNS]
    if d.qr == 0 and d.qd:   # query
        q = d.qd
        try:
            name = q.qname.decode(errors="replace").rstrip(".")
        except: name = str(q.qname)
        src = pkt[IP].src if pkt.haslayer(IP) else "?"
        # mDNS is multicast to 224.0.0.251
        if pkt.haslayer(IP) and pkt[IP].dst == "224.0.0.251":
            print(f"[{ts()}] mDNS-Q  from={src}  name='{name}'")
            stats["mdns"] += 1
        else:
            print(f"[{ts()}] DNS-Q   from={src}  name='{name}'")
            stats["dns"] += 1


def print_ssdp(pkt):
    payload = bytes(pkt[Raw].load) if pkt.haslayer(Raw) else b""
    if not payload: return
    try:
        text = payload.decode(errors="replace")
    except:
        return
    src = pkt[IP].src if pkt.haslayer(IP) else "?"
    # Only interesting if from our target OR contains Rui/Relfar/HF hints
    first_lines = text.splitlines()[:10]
    keep = (src == TARGET_IP) or any(k in text.lower() for k in ("relfar","ruida","rd-","hf-lpb","hf_","ipbridge"))
    if not keep:
        # Still print NOTIFY from unknown hosts as single line
        if text.startswith(("NOTIFY","M-SEARCH")):
            kind = "NOTIFY" if text.startswith("NOTIFY") else "M-SEARCH"
            return   # too noisy to print every one
        return
    print(f"[{ts()}] SSDP/UPnP  src={src}")
    for line in first_lines:
        print(f"           {line}")
    stats["ssdp"] += 1


def handle(pkt):
    captured.append(pkt)
    try:
        # DHCP
        if pkt.haslayer(DHCP):
            print_dhcp(pkt); return
        # ARP
        if pkt.haslayer(ARP):
            print_arp(pkt); return
        # IP-based
        if not pkt.haslayer(IP): return
        ip = pkt[IP]
        # DNS / mDNS
        if pkt.haslayer(DNS):
            print_dns(pkt); return
        # SSDP (UDP 1900)
        if pkt.haslayer(UDP) and (pkt[UDP].dport == 1900 or pkt[UDP].sport == 1900):
            print_ssdp(pkt); return
        # NTP (UDP 123)
        if pkt.haslayer(UDP) and (pkt[UDP].sport == 123 or pkt[UDP].dport == 123):
            src, dst = ip.src, ip.dst
            print(f"[{ts()}] NTP    {src}:{pkt[UDP].sport} -> {dst}:{pkt[UDP].dport}")
            stats["ntp"] += 1
            return
        # Anything else involving TARGET_IP
        if ip.src == TARGET_IP or ip.dst == TARGET_IP:
            if pkt.haslayer(TCP):
                t = pkt[TCP]
                flags=[]
                if t.flags & 0x02: flags.append("SYN")
                if t.flags & 0x10: flags.append("ACK")
                if t.flags & 0x01: flags.append("FIN")
                if t.flags & 0x04: flags.append("RST")
                if t.flags & 0x08: flags.append("PSH")
                fs = ",".join(flags) or "."
                payload = bytes(pkt[Raw].load) if pkt.haslayer(Raw) else b""
                print(f"[{ts()}] TCP   {ip.src}:{t.sport} -> {ip.dst}:{t.dport}  [{fs}]  {len(payload)}B")
                stats["tcp"] += 1
            elif pkt.haslayer(UDP):
                u = pkt[UDP]
                payload = bytes(pkt[Raw].load) if pkt.haslayer(Raw) else b""
                print(f"[{ts()}] UDP   {ip.src}:{u.sport} -> {ip.dst}:{u.dport}  {len(payload)}B")
                stats["udp"] += 1
    except Exception as e:
        print(f"[err] {e}")


try:
    # Broad filter — we need to see broadcast DHCP/ARP/mDNS + anything to/from target
    bpf = ("arp"
           f" or (udp port 67 or udp port 68)"          # DHCP
           f" or (udp port 53)"                          # DNS
           f" or (udp port 5353)"                        # mDNS
           f" or (udp port 1900)"                        # SSDP/UPnP
           f" or (udp port 123)"                         # NTP
           f" or (host {TARGET_IP})")
    print(f"BPF filter: {bpf}\n")
    sniff(prn=handle, store=False, filter=bpf)
except KeyboardInterrupt:
    pass
except Exception as e:
    print(f"\nSniff error: {e}")

print()
print("=" * 72)
print("BOOT-SNIFF SUMMARY")
print("=" * 72)
print(f"  Controller MAC:   {controller_mac or '(not captured)'}")
print(f"  DHCP exchanges:   {stats['dhcp']}")
print(f"  ARP packets:      {stats['arp']}")
print(f"  DNS queries:      {stats['dns']}")
print(f"  mDNS queries:     {stats['mdns']}")
print(f"  SSDP/UPnP:        {stats['ssdp']}")
print(f"  NTP:              {stats['ntp']}")
print(f"  TCP to/from:      {stats['tcp']}")
print(f"  UDP to/from:      {stats['udp']}")

try:
    from scapy.all import wrpcap
    if captured:
        wrpcap(OUT_PCAP, captured)
        print(f"\nSaved {len(captured)} packets to {OUT_PCAP}")
except Exception as e:
    print(f"\nCouldn't save pcap: {e}")
