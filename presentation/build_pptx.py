#!/usr/bin/env python3
"""COMPASS 7-slide deck as PPTX, in the Drake Consulting design language (header + rule, section nav pill, boxed cards).
Run: python build_pptx.py  ->  COMPASS_Charlies_Angels.pptx.  Needs python-pptx + pillow.
Every text box is auto-fitted (measured with Calibri) so words never overflow their area."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.dml import MSO_LINE

HERE = os.path.dirname(os.path.abspath(__file__)); A = os.path.join(HERE, "assets")
MARS = r"C:\Users\R7021~1.ARA\AppData\Local\Temp\claude\195c42b525dc18ff\42232743-6eca-4cf0-bf6b-cbbc92dc6887\images\1.webp"
NAVY, BLUE, GREY, LGREY, WHITE, INK = "0B1F4B", "2E6FD8", "E4E7EE", "F1F3F7", "FFFFFF", "1B2540"
GREEN, GREENF, RED, REDF, GOLD = "1F8A5B", "DDF1E6", "B03A2E", "F9E0DD", "C99A3C"
FONT = "Calibri"
FD = r"C:\Windows\Fonts"
PIL_REG, PIL_BOLD, PIL_IT = (os.path.join(FD, f) for f in ("calibri.ttf", "calibrib.ttf", "calibrii.ttf"))
_fc = {}
def pf(path, pt):
    k = (path, pt)
    if k not in _fc: _fc[k] = ImageFont.truetype(path, int(pt * 10))
    return _fc[k]
def rgb(h): return RGBColor.from_string(h)

# ------------------------------------------------------------ images
def prep_images():
    im = Image.open(MARS).convert("RGB")
    bg = im.crop((0, 150, 1280, 870))                       # 16:9, keeps the capsule and the horizon
    bg = ImageEnhance.Brightness(bg).enhance(0.55); bg.save(os.path.join(A, "mars_title.png"))
    ban = im.crop((0, 300, 1280, 300 + 190))                 # wide banner strip
    ban = ban.resize((1280, 190))
    ban = ImageEnhance.Brightness(ban).enhance(0.45); ban.save(os.path.join(A, "mars_banner.png"))
prep_images()

# ------------------------------------------------------------ text with fitting
def tokens(par):
    out = []
    for i, seg in enumerate(par.split("**")):
        for w in seg.split(" "):
            if w: out.append((w, i % 2 == 1))
    return out

def measure(paras, pt, w_in, bold_all=False, italic=False, space_after=0, line=1.18):
    lines = 0
    for p in paras:
        cur = 0.0; n = 1
        for w, b in tokens(p):
            path = PIL_BOLD if (b or bold_all) else (PIL_IT if italic else PIL_REG)
            ww = pf(path, pt).getlength(w) / 10 / 72
            sp = pf(PIL_REG, pt).getlength(" ") / 10 / 72
            if cur and cur + sp + ww > w_in * 0.96: n += 1; cur = ww
            else: cur += (sp if cur else 0) + ww
        lines += n
    return lines * pt * line / 72 + space_after * (len(paras) - 1) / 72

def tb(s, x, y, w, h, text, max_pt=14, min_pt=8, bold=False, color=INK, align="l", anchor="t", italic=False, space_after=0, fixed=None):
    paras = text.split("\n")
    pt = fixed or max_pt
    while not fixed and pt > min_pt and measure(paras, pt, w, bold, italic, space_after) > h: pt -= 0.5
    if measure(paras, pt, w, bold, italic, space_after) > h + 0.02: print(f"  !! overflow {pt}pt: {text[:50]!r}")
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = box.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0; tf.word_wrap = True
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        para.space_after = Pt(space_after); para.line_spacing = 1.0
        for j, seg in enumerate(p.split("**")):
            if not seg: continue
            r = para.add_run(); r.text = seg; f = r.font; f.name = FONT; f.size = Pt(pt)
            f.bold = bold or (j % 2 == 1); f.italic = italic; f.color.rgb = rgb(color)
    return pt

def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, shape=MSO_SHAPE.RECTANGLE, dash=False, radius=None):
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill: sh.fill.solid(); sh.fill.fore_color.rgb = rgb(fill)
    else: sh.fill.background()
    if line: sh.line.color.rgb = rgb(line); sh.line.width = Pt(lw); sh.line.dash_style = MSO_LINE.DASH if dash else MSO_LINE.SOLID
    else: sh.line.fill.background()
    sh.shadow.inherit = False
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE: sh.adjustments[0] = radius
    return sh

def circle_num(s, x, y, d, n, fill=NAVY, color=WHITE, pt=14):
    c = rect(s, x, y, d, d, fill, shape=MSO_SHAPE.OVAL)
    tf = c.text_frame; tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE; p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = str(n); r.font.size = Pt(pt); r.font.bold = True; r.font.name = FONT; r.font.color.rgb = rgb(color)
    return c

def line(s, x1, y1, x2, y2, color=NAVY, w=1.0):
    ln = s.shapes.add_connector(1, Inches(x1), Inches(y1), Inches(x2), Inches(y2)); ln.line.color.rgb = rgb(color); ln.line.width = Pt(w); return ln

def pic(s, name, x, y, w=None, h=None):
    return s.shapes.add_picture(os.path.join(A, name), Inches(x), Inches(y), Inches(w) if w else None, Inches(h) if h else None)

# ------------------------------------------------------------ Drake-style frame
SECTIONS = ["OVERVIEW", "PROBLEM", "SOLUTION", "EVIDENCE", "IMPACT"]
LM, CW = 0.35, 12.63

def frame(prs, title, subtitle, sec, source=""):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    tb(s, LM, 0.2, 10.6, 0.5, title, 24, 18, bold=True, color=NAVY, anchor="m")
    tb(s, LM, 0.7, 8, 0.24, subtitle, 12, 10, color=BLUE)
    line(s, LM, 0.99, LM + CW, 0.99, NAVY, 1.25)
    pic(s, "logo_horizontal.png", 13.0 - 0.45*4.1058, 0.27, h=0.45)
    if source: tb(s, LM, 6.68, 11.5, 0.2, source, 8.5, 7, color="7A8499")
    # navigation pill (Drake style): completed part dark, marker at the current section
    x0, y0, w, h = LM, 6.95, CW, 0.36; sw = w / 5
    rect(s, x0, y0, w, h, GREY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
    done = sec + 1
    rect(s, x0, y0, sw * done, h, NAVY, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
    if done < 5: rect(s, x0 + sw * done - 0.3, y0, 0.3, h, NAVY)          # square off the right end of the dark part
    for i, n in enumerate(SECTIONS):
        tb(s, x0 + sw * i, y0, sw, h, n, 11, 11, bold=(i <= sec), color=(WHITE if i <= sec else "3B4766"), align="c", anchor="m", fixed=11)
    mk = pic(s, "logo_icon_inverse.png", min(x0 + sw * done - 0.27, x0 + w - 0.5), y0 - 0.1, h=0.56)
    return s

# ------------------------------------------------------------ slides
def slide1(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pic(s, "mars_title.png", 0, 0, 13.333, 7.5)
    pic(s, "logo_icon_inverse.png", 0.55, 4.0, 1.3, 1.3)
    line(s, 2.15, 4.0, 2.15, 5.3, WHITE, 1.25)
    tb(s, 2.45, 3.95, 10.2, 0.8, "COMPASS: know the way, and the way back", 40, 30, bold=True, color=WHITE, anchor="m")
    tb(s, 2.45, 4.75, 10.2, 0.4, "Combined Orbital Mars Pathfinding & Astronaut Safety System", 18, 14, color="D6DEF5", anchor="m")
    tb(s, 2.45, 5.2, 10.2, 0.4, "Charlie's Angels", 20, 16, italic=True, color="E0B957", anchor="m")
    tb(s, 0.55, 6.75, 12, 0.3, "NASA International Space Apps Challenge 2026  |  Jezero Crater, Mars  |  compass-77kb.onrender.com", 12, 10, color="C9D3EE")
    tb(s, 0.55, 7.1, 12, 0.22, "Image: NASA/JPL-Caltech artist's concept of a spacecraft approaching Mars.", 8.5, 7, color="9FB0D8")

def slide2(prs):
    s = frame(prs, "COMPASS tells explorers on foot where it is safe to walk, when to leave and how to get back", "Executive Summary", 0,
              "Sources: NASA Mars Trek, NASA/JPL MMGIS, NASA PDS Atmospheres Node, USGS SIM 3464, Herd et al. 2025. Counts from the COMPASS data pipeline.")
    rect(s, LM, 1.2, CW, 0.82, NAVY)
    tb(s, LM + 0.3, 1.2, CW - 0.6, 0.82, "How can a person on foot on Mars decide where it is safe to walk, when to leave, and whether they can get back, while doing science along the way?", 17, 13, bold=False, color=WHITE, align="c", anchor="m")
    tb(s, LM, 2.22, 1.3, 0.35, "Approach:", 15, 12, bold=True, color="7A8499", anchor="m")
    items = [("Estimate", "Estimated safety and sampling-likeness for every 60 m cell of Jezero, from NASA data"),
             ("Plan", "Three ranked routes with the best start time, a supplies check and the point of no return"),
             ("Explain", "Every score opens into its parts, and mission teams can upload data to retrain the estimators")]
    cw = (CW - 1.3) / 3
    for i, (t, d) in enumerate(items):
        x = LM + 1.3 + i * cw
        tb(s, x, 2.1, 0.5, 0.7, str(i + 1), 34, 34, color=NAVY, anchor="m")
        tb(s, x + 0.5, 2.1, cw - 0.65, 0.3, t, 16, 14, bold=True, color=NAVY)
        tb(s, x + 0.5, 2.42, cw - 0.65, 0.75, d, 13, 10, color=INK)
    pic(s, "mars_banner.png", LM, 3.4, CW, 12.63 * 190 / 1280)
    ban_h = 12.63 * 190 / 1280
    tb(s, LM, 3.4 + 0.12, CW, 0.6, "COMPASS", 38, 30, bold=True, color=WHITE, align="c", anchor="m")
    tb(s, LM + 1, 3.4 + 0.74, CW - 2, 0.35, "Combined Orbital Mars Pathfinding & Astronaut Safety System", 16, 12, color="E8ECF8", align="c", anchor="m")
    tb(s, LM + 1, 3.4 + 1.1, CW - 2, ban_h - 1.12, "A route planner for Marswalks in Jezero Crater that turns scattered orbital data into a decision a crew can make on the spot", 13, 10, color="E8ECF8", align="c", anchor="m")
    stats = [("268k", "map cells scored (60 m cells, about 30 by 30 km)"), ("10", "NASA and partner datasets in one view"),
             ("3", "ranked routes per request, each with a start time"), ("24", "real sample sites train the sampling-likeness estimator")]
    sw = CW / 4
    for i, (n, d) in enumerate(stats):
        x = LM + i * sw
        tb(s, x, 5.45, sw, 0.6, n, 34, 34, bold=True, color=NAVY, align="c", anchor="m")
        tb(s, x + 0.35, 6.05, sw - 0.7, 0.55, d, 13, 10, color="4A5675", align="c")

def slide3(prs):
    s = frame(prs, "The first explorers on foot will have no one to ask, and no tool plans their walk", "The Problem", 1,
              "Sources: team mission concept; NASA mission records. One-way signal delay between Earth and Mars is about 4 to 24 minutes.")
    cards = [("Help is far away", "**1. Signal delay** of 4 to 24 minutes one way means the crew decides on the spot\n**2. Past missions** show the cost: Spirit drove into soft ground in 2009 and never got out",
              "A walking crew needs its **answers on the device**, not from Earth"),
             ("Data is scattered", "**1. Ten sources** across several missions hold terrain, heat, minerals and weather\n**2. Viewers** such as Mars Trek, JMARS and MMGIS show the data but do not plan a walk",
              "The data exists. It needs **one integrated view**"),
             ("Four things at once", "**1. Terrain** slope and soft ground, **daylight and temperature**, **supplies** and **science** all shape a route\n**2. Today** they sit in separate places and are weighed by hand",
              "A route must **balance all four** and show how"),
             ("A way home", "**1. Supplies** set how far a crew can go and still return\n**2. Apollo crews** relied on a rover range limit worked out by hand so they could always walk back",
              "Every route needs a **point of no return**")]
    cw, gap = 3.0, 0.21
    for i, (h, body, take) in enumerate(cards):
        x = LM + i * (cw + gap)
        rect(s, x, 1.2, cw, 3.6, LGREY, NAVY, 2)
        tb(s, x + 0.15, 1.3, cw - 0.3, 0.45, h, 19, 15, bold=True, color=NAVY, align="c", anchor="m")
        line(s, x + 0.2, 1.8, x + cw - 0.2, 1.8, NAVY, 0.75)
        tb(s, x + 0.2, 1.95, cw - 0.4, 2.75, body, 18, 10, color=INK, space_after=8)
        rect(s, x, 5.05, cw, 1.3, WHITE, NAVY, 1.5)
        tb(s, x + 0.15, 4.93, 0.9, 0.24, "Takeaway", 11, 11, bold=True, color=NAVY, fixed=11)
        rect(s, x + 0.1, 4.95, 0.95, 0.2, WHITE)            # cut the border behind the label
        tb(s, x + 0.17, 4.94, 0.9, 0.22, "Takeaway", 11, 11, bold=True, color=NAVY, fixed=11)
        tb(s, x + 0.2, 5.25, cw - 0.4, 1.0, take, 17, 10, color=INK, align="c", anchor="m")

def slide4(prs):
    s = frame(prs, "One screen turns NASA data into three ranked routes with a start time and a way home", "Solution 1: The Planner", 2,
              "Source: COMPASS planner screenshot (live prototype). Imagery: NASA/JPL/MSSS via NASA Mars Trek; rover traverse and photos: NASA/JPL.")
    sx, sy, sw_ = LM, 1.2, 7.6; sh_ = sw_ / 1.6
    pic(s, "shot_planner.jpg", sx, sy, sw_, sh_)
    rect(s, sx, sy, sw_, sh_, None, NAVY, 1.5)
    for n, (px, py) in enumerate([(1108, 160), (1108, 222), (216, 432), (1410, 100), (24, 752)], 1):
        circle_num(s, sx + px / 1440 * sw_ - 0.16, sy + py / 900 * sh_ - 0.16, 0.32, n, GOLD, WHITE, 13)
    tb(s, sx, sy + sh_ + 0.08, sw_, 0.5, "The COMPASS planner on Jezero Crater: a trip from the landing site to a panorama site, two crew, on foot. Map imagery from NASA Mars Trek (MRO CTX).", 10.5, 8, italic=True, color="5B6580")
    rx = 8.2; rw = LM + CW - rx
    tb(s, rx, 1.15, rw, 0.4, "What is new in the planner", 17, 14, bold=True, color=NAVY, anchor="m")
    pts = [("Three genuinely different routes", "Safest, Best science and Fastest from A* search on a 60 m grid, re-planned apart if they come out the same"),
           ("The best start time in your window", "Computed sun and rover temperatures score every 15 minutes; depart, arrive and back are shown"),
           ("Supplies and the point of no return", "Oxygen, water, food, battery and sample bags with a 25% reserve; the last point you can still walk back from is marked"),
           ("Every number explained", "Estimated safety opens into 0.6 terrain + 0.2 daylight + 0.2 supplies, each with its inputs"),
           ("It learns from mission data", "Upload traverse logs, sample results, weather or surface-change files and the estimators retrain")]
    ih = 0.93
    for i, (t, d) in enumerate(pts):
        y = 1.65 + i * ih
        circle_num(s, rx, y + 0.02, 0.38, i + 1, GOLD, WHITE, 14)
        tb(s, rx + 0.52, y, rw - 0.52, 0.27, t, 14, 12, bold=True, color=NAVY)
        tb(s, rx + 0.52, y + 0.28, rw - 0.52, ih - 0.34, d, 11.5, 9, color=INK)

def slide5(prs):
    s = frame(prs, "Layers from several missions feed every route, and every score can be opened", "Solution 2: Integrated View and Explain", 2,
              "Sources: COMPASS planner (live prototype); NASA Mars Trek, NASA/JPL MMGIS, NASA PDS Atmospheres Node, USGS SIM 3464. Imagery NASA/JPL/MSSS.")
    lw = 5.9; lh = lw / 1.6
    pic(s, "shot_layers.jpg", LM, 1.2, lw, lh); rect(s, LM, 1.2, lw, lh, None, NAVY, 1.5)
    tb(s, LM, 1.2 + lh + 0.05, lw, 0.36, "Layer view: terrain shadows for the planned start time over the estimated-safety overlay, with rover traverse and photo pins.", 10.5, 8, italic=True, color="5B6580")
    chips = [("Optical", "MRO CTX and HiRISE"), ("Thermal", "Mars Odyssey THEMIS"), ("Topographic", "MRO CTX terrain model"),
             ("Geophysical", "USGS map, Mars 2020 traverse"), ("Atmospheric", "Mars 2020 MEDA"), ("Chemical", "OMEGA/CRISM, Mastcam-Z")]
    cwid = (lw - 0.2) / 3; cy = 1.2 + lh + 0.5
    for i, (a, b) in enumerate(chips):
        x = LM + (i % 3) * (cwid + 0.1); y = cy + (i // 3) * 0.6
        rect(s, x, y, cwid, 0.52, LGREY, None)
        tb(s, x + 0.1, y + 0.03, cwid - 0.2, 0.22, a, 12, 10, bold=True, color=NAVY)
        tb(s, x + 0.1, y + 0.26, cwid - 0.2, 0.24, b, 10.5, 8, color="4A5675")
    ex = 6.8; ew = 2.75; eh = ew * 735 / 450
    pic(s, "explain_crop.png", ex, 1.2, ew, eh); rect(s, ex, 1.2, ew, eh, None, NAVY, 1.5)
    tb(s, ex, 1.2 + eh + 0.05, ew, 0.4, "Explain for the Safest route: 0.6 x 80 + 0.2 x 96 + 0.2 x 100 = 87", 10.5, 8, italic=True, color="5B6580")
    rx = 9.85; rw = LM + CW - rx
    rect(s, rx, 1.2, rw, 2.0, NAVY)
    tb(s, rx + 0.2, 1.3, rw - 0.4, 0.3, "How a score is built", 14, 12, bold=True, color="E0B957")
    tb(s, rx + 0.2, 1.65, rw - 0.4, 1.45, "Estimated safety\n= 0.6 x terrain\n+ 0.2 x daylight and temperature\n+ 0.2 x supplies margin", 16, 11, color=WHITE, space_after=3)
    pts = [("Hard slope limit", "Ground steeper than 25 degrees is never routed, whatever the estimator says"),
           ("Supply reserve", "A 25% reserve on oxygen, water, food and battery before a route qualifies"),
           ("Nothing hidden", "Each score opens into its parts, formula and inputs so a crew sees why a route ranks where it does")]
    for i, (t, d) in enumerate(pts):
        y = 3.4 + i * 1.07
        rect(s, rx, y, 0.06, 0.95, GOLD)
        tb(s, rx + 0.18, y, rw - 0.18, 0.27, t, 13.5, 11, bold=True, color=NAVY)
        tb(s, rx + 0.18, y + 0.29, rw - 0.18, 0.66, d, 11.5, 8.5, color=INK)

def slide6(prs):
    s = frame(prs, "Ten datasets feed two estimators tested on unseen map blocks and checked against the rover", "Evidence: Data and Validation", 3,
              "Sources: COMPASS data pipeline and model reports (model v1). Spearman correlation with rover-measured tilt at 708 stops, blocked cells excluded.")
    rows = [("MRO CTX and HiRISE", "20 m terrain model, 6 m and 25 cm imagery: slope, roughness, basemap"),
            ("Mars Odyssey THEMIS", "100 m night and day infrared: dust proxy, thermal layers"),
            ("OMEGA and CRISM", "Hydrated-mineral detections: mineral points and index"),
            ("Mars 2020 traverse", "559 drives, 708 stops with measured tilt: labels and independent check"),
            ("Mars 2020 Mastcam-Z", "270 photos by site and drive: photo pins, points of interest"),
            ("Mars 2020 MEDA", "Air temperature and pressure by hour: daylight and temperature score"),
            ("USGS map SIM 3464", "1,308 polygons in 14 units: geology and resources score"),
            ("Herd et al. 2025", "24 real sample sites: sampling-likeness labels")]
    tw = 5.7; rh = 0.54
    rect(s, LM, 1.2, tw, 0.4, NAVY); tb(s, LM + 0.12, 1.2, 1.7, 0.4, "Dataset", 12.5, 12, bold=True, color=WHITE, anchor="m"); tb(s, LM + 1.95, 1.2, tw - 2, 0.4, "What it holds, and what it feeds", 12.5, 12, bold=True, color=WHITE, anchor="m")
    for i, (a, b) in enumerate(rows):
        y = 1.6 + i * rh
        rect(s, LM, y, tw, rh, LGREY if i % 2 == 0 else WHITE)
        tb(s, LM + 0.12, y, 1.75, rh, a, 12, 10, bold=True, color=NAVY, anchor="m")
        tb(s, LM + 1.95, y, tw - 2.05, rh, b, 11.5, 9, color=INK, anchor="m")
    mx = 6.3; mw = 3.45
    tb(s, mx, 1.15, mw, 0.4, "How the estimators are tested", 16, 13, bold=True, color=NAVY, anchor="m")
    circle_num(s, mx, 1.65, 0.34, 1, NAVY, WHITE, 13)
    tb(s, mx + 0.45, 1.62, mw - 0.45, 0.62, "**Unseen map blocks:** 3-fold spatial cross-validation holds out whole 16 by 16 cell blocks", 12, 9, color=INK)
    for i, (a, b, c) in enumerate([("Safety estimator", "AUC 0.976", "Brier 0.052"), ("Sampling-likeness", "AUC 0.945", "Brier 0.096")]):
        x = mx + 0.45 + i * 1.5
        rect(s, x, 2.3, 1.42, 0.82, LGREY)
        tb(s, x + 0.1, 2.33, 1.25, 0.2, a, 10, 8, color="6B7799")
        tb(s, x + 0.1, 2.53, 1.25, 0.32, b, 16, 13, bold=True, color=NAVY)
        tb(s, x + 0.1, 2.87, 1.25, 0.2, c, 10, 8, color="4A5675")
    circle_num(s, mx, 3.35, 0.34, 2, NAVY, WHITE, 13)
    tb(s, mx + 0.45, 3.32, mw - 0.45, 0.62, "**Independent check:** match with the tilt Perseverance measured at 708 stops (not used in training)", 12, 9, color=INK)
    for i, (n, v, c) in enumerate([("Plain slope, no model", 0.78, "8A97B8"), ("COMPASS estimator v1", 0.74, NAVY), ("Hand-written index", 0.71, "8A97B8")]):
        y = 4.05 + i * 0.36
        tb(s, mx + 0.45, y, 1.35, 0.28, n, 10.5, 8, color="3B4766", anchor="m")
        rect(s, mx + 1.85, y + 0.04, 1.1, 0.2, "EEF1F8"); rect(s, mx + 1.85, y + 0.04, 1.1 * v / 0.9, 0.2, c)
        tb(s, mx + 3.0, y, 0.45, 0.28, f"{v:.2f}", 11, 9, bold=True, color=NAVY, anchor="m")
    circle_num(s, mx, 5.25, 0.34, 3, NAVY, WHITE, 13)
    tb(s, mx + 0.45, 5.22, mw - 0.45, 1.3, "**Scenario tests:** a bad upload gives a clear error, dust-storm weather takes 20 points off, and surface change drops flagged cells from 100 to 59", 12, 9, color=INK)
    rx = 10.0; rw = LM + CW - rx
    rect(s, rx, 1.2, rw, 3.45, "FDF3F1", RED, 1.75, dash=True)
    tb(s, rx + 0.15, 1.28, rw - 0.3, 0.32, "What this does not prove", 14, 12, bold=True, color=RED, anchor="m")
    tb(s, rx + 0.15, 1.65, rw - 0.3, 2.95, "**Safety labels are mostly rules;** only 0.4% come from real traverse cells\n**No real unsafe labels:** a rover drives only where it thinks it is safe\n**Plain slope** matches measured tilt slightly better than the model\n**Sampling-likeness** rests on 24 sites with approximate positions", 14, 9, color=INK, space_after=6)
    rect(s, rx, 4.8, rw, 1.75, WHITE, GREEN, 1.75, dash=True)
    tb(s, rx + 0.15, 4.86, rw - 0.3, 0.3, "To strengthen it", 14, 12, bold=True, color=GREEN, anchor="m")
    tb(s, rx + 0.15, 5.2, rw - 0.3, 1.3, "Real wheel-slip and hazard telemetry as labels\nHold out whole sampling campaigns\nCompare with the rover's own hazard maps", 13, 9, color=INK, space_after=4)

def slide7(prs):
    s = frame(prs, "Four real runs: COMPASS qualifies safe routes and rejects the ones that do not fit", "Impact: Results and What Comes Next", 4,
              "Sources: scenario runs of the COMPASS planner on 14 November 2026 (model v1), from the landing site, two crew, round trip. Scores are estimated safety, 0 to 100.")
    sc = [("A short walk to the panorama sites", "3 km on foot, two crew", "All three routes qualify; Safest leaves at 11:24 and is back at 16:38", "82", True),
          ("A 13 km reach on foot", "Same crew and window", "All routes rejected: supplies short, and past 7.4 km the walk home does not fit", "75", False),
          ("The same trip by rover", "Travel mode set to Rover", "Safest qualifies, leaving 12:23 and back at 16:41, with supplies to spare", "94", True),
          ("Leaving after sunset", "Window 18:30 to 23:30", "No route offered: the daylight and temperature part is only 15 to 16 out of 100", "66", False)]
    lw = 7.5; rh = 0.95
    tb(s, LM, 1.15, lw, 0.35, "Estimated safety of the Safest route in each run", 14, 12, bold=True, color=NAVY, anchor="m")
    for i, (t, sub, res, score, ok) in enumerate(sc):
        y = 1.58 + i * (rh + 0.08)
        rect(s, LM, y, lw, rh, GREENF if ok else REDF)
        rect(s, LM, y, 0.07, rh, GREEN if ok else RED)
        circle_num(s, LM + 0.25, y + (rh - 0.74) / 2, 0.74, score, WHITE, GREEN if ok else RED, 20)
        tb(s, LM + 1.2, y + 0.08, lw - 1.35, 0.28, t, 15, 12, bold=True, color=NAVY)
        tb(s, LM + 1.2, y + 0.37, lw - 1.35, 0.2, sub, 11, 9, italic=True, color="5B6580")
        tb(s, LM + 1.2, y + 0.58, lw - 1.35, rh - 0.62, res, 12.5, 9, color=INK)
    rx = 8.15; rw = LM + CW - rx
    tb(s, rx, 1.15, rw, 0.35, "Where COMPASS goes next", 14, 12, bold=True, color=NAVY, anchor="m")
    road = [("Now", "Planning tool", "Planners on Earth compare Marswalks with real NASA data"),
            ("1 to 3 years", "Analog field tool", "Walks at Mars Desert Research Station and HI-SEAS train the model"),
            ("3 to 5 years", "The Moon first", "The same engine with lunar south pole data"),
            ("2030s onward", "Mars crew companion", "Runs offline on habitat or suit hardware")]
    for i, (w, t, d) in enumerate(road):
        y = 1.58 + i * 0.86
        rect(s, rx, y, rw, 0.78, LGREY); rect(s, rx, y, 0.07, 0.78, GOLD if i == 0 else "9FB0D8")
        tb(s, rx + 0.2, y + 0.05, 1.3, 0.22, w, 11, 9, bold=True, color=BLUE)
        tb(s, rx + 0.2, y + 0.28, rw - 0.3, 0.24, t, 14, 12, bold=True, color=NAVY)
        tb(s, rx + 0.2, y + 0.52, rw - 0.3, 0.24, d, 11, 8.5, color="4A5675")
    rect(s, rx, 5.1, rw, 1.45, NAVY)
    tb(s, rx + 0.25, 5.17, rw - 0.5, 0.3, "Try it now", 14, 12, bold=True, color="E0B957", anchor="m")
    tb(s, rx + 0.25, 5.47, rw - 0.5, 0.45, "compass-77kb.onrender.com", 24, 16, bold=True, color=WHITE, anchor="m")
    tb(s, rx + 0.25, 5.95, rw - 0.5, 0.55, "Press Find routes, open Explain on any route, then add your own data on the Upload page", 12.5, 9, color="DCE4F8")
    rect(s, LM, 5.85, lw, 0.7, LGREY)
    tb(s, LM + 0.2, 5.85, lw - 0.4, 0.7, "**Honest limits:** Jezero Crater only. An estimate from orbital data, not a safety rating. Weather is the last published rover data. No rock-hazard or radio-coverage data yet.", 12, 9, color=INK, anchor="m")

prs = Presentation(); prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
for f in (slide1, slide2, slide3, slide4, slide5, slide6, slide7): print(f.__name__); f(prs)
out = os.path.join(HERE, "COMPASS_Charlies_Angels.pptx"); prs.save(out); print("saved", out)
