"""Train, calibrate, evaluate and predict (ML.md section 11).
Classifier -> isotonic probability calibration -> k-fold spatial cross-validation -> feature importance."""
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

from .config import CV_FOLDS, MAX_TRAIN_ROWS, N_TREES


def _rf() -> RandomForestClassifier:
    return RandomForestClassifier(n_estimators=N_TREES, max_depth=12, min_samples_leaf=5,
                                  class_weight="balanced", n_jobs=-1, random_state=42)


def _make(kind: str):
    if kind == "gbm":
        return HistGradientBoostingClassifier(max_iter=200, learning_rate=0.08, max_depth=6, l2_regularization=1.0,
                                              class_weight="balanced", random_state=42)
    return _rf()


def spatial_folds(data: pd.DataFrame, k: int = CV_FOLDS, block: int = 16, seed: int = 0):
    """Hold out whole map blocks, not random cells: neighbouring cells are correlated and random splits inflate accuracy."""
    b = ((data.row // block) * 10_000 + (data.col // block)).to_numpy()
    ub = np.unique(b)
    np.random.RandomState(seed).shuffle(ub)
    for part in np.array_split(ub, k):
        te = np.isin(b, part)
        yield ~te, te


def calibration_table(p: np.ndarray, y: np.ndarray, bins=(0, 0.2, 0.4, 0.6, 0.8, 1.0001)) -> list[dict]:
    out = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            out.append({"predicted": round(float(p[m].mean()) * 100), "observed": round(float(y[m].mean()) * 100), "n": int(m.sum())})
    return out


def train(cells: pd.DataFrame, features: list[str], y_col: str, w_col: str | None = None, kind: str = "rf"):
    data = cells.dropna(subset=[y_col])
    if len(data) > MAX_TRAIN_ROWS:
        data, _ = train_test_split(data, train_size=MAX_TRAIN_ROWS, stratify=data[y_col].astype(int), random_state=0)
    data = data.rename(columns={y_col: "y"}).reset_index(drop=True)
    X, y = data[features].to_numpy(), data["y"].astype(int).to_numpy()
    w = data[w_col].to_numpy() if w_col else None

    # k-fold spatial cross-validation: every cell is predicted by a model that never saw its map block
    aucs, briers, accs, oof_p, oof_y = [], [], [], [], []
    for tr, te in spatial_folds(data):
        if len(np.unique(y[te])) < 2 or len(np.unique(y[tr])) < 2:
            continue
        m = CalibratedClassifierCV(_make(kind), method="isotonic", cv=3)      # calibration makes 80 % mean ~80 %
        m.fit(X[tr], y[tr], sample_weight=w[tr] if w is not None else None)
        p = m.predict_proba(X[te])[:, 1]
        aucs.append(roc_auc_score(y[te], p)); briers.append(brier_score_loss(y[te], p)); accs.append(accuracy_score(y[te], p >= 0.5))
        oof_p.append(p); oof_y.append(y[te])
    if aucs:
        metrics = {"auc": round(float(np.mean(aucs)), 3), "auc_sd": round(float(np.std(aucs)), 3), "brier": round(float(np.mean(briers)), 3),
                   "accuracy": round(float(np.mean(accs)), 3), "folds": len(aucs), "split": f"{len(aucs)}-fold spatial blocks"}
        calib = calibration_table(np.concatenate(oof_p), np.concatenate(oof_y))
    else:
        metrics, calib = {"split": "not evaluated (too few labels for a spatial split)"}, []
    metrics.update(n_train=int(len(y)), positives=int((y == 1).sum()), negatives=int((y == 0).sum()), model="gradient boosting" if kind == "gbm" else "random forest")

    # the model that is used: fitted on all labelled data
    model = CalibratedClassifierCV(_make(kind), method="isotonic", cv=3)
    model.fit(X, y, sample_weight=w)

    # feature importance from a plain RF fitted on all labelled data (for explanations)
    rf_full = _rf().fit(X, y, sample_weight=w)
    importance = dict(sorted(zip(features, rf_full.feature_importances_.round(3).tolist()), key=lambda kv: -kv[1]))
    return model, metrics, importance, calib


def predict(model, cells: pd.DataFrame, features: list[str]) -> np.ndarray:
    return model.predict_proba(cells[features].to_numpy())[:, 1] * 100        # -> %


def save(obj: dict, path: str):
    joblib.dump(obj, path)
