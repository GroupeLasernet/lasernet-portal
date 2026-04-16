"""
RuiDa RDCleanV4 - Bluetooth Low Energy (BLE) Scanner & Communication
=====================================================================
The board has an AI-Thinker AI-WB2-01S module (BL602 WiFi+BLE chip).
The RDWelder app connects via BLE to read/write controller parameters.

This module scans for the controller's BLE advertisement, connects,
discovers services/characteristics, and reads available data.
"""

import asyncio
import json
import logging
import time

logger = logging.getLogger(__name__)

try:
    from bleak import BleakScanner, BleakClient
    BLE_AVAILABLE = True
except ImportError:
    BLE_AVAILABLE = False
    logger.warning("bleak not installed. Run: pip install bleak")


# Known identifiers for RuiDa/Relfar controllers
KNOWN_BLE_NAMES = [
    'RDWelder', 'RDClean', 'RuiDa', 'Relfar', 'RDACS',
    'BL602', 'AI-WB2', 'WB2',
    'RD_', 'Clean_', 'Weld_',
]

# Common BLE UART service UUIDs (Nordic UART, TI, custom)
UART_SERVICE_UUIDS = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',  # Nordic UART Service
    '0000ffe0-0000-1000-8000-00805f9b34fb',  # Common Chinese BLE UART
    '0000fff0-0000-1000-8000-00805f9b34fb',  # Alternative Chinese BLE UART
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',  # Microchip UART
]

UART_TX_CHAR_UUIDS = [
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',  # Nordic UART TX (write)
    '0000ffe1-0000-1000-8000-00805f9b34fb',  # Common Chinese TX
    '0000fff1-0000-1000-8000-00805f9b34fb',  # Alternative TX
    '49535343-8841-43f4-a8d4-ecbe34729bb3',  # Microchip TX
]

UART_RX_CHAR_UUIDS = [
    '6e400003-b5a3-f393-e0a9-e50e24dcca9e',  # Nordic UART RX (notify)
    '0000ffe1-0000-1000-8000-00805f9b34fb',  # Common Chinese RX (same as TX)
    '0000fff2-0000-1000-8000-00805f9b34fb',  # Alternative RX
    '49535343-1e4d-4bd9-ba61-23c647249616',  # Microchip RX
]


async def scan_ble_devices(duration=10):
    """
    Scan for BLE devices and identify potential RuiDa/Relfar controllers.
    Returns list of found devices with relevance scoring.
    """
    if not BLE_AVAILABLE:
        return {'error': 'bleak not installed. Run: pip install bleak', 'devices': []}

    logger.info(f"Scanning for BLE devices ({duration}s)...")

    try:
        devices = await BleakScanner.discover(timeout=duration)
    except Exception as e:
        return {'error': str(e), 'devices': []}

    results = []
    for device in devices:
        name = device.name or ''
        address = device.address

        # Score relevance
        score = 0
        matched_keywords = []

        for keyword in KNOWN_BLE_NAMES:
            if keyword.lower() in name.lower():
                score += 10
                matched_keywords.append(keyword)

        # AI-WB2 / BL602 devices often have specific service UUIDs
        # Check advertisement data if available
        adv_data = {}
        if hasattr(device, 'metadata'):
            adv_data = device.metadata or {}
        if hasattr(device, 'details'):
            adv_data['details'] = str(device.details)

        # Any device with a name gets a small score
        if name and name != 'Unknown':
            score += 1

        results.append({
            'name': name or 'Unknown',
            'address': address,
            'rssi': device.rssi if hasattr(device, 'rssi') else None,
            'score': score,
            'matched_keywords': matched_keywords,
            'metadata': {k: str(v) for k, v in adv_data.items()} if adv_data else {}
        })

    # Sort by relevance score (highest first)
    results.sort(key=lambda x: x['score'], reverse=True)

    return {
        'devices': results,
        'total_found': len(results),
        'likely_controllers': [d for d in results if d['score'] >= 5],
        'scan_duration': duration
    }


async def explore_ble_device(address, timeout=15):
    """
    Connect to a BLE device and discover all services and characteristics.
    This helps us understand the controller's BLE interface.
    """
    if not BLE_AVAILABLE:
        return {'error': 'bleak not installed'}

    logger.info(f"Connecting to BLE device: {address}")

    try:
        async with BleakClient(address, timeout=timeout) as client:
            if not client.is_connected:
                return {'error': 'Failed to connect'}

            services_data = []
            uart_service = None
            tx_char = None
            rx_char = None

            for service in client.services:
                service_info = {
                    'uuid': service.uuid,
                    'description': service.description or 'Unknown',
                    'characteristics': []
                }

                # Check if this is a UART service
                if service.uuid.lower() in [u.lower() for u in UART_SERVICE_UUIDS]:
                    uart_service = service
                    service_info['is_uart_service'] = True

                for char in service.characteristics:
                    char_info = {
                        'uuid': char.uuid,
                        'description': char.description or 'Unknown',
                        'properties': char.properties,
                        'value': None
                    }

                    # Try to read the characteristic if readable
                    if 'read' in char.properties:
                        try:
                            value = await client.read_gatt_char(char.uuid)
                            char_info['value'] = value.hex()
                            char_info['value_ascii'] = value.decode('ascii', errors='replace')
                            char_info['value_bytes'] = list(value)
                        except Exception as e:
                            char_info['read_error'] = str(e)

                    # Identify TX/RX characteristics
                    if char.uuid.lower() in [u.lower() for u in UART_TX_CHAR_UUIDS]:
                        tx_char = char
                        char_info['is_uart_tx'] = True
                    if char.uuid.lower() in [u.lower() for u in UART_RX_CHAR_UUIDS]:
                        rx_char = char
                        char_info['is_uart_rx'] = True

                    # Check for writable characteristics (potential command channels)
                    if 'write' in char.properties or 'write-without-response' in char.properties:
                        char_info['writable'] = True

                    # Check for notification characteristics (potential data channels)
                    if 'notify' in char.properties or 'indicate' in char.properties:
                        char_info['notifiable'] = True

                    service_info['characteristics'].append(char_info)
                services_data.append(service_info)

            return {
                'address': address,
                'connected': True,
                'services': services_data,
                'service_count': len(services_data),
                'has_uart_service': uart_service is not None,
                'uart_service_uuid': uart_service.uuid if uart_service else None,
                'tx_characteristic': tx_char.uuid if tx_char else None,
                'rx_characteristic': rx_char.uuid if rx_char else None,
            }

    except Exception as e:
        return {'error': str(e), 'address': address}


async def ble_send_receive(address, tx_uuid, rx_uuid, data_bytes, timeout=5):
    """
    Send data to the controller via BLE UART and listen for response.
    """
    if not BLE_AVAILABLE:
        return {'error': 'bleak not installed'}

    received_data = []

    def notification_handler(sender, data):
        received_data.append({
            'timestamp': time.time(),
            'hex': data.hex(),
            'bytes': list(data),
            'ascii': data.decode('ascii', errors='replace'),
            'length': len(data)
        })

    try:
        async with BleakClient(address, timeout=timeout) as client:
            if not client.is_connected:
                return {'error': 'Failed to connect'}

            # Subscribe to notifications on RX characteristic
            await client.start_notify(rx_uuid, notification_handler)

            # Send data on TX characteristic
            await client.write_gatt_char(tx_uuid, bytes(data_bytes))

            # Wait for responses
            await asyncio.sleep(2)

            await client.stop_notify(rx_uuid)

            return {
                'sent': bytes(data_bytes).hex(),
                'responses': received_data,
                'response_count': len(received_data)
            }

    except Exception as e:
        return {'error': str(e)}


def run_ble_scan(duration=10):
    """Synchronous wrapper for BLE scan."""
    return asyncio.run(scan_ble_devices(duration))


def run_ble_explore(address, timeout=15):
    """Synchronous wrapper for BLE device exploration."""
    return asyncio.run(explore_ble_device(address, timeout))


def run_ble_send_receive(address, tx_uuid, rx_uuid, data_bytes, timeout=5):
    """Synchronous wrapper for BLE send/receive."""
    return asyncio.run(ble_send_receive(address, tx_uuid, rx_uuid, data_bytes, timeout))


if __name__ == '__main__':
    if not BLE_AVAILABLE:
        print("ERROR: bleak not installed. Run: pip install bleak")
        exit(1)

    print("\nRuiDa RDCleanV4 - BLE Scanner")
    print("=" * 40)
    print("Scanning for BLE devices...\n")

    results = run_ble_scan(duration=10)

    if results.get('error'):
        print(f"Error: {results['error']}")
    else:
        print(f"Found {results['total_found']} BLE devices:")
        for d in results['devices'][:20]:
            marker = " <<<< LIKELY CONTROLLER" if d['score'] >= 5 else ""
            print(f"  {d['name']:30s} | {d['address']} | RSSI: {d['rssi']} | Score: {d['score']}{marker}")

        if results['likely_controllers']:
            print(f"\n*** Found {len(results['likely_controllers'])} likely controller(s)!")
            best = results['likely_controllers'][0]
            print(f"*** Best match: {best['name']} ({best['address']})")
            print(f"\nExploring device services...")
            explore = run_ble_explore(best['address'])
            print(json.dumps(explore, indent=2, default=str))
