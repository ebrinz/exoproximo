from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pandas as pd
import pytest

from exoproximo import config, io
from exoproximo.pipelines import neo_orbits


@pytest.fixture
def seeded_asteroids(tmp_outputs):
    conn = io.get_conn()
    io.init_db(conn)
    df = pd.DataFrame({
        "designation": ["433", "1620"],
        "name": [None, None],
        "n_observations": [1, 1],
        "sources": ["[]", "[]"],
    })
    io.write_df(df, "neo_asteroids", conn=conn, mode="upsert", pk=["designation"])
    conn.close()


def _fake_sbdb(designation: str) -> dict:
    return {
        "elements": {"a": 1.5, "e": 0.2, "i": 10.0, "om": 30.0, "w": 60.0, "ma": 90.0, "epoch": 2460000.5},
        "physical": {"h_mag": 11.0, "diameter_km": 17.0, "albedo": 0.2, "spec_class": "S"},
    }


def _fake_ephemerides(designation: str, cadence_days: int, window_years: int) -> pd.DataFrame:
    n = int(365 * window_years / cadence_days)
    base = dt.datetime(2026, 1, 1)
    return pd.DataFrame({
        "t": [(base + dt.timedelta(days=i * cadence_days)).isoformat() for i in range(n)],
        "x_au": [1.0] * n, "y_au": [0.0] * n, "z_au": [0.0] * n,
        "vx": [0.0] * n, "vy": [0.017] * n, "vz": [0.0] * n,
    })


def _fake_close_approaches(designation: str) -> pd.DataFrame:
    return pd.DataFrame({
        "body": ["Earth"],
        "ca_date": ["2029-04-13"],
        "dist_au": [0.0003],
        "v_rel_km_s": [7.4],
    })


def test_neo_orbits_pipeline_uses_mockable_wrappers(seeded_asteroids, monkeypatch, tmp_path):
    monkeypatch.setattr(neo_orbits, "JPL_CACHE_DIR", tmp_path / "jpl_cache")
    monkeypatch.setattr(neo_orbits, "_fetch_sbdb", _fake_sbdb)
    monkeypatch.setattr(neo_orbits, "_fetch_ephemerides", _fake_ephemerides)
    monkeypatch.setattr(neo_orbits, "_fetch_close_approaches", _fake_close_approaches)

    result = neo_orbits.run(cadence_days=14, window_years=2)
    conn = io.get_conn()
    elements = io.read_df("SELECT * FROM neo_orbit_elements", conn=conn)
    physical = io.read_df("SELECT * FROM neo_physical", conn=conn)
    ca = io.read_df("SELECT * FROM neo_close_approaches", conn=conn)
    ephem = io.read_df("SELECT COUNT(*) AS n FROM neo_ephemerides", conn=conn)
    runs = io.read_df("SELECT * FROM meta_runs WHERE pipeline='neo_orbits'", conn=conn)
    conn.close()

    assert len(elements) == 2
    assert len(physical) == 2
    assert len(ca) == 2
    assert ephem["n"].iloc[0] > 0
    assert runs.iloc[0]["status"] == "ok"
    assert result["n_designations"] == 2


def test_cached_fetch_hits_disk_on_second_call(seeded_asteroids, monkeypatch, tmp_path):
    monkeypatch.setattr(neo_orbits, "JPL_CACHE_DIR", tmp_path / "jpl_cache")
    monkeypatch.setattr(neo_orbits, "_fetch_sbdb", _fake_sbdb)
    monkeypatch.setattr(neo_orbits, "_fetch_ephemerides", _fake_ephemerides)
    monkeypatch.setattr(neo_orbits, "_fetch_close_approaches", _fake_close_approaches)

    # First run populates the cache
    neo_orbits.run(cadence_days=14, window_years=2)

    # Now make _fetch_sbdb raise; the run must still succeed by reading from cache
    def boom(_):
        raise AssertionError("cache miss — _fetch_sbdb should not be called")
    monkeypatch.setattr(neo_orbits, "_fetch_sbdb", boom)
    # Clear orbit_elements so we can detect a re-population from cache
    conn = io.get_conn()
    conn.execute("DELETE FROM neo_orbit_elements")
    conn.commit()
    conn.close()
    neo_orbits.run(cadence_days=14, window_years=2)
    conn = io.get_conn()
    assert len(io.read_df("SELECT * FROM neo_orbit_elements", conn=conn)) == 2
    conn.close()


def test_neo_orbits_pipeline_tolerates_single_failure(seeded_asteroids, monkeypatch, tmp_path):
    monkeypatch.setattr(neo_orbits, "JPL_CACHE_DIR", tmp_path / "jpl_cache")

    def sbdb_with_one_error(designation):
        if designation == "433":
            raise RuntimeError("boom")
        return _fake_sbdb(designation)

    monkeypatch.setattr(neo_orbits, "_fetch_sbdb", sbdb_with_one_error)
    monkeypatch.setattr(neo_orbits, "_fetch_ephemerides", _fake_ephemerides)
    monkeypatch.setattr(neo_orbits, "_fetch_close_approaches", _fake_close_approaches)

    result = neo_orbits.run(cadence_days=14, window_years=2)
    assert "errors" in result and "433" in str(result["errors"])
    conn = io.get_conn()
    elements = io.read_df("SELECT * FROM neo_orbit_elements", conn=conn)
    conn.close()
    assert len(elements) == 1  # only 1620 succeeded


def test_neo_orbits_no_ephemerides_skips_horizons(seeded_asteroids, monkeypatch, tmp_path):
    monkeypatch.setattr(neo_orbits, "JPL_CACHE_DIR", tmp_path / "jpl_cache")
    monkeypatch.setattr(neo_orbits, "_fetch_sbdb", _fake_sbdb)
    monkeypatch.setattr(neo_orbits, "_fetch_close_approaches", _fake_close_approaches)

    def boom(*_a, **_kw):
        raise AssertionError("_fetch_ephemerides should not be called with no_ephemerides=True")
    monkeypatch.setattr(neo_orbits, "_fetch_ephemerides", boom)

    result = neo_orbits.run(no_ephemerides=True)

    conn = io.get_conn()
    elements = io.read_df("SELECT * FROM neo_orbit_elements", conn=conn)
    physical = io.read_df("SELECT * FROM neo_physical", conn=conn)
    ca = io.read_df("SELECT * FROM neo_close_approaches", conn=conn)
    ephem_n = io.read_df("SELECT COUNT(*) AS n FROM neo_ephemerides", conn=conn)
    conn.close()

    assert len(elements) == 2
    assert len(physical) == 2
    assert len(ca) == 2
    assert ephem_n["n"].iloc[0] == 0
    assert result["n_designations"] == 2
