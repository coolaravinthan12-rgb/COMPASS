export type LL = [number, number]; // [lat, lon]

export interface SolTime { sol: number; hour: number } // local mean solar time, hours 0-24

export interface Grid {
  nx: number; ny: number; cell: number;
  lonW: number; latN: number; dlon: number; dlat: number;
  elev: Int16Array; slope: Float32Array; rough: Float32Array; unit: Uint8Array;
  dust: Float32Array; proven: Float32Array; science: Float32Array; safety: Uint8Array;
  recent?: Float32Array; ml?: boolean; // set when the safety/science bands come from the ML backend
}

export interface Poi {
  name: string; kind: string; weight: number; blurb: string; source: string; lon: number; lat: number;
}

export interface Photo {
  id: string; sol: number; cam: string; utc: string; lmst: string; lon: number; lat: number;
  thumb: string; img: string; page: string;
}

export interface Weather {
  source: string; sols: number[]; latestPublishedSol: number; note: string;
  daily: { sol: number; minC: number; maxC: number; meanPa: number }[];
  diurnal: { hour: number; tempC: number | null; pressurePa: number | null }[];
}

export interface GeoUnit { id: number; name: string; color: string }

export interface AppData {
  grid: Grid;
  pois: Poi[];
  photos: Photo[];
  weather: Weather;
  traverse: GeoJSON.FeatureCollection;
  waypoints: GeoJSON.FeatureCollection;
  geology: GeoJSON.FeatureCollection & { units: GeoUnit[] };
  validation: { n: number; pairs: [number, number][] };
}

export interface Inventory { food: number; water: number; o2: number; battery: number; bagsHave: number; bagsMax: number }

export interface Trip {
  start: LL | null; dest: LL | null;
  earliest: SolTime; latest: SolTime;
  purpose: string; round: boolean; crew: number; mode: string; priority: number; // priority 0 = safety, 1 = science
}

export interface Route {
  id: "A" | "B" | "C"; name: string; color: string;
  path: LL[]; lengthM: number;
  oneWayH: number; totalH: number;
  terrain: number; env: number; margin: number; safety: number;
  science: number; resources: number; sites: Poi[];
  depart: SolTime | null; arrive: SolTime | null; back: SolTime | null;
  ok: boolean; reasons: string[]; shortOn: string[];
  pnr: { idx: number; ll: LL; km: number } | null; pnrNote: string;
  profile: { d: number; z: number; s: number }[];
  cumH: number[]; // cumulative one-way hours at each path point
  worstStretch: number;
  meanSafety: number; meanSci: number; fracRes: number; hydrous: boolean; stopsH: number;
  supplies: { name: string; need: number; have: number; unit: string }[];
}

export interface Upload {
  id: string; name: string; cols: string[]; rows: Record<string, string>[];
  layerType: string; map: { lat: string; lon: string; value: string; label: string };
}

export interface LogEntry { t: string; msg: string }
