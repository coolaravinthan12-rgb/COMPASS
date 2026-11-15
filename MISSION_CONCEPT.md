# COMPASS: Mission concept, and what is built

**Combined Orbital Mars Pathfinding & Astronaut Safety System**

This is the mission concept from your `COMPASS — Mission Concept.pdf`, with a status next to every promise: what the app does today, what it does in part, and what it does not do yet. Use it to keep the pitch honest.

> The concept PDF says its mission facts come from general knowledge and must be checked against NASA sources before the final pitch. I have not verified the history claims (Apollo 14, Apollo 15–17, Spirit, Opportunity, Curiosity, the analog tests, the 4–24 minute signal delay). Check them before presenting.

---

## Why it matters

One day soon, a person will step onto Mars and look out at a landscape no human has ever walked. Home will be more than 50 million kilometres away, and every message to Earth will take minutes to arrive. When that explorer asks, "Is it safe to go there, and can I make it back?", there will be no one nearby to answer.

We believe that answer should already be in their hands. Rovers and orbiters have studied every slope, dune and dust storm on Mars, but that knowledge is spread across many missions and made for scientists on Earth, not for an explorer standing on the surface. COMPASS brings it together into one guide: where to walk, when to leave, what to bring, and what lies along the way.

## The concept in one paragraph

COMPASS turns data from many NASA missions into one map that plans a safe, science-rich Marswalk. The crew picks a start, a destination, a time window and a purpose. COMPASS returns several routes that each have an estimated safety of at least 65, shows the science and resources along each one, and names the best time to leave and the time they will be back. It is built for the moment Earth cannot help, when the signal delay means the crew must decide locally.

**Where the app shows the delay:** the top bar shows the live one-way Earth signal delay (about 11 minutes on the build date), computed from the planets' orbits.

## The problem

Planning a walk on Mars means balancing four things that today live in separate places:

| Concern | Where it lives today | Where it lives in COMPASS |
|---|---|---|
| Terrain: slopes, rocks, soft sand | Orbital maps of different resolutions and dates | Slope, roughness, geology and a dust proxy, scored per 60 m cell by the safety estimator |
| Environment: dust, temperature, radiation, daylight | Weather and orbit data | Computed sun position and daylight for the chosen time, plus the last published rover temperatures |
| Consumables: oxygen, power, water, food | Mission planning documents | Supplies box, supplies check on every route, point of no return |
| Science: the reason for the walk | Mineral maps and team target lists | Points of interest, geologic units, and a sampling-likeness estimator trained on real sample sites |

## The gaps COMPASS targets, and where it stands

| Past mission or tool | What went wrong | COMPASS feature | Status |
|---|---|---|---|
| Apollo 14 (1971) | No live position on a terrain map, no clear view of time and consumables left | You-are-here on the map, with remaining oxygen, water, battery and walk-back time | **Partial.** The WALK view shows a simulated position. There is no live tracking and no 3D terrain view |
| Apollo 15–17 | Point of no return was a pre-planned rule | Point of no return computed from supplies and marked on the route | **Built.** Computed from the limiting consumable with a 25% reserve |
| Spirit (2009) | Hidden ground hazards were not in the route plan | Slope, roughness, soil and geology built into the estimated safety | **Partial.** Slope, roughness, a thermal-inertia proxy and geologic units are used. Rock abundance and subsurface hazards are not available |
| Opportunity | Dust and weather were not tied to route timing and power margins | Daylight and temperature score each departure time; best time to leave is shown | **Partial.** Daylight and temperature are scored for each start time. Dust and power margins are not forecast. A dust or wind upload applies a safety penalty |
| Curiosity | Rock hazards were added after wheel damage | Rock hazards built into planning from the start | **Not built.** No rock map exists for this area |
| Analog tests | Planning still depended on teams back home | Runs offline on local hardware; every number visible to the crew | **Partial.** The model and data run locally with Docker, and every score is shown. The basemap tiles and rover photos still load live from NASA, so a fully offline mode is not built |
| Mars Trek, JMARS, MMGIS | Viewing tools, not planning tools | Same NASA data turned into ranked routes with safety, science and supply checks | **Built** |

## What COMPASS does (the six steps)

1. **Set the trip:** start, destination, earliest start, latest return, purpose, crew size, mode. **Built.** Priority slider from safety to science is also built.
2. **See the data:** seven toggleable layers, each tagged with source, resolution, date and error. **Partial.** Optical, thermal and topographic are built. Geophysical (geologic units and the estimated safety), atmospheric (rover temperature card) and chemical (points of interest and the sampling-likeness map) are built in part. The radiation layer was removed because there is no data behind it.
3. **Compare routes:** several paths that have an estimated safety of at least 65, for example Safest, Best science and Fastest, each with safety, science and resource value, best departure, arrival and return times, and a supplies check. **Built.**
4. **Check supplies:** food, water, oxygen, battery and sample bags against what each route needs, with the shortfall named. **Built.** The suggestion for what to change is not built; the app names what is short.
5. **Choose and go:** confirm a route, with the point of no return and safe havens marked. **Partial.** Confirm, point of no return and the mission log work. The only safe haven is an assumed one at the landing site.
6. **Learn:** mission teams upload their own CSV or SQL data and the model retrains. **Built.** Traverse logs, sample results, weather and surface-change files retrain the models, and the new scores appear on the map.

## How the estimated safety works

The concept says the index is built from terrain, environment, comms coverage and return margin, and that a route must pass a minimum on each part so a fast route with no safe way home never qualifies.

In the app, a route's estimated safety is **60% terrain + 20% daylight and temperature + 20% supplies margin**. A route needs an estimated safety of 65 overall, and each part must be at least 50, so a short route with no way home does not qualify. **Comms coverage is not modelled**, because no relay-pass data is integrated.

The terrain part comes from the machine-learning safety estimator (a calibrated RandomForest). If the model service is not running, the app falls back to a built-in weighted index.

## What it helps achieve

- **Safer walks:** every route has a clear estimated safety, a point of no return and a way home.
- **More science per walk:** routes bend toward high-value sites instead of only the shortest path.
- **Crew independence:** decisions made on Mars, in minutes, without waiting for Earth.
- **Better planning over time:** each walk adds data, so the model gets more accurate.
- **Uses beyond Mars:** the same engine fits the Moon and Earth, for example polar expeditions, desert teams and search-and-rescue.

## Roadmap

| Phase | When | What COMPASS becomes |
|---|---|---|
| 1. Planning tool | Now (hackathon) | Planners on Earth design and compare Marswalks with real NASA orbital data |
| 2. Analog field tool | 1–3 years | Tested at Mars analog sites such as the Mars Desert Research Station and HI-SEAS; real walks train the model |
| 3. Moon first | 3–5 years | Same engine with lunar data for Artemis walks near the lunar south pole |
| 4. Mars crew companion | 2030s onward | Runs on habitat or suit hardware, offline, learning from every walk |

## Pitch lines, with their caveats

| Line | Check before saying it |
|---|---|
| "In 1971, two Apollo astronauts turned back from Cone Crater when they were only about 20–30 metres from its rim. They had the will and the oxygen, but not the map. COMPASS is that map." | History claim: verify against NASA sources |
| "NASA already has the data. COMPASS turns it into a decision the crew can make in minutes." | True for the data used: Mars Trek, MMGIS, the raw-images API and PDS MEDA, plus USGS geology |
| "Every route has an estimated safety of at least 65, shows its point of no return, and tells you the best time to leave." | True with a nuance: the point of no return only appears when your supplies do not cover the round trip; otherwise the app says the round trip fits |
| "COMPASS turns every Marswalk into data that makes the next one safer." | True in design: uploads retrain the model. Say "retrains the model", not "learns on its own" |
