import { useState } from "react";
import { CATEGORIES, OVERLAYS } from "../lib/layers";
import type { LayerState } from "./MapView";
import type { Inventory, Route } from "../types";

interface Props {
  layers: LayerState; setLayers: (l: LayerState) => void; inv: Inventory; setInv: (i: Inventory) => void; toUpload: () => void;
  needs?: Route["supplies"]; routeName?: string;
}

// Small line icons, one per layer group and overlay.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONS: Record<string, JSX.Element> = {
  optical: <><circle cx="8" cy="8" r="5.5" {...P} /><circle cx="8" cy="8" r="2" {...P} /></>,
  thermal: <><path d="M8 2.5v6.2" {...P} /><path d="M6 9.2V4a2 2 0 0 1 4 0v5.2a3.2 3.2 0 1 1-4 0z" {...P} /></>,
  topographic: <path d="M1.5 13l4.2-7 2.6 4 1.7-2.6 4.5 5.6z" {...P} />,
  geophysical: <><path d="M8 2l6 3-6 3-6-3z" {...P} /><path d="M2 8l6 3 6-3M2 11l6 3 6-3" {...P} /></>,
  atmospheric: <><path d="M2 6h8a2 2 0 1 0-2-2" {...P} /><path d="M2 9.5h10.5a2 2 0 1 1-2 2" {...P} /></>,
  chemical: <><path d="M6.2 2h3.6M7 2v4L3.2 12.4A1.2 1.2 0 0 0 4.2 14h7.6a1.2 1.2 0 0 0 1-1.6L9 6V2" {...P} /><path d="M5 10.5h6" {...P} /></>,
  traverse: <><circle cx="3" cy="12.5" r="1.5" {...P} /><circle cx="13" cy="3.5" r="1.5" {...P} /><path d="M4.5 12.5H9a2.2 2.2 0 0 0 0-4.5H7a2.2 2.2 0 0 1 0-4.5h4.5" {...P} /></>,
  photos: <><rect x="1.8" y="4.5" width="12.4" height="8.5" rx="1.8" {...P} /><path d="M5.8 4.5l1-1.8h2.4l1 1.8" {...P} /><circle cx="8" cy="8.7" r="2.2" {...P} /></>,
  upload: <><path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z" {...P} /><circle cx="8" cy="6.5" r="1.6" {...P} /></>,
};
const Icon = ({ id }: { id: string }) => <svg className="lic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{ICONS[id]}</svg>;

const SUPPLY: { key: keyof Inventory; name: string; label: string; unit: string }[] = [
  { key: "o2", name: "Oxygen", label: "O₂", unit: "h" }, { key: "water", name: "Water", label: "Water", unit: "L" },
  { key: "food", name: "Food", label: "Food", unit: "meals" }, { key: "battery", name: "Battery", label: "Battery", unit: "%" },
];

export default function LayersPanel({ layers, setLayers, inv, setInv, toUpload, needs, routeName }: Props) {
  const [edit, setEdit] = useState(false);
  const tgl = (id: string) => setLayers({ ...layers, on: { ...layers.on, [id]: !layers.on[id] } });
  const num = (k: keyof Inventory) => (
    <input type="number" min={0} value={inv[k]} aria-label={String(k)} onChange={(e) => setInv({ ...inv, [k]: Math.max(0, +e.target.value) })} />
  );
  const need = (name: string) => needs?.find((s) => s.name === name)?.need;
  const bagNeed = need("Sample bags");

  return (
    <aside className="left">
      <section>
        <div className="ttl">LAYERS</div>
        {CATEGORIES.map((c) => {
          const on = !!layers.on[c.id];
          return (
            <div key={c.id} className={`layer ${on ? "on" : ""}`}>
              <label className="lrow">
                <Icon id={c.id} /><span className="lname">{c.name}</span>
                <input type="checkbox" checked={on} onChange={() => tgl(c.id)} /><span className="sw" />
              </label>
              {c.subs.length > 1 && on && (
                <div className="subs" role="group" aria-label={`${c.name} layer`}>
                  {c.subs.map((s) => (
                    <button key={s.id} className={(layers.sub[c.id] ?? c.subs[0].id) === s.id ? "on" : ""} title={s.label}
                      onClick={() => setLayers({ ...layers, sub: { ...layers.sub, [c.id]: s.id } })}>{s.short}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section>
        <div className="ttl">OVERLAYS</div>
        {OVERLAYS.map((o) => (
          <div key={o.id} className={`layer ${layers.ov[o.id] ? "on" : ""}`}>
            <label className="lrow">
              <Icon id={o.id} /><span className="lname">{o.name}</span>
              <input type="checkbox" checked={!!layers.ov[o.id]} onChange={() => setLayers({ ...layers, ov: { ...layers.ov, [o.id]: !layers.ov[o.id] } })} /><span className="sw" />
            </label>
          </div>
        ))}
      </section>

      <section className="supplies">
        <div className="sh"><span className="ttl">INVENTORY / SUPPLIES</span><a href="#" onClick={(e) => { e.preventDefault(); setEdit(!edit); }}>{edit ? "Done" : "Edit"}</a></div>
        {SUPPLY.map((s) => {
          const n = need(s.name), have = inv[s.key], short = n != null && have < n;
          const fill = n == null ? 0 : Math.min(100, (n / Math.max(have, 0.0001)) * 100);
          return (
            <div key={s.key} className={`srow ${short ? "short" : ""}`}>
              <div className="stop"><span>{s.label}</span>{edit ? num(s.key) : <b>{have}<small> {s.unit}</small></b>}</div>
              {!edit && <div className="sbar" title={n != null ? `${routeName} needs ${n.toFixed(1)} ${s.unit} of your ${have} ${s.unit}` : "Pick a route to see what it needs"}><i style={{ width: `${fill}%` }} /></div>}
            </div>
          );
        })}
        <div className={`srow ${bagNeed != null && inv.bagsHave < bagNeed ? "short" : ""}`}>
          <div className="stop"><span>Sample bags</span>{edit ? <span className="two">{num("bagsHave")}{num("bagsMax")}</span> : <b>{inv.bagsHave}<small>/{inv.bagsMax}</small></b>}</div>
          {!edit && <div className="sbar" title={bagNeed != null ? `${routeName} needs ${bagNeed} of your ${inv.bagsHave} free bags` : "Free bags of total"}><i style={{ width: `${bagNeed != null ? Math.min(100, (bagNeed / Math.max(inv.bagsHave, 0.0001)) * 100) : 0}%` }} /></div>}
        </div>
        {!edit && <div className="scap">{needs ? <>Bars show what <b>{routeName}</b> uses, reserve included.</> : "Pick a route to see what it uses."}</div>}
      </section>

      <button className="upbtn" onClick={toUpload}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11V3M4.8 5.8L8 2.6l3.2 3.2M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" {...P} /></svg>
        Upload data →
      </button>
    </aside>
  );
}
