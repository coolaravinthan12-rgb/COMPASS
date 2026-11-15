# Compass – Phase 1/2 Data Report (Jezero Crater)

Research date: 2026-11-13. Every endpoint below was hit with a real request; samples are in `research/samples/`.
"Tested" = I got a real, non-error, plausible response. Nothing here is guessed; where I could not verify something it says so.

**Verdict on the site:** stay with Jezero. It has by far the best coverage of anything on Mars: HiRISE 25 cm and CTX 6 m mosaics, a 20 m CTX DEM, a USGS 1:75,000 vector geologic map, the full Perseverance traverse with per-waypoint tilt, and a live raw-image API (latest image sol 2031, 2026-11-06). There is no reason to look elsewhere.

**Proposed AOI** (= extent of the CTX DEM): lon 77.160–77.699 E, lat 18.211–18.721 N, about 30 × 30 km. It contains the landing site (77.45 E, 18.44 N), the delta, and the rover's most recent position (sol 2022: 77.233 E, 18.436 N, elevation −1936 m, i.e. up on the rim).

---

## 1. Dataset table

Access key: **WMTS** = XYZ-style tile URL usable directly in Leaflet. **Pipeline** = fetched by `build_data.py` at build time, not at runtime.
All Trek tile URLs use the pattern
`https://trek.nasa.gov/tiles/Mars/EQ/{LAYER}/1.0.0/default/default028mm/{z}/{row}/{col}.{png|jpg}`
(geographic/equirectangular, 256 px, **z0 = 2×1 tiles**, origin top-left −180/90, row counted from the top). Capabilities per layer: `.../{LAYER}/1.0.0/WMTSCapabilities.xml`.

### 1a. Basemaps / imagery (runtime tiles)

| Name | Source | Shows | Resolution | Format | Access | Tested | Size |
|---|---|---|---|---|---|---|---|
| Jezero HiRISE ortho mosaic | Trek | Photo-realistic basemap of crater floor/delta | 25 cm/px, **max z17** | PNG tiles | WMTS, `LAYER=JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`. Bbox 77.223–77.584 E, 18.307–18.669 N (does **not** cover the whole AOI) | yes (z14 tile, 60 KB) | raw 9.8 GB (don't) |
| Jezero CTX ortho mosaic | Trek | Basemap for the whole AOI | 6 m/px, **max z13** | PNG tiles | WMTS, `LAYER=JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0`. Bbox 77.160–77.699 E, 18.211–18.721 N (= AOI) | yes (z10 tile) | raw GeoTIFF 36 MB |
| Jezero CTX block-adjusted (regional) | Trek | Wider context | ~6 m (0.0001°), **max z12** | PNG | WMTS, `LAYER=Jezero_CTX_BlockAdj_dd` | capabilities yes | raw 1.6 GB |
| Viking MDIM 2.1 colour mosaic | Trek | Global colour basemap | 232 m, max z7 | JPEG | WMTS, `LAYER=Mars_Viking_MDIM21_ClrMosaic_global_232m` | yes | – |
| MOLA colour-shaded relief | Trek | Global elevation colouring | 463 m, max z7 | JPEG | WMTS, `LAYER=Mars_MGS_MOLA_ClrShade_merge_global_463m` | yes | – |
| THEMIS day IR | Trek | Daytime surface temperature | 100 m, max z9 | PNG | WMTS, `LAYER=THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018` | yes (z9 tile) | raw 16 GB |
| THEMIS **night** IR | Trek | Night temperature ∝ thermal inertia (qualitative proxy: bright = rocky/consolidated, dark = dusty/fine) | 100 m, max z9 | PNG | WMTS, `LAYER=THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018` | yes (z9 tile, 52 KB) | raw 16 GB |
| TES thermal inertia | Trek | Global thermal inertia | ~3 km, **max z1** | PNG | WMTS `LAYER=TES_Thermal_Inertia` | capabilities yes | 17 MB raw. **Useless at Jezero scale (only ~10 pixels across the AOI)** |
| SIM 3292 global geology | Trek | Global geologic map | 1:20 M | PNG | WMTS via ArcGIS: `https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/{z}/{row}/{col}.png` | yes, but tile at AOI is near-empty (697 B). Not useful; use USGS Jezero map instead | – |
| USGS CTX basemap, Jezero/Nili | USGS (ArcGIS Online item `aa7883b70d374a3ebeae5bd801c2462b`) | Alt. CTX basemap | CTX | ArcGIS tiles | `tiles.arcgis.com/tiles/v01gqwM5QqNysAAi/arcgis/rest/services/Nili_CTX_Mosaic_Beta01_Feb2018_MTM_tif_NE...` (URL truncated in search listing; not tested, not needed) | no | – |

### 1b. Elevation / terrain

| Name | Source | Shows | Resolution | Format | Access | Tested | Size |
|---|---|---|---|---|---|---|---|
| **Jezero CTX DEM (controlled)** `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0` | Trek (MRO CTX) | Elevation → slope, roughness, hillshade, profile, line-of-sight. **Primary DEM for the pipeline.** | 20 m/px, AOI-wide | GeoTIFF (little-endian TIFF header confirmed) | Download: `https://trek.nasa.gov/mars/TrekWS/rest/cat/data/stream?label=JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0` (200 OK, `.tif` attachment) | **header yes; full download not done** (see Blockers) | 9.7 MB |
| Jezero HiRISE DEM | Trek | Fine-scale DEM for the delta/landing area | 1 m | GeoTIFF | same `.../data/stream?label=JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40`; bbox 77.223–77.584 E, 18.307–18.669 N | HEAD only | **1.84 GB – too big, skip** (only worth a tiny crop via GDAL `/vsicurl/` if server supports ranges, which it does **not**: my ranged request returned the whole stream) |
| NES_JEZ_MID DEM mosaic (HiRISE+CTX+HRSC) | Trek | Larger DEM mosaic, bbox 76.79–77.73 E, 17.58–18.69 N | not listed | GeoTIFF | `.../data/stream?label=NES_JEZ_MID_DEM_Mosaic_HiRISE_CTX_HRSC_GCS_MARS_07-10-2018` | HEAD only | 9.96 GB, skip |
| HRSC+MOLA blend DEM (global) | Trek ArcGIS ImageServer | Coarse DEM, **small bbox requests return a float32 GeoTIFF** | 200 m | F32 GeoTIFF / point identify | `https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/ImageServer/exportImage?bbox=77.0,18.1,77.9,18.8&bboxSR=4326&imageSR=4326&size=128,100&format=tiff&pixelType=F32&f=image` and `/identify?geometry=77.45,18.44&geometryType=esriGeometryPoint&sr=4326&f=json` (returned −2566 m at landing site; MMGIS says −2569.9 m. Consistent.) | **yes** (66 KB tif) | – |
| MOLA DEM | Trek ImageServer `mola128_mola64_merge_90Nto90S_SimpleC_clon0` | Global 463 m DEM | 463 m | same API | not needed | metadata yes | – |
| Trek elevation-profile service | Trek | Server-side elevation along a line | – | JSON | `https://trek.nasa.gov/mars/TrekServices/ws/elevationProfile/calculate` (+ `/combined`, `/multiDEM`) – URL from Trek's `config.json`; **request format not documented, not tested.** Not needed; we compute profiles from our own grid | no | – |

### 1c. Geology / science

| Name | Source | Shows | Resolution | Format | Access | Tested | Size |
|---|---|---|---|---|---|---|---|
| **USGS Geologic Map of Jezero Crater & Nili Planum, SIM 3464 (Sun & Stack 2020)** | USGS Astrogeology via ArcGIS Online (item `b602bd9a573d447eb07388e5fb9ca884`) | Vector geologic units (15 units: Jezero fan 1/2, Jezero floor, lower/upper etched, Nili Planum fan/1/2, **eolian bedform**, smooth, rugged bright, crater rim/ejecta/interior), contacts, linear and surface features, 341 small-crater points | 1:75,000 | ArcGIS FeatureServer → GeoJSON | `https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/{layer}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`. Layers: 0 MapBoundary(1), 1 Figures(12), 2 LandingEllipse(1), 3 CrossSections(2), 4 Location Features(341), 5 Contacts(2497), 6 Linear Features(382), 7 Surface Features(285), **8 Geologic Units(1308)**. `maxRecordCount` 2000. Schema fields: `unit`, `name`, `symbol`... | yes (counts, schema, unit names, point sample). **Full units geometry download is ~16+ MB raw GeoJSON** (my one attempt came back truncated; pipeline must page + simplify) | ~16 MB raw; ~1 MB after simplification (estimate) |
| Hydrous mineral detections (OMEGA/CRISM, Carter 2013) | Trek ArcGIS MapServer `Hydrous_Mineral_Detections_OMEGA_CRISM_clon0` (layer 0) | Point detections of hydrated minerals | point | GeoJSON via `/MapServer/0/query?geometry=...&f=geojson` | `https://trek.nasa.gov/mars/trekarcgis/rest/services/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query?geometry=76.5,17.8,78.3,19.2&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=*&f=geojson` | yes – **only ~3 points near Jezero** (sparse; a "nice to have" layer, not a scoring input) | 1.5 KB |
| CRISM spectral summary products (`frt_07_br*_mtr3_ll`: carbonate, olivine/pyroxene, phyllosilicate etc., 0.000322°/px ≈ 19 m) | Trek index lists them as "dataset" items | The *actual* Jezero mineralogy story (carbonates, olivine) | ~19 m | – | Tile URLs for `frt_07_brcarj_mtr3_ll`, `frt_07_brfm2j_mtr3_ll`, `frt_07_brtruj_mtr3_ll` → **404**. They are raw-download items only, in a different projection/footprint format. **Not usable without manual work** | **no (broken for tiles)** | unknown |
| Dune field, valley networks, fans/glaciers, chloride deposits | Trek ArcGIS MapServers (`Dune_Field`, `Hynek_Valley_Networks`, ...) | Global landform vectors | – | GeoJSON | `.../services/{name}/MapServer/0/query` | services exist (not queried for Jezero) | small |
| Trek Mastcam-Z POIs | Trek `mastcam_z_waypoints` MapServer | 9 narrated 360° panorama sites near landing site, with Trek HTML page links | point | GeoJSON | `https://trek.nasa.gov/mars/trekarcgis/rest/services/mastcam_z_waypoints/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson` | yes (9 features, 2 KB) | 2 KB |
| Landing ellipse | USGS layer 2 / Trek `perseverance_landing_ellipse` | Ellipse polygon | – | GeoJSON | see above | yes (count) | small |

### 1d. Perseverance rover data

| Name | Source | Shows | Resolution | Format | Access | Tested | Size |
|---|---|---|---|---|---|---|---|
| **M20 traverse (MMGIS, preferred)** | NASA/JPL MMGIS | Drive segments, one LineString per drive: `sol`, `fromRMC`, `toRMC`, `length`, SCLK times. **559 segments, sols 14 → 2022**. Coordinates are `[lon, lat, elev]` | – | GeoJSON (CRS84) | `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json` | yes | 1.7 MB |
| **M20 waypoints (MMGIS)** | same | 708 end-of-drive points: `RMC`(= `site_drive`), `sol`, `lon`, `lat`, `elev_geoid`, `roll/pitch/yaw`, **`tilt`** (max observed 20.7°), cumulative distance (45.25 km at sol 2022), and an `images[]` array of mosaics/panoramas (all 708 have ≥1) | – | GeoJSON | `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json` | yes | 603 KB |
| Trek traverse (older) | Trek ArcGIS `Perseverance_Traverse_Path` layer 0 | Same idea but older (332 segments vs 559 in MMGIS; item dated 2024-07; bbox only 77.30–77.46 E). **Use MMGIS instead** | – | GeoJSON | `.../services/Perseverance_Traverse_Path/MapServer/0/query?where=1%3D1&outFields=*&f=geojson` | yes | 1.2 MB |
| **Mars 2020 raw images** | NASA JSON feed | 1,055,868 images. See §1e | – | JSON | see §1e | yes | – |

KMZ/KML of the traverse: I did not find an official one and did not need one, the GeoJSON is better.

### 1e. Raw images API (documented)

Base: `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json`

| Param | Behaviour (all tested) |
|---|---|
| `latest=true` | `{"latest":"2026-11-06T15:59:53Z","latest_sol":2031,"total":1055868,...}` – cheap freshness check |
| `num`, `page` | Pagination, **`num` is capped at 100** (asked for 200 and 1000, got 100). Response has `total_results`, `per_page`, `page` |
| `order=sol+desc` | Ordering works |
| `condition_2=1000:sol:gte&condition_3=1010:sol:lte` | **Sol-range filter works** (3,132 images for sols 1000–1010) |
| `search=MCZ_LEFT` | **Instrument filter works through free-text search on the instrument code** (1,063 hits in that range, all MCZ_LEFT). Codes seen: `MCZ_LEFT`, `MCZ_RIGHT`, `SUPERCAM_RMI`, `SKYCAM`. `search=NAVCAM` and `search=Mastcam-Z` returned 0 – exact codes needed. Navcam/Hazcam code names not confirmed |
| `condition_1=<x>:instrument:in`, `site:in`, `camera=`, `extended=sample_type::full` | **Silently ignored** (total unchanged). Do not rely on them |
| `id=<imageid>` | Single image (the `json_link` field) |

Per-image fields: `imageid`, `sol`, **`site`** (int), **`drive`** (string), `date_taken_utc`, `date_taken_mars` (LMST), `title`, `caption`, `credit`, `sample_type`, `image_files{small(320px), medium(800px), large(1200px), full_res}`, `camera{instrument, filter_name, camera_vector, camera_position, camera_model_*}`, `extended{mastAz, mastEl, sclk, dimension, subframeRect, ...}`, `attitude`, `link`, `json_link`.

**Pinning photos to the map:** an image's `site`+`drive` form the RMC key `"{site}_{drive}"`, which matches the `RMC` field of the MMGIS waypoints (I verified `73_0`, `93_0`, `48_2404` all exist). So photo → waypoint → lon/lat with no guessing. Caveat: waypoints end at sol 2022, images at sol 2031, so the newest photos (site 93) still resolve, but sols after the next localization will not until MMGIS updates. Also mast cameras only: other cameras are fine too since the key is rover location, not pointing.
CORS: `Access-Control-Allow-Origin: *` on the API and MMGIS files. Image files themselves send no CORS header, which is fine for `<img>`.

### 1f. Weather / daylight

| Name | Source | Shows | Format | Access | Tested | Notes |
|---|---|---|---|---|---|---|
| **MEDA derived/calibrated environment, 1 Hz CSV per sol** | PDS Atmospheres Node (NMSU) | Pressure, air temp (5 sensors), humidity, LW irradiance, solar zenith, LMST/LTST, rover pose | CSV | Base `https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/`. `data_calibrated_env/sol_1740_1859/sol_1859/WE__1859___________CAL_ATS_________________P01.CSV` (air temp, 3.7 MB/sol), `data_derived_env/.../DER_PS...` (pressure, 2.5 MB/sol), `DER_RHS` (humidity), `DER_TIRS` (IR), `DER_ANCILLARY` (solar zenith, 4.9 MB/sol). Directory listings are plain HTML index pages (parseable) | yes (headers sampled with HTTP Range; Range is honoured here) | **Latest published = sol 1859** (≈ 2026-05-13; folder dated 2026-08-11), i.e. ~170 sols / 5.5 months behind. **No CORS headers**, so it must be a build-time fetch. Units: pressure Pa, temperature K. Wind sensor products not checked |
| mars.nasa.gov weather feed, `feed=weather&category=mars2020` | NASA | Daily min/max temp, pressure, sunrise/sunset, Ls | JSON | `https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json` | responds, **but frozen: 7 sols from April 2024 (sols 1127–1133)** and half of the temperature fields are `"--"`. Do not use for "current". The `category=msl` variant returns 1.7 MB (not Jezero) | – |
| Computed solar geometry (Mars24 / Allison-McEwen algorithm) | – | Ls, sunrise, sunset, solar elevation/azimuth for any date at Jezero | – | pure maths, no data needed | n/a | deterministic, doable client-side |

**There is no live Jezero weather source.** "Current conditions" will have to be: (a) real Mars-calendar/solar geometry computed live, plus (b) the most recent real MEDA sols (≤1859) shown as "last published measurements" and as a diurnal climatology for the selected season (Ls). I will label this honestly in the UI. The InSight API was not used.

### 1g. Things that don't work for us

| Item | Finding |
|---|---|
| **NASA Worldview** | I loaded its full config (`/config/wv.json`, 1,346 layers). **Earth-only (GIBS).** The two regex hits for "moon/lunar" are false positives in VIIRS night-light descriptions. Skipped, as you suspected |
| USGS Astrogeology Interactive Maps page | JS-rendered ArcGIS Hub site; its page config item is private (400). I got to the real data by searching ArcGIS Online instead. Found the Jezero geologic map FeatureServer above. `astrogeology.usgs.gov/arcgis/rest/services` → 404. `planetarymaps.usgs.gov` WMS works (`GetCapabilities` 200: layers MOLA, THEMIS, MDIM21, HRSC-MOLA hillshade) but is global, low-res, simple-cylindrical: nothing Jezero-specific |
| Trek CRISM tile layers | 404 (see 1c) |
| Trek elevation-profile REST | exists, undocumented, not tested |
| Trek HiRISE 1 m DEM | exists but 1.84 GB and the server ignores HTTP Range, so can't crop remotely |
| Slope map for Jezero | **Trek's slope layers exist only for other sites** (Melas, Candor, etc.). We must compute slope from the DEM. That's fine and standard |
| CRISM-based Jezero carbonate map, rock abundance, HiRISE-scale hazard (TRN) map | Not found as accessible services. Not invented |
| Sample / "science discovery" catalogue (Cheyava Falls, sample cores...) | **No machine-readable official endpoint found.** `M20_samples.json` etc. → 403. Will need a curated POI file |

---

## 2. Feasibility of each concept feature (~2-day build)

| Feature | Feasible? | Datasets | Difficulty | Notes |
|---|---|---|---|---|
| Leaflet map of Jezero with HiRISE/CTX basemap | **Yes** | Trek WMTS (CORS `*`) | easy | Leaflet `L.CRS.EPSG4326` + `zoomOffset:-1` (Trek z0 is 2×1; Leaflet's 4326 z0 is 1 tile wide) + `maxNativeZoom` per layer. *Not yet verified in a browser; if it misbehaves, OpenLayers with a custom TileGrid is a 10-minute fallback.* Stretch from plate-carrée at 18°N is 5%, negligible |
| Pick start, destination | Yes | – | easy | |
| Time window | Yes (as sol + local solar time) | computed solar geometry + MEDA climatology | easy–medium | See Blockers #3 for semantics |
| Generate multiple paths ≥ 65% safety | **Yes** | CTX DEM, USGS geology, THEMIS night, traverse | medium | Precompute grid, A* in browser on ~250k cells is instant. Multiple distinct routes via penalty re-runs or varied weights |
| Highlight science/resources on paths | Yes, but data are thin | USGS geologic units, Trek Mastcam-Z POIs (9), CRISM hydrous points (~3), MMGIS waypoints+panoramas, hand-curated POIs | medium | Science score = proximity to geologic contacts/unit types of interest + POIs + waypoint panoramas. Curated POI file needed |
| Path picker at bottom | Yes | – | easy | UI only |
| Layer panel | Yes | all | easy | |
| Current conditions (weather, daylight) | **Partially** | MEDA (≤ sol 1859) + computed solar | medium | No live feed exists. Daylight is exact (computed). Weather is "last published" + season climatology |
| Rover photos pinned | **Yes** | raw images API + MMGIS waypoints | easy–medium | Precompute `photos.json` (100 per request, ≤1 req/s). Can run live too (CORS ok) |
| CSV upload layer | Yes | – | easy | PapaParse, validate lat/lon inside AOI |
| No ML, deterministic | Yes | – | – | grid + A* + weighted sum |
| Hosted on Render static | **Yes** | – | easy | Only static JSON plus remote tiles; all remote endpoints used at runtime send `Access-Control-Allow-Origin` (`*` or echo) |

---

## 3. Extra features the data enables (ranked by wow per hour)

| # | Feature | Data | Effort | Wow |
|---|---|---|---|---|
| 1 | **Elevation profile of chosen path** (with slope colouring and safety strip under it) | our DEM grid | 1–2 h | high; judges love a profile and it makes safety tangible |
| 2 | **Replay the real Perseverance traverse by sol** (time slider with rover marker + its photos) | MMGIS traverse + photos | 2 h | very high; ties "time window" to real data |
| 3 | **Sun angle + terrain shadows at chosen time** (hillshade with the computed sun az/el, shadow overlay, daylight bar on the path) | DEM + computed solar | 3–4 h | very high; directly useful to a human walker (shadow = cold, solar-power, visibility) |
| 4 | **"Computed slope vs rover's measured tilt" validation chart** | DEM slope vs MMGIS `tilt` (708 pts) | 1–2 h | high credibility: shows the safety model is checked against ground truth |
| 5 | **Photo filmstrip along the selected path** | photos.json | 1 h | high |
| 6 | **Sample-site / POI tour**: ordered route through N chosen POIs with total distance/time/min safety | POIs + A* | 2–3 h | high |
| 7 | Time/energy budget estimate for each path (speed set by slope) | grid | 1 h | medium. Constants are assumptions |
| 8 | Line-of-sight / viewshed from a point (comms relay, "can I see the lander") | DEM | 3–4 h | medium–high, JS raycasting on grid |
| 9 | Proven-terrain overlay (distance to where Perseverance has actually driven) | traverse | 0.5 h (also a safety input) | medium |
| 10 | 3D terrain fly-through | DEM + CTX | 8+ h | high wow but too costly |

---

## 4. Proposed safety index (built only from data that exists)

Per grid cell of **60 m** (3×3 of the 20 m DEM, AOI ≈ 500 × 500 cells). All sub-scores 0–1, 1 = safest.

| Component | Weight | Source | Definition |
|---|---|---|---|
| Slope | **0.40** | CTX DEM, Horn's method at 20 m, aggregated as 90th percentile in the 60 m cell | `1` at ≤ 5°, linear to `0` at 25°. **Hard block (cell impassable) above 25°** |
| Roughness | **0.20** | CTX DEM | std-dev of detrended elevation (or max−min slope) in 3×3 at 20 m; `1 − clamp(σ / σ_max)` with σ_max set to the 98th percentile of the AOI. Note: this is DEM-scale roughness, **not rock abundance** (no rock map exists for this AOI) |
| Terrain unit | **0.15** | USGS geologic units | Lookup per unit: smooth/floor/fan 0.9–1.0; etched 0.7; crater-rim/ejecta 0.7; rugged bright 0.5; **eolian bedform 0.35** (sand/ripples). Values are my engineering judgement and are a documented assumption |
| Dust / soft ground proxy | **0.10** | THEMIS night IR brightness (z9 tile, 100 m) | Normalise to AOI 2–98 percentile. Dark (low thermal inertia ≈ fine dust) → lower score. Qualitative, uncalibrated; weight deliberately small |
| Proven terrain | **0.15** | MMGIS traverse | `1` within 100 m of a rover track, decays linearly to `0` at 3 km |

`S_cell = 100 × (0.40·slope + 0.20·rough + 0.15·unit + 0.10·dust + 0.15·proven)`; blocked cells have cost = ∞.

**Path safety** `= 0.6·mean(S_cell along path) + 0.4·min(3-cell moving average of S_cell along path)`; a path qualifies when **≥ 65**. The minimum term stops one terrible stretch hiding inside a good average.

**A\* cost** per step = `distance × (1 + k·(1 − S/100)²)`; presets: *Safest* (k = 8), *Balanced* (k = 3), *Shortest* (k = 0.5, still rejects blocked cells), *Science* (k = 3 minus science bonus, see below). Additional alternatives by re-running with cells of earlier routes penalised ×1.5. Everything deterministic. Routes under 65 are shown greyed with a warning rather than hidden, or hidden, your choice.

**Science score** (separate, displayed alongside): `+` POI within 150 m (weights by category), `+` crossing a unit contact, `+` within 150 m of a MMGIS waypoint with a panorama, `+` CRISM hydrous detection within 500 m. Normalised 0–100.

**Calibration step (free):** compare our slope with the `tilt` at the 708 real waypoints; choose the roughness/slope percentile that best correlates. If the observed max tilt is 20.7° and our slope on those same cells is ≥ 25°, the 20 m DEM is over-estimating and thresholds get relaxed. Requires only the data we already have.

Honest caveat: the safety numbers are heuristics from orbital data, not a rated engineering model. The UI should say so in one line.

---

## 5. Build order and static data files

**Build order**
1. Pipeline: DEM → slope/roughness/hillshade grid, traverse, waypoints (≈ 3 h)
2. Map shell + Trek basemaps + layer panel + `layers.json` (2 h)
3. Safety grid + A\* + 3–4 candidate paths + bottom path picker (5 h)
4. Geology layer, POIs, science score (3 h)
5. Photos pinned (2 h)
6. Time window + current-conditions panel (3 h)
7. CSV upload (1 h)
8. Extras in order: elevation profile → traverse replay → sun/shadow → validation chart (rest of time)

**Files in `public/data/`**

| File | Content | Est. size (gzip) |
|---|---|---|
| `meta.json` | AOI bbox, grid spec, build time, source list & attributions | <5 KB |
| `layers.json` | Tile URL templates, native max zoom, attribution, opacity, default on/off, group for every layer in §1a/1c | <10 KB |
| `grid.json` | Grid metadata + base64 Uint8/Int16 bands: elevation, slope, roughness, unit id, dust, proven, safety (≈ 250k cells × ~7 B) | ~1–1.5 MB. *Alternative: separate `.bin` files; JSON-wrapped base64 is simpler, I'd go with that* |
| `traverse.geojson` | MMGIS drive segments, clipped to AOI, coordinates rounded to 5 dp | ~500 KB |
| `waypoints.geojson` | 708 points: RMC, sol, elev, tilt, dist, panorama URL | ~150 KB |
| `geology.geojson` | Geologic units simplified (Douglas-Peucker ~20 m), 15 unit types with colours | ~1 MB |
| `geology_lines.geojson` (optional) | Contacts/linear features | ~600 KB |
| `pois.geojson` | Curated science POIs: Trek Mastcam-Z POIs (9), CRISM points (3), landing site, delta front etc., each linked to a verified waypoint/sol, plus short blurbs | ~30 KB |
| `photos.json` | Up to ~300 curated photos with `thumb`, `large`, `sol`, `camera`, `caption`, `lon/lat` via waypoint join | ~150 KB |
| `weather.json` | Per-sol MEDA daily summary (min/max air temp, mean pressure) for the last ~60 published sols; diurnal temperature climatology binned by LTST; solar constants for sunrise/sunset | ~50 KB |
| `sample_upload.csv` | Example for the CSV layer | <1 KB |

Total ≈ 3–4 MB gzipped, comfortable for a static Render site.

---

## 6. Blockers and decisions needed from you

1. **DEM download approval.** The pipeline needs the 9.7 MB CTX DEM GeoTIFF (and Python packages: `rasterio`/`GDAL`, `numpy`, `shapely`, `requests`). I have not downloaded it in full. *Disclosure:* while checking the file header I asked for a byte range, but the server ignored the range and streamed ~5 MB of it before my command ended; I kept only the first 8 KB as a sample and deleted the rest. I also deleted a truncated ~15 MB USGS geologic GeoJSON from an overly large first request. Please confirm I can proceed with the 9.7 MB download in Phase 3.
2. **Who is "the explorer"?** Rover-class limits or a human in a pressure suit on foot? It changes the slope limits (I propose 25° hard block, 5°/25° scoring ramp) and the speed/time estimates (needs a walking speed, e.g. 2 km/h in suit as a labelled assumption).
3. **What is the "time window"?** Proposal: Mars sol + local solar time range (e.g. Sol 2040, 09:00–15:00 LMST), converted from an Earth date picker. It drives daylight, sun angle, shadows, and typical temperature. Confirm.
4. **Weather expectations.** There is no live feed; I recommend "computed daylight + last published real MEDA (sol 1859) + seasonal climatology" clearly labelled. OK?
5. **Science POI list.** No official machine-readable discovery/sample catalogue exists. I will build `pois.geojson` from verifiable pieces (Trek Mastcam-Z POIs, USGS map features, CRISM points, MMGIS waypoint panoramas). If you want famous named finds (e.g. specific sampling sites) either supply names and sols, or accept that I'll only include those I can anchor to a MMGIS waypoint and label "to verify".
6. **Thermal inertia / minerals.** True TI at Jezero resolution and CRISM carbonate maps are **not available programmatically**. I propose the THEMIS night-IR proxy (flagged qualitative) and dropping the CRISM mineral map layer. Alternative needing manual work from you: download CRISM Jezero products from the PDS Geosciences Node and give them to me.
7. **Leaflet vs OpenLayers.** I recommend Leaflet. The EPSG:4326 `zoomOffset` handling for Trek is my derivation from the WMTS capabilities; I'll verify it visually at the start of Phase 3.
8. **Upstream reliability.** The Trek tile servers, MMGIS and the raw-image API are public NASA endpoints without published SLAs or rate limits (I stayed ≤ 1 request/s). A demo-day outage is possible. Mitigation: all vector/grid data is local; I can also cache a handful of tiles for the default view as an offline fallback if you want.
9. **AOI.** Confirm the 77.16–77.70 E / 18.21–18.72 N box (30 × 30 km). It excludes the far eastern crater and the delta's easternmost parts beyond 77.70 E.

**Sample files:** see `research/samples/` (e.g. `trek_tile_*.png`, `m20_raw_images_sol1500.json`, `m20_mmgis_waypoints_sample3.json`, `usgs_jezero_featureserver.json`, `meda_sol1859_*_head.csv`, `trek_exportImage_hrsc_dem_jezero.tif`, `worldview_mars_check.json`).

**Stopping here.** No app code has been written. Waiting for your go-ahead and answers to §6.
