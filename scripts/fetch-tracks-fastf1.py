"""
fetch-tracks-fastf1.py
Fetches real F1 circuit coordinate data using the FastF1 library.
Generates trackPaths.json with actual GPS-derived SVG paths and
accurate sector break fractions derived from fastest-lap telemetry.

Usage: python3 scripts/fetch-tracks-fastf1.py
"""

import fastf1
import numpy as np
import json
import os
import sys

CACHE_DIR = '/tmp/ff1cache'
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

OUT_PATH = os.path.join(os.path.dirname(__file__), '../src/data/trackPaths.json')

# circuit_id -> (year, round_number)
CIRCUIT_ROUNDS = {
    'bahrain':       (2024, 1),
    'jeddah':        (2024, 2),
    'albert_park':   (2024, 3),
    'suzuka':        (2024, 4),
    'shanghai':      (2024, 5),
    'miami':         (2024, 6),
    'imola':         (2024, 7),
    'monaco':        (2024, 8),
    'villeneuve':    (2024, 9),
    'catalunya':     (2024, 10),
    'red_bull_ring': (2024, 11),
    'silverstone':   (2024, 12),
    'hungaroring':   (2024, 13),
    'spa':           (2024, 14),
    'zandvoort':     (2024, 15),
    'monza':         (2024, 16),
    'baku':          (2024, 17),
    'marina_bay':    (2024, 18),
    'americas':      (2024, 19),
    'rodriguez':     (2024, 20),
    'interlagos':    (2024, 21),
    'vegas':         (2024, 22),
    'losail':        (2024, 23),
    'yas_marina':    (2024, 24),
}


def douglas_peucker(points, epsilon):
    if len(points) < 3:
        return points
    max_dist = 0
    max_idx = 0
    end = len(points) - 1
    p0 = np.array(points[0], dtype=float)
    pe = np.array(points[end], dtype=float)
    line_vec = pe - p0
    line_len = np.linalg.norm(line_vec)
    for i in range(1, end):
        pt = np.array(points[i], dtype=float)
        if line_len == 0:
            dist = np.linalg.norm(pt - p0)
        else:
            dist = abs(np.cross(line_vec, p0 - pt)) / line_len
        if dist > max_dist:
            max_dist = dist
            max_idx = i
    if max_dist > epsilon:
        left = douglas_peucker(points[:max_idx + 1], epsilon)
        right = douglas_peucker(points[max_idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[end]]


def simplify_to_target(points, target_min=50, target_max=100):
    lo, hi = 1.0, 10000.0
    best = points
    for _ in range(25):
        mid = (lo + hi) / 2
        simplified = douglas_peucker(list(points), mid)
        n = len(simplified)
        if n > target_max:
            lo = mid
        elif n < target_min:
            hi = mid
        else:
            best = simplified
            break
        best = simplified
    return best


def catmull_rom_to_bezier(points):
    """Convert list of (x,y) tuples to a closed SVG cubic Bézier path."""
    n = len(points)
    pts = [np.array(p, dtype=float) for p in points]
    cmds = []
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        cp1 = p1 + (p2 - p0) / 6
        cp2 = p2 - (p3 - p1) / 6
        if i == 0:
            cmds.append(f"M {p1[0]:.1f},{p1[1]:.1f}")
        cmds.append(
            f"C {cp1[0]:.1f},{cp1[1]:.1f} {cp2[0]:.1f},{cp2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
        )
    cmds.append("Z")
    return " ".join(cmds)


def normalize_points(points, w=1000, h=600, margin=60):
    pts = np.array(points, dtype=float)
    min_xy = pts.min(axis=0)
    max_xy = pts.max(axis=0)
    span = max_xy - min_xy
    span = np.where(span == 0, 1, span)
    scale = min((w - 2 * margin) / span[0], (h - 2 * margin) / span[1])
    offset = np.array([(w - span[0] * scale) / 2, (h - span[1] * scale) / 2])
    return [(offset[0] + (p[0] - min_xy[0]) * scale,
             offset[1] + (p[1] - min_xy[1]) * scale) for p in pts]


def sector_breaks_from_telemetry(lap, tel):
    """
    Calculate sector break positions as fractions of track distance.
    Uses the Distance column from telemetry and sector times from the lap.
    """
    try:
        s1 = lap['Sector1Time']
        s2 = lap['Sector2Time']
        lap_time = lap['LapTime']
        lap_start = lap['LapStartTime']

        if any(t is None or (hasattr(t, 'isnull') and t.isnull()) for t in [s1, s2, lap_time, lap_start]):
            return [0.33, 0.67]

        import pandas as pd
        s1_end = lap_start + s1
        s2_end = lap_start + s1 + s2

        total_dist = tel['Distance'].max()
        if total_dist <= 0:
            return [0.33, 0.67]

        # Find distance at end of each sector by matching session time
        s1_rows = tel[tel['SessionTime'] <= s1_end]
        s2_rows = tel[tel['SessionTime'] <= s2_end]

        if s1_rows.empty or s2_rows.empty:
            return [0.33, 0.67]

        b1 = round(float(s1_rows['Distance'].iloc[-1]) / total_dist, 3)
        b2 = round(float(s2_rows['Distance'].iloc[-1]) / total_dist, 3)

        # Sanity check
        if 0.1 < b1 < 0.5 and b1 < b2 < 0.9:
            return [b1, b2]
    except Exception as e:
        print(f"    Sector break calc failed: {e}")

    return [0.33, 0.67]


def process_circuit(circuit_id, year, round_num):
    print(f"\n[{circuit_id}] {year} round {round_num} Q...")
    try:
        session = fastf1.get_session(year, round_num, 'Q')
        session.load(telemetry=True, laps=True, weather=False, messages=False)

        fastest = session.laps.pick_fastest()
        if fastest is None or (hasattr(fastest, 'empty') and fastest.empty):
            print("  No fastest lap")
            return None

        tel = fastest.get_telemetry()
        if tel is None or len(tel) < 50:
            print(f"  Insufficient telemetry ({len(tel) if tel is not None else 0} rows)")
            return None

        print(f"  {len(tel)} telemetry points")

        # Extract X/Y, drop NaN
        xy = tel[['X', 'Y']].dropna()
        if len(xy) < 20:
            print(f"  Too few valid points: {len(xy)}")
            return None

        points = list(zip(xy['X'].tolist(), xy['Y'].tolist()))

        # Downsample if huge
        if len(points) > 3000:
            step = len(points) // 3000
            points = points[::step]

        simplified = simplify_to_target(points)
        print(f"  Simplified to {len(simplified)} points")

        normalized = normalize_points(simplified)
        svg_path = catmull_rom_to_bezier(normalized)

        sector_breaks = sector_breaks_from_telemetry(fastest, tel)
        print(f"  Sector breaks: {sector_breaks}")

        return {
            'path': svg_path,
            'sector_breaks': sector_breaks,
            'source': 'fastf1',
        }

    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    # Load existing data as fallback
    existing = {}
    if os.path.exists(OUT_PATH):
        with open(OUT_PATH) as f:
            existing = json.load(f)
        print(f"Loaded {len(existing)} existing circuits as fallback")

    results = {}
    failed = []

    for circuit_id, (year, round_num) in CIRCUIT_ROUNDS.items():
        result = process_circuit(circuit_id, year, round_num)
        if result:
            results[circuit_id] = result
        else:
            failed.append(circuit_id)
            if circuit_id in existing:
                results[circuit_id] = existing[circuit_id]
                print(f"  Falling back to existing data for {circuit_id}")

    with open(OUT_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n=== Done ===")
    print(f"Wrote {len(results)} circuits to {OUT_PATH}")
    if failed:
        print(f"Failed (used fallback): {failed}")

    by_source = {}
    for v in results.values():
        by_source[v['source']] = by_source.get(v['source'], 0) + 1
    print(f"Sources: {by_source}")


if __name__ == '__main__':
    main()
