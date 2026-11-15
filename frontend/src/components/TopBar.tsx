import { earthDelayMin, fmtHM, missionSol, sunAt } from "../lib/mars";

interface Props { now: number; mode: "plan" | "walk"; setMode: (m: "plan" | "walk") => void; walkEnabled: boolean; openLog: () => void }

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="#e9eff8" strokeWidth="1.5" />
      <path d="M13 3.5 L16 13 L13 22.5 L10 13 Z" fill="#f5a344" />
      <path d="M13 3.5 L16 13 L10 13 Z" fill="#ffd199" />
      <circle cx="13" cy="13" r="1.6" fill="#0f1a2c" />
    </svg>
  );
}

const hm = (d: number) => `${Math.floor(d)}h ${String(Math.round((d % 1) * 60)).padStart(2, "0")}m`;

export default function TopBar({ now, mode, setMode, walkEnabled, openLog }: Props) {
  const s = sunAt(now);
  const day = s.ltst >= s.sunrise && s.ltst < s.sunset;
  const untilLabel = day ? "Sunset in" : "Sunrise in";
  const until = day ? s.sunset - s.ltst : (s.sunrise - s.ltst + 24) % 24;
  const delay = earthDelayMin(now);
  const kv = (k: string, v: React.ReactNode, title?: string) => <span className="kv" title={title}><small>{k}</small><b>{v}</b></span>;
  return (
    <div className="topbar">
      <a className="brand" href="#/" title="About COMPASS" style={{ color: "inherit", textDecoration: "none" }}><Mark />COMPASS</a>
      {kv("Sol", missionSol(now), "Mission sol of Perseverance at Jezero")}
      {kv("LTST", fmtHM(s.ltst), "Local true solar time at Jezero")}
      {kv(untilLabel, hm(until), "Sol-clock hours")}
      {kv("Earth delay", `${delay.toFixed(1)} min`, "One-way light time, computed from planetary orbits")}
      <span style={{ flexGrow: 1 }} />
      <div className="seg" role="tablist">
        <button className={mode === "plan" ? "on" : ""} onClick={() => setMode("plan")}>PLAN</button>
        <button className={mode === "walk" ? "on" : ""} onClick={() => setMode("walk")} disabled={!walkEnabled} title={walkEnabled ? "" : "Confirm a route first"}>WALK</button>
      </div>
      <button className="ghost" onClick={openLog}>Mission log</button>
    </div>
  );
}
