// Mars time, sun position and Earth-Mars light delay.
// Algorithms: Allison & McEwen (2000) "Mars24" and Standish approximate planetary elements (valid 1800-2050).
import type { SolTime } from "../types";

const D = Math.PI / 180;
export const SITE_LON = 77.45; // degrees east (Jezero)
export const SITE_LAT = 18.44;
const SOL_DAYS = 1.0274912517;

const jdUT = (ms: number) => ms / 86400000 + 2440587.5;
const jdTT = (ms: number) => jdUT(ms) + 69.184 / 86400; // TT - UTC = 69.184 s (37 leap seconds)
const msd = (ms: number) => (jdTT(ms) - 2451549.5) / SOL_DAYS + 44796.0 - 0.0009626;

// Calibrate sol numbering and LMST on a real Perseverance image: Sol 1500, LMST 17:04:00.006,
// taken 2025-05-10T03:37:30.876Z (NASA raw-images API).
const REF_MS = Date.parse("2025-05-10T03:37:30.876Z");
const REF_LMST = 17 + 4 / 60 + 0.006 / 3600;
const mtcHours = (ms: number) => (((msd(ms) % 1) + 1) % 1) * 24;
const LMST_OFFSET = (((REF_LMST - mtcHours(REF_MS)) % 24) + 24) % 24; // hours added to MTC
const localDay = (ms: number) => msd(ms) + LMST_OFFSET / 24;
const SOL_K = Math.floor(localDay(REF_MS)) - 1500;

export const missionSol = (ms: number) => Math.floor(localDay(ms)) - SOL_K;
export const lmstHours = (ms: number) => (((localDay(ms) % 1) + 1) % 1) * 24;

export function solTimeToMs(st: SolTime): number {
  const ld = SOL_K + st.sol + st.hour / 24;
  const m = ld - LMST_OFFSET / 24;
  return ((m - 44796.0 + 0.0009626) * SOL_DAYS + 2451549.5 - 69.184 / 86400 - 2440587.5) * 86400000;
}
export function msToSolTime(ms: number): SolTime { return { sol: missionSol(ms), hour: lmstHours(ms) }; }
// Add real (Earth) hours to a sol time. Durations in COMPASS are real hours (suit O2, battery, walking speed).
export function addRealHours(st: SolTime, h: number): SolTime {
  return msToSolTime(solTimeToMs(st) + h * 3600000);
}

export function fmtHM(h: number): string {
  const t = ((h % 24) + 24) % 24; let hh = Math.floor(t), mm = Math.round((t - hh) * 60);
  if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
export const fmtSol = (st: SolTime | null) => (st ? `Sol ${st.sol} · ${fmtHM(st.hour)}` : "—");

export interface Sun { ls: number; ltst: number; elev: number; az: number; decl: number; sunrise: number; sunset: number }

export function sunAt(ms: number, latDeg = SITE_LAT): Sun {
  const dT = jdTT(ms) - 2451545.0;
  const M = (19.3871 + 0.52402073 * dT) * D;
  const aFMS = 270.3863 + 0.5240384 * dT;
  const A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.002, 0.0018];
  const tau = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
  const phi = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
  let pbs = 0;
  for (let i = 0; i < 7; i++) pbs += A[i] * Math.cos((0.985626 * dT / tau[i] + phi[i]) * D);
  const eoc = (10.691 + 3.0e-7 * dT) * Math.sin(M) + 0.623 * Math.sin(2 * M) + 0.05 * Math.sin(3 * M) + 0.005 * Math.sin(4 * M) + 0.0005 * Math.sin(5 * M) + pbs;
  const ls = (((aFMS + eoc) % 360) + 360) % 360;
  const lsr = ls * D;
  const decl = Math.asin(Math.sin(25.19 * D) * Math.sin(lsr));
  const eot = 2.861 * Math.sin(2 * lsr) - 0.071 * Math.sin(4 * lsr) + 0.002 * Math.sin(6 * lsr) - eoc; // degrees
  const ltst = (((lmstHours(ms) + eot / 15) % 24) + 24) % 24;
  const H = (ltst - 12) * 15 * D;
  const lat = latDeg * D;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const elev = Math.asin(sinEl) / D;
  const x = -Math.sin(H) * Math.cos(decl);
  const y = Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.sin(lat) * Math.cos(H);
  const az = (((Math.atan2(x, y) / D) % 360) + 360) % 360;
  const cosH0 = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
  const H0 = Math.acos(cosH0) / D / 15;
  return { ls, ltst, elev, az, decl: decl / D, sunrise: 12 - H0, sunset: 12 + H0 };
}

// One-way light time Earth <-> Mars in minutes.
const EL = {
  earth: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37306329], w: [102.93768193, 0.32327364], O: [0, 0] },
  mars: { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
};
function helio(b: typeof EL.earth, T: number): [number, number, number] {
  const f = (p: number[]) => p[0] + p[1] * T;
  const a = f(b.a), e = f(b.e), I = f(b.I) * D, L = f(b.L), w = f(b.w), O = f(b.O) * D;
  const om = (w - f(b.O)) * D;
  let M = (((L - w) % 360) + 540) % 360 - 180; M *= D;
  let E = M; for (let i = 0; i < 12; i++) E = M + e * Math.sin(E);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const x = (Math.cos(om) * Math.cos(O) - Math.sin(om) * Math.sin(O) * Math.cos(I)) * xp + (-Math.sin(om) * Math.cos(O) - Math.cos(om) * Math.sin(O) * Math.cos(I)) * yp;
  const y = (Math.cos(om) * Math.sin(O) + Math.sin(om) * Math.cos(O) * Math.cos(I)) * xp + (-Math.sin(om) * Math.sin(O) + Math.cos(om) * Math.cos(O) * Math.cos(I)) * yp;
  const z = Math.sin(om) * Math.sin(I) * xp + Math.cos(om) * Math.sin(I) * yp;
  return [x, y, z];
}
export function earthDelayMin(ms: number): number {
  const T = (jdTT(ms) - 2451545.0) / 36525;
  const e = helio(EL.earth, T), m = helio(EL.mars, T);
  const au = Math.hypot(e[0] - m[0], e[1] - m[1], e[2] - m[2]);
  return (au * 499.004784) / 60;
}

export function parseSolTime(s: string): SolTime | null {
  const m = s.match(/(\d{1,5})\D+(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = +m[2] + +m[3] / 60;
  if (h >= 24 || +m[3] >= 60) return null;
  return { sol: +m[1], hour: h };
}
