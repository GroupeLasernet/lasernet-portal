"""
Relfar V4 / RuiDa RDCleanV4-DWPro - Web Server
=================================================
Flask server for the RDWelder.V4-A V1.1 controller.
DB persistence for settings, presets, and scan results.
"""

import os
import json
import time
import threading
import logging
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pymodbus.client import ModbusSerialClient
from scanner import full_scan, list_com_ports, configure_rs485_mode, passive_listen
from database import (
    init_db, SessionLocal, ControllerSettings, LaserPreset, ScanResult,
    RegisterSnapshot, StateLog, upsert_controller_settings, prune_state_logs
)

try:
    from ble_scanner import run_ble_scan, run_ble_explore, run_ble_send_receive, BLE_AVAILABLE
except ImportError:
    BLE_AVAILABLE = False

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static')
CORS(app)

# Initialize database
init_db()

# Load singleton ControllerSettings from DB at startup
def load_controller_settings():
    """Load persistent controller settings from DB."""
    db = SessionLocal()
    try:
        settings = db.query(ControllerSettings).filter_by(id=1).first()
        if settings:
            return {
                'port': settings.port or 'COM5',
                'baud_rate': settings.baud_rate,
                'parity': settings.parity or 'N',
                'slave_id': settings.slave_id or 1,
                'rs485_mode': settings.rs485_mode or 'normal',
            }
    finally:
        db.close()
    return {}

loaded_settings = load_controller_settings()

# Global state
controller_state = {
    'connected': False,
    'port': loaded_settings.get('port', 'COM5'),
    'baud_rate': loaded_settings.get('baud_rate'),
    'parity': loaded_settings.get('parity', 'N'),
    'slave_id': loaded_settings.get('slave_id', 1),
    'rs485_mode': loaded_settings.get('rs485_mode', 'normal'),
    'last_scan': None,
    'scan_in_progress': False,
    'registers': {},
    'last_read_time': None,
    'error': None,
    'connection_settings': None,
    'board_info': {
        'manufacturer': 'RuiDa Technology (RDACS)',
        'board': 'RDWelder.V4-A V1.1',
        'product': 'RDCleanV4-DWPro(EC)',
    }
}

modbus_client = None
client_lock = threading.Lock()


def get_modbus_client():
    global modbus_client
    settings = controller_state['connection_settings']
    if not settings:
        return None
    if modbus_client is None:
        modbus_client = ModbusSerialClient(
            port=controller_state['port'],
            baudrate=settings['baud_rate'],
            parity=settings['parity'],
            stopbits=1, bytesize=8, timeout=0.5
        )
        if not modbus_client.connect():
            modbus_client = None
            controller_state['connected'] = False
            controller_state['error'] = 'Failed to connect'
            return None
        if hasattr(modbus_client, 'socket') and modbus_client.socket:
            configure_rs485_mode(modbus_client.socket, controller_state['rs485_mode'])
        controller_state['connected'] = True
        controller_state['error'] = None
    return modbus_client


def close_modbus_client():
    global modbus_client
    if modbus_client:
        modbus_client.close()
        modbus_client = None
    controller_state['connected'] = False


# ==================== API ROUTES ====================

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/status')
def get_status():
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
        'registers': controller_state['registers'],
        'board_info': controller_state['board_info']
    })


@app.route('/api/ports')
def get_ports():
    try:
        return jsonify({'ports': list_com_ports()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rs485-mode', methods=['POST'])
def toggle_rs485_mode():
    data = request.json or {}
    new_mode = data.get('mode')
    if new_mode:
        if new_mode not in ('normal', 'inverted'):
            return jsonify({'error': 'Mode must be "normal" or "inverted"'}), 400
    else:
        new_mode = 'inverted' if controller_state['rs485_mode'] == 'normal' else 'normal'

    old_mode = controller_state['rs485_mode']
    controller_state['rs485_mode'] = new_mode
    if controller_state['connection_settings']:
        controller_state['connection_settings']['rs485_mode'] = new_mode

    with client_lock:
        if modbus_client and hasattr(modbus_client, 'socket') and modbus_client.socket:
            configure_rs485_mode(modbus_client.socket, new_mode)

    return jsonify({
        'old_mode': old_mode, 'new_mode': new_mode,
        'description': 'RTS HIGH during TX' if new_mode == 'normal' else 'RTS LOW during TX (inverted)'
    })


@app.route('/api/listen', methods=['POST'])
def start_listen():
    """Passive listen mode — just listen for any incoming data."""
    data = request.json or {}
    port = data.get('port', controller_state['port'])
    baud = data.get('baud_rate', 115200)
    duration = min(data.get('duration', 5), 15)
    mode = data.get('rs485_mode', controller_state['rs485_mode'])

    try:
        close_modbus_client()
        results = passive_listen(port, baud, duration=duration, rs485_mode=mode)
        return jsonify({
            'data': results,
            'count': len(results),
            'baud_rate': baud,
            'duration': duration,
            'rs485_mode': mode
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/scan', methods=['POST'])
def start_scan():
    if controller_state['scan_in_progress']:
        return jsonify({'error': 'Scan already in progress'}), 409

    data = request.json or {}
    port = data.get('port', controller_state['port'])
    quick = data.get('quick', False)
    rs485_mode = data.get('rs485_mode', 'both')

    controller_state['port'] = port
    controller_state['scan_in_progress'] = True
    controller_state['error'] = None

    def run_scan():
        try:
            close_modbus_client()
            results = full_scan(port=port, quick=quick, rs485_mode=rs485_mode)
            controller_state['last_scan'] = results

            # Persist scan result to DB
            db = SessionLocal()
            try:
                scan_record = ScanResult(
                    scan_type='full',
                    result_json=json.dumps(results)
                )
                db.add(scan_record)
                db.commit()
            finally:
                db.close()

            if results['modbus_hits']:
                best = results['modbus_hits'][0]
                controller_state['connection_settings'] = {
                    'baud_rate': best['baud_rate'],
                    'parity': best['parity'],
                    'slave_id': best['slave_id'],
                    'rs485_mode': best.get('rs485_mode', 'normal'),
                }
                controller_state['baud_rate'] = best['baud_rate']
                controller_state['parity'] = best['parity']
                controller_state['slave_id'] = best['slave_id']
                controller_state['rs485_mode'] = best.get('rs485_mode', 'normal')
                controller_state['registers'] = {
                    str(best['address'] + i): v for i, v in enumerate(best['values'])
                }
                controller_state['connected'] = True

                # Persist updated settings to DB
                db = SessionLocal()
                try:
                    upsert_controller_settings(
                        db,
                        port=controller_state['port'],
                        baud_rate=best['baud_rate'],
                        parity=best['parity'],
                        slave_id=best['slave_id'],
                        rs485_mode=best.get('rs485_mode', 'normal'),
                        last_connected_at=datetime.utcnow()
                    )
                finally:
                    db.close()
            else:
                controller_state['error'] = results.get('recommendation', 'No device found')
        except Exception as e:
            controller_state['error'] = str(e)
            logger.exception("Error during scan")
        finally:
            controller_state['scan_in_progress'] = False

    threading.Thread(target=run_scan, daemon=True).start()
    return jsonify({'message': 'Scan started', 'port': port})


@app.route('/api/connect', methods=['POST'])
def manual_connect():
    data = request.json
    if not data:
        return jsonify({'error': 'No settings provided'}), 400

    close_modbus_client()
    controller_state['port'] = data.get('port', controller_state['port'])
    controller_state['rs485_mode'] = data.get('rs485_mode', controller_state['rs485_mode'])
    baud_rate = data.get('baud_rate', 115200)
    parity = data.get('parity', 'N')
    slave_id = data.get('slave_id', 1)

    controller_state['connection_settings'] = {
        'baud_rate': baud_rate,
        'parity': parity,
        'slave_id': slave_id,
        'rs485_mode': controller_state['rs485_mode'],
    }
    controller_state['baud_rate'] = baud_rate
    controller_state['parity'] = parity
    controller_state['slave_id'] = slave_id

    client = get_modbus_client()
    if client:
        # Persist successful connection to DB
        db = SessionLocal()
        try:
            upsert_controller_settings(
                db,
                port=controller_state['port'],
                baud_rate=baud_rate,
                parity=parity,
                slave_id=slave_id,
                rs485_mode=controller_state['rs485_mode'],
                last_connected_at=datetime.utcnow()
            )
        finally:
            db.close()
        return jsonify({'message': 'Connected', 'connected': True})
    return jsonify({'error': 'Failed to connect', 'connected': False}), 500


@app.route('/api/read', methods=['POST'])
def read_registers():
    data = request.json or {}
    address = data.get('address', 0)
    count = data.get('count', 10)
    reg_type = data.get('type', 'holding')

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

            register_data = {str(address + i): v for i, v in enumerate(result.registers)}
            controller_state['registers'].update(register_data)
            controller_state['last_read_time'] = time.strftime('%Y-%m-%d %H:%M:%S')

            # Persist register snapshot to DB
            db = SessionLocal()
            try:
                snapshot = RegisterSnapshot(
                    registers_json=json.dumps(register_data)
                )
                db.add(snapshot)
                db.commit()
            finally:
                db.close()

            return jsonify({
                'registers': register_data,
                'address_start': address,
                'count': len(result.registers),
                'type': reg_type,
                'timestamp': controller_state['last_read_time']
            })
        except Exception as e:
            controller_state['error'] = str(e)
            close_modbus_client()
            return jsonify({'error': str(e)}), 500


@app.route('/api/write', methods=['POST'])
def write_registers():
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    address = data.get('address')
    values = data.get('values')
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
            for i, val in enumerate(values):
                controller_state['registers'][str(address + i)] = val
            return jsonify({'message': 'Write successful', 'address': address, 'values': values})
        except Exception as e:
            controller_state['error'] = str(e)
            return jsonify({'error': str(e)}), 500


@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    close_modbus_client()
    controller_state['connection_settings'] = None
    controller_state['registers'] = {}
    return jsonify({'message': 'Disconnected'})


@app.route('/api/scan-results')
def get_scan_results():
    if controller_state['last_scan']:
        return jsonify(controller_state['last_scan'])
    return jsonify({'error': 'No scan results'}), 404


# ==================== PRESET ROUTES ====================

@app.route('/api/presets', methods=['GET'])
def list_presets():
    """List all laser presets."""
    db = SessionLocal()
    try:
        presets = db.query(LaserPreset).order_by(LaserPreset.created_at.desc()).all()
        return jsonify([{
            'id': p.id,
            'name': p.name,
            'description': p.description,
            'registers_json': json.loads(p.registers_json) if p.registers_json else {},
            'port': p.port,
            'baud_rate': p.baud_rate,
            'parity': p.parity,
            'slave_id': p.slave_id,
            'rs485_mode': p.rs485_mode,
            'status': p.status,
            'created_at': p.created_at.isoformat() if p.created_at else None,
            'updated_at': p.updated_at.isoformat() if p.updated_at else None,
            'created_by': p.created_by,
        } for p in presets])
    finally:
        db.close()


@app.route('/api/presets', methods=['POST'])
def create_preset():
    """Create a new laser preset."""
    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400

    db = SessionLocal()
    try:
        preset = LaserPreset(
            name=data.get('name'),
            description=data.get('description'),
            registers_json=json.dumps(data.get('registers_json', {})),
            port=data.get('port'),
            baud_rate=data.get('baud_rate'),
            parity=data.get('parity'),
            slave_id=data.get('slave_id'),
            rs485_mode=data.get('rs485_mode'),
            status=data.get('status', 'development'),
            created_by=data.get('created_by'),
        )
        db.add(preset)
        db.commit()
        db.refresh(preset)
        return jsonify({
            'id': preset.id,
            'name': preset.name,
            'created_at': preset.created_at.isoformat() if preset.created_at else None,
        }), 201
    finally:
        db.close()


@app.route('/api/presets/<int:preset_id>', methods=['GET'])
def get_preset(preset_id):
    """Get a specific preset by ID."""
    db = SessionLocal()
    try:
        preset = db.query(LaserPreset).filter_by(id=preset_id).first()
        if not preset:
            return jsonify({'error': 'Preset not found'}), 404
        return jsonify({
            'id': preset.id,
            'name': preset.name,
            'description': preset.description,
            'registers_json': json.loads(preset.registers_json) if preset.registers_json else {},
            'port': preset.port,
            'baud_rate': preset.baud_rate,
            'parity': preset.parity,
            'slave_id': preset.slave_id,
            'rs485_mode': preset.rs485_mode,
            'status': preset.status,
            'created_at': preset.created_at.isoformat() if preset.created_at else None,
            'updated_at': preset.updated_at.isoformat() if preset.updated_at else None,
            'created_by': preset.created_by,
        })
    finally:
        db.close()


@app.route('/api/presets/<int:preset_id>', methods=['PUT'])
def update_preset(preset_id):
    """Update an existing preset."""
    data = request.json or {}
    db = SessionLocal()
    try:
        preset = db.query(LaserPreset).filter_by(id=preset_id).first()
        if not preset:
            return jsonify({'error': 'Preset not found'}), 404

        if 'name' in data:
            preset.name = data['name']
        if 'description' in data:
            preset.description = data['description']
        if 'registers_json' in data:
            preset.registers_json = json.dumps(data['registers_json'])
        if 'port' in data:
            preset.port = data['port']
        if 'baud_rate' in data:
            preset.baud_rate = data['baud_rate']
        if 'parity' in data:
            preset.parity = data['parity']
        if 'slave_id' in data:
            preset.slave_id = data['slave_id']
        if 'rs485_mode' in data:
            preset.rs485_mode = data['rs485_mode']
        if 'status' in data:
            preset.status = data['status']

        preset.updated_at = datetime.utcnow()
        db.commit()
        return jsonify({'message': 'Preset updated', 'id': preset.id})
    finally:
        db.close()


@app.route('/api/presets/<int:preset_id>', methods=['DELETE'])
def delete_preset(preset_id):
    """Delete a preset."""
    db = SessionLocal()
    try:
        preset = db.query(LaserPreset).filter_by(id=preset_id).first()
        if not preset:
            return jsonify({'error': 'Preset not found'}), 404
        db.delete(preset)
        db.commit()
        return jsonify({'message': 'Preset deleted'})
    finally:
        db.close()


@app.route('/api/state-snapshot', methods=['GET'])
def get_state_snapshot():
    """
    Return current controller_state and latest RegisterSnapshot from DB.
    Useful for dashboards and state recovery.
    """
    db = SessionLocal()
    try:
        last_snapshot = db.query(RegisterSnapshot).order_by(RegisterSnapshot.timestamp.desc()).first()
        snapshot_data = {}
        if last_snapshot:
            snapshot_data = json.loads(last_snapshot.registers_json) if last_snapshot.registers_json else {}

        return jsonify({
            'controller_state': controller_state,
            'last_register_snapshot': {
                'timestamp': last_snapshot.timestamp.isoformat() if last_snapshot else None,
                'registers': snapshot_data,
            }
        })
    finally:
        db.close()


# ==================== BLE ROUTES ====================

@app.route('/api/ble/status')
def ble_status():
    return jsonify({'available': BLE_AVAILABLE})


@app.route('/api/ble/scan', methods=['POST'])
def ble_scan():
    if not BLE_AVAILABLE:
        return jsonify({'error': 'BLE not available. Install bleak: pip install bleak'}), 503
    data = request.json or {}
    duration = min(data.get('duration', 10), 30)
    try:
        results = run_ble_scan(duration=duration)

        # Persist BLE scan result to DB
        db = SessionLocal()
        try:
            scan_record = ScanResult(
                scan_type='ble',
                result_json=json.dumps(results)
            )
            db.add(scan_record)
            db.commit()
        finally:
            db.close()

        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ble/explore', methods=['POST'])
def ble_explore():
    if not BLE_AVAILABLE:
        return jsonify({'error': 'BLE not available'}), 503
    data = request.json or {}
    address = data.get('address')
    if not address:
        return jsonify({'error': 'BLE address required'}), 400
    try:
        results = run_ble_explore(address)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ble/send', methods=['POST'])
def ble_send():
    if not BLE_AVAILABLE:
        return jsonify({'error': 'BLE not available'}), 503
    data = request.json or {}
    address = data.get('address')
    tx_uuid = data.get('tx_uuid')
    rx_uuid = data.get('rx_uuid')
    payload = data.get('data', [])
    if not all([address, tx_uuid, rx_uuid]):
        return jsonify({'error': 'address, tx_uuid, rx_uuid required'}), 400
    try:
        results = run_ble_send_receive(address, tx_uuid, rx_uuid, payload)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("  RuiDa RDCleanV4 / Relfar V4 - Controller Dashboard")
    print("  Board: RDWelder.V4-A V1.1 | Product: RDCleanV4-DWPro(EC)")
    print("=" * 60)
    print(f"\n  Open: http://localhost:5000")
    print(f"  COM port: {controller_state['port']}")
    print(f"\n  Ctrl+C to stop")
    print("=" * 60 + "\n")

    app.run(host='0.0.0.0', port=5000, debug=False)
