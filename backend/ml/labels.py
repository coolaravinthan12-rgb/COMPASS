"""Training labels (ML.md section 9).
Safety:    rule labels from slope (weak) + real labels from rover traverse / EVA logs (strong).
Discovery: cells near real sample sites are positives, random background cells are negatives."""
import numpy as np
import pandas as pd

from .config import (CHANGE_UNSAFE, DISCOVERY_NEG_RATIO, DUST_UNSAFE_PCT, LABEL_WEIGHT_REAL, LABEL_WEIGHT_RULE, ROUGH_UNSAFE_PCT, SLIP_UNSAFE,
                     SLOPE_SAFE_DEG, SLOPE_UNSAFE_DEG)


def safety_labels(cells: pd.DataFrame, traverse: pd.DataFrame) -> pd.DataFrame:
    """y_safe = 1 safe, 0 unsafe. Real traverse labels win over slope rules. `traverse` has idx (+ sol, slip, hazard_reported)."""
    cells = cells.copy()
    cells["y_safe"], cells["w_safe"] = np.nan, np.nan

    # rule labels (weak)
    cells.loc[cells.slope <= SLOPE_SAFE_DEG, ["y_safe", "w_safe"]] = [1, LABEL_WEIGHT_RULE]
    cells.loc[cells.slope >= SLOPE_UNSAFE_DEG, ["y_safe", "w_safe"]] = [0, LABEL_WEIGHT_RULE]
    # between the two limits, a weak label that fades from safe to unsafe (seeded, so retraining is repeatable).
    # Without this the labels are separable by slope alone and the model can only output 0 or 100.
    mid = (cells.slope > SLOPE_SAFE_DEG) & (cells.slope < SLOPE_UNSAFE_DEG)
    p_safe = ((SLOPE_UNSAFE_DEG - cells.slope) / (SLOPE_UNSAFE_DEG - SLOPE_SAFE_DEG)).clip(0, 1)
    u = np.random.RandomState(0).rand(len(cells))
    cells.loc[mid, "y_safe"] = (u[mid.to_numpy()] < p_safe[mid].to_numpy()).astype(float)
    cells.loc[mid, "w_safe"] = LABEL_WEIGHT_RULE
    # roughest cells and loose-dust cells (very low thermal-inertia proxy) are weakly unsafe
    rough_hi = cells.roughness >= np.percentile(cells.roughness, ROUGH_UNSAFE_PCT)
    dust_lo = cells.dust <= np.percentile(cells.dust, DUST_UNSAFE_PCT)
    cells.loc[rough_hi | dust_lo, ["y_safe", "w_safe"]] = [0, LABEL_WEIGHT_RULE]
    # cells flagged by a surface-change upload: weak unsafe label
    cells.loc[cells.recent_change >= CHANGE_UNSAFE, ["y_safe", "w_safe"]] = [0, LABEL_WEIGHT_RULE * 3]

    n_real = 0
    if traverse is not None and len(traverse):
        t = traverse.copy()
        latest = t["sol"].max() if "sol" in t else 0
        # newest data counts most: recency = 1 for the newest sol, smaller for older ones (ML.md 13)
        t["recency"] = 1 / (1 + (latest - t["sol"]) / 500) if "sol" in t else 1.0
        agg = t.groupby("idx").agg(recency=("recency", "max"), slip=("slip", "max") if "slip" in t else ("recency", "size"),
                                   haz=("hazard_reported", "max") if "hazard_reported" in t else ("recency", "size"))
        has_slip, has_haz = "slip" in t, "hazard_reported" in t
        pos = cells["idx"].isin(agg.index)
        rec = cells.loc[pos, "idx"].map(agg["recency"])
        cells.loc[pos, "y_safe"] = 1
        cells.loc[pos, "w_safe"] = LABEL_WEIGHT_REAL * rec
        n_real = int(pos.sum())
        bad = pd.Series(False, index=cells.index)
        if has_slip:
            bad |= cells["idx"].map(agg["slip"]).fillna(0) >= SLIP_UNSAFE
        if has_haz:
            bad |= cells["idx"].map(agg["haz"]).fillna(0) >= 1
        cells.loc[bad, ["y_safe", "w_safe"]] = [0, LABEL_WEIGHT_REAL]      # reported hazards = unsafe
    cells.attrs["n_real_safety_labels"] = n_real
    return cells


def discovery_labels(cells: pd.DataFrame, samples: pd.DataFrame, radius_cells: int = 3, neg_ratio: int = DISCOVERY_NEG_RATIO, seed: int = 0) -> pd.DataFrame:
    """y_disc = 1 within `radius_cells` of a sample site, 0 for random background cells. `samples` has row, col."""
    cells = cells.copy()
    cells["y_disc"] = np.nan
    for _, s in samples.iterrows():
        near = (abs(cells.row - s.row) <= radius_cells) & (abs(cells.col - s.col) <= radius_cells)
        cells.loc[near, "y_disc"] = 1
    pos = int(cells.y_disc.eq(1).sum())
    pool = cells[cells.y_disc.isna()]
    if pos and len(pool):
        bg = pool.sample(n=min(pos * neg_ratio, len(pool)), random_state=seed).index
        cells.loc[bg, "y_disc"] = 0
    return cells
