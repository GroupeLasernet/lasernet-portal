"""
Path Planner – converts 2D DXF paths into 3D robot waypoints.

The DXF lives in a 2D plane. We map it onto a "work plane" in the
robot's Cartesian space, defined by:
  - origin (x, y, z): where DXF (0,0) sits in robot base frame
  - orientation (rx, ry, rz): tool orientation while tracing
  - approach_height: how far above the surface the tool lifts between paths

The planner generates approach → trace → retract sequences so the robot:
  1. Lifts to approach height
  2. Moves above the start of the next path
  3. Descends to the work surface
  4. Traces the path
  5. Lifts back up
"""
from __future__ import annotations
from typing import List, Dict, Any


def generate_waypoints(
    paths: List[Dict[str, Any]],
    origin_x: float = 400.0,
    origin_y: float = 0.0,
    origin_z: float = 200.0,
    orientation_rx: float = 180.0,
    orientation_ry: float = 0.0,
    orientation_rz: float = 0.0,
    approach_height: float = 20.0,
    scale: float = 1.0,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Convert parsed DXF paths into robot waypoints.

    Parameters
    ----------
    paths : list of {"type", "points"} dicts from dxf_parser.
    origin_* : work-plane origin in robot base frame (mm).
    orientation_* : fixed tool orientation (degrees).
    approach_height : lift height between paths (mm).
    scale : scale factor applied to DXF coordinates.
    offset_x, offset_y : additional offset applied to DXF coords before mapping.

    Returns
    -------
    list of waypoint dicts:
        {"x", "y", "z", "rx", "ry", "rz", "type": "move"|"trace"}
    """
    waypoints: List[Dict[str, Any]] = []

    def _wp(dxf_x: float, dxf_y: float, z_offset: float, wp_type: str) -> Dict[str, Any]:
        """Map a DXF 2D point to a robot 3D waypoint."""
        rx = origin_x + (dxf_x + offset_x) * scale
        ry = origin_y + (dxf_y + offset_y) * scale
        rz = origin_z + z_offset
        return {
            "x": round(rx, 4),
            "y": round(ry, 4),
            "z": round(rz, 4),
            "rx": orientation_rx,
            "ry": orientation_ry,
            "rz": orientation_rz,
            "type": wp_type,
        }

    for path in paths:
        pts = path.get("points", [])
        if len(pts) < 2:
            continue

        first = pts[0]
        last = pts[-1]

        # 1) Lift to approach height above current position (or start)
        waypoints.append(_wp(first[0], first[1], approach_height, "move"))

        # 2) Descend to work surface at start of path
        waypoints.append(_wp(first[0], first[1], 0.0, "move"))

        # 3) Trace the path on the work surface
        for pt in pts:
            waypoints.append(_wp(pt[0], pt[1], 0.0, "trace"))

        # 4) Retract above the end of the path
        waypoints.append(_wp(last[0], last[1], approach_height, "move"))

    return waypoints


def estimate_travel_distance(waypoints: List[Dict[str, Any]]) -> float:
    """Estimate total travel distance in mm."""
    total = 0.0
    for i in range(1, len(waypoints)):
        dx = waypoints[i]["x"] - waypoints[i - 1]["x"]
        dy = waypoints[i]["y"] - waypoints[i - 1]["y"]
        dz = waypoints[i]["z"] - waypoints[i - 1]["z"]
        total += (dx ** 2 + dy ** 2 + dz ** 2) ** 0.5
    return round(total, 2)


def estimate_cycle_time(waypoints: List[Dict[str, Any]], speed: float = 50.0) -> float:
    """Very rough cycle time estimate in seconds."""
    dist = estimate_travel_distance(waypoints)
    if speed <= 0:
        return 0.0
    return round(dist / speed, 1)
