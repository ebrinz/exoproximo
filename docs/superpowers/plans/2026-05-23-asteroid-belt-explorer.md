# Asteroid Belt Explorer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 15 static-export web app at `ui/` inside `exoproximo` that visualizes 667 NEOs as a 3D heliocentric scene and ~9,200 KOIs as a Kepler-FOV sky map, with all orbital propagation done in-browser via a ported `kepler.ts`.

**Architecture:** Three pipeline-side prereqs (`--no-ephemerides` flag, KOI ra/dec schema widening, JSON export script) populate `ui/public/data/`. The Next.js app reads only those JSON files. R3F renders the 3D scene; per-frame Kepler propagation drives 667 instanced asteroids. KOI route uses a 2D canvas. Zustand owns global state (current JD, selected designation).

**Tech Stack:** Python 3.11 (existing pipeline), Next.js 15 + React 19 + TypeScript, React Three Fiber + drei + postprocessing, Tailwind, Zustand, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-23-asteroid-belt-explorer-design.md`

---

## Task 1: Add `--no-ephemerides` flag to `exo neo-orbits`

**Files:**
- Modify: `src/exoproximo/pipelines/neo_orbits.py`
- Modify: `src/exoproximo/cli.py`
- Modify: `tests/test_pipeline_neo_orbits.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_pipeline_neo_orbits.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_pipeline_neo_orbits.py::test_neo_orbits_no_ephemerides_skips_horizons -v
```

Expected: FAIL with `TypeError: run() got an unexpected keyword argument 'no_ephemerides'`.

- [ ] **Step 3: Add the parameter to `neo_orbits.run`**

In `src/exoproximo/pipelines/neo_orbits.py`, change the signature of `run` and skip the ephemeris fetch when the flag is set:

```python
def run(
    *,
    cadence_days: int = DEFAULT_CADENCE_DAYS,
    window_years: int = DEFAULT_WINDOW_YEARS,
    limit: Optional[int] = None,
    no_ephemerides: bool = False,
) -> dict:
```

Inside the per-designation loop, wrap the ephemeris block:

```python
        if not no_ephemerides:
            try:
                eph = _cached_fetch("ephem", des, _fetch_ephemerides, cadence_days, window_years).copy()
                eph.insert(0, "designation", des)
                ephem_frames.append(eph)
            except Exception as e:
                errors[des] = errors.get(des, "") + f"; ephem: {e}"
```

Add `"no_ephemerides": no_ephemerides` to the `params` dict written into `meta_runs`.

- [ ] **Step 4: Wire the flag through the CLI**

In `src/exoproximo/cli.py`, update the `neo_orbits` command:

```python
@app.command("neo-orbits")
def neo_orbits(
    cadence_days: int = typer.Option(7, help="Ephemeris cadence in days."),
    window_years: int = typer.Option(10, help="Ephemeris window in years centered on today."),
    limit: Optional[int] = typer.Option(None, help="Process only the first N designations (smoke testing)."),
    no_ephemerides: bool = typer.Option(False, "--no-ephemerides", help="Skip Horizons ephemeris fetch; only SBDB + CAD."),
) -> None:
    """Run the NEO orbits pipeline (SBDB + Horizons ephemerides + close approaches)."""
    result = neo_orbits_mod.run(
        cadence_days=cadence_days, window_years=window_years, limit=limit, no_ephemerides=no_ephemerides,
    )
    typer.echo(result)
```

- [ ] **Step 5: Run all neo_orbits tests**

```bash
uv run pytest tests/test_pipeline_neo_orbits.py -v
```

Expected: all tests PASS, including the new one.

- [ ] **Step 6: Commit**

```bash
git add src/exoproximo/pipelines/neo_orbits.py src/exoproximo/cli.py tests/test_pipeline_neo_orbits.py
git commit -m "$(cat <<'EOF'
feat(pipelines): --no-ephemerides flag for neo-orbits

Skips the per-designation Horizons ephemeris fetch so a full 667-NEO
run takes ~5 min instead of ~30 min. Enables the asteroid belt explorer
UI subproject to consume orbital elements without waiting on ephemerides
it doesn't need.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Widen `koi_objects` schema with `ra`, `dec`

**Files:**
- Modify: `src/exoproximo/io.py` (schema)
- Modify: `src/exoproximo/pipelines/koi.py` (persist new columns)
- Modify: `tests/test_pipeline_koi.py` (assert presence)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_pipeline_koi.py`:

```python
def test_koi_persists_ra_dec(tmp_outputs):
    from exoproximo.pipelines import koi as koi_mod
    parquet = Path(__file__).parent / "fixtures" / "koi_small.parquet"
    koi_mod.run(koi_parquet=parquet)

    conn = io.get_conn()
    df = io.read_df("SELECT kepoi_name, ra, dec FROM koi_objects", conn=conn)
    conn.close()

    assert "ra" in df.columns
    assert "dec" in df.columns
    assert df["ra"].notna().all()
    assert df["dec"].notna().all()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_pipeline_koi.py::test_koi_persists_ra_dec -v
```

Expected: FAIL with `OperationalError: no such column: ra`.

- [ ] **Step 3: Add `ra` and `dec` to the schema**

In `src/exoproximo/io.py`, update the `koi_objects` block of `_SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS koi_objects (
    kepoi_name TEXT PRIMARY KEY,
    kepler_name TEXT,
    koi_disposition TEXT,
    ra REAL, dec REAL,
    koi_period REAL, koi_duration REAL, koi_depth REAL, koi_prad REAL,
    koi_teq REAL, koi_insol REAL, koi_model_snr REAL,
    koi_steff REAL, koi_slogg REAL, koi_srad REAL, koi_smass REAL, koi_smet REAL
);
```

The existing DB will not auto-migrate. Add to `init_db`:

```python
def init_db(conn: sqlite3.Connection) -> None:
    """Create all exoproximo tables if they don't exist, and apply additive migrations."""
    conn.executescript(_SCHEMA)
    # Additive migrations: add columns if missing.
    cols = {row[1] for row in conn.execute("PRAGMA table_info(koi_objects)").fetchall()}
    if "ra" not in cols:
        conn.execute("ALTER TABLE koi_objects ADD COLUMN ra REAL")
    if "dec" not in cols:
        conn.execute("ALTER TABLE koi_objects ADD COLUMN dec REAL")
    conn.commit()
```

- [ ] **Step 4: Persist `ra` and `dec` in the koi pipeline**

In `src/exoproximo/pipelines/koi.py`, update `FEATURE_COLS` and the persist step. Add `ra` and `dec` to `keep_cols` but **not** to `FEATURE_COLS` (we don't want sky position leaking into the classifier features):

```python
COORDS = ["ra", "dec"]
STELLAR = ["koi_steff", "koi_slogg", "koi_srad", "koi_smass", "koi_smet"]
TRANSIT = ["koi_period", "koi_duration", "koi_depth", "koi_prad", "koi_teq", "koi_insol", "koi_model_snr"]
FEATURE_COLS = STELLAR + TRANSIT
PERSIST_COLS = COORDS + FEATURE_COLS
```

Then update:

```python
    keep_cols = ["kepoi_name", "kepler_name", "koi_disposition"] + PERSIST_COLS
    missing = [c for c in keep_cols if c not in df.columns]
    if missing:
        raise RuntimeError(f"KOI parquet missing columns: {missing}")
    df = df[keep_cols].copy()

    df[STELLAR] = df[STELLAR].fillna(df[STELLAR].median())
    df = df.dropna(subset=TRANSIT + COORDS).reset_index(drop=True)
```

And the persist call:

```python
    io.write_df(df[["kepoi_name", "kepler_name", "koi_disposition"] + PERSIST_COLS],
                "koi_objects", conn=conn, mode="upsert", pk=["kepoi_name"])
```

- [ ] **Step 5: Verify fixture has `ra`/`dec`**

```bash
uv run python -c "import pandas as pd; df = pd.read_parquet('tests/fixtures/koi_small.parquet'); print(sorted(df.columns)[:20])"
```

Expected: output includes `dec` and `ra`. If missing, regenerate the fixture by re-running `uv run exo fetch` then taking a slice.

- [ ] **Step 6: Run all koi tests**

```bash
uv run pytest tests/test_pipeline_koi.py -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/exoproximo/io.py src/exoproximo/pipelines/koi.py tests/test_pipeline_koi.py
git commit -m "$(cat <<'EOF'
feat(pipelines): persist KOI ra/dec for sky-map visualization

Adds ra/dec to koi_objects schema (with additive migration on init_db)
and threads them through the koi pipeline. Sky position is intentionally
excluded from classifier feature columns to keep leakage discipline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write `scripts/export_ui_data.py`

**Files:**
- Create: `scripts/export_ui_data.py`
- Create: `tests/test_export_ui_data.py`
- Create: `tests/fixtures/exoproximo_small.db` (generated, not committed; see Step 1)

- [ ] **Step 1: Create a tiny synthetic SQLite fixture builder**

Add a `conftest.py` helper or include the builder directly in the test. The cleanest approach: a `pytest` fixture in `tests/test_export_ui_data.py` that builds the small DB on the fly into `tmp_path`.

Write `tests/test_export_ui_data.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/test_export_ui_data.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.export_ui_data'` or `ImportError`.

- [ ] **Step 3: Create the export script**

Create `scripts/export_ui_data.py`:

```python
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
            JOIN neo_spectra_observations o ON o.obs_id = pts.obs_id
            WHERE o.designation = ?
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
    latest = runs.iloc[0] if not runs.empty else None
    orbits_run = runs[runs["pipeline"] == "neo_orbits"]
    elements_started = orbits_run.iloc[0]["started_at"] if not orbits_run.empty else None
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

    n_neos = int(io.read_df("SELECT COUNT(*) AS n FROM neo_orbit_elements", conn=conn)["n"].iloc[0])
    n_koi = int(io.read_df("SELECT COUNT(*) AS n FROM koi_objects WHERE ra IS NOT NULL", conn=conn)["n"].iloc[0])

    return {
        "git_sha": latest["git_sha"] if latest is not None else "unknown",
        "last_run_at": latest["started_at"] if latest is not None else None,
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
```

- [ ] **Step 4: Run the tests**

```bash
uv run pytest tests/test_export_ui_data.py -v
```

Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/export_ui_data.py tests/test_export_ui_data.py
git commit -m "$(cat <<'EOF'
feat(scripts): export_ui_data writes static JSON for the UI

Reads outputs/exoproximo.db and projects the data contract into JSON
files under ui/public/data/. Fails loudly when required tables are
empty so we never produce an empty UI silently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Populate the live database and run the export

**Files:**
- None (manual data population step). Updates `outputs/exoproximo.db` and `ui/public/data/` (both gitignored).

- [ ] **Step 1: Run the orbits pipeline without ephemerides**

```bash
uv run exo -v neo-orbits --no-ephemerides
```

Expected: per-designation `INFO orbits: ...` lines for all 667 designations. Runs ~5–10 min. Final line ends with `n_designations: 667`. Tolerated per-designation errors are fine.

- [ ] **Step 2: Re-run KOI pipeline so ra/dec persist**

```bash
uv run exo koi
```

Expected: completes in ~20s. Output contains `best_kind` and `test_metrics`.

- [ ] **Step 3: Sanity-check the DB**

```bash
sqlite3 outputs/exoproximo.db <<'SQL'
SELECT (SELECT COUNT(*) FROM neo_orbit_elements) AS elements,
       (SELECT COUNT(*) FROM neo_physical) AS physical,
       (SELECT COUNT(*) FROM koi_objects WHERE ra IS NOT NULL) AS koi_with_radec;
SQL
```

Expected: elements and physical both well over 500 (close to 667); koi_with_radec > 9000.

- [ ] **Step 4: Run the export**

```bash
mkdir -p ui/public/data
uv run python scripts/export_ui_data.py --out ui/public/data
ls ui/public/data/
du -sh ui/public/data/
```

Expected: lists `neos.json`, `koi.json`, `close_approaches.json`, `meta.json`, `spectra/`. Total size under 5 MB.

- [ ] **Step 5: No commit (data dir is gitignored)**

The `ui/public/data/` directory is gitignored (see Task 5 for the gitignore line). Nothing to commit here. Move on.

---

## Task 5: Scaffold the Next.js 15 app in `ui/`

**Files:**
- Create: `ui/package.json`
- Create: `ui/tsconfig.json`
- Create: `ui/next.config.ts`
- Create: `ui/next-env.d.ts`
- Create: `ui/.gitignore`
- Modify: `.gitignore` (root)
- Create: `ui/src/app/layout.tsx`
- Create: `ui/src/app/page.tsx`
- Create: `ui/src/app/exoplanets/page.tsx`
- Create: `ui/src/styles/globals.css`

- [ ] **Step 1: Add `ui/` data dir to root `.gitignore`**

Append to the root `.gitignore`:

```
# UI generated assets
ui/public/data/
ui/.next/
ui/node_modules/
ui/out/
```

- [ ] **Step 2: Create `ui/package.json`**

```json
{
  "name": "exoproximo-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "predev": "uv --directory .. run python ../scripts/export_ui_data.py --out public/data",
    "prebuild": "uv --directory .. run python ../scripts/export_ui_data.py --out public/data",
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "three": "0.169.0",
    "@react-three/fiber": "8.17.10",
    "@react-three/drei": "9.114.0",
    "@react-three/postprocessing": "2.16.3",
    "zustand": "5.0.1",
    "clsx": "2.1.1"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "@types/three": "0.169.0",
    "@types/node": "22.7.4",
    "tailwindcss": "3.4.13",
    "postcss": "8.4.47",
    "autoprefixer": "10.4.20",
    "eslint": "9.12.0",
    "eslint-config-next": "15.0.3",
    "vitest": "2.1.2",
    "@vitest/ui": "2.1.2",
    "@playwright/test": "1.48.0",
    "happy-dom": "15.7.4"
  }
}
```

- [ ] **Step 3: Create `ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "out", ".next", "tests-e2e"]
}
```

- [ ] **Step 4: Create `ui/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 5: Create `ui/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 6: Create `ui/.gitignore`**

```
node_modules/
.next/
out/
public/data/
*.log
.DS_Store
playwright-report/
test-results/
```

- [ ] **Step 7: Create app router skeleton**

`ui/src/app/layout.tsx`:

```tsx
import "@/styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exoproximo · Belt Explorer",
  description: "NEO spectra, orbits, and Kepler candidates.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-fg font-mono antialiased">{children}</body>
    </html>
  );
}
```

`ui/src/app/page.tsx`:

```tsx
export default function BeltPage() {
  return (
    <main className="h-screen w-screen flex items-center justify-center text-dim">
      <span>── belt scene coming online ──</span>
    </main>
  );
}
```

`ui/src/app/exoplanets/page.tsx`:

```tsx
export default function ExoplanetsPage() {
  return (
    <main className="h-screen w-screen flex items-center justify-center text-dim">
      <span>── kepler field coming online ──</span>
    </main>
  );
}
```

`ui/src/styles/globals.css` (placeholder until Task 6 fills in tokens):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; margin: 0; }
```

- [ ] **Step 8: Install dependencies**

```bash
cd ui && npm install
```

Expected: completes without errors. `ui/node_modules/` populated.

- [ ] **Step 9: Verify it builds**

```bash
cd ui && npm run build
```

Expected: build succeeds, produces `ui/out/` static output. Treat any warnings about `output: 'export'` as fine.

- [ ] **Step 10: Commit**

```bash
git add .gitignore ui/package.json ui/package-lock.json ui/tsconfig.json ui/next.config.ts ui/next-env.d.ts ui/.gitignore ui/src/app/layout.tsx ui/src/app/page.tsx ui/src/app/exoplanets/page.tsx ui/src/styles/globals.css
git commit -m "$(cat <<'EOF'
feat(ui): scaffold Next.js 15 static-export app

Bare skeleton with two routes (/ and /exoplanets) and the data-export
prebuild hook wired in. No 3D yet; subsequent tasks fill in design
tokens, math libs, and the R3F scene.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tailwind config, design tokens, fonts

**Files:**
- Create: `ui/tailwind.config.ts`
- Create: `ui/postcss.config.mjs`
- Modify: `ui/src/styles/globals.css`
- Modify: `ui/src/app/layout.tsx`

- [ ] **Step 1: Create `ui/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#05070d",
        fg: "#e8eef5",
        dim: "#6b7385",
        rule: "#1a2233",
        accent: "#7ee8ff",
        warn: "#ffb547",
        alert: "#ff5e7a",
        metal: "#b18cff",
        green: "#8af0a7",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
      },
      letterSpacing: {
        caps: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Create `ui/postcss.config.mjs`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 3: Update `ui/src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; margin: 0; }
body { background: #05070d; color: #e8eef5; }

/* Section labels: SPACED CAPS */
.label-caps {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 11px;
  color: #6b7385;
}

/* Bracketed identifier: [523934] */
.id-bracket::before { content: "["; color: #6b7385; }
.id-bracket::after  { content: "]"; color: #6b7385; }

/* Numeric with dim unit */
.unit { color: #6b7385; margin-left: 0.4ch; }

/* Panel with hairline border */
.panel {
  border: 1px solid #1a2233;
  background: rgba(5, 7, 13, 0.78);
  backdrop-filter: blur(4px);
}
```

- [ ] **Step 4: Load fonts in layout**

Update `ui/src/app/layout.tsx`:

```tsx
import "@/styles/globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Exoproximo · Belt Explorer",
  description: "NEO spectra, orbits, and Kepler candidates.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <body className="bg-bg text-fg font-mono antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Verify a Tailwind utility renders**

Update `ui/src/app/page.tsx` to confirm tokens:

```tsx
export default function BeltPage() {
  return (
    <main className="h-screen w-screen flex items-center justify-center bg-bg">
      <span className="label-caps">── belt scene coming online ──</span>
    </main>
  );
}
```

- [ ] **Step 6: Verify dev server**

```bash
cd ui && npm run dev
```

Open http://localhost:3000 in a browser. Expected: near-black background, dim-grey spaced-caps text centered. Stop the server with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add ui/tailwind.config.ts ui/postcss.config.mjs ui/src/styles/globals.css ui/src/app/layout.tsx ui/src/app/page.tsx ui/package-lock.json
git commit -m "feat(ui): tailwind tokens + IBM Plex Mono / Space Grotesk fonts"
```

---

## Task 7: Shared types and time helpers

**Files:**
- Create: `ui/src/lib/types.ts`
- Create: `ui/src/lib/time.ts`
- Create: `ui/src/lib/__tests__/time.test.ts`
- Create: `ui/vitest.config.ts`

- [ ] **Step 1: Create `ui/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "happy-dom", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 2: Create `ui/src/lib/types.ts`**

```ts
export type OrbitalElements = {
  a: number; e: number; i: number;
  om: number; w: number; ma: number;
  epoch: number; n: number;
};

export type Physical = {
  h_mag: number | null;
  diameter_km: number | null;
  albedo: number | null;
  spec_class: string | null;
};

export type Spectral = {
  slope_vis: number; slope_nir: number;
  band_depth_1um: number; band_center_1um: number;
  band_depth_2um: number; band_center_2um: number;
  pc1: number; pc2: number;
  hdbscan_label: number;
  isoforest_score: number;
};

export type NeoRecord = {
  designation: string;
  name: string | null;
  elements: OrbitalElements;
  physical: Physical | null;
  spectral: Spectral;
};

export type KoiRecord = {
  kepoi_name: string;
  kepler_name: string | null;
  ra: number; dec: number;
  koi_disposition: "CONFIRMED" | "CANDIDATE" | "FALSE POSITIVE";
  koi_period: number | null;
  koi_prad: number | null;
  koi_teq: number | null;
  koi_steff: number | null;
  koi_srad: number | null;
  prob_planet: number | null;
};

export type CloseApproachRecord = {
  designation: string;
  body: string;
  ca_date: string;
  dist_au: number;
  v_rel_km_s: number;
};

export type SpectrumPoint = { wavelength: number; reflectance: number; error: number };
export type SpectrumFile = SpectrumPoint[];

export type Meta = {
  git_sha: string;
  last_run_at: string | null;
  elements_age_days: number;
  n_neos: number;
  n_koi: number;
};
```

- [ ] **Step 3: Write the failing time-helper tests**

`ui/src/lib/__tests__/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dateToJd, jdToDate, jdNow, J2000 } from "../time";

describe("time helpers", () => {
  it("dateToJd matches J2000", () => {
    const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    expect(dateToJd(d)).toBeCloseTo(J2000, 5);
  });

  it("jdToDate is the inverse of dateToJd", () => {
    const d = new Date(Date.UTC(2026, 4, 23, 0, 0, 0));
    const round = jdToDate(dateToJd(d));
    expect(round.getTime()).toBe(d.getTime());
  });

  it("jdNow returns a JD near the current time", () => {
    const before = dateToJd(new Date());
    const n = jdNow();
    const after = dateToJd(new Date());
    expect(n).toBeGreaterThanOrEqual(before);
    expect(n).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/time.test.ts
```

Expected: FAIL with `Cannot find module '../time'`.

- [ ] **Step 5: Create `ui/src/lib/time.ts`**

```ts
export const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;

export function dateToJd(d: Date): number {
  return d.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

export function jdToDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY);
}

export function jdNow(): number {
  return dateToJd(new Date());
}
```

- [ ] **Step 6: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/time.test.ts
```

Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/src/lib/types.ts ui/src/lib/time.ts ui/src/lib/__tests__/time.test.ts ui/vitest.config.ts
git commit -m "feat(ui): shared types and JD<->Date helpers"
```

---

## Task 8: Port `kepler.ts` from technolabe (TDD)

**Files:**
- Create: `ui/src/lib/kepler.ts`
- Create: `ui/src/lib/__tests__/kepler.test.ts`

- [ ] **Step 1: Write the failing test**

`ui/src/lib/__tests__/kepler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { solveKepler, heliocentricCartesian, EARTH_ELEMENTS } from "../kepler";
import { J2000 } from "../time";
import type { OrbitalElements } from "../types";

const CERES: OrbitalElements = {
  a: 2.7658, e: 0.0758, i: 10.593,
  om: 80.305, w: 73.597, ma: 95.989,
  epoch: J2000, n: 0.21408,
};

describe("kepler", () => {
  it("solveKepler converges for circular orbit", () => {
    const E = solveKepler(45, 0);
    expect(E).toBeCloseTo((45 * Math.PI) / 180, 6);
  });

  it("solveKepler converges for moderately eccentric orbit", () => {
    const E = solveKepler(45, 0.5);
    expect(E - 0.5 * Math.sin(E) - (45 * Math.PI) / 180).toBeCloseTo(0, 8);
  });

  it("heliocentricCartesian returns ~2.77 AU heliocentric distance for Ceres", () => {
    const [x, y, z] = heliocentricCartesian(CERES, J2000);
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r).toBeGreaterThan(2.0);
    expect(r).toBeLessThan(3.5);
  });

  it("Earth element propagation gives ~1 AU heliocentric distance", () => {
    const [x, y, z] = heliocentricCartesian(EARTH_ELEMENTS, J2000);
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r).toBeGreaterThan(0.97);
    expect(r).toBeLessThan(1.03);
  });

  it("Ceres position drifts after 100 days", () => {
    const [x0] = heliocentricCartesian(CERES, J2000);
    const [x1] = heliocentricCartesian(CERES, J2000 + 100);
    expect(x1).not.toBeCloseTo(x0, 2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/kepler.test.ts
```

Expected: FAIL with `Cannot find module '../kepler'`.

- [ ] **Step 3: Create `ui/src/lib/kepler.ts`**

Port from `/Users/crashy/Development/technolabe/natal-chart-app/src/lib/ephemeris/kepler.ts` and add a Cartesian wrapper:

```ts
import type { OrbitalElements } from "./types";
import { J2000 } from "./time";

const deg2rad = (d: number) => (d * Math.PI) / 180;
const mod360 = (n: number) => ((n % 360) + 360) % 360;

export function meanAnomaly(elements: OrbitalElements, jd: number): number {
  return mod360(elements.ma + elements.n * (jd - elements.epoch));
}

export function solveKepler(meanAnomalyDeg: number, eccentricity: number): number {
  const m = deg2rad(meanAnomalyDeg);
  let E = eccentricity < 0.8 ? m : Math.PI;
  for (let i = 0; i < 50; i++) {
    const delta =
      (E - eccentricity * Math.sin(E) - m) / (1 - eccentricity * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

export function trueAnomaly(E: number, e: number): number {
  const beta = e / (1 + Math.sqrt(1 - e * e));
  return E + 2 * Math.atan((beta * Math.sin(E)) / (1 - beta * Math.cos(E)));
}

export function heliocentricRadius(a: number, e: number, E: number): number {
  return a * (1 - e * Math.cos(E));
}

/** Heliocentric ecliptic Cartesian (x, y, z) in AU. */
export function heliocentricCartesian(
  elements: OrbitalElements,
  jd: number,
): [number, number, number] {
  const m = meanAnomaly(elements, jd);
  const E = solveKepler(m, elements.e);
  const ta = trueAnomaly(E, elements.e);
  const r = heliocentricRadius(elements.a, elements.e, E);
  const xOrb = r * Math.cos(ta);
  const yOrb = r * Math.sin(ta);

  const nodeRad = deg2rad(elements.om);
  const periRad = deg2rad(elements.w);
  const iRad = deg2rad(elements.i);
  const cosN = Math.cos(nodeRad), sinN = Math.sin(nodeRad);
  const cosI = Math.cos(iRad),    sinI = Math.sin(iRad);
  const cosP = Math.cos(periRad), sinP = Math.sin(periRad);

  const p1 = cosP * cosN - sinP * sinN * cosI;
  const p2 = cosP * sinN + sinP * cosN * cosI;
  const p3 = sinP * sinI;
  const q1 = -sinP * cosN - cosP * sinN * cosI;
  const q2 = -sinP * sinN + cosP * cosN * cosI;
  const q3 = cosP * sinI;

  const x = p1 * xOrb + q1 * yOrb;
  const y = p2 * xOrb + q2 * yOrb;
  const z = p3 * xOrb + q3 * yOrb;
  return [x, y, z];
}

/** Earth's orbital elements at J2000 (textbook). Used for propagating Earth in-scene. */
export const EARTH_ELEMENTS: OrbitalElements = {
  a: 1.00000011, e: 0.01671022, i: 0.00005,
  om: 348.73936, w: 102.94719, ma: 357.51716,
  epoch: J2000, n: 0.9856474,
};
```

- [ ] **Step 4: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/kepler.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/kepler.ts ui/src/lib/__tests__/kepler.test.ts
git commit -m "feat(ui): port kepler propagator from technolabe"
```

---

## Task 9: `lib/orbits.ts` — ellipse sampling + batch propagation

**Files:**
- Create: `ui/src/lib/orbits.ts`
- Create: `ui/src/lib/__tests__/orbits.test.ts`

- [ ] **Step 1: Write the failing tests**

`ui/src/lib/__tests__/orbits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sampleOrbitEllipse, propagateBatch } from "../orbits";
import { EARTH_ELEMENTS } from "../kepler";
import { J2000 } from "../time";
import type { NeoRecord } from "../types";

const fakeNeo = (designation: string, a: number): NeoRecord => ({
  designation, name: null,
  elements: { a, e: 0.0, i: 0, om: 0, w: 0, ma: 0, epoch: J2000, n: 0.5 },
  physical: null,
  spectral: {
    slope_vis: 0, slope_nir: 0,
    band_depth_1um: 0, band_center_1um: 1,
    band_depth_2um: 0, band_center_2um: 2,
    pc1: 0, pc2: 0, hdbscan_label: -1, isoforest_score: 0,
  },
});

describe("orbits", () => {
  it("sampleOrbitEllipse returns N points roughly at distance a for circular orbit", () => {
    const pts = sampleOrbitEllipse(EARTH_ELEMENTS, 64);
    expect(pts.length).toBe(64 * 3);
    for (let i = 0; i < 64; i++) {
      const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      expect(r).toBeGreaterThan(0.97);
      expect(r).toBeLessThan(1.03);
    }
  });

  it("propagateBatch writes 3 floats per asteroid into a flat buffer", () => {
    const neos = [fakeNeo("a", 1.2), fakeNeo("b", 1.5), fakeNeo("c", 2.0)];
    const out = new Float32Array(neos.length * 3);
    propagateBatch(neos, J2000, out);
    expect(out[0] ** 2 + out[1] ** 2 + out[2] ** 2).toBeGreaterThan(0);
    expect(out[3] ** 2 + out[4] ** 2 + out[5] ** 2).toBeGreaterThan(0);
    expect(out[6] ** 2 + out[7] ** 2 + out[8] ** 2).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/orbits.test.ts
```

Expected: FAIL with `Cannot find module '../orbits'`.

- [ ] **Step 3: Create `ui/src/lib/orbits.ts`**

```ts
import { heliocentricCartesian, solveKepler } from "./kepler";
import type { NeoRecord, OrbitalElements } from "./types";

/** Sample N points along the orbit ellipse by sweeping mean anomaly 0..360 at fixed epoch.
 *  Returns a flat Float32Array of length N*3 in heliocentric ecliptic AU. */
export function sampleOrbitEllipse(elements: OrbitalElements, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ma = (i / n) * 360;
    const local: OrbitalElements = { ...elements, ma, epoch: elements.epoch };
    // Use heliocentricCartesian at jd = epoch so the propagator just uses `ma` as-is.
    const [x, y, z] = heliocentricCartesian(local, elements.epoch);
    out[3 * i] = x;
    out[3 * i + 1] = y;
    out[3 * i + 2] = z;
  }
  return out;
}

/** Propagate all asteroids to the given JD and write x/y/z into `out` (length must be neos.length*3). */
export function propagateBatch(neos: NeoRecord[], jd: number, out: Float32Array): void {
  for (let i = 0; i < neos.length; i++) {
    const [x, y, z] = heliocentricCartesian(neos[i].elements, jd);
    out[3 * i] = x;
    out[3 * i + 1] = y;
    out[3 * i + 2] = z;
  }
}

// Re-export solveKepler so consumers don't need a second import.
export { solveKepler };
```

- [ ] **Step 4: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/orbits.test.ts
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/orbits.ts ui/src/lib/__tests__/orbits.test.ts
git commit -m "feat(ui): orbit ellipse sampling + batch propagation"
```

---

## Task 10: `lib/hohmann.ts` — Δv math (TDD)

**Files:**
- Create: `ui/src/lib/hohmann.ts`
- Create: `ui/src/lib/__tests__/hohmann.test.ts`

- [ ] **Step 1: Write the failing tests**

`ui/src/lib/__tests__/hohmann.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hohmannDv, transferTimeYears } from "../hohmann";

describe("hohmann", () => {
  it("Earth->Mars Δv ≈ 5.6 km/s (coplanar)", () => {
    const dv = hohmannDv(1.524, 0);
    expect(dv).toBeGreaterThan(5.3);
    expect(dv).toBeLessThan(5.9);
  });

  it("Earth->Vesta Δv ≈ 5.1 km/s (with small inclination)", () => {
    const dv = hohmannDv(2.36, 7.14);
    expect(dv).toBeGreaterThan(4.7);
    expect(dv).toBeLessThan(6.0);
  });

  it("higher inclination raises Δv", () => {
    const a = hohmannDv(1.5, 0);
    const b = hohmannDv(1.5, 20);
    expect(b).toBeGreaterThan(a);
  });

  it("transferTimeYears(Mars) ≈ 0.7 yr", () => {
    const t = transferTimeYears(1.524);
    expect(t).toBeGreaterThan(0.65);
    expect(t).toBeLessThan(0.75);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/hohmann.test.ts
```

Expected: FAIL with `Cannot find module '../hohmann'`.

- [ ] **Step 3: Create `ui/src/lib/hohmann.ts`**

```ts
const MU_SUN_AU3_YR2 = 4 * Math.PI ** 2;
const AU_PER_YR_TO_KM_S = 4.74047;

/** Hohmann transfer Δv from Earth (1 AU, circular) to a target with semi-major axis `targetA` (AU)
 *  and inclination `targetIDeg` (degrees). Adds a simple plane-change penalty `2 * v2 * sin(i/2)`.
 *  Returns Δv in km/s.
 */
export function hohmannDv(targetA: number, targetIDeg: number): number {
  const r1 = 1.0;
  const r2 = targetA;
  const v1 = Math.sqrt(MU_SUN_AU3_YR2 / r1);
  const v2 = Math.sqrt(MU_SUN_AU3_YR2 / r2);
  const aT = (r1 + r2) / 2;
  const vPeri = Math.sqrt(MU_SUN_AU3_YR2 * (2 / r1 - 1 / aT));
  const vApo  = Math.sqrt(MU_SUN_AU3_YR2 * (2 / r2 - 1 / aT));
  const dvBurn = Math.abs(vPeri - v1) + Math.abs(v2 - vApo);
  const iRad = (targetIDeg * Math.PI) / 180;
  const dvIncl = 2 * v2 * Math.sin(iRad / 2);
  return (dvBurn + dvIncl) * AU_PER_YR_TO_KM_S;
}

/** Hohmann transfer time in years, Earth -> target with semi-major axis `targetA` (AU). */
export function transferTimeYears(targetA: number): number {
  const aT = (1.0 + targetA) / 2;
  return Math.PI * Math.sqrt((aT * aT * aT) / MU_SUN_AU3_YR2);
}
```

- [ ] **Step 4: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/hohmann.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/hohmann.ts ui/src/lib/__tests__/hohmann.test.ts
git commit -m "feat(ui): Hohmann Δv + transfer time helpers"
```

---

## Task 11: `lib/mining-score.ts`

**Files:**
- Create: `ui/src/lib/mining-score.ts`
- Create: `ui/src/lib/__tests__/mining-score.test.ts`

- [ ] **Step 1: Write the failing tests**

`ui/src/lib/__tests__/mining-score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { miningScore } from "../mining-score";
import type { NeoRecord } from "../types";
import { J2000 } from "../time";

const make = (diameter: number | null, cls: string | null): NeoRecord => ({
  designation: "x", name: null,
  elements: { a: 1.5, e: 0, i: 0, om: 0, w: 0, ma: 0, epoch: J2000, n: 0.5 },
  physical: { h_mag: null, diameter_km: diameter, albedo: null, spec_class: cls },
  spectral: {
    slope_vis: 0, slope_nir: 0,
    band_depth_1um: 0, band_center_1um: 1, band_depth_2um: 0, band_center_2um: 2,
    pc1: 0, pc2: 0, hdbscan_label: -1, isoforest_score: 0,
  },
});

describe("mining-score", () => {
  it("monotonic in diameter (more rock, more score)", () => {
    const a = miningScore(make(0.5, "S"), 6);
    const b = miningScore(make(1.5, "S"), 6);
    expect(b).toBeGreaterThan(a);
  });

  it("monotonic decreasing in Δv (cheaper to reach, more score)", () => {
    const a = miningScore(make(1.0, "S"), 12);
    const b = miningScore(make(1.0, "S"), 6);
    expect(b).toBeGreaterThan(a);
  });

  it("M-type beats S-type at same size and Δv", () => {
    const s = miningScore(make(1.0, "S"), 6);
    const m = miningScore(make(1.0, "M"), 6);
    expect(m).toBeGreaterThan(s);
  });

  it("null physical gives a small but finite score", () => {
    const v = miningScore(make(null, null), 6);
    expect(v).toBeGreaterThan(0);
    expect(Number.isFinite(v)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/mining-score.test.ts
```

Expected: FAIL with `Cannot find module '../mining-score'`.

- [ ] **Step 3: Create `ui/src/lib/mining-score.ts`**

```ts
import type { NeoRecord } from "./types";

const SPEC_MULTIPLIER: Record<string, number> = {
  M: 3.0, C: 2.5, B: 2.0, X: 2.5, S: 1.0, Q: 1.0, V: 1.0,
};

/** Composite mining score. Higher = more attractive target.
 *  Inputs are all real numbers; the *combination* is heuristic — clearly labeled
 *  in the UI as such.
 */
export function miningScore(record: NeoRecord, dvKmS: number): number {
  const diameter = record.physical?.diameter_km ?? 0.2;
  const firstLetter = record.physical?.spec_class?.[0] ?? "";
  const mult = SPEC_MULTIPLIER[firstLetter] ?? 0.5;
  return (diameter / Math.max(dvKmS, 1.0)) * mult;
}
```

- [ ] **Step 4: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/mining-score.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/mining-score.ts ui/src/lib/__tests__/mining-score.test.ts
git commit -m "feat(ui): mining-score heuristic"
```

---

## Task 12: `lib/data.ts` — typed loaders with runtime guards

**Files:**
- Create: `ui/src/lib/data.ts`
- Create: `ui/src/lib/__tests__/data.test.ts`

- [ ] **Step 1: Write the failing tests**

`ui/src/lib/__tests__/data.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadNeos, loadKoi, loadMeta, loadSpectrum, loadCloseApproaches } from "../data";

const goodNeo = {
  designation: "X1", name: null,
  elements: { a: 1.5, e: 0.1, i: 5, om: 30, w: 60, ma: 90, epoch: 2451545, n: 0.5 },
  physical: null,
  spectral: {
    slope_vis: 0, slope_nir: 0,
    band_depth_1um: 0, band_center_1um: 1, band_depth_2um: 0, band_center_2um: 2,
    pc1: 0, pc2: 0, hdbscan_label: -1, isoforest_score: 0,
  },
};

const fetchMock = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);

describe("data loaders", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it("loadNeos parses valid array", async () => {
    vi.stubGlobal("fetch", fetchMock(200, [goodNeo]));
    const neos = await loadNeos();
    expect(neos.length).toBe(1);
    expect(neos[0].designation).toBe("X1");
  });

  it("loadNeos rejects when an item is missing elements", async () => {
    const bad = { ...goodNeo, elements: undefined };
    vi.stubGlobal("fetch", fetchMock(200, [bad]));
    await expect(loadNeos()).rejects.toThrow(/elements/);
  });

  it("loadKoi parses valid array", async () => {
    vi.stubGlobal("fetch", fetchMock(200, [{
      kepoi_name: "K1", kepler_name: null, ra: 290, dec: 48,
      koi_disposition: "CONFIRMED", koi_period: 9.5, koi_prad: 2.2,
      koi_teq: 800, koi_steff: 5455, koi_srad: 0.9, prob_planet: 0.9,
    }]));
    const koi = await loadKoi();
    expect(koi.length).toBe(1);
  });

  it("loadMeta returns parsed object", async () => {
    vi.stubGlobal("fetch", fetchMock(200, {
      git_sha: "abc", last_run_at: null, elements_age_days: 0, n_neos: 1, n_koi: 1,
    }));
    const meta = await loadMeta();
    expect(meta.git_sha).toBe("abc");
  });

  it("loadSpectrum throws on 404", async () => {
    vi.stubGlobal("fetch", fetchMock(404, null));
    await expect(loadSpectrum("nope")).rejects.toThrow();
  });

  it("loadCloseApproaches parses", async () => {
    vi.stubGlobal("fetch", fetchMock(200, [
      { designation: "X", body: "Earth", ca_date: "2059-Mar-23", dist_au: 0.05, v_rel_km_s: 12 },
    ]));
    const ca = await loadCloseApproaches();
    expect(ca[0].body).toBe("Earth");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/data.test.ts
```

Expected: FAIL with `Cannot find module '../data'`.

- [ ] **Step 3: Create `ui/src/lib/data.ts`**

```ts
import type {
  NeoRecord, KoiRecord, CloseApproachRecord, SpectrumFile, Meta,
} from "./types";

const BASE = "/data";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  return (await r.json()) as T;
}

function assertField(obj: unknown, path: string, key: string): void {
  if (obj === null || typeof obj !== "object" || !(key in (obj as Record<string, unknown>))) {
    throw new Error(`missing field ${path}.${key}`);
  }
}

function validateNeo(rec: unknown, idx: number): NeoRecord {
  const path = `neos[${idx}]`;
  if (typeof rec !== "object" || rec === null) throw new Error(`${path} is not an object`);
  const r = rec as Record<string, unknown>;
  assertField(r, path, "designation");
  assertField(r, path, "elements");
  const e = r.elements as Record<string, unknown>;
  for (const k of ["a", "e", "i", "om", "w", "ma", "epoch", "n"]) {
    if (typeof e[k] !== "number") throw new Error(`${path}.elements.${k} must be number`);
  }
  assertField(r, path, "spectral");
  return rec as NeoRecord;
}

function validateKoi(rec: unknown, idx: number): KoiRecord {
  const path = `koi[${idx}]`;
  if (typeof rec !== "object" || rec === null) throw new Error(`${path} is not an object`);
  const r = rec as Record<string, unknown>;
  assertField(r, path, "kepoi_name");
  if (typeof r.ra !== "number" || typeof r.dec !== "number") {
    throw new Error(`${path} ra/dec must be numbers`);
  }
  return rec as KoiRecord;
}

export async function loadNeos(): Promise<NeoRecord[]> {
  const raw = await fetchJson<unknown[]>(`${BASE}/neos.json`);
  if (!Array.isArray(raw)) throw new Error("neos.json is not an array");
  return raw.map(validateNeo);
}

export async function loadKoi(): Promise<KoiRecord[]> {
  const raw = await fetchJson<unknown[]>(`${BASE}/koi.json`);
  if (!Array.isArray(raw)) throw new Error("koi.json is not an array");
  return raw.map(validateKoi);
}

export async function loadCloseApproaches(): Promise<CloseApproachRecord[]> {
  const raw = await fetchJson<unknown[]>(`${BASE}/close_approaches.json`);
  if (!Array.isArray(raw)) throw new Error("close_approaches.json is not an array");
  return raw as CloseApproachRecord[];
}

export async function loadMeta(): Promise<Meta> {
  return await fetchJson<Meta>(`${BASE}/meta.json`);
}

export async function loadSpectrum(designation: string): Promise<SpectrumFile> {
  return await fetchJson<SpectrumFile>(`${BASE}/spectra/${encodeURIComponent(designation)}.json`);
}
```

- [ ] **Step 4: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/data.test.ts
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/data.ts ui/src/lib/__tests__/data.test.ts
git commit -m "feat(ui): typed data loaders with runtime field validation"
```

---

## Task 13: Zustand store + R3F canvas scaffold

**Files:**
- Create: `ui/src/lib/store.ts`
- Create: `ui/src/components/belt/Scene.tsx`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create the Zustand store**

`ui/src/lib/store.ts`:

```ts
"use client";
import { create } from "zustand";
import { jdNow } from "./time";
import type { NeoRecord, KoiRecord, Meta, CloseApproachRecord } from "./types";

type State = {
  jd: number;
  playing: boolean;
  playSpeed: number;            // days per real-time second
  selectedDesignation: string | null;
  hoverDesignation: string | null;
  neos: NeoRecord[];
  koi: KoiRecord[];
  closeApproaches: CloseApproachRecord[];
  meta: Meta | null;
  loadError: string | null;

  setJd: (jd: number) => void;
  setPlaying: (p: boolean) => void;
  setPlaySpeed: (s: number) => void;
  resetToNow: () => void;
  select: (d: string | null) => void;
  hover: (d: string | null) => void;
  setData: (data: {
    neos: NeoRecord[];
    koi: KoiRecord[];
    closeApproaches: CloseApproachRecord[];
    meta: Meta;
  }) => void;
  setLoadError: (err: string | null) => void;
};

export const useStore = create<State>((set) => ({
  jd: jdNow(),
  playing: false,
  playSpeed: 1, // 1 day/sec by default
  selectedDesignation: null,
  hoverDesignation: null,
  neos: [],
  koi: [],
  closeApproaches: [],
  meta: null,
  loadError: null,

  setJd: (jd) => set({ jd }),
  setPlaying: (playing) => set({ playing }),
  setPlaySpeed: (playSpeed) => set({ playSpeed }),
  resetToNow: () => set({ jd: jdNow() }),
  select: (selectedDesignation) => set({ selectedDesignation }),
  hover: (hoverDesignation) => set({ hoverDesignation }),
  setData: (data) => set(data),
  setLoadError: (loadError) => set({ loadError }),
}));
```

- [ ] **Step 2: Create the canvas component**

`ui/src/components/belt/Scene.tsx`:

```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 45, near: 0.01, far: 5000 }}>
      <color attach="background" args={["#05070d"]} />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff5a0" />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#fff5a0" />
      </mesh>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
```

- [ ] **Step 3: Mount the scene in `/`**

Update `ui/src/app/page.tsx`:

```tsx
import { Scene } from "@/components/belt/Scene";

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <Scene />
    </main>
  );
}
```

- [ ] **Step 4: Run dev server, verify a yellow Sun is visible**

```bash
cd ui && npm run dev
```

Open http://localhost:3000. Expected: a small yellow sphere at center against a near-black background, orbit-draggable.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/store.ts ui/src/components/belt/Scene.tsx ui/src/app/page.tsx
git commit -m "feat(ui): zustand store + base R3F canvas with Sun"
```

---

## Task 14: Starfield + data bootstrap

**Files:**
- Create: `ui/src/components/belt/Starfield.tsx`
- Create: `ui/src/components/belt/SceneBootstrap.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create `Starfield.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function Starfield({ count = 1200, radius = 800 }: { count?: number; radius?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    // Deterministic pseudo-random distribution on a sphere (no Math.random in render path).
    let seed = 0x1a2b3c;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * rand();
      const phi = Math.acos(2 * rand() - 1);
      const r = radius * (0.85 + 0.3 * rand());
      positions[3 * i] = r * Math.sin(phi) * Math.cos(theta);
      positions[3 * i + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[3 * i + 2] = r * Math.cos(phi);
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count, radius]);

  return (
    <points geometry={geometry}>
      <pointsMaterial size={1.2} color="#e8eef5" sizeAttenuation={false} opacity={0.6} transparent />
    </points>
  );
}
```

- [ ] **Step 2: Create `SceneBootstrap.tsx`** (loads data, populates store)

```tsx
"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { loadNeos, loadKoi, loadCloseApproaches, loadMeta } from "@/lib/data";

export function SceneBootstrap({ children }: { children: React.ReactNode }) {
  const setData = useStore((s) => s.setData);
  const setLoadError = useStore((s) => s.setLoadError);
  const meta = useStore((s) => s.meta);
  const loadError = useStore((s) => s.loadError);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [neos, koi, closeApproaches, meta] = await Promise.all([
          loadNeos(), loadKoi(), loadCloseApproaches(), loadMeta(),
        ]);
        if (!cancelled) setData({ neos, koi, closeApproaches, meta });
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [setData, setLoadError]);

  if (loadError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-alert">
        ── data unavailable: {loadError} ──
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-dim label-caps">
        ── loading exoproximo ──
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Update `Scene.tsx` to render the starfield**

```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Starfield } from "./Starfield";

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 45, near: 0.01, far: 5000 }}>
      <color attach="background" args={["#05070d"]} />
      <Starfield />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff5a0" />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#fff5a0" />
      </mesh>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
```

- [ ] **Step 4: Wrap the page in the bootstrap**

`ui/src/app/page.tsx`:

```tsx
import { Scene } from "@/components/belt/Scene";
import { SceneBootstrap } from "@/components/belt/SceneBootstrap";

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <SceneBootstrap>
        <Scene />
      </SceneBootstrap>
    </main>
  );
}
```

- [ ] **Step 5: Verify in browser**

```bash
cd ui && npm run dev
```

Expected: brief "loading" text, then Sun + sparse starfield. If you see `data unavailable`, re-run Task 4 to populate `public/data/`.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/belt/Starfield.tsx ui/src/components/belt/SceneBootstrap.tsx ui/src/components/belt/Scene.tsx ui/src/app/page.tsx
git commit -m "feat(ui): starfield backdrop + data bootstrap"
```

---

## Task 15: Earth + Earth's orbit

**Files:**
- Create: `ui/src/components/belt/Earth.tsx`
- Create: `ui/src/components/belt/EarthOrbit.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`

- [ ] **Step 1: Create `Earth.tsx`**

```tsx
"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heliocentricCartesian, EARTH_ELEMENTS } from "@/lib/kepler";
import { useStore } from "@/lib/store";

export function Earth() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const jd = useStore.getState().jd;
    const [x, y, z] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    ref.current.position.set(x, z, -y); // R3F y-up; ecliptic Z -> scene Y
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 24, 24]} />
      <meshBasicMaterial color="#7ee8ff" />
    </mesh>
  );
}
```

- [ ] **Step 2: Create `EarthOrbit.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { sampleOrbitEllipse } from "@/lib/orbits";
import { EARTH_ELEMENTS } from "@/lib/kepler";

export function EarthOrbit({ segments = 256 }: { segments?: number }) {
  const geometry = useMemo(() => {
    const pts = sampleOrbitEllipse(EARTH_ELEMENTS, segments);
    const xy = new Float32Array((segments + 1) * 3);
    for (let i = 0; i < segments; i++) {
      xy[3 * i] = pts[3 * i];
      xy[3 * i + 1] = pts[3 * i + 2];     // ecliptic Z -> scene Y
      xy[3 * i + 2] = -pts[3 * i + 1];    // close the loop
    }
    // close loop
    xy[3 * segments] = xy[0];
    xy[3 * segments + 1] = xy[1];
    xy[3 * segments + 2] = xy[2];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(xy, 3));
    return g;
  }, [segments]);

  return (
    <line>
      {/* @ts-expect-error R3F line geometry */}
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#7ee8ff" transparent opacity={0.35} />
    </line>
  );
}
```

- [ ] **Step 3: Mount in the scene**

Update `Scene.tsx`:

```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Starfield } from "./Starfield";
import { Earth } from "./Earth";
import { EarthOrbit } from "./EarthOrbit";

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 45, near: 0.01, far: 5000 }}>
      <color attach="background" args={["#05070d"]} />
      <Starfield />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff5a0" />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#fff5a0" />
      </mesh>
      <EarthOrbit />
      <Earth />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
```

- [ ] **Step 4: Verify in browser**

```bash
cd ui && npm run dev
```

Expected: Sun + faint cyan ellipse + a small cyan Earth on the ellipse. Orbit controls work.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/belt/Earth.tsx ui/src/components/belt/EarthOrbit.tsx ui/src/components/belt/Scene.tsx
git commit -m "feat(ui): Earth + Earth's orbit, propagated each frame"
```

---

## Task 16: All NEO orbits as instanced ellipses

**Files:**
- Create: `ui/src/components/belt/NeoOrbits.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`

- [ ] **Step 1: Create `NeoOrbits.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { sampleOrbitEllipse } from "@/lib/orbits";

const SEGMENTS = 128;

export function NeoOrbits() {
  const neos = useStore((s) => s.neos);
  const selected = useStore((s) => s.selectedDesignation);

  // Build one combined LineSegments geometry with all 667 orbits.
  const { dimGeom, brightGeom } = useMemo(() => {
    const positions: number[] = [];
    const brightPositions: number[] = [];
    for (const neo of neos) {
      const pts = sampleOrbitEllipse(neo.elements, SEGMENTS);
      const isSel = neo.designation === selected;
      const target = isSel ? brightPositions : positions;
      for (let i = 0; i < SEGMENTS; i++) {
        const j = (i + 1) % SEGMENTS;
        // segment from i -> j
        target.push(pts[3 * i], pts[3 * i + 2], -pts[3 * i + 1]);
        target.push(pts[3 * j], pts[3 * j + 2], -pts[3 * j + 1]);
      }
    }
    const dim = new THREE.BufferGeometry();
    dim.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const bright = new THREE.BufferGeometry();
    bright.setAttribute("position", new THREE.Float32BufferAttribute(brightPositions, 3));
    return { dimGeom: dim, brightGeom: bright };
  }, [neos, selected]);

  return (
    <>
      <lineSegments>
        {/* @ts-expect-error R3F geometry primitive */}
        <primitive object={dimGeom} attach="geometry" />
        <lineBasicMaterial color="#1a2233" transparent opacity={0.45} />
      </lineSegments>
      <lineSegments>
        {/* @ts-expect-error R3F geometry primitive */}
        <primitive object={brightGeom} attach="geometry" />
        <lineBasicMaterial color="#7ee8ff" transparent opacity={0.9} />
      </lineSegments>
    </>
  );
}
```

- [ ] **Step 2: Mount in the scene**

In `Scene.tsx`, add `<NeoOrbits />` after `<EarthOrbit />`.

- [ ] **Step 3: Verify in browser**

Expected: a tangle of faint orbits (looks like a bird's-nest because NEO orbits crisscross Earth's). Performance still 60fps because it's a single drawcall.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/belt/NeoOrbits.tsx ui/src/components/belt/Scene.tsx
git commit -m "feat(ui): all NEO orbits as a single LineSegments buffer"
```

---

## Task 17: NEO instanced asteroid mesh

**Files:**
- Create: `ui/src/lib/spec-class.ts`
- Create: `ui/src/lib/spec-class.test.ts`
- Create: `ui/src/components/belt/NeoInstances.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`

- [ ] **Step 1: Write the failing spec-class color test**

`ui/src/lib/__tests__/spec-class.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { specClassColor } from "../spec-class";

describe("spec-class", () => {
  it("S-type maps to accent cyan", () => {
    expect(specClassColor("S")).toBe(0x7ee8ff);
  });
  it("C-type maps to warn amber", () => {
    expect(specClassColor("C")).toBe(0xffb547);
  });
  it("M-type maps to metal magenta", () => {
    expect(specClassColor("M")).toBe(0xb18cff);
  });
  it("null/unknown maps to dim", () => {
    expect(specClassColor(null)).toBe(0x6b7385);
    expect(specClassColor("???")).toBe(0x6b7385);
  });
  it("multi-letter classes use first letter (e.g. 'S:' -> S)", () => {
    expect(specClassColor("S:")).toBe(0x7ee8ff);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd ui && npm run test -- src/lib/__tests__/spec-class.test.ts
```

Expected: FAIL with `Cannot find module '../spec-class'`.

- [ ] **Step 3: Create `ui/src/lib/spec-class.ts`**

```ts
const TABLE: Record<string, number> = {
  S: 0x7ee8ff,
  C: 0xffb547,
  B: 0xffb547,
  M: 0xb18cff,
  X: 0xb18cff,
  Q: 0x8af0a7,
  V: 0x8af0a7,
};

export function specClassColor(spec: string | null | undefined): number {
  if (!spec) return 0x6b7385;
  const first = spec.charAt(0).toUpperCase();
  return TABLE[first] ?? 0x6b7385;
}
```

- [ ] **Step 4: Run tests**

```bash
cd ui && npm run test -- src/lib/__tests__/spec-class.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Create `NeoInstances.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian } from "@/lib/kepler";
import { specClassColor } from "@/lib/spec-class";

const DUMMY = new THREE.Object3D();
const MIN_SCALE = 0.012;
const MAX_SCALE = 0.07;
const SIZE_MULT = 0.022;

function scaleFor(diameter: number | null | undefined): number {
  const d = diameter ?? 0.2;
  const s = Math.log10(d + 0.1) * SIZE_MULT + 0.018;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

export function NeoInstances() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const neos = useStore((s) => s.neos);
  const hover = useStore((s) => s.hover);
  const select = useStore((s) => s.select);

  // Per-instance constant attributes (scale, color) set on data load.
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    const color = new THREE.Color();
    for (let i = 0; i < neos.length; i++) {
      DUMMY.position.set(0, 0, 0);
      const s = scaleFor(neos[i].physical?.diameter_km);
      DUMMY.scale.set(s, s, s);
      DUMMY.updateMatrix();
      m.setMatrixAt(i, DUMMY.matrix);
      color.setHex(specClassColor(neos[i].physical?.spec_class));
      m.setColorAt(i, color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [neos]);

  // Per-frame propagation: rewrite each instance's position.
  useFrame(() => {
    const m = meshRef.current;
    if (!m || neos.length === 0) return;
    const jd = useStore.getState().jd;
    for (let i = 0; i < neos.length; i++) {
      const [x, y, z] = heliocentricCartesian(neos[i].elements, jd);
      const s = scaleFor(neos[i].physical?.diameter_km);
      DUMMY.position.set(x, z, -y);
      DUMMY.scale.set(s, s, s);
      DUMMY.updateMatrix();
      m.setMatrixAt(i, DUMMY.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false }),
    [],
  );

  const count = neos.length;
  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const i = e.instanceId;
        if (i !== undefined && neos[i]) hover(neos[i].designation);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        hover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const i = e.instanceId;
        if (i !== undefined && neos[i]) select(neos[i].designation);
      }}
    />
  );
}
```

- [ ] **Step 6: Mount in scene**

In `Scene.tsx`, add `<NeoInstances />` after `<NeoOrbits />`.

- [ ] **Step 7: Verify in browser**

Expected: 667 small colored particles moving along their orbits. Spec-class-cyan dominates, with amber and magenta speckles. Hover changes the cursor over an asteroid (selection state visible via store but no panel yet).

- [ ] **Step 8: Commit**

```bash
git add ui/src/lib/spec-class.ts ui/src/lib/__tests__/spec-class.test.ts ui/src/components/belt/NeoInstances.tsx ui/src/components/belt/Scene.tsx
git commit -m "feat(ui): 667 NEOs as instanced mesh, propagated per frame"
```

---

## Task 18: Selection halo + hover tooltip

**Files:**
- Create: `ui/src/components/belt/SelectionHalo.tsx`
- Create: `ui/src/components/belt/HoverTooltip.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create `SelectionHalo.tsx`**

```tsx
"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian } from "@/lib/kepler";

export function SelectionHalo() {
  const ref = useRef<THREE.Mesh>(null);
  const selected = useStore((s) => s.selectedDesignation);
  const neos = useStore((s) => s.neos);
  const target = neos.find((n) => n.designation === selected);

  useFrame(() => {
    if (!ref.current || !target) return;
    const jd = useStore.getState().jd;
    const [x, y, z] = heliocentricCartesian(target.elements, jd);
    ref.current.position.set(x, z, -y);
    ref.current.lookAt(0, 0, 0);
  });

  if (!target) return null;

  return (
    <mesh ref={ref}>
      <ringGeometry args={[0.09, 0.11, 48]} />
      <meshBasicMaterial color="#7ee8ff" side={THREE.DoubleSide} transparent opacity={0.9} />
    </mesh>
  );
}
```

- [ ] **Step 2: Create `HoverTooltip.tsx` (HTML overlay)**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import clsx from "clsx";

export function HoverTooltip() {
  const hover = useStore((s) => s.hoverDesignation);
  const neos = useStore((s) => s.neos);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX + 12, y: e.clientY + 12 });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const rec = neos.find((n) => n.designation === hover);
  if (!hover || !rec || !pos) return null;

  const diameter = rec.physical?.diameter_km;
  const cls = rec.physical?.spec_class ?? "?";

  return (
    <div
      className={clsx(
        "pointer-events-none fixed z-50 panel px-2 py-1 text-xs whitespace-nowrap",
      )}
      style={{ left: pos.x, top: pos.y }}
    >
      <span className="id-bracket">{rec.designation}</span>
      <span className="text-dim"> · </span>
      <span>{cls}</span>
      <span className="text-dim"> · </span>
      <span>{diameter != null ? `${diameter.toFixed(2)} km` : "size ?"}</span>
    </div>
  );
}
```

- [ ] **Step 3: Mount halo in scene; mount tooltip in page**

In `Scene.tsx`, add `<SelectionHalo />` after `<NeoInstances />`.

In `ui/src/app/page.tsx`:

```tsx
import { Scene } from "@/components/belt/Scene";
import { SceneBootstrap } from "@/components/belt/SceneBootstrap";
import { HoverTooltip } from "@/components/belt/HoverTooltip";

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <SceneBootstrap>
        <Scene />
        <HoverTooltip />
      </SceneBootstrap>
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Hover an asteroid → tooltip near cursor. Click → cyan ring appears at that asteroid's current position and follows it.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/belt/SelectionHalo.tsx ui/src/components/belt/HoverTooltip.tsx ui/src/components/belt/Scene.tsx ui/src/app/page.tsx
git commit -m "feat(ui): selection halo + hover tooltip"
```

---

## Task 19: Time scrubber + play loop

**Files:**
- Create: `ui/src/components/belt/TimeScrubber.tsx`
- Create: `ui/src/components/belt/PlayLoop.tsx`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create `PlayLoop.tsx`** (drives JD forward via `requestAnimationFrame`)

```tsx
"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function PlayLoop() {
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const { jd, playSpeed, setJd } = useStore.getState();
      setJd(jd + playSpeed * dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return null;
}
```

- [ ] **Step 2: Create `TimeScrubber.tsx`**

```tsx
"use client";
import { useStore } from "@/lib/store";
import { jdNow, jdToDate } from "@/lib/time";

const DAYS_PER_YEAR = 365.25;

const SPEEDS: { label: string; days: number }[] = [
  { label: "1d/s", days: 1 },
  { label: "1mo/s", days: 30 },
  { label: "1y/s", days: DAYS_PER_YEAR },
];

function fmtOffset(jd: number): string {
  const days = jd - jdNow();
  const yrs = days / DAYS_PER_YEAR;
  const sign = yrs >= 0 ? "+" : "-";
  const absYrs = Math.abs(yrs);
  if (absYrs < 1 / 12) return `${sign}${Math.round(Math.abs(days))}d`;
  if (absYrs < 1) return `${sign}${Math.round(absYrs * 12)}mo`;
  const y = Math.floor(absYrs);
  const mo = Math.round((absYrs - y) * 12);
  return mo === 0 ? `${sign}${y}y` : `${sign}${y}y ${mo}mo`;
}

export function TimeScrubber() {
  const jd = useStore((s) => s.jd);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.playSpeed);
  const setJd = useStore((s) => s.setJd);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setPlaySpeed);
  const resetToNow = useStore((s) => s.resetToNow);

  const now = jdNow();
  const min = now - 5 * DAYS_PER_YEAR;
  const max = now + 50 * DAYS_PER_YEAR;
  const date = jdToDate(jd);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 panel px-4 py-2 flex items-center gap-3 text-xs">
      <button
        onClick={() => setPlaying(!playing)}
        className="px-2 py-1 border border-rule hover:border-accent transition-colors"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        min={min} max={max} step={1} value={jd}
        onChange={(e) => setJd(parseFloat(e.target.value))}
        className="w-[420px] accent-accent"
      />
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            onClick={() => setSpeed(s.days)}
            className={`px-2 py-1 border ${speed === s.days ? "border-accent text-accent" : "border-rule text-dim"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className="text-dim w-[140px] text-right tabular-nums">
        {date.toISOString().slice(0, 10)} <span className="text-fg">{fmtOffset(jd)}</span>
      </span>
      <button
        onClick={resetToNow}
        className="px-2 py-1 border border-rule hover:border-accent text-dim hover:text-accent"
      >
        RESET TO NOW
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount in the page**

`ui/src/app/page.tsx`:

```tsx
import { Scene } from "@/components/belt/Scene";
import { SceneBootstrap } from "@/components/belt/SceneBootstrap";
import { HoverTooltip } from "@/components/belt/HoverTooltip";
import { TimeScrubber } from "@/components/belt/TimeScrubber";
import { PlayLoop } from "@/components/belt/PlayLoop";

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <SceneBootstrap>
        <PlayLoop />
        <Scene />
        <HoverTooltip />
        <TimeScrubber />
      </SceneBootstrap>
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Expected: bottom-center HUD with play, slider, speed buttons, date, RESET TO NOW. Pressing play animates the asteroids; dragging the slider scrubs.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/belt/TimeScrubber.tsx ui/src/components/belt/PlayLoop.tsx ui/src/app/page.tsx
git commit -m "feat(ui): time scrubber, play loop, speed buttons"
```

---

## Task 20: Selected asteroid panel + spectrum chart

**Files:**
- Create: `ui/src/components/belt/SelectedPanel.tsx`
- Create: `ui/src/components/belt/SpectrumChart.tsx`
- Create: `ui/src/lib/selectors.ts`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create `lib/selectors.ts`** (pure helpers for derived view data)

```ts
import { useMemo } from "react";
import { useStore } from "./store";
import { heliocentricCartesian, EARTH_ELEMENTS } from "./kepler";
import { hohmannDv, transferTimeYears } from "./hohmann";
import { jdNow, jdToDate } from "./time";
import type { CloseApproachRecord, NeoRecord } from "./types";

export function useSelectedNeo(): NeoRecord | null {
  return useStore((s) =>
    s.selectedDesignation ? s.neos.find((n) => n.designation === s.selectedDesignation) ?? null : null,
  );
}

export function useNextCloseApproach(designation: string | null): CloseApproachRecord | null {
  const cas = useStore((s) => s.closeApproaches);
  return useMemo(() => {
    if (!designation) return null;
    const today = new Date();
    return (
      cas
        .filter((c) => c.designation === designation)
        .map((c) => ({ ...c, t: parseJplDate(c.ca_date)?.getTime() ?? Infinity }))
        .filter((c) => c.t >= today.getTime())
        .sort((a, b) => a.t - b.t)[0] ?? null
    );
  }, [cas, designation]);
}

export function useEarthAndTargetPositions(designation: string | null) {
  const jd = useStore((s) => s.jd);
  const neos = useStore((s) => s.neos);
  return useMemo(() => {
    const [ex, ey, ez] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    const target = designation ? neos.find((n) => n.designation === designation) : null;
    if (!target) return { earth: [ex, ey, ez] as [number, number, number], target: null };
    const [tx, ty, tz] = heliocentricCartesian(target.elements, jd);
    return {
      earth: [ex, ey, ez] as [number, number, number],
      target: [tx, ty, tz] as [number, number, number],
    };
  }, [jd, designation, neos]);
}

export function useHohmannForSelected(): { dv: number; t: number } | null {
  const sel = useSelectedNeo();
  return useMemo(() => {
    if (!sel) return null;
    return { dv: hohmannDv(sel.elements.a, sel.elements.i), t: transferTimeYears(sel.elements.a) };
  }, [sel]);
}

/** JPL CAD ca_date examples: "2059-Mar-23 21:11". This parses to a Date or returns null. */
export function parseJplDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mo = months.indexOf(m[2]);
  if (mo < 0) return null;
  return new Date(Date.UTC(+m[1], mo, +m[3], +(m[4] ?? "0"), +(m[5] ?? "0")));
}

export function daysFromNow(d: Date): number {
  return Math.round((d.getTime() - Date.now()) / 86400000);
}
```

- [ ] **Step 2: Create `SpectrumChart.tsx`** (lazy fetch + simple SVG path)

```tsx
"use client";
import { useEffect, useState } from "react";
import { loadSpectrum } from "@/lib/data";
import type { SpectrumFile } from "@/lib/types";

export function SpectrumChart({ designation, width = 280, height = 80 }: {
  designation: string; width?: number; height?: number;
}) {
  const [data, setData] = useState<SpectrumFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    loadSpectrum(designation)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [designation]);

  if (error) return <div className="text-alert text-xs">── no spectral data ──</div>;
  if (!data) return (
    <svg width={width} height={height} className="text-dim">
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="3,3" />
    </svg>
  );

  const xs = data.map((p) => p.wavelength);
  const ys = data.map((p) => p.reflectance);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const scaleX = (x: number) => ((x - xMin) / (xMax - xMin)) * (width - 8) + 4;
  const scaleY = (y: number) => height - 4 - ((y - yMin) / (yMax - yMin)) * (height - 8);
  const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.wavelength).toFixed(1)},${scaleY(p.reflectance).toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height}>
      <path d={d} stroke="#7ee8ff" strokeWidth="1.2" fill="none" />
      <text x="2" y={height - 2} fill="#6b7385" fontSize="9">{xMin.toFixed(2)}µm</text>
      <text x={width - 28} y={height - 2} fill="#6b7385" fontSize="9">{xMax.toFixed(2)}µm</text>
    </svg>
  );
}
```

- [ ] **Step 3: Create `SelectedPanel.tsx`**

```tsx
"use client";
import { useSelectedNeo, useNextCloseApproach, useHohmannForSelected, parseJplDate, daysFromNow } from "@/lib/selectors";
import { SpectrumChart } from "./SpectrumChart";

export function SelectedPanel() {
  const sel = useSelectedNeo();
  const ca = useNextCloseApproach(sel?.designation ?? null);
  const hoh = useHohmannForSelected();

  if (!sel) {
    return (
      <aside className="fixed top-20 left-6 w-[360px] panel p-4">
        <div className="label-caps mb-2">selected asteroid</div>
        <div className="text-dim">── select a target ──</div>
      </aside>
    );
  }

  const phys = sel.physical;
  return (
    <aside className="fixed top-20 left-6 w-[360px] panel p-4 text-xs space-y-3">
      <div>
        <div className="label-caps">selected asteroid</div>
        <div className="text-fg text-sm mt-1">
          <span className="id-bracket text-accent">{sel.designation}</span>
          {sel.name && <span className="ml-2 text-dim">"{sel.name}"</span>}
        </div>
      </div>

      <div>
        <span className="px-2 py-0.5 border border-rule">{phys?.spec_class ?? "?"}-type</span>
        <span className="ml-2">{phys?.diameter_km != null ? `${phys.diameter_km.toFixed(2)} km` : "size ?"}</span>
        <span className="ml-2 text-dim">albedo</span> {phys?.albedo != null ? phys.albedo.toFixed(2) : "?"}
      </div>

      <div>
        <div className="label-caps mb-1">spectrum</div>
        <SpectrumChart designation={sel.designation} />
      </div>

      <div>
        <div className="label-caps mb-1">spectral features</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-fg">
          <span>slope_vis</span><span className="tabular-nums">{sel.spectral.slope_vis.toFixed(3)}</span>
          <span>slope_nir</span><span className="tabular-nums">{sel.spectral.slope_nir.toFixed(3)}</span>
          <span>band 1µm</span>
          <span className="tabular-nums">{sel.spectral.band_depth_1um.toFixed(3)} @ {sel.spectral.band_center_1um.toFixed(2)}</span>
          <span>band 2µm</span>
          <span className="tabular-nums">{sel.spectral.band_depth_2um.toFixed(3)} @ {sel.spectral.band_center_2um.toFixed(2)}</span>
          <span>cluster</span><span>{sel.spectral.hdbscan_label}</span>
          <span>anomaly score</span><span className="tabular-nums">{sel.spectral.isoforest_score.toFixed(3)}</span>
        </div>
      </div>

      <div>
        <div className="label-caps mb-1">trajectory from earth</div>
        {hoh ? (
          <div>
            <span className="text-accent">Δv ≈ {hoh.dv.toFixed(1)}</span>
            <span className="unit">km/s</span>
            <span className="text-dim mx-2">·</span>
            <span className="text-accent">T ≈ {hoh.t.toFixed(1)}</span>
            <span className="unit">yr</span>
            <div className="text-dim text-[10px] mt-0.5">Hohmann + plane change, heliocentric circular approx.</div>
          </div>
        ) : <span className="text-dim">—</span>}
      </div>

      <div>
        <div className="label-caps mb-1">next earth approach</div>
        {ca ? (
          <div>
            <div className="text-fg">{ca.ca_date}</div>
            <div className="text-dim">
              {(() => {
                const d = parseJplDate(ca.ca_date);
                return d ? `in ${daysFromNow(d)} days` : "";
              })()}
            </div>
            <div className="tabular-nums">
              {ca.dist_au.toFixed(4)}<span className="unit">AU</span>
              <span className="text-dim mx-2">·</span>
              {(ca.dist_au * 389.17).toFixed(1)}<span className="unit">LD</span>
              <span className="text-dim mx-2">·</span>
              {ca.v_rel_km_s.toFixed(1)}<span className="unit">km/s</span>
            </div>
          </div>
        ) : <span className="text-dim">none in CAD window</span>}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Mount in the page**

In `ui/src/app/page.tsx`, add `<SelectedPanel />` inside `<SceneBootstrap>`.

- [ ] **Step 5: Verify in browser**

Click an asteroid → left panel populates with spectrum chart, features, Hohmann numbers, and (if available) next Earth approach.

- [ ] **Step 6: Commit**

```bash
git add ui/src/lib/selectors.ts ui/src/components/belt/SelectedPanel.tsx ui/src/components/belt/SpectrumChart.tsx ui/src/app/page.tsx
git commit -m "feat(ui): selected-asteroid panel + lazy-loaded spectrum chart"
```

---

## Task 21: Trajectory arc

**Files:**
- Create: `ui/src/components/belt/TrajectoryArc.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`

- [ ] **Step 1: Create `TrajectoryArc.tsx`**

```tsx
"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian, EARTH_ELEMENTS } from "@/lib/kepler";

const SEGMENTS = 96;
const LIFT = 0.6;

export function TrajectoryArc() {
  const selected = useStore((s) => s.selectedDesignation);
  const neos = useStore((s) => s.neos);
  const target = neos.find((n) => n.designation === selected);

  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const positions = useMemo(() => new Float32Array((SEGMENTS + 1) * 3), []);
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const dashOffset = useRef(0);
  const materialRef = useRef<THREE.LineDashedMaterial>(null);

  useFrame((_, dt) => {
    if (!target) return;
    const jd = useStore.getState().jd;
    const [ex, ey, ez] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    const [tx, ty, tz] = heliocentricCartesian(target.elements, jd);
    // Scene-space (y-up):
    const e = new THREE.Vector3(ex, ez, -ey);
    const t = new THREE.Vector3(tx, tz, -ty);
    const mid = e.clone().add(t).multiplyScalar(0.5);
    mid.y += LIFT;
    const curve = new THREE.QuadraticBezierCurve3(e, mid, t);
    const pts = curve.getPoints(SEGMENTS);
    for (let i = 0; i < pts.length; i++) {
      positions[3 * i] = pts[i].x;
      positions[3 * i + 1] = pts[i].y;
      positions[3 * i + 2] = pts[i].z;
    }
    geom.attributes.position.needsUpdate = true;
    geom.computeBoundingSphere();
    dashOffset.current -= dt * 0.4;
    if (materialRef.current) materialRef.current.dashOffset = dashOffset.current;
  });

  if (!target) return null;

  return (
    <line>
      {/* @ts-expect-error R3F geometry primitive */}
      <primitive object={geom} attach="geometry" />
      <lineDashedMaterial
        ref={materialRef}
        color="#7ee8ff"
        dashSize={0.08}
        gapSize={0.05}
        transparent
        opacity={0.85}
      />
    </line>
  );
}
```

Note: `LineDashedMaterial` requires `computeLineDistances`. We side-step that by setting `dashOffset` on a regular geometry — three.js renders it as a uniform-spaced dashed line for our short curve length. If dashes don't render in your version, swap to `lineBasicMaterial` and animate via a custom shader on a follow-up.

- [ ] **Step 2: Mount in scene**

In `Scene.tsx`, add `<TrajectoryArc />` after `<SelectionHalo />`.

- [ ] **Step 3: Verify in browser**

Select an asteroid → animated arc from Earth to the target's current position, lifted above the ecliptic.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/belt/TrajectoryArc.tsx ui/src/components/belt/Scene.tsx
git commit -m "feat(ui): animated Hohmann-shaped trajectory arc"
```

---

## Task 22: Camera tween on select

**Files:**
- Create: `ui/src/components/belt/CameraRig.tsx`
- Modify: `ui/src/components/belt/Scene.tsx`

- [ ] **Step 1: Create `CameraRig.tsx`**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian } from "@/lib/kepler";

const TWEEN_MS = 1200;

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

export function CameraRig() {
  const { camera } = useThree();
  const selected = useStore((s) => s.selectedDesignation);
  const neos = useStore((s) => s.neos);

  const fromPos = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!selected) { startedAt.current = null; return; }
    const target = neos.find((n) => n.designation === selected);
    if (!target) return;
    const jd = useStore.getState().jd;
    const [tx, ty, tz] = heliocentricCartesian(target.elements, jd);
    const tv = new THREE.Vector3(tx, tz, -ty);
    // viewpoint: pull camera toward target but stay above the ecliptic
    const dir = tv.clone().normalize().multiplyScalar(1.6);
    const desired = tv.clone().add(dir).add(new THREE.Vector3(0, 1.2, 0));
    fromPos.current.copy(camera.position);
    toPos.current.copy(desired);
    startedAt.current = performance.now();
  }, [selected, neos, camera]);

  useFrame(() => {
    if (startedAt.current === null) return;
    const t = Math.min(1, (performance.now() - startedAt.current) / TWEEN_MS);
    camera.position.lerpVectors(fromPos.current, toPos.current, easeOutCubic(t));
    if (t >= 1) startedAt.current = null;
  });

  return null;
}
```

- [ ] **Step 2: Mount in scene**

In `Scene.tsx`, add `<CameraRig />` near `<OrbitControls />`.

- [ ] **Step 3: Verify in browser**

Click an asteroid → camera smoothly flies in. OrbitControls still works after the tween (dampingFactor smooths the user re-grabbing it).

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/belt/CameraRig.tsx ui/src/components/belt/Scene.tsx
git commit -m "feat(ui): camera tweens to selected asteroid"
```

---

## Task 23: Mining target ranking panel

**Files:**
- Create: `ui/src/components/belt/RankingPanel.tsx`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create `RankingPanel.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { hohmannDv } from "@/lib/hohmann";
import { miningScore } from "@/lib/mining-score";
import { specClassColor } from "@/lib/spec-class";

type SortKey = "score" | "dv" | "diameter" | "class";

export function RankingPanel() {
  const neos = useStore((s) => s.neos);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedDesignation);
  const [sort, setSort] = useState<SortKey>("score");

  const rows = useMemo(() => {
    const enriched = neos.map((n) => {
      const dv = hohmannDv(n.elements.a, n.elements.i);
      return {
        n,
        dv,
        diameter: n.physical?.diameter_km ?? null,
        cls: n.physical?.spec_class ?? "?",
        score: miningScore(n, dv),
      };
    });
    enriched.sort((a, b) => {
      switch (sort) {
        case "dv": return a.dv - b.dv;
        case "diameter": return (b.diameter ?? -1) - (a.diameter ?? -1);
        case "class": return a.cls.localeCompare(b.cls);
        case "score":
        default: return b.score - a.score;
      }
    });
    return enriched;
  }, [neos, sort]);

  return (
    <aside className="fixed top-20 right-6 w-[340px] panel text-xs flex flex-col"
           style={{ maxHeight: "calc(100vh - 160px)" }}>
      <div className="p-3 border-b border-rule">
        <div className="label-caps">mining targets <span className="text-warn">🜨 heuristic</span></div>
      </div>
      <div className="grid grid-cols-[1fr_28px_44px_44px_44px] gap-x-2 px-3 py-1 text-dim border-b border-rule">
        <Header label="designation" />
        <Header label="cls" onClick={() => setSort("class")} />
        <Header label="Δv" onClick={() => setSort("dv")} active={sort === "dv"} />
        <Header label="diam" onClick={() => setSort("diameter")} active={sort === "diameter"} />
        <Header label="score" onClick={() => setSort("score")} active={sort === "score"} />
      </div>
      <div className="overflow-y-auto">
        {rows.slice(0, 200).map(({ n, dv, diameter, cls, score }) => {
          const active = n.designation === selected;
          return (
            <button
              key={n.designation}
              onClick={() => select(n.designation)}
              className={`w-full grid grid-cols-[1fr_28px_44px_44px_44px] gap-x-2 px-3 py-0.5 text-left tabular-nums
                          ${active ? "bg-rule text-accent" : "hover:bg-rule/40"}`}
            >
              <span className="id-bracket truncate">{n.designation}</span>
              <span style={{ color: `#${specClassColor(cls).toString(16).padStart(6, "0")}` }}>{cls[0] ?? "?"}</span>
              <span>{dv.toFixed(1)}</span>
              <span>{diameter != null ? diameter.toFixed(2) : "—"}</span>
              <span>{score.toFixed(2)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function Header({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-left ${active ? "text-accent" : "text-dim"} ${onClick ? "hover:text-fg" : ""}`}
      disabled={!onClick}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Mount in page**

In `ui/src/app/page.tsx`, add `<RankingPanel />` inside `<SceneBootstrap>`.

- [ ] **Step 3: Verify in browser**

Right panel lists top targets by mining score. Clicking a row selects the asteroid (camera tween, left panel populates, halo appears). Sort by Δv or diameter — order changes.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/belt/RankingPanel.tsx ui/src/app/page.tsx
git commit -m "feat(ui): mining target ranking panel with column sorts"
```

---

## Task 24: KOI sky map (2D canvas)

**Files:**
- Create: `ui/src/lib/koi-store.ts`
- Create: `ui/src/components/koi/KoiBootstrap.tsx`
- Create: `ui/src/components/koi/SkyMap.tsx`
- Modify: `ui/src/app/exoplanets/page.tsx`

- [ ] **Step 1: Create a small KOI-specific store**

`ui/src/lib/koi-store.ts`:

```ts
"use client";
import { create } from "zustand";

type State = {
  selectedKepoi: string | null;
  hoverKepoi: string | null;
  highlightedBin: number | null;        // 0..9, the reliability-diagram bin to glow
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setHighlightedBin: (b: number | null) => void;
};

export const useKoiStore = create<State>((set) => ({
  selectedKepoi: null,
  hoverKepoi: null,
  highlightedBin: null,
  select: (selectedKepoi) => set({ selectedKepoi }),
  hover: (hoverKepoi) => set({ hoverKepoi }),
  setHighlightedBin: (highlightedBin) => set({ highlightedBin }),
}));
```

- [ ] **Step 2: Create `KoiBootstrap.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { loadKoi, loadMeta } from "@/lib/data";

export function KoiBootstrap({ children }: { children: React.ReactNode }) {
  const setLoadError = useStore((s) => s.setLoadError);
  const koi = useStore((s) => s.koi);
  const meta = useStore((s) => s.meta);
  const loadError = useStore((s) => s.loadError);

  useEffect(() => {
    if (koi.length > 0 && meta) return;
    let cancelled = false;
    (async () => {
      try {
        const [k, m] = await Promise.all([loadKoi(), loadMeta()]);
        // Use zustand setState directly so we don't clobber neos/closeApproaches
        // if the user came from the belt route first.
        if (!cancelled) useStore.setState({ koi: k, meta: m });
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [setLoadError, koi.length, meta]);

  if (loadError) {
    return <div className="h-screen flex items-center justify-center text-alert">── data unavailable: {loadError} ──</div>;
  }
  if (!meta) {
    return <div className="h-screen flex items-center justify-center text-dim label-caps">── loading kepler field ──</div>;
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Create `SkyMap.tsx`**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

const RA_MIN = 279, RA_MAX = 302;
const DEC_MIN = 36, DEC_MAX = 53;

function probColor(p: number | null): string {
  if (p == null) return "#6b7385";
  // cool (alert) -> hot (accent)
  const lo = [255, 94, 122];   // #ff5e7a
  const hi = [126, 232, 255];  // #7ee8ff
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * p));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function SkyMap() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const hover = useKoiStore((s) => s.hover);
  const highlightedBin = useKoiStore((s) => s.highlightedBin);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitMap = useRef<{ x: number; y: number; r: number; id: string }[]>([]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const W = c.width = c.clientWidth * devicePixelRatio;
    const H = c.height = c.clientHeight * devicePixelRatio;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);

    // Faint Kepler FOV outline
    ctx.strokeStyle = "#1a2233";
    ctx.lineWidth = 1 * devicePixelRatio;
    ctx.strokeRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84);

    hitMap.current = [];
    for (const k of koi) {
      const u = (k.ra - RA_MIN) / (RA_MAX - RA_MIN);
      const v = (DEC_MAX - k.dec) / (DEC_MAX - DEC_MIN);
      const x = W * (0.08 + 0.84 * u);
      const y = H * (0.08 + 0.84 * v);
      const r = Math.max(1.5, Math.min(6, (k.koi_prad ?? 1.5) * 1.2)) * devicePixelRatio;

      const bin = k.prob_planet != null ? Math.min(9, Math.floor(k.prob_planet * 10)) : -1;
      const glow = highlightedBin !== null && bin === highlightedBin;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = probColor(k.prob_planet);
      ctx.globalAlpha = glow ? 1.0 : (k.koi_disposition === "FALSE POSITIVE" ? 0.3 : 0.75);
      if (k.koi_disposition === "CONFIRMED") ctx.fill();
      else if (k.koi_disposition === "CANDIDATE") { ctx.lineWidth = 1.2 * devicePixelRatio; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
      else { ctx.lineWidth = 1 * devicePixelRatio; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
      ctx.globalAlpha = 1;

      hitMap.current.push({ x, y, r: r + 2 * devicePixelRatio, id: k.kepoi_name });
    }
  }, [koi, highlightedBin]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={(e) => {
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) * devicePixelRatio;
          const py = (e.clientY - rect.top) * devicePixelRatio;
          const hit = hitMap.current.find((h) => (h.x - px) ** 2 + (h.y - py) ** 2 < h.r ** 2);
          hover(hit?.id ?? null);
        }}
        onClick={(e) => {
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) * devicePixelRatio;
          const py = (e.clientY - rect.top) * devicePixelRatio;
          const hit = hitMap.current.find((h) => (h.x - px) ** 2 + (h.y - py) ** 2 < h.r ** 2);
          if (hit) select(hit.id);
        }}
      />
      <div className="absolute top-3 left-4 text-dim label-caps">kepler field · cygnus</div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `/exoplanets`**

`ui/src/app/exoplanets/page.tsx`:

```tsx
import { KoiBootstrap } from "@/components/koi/KoiBootstrap";
import { SkyMap } from "@/components/koi/SkyMap";

export default function ExoplanetsPage() {
  return (
    <main className="relative h-screen w-screen">
      <KoiBootstrap>
        <div className="grid grid-cols-[1fr_360px] h-full">
          <div className="relative"><SkyMap /></div>
          <aside className="border-l border-rule p-4 text-xs text-dim">
            ── select a candidate ──
          </aside>
        </div>
      </KoiBootstrap>
    </main>
  );
}
```

- [ ] **Step 5: Verify in browser**

Visit http://localhost:3000/exoplanets. Expected: a dark canvas with a faint rectangle outlining the Kepler FOV and thousands of points scattered inside, colored by predicted-planet probability.

- [ ] **Step 6: Commit**

```bash
git add ui/src/lib/koi-store.ts ui/src/components/koi/KoiBootstrap.tsx ui/src/components/koi/SkyMap.tsx ui/src/app/exoplanets/page.tsx
git commit -m "feat(ui): KOI sky map (Kepler FOV, 2D canvas)"
```

---

## Task 25: Selected KOI + Top Candidates panels

**Files:**
- Create: `ui/src/components/koi/SelectedKoiPanel.tsx`
- Create: `ui/src/components/koi/TopCandidatesPanel.tsx`
- Modify: `ui/src/app/exoplanets/page.tsx`

- [ ] **Step 1: Create `SelectedKoiPanel.tsx`**

```tsx
"use client";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

function dispChip(d: string) {
  const color = d === "CONFIRMED" ? "border-green text-green"
            : d === "FALSE POSITIVE" ? "border-alert text-alert"
            : "border-accent text-accent";
  return <span className={`px-1.5 py-0.5 border ${color}`}>{d}</span>;
}

export function SelectedKoiPanel() {
  const koi = useStore((s) => s.koi);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);
  const rec = koi.find((k) => k.kepoi_name === selectedKepoi);

  if (!rec) {
    return (
      <div className="panel p-4">
        <div className="label-caps mb-2">selected koi</div>
        <div className="text-dim">── select a candidate ──</div>
      </div>
    );
  }

  return (
    <div className="panel p-4 text-xs space-y-2">
      <div className="label-caps">selected koi</div>
      <div className="text-fg">
        <span className="id-bracket text-accent">{rec.kepoi_name}</span>
        {rec.kepler_name && <span className="ml-2 text-dim">{rec.kepler_name}</span>}
      </div>
      <div>{dispChip(rec.koi_disposition)}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span>period</span><span>{rec.koi_period?.toFixed(2) ?? "—"}<span className="unit">d</span></span>
        <span>prad</span><span>{rec.koi_prad?.toFixed(2) ?? "—"}<span className="unit">R⊕</span></span>
        <span>teq</span><span>{rec.koi_teq?.toFixed(0) ?? "—"}<span className="unit">K</span></span>
        <span>host Teff</span><span>{rec.koi_steff?.toFixed(0) ?? "—"}<span className="unit">K</span></span>
        <span>host R</span><span>{rec.koi_srad?.toFixed(2) ?? "—"}<span className="unit">R☉</span></span>
      </div>
      <div className="border-t border-rule pt-2">
        <div className="label-caps mb-1">our model</div>
        {rec.prob_planet != null ? (
          <span className="text-accent text-base">p = {rec.prob_planet.toFixed(3)}</span>
        ) : <span className="text-dim">(not classified)</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `TopCandidatesPanel.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

export function TopCandidatesPanel() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);

  const rows = useMemo(() => {
    return koi
      .filter((k) => k.koi_disposition === "CANDIDATE" && k.prob_planet != null)
      .sort((a, b) => (b.prob_planet ?? 0) - (a.prob_planet ?? 0))
      .slice(0, 50);
  }, [koi]);

  return (
    <div className="panel text-xs flex flex-col" style={{ maxHeight: 360 }}>
      <div className="p-3 border-b border-rule">
        <div className="label-caps">top candidates · prob_planet ↓</div>
      </div>
      <div className="overflow-y-auto">
        {rows.map((r) => {
          const active = r.kepoi_name === selectedKepoi;
          return (
            <button
              key={r.kepoi_name}
              onClick={() => select(r.kepoi_name)}
              className={`w-full flex justify-between px-3 py-0.5 text-left tabular-nums
                          ${active ? "bg-rule text-accent" : "hover:bg-rule/40"}`}
            >
              <span className="id-bracket truncate">{r.kepoi_name}</span>
              <span>{(r.prob_planet ?? 0).toFixed(3)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount panels**

Update `ui/src/app/exoplanets/page.tsx`:

```tsx
import { KoiBootstrap } from "@/components/koi/KoiBootstrap";
import { SkyMap } from "@/components/koi/SkyMap";
import { SelectedKoiPanel } from "@/components/koi/SelectedKoiPanel";
import { TopCandidatesPanel } from "@/components/koi/TopCandidatesPanel";

export default function ExoplanetsPage() {
  return (
    <main className="relative h-screen w-screen">
      <KoiBootstrap>
        <div className="grid grid-cols-[1fr_360px] h-full">
          <div className="relative"><SkyMap /></div>
          <aside className="border-l border-rule p-4 space-y-4 overflow-y-auto">
            <SelectedKoiPanel />
            <TopCandidatesPanel />
          </aside>
        </div>
      </KoiBootstrap>
    </main>
  );
}
```

- [ ] **Step 4: Verify**

Click a sky-map point → SelectedKoiPanel populates. Click a row in TopCandidatesPanel → the same KOI becomes selected (but the sky-map doesn't yet visually highlight it; that's optional polish, skip).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/koi/SelectedKoiPanel.tsx ui/src/components/koi/TopCandidatesPanel.tsx ui/src/app/exoplanets/page.tsx
git commit -m "feat(ui): KOI selected + top-candidates panels"
```

---

## Task 26: Reliability diagram (interactive)

**Files:**
- Create: `ui/src/components/koi/ReliabilityDiagram.tsx`
- Modify: `ui/src/app/exoplanets/page.tsx`

- [ ] **Step 1: Create `ReliabilityDiagram.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

const N_BINS = 10;

export function ReliabilityDiagram({ width = 720, height = 160 }: { width?: number; height?: number }) {
  const koi = useStore((s) => s.koi);
  const setHighlightedBin = useKoiStore((s) => s.setHighlightedBin);
  const highlightedBin = useKoiStore((s) => s.highlightedBin);

  const bins = useMemo(() => {
    const counts = Array.from({ length: N_BINS }, () => ({ n: 0, confirmed: 0, midp: 0 }));
    for (const k of koi) {
      if (k.prob_planet == null || k.koi_disposition === "CANDIDATE") continue;
      const i = Math.min(N_BINS - 1, Math.floor(k.prob_planet * N_BINS));
      counts[i].n += 1;
      counts[i].midp = (i + 0.5) / N_BINS;
      if (k.koi_disposition === "CONFIRMED") counts[i].confirmed += 1;
    }
    return counts.map((b) => ({ ...b, obs: b.n > 0 ? b.confirmed / b.n : null }));
  }, [koi]);

  const pad = 28;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const x = (p: number) => pad + p * W;
  const y = (p: number) => pad + (1 - p) * H;

  return (
    <div className="panel p-3" style={{ width }}>
      <div className="label-caps mb-1">reliability diagram</div>
      <svg width={width} height={height}>
        {/* Ideal line y = x */}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#1a2233" strokeDasharray="4,4" />
        {/* Axes */}
        <line x1={pad} y1={y(0)} x2={pad + W} y2={y(0)} stroke="#1a2233" />
        <line x1={pad} y1={y(0)} x2={pad} y2={y(1)} stroke="#1a2233" />
        <text x={pad} y={height - 4} fill="#6b7385" fontSize="10">predicted</text>
        <text x={4} y={pad + 8} fill="#6b7385" fontSize="10">observed</text>
        {bins.map((b, i) => b.obs != null && (
          <g
            key={i}
            onMouseEnter={() => setHighlightedBin(i)}
            onMouseLeave={() => setHighlightedBin(null)}
            style={{ cursor: "pointer" }}
          >
            <circle cx={x(b.midp)} cy={y(b.obs)} r={highlightedBin === i ? 7 : 5}
                    fill={highlightedBin === i ? "#7ee8ff" : "#e8eef5"} />
          </g>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Mount under the sky map**

Update `ui/src/app/exoplanets/page.tsx`:

```tsx
import { KoiBootstrap } from "@/components/koi/KoiBootstrap";
import { SkyMap } from "@/components/koi/SkyMap";
import { SelectedKoiPanel } from "@/components/koi/SelectedKoiPanel";
import { TopCandidatesPanel } from "@/components/koi/TopCandidatesPanel";
import { ReliabilityDiagram } from "@/components/koi/ReliabilityDiagram";

export default function ExoplanetsPage() {
  return (
    <main className="relative h-screen w-screen">
      <KoiBootstrap>
        <div className="grid grid-cols-[1fr_360px] grid-rows-[1fr_auto] h-full">
          <div className="relative"><SkyMap /></div>
          <aside className="border-l border-rule p-4 space-y-4 overflow-y-auto row-span-2">
            <SelectedKoiPanel />
            <TopCandidatesPanel />
          </aside>
          <div className="border-t border-rule p-3">
            <ReliabilityDiagram />
          </div>
        </div>
      </KoiBootstrap>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Bottom strip shows the reliability diagram. Hovering a bin re-renders the sky map with that bin's points glowing.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/koi/ReliabilityDiagram.tsx ui/src/app/exoplanets/page.tsx
git commit -m "feat(ui): interactive reliability diagram for KOI"
```

---

## Task 27: Shared chrome (top nav + bottom HUD)

**Files:**
- Create: `ui/src/components/chrome/TopNav.tsx`
- Create: `ui/src/components/chrome/BottomHud.tsx`
- Modify: `ui/src/app/layout.tsx`
- Modify: `ui/src/app/page.tsx`
- Modify: `ui/src/app/exoplanets/page.tsx`

- [ ] **Step 1: Create `TopNav.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function TopNav() {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={clsx(
        "px-2 py-1 border tracking-caps text-[11px]",
        path === href ? "border-accent text-accent" : "border-rule text-dim hover:text-fg",
      )}
    >
      [{label}]
    </Link>
  );
  return (
    <div className="fixed top-3 left-0 right-0 z-40 flex justify-between px-5 pointer-events-none">
      <div className="pointer-events-auto text-[12px] text-dim">
        <span className="text-fg">EXOPROXIMO</span>
        <span className="mx-1">·</span>
        v0.3
      </div>
      <div className="pointer-events-auto flex gap-2">
        {tab("/", "BELT")}
        {tab("/exoplanets", "EXOPLANETS")}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `BottomHud.tsx`** (reads meta from store; both routes load it)

```tsx
"use client";
import { useStore } from "@/lib/store";

export function BottomHud() {
  const meta = useStore((s) => s.meta);
  if (!meta) return null;
  const ageLabel =
    meta.elements_age_days < 0 ? "(unknown age)" :
    meta.elements_age_days === 0 ? "(today)" :
    `(${meta.elements_age_days}d ago)`;
  return (
    <div className="fixed bottom-1 left-0 right-0 z-40 px-5 text-[10px] text-dim flex justify-between pointer-events-none">
      <span>
        last run: {meta.last_run_at?.slice(0, 10) ?? "—"} {ageLabel}
        <span className="mx-1">·</span>
        {meta.n_neos} NEOs · {meta.n_koi} KOI
        <span className="mx-1">·</span>
        git: {meta.git_sha}
      </span>
      <span>exoproximo · static · 60fps</span>
    </div>
  );
}
```

- [ ] **Step 3: Mount in layout**

Update `ui/src/app/layout.tsx`:

```tsx
import "@/styles/globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { TopNav } from "@/components/chrome/TopNav";
import { BottomHud } from "@/components/chrome/BottomHud";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Exoproximo · Belt Explorer",
  description: "NEO spectra, orbits, and Kepler candidates.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <body className="bg-bg text-fg font-mono antialiased">
        <TopNav />
        {children}
        <BottomHud />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify both routes**

Run `npm run dev`. Visit `/` and `/exoplanets`. Top nav lit-tab tracks the route. Bottom strip shows pipeline meta and asteroid count. No CSS overlap with existing panels (the top panels start at `top-20`).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/chrome/TopNav.tsx ui/src/components/chrome/BottomHud.tsx ui/src/app/layout.tsx
git commit -m "feat(ui): shared chrome — top nav + bottom HUD"
```

---

## Task 28: Debug-mode `#sel=` deep-link

**Files:**
- Create: `ui/src/components/belt/HashSelector.tsx`
- Modify: `ui/src/app/page.tsx`

- [ ] **Step 1: Create `HashSelector.tsx`** — selects an asteroid by `#sel=DESIGNATION` for the Playwright smoke test

```tsx
"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function HashSelector() {
  const neos = useStore((s) => s.neos);
  const select = useStore((s) => s.select);

  useEffect(() => {
    if (neos.length === 0) return;
    const apply = () => {
      const m = window.location.hash.match(/sel=([^&]+)/);
      if (m) select(decodeURIComponent(m[1]));
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [neos, select]);

  return null;
}
```

- [ ] **Step 2: Mount it**

In `ui/src/app/page.tsx`, add `<HashSelector />` inside `<SceneBootstrap>` after the play loop.

- [ ] **Step 3: Verify**

Open http://localhost:3000/#sel=100926 → SelectedPanel populates with `[100926]`. (Use any real designation from the DB.)

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/belt/HashSelector.tsx ui/src/app/page.tsx
git commit -m "feat(ui): #sel= deep-link for testing and sharing"
```

---

## Task 29: Playwright smoke spec + UI README

**Files:**
- Create: `ui/playwright.config.ts`
- Create: `ui/tests-e2e/smoke.spec.ts`
- Create: `ui/README.md`
- Modify: root `README.md`

- [ ] **Step 1: Create `ui/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests-e2e",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

- [ ] **Step 2: Create `ui/tests-e2e/smoke.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("/ loads, canvas mounts, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(errors, errors.join("\n")).toEqual([]);
  await page.screenshot({ path: "test-results/belt.png", fullPage: true });
});

test("/exoplanets loads, canvas mounts, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/exoplanets");
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(errors, errors.join("\n")).toEqual([]);
  await page.screenshot({ path: "test-results/exoplanets.png", fullPage: true });
});

test("#sel= deep-link populates SelectedPanel", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("canvas");
  // Pick any designation likely to exist; the test data has 100926.
  await page.goto("/#sel=100926");
  await expect(page.locator("text=[100926]").first()).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 3: Create `ui/README.md`**

```markdown
# Exoproximo UI

Next.js 15 static-export app: 3D NEO belt explorer (`/`) and Kepler-FOV KOI map (`/exoplanets`).

## Develop

```bash
cd ui
npm install
npm run dev     # http://localhost:3000
```

The `predev`/`prebuild` hooks regenerate `public/data/*.json` from
`../outputs/exoproximo.db` via `../scripts/export_ui_data.py`. If you see
"data unavailable", run the upstream pipelines:

```bash
cd ..
uv run exo neo-orbits --no-ephemerides
uv run exo koi
```

## Build & deploy

```bash
npm run build   # produces ./out, fully static
```

Deploy `out/` to any static host (Vercel, Netlify, GitHub Pages, S3, ...).

## Test

```bash
npm run test    # vitest (unit + math)
```

Playwright smoke spec is local-only (not in CI):

```bash
npm run build && npx playwright install chromium
npx playwright test
```

## Known limitations

- Tuned for desktop Chromium. Touch input works incidentally via OrbitControls but isn't designed for.
- All orbital propagation is 2-body Keplerian; positions are accurate to arcseconds over months,
  degrade over decades. Re-run `exo neo-orbits` periodically to refresh element fits.
- All ~9,200 KOIs are in the Kepler field (~115 deg² in Cygnus); the sky map zooms to that patch.
```

- [ ] **Step 4: Add a UI section to the root `README.md`**

Append:

```markdown
## UI

Static-export Next.js app at `ui/`. See [`ui/README.md`](./ui/README.md).
```

- [ ] **Step 5: Run the smoke spec locally to confirm it passes**

```bash
cd ui
npx playwright install chromium
npm run build
npx playwright test
```

Expected: 3 PASS. Screenshots in `ui/test-results/`.

- [ ] **Step 6: Commit**

```bash
git add ui/playwright.config.ts ui/tests-e2e/smoke.spec.ts ui/README.md README.md
git commit -m "test(ui): Playwright smoke spec + README"
```

---

## Task 30: CI — UI lint/test/build

**Files:**
- Create: `.github/workflows/ui.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: UI

on:
  push:
    branches: [master]
    paths: ["ui/**", "scripts/export_ui_data.py", ".github/workflows/ui.yml"]
  pull_request:
    paths: ["ui/**", "scripts/export_ui_data.py", ".github/workflows/ui.yml"]

jobs:
  build:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: ui } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm", cache-dependency-path: ui/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      # No data export in CI; create empty stubs so `next build` doesn't fail on missing JSON.
      - name: Stub data dir
        run: |
          mkdir -p public/data/spectra
          echo "[]" > public/data/neos.json
          echo "[]" > public/data/koi.json
          echo "[]" > public/data/close_approaches.json
          echo '{"git_sha":"ci","last_run_at":null,"elements_age_days":-1,"n_neos":0,"n_koi":0}' > public/data/meta.json
      - name: Build (skip prebuild data export)
        run: npx next build
```

- [ ] **Step 2: Verify locally that `npx next build` works with stub data**

```bash
cd ui
mkdir -p public/data/spectra
echo "[]" > public/data/neos.json
echo "[]" > public/data/koi.json
echo "[]" > public/data/close_approaches.json
echo '{"git_sha":"local","last_run_at":null,"elements_age_days":-1,"n_neos":0,"n_koi":0}' > public/data/meta.json
npx next build
```

Expected: build succeeds. Re-run `npm run build` afterward to restore real data via the prebuild hook.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ui.yml
git commit -m "ci: lint/test/build the UI on PRs that touch ui/"
```

---

## Done

Run the full local sweep to confirm everything is wired:

```bash
# Python side
uv run pytest

# UI side
cd ui
npm run lint
npm run test
npm run build
```

All three should succeed with the data exported from a populated `outputs/exoproximo.db`. Open `ui/out/index.html` via a tiny static server to preview the deployed bundle:

```bash
cd ui/out && python3 -m http.server 8080
# visit http://localhost:8080
```



