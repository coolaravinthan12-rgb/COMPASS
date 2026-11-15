import { useRef, useState } from "react";
import Papa from "papaparse";
import type { Upload } from "../types";
import { UPLOAD_TYPES, delUpload, putUpload, startTrain, type MlStatus } from "../lib/ml";

const TYPES = ["Rover traverse log", "Sample results", "Weather", "Surface change", "Other points"];

function parseSql(text: string): { cols: string[]; rows: Record<string, string>[] } {
  // Minimal: INSERT INTO t (a,b) VALUES (1,'x'),(2,'y');  Nothing else is executed.
  const rows: Record<string, string>[] = []; let cols: string[] = [];
  const re = /insert\s+into\s+[^\s(]+\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    cols = m[1].split(",").map((c) => c.trim().replace(/[`"\[\]]/g, ""));
    for (const t of m[2].matchAll(/\(([^)]*)\)/g)) {
      const vals = t[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
      rows.push(Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""])));
    }
  }
  return { cols, rows };
}

const guess = (cols: string[], re: RegExp) => cols.find((c) => re.test(c)) ?? "";
const pct = (x?: number) => (x == null ? "—" : x.toFixed(3));

interface Props { uploads: Upload[]; setUploads: (u: Upload[]) => void; back: () => void; ml: MlStatus | null; refreshML: () => Promise<MlStatus | null> }

export default function UploadPage({ uploads, setUploads, back, ml, refreshML }: Props) {
  const [sel, setSel] = useState<string | null>(uploads[0]?.id ?? null);
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cur = uploads.find((u) => u.id === sel) ?? null;
  const online = !!ml;
  const training = busy || !!ml?.training;
  const r = ml?.report ?? null;

  // keep the backend copy of a file in step with what the page shows (only the four trainable types are sent)
  const sync = async (u: Upload) => {
    if (!online) return;
    if (!UPLOAD_TYPES[u.layerType]) { await delUpload(u.id); setNotes((n) => { const { [u.id]: _, ...rest } = n; return rest; }); refreshML(); return; }
    try {
      const res = await putUpload(u);
      setNotes((n) => ({ ...n, [u.id]: { ok: true, text: `${res.rows} rows accepted${res.rejected ? `, ${res.rejected} rejected` : ""}. Press Train model to use them.` } }));
    } catch (e) {
      setNotes((n) => ({ ...n, [u.id]: { ok: false, text: (e as Error).message } }));
    }
    refreshML();
  };

  const handle = async (files: FileList | null) => {
    if (!files) return;
    const added: Upload[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text();
      let cols: string[] = [], rows: Record<string, string>[] = [];
      if (/\.sql$/i.test(f.name)) ({ cols, rows } = parseSql(text));
      else { const p = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }); cols = p.meta.fields ?? []; rows = p.data; }
      if (!rows.length) { setMsg(`${f.name}: no rows found. CSV needs a header row; SQL needs INSERT INTO t (cols) VALUES (...);`); continue; }
      setMsg("");
      // guess the layer type from the columns so the common cases need no clicks
      const low = cols.map((c) => c.toLowerCase());
      const has = (...n: string[]) => n.every((x) => low.includes(x));
      const layerType = has("rock_type") ? "Sample results" : has("change_type") ? "Surface change" : has("dust_tau") ? "Weather" : has("lat", "lon", "sol") ? "Rover traverse log" : "Other points";
      added.push({ id: crypto.randomUUID(), name: f.name, cols, rows, layerType, map: { lat: guess(cols, /^lat/i), lon: guess(cols, /^(lon|lng|long)/i), value: guess(cols, /^(val|value)/i), label: guess(cols, /^(label|name)/i) } });
    }
    if (!added.length) return;
    setUploads([...uploads, ...added]); setSel(added[0].id);
    for (const u of added) sync(u);
  };
  const patch = (id: string, p: Partial<Upload>) => {
    const next = uploads.map((u) => (u.id === id ? { ...u, ...p } : u));
    setUploads(next);
    const u = next.find((x) => x.id === id); if (u) sync(u);
  };
  const remove = (id: string) => { setUploads(uploads.filter((x) => x.id !== id)); if (sel === id) setSel(null); delUpload(id).then(() => refreshML()); setNotes((n) => { const { [id]: _, ...rest } = n; return rest; }); };

  const train = async () => {
    setBusy(true); setMsg("");
    const err = await startTrain();
    if (err) { setMsg(err); setBusy(false); return; }
    for (let i = 0; i < 300; i++) {                       // poll up to ~10 minutes
      await new Promise((r2) => setTimeout(r2, 2000));
      const s = await refreshML();
      if (s && !s.training) { if (s.error) setMsg(`Training failed: ${s.error}`); break; }
    }
    setBusy(false);
  };

  const okRows = cur ? cur.rows.filter((row) => isFinite(parseFloat(row[cur.map.lat])) && isFinite(parseFloat(row[cur.map.lon]))).length : 0;
  const need = cur && UPLOAD_TYPES[cur.layerType] ? ml?.schemas?.[UPLOAD_TYPES[cur.layerType]] : null;
  const trainedOn = r ? (typeof r.trained_on === "string" ? r.trained_on : r.trained_on.map((t) => t.name).join(", ")) : "—";
  const top = (o: Record<string, number>) => Object.entries(o).slice(0, 3).map(([k, v]) => `${k.replace("u_", "unit ")} ${(v * 100).toFixed(0)}%`).join(", ");

  return (
    <div className="upload">
      <div className="uptop">
        <button onClick={back}>← Back to map</button><b>UPLOAD DATA · ML MODEL</b><span style={{ width: 120 }} />
      </div>
      <div className="upbody">
        <div className="upleft">
          <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files); }}>
            <b>Drop CSV / SQL files here</b>
            <div className="mut">or <a href="#" onClick={(e) => { e.preventDefault(); input.current?.click(); }}>[Browse files]</a></div>
            <input ref={input} type="file" accept=".csv,.sql,text/csv" multiple hidden onChange={(e) => handle(e.target.files)} />
            {msg && <div className="err">{msg}</div>}
            <div className="mut small">Set each file's layer type below. Traverse logs, sample results, weather and surface-change files retrain the model. “Other points” are only plotted on the map.</div>
          </div>
          <div className="files">
            <b>Uploaded files</b>
            {uploads.length === 0 && <div className="mut">No files yet.</div>}
            {uploads.map((u) => (
              <div key={u.id}>
                <div className={`frow ${u.id === sel ? "on" : ""}`} onClick={() => setSel(u.id)}>
                  <span>{u.name}</span><span>{u.rows.length} rows</span><span>{u.cols.length} cols</span>
                  <select value={u.layerType} onClick={(e) => e.stopPropagation()} onChange={(e) => patch(u.id, { layerType: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(u.id); }}>remove</a>
                </div>
                {notes[u.id] && <div className={`small ${notes[u.id].ok ? "okTxt" : "err"}`} style={{ padding: "0 6px 4px" }}>{notes[u.id].text}</div>}
              </div>
            ))}
          </div>
        </div>
        <aside className="upright">
          <b>MODEL</b>
          {cur ? (
            <>
              <div className="mut">Preview: first rows of {cur.name}</div>
              <div className="preview"><table><thead><tr>{cur.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{cur.rows.slice(0, 4).map((row, i) => <tr key={i}>{cur.cols.map((c) => <td key={c}>{row[c]}</td>)}</tr>)}</tbody></table></div>
              <div>Map columns → lat · lon · value · label</div>
              {(["lat", "lon", "value", "label"] as const).map((k) => (
                <label key={k} className="maprow">{k}
                  <select value={cur.map[k]} onChange={(e) => patch(cur.id, { map: { ...cur.map, [k]: e.target.value } })}>
                    <option value="">—</option>{cur.cols.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              ))}
              <div className={okRows ? "okTxt" : "warnTxt"}>{okRows} of {cur.rows.length} rows have a valid lat/lon.</div>
              {need && <div className="mut small">{cur.layerType} needs columns: {need.join(", ")}</div>}
            </>
          ) : <div className="mut">Select a file to preview it and map its columns.</div>}

          <div className="hr" />
          {!online ? (
            <div className="warnTxt">The model service is not running, so the map uses the built-in estimate. Start the backend (see the README) to train.</div>
          ) : (
            <>
              <div>Status: <b className={training ? "warnTxt" : "okTxt"}>{training ? "training…" : ml?.ready ? "ready" : "not trained"}</b></div>
              <div className="mut">Version <b className="num">{ml?.version ? `v${ml.version}` : "—"}</b> · accuracy <b className="num">AUC {pct(r?.safety.metrics.auc)}</b> · trained on {trainedOn}</div>
              {r && (
                <div className="modelbox">
                  <div><b>Safety estimator</b> <span className="mut">({r.safety.mode})</span></div>
                  <div className="mut small">Held-out map blocks ({r.safety.metrics.split}), measured against its own labels (mostly rules): AUC {pct(r.safety.metrics.auc)}, Brier {pct(r.safety.metrics.brier)}, accuracy {pct(r.safety.metrics.accuracy)}. Trained on {r.safety.metrics.n_train?.toLocaleString()} cells.</div>
                  <div className="mut small">Driven by: {top(r.safety.importance)}.</div>
                  {r.rover_tilt_check && <div className="mut small">Independent check: lower estimated safety vs rover-measured tilt at {r.rover_tilt_check.n} stops, Spearman ρ = <b className="num">{r.rover_tilt_check.spearman}</b>{r.rover_tilt_check.baseline_slope_spearman != null && <> (plain slope alone: {r.rover_tilt_check.baseline_slope_spearman})</>}. Not validated against real hazards.</div>}
                  <div className="mut small">Map: estimated safety {r.summary.safe_pct}% higher, {r.summary.caution_pct}% medium, {r.summary.unsafe_pct}% lower, {r.summary.blocked_cells.toLocaleString()} cells blocked (slope over 25°).</div>
                  <div style={{ marginTop: 4 }}><b>Sampling-likeness estimator</b> <span className="mut">({r.discovery.mode})</span></div>
                  <div className="mut small">Held-out map blocks ({r.discovery.metrics.split}): AUC {pct(r.discovery.metrics.auc)}, Brier {pct(r.discovery.metrics.brier)}. {r.counts.sample_sites_in_grid} sample sites.</div>
                  <div className="mut small">Driven by: {top(r.discovery.importance)}.</div>
                  {r.weather.penalty > 0 && <div className="warnTxt small">Weather penalty applied: −{r.weather.penalty} points of estimated safety.</div>}
                  <div className="mut small">Trained {r.trained_at} in {r.seconds}s. Labels: {r.counts.traverse_cells} real traverse cells + slope rules.</div>
                </div>
              )}
              {ml?.error && <div className="err small">{ml.error}</div>}
              <button className="primary" style={{ marginTop: "auto" }} disabled={training} onClick={train}>{training ? "Training…" : "Train model"}</button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
