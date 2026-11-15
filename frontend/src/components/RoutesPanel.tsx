import { useState } from "react";
import type { Route, Weather } from "../types";
import { fmtHM, fmtSol } from "../lib/mars";
import { MIN_SAFETY, RESERVE } from "../lib/route";
import type { MlInfo } from "../lib/ml";

interface Props {
  routes: Route[]; selected: string | null; setSelected: (id: string) => void; error?: string; planned: boolean; round: boolean; busy: boolean;
  onConfirm: () => void; onAbort: () => void; ml: MlInfo | null; weather: Weather;
}

const band = (s: number) => (s >= 80 ? "var(--teal)" : s >= MIN_SAFETY ? "#e2d65a" : s >= 50 ? "var(--caution)" : "var(--coral)");
const hhmm = (st: { hour: number } | null) => (st ? fmtHM(st.hour) : "—");

function Gauge({ v }: { v: number }) {
  return (
    <div className="gauge" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label="Estimated safety" title="Estimated safety, 0 to 100. The white tick marks the planning minimum of 65.">
      <i style={{ width: `${Math.max(2, Math.min(100, v))}%`, ["--gc" as any]: band(v) }} /><u />
    </div>
  );
}

function Profile({ r }: { r: Route }) {
  const p = r.profile; if (p.length < 2) return null;
  const zs = p.map((x) => x.z), lo = Math.min(...zs), hi = Math.max(...zs), L = p[p.length - 1].d || 1;
  const W = 250, H = 64, y = (z: number) => H - 8 - ((z - lo) / (hi - lo || 1)) * (H - 16);
  return (
    <div className="profile">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Elevation from ${lo} to ${hi} metres`}>
        <polyline fill="none" stroke={r.color} strokeWidth="2" points={p.map((q) => `${(q.d / L) * W},${y(q.z)}`).join(" ")} />
        {p.map((q, i) => i % 2 === 0 && <rect key={i} x={(q.d / L) * W} y={H - 4} width={Math.max(1.2, (W / p.length) * 2)} height={4} fill={q.s > 18 ? "#ef5b52" : q.s > 10 ? "#f5a344" : "#2fc4a2"} />)}
        {r.pnr && <path d={`M${(r.profile[r.pnr.idx].d / L) * W} 3 l5 9 h-10 z`} fill="#f5a344" />}
      </svg>
      <div className="mut small">Elevation {lo} to {hi} m along the route. The strip under the line shows slope: green gentle, amber steep, red very steep.</div>
    </div>
  );
}

export default function RoutesPanel({ routes, selected, setSelected, error, planned, round, busy, onConfirm, onAbort, ml, weather }: Props) {
  const [tab, setTab] = useState<"routes" | "explain">("routes");
  const good = routes.filter((r) => r.ok), bad = routes.filter((r) => !r.ok);
  const sel = routes.find((r) => r.id === selected);
  const explain = (id: string) => { setSelected(id); setTab("explain"); };
  return (
    <aside className="right">
      <div className="rhead">
        <span className="ttl">ROUTES</span>
        <div className="seg small2" role="tablist">
          <button className={tab === "routes" ? "on" : ""} onClick={() => setTab("routes")}>Options</button>
          <button className={tab === "explain" ? "on" : ""} onClick={() => setTab("explain")} disabled={!sel} title={sel ? "" : "Pick a route first"}>Explain</button>
        </div>
      </div>

      {tab === "routes" && <>
        <div className="mut">Options with estimated safety ≥ {MIN_SAFETY}</div>
        <div className="keyline" title="Scores are estimates from orbital data. Choose Explain on a route to see how each is made.">Scores 0 to 100 · times in Mars local time</div>
        {busy && <div className="mut">Planning routes…</div>}
        {error && <div className="err">{error}</div>}
        {!planned && !error && !busy && <div className="mut">Pick a start and destination on the map, then choose Find routes.</div>}
        {planned && !error && good.length === 0 && <div className="err">No route reaches an estimated safety of {MIN_SAFETY} with these settings. The routes below show what held each one back.</div>}
        {good.map((r) => <Card key={r.id} r={r} on={r.id === selected} onClick={() => setSelected(r.id)} onExplain={() => explain(r.id)} round={round} />)}
        {bad.length > 0 && (
          <div className="below">
            <div className="sec">Below {MIN_SAFETY} (greyed) + reason</div>
            {bad.map((r) => <Card key={r.id} r={r} on={r.id === selected} onClick={() => setSelected(r.id)} onExplain={() => explain(r.id)} round={round} grey />)}
          </div>
        )}
        {sel && (
          <div className={`callout ${sel.pnr ? "warn" : ""}`}>
            <div className="clamp2"><b>{sel.pnr ? "Point of no return" : "Way home"}</b> {sel.pnrNote}</div>
            {sel.sites.length > 0 && <div className="mut clamp1">Stops: {sel.sites.map((s, i) => `${i + 1}. ${s.name}`).join(", ")}</div>}
          </div>
        )}
      </>}

      {tab === "explain" && sel && <Explain r={sel} round={round} ml={ml} weather={weather} />}

      <div className="actions">
        <button className="primary" disabled={!sel || !sel.ok} onClick={onConfirm} title={sel && !sel.ok ? "This route is below the planning minimum of 65 estimated safety" : ""}>Confirm route</button>
        <button className="dashed" onClick={onAbort}>Abort</button>
      </div>
    </aside>
  );
}

function Card({ r, on, onClick, onExplain, round, grey }: { r: Route; on: boolean; onClick: () => void; onExplain: () => void; round: boolean; grey?: boolean }) {
  const title = r.name.replace(/^[A-C] · /, "");
  return (
    <div className={`card ${on ? "sel" : ""} ${grey ? "grey" : ""}`} style={{ ["--rcol" as any]: r.color }} onClick={onClick} role="button" tabIndex={0} aria-label={`Route ${r.name}, estimated safety ${r.safety.toFixed(0)} out of 100`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
      <div className="chead">
        <span className="badge">{r.id}</span><b>{title}</b>
        <span className="sfl" title="Estimated safety, 0 to 100. An estimate from orbital data, not a probability or a rating.">Est. safety</span><span className="big" style={{ color: band(r.safety) }}>{r.safety.toFixed(0)}</span>
      </div>
      <Gauge v={r.safety} />
      <div className="stat2">
        <div title="How close the route passes to places worth sampling (0 to 100)">
          <span className="sl">Science</span><b className="num">{r.science.toFixed(0)}</b><i className="mbar"><u style={{ width: `${r.science}%`, background: "#8b5cf6" }} /></i>
        </div>
        <div title="How much of the route crosses delta and layered rock and passes near hydrated minerals (0 to 100)">
          <span className="sl">Resources</span><b className="num">{r.resources.toFixed(0)}</b><i className="mbar"><u style={{ width: `${r.resources}%`, background: "#4aa8ff" }} /></i>
        </div>
      </div>
      <div className="tl" title={`${fmtSol(r.depart)}. Times are Mars local solar time at Jezero.`}>
        <div><small>Depart</small><b className="num">{hhmm(r.depart)}</b></div><span className="tll" />
        <div><small>Arrive</small><b className="num">{hhmm(r.arrive)}</b></div>
        {round && <><span className="tll" /><div><small>Back</small><b className="num">{hhmm(r.back)}</b></div></>}
      </div>
      <div className="cfoot">
        {r.shortOn.length ? <span className="pill warn">Supplies ⚠ short on {r.shortOn.join(", ")}</span> : <span className="pill">Supplies ✓</span>}
        <button className="xlink" onClick={(e) => { e.stopPropagation(); onExplain(); }} aria-label={`Explain route ${r.id}`}>Explain</button>
      </div>
      {grey && <div className="why">Reason: {r.reasons.join("; ")}</div>}
    </div>
  );
}

function Row({ label, weight, value, text }: { label: string; weight: string; value: number; text: string }) {
  return (
    <div className="xrow">
      <div className="xtop"><span>{label} <span className="mut">· {weight}</span></span><b className="num">{value.toFixed(0)}</b></div>
      <div className="gauge thin"><i style={{ width: `${Math.max(2, Math.min(100, value))}%`, ["--gc" as any]: band(value) }} /></div>
      <div className="mut small">{text}</div>
    </div>
  );
}

// One topic per section: a one-line summary always shows, the detail opens on click (one at a time, so the panel never scrolls).
function Sec({ id, open, setOpen, title, summary, tone, children }: { id: string; open: string; setOpen: (s: string) => void; title: string; summary: string; tone?: string; children: React.ReactNode }) {
  const on = open === id;
  return (
    <div className={`acc ${on ? "on" : ""}`}>
      <button className="acch" onClick={() => setOpen(on ? "" : id)} aria-expanded={on}>
        <span className="accT">{title}</span><span className={`accS ${tone ?? ""}`}>{summary}</span><span className="accC" aria-hidden="true">{on ? "–" : "+"}</span>
      </button>
      {on && <div className="accB">{children}</div>}
    </div>
  );
}

function Explain({ r, round, ml, weather }: { r: Route; round: boolean; ml: MlInfo | null; weather: Weather }) {
  const [open, setOpen] = useState("safety");
  const w = weather.sols;
  const model = ml ? `safety estimator v${ml.version} (mostly rule-based labels plus the real traverse)` : "built-in estimate (model service off)";
  const short = r.supplies.filter((s) => s.have < s.need).map((s) => s.name.toLowerCase());
  const R = Math.round((RESERVE - 1) * 100);
  return (
    <div className="explain">
      <div className="xhead"><span className="chip2" style={{ background: r.color }} /> <b>{r.name}</b><span className="mut">{(r.lengthM / 1000).toFixed(1)} km one way</span></div>

      <Sec id="safety" open={open} setOpen={setOpen} title="Est. safety" summary={`${r.safety.toFixed(0)} (needs ${MIN_SAFETY})`} tone={r.safety >= MIN_SAFETY ? "okTxt" : "warnTxt"}>
        <div className="formula num" title="Estimated safety = 60% terrain + 20% daylight and temperature + 20% supplies margin">0.6×{r.terrain.toFixed(0)} + 0.2×{r.env.toFixed(0)} + 0.2×{r.margin.toFixed(0)} = {r.safety.toFixed(0)}</div>
        <Row label="Terrain" weight="60%" value={r.terrain} text={`Slope, roughness, dust, geology, scored by the ${model}: 60% average (${r.meanSafety.toFixed(0)}) + 40% weakest stretch (${r.worstStretch.toFixed(0)}).`} />
        <Row label="Daylight and temperature" weight="20%" value={r.env} text={`Share of the walk in daylight and how warm (rover temperatures, sols ${w[0]}–${w[w.length - 1]}). Best start in your window.`} />
        <Row label="Supplies margin" weight="20%" value={r.margin} text={`Your supplies against the trip's needs, after a ${R}% reserve.`} />
      </Sec>

      <Sec id="science" open={open} setOpen={setOpen} title="Science" summary={`${r.science.toFixed(0)} of 100`}>
        <div className="mut small">How close the route passes to terrain worth sampling. {ml ? `Uses the sampling-likeness estimator v${ml.version}, trained on ${ml.samples ?? 24} real Perseverance sample sites, plus points of interest.` : "Uses points of interest and geologic contacts."}</div>
        <div className="small">{r.sites.length ? `Passes ${r.sites.length} point${r.sites.length > 1 ? "s" : ""} of interest: ${r.sites.map((s) => s.name).join(", ")}.` : "Passes no listed points of interest."} Average sampling-likeness along the path: {(r.meanSci * 100).toFixed(0)}%.</div>
      </Sec>

      <Sec id="res" open={open} setOpen={setOpen} title="Resources" summary={`${r.resources.toFixed(0)} of 100`}>
        <div className="mut small">Share of the route over the river-delta and layered-rock units, where water-related minerals are most likely, plus a bonus near orbital detections of hydrated minerals.</div>
        <div className="small">{(r.fracRes * 100).toFixed(0)}% of the route crosses those units. Hydrated-mineral detection within 600 m: {r.hydrous ? "yes" : "no"}.</div>
      </Sec>

      <Sec id="times" open={open} setOpen={setOpen} title="Times" summary={`${hhmm(r.depart)} to ${hhmm(round ? r.back : r.arrive)}`}>
        <div className="small">Depart {fmtSol(r.depart)}, arrive {hhmm(r.arrive)}{round && r.back ? `, back ${hhmm(r.back)}` : ""}. All times are Mars local solar time at Jezero.</div>
        <div className="mut small">Walking takes {r.oneWayH.toFixed(1)} h one way{r.stopsH ? ` plus ${r.stopsH.toFixed(1)} h at science stops` : ""}. Durations are Earth hours (a Mars hour is about 2.7% longer). The start is the best time inside your window for daylight and warmth.</div>
      </Sec>

      <Sec id="sup" open={open} setOpen={setOpen} title="Supplies" summary={short.length ? `short on ${short.join(", ")}` : "enough"} tone={short.length ? "warnTxt" : "okTxt"}>
        <table className="xtab"><thead><tr><td className="mut">Need</td><td /><td className="mut">You have</td><td /></tr></thead><tbody>
          {r.supplies.map((s) => (
            <tr key={s.name} className={s.have < s.need ? "short" : ""}>
              <td>{s.name}</td><td className="num">{s.need.toFixed(s.unit === "meals" || !s.unit ? 0 : 1)} {s.unit}</td><td className="num">{s.have} {s.unit}</td><td>{s.have >= s.need ? "✓" : "short"}</td>
            </tr>
          ))}
        </tbody></table>
        <div className="mut small">Needs include the {R}% reserve. Edit your supplies in the left panel.</div>
      </Sec>

      <Sec id="pnr" open={open} setOpen={setOpen} title="Point of no return" summary={r.pnr ? `at ${r.pnr.km.toFixed(1)} km` : "none"} tone={r.pnr ? "warnTxt" : "okTxt"}>
        <div className={`small ${r.pnr ? "warnTxt" : ""}`}>{r.pnrNote}</div>
        <div className="mut small">The last point from which the walk back still fits inside the limiting supply, after the reserve.</div>
      </Sec>

      <Sec id="elev" open={open} setOpen={setOpen} title="Elevation" summary={`${Math.min(...r.profile.map((q) => q.z))} to ${Math.max(...r.profile.map((q) => q.z))} m`}>
        <Profile r={r} />
      </Sec>
    </div>
  );
}
