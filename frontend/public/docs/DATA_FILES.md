# Data files reference (`frontend/public/data/`)

All coordinates are lon/lat degrees (east-positive), WGS84-style numbers on the Mars sphere. Sizes are approximate.

## `grid.json` (3.1 MB) – the analysis grid

```
{ nx: 532, ny: 504, cell: 60, lonW, latN, dlon, dlat, radius,
  bands: { name: { dtype, scale, data(base64) [, note] } } }
```

- Grid is row-major, **row 0 = northernmost**, col 0 = westernmost. Cell size is 60 m (`dlon` = `dlat` ≈ 0.001012°).
- Cell of a point: `col = floor((lon − lonW) / dlon)`, `row = floor((latN − lat) / dlat)`.
- Cell centre: `lon = lonW + (col + 0.5) × dlon`, `lat = latN − (row + 0.5) × dlat`.
- `data` is base64 of a raw little-endian array of `nx × ny` values. Real value = stored × `scale`.

| Band | dtype | scale | Meaning |
|---|---|---|---|
| `elev` | int16 | 1 | Elevation in metres (−32768 = no data) |
| `slope` | uint8 | 0.25 | Slope in degrees (63° if no data) |
| `rough` | uint8 | 1/255 | Terrain roughness, 0–1 (1 = roughest 2%+) |
| `unit` | uint8 | 1 | Geologic unit id, 0 = none; names in `geology.geojson` → `units` |
| `dust` | uint8 | 1/255 | Dust proxy, 0–1 (1 = firmest / brightest at night) |
| `proven` | uint8 | 1/255 | 1 within 100 m of a rover track, falling to 0 at 3 km |
| `science` | uint8 | 1/255 | Science interest, 0–1 (POIs, unit contacts, unit type) |
| `safety` | uint8 | 1 | Built-in estimated safety 0–100 (replaced by the model's when it is running); **255 = impassable** |

Decode in JavaScript:

```js
const bytes = Uint8Array.from(atob(band.data), c => c.charCodeAt(0));
const arr = band.dtype === "int16" ? new Int16Array(bytes.buffer) : bytes;
```

Decode in Python: `np.frombuffer(base64.b64decode(data), dtype="<i2" or "u1").reshape(ny, nx)`.

## `traverse.geojson` (766 KB)
Perseverance drive segments inside the area, one feature per drive: `properties.sol`, `properties.len` (metres), LineString (or MultiLineString) `[lon, lat]`. From NASA MMGIS, data through sol 2022.

## `waypoints.geojson` (109 KB)
708 end-of-drive points. `rmc` (`"site_drive"`, the key that links photos), `sol`, `elev` (m), `tilt` (degrees, measured by the rover), `km` (cumulative distance).

## `geology.geojson` (1.2 MB)
USGS geologic unit polygons (simplified to about 12 m). `properties.unit` (name), `properties.id` (matches the `unit` band). Top-level `units` lists `{id, name, color}` for the 14 unit types.

## `pois.geojson` (5 KB)
Science points. `name`, `kind` (`panorama`, `mineral`, `traverse`, `geology`, `hazard`), `weight` (0–1), `blurb`, `source`.

## `photos.json` (162 KB)
270 Mastcam-Z raw images, each with a location. Fields: `id`, `sol`, `cam`, `utc`, `lmst`, `lon`, `lat`, `thumb` (320 px), `img` (800 px), `page` (NASA page). Location is the rover's waypoint for that image's site/drive. Image files are loaded from NASA servers (not stored here).

## `weather.json` (1 KB)
Latest published Perseverance MEDA data (sols 1857–1859): `daily` (min/max air temp °C, mean pressure Pa) and `diurnal` (24 hourly means of temperature and pressure by local true solar time). **Not live**, see `note` inside the file.

## `validation.json` (7 KB)
`pairs`: `[DEM slope °, rover-measured tilt °]` at each of the 708 waypoints. Correlation is 0.77. Useful for a "model checked against reality" chart.

## `layers.json` (2 KB)
Layer catalogue for a layer panel: id, name, group, type, default on/off, opacity, and for tile layers the Mars Trek URL template and `maxNativeZoom` (CTX 13, HiRISE 17, THEMIS 9).
The `raster` layers (slope, hillshade, safety) are meant to be drawn by the app from `grid.json`; `hillshade` is not precomputed.

## `meta.json`
Build time, the area bounding box `[lonW, latS, lonE, latN]`, source list and the safety weights.
