#!/usr/bin/env python3
"""Builds the 7-slide COMPASS deck (consulting style) for team Charlie's Angels.
Run: python build_deck.py   ->  COMPASS_Charlies_Angels_7_slides.pdf (+ deck.html, logo files in assets/)
Needs: playwright (uses the installed Microsoft Edge), pillow."""
import json, os, time
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, "assets")
NAVY, DEEP, BLUE, LIGHT, GOLD, TEAL, RED = "#14275C", "#0B1B44", "#2E6FD8", "#E8EDF8", "#C99A3C", "#1F8A70", "#C0392B"
boxes = json.load(open(os.path.join(A, "boxes.json")))["planner"]

# ------------------------------------------------------------------ logo
def logo_svg(inverse=False):
    bg, fg, accent = (("#FFFFFF", NAVY, "#C99A3C") if inverse else (NAVY, "#FFFFFF", "#E0B957"))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="{bg}"/>
<ellipse cx="32" cy="13" rx="9.5" ry="3.6" fill="none" stroke="{accent}" stroke-width="2.4"/>
<path d="M12 49 L32 23 L52 49" fill="none" stroke="{fg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 49 L32 33 L44 49" fill="none" stroke="{fg}" stroke-opacity=".7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M27.5 49 L32 43 L36.5 49" fill="none" stroke="{accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'''

def make_logos(browser):
    open(os.path.join(A, "charlies_angels_logo.svg"), "w", encoding="utf-8").write(logo_svg())
    open(os.path.join(A, "charlies_angels_logo_inverse.svg"), "w", encoding="utf-8").write(logo_svg(True))
    page = browser.new_page(viewport={"width": 900, "height": 300}, device_scale_factor=3)
    for name, inverse, text_col, word in [("logo_icon", False, NAVY, False), ("logo_icon_inverse", True, "#fff", False),
                                          ("logo_horizontal", False, NAVY, True), ("logo_horizontal_white", True, "#fff", True)]:
        label = f'<span style="font:600 44px Segoe UI,Calibri,Arial;color:{text_col};letter-spacing:-.5px;margin-left:18px">Charlie\'s Angels</span>' if word else ""
        page.set_content(f'<body style="margin:0;background:transparent"><div id="x" style="display:inline-flex;align-items:center;padding:4px"><div style="width:96px;height:96px">{logo_svg(inverse)}</div>{label}</div></body>')
        page.locator("#x").screenshot(path=os.path.join(A, name + ".png"), omit_background=True)
    page.close()

# ------------------------------------------------------------------ shared pieces
CRITERIA = [
    ("Impact", "What problem are you solving, and why does it matter?"),
    ("Creativity", "How innovative or original is your approach?"),
    ("Validity", "Is your solution supported by relevant evidence and appropriate data?"),
    ("Relevance", "How well does your project address the challenge you've selected?"),
    ("Presentation", "How clearly and effectively do you communicate your solution?"),
]

def tracker(active=None, dark=False):
    tabs = "".join(f'<div class="tab{" on" if i == active else ""}">{n}</div>' for i, (n, _) in enumerate(CRITERIA))
    return f'<div class="tracker{" dark" if dark else ""}">{tabs}</div>'

def rubric_line(active):
    if active is None:
        return ""
    n, q = CRITERIA[active]
    return f'<div class="rubric"><b>Judging criterion · {n}:</b> {q}</div>'

def head(section, title):
    return f'''<div class="sec">{section}</div><h1 class="title">{title}</h1>
<div class="toplogo"><img src="assets/logo_icon.png"><span>Charlie's Angels</span></div>'''

def slide(inner, active, n, src=""):
    return f'''<section class="slide">{inner}<div class="src">{src}</div><div class="pg">{n}</div>{rubric_line(active)}{tracker(active)}</section>'''

def pill(kind):
    return f'<span class="pill {kind.lower().replace(" ", "")}">{kind}</span>'

def callout(n, x, y, W=1440, H=900):
    return f'<div class="co" style="left:{x / W * 100:.2f}%;top:{y / H * 100:.2f}%">{n}</div>'

# ------------------------------------------------------------------ slides
def s1():
    return f'''<section class="slide s1">
<div class="s1l"><img class="s1logo" src="assets/logo_horizontal_white.png">
<div class="s1k">NASA International Space Apps Challenge 2026</div>
<h1>COMPASS</h1>
<div class="s1sub">Combined Orbital Mars Pathfinding &amp; Astronaut Safety System</div>
<div class="s1tag">Know the way, and the way back.</div>
<div class="s1bul"><div>Jezero Crater, Mars</div><div>Estimated safety, time, supplies and science for a person on foot</div><div>Live demo: compass-77kb.onrender.com</div></div></div>
<div class="s1r"><img src="assets/hero_art_crop.png"><div class="s1cap">Jezero Crater from the MRO CTX terrain model, a line every 50 m, with the route Perseverance has driven</div></div>
{tracker(None, True)}</section>'''

def s2():
    rows = "".join(f'''<div class="sc{i % 2}"><div class="scn">{i + 1}</div><div class="scb"><b>{n}</b><span>{q}</span>
<em>{[
    "Slide 3: no map exists for the first walk; today's viewers do not plan one",
    "Slide 4: one screen that estimates, plans and explains",
    "Slide 5: ten datasets, tests on unseen map blocks, an independent rover check",
    "Slide 6: a layered, integrated view built from several NASA missions",
    "Slide 7: every number explained, four real scenarios, a live demo"][i]}</em></div></div>''' for i, (n, q) in enumerate(CRITERIA))
    inner = f'''{head("Executive summary", "COMPASS gives a person on foot on Mars one screen that answers: is it safe, when should I leave, and can I get back?")}
<div class="ex">
 <div class="exl">
  <div class="exr"><div class="exlab">Context</div><div class="exbox3">
   <div class="bx"><b>Help is 4 to 24 minutes away</b><span>Signal delay means the crew must decide on the spot</span></div>
   <div class="bx"><b>The data exists but is scattered</b><span>Ten sources across several missions, made for scientists on Earth</span></div>
   <div class="bx"><b>Viewers show data, none plans a walk</b><span>Mars Trek, JMARS and MMGIS display; they do not score a route</span></div></div></div>
  <div class="exr"><div class="exlab">Question</div><div class="exq">How can a person on foot on Mars decide where it is safe to walk, when to leave, and whether they can get back, while doing science along the way?</div></div>
  <div class="exr"><div class="exlab">Solution</div><div class="exsol"><div class="exh">COMPASS: estimate, plan, explain</div><div class="exbox3">
   <div class="bx navyb"><b>Estimate</b><span>Estimated safety and sampling-likeness for 268,128 cells (60 m) of Jezero, from NASA data</span></div>
   <div class="bx navyb"><b>Plan</b><span>Three routes with the best start time, a supplies check and the point of no return</span></div>
   <div class="bx navyb"><b>Explain</b><span>Every score opens into its parts. Mission teams upload data and the estimators retrain</span></div></div></div></div>
  <div class="exr"><div class="exlab">Impact</div><div class="exbox3 stats">
   <div class="st"><div class="stc">268k</div><span>map cells scored over about 30 by 30 km</span></div>
   <div class="st"><div class="stc">10</div><span>NASA and partner datasets in one view</span></div>
   <div class="st"><div class="stc">3</div><span>routes per request, each with a start time</span></div></div></div>
 </div>
 <div class="exrt"><div class="exh2">How we are judged, and where to find it</div>{rows}</div>
</div>'''
    return slide(inner, None, 2, "Sources: NASA Mars Trek, NASA/JPL MMGIS, NASA PDS Atmospheres Node, USGS SIM 3464, Herd et al. 2025. Counts from the COMPASS data pipeline. Judging criteria from the Space Apps Challenge rubric.")

def s3():
    lessons = [
        ("Apollo 14, 1971", "Crew turned back on foot with no live position on a terrain map", "Your position, with oxygen and walk-back margin updating", "Partial"),
        ("Apollo 15 to 17", "A rover drive limit kept crews within walking distance of home, worked out by hand", "The point of no return, computed from your real supplies", "Built"),
        ("Spirit, 2009", "Drove into soft ground and never got out", "Dust proxy and geologic units, with sand rated lowest, feed the estimate", "Partial"),
        ("Opportunity, 2018", "A global dust storm cut solar power; weather was not tied to timing", "Daylight and temperature scored for every start time", "Partial"),
        ("Curiosity", "Sharp rocks damaged wheels; routes were re-planned afterwards", "Rock hazards in planning from the start", "Not yet"),
        ("Mars Trek, JMARS, MMGIS", "Excellent viewers, built for scientists on Earth", "The same data turned into ranked routes with supply checks", "Built"),
    ]
    trs = "".join(f'<tr><td class="who">{a}</td><td>{b}</td><td>{c}</td><td>{pill(d)}</td></tr>' for a, b, c, d in lessons)
    four = [("Terrain", "Slopes, roughness, soft ground, mapped from orbit at different dates", "Estimated safety per 60 m cell"),
            ("Environment", "Daylight, temperature, dust, changing through the sol", "Sun, shadows and rover temperatures for your window"),
            ("Supplies", "Oxygen, water, food and power set how far you can go and still return", "Needs vs. what you carry, with a 25% reserve"),
            ("Science", "The reason for the walk, spread across maps and target lists", "Points of interest and a sampling-likeness estimate")]
    fb = "".join(f'<div class="fb"><b>{a}</b><span>{b}</span><i>COMPASS: {c}</i></div>' for a, b, c in four)
    road = [("Now", "Planning tool", "Planners on Earth compare Marswalks with real NASA data"), ("1 to 3 years", "Analog field tool", "Mars Desert Research Station, HI-SEAS: real walks train the model"),
            ("3 to 5 years", "The Moon first", "Same engine with lunar data near the south pole"), ("2030s onward", "Mars crew companion", "Runs offline on habitat or suit hardware")]
    rd = "".join(f'<div class="rm{" first" if i == 0 else ""}"><small>{w}</small><b>{t}</b><span>{d}</span></div>' for i, (w, t, d) in enumerate(road))
    inner = f'''{head("Impact · the problem and why it matters", "The first explorers on foot will have no one to ask, and no existing tool plans a walk across terrain, time, supplies and science")}
<div class="s3">
 <div class="s3a"><div class="sh">Every past surface mission shows the same gap: the data existed but was not joined into one decision</div>
  <table class="tb"><thead><tr><th>Mission or tool</th><th>What happened</th><th>COMPASS answer</th><th>Status</th></tr></thead><tbody>{trs}</tbody></table></div>
 <div class="s3b"><div class="sh">A planner balances four things that live in separate places today</div><div class="fbg">{fb}</div></div>
</div>
<div class="s3c"><div class="sh">Where COMPASS goes next</div><div class="rmrow">{rd}</div></div>
<div class="take"><b>Takeaway:</b> COMPASS turns data NASA already holds into a decision the crew can make locally, in minutes, and every route shows its way home.</div>'''
    return slide(inner, 0, 3, "Sources: team mission concept (history notes to be checked against NASA records before citing); status from the working prototype. Signal delay 4 to 24 minutes one way.")

def s4():
    W, H = 1440, 900
    cos = [callout(1, 1128, 148), callout(2, 1150, 222), callout(3, 216, 432), callout(4, 1426, 236), callout(5, 24, 752)]
    pts = [("Three genuinely different routes", "Safest, Best science and Fastest from A* search on a 60 m grid. Routes that come out the same are re-planned apart."),
           ("The best start time inside your window", "The computed sun and rover temperatures score every 15 minutes. Depart, arrive and back are shown for each route."),
           ("Supplies and the point of no return", "Oxygen, water, food, battery and sample bags with a 25% reserve. The last point from which you can still walk back is marked."),
           ("Every number explained", "Explain opens estimated safety into 0.6 terrain + 0.2 daylight + 0.2 supplies, each with its inputs."),
           ("It learns from mission data", "Upload traverse logs, sample results, weather or surface-change files and the estimators retrain.")]
    li = "".join(f'<div class="inv"><div class="ivn">{i + 1}</div><div><b>{t}</b><span>{d}</span></div></div>' for i, (t, d) in enumerate(pts))
    inner = f'''{head("Creativity · our approach", "One screen turns orbital data into ranked walking routes, each with a best start time, a supplies check and a point of no return")}
<div class="s4"><div class="shot"><img src="assets/shot_planner.jpg">{''.join(cos)}</div>
<div class="s4r"><div class="sh">What is new in the planner</div>{li}</div></div>
<div class="cap4">The COMPASS planner on Jezero Crater: a trip from the landing site to a panorama site, two crew, on foot. Map imagery from NASA Mars Trek (MRO CTX).</div>'''
    return slide(inner, 1, 4, "Source: COMPASS planner screenshot (live prototype). Imagery: NASA/JPL/MSSS via NASA Mars Trek; rover traverse and photos: NASA/JPL.")

def s5():
    data = [("MRO CTX and HiRISE", "20 m terrain model, 6 m and 25 cm imagery", "Slope, roughness, basemap"),
            ("Mars Odyssey THEMIS", "100 m night and day infrared", "Dust proxy, thermal layers"),
            ("OMEGA and CRISM", "Hydrated-mineral detections", "Mineral points and index"),
            ("Mars 2020 traverse", "559 drives, 708 stops with measured tilt", "Safety labels, independent check"),
            ("Mars 2020 images, Mastcam-Z", "270 photos by site and drive", "Photo pins, points of interest"),
            ("Mars 2020 MEDA", "Air temperature and pressure by hour", "Daylight and temperature score"),
            ("USGS geologic map SIM 3464", "1,308 polygons in 14 units", "Geology, resources score"),
            ("Herd et al. 2025, PNAS", "24 real sample sites", "Sampling-likeness labels")]
    dr = "".join(f'<tr><td class="who">{a}</td><td>{b}</td><td>{c}</td></tr>' for a, b, c in data)
    bars = [("Plain slope, no model", 0.78, "#8A97B8"), ("COMPASS ML estimator v1", 0.74, NAVY), ("Hand-written formula index", 0.71, "#8A97B8")]
    bh = "".join(f'<div class="bar"><span>{n}</span><div class="bt"><i style="width:{v / 0.9 * 100:.0f}%;background:{c}"></i></div><b>{v:.2f}</b></div>' for n, v, c in bars)
    inner = f'''{head("Validity · evidence and data", "Ten NASA and partner datasets feed two estimators that are tested on unseen map blocks and checked against what the rover measured")}
<div class="s5">
 <div class="c5a"><div class="sh">Ten datasets, each with a job</div><table class="tb sm"><thead><tr><th>Source</th><th>What it holds</th><th>What it feeds</th></tr></thead><tbody>{dr}</tbody></table></div>
 <div class="c5b"><div class="sh">How the estimators are tested</div>
  <div class="tst"><div class="tn">1</div><div><b>Unseen map blocks</b><span>3-fold spatial cross-validation holds out whole 16 by 16 cell blocks.</span></div></div>
  <div class="mt"><div><small>Safety estimator</small><b>AUC 0.976</b><i>Brier 0.052</i></div><div><small>Sampling-likeness</small><b>AUC 0.945</b><i>Brier 0.096</i></div></div>
  <div class="tst"><div class="tn">2</div><div><b>An independent check, not used in training</b><span>Match with the tilt Perseverance measured at 708 stops (Spearman):</span></div></div>
  <div class="bars">{bh}</div>
  <div class="tst"><div class="tn">3</div><div><b>Scenario tests</b><span>Bad upload gives a clear error. Dust-storm weather takes 20 points off. Surface change drops flagged cells 100 to 59.</span></div></div></div>
 <div class="c5c"><div class="warn"><div class="wh">What this does not prove</div>
  <ul><li>Safety labels are mostly rules; only 0.4% are real traverse cells</li><li>There are no real "unsafe" labels: a rover drives only where it thinks it is safe</li><li>Plain slope matches measured tilt slightly better than the model</li><li>Sampling-likeness rests on 24 sites with approximate positions</li></ul>
  <div class="wn">So the output is named <b>estimated safety</b>, not a safety rating.</div></div>
  <div class="nx"><div class="wh2">To strengthen it</div><ul><li>Real wheel-slip and hazard telemetry as labels</li><li>Hold out whole sampling campaigns</li><li>Compare with the rover's own hazard maps</li></ul></div></div>
</div>
<div class="take"><b>Takeaway:</b> the data is real and the tests are honest: the estimator is a calibrated, explainable guide for comparing routes, and we state where it is not yet proven.</div>'''
    return slide(inner, 2, 5, "Sources: COMPASS data pipeline and model reports (model v1). Spearman correlation with rover-measured tilt at 708 stops; blocked cells excluded (the in-app report counts them as unsafe and shows 0.76).")

def s6():
    rows = [("A layered view of a location or route", "Six layer groups (optical, thermal, topographic, geophysical, atmospheric, chemical) plus rover traverse, photos and your uploads; sun and shadows for the chosen time"),
            ("Data from several NASA science missions", "MRO, Mars Odyssey and Mars 2020 data, with OMEGA/CRISM detections, the USGS geologic map and a published sample table"),
            ("Plan and carry out a successful Marswalk", "Three routes, best start time, supplies check, point of no return, and a Walk view that tracks oxygen and the way home"),
            ("Do science along the way", "Science stops, a sampling-likeness estimate trained on 24 real sample sites, hydrated-mineral points, and uploads of sample results"),
            ("Keep a human explorer safe", "A hard 25 degree slope limit, daylight and temperature scoring, a 25% supply reserve, and every number explained")]
    tr = "".join(f'<tr><td class="ask">{a}</td><td>{b}</td><td>{pill("Built")}</td></tr>' for a, b in rows)
    mm = [("Optical", "MRO CTX and HiRISE"), ("Thermal", "Mars Odyssey THEMIS"), ("Topographic", "MRO CTX terrain model"), ("Geophysical", "USGS map, Mars 2020 traverse"), ("Atmospheric", "Mars 2020 MEDA"), ("Chemical", "OMEGA/CRISM, Mastcam-Z")]
    mh = "".join(f'<div class="mm"><b>{a}</b><span>{b}</span></div>' for a, b in mm)
    inner = f'''{head("Relevance · fit to the challenge", "The challenge asks for a layered, integrated view to plan a Marswalk with science; COMPASS delivers each element in one working planner")}
<div class="s6"><div class="s6l"><div class="sh">What the challenge asks for, and what COMPASS delivers</div>
 <table class="tb"><thead><tr><th>The challenge asks for</th><th>What COMPASS delivers</th><th>Status</th></tr></thead><tbody>{tr}</tbody></table></div>
 <div class="s6r"><div class="shot2"><img src="assets/shot_layers.jpg"></div><div class="cap6">Layer view: terrain shadows for the planned start time over the estimated-safety overlay, with the rover traverse and photo pins.</div>
 <div class="sh" style="margin-top:12px">Which mission feeds which layer</div><div class="mmg">{mh}</div></div></div>
<div class="take"><b>Takeaway:</b> several missions, one integrated view, and one decision: where to walk, when to leave, and what is worth the trip.</div>'''
    return slide(inner, 3, 6, "Sources: COMPASS planner (live prototype); NASA Mars Trek, NASA/JPL MMGIS, NASA PDS Atmospheres Node, USGS SIM 3464, Herd et al. 2025 (PNAS). Imagery NASA/JPL/MSSS.")

def s7():
    sc = [("A short walk to the panorama sites", "3 km on foot, two crew", "All three routes qualify; Safest leaves at 11:24 and is back at 16:38", "82", "ok"),
          ("A 13 km reach on foot", "Same crew and window", "All routes rejected: supplies short; past 7.4 km the walk home does not fit", "75", "bad"),
          ("The same trip by rover", "Travel mode set to Rover", "Safest qualifies, leaving 12:23 and back at 16:41, with supplies to spare", "94", "ok"),
          ("Leaving after sunset", "Window 18:30 to 23:30", "No route offered: the daylight and temperature part is only 15 to 16 out of 100", "66", "bad")]
    sr = "".join(f'<div class="sce {k}"><div class="scs">{s}</div><div><b>{t}</b><i>{tr}</i><span>{r}</span></div></div>' for t, tr, r, s, k in sc)
    inner = f'''{head("Presentation · clear and open to try", "Every number is explained, four real scenarios were run end to end, and the planner is live for you to try today")}
<div class="s7"><div class="c7a"><div class="sh">Four real runs of the planner (estimated safety of the Safest route)</div>{sr}
 <div class="sh" style="margin-top:10px">Explain: nothing is hidden</div><div class="exnote">Each score opens into its parts, its formula and its inputs, so a crew can see why a route ranks where it does.</div></div>
 <div class="c7b"><div class="pnl"><img src="assets/explain_crop.png"></div><div class="cap6">The Explain view for the Safest route: 0.6 × 80 + 0.2 × 96 + 0.2 × 100 = 87.</div></div>
 <div class="c7c"><div class="try"><div class="th">Try it now</div><div class="url">compass-77kb.onrender.com</div>
  <ol><li>Open the planner and press Find routes</li><li>Open Explain on any route</li><li>Add your own data on the Upload page</li></ol></div>
  <div class="lim"><div class="wh2">Honest limits</div><ul><li>Jezero Crater only</li><li>An estimate from orbital data, not a safety rating</li><li>Weather is the last published rover data</li><li>No rock-hazard or radio-coverage data yet</li></ul></div>
  <div class="team"><img src="assets/logo_icon.png"><div><b>Charlie's Angels</b><span>Thank you</span></div></div></div></div>
<div class="take"><b>Takeaway:</b> COMPASS is a working, explained and honestly bounded planner, and the next step is real hazard data from mission teams.</div>'''
    return slide(inner, 4, 7, "Sources: scenario runs of the COMPASS planner on 14 November 2026 (model v1), from the landing site, two crew, round trip, science sampling. Scores are estimated safety, 0 to 100.")

CSS = f'''
@page {{ size: 1280px 720px; margin: 0 }}
* {{ box-sizing: border-box }} html,body {{ margin:0; padding:0; background:#fff }}
body {{ font-family: "Segoe UI", Calibri, Arial, sans-serif; color:#1b2540; -webkit-print-color-adjust: exact; print-color-adjust: exact }}
.slide {{ width:1280px; height:720px; position:relative; overflow:hidden; background:#fff; page-break-after:always; break-after:page }}
.sec {{ position:absolute; left:36px; top:20px; font-size:12.5px; font-weight:700; color:{BLUE} }}
.title {{ position:absolute; left:36px; top:40px; width:1080px; margin:0; font-size:24.5px; line-height:1.17; font-weight:700; color:{NAVY} }}
.toplogo {{ position:absolute; right:30px; top:18px; display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:{NAVY} }} .toplogo img {{ height:34px }}
.src {{ position:absolute; left:36px; right:90px; bottom:76px; font-size:9.3px; color:#7a8499; line-height:1.25 }}
.pg {{ position:absolute; right:36px; bottom:76px; font-size:10px; color:#7a8499 }}
.rubric {{ position:absolute; left:36px; right:36px; bottom:50px; font-size:11px; color:{NAVY}; font-style:italic }} .rubric b {{ font-style:normal }}
.tracker {{ position:absolute; left:36px; right:36px; bottom:14px; height:30px; display:flex; gap:8px }}
.tab {{ flex:1; border-radius:7px; background:{LIGHT}; color:#6b7799; text-align:center; font-size:12.5px; line-height:30px; font-weight:600 }}
.tab.on {{ background:{NAVY}; color:#fff }}
.tracker.dark .tab {{ background:rgba(255,255,255,.12); color:#c9d3ee }}
.sh {{ font-size:13px; font-weight:700; color:{NAVY}; margin-bottom:7px; line-height:1.25 }}
.take {{ position:absolute; left:36px; right:36px; bottom:96px; background:{NAVY}; color:#fff; font-size:13px; padding:8px 14px; border-radius:6px; line-height:1.3 }} .take b {{ color:#E0B957 }}
.tb {{ width:100%; border-collapse:collapse; font-size:12.5px }} .tb th {{ background:{NAVY}; color:#fff; text-align:left; padding:6px 9px; font-weight:600; font-size:11.5px }}
.tb td {{ padding:10px 10px; border-bottom:1px solid #dde3f0; vertical-align:top; line-height:1.28 }} .tb td.who, .tb td.ask {{ font-weight:700; color:{NAVY}; width:23% }} .tb.sm td {{ padding:8px 8px; font-size:12px }}
.pill {{ font-size:10.5px; font-weight:700; padding:2px 9px; border-radius:999px; white-space:nowrap }} .pill.built {{ background:#DDF3EA; color:#14694F }} .pill.partial {{ background:#FBEFD0; color:#8A6410 }} .pill.notyet {{ background:#F9DEDB; color:#A33328 }}
/* slide 1 */
.s1 {{ background:{DEEP}; color:#fff }} .s1l {{ position:absolute; left:0; top:0; width:700px; height:668px; padding:34px 48px }} .s1logo {{ height:50px }}
.s1k {{ margin-top:54px; font-size:14px; color:#E0B957; font-weight:600 }} .s1 h1 {{ margin:8px 0 0; font-size:104px; line-height:1; letter-spacing:-2px; font-weight:700 }}
.s1sub {{ margin-top:10px; font-size:21px; color:#d6def5; line-height:1.3; max-width:560px }} .s1tag {{ margin-top:24px; font-size:25px; font-style:italic; color:#E0B957 }}
.s1bul {{ margin-top:34px; font-size:15px; color:#c9d3ee; line-height:1.9 }} .s1bul div::before {{ content:""; display:inline-block; width:7px; height:7px; background:#E0B957; border-radius:50%; margin-right:11px }}
.s1r {{ position:absolute; left:700px; top:0; right:0; height:668px; background:#0d2150 }} .s1r img {{ width:100%; height:100%; object-fit:cover; object-position:left center }}
.s1r::after {{ content:""; position:absolute; left:0; top:0; bottom:0; width:120px; background:linear-gradient(90deg,{DEEP},rgba(11,27,68,0)) }} .s1cap {{ position:absolute; left:20px; right:20px; bottom:16px; font-size:11px; color:#b9c6e6; z-index:2 }}
.s1 .tracker {{ left:48px; right:48px }}
/* slide 2 */
.ex {{ position:absolute; left:36px; right:36px; top:112px; bottom:106px; display:flex; gap:18px }} .exl {{ flex:1.75; display:flex; flex-direction:column; gap:10px }} .exrt {{ flex:1; background:{LIGHT}; border-radius:8px; padding:12px 14px; display:flex; flex-direction:column }}
.exr {{ display:flex; gap:10px; align-items:stretch; flex:1 }} .exlab {{ width:70px; flex-shrink:0; font-weight:700; font-size:12.5px; color:{NAVY}; display:flex; align-items:center; border-right:3px solid {GOLD} }}
.exbox3 {{ flex:1; display:flex; gap:8px }} .bx {{ flex:1; border:1.5px solid {NAVY}; border-radius:5px; padding:9px 11px; font-size:12.5px; display:flex; flex-direction:column; gap:3px; background:#fff }} .bx b {{ font-size:12.5px; color:{NAVY}; line-height:1.2 }} .bx span {{ color:#4a5675; line-height:1.25 }}
.bx.navyb {{ background:{NAVY}; border-color:{NAVY} }} .bx.navyb b {{ color:#E0B957 }} .bx.navyb span {{ color:#e3e9fa }}
.exq {{ flex:1; background:{NAVY}; color:#fff; font-weight:700; font-size:14px; padding:10px 14px; border-radius:5px; line-height:1.3 }}
.exsol {{ flex:1; background:#F4EBD3; border-radius:5px; padding:6px 8px }} .exh {{ text-align:center; font-weight:700; font-size:12.5px; color:{NAVY}; margin-bottom:6px }}
.stats .st {{ flex:1; display:flex; align-items:center; gap:9px; font-size:11.5px; color:#4a5675; line-height:1.25 }} .stc {{ width:66px; height:66px; flex-shrink:0; border-radius:50%; border:2px solid {NAVY}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:21px; color:{NAVY} }}
.exh2 {{ font-weight:700; color:{NAVY}; font-size:13px; margin-bottom:9px }}
.sc0, .sc1 {{ flex:1; align-items:center; display:flex; gap:9px; background:#fff; border-radius:6px; padding:8px 9px; margin-bottom:7px }} .scn {{ width:24px; height:24px; border-radius:50%; background:{GOLD}; color:#fff; font-weight:700; font-size:12.5px; display:flex; align-items:center; justify-content:center; flex-shrink:0 }}
.scb {{ font-size:12px; line-height:1.28; display:flex; flex-direction:column; gap:2px }} .scb b {{ color:{NAVY}; font-size:13px }} .scb span {{ color:#4a5675 }} .scb em {{ color:{BLUE}; font-style:normal; font-weight:600 }}
/* slide 3 */
.s3 {{ position:absolute; left:36px; right:36px; top:106px; display:flex; gap:20px }} .s3a {{ flex:1.55 }} .s3b {{ flex:1 }} .fbg {{ display:grid; grid-template-columns:1fr 1fr; gap:8px }}
.fb {{ border:1.5px solid {NAVY}; border-radius:6px; padding:12px 11px; display:flex; flex-direction:column; gap:4px; font-size:12px; line-height:1.25 }} .fb b {{ font-size:13px; color:{NAVY} }} .fb span {{ color:#4a5675 }} .fb i {{ font-style:normal; color:{TEAL}; font-weight:600 }}
.s3a .tb td {{ padding:7.5px 10px }} .s3c {{ position:absolute; left:36px; right:36px; top:466px }} .rmrow {{ display:flex; gap:10px }} .rm {{ flex:1; background:{LIGHT}; border-radius:6px; padding:8px 11px 8px 14px; border-left:5px solid #9fb0d8; display:flex; flex-direction:column; gap:1px; font-size:11px; line-height:1.25 }} .rm.first {{ border-left-color:{GOLD}; background:#F9F2DF }}
.rm small {{ color:#6b7799; font-weight:600 }} .rm b {{ color:{NAVY}; font-size:13px }} .rm span {{ color:#4a5675 }}
/* slide 4 */
.s4 {{ position:absolute; left:36px; right:36px; top:106px; display:flex; gap:20px }} .shot {{ position:relative; width:768px; height:480px; flex-shrink:0; border:1.5px solid {NAVY}; border-radius:6px; overflow:hidden }} .shot img {{ width:100%; height:100%; object-fit:cover; display:block }}
.co {{ position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; background:{GOLD}; color:#fff; border:2px solid #fff; font-weight:700; font-size:14px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,.45) }}
.s4r {{ flex:1 }} .inv {{ display:flex; gap:11px; margin-bottom:11px; font-size:12px; line-height:1.3 }} .inv b {{ display:block; color:{NAVY}; font-size:13.5px; margin-bottom:1px }} .inv span {{ color:#4a5675 }}
.ivn {{ width:26px; height:26px; border-radius:50%; background:{GOLD}; color:#fff; font-weight:700; font-size:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px }}
.cap4 {{ position:absolute; left:36px; width:768px; top:592px; font-size:10.5px; color:#5b6580; line-height:1.25 }}
/* slide 5 */
.s5 {{ position:absolute; left:36px; right:36px; top:106px; display:flex; gap:18px }} .c5a {{ flex:1.25 }} .c5b {{ flex:1.05 }} .c5c {{ flex:.95; display:flex; flex-direction:column; gap:10px }}
.tst {{ display:flex; gap:9px; margin-bottom:11px; font-size:12.5px; line-height:1.28 }} .tst b {{ display:block; color:{NAVY}; font-size:12.5px }} .tst span {{ color:#4a5675 }} .tn {{ width:22px; height:22px; border-radius:50%; background:{NAVY}; color:#fff; font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0 }}
.mt {{ display:flex; gap:8px; margin:0 0 9px 31px }} .mt > div {{ flex:1; background:{LIGHT}; border-radius:6px; padding:6px 9px; display:flex; flex-direction:column }} .mt small {{ color:#6b7799; font-size:10.5px }} .mt b {{ color:{NAVY}; font-size:17px }} .mt i {{ font-style:normal; color:#4a5675; font-size:11px }}
.bars {{ margin:0 0 9px 31px; display:flex; flex-direction:column; gap:5px }} .bar {{ display:flex; align-items:center; gap:7px; font-size:11px }} .bar span {{ width:128px; color:#3b4766 }} .bt {{ flex:1; height:15px; background:#eef1f8; border-radius:3px; overflow:hidden }} .bt i {{ display:block; height:100%; border-radius:3px }} .bar b {{ width:32px; color:{NAVY} }}
.warn {{ border:2px solid {RED}; border-radius:7px; padding:10px 12px; background:#FDF3F1 }} .wh {{ color:{RED}; font-weight:700; font-size:13px; margin-bottom:5px }} .warn ul, .nx ul, .lim ul {{ margin:0; padding-left:17px; font-size:12.5px; line-height:1.32; color:#3b4766 }} .warn li, .nx li, .lim li {{ margin-bottom:3px }} .wn {{ margin-top:6px; font-size:11.5px; color:{NAVY} }}
.nx {{ border:1.5px solid {TEAL}; border-radius:7px; padding:9px 12px }} .wh2 {{ color:{TEAL}; font-weight:700; font-size:13px; margin-bottom:4px }}
/* slide 6 */
.s6 {{ position:absolute; left:36px; right:36px; top:106px; display:flex; gap:20px }} .s6l {{ flex:1.12 }} .s6r {{ flex:1 }} .shot2 {{ border:1.5px solid {NAVY}; border-radius:6px; overflow:hidden; height:320px }} .shot2 img {{ width:100%; height:100%; object-fit:cover; object-position:center 40%; display:block }}
.cap6 {{ font-size:10.5px; color:#5b6580; margin-top:4px; line-height:1.25 }} .mmg {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px }} .mm {{ background:{LIGHT}; border-radius:5px; padding:8px 9px; font-size:10.5px; line-height:1.25; display:flex; flex-direction:column }} .mm b {{ color:{NAVY}; font-size:12px }} .mm span {{ color:#4a5675 }}
/* slide 7 */
.s7 {{ position:absolute; left:36px; right:36px; top:106px; display:flex; gap:18px }} .c7a {{ flex:1.25 }} .c7b {{ width:236px; flex-shrink:0 }} .c7c {{ flex:.95; display:flex; flex-direction:column; gap:9px }}
.sce {{ display:flex; gap:12px; border-left:4px solid {TEAL}; background:#F3F7FB; border-radius:5px; padding:11px 12px; margin-bottom:9px; font-size:12.5px; line-height:1.27 }} .sce.bad {{ border-left-color:{RED}; background:#FDF3F1 }}
.sce b {{ display:block; color:{NAVY}; font-size:12.5px }} .sce i {{ display:block; font-style:normal; color:#6b7799; font-size:10.5px }} .sce span {{ color:#3b4766 }} .scs {{ width:44px; height:44px; flex-shrink:0; border-radius:50%; border:2px solid {NAVY}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; color:{NAVY}; align-self:center }}
.exnote {{ font-size:11.5px; color:#4a5675; line-height:1.3 }} .pnl {{ border:1.5px solid {NAVY}; border-radius:6px; overflow:hidden; background:#0f1b31 }} .pnl img {{ width:100%; display:block }}
.try {{ background:{NAVY}; color:#fff; border-radius:8px; padding:11px 14px }} .th {{ color:#E0B957; font-weight:700; font-size:13px }} .url {{ font-size:19px; font-weight:700; margin:4px 0 7px; letter-spacing:-.3px }} .try ol {{ margin:0; padding-left:18px; font-size:11.5px; line-height:1.45; color:#dfe6fa }}
.lim {{ border:1.5px solid #c5cde3; border-radius:7px; padding:9px 12px }} .lim .wh2 {{ color:{NAVY} }}
.team {{ margin-top:auto; display:flex; align-items:center; gap:10px; background:{LIGHT}; border-radius:8px; padding:9px 12px }} .team img {{ height:44px }} .team b {{ display:block; font-size:16px; color:{NAVY} }} .team span {{ font-size:11.5px; color:#5b6580 }}
'''

def build():
    # crop helper images
    hero = Image.open(os.path.join(A, "hero_art.png")); hero.crop((0, 0, hero.width, hero.height - 62)).save(os.path.join(A, "hero_art_crop.png"))
    ex = Image.open(os.path.join(A, "explain_panel.png")); ex.crop((0, 0, ex.width, 735)).save(os.path.join(A, "explain_crop.png"))
    slides = "".join([s1(), s2(), s3(), s4(), s5(), s6(), s7()])
    html = f'<!doctype html><html><head><meta charset="utf-8"><title>COMPASS - Charlie\'s Angels</title><style>{CSS}</style></head><body>{slides}</body></html>'
    open(os.path.join(HERE, "deck.html"), "w", encoding="utf-8").write(html)

if __name__ == "__main__":
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True)
        make_logos(br)
        build()
        pg = br.new_page(viewport={"width": 1280, "height": 720})
        pg.goto("file:///" + os.path.join(HERE, "deck.html").replace("\\", "/"))
        time.sleep(2)
        out = os.path.join(HERE, "COMPASS_Charlies_Angels_7_slides.pdf")
        pg.pdf(path=out, width="1280px", height="720px", print_background=True, margin={"top": "0", "right": "0", "bottom": "0", "left": "0"}, prefer_css_page_size=True)
        br.close()
    print("wrote", out, round(os.path.getsize(out) / 1e6, 1), "MB")
