import type { Inventory, Route, Trip } from "../types";
import { addRealHours, fmtSol, solTimeToMs, sunAt } from "../lib/mars";
import { MODES, RESERVE, WATER_L_PER_H } from "../lib/route";

interface Props { route: Route; idx: number; setIdx: (i: number) => void; inv: Inventory; trip: Trip; onEnd: () => void }

// WALK view: simulated progress along the confirmed route with live supply and return numbers.
export default function WalkPanel({ route, idx, setIdx, inv, trip, onEnd }: Props) {
  const i = Math.min(idx, route.path.length - 1);
  const doneKm = route.profile[i].d / 1000, totalKm = route.lengthM / 1000;
  const elapsed = route.cumH[i];                       // one-way hours so far
  const mode = MODES[trip.mode] ?? MODES.Walk;
  const o2Left = inv.o2 - elapsed, battLeft = inv.battery - mode.drain * elapsed;
  const waterLeft = inv.water - WATER_L_PER_H * trip.crew * elapsed;
  const returnH = elapsed;                              // walking back along the same track
  const pastPnr = route.pnr ? i > route.pnr.idx : false;
  const nowSol = route.depart ? addRealHours(route.depart, elapsed) : null;
  const sunset = nowSol ? sunAt(solTimeToMs(nowSol)) : null;
  const margin = o2Left / RESERVE - returnH;
  return (
    <aside className="right">
      <b>WALK · {route.name}</b>
      <div className="mut">Simulated position along the confirmed route (no live tracking).</div>
      <input type="range" min={0} max={route.path.length - 1} value={i} onChange={(e) => setIdx(+e.target.value)} />
      <div className="detail">
        <div>Distance {doneKm.toFixed(2)} / {totalKm.toFixed(2)} km</div>
        <div>Time {nowSol ? fmtSol(nowSol) : "—"} (elapsed {elapsed.toFixed(1)} h)</div>
        <div>Sun elevation {sunset ? sunset.elev.toFixed(0) : "—"}° {sunset && sunset.elev < 0 ? "· AFTER DARK" : ""}</div>
        <div>O₂ left {o2Left.toFixed(1)} h · Water {waterLeft.toFixed(1)} L · Battery {battLeft.toFixed(0)}%</div>
        <div>Walk-back needs {returnH.toFixed(1)} h</div>
        <div className={margin < 0 ? "err" : margin < 1 ? "warnTxt" : "okTxt"}>
          Return margin {margin >= 0 ? "+" : ""}{margin.toFixed(1)} h of O₂ after reserve {margin < 0 ? "· TURN BACK NOW" : ""}
        </div>
        <div className={pastPnr ? "err" : "mut"}>{route.pnr ? (pastPnr ? "▲ Past the point of no return." : `▲ Point of no return at ${route.pnr.km.toFixed(1)} km`) : "▲ No point of no return on this route (supplies cover the round trip)."}</div>
      </div>
      <div className="actions"><button className="dashed" onClick={onEnd}>End walk</button></div>
    </aside>
  );
}
