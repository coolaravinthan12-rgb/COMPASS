# COMPASS: submission pack (NASA Space Apps Challenge)

**Challenge:** build a layered, integrated view of a location or route on the Martian surface that pulls together data from several NASA science missions, to help a human explorer plan and carry out a successful Marswalk while doing science along the way.

**Dates:** the Project Submission section opens Saturday 14 November. The deadline is **Sunday 15 November, 11:59 PM SGT**. Do not leave it to the last minute.

Everything below is written to paste into the four submission fields. Items marked **TODO** need something only you can provide.

---

## 1. Project summary

**Name:** COMPASS (Combined Orbital Mars Pathfinding & Astronaut Safety System)

**One line:** COMPASS turns orbital and rover data from several NASA missions into ranked Marswalk routes with an estimated safety for Jezero Crater, with the time to leave, the supplies needed and the science along the way.

**The problem.** A person walking on Mars will be minutes from help and a 4–24 minute signal delay from Earth. The data that says where it is safe to walk, when the light is right, and what is worth sampling exists, but it is spread across separate missions and tools made for scientists on Earth. Existing viewers such as Mars Trek, JMARS and MMGIS show the data. None of them turns it into a decision that combines terrain, timing, supplies and science for someone on foot.

**The solution.** The crew sets a start, a destination, a time window, a purpose, a crew size and a travel mode. COMPASS returns up to three routes (Safest, Best science, Fastest). Each route has:

- an estimated safety from 0 to 100, which must reach 65 to qualify, built from terrain, daylight and temperature, and the margin in the crew's supplies;
- a science score and a resources score;
- the best departure time inside the window, with arrival and return times;
- a check of food, water, oxygen, battery and sample bags, naming what is short;
- the point of no return, if the supplies do not cover the walk back;
- a plain-language explanation of every number.

A safety estimator (a calibrated RandomForest) and a sampling-likeness estimator are trained from real data: the Perseverance traverse and the rover's real sample sites. Mission teams can upload their own traverse logs, sample results, weather and surface-change files, retrain the models, and see the routes change.

**Impact.**

- *Safer walks:* every route shows an estimated safety, how it was made, and a way home.
- *More science per walk:* routes bend toward places that resemble where scientists chose to sample.
- *Crew independence:* the numbers are visible and run locally, so a decision does not wait for Earth.
- *Compounding value:* each upload makes the next plan better.
- *Beyond Mars:* the same engine fits the Moon and Earth (polar expeditions, desert teams, search-and-rescue).

**Honest scope.** COMPASS is a prototype for planners on Earth, working on Jezero Crater. It is not flight software and its estimated-safety numbers are estimates from orbital data, not engineering ratings. Limits are listed in section 4.

---

## 2. Project demo

You can submit **either** a 30-second video **or** a 7-slide presentation. I cannot record video or make slides for you. Both outlines below use only what the app really does.

### Option A: 30-second video script (screen recording, voice-over)

| Time | Show | Say |
|---|---|---|
| 0–5 s | Map of Jezero, top bar with sol, solar time, Earth delay | "On Mars, help is minutes away. A walker needs one screen that answers: is it safe, and can I get back?" |
| 5–12 s | Click start and destination; press Find routes; three routes appear | "COMPASS merges NASA orbital and rover data into three routes, each with an estimated safety." |
| 12–20 s | Open Explain on one route: safety breakdown, supplies, point of no return | "Every number is explained: terrain, daylight, supplies, and the point of no return." |
| 20–27 s | Upload page: add a traverse file, press Train model, routes update | "Upload mission data, retrain the model, and the routes change." |
| 27–30 s | Logo | "COMPASS: the map for the first Marswalk." |

### Option B: 7-slide outline

1. **Title and hook:** the walker on Mars, 4–24 minutes from Earth. Name, one-line description.
2. **The problem:** four things planners balance (terrain, environment, supplies, science), spread across separate tools. Show the gap table from `MISSION_CONCEPT.md`.
3. **The solution:** screenshot of the main screen with routes. Callouts: estimated safety, best time to leave, supplies check, point of no return.
4. **How the data comes together:** one diagram, NASA sources on the left (CTX DEM and imagery, THEMIS, OMEGA/CRISM, Mastcam-Z points, M2020 traverse, raw images, MEDA weather) flowing into the safety and sampling-likeness estimators and the route planner.
5. **The model and the evidence:** safety estimator spatial cross-validation AUC 0.976 and Brier 0.052; independent check against the tilt Perseverance measured at 708 stops (Spearman 0.76, against 0.78 for plain slope); upload and retrain demo.
6. **Impact and what comes next:** safer walks, more science, crew independence, then the roadmap (analog field test, Moon, Mars crew companion).
7. **Honest limits and thanks:** what is not modelled (rock abundance, dust forecast, comms, radiation), data credits, team.

**TODO:** record the video or build the slides, using screenshots from the running app.

---

## 3. Final project link

**TODO: needs a public URL.** I cannot publish the project for you. Options, easiest first:

1. **Render (free):** push `Compass` to a GitHub repository, then in Render choose New, then Blueprint, pick the repo, and apply. `render.yaml` is already in the project. The first load after idle takes about a minute. See `DEPLOY.md` in your challenge folder and `HOW_WE_BUILT_IT.md` section 8.
   - *Not yet tested:* the Docker image build. Docker Desktop was not running on my machine, so I only tested the same single-server setup without Docker (the built app, the API and the data files all served from one port).
   - *Risk:* Render's free tier has 512 MB of memory and a very small CPU. Retraining may be slow there. The committed demo model means the app does not train at startup.
2. **GitHub repository link** as "supporting materials", with the README and this file. Safe fallback if hosting fails.
3. **Local Docker** plus a Cloudflare tunnel for a temporary public link (see `DEPLOY.md` section 6).

Whichever you choose, open the link in a private browser window before submitting.

---

## 4. Project details

### Approach

1. **Research first.** Before writing code I tested every data source with real requests and wrote `research/DATA_REPORT.md`. What did not work is recorded there (for example NASA Worldview is Earth-only, Trek's CRISM tile layers return 404, and there is no live Jezero weather feed).
2. **Static data pipeline.** `pipeline/build_data.py` downloads, crops and converts the data into small static files: a 60 m terrain grid (532 × 504 cells over about 30 × 30 km of Jezero), the rover's traverse, geologic polygons, points of interest, 270 rover photos tied to the rover's position, and recent rover weather.
3. **A browser app.** React, TypeScript and Leaflet. A deterministic planner (A* on the grid) generates routes. Scores are weighted sums of named parts so each can be explained.
4. **Machine learning.** A Python (FastAPI) service trains two RandomForest classifiers with probability calibration on real labels, evaluates them on held-out map blocks, and returns per-cell scores to the app. Routes then use those scores.
5. **Honest validation.** Where a number could mislead, the app shows the check next to it. See "Validity" below.

### Tools and technologies

| Area | Tools |
|---|---|
| Front end | TypeScript, React 18, Leaflet 1.9, Vite, PapaParse |
| Back end and ML | Python, FastAPI, scikit-learn (RandomForest, isotonic calibration), pandas, NumPy, SciPy, joblib |
| Data pipeline | Python, tifffile, SciPy, Pillow, requests |
| Deployment | Docker (multi-stage), Render blueprint |
| Algorithms | A* routing, Mars24 sun and sol calculations (Allison & McEwen, 2000), orbital elements for light delay (Standish approximations) |

### NASA (and partner) datasets used

| Dataset | Source | Used for |
|---|---|---|
| MRO CTX digital terrain model, Jezero (20 m) | NASA Mars Trek | Slope, roughness, elevation, hillshade and shadows, elevation profile |
| MRO CTX and HiRISE image mosaics | NASA Mars Trek | Basemap |
| Mars Odyssey THEMIS day and night infrared mosaics | NASA Mars Trek | Thermal layers; night infrared as a dust and thermal-inertia proxy in the safety estimator |
| OMEGA/CRISM hydrous mineral detections | NASA Mars Trek | Mineral points; the mineral index in the sampling-likeness estimator |
| Mastcam-Z panorama points | NASA Mars Trek | Points of interest |
| Mars 2020 traverse and waypoints (with rover tilt) | NASA/JPL MMGIS | Safety labels (driven cells), proven terrain, validation against measured tilt |
| Mars 2020 raw images | NASA raw-images API | Rover photos pinned along the route |
| Mars 2020 MEDA environmental data | NASA PDS Atmospheres Node | Air temperature and pressure by time of day, scoring daylight and temperature |
| Sample locations | Herd et al. (2025), PNAS, Table 1, via Europe PMC | Labels for the sampling-likeness estimator (24 sample sites) |
| Geologic map of Jezero (SIM 3464) | USGS (Sun & Stack, 2020) | Geologic units: terrain-type features and the resources score |

### Validity: what supports the numbers

- **Slope check.** The slope computed from the CTX DEM correlates with the tilt Perseverance measured at 708 of its stops (Pearson 0.77).
- **Safety estimator.** 3-fold spatial cross-validation AUC 0.976 and Brier score 0.052 on **held-out map blocks**, not random cells, because neighbouring cells are correlated. **This measures agreement with its own training labels** (rover-driven cells plus slope, roughness and dust rules), so it is not proof of safety.
- **Independent check, not used in training.** The estimator's lower estimated safety correlates with the tilt the rover actually measured at 708 stops: Spearman 0.76. Plain DEM slope alone gives 0.78 on the same stops, so the model does not beat slope on this check.
- **Calibration.** Cells the model scores about 70% are labelled safe 71% of the time in the held-out blocks.
- **Sampling-likeness estimator.** 3-fold spatial cross-validation AUC 0.945 (gradient boosting; random forest gave 0.928), Brier 0.096, with only 24 sample sites. Treat it as a ranking of terrain that resembles past sampling, not a prediction of discoveries.
- **Tested uploads.** A bad file returns a clear error naming the missing column. A dust-storm weather upload lowers safety by exactly 20 points. A surface-change upload drops safety in the flagged cells (100 to 59 in test). A traverse upload raises the number of real labelled cells.

### Known limits (say these before a judge asks)

- Jezero Crater only (about 30 × 30 km).
- The estimated safety is a heuristic plus a model trained on weak labels. It is not an engineering rating.
- No rock-abundance map exists for this area, and the dust proxy is the uncalibrated THEMIS night image. The CRISM carbonate and olivine maps were not available in a usable form.
- Weather is not live. The latest published MEDA data is months old. Dust, wind and radiation are not forecast; a dust or wind upload applies a penalty.
- Comms coverage is not modelled. The only safe haven is an assumed one at the landing site.
- Walking speed (2 km/h), the 25% supply reserve and consumption rates are assumptions.
- Sample and photo positions use the rover's nearest earlier waypoint, so they are approximate.
- The basemap tiles and photos load live from NASA servers, so the map needs internet.

---

## 5. How the project matches the judging criteria (1 to 5 each)

| Criterion | What to point to |
|---|---|
| **Impact:** what problem, why it matters | A crew with a signal delay cannot ask Earth. COMPASS gives a scored, explained answer to "is it safe, can I make it back, what is worth the walk". See sections 1 and `MISSION_CONCEPT.md` |
| **Creativity:** how original | One screen that joins terrain, timing, supplies and science; point of no return computed from real supplies; sun and shadow maps for the chosen start time; models that retrain on mission uploads |
| **Validity:** evidence and data | Ten real datasets from NASA and partners; spatial hold-out evaluation; calibration table; independent check against rover-measured tilt (0.76); limits stated openly |
| **Relevance:** fit to the challenge | The challenge asks for a layered, integrated view that helps plan a Marswalk with science: seven layer groups, routes with science and resources, and mission-team uploads |
| **Presentation:** clarity | Every score has an Explain view; wireframe-faithful layout; this pack and the demo script |

---

## 6. Before you submit (checklist)

- [ ] Public link works in a private window (**TODO**)
- [ ] Demo video or 7 slides recorded (**TODO**)
- [ ] Verify the history claims in `MISSION_CONCEPT.md` against NASA sources
- [ ] Put the dataset credits (section 4 table) on your last slide
- [ ] When speaking, only claim what `MISSION_CONCEPT.md` marks **Built** or **Partial**
- [ ] Submit well before Sunday 15 November, 11:59 PM SGT
