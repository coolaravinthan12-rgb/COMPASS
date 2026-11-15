"""The whole ML pipeline (ML.md section 13): analyse terrain -> snap uploads -> labels -> train both models ->
predict every cell -> apply weather -> hard-mask impossible slopes. Called at startup and by /api/train."""
import json
import os
import time

import numpy as np
import pandas as pd

from . import conditions, labels, models
from .config import (CAUTION, CHANGE_PENALTY, DISCOVERY_MODEL, SAFETY_MODEL, DISCOVERY_FEATURES, MIN_LABELLED, SAFE, SAFETY_FEATURES, SLOPE_HARD_MASK_DEG, SLOPE_SAFE_DEG,
                     SLOPE_UNSAFE_DEG, band)
from .grid import Terrain


def _rule_safety(cells: pd.DataFrame) -> np.ndarray:
    """Fallback when there are too few labels: slope rule only (no learning)."""
    return 100 * np.clip(1 - (cells.slope.to_numpy() - SLOPE_SAFE_DEG) / (SLOPE_UNSAFE_DEG + 10 - SLOPE_SAFE_DEG), 0, 1)


def _tilt_check(terrain: Terrain, demo_dir: str, safety_by_idx: pd.Series, slope_by_idx: pd.Series) -> dict | None:
    """Independent check, NOT used for training: does low predicted safety coincide with the tilt Perseverance measured?"""
    try:
        wp = json.load(open(os.path.join(demo_dir, "waypoints.geojson"), encoding="utf-8"))["features"]
        df = pd.DataFrame([{"lon": f["geometry"]["coordinates"][0], "lat": f["geometry"]["coordinates"][1],
                            "tilt": f["properties"].get("tilt")} for f in wp]).dropna()
        df = terrain.snap(df)
        df["unsafe"] = 100 - df["idx"].map(safety_by_idx)
        df = df.dropna()
        if len(df) < 20:
            return None
        df["slope"] = df["idx"].map(slope_by_idx)
        # baseline: how well plain DEM slope alone ranks the same stops. The model should be read against this.
        return {"n": int(len(df)), "spearman": round(float(df["unsafe"].corr(df["tilt"], method="spearman")), 3),
                "baseline_slope_spearman": round(float(df["slope"].corr(df["tilt"], method="spearman")), 3)}
    except Exception:
        return None


def run(terrain: Terrain, demo_dir: str, traverse: pd.DataFrame, samples: pd.DataFrame,
        weather: pd.DataFrame | None = None, changes: pd.DataFrame | None = None) -> dict:
    t0 = time.time()
    traverse_c = terrain.snap(traverse)
    samples_c = terrain.snap(samples)
    changes_c = terrain.snap(changes) if changes is not None and len(changes) else None

    # features 3 & 4
    cells = conditions.add_change_feature(terrain.cells, changes_c)
    penalty, now = conditions.weather_penalty(weather)

    # labels from features 1 & 2
    cells = labels.safety_labels(cells, traverse_c)
    cells = labels.discovery_labels(cells, samples_c)
    n_safety = int(cells.y_safe.notna().sum())
    n_disc_pos = int(cells.y_disc.eq(1).sum())

    report: dict = {"counts": {"traverse_rows": int(len(traverse)), "traverse_cells": cells.attrs.get("n_real_safety_labels", 0),
                               "sample_rows": int(len(samples)), "sample_sites_in_grid": int(len(samples_c)),
                               "weather_rows": 0 if weather is None else int(len(weather)),
                               "change_rows": 0 if changes is None else int(len(changes)),
                               "safety_labelled_cells": n_safety, "discovery_positive_cells": n_disc_pos}}

    # ---- safety model ----
    if n_safety >= MIN_LABELLED and cells.y_safe.nunique() == 2:
        m_s, met_s, imp_s, cal_s = models.train(cells, SAFETY_FEATURES, "y_safe", "w_safe", kind=SAFETY_MODEL)
        base = models.predict(m_s, cells, SAFETY_FEATURES)
        report["safety"] = {"metrics": met_s, "importance": imp_s, "calibration": cal_s, "mode": "trained"}
    else:
        m_s, base = None, _rule_safety(cells)
        report["safety"] = {"metrics": {}, "importance": {"slope": 1.0}, "calibration": [], "mode": "rule fallback (too few labels)"}

    # ---- discovery model ----
    if n_disc_pos >= 10:
        m_d, met_d, imp_d, cal_d = models.train(cells, DISCOVERY_FEATURES, "y_disc", kind=DISCOVERY_MODEL)
        disc = models.predict(m_d, cells, DISCOVERY_FEATURES)
        report["discovery"] = {"metrics": met_d, "importance": imp_d, "calibration": cal_d, "mode": "trained"}
    else:
        m_d, disc = None, np.zeros(len(cells))
        report["discovery"] = {"metrics": {}, "importance": {}, "calibration": [], "mode": "not trained (needs sample sites inside the map)"}

    # ---- weather penalty + physics guardrail ----
    safety = np.clip(base - penalty - CHANGE_PENALTY * cells.recent_change.to_numpy(), 0, 100)
    blocked = cells.slope.to_numpy() > SLOPE_HARD_MASK_DEG                  # impassable whatever the model says
    safety_u8 = np.where(blocked, 255, np.round(safety)).astype("uint8")
    out_s = np.full(terrain.n_total, 255, dtype="uint8"); out_s[cells.idx.to_numpy()] = safety_u8
    out_d = np.zeros(terrain.n_total, dtype="uint8"); out_d[cells.idx.to_numpy()] = np.round(disc).astype("uint8")
    out_c = np.zeros(terrain.n_total, dtype="uint8"); out_c[cells.idx.to_numpy()] = np.round(cells.recent_change.to_numpy() * 100).astype("uint8")

    report["weather"] = {"penalty": penalty, "current": now}
    report["rover_tilt_check"] = _tilt_check(terrain, demo_dir, pd.Series(np.where(blocked, 0, safety), index=cells.idx.to_numpy()),
                                             pd.Series(cells.slope.to_numpy(), index=cells.idx.to_numpy()))
    ok = ~blocked
    sc = safety[ok]
    report["summary"] = {"safe_pct": round(float((sc >= SAFE).mean()) * 100, 1), "caution_pct": round(float(((sc >= CAUTION) & (sc < SAFE)).mean()) * 100, 1),
                         "unsafe_pct": round(float((sc < CAUTION).mean()) * 100, 1), "blocked_cells": int(blocked.sum()),
                         "high_priority_discovery_cells": int((disc >= SAFE).sum())}
    report["seconds"] = round(time.time() - t0, 1)
    return {"safety": out_s, "discovery": out_d, "recent_change": out_c, "report": report, "models": {"safety": m_s, "discovery": m_d}}


def explain(cell: pd.Series, importance: dict, safety: float, top: int = 2) -> str:
    """Plain-language reason shown in the HUD (ML.md section 14)."""
    parts = []
    for f in list(importance)[:top + 2]:
        if f == "slope": parts.append(f"slope {cell.slope:.0f}°")
        elif f == "roughness": parts.append(f"roughness index {cell.roughness:.2f}")
        elif f == "elevation": parts.append(f"elevation {cell.elevation:.0f} m")
        elif f == "dust": parts.append("loose, dusty ground" if cell.dust < 0.35 else "firm ground")
        elif f == "recent_change": parts.append("recent terrain change" if cell.recent_change > 0.3 else "stable terrain")
        elif f == "mineral_index": parts.append(f"mineral index {cell.mineral_index:.2f}")
        if len(parts) >= top:
            break
    label = {"safe": "higher", "caution": "medium", "unsafe": "lower"}[band(safety)]
    return f"Est. safety {safety:.0f} ({label}): " + ", ".join(parts)
