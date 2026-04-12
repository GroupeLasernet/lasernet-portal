"""
Relfar V4 Laser Controller - RS485/Modbus RTU Connection Scanner
================================================================
Scans COM port for the controller using common baud rates and slave addresses.
Tries both Modbus RTU reads and raw serial communication.
Supports RTS/DTR polarity toggling for RS485 direction control.
"""

import serial
import serial.tools.list_ports
import serial.rs485
import time
import json
import logging
from pymodbus.client import ModbusSerialClient
from pymodbus.exceptions import ModbusException

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Common settings for Chinese laser controllers
COMMON_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 4800, 2400]
COMMON_SLAVE_IDS = [1, 2, 3, 4, 5, 0]
COMMON_REGISTER_RANGES = [
    (0, 10),      # Holding registers starting at 0
    (100, 10),    # Holding registers starting at 100
    (1000, 10),   # Holding registers starting at 1000
    (0x1000, 10), # Holding registers starting at 0x1000
    (40001, 10),  # Classic Modbus convention
]

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
    """
    Configure RS485 direction control via RTS pin.
    This effectively 'swaps' the communication direction.
    """
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
        logger.debug(f"RS485 mode set to '{mode}': {config['description']}")
        return True
    except Exception as e:
        logger.debug(f"RS485 mode setting not supported by adapter: {e}")
        # Fall back to manual RTS control
        try:
            if mode == 'normal':
                ser.rts = False  # RTS low = receive mode
            else:
                ser.rts = True   # RTS high = receive mode (inverted)
            return True
        except Exception:
            return False


def test_modbus_connection(port, baud_rate, slave_id, register_start, register_count,
                           parity='N', stopbits=1, bytesize=8, timeout=0.5,
                           rs485_mode='normal'):
    """
    Try to read Modbus holding registers with given parameters.
    Returns the register values if successful, None otherwise.
    """
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
            # Apply RS485 polarity mode to the underlying serial port
            if hasattr(client, 'socket') and client.socket:
                configure_rs485_mode(client.socket, rs485_mode)
            elif hasattr(client, 'transport') and hasattr(client.transport, 'serial'):
                configure_rs485_mode(client.transport.serial, rs485_mode)

            # Try reading holding registers (function code 0x03)
            result = client.read_holding_registers(
                address=register_start,
                count=register_count,
                slave=slave_id
            )

            if not result.isError():
                return {
                    'type': 'holding_registers',
                    'function_code': '0x03',
                    'address': register_start,
                    'values': result.registers,
                    'rs485_mode': rs485_mode
                }

            # Try reading input registers (function code 0x04)
            result = client.read_input_registers(
                address=register_start,
                count=register_count,
                slave=slave_id
            )

            if not result.isError():
                return {
                    'type': 'input_registers',
                    'function_code': '0x04',
                    'address': register_start,
                    'values': result.registers,
                    'rs485_mode': rs485_mode
                }

        finally:
            client.close()

    except Exception as e:
        logger.debug(f"Modbus error: {e}")

    return None


def test_raw_serial(port, baud_rate, rs485_mode='normal', timeout=1.0):
    """
    Try raw serial communication - send common query bytes and see if we get a response.
    Some controllers don't use standard Modbus but a proprietary protocol.
    """
    responses = []

    # Common query patterns for laser controllers
    test_packets = [
        bytes([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A, 0xC5, 0xCD]),  # Modbus RTU: read 10 regs from addr 0, slave 1
        bytes([0x01, 0x04, 0x00, 0x00, 0x00, 0x0A, 0x70, 0x0D]),  # Modbus RTU: read 10 input regs, slave 1
        b'\xAA\x55\x01\x00\x00\x00\x00\x00',  # Common Chinese protocol header
        b'\x02\x00\x00\x00\x03',  # STX-based protocol
    ]

    for parity_setting in ['N', 'E']:
        try:
            ser = serial.Serial(
                port=port,
                baudrate=baud_rate,
                parity=parity_setting,
                stopbits=1,
                bytesize=8,
                timeout=timeout
            )

            # Apply RS485 polarity mode
            configure_rs485_mode(ser, rs485_mode)

            # Clear any pending data
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            time.sleep(0.1)

            for i, packet in enumerate(test_packets):
                ser.reset_input_buffer()

                # Toggle RTS for TX (manual direction control)
                if rs485_mode == 'normal':
                    ser.rts = True   # Enable TX
                else:
                    ser.rts = False  # Enable TX (inverted)

                ser.write(packet)
                ser.flush()

                # Switch back to RX
                if rs485_mode == 'normal':
                    ser.rts = False  # Enable RX
                else:
                    ser.rts = True   # Enable RX (inverted)

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
            logger.debug(f"Raw serial error at {baud_rate} baud, parity={parity_setting}: {e}")

    return responses


def full_scan(port='COM5', quick=False, rs485_mode='both'):
    """
    Perform a full scan of the given COM port.

    Args:
        port: COM port to scan (default COM5)
        quick: If True, only test most common settings
        rs485_mode: 'normal', 'inverted', or 'both' (tries both polarities)

    Returns:
        Dictionary with scan results
    """
    results = {
        'port': port,
        'com_ports': list_com_ports(),
        'modbus_hits': [],
        'raw_serial_hits': [],
        'scan_complete': False,
        'status': 'scanning',
        'rs485_mode_tested': rs485_mode
    }

    baud_rates = COMMON_BAUD_RATES[:3] if quick else COMMON_BAUD_RATES
    slave_ids = COMMON_SLAVE_IDS[:3] if quick else COMMON_SLAVE_IDS

    # Determine which RS485 modes to test
    if rs485_mode == 'both':
        modes_to_test = ['normal', 'inverted']
    else:
        modes_to_test = [rs485_mode]

    total_tests = len(modes_to_test) * len(baud_rates) * len(slave_ids) * len(COMMON_REGISTER_RANGES) * 2
    current_test = 0

    logger.info(f"Starting scan on {port} - {total_tests} combinations to try...")
    logger.info(f"RS485 modes to test: {modes_to_test}")
    logger.info(f"Available COM ports: {json.dumps(results['com_ports'], indent=2)}")

    # Phase 1: Modbus RTU scan (both polarities)
    logger.info("=== Phase 1: Modbus RTU Scan ===")
    for mode in modes_to_test:
        logger.info(f"--- Testing RS485 mode: {mode} ({RS485_MODES[mode]['description']}) ---")
        for baud in baud_rates:
            for parity in ['N', 'E']:
                for slave_id in slave_ids:
                    for reg_start, reg_count in COMMON_REGISTER_RANGES:
                        current_test += 1

                        if current_test % 20 == 0:
                            logger.info(f"  Progress: {current_test}/{total_tests} "
                                       f"(mode={mode}, baud={baud}, parity={parity}, "
                                       f"slave={slave_id}, reg={reg_start})")

                        hit = test_modbus_connection(
                            port=port,
                            baud_rate=baud,
                            slave_id=slave_id,
                            register_start=reg_start,
                            register_count=reg_count,
                            parity=parity,
                            rs485_mode=mode
                        )

                        if hit:
                            hit_info = {
                                'baud_rate': baud,
                                'parity': parity,
                                'slave_id': slave_id,
                                'rs485_mode': mode,
                                **hit
                            }
                            results['modbus_hits'].append(hit_info)
                            logger.info(f"  *** MODBUS HIT! mode={mode}, baud={baud}, parity={parity}, "
                                       f"slave={slave_id}, reg={reg_start} => {hit['values']}")

    # Phase 2: Raw serial scan (both polarities)
    logger.info("=== Phase 2: Raw Serial Scan ===")
    for mode in modes_to_test:
        for baud in baud_rates:
            logger.info(f"  Testing raw serial at {baud} baud, mode={mode}...")
            raw_hits = test_raw_serial(port, baud, rs485_mode=mode)
            if raw_hits:
                results['raw_serial_hits'].extend(raw_hits)
                for rh in raw_hits:
                    logger.info(f"  *** RAW SERIAL RESPONSE at {baud} baud, mode={mode}: {rh['received']}")

    results['scan_complete'] = True
    results['status'] = 'complete'

    if results['modbus_hits']:
        best = results['modbus_hits'][0]
        results['recommendation'] = (
            f"Found Modbus device! Use baud={best['baud_rate']}, "
            f"parity={best['parity']}, slave_id={best['slave_id']}, "
            f"RS485 mode={best['rs485_mode']}"
        )
    elif results['raw_serial_hits']:
        results['recommendation'] = (
            "No standard Modbus found, but got raw serial responses. "
            "The controller may use a proprietary protocol."
        )
    else:
        results['recommendation'] = (
            "No responses detected. Check: 1) Is the controller powered on? "
            "2) Is the RS485 A/B wiring correct? 3) Is COM5 the right port?"
        )

    return results


if __name__ == '__main__':
    import sys
    port = sys.argv[1] if len(sys.argv) > 1 else 'COM5'
    print(f"\nRelfar V4 Controller Scanner")
    print(f"============================")
    print(f"Scanning port: {port}\n")

    results = full_scan(port=port, rs485_mode='both')

    print(f"\n{'='*50}")
    print(f"SCAN RESULTS")
    print(f"{'='*50}")
    print(f"Modbus hits: {len(results['modbus_hits'])}")
    print(f"Raw serial responses: {len(results['raw_serial_hits'])}")
    print(f"\nRecommendation: {results['recommendation']}")

    # Save results
    with open('scan_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to scan_results.json")
