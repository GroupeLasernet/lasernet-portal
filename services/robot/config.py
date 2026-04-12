"""
Elfin Cobot Studio - Configuration
"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Database ---
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'data', 'cobot_studio.db')}"

# --- File uploads ---
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
MAX_UPLOAD_SIZE_MB = 50

# --- Elfin Pro E03 Robot defaults ---
ROBOT_IP = "192.168.10.10"         # Elfin Pro E03 on Cobots VLAN
ROBOT_PORT = 10003                 # Elfin default command port
ROBOT_MODBUS_PORT = 502            # Modbus TCP port

# --- Motion defaults ---
DEFAULT_SPEED = 50.0               # mm/s
DEFAULT_ACCELERATION = 100.0       # mm/s²
DEFAULT_BLEND_RADIUS = 0.5         # mm  (corner smoothing)

# --- Work plane (where the DXF drawing sits in robot space) ---
# The origin of the DXF (0,0) maps to this point in robot base frame (mm)
WORK_PLANE_ORIGIN_X = 400.0
WORK_PLANE_ORIGIN_Y = 0.0
WORK_PLANE_ORIGIN_Z = 200.0

# Tool orientation when tracing (roll, pitch, yaw in degrees)
TOOL_ORIENTATION_RX = 180.0
TOOL_ORIENTATION_RY = 0.0
TOOL_ORIENTATION_RZ = 0.0

# Approach / retract height above work plane (mm)
APPROACH_HEIGHT = 20.0

# --- Server ---
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 8080
