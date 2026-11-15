import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppData, Inventory, LL, LogEntry, Route, Trip, Upload } from "./types";
import { loadAll } from "./lib/grid";
import { applyML, getGrids, getStatus, mlInfo, type MlGrids, type MlStatus } from "./lib/ml";
import { CATEGORIES, OVERLAYS } from "./lib/layers";
import { defaultInventory, planRoutes, MIN_SAFETY, type PlanResult } from "./lib/route";
import { fmtHM, fmtSol, missionSol, solTimeToMs, sunAt } from "./lib/mars";
import TopBar from "./components/TopBar";
import LayersPanel from "./components/LayersPanel";
import MapView, { type Alert, type LayerState } from "./components/MapView";
import RoutesPanel from "./components/RoutesPanel";
import TripForm from "./components/TripForm";
import WalkPanel from "./components/WalkPanel";
import UploadPage from "./components/UploadPage";
import MissionLog from "./components/MissionLog";
import Landing from "./components/Landing";
import DocPage from "./components/DocPage";

const LOG_KEY = "compass.log.v1";
const readLog = (): LogEntry[] => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; } };
const writeLog = (l: LogEntry[]) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(-200))); } catch { /* storage unavailable */ } };

const initLayers = (): LayerState => ({
  on: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
  sub: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.subs[0]?.id ?? ""])),
  ov: Object.fromEntries(OVERLAYS.map((o) => [o.id, o.defaultOn])),
});

function defaultTrip(data: AppData, now: number): Trip {
  const nowSol = missionSol(now), ltst = sunAt(now).ltst;
  const sol = ltst < 8 ? nowSol : nowSol + 1;
  // default demo trip: landing site -> the farthest Mastcam-Z panorama site within ~3 km
  const km = (la: number, lo: number) => Math.hypot((lo - 77.4509) * 56.2, (la - 18.4446) * 59.27);
  const cands = data.pois.filter((p) => p.kind === "panorama" && km(p.lat, p.lon) > 0.5 && km(p.lat, p.lon) < 3).sort((a, b) => km(b.lat, b.lon) - km(a.lat, a.lon));
  const fan = cands[0] ?? data.pois.find((p) => p.kind !== "hazard");
  return {
    start: [18.4446, 77.4509], dest: fan ? [fan.lat, fan.lon] : null,
    earliest: { sol, hour: 8 }, latest: { sol, hour: 17 },
    purpose: "Science sampling", round: true, crew: 2, mode: "Walk", priority: 0.5,
  };
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const [hash, setHash] = useState(location.hash);
  const isPlanner = hash === "#/app" || hash === "#/upload";
  const [layers, setLayers] = useState<LayerState>(initLayers);
  const [inv, setInv] = useState<Inventory>(defaultInventory);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [picking, setPicking] = useState<"start" | "dest" | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Route | null>(null);
  const [mode, setMode] = useState<"plan" | "walk">("plan");
  const [walkIdx, setWalkIdx] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [log, setLog] = useState<LogEntry[]>(readLog);
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mlStatus, setMlStatus] = useState<MlStatus | null>(null);
  const [mlGrids, setMlGrids] = useState<MlGrids | null>(null);

  // ML backend: status + the model's safety/discovery grids. If the backend is off, the heuristic grid stays.
  const refreshML = useCallback(async () => {
    const s = await getStatus();
    setMlStatus(s);
    if (s?.ready) { const g = await getGrids(); if (g) setMlGrids((p) => (p && p.version === g.version ? p : g)); }
    return s;
  }, []);
  useEffect(() => { if (isPlanner) refreshML(); }, [refreshML, isPlanner]);
  const view = useMemo(() => (data && mlGrids ? { ...data, grid: applyML(data.grid, mlGrids) } : data), [data, mlGrids]);

  useEffect(() => {
    if (!isPlanner || data) return;
    loadAll().then((d) => { setData(d); setTrip(defaultTrip(d, Date.now())); }).catch((e) => setErr(String(e)));
  }, [isPlanner, data]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { const h = () => setHash(location.hash); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);

  const addLog = useCallback((msg: string) => setLog((l) => { const n = [...l, { t: new Date().toLocaleString(), msg }]; writeLog(n); return n; }), []);

  const resUnits = useMemo(() => new Set((data?.geology.units ?? []).filter((u) => /fan|etched/i.test(u.name)).map((u) => u.id)), [data]);

  const find = useCallback((override?: Trip) => {
    const tr = override ?? trip;
    if (!view || !tr) return;
    setBusy(true); // let the browser paint "Planning…" before the (synchronous) search runs
    setTimeout(() => {
      const res = planRoutes(view.grid, view.pois, tr, inv, view.weather, resUnits);
      setPlan(res); setConfirmed(null); setMode("plan"); setBusy(false);
      const best = res.routes.find((r) => r.ok) ?? res.routes[0];
      setSelected(best ? best.id : null);
      if (!res.error) addLog(`Planned ${res.routes.length} routes; ${res.routes.filter((r) => r.ok).length} meet ${MIN_SAFETY}%.`);
    }, 30);
  }, [view, trip, inv, resUnits, addLog]);

  // when a new model arrives, re-plan so the routes use its scores
  useEffect(() => { if (mlGrids && trip && plan) find(); }, [mlGrids?.version]); // eslint-disable-line

  // run once so the screen is not empty on first load
  useEffect(() => { if (data && trip && !plan) find(); }, [data, trip]); // eslint-disable-line

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const onMapClick = (ll: LL) => {
    if (!trip) return;
    const key = picking ?? (!trip.start ? "start" : "dest");
    setTrip({ ...trip, [key]: ll });
    setPicking(key === "start" && !trip.dest ? "dest" : null);
  };

  const sunPlan = useMemo(() => { if (!trip) return { az: 135, el: 30 }; const s = sunAt(solTimeToMs(trip.earliest)); return { az: s.az, el: s.elev }; }, [trip?.earliest.sol, trip?.earliest.hour]); // eslint-disable-line

  const routes = plan?.routes ?? [];
  const sel = routes.find((r) => r.id === selected) ?? null;

  const alerts: Alert[] = useMemo(() => {
    if (!data || !trip) return [];
    const a: Alert[] = [];
    const s0 = sunAt(solTimeToMs(trip.earliest));
    if (s0.elev < 0) a.push({ level: "warn", text: `Planned start (${fmtSol(trip.earliest)}) is in darkness. Sunrise is about ${fmtHM(s0.sunrise)} LTST.` });
    const target = confirmed ?? sel;
    if (target) {
      if (!target.ok) a.push({ level: "bad", text: `Route ${target.id} does not qualify (needs an estimated safety of ${MIN_SAFETY}): ${target.reasons.join("; ")}.` });
      const end = target.back ?? target.arrive;
      if (end && sunAt(solTimeToMs(end)).elev < 0) a.push({ level: "warn", text: `Route ${target.id} finishes after dark (${fmtSol(end)}).` });
      if (target.shortOn.length) a.push({ level: "warn", text: `Short on ${target.shortOn.join(", ")} for route ${target.id}.` });
    }
    const t = data.weather.diurnal.filter((d) => d.tempC != null).map((d) => d.tempC as number);
    a.push({ level: "info", text: `Air temperature ${Math.min(...t).toFixed(0)} to ${Math.max(...t).toFixed(0)} °C over a sol (MEDA, sols ${data.weather.sols[0]}–${data.weather.sols[data.weather.sols.length - 1]}).` });
    const wp = mlStatus?.report?.weather.penalty ?? 0;
    if (wp > 0) a.unshift({ level: "warn", text: `Weather penalty: estimated safety lowered by ${wp} points (uploaded dust or wind data).` });
    a.push({ level: "info", text: `Weather data is not live (latest published sol ${data.weather.latestPublishedSol}). Dust, radiation and comms are not modelled.` });
    return a;
  }, [data, trip, sel, confirmed, mlStatus]);

  const confirm = () => {
    if (!sel || !sel.ok) return;
    setConfirmed(sel); setMode("walk"); setWalkIdx(0);
    addLog(`Confirmed route ${sel.name}: ${(sel.lengthM / 1000).toFixed(2)} km, estimated safety ${sel.safety.toFixed(0)}, depart ${fmtSol(sel.depart)}.`);
  };
  const abort = () => { setPlan(null); setConfirmed(null); setSelected(null); setMode("plan"); addLog("Route planning aborted."); };

  // landing page and documents come first; the planner loads its data on demand
  if (hash.startsWith("#/docs/")) return <DocPage id={hash.slice(7)} />;
  if (!isPlanner) return <Landing />;

  if (err) return <div className="boot err">Could not load data: {err}</div>;
  if (!data || !trip) return <div className="boot">Loading COMPASS data…</div>;

  if (hash === "#/upload") {
    return <UploadPage uploads={uploads} setUploads={setUploads} back={() => { location.hash = "#/app"; }} ml={mlStatus} refreshML={refreshML} />;
  }

  return (
    <div className="app">
      <TopBar now={now} mode={mode} setMode={setMode} walkEnabled={!!confirmed} openLog={() => setShowLog(true)} />
      <div className="mid">
        <LayersPanel layers={layers} setLayers={setLayers} inv={inv} setInv={setInv} toUpload={() => { location.hash = "#/upload"; }} needs={(confirmed ?? sel)?.supplies} routeName={(confirmed ?? sel)?.name} />
        <MapView data={view ?? data} ml={mlInfo(mlStatus)} layers={layers} routes={routes} selected={selected} confirmed={mode === "walk" ? confirmed : null}
          start={trip.start} dest={trip.dest} sun={sunPlan} uploads={uploads} walkerIdx={mode === "walk" && confirmed ? walkIdx : null}
          alerts={alerts} weatherNote={`Not live: last published MEDA sol ${data.weather.latestPublishedSol}`} onMapClick={onMapClick} onSelectRoute={setSelected} picking={picking} />
        {mode === "walk" && confirmed
          ? <WalkPanel route={confirmed} idx={walkIdx} setIdx={setWalkIdx} inv={inv} trip={trip} onEnd={() => { setMode("plan"); addLog(`Walk ended on route ${confirmed.id}.`); }} />
          : <RoutesPanel routes={routes} selected={selected} setSelected={setSelected} error={plan?.error} planned={!!plan} round={trip.round} busy={busy} ml={mlInfo(mlStatus)} weather={data.weather} onConfirm={confirm} onAbort={abort} />}
      </div>
      <TripForm trip={trip} setTrip={setTrip} picking={picking} setPicking={setPicking} onFind={(t) => find(t)} />
      {showLog && <MissionLog log={log} onClose={() => setShowLog(false)} onClear={() => { setLog([]); writeLog([]); }} />}
    </div>
  );
}
