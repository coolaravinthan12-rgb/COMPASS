# Compass – data package (Jezero Crater)

Prepared data for "Compass", a NASA Space Apps prototype that plans a safe, science-rich Marswalk route in Jezero Crater.
**The COMPASS app: a React + TypeScript + Leaflet front end, a FastAPI + scikit-learn model service, and the data pipeline that feeds them.**

## What's in this folder

| Path | What it is |
|---|---|
| `frontend/public/data/` | The generated static files the app will load (see `DATA_FILES.md` for every field) |
| `pipeline/build_data.py` | Python script that downloads public NASA/USGS data and regenerates `frontend/public/data/` |
| `research/DATA_REPORT.md` | Phase 1 research: every dataset and endpoint tested, feasibility, safety-index design, blockers |
| `research/samples/` | Small real responses saved while testing endpoints (tiles, JSON, CSV headers) |
| `frontend/` | The COMPASS app (Vite + React + TypeScript + Leaflet), built to the wireframe in the SpaceApps Challenge zip |
| `DATA_FILES.md` | Field-by-field description of each generated file and how to decode `grid.json` |

## Documents

| File | What it is |
|---|---|
| `USER_GUIDE.md` | How to use COMPASS, with four worked examples |
| `PRINCIPLES.md` | The mathematics and science behind every number |
| `HOW_WE_BUILT_IT.md` | How the project was built, decisions, problems, what was and was not verified |
| `SUBMISSION.md` | Submission text, demo script and 7-slide outline, judging-criteria mapping |
| `MISSION_CONCEPT.md` | The mission concept with the status of every promise |
| `DATA_FILES.md` | Fields of each static data file |
| `research/DATA_REPORT.md` | The data research: what every source offers and what failed |

## The landing page

Opening the site shows a landing page that explains the product, how to use it, sample scenarios, the science, the data, the decisions made and the mission, and it opens every document in a built-in reader. The planner is at `#/app`. The documents shown on the site are copies in `frontend/public/docs/`; after editing one, run `python pipeline/sync_docs.py`. The hero art comes from `pipeline/build_hero.py`.

## Run the app

Two programs: the model service and the app. The app works without the model service (it falls back to a built-in estimate).

```bash
# 1. model service (Python 3.10+)
cd backend
pip install -r requirements.txt
DATA_DIR=../data uvicorn main:app --port 7860        # PowerShell: $env:DATA_DIR="../data"; uvicorn main:app --port 7860

# 2. app
cd frontend
npm install
npm run dev                                          # http://localhost:5173
```

On the Upload page, add a traverse, sample, weather or surface-change CSV, set its layer type, then press **Train model**. The map and routes update when training finishes (about 20 seconds locally).

Docker (not yet tested here): `docker compose up --build`, then http://localhost:7860.

### Frontend only

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in frontend/dist (about 6 MB with data)
```

What works: top status bar (sol, local solar time, sunset, Earth light delay), seven layer categories, map with optical/thermal/slope/hillshade-with-shadows/safety/geology/science layers,
rover traverse and photo pins, three route options (Safest, Best science, Fastest) with an estimated-safety minimum of 65, supplies check, point of no return, elevation profile,
alerts, WALK mode (simulated progress), mission log (stored in the browser) and a CSV/SQL upload page that plots uploaded points on the map.
Not built (and removed from the screen until it exists): the 3D view, the radiation layer, comms coverage, rock-abundance hazards, and live dust and weather. The only safe haven is an assumed one at the landing site. Weather comes from the last published rover data, not a live feed.

Assumptions you can change in `frontend/src/lib/route.ts`: walking 2 km/h (rover 8, rover+walk 5), 25% supply reserve, water 0.3 L/h per person, one meal per 6 h, 0.4 h per science stop.
Estimated safety = 60% terrain + 20% daylight/temperature + 20% supplies margin; a route qualifies at 65 overall with each part at least 50. It is an estimate from orbital data, not a probability or a safety rating.

## Area covered

Lon 77.1605 – 77.6990 E, lat 18.2110 – 18.7212 N (about 30 × 30 km). It includes the landing site, the delta, the crater floor and the rim where Perseverance was at sol 2022.

## How the estimated safety works

Per 60 m cell, each part scored 0–1 (1 = safest), then combined:

| Part | Weight | Source |
|---|---|---|
| Slope (90th percentile of 20 m slopes in the cell; 1 at ≤5°, 0 at 25°) | 0.40 | CTX DEM (NASA Mars Trek) |
| Roughness (terrain roughness at 20 m scale, not rocks) | 0.20 | CTX DEM |
| Terrain unit (my judgement values; sand/bedforms lowest) | 0.15 | USGS geologic map SIM 3464 |
| Dust proxy (brighter at night = firmer ground) | 0.10 | THEMIS night IR (qualitative) |
| Closeness to where Perseverance has driven (1 within 100 m, 0 at 3 km) | 0.15 | NASA MMGIS traverse |

`safety = 100 × weighted sum`. Cells steeper than 25° are impassable (stored as 255).
A route qualifies at **≥ 65**. The planned route score is `0.6 × mean + 0.4 × worst 3-cell stretch`.
That route scoring is **not implemented yet**; only the per-cell index is.

**Check against reality:** the DEM slope correlates 0.77 with the tilt Perseverance measured at 708 waypoints (`validation.json`).

## Known limits (be upfront about these in the demo)

- The estimated safety is a heuristic from orbital data, not an engineering rating.
- Roughness is terrain-scale, not rock abundance. No rock map exists for this area.
- The dust/thermal-inertia part is a rough proxy. A true thermal-inertia map is not available at this resolution.
- No mineral map (CRISM carbonates/olivine were not available programmatically). Only ~3 hydrous-mineral points.
- Weather is **not live**. `weather.json` holds the latest published rover measurements (sols 1857–1859, months old). Daylight and sun angle are meant to be computed, not downloaded.
- Science points are few: Mastcam-Z panorama sites, mineral detections, rover extremes and the largest patch of each key geologic unit.
- Rover photos are placed at the waypoint where the rover was at that site/drive, not where the camera was pointing.

## How to regenerate the data

Requires Python 3.10+.

```bash
pip install numpy scipy tifffile imagecodecs shapely requests pillow
cd pipeline
python build_data.py                 # everything, ~3-5 minutes
python build_data.py --skip-photos   # skip the raw-images step
python build_data.py --skip-weather  # skip the MEDA step (it downloads ~20 MB)
```

Output goes to `../frontend/public/data/`. Downloads are cached in `pipeline/cache/` (about 10 MB, created on first run), so re-runs are fast.
The script makes at most one request per second to public NASA/USGS servers.

First run downloads: the 9.7 MB CTX DEM from Mars Trek, USGS geologic units, MMGIS traverse and waypoints, 9 THEMIS tiles, and the NASA raw-images and MEDA data.

## Using the data in an app

1. Serve `frontend/public/data/` as static files (for example from a Vite `public/` folder).
2. Decode `grid.json` as described in `DATA_FILES.md`, then convert a lon/lat to a grid cell with
   `col = (lon − lonW) / dlon`, `row = (latN − lat) / dlat`.
3. Run A\* over cells whose safety value is not 255, with step cost
   `distance × (1 + k × (1 − safety/100)²)`; try several `k` values to get different routes.
4. Basemap tiles are not stored here. `layers.json` lists the NASA Mars Trek tile URLs to load live.
   Trek counts zoom from a 2×1 world tile. In Leaflet with `L.CRS.EPSG4326` that likely needs `zoomOffset: -1`.
   **That has not been tested in a browser yet.**

## Sources and credits

NASA Mars Trek (CTX/HiRISE/THEMIS imagery, CTX DEM) · USGS Astrogeology SIM 3464 geologic map of Jezero (Sun & Stack, 2020) ·
NASA/JPL MMGIS Mars 2020 traverse and waypoints · NASA Mars 2020 raw images · NASA PDS Atmospheres Node, Mars 2020 MEDA · OMEGA/CRISM hydrous detections (Carter et al., 2013) via Mars Trek.
Public NASA/USGS endpoints have no published SLA or rate limit; keep requests light.
