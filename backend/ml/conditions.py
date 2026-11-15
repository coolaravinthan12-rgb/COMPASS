"""Current conditions: weather penalty (feature 3) and the surface-change feature (feature 4); ML.md section 10."""
import pandas as pd

from .config import DUST_TAU_BAD, WEATHER_PENALTY, WIND_BAD


def weather_penalty(weather: pd.DataFrame | None) -> tuple[float, dict]:
    """Uses the most recent sol. Returns (penalty in % points, current conditions)."""
    if weather is None or weather.empty:
        return 0.0, {}
    now = weather.sort_values("sol").iloc[-1].to_dict()
    now = {k: (None if pd.isna(v) else (float(v) if isinstance(v, (int, float)) else v)) for k, v in now.items()}
    penalty = 0.0
    if (now.get("dust_tau") or 0) >= DUST_TAU_BAD:
        penalty += WEATHER_PENALTY
    if (now.get("wind") or 0) >= WIND_BAD:
        penalty += WEATHER_PENALTY / 2
    return penalty, now


def add_change_feature(cells: pd.DataFrame, changes: pd.DataFrame | None, decay_sols: int = 300) -> pd.DataFrame:
    """Adds 'recent_change' (0-1): stronger for newer, bigger changes. `changes` has idx, sol (+ magnitude)."""
    cells = cells.copy()
    cells["recent_change"] = 0.0
    if changes is None or changes.empty:
        return cells
    latest = changes.sol.max()
    mag = changes["magnitude"].fillna(1.0) if "magnitude" in changes else 1.0
    ch = changes.assign(w=((1 - (latest - changes.sol) / decay_sols).clip(0, 1) * mag).clip(0, 1))
    agg = ch.groupby("idx").w.max()
    cells["recent_change"] = cells["idx"].map(agg).fillna(0).astype("float32")
    return cells
