"""
Relfar V4 controller protocol — reverse-engineered from RDWelder app traffic capture.

Wire format (8-byte frame):
    5A A5 05 TT AAAA VVVV
        TT = 0x58 read request (client -> ctrl)
             0x82 read response (ctrl -> client)
             0x83 write (both directions; ctrl echoes write as ack)
        AAAA = 16-bit register address (big-endian)
        VVVV = 16-bit value (big-endian)

Connection: TCP, controller listens on port 123.
  - In AP mode (RDWelder/12345678): controller IP = 192.168.1.5
  - On home WiFi: controller IP = 192.168.1.250 (varies by DHCP)

Batch writes: multiple 8-byte frames concatenated in a single TCP segment.
"""
import socket
import struct
import threading
import time
from collections import OrderedDict

MAGIC = b"\x5A\xA5\x05"
CMD_READ_REQ  = 0x58
CMD_READ_RESP = 0x82
CMD_WRITE     = 0x83
FRAME_LEN     = 8


def build_read(addr: int) -> bytes:
    return MAGIC + bytes([CMD_READ_REQ]) + struct.pack(">HH", addr, 1)


def build_write(addr: int, value: int) -> bytes:
    return MAGIC + bytes([CMD_WRITE]) + struct.pack(">HH", addr, value & 0xFFFF)


def parse_frame(buf: bytes):
    """Return (cmd, addr, value) or None."""
    if len(buf) < FRAME_LEN or buf[:3] != MAGIC:
        return None
    cmd = buf[3]
    addr, value = struct.unpack(">HH", buf[4:8])
    return cmd, addr, value


class RelfarClient:
    def __init__(self, host="192.168.1.5", port=123, timeout=2.0, bind_ip=None):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.bind_ip = bind_ip  # local source IP, e.g. "192.168.1.2" to force WiFi adapter
        self.sock = None
        self.lock = threading.Lock()
        self.registers = OrderedDict()  # addr -> last known value
        self._rx_buf = b""

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        if self.bind_ip:
            self.sock.bind((self.bind_ip, 0))
        self.sock.connect((self.host, self.port))

    def close(self):
        if self.sock:
            try: self.sock.close()
            except: pass
            self.sock = None

    def _recv_frames(self, max_wait=0.5):
        """Pull frames from socket for up to max_wait seconds total (heartbeat keeps stream busy)."""
        frames = []
        deadline = time.time() + max_wait
        try:
            while True:
                remaining = deadline - time.time()
                if remaining <= 0: break
                self.sock.settimeout(min(0.2, remaining))
                try:
                    data = self.sock.recv(4096)
                except socket.timeout:
                    continue
                if not data: break
                self._rx_buf += data
                while len(self._rx_buf) >= FRAME_LEN:
                    if self._rx_buf[:3] != MAGIC:
                        idx = self._rx_buf.find(MAGIC, 1)
                        if idx < 0:
                            self._rx_buf = b""
                            break
                        self._rx_buf = self._rx_buf[idx:]
                        continue
                    f = parse_frame(self._rx_buf[:FRAME_LEN])
                    self._rx_buf = self._rx_buf[FRAME_LEN:]
                    if f:
                        frames.append(f)
                        cmd, addr, value = f
                        self.registers[addr] = value
        finally:
            self.sock.settimeout(self.timeout)
        return frames

    def read(self, addr: int):
        """Read register; returns (value, [extra_frames])."""
        with self.lock:
            self.sock.sendall(build_read(addr))
            frames = self._recv_frames()
            primary = None
            for cmd, a, v in frames:
                if a == addr and cmd == CMD_READ_RESP:
                    primary = v
            return primary, frames

    def write(self, addr: int, value: int):
        with self.lock:
            self.sock.sendall(build_write(addr, value))
            return self._recv_frames()

    def write_batch(self, pairs):
        """pairs: list of (addr, value)."""
        with self.lock:
            buf = b"".join(build_write(a, v) for a, v in pairs)
            self.sock.sendall(buf)
            return self._recv_frames(max_wait=1.0)

    def poll_block(self, anchor: int = 0x1300, wait: float = 2.0):
        """Reading certain anchor registers triggers a multi-register dump."""
        with self.lock:
            self.sock.sendall(build_read(anchor))
            return self._recv_frames(max_wait=wait)


# ---- Known registers (inferred from your capture; names are guesses to refine) ----
# Reads of 0x1300 cause the controller to dump 0x1303..0x130B.
# Writes seen in the captured "batch" parameter set:
#   0x1330..0x1337  process parameters (likely power/freq/duty/speed)
#   0x1100, 0x1102  mode flags
#   0x1090..0x1096  channel/IO config
#   0x1103, 0x1105  more flags
#   0x1080          a setpoint (written as 2000 = 0x07D0)
KNOWN_REGISTERS = {
    # Handshake (controller identity / version probe)
    0x210A: "handshake_a",
    0x210B: "handshake_b",

    # Cleaning parameter block — confirmed against HMI 2026-04-14
    0x1300: "block_trigger",        # reading this triggers full param dump
    0x1303: "para_number",          # currently selected preset (1..N)
    0x1304: "scan_speed_mm_s",      # mm/s, direct
    0x1305: "laser_power_W",        # Watts, direct
    0x1306: "laser_freq_Hz",        # Hz, direct
    0x1307: "laser_duty_pct",       # %, direct
    0x1308: "scan_length_x10mm",    # mm × 10  (display = value/10)
    0x1309: "scan_width_x10mm",     # mm × 10  (display = value/10)
    0x130A: "scan_type_cmd",        # WRITE here to change shape (1..9)
    0x130B: "scan_type",            # READ-ONLY status mirror: 1=LineH 2=LineV 3=Ellipse 4=Diagonal 5=Sine 6=GridS 7=GridL 8=Asterisk 9=Dot

    # Status / IO
    0x1313: "status_running",       # heartbeat; 0 = idle, nonzero likely = running/active
    0x1048: "io_alarms",            # IO/alarm bit field
    0x1080: "setpoint_1080",        # written 2000 by app; semantic TBD

    # Other registers seen in batch writes (semantics TBD)
    0x1090: "io_cfg_1090", 0x1092: "io_cfg_1092", 0x1094: "io_cfg_1094", 0x1096: "io_cfg_1096",
    0x1100: "mode_1100", 0x1102: "mode_1102", 0x1103: "mode_1103", 0x1105: "mode_1105",
    0x1330: "param_1330", 0x1331: "param_1331", 0x1332: "param_1332", 0x1333: "param_1333",
    0x1334: "param_1334", 0x1335: "param_1335", 0x1336: "param_1336", 0x1337: "param_1337",
    0x1314: "param_1314",
    0x1505: "param_1505", 0x1506: "param_1506",
}


# Convenience: read all known cleaning parameters and return a dict with display values
def params_from_cache(client):
    """Build the human-readable param dict from whatever's already in client.registers (no I/O)."""
    r = client.registers
    return {
        "para_number":  r.get(0x1303),
        "scan_speed":   r.get(0x1304),
        "laser_power":  r.get(0x1305),
        "laser_freq":   r.get(0x1306),
        "laser_duty":   r.get(0x1307),
        "scan_length":  (r.get(0x1308) / 10.0) if r.get(0x1308) is not None else None,
        "scan_width":   (r.get(0x1309) / 10.0) if r.get(0x1309) is not None else None,
        "scan_type":    r.get(0x130B),
        "status":       r.get(0x1313),
        "io_alarms":    r.get(0x1048),
    }


def read_cleaning_params(client, wait=0.35):
    """Trigger block dump and return human-readable parameter dict.
    Default wait is 0.35s — the controller typically dumps the block in ~30ms."""
    client.poll_block(0x1300, wait=wait)
    r = client.registers
    return {
        "para_number":  r.get(0x1303),
        "scan_speed":   r.get(0x1304),                                   # mm/s
        "laser_power":  r.get(0x1305),                                   # W
        "laser_freq":   r.get(0x1306),                                   # Hz
        "laser_duty":   r.get(0x1307),                                   # %
        "scan_length":  (r.get(0x1308) / 10.0) if r.get(0x1308) is not None else None,  # mm
        "scan_width":   (r.get(0x1309) / 10.0) if r.get(0x1309) is not None else None,  # mm
        "scan_type":    r.get(0x130B),
        "status":       r.get(0x1313),
        "io_alarms":    r.get(0x1048),
    }


if __name__ == "__main__":
    import sys
    host = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.5"
    bind = sys.argv[2] if len(sys.argv) > 2 else None
    print(f"Connecting to Relfar controller at {host}:123 (bind={bind}) ...")
    c = RelfarClient(host=host, bind_ip=bind)
    c.connect()
    print("Connected. Probing handshake...")
    v, _ = c.read(0x210A)
    print(f"  0x210A handshake_a = {v}")
    v, _ = c.read(0x210B)
    print(f"  0x210B handshake_b = {v}")
    print("Polling block 0x1300 (triggers param dump, wait 3s)...")
    frames = c.poll_block(0x1300, wait=3.0)
    print(f"  got {len(frames)} frames in dump")
    for cmd, a, val in frames:
        name = KNOWN_REGISTERS.get(a, f"reg_{a:04X}")
        print(f"  {a:04X} {name:25s} = {val:5d}  (0x{val:04X})")
    print("\nDraining heartbeat for 5 more seconds (controller pushes 0x1313 every ~310ms)...")
    extra = c._recv_frames(max_wait=5.0)
    print(f"  got {len(extra)} heartbeat frames")
    print("\nAll cached registers:")
    for a, v in c.registers.items():
        name = KNOWN_REGISTERS.get(a, f"reg_{a:04X}")
        print(f"  {a:04X} {name:25s} = {v:5d}  (0x{v:04X})")
    c.close()
