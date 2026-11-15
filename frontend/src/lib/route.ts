// Deterministic route planner: grid + A* + weighted scores. No machine learning.
import type { Grid, Inventory, LL, Poi, Route, SolTime, Trip, Weather } from "../types";
import { cellOf, inGrid, llOfCell } from "./grid";
import { addRealHours, solTimeToMs, msToSolTime, sunAt } from "./mars";

// ---- assumptions (all editable, shown in the UI "Assumptions" note) ----
export const MODES: Record<string, { kmh: number; drain: number }> = {
  Walk: { kmh: 2.0, drain: 6 },            // EVA walking pace in a suit; battery %/h
  Rover: { kmh: 8.0, drain: 10 },
  "Rover + walk": { kmh: 5.0, drain: 8 },
};
export const RESERVE = 1.25;               // 25 % consumables reserve
export const WATER_L_PER_H = 0.3;          // per crew member
export const HOURS_PER_MEAL = 6;
export const STOP_H_PER_SITE = 0.4;        // time at each science stop (science sampling only)
export const MIN_SAFETY = 65;

const speedFactor = (slopeDeg: number) => Math.max(0.3, 1 - slopeDeg / 35);

// ---------- A* ----------
class Heap {
  // typed binary min-heap with lazy deletion (duplicates allowed); grows on demand
  ids = new Int32Array(1 << 16); keys = new Float32Array(1 << 16); size = 0;
  push(id: number, k: number) {
    if (this.size === this.ids.length) {
      const ni = new Int32Array(this.size * 2), nk = new Float32Array(this.size * 2); ni.set(this.ids); nk.set(this.keys); this.ids = ni; this.keys = nk;
    }
    let i = this.size++; const ids = this.ids, keys = this.keys;
    while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= k) break; ids[i] = ids[p]; keys[i] = keys[p]; i = p; }
    ids[i] = id; keys[i] = k;
  }
  pop(): number {
    const ids = this.ids, keys = this.keys, top = ids[0], n = --this.size;
    if (n > 0) {
      const id = ids[n], k = keys[n]; let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        ids[i] = ids[c]; keys[i] = keys[c]; i = c;
      }
      ids[i] = id; keys[i] = k;
    }
    return top;
  }
}

function astar(g: Grid, s: number, t: number, k: number, w: number, minS: number, avoid?: Set<number>): number[] | null {
  const { nx, ny, cell } = g, N = nx * ny;
  const G = new Float32Array(N).fill(Infinity), P = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const tr = Math.floor(t / nx), tc = t % nx;
  const hw = cell * (1 - w);
  const h = (i: number) => { const a = Math.floor(i / nx) - tr, b = (i % nx) - tc; return Math.sqrt(a * a + b * b) * hw; };
  const heap = new Heap(); G[s] = 0; heap.push(s, h(s));
  while (heap.size) {
    const i = heap.pop();
    if (done[i]) continue; done[i] = 1;
    if (i === t) { const out = [i]; let c = i; while (P[c] >= 0) { c = P[c]; out.push(c); } return out.reverse(); }
    const r = Math.floor(i / nx), c = i % nx;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
      const j = rr * nx + cc; if (done[j]) continue;
      const S = g.safety[j];
      if (j !== t && (S === 255 || S < minS)) continue;
      const d = cell * (dr && dc ? Math.SQRT2 : 1);
      const q = (100 - Math.min(S, 100)) / 100;
      const cost = d * (1 + k * q * q) * (1 - w * g.science[j]) * (avoid && avoid.has(j) ? 1.8 : 1);
      const ng = G[i] + cost;
      if (ng < G[j]) { G[j] = ng; P[j] = i; heap.push(j, ng + h(j)); }
    }
  }
  return null;
}

// ---------- environment (daylight + temperature) over a time window ----------
function tempAt(weather: Weather, ltstHour: number): number {
  const d = weather.diurnal[Math.floor(((ltstHour % 24) + 24) % 24)];
  return d && d.tempC != null ? d.tempC : -60;
}
export function envScore(startMs: number, hours: number, weather: Weather): number {
  const step = 10 * 60000, n = Math.max(1, Math.ceil((hours * 3600000) / step));
  let day = 0, therm = 0;
  for (let i = 0; i < n; i++) {
    const s = sunAt(startMs + (i + 0.5) * step);
    day += s.elev > 5 ? 1 : s.elev > 0 ? 0.5 : s.elev > -6 ? 0.2 : 0;
    therm += Math.max(0, Math.min(1, (tempAt(weather, s.ltst) + 90) / 65));
  }
  return 100 * (0.65 * (day / n) + 0.35 * (therm / n));
}

export interface PlanResult { routes: Route[]; error?: string; startCell?: number; destCell?: number }

export function planRoutes(g: Grid, pois: Poi[], trip: Trip, inv: Inventory, weather: Weather, resourceUnits: Set<number>): PlanResult {
  if (!trip.start || !trip.dest) return { routes: [], error: "Set a start position and a destination (click the map)." };
  const [sr, sc] = cellOf(g, trip.start[0], trip.start[1]);
  const [dr, dc] = cellOf(g, trip.dest[0], trip.dest[1]);
  if (!inGrid(g, sr, sc) || !inGrid(g, dr, dc)) return { routes: [], error: "Start and destination must be inside the mapped area." };
  const s = sr * g.nx + sc, t = dr * g.nx + dc;
  if (s === t) return { routes: [], error: "Start and destination are the same cell." };
  if (g.safety[s] === 255 || g.safety[t] === 255) return { routes: [], error: "Start or destination is on impassable terrain (slope over 25° or no data)." };

  const p = trip.priority;
  const cfgs: { id: Route["id"]; name: string; color: string; k: number; w: number; minS: number }[] = [
    { id: "A", name: "A · Safest", color: "#19b3a6", k: 10, w: 0, minS: 45 },
    { id: "B", name: "B · Best science", color: "#8b5cf6", k: 3, w: 0.3 + 0.5 * p, minS: 40 },
    { id: "C", name: "C · Fastest", color: "#ec4899", k: 0.4, w: 0, minS: 30 },
  ];
  const routes: Route[] = [];
  const used: number[][] = [];
  for (const c of cfgs) {
    let idx = astar(g, s, t, c.k, c.w, c.minS) ?? astar(g, s, t, c.k, c.w, 0);
    if (!idx) return { routes: [], error: "No passable route between these points." };
    // if this route is (almost) the same track as an earlier one, re-plan while discouraging the earlier tracks,
    // so the user gets genuinely different options
    const overlap = (a: number[], b: number[]) => { const sb = new Set(b); return a.filter((i) => sb.has(i)).length / a.length; };
    if (used.some((u) => overlap(idx!, u) > 0.9)) {
      const alt = astar(g, s, t, c.k, c.w, c.minS, new Set(used.flat()));
      if (alt) idx = alt;
    }
    used.push(idx);
    routes.push(evaluate(g, idx, c, pois, trip, inv, weather, resourceUnits));
  }
  return { routes, startCell: s, destCell: t };
}

function evaluate(g: Grid, idx: number[], cfg: { id: Route["id"]; name: string; color: string }, pois: Poi[], trip: Trip, inv: Inventory, weather: Weather, resUnits: Set<number>): Route {
  const mode = MODES[trip.mode] ?? MODES.Walk;
  const path: LL[] = idx.map((i) => llOfCell(g, Math.floor(i / g.nx), i % g.nx));
  const cumH: number[] = [0], profile: Route["profile"] = [];
  let len = 0, hOne = 0;
  profile.push({ d: 0, z: g.elev[idx[0]], s: g.slope[idx[0]] });
  for (let i = 1; i < idx.length; i++) {
    const dr = Math.floor(idx[i] / g.nx) - Math.floor(idx[i - 1] / g.nx), dc = (idx[i] % g.nx) - (idx[i - 1] % g.nx);
    const d = g.cell * (dr && dc ? Math.SQRT2 : 1);
    len += d; hOne += d / (mode.kmh * 1000 * speedFactor(g.slope[idx[i]]));
    cumH.push(hOne); profile.push({ d: len, z: g.elev[idx[i]], s: g.slope[idx[i]] });
  }
  // terrain score
  const S = idx.map((i) => Math.min(100, g.safety[i]));
  const mean = S.reduce((a, b) => a + b, 0) / S.length;
  let worst = 100;
  for (let i = 0; i < S.length; i++) {
    const a = S.slice(Math.max(0, i - 1), i + 2); worst = Math.min(worst, a.reduce((x, y) => x + y, 0) / a.length);
  }
  const terrain = 0.6 * mean + 0.4 * worst;

  // science + resources along the path
  const near = (p: Poi, rM: number) => {
    const kx = Math.cos((p.lat * Math.PI) / 180) * 59270, ky = 59270;
    for (const [la, lo] of path) if (Math.hypot((lo - p.lon) * kx, (la - p.lat) * ky) <= rM) return true;
    return false;
  };
  const sites = pois.filter((p) => p.kind !== "hazard" && near(p, 200));
  const meanSci = idx.reduce((a, i) => a + g.science[i], 0) / idx.length;
  const science = Math.min(100, 100 * (0.6 * Math.min(1, meanSci / 0.5) + 0.4 * Math.min(1, sites.reduce((a, p) => a + p.weight, 0) / 4)));
  const fracRes = idx.filter((i) => resUnits.has(g.unit[i])).length / idx.length;
  const hydrous = pois.some((p) => p.kind === "mineral" && near(p, 600));
  const resources = Math.min(100, 100 * Math.min(1, fracRes * 1.2 + (hydrous ? 0.4 : 0)));

  // time budget
  const stops = trip.purpose === "Science sampling" ? sites.length * STOP_H_PER_SITE : 0;
  const totalH = (trip.round ? 2 * hOne : hOne) + stops;

  // best departure within the window
  const e0 = solTimeToMs(trip.earliest), e1 = solTimeToMs(trip.latest);
  let bestMs = e0, bestEnv = -1, feasible = false;
  for (let ms = e0; ms + totalH * 3600000 <= e1 + 1; ms += 15 * 60000) {
    feasible = true;
    const sc = envScore(ms, totalH, weather);
    if (sc > bestEnv) { bestEnv = sc; bestMs = ms; }
  }
  if (!feasible) bestEnv = envScore(e0, totalH, weather);
  const depart = msToSolTime(bestMs), arrive = addRealHours(depart, hOne + (trip.round ? stops / 2 : stops));
  const back = trip.round ? addRealHours(depart, totalH) : null;

  // supplies
  const crew = Math.max(1, trip.crew);
  const need = { o2: totalH * RESERVE, water: WATER_L_PER_H * crew * totalH * RESERVE, food: Math.ceil((totalH * RESERVE) / HOURS_PER_MEAL) * crew, battery: mode.drain * totalH * RESERVE, bags: trip.purpose === "Science sampling" ? Math.min(sites.length, 10) : 0 };
  const ratios = { "O₂": inv.o2 / need.o2, water: inv.water / need.water, food: inv.food / need.food, battery: inv.battery / need.battery };
  const shortOn = Object.entries(ratios).filter(([, r]) => r < 1).map(([k]) => k);
  if (need.bags > inv.bagsHave) shortOn.push("sample bags");
  const minRatio = Math.min(...Object.values(ratios));
  const margin = (Math.min(1.5, Math.max(0, minRatio)) / 1.5) * 100;

  // point of no return (return along the same track must fit inside the limiting consumable)
  const capH = Math.min(inv.o2, inv.water / (WATER_L_PER_H * crew), (inv.food * HOURS_PER_MEAL) / crew, inv.battery / mode.drain) / RESERVE;
  let pnr: Route["pnr"] = null, pnrNote = "";
  if (2 * hOne <= capH) pnrNote = `Round trip fits in supplies (${(capH).toFixed(1)} h usable of ${(2 * hOne).toFixed(1)} h needed).`;
  else {
    let k = 0; while (k < cumH.length - 1 && 2 * cumH[k + 1] <= capH) k++;
    pnr = { idx: k, ll: path[k], km: profile[k].d / 1000 };
    pnrNote = `Past ${pnr.km.toFixed(1)} km supplies no longer cover the walk back (limit ${capH.toFixed(1)} h).`;
  }

  // overall safety = terrain 60 %, environment 20 %, return margin 20 %; each part must reach 50
  const safety = 0.6 * terrain + 0.2 * bestEnv + 0.2 * margin;
  const reasons: string[] = [];
  if (safety < MIN_SAFETY) reasons.push(`estimated safety ${safety.toFixed(0)} is under ${MIN_SAFETY}`);
  if (terrain < 50) reasons.push(`terrain part ${terrain.toFixed(0)} (needs 50)`);
  if (bestEnv < 50) reasons.push(`daylight and temperature part ${bestEnv.toFixed(0)} (needs 50; ${feasible ? "poor window" : "window too short for this trip"})`);
  if (!feasible && !reasons.some((r) => r.startsWith("daylight"))) reasons.push("time window too short for this trip");
  if (margin < 50) reasons.push(`supplies margin part ${margin.toFixed(0)} (needs 50)`);

  return {
    id: cfg.id, name: cfg.name, color: cfg.color, path, lengthM: len, oneWayH: hOne, totalH,
    terrain, env: bestEnv, margin, safety, science, resources, sites,
    depart, arrive, back, ok: reasons.length === 0, reasons, shortOn, pnr, pnrNote, profile, cumH, worstStretch: worst,
    meanSafety: mean, meanSci, fracRes, hydrous, stopsH: stops,
    supplies: [
      { name: "Oxygen", need: need.o2, have: inv.o2, unit: "h" }, { name: "Water", need: need.water, have: inv.water, unit: "L" },
      { name: "Food", need: need.food, have: inv.food, unit: "meals" }, { name: "Battery", need: need.battery, have: inv.battery, unit: "%" },
      ...(need.bags ? [{ name: "Sample bags", need: need.bags, have: inv.bagsHave, unit: "" }] : []),
    ],
  };
}

export function parseLatLon(s: string): LL | null {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return Math.abs(a) <= 90 && Math.abs(b) <= 360 ? [a, b] : null;
}

export const defaultInventory: Inventory = { food: 6, water: 6, o2: 10, battery: 100, bagsHave: 4, bagsMax: 10 };
export const sol = (st: SolTime) => st.sol;
