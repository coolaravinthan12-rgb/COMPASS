// Layer catalogue: the seven wireframe layer categories, each with selectable data layers.
export const trek = (label: string, ext = "png") => `https://trek.nasa.gov/tiles/Mars/EQ/${label}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`;

export type SubKind = "tile" | "safety" | "slope" | "hillshade" | "science" | "geology" | "pois" | "atmo";

export interface Sub {
  id: string; short: string; label: string; kind: SubKind;
  url?: string; maxNative?: number; bounds?: [[number, number], [number, number]]; opacity?: number;
  source: string; res: string; date: string; error: string;
  legend: { color: string; label: string }[];
}
export interface Category { id: string; name: string; defaultOn: boolean; disabled?: string; subs: Sub[] }

export const CATEGORIES: Category[] = [
  { id: "optical", name: "Optical", defaultOn: true, subs: [
    { id: "ctx", short: "CTX", label: "CTX mosaic", kind: "tile", url: trek("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0"), maxNative: 13, source: "MRO CTX via NASA Mars Trek", res: "6 m/px", date: "controlled mosaic, MRO 2006–2018", error: "geometric accuracy not published in Trek metadata", legend: [] },
    { id: "hirise", short: "HiRISE", label: "HiRISE mosaic", kind: "tile", url: trek("JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd"), maxNative: 17, bounds: [[18.3068, 77.2229], [18.6693, 77.5840]], source: "MRO HiRISE via NASA Mars Trek", res: "25 cm/px (covers the crater floor and delta only)", date: "MRO 2006–2019", error: "not published", legend: [] },
  ] },
  { id: "thermal", name: "Thermal", defaultOn: false, subs: [
    { id: "themis_night", short: "Night", label: "THEMIS night IR (thermal-inertia proxy)", kind: "tile", url: trek("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018"), maxNative: 9, opacity: 0.8, source: "Mars Odyssey THEMIS via NASA Mars Trek", res: "100 m/px", date: "mosaic v2, Oct 2018", error: "qualitative: brightness is not calibrated temperature", legend: [{ color: "#fff", label: "warm at night: rock / firm" }, { color: "#222", label: "cold at night: dust / fines" }] },
    { id: "themis_day", short: "Day", label: "THEMIS day IR", kind: "tile", url: trek("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018"), maxNative: 9, opacity: 0.8, source: "Mars Odyssey THEMIS via NASA Mars Trek", res: "100 m/px", date: "mosaic v2, Oct 2018", error: "qualitative", legend: [{ color: "#fff", label: "warm by day" }, { color: "#222", label: "cool by day" }] },
  ] },
  { id: "topographic", name: "Topographic", defaultOn: false, subs: [
    { id: "hillshade", short: "Shadows", label: "Hillshade + shadows (sun at planned start)", kind: "hillshade", opacity: 1, source: "COMPASS, from MRO CTX DEM (NASA Mars Trek)", res: "60 m cells (from 20 m DEM)", date: "sun computed for the planned start time", error: "shadows from orbital DEM only; rocks and boulders not modelled", legend: [{ color: "#080c28", label: "shadow / night" }] },
    { id: "slope", short: "Slope", label: "Slope", kind: "slope", source: "COMPASS, from MRO CTX DEM (NASA Mars Trek)", res: "60 m cells (90th-percentile of 20 m slopes)", date: "DEM controlled to MOLA", error: "r = 0.77 vs rover-measured tilt at 708 waypoints", legend: [{ color: "#2fc4a2", label: "0°" }, { color: "#e2d65a", label: "10°" }, { color: "#f5a344", label: "18°" }, { color: "#ef5b52", label: "30°+" }] },
  ] },
  { id: "geophysical", name: "Geophysical", defaultOn: true, subs: [
    { id: "safety", short: "Safety", label: "Estimated safety (built-in index)", kind: "safety", source: "COMPASS built-in estimate: slope, roughness, geology, dust proxy, proven ground", res: "60 m cells", date: "static terrain model", error: "heuristic estimate; its slope part correlates 0.77 with rover-measured tilt; not validated against real hazards", legend: [{ color: "#ef5b52", label: "under 50: lower" }, { color: "#e2d65a", label: "65: planning minimum" }, { color: "#2fc4a2", label: "80+: higher" }, { color: "#141414", label: "impassable" }] },
    { id: "geology", short: "Geology", label: "Geologic units", kind: "geology", opacity: 0.55, source: "USGS SIM 3464, Sun & Stack (2020)", res: "1:75,000 map", date: "2020", error: "map scale limits boundary position to tens of metres", legend: [] },
  ] },
  { id: "atmospheric", name: "Atmospheric", defaultOn: false, subs: [
    { id: "atmo", short: "MEDA", label: "Conditions card (MEDA)", kind: "atmo", source: "Perseverance MEDA via NASA PDS Atmospheres Node", res: "1 Hz, binned by hour", date: "sols 1857–1859 (last published; not live)", error: "sensor uncertainty ±~1 K in the PDS files", legend: [] },
  ] },
  { id: "chemical", name: "Chemical", defaultOn: true, subs: [
    { id: "pois", short: "Points", label: "Science points of interest", kind: "pois", source: "Mars Trek Mastcam-Z POIs, OMEGA/CRISM detections, USGS units, MMGIS", res: "points", date: "2013–2026", error: "mineral detections are coarse orbital positions", legend: [{ color: "#a78bfa", label: "mineral" }, { color: "#f5a344", label: "geology" }, { color: "#4aa8ff", label: "panorama / traverse" }, { color: "#ef5b52", label: "hazard" }] },
    { id: "science", short: "Heat", label: "Science-interest heat map", kind: "science", source: "COMPASS: POIs, unit contacts, unit type", res: "60 m cells", date: "static", error: "relative ranking only", legend: [{ color: "#fff", label: "low" }, { color: "#8b5cf6", label: "high" }] },
  ] },
];

export function subInfo(s: Sub, ml: { version: number; auc?: number; brier?: number; dAuc?: number; samples?: number } | null): Sub {
  if (!ml) return s;
  if (s.kind === "safety") return { ...s, short: "Safety", label: `Estimated safety (ML v${ml.version})`,
    source: `COMPASS safety estimator v${ml.version}: random forest, calibrated; labels are mostly slope, roughness and dust rules plus the real Perseverance traverse`,
    error: `AUC ${ml.auc ?? "-"}, Brier ${ml.brier ?? "-"} on held-out map blocks, measured against its own labels; not validated against real hazards` };
  if (s.kind === "science") return { ...s, short: "Sampling", label: `Sampling-likeness (ML v${ml.version})`,
    source: `COMPASS sampling-likeness estimator v${ml.version}: how much a cell resembles the ${ml.samples ?? 24} real sample sites (Herd et al. 2025)`,
    error: `hold-out AUC ${ml.dAuc ?? "-"}; only scores of 60% or more are shown; sample positions are the rover's waypoint on that sol`,
    legend: [{ color: "#8b5cf6", label: "60-79: some resemblance" }, { color: "#4c1d95", label: "80+: strong resemblance" }] };
  return s;
}

export interface Overlay { id: string; name: string; defaultOn: boolean }
export const OVERLAYS: Overlay[] = [
  { id: "traverse", name: "Rover traverse", defaultOn: true },
  { id: "photos", name: "Rover photos", defaultOn: true },
  { id: "upload", name: "Your uploads", defaultOn: true },
];

export const POI_COLORS: Record<string, string> = { mineral: "#a78bfa", geology: "#f5a344", panorama: "#4aa8ff", traverse: "#4aa8ff", hazard: "#ef5b52" };

// Assumed safe havens (no real shelter data exists): the landing site and the rover's latest MMGIS position.
export const HAVENS: { name: string; ll: [number, number] }[] = [
  { name: "Landing site (assumed haven)", ll: [18.4446, 77.4509] },
];
