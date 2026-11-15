import type { AppData, Grid, LL, Photo, Poi, Weather } from "../types";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

interface Band { dtype: string; scale: number; data: string }

export function decodeGrid(g: any): Grid {
  const bands: Record<string, Band> = g.bands;
  const u8 = (n: string) => b64(bands[n].data);
  const f32 = (n: string, scale: number) => Float32Array.from(u8(n), (v) => v * scale);
  const e = b64(bands.elev.data);
  return {
    nx: g.nx, ny: g.ny, cell: g.cell, lonW: g.lonW, latN: g.latN, dlon: g.dlon, dlat: g.dlat,
    elev: new Int16Array(e.buffer, e.byteOffset, e.byteLength / 2),
    slope: f32("slope", bands.slope.scale),
    rough: f32("rough", 1 / 255),
    unit: u8("unit"),
    dust: f32("dust", 1 / 255),
    proven: f32("proven", 1 / 255),
    science: f32("science", 1 / 255),
    safety: u8("safety"),
  };
}

export async function loadAll(base = "data/"): Promise<AppData> {
  const j = async (f: string) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return r.json();
  };
  const [grid, pois, photos, weather, traverse, waypoints, geology, validation] = await Promise.all([
    j("grid.json"), j("pois.geojson"), j("photos.json"), j("weather.json"), j("traverse.geojson"), j("waypoints.geojson"), j("geology.geojson"), j("validation.json"),
  ]);
  return {
    grid: decodeGrid(grid),
    pois: (pois.features as any[]).map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }) as Poi),
    photos: photos as Photo[],
    weather: weather as Weather,
    traverse, waypoints, geology, validation,
  };
}

export const cellOf = (g: Grid, lat: number, lon: number): [number, number] => [Math.floor((g.latN - lat) / g.dlat), Math.floor((lon - g.lonW) / g.dlon)];
export const inGrid = (g: Grid, r: number, c: number) => r >= 0 && c >= 0 && r < g.ny && c < g.nx;
export const llOfCell = (g: Grid, r: number, c: number): LL => [g.latN - (r + 0.5) * g.dlat, g.lonW + (c + 0.5) * g.dlon];
export const bounds = (g: Grid): [[number, number], [number, number]] => [[g.latN - g.ny * g.dlat, g.lonW], [g.latN, g.lonW + g.nx * g.dlon]];

export function sample(g: Grid, lat: number, lon: number) {
  const [r, c] = cellOf(g, lat, lon);
  if (!inGrid(g, r, c)) return null;
  const i = r * g.nx + c;
  return { r, c, i, elev: g.elev[i] === -32768 ? null : g.elev[i], slope: g.slope[i], safety: g.safety[i], unit: g.unit[i] };
}

// ---------- raster overlays (drawn to a canvas, shown with L.imageOverlay) ----------
function canvasFrom(g: Grid, fill: (i: number, px: Uint8ClampedArray, o: number) => void): string {
  const cv = document.createElement("canvas");
  cv.width = g.nx; cv.height = g.ny;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(g.nx, g.ny);
  for (let i = 0; i < g.nx * g.ny; i++) fill(i, img.data, i * 4);
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function ramp(stops: [number, number[]][], t: number): number[] {
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
      const u = (t - t0) / (t1 - t0 || 1);
      return [lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), lerp(c0[2], c1[2], u)];
    }
  }
  return stops[stops.length - 1][1];
}
const SAFETY_RAMP: [number, number[]][] = [[0, [239, 91, 82]], [0.5, [242, 193, 78]], [0.65, [226, 214, 90]], [0.8, [70, 196, 160]], [1, [30, 160, 130]]];
const SLOPE_RAMP: [number, number[]][] = [[0, [47, 196, 162]], [0.3, [242, 214, 90]], [0.6, [245, 163, 68]], [1, [239, 91, 82]]];
const SCI_RAMP: [number, number[]][] = [[0, [255, 255, 255]], [0.5, [190, 140, 230]], [1, [100, 30, 170]]];

export function safetyOverlay(g: Grid): string {
  return canvasFrom(g, (i, px, o) => {
    const s = g.safety[i];
    if (s === 255) { px[o] = 20; px[o + 1] = 20; px[o + 2] = 20; px[o + 3] = 200; return; }
    const c = ramp(SAFETY_RAMP, s / 100);
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = s >= 65 ? 110 : 190; // sub-65 cells stand out
  });
}
export function slopeOverlay(g: Grid): string {
  return canvasFrom(g, (i, px, o) => {
    const c = ramp(SLOPE_RAMP, Math.min(1, g.slope[i] / 30));
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 170;
  });
}
export function scienceOverlay(g: Grid): string {
  const floor = g.ml ? 0.6 : 0.08;            // ML discovery: hide scores under 60 % (ML.md section 1)
  return canvasFrom(g, (i, px, o) => {
    const v = g.science[i];
    const c = ramp(SCI_RAMP, Math.min(1, v));
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = v < floor ? 0 : 90 + 140 * v;
  });
}

// Hillshade with cast shadows for a given sun azimuth/elevation (degrees). Night = dark overlay.
export function hillshadeOverlay(g: Grid, az: number, el: number): string {
  const { nx, ny } = g, cell = g.cell;
  const elev = (r: number, c: number) => g.elev[Math.min(ny - 1, Math.max(0, r)) * nx + Math.min(nx - 1, Math.max(0, c))];
  const azr = (az * Math.PI) / 180, elr = (el * Math.PI) / 180;
  const dx = Math.sin(azr), dy = -Math.cos(azr); // direction toward the sun in (col,row) space (row grows south)
  const tanEl = Math.tan(Math.max(elr, 0.001));
  return canvasFrom(g, (i, px, o) => {
    const r = Math.floor(i / nx), c = i % nx;
    if (el <= 0) { px[o] = 5; px[o + 1] = 10; px[o + 2] = 35; px[o + 3] = 170; return; }
    const gE = (elev(r, c + 1) - elev(r, c - 1)) / (2 * cell);
    const gN = -(elev(r + 1, c) - elev(r - 1, c)) / (2 * cell); // rows grow southward
    const nrm = Math.hypot(gE, gN, 1);
    const shade = Math.max(0, (-gE * Math.sin(azr) * Math.cos(elr) - gN * Math.cos(azr) * Math.cos(elr) + Math.sin(elr)) / nrm);
    // cast shadow: march toward the sun
    let shadow = false;
    const z0 = elev(r, c);
    for (let k = 1; k <= 90; k++) {
      const rr = Math.round(r + dy * k), cc = Math.round(c + dx * k);
      if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) break;
      if (elev(rr, cc) - z0 > k * cell * tanEl) { shadow = true; break; }
    }
    const v = shadow ? 0.1 : shade;
    const a = Math.round((1 - v) * 190);
    px[o] = 8; px[o + 1] = 12; px[o + 2] = 40; px[o + 3] = a;
  });
}

export function pointInPath(g: Grid, path: LL[]): number[] {
  return path.map(([la, lo]) => { const [r, c] = cellOf(g, la, lo); return inGrid(g, r, c) ? r * g.nx + c : -1; });
}
