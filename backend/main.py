"""COMPASS API: serves the built HUD and the ML endpoints.
  GET  /api/health   GET /api/config   GET /api/status   GET /api/grids
  GET  /api/uploads  POST /api/uploads   DELETE /api/uploads/{id}   POST /api/train
Run (dev):  DATA_DIR=../data uvicorn main:app --reload --port 7860"""
import base64
import json
import os
import re
import threading
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import storage
from ml import ingest, pipeline
from ml.grid import Terrain

DEMO = storage.DATA_DIR / "demo"
MODELS = storage.DATA_DIR / storage.MODELS_PREFIX.strip("/")
UPLOAD_DIR = storage.DATA_DIR / "uploads"

app = FastAPI(title="COMPASS")
LOCK = threading.Lock()
STATE: dict = {"ready": False, "training": False, "version": 0, "report": None, "grids": None, "error": None}
UPLOADS: dict[str, dict] = {}
TERRAIN: Terrain | None = None
DEMO_TRAVERSE = DEMO_SAMPLES = None


# ---------------------------------------------------------------- model files
def _versions() -> dict[int, Path]:
    found: dict[int, Path] = {}
    for d in (DEMO / "models", MODELS):
        if d.exists():
            for p in d.glob("pred_v*.npz"):
                m = re.match(r"pred_v(\d+)\.npz", p.name)
                if m:
                    found[int(m.group(1))] = d
    return found


def _load_version(v: int, d: Path):
    z = np.load(d / f"pred_v{v}.npz")
    report = json.load(open(d / f"report_v{v}.json", encoding="utf-8"))
    STATE.update(ready=True, version=v, report=report, error=None,
                 grids={k: base64.b64encode(z[k].tobytes()).decode() for k in ("safety", "discovery", "recent_change")})


def _frames():
    parts = {"traverse": [DEMO_TRAVERSE], "samples": [DEMO_SAMPLES], "weather": [], "changes": []}
    for u in UPLOADS.values():
        if u["type"] in parts:
            parts[u["type"]].append(u["df"])
    cat = lambda xs: pd.concat([x for x in xs if x is not None and len(x)], ignore_index=True) if any(x is not None and len(x) for x in xs) else None
    return cat(parts["traverse"]), cat(parts["samples"]), cat(parts["weather"]), cat(parts["changes"])


def _train_blocking():
    traverse, samples, weather, changes = _frames()
    res = pipeline.run(TERRAIN, str(DEMO), traverse, samples, weather, changes)
    v = max([STATE["version"], *_versions().keys()] or [0]) + 1
    MODELS.mkdir(parents=True, exist_ok=True)
    rep = res["report"]
    rep.update(version=v, trained_at=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
               trained_on=[{"name": u["name"], "type": u["type"], "rows": u["rows"]} for u in UPLOADS.values()] or "demo data only")
    joblib.dump({"models": res["models"], "report": rep}, MODELS / f"model_v{v}.pkl")
    np.savez_compressed(MODELS / f"pred_v{v}.npz", safety=res["safety"], discovery=res["discovery"], recent_change=res["recent_change"])
    json.dump(rep, open(MODELS / f"report_v{v}.json", "w", encoding="utf-8"))
    _load_version(v, MODELS)


def _train_thread():
    try:
        _train_blocking()
    except Exception as e:  # report to the UI instead of dying silently
        STATE["error"] = f"{type(e).__name__}: {e}"
    finally:
        STATE["training"] = False


# ---------------------------------------------------------------- startup
@app.on_event("startup")
def startup():
    global TERRAIN, DEMO_TRAVERSE, DEMO_SAMPLES
    TERRAIN = Terrain(str(DEMO))
    DEMO_TRAVERSE = pd.read_csv(DEMO / "traverse.csv")
    DEMO_SAMPLES = pd.read_csv(DEMO / "samples.csv")
    if UPLOAD_DIR.exists():
        for p in UPLOAD_DIR.glob("*.json"):
            try:
                j = json.load(open(p, encoding="utf-8"))
                df, rej, _ = ingest.validate(ingest.standardise(pd.DataFrame(j["rows"]), j.get("map")), j["type"])
                UPLOADS[j["id"]] = {"id": j["id"], "name": j["name"], "type": j["type"], "df": df, "rows": len(df), "rejected": rej}
            except Exception:
                pass
    vs = _versions()
    if vs:                                     # newest model_vN: committed demo model, or one trained earlier
        v = max(vs); _load_version(v, vs[v])
    else:                                      # no model yet: train on demo data now
        STATE["training"] = True; _train_thread()


# ---------------------------------------------------------------- API
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/config")
def config():
    return {"dataUrl": os.getenv("PUBLIC_DATA_URL", "/data")}


def _status():
    return {"ready": STATE["ready"], "training": STATE["training"], "version": STATE["version"], "error": STATE["error"],
            "report": STATE["report"], "uploads": [{"id": u["id"], "name": u["name"], "type": u["type"], "rows": u["rows"], "rejected": u["rejected"]} for u in UPLOADS.values()],
            "schemas": {k: v["required"] for k, v in ingest.SCHEMAS.items()}}


@app.get("/api/status")
def status():
    return _status()


@app.get("/api/grids")
def grids():
    if not STATE["ready"]:
        raise HTTPException(503, "No model yet")
    return {"version": STATE["version"], "nx": TERRAIN.nx, "ny": TERRAIN.ny, **STATE["grids"]}


class UploadIn(BaseModel):
    id: str
    name: str
    type: str
    rows: list[dict]
    map: dict | None = None


@app.get("/api/uploads")
def list_uploads():
    return _status()["uploads"]


@app.post("/api/uploads")
def add_upload(u: UploadIn):
    if u.type not in ingest.SCHEMAS:
        raise HTTPException(400, f"Unknown layer type '{u.type}'. Use one of {list(ingest.SCHEMAS)}.")
    if len(u.rows) > 300_000:
        raise HTTPException(413, "Too many rows (limit 300,000).")
    try:
        df, rejected, problems = ingest.validate(ingest.standardise(pd.DataFrame(u.rows), u.map), u.type)
    except ValueError as e:
        raise HTTPException(422, str(e))
    UPLOADS[u.id] = {"id": u.id, "name": u.name, "type": u.type, "df": df, "rows": len(df), "rejected": rejected}
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        json.dump({"id": u.id, "name": u.name, "type": u.type, "map": u.map, "rows": u.rows}, open(UPLOAD_DIR / f"{u.id}.json", "w", encoding="utf-8"))
    except OSError:
        pass
    return {"ok": True, "rows": len(df), "rejected": rejected, "problems": problems}


@app.delete("/api/uploads/{uid}")
def delete_upload(uid: str):
    UPLOADS.pop(uid, None)
    try:
        (UPLOAD_DIR / f"{uid}.json").unlink(missing_ok=True)
    except OSError:
        pass
    return {"ok": True}


@app.post("/api/train")
def train():
    with LOCK:
        if STATE["training"]:
            raise HTTPException(409, "Training is already running.")
        STATE["training"] = True; STATE["error"] = None
    threading.Thread(target=_train_thread, daemon=True).start()
    return {"started": True}


# API routes above; static mounts last so /api/* takes priority
if DEMO.exists():
    app.mount("/data", StaticFiles(directory=str(DEMO)), name="data")
if Path("static").exists():
    app.mount("/", StaticFiles(directory="static", html=True), name="ui")
