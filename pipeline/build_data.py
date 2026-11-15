#!/usr/bin/env python3
"""Compass data pipeline: downloads/crops public NASA/USGS data for Jezero and writes
static files into ../public/data.  Deterministic (no ML).  Polite: <=1 request/sec.

Usage:  python build_data.py [--skip-photos] [--skip-weather]
Caches downloads in ./cache so re-runs are fast.
"""
import base64, csv, io, json, math, os, sys, time
import numpy as np
import requests
import tifffile
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "frontend", "public", "data")
os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

R = 3396190.0                      # Mars 2000 sphere radius (m)
CELL = 60.0                        # grid cell (m) = 3 x 20 m DEM px
SES = requests.Session()
SES.headers["User-Agent"] = "compass-spaceapps-prototype/0.1"


def get(url, **kw):
    time.sleep(1.0)
    r = SES.get(url, timeout=120, **kw)
    r.raise_for_status()
    return r


def cached(name, url, binary=False):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        print("  GET", url[:110])
        r = get(url)
        with open(p, "wb") as f:
            f.write(r.content)
    return p


def write_json(name, obj):
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  wrote {name}: {os.path.getsize(p)/1024:.0f} KB")


# ------------------------------------------------------------------ DEM
print("== DEM")
dem_path = cached("ctx_dem.tif",
    "https://trek.nasa.gov/mars/TrekWS/rest/cat/data/stream?label="
    "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0")
with tifffile.TiffFile(dem_path) as t:
    pg = t.pages[0]
    dem = pg.asarray().astype("float64")
    px = pg.tags[33550].value[0]
    tie = pg.tags[33922].value
X0, Y0 = tie[3], tie[4]
dem[dem < -1e6] = np.nan
H, W = dem.shape
ny, nx = H // 3, W // 3
dem = dem[: ny * 3, : nx * 3]
print("  DEM", dem.shape, "nan%", np.isnan(dem).mean() * 100)

# lon/lat of DEM pixel centres
def xy_to_lonlat(x, y):
    return np.degrees(x / R), np.degrees(y / R)

def lonlat_to_xy(lon, lat):
    return np.radians(lon) * R, np.radians(lat) * R

rows = np.arange(dem.shape[0])
lat_row = np.degrees((Y0 - (rows + 0.5) * px) / R)
cosl = np.cos(np.radians(lat_row))[:, None]

# slope (deg) at 20 m; true E-W distance shrinks by cos(lat)
dz_dx = np.gradient(dem, axis=1) / (px * cosl)
dz_dy = -np.gradient(dem, axis=0) / px
slope20 = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))

# roughness: residual from 5x5 mean (20 m px)
dem_f = np.where(np.isnan(dem), np.nanmean(dem), dem)
resid = dem_f - ndimage.uniform_filter(dem_f, 5)

def blocks(a):
    return a.reshape(ny, 3, nx, 3).transpose(0, 2, 1, 3).reshape(ny, nx, 9)

elev = np.nanmean(blocks(dem), axis=2)
slope = np.nanpercentile(blocks(slope20), 90, axis=2)
rough = np.sqrt(np.nanmean(blocks(resid) ** 2, axis=2))
nan_cell = np.isnan(elev) | np.isnan(slope)
print("  slope deg p50/p90/max", np.nanpercentile(slope, [50, 90, 100]).round(1))

# grid georef (cell centres)
gx = X0 + (np.arange(nx) * 3 + 1.5) * px
gy = Y0 - (np.arange(ny) * 3 + 1.5) * px
glon = np.degrees(gx / R)
glat = np.degrees(gy / R)
lon_w = float(np.degrees(X0 / R)); lat_n = float(np.degrees(Y0 / R))
dlon = float(np.degrees(3 * px / R)); dlat = float(np.degrees(3 * px / R))   # equirect: same degrees
lon_e = lon_w + nx * dlon; lat_s = lat_n - ny * dlat
print(f"  grid {nx}x{ny}  lon {lon_w:.4f}..{lon_e:.4f}  lat {lat_s:.4f}..{lat_n:.4f}")
GLON, GLAT = np.meshgrid(glon, glat)

def ll_to_rc(lon, lat):
    return (lat_n - lat) / dlat, (lon - lon_w) / dlon     # float row, col (cell edges at integer)

# ------------------------------------------------------------------ traverse / waypoints
print("== Traverse + waypoints (MMGIS)")
trav = json.load(open(cached("m20_traverse.json", "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json"), encoding="utf-8"))
wpts = json.load(open(cached("m20_waypoints.json", "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json"), encoding="utf-8"))

def inside(lon, lat):
    return lon_w <= lon <= lon_e and lat_s <= lat <= lat_n

tfeat, trav_pts = [], []
for f in trav["features"]:
    g = f["geometry"]
    lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    keep = []
    for ln in lines:
        pts = [[round(p[0], 5), round(p[1], 5)] for p in ln]
        if any(inside(*p) for p in pts):
            keep.append(pts)
            trav_pts += pts
    if keep:
        tfeat.append({"type": "Feature", "properties": {"sol": f["properties"]["sol"], "len": f["properties"].get("length")},
                      "geometry": {"type": "LineString", "coordinates": keep[0]} if len(keep) == 1 else {"type": "MultiLineString", "coordinates": keep}})
write_json("traverse.geojson", {"type": "FeatureCollection", "features": tfeat})

wf, wmap = [], {}
for f in wpts["features"]:
    p = f["properties"]
    lon, lat = p["lon"], p["lat"]
    if not inside(lon, lat):
        continue
    props = {"rmc": p["RMC"], "sol": p["sol"], "elev": round(p["elev_geoid"], 1), "tilt": round(p["tilt"], 1) if p.get("tilt") is not None else None,
             "km": p.get("dist_km")}
    wmap[p["RMC"]] = (lon, lat, p["sol"])
    wf.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]}})
write_json("waypoints.geojson", {"type": "FeatureCollection", "features": wf})
print(f"  {len(tfeat)} traverse segments, {len(wf)} waypoints in AOI")

# densify traverse to points every ~20 m for distance transform
mask_tr = np.zeros((ny, nx), bool)
for f in tfeat:
    g = f["geometry"]
    lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    for ln in lines:
        for a, b in zip(ln[:-1], ln[1:]):
            n = max(2, int(math.hypot((b[0] - a[0]) * 59270, (b[1] - a[1]) * 59270) / 20))
            for t in np.linspace(0, 1, n):
                r, c = ll_to_rc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                if 0 <= r < ny and 0 <= c < nx:
                    mask_tr[int(r), int(c)] = True
dist_tr = ndimage.distance_transform_edt(~mask_tr) * CELL
proven = np.clip(1 - (dist_tr - 100) / 2900, 0, 1)

# ------------------------------------------------------------------ geology
print("== Geology (USGS SIM 3464)")
FS = "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/8/query"
geo_cache = os.path.join(CACHE, "geology.json")
if not os.path.exists(geo_cache):
    feats, off = [], 0
    while True:
        u = (f"{FS}?where=1%3D1&outFields=unit,name&outSR=4326&f=geojson&maxAllowableOffset=0.0002&geometryPrecision=5"
             f"&resultOffset={off}&resultRecordCount=200")
        print("  GET page", off)
        d = get(u).json()
        feats += d["features"]
        if len(d["features"]) < 200 and not d.get("properties", {}).get("exceededTransferLimit"):
            break
        off += 200
        if off > 3000: break
    json.dump(feats, open(geo_cache, "w"))
geo = json.load(open(geo_cache))

def canon(n):
    n = (n or "").replace("riim", "rim").strip()
    return n

UNITS = {  # name: (safety traversability 0-1, science interest 0-1, colour)
    "Jezero fan 1 unit": (0.85, 1.0, "#d9a066"), "Jezero fan 2 unit": (0.85, 1.0, "#e6b87a"),
    "Jezero floor unit": (0.95, 0.5, "#9ec27a"), "Lower etched unit": (0.70, 0.8, "#b36bb3"),
    "Upper etched unit": (0.70, 0.7, "#d48ad4"), "Nili Planum fan unit": (0.85, 0.7, "#e0c28f"),
    "Nili Planum 1 unit": (0.80, 0.4, "#7fa8c9"), "Nili Planum 2 unit": (0.80, 0.4, "#a3c4de"),
    "Eolian bedform unit": (0.35, 0.3, "#f2e06b"), "Smooth unit, undivided": (0.95, 0.3, "#c9d9a0"),
    "Rugged bright unit": (0.50, 0.6, "#ffffff"), "Crater rim unit": (0.70, 0.6, "#8f7a6b"),
    "Crater ejecta unit": (0.65, 0.4, "#a58f7d"), "Crater interior unit": (0.75, 0.4, "#7d6b5c"),
}
names = sorted(UNITS)
uid = {n: i + 1 for i, n in enumerate(names)}      # 0 = no unit

gout = []
polys = []
for f in geo:
    n = canon(f["properties"].get("name"))
    if n not in uid or not f.get("geometry"):
        continue
    g = f["geometry"]
    pl = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    area = 0
    for poly in pl:
        ring = poly[0]
        xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        area += abs(sum(xs[i] * ys[i + 1] - xs[i + 1] * ys[i] for i in range(len(ring) - 1))) / 2
    polys.append((area, uid[n], pl))
    gout.append({"type": "Feature", "properties": {"unit": n, "id": uid[n]},
                 "geometry": {"type": g["type"], "coordinates": g["coordinates"]}})
# clip to AOI bbox for output (keep features that intersect)
def bbox_hit(g):
    xs, ys = [], []
    def walk(c):
        if isinstance(c[0], (int, float)): xs.append(c[0]); ys.append(c[1])
        else:
            for k in c: walk(k)
    walk(g["coordinates"])
    return min(xs) <= lon_e and max(xs) >= lon_w and min(ys) <= lat_n and max(ys) >= lat_s
gout = [f for f in gout if bbox_hit(f["geometry"])]
write_json("geology.geojson", {"type": "FeatureCollection", "features": gout,
           "units": [{"id": uid[n], "name": n, "color": UNITS[n][2]} for n in names]})

unit_img = Image.new("L", (nx, ny), 0)
dr = ImageDraw.Draw(unit_img)
for area, i, pl in sorted(polys, key=lambda t: -t[0]):
    for poly in pl:
        pts = [(ll_to_rc(x, y)[1], ll_to_rc(x, y)[0]) for x, y in poly[0]]
        if len(pts) >= 3:
            dr.polygon(pts, fill=i)
unit = np.array(unit_img)
lut_safe = np.array([0.7] + [UNITS[n][0] for n in names])
lut_sci = np.array([0.2] + [UNITS[n][1] for n in names])
unit_s = lut_safe[unit]
contact = (ndimage.maximum_filter(unit, 3) != ndimage.minimum_filter(unit, 3)) & (unit > 0)

# ------------------------------------------------------------------ THEMIS night IR (dust / thermal-inertia proxy)
print("== THEMIS night IR proxy")
Z = 9
c0 = int((lon_w + 180) / 360 * 2 ** (Z + 1)); c1 = int((lon_e + 180) / 360 * 2 ** (Z + 1))
r0 = int((90 - lat_n) / 180 * 2 ** Z); r1 = int((90 - lat_s) / 180 * 2 ** Z)
mos = np.zeros(((r1 - r0 + 1) * 256, (c1 - c0 + 1) * 256))
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        p = cached(f"themis_n_{Z}_{r}_{c}.png", f"https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018/1.0.0/default/default028mm/{Z}/{r}/{c}.png")
        mos[(r - r0) * 256:(r - r0 + 1) * 256, (c - c0) * 256:(c - c0 + 1) * 256] = np.array(Image.open(p).convert("L"))
pxc = (GLON + 180) / 360 * 2 ** (Z + 1) * 256 - c0 * 256 - 0.5
pxr = (90 - GLAT) / 180 * 2 ** Z * 256 - r0 * 256 - 0.5
night = ndimage.map_coordinates(mos, [pxr, pxc], order=1, mode="nearest")
lo, hi = np.percentile(night, [2, 98])
dust_s = np.clip((night - lo) / (hi - lo + 1e-9), 0, 1)

# ------------------------------------------------------------------ POIs
print("== POIs")
pois = []
def add_poi(name, kind, lon, lat, weight, blurb, src):
    if inside(lon, lat):
        pois.append({"type": "Feature", "properties": {"name": name, "kind": kind, "weight": weight, "blurb": blurb, "source": src},
                     "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]}})

mz = json.load(open(cached("mastcamz_poi.geojson", "https://trek.nasa.gov/mars/trekarcgis/rest/services/mastcam_z_waypoints/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"), encoding="utf-8"))
for f in mz["features"]:
    nm = f["properties"]["name"]
    add_poi(nm.replace("Point of Interest (POI) 1", "POI 1 (landing site)"), "panorama", *f["geometry"]["coordinates"][:2], 0.6,
            "Mastcam-Z narrated 360° panorama site near the landing site.", "NASA Trek mastcam_z_waypoints")
cr = json.load(open(cached("crism_hydrous.geojson", "https://trek.nasa.gov/mars/trekarcgis/rest/services/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query?geometry=76.5,17.8,78.3,19.2&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=*&f=geojson"), encoding="utf-8"))
for i, f in enumerate(cr["features"]):
    add_poi(f"Hydrous mineral detection {i+1}", "mineral", *f["geometry"]["coordinates"][:2], 0.8,
            "Orbital (OMEGA/CRISM) detection of hydrated minerals (coarse position).", "Carter et al. 2013 via NASA Trek")
wl = [(f["properties"], f["geometry"]["coordinates"]) for f in wf]
if wl:
    hi_p = max(wl, key=lambda t: t[0]["elev"]); lo_p = min(wl, key=lambda t: t[0]["elev"]); last = max(wl, key=lambda t: t[0]["sol"])
    add_poi("Highest point driven (crater rim)", "traverse", *hi_p[1], 0.7, f"Perseverance end-of-drive at {hi_p[0]['elev']} m, sol {hi_p[0]['sol']}.", "NASA MMGIS waypoints")
    add_poi("Lowest point driven (crater floor)", "traverse", *lo_p[1], 0.5, f"Perseverance end-of-drive at {lo_p[0]['elev']} m, sol {lo_p[0]['sol']}.", "NASA MMGIS waypoints")
    add_poi(f"Rover position, sol {last[0]['sol']}", "traverse", *last[1], 0.6, "Latest waypoint available in the MMGIS dataset.", "NASA MMGIS waypoints")
# largest polygon per science-interesting unit -> centroid-ish POI (pole of inaccessibility approximated by max EDT cell)
for n in ["Jezero fan 1 unit", "Jezero fan 2 unit", "Lower etched unit", "Upper etched unit", "Rugged bright unit", "Eolian bedform unit", "Crater rim unit"]:
    m = unit == uid[n]
    if m.sum() < 8: continue
    d = ndimage.distance_transform_edt(m)
    r, c = np.unravel_index(np.argmax(d), d.shape)
    kind = "hazard" if "Eolian" in n else "geology"
    why = {"Jezero fan": "Ancient river-delta deposits: prime target for biosignature-bearing sediments.",
           "etched": "Layered, wind-etched bedrock: stratigraphy record.", "Rugged": "Rugged bright terrain: rough, bright outcrop.",
           "Eolian": "Wind-blown ripples/dunes: sand traps, route hazard.", "Crater rim": "Crater rim bedrock: ancient crust."}
    blurb = next(v for k, v in why.items() if k in n)
    add_poi(n.replace(" unit", ""), kind, float(glon[c]), float(glat[r]), UNITS[n][1], blurb, "USGS SIM 3464 (Sun & Stack 2020)")
write_json("pois.geojson", {"type": "FeatureCollection", "features": pois})

# science raster
sci = np.zeros((ny, nx))
sci = np.maximum(sci, lut_sci[unit] * 0.35)
sci = np.maximum(sci, np.clip(1 - ndimage.distance_transform_edt(~contact) * CELL / 180, 0, 1) * 0.5)
for f in pois:
    lon, lat = f["geometry"]["coordinates"]; r, c = ll_to_rc(lon, lat)
    m = np.zeros((ny, nx), bool)
    if 0 <= r < ny and 0 <= c < nx: m[int(r), int(c)] = True
    else: continue
    rad = 600 if f["properties"]["kind"] == "mineral" else 200
    sci = np.maximum(sci, np.clip(1 - ndimage.distance_transform_edt(~m) * CELL / rad, 0, 1) * f["properties"]["weight"])
for p, co in wl:       # panorama waypoints: small bonus
    r, c = ll_to_rc(*co)
    if 0 <= r < ny and 0 <= c < nx: sci[int(r), int(c)] = max(sci[int(r), int(c)], 0.25)
sci = ndimage.maximum_filter(sci, 3) * 0.999

# ------------------------------------------------------------------ safety
print("== Safety index")
slope_s = np.clip(1 - (slope - 5) / 20, 0, 1)
r98 = np.nanpercentile(rough, 98)
rough_s = 1 - np.clip(rough / r98, 0, 1)
safety = 100 * (0.40 * slope_s + 0.20 * rough_s + 0.15 * unit_s + 0.10 * dust_s + 0.15 * proven)
blocked = nan_cell | (slope > 25)
print(f"  blocked {blocked.mean()*100:.1f}%  safety p10/50/90 {np.nanpercentile(safety[~blocked],[10,50,90]).round(0)}  >=65: {(safety[~blocked]>=65).mean()*100:.0f}% of passable")

# validation vs rover tilt
tv = []
for p, co in wl:
    r, c = ll_to_rc(*co)
    if 0 <= r < ny and 0 <= c < nx and p["tilt"] is not None and not nan_cell[int(r), int(c)]:
        tv.append((slope[int(r), int(c)], p["tilt"]))
validation = {"n": len(tv), "pairs": [[round(a, 1), b] for a, b in tv]}
if len(tv) > 5:
    a = np.array(tv); print("  corr(DEM slope, rover tilt) =", np.corrcoef(a[:, 0], a[:, 1])[0, 1].round(2), " mean slope", a[:, 0].mean().round(1), " mean tilt", a[:, 1].mean().round(1))
write_json("validation.json", validation)

def b64(a, dt):
    return base64.b64encode(np.ascontiguousarray(a.astype(dt)).tobytes()).decode()

slope_q = np.clip(np.nan_to_num(slope, nan=63) * 4, 0, 255)
saf_q = np.where(blocked, 255, np.clip(np.round(safety), 0, 100))
grid = {
    "nx": nx, "ny": ny, "cell": CELL, "lonW": lon_w, "latN": lat_n, "dlon": dlon, "dlat": dlat, "radius": R,
    "bands": {
        "elev": {"dtype": "int16", "scale": 1, "data": b64(np.nan_to_num(elev, nan=-32768), "<i2")},
        "slope": {"dtype": "uint8", "scale": 0.25, "data": b64(slope_q, "u1")},
        "rough": {"dtype": "uint8", "scale": 1 / 255, "data": b64(np.clip(np.nan_to_num(rough / r98, nan=1), 0, 1) * 255, "u1")},
        "unit": {"dtype": "uint8", "scale": 1, "data": b64(unit, "u1")},
        "dust": {"dtype": "uint8", "scale": 1 / 255, "data": b64(dust_s * 255, "u1")},
        "proven": {"dtype": "uint8", "scale": 1 / 255, "data": b64(proven * 255, "u1")},
        "science": {"dtype": "uint8", "scale": 1 / 255, "data": b64(sci * 255, "u1")},
        "safety": {"dtype": "uint8", "scale": 1, "note": "0-100; 255 = impassable", "data": b64(saf_q, "u1")},
    },
}
write_json("grid.json", grid)

# ------------------------------------------------------------------ photos
photos = []
if "--skip-photos" not in sys.argv:
    print("== Photos (raw images API)")
    pc = os.path.join(CACHE, "photos.json")
    if os.path.exists(pc):
        photos = json.load(open(pc))
    else:
        sols = sorted({v[2] for v in wmap.values()})
        pick = sols[:: max(1, len(sols) // 90)]
        seen = set()
        for s in pick:
            try:
                u = ("https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=100&page=0&order=sol+desc"
                     f"&condition_2={s}:sol:gte&condition_3={s}:sol:lte&search=MCZ_LEFT")
                d = get(u).json()
            except Exception as e:
                print("  skip sol", s, e); continue
            got = 0
            for im in d.get("images", []):
                rmc = f"{im['site']}_{im['drive']}"
                if rmc not in wmap or im.get("sample_type") != "Full" or im["imageid"] in seen:
                    continue
                if not im["image_files"].get("small"): continue
                if got >= 3: break
                lon, lat, _ = wmap[rmc]
                seen.add(im["imageid"]); got += 1
                photos.append({"id": im["imageid"], "sol": im["sol"], "cam": im["camera"]["instrument"], "utc": im["date_taken_utc"][:19],
                               "lmst": im["date_taken_mars"], "lon": round(lon, 5), "lat": round(lat, 5),
                               "thumb": im["image_files"]["small"], "img": im["image_files"].get("medium") or im["image_files"]["small"],
                               "page": im["link"]})
        json.dump(photos, open(pc, "w"))
    write_json("photos.json", photos)
    print(f"  {len(photos)} photos")

# ------------------------------------------------------------------ MEDA weather
if "--skip-weather" not in sys.argv:
    print("== MEDA weather")
    base = "https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/"
    sols = [1857, 1858, 1859]
    def stream_csv(rel, cols):
        out = []
        time.sleep(1)
        with SES.get(base + rel, stream=True, timeout=180) as r:
            r.raise_for_status()
            lines = (l.decode("utf-8", "replace") for l in r.iter_lines())
            rd = csv.DictReader(lines)
            for row in rd:
                try:
                    h = row["LTST"].split(" ")[1].split(":"); hour = int(h[0]) + int(h[1]) / 60
                    out.append((hour, [float(row[c]) if row[c] not in ("", None) else np.nan for c in cols]))
                except Exception:
                    pass
        return out
    ats_cols = ["ATS_LOCAL_TEMP1", "ATS_LOCAL_TEMP2", "ATS_LOCAL_TEMP3", "ATS_LOCAL_TEMP4", "ATS_LOCAL_TEMP5"]
    daily, tb, pb = [], [[] for _ in range(24)], [[] for _ in range(24)]
    for s in sols:
        rel = f"data_calibrated_env/sol_1740_1859/sol_{s}/WE__{s}___________CAL_%s_________________P01.CSV"
        ats = stream_csv(f"data_calibrated_env/sol_1740_1859/sol_{s}/WE__{s}___________CAL_ATS_________________P01.CSV", ats_cols)
        ps = stream_csv(f"data_derived_env/sol_1740_1859/sol_{s}/WE__{s}___________DER_PS__________________P01.CSV", ["PRESSURE"])
        t = [(h, np.nanmedian(v) - 273.15) for h, v in ats if not np.all(np.isnan(v))]
        p = [(h, v[0]) for h, v in ps if not np.isnan(v[0])]
        for h, v in t: tb[int(h) % 24].append(v)
        for h, v in p: pb[int(h) % 24].append(v)
        tv_ = np.array([v for _, v in t])
        daily.append({"sol": s, "minC": round(float(np.percentile(tv_, 1)), 1), "maxC": round(float(np.percentile(tv_, 99)), 1),
                      "meanPa": round(float(np.mean([v for _, v in p])), 1)})
        print("  sol", s, daily[-1])
    diurnal = [{"hour": h, "tempC": round(float(np.mean(tb[h])), 1) if tb[h] else None,
                "pressurePa": round(float(np.mean(pb[h])), 1) if pb[h] else None} for h in range(24)]
    write_json("weather.json", {"source": "NASA PDS Atmospheres Node – Mars 2020 MEDA (calibrated ATS air temperature, derived PS pressure)",
                                "sols": sols, "latestPublishedSol": 1859, "daily": daily, "diurnal": diurnal,
                                "note": "Latest published MEDA data lags the mission by several months. Not live."})

# ------------------------------------------------------------------ layers.json + meta
T = "https://trek.nasa.gov/tiles/Mars/EQ/{L}/1.0.0/default/default028mm/{{z}}/{{y}}/{{x}}.{e}"
def trek(L, e="png"): return T.format(L=L, e=e)
layers = [
    {"id": "ctx", "name": "CTX mosaic (6 m)", "group": "Imagery", "type": "tile", "url": trek("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0"), "maxNativeZoom": 13, "on": True, "opacity": 1, "attr": "NASA/JPL/MSSS via Mars Trek"},
    {"id": "hirise", "name": "HiRISE mosaic (25 cm)", "group": "Imagery", "type": "tile", "url": trek("JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd"), "maxNativeZoom": 17, "on": False, "opacity": 1, "attr": "NASA/JPL/University of Arizona via Mars Trek"},
    {"id": "themis_day", "name": "THEMIS day IR (100 m)", "group": "Thermal", "type": "tile", "url": trek("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018"), "maxNativeZoom": 9, "on": False, "opacity": 0.8, "attr": "NASA/ASU via Mars Trek"},
    {"id": "themis_night", "name": "THEMIS night IR (100 m) – thermal-inertia proxy", "group": "Thermal", "type": "tile", "url": trek("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018"), "maxNativeZoom": 9, "on": False, "opacity": 0.8, "attr": "NASA/ASU via Mars Trek"},
    {"id": "geology", "name": "Geologic units (USGS)", "group": "Science", "type": "geology", "on": False, "opacity": 0.55, "attr": "USGS SIM 3464, Sun & Stack 2020"},
    {"id": "pois", "name": "Science points of interest", "group": "Science", "type": "pois", "on": True},
    {"id": "slope", "name": "Slope (from CTX DEM)", "group": "Terrain", "type": "raster", "band": "slope", "on": False, "opacity": 0.65},
    {"id": "hillshade", "name": "Hillshade (sun at selected time)", "group": "Terrain", "type": "raster", "band": "hillshade", "on": False, "opacity": 0.6},
    {"id": "safety", "name": "Safety index", "group": "Terrain", "type": "raster", "band": "safety", "on": True, "opacity": 0.5},
    {"id": "traverse", "name": "Perseverance traverse", "group": "Rover", "type": "traverse", "on": True},
    {"id": "photos", "name": "Rover photos", "group": "Rover", "type": "photos", "on": True},
    {"id": "upload", "name": "Your CSV", "group": "User", "type": "upload", "on": True},
]
write_json("layers.json", layers)
write_json("meta.json", {"built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "aoi": [lon_w, lat_s, lon_e, lat_n],
          "sources": ["NASA Mars Trek (tiles, CTX DEM)", "USGS SIM 3464 geologic map", "NASA MMGIS M20 traverse/waypoints", "NASA Mars 2020 raw images", "NASA PDS MEDA"],
          "weights": {"slope": 0.40, "rough": 0.20, "unit": 0.15, "dust": 0.10, "proven": 0.15}})
print("done")
