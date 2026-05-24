"""Export exoproximo.db into static JSON files for the Next.js UI."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from pathlib import Path
from typing import Optional

import pandas as pd

# Allow `python scripts/export_ui_data.py` from repo root.
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from exoproximo import config, io  # noqa: E402

REQUIRED_TABLES = ["neo_asteroids", "neo_orbit_elements", "neo_spectra_features", "koi_objects"]
GAUSS_K_DEG_PER_DAY = 0.9856076686  # Mean motion of Earth at 1 AU; n = GAUSS_K / sqrt(a^3).


def _compute_mean_motion(a: float, sbdb_n: Optional[float]) -> float:
    if sbdb_n is not None and sbdb_n > 0:
        return float(sbdb_n)
    return GAUSS_K_DEG_PER_DAY / (a ** 1.5)


def _load_neos(conn) -> list[dict]:
    query = """
        SELECT a.designation, a.name,
               e.a AS a, e.e AS e, e.i AS i, e.om AS om, e.w AS w, e.ma AS ma, e.epoch AS epoch,
               p.h_mag, p.diameter_km, p.albedo, p.spec_class,
               f.slope_vis, f.slope_nir,
               f.band_depth_1um, f.band_center_1um,
               f.band_depth_2um, f.band_center_2um,
               f.pc1, f.pc2,
               f.hdbscan_label, f.isoforest_score,
               o.obs_date
        FROM neo_asteroids a
        JOIN neo_orbit_elements e ON e.designation = a.designation
        JOIN neo_spectra_observations o ON o.designation = a.designation
        JOIN neo_spectra_features f ON f.obs_id = o.obs_id
        LEFT JOIN neo_physical p ON p.designation = a.designation
        ORDER BY a.designation, o.obs_date DESC NULLS LAST, o.obs_id DESC
    """
    df = io.read_df(query, conn=conn)
    # Most-recent observation per designation (the ORDER BY puts it first).
    df = df.drop_duplicates(subset=["designation"], keep="first").reset_index(drop=True)

    out = []
    for row in df.itertuples(index=False):
        out.append({
            "designation": row.designation,
            "name": row.name,
            "elements": {
                "a": float(row.a), "e": float(row.e), "i": float(row.i),
                "om": float(row.om), "w": float(row.w), "ma": float(row.ma),
                "epoch": float(row.epoch),
                "n": _compute_mean_motion(float(row.a), None),
            },
            "physical": (
                None
                if row.h_mag is None and row.diameter_km is None and row.albedo is None and row.spec_class is None
                else {
                    "h_mag": _f(row.h_mag), "diameter_km": _f(row.diameter_km),
                    "albedo": _f(row.albedo), "spec_class": row.spec_class,
                }
            ),
            "spectral": {
                "slope_vis": _f(row.slope_vis), "slope_nir": _f(row.slope_nir),
                "band_depth_1um": _f(row.band_depth_1um), "band_center_1um": _f(row.band_center_1um),
                "band_depth_2um": _f(row.band_depth_2um), "band_center_2um": _f(row.band_center_2um),
                "pc1": _f(row.pc1), "pc2": _f(row.pc2),
                "hdbscan_label": int(row.hdbscan_label) if row.hdbscan_label is not None else -1,
                "isoforest_score": _f(row.isoforest_score),
            },
        })
    return out


def _load_koi(conn) -> list[dict]:
    query = """
        WITH latest_run AS (
            SELECT MAX(model_run_id) AS run_id FROM koi_predictions
        )
        SELECT k.kepoi_name, k.kepler_name, k.ra, k.dec, k.koi_disposition,
               k.koi_period, k.koi_prad, k.koi_teq, k.koi_steff, k.koi_srad,
               p.prob_planet
        FROM koi_objects k
        LEFT JOIN koi_predictions p
          ON p.kepoi_name = k.kepoi_name
         AND p.model_run_id = (SELECT run_id FROM latest_run)
        WHERE k.ra IS NOT NULL AND k.dec IS NOT NULL
        ORDER BY k.kepoi_name
    """
    df = io.read_df(query, conn=conn)
    return [
        {
            "kepoi_name": row.kepoi_name,
            "kepler_name": row.kepler_name,
            "ra": float(row.ra), "dec": float(row.dec),
            "koi_disposition": row.koi_disposition,
            "koi_period": _f(row.koi_period),
            "koi_prad": _f(row.koi_prad),
            "koi_teq": _f(row.koi_teq),
            "koi_steff": _f(row.koi_steff),
            "koi_srad": _f(row.koi_srad),
            "prob_planet": _f(row.prob_planet),
        }
        for row in df.itertuples(index=False)
    ]


def _load_close_approaches(conn) -> list[dict]:
    df = io.read_df(
        "SELECT designation, body, ca_date, dist_au, v_rel_km_s FROM neo_close_approaches ORDER BY ca_date",
        conn=conn,
    )
    return [
        {
            "designation": row.designation, "body": row.body,
            "ca_date": row.ca_date, "dist_au": float(row.dist_au),
            "v_rel_km_s": float(row.v_rel_km_s),
        }
        for row in df.itertuples(index=False)
    ]


def _write_spectra(conn, out_dir: Path) -> int:
    spectra_dir = out_dir / "spectra"
    spectra_dir.mkdir(parents=True, exist_ok=True)
    designations = io.read_df(
        "SELECT DISTINCT designation FROM neo_spectra_observations ORDER BY designation",
        conn=conn,
    )["designation"].tolist()
    count = 0
    for des in designations:
        df = io.read_df(
            """
            SELECT pts.wavelength, pts.reflectance, pts.error
            FROM neo_spectra_points pts
            WHERE pts.obs_id = (
                SELECT o2.obs_id FROM neo_spectra_observations o2
                WHERE o2.designation = ?
                ORDER BY o2.obs_date DESC NULLS LAST, o2.obs_id DESC
                LIMIT 1
            )
            ORDER BY pts.wavelength
            """,
            conn=conn, params=(des,),
        )
        if df.empty:
            continue
        records = [
            {"wavelength": float(r.wavelength), "reflectance": float(r.reflectance),
             "error": float(r.error) if r.error is not None else 0.0}
            for r in df.itertuples(index=False)
        ]
        (spectra_dir / f"{_safe_name(des)}.json").write_text(json.dumps(records))
        count += 1
    return count


def _load_meta(conn) -> dict:
    runs = io.read_df(
        "SELECT git_sha, started_at, pipeline FROM meta_runs ORDER BY run_id DESC LIMIT 50",
        conn=conn,
    )
    orbits_run = runs[runs["pipeline"] == "neo_orbits"]
    has_orbits = not orbits_run.empty
    elements_started = orbits_run.iloc[0]["started_at"] if has_orbits else None

    elements_age_days = -1
    if elements_started:
        try:
            t = dt.datetime.fromisoformat(elements_started.replace("Z", "+00:00"))
            if t.tzinfo is None:
                t = t.replace(tzinfo=dt.timezone.utc)
            age = (dt.datetime.now(dt.timezone.utc) - t).total_seconds() / 86400.0
            elements_age_days = max(0, int(age))
        except Exception:
            elements_age_days = -1

    # Prefer the neo_orbits run for git_sha/last_run_at because that's what
    # drives positional freshness in the UI. Fall back to any latest run only
    # if no orbits run exists yet.
    if has_orbits:
        git_sha = orbits_run.iloc[0]["git_sha"]
        last_run_at = orbits_run.iloc[0]["started_at"]
    elif not runs.empty:
        git_sha = runs.iloc[0]["git_sha"]
        last_run_at = runs.iloc[0]["started_at"]
    else:
        git_sha = "unknown"
        last_run_at = None

    n_neos = int(io.read_df("SELECT COUNT(*) AS n FROM neo_orbit_elements", conn=conn)["n"].iloc[0])
    n_koi = int(io.read_df("SELECT COUNT(*) AS n FROM koi_objects WHERE ra IS NOT NULL", conn=conn)["n"].iloc[0])

    return {
        "git_sha": git_sha,
        "last_run_at": last_run_at,
        "elements_age_days": elements_age_days,
        "n_neos": n_neos,
        "n_koi": n_koi,
    }


def _f(v) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f):
        return None
    return f


def _safe_name(s: str) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in s)


def _check_required_tables(conn) -> None:
    for t in REQUIRED_TABLES:
        n = io.read_df(f"SELECT COUNT(*) AS n FROM {t}", conn=conn)["n"].iloc[0]
        if n == 0:
            raise RuntimeError(
                f"required table {t} is empty. "
                f"Run the upstream pipeline (`exo neo-orbits --no-ephemerides` for NEO tables, "
                f"`exo koi` for koi_objects)."
            )


def export(*, db_path: Optional[Path] = None, out_dir: Path) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = io.get_conn(db_path) if db_path else io.get_conn()
    try:
        _check_required_tables(conn)
        neos = _load_neos(conn)
        koi = _load_koi(conn)
        ca = _load_close_approaches(conn)
        meta = _load_meta(conn)
        n_spectra = _write_spectra(conn, out_dir)
    finally:
        conn.close()

    (out_dir / "neos.json").write_text(json.dumps(neos))
    (out_dir / "koi.json").write_text(json.dumps(koi))
    (out_dir / "close_approaches.json").write_text(json.dumps(ca))
    (out_dir / "meta.json").write_text(json.dumps(meta))

    return {"n_neos": len(neos), "n_koi": len(koi), "n_close_approaches": len(ca), "n_spectra_files": n_spectra}


def _main() -> None:
    parser = argparse.ArgumentParser(description="Export exoproximo.db -> ui/public/data/")
    parser.add_argument("--db", type=Path, default=None, help="Path to exoproximo.db (default: config.DB_PATH).")
    parser.add_argument(
        "--out", type=Path, default=Path(__file__).parent.parent / "ui" / "public" / "data",
        help="Output directory (default: ui/public/data).",
    )
    args = parser.parse_args()
    summary = export(db_path=args.db, out_dir=args.out)
    print(summary)


if __name__ == "__main__":
    _main()
