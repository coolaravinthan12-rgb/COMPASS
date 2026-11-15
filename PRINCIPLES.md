# The mathematics and science inside COMPASS

Every number COMPASS shows comes from a formula written down here. Nothing is hidden in a black box except the two trained models, and those are described too, along with how well they hold up.

The code that implements each section is named in brackets so you can check it.

## What "estimated safety" means

COMPASS calls its main number an **estimated safety**, from 0 to 100, and not a "safety score" or a probability. It is an estimate from orbital data and a few rules about how people and rovers move. Specifically:

- The terrain part comes from a trained estimator whose labels are **mostly rules** (slope, roughness and dust limits) plus the **real Perseverance traverse** for cells it drove. There are no real "unsafe" examples, because a rover only drives where it believes it is safe.
- So the estimator's accuracy figures measure how well it reproduces its own labels. They do not show that a route is safe.
- The only independent check is the tilt the rover measured at 708 stops. Plain slope does slightly better on it than the estimator.
- The 65 is a planning threshold chosen for the demo. It is not a probability of survival.

Use the estimate to compare routes and to see what drives them, not to certify one.

## 1. Terrain from orbit

**Source:** the Jezero elevation model from the Mars Reconnaissance Orbiter's CTX camera, 20 m per pixel, on a simple sphere map projection of radius 3,396,190 m. The projection stretches east-west distances by 1/cos(latitude) (about 5% at Jezero), so the code corrects for it. [`pipeline/build_data.py`]

**Slope.** At each 20 m pixel, with elevation z and pixel size Δ:

```
dz/dx ≈ (z[i, j+1] − z[i, j−1]) / (2 · Δ · cos(lat))        dz/dy ≈ (z[i+1, j] − z[i−1, j]) / (2 · Δ)
slope  = arctan( √( (dz/dx)² + (dz/dy)² ) )
```

COMPASS plans on 60 m cells (3 × 3 pixels). Each cell keeps the **90th percentile** of its nine pixel slopes, so a cell with one steep face counts as steep.

**Roughness.** The root-mean-square height deviation from the local average, a measure of small-scale relief:

```
R = √( mean( (z − z̄₅ₓ₅)² ) )          over the 3 × 3 pixels of a cell, z̄ = 5 × 5 mean
```

R is divided by the 98th percentile for the whole area, so 1.0 means as rough as the roughest 2% of Jezero. It measures terrain relief at 20 m scale, not boulders. No rock map exists for this area.

**Terrain context.** For the safety estimator, four more numbers describe the surroundings of a cell: the steepest neighbouring cell, the mean slope in a 5 × 5 window (300 m), the local relief (highest minus lowest elevation in 300 m) and the curvature (absolute Laplacian of elevation, which is large at rims, gullies and breaks in slope).

**Hard limit.** Any cell steeper than **25°** is impassable, whatever the model says. This guardrail is applied after the model runs. [`backend/ml/pipeline.py`]

## 2. Dust and thermal inertia

Thermal inertia measures how quickly ground changes temperature:

```
I = √( k · ρ · c )        k = conductivity, ρ = density, c = specific heat
```

Fine dust has low thermal inertia (it heats and cools quickly and can swallow a wheel or a boot), while rock and crust have high thermal inertia. A true thermal-inertia map at this resolution is not available, so COMPASS uses the **THEMIS night-time infrared image** (100 m per pixel) as a proxy. At night rock stays warm and dust turns cold, so a brighter night image means firmer ground. It is relative brightness, not calibrated temperature, and the app labels it that way.

## 3. Sun, sol and signal delay

**Mars time and sun position** follow Allison and McEwen (2000), the "Mars24" algorithm. In short:

```
MSD = (JD_TT − 2451549.5) / 1.0274912517 + 44796.0 − 0.0009626        Mars Sol Date
Ls  = α_FMS + equation of center + perturbations                      areocentric solar longitude (season)
sin δ = sin(25.19°) · sin Ls                                          solar declination
sin(elevation) = sin φ · sin δ + cos φ · cos δ · cos H                φ = latitude, H = hour angle
H0 = arccos(−tan φ · tan δ)                                           sunrise at 12 h − H0/15, sunset at 12 h + H0/15
```

The local solar time and sol number are calibrated on one real Perseverance image (Sol 1500, 17:04:00, taken 2025-05-10 03:37:30 UTC). A Mars hour is 1.0275 times an Earth hour, and COMPASS counts walking and supplies in Earth hours. [`frontend/src/lib/mars.ts`]

**Shadows.** For hillshade the surface normal is `(−∂z/∂x, −∂z/∂y, 1)`, and brightness is its dot product with the sun direction. A cell is in shadow if, marching toward the sun for up to 90 cells, any terrain rises above `distance · tan(sun elevation)`.

**Earth signal delay.** The one-way light time uses the positions of Earth and Mars from approximate Keplerian orbital elements (Standish, valid 1800–2050), solving Kepler's equation `M = E − e · sin E` by iteration:

```
delay (minutes) = distance (AU) × 499.0048 s per AU / 60
```

## 4. Scoring a route

All scores run from 0 to 100. [`frontend/src/lib/route.ts`]

**Safety.** A route's safety is a weighted blend of three parts, and a route qualifies only if the total reaches **65** *and* each part reaches **50**:

```
safety = 0.6 · terrain + 0.2 · daylight_and_temperature + 0.2 · supplies_margin
```

- **Terrain** = `0.6 · mean(cell safety along the path) + 0.4 · weakest stretch`, where the weakest stretch is the lowest value of a 3-cell moving average. One bad patch cannot hide in a good average. The cell safety comes from the safety estimator (section 5).
- **Daylight and temperature.** Every 10 minutes of the walk, the sun gives a daylight weight (1 if higher than 5° above the horizon, 0.5 if above 0°, 0.2 if within 6° below, otherwise 0), and a thermal term `(T + 90) / 65` clipped to 0–1 from the last published rover air temperatures at that local time. The score is `100 · (0.65 · mean(daylight) + 0.35 · mean(thermal))`. COMPASS searches start times in 15-minute steps inside your window and uses the best one.
- **Supplies margin** = `100 · min(ratio, 1.5) / 1.5`, where ratio is the smallest of (what you have ÷ what the trip needs) over oxygen, water, food and battery.

**Walking time.** Speed depends on slope: `v = v₀ · max(0.3, 1 − slope/35)`, with `v₀` = 2 km/h on foot, 8 km/h in a rover and 5 km/h for a mix. These speeds are assumptions.

**Supplies needed**, with a 25% reserve (`R = 1.25`) and trip duration `H` in Earth hours, including 0.4 h at each science stop:

```
oxygen = H · R      water = 0.3 L/h · crew · H · R      food = ⌈H · R / 6⌉ · crew      battery = drain · H · R
```

**Point of no return.** The usable hours are `cap = min(oxygen, water/(0.3·crew), food·6/crew, battery/drain) / R`. Along the route, the point of no return is the last point where `2 · (time walked so far) ≤ cap`, meaning you can still walk back the way you came. If the whole round trip fits, there is none.

**Science** = `100 · (0.6 · min(1, mean sampling-likeness / 0.5) + 0.4 · min(1, sum of point-of-interest weights / 4))`, using points of interest within 200 m of the path. **Resources** = `100 · min(1, 1.2 · fraction of the route over delta and layered-rock units + 0.4 · [hydrated-mineral detection within 600 m])`.

## 5. Finding the routes: A*

Routes are planned by A* search on the 60 m grid with eight neighbours. The cost of stepping into a cell is

```
cost = distance · (1 + k · q²) · (1 − w · science) · penalty        q = (100 − safety) / 100
```

so risky cells cost much more than their length. The three routes use different settings: Safest (k = 10, science weight w = 0), Best science (k = 3, w = 0.3 + 0.5 × your priority slider) and Fastest (k = 0.4). The heuristic is the straight-line distance times (1 − w), which never overestimates, so A* returns the cheapest path for each setting. If two routes come out as the same track (over 90% shared cells), the later one is re-planned with a ×1.8 penalty on the earlier tracks. Everything is deterministic: the same inputs give the same routes.

## 6. The two trained models

[`backend/ml/`] Both are classifiers that output a probability, then **isotonic calibration** adjusts the probabilities so that "70%" really means about 70% of such cells are positive.

**Safety estimator: a random forest** (150 trees, depth 12, balanced class weights).
- *Features:* slope, roughness, the dust proxy, recent change, and the four terrain-context numbers.
- *Labels:* cells Perseverance actually drove are safe (weight 5, scaled by `1 / (1 + (newest sol − sol) / 500)` so newer data counts more). Slopes up to 5° are weakly safe, 15° and above weakly unsafe, and between them a weak label that fades from safe to unsafe. The roughest 3% and the loosest-dust 3% of cells are weakly unsafe.
- *Why elevation is not a feature:* it only records where the rover happened to drive.

**Sampling-likeness estimator: gradient boosting.** Positives are the cells within three cells of a real Perseverance sample site (24 sites from Herd et al. 2025, positioned at the rover's waypoint on that sol); negatives are an equal number of random background cells. Features: terrain, elevation, dust, a mineral index (closeness to orbital hydrated-mineral detections) and geologic-unit groups. It ranks terrain by how much it resembles places scientists chose to sample.

**Evaluation.** Neighbouring cells look alike, so a random split would flatter the model. COMPASS holds out whole 16 × 16-cell map blocks in 3-fold spatial cross-validation and reports AUC and the Brier score (mean squared error of the probabilities, lower is better) plus a calibration table.

**Current numbers (model v1):**

| | Safety estimator | Sampling-likeness estimator |
|---|---|---|
| Spatial cross-validation AUC | 0.976 | 0.945 |
| Brier score | 0.052 | 0.096 |
| Calibration | Cells scored about 70% are labelled safe 71% of the time | Reported per version in the app |

**Independent check, not used in training.** At 708 stops, Perseverance measured its own tilt. The estimator's lower estimated safety correlates with that tilt at Spearman ρ = **0.76**. Plain DEM slope alone gives **0.78** on the same stops, so the model does not beat slope on this check. What the model adds are labels from where the rover actually drove, plus dust and context terms. Treat the AUC as agreement with the model's own labels, not proof of safety.

**Conditions on top of the model.** An uploaded weather file takes 20 points off safety if dust opacity is 1.0 or more, and 10 more if wind is 15 m/s or more. A surface-change upload adds a hazard feature and removes up to 40 points at the flagged cells.

## 7. What the maths cannot do

- It cannot see boulders, soft subsurface or fresh sand drifts. No orbital map shows them at walking scale.
- The dust proxy is relative brightness, not calibrated temperature.
- Comms coverage and radiation are not modelled.
- Walking speeds, consumption rates and the reserve are assumptions that anyone can change in `route.ts`.
- Sample and photo positions use the rover's nearest earlier waypoint, so they are approximate.

## References

- Allison, M. and McEwen, M. (2000). A post-Pathfinder evaluation of areocentric solar coordinates with improved timing recipes for Mars seasonal/diurnal climate studies. *Planetary and Space Science*, 48, 215–235.
- Standish, E. M. Keplerian elements for approximate positions of the major planets (JPL, valid 1800–2050).
- Sun, V. Z. and Stack, K. M. (2020). Geologic map of Jezero crater and the Nili Planum region, Mars. USGS Scientific Investigations Map 3464.
- Herd, C. D. K. et al. (2025). Sampling Mars. *PNAS*. Table 1 of sample designations.
- Breiman, L. (2001). Random forests. *Machine Learning*, 45, 5–32.
- Zadrozny, B. and Elkan, C. (2002). Transforming classifier scores into accurate multiclass probability estimates (isotonic calibration). *KDD*.
