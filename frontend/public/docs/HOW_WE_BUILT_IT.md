# How COMPASS was built

This document records how the project was built, step by step: what was done, why, what went wrong, and what was changed. It is written for a teammate, a judge, or you in a month. For the pitch and submission text, see `SUBMISSION.md`. For the mission concept and a feature-by-feature status, see `MISSION_CONCEPT.md`.

## 1. What exists

A browser app that plans a Marswalk in Jezero Crater, plus a small Python service that trains and serves two machine-learning models.

```
 NASA / USGS / paper data                       build time (Python)                          run time
┌────────────────────────────┐    ┌──────────────────────────────────┐    ┌──────────────────────────────────────────┐
│ Mars Trek: CTX DEM, CTX &  │    │ pipeline/build_data.py           │    │ frontend/  React + TypeScript + Leaflet   │
│ HiRISE imagery, THEMIS,    │    │  DEM → slope, roughness, grid     │    │  map, layers, route planner (A*), panels  │
│ CRISM points, Mastcam-Z    │───▶│  traverse, waypoints, geology     │───▶│  reads static files in public/data/       │
│ MMGIS: traverse, waypoints │    │  points of interest, photos       │    │                                          │
│ Raw-images API: photos     │    │  weather summary                  │    │  GET /api/status, /api/grids, uploads,    │
│ PDS MEDA: temperatures     │    │ pipeline/build_ml_demo.py         │    │  POST /api/train                          │
│ USGS SIM 3464 geology      │    │  samples (Herd et al. Table 1),   │    └───────────────────┬──────────────────────┘
│ Herd et al. 2025 (PNAS)    │    │  traverse points, demo data       │                        │
└────────────────────────────┘    └──────────────────────────────────┘    ┌───────────────────▼──────────────────────┐
                                                                          │ backend/  FastAPI + scikit-learn          │
                                                                          │  safety estimator, sampling-likeness estimator, weather   │
                                                                          │  penalty, surface-change feature          │
                                                                          └──────────────────────────────────────────┘
```

If the backend is not running, the app still works with a built-in weighted estimate. This is deliberate: a static site on any host still shows a working planner.

## 2. The build, in order

### Step 1. Research before code

Goal: find out what data really exists, how to reach it, and what does not work, before building anything on it. Every endpoint was tested with a real request, and small samples were saved in `research/samples/`. The full result is `research/DATA_REPORT.md`.

What was found:

- **NASA Mars Trek** has a usable tile service and a catalog search. Jezero has a 25 cm HiRISE mosaic, a 6 m CTX mosaic and a 20 m CTX elevation model (a 9.7 MB GeoTIFF). Tile URLs follow `…/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.png`. Its servers allow cross-origin requests.
- **Elevation was the key.** Trek has slope layers only for other sites, so slope and roughness are computed from the DEM.
- **Rover traverse and waypoints** come from NASA/JPL's MMGIS files (559 drive segments through sol 2022, 708 waypoints with measured rover tilt). Trek's own traverse is older, so MMGIS was used.
- **Rover photos:** the raw-images API works and is current. It returns at most 100 per page, filters by sol range, and filters by instrument only through free-text search on the instrument code. Each image has a `site` and `drive`, which match the MMGIS waypoint keys, so a photo can be placed exactly where the rover stood.
- **Geology:** the USGS 1:75,000 geologic map of Jezero is an open ArcGIS service.
- **Weather:** there is no live Jezero feed. The NASA weather JSON is frozen at April 2024. The newest real data is the PDS MEDA archive, months behind. So "current conditions" is computed daylight plus the last published temperatures, clearly labelled.
- **What did not work:** NASA Worldview is Earth-only. Trek's CRISM tile layers return 404. There is no sample catalogue endpoint. These were dropped rather than faked.

### Step 2. The data pipeline

`pipeline/build_data.py` makes small static files for the app. Re-runs use a cache. It makes at most one request per second to public servers. Steps:

1. Download the CTX DEM and resample to a 60 m grid (532 × 504 cells, about 30 × 30 km). Slope uses the true east-west distance (the projection stretches it), and each cell takes the 90th percentile of the 20 m slopes inside it. Roughness is the root-mean-square residual against a 5 × 5 average.
2. Fetch the MMGIS traverse and waypoints, and derive each cell's distance to the nearest driven track.
3. Fetch the USGS geologic units (paged, simplified on the server), and rasterize them onto the grid.
4. Fetch the THEMIS night-infrared tiles and sample them onto the grid as a dust and thermal-inertia proxy.
5. Build points of interest from Trek's Mastcam-Z points, the CRISM hydrous detections, the rover's highest and lowest points, and the middle of the largest patch of each key geologic unit.
6. Compute the first, heuristic estimated safety and a science-interest layer.
7. Pull 270 photos (a few per chosen sol) and place each at its waypoint.
8. Stream three sols of MEDA air temperature and pressure and summarize by time of day.
9. Write the layer catalogue.

`pipeline/build_ml_demo.py` then makes the training data:

- **Samples:** Herd et al. (2025), Table 1, fetched through Europe PMC's open full-text API, parsed into 24 sample sites (27 table rows minus three witness blanks). Each sample's sol is in its designation (for example `M2020-164-2`), and its position is the rover's last waypoint on or before that sol.
- **Traverse points:** the traverse densified to 36,102 points, one every 25 m.

Validation made in this step: the DEM slope correlates with the rover-measured tilt at the 708 waypoints (Pearson 0.77).

### Step 3. The app, following the wireframe

The wireframe in the challenge zip is a bundled HTML file whose contents are compressed. It was unpacked to read the exact layout: a top status bar, a layers panel with a supplies box, a map with controls, alert box and markers, a routes panel on the right, and a trip form along the bottom, plus a separate upload screen. The app follows that structure and wording.

What the app does:

- **Time and sun.** Sol, local solar time, sunrise and sunset, and Earth signal delay are computed (Mars24 algorithm for the sun, orbital elements for the delay). The sol count and clock are calibrated against a real Perseverance image timestamp (Sol 1500, 17:04).
- **Route planner.** A* on the 60 m grid, with a cost that grows as safety falls. Three presets give Safest, Best science and Fastest; if two come out as the same track, the later one is re-planned away from the earlier ones. All deterministic.
- **Route scoring.** Estimated safety = 60% terrain + 20% daylight and temperature + 20% supplies margin. A route needs an estimated safety of 65 overall and at least 50 on each part. Departure time is searched in 15-minute steps inside your window for the best daylight and warmth. Supplies are checked against food, water, oxygen, battery and sample bags with a 25% reserve, and the point of no return is the last point from which the walk back still fits.
- **Map.** Seven layer groups, hillshade with cast shadows for the planned start time, safety and slope overlays, geology, rover photos, points of interest, the traverse, and the user's uploaded points.
- **Upload page.** Drop CSV or SQL files, map columns, preview, set the layer type.
- **WALK mode.** A simulated position along the confirmed route with live supplies and return margin.

### Step 4. Design

The first version followed the wireframe literally. Feedback then asked for colour and design while keeping the layout and elements the same, then for a denser layout with no scrolling sidebars, then for clearer explanations. Changes:

- A dusk-blue interface with teal, amber and coral for meaning (higher, medium and lower estimated safety), and a monospaced face only for numbers.
- A compact layout checked at 1024 × 768: neither sidebar scrolls.
- Redrawn SVG markers for start, destination, safe haven, point of no return, science stops, photos and points of interest.
- An **Explain** view in the routes panel that shows how each score is built, in collapsible sections that never need scrolling.
- Removed features that were not available (radiation layer, 3D button, comms link readout).
- Faster map: heavy overlays are computed only when switched on, the readout no longer re-renders the app, and long lines are drawn on canvas.

### Step 5. The machine learning

Built from your `ML.md` and `Compass_ML_Architecture.docx` in `backend/ml/`:

| Module | Job |
|---|---|
| `config.py` | Thresholds and constants |
| `ingest.py` | Read CSV or SQL, map column names, validate, with clear errors |
| `grid.py` | Load the terrain grid as a table, snap points onto cells |
| `labels.py` | Labels for the safety and sampling-likeness estimators |
| `conditions.py` | Weather penalty, surface-change feature |
| `models.py` | RandomForest, calibration, spatial hold-out, feature importance |
| `pipeline.py` | Ties it together; also the plain-language explanation of a cell |
| `main.py` | FastAPI: status, grids, uploads, training |

How it works:

- **Safety estimator.** Labels: cells the rover drove are safe (weight 5, newer data counts more); slope up to 5° is safe and 15° and over is unsafe (weak); in between, a weak label that fades from safe to unsafe; the roughest 3% and the loosest-dust 3% are unsafe (weak). Features: slope, roughness, the dust proxy and recent change. Cells steeper than 25° are blocked whatever the model says.
- **Sampling-likeness estimator.** Positives are cells within three cells of a real sample site; negatives are random background cells in equal number. Features: terrain, the mineral index, and geologic-unit groups.
- **Evaluation.** 3-fold spatial cross-validation: whole map blocks are held out, not random cells. AUC, Brier score, and a calibration table are stored with each version.
- **Uploads.** Four file types retrain the models: rover traverse logs, sample results, weather, surface change. Weather applies a penalty (dust opacity over 1.0 takes off 20 points; wind over 15 m/s takes off 10). Surface-change points add a hazard feature and a direct penalty.
- **Output.** Per-cell estimated safety (0–100, 255 for blocked) and sampling-likeness grids. The browser swaps them in, and the routes use them.

Results on the demo data (model v1): safety spatial cross-validation AUC 0.976, Brier 0.052; estimated safety is higher on 69% of passable cells, medium on 9% and lower on 23%; sampling-likeness AUC 0.945, Brier 0.096. These figures measure agreement with the estimators' own labels, which for safety are mostly rules plus the real traverse. An independent check, not used in training, found that lower estimated safety correlates with the rover-measured tilt at 708 stops (Spearman 0.76). Plain DEM slope alone gives 0.78 on the same check, so the model does not beat slope there.

### Step 6. Deployment files

`Dockerfile` (two stages: build the app, then a Python image serving the app, the API and the demo data), `docker-compose.yml`, `render.yaml` and `.dockerignore`, following `DEPLOY.md`. A pre-trained demo model is stored in `data/demo/models/`, so the server does not train at startup.

## 3. Where I changed your guides, and why

| Guide said | What was built | Why |
|---|---|---|
| Rasterio and GeoPandas for the grid | tifffile and direct equirectangular arithmetic | Fewer heavy installs. The DEM's map projection is a simple sphere projection, so latitude and longitude map to cells with plain arithmetic |
| 10 m cells | 60 m cells | The browser planner and the 512 MB Render limit need a smaller grid; 60 m (3 × 3 of the 20 m DEM) keeps the 268,128 cells fast |
| Elevation as a safety feature | Left out of the safety estimator; kept for the sampling-likeness estimator | Elevation only records where the rover happened to drive, not hazard. With it, the model learned "low is safe" |
| Hard rule labels only (≤5° safe, ≥15° unsafe) | Added weak labels fading in between, plus roughness and dust rules | The first run had perfect AUC and Brier because the labels were separable by slope alone. The model could only output 0 or 100 and the medium band was empty |
| 10 background cells per sample site | 1 per sample site | With 10, no cell scored above 55%, so the "high priority" band was empty. With 1, scores read as likelihood of resembling a sample site |
| Surface change as a feature only | Feature plus a direct penalty | As a feature alone, a surface-change upload did not move the scores (100 to 99 in test) |
| Routes planned in the backend (networkx) | Routes planned in the browser | The A* planner already existed and ran in under a second; it now uses the model's scores |
| Safety from terrain, environment, comms and return margin | Terrain, environment and return margin | No comms data is integrated |
| Gradient-boosted trees (architecture doc) | RandomForest for safety, gradient boosting for sampling-likeness | Tested both on spatial cross-validation. Gradient boosting won for sampling-likeness (AUC 0.945 vs 0.928). For safety they tied on AUC, and the random forest did better on the rover-tilt check |
| Slope, roughness, dust, change as safety features | Added four terrain-context features (steepest neighbour, mean slope and relief of the surroundings, curvature) | Raised the rover-tilt check from 0.737 to 0.757 at the same AUC. A rule that marked sand-dune cells unsafe raised AUC but lowered the tilt check (0.66), so it was not kept |
| Radiation, 3D view, Train button as placeholders | Removed until real | Only show features that work |

## 4. Problems met and how they were handled

- **PubMed Central showed a CAPTCHA** when fetching Table 1 of the Herd et al. paper. I did not try to get past it. Europe PMC's open full-text API gave the same table.
- **A byte-range download was ignored** by Trek's server, which streamed about 5 MB of the DEM before I stopped it. I kept 8 KB as a sample and removed the rest, and told you at the time.
- **A first USGS geology request returned a truncated 15 MB file.** I deleted it and changed the pipeline to page and simplify on the server (it is now about 1.2 MB).
- **A degenerate first ML result** (perfect AUC, empty medium band). See section 3.
- **Duplicate routes** on short trips. Later routes are now re-planned away from earlier ones, so the "Fastest" route may not always be the quickest.
- **A stale value in the Find button.** Clicking it planned with the previous destination. The button now commits the typed values first.
- **Map lag.** Fixed by lazy overlays, a readout that does not re-render the app, and canvas lines. Frame rate was not measured because the test browser was hidden.

## 5. What was verified and what was not

Verified by running it:

- The app builds with no type errors and a production build succeeds.
- The built app, the API and all data files are served correctly from one port (the same layout the Docker image uses).
- Every API endpoint behaves: a bad upload returns a clear error; a weather upload lowers safety by exactly 20 points; a surface-change upload lowers the flagged cells; a traverse upload raises the real labelled cells; training takes about 18 seconds locally.
- The sidebars do not scroll at 1024 × 768.

**Not verified:**

- The Docker image build and the Render deployment. Docker Desktop was not running, so the Dockerfile has not been executed.
- Training time and memory on Render's free tier (512 MB, very small CPU).
- Smooth map frame rate (the test browser was hidden).
- Phone or tablet layouts. The app needs at least about 960 px of width.
- Larger screen sizes were not checked on screen beyond 1024 × 768.
- The safety estimator's real-world accuracy. Its hold-out score measures agreement with its own labels. The only independent check is the rover's measured tilt.

## 6. Folder map

```
Compass/
├── frontend/            React + TypeScript app (src/, public/data/ holds the static data files)
├── backend/             FastAPI service and the ML modules (ml/)
├── pipeline/            build_data.py, build_ml_demo.py (the data pipeline)
├── data/demo/           Demo data baked into the Docker image, including the trained model v1
├── research/            DATA_REPORT.md and the endpoint samples
├── Dockerfile, docker-compose.yml, render.yaml, .dockerignore
├── README.md            How to run
├── DATA_FILES.md        Fields of each static data file
├── MISSION_CONCEPT.md   The mission concept with a status for each promise
├── SUBMISSION.md        Submission text, demo scripts, judging criteria
└── HOW_WE_BUILT_IT.md   This file
```

## 7. Run it

Development (three terminals):

```bash
# 1. model service
cd backend
pip install -r requirements.txt
DATA_DIR=../data uvicorn main:app --port 7860          # on Windows PowerShell: $env:DATA_DIR="../data"; uvicorn main:app --port 7860

# 2. app
cd frontend
npm install
npm run dev                                            # http://localhost:5173 (proxies /api to port 7860)
```

If you skip the model service, the app still runs with the built-in estimate, and the Train button explains that the service is off.

Single server (what Docker does): `npm run build` in `frontend`, copy `dist` to `backend/static`, then run the backend; everything is on port 7860.

Docker: `docker compose up --build`, then open http://localhost:7860 (not yet tested; see section 5).

Rebuild the data: `python pipeline/build_data.py`, then `python pipeline/build_ml_demo.py`, then retrain by deleting `data/demo/models` and starting the backend, or press Train model in the app.

## 8. Publishing (Render)

1. Push the `Compass` folder to a GitHub repository (`.gitignore` already excludes caches and test models).
2. Create a Render account, choose New, then Blueprint, pick the repository, and apply.
3. Wait for the build, then open `/api/health`. Open the site a few minutes before presenting, because the free tier sleeps when idle.
4. If the free tier runs out of memory, the committed demo model still loads. Avoid pressing Train model on the free tier; train locally and commit the new model version under `data/demo/models/`.

## 9. Credits

NASA Mars Trek (MRO CTX and HiRISE, Mars Odyssey THEMIS, OMEGA/CRISM, Mastcam-Z); NASA/JPL MMGIS Mars 2020 traverse and waypoints; NASA Mars 2020 raw images; NASA PDS Atmospheres Node (Mars 2020 MEDA); USGS Astrogeology (Geologic Map of Jezero Crater, SIM 3464, Sun & Stack 2020); Herd et al. (2025), "Sampling Mars", PNAS, via Europe PMC.
