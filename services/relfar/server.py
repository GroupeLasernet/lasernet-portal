"""
Relfar V4 Laser Controller - Web Server
========================================
Flask server that:
1. Exposes API endpoints to scan, read, and write to the controller
2. Serves a web dashboard
3. Maintains persistent connection once settings are found
4. Supports RS485 RTS polarity toggling (software TX/RX swap)
"""

import os
import json
import time
import threading
import logging
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pymodbus.client import ModbusSerialClient
from scanner import full_scan, list_com_ports, configure_rs485_mode

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static')
CORS(app)

# ==================== SAFETY CONSTANTS ====================
MAX_SESSION_SECONDS = 24 * 60 * 60  # 24 hours max connection
WATCHDOG_TIMEOUT_SECONDS = 15        # Auto-disconnect if no successful comm for 15s

# Global state
controller_state = {
    'connected': False,
    'port': 'COM5',
    'baud_rate': None,
    'parity': 'N',
    'slave_id': 1,
    'rs485_mode': 'normal',   # 'normal' or 'inverted'
    'last_scan': None,
    'scan_in_progress': False,
    'scan_progress': 0,
    'registers': {},
    'last_read_time': None,
    'error': None,
    'connection_settings': None,
    'connected_at': None,           # Timestamp when connected
    'last_successful_comm': None,   # Timestamp of last successful Modbus operation
}

modbus_client = None
client_lock = threading.Lock()
watchdog_running = False
watchdog_thread = None


def get_modbus_client():
    """Get or create a Modbus client with current settings."""
    global modbus_client
    settings = controller_state['connection_settings']
    if not settings:
        return None

    if modbus_client is None:
        modbus_client = ModbusSerialClient(
            port=controller_state['port'],
            baudrate=settings['baud_rate'],
            parity=settings['parity'],
            stopbits=1,
            bytesize=8,
            timeout=0.5
        )
        if not modbus_client.connect():
            modbus_client = None
            controller_state['connected'] = False
            controller_state['error'] = 'Failed to connect with saved settings'
            return None

        # Apply RS485 polarity mode
        apply_rs485_mode_to_client(modbus_client, controller_state['rs485_mode'])

        controller_state['connected'] = True
        controller_state['error'] = None
        controller_state['connected_at'] = time.time()
        controller_state['last_successful_comm'] = time.time()
        start_watchdog()

    return modbus_client


def apply_rs485_mode_to_client(client, mode):
    """Apply RS485 polarity mode to the Modbus client's serial port."""
    try:
        if hasattr(client, 'socket') and client.socket:
            configure_rs485_mode(client.socket, mode)
        elif hasattr(client, 'transport') and hasattr(client.transport, 'serial'):
            configure_rs485_mode(client.transport.serial, mode)
        logger.info(f"RS485 mode set to: {mode}")
    except Exception as e:
        logger.warning(f"Could not set RS485 mode: {e}")


def close_modbus_client(reason='user request'):
    """Close the Modbus client."""
    global modbus_client
    stop_watchdog()
    if modbus_client:
        modbus_client.close()
        modbus_client = None
    controller_state['connected'] = False
    controller_state['connected_at'] = None
    controller_state['last_successful_comm'] = None
    logger.info(f"Modbus client closed. Reason: {reason}")


def mark_successful_comm():
    """Mark that a successful Modbus communication just happened."""
    controller_state['last_successful_comm'] = time.time()


# ==================== WATCHDOG ====================

def start_watchdog():
    """Start watchdog thread: 24h session limit + 15s comm timeout."""
    global watchdog_running, watchdog_thread
    if watchdog_running:
        return
    watchdog_running = True
    watchdog_thread = threading.Thread(target=_watchdog_loop, daemon=True)
    watchdog_thread.start()
    logger.info("Connection watchdog started (24h max session, 15s comm timeout)")


def stop_watchdog():
    """Stop the watchdog thread."""
    global watchdog_running, watchdog_thread
    watchdog_running = False
    if watchdog_thread and watchdog_thread.is_alive():
        watchdog_thread.join(timeout=3)
    watchdog_thread = None


def _watchdog_loop():
    """Check every 5 seconds whether the connection should be killed."""
    global watchdog_running
    while watchdog_running and controller_state['connected']:
        now = time.time()

        # Check 24h session limit
        connected_at = controller_state.get('connected_at')
        if connected_at and (now - connected_at) > MAX_SESSION_SECONDS:
            logger.warning("WATCHDOG: 24-hour session limit reached. Auto-disconnecting laser controller.")
            watchdog_running = False
            close_modbus_client(reason='24h session limit')
            return

        # Check 15s communication timeout
        last_comm = controller_state.get('last_successful_comm')
        if last_comm and (now - last_comm) > WATCHDOG_TIMEOUT_SECONDS:
            logger.warning("WATCHDOG: No successful communication for 15s. Auto-disconnecting laser controller.")
            watchdog_running = False
            close_modbus_client(reason='15s communication timeout')
            return

        time.sleep(5)


# ==================== API ROUTES ====================

@app.route('/')
def index():
    """Serve the web dashboard."""
    return send_from_directory('static', 'index.html')


@app.route('/api/status')
def get_status():
    """Get current controller connection status."""
    return jsonify({
        'connected': controller_state['connected'],
        'port': controller_state['port'],
        'baud_rate': controller_state.get('baud_rate'),
        'slave_id': controller_state.get('slave_id'),
        'parity': controller_state.get('parity'),
        'rs485_mode': controller_state['rs485_mode'],
        'scan_in_progress': controller_state['scan_in_progress'],
        'last_read_time': controller_state['last_read_time'],
        'error': controller_state['error'],
        'connection_settings': controller_state['connection_settings'],
        'registers': controller_state['registers']
    })


@app.route('/api/ports')
def get_ports():
    """List available COM ports."""
    try:
        ports = list_com_ports()
        return jsonify({'ports': ports})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rs485-mode', methods=['POST'])
def toggle_rs485_mode():
    """
    Toggle or set the RS485 RTS polarity mode.
    This is the software 'swap TX/RX' feature.
    """
    data = request.json or {}
    new_mode = data.get('mode')

    if new_mode:
        if new_mode not in ('normal', 'inverted'):
            return jsonify({'error': 'Mode must be "normal" or "inverted"'}), 400
    else:
        # Toggle
        new_mode = 'inverted' if controller_state['rs485_mode'] == 'normal' else 'normal'

    old_mode = controller_state['rs485_mode']
    controller_state['rs485_mode'] = new_mode

    # Update connection settings if they exist
    if controller_state['connection_settings']:
        controller_state['connection_settings']['rs485_mode'] = new_mode

    # Apply to live connection if connected
    with client_lock:
        if modbus_client:
            apply_rs485_mode_to_client(modbus_client, new_mode)

    logger.info(f"RS485 mode toggled: {old_mode} -> {new_mode}")

    return jsonify({
        'message': f'RS485 mode changed to {new_mode}',
        'old_mode': old_mode,
        'new_mode': new_mode,
        'description': 'RTS HIGH during TX' if new_mode == 'normal' else 'RTS LOW during TX (inverted)'
    })


@app.route('/api/scan', methods=['POST'])
def start_scan():
    """Start scanning for the controller."""
    if controller_state['scan_in_progress']:
        return jsonify({'error': 'Scan already in progress'}), 409

    data = request.json or {}
    port = data.get('port', controller_state['port'])
    quick = data.get('quick', False)
    rs485_mode = data.get('rs485_mode', 'both')  # 'normal', 'inverted', or 'both'

    controller_state['port'] = port
    controller_state['scan_in_progress'] = True
    controller_state['error'] = None

    def run_scan():
        try:
            close_modbus_client()
            results = full_scan(port=port, quick=quick, rs485_mode=rs485_mode)
            controller_state['last_scan'] = results

            if results['modbus_hits']:
                best = results['modbus_hits'][0]
                controller_state['connection_settings'] = {
                    'baud_rate': best['baud_rate'],
                    'parity': best['parity'],
                    'slave_id': best['slave_id'],
                    'register_type': best['type'],
                    'register_start': best['address'],
                    'rs485_mode': best.get('rs485_mode', 'normal'),
                }
                controller_state['baud_rate'] = best['baud_rate']
                controller_state['parity'] = best['parity']
                controller_state['slave_id'] = best['slave_id']
                controller_state['rs485_mode'] = best.get('rs485_mode', 'normal')
                controller_state['registers'] = {
                    str(best['address'] + i): v
                    for i, v in enumerate(best['values'])
                }
                controller_state['connected'] = True
                controller_state['connected_at'] = time.time()
                controller_state['last_successful_comm'] = time.time()
                start_watchdog()
                logger.info(f"Controller found! Settings: {controller_state['connection_settings']}")
            else:
                controller_state['error'] = results.get('recommendation', 'No device found')

        except Exception as e:
            controller_state['error'] = str(e)
            logger.error(f"Scan error: {e}")
        finally:
            controller_state['scan_in_progress'] = False

    thread = threading.Thread(target=run_scan, daemon=True)
    thread.start()

    return jsonify({'message': 'Scan started', 'port': port, 'rs485_mode': rs485_mode})


@app.route('/api/connect', methods=['POST'])
def manual_connect():
    """Manually set connection parameters."""
    data = request.json
    if not data:
        return jsonify({'error': 'No settings provided'}), 400

    close_modbus_client()

    controller_state['port'] = data.get('port', controller_state['port'])
    controller_state['rs485_mode'] = data.get('rs485_mode', controller_state['rs485_mode'])
    controller_state['connection_settings'] = {
        'baud_rate': data.get('baud_rate', 9600),
        'parity': data.get('parity', 'N'),
        'slave_id': data.get('slave_id', 1),
        'rs485_mode': controller_state['rs485_mode'],
    }
    controller_state['baud_rate'] = data.get('baud_rate', 9600)
    controller_state['parity'] = data.get('parity', 'N')
    controller_state['slave_id'] = data.get('slave_id', 1)

    client = get_modbus_client()
    if client:
        controller_state['connected_at'] = time.time()
        controller_state['last_successful_comm'] = time.time()
        return jsonify({'message': 'Connected successfully', 'connected': True})
    else:
        return jsonify({'error': 'Failed to connect', 'connected': False}), 500


@app.route('/api/read', methods=['POST'])
def read_registers():
    """Read registers from the controller."""
    data = request.json or {}
    address = data.get('address', 0)
    count = data.get('count', 10)
    reg_type = data.get('type', 'holding')  # 'holding' or 'input'

    with client_lock:
        client = get_modbus_client()
        if not client:
            return jsonify({'error': 'Not connected'}), 503

        try:
            slave_id = controller_state['connection_settings']['slave_id']

            if reg_type == 'holding':
                result = client.read_holding_registers(address=address, count=count, slave=slave_id)
            else:
                result = client.read_input_registers(address=address, count=count, slave=slave_id)

            if result.isError():
                return jsonify({'error': f'Modbus error: {result}'}), 500

            mark_successful_comm()  # Watchdog: mark success

            # Update state
            register_data = {}
            for i, val in enumerate(result.registers):
                register_data[str(address + i)] = val

            controller_state['registers'].update(register_data)
            controller_state['last_read_time'] = time.strftime('%Y-%m-%d %H:%M:%S')

            return jsonify({
                'registers': register_data,
                'address_start': address,
                'count': len(result.registers),
                'type': reg_type,
                'timestamp': controller_state['last_read_time']
            })

        except Exception as e:
            controller_state['error'] = str(e)
            close_modbus_client(reason='communication error')
            return jsonify({'error': str(e)}), 500


@app.route('/api/write', methods=['POST'])
def write_registers():
    """Write values to controller registers."""
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    address = data.get('address')
    values = data.get('values')  # list of values

    if address is None or values is None:
        return jsonify({'error': 'address and values required'}), 400

    with client_lock:
        client = get_modbus_client()
        if not client:
            return jsonify({'error': 'Not connected'}), 503

        try:
            slave_id = controller_state['connection_settings']['slave_id']

            if len(values) == 1:
                result = client.write_register(address=address, value=values[0], slave=slave_id)
            else:
                result = client.write_registers(address=address, values=values, slave=slave_id)

            if result.isError():
                return jsonify({'error': f'Write error: {result}'}), 500

            mark_successful_comm()  # Watchdog: mark success

            # Update local state
            for i, val in enumerate(values):
                controller_state['registers'][str(address + i)] = val

            return jsonify({
                'message': 'Write successful',
                'address': address,
                'values': values
            })

        except Exception as e:
            controller_state['error'] = str(e)
            return jsonify({'error': str(e)}), 500


@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    """Disconnect from the controller."""
    close_modbus_client(reason='user request')
    controller_state['connection_settings'] = None
    controller_state['registers'] = {}
    return jsonify({'message': 'Disconnected'})


@app.route('/api/scan-results')
def get_scan_results():
    """Get the last scan results."""
    if controller_state['last_scan']:
        return jsonify(controller_state['last_scan'])
    return jsonify({'error': 'No scan results available'}), 404


# ==================== START SERVER ====================

if __name__ == '__main__':
    print("\n" + "=" * 55)
    print("  Relfar V4 Laser Controller - Web Dashboard")
    print("=" * 55)
    print(f"\n  Open your browser to: http://localhost:5000")
    print(f"  Default COM port: {controller_state['port']}")
    print(f"\n  Press Ctrl+C to stop the server")
    print("=" * 55 + "\n")

    app.run(host='0.0.0.0', port=5000, debug=False)
