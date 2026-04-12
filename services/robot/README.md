# Elfin Cobot Studio

A web-based application for controlling the **Han's Robot Elfin Pro E03** collaborative robot. Import DXF files, visualize 2D paths, and make the robot trace them.

## Features

- **DXF Import & Visualization** – Upload `.dxf` files, parse geometry (lines, polylines, arcs, circles, splines, ellipses), and preview paths in the browser
- **Path-to-Waypoint Conversion** – Map 2D DXF paths onto a 3D work plane in robot space, with configurable origin, orientation, scale, and approach height
- **Robot Control Panel** – Connect, enable/disable servo, jog axes, run programs, emergency stop
- **Project Management** – Organize DXF files and programs into projects, stored in a local SQLite database
- **Simulation Mode** – Test everything without a physical robot (activates automatically if the robot is unreachable)

## Quick Start

### 1. Install Python dependencies

```bash
cd elfin-cobot-studio
pip install -r requirements.txt
```

### 2. Configure robot IP

Edit `config.py` and set `ROBOT_IP` to your Elfin Pro E03's IP address (default: `192.168.0.1`).

### 3. Run

```bash
python run.py
```

The application opens at **http://127.0.0.1:8080** in your browser.

## Usage

1. **Create a project** using the + New button in the left panel
2. **Upload a DXF file** – the 2D paths are parsed and displayed in the viewer
3. **Configure the work plane** in the right panel (origin, orientation, scale)
4. **Generate a program** – converts the DXF paths into robot waypoints
5. **Connect to the robot** (or use simulation mode)
6. **Run the program** – the robot traces the DXF paths

## Project Structure

```
elfin-cobot-studio/
├── run.py              # Application launcher
├── config.py           # All configuration (robot IP, ports, defaults)
├── requirements.txt    # Python dependencies
├── app/
│   ├── main.py         # FastAPI server & REST API
│   ├── database.py     # SQLAlchemy models & DB setup
│   ├── dxf_parser.py   # DXF file parser (ezdxf)
│   ├── path_planner.py # DXF paths → robot waypoints
│   ├── robot_comm.py   # Elfin TCP communication driver
│   ├── templates/
│   │   └── index.html  # Web UI
│   └── static/
│       ├── css/style.css
│       └── js/app.js
├── uploads/            # Uploaded DXF files
└── data/               # SQLite database
```

## Robot Communication

The Elfin Pro E03 uses a TCP command interface on port 10003. Commands are ASCII strings. The driver in `robot_comm.py` handles:

- **MoveL** – Linear (Cartesian) motion
- **MoveJ** – Joint-space motion
- **EnableRobot / DisableRobot** – Servo control
- **ReadCurPos / ReadCurJoint** – State reading
- **Stop** – Emergency stop
- **ClearAlarm** – Error recovery

## Configuration

All defaults are in `config.py`:

| Setting | Default | Description |
|---------|---------|-------------|
| ROBOT_IP | 192.168.0.1 | Robot controller IP |
| ROBOT_PORT | 10003 | TCP command port |
| DEFAULT_SPEED | 50 mm/s | Tracing speed |
| WORK_PLANE_ORIGIN_X/Y/Z | 400/0/200 | Where DXF origin maps in robot space |
| APPROACH_HEIGHT | 20 mm | Lift height between paths |

## Requirements

- Python 3.9+
- Network access to the Elfin Pro E03 (or use simulation mode)
