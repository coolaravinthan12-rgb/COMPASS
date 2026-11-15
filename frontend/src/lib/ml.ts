// Client for the COMPASS ML backend (FastAPI). If the backend is not running, the app falls back to the built-in heuristic safety index.
import type { Grid, Upload } from "../types";

export interface ModelMetrics { accuracy?: number; auc?: number; brier?: number; n_train?: number; n_test?: number; split?: string; positives?: number; negatives?: number }
export interface ModelPart { metrics: ModelMetrics; importance: Record<string, number>; calibration: { predicted: number; observed: number; n: number }[]; mode: string }
export interface MlReport {
  version: number; trained_at: string; trained_on: { name: string; type: string; rows: number }[] | string; seconds: number;
  counts: Record<string, number>; safety: ModelPart; discovery: ModelPart;
  weather: { penalty: number; current: Record<string, number | string | null> };
  rover_tilt_check: { n: number; spearman: number; baseline_slope_spearman?: number } | null;
  summary: { safe_pct: number; caution_pct: number; unsafe_pct: number; blocked_cells: number; high_priority_discovery_cells: number };
}
export interface MlStatus {
  ready: boolean; training: boolean; version: number; error: string | null; report: MlReport | null;
  uploads: { id: string; name: string; type: string; rows: number; rejected: number }[]; schemas: Record<string, string[]>;
}
export interface MlGrids { version: number; safety: Uint8Array; discovery: Uint8Array; recent: Uint8Array }

// UI layer-type name -> backend upload type ("Other points" is only plotted, never sent)
export const UPLOAD_TYPES: Record<string, string> = {
  "Rover traverse log": "traverse", "Sample results": "samples", "Weather": "weather", "Surface change": "changes",
};

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const api = (p: string, init?: RequestInit) => fetch(`api/${p}`, init);

export async function getStatus(): Promise<MlStatus | null> {
  try { const r = await api("status"); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function getGrids(): Promise<MlGrids | null> {
  try {
    const r = await api("grids"); if (!r.ok) return null;
    const j = await r.json();
    return { version: j.version, safety: b64(j.safety), discovery: b64(j.discovery), recent: b64(j.recent_change) };
  } catch { return null; }
}
export async function putUpload(u: Upload): Promise<{ rows: number; rejected: number; problems: string[] }> {
  const type = UPLOAD_TYPES[u.layerType];
  const r = await api("uploads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: u.id, name: u.name, type, rows: u.rows, map: { lat: u.map.lat, lon: u.map.lon } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Upload rejected.");
  return j;
}
export async function delUpload(id: string) { try { await api(`uploads/${id}`, { method: "DELETE" }); } catch { /* backend offline */ } }
export async function startTrain(): Promise<string | null> {
  const r = await api("train", { method: "POST" });
  if (r.ok) return null;
  const j = await r.json().catch(() => ({})); return typeof j.detail === "string" ? j.detail : "Could not start training.";
}

// Swap the heuristic safety/science bands for the model's. 255 stays "impassable".
export function applyML(g: Grid, m: MlGrids): Grid {
  return { ...g, safety: m.safety, science: Float32Array.from(m.discovery, (v) => v / 100), recent: Float32Array.from(m.recent, (v) => v / 100), ml: true };
}

// Plain-language reason for a cell's score (ML.md section 14), ordered by the model's own feature importance.
export function explainCell(g: Grid, i: number, safety: number, importance: Record<string, number>): string {
  const band = safety >= 80 ? "higher" : safety >= 60 ? "medium" : "lower";
  const parts: string[] = [];
  for (const f of Object.keys(importance)) {
    if (f === "slope") parts.push(`slope ${g.slope[i].toFixed(0)}°`);
    else if (f === "roughness") parts.push(`roughness ${(g.rough[i] * 100).toFixed(0)}% of max`);
    else if (f === "dust") parts.push(g.dust[i] < 0.35 ? "loose, dusty ground" : "firm ground");
    else if (f === "recent_change") parts.push(g.recent && g.recent[i] > 0.3 ? "recent terrain change" : "stable terrain");
    if (parts.length >= 2) break;
  }
  return `Est. safety ${safety} (${band}): ${parts.join(", ")}`;
}

export interface MlInfo { version: number; auc?: number; brier?: number; dAuc?: number; samples?: number; importance: Record<string, number> }
export function mlInfo(s: MlStatus | null): MlInfo | null {
  if (!s || !s.ready || !s.report) return null;
  const r = s.report;
  return { version: s.version, auc: r.safety.metrics.auc, brier: r.safety.metrics.brier, dAuc: r.discovery.metrics.auc, samples: r.counts.sample_sites_in_grid, importance: r.safety.importance };
}
