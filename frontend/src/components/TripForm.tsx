import { useEffect, useState } from "react";
import type { LL, SolTime, Trip } from "../types";
import { fmtSol, parseSolTime } from "../lib/mars";
import { parseLatLon } from "../lib/route";

interface Props { trip: Trip; setTrip: (t: Trip) => void; picking: "start" | "dest" | null; setPicking: (p: "start" | "dest" | null) => void; onFind: (t: Trip) => void }

const fmtLL = (ll: LL | null) => (ll ? `${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}` : "");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="fld">{label}{children}</label>;
}

export default function TripForm({ trip, setTrip, picking, setPicking, onFind }: Props) {
  const [d, setD] = useState({ start: fmtLL(trip.start), dest: fmtLL(trip.dest), e: fmtSol(trip.earliest), l: fmtSol(trip.latest) });
  useEffect(() => setD((x) => ({ ...x, start: fmtLL(trip.start), dest: fmtLL(trip.dest) })), [trip.start, trip.dest]);
  useEffect(() => setD((x) => ({ ...x, e: fmtSol(trip.earliest), l: fmtSol(trip.latest) })), [trip.earliest, trip.latest]);

  const ll = (key: "start" | "dest") => (
    <input type="text" placeholder="click map / lat,lon" value={d[key]} className={picking === key ? "armed" : ""}
      onFocus={() => setPicking(key)} onChange={(e) => setD({ ...d, [key]: e.target.value })}
      onBlur={() => { const p = parseLatLon(d[key]); setTrip({ ...trip, [key]: d[key].trim() === "" ? null : p ?? trip[key] }); }} />
  );
  const sol = (key: "earliest" | "latest", dk: "e" | "l") => (
    <input type="text" placeholder="Sol __ · __:__" value={d[dk]} onChange={(e) => setD({ ...d, [dk]: e.target.value })}
      onBlur={() => { const p: SolTime | null = parseSolTime(d[dk]); setTrip({ ...trip, [key]: p ?? trip[key] }); setD((x) => ({ ...x, [dk]: fmtSol(p ?? trip[key]) })); }} />
  );
  return (
    <div className="tripform">
      <Field label="Start position">{ll("start")}</Field>
      <Field label="Destination">{ll("dest")}</Field>
      <Field label="Earliest start">{sol("earliest", "e")}</Field>
      <Field label="Latest return">{sol("latest", "l")}</Field>
      <Field label="Purpose">
        <select value={trip.purpose} onChange={(e) => setTrip({ ...trip, purpose: e.target.value })}>
          <option>Science sampling</option><option>Resource survey</option><option>Scouting</option><option>Maintenance</option>
        </select>
      </Field>
      <label className="chk"><input type="checkbox" checked={trip.round} onChange={(e) => setTrip({ ...trip, round: e.target.checked })} /> Round trip</label>
      <Field label="Crew size"><input type="number" min={1} max={6} value={trip.crew} onChange={(e) => setTrip({ ...trip, crew: Math.max(1, Math.min(6, +e.target.value || 1)) })} /></Field>
      <Field label="Mode">
        <select value={trip.mode} onChange={(e) => setTrip({ ...trip, mode: e.target.value })}><option>Walk</option><option>Rover</option><option>Rover + walk</option></select>
      </Field>
      <label className="fld span3">Priority: Safety ◀──●──▶ Science
        <input type="range" min={0} max={1} step={0.05} value={trip.priority} onChange={(e) => setTrip({ ...trip, priority: +e.target.value })} />
      </label>
      <button className="primary" onClick={() => {
        // commit any text still being edited, then plan with those exact values
        const t: Trip = {
          ...trip,
          start: d.start.trim() === "" ? null : parseLatLon(d.start) ?? trip.start,
          dest: d.dest.trim() === "" ? null : parseLatLon(d.dest) ?? trip.dest,
          earliest: parseSolTime(d.e) ?? trip.earliest, latest: parseSolTime(d.l) ?? trip.latest,
        };
        setTrip(t); onFind(t);
      }}>Find routes</button>
    </div>
  );
}
