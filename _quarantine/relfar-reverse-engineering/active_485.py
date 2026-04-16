"""
Active RS485 prober on COM5.
Sends RuiDa scrambled commands at every common baud rate and
listens for any response. Tries both standard and reversed wiring
implicitly by trying every baud rate.
"""
import serial
import time

PORT = "COM5"
BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 4800]

def scramble(b):
    b = (b + 1) & 0xff
    b = ((b >> 7) & 0x01) | ((b << 7) & 0x80) | \
        ((b >> 5) & 0x02) | ((b << 5) & 0x40) | \
        ((b >> 3) & 0x04) | ((b << 3) & 0x20) | \
        ((b >> 1) & 0x08) | ((b << 1) & 0x10)
    return b ^ 0x88

def pkt(cmd):
    return bytes(scramble(b) for b in cmd)

# Probe set
COMMANDS = [
    ("status",   pkt([0xda, 0x00, 0x00])),
    ("devinfo",  pkt([0xe7, 0x00])),
    ("jobcount", pkt([0xda, 0x00, 0x04, 0x05])),
    ("position", pkt([0xda, 0x00, 0x04, 0x00])),
    # Also try Modbus-style queries (slave addr 1, read holding reg)
    ("modbus_read_1", bytes([0x01, 0x03, 0x00, 0x00, 0x00, 0x01, 0x84, 0x0a])),
    ("modbus_read_0", bytes([0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x85, 0xdb])),
    # Raw text
    ("text_at",  b"AT\r\n"),
    ("text_who", b"?\r\n"),
]

print("=" * 60)
print("  Active RS485 prober on COM5")
print("=" * 60)

for baud in BAUDS:
    print(f"\n[*] Baud {baud}")
    try:
        s = serial.Serial(PORT, baud, timeout=0.5)
        for label, payload in COMMANDS:
            s.reset_input_buffer()
            s.write(payload)
            s.flush()
            time.sleep(0.3)
            resp = s.read(1024)
            if resp:
                print(f"    [+] {label}: sent {payload.hex()} -> got {resp.hex()}")
            # else silent
        s.close()
    except Exception as e:
        print(f"    error: {e}")

print("\n" + "=" * 60)
print("  DONE - if everything silent, RS485 is likely")
print("  not implemented on this controller.")
print("=" * 60)
