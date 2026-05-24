from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd
import pytest

from exoproximo import io


@pytest.fixture
def small_db(tmp_path, monkeypatch):
    """Build a minimal but realistic exoproximo.db at tmp_path / 'exoproximo.db'."""
    db_path = tmp_path / "exoproximo.db"
    monkeypatch.setattr("exoproximo.config.DB_PATH", db_path)
    conn = io.get_conn(db_path)
    io.init_db(conn)

    asteroids = pd.DataFrame({
        "designation": ["100926", "10115"],
        "name": [None, "Ariadne"],
        "n_observations": [1, 2],
        "sources": ['["binzel"]', '["binzel","marsset"]'],
    })
    io.write_df(asteroids, "neo_asteroids", conn=conn, mode="upsert", pk=["designation"])

    obs = pd.DataFrame({
        "obs_id": [1, 2],
        "designation": ["100926", "10115"],
        "source": ["binzel", "binzel"],
        "obs_date": ["2010-01-01", "2012-06-15"],
        "file_path": ["a.csv", "b.csv"],
        "n_points": [250, 240],
    })
    io.write_df(obs, "neo_spectra_observations", conn=conn, mode="append")

    feats = pd.DataFrame({
        "obs_id": [1, 2], "designation": ["100926", "10115"],
        "slope_vis": [0.42, 0.39], "slope_nir": [-0.04, -0.14],
        "band_depth_1um": [0.13, 0.10], "band_center_1um": [0.96, 1.02],
        "band_depth_2um": [0.06, 0.10], "band_center_2um": [2.04, 1.86],
        "pc1": [0.45, 0.24], "pc2": [-0.77, -0.18], "pc3": [1.09, -0.91],
        "umap1": [2.9, -1.3], "umap2": [-1.9, 0.7],
        "hdbscan_label": [1, 1], "hdbscan_probability": [1.0, 1.0],
        "isoforest_score": [-0.09, -0.11], "is_anomaly": [0, 0],
    })
    io.write_df(feats, "neo_spectra_features", conn=conn, mode="append")

    points = pd.DataFrame({
        "obs_id": [1] * 3 + [2] * 3,
        "wavelength": [0.5, 1.0, 2.0, 0.5, 1.0, 2.0],
        "reflectance": [1.0, 1.05, 0.9, 1.0, 1.02, 0.88],
        "error": [0.01] * 6,
    })
    io.write_df(points, "neo_spectra_points", conn=conn, mode="append")

    elements = pd.DataFrame({
        "designation": ["100926", "10115"],
        "a": [1.78, 1.25], "e": [0.41, 0.32], "i": [24.24, 15.32],
        "om": [221.07, 8.87], "w": [138.81, 233.74], "ma": [135.12, 7.08],
        "epoch": [2460200.5, 2460200.5], "fetched_at": ["2026-05-23T00:00:00"] * 2,
    })
    io.write_df(elements, "neo_orbit_elements", conn=conn, mode="upsert", pk=["designation"])

    physical = pd.DataFrame({
        "designation": ["100926", "10115"],
        "h_mag": [16.63, 17.14], "diameter_km": [1.174, 0.938],
        "albedo": [0.234, 0.318], "spec_class": ["S", "S:"],
        "fetched_at": ["2026-05-23T00:00:00"] * 2,
    })
    io.write_df(physical, "neo_physical", conn=conn, mode="upsert", pk=["designation"])

    ca = pd.DataFrame({
        "ca_id": [1],
        "designation": ["10115"],
        "body": ["Earth"],
        "ca_date": ["2059-Mar-23 21:11"],
        "dist_au": [0.0454],
        "v_rel_km_s": [12.06],
        "fetched_at": ["2026-05-23T00:00:00"],
    })
    io.write_df(ca, "neo_close_approaches", conn=conn, mode="append")

    koi = pd.DataFrame({
        "kepoi_name": ["K00752.01", "K00752.02"],
        "kepler_name": ["Kepler-227 b", "Kepler-227 c"],
        "koi_disposition": ["CONFIRMED", "CONFIRMED"],
        "ra": [291.93, 291.93], "dec": [48.14, 48.14],
        "koi_period": [9.49, 54.42], "koi_duration": [2.96, 4.51],
        "koi_depth": [615.8, 874.8], "koi_prad": [2.26, 2.83],
        "koi_teq": [793.0, 443.0], "koi_insol": [93.59, 9.11],
        "koi_model_snr": [35.8, 25.8], "koi_steff": [5455.0, 5455.0],
        "koi_slogg": [4.467, 4.467], "koi_srad": [0.927, 0.927],
        "koi_smass": [0.919, 0.919], "koi_smet": [0.14, 0.14],
    })
    io.write_df(koi, "koi_objects", conn=conn, mode="upsert", pk=["kepoi_name"])

    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("koi", "abc1234", "2026-05-23T00:00:00", "2026-05-23T00:01:00", "ok", 2, "{}"),
    )
    run_id = conn.execute("SELECT MAX(run_id) FROM meta_runs").fetchone()[0]
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("neo_orbits", "abc1234", "2026-05-23T00:00:00", "2026-05-23T00:01:00", "ok", 2, "{}"),
    )
    conn.commit()

    preds = pd.DataFrame({
        "kepoi_name": ["K00752.01", "K00752.02"],
        "model_run_id": [run_id, run_id],
        "prob_planet": [0.94, 0.88],
        "predicted_label": ["CONFIRMED", "CONFIRMED"],
    })
    io.write_df(preds, "koi_predictions", conn=conn, mode="append")
    conn.close()

    return db_path


def test_export_writes_all_files(small_db, tmp_path):
    import scripts.export_ui_data as exp
    out_dir = tmp_path / "out"
    exp.export(db_path=small_db, out_dir=out_dir)

    assert (out_dir / "neos.json").exists()
    assert (out_dir / "koi.json").exists()
    assert (out_dir / "close_approaches.json").exists()
    assert (out_dir / "meta.json").exists()
    assert (out_dir / "spectra" / "100926.json").exists()
    assert (out_dir / "spectra" / "10115.json").exists()


def test_neos_json_shape(small_db, tmp_path):
    import scripts.export_ui_data as exp
    out_dir = tmp_path / "out"
    exp.export(db_path=small_db, out_dir=out_dir)

    neos = json.loads((out_dir / "neos.json").read_text())
    assert len(neos) == 2
    rec = next(r for r in neos if r["designation"] == "10115")
    assert rec["name"] == "Ariadne"
    assert set(rec["elements"]) == {"a", "e", "i", "om", "w", "ma", "epoch", "n"}
    assert rec["elements"]["n"] > 0
    assert rec["physical"]["spec_class"] == "S:"
    assert rec["spectral"]["slope_vis"] == pytest.approx(0.39)


def test_koi_json_joins_predictions(small_db, tmp_path):
    import scripts.export_ui_data as exp
    out_dir = tmp_path / "out"
    exp.export(db_path=small_db, out_dir=out_dir)

    koi = json.loads((out_dir / "koi.json").read_text())
    assert len(koi) == 2
    rec = next(r for r in koi if r["kepoi_name"] == "K00752.01")
    assert rec["prob_planet"] == pytest.approx(0.94)
    assert rec["ra"] == pytest.approx(291.93)
    assert rec["koi_disposition"] == "CONFIRMED"


def test_meta_json_has_freshness(small_db, tmp_path):
    import scripts.export_ui_data as exp
    out_dir = tmp_path / "out"
    exp.export(db_path=small_db, out_dir=out_dir)

    meta = json.loads((out_dir / "meta.json").read_text())
    assert meta["n_neos"] == 2
    assert meta["n_koi"] == 2
    assert meta["git_sha"] == "abc1234"
    assert "elements_age_days" in meta
    assert meta["elements_age_days"] >= 0


def test_export_fails_loudly_on_empty_required_table(tmp_path, monkeypatch):
    import scripts.export_ui_data as exp
    db_path = tmp_path / "empty.db"
    monkeypatch.setattr("exoproximo.config.DB_PATH", db_path)
    conn = io.get_conn(db_path)
    io.init_db(conn)
    conn.close()
    with pytest.raises(RuntimeError, match="neo_asteroids"):
        exp.export(db_path=db_path, out_dir=tmp_path / "out")


@pytest.fixture
def multi_obs_db(tmp_path, monkeypatch):
    """Like small_db but with two observations for designation '100926' to test most-recent picking."""
    db_path = tmp_path / "exoproximo.db"
    monkeypatch.setattr("exoproximo.config.DB_PATH", db_path)
    conn = io.get_conn(db_path)
    io.init_db(conn)

    io.write_df(
        pd.DataFrame({
            "designation": ["100926"], "name": [None],
            "n_observations": [2], "sources": ['["binzel","marsset"]'],
        }),
        "neo_asteroids", conn=conn, mode="upsert", pk=["designation"],
    )
    io.write_df(
        pd.DataFrame({
            "obs_id": [1, 2],
            "designation": ["100926", "100926"],
            "source": ["binzel", "marsset"],
            "obs_date": ["2010-01-01", "2018-06-15"],   # obs_id=2 is more recent
            "file_path": ["old.csv", "new.csv"],
            "n_points": [3, 3],
        }),
        "neo_spectra_observations", conn=conn, mode="append",
    )
    io.write_df(
        pd.DataFrame({
            "obs_id": [1, 2], "designation": ["100926", "100926"],
            "slope_vis": [0.10, 0.42], "slope_nir": [0.0, -0.04],
            "band_depth_1um": [0.0, 0.13], "band_center_1um": [1.0, 0.96],
            "band_depth_2um": [0.0, 0.06], "band_center_2um": [2.0, 2.04],
            "pc1": [0.0, 0.45], "pc2": [0.0, -0.77], "pc3": [0.0, 1.09],
            "umap1": [0.0, 2.9], "umap2": [0.0, -1.9],
            "hdbscan_label": [-1, 1], "hdbscan_probability": [0.0, 1.0],
            "isoforest_score": [0.0, -0.09], "is_anomaly": [0, 0],
        }),
        "neo_spectra_features", conn=conn, mode="append",
    )
    # OLD observation has wavelengths 0.5, 0.6, 0.7
    # NEW observation has wavelengths 1.0, 1.5, 2.0
    io.write_df(
        pd.DataFrame({
            "obs_id":     [1, 1, 1, 2, 2, 2],
            "wavelength": [0.5, 0.6, 0.7, 1.0, 1.5, 2.0],
            "reflectance":[1.0, 0.9, 0.8, 1.0, 0.95, 0.85],
            "error":      [0.01] * 6,
        }),
        "neo_spectra_points", conn=conn, mode="append",
    )
    io.write_df(
        pd.DataFrame({
            "designation": ["100926"],
            "a": [1.78], "e": [0.41], "i": [24.24],
            "om": [221.07], "w": [138.81], "ma": [135.12],
            "epoch": [2460200.5], "fetched_at": ["2026-05-23T00:00:00"],
        }),
        "neo_orbit_elements", conn=conn, mode="upsert", pk=["designation"],
    )
    io.write_df(
        pd.DataFrame({
            "designation": ["100926"],
            "h_mag": [16.63], "diameter_km": [1.174],
            "albedo": [0.234], "spec_class": ["S"],
            "fetched_at": ["2026-05-23T00:00:00"],
        }),
        "neo_physical", conn=conn, mode="upsert", pk=["designation"],
    )
    io.write_df(
        pd.DataFrame({
            "kepoi_name": ["K00001.01"], "kepler_name": [None],
            "koi_disposition": ["CONFIRMED"],
            "ra": [290.0], "dec": [48.0],
            "koi_period": [1.0], "koi_duration": [1.0],
            "koi_depth": [100.0], "koi_prad": [1.0], "koi_teq": [500.0],
            "koi_insol": [1.0], "koi_model_snr": [10.0],
            "koi_steff": [5500.0], "koi_slogg": [4.5], "koi_srad": [1.0],
            "koi_smass": [1.0], "koi_smet": [0.0],
        }),
        "koi_objects", conn=conn, mode="upsert", pk=["kepoi_name"],
    )
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("neo_orbits", "abc1234", "2026-05-23T00:00:00", "2026-05-23T00:01:00", "ok", 1, "{}"),
    )
    conn.commit()
    conn.close()
    return db_path


def test_spectra_file_contains_only_most_recent_observation(multi_obs_db, tmp_path):
    import scripts.export_ui_data as exp
    out_dir = tmp_path / "out"
    exp.export(db_path=multi_obs_db, out_dir=out_dir)

    spec = json.loads((out_dir / "spectra" / "100926.json").read_text())
    wavelengths = sorted(p["wavelength"] for p in spec)
    # The newer observation (obs_id=2) has wavelengths 1.0, 1.5, 2.0
    assert wavelengths == [1.0, 1.5, 2.0]
    assert all(p["wavelength"] >= 1.0 for p in spec)


def test_meta_git_sha_comes_from_orbits_run_even_when_koi_ran_later(tmp_path, monkeypatch):
    """If KOI ran after neo_orbits, meta.git_sha must still come from neo_orbits."""
    import scripts.export_ui_data as exp
    db_path = tmp_path / "exoproximo.db"
    monkeypatch.setattr("exoproximo.config.DB_PATH", db_path)
    conn = io.get_conn(db_path)
    io.init_db(conn)

    # Minimum data for required tables
    io.write_df(
        pd.DataFrame({"designation": ["100926"], "name": [None],
                      "n_observations": [1], "sources": ['["binzel"]']}),
        "neo_asteroids", conn=conn, mode="upsert", pk=["designation"],
    )
    io.write_df(
        pd.DataFrame({"obs_id": [1], "designation": ["100926"], "source": ["binzel"],
                      "obs_date": ["2010-01-01"], "file_path": ["x.csv"], "n_points": [1]}),
        "neo_spectra_observations", conn=conn, mode="append",
    )
    io.write_df(
        pd.DataFrame({
            "obs_id": [1], "designation": ["100926"],
            "slope_vis": [0.0], "slope_nir": [0.0],
            "band_depth_1um": [0.0], "band_center_1um": [1.0],
            "band_depth_2um": [0.0], "band_center_2um": [2.0],
            "pc1": [0.0], "pc2": [0.0], "pc3": [0.0],
            "umap1": [0.0], "umap2": [0.0],
            "hdbscan_label": [-1], "hdbscan_probability": [0.0],
            "isoforest_score": [0.0], "is_anomaly": [0],
        }),
        "neo_spectra_features", conn=conn, mode="append",
    )
    io.write_df(
        pd.DataFrame({"obs_id": [1], "wavelength": [1.0], "reflectance": [1.0], "error": [0.0]}),
        "neo_spectra_points", conn=conn, mode="append",
    )
    io.write_df(
        pd.DataFrame({"designation": ["100926"], "a": [1.5], "e": [0.1], "i": [5.0],
                      "om": [0.0], "w": [0.0], "ma": [0.0], "epoch": [2460200.5],
                      "fetched_at": ["2026-05-23T00:00:00"]}),
        "neo_orbit_elements", conn=conn, mode="upsert", pk=["designation"],
    )
    io.write_df(
        pd.DataFrame({"kepoi_name": ["K00001.01"], "kepler_name": [None],
                      "koi_disposition": ["CONFIRMED"], "ra": [290.0], "dec": [48.0],
                      "koi_period": [1.0], "koi_duration": [1.0], "koi_depth": [100.0],
                      "koi_prad": [1.0], "koi_teq": [500.0], "koi_insol": [1.0],
                      "koi_model_snr": [10.0], "koi_steff": [5500.0], "koi_slogg": [4.5],
                      "koi_srad": [1.0], "koi_smass": [1.0], "koi_smet": [0.0]}),
        "koi_objects", conn=conn, mode="upsert", pk=["kepoi_name"],
    )
    # neo_orbits ran first (run_id=1)
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("neo_orbits", "orbits1", "2026-05-23T00:00:00", "2026-05-23T00:01:00", "ok", 1, "{}"),
    )
    # koi ran second (run_id=2)
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("koi", "koi9999", "2026-05-23T01:00:00", "2026-05-23T01:01:00", "ok", 1, "{}"),
    )
    conn.commit()
    conn.close()

    out_dir = tmp_path / "out"
    exp.export(db_path=db_path, out_dir=out_dir)
    meta = json.loads((out_dir / "meta.json").read_text())
    assert meta["git_sha"] == "orbits1"
    assert meta["last_run_at"] == "2026-05-23T00:00:00"
