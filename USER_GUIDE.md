# COMPASS user guide

COMPASS plans a walk on Mars. You say where you are going and when, and it returns up to three routes, each with an estimated safety, with the best time to leave, what you will need, and what is worth seeing on the way. This guide shows how to use it, then walks through four real examples.

## The screen

| Area | What it does |
|---|---|
| Top bar | The sol (Mars day), local solar time, time until sunrise or sunset, and the one-way delay to Earth right now |
| Left: Layers | Switch map layers on and off. Each layer has choices, for example CTX or HiRISE imagery |
| Left: Supplies | What your crew carries. Bars show how much of each the selected route uses |
| Map | Click to set points. Pins mark start, destination, stops, the point of no return and the safe haven |
| Right: Routes | The options. **Explain** shows how each score is made |
| Bottom: trip form | Start, destination, time window, purpose, crew size, travel mode, and the priority slider |

## Plan a walk in five steps

1. **Set the trip.** Click the map to place a start and a destination, or type latitude and longitude into the Start position and Destination boxes. The first click fills Start, the second Destination.
2. **Set the time window.** *Earliest start* and *Latest return* are written like `Sol 2039 · 08:00` in local Mars time. COMPASS picks the best start inside this window.
3. **Choose purpose, crew and mode.** Walk, Rover, or Rover + walk. Crew size scales food, water and oxygen. Set the priority slider toward Science if you would rather detour to interesting terrain.
4. **Press Find routes.** Up to three routes appear. Cards with an estimated safety of 65 or more are listed first. Cards below it are greyed and say why.
5. **Compare, then confirm.** Click a card to highlight it on the map, and **Explain** to see exactly how its numbers are built. **Confirm route** starts the Walk view: drag the slider to simulate progress and watch oxygen, water, battery and the walk-back margin change.

## Reading a route card

- **Est. safety** is the headline number, from 0 to 100. It is an estimate from orbital data, not a probability and not a safety rating. The white tick on its bar is the planning minimum of 65. It blends terrain (60%), daylight and temperature (20%) and supplies margin (20%). Each part must be at least 50.
- **Science** and **Resources** rank how much the route offers. They are scores for comparing routes, not measurements.
- **Depart, Arrive, Back** are local Mars solar times. Depart is the best start in your window.
- **Supplies** is a tick if your inventory covers the trip with a 25% reserve, otherwise it names what is short.
- The note under the cards says whether the walk home fits in your supplies. If not, it shows the distance beyond which you could not get back.

## Use your own data

Open **Upload data** in the left panel. Drop a CSV (or an SQL dump with INSERT statements) and set its layer type:

| Layer type | Needs columns | Effect |
|---|---|---|
| Rover traverse log | lat, lon, sol (optional: slip, hazard_reported) | Cells driven become labelled safe; hazards and high slip become unsafe |
| Sample results | lat, lon, sol, rock_type | Teaches the sampling-likeness estimator what sampled terrain looks like |
| Weather | sol, dust_tau, wind, temp | Takes 20 points off safety if dust opacity is 1.0 or more, 10 more for wind of 15 m/s or more |
| Surface change | lat, lon, sol, change_type (optional: magnitude) | Marks recently changed terrain as hazardous |
| Other points | lat, lon (optional: value, label) | Only plotted on the map |

Then press **Train model**. It takes about 20 seconds, and the map and routes update. If the model service is not running, the app falls back to a built-in estimate and says so.

## Four examples

These were run in the app on 14 November 2026 with model v1, from the landing site (18.4446 N, 77.4509 E), for two crew, round trip, purpose Science sampling. Your sol and numbers will differ a little, because the sun and the weather window move with the date.

### 1. A short look at the panorama sites (a walk of about 3 km)

*Trip:* destination 18.4588 N, 77.4060 E, window Sol 2039 08:00 to 17:00, on foot.

*Result:* all three routes clear the minimum. Safest has an estimated safety of **82** with departure at **11:24**, arrival 14:01 and back at 16:38. Safest passes four points of interest (the landing site and three panorama sites), and Best science also has an estimated safety of 82. Fastest has an estimated safety of 80 and has the highest resources score (91) because its track crosses more delta and layered rock. Supplies are enough, and the note says the round trip fits in 8 hours of oxygen with 3.8 hours needed.

*What it shows:* three genuinely different options for nearly the same safety, and a best start time around midday for light and warmth.

### 2. Too far on foot: a 13 km reach

*Trip:* destination 18.62 N, 77.56 E, same window, on foot.

*Result:* every route is greyed. Safest has an estimated safety of 75 overall, but the card says *time window too short for this trip* and *supplies margin 35%*, and shows "Supplies short on O₂, water, food, battery". The note says **past 7.4 km supplies no longer cover the walk back**.

*What it shows:* a fast-looking plan that has no safe way home does not qualify. This is the point of no return, computed from your supplies and not from a rule of thumb.

### 3. The same destination by rover

*Trip:* same as above, but mode **Rover**.

*Result:* Safest has an estimated safety of **94**, departing at 12:23 and back at 16:41 with supplies enough. The 13 km round trip takes about 3.6 hours, against about 15 hours on foot.

*What it shows:* travel mode changes the answer. The assumed rover speed is 8 km/h, an assumption you can change.

### 4. Leaving after sunset

*Trip:* the same short walk as example 1, but the window starts at 18:30 and ends at 23:30.

*Result:* no route qualifies. Terrain and supplies are fine, but the daylight and temperature part is only **15 to 16** out of 100. Safest comes out at 66 overall, and it is rejected anyway because one part is below 50%.

*What it shows:* the estimated safety needs every part to pass. A route that is safe on paper, but run in the dark and cold, is not offered.

## What COMPASS does not do

- It covers Jezero Crater only.
- Its scores are estimates from orbital data, not engineering ratings.
- It does not see boulders, soft ground below the surface, or fresh sand drifts.
- It does not model radiation or comms coverage, and weather is the last published rover data, not a live feed.
- Walking speeds and consumption rates are assumptions.

For the maths behind every number, read `PRINCIPLES.md`.
