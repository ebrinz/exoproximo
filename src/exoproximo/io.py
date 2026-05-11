"""SQLite + joblib I/O. The only module in exoproximo that touches the filesystem."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable, Optional

import joblib
import pandas as pd

from exoproximo import config


def get_conn(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path is not None else config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def write_df(
    df: pd.DataFrame,
    table: str,
    *,
    conn: sqlite3.Connection,
    mode: str = "append",
    pk: Optional[Iterable[str]] = None,
) -> int:
    """Write a DataFrame to SQLite.

    mode:
        'append'   -> INSERT only (default).
        'replace'  -> DROP + CREATE + INSERT (uses pandas.to_sql).
        'upsert'   -> INSERT ... ON CONFLICT(pk) DO UPDATE SET ... (table must exist; pk required).
    """
    if mode == "replace":
        df.to_sql(table, conn, if_exists="replace", index=False)
        conn.commit()
        return len(df)
    if mode == "append":
        df.to_sql(table, conn, if_exists="append", index=False)
        conn.commit()
        return len(df)
    if mode == "upsert":
        if not pk:
            raise ValueError("upsert requires pk=[col, ...]")
        cols = list(df.columns)
        placeholders = ",".join(["?"] * len(cols))
        cols_sql = ",".join(cols)
        pk_sql = ",".join(pk)
        update_sql = ",".join(f"{c}=excluded.{c}" for c in cols if c not in pk)
        sql = (
            f"INSERT INTO {table} ({cols_sql}) VALUES ({placeholders}) "
            f"ON CONFLICT({pk_sql}) DO UPDATE SET {update_sql}"
        )
        conn.executemany(sql, df.itertuples(index=False, name=None))
        conn.commit()
        return len(df)
    raise ValueError(f"unknown mode: {mode}")


def read_df(query: str, *, conn: sqlite3.Connection, params: tuple = ()) -> pd.DataFrame:
    return pd.read_sql_query(query, conn, params=params)


def save_model(model: object, name: str, *, models_dir: Optional[Path] = None) -> Path:
    out_dir = Path(models_dir) if models_dir is not None else config.MODELS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.joblib"
    joblib.dump(model, path)
    return path


def load_model(name: str, *, models_dir: Optional[Path] = None) -> object:
    in_dir = Path(models_dir) if models_dir is not None else config.MODELS_DIR
    return joblib.load(in_dir / f"{name}.joblib")


_SCHEMA = """
CREATE TABLE IF NOT EXISTS neo_asteroids (
    designation TEXT PRIMARY KEY,
    name TEXT,
    n_observations INTEGER,
    sources TEXT
);

CREATE TABLE IF NOT EXISTS neo_spectra_observations (
    obs_id INTEGER PRIMARY KEY,
    designation TEXT REFERENCES neo_asteroids(designation),
    source TEXT,
    obs_date TEXT,
    file_path TEXT,
    n_points INTEGER
);

CREATE TABLE IF NOT EXISTS neo_spectra_features (
    obs_id INTEGER PRIMARY KEY REFERENCES neo_spectra_observations(obs_id),
    designation TEXT REFERENCES neo_asteroids(designation),
    slope_vis REAL, slope_nir REAL,
    band_depth_1um REAL, band_center_1um REAL,
    band_depth_2um REAL, band_center_2um REAL,
    pc1 REAL, pc2 REAL, pc3 REAL,
    umap1 REAL, umap2 REAL,
    hdbscan_label INTEGER, hdbscan_probability REAL,
    isoforest_score REAL, is_anomaly INTEGER
);

CREATE TABLE IF NOT EXISTS neo_spectra_points (
    obs_id INTEGER REFERENCES neo_spectra_observations(obs_id),
    wavelength REAL, reflectance REAL, error REAL
);
CREATE INDEX IF NOT EXISTS idx_neo_points_obs ON neo_spectra_points(obs_id);

CREATE TABLE IF NOT EXISTS neo_orbit_elements (
    designation TEXT PRIMARY KEY REFERENCES neo_asteroids(designation),
    a REAL, e REAL, i REAL, om REAL, w REAL, ma REAL,
    epoch REAL, fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS neo_physical (
    designation TEXT PRIMARY KEY REFERENCES neo_asteroids(designation),
    h_mag REAL, diameter_km REAL, albedo REAL, spec_class TEXT, fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS neo_close_approaches (
    ca_id INTEGER PRIMARY KEY,
    designation TEXT REFERENCES neo_asteroids(designation),
    body TEXT, ca_date TEXT, dist_au REAL, v_rel_km_s REAL, fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_neo_ca_designation ON neo_close_approaches(designation);

CREATE TABLE IF NOT EXISTS neo_ephemerides (
    designation TEXT REFERENCES neo_asteroids(designation),
    t TEXT,
    x_au REAL, y_au REAL, z_au REAL,
    vx REAL, vy REAL, vz REAL,
    PRIMARY KEY (designation, t)
);
CREATE INDEX IF NOT EXISTS idx_neo_ephem_t ON neo_ephemerides(t);

CREATE TABLE IF NOT EXISTS koi_objects (
    kepoi_name TEXT PRIMARY KEY,
    kepler_name TEXT,
    koi_disposition TEXT,
    koi_period REAL, koi_duration REAL, koi_depth REAL, koi_prad REAL,
    koi_teq REAL, koi_insol REAL, koi_model_snr REAL,
    koi_steff REAL, koi_slogg REAL, koi_srad REAL, koi_smass REAL, koi_smet REAL
);

CREATE TABLE IF NOT EXISTS koi_predictions (
    kepoi_name TEXT REFERENCES koi_objects(kepoi_name),
    model_run_id INTEGER REFERENCES meta_runs(run_id),
    prob_planet REAL,
    predicted_label TEXT,
    PRIMARY KEY (kepoi_name, model_run_id)
);

CREATE TABLE IF NOT EXISTS meta_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline TEXT,
    git_sha TEXT,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    n_rows_written INTEGER,
    params_json TEXT
);
"""


def init_db(conn: sqlite3.Connection) -> None:
    """Create all exoproximo tables if they don't exist."""
    conn.executescript(_SCHEMA)
    conn.commit()
