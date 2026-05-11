"""KOI classifier pipeline."""
from __future__ import annotations

import datetime as dt
import json
import logging
import subprocess
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from exoproximo import config, io
from exoproximo.ml import classify

log = logging.getLogger(__name__)

STELLAR = ["koi_steff", "koi_slogg", "koi_srad", "koi_smass", "koi_smet"]
TRANSIT = ["koi_period", "koi_duration", "koi_depth", "koi_prad", "koi_teq", "koi_insol", "koi_model_snr"]
FEATURE_COLS = STELLAR + TRANSIT


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def _save_calibration_plot(model, X: pd.DataFrame, y: pd.Series, test_indices: list, kind: str) -> Path:
    """Save a reliability diagram for the held-out test set to outputs/koi_calibration.png."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.calibration import CalibrationDisplay

    X_te = X.loc[test_indices]
    y_te = y.loc[test_indices]
    fig, ax = plt.subplots(figsize=(6, 6))
    CalibrationDisplay.from_estimator(model, X_te, y_te, n_bins=10, ax=ax, name=kind)
    ax.set_title("KOI classifier calibration (held-out test set)")
    out = config.OUTPUTS_DIR / "koi_calibration.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)
    return out


def run(
    *,
    koi_parquet: Optional[Path] = None,
    kinds: tuple[str, ...] = ("rf", "hgb"),
) -> dict:
    started = dt.datetime.utcnow().isoformat()
    parquet = Path(koi_parquet) if koi_parquet else config.KOI_RAW_PATH
    if not parquet.exists():
        raise FileNotFoundError(f"{parquet} not found. Run `exo fetch` first.")

    df = pd.read_parquet(parquet)

    keep_cols = ["kepoi_name", "kepler_name", "koi_disposition"] + FEATURE_COLS
    missing = [c for c in keep_cols if c not in df.columns]
    if missing:
        raise RuntimeError(f"KOI parquet missing columns: {missing}")
    df = df[keep_cols].copy()

    # Median-impute stellar columns; drop rows missing transit columns
    df[STELLAR] = df[STELLAR].fillna(df[STELLAR].median())
    df = df.dropna(subset=TRANSIT).reset_index(drop=True)

    train_mask = df["koi_disposition"].isin(["CONFIRMED", "FALSE POSITIVE"])
    train_df = df[train_mask].reset_index(drop=True)
    cand_df = df[~train_mask].reset_index(drop=True)
    y = (train_df["koi_disposition"] == "CONFIRMED").astype(int)
    X = train_df[FEATURE_COLS]

    results = {kind: classify.train_classifier(X, y, kind=kind, cv=5) for kind in kinds}
    best_kind = max(results, key=lambda k: results[k]["test_metrics"]["roc_auc"])
    best = results[best_kind]
    log.info("best model: %s with test AUC %.3f", best_kind, best["test_metrics"]["roc_auc"])

    _save_calibration_plot(best["model"], X, y, best["test_indices"], best_kind)

    conn = io.get_conn()
    io.init_db(conn)
    io.write_df(df[["kepoi_name", "kepler_name", "koi_disposition"] + FEATURE_COLS],
                "koi_objects", conn=conn, mode="upsert", pk=["kepoi_name"])

    params = {
        "kinds": list(kinds),
        "best_kind": best_kind,
        "feature_cols": FEATURE_COLS,
        "n_train": int(len(train_df)),
        "n_candidate": int(len(cand_df)),
        "test_metrics": {k: v["test_metrics"] for k, v in results.items()},
        "cv_scores": {k: v["cv_scores"] for k, v in results.items()},
        "feature_importance": best["feature_importance"],
        "random_state": config.RANDOM_STATE,
    }
    finished = dt.datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("koi", _git_sha(), started, finished, "ok", len(df), json.dumps(params)),
    )
    run_id = cur.lastrowid

    if len(cand_df) > 0:
        proba = best["model"].predict_proba(cand_df[FEATURE_COLS])[:, 1]
        preds = pd.DataFrame({
            "kepoi_name": cand_df["kepoi_name"],
            "model_run_id": run_id,
            "prob_planet": proba,
            "predicted_label": np.where(proba >= 0.5, "CONFIRMED", "FALSE POSITIVE"),
        })
        io.write_df(preds, "koi_predictions", conn=conn, mode="append")

    conn.commit()
    conn.close()

    io.save_model(best["model"], "koi_best")
    return {"best_kind": best_kind, "test_metrics": best["test_metrics"], "n_candidates_predicted": len(cand_df)}
