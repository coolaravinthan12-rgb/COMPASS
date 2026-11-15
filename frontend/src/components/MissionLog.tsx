import type { LogEntry } from "../types";

export default function MissionLog({ log, onClose, onClear }: { log: LogEntry[]; onClose: () => void; onClear: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="row"><b>MISSION LOG</b><button className="tab" onClick={onClose}>Close</button></div>
        <div className="mut">Stored in this browser only.</div>
        <div className="logbody">
          {log.length === 0 && <div className="mut">No entries yet. Plan and confirm a route.</div>}
          {[...log].reverse().map((e, i) => <div key={i}><span className="mut">{e.t}</span> {e.msg}</div>)}
        </div>
        <button className="dashed" onClick={onClear} disabled={!log.length}>Clear log</button>
      </div>
    </div>
  );
}
