import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { AppData, LL, Route, Upload } from "../types";
import { CATEGORIES, HAVENS, subInfo, type Sub } from "../lib/layers";
import { bounds, hillshadeOverlay, safetyOverlay, scienceOverlay, slopeOverlay, sample } from "../lib/grid";
import { explainCell, type MlInfo } from "../lib/ml";

export interface LayerState { on: Record<string, boolean>; sub: Record<string, string>; ov: Record<string, boolean> }
export interface Alert { level: "warn" | "info" | "bad"; text: string }

interface Props {
  ml: MlInfo | null;
  data: AppData; layers: LayerState; routes: Route[]; selected: string | null; confirmed: Route | null;
  start: LL | null; dest: LL | null; sun: { az: number; el: number }; uploads: Upload[];
  walkerIdx: number | null; alerts: Alert[]; weatherNote: string; onMapClick: (ll: LL) => void;
  onSelectRoute: (id: string) => void; picking: "start" | "dest" | null;
}

// ---- marker artwork (inline SVG) ----
const W = "#fff";
const teardrop = (fill: string, glyph: string) =>
  `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 34C14 34 3 21.5 3 13a11 11 0 1 1 22 0c0 8.5-11 21-11 21z" fill="${fill}" stroke="${W}" stroke-width="2"/>${glyph}</svg>`;
const SVG: Record<string, string> = {
  start: teardrop("#1f9d78", `<rect x="9.5" y="8.5" width="9" height="9" rx="1.8" fill="${W}"/>`),
  dest: teardrop("#ec4899", `<path d="M14 6l7 7-7 7-7-7z" fill="${W}"/>`),
  haven: teardrop("#3b6fd1", `<path d="M14 6l7.5 6.3h-2.2V19h-3.9v-4.4h-2.8V19H8.7v-6.7H6.5z" fill="${W}"/>`),
  pnr: `<svg width="32" height="28" viewBox="0 0 32 28" aria-hidden="true"><path d="M16 2.5L29.5 25.5H2.5z" fill="#f5a344" stroke="${W}" stroke-width="2.2" stroke-linejoin="round"/><rect x="14.8" y="10" width="2.4" height="8" rx="1.2" fill="#1c1204"/><circle cx="16" cy="21.3" r="1.5" fill="#1c1204"/></svg>`,
  you: `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="rgba(245,163,68,.28)"/><circle cx="15" cy="15" r="6.5" fill="#f5a344" stroke="${W}" stroke-width="2.5"/></svg>`,
  cam: `<svg width="17" height="13" viewBox="0 0 17 13" aria-hidden="true"><rect x="5.5" y="0.8" width="5.5" height="3.4" rx="1" fill="#10203c" stroke="${W}" stroke-width="1"/><rect x="1" y="2.8" width="15" height="9.6" rx="2.2" fill="#10203c" stroke="${W}" stroke-width="1.3"/><circle cx="8.5" cy="7.6" r="2.6" fill="#cfe3ff"/></svg>`,
};
const poiSvg = (kind: string) => {
  const s = (inner: string) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${inner}</svg>`;
  if (kind === "mineral") return s(`<path d="M9 1.5l6 7.5-6 7.5L3 9z" fill="#a78bfa" stroke="${W}" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 9h12" stroke="${W}" stroke-width="1" opacity=".7"/>`);
  if (kind === "geology") return s(`<path d="M9 1.5l6.3 3.6v7.8L9 16.5l-6.3-3.6V5.1z" fill="#f5a344" stroke="${W}" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 8h8M5 11h8" stroke="#7a4a10" stroke-width="1.2"/>`);
  if (kind === "hazard") return s(`<path d="M9 2L16.5 15.5h-15z" fill="#ef5b52" stroke="${W}" stroke-width="1.6" stroke-linejoin="round"/><rect x="8.2" y="6.5" width="1.6" height="5" rx=".8" fill="${W}"/><circle cx="9" cy="13" r=".95" fill="${W}"/>`);
  return s(`<circle cx="9" cy="9" r="6.8" fill="#4aa8ff" stroke="${W}" stroke-width="1.6"/><circle cx="9" cy="9" r="2.5" fill="${W}"/>`);
};
const LABELS_RIGHT = new Set(["start", "dest", "haven", "pnr", "you"]);
const pin = (cls: string, mark: string, label = "") => {
  const art = cls === "num" ? `<i class="stopn">${mark}</i>` : (SVG[cls] ?? "");
  const lab = label ? `<span class="lab ${cls}">${label}</span>` : "";
  return L.divIcon({ className: "", html: `<div class="mkr ${cls}">${art}${LABELS_RIGHT.has(cls) ? lab : ""}</div>`, iconSize: [0, 0] });
};
const poiIcon = (kind: string) => L.divIcon({ className: "", html: `<div class="mkr poi">${poiSvg(kind)}</div>`, iconSize: [0, 0] });

export function activeSubs(layers: LayerState): Sub[] {
  const out: Sub[] = [];
  for (const c of CATEGORIES) {
    if (!layers.on[c.id] || c.disabled) continue;
    const s = c.subs.find((x) => x.id === layers.sub[c.id]) ?? c.subs[0];
    if (s) out.push(s);
  }
  return out;
}

export default function MapView({ data, layers, routes, selected, confirmed, start, dest, sun, uploads, walkerIdx, alerts, weatherNote, onMapClick, onSelectRoute, picking, ml }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const subLayers = useRef<Record<string, L.Layer>>({});
  const routeGroup = useRef<L.LayerGroup>(L.layerGroup());
  const ovGroups = useRef<Record<string, L.LayerGroup>>({});
  const clickRef = useRef(onMapClick); clickRef.current = onMapClick;
  const selRef = useRef(onSelectRoute); selRef.current = onSelectRoute;
  const [alertOpen, setAlertOpen] = useState(false);
  const cursorEl = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const [scale, setScale] = useState<{ px: number; label: string }>({ px: 60, label: "…" });
  const g = data.grid;
  const gRef = useRef(g); gRef.current = g;
  const mlRef = useRef(ml); mlRef.current = ml;
  const aoi = useMemo(() => bounds(g), [g]);

  // Heavy canvas rasters are computed only when their layer is switched on, then cached.
  const cache = useRef<Record<string, string>>({});
  const raster = (k: "safety" | "slope" | "science") => (cache.current[k] ??= { safety: safetyOverlay, slope: slopeOverlay, science: scienceOverlay }[k](g));
  const sunKey = `${Math.round(sun.az / 2) * 2}_${Math.round(sun.el)}`;
  const shadeUrl = () => {
    const key = "h" + sunKey;
    if (!cache.current[key]) {
      for (const k of Object.keys(cache.current)) if (k.startsWith("h")) delete cache.current[k];
      const [az, el] = sunKey.split("_").map(Number);
      cache.current[key] = hillshadeOverlay(g, az, el);
    }
    return cache.current[key];
  };

  // ----- create the map once -----
  useEffect(() => {
    const m = L.map(el.current!, { crs: L.CRS.EPSG4326, zoomControl: false, attributionControl: false, minZoom: 9, maxZoom: 17, zoomSnap: 0.5, preferCanvas: true, maxBounds: L.latLngBounds(aoi).pad(0.3) });
    m.fitBounds(aoi);
    routeGroup.current.addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => clickRef.current([e.latlng.lat, e.latlng.lng]));
    m.on("mousemove", (e: L.LeafletMouseEvent) => {
      // update the readout straight in the DOM, at most once per frame (no React re-render per mouse move)
      if (raf.current) return;
      const { lat, lng } = e.latlng;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const gg = gRef.current, s = sample(gg, lat, lng), m2 = mlRef.current;
        const why = s && m2 && s.safety !== 255 ? ` · ${explainCell(gg, s.i, s.safety, m2.importance)}` : "";
        if (cursorEl.current) cursorEl.current.textContent = `${lat.toFixed(4)}°N ${lng.toFixed(4)}°E` + (s ? ` · elev ${s.elev ?? "—"} m · slope ${s.slope.toFixed(0)}°${why || ` · est. safety ${s.safety === 255 ? "blocked" : s.safety}`}` : " · outside map data");
      });
    });
    const upd = () => {
      const mPerPx = (360 / (512 * 2 ** m.getZoom())) * 59270 * Math.cos((18.44 * Math.PI) / 180);
      const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].filter((n) => n / mPerPx <= 130).pop() ?? 10;
      setScale({ px: nice / mPerPx, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` });
    };
    m.on("zoomend", upd); upd();
    map.current = m;
    (window as any).__map = m;
    return () => { m.remove(); map.current = null; subLayers.current = {}; };
  }, []); // eslint-disable-line

  // ----- build a layer for one sub -----
  const build = (s: Sub): L.Layer | null => {
    switch (s.kind) {
      case "tile": return L.tileLayer(s.url!, { maxNativeZoom: s.maxNative, maxZoom: 17, minZoom: 9, bounds: s.bounds, opacity: s.opacity ?? 1, noWrap: true, keepBuffer: 3, updateWhenZooming: false });
      case "safety": return L.imageOverlay(raster("safety"), aoi, { opacity: 0.5 });
      case "slope": return L.imageOverlay(raster("slope"), aoi, { opacity: 0.65 });
      case "science": return L.imageOverlay(raster("science"), aoi, { opacity: 0.8 });
      case "hillshade": return L.imageOverlay(shadeUrl(), aoi, { opacity: 1, className: "pixelated" });
      case "geology": {
        const colors: Record<number, string> = Object.fromEntries(data.geology.units.map((u) => [u.id, u.color]));
        return L.geoJSON(data.geology as any, {
          style: (f) => ({ color: "#333", weight: 0.5, fillColor: colors[(f!.properties as any).id] ?? "#999", fillOpacity: 0.5 }),
          onEachFeature: (f, l) => l.bindTooltip((f.properties as any).unit, { sticky: true }),
        });
      }
      case "pois": {
        const grp = L.layerGroup();
        for (const p of data.pois) {
          L.marker([p.lat, p.lon], { icon: poiIcon(p.kind) })
            .bindPopup(`<b>${p.name}</b><br>${p.blurb}<br><small>${p.source}</small>`).addTo(grp);
        }
        return grp;
      }
      default: return null;
    }
  };

  // new grid (e.g. the ML model finished) -> drop cached rasters and their layers so they are rebuilt from the new numbers
  useEffect(() => {
    cache.current = {};
    const m = map.current;
    for (const id of ["safety", "slope", "science", "hillshade"]) {
      const l = subLayers.current[id];
      if (l && m && m.hasLayer(l)) m.removeLayer(l);
      delete subLayers.current[id];
    }
  }, [g]); // eslint-disable-line

  // ----- sync category layers -----
  useEffect(() => {
    const m = map.current; if (!m) return;
    const want = new Set(activeSubs(layers).filter((s) => s.kind !== "atmo").map((s) => s.id));
    for (const [id, lyr] of Object.entries(subLayers.current)) if (!want.has(id) && m.hasLayer(lyr)) m.removeLayer(lyr);
    let z = 1;
    for (const c of CATEGORIES) {
      for (const s of c.subs) {
        if (!want.has(s.id)) continue;
        if (!subLayers.current[s.id]) { const l = build(s); if (l) subLayers.current[s.id] = l; }
        const l = subLayers.current[s.id]; if (!l) continue;
        if (!m.hasLayer(l)) l.addTo(m);
        if ((l as any).setZIndex) (l as any).setZIndex(z);
        z++;
      }
    }
  }, [layers.on, layers.sub, g]); // eslint-disable-line

  // hillshade updates when the sun changes
  useEffect(() => {
    const l = subLayers.current["hillshade"] as L.ImageOverlay | undefined;
    if (l && map.current?.hasLayer(l)) l.setUrl(shadeUrl());
  }, [sunKey, layers.on, layers.sub]); // eslint-disable-line

  // ----- overlays: traverse, photos, uploads -----
  useEffect(() => {
    const m = map.current; if (!m) return;
    const make = (id: string): L.LayerGroup => {
      const grp = L.layerGroup();
      if (id === "traverse") L.geoJSON(data.traverse as any, { style: { color: "#cfe3ff", weight: 1.5, opacity: 0.75 } }).addTo(grp);
      if (id === "photos") {
        const by: Record<string, typeof data.photos> = {};
        for (const p of data.photos) (by[`${p.lat},${p.lon}`] ??= []).push(p);
        for (const list of Object.values(by)) {
          const html = list.slice(0, 6).map((p) => `<a href="${p.page}" target="_blank" rel="noreferrer"><img src="${p.thumb}" width="120" loading="lazy"/></a><div class="cap">Sol ${p.sol} · ${p.cam} · ${p.lmst.slice(0, 14)}</div>`).join("");
          L.marker([list[0].lat, list[0].lon], { icon: pin("cam", "") }).bindPopup(`<div class="photopop">${html}</div>`, { maxWidth: 280 }).addTo(grp);
        }
      }
      if (id === "upload") {
        for (const u of uploads) {
          const { lat, lon, value, label } = u.map;
          const vals = u.rows.map((r) => parseFloat(r[value])).filter((v) => isFinite(v));
          const lo = Math.min(...vals), hi = Math.max(...vals);
          for (const r of u.rows) {
            const la = parseFloat(r[lat]), lo2 = parseFloat(r[lon]); if (!isFinite(la) || !isFinite(lo2)) continue;
            const v = parseFloat(r[value]); const t = isFinite(v) && hi > lo ? (v - lo) / (hi - lo) : 0.5;
            L.circleMarker([la, lo2], { radius: 6, color: "#fff", weight: 1, fillColor: `hsl(${(1 - t) * 240},80%,50%)`, fillOpacity: 0.95 })
              .bindTooltip(`${r[label] ?? u.name}${isFinite(v) ? ` · ${v}` : ""}`).addTo(grp);
          }
        }
      }
      return grp;
    };
    for (const id of ["traverse", "photos", "upload"]) {
      const old = ovGroups.current[id]; if (old && m.hasLayer(old)) m.removeLayer(old);
      if (id === "upload" || !old) ovGroups.current[id] = make(id);
      if (layers.ov[id]) ovGroups.current[id].addTo(m);
    }
  }, [layers.ov, uploads, data]); // eslint-disable-line

  // ----- routes + markers -----
  useEffect(() => {
    const grp = routeGroup.current; grp.clearLayers();
    for (const r of routes) {
      if (r.id === selected) continue;
      const pl = L.polyline(r.path, r.ok ? { color: r.color, weight: 4, opacity: 0.8 } : { color: "#888", weight: 4, dashArray: "6 6", opacity: 0.75 }).addTo(grp);
      pl.bindTooltip(`${r.name} · est. safety ${r.safety.toFixed(0)}${r.ok ? "" : " (below 65)"} · click to select`, { sticky: true });
      pl.on("click", (e) => { L.DomEvent.stopPropagation(e); selRef.current(r.id); });
    }
    const sel = confirmed ?? routes.find((r) => r.id === selected);
    if (sel) {
      L.polyline(sel.path, { color: "#0a1322", weight: 8, opacity: 0.75, lineCap: "round", lineJoin: "round" }).addTo(grp);
      L.polyline(sel.path, sel.ok || confirmed ? { color: sel.color, weight: 4.5, lineCap: "round", lineJoin: "round" } : { color: "#888", weight: 5, dashArray: "8 6" }).addTo(grp);
      sel.sites.forEach((s, i) => L.marker([s.lat, s.lon], { icon: pin("num", String(i + 1)) }).bindTooltip(`${i + 1}. ${s.name}`).addTo(grp));
      if (sel.pnr) L.marker(sel.pnr.ll, { icon: pin("pnr", "", `Point of no return · ${sel.pnr.km.toFixed(1)} km`) }).addTo(grp);
    }
    for (const h of HAVENS) L.marker(h.ll, { icon: pin("haven", "", "Safe haven") }).addTo(grp);
    if (start) L.marker(start, { icon: pin("start", "", "Start") }).addTo(grp);
    if (dest) L.marker(dest, { icon: pin("dest", "", "Destination") }).addTo(grp);
    if (confirmed && walkerIdx != null) {
      const p = confirmed.path[Math.min(walkerIdx, confirmed.path.length - 1)];
      L.marker(p, { icon: pin("you", "", "You are here"), zIndexOffset: 1000 }).addTo(grp);
    }
  }, [routes, selected, confirmed, start, dest, walkerIdx]);

  useEffect(() => {
    const r = confirmed ?? routes.find((x) => x.id === selected);
    if (r && map.current && r.path.length > 1) map.current.fitBounds(L.latLngBounds(r.path).pad(0.35), { maxZoom: 14, animate: true });
  }, [selected, confirmed, routes.length]); // eslint-disable-line

  const act = activeSubs(layers).map((s) => subInfo(s, ml));
  const legend = act.filter((s) => s.legend.length);
  const top = act.length ? act[act.length - 1] : null;
  const showAtmo = act.some((s) => s.kind === "atmo");
  const geoUnits = act.some((s) => s.kind === "geology") ? data.geology.units : [];
  const w = data.weather;
  const night = w.diurnal.filter((d) => d.tempC != null).map((d) => d.tempC as number);

  return (
    <main className="map-wrap">
      <div ref={el} className="map" />
      {picking && <div className="hint">Click the map to set the {picking === "start" ? "START" : "DESTINATION"} · Esc to cancel</div>}
      <div className="map-ctl">
        <div className="box"><button onClick={() => map.current?.zoomIn()}>+</button><button onClick={() => map.current?.zoomOut()}>−</button></div>
        <div className="box"><button onClick={() => map.current?.fitBounds(aoi)} title="Map is north-up. Click to reset the view.">N ↑</button></div>
      </div>
      <div className="alert">
        <div className="row"><b>⚠ ALERT{alerts.some((a) => a.level !== "info") ? ` (${alerts.filter((a) => a.level !== "info").length})` : ""}</b><button className="mini" onClick={() => setAlertOpen(!alertOpen)}>{alertOpen ? "hide" : `all ${alerts.length}`}</button></div>
        {!alertOpen && alerts.length > 0 && (() => { const w = alerts.find((a) => a.level === "bad") ?? alerts.find((a) => a.level === "warn") ?? alerts[0]; return <div className={`al ${w.level} one`}>{w.text}</div>; })()}
        {alertOpen && alerts.length === 0 && <div>No active alerts.</div>}
        {alertOpen && alerts.map((a, i) => <div key={i} className={`al ${a.level}`}>{a.text}</div>)}
      </div>
      {showAtmo && (
        <div className="atmo">
          <b>CONDITIONS · MEDA</b>
          <div>Air temperature by local time</div>
          <svg viewBox="0 0 120 40" width="200" height="60">
            <polyline fill="none" stroke="#1d6fd8" strokeWidth="1.5" points={w.diurnal.map((d, i) => `${(i / 23) * 118 + 1},${38 - (((d.tempC ?? -90) + 90) / 70) * 36}`).join(" ")} />
          </svg>
          <div>{Math.min(...night).toFixed(0)} °C to {Math.max(...night).toFixed(0)} °C · {w.daily[w.daily.length - 1].meanPa.toFixed(0)} Pa</div>
          <small>{weatherNote}</small>
        </div>
      )}
      <div className="map-bottom">
        <div className="box scale"><div className="bar" style={{ width: scale.px }} /> {scale.label} <span className="cur" ref={cursorEl}>move cursor over the map</span></div>
        <div className="box legend">
          <b>Legend</b>{legend.length === 0 && geoUnits.length === 0 && <span> (no legend for active layers)</span>}
          {legend.map((s) => <span key={s.id} className="lg">{s.legend.map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</span>)}
          {geoUnits.map((u) => <span key={u.id}><i style={{ background: u.color }} />{u.name.replace(" unit", "")}</span>)}
        </div>
        <div className="box src">{top ? <><b>{top.label}</b> · {top.source} · {top.res} · {top.date} · error: {top.error}</> : "No layer active"}</div>
      </div>
    </main>
  );
}
