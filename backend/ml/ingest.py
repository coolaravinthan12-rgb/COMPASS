"""Load any CSV or SQL upload, map the columns to the standard names, validate (ML.md section 7)."""
import io
import sqlite3

import numpy as np
import pandas as pd

ALIASES = {
    "lat": ["lat", "latitude", "planetocentric_latitude"],
    "lon": ["lon", "lng", "long", "longitude", "east_longitude"],
    "sol": ["sol", "mars_day"],
    "dust_tau": ["dust_tau", "tau", "opacity"],
    "rock_type": ["rock_type", "rock", "type"],
    "change_type": ["change_type", "change"],
    "hazard_reported": ["hazard_reported", "hazard"],
    "temp": ["temp", "temperature"],
}

# Standard upload schemas (ML.md section 4)
SCHEMAS = {
    "traverse": {"required": ["lat", "lon", "sol"], "label": "Rover traverse log"},
    "samples": {"required": ["lat", "lon", "sol", "rock_type"], "label": "Sample results"},
    "weather": {"required": ["sol", "dust_tau", "wind", "temp"], "label": "Weather"},
    "changes": {"required": ["lat", "lon", "sol", "change_type"], "label": "Surface change"},
}


def read_any(filename: str, raw: bytes) -> pd.DataFrame:
    if filename.lower().endswith(".sql"):
        con = sqlite3.connect(":memory:")
        con.executescript(raw.decode())
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        return pd.concat([pd.read_sql(f'SELECT * FROM "{t}"', con) for t in tables], ignore_index=True)
    return pd.read_csv(io.BytesIO(raw))


def standardise(df: pd.DataFrame, column_map: dict | None = None) -> pd.DataFrame:
    df = df.rename(columns=lambda c: str(c).strip().lower())
    for std, src in (column_map or {}).items():          # explicit mapping chosen in the UI wins
        if src and src.strip().lower() in df.columns and std in ("lat", "lon", "sol"):
            df = df.rename(columns={src.strip().lower(): std})
    for std, names in ALIASES.items():
        for n in names:
            if n in df.columns and std not in df.columns:
                df = df.rename(columns={n: std})
    return df


def validate(df: pd.DataFrame, kind: str) -> tuple[pd.DataFrame, int, list[str]]:
    """Returns (clean rows, rejected count, problems). Raises ValueError if a required column is missing."""
    need = SCHEMAS[kind]["required"]
    missing = [c for c in need if c not in df.columns]
    if missing:
        raise ValueError(f"{SCHEMAS[kind]['label']} needs columns {need}; missing {missing}. Found {list(df.columns)[:12]}.")
    before = len(df)
    df = df.copy()
    for c in ("lat", "lon", "sol", "dust_tau", "wind", "temp", "slip", "magnitude", "hazard_reported"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    problems = []
    if kind != "weather":
        df = df.dropna(subset=["lat", "lon"])
        df = df[df.lat.between(-90, 90)]
        df["lon"] = ((df.lon + 180) % 360) - 180          # normalise 0-360 to -180-180
    else:
        df = df.dropna(subset=["sol"])
    if "slip" in df:
        df = df[df.slip.between(0, 1) | df.slip.isna()]
    if "sol" in df.columns:
        df = df.dropna(subset=["sol"])
    rejected = before - len(df)
    if rejected:
        problems.append(f"{rejected} of {before} rows rejected (missing or out-of-range values).")
    if df.empty:
        raise ValueError("No valid rows left after cleaning.")
    return df.reset_index(drop=True), rejected, problems
