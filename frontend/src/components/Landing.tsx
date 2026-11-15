import { useEffect, useMemo, useState } from "react";
import { DOCS } from "../lib/docs";
import { Mark } from "./DocPage";

interface Hero { w: number; h: number; elev: string; route: [number, number][]; landing: [number, number]; elevMin: number; elevMax: number }

// ---------- contour lines from the real elevation grid (marching squares) ----------
function contours(z: Int16Array, w: number, h: number, levels: number[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const L of levels) {
    let d = "";
    for (let i = 0; i < h - 1; i++) for (let j = 0; j < w - 1; j++) {
      const a = z[i * w + j], b = z[i * w + j + 1], c = z[(i + 1) * w + j + 1], e = z[(i + 1) * w + j];
      const k = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (e >= L ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const T = [j + (L - a) / (b - a), i], R = [j + 1, i + (L - b) / (c - b)], B = [j + (L - e) / (c - e), i + 1], Lf = [j, i + (L - a) / (e - a)];
      const seg = (p: number[], q: number[]) => { d += `M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`; };
      switch (k) {
        case 1: case 14: seg(Lf, B); break; case 2: case 13: seg(B, R); break; case 3: case 12: seg(Lf, R); break;
        case 4: case 11: seg(T, R); break; case 5: seg(T, Lf); seg(B, R); break; case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(T, Lf); break; case 10: seg(T, R); seg(Lf, B); break;
      }
    }
    out[L] = d;
  }
  return out;
}

function HeroArt() {
  const [hero, setHero] = useState<Hero | null>(null);
  useEffect(() => { fetch("data/hero.json").then((r) => r.json()).then(setHero).catch(() => setHero(null)); }, []);
  const art = useMemo(() => {
    if (!hero) return null;
    const bytes = Uint8Array.from(atob(hero.elev), (c) => c.charCodeAt(0));
    const z = new Int16Array(bytes.buffer);
    const step = 50, lo = Math.ceil(hero.elevMin / step) * step, hi = Math.floor(hero.elevMax / step) * step;
    const levels: number[] = []; for (let L = lo; L <= hi; L += step) levels.push(L);
    const paths = contours(z, hero.w, hero.h, levels);
    return { levels, paths, route: "M" + hero.route.map((p) => `${p[0]} ${p[1]}`).join("L"), end: hero.route[hero.route.length - 1] };
  }, [hero]);
  if (!hero || !art) return <div className="heroart ph" aria-hidden="true" />;
  return (
    <figure className="heroart" style={{ aspectRatio: `${hero.w} / ${hero.h}` }}>
      <svg viewBox={`0 0 ${hero.w} ${hero.h}`} role="img" aria-label="Elevation contours of Jezero Crater with the route Perseverance has driven">
        <g fill="none" strokeLinecap="round">
          {art.levels.map((L) => (
            <path key={L} d={art.paths[L]} className={L % 250 === 0 ? "ct idx" : "ct"} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <path d={art.route} className="routeglow" pathLength={1} />
        <path d={art.route} className="route" pathLength={1} />
      </svg>
      <span className="hpin" style={{ left: `${(hero.landing[0] / hero.w) * 100}%`, top: `${(hero.landing[1] / hero.h) * 100}%` }}><i className="hdot" />Landing site</span>
      <span className="hpin end" style={{ left: `${(art.end[0] / hero.w) * 100}%`, top: `${(art.end[1] / hero.h) * 100}%` }}><i className="hdot amber" />Rover, sol 2022</span>
      <figcaption>Jezero Crater from the MRO CTX terrain model: a line every 50 m, and the route Perseverance has driven.</figcaption>
    </figure>
  );
}

function go(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }

const SCENARIOS = [
  { title: "A short look at the panorama sites", trip: "About 3 km on foot, two crew, window 08:00 to 17:00",
    result: "All three routes pass. Safest scores 82% and leaves at 11:24, back at 16:38. Best science also scores 82%; Fastest scores 80% but crosses the most delta and layered rock (resources 91).",
    lesson: "Three real options at nearly the same estimated safety, with the best start time found for light and warmth.", scores: ["82", "82", "80"], tone: "ok" },
  { title: "Too far on foot", trip: "A 13 km reach, same crew and window, on foot",
    result: "Every route is greyed out. The card names the cause: supplies are short on oxygen, water, food and battery, and past 7.4 km the walk home no longer fits.",
    lesson: "A plan with no safe way home does not qualify. The point of no return comes from your supplies.", scores: ["75", "75", "68"], tone: "bad" },
  { title: "The same trip by rover", trip: "The 13 km reach again, travel mode set to Rover",
    result: "Safest scores 94%, leaving at 12:23 and back at 16:41, with supplies to spare. The round trip takes about 3.6 hours, against about 15 on foot.",
    lesson: "Travel mode changes the answer. The rover speed of 8 km/h is an assumption you can change.", scores: ["94", "94", "87"], tone: "ok" },
  { title: "Leaving after sunset", trip: "The short walk again, window 18:30 to 23:30",
    result: "No route is offered. Terrain and supplies are fine, but the daylight and temperature part scores only 15 to 16%, so each route fails the 50% minimum for that part.",
    lesson: "Every part of the estimated safety has to pass. A route that is safe on paper but run in the dark and cold is not offered.", scores: ["66", "66", "64"], tone: "bad" },
];

const LESSONS = [
  { who: "Apollo 14, 1971", gap: "The crew turned back on foot without a live position on a terrain map.", answer: "Your position on the map, with oxygen and walk-back margin updating as you go.", status: "Partial", note: "simulated position" },
  { who: "Apollo 15 to 17", gap: "A rover drive limit kept the crew within walking distance of home, worked out by hand.", answer: "The point of no return, computed from your real supplies and shown on the route.", status: "Built", note: "" },
  { who: "Spirit, 2009", gap: "The rover drove into soft ground and never got out.", answer: "A soft-ground proxy and geologic units, with sand rated lowest, feed the estimated safety.", status: "Partial", note: "no subsurface data" },
  { who: "Opportunity, 2018", gap: "A global dust storm cut its solar power; weather was not tied to timing.", answer: "Daylight and temperature scored for every start time. A dust or wind upload lowers the estimate.", status: "Partial", note: "no dust forecast or power model" },
  { who: "Curiosity", gap: "Sharp rocks damaged its wheels, so routes were re-planned after the damage.", answer: "Rock hazards in planning from the start.", status: "Not yet", note: "no rock map exists for this area" },
  { who: "Mars Trek, JMARS, MMGIS", gap: "Excellent for viewing orbital data, built for scientists on Earth.", answer: "The same NASA data turned into ranked routes with estimated safety, science and supply checks.", status: "Built", note: "" },
];

const DATA = [
  { src: "Mars Reconnaissance Orbiter, CTX camera", what: "20 m elevation model and 6 m image mosaic of Jezero", feeds: "Slope, roughness, hillshade and shadows, elevation profile, basemap" },
  { src: "Mars Reconnaissance Orbiter, HiRISE", what: "25 cm image mosaic of the crater floor and delta", feeds: "Close-up basemap" },
  { src: "Mars Odyssey, THEMIS", what: "100 m day and night infrared mosaics", feeds: "Thermal layers and the dust proxy in the safety estimator" },
  { src: "OMEGA and CRISM spectrometers", what: "Orbital detections of hydrated minerals", feeds: "Mineral points and the mineral index" },
  { src: "Mars 2020 Perseverance: traverse and waypoints", what: "Every drive through sol 2022, with the tilt the rover measured at 708 stops", feeds: "Labels for the safety estimator, a check on slope" },
  { src: "Mars 2020 raw images and Mastcam-Z points", what: "Photos by site and drive, narrated panorama sites", feeds: "Photo pins on the map, points of interest" },
  { src: "Mars 2020 MEDA weather station", what: "Air temperature and pressure, last published sols", feeds: "Daylight and temperature score" },
  { src: "USGS Geologic Map of Jezero (SIM 3464)", what: "1,308 mapped polygons in 14 units", feeds: "Geologic layer, resources score, unit features" },
  { src: "Herd et al. 2025, Sampling Mars (PNAS)", what: "The rover's sample sites, Table 1", feeds: "Labels for the sampling-likeness estimator (24 sites)" },
];

const DECISIONS = [
  { t: "Static first, model optional", d: "All map data are small static files, so the planner runs on any host. The machine-learning service is an upgrade: if it is off, a built-in weighted index takes over and the app says so." },
  { t: "Routing is plain, learning is only for scores", d: "Routes come from A* search, which is deterministic and explainable. The models only score cells, and a hard 25° slope limit overrides them." },
  { t: "Every number has a formula", d: "Each score has a written definition and an Explain view in the app. Nothing is a mystery weight." },
  { t: "Test on places the model has not seen", d: "Neighbouring map cells look alike, so models are scored on whole held-out map blocks. A separate check uses the tilt Perseverance measured at 708 stops." },
  { t: "Say what is a proxy", d: "The dust layer is relative night-time brightness, not calibrated thermal inertia. Weather is the last published rover data, not a live feed. The app labels both." },
  { t: "Every part must pass", d: "A route needs an estimated safety of 65 out of 100 and at least 50 on terrain, daylight and temperature, and supplies. A fast route with no way home cannot qualify." },
];

const ROADMAP = [
  { when: "Now", what: "Planning tool", d: "Planners on Earth design and compare Marswalks with real NASA orbital data." },
  { when: "1 to 3 years", what: "Analog field tool", d: "Tested at Mars analog sites such as the Mars Desert Research Station and HI-SEAS, where real walks train the model." },
  { when: "3 to 5 years", what: "The Moon first", d: "The same engine with lunar data for walks near the south pole." },
  { when: "2030s onward", what: "Mars crew companion", d: "Runs on habitat or suit hardware, offline, learning from every walk." },
];

export default function Landing() {
  const links: [string, string][] = [["product", "Product"], ["use", "How to use"], ["examples", "Examples"], ["science", "Science"], ["data", "Data"], ["decisions", "Decisions"], ["mission", "Mission"], ["docs", "Documents"]];
  return (
    <div className="landing" id="top">
      <header className="lnav">
        <a className="lbrand" href="#/"><Mark />Compass</a>
        <nav className="llinks" aria-label="Sections">{links.map(([id, l]) => <button key={id} onClick={() => go(id)}>{l}</button>)}</nav>
        <a className="lbtn primary sm" href="#/app">Open the planner</a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>Know the way, and the way back.</h1>
          <p className="lede">COMPASS joins orbital and rover data from several NASA missions into ranked routes with an estimated safety for a person on foot in Jezero Crater. It tells you when to leave, what to carry, and what is worth the walk.</p>
          <div className="ctas">
            <a className="lbtn primary" href="#/app">Open the planner</a>
            <a className="lbtn" href="#/docs/USER_GUIDE">Read the user guide</a>
            <a className="lbtn" href="/COMPASS_Charlies_Angels.pdf" target="_blank" rel="noopener">View the slides (PDF)</a>
          </div>
          <p className="fine">A prototype for the NASA Space Apps Challenge. Scores are estimates from orbital data, not engineering ratings.</p>
        </div>
        <HeroArt />
      </section>

      <section id="product" className="block">
        <h2>What COMPASS is</h2>
        <div className="cols">
          <div className="prose-l">
            <p>On Mars, help is minutes away. A message to Earth takes between 4 and 24 minutes to arrive, so a person on foot has to decide on the spot: is it safe to go there, and can I make it back?</p>
            <p>The facts that answer that question already exist. Rovers and orbiters have measured the slopes, the ground, the temperature and the light. But they sit in separate tools, made for scientists on Earth. COMPASS puts four things on one screen.</p>
          </div>
          <dl className="four">
            <div><dt>Terrain</dt><dd>Slope, roughness, dust and geology under every step, turned into an estimated safety.</dd></div>
            <div><dt>Environment</dt><dd>Sun and shadow for the time you choose, and how warm it will be.</dd></div>
            <div><dt>Supplies</dt><dd>Oxygen, water, food and battery against what each route needs, and the point of no return.</dd></div>
            <div><dt>Science</dt><dd>Points of interest and terrain that resembles where Perseverance chose to sample.</dd></div>
          </dl>
        </div>
        <p className="after">You choose a start, a destination, a time window and a purpose. COMPASS answers with up to three routes. Every route has an estimated safety that must reach 65 out of 100 to qualify, the best time to leave, and the time you will be back.</p>
      </section>

      <section className="block alt">
        <h2>How it works</h2>
        <ol className="flow">
          <li><b>Gather</b><span>Elevation, imagery, thermal images, the rover's traverse, weather and geology are fetched from NASA and USGS and cut to a 60 m grid of Jezero, about 30 by 30 km.</span><a href="#/docs/DATA_REPORT">Data sources</a></li>
          <li><b>Estimate</b><span>A safety estimator and a sampling-likeness estimator, trained on where Perseverance really drove and sampled, rate every cell. A hard slope limit overrides them.</span><a href="#/docs/PRINCIPLES">The models</a></li>
          <li><b>Plan</b><span>A* search finds three different routes, then each is scored for terrain, daylight and temperature, and supplies, with the best start time in your window.</span><a href="#/docs/PRINCIPLES">Route scoring</a></li>
          <li><b>Explain</b><span>Every score opens into its parts, with its formula and its inputs. Upload your own data and the models retrain.</span><a href="#/docs/USER_GUIDE">User guide</a></li>
        </ol>
      </section>

      <section id="use" className="block">
        <h2>How to use it</h2>
        <div className="cols use">
          <ol className="steps">
            <li><b>Set the trip.</b> Click the map for a start and a destination, or type coordinates.</li>
            <li><b>Set the window.</b> Write the earliest start and latest return in local Mars time, like <code>Sol 2039 · 08:00</code>.</li>
            <li><b>Choose purpose, crew and mode.</b> Walk, rover, or both. Slide toward science to favour interesting terrain.</li>
            <li><b>Press Find routes.</b> Routes with an estimated safety of 65 or more come first. The others are greyed, with the reason.</li>
            <li><b>Compare, then confirm.</b> Open Explain on any route. Confirm one to walk it in a simulation that tracks oxygen and your way home.</li>
          </ol>
          <figure className="mock" aria-label="Layout of the planner">
            <svg viewBox="0 0 420 270" role="img" aria-label="Schematic of the planner: layers on the left, map in the centre, routes on the right, trip form along the bottom">
              <rect x="1" y="1" width="418" height="268" rx="10" className="m-frame" />
              <rect x="10" y="10" width="400" height="22" rx="6" className="m-bar" /><rect x="18" y="17" width="60" height="8" rx="3" className="m-ink" /><rect x="90" y="17" width="40" height="8" rx="3" className="m-dim" /><rect x="140" y="17" width="40" height="8" rx="3" className="m-dim" /><rect x="190" y="17" width="55" height="8" rx="3" className="m-dim" />
              <rect x="10" y="40" width="72" height="170" rx="6" className="m-pane" />
              {[52, 70, 88, 106, 124].map((y) => <g key={y}><rect x="18" y={y} width="34" height="7" rx="3" className="m-dim" /><rect x="60" y={y} width="14" height="7" rx="3.5" className="m-teal" /></g>)}
              <rect x="18" y="150" width="56" height="52" rx="5" className="m-bar" />
              <rect x="90" y="40" width="226" height="170" rx="6" className="m-map" />
              <path d="M106 190C140 170 160 175 190 140S250 100 290 62" className="m-route a" /><path d="M106 190C150 192 175 150 215 138S262 90 290 62" className="m-route b" /><path d="M106 190C130 160 175 120 290 62" className="m-route c" />
              <circle cx="106" cy="190" r="5" className="m-pin s" /><circle cx="290" cy="62" r="5" className="m-pin d" />
              <rect x="324" y="40" width="86" height="170" rx="6" className="m-pane" />
              {[50, 98, 146].map((y, i) => <g key={y}><rect x="332" y={y} width="70" height="42" rx="5" className={`m-card ${["a", "b", "c"][i]}`} /><rect x="338" y={y + 8} width="30" height="6" rx="3" className="m-ink" /><rect x="338" y={y + 22} width="54" height="5" rx="2.5" className="m-dim" /><rect x="338" y={y + 31} width="40" height="5" rx="2.5" className="m-dim" /></g>)}
              <rect x="10" y="218" width="400" height="42" rx="6" className="m-pane" />
              {[18, 78, 138, 198, 258].map((x) => <rect key={x} x={x} y="226" width="52" height="10" rx="4" className="m-field" />)}
              <rect x="338" y="226" width="64" height="26" rx="5" className="m-cta" />
            </svg>
            <figcaption>Layers on the left, the map in the middle, routes on the right, and the trip form along the bottom.</figcaption>
          </figure>
        </div>
        <p className="after">Add your own data on the Upload page: rover traverse logs, sample results, weather, or surface-change files. Press Train model and the scores update. <a href="#/docs/USER_GUIDE">The user guide</a> covers every control.</p>
      </section>

      <section id="examples" className="block alt">
        <h2>Sample scenarios</h2>
        <p className="sub">Four real runs of the planner from the landing site, for two crew on a round trip with science sampling, on 14 November 2026 with model v1. Your numbers will shift a little with the sol.</p>
        <div className="scen">
          {SCENARIOS.map((s) => (
            <article key={s.title} className={`sc ${s.tone}`}>
              <div className="sc-top"><h3>{s.title}</h3><span className="trip">{s.trip}</span></div>
              <p>{s.result}</p>
              <div className="sc-foot"><p className="lesson">{s.lesson}</p><div className="sc-scores" aria-label="Estimated safety of routes A, B and C">
                {["A", "B", "C"].map((k, i) => <span key={k}><i>{k}</i>{s.scores[i]}</span>)}</div></div>
            </article>
          ))}
        </div>
      </section>

      <section id="science" className="block">
        <h2>The science and the maths</h2>
        <p className="sub">Nothing is hidden. Three of the formulas, in short. The full derivations are in the principles document.</p>
        <div className="formulas">
          <div><h3>Slope from orbit</h3><pre>slope = arctan √( (dz/dx)² + (dz/dy)² )</pre><p>From a 20 m terrain model, corrected for map stretch, then the steepest 10% of each 60 m cell. Anything over 25° is blocked.</p></div>
          <div><h3>Sun and shadow</h3><pre>sin(elev) = sin φ sin δ + cos φ cos δ cos H</pre><p>Mars24 solar geometry gives the sun for your start time. Cast shadows are traced across the terrain. Daylight scores the walk.</p></div>
          <div><h3>The estimated-safety blend</h3><pre>0.6 · terrain + 0.2 · daylight + 0.2 · supplies</pre><p>A route needs an estimate of 65 overall and 50 on each part. Terrain counts the average and the weakest stretch.</p></div>
        </div>
        <p className="after">The two trained estimators are a random forest for safety and gradient boosting for sampling-likeness, tested on whole held-out map blocks (AUC 0.976 and 0.945). Those scores measure agreement with their own labels, which for safety are mostly slope, roughness and dust rules plus the real Perseverance traverse, so the result is an estimate, not a validated rating. As an independent check, lower estimated safety tracks the tilt Perseverance measured at 708 stops (ρ = 0.76), though plain slope alone does slightly better (0.78). <a href="#/docs/PRINCIPLES">Read the full principles</a></p>
      </section>

      <section id="data" className="block alt">
        <h2>Where the data comes from</h2>
        <p className="sub">Ten datasets from NASA missions and partners. Each row says what it feeds.</p>
        <div className="drows">
          {DATA.map((d) => (<div key={d.src} className="drow"><b>{d.src}</b><span>{d.what}</span><em>{d.feeds}</em></div>))}
        </div>
        <p className="after">What we could not get: the CRISM carbonate and olivine maps in a usable form, a rock-abundance map, live Jezero weather, and radio coverage. They are not faked. <a href="#/docs/DATA_REPORT">The data report</a> shows how every source was tested, and <a href="#/docs/DATA_FILES">the data files</a> document the fields.</p>
      </section>

      <section id="decisions" className="block">
        <h2>Decisions we made</h2>
        <div className="dec">
          {DECISIONS.map((d) => (<div key={d.t}><h3>{d.t}</h3><p>{d.d}</p></div>))}
        </div>
        <p className="after"><a href="#/docs/HOW_WE_BUILT_IT">How it was built</a> covers the build in order, where we changed our own plan and why, the problems we hit, and what was and was not verified.</p>
      </section>

      <section id="mission" className="block alt">
        <h2>The mission, and what comes after</h2>
        <div className="cols">
          <div className="prose-l">
            <p>One day soon, a person will step onto Mars and look out at a landscape no human has ever walked. We believe the answer to "is it safe to go there, and can I make it back?" should already be in their hands.</p>
            <p>Each past surface mission shows the same pattern: the data existed, but it was not joined into one decision for the people on the ground. COMPASS is built to close those gaps, and to be honest about the ones it has not closed yet.</p>
          </div>
          <div className="lessons">
            {LESSONS.map((l) => (
              <div key={l.who} className="lesson-row">
                <b>{l.who}</b><p>{l.gap}</p><p className="ans">{l.answer}</p>
                <span className={`st ${l.status.replace(" ", "").toLowerCase()}`}>{l.status}{l.note ? `: ${l.note}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="fine wide">Historical notes come from the project's mission concept and should be checked against NASA records before they are cited. <a href="#/docs/MISSION_CONCEPT">The mission concept</a> gives the status of every promise.</p>

        <h3 className="rm-t">Serving explorers into the future</h3>
        <ol className="roadmap">
          {ROADMAP.map((r) => (<li key={r.what}><small>{r.when}</small><b>{r.what}</b><p>{r.d}</p></li>))}
        </ol>
        <div className="cols future">
          <div><h3>Decisions made where they are needed</h3><p>With a signal delay, the crew decides locally. COMPASS shows every number and runs on local hardware, so the answer does not wait for Earth.</p></div>
          <div><h3>Better with every walk</h3><p>Traverse logs, sample results, weather and surface-change files retrain the models, so each walk makes the next plan more accurate.</p></div>
          <div><h3>The same engine, new worlds</h3><p>Slope, supplies and daylight work the same on the Moon, in polar expeditions, desert teams and search and rescue.</p></div>
        </div>
        <p className="fine wide">To get there it still needs flight-grade validation, rock-hazard maps, radio coverage data, and tests with people on foot. The roadmap is a plan, not a promise.</p>
      </section>

      <section id="docs" className="block">
        <h2>The documents</h2>
        <div className="doclist">
          {DOCS.map((d) => (<a key={d.id} href={`#/docs/${d.id}`}><b>{d.title}</b><span>{d.blurb}</span></a>))}
        </div>
      </section>

      <footer className="lfoot">
        <div><a className="lbrand" href="#/"><Mark />Compass</a><p>Combined Orbital Mars Pathfinding and Astronaut Safety System. A prototype for the NASA Space Apps Challenge.</p></div>
        <p className="credits">Data: NASA Mars Trek (MRO CTX and HiRISE, Mars Odyssey THEMIS, OMEGA and CRISM, Mastcam-Z), NASA/JPL MMGIS, NASA Mars 2020 raw images, NASA PDS Atmospheres Node (MEDA), USGS Astrogeology (SIM 3464, Sun and Stack 2020), Herd et al. 2025 (PNAS).</p>
        <a className="lbtn primary" href="#/app">Open the planner</a>
      </footer>
    </div>
  );
}
