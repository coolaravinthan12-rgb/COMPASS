"""Thresholds and constants for the COMPASS models (see ML.md section 6)."""
CELL_M = 60                     # grid cell size in metres (the Jezero grid is 60 m; ML.md suggests 10 m for a finer DTM)
MARS_RADIUS_M = 3_396_190       # radius of the sphere the CTX DEM is referenced to

SAFE, CAUTION = 80, 60          # band thresholds (%)
SLOPE_UNSAFE_DEG = 15           # rule label where no traverse data exists
SLOPE_SAFE_DEG = 5
SLOPE_HARD_MASK_DEG = 25        # physics guardrail: impassable whatever the model says

DUST_TAU_BAD = 1.0              # weather penalty thresholds
WIND_BAD = 15                   # m/s
WEATHER_PENALTY = 20            # % points removed from safety

LABEL_WEIGHT_REAL = 5.0         # real mission labels count more than rule labels
LABEL_WEIGHT_RULE = 1.0
ROUGH_UNSAFE_PCT = 97             # rule label: roughest 3 % of cells are unsafe (ARCHITECTURE doc: roughness above threshold)
DUST_UNSAFE_PCT = 3               # rule label: lowest 3 % thermal-inertia proxy (loose dust, sinking risk) are unsafe
DISCOVERY_NEG_RATIO = 1           # background cells per sample cell; 1 keeps the 0-100 scale readable
SLIP_UNSAFE = 0.5               # uploaded wheel-slip above this marks the cell unsafe
CHANGE_PENALTY = 40               # points removed from safety at recent_change = 1 (moved sand, new craters, slope streaks)
CHANGE_UNSAFE = 0.5             # recent_change above this adds a weak unsafe label

MIN_LABELLED = 200              # below this, fall back to the rule-based score instead of a trained model
MAX_TRAIN_ROWS = 60_000         # subsample for speed (Render free tier has 0.1 CPU)
N_TREES = 150
CV_FOLDS = 3                     # spatial cross-validation folds (whole map blocks held out)
SAFETY_MODEL = "rf"              # RandomForest: best on the rover-tilt check
DISCOVERY_MODEL = "gbm"          # gradient boosting: AUC 0.945 vs 0.928 for RandomForest in 5-fold spatial CV

# elevation is left out of the safety model: it only encodes where the rover happened to drive, not hazard
# terrain-context features (steepest neighbour, mean slope and relief of the surroundings, curvature) raised the
# independent rover-tilt check from 0.737 to 0.757 at the same cross-validated AUC
CONTEXT_FEATURES = ["slope_max3", "slope_mean5", "relief5", "curv"]
SAFETY_FEATURES = ["slope", "roughness", "dust", "recent_change"] + CONTEXT_FEATURES
UNIT_FEATURES = ["u_fan", "u_etched", "u_floor", "u_rim", "u_nili", "u_bedform", "u_rugged"]
DISCOVERY_FEATURES = ["slope", "roughness", "elevation", "dust", "mineral_index"] + UNIT_FEATURES


def band(score: float) -> str:
    return "safe" if score >= SAFE else "caution" if score >= CAUTION else "unsafe"
