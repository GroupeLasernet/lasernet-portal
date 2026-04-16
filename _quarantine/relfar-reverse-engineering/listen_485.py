"""
Passive RS485 listener on COM5.
Cycles through common baud rates and listens for any traffic.
If the mainboard sends anything spontaneous on CN4, we'll catch it.
"""
import serial
import time
from datetime import datetime

PORT = "COM5"
DURATION_PER_BAUD = 4  # seconds

BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
         4800, 2400, 1200, 31250, 250000]

print("=" * 60)
print(f"  Passive RS485 listener on {PORT}")
print(f"  Listening {DURATION_PER_BAUD}s per baud rate")
print("=" * 60)
print("\n>>> While this runs, touch HMI buttons, change parameters,")
print(">>> power-cycle the controller, etc. Generate traffic! <<<\n")

for baud in BAUDS:
    print(f"\n[*] Baud {baud}... ", end="", flush=True)
    try:
        s = serial.Serial(PORT, baud, timeout=0.3)
        start = time.time()
        captured = b""
        while time.time() - start < DURATION_PER_BAUD:
            data = s.read(1024)
            if data:
                captured += data
        s.close()
        if captured:
            print(f"GOT {len(captured)} BYTES!")
            print(f"    HEX: {captured[:200].hex()}")
            try:
                text = captured[:200].decode("utf-8", errors="replace")
                print(f"    TXT: {text!r}")
            except: pass
        else:
            print("silence")
    except Exception as e:
        print(f"error: {e}")

print("\n" + "=" * 60)
print("  DONE")
print("=" * 60)
