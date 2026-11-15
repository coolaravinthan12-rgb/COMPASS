#!/usr/bin/env python3
"""Builds the demo data the ML backend trains on (data/demo/):
  - copies the terrain grid and reference layers produced by build_data.py
  - samples.csv  : real sample sites from Herd et al. 2025 (PNAS), Table 1, positioned with the rover's MMGIS waypoint
  - traverse.csv : the Perseverance traverse densified to points (lat, lon, sol)
Run build_data.py first.  Uses Europe PMC's open full-text API for the paper (no scraping of protected pages).
"""
import csv, html, json, math, os, re, shutil
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "frontend", "public", "data")
OUT = os.path.join(HERE, "..", "data", "demo")
os.makedirs(OUT, exist_ok=True)

for f in sorted(x for x in os.listdir(SRC) if x.endswith((".json", ".geojson"))):   # everything the app loads, so /data/* works from the server too
    shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
print("copied reference layers")

# ---------------- samples (Herd et al. 2025, Table 1) ----------------
cache = os.path.join(OUT, "_herd2025.xml")
if not os.path.exists(cache):
    r = requests.get("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11745317/fullTextXML", timeout=60)
    r.raise_for_status()
    open(cache, "w", encoding="utf-8").write(r.text)
xml = open(cache, encoding="utf-8").read()
tw = re.search(r"<table-wrap\b.*?</table-wrap>", xml, flags=re.S).group(0)

def cells(tr):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S)]

samples, by_loc = [], {}
for tr in re.findall(r"<tr>(.*?)</tr>", tw, flags=re.S):
    c = cells(tr)
    if len(c) < 4 or not c[0].isdigit():
        continue
    m = re.match(r"M2020-(\d+)-(\d+)\s+(.*)", c[1])
    if not m:
        continue
    sol, name = int(m.group(1)), m.group(3)
    if "Witness" in c[2] or re.match(r"WB\d", name):
        continue
    if c[2].lower().startswith("same as") and len(c) == 4:
        ref = c[2][8:].strip()
        base = next((s for s in samples if s["name"].lower().startswith(ref.lower()) or s["location"].lower().startswith(ref.lower())), None)
        loc, typ, notes = (base["location"], base["rock_type"], base["notes"]) if base else (c[2], "", "")
    else:
        loc = c[2]; typ = re.sub(r"[§†‡*]", "", c[3]).split("(")[0].strip().split(" ")[0]; notes = c[4] if len(c) > 5 else ""
    samples.append({"sample_no": int(c[0]), "sol": sol, "name": name, "location": loc, "rock_type": typ, "notes": notes})
print(len(samples), "samples parsed")

wp = json.load(open(os.path.join(SRC, "waypoints.geojson"), encoding="utf-8"))["features"]
wp = sorted([(f["properties"]["sol"], f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1]) for f in wp])
def pos(sol):                      # rover position on that sol = last waypoint at or before it (merge_asof, backward)
    best = None
    for s, lo, la in wp:
        if s <= sol: best = (lo, la, s)
        else: break
    return best
rows = []
for s in samples:
    p = pos(s["sol"])
    if p is None:
        continue
    rows.append({**s, "lon": round(p[0], 6), "lat": round(p[1], 6), "waypoint_sol": p[2]})
with open(os.path.join(OUT, "samples.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(f"samples.csv: {len(rows)} rows, sols {min(r['sol'] for r in rows)}-{max(r['sol'] for r in rows)}")

# ---------------- traverse ----------------
tr = json.load(open(os.path.join(SRC, "traverse.geojson"), encoding="utf-8"))["features"]
pts = []
for f in tr:
    g = f["geometry"]; lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    sol = f["properties"]["sol"]
    for ln in lines:
        for a, b in zip(ln[:-1], ln[1:]):
            d = math.hypot((b[0] - a[0]) * 56200, (b[1] - a[1]) * 59270)
            n = max(1, int(d / 25))
            for k in range(n):
                t = k / n
                pts.append((round(a[1] + (b[1] - a[1]) * t, 6), round(a[0] + (b[0] - a[0]) * t, 6), sol))
with open(os.path.join(OUT, "traverse.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["lat", "lon", "sol"]); w.writerows(pts)
print(f"traverse.csv: {len(pts)} points")
