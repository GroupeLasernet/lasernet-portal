"""
DXF Parser – extracts 2D geometry from DXF files using ezdxf.

Supported entity types:
  LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, SPLINE, ELLIPSE

Each entity is converted into a list of (x, y) sample points so the
robot can trace them as linear segments.
"""
from __future__ import annotations
import math
from typing import List, Tuple, Dict, Any

import ezdxf
import numpy as np

Point2D = Tuple[float, float]

# Number of interpolation segments for curves
ARC_SEGMENTS = 36
SPLINE_SEGMENTS = 64
ELLIPSE_SEGMENTS = 48


def parse_dxf(filepath: str) -> Dict[str, Any]:
    """
    Parse a DXF file and return structured path data.

    Returns
    -------
    dict with keys:
        paths : list[dict]   – each dict has "type", "points" (list of [x,y])
        bbox  : dict          – {"min_x", "min_y", "max_x", "max_y"}
    """
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()

    paths: List[Dict[str, Any]] = []

    for entity in msp:
        dxf_type = entity.dxftype()

        if dxf_type == "LINE":
            pts = _parse_line(entity)
            if pts:
                paths.append({"type": "line", "points": pts})

        elif dxf_type in ("LWPOLYLINE", "POLYLINE"):
            pts = _parse_polyline(entity)
            if pts:
                paths.append({"type": "polyline", "points": pts})

        elif dxf_type == "CIRCLE":
            pts = _parse_circle(entity)
            if pts:
                paths.append({"type": "circle", "points": pts})

        elif dxf_type == "ARC":
            pts = _parse_arc(entity)
            if pts:
                paths.append({"type": "arc", "points": pts})

        elif dxf_type == "SPLINE":
            pts = _parse_spline(entity)
            if pts:
                paths.append({"type": "spline", "points": pts})

        elif dxf_type == "ELLIPSE":
            pts = _parse_ellipse(entity)
            if pts:
                paths.append({"type": "ellipse", "points": pts})

    bbox = _compute_bbox(paths)
    return {"paths": paths, "bbox": bbox}


# -------------------------------------------------------------------
# Entity parsers
# -------------------------------------------------------------------

def _parse_line(entity) -> List[List[float]]:
    s = entity.dxf.start
    e = entity.dxf.end
    return [[round(s.x, 4), round(s.y, 4)],
            [round(e.x, 4), round(e.y, 4)]]


def _parse_polyline(entity) -> List[List[float]]:
    try:
        # LWPOLYLINE
        pts = list(entity.get_points(format="xy"))
    except AttributeError:
        # 2D POLYLINE
        pts = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]

    result = [[round(x, 4), round(y, 4)] for x, y in pts]

    # Close the polyline if flagged
    is_closed = getattr(entity.dxf, "flags", 0) & 1 or getattr(entity, "closed", False)
    if is_closed and len(result) > 1 and result[0] != result[-1]:
        result.append(result[0])

    return result


def _parse_circle(entity) -> List[List[float]]:
    cx = entity.dxf.center.x
    cy = entity.dxf.center.y
    r = entity.dxf.radius
    pts = []
    for i in range(ARC_SEGMENTS + 1):
        angle = 2 * math.pi * i / ARC_SEGMENTS
        pts.append([round(cx + r * math.cos(angle), 4),
                     round(cy + r * math.sin(angle), 4)])
    return pts


def _parse_arc(entity) -> List[List[float]]:
    cx = entity.dxf.center.x
    cy = entity.dxf.center.y
    r = entity.dxf.radius
    start_angle = math.radians(entity.dxf.start_angle)
    end_angle = math.radians(entity.dxf.end_angle)

    if end_angle <= start_angle:
        end_angle += 2 * math.pi

    pts = []
    for i in range(ARC_SEGMENTS + 1):
        t = i / ARC_SEGMENTS
        angle = start_angle + t * (end_angle - start_angle)
        pts.append([round(cx + r * math.cos(angle), 4),
                     round(cy + r * math.sin(angle), 4)])
    return pts


def _parse_spline(entity) -> List[List[float]]:
    try:
        # Use ezdxf's built-in flattening
        pts = list(entity.flattening(distance=0.1))
        return [[round(p.x, 4), round(p.y, 4)] for p in pts]
    except Exception:
        # Fallback: use control points
        cps = entity.control_points
        if not cps:
            return []
        return [[round(p[0], 4), round(p[1], 4)] for p in cps]


def _parse_ellipse(entity) -> List[List[float]]:
    try:
        pts = list(entity.flattening(distance=0.1))
        return [[round(p.x, 4), round(p.y, 4)] for p in pts]
    except Exception:
        return []


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def _compute_bbox(paths: List[Dict]) -> Dict[str, float]:
    """Compute bounding box across all paths."""
    all_x, all_y = [], []
    for p in paths:
        for pt in p["points"]:
            all_x.append(pt[0])
            all_y.append(pt[1])

    if not all_x:
        return {"min_x": 0, "min_y": 0, "max_x": 0, "max_y": 0}

    return {
        "min_x": min(all_x),
        "min_y": min(all_y),
        "max_x": max(all_x),
        "max_y": max(all_y),
    }


def paths_to_svg(paths: List[Dict], width: int = 800, height: int = 600) -> str:
    """
    Convert parsed paths to an SVG string for preview in the web UI.
    """
    bbox = _compute_bbox(paths)
    bw = bbox["max_x"] - bbox["min_x"] or 1
    bh = bbox["max_y"] - bbox["min_y"] or 1

    # Add 5% padding
    pad = max(bw, bh) * 0.05
    vb_x = bbox["min_x"] - pad
    vb_y = bbox["min_y"] - pad
    vb_w = bw + 2 * pad
    vb_h = bh + 2 * pad

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{vb_x} {-vb_y - vb_h} {vb_w} {vb_h}" '
        f'width="{width}" height="{height}" '
        f'style="background:#1a1a2e;">'
    ]

    colors = {
        "line": "#00d4ff",
        "polyline": "#00ff88",
        "circle": "#ff6b6b",
        "arc": "#ffd93d",
        "spline": "#c084fc",
        "ellipse": "#fb923c",
    }

    for path in paths:
        color = colors.get(path["type"], "#ffffff")
        pts = path["points"]
        if len(pts) < 2:
            continue
        # Flip Y axis for SVG (DXF Y-up → SVG Y-down)
        d_parts = [f"M {pts[0][0]} {-pts[0][1]}"]
        for pt in pts[1:]:
            d_parts.append(f"L {pt[0]} {-pt[1]}")
        d = " ".join(d_parts)
        svg_parts.append(
            f'<path d="{d}" fill="none" stroke="{color}" '
            f'stroke-width="{max(bw, bh) * 0.003}" stroke-linecap="round"/>'
        )

    svg_parts.append("</svg>")
    return "\n".join(svg_parts)
