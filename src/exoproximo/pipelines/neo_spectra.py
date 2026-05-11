"""NEO spectra pipeline: load → features → PCA/UMAP/HDBSCAN/IsolationForest → SQLite + joblib."""
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
from exoproximo.features import spectra as fs
from exoproximo.ml import anomaly, cluster

log = logging.getLogger(__name__)

FEATURE_COLS = [
    "slope_vis", "slope_nir",
    "band_depth_1um", "band_center_1um",
    "band_depth_2um", "band_center_2um",
]


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        return "unknown"


def _per_observation_features(long_df: pd.DataFrame) -> pd.DataFrame:
    """Group by file_path; normalize; compute features. Returns one row per observation."""
    rows = []
    for file_path, group in long_df.groupby("file_path", sort=False):
        spec = group[["wavelength", "reflectance", "error"]].sort_values("wavelength").reset_index(drop=True)
        try:
            spec_norm = fs.normalize_reflectance(spec)
        except ValueError as e:
            log.warning("skipping %s: %s", file_path, e)
            continue
        meta = group.iloc[0]
        rows.append({
            "designation": meta["designation"],
            "obs_date": meta["obs_date"],
            "source": meta["source"],
            "file_path": file_path,
            "n_points": len(spec),
            "slope_vis": fs.slope_vis(spec_norm),
            "slope_nir": fs.slope_nir(spec_norm),
            "band_depth_1um": fs.band_depth_1um(spec_norm),
            "band_center_1um": fs.band_center_1um(spec_norm),
            "band_depth_2um": fs.band_depth_2um(spec_norm),
            "band_center_2um": fs.band_center_2um(spec_norm),
        })
    return pd.DataFrame(rows)


def run(
    *,
    binzel_dir: Optional[Path] = None,
    marsset_dir: Optional[Path] = None,
    write_points: bool = True,
) -> dict:
    started = dt.datetime.utcnow().isoformat()
    binzel = Path(binzel_dir) if binzel_dir else config.MITHNEOS_DIR / "binzel2019"
    marsset = Path(marsset_dir) if marsset_dir else config.MITHNEOS_DIR / "marsset2022"

    log.info("loading spectra: binzel=%s marsset=%s", binzel, marsset)
    long_df = pd.concat(
        [fs.load_spectra_dir(binzel, "binzel"), fs.load_spectra_dir(marsset, "marsset")],
        ignore_index=True,
    )
    if long_df.empty:
        raise RuntimeError(f"no spectra found under {binzel} or {marsset}")

    feats = _per_observation_features(long_df)
    feats = feats.dropna(subset=FEATURE_COLS).reset_index(drop=True)
    if feats.empty:
        raise RuntimeError("all observations failed feature extraction")

    X = feats[FEATURE_COLS].to_numpy()

    log.info("fitting models on %d observations × %d features", *X.shape)
    iso_model, iso_scores, is_anom = anomaly.fit_isolation_forest(X)
    pca_model, pca_coords = cluster.fit_pca(X, n_components=3)
    umap_model, umap_emb = cluster.fit_umap(X)
    hdb_model, hdb_labels, hdb_probs = cluster.fit_hdbscan(
        X, min_cluster_size=max(5, len(X) // 10), min_samples=3
    )

    obs_id = np.arange(1, len(feats) + 1)
    feats_out = feats.copy()
    feats_out.insert(0, "obs_id", obs_id)
    feats_out["pc1"], feats_out["pc2"], feats_out["pc3"] = pca_coords[:, 0], pca_coords[:, 1], pca_coords[:, 2]
    feats_out["umap1"], feats_out["umap2"] = umap_emb[:, 0], umap_emb[:, 1]
    feats_out["hdbscan_label"] = hdb_labels.astype(int)
    feats_out["hdbscan_probability"] = hdb_probs
    feats_out["isoforest_score"] = iso_scores
    feats_out["is_anomaly"] = is_anom

    # Asteroid summary
    asteroids = (
        feats_out.groupby("designation")
        .agg(
            n_observations=("obs_id", "count"),
            sources=("source", lambda s: json.dumps(sorted(set(s)))),
        )
        .reset_index()
    )
    asteroids["name"] = None

    observations = feats_out[["obs_id", "designation", "source", "obs_date", "file_path", "n_points"]]
    features_table = feats_out[[
        "obs_id", "designation",
        "slope_vis", "slope_nir",
        "band_depth_1um", "band_center_1um",
        "band_depth_2um", "band_center_2um",
        "pc1", "pc2", "pc3",
        "umap1", "umap2",
        "hdbscan_label", "hdbscan_probability",
        "isoforest_score", "is_anomaly",
    ]]

    conn = io.get_conn()
    io.init_db(conn)
    io.write_df(asteroids[["designation", "name", "n_observations", "sources"]],
                "neo_asteroids", conn=conn, mode="upsert", pk=["designation"])
    io.write_df(observations, "neo_spectra_observations", conn=conn, mode="append")
    io.write_df(features_table, "neo_spectra_features", conn=conn, mode="append")

    rows_written = len(asteroids) + len(observations) + len(features_table)

    if write_points:
        # Re-merge with obs_id to know which points belong to which observation
        points = long_df.merge(
            feats_out[["obs_id", "file_path"]], on="file_path", how="inner"
        )[["obs_id", "wavelength", "reflectance", "error"]]
        io.write_df(points, "neo_spectra_points", conn=conn, mode="append")
        rows_written += len(points)

    io.save_model(pca_model, "spectra_pca")
    io.save_model(umap_model, "spectra_umap")
    io.save_model(hdb_model, "spectra_hdbscan")
    io.save_model(iso_model, "spectra_isoforest")

    params = {
        "n_observations": int(len(feats_out)),
        "features": FEATURE_COLS,
        "hdbscan": {"min_cluster_size": int(max(5, len(X) // 10)), "min_samples": 3},
        "umap": {"n_neighbors": 15, "min_dist": 0.1},
        "iso_contamination": "auto",
        "random_state": config.RANDOM_STATE,
    }
    finished = dt.datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("neo_spectra", _git_sha(), started, finished, "ok", rows_written, json.dumps(params)),
    )
    conn.commit()
    conn.close()

    log.info("neo_spectra pipeline ok: %d rows written", rows_written)
    return {"n_observations": len(feats_out), "rows_written": rows_written}
