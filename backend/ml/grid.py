"""Terrain grid and per-cell features (ML.md section 8).
The Jezero grid (60 m cells) is derived from the CTX DEM by pipeline/build_data.py; here it is loaded as a table.
The grid CRS is the DEM's equirectangular Mars projection, so lat/lon map to cells with simple arithmetic."""
import base64
import json
import os

import numpy as np
import pandas as pd
from scipy import ndimage

from .config import MARS_RADIUS_M

UNIT_GROUPS = {   # geologic unit name fragment -> one-hot feature
    "fan": "u_fan", "etched": "u_etched", "floor": "u_floor", "smooth": "u_floor",
    "rim": "u_rim", "ejecta": "u_rim", "interior": "u_rim",
    "nili planum 1": "u_nili", "nili planum 2": "u_nili",
    "eolian": "u_bedform", "rugged": "u_rugged",
}


def _band(g: dict, name: str, dtype: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(g["bands"][name]["data"]), dtype=dtype)


class Terrain:
    def __init__(self, demo_dir: str):
        g = json.load(open(os.path.join(demo_dir, "grid.json"), encoding="utf-8"))
        self.nx, self.ny = g["nx"], g["ny"]
        self.lon_w, self.lat_n, self.dlon, self.dlat = g["lonW"], g["latN"], g["dlon"], g["dlat"]
        n = self.nx * self.ny
        rows, cols = np.divmod(np.arange(n), self.nx)
        elev = _band(g, "elev", "<i2").astype("float32")
        slope = _band(g, "slope", "u1").astype("float32") * 0.25
        df = pd.DataFrame({
            "idx": np.arange(n), "row": rows, "col": cols,
            "lon": self.lon_w + (cols + 0.5) * self.dlon, "lat": self.lat_n - (rows + 0.5) * self.dlat,
            "elevation": elev, "slope": slope,
            "roughness": _band(g, "rough", "u1").astype("float32") / 255,
            "dust": _band(g, "dust", "u1").astype("float32") / 255,           # THEMIS night-IR thermal-inertia proxy
            "unit": _band(g, "unit", "u1").astype("int16"),
        })
        valid = (elev != -32768) & (slope < 62.9)
        self.n_total = n
        # geologic unit one-hots
        geo = json.load(open(os.path.join(demo_dir, "geology.geojson"), encoding="utf-8"))
        id_to_feat = {}
        for u in geo["units"]:
            low = u["name"].lower()
            for frag, feat in UNIT_GROUPS.items():
                if frag in low:
                    id_to_feat[u["id"]] = feat
                    break
        for feat in sorted(set(UNIT_GROUPS.values())):
            df[feat] = df["unit"].map(lambda v, f=feat: 1.0 if id_to_feat.get(v) == f else 0.0).astype("float32")
        # mineral index: closeness (1 km scale) to orbital hydrous-mineral detections
        pois = json.load(open(os.path.join(demo_dir, "pois.geojson"), encoding="utf-8"))["features"]
        mi = np.zeros(n, dtype="float32")
        kx, ky = np.cos(np.radians(18.4)) * 59270.0, 59270.0
        for f in pois:
            if f["properties"].get("kind") == "mineral":
                lo, la = f["geometry"]["coordinates"][:2]
                d = np.hypot((df.lon.to_numpy() - lo) * kx, (df.lat.to_numpy() - la) * ky)
                mi = np.maximum(mi, np.exp(-d / 1000.0).astype("float32"))
        df["mineral_index"] = mi
        # terrain context from the 60 m grid
        e2 = np.where(valid, elev, np.nanmean(elev[valid])).reshape(self.ny, self.nx).astype("float32")
        s2 = np.where(valid, slope, 0).reshape(self.ny, self.nx).astype("float32")
        df["slope_max3"] = ndimage.maximum_filter(s2, 3).ravel()                                   # steepest neighbour
        df["slope_mean5"] = ndimage.uniform_filter(s2, 5).ravel()                                  # how steep the surroundings are
        df["relief5"] = (ndimage.maximum_filter(e2, 5) - ndimage.minimum_filter(e2, 5)).ravel()    # local relief, 300 m window
        df["curv"] = (np.abs(ndimage.laplace(e2)) / 3600.0).ravel()                                # curvature: rims, gullies, breaks in slope
        df["recent_change"] = 0.0
        self.all = df
        self.valid = valid
        self.cells = df[valid].reset_index(drop=True)

    def snap(self, pts: pd.DataFrame) -> pd.DataFrame:
        """Snap lat/lon points onto grid cells (row, col); points outside the grid are dropped."""
        p = pts.copy()
        p["row"] = np.floor((self.lat_n - p["lat"]) / self.dlat).astype(int)
        p["col"] = np.floor((p["lon"] - self.lon_w) / self.dlon).astype(int)
        inside = (p.row >= 0) & (p.row < self.ny) & (p.col >= 0) & (p.col < self.nx)
        p = p[inside].copy()
        p["idx"] = p.row * self.nx + p.col
        return p
