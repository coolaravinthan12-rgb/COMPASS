#!/usr/bin/env python3
"""Small data file for the landing-page hero: smoothed, down-sampled elevation of Jezero plus the Perseverance
traverse as one simplified line. Run after build_data.py. Output: frontend/public/data/hero.json (~40 KB)."""
import base64, json, os
import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "frontend", "public", "data")
grid = json.load(open(os.path.join(SRC, "grid.json"), encoding="utf-8"))
nx, ny = grid["nx"], grid["ny"]
elev = np.frombuffer(base64.b64decode(grid["bands"]["elev"]["data"]), dtype="<i2").astype("float32").reshape(ny, nx)
elev[elev == -32768] = np.nan
elev = np.where(np.isnan(elev), np.nanmean(elev), elev)

F = 4                                                   # 4 x 4 cells -> 240 m per hero cell
h, w = ny // F, nx // F
small = elev[: h * F, : w * F].reshape(h, F, w, F).mean(axis=(1, 3))
small = ndimage.gaussian_filter(small, 0.8)             # smooth so the contour lines read as clean curves

# Perseverance traverse, in sol order, as a single line in hero-grid coordinates
trav = json.load(open(os.path.join(SRC, "traverse.geojson"), encoding="utf-8"))["features"]
trav.sort(key=lambda f: f["properties"]["sol"])
pts = []
for f in trav:
    g = f["geometry"]
    for ln in ([g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]):
        pts += ln
pts = np.array(pts)
x = (pts[:, 0] - grid["lonW"]) / grid["dlon"] / F
y = (grid["latN"] - pts[:, 1]) / grid["dlat"] / F
keep = np.linspace(0, len(x) - 1, 420).astype(int)
route = [[round(float(x[i]), 2), round(float(y[i]), 2)] for i in keep if 0 <= x[i] <= w and 0 <= y[i] <= h]

def to_xy(lon, lat):
    return [round((lon - grid["lonW"]) / grid["dlon"] / F, 2), round((grid["latN"] - lat) / grid["dlat"] / F, 2)]

out = {
    "w": int(w), "h": int(h),
    "elev": base64.b64encode(np.round(small).astype("<i2").tobytes()).decode(),
    "route": route,
    "landing": to_xy(77.4509, 18.4446),
    "elevMin": int(small.min()), "elevMax": int(small.max()),
}
p = os.path.join(SRC, "hero.json")
json.dump(out, open(p, "w"), separators=(",", ":"))
print(f"hero.json: {os.path.getsize(p)/1024:.0f} KB, grid {w}x{h}, {len(route)} route points, elevation {out['elevMin']}..{out['elevMax']} m")
