"""
Relfar V4 / RuiDa RDCleanV4-DWPro - RS485 Connection Scanner
==============================================================
Board: RDWelder.V4-A V1.1 by RuiDa Technology (RDACS)
Product: RDCleanV4-DWPro(EC) - Intelligent Double Pendulum Cleaning Head

Strategy:
1. Try Modbus RTU at 115200/8N1 (RuiDa default) first
2. Try common industrial baud rates with Modbus RTU
3. Try RuiDa proprietary scrambled protocol
4. Passive listener mode (some devices send data on power-on)
5. Raw serial probing with known packet patterns
"""

import serial
import serial.tools.list_ports
import serial.rs485
import time
import json
import struct
import logging
from pymodbus.client import ModbusSerialClient
from pymodbus.exceptions import ModbusException

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ========== RuiDa-specific knowledge ==========
# Priority order based on what we know about RuiDa controllers
PRIORITY_BAUD_RATES = [115200, 9600, 19200, 38400, 57600, 4800, 2400]
PRIORITY_SLAVE_IDS = [1, 2, 0, 3, 4, 5]
REGISTER_RANGES = [
    (0, 10),        # Standard start
    (1, 10),        # Offset by 1
    (100, 10),      # Common block
    (200, 10),      # Parameter block
    (1000, 10),     # Extended range
    (0x1000, 10),   # High range
    (0x2000, 10),   # High range 2
    (40001, 10),    # Classic Modbus
]

# RuiDa proprietary protocol uses byte scrambling
# Bit 7 is a "start of message" indicator, payload in bits 0-6
def ruida_scramble_byte(b):
    """RuiDa's byte scrambling/encoding."""
    rev = 0
    for i in range(8):
        if b & (1 << i):
            rev |= (1 << (7 - i))
    return rev ^ 0x88

def ruida_unscramble_byte(b):
    """Reverse RuiDa's byte scrambling."""
    b = b ^ 0x88
    rev = 0
    for i in range(8):
        if b & (1 << i):
            rev |= (1 << (7 - i))
    return rev


# RS485 polarity modes
RS485_MODES = {
    'normal': {
        'rts_level_for_tx': True,
        'rts_level_for_rx': False,
        'description': 'RTS HIGH during TX (most common)'
    },
    'inverted': {
        'rts_level_for_tx': False,
        'rts_level_for_rx': True,
        'description': 'RTS LOW during TX (inverted/swapped)'
    }
}


def list_com_ports():
    """List all available COM ports on the system."""
    ports = serial.tools.list_ports.comports()
    result = []
    for port in ports:
        result.append({
            'device': port.device,
            'description': port.description,
            'hwid': port.hwid,
            'manufacturer': port.manufacturer or 'Unknown'
        })
    return result


def configure_rs485_mode(ser, mode='normal'):
    """Configure RS485 direction control via RTS pin."""
    if mode not in RS485_MODES:
        mode = 'normal'
    config = RS485_MODES[mode]
    try:
        ser.rs485_mode = serial.rs485.RS485Settings(
            rts_level_for_tx=config['rts_level_for_tx'],
            rts_level_for_rx=config['rts_level_for_rx'],
            delay_before_tx=0.0,
            delay_before_rx=0.0
        )
        return True
    except Exception:
        try:
            ser.rts = not config['rts_level_for_tx']
            return True
        except Exception:
            return False


def test_modbus_connection(port, baud_rate, slave_id, register_start, register_count,
                           parity='N', stopbits=1, bytesize=8, timeout=0.5,
                           rs485_mode='normal'):
    """Try to read Modbus registers with given parameters."""
    try:
        client = ModbusSerialClient(
            port=port,
            baudrate=baud_rate,
            parity=parity,
            stopbits=stopbits,
            bytesize=bytesize,
            timeout=timeout
        )
        if not client.connect():
            return None
        try:
            # Apply RS485 polarity
            if hasattr(client, 'socket') and client.socket:
                configure_rs485_mode(client.socket, rs485_mode)

            # Try holding registers (0x03)
            result = client.read_holding_registers(
                address=register_start, count=register_count, slave=slave_id
            )
            if not result.isError():
                return {
                    'type': 'holding_registers', 'function_code': '0x03',
                    'address': register_start, 'values': result.registers,
                    'rs485_mode': rs485_mode
                }

            # Try input registers (0x04)
            result = client.read_input_registers(
                address=register_start, count=register_count, slave=slave_id
            )
            if not result.isError():
                return {
                    'type': 'input_registers', 'function_code': '0x04',
                    'address': register_start, 'values': result.registers,
                    'rs485_mode': rs485_mode
                }

            # Try coils (0x01)
            result = client.read_coils(
                address=register_start, count=min(register_count * 16, 100), slave=slave_id
            )
            if not result.isError():
                return {
                    'type': 'coils', 'function_code': '0x01',
                    'address': register_start, 'values': result.bits[:16],
                    'rs485_mode': rs485_mode
                }

        finally:
            client.close()
    except Exception as e:
        logger.debug(f"Modbus error: {e}")
    return None


def passive_listen(port, baud_rate, parity='N', duration=3.0, rs485_mode='normal'):
    """
    Passively listen on the serial port for any incoming data.
    Some controllers send status updates or heartbeats automatically.
    """
    received_data = []
    try:
        ser = serial.Serial(
            port=port, baudrate=baud_rate, parity=parity,
            stopbits=1, bytesize=8, timeout=0.5
        )
        configure_rs485_mode(ser, rs485_mode)
        ser.reset_input_buffer()

        start_time = time.time()
        while time.time() - start_time < duration:
            waiting = ser.in_waiting
            if waiting > 0:
                data = ser.read(waiting)
                received_data.append({
                    'timestamp': time.time() - start_time,
                    'hex': data.hex(),
                    'length': len(data),
                    'ascii': data.decode('ascii', errors='replace'),
                    'raw_bytes': list(data)
                })
            time.sleep(0.1)

        ser.close()
    except Exception as e:
        logger.debug(f"Passive listen error: {e}")

    return received_data


def test_ruida_protocol(port, baud_rate, rs485_mode='normal'):
    """
    Try RuiDa's proprietary scrambled protocol over serial.
    RuiDa controllers use a custom encoding where bytes are bit-reversed and XORed.
    """
    responses = []

    # RuiDa commands to try (unscrambled):
    # DA 00 04 05 = get saved job count
    # DA 00 00 = read some status
    # E7 00 = device info query
    ruida_commands = [
        [0xDA, 0x00, 0x04, 0x05],   # Get saved job count
        [0xDA, 0x00, 0x00],          # Status query
        [0xE7, 0x00],                # Device info
        [0xDA, 0x00, 0x06, 0x00],    # Read parameter
        [0xC6, 0x01],                # Power query
    ]

    try:
        ser = serial.Serial(
            port=port, baudrate=baud_rate, parity='N',
            stopbits=1, bytesize=8, timeout=0.5
        )
        configure_rs485_mode(ser, rs485_mode)

        for cmd_idx, cmd in enumerate(ruida_commands):
            ser.reset_input_buffer()

            # Send scrambled version
            scrambled = bytes([ruida_scramble_byte(b) for b in cmd])

            # Calculate checksum (sum of scrambled bytes, 2 bytes MSB first)
            checksum = sum(scrambled) & 0xFFFF
            packet = struct.pack('>H', checksum) + scrambled

            ser.write(packet)
            ser.flush()
            time.sleep(0.3)

            response = ser.read(ser.in_waiting or 64)
            if response and len(response) > 0:
                # Try to unscramble
                unscrambled = bytes([ruida_unscramble_byte(b) for b in response])
                responses.append({
                    'baud_rate': baud_rate,
                    'command_index': cmd_idx,
                    'command': [hex(b) for b in cmd],
                    'sent_scrambled': packet.hex(),
                    'received_raw': response.hex(),
                    'received_unscrambled': unscrambled.hex(),
                    'received_length': len(response),
                    'rs485_mode': rs485_mode,
                    'protocol': 'ruida_proprietary'
                })

            # Also try sending unscrambled (in case RS485 doesn't use scrambling)
            ser.reset_input_buffer()
            raw_cmd = bytes(cmd)
            ser.write(raw_cmd)
            ser.flush()
            time.sleep(0.3)

            response = ser.read(ser.in_waiting or 64)
            if response and len(response) > 0:
                responses.append({
                    'baud_rate': baud_rate,
                    'command_index': cmd_idx,
                    'command': [hex(b) for b in cmd],
                    'sent_raw': raw_cmd.hex(),
                    'received_raw': response.hex(),
                    'received_length': len(response),
                    'rs485_mode': rs485_mode,
                    'protocol': 'ruida_unscrambled'
                })

        ser.close()
    except Exception as e:
        logger.debug(f"RuiDa protocol error: {e}")

    return responses


def test_raw_serial(port, baud_rate, rs485_mode='normal', timeout=1.0):
    """Try raw serial with common query patterns."""
    responses = []

    test_packets = [
        bytes([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A, 0xC5, 0xCD]),  # Modbus: read 10 regs, slave 1
        bytes([0x01, 0x04, 0x00, 0x00, 0x00, 0x0A, 0x70, 0x0D]),  # Modbus: read 10 input regs
        b'\xAA\x55\x01\x00\x00\x00\x00\x00',  # Common Chinese protocol
        b'\x02\x00\x00\x00\x03',               # STX-based
        b'\xFF\x00\x00\x00',                    # Broadcast probe
    ]

    for parity_setting in ['N', 'E']:
        try:
            ser = serial.Serial(
                port=port, baudrate=baud_rate, parity=parity_setting,
                stopbits=1, bytesize=8, timeout=timeout
            )
            configure_rs485_mode(ser, rs485_mode)
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            time.sleep(0.1)

            for i, packet in enumerate(test_packets):
                ser.reset_input_buffer()
                ser.write(packet)
                ser.flush()
                time.sleep(0.2)

                response = ser.read(ser.in_waiting or 64)
                if response and len(response) > 0:
                    responses.append({
                        'baud_rate': baud_rate,
                        'parity': parity_setting,
                        'rs485_mode': rs485_mode,
                        'packet_index': i,
                        'sent': packet.hex(),
                        'received': response.hex(),
                        'received_length': len(response),
                        'received_ascii': response.decode('ascii', errors='replace')
                    })
            ser.close()
        except Exception as e:
            logger.debug(f"Raw serial error at {baud_rate}: {e}")

    return responses


def full_scan(port='COM5', quick=False, rs485_mode='both'):
    """
    Perform a comprehensive scan for the RuiDa RDCleanV4 controller.

    Phases:
    1. Passive listen (catch heartbeats)
    2. Modbus RTU (prioritizing 115200 baud)
    3. RuiDa proprietary protocol
    4. Raw serial probing
    """
    results = {
        'port': port,
        'com_ports': list_com_ports(),
        'passive_data': [],
        'modbus_hits': [],
        'ruida_hits': [],
        'raw_serial_hits': [],
        'scan_complete': False,
        'status': 'scanning',
        'rs485_mode_tested': rs485_mode,
        'board_info': {
            'manufacturer': 'RuiDa Technology (RDACS)',
            'board': 'RDWelder.V4-A V1.1',
            'product': 'RDCleanV4-DWPro(EC)',
            'bluetooth_module': 'AI-Thinker AI-WB2-01S (BL602)',
        }
    }

    modes_to_test = ['normal', 'inverted'] if rs485_mode == 'both' else [rs485_mode]
    baud_rates = PRIORITY_BAUD_RATES[:3] if quick else PRIORITY_BAUD_RATES
    slave_ids = PRIORITY_SLAVE_IDS[:3] if quick else PRIORITY_SLAVE_IDS

    logger.info(f"Starting RuiDa RDCleanV4 scan on {port}")
    logger.info(f"Board: RDWelder.V4-A V1.1 | Product: RDCleanV4-DWPro(EC)")
    logger.info(f"RS485 modes: {modes_to_test}")

    # Phase 0: Passive Listen
    logger.info("=== Phase 0: Passive Listening (catching heartbeats) ===")
    for mode in modes_to_test:
        for baud in [115200, 9600]:
            logger.info(f"  Listening at {baud} baud, mode={mode} for 3 seconds...")
            data = passive_listen(port, baud, duration=3.0, rs485_mode=mode)
            if data:
                results['passive_data'].extend([{**d, 'baud_rate': baud, 'rs485_mode': mode} for d in data])
                logger.info(f"  *** PASSIVE DATA at {baud} baud, mode={mode}: {len(data)} packets!")

    # Phase 1: Modbus RTU (priority: 115200 baud, slave 1)
    logger.info("=== Phase 1: Modbus RTU Scan (RuiDa defaults first) ===")
    for mode in modes_to_test:
        for baud in baud_rates:
            for parity in ['N', 'E']:
                for slave_id in slave_ids:
                    for reg_start, reg_count in REGISTER_RANGES:
                        hit = test_modbus_connection(
                            port=port, baud_rate=baud, slave_id=slave_id,
                            register_start=reg_start, register_count=reg_count,
                            parity=parity, rs485_mode=mode
                        )
                        if hit:
                            hit_info = {
                                'baud_rate': baud, 'parity': parity,
                                'slave_id': slave_id, 'rs485_mode': mode, **hit
                            }
                            results['modbus_hits'].append(hit_info)
                            logger.info(f"  *** MODBUS HIT! mode={mode}, baud={baud}, "
                                       f"parity={parity}, slave={slave_id}, "
                                       f"reg={reg_start} => {hit['values']}")

    # Phase 2: RuiDa Proprietary Protocol
    logger.info("=== Phase 2: RuiDa Proprietary Protocol ===")
    for mode in modes_to_test:
        for baud in [115200, 9600, 57600, 38400]:
            logger.info(f"  Testing RuiDa protocol at {baud} baud, mode={mode}...")
            ruida_hits = test_ruida_protocol(port, baud, rs485_mode=mode)
            if ruida_hits:
                results['ruida_hits'].extend(ruida_hits)
                for rh in ruida_hits:
                    logger.info(f"  *** RUIDA RESPONSE! baud={baud}, mode={mode}: {rh['received_raw']}")

    # Phase 3: Raw Serial Probing
    logger.info("=== Phase 3: Raw Serial Probing ===")
    for mode in modes_to_test:
        for baud in baud_rates:
            raw_hits = test_raw_serial(port, baud, rs485_mode=mode)
            if raw_hits:
                results['raw_serial_hits'].extend(raw_hits)

    # Build recommendation
    results['scan_complete'] = True
    results['status'] = 'complete'

    if results['modbus_hits']:
        best = results['modbus_hits'][0]
        results['recommendation'] = (
            f"Modbus RTU works! baud={best['baud_rate']}, parity={best['parity']}, "
            f"slave={best['slave_id']}, RS485 mode={best['rs485_mode']}"
        )
    elif results['ruida_hits']:
        best = results['ruida_hits'][0]
        results['recommendation'] = (
            f"RuiDa proprietary protocol responds at baud={best['baud_rate']}, "
            f"RS485 mode={best['rs485_mode']}. Using scrambled byte encoding."
        )
    elif results['passive_data']:
        results['recommendation'] = (
            "Controller sends data on its own! Check passive data for protocol clues."
        )
    elif results['raw_serial_hits']:
        results['recommendation'] = (
            "Got raw serial responses. May be a proprietary protocol."
        )
    else:
        results['recommendation'] = (
            "No responses. Check: 1) Controller powered on? "
            "2) RS485 A/B wiring on CN4 correct (pins 2=485+, 3=485-)? "
            "3) Is the correct COM port selected? "
            "4) Try the HMI port instead of CN4 (CN4 may be 'reserved')."
        )

    return results


if __name__ == '__main__':
    import sys
    port = sys.argv[1] if len(sys.argv) > 1 else 'COM5'
    print(f"\nRuiDa RDCleanV4 Controller Scanner")
    print(f"Board: RDWelder.V4-A V1.1")
    print(f"====================================")
    print(f"Scanning port: {port}\n")

    results = full_scan(port=port, rs485_mode='both')

    print(f"\n{'='*50}")
    print(f"SCAN RESULTS")
    print(f"{'='*50}")
    print(f"Passive data packets: {len(results['passive_data'])}")
    print(f"Modbus hits: {len(results['modbus_hits'])}")
    print(f"RuiDa protocol hits: {len(results['ruida_hits'])}")
    print(f"Raw serial responses: {len(results['raw_serial_hits'])}")
    print(f"\nRecommendation: {results['recommendation']}")

    with open('scan_results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nFull results saved to scan_results.json")
