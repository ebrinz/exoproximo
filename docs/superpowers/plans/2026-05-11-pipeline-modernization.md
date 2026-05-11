# Pipeline Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port three Jupyter notebooks into a plain-Python `exoproximo` package with a `exo` CLI, fix correctness bugs, take an opinionated rewrite pass, and persist all outputs to SQLite + joblib so a future UI can consume them.

**Architecture:** Single `src/exoproximo/` package with strict layering (`cli` → `pipelines/` → `features/` + `ml/` → `io.py` + `config.py`). One SQLite file (`outputs/exoproximo.db`) is the output contract. Bootstrap script for one-time data acquisition. Each pipeline is a thin orchestrator (~50–150 LOC) calling pure feature/ML functions.

**Tech Stack:** Python 3.11, uv + pyproject.toml, pandas/numpy/scipy, scikit-learn, umap-learn, hdbscan, astroquery + astropy, Typer (CLI), joblib, pytest + pytest-httpx.

**Reference spec:** `docs/superpowers/specs/2026-05-11-pipeline-modernization-design.md`

---

## Task 1: Snapshot master to `archive/pre-pipeline-master` and clean working tree

**Files:**
- Delete: `keppler_objs_random_forest.ipynb`, `neo_analysis.ipynb`, `neo_api_query.ipynb`
- Delete: `Pipfile`, `Pipfile.lock`

- [ ] **Step 1: Create archive branch from current master**

```bash
git switch -c archive/pre-pipeline-master
git log -1 --oneline
```

Expected: prints the latest commit (e.g. `1635682 Add dbscan back in for visibility, and improve TODO list`). The archive branch now points at the pre-rewrite world.

- [ ] **Step 2: (Optional) Push archive branch to remote**

```bash
git push -u origin archive/pre-pipeline-master
```

Skip this step if there is no remote or you don't want it published. The branch lives locally either way.

- [ ] **Step 3: Switch back to master**

```bash
git switch master
git status
```

Expected: `On branch master`, working tree clean.

- [ ] **Step 4: Delete notebooks and Pipfile from master**

```bash
git rm keppler_objs_random_forest.ipynb neo_analysis.ipynb neo_api_query.ipynb Pipfile Pipfile.lock
```

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: archive notebooks to archive/pre-pipeline-master branch

Removes notebooks and Pipfile from master in preparation for the
plain-Python pipeline rewrite. Originals remain runnable on
archive/pre-pipeline-master."
git log -2 --oneline
```

---

## Task 2: Initialize uv project (`pyproject.toml`, `.gitignore`, lockfile)

**Files:**
- Create: `pyproject.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Write `pyproject.toml`**

Create `pyproject.toml` at the repo root:

```toml
[project]
name = "exoproximo"
version = "0.2.0"
description = "Plain-Python ML/AI pipelines over near-Earth-object and exoplanet data"
readme = "README.md"
requires-python = ">=3.11,<3.13"
license = { file = "LICENSE" }
dependencies = [
    "pandas>=2.2",
    "numpy>=1.26,<2.2",
    "scipy>=1.13",
    "scikit-learn>=1.5",
    "umap-learn>=0.5.6",
    "hdbscan>=0.8.38",
    "astroquery>=0.4.7",
    "astropy>=6.1",
    "typer>=0.12",
    "joblib>=1.4",
    "tqdm>=4.66",
    "requests>=2.32",
    "pyarrow>=17.0",
    "matplotlib>=3.9",
]

[project.scripts]
exo = "exoproximo.cli:app"

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-cov>=5.0",
    "pytest-httpx>=0.30",
    "ruff>=0.6",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/exoproximo"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra -q"
filterwarnings = [
    "ignore::DeprecationWarning:hdbscan",
    "ignore::DeprecationWarning:umap",
]

[tool.ruff]
line-length = 100
target-version = "py311"
```

- [ ] **Step 2: Update `.gitignore`**

Replace `.gitignore` contents with:

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
.coverage
htmlcov/
.DS_Store

# Build artifacts
build/
dist/
*.egg-info/

# Pipeline outputs (regeneratable)
data/raw/
outputs/

# uv
.python-version
```

Note: `data/MITHNEOS/` is intentionally NOT gitignored — it stays vendored. `data/raw/` is.

- [ ] **Step 3: Resolve and install deps with uv**

```bash
uv sync --extra dev
```

Expected: creates `.venv/`, writes `uv.lock`. Should complete without errors. If `hdbscan` fails to build, install the system C/C++ toolchain (already present on macOS with Xcode CLT).

- [ ] **Step 4: Verify the environment**

```bash
uv run python -c "import pandas, sklearn, hdbscan, umap, astroquery; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock .gitignore
git commit -m "chore: switch from pipenv to uv + pyproject.toml

Pins the scientific stack (pandas, numpy, scipy, scikit-learn,
umap-learn, hdbscan, astroquery, etc.) that the notebooks previously
relied on as ambient. Adds dev deps (pytest, pytest-httpx, ruff)."
```

---

## Task 3: Package skeleton + import smoke test

**Files:**
- Create: `src/exoproximo/__init__.py`, `src/exoproximo/config.py`
- Create: `src/exoproximo/features/__init__.py`, `src/exoproximo/ml/__init__.py`, `src/exoproximo/pipelines/__init__.py`
- Create: `tests/__init__.py`, `tests/conftest.py`, `tests/test_imports.py`

- [ ] **Step 1: Write `src/exoproximo/__init__.py`**

```python
"""exoproximo: ML/AI pipelines over NEO and KOI data."""

__version__ = "0.2.0"
```

- [ ] **Step 2: Write `src/exoproximo/config.py`**

```python
"""Project-wide constants. Single source of truth for paths and seeds."""
from __future__ import annotations

from pathlib import Path

RANDOM_STATE = 42

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
MITHNEOS_DIR = DATA_DIR / "MITHNEOS" / "gbo.ast.mithneos.spectra_2000-2021_V1_0" / "data"
OUTPUTS_DIR = REPO_ROOT / "outputs"
DB_PATH = OUTPUTS_DIR / "exoproximo.db"
MODELS_DIR = OUTPUTS_DIR / "models"
KOI_RAW_PATH = RAW_DIR / "koi_cumulative.parquet"
JPL_CACHE_DIR = RAW_DIR / "jpl_cache"

# Spectral feature constants
ANCHOR_WAVELENGTH_UM = 0.55
VIS_SLOPE_RANGE_UM = (0.45, 0.70)
NIR_SLOPE_RANGE_UM = (0.85, 2.40)
BAND_1UM_RANGE = (0.80, 1.30)
BAND_2UM_RANGE = (1.70, 2.30)

# KOI: forbidden columns to keep out of X (leakage)
KOI_FORBIDDEN_FEATURE_PREFIXES = ("koi_disp", "koi_pdisp", "koi_score", "koi_fpflag", "koi_tce")
```

- [ ] **Step 3: Create empty subpackage `__init__.py` files**

```bash
mkdir -p src/exoproximo/features src/exoproximo/ml src/exoproximo/pipelines tests
touch src/exoproximo/features/__init__.py src/exoproximo/ml/__init__.py src/exoproximo/pipelines/__init__.py tests/__init__.py
```

- [ ] **Step 4: Write `tests/conftest.py`** (shared fixtures used in later tasks)

```python
"""Shared pytest fixtures."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture
def tmp_outputs(tmp_path: Path, monkeypatch) -> Path:
    """Redirect OUTPUTS_DIR/DB_PATH/MODELS_DIR to a tmp directory."""
    from exoproximo import config

    outputs = tmp_path / "outputs"
    models = outputs / "models"
    models.mkdir(parents=True)
    monkeypatch.setattr(config, "OUTPUTS_DIR", outputs)
    monkeypatch.setattr(config, "DB_PATH", outputs / "exoproximo.db")
    monkeypatch.setattr(config, "MODELS_DIR", models)
    return outputs
```

- [ ] **Step 5: Write `tests/test_imports.py`**

```python
def test_package_imports():
    import exoproximo
    from exoproximo import config
    from exoproximo.features import spectra, orbits  # noqa: F401
    from exoproximo.ml import cluster, anomaly, classify  # noqa: F401
    from exoproximo.pipelines import fetch, neo_spectra, neo_orbits, koi  # noqa: F401

    assert exoproximo.__version__ == "0.2.0"
    assert config.RANDOM_STATE == 42
```

- [ ] **Step 6: Create empty module placeholders so imports succeed**

```bash
for f in src/exoproximo/features/spectra.py src/exoproximo/features/orbits.py \
         src/exoproximo/ml/cluster.py src/exoproximo/ml/anomaly.py src/exoproximo/ml/classify.py \
         src/exoproximo/pipelines/fetch.py src/exoproximo/pipelines/neo_spectra.py \
         src/exoproximo/pipelines/neo_orbits.py src/exoproximo/pipelines/koi.py \
         src/exoproximo/io.py src/exoproximo/cli.py; do
  echo '"""placeholder"""' > "$f"
done
```

- [ ] **Step 7: Run the import test**

```bash
uv run pytest tests/test_imports.py -v
```

Expected: 1 passed.

- [ ] **Step 8: Commit**

```bash
git add src/ tests/__init__.py tests/conftest.py tests/test_imports.py
git commit -m "feat: scaffold exoproximo package + import smoke test"
```

---

## Task 4: `io.py` — SQLite connection + `write_df` + `read_df`

**Files:**
- Modify: `src/exoproximo/io.py`
- Create: `tests/test_io.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_io.py`:

```python
from __future__ import annotations

import pandas as pd

from exoproximo import io


def test_get_conn_enables_fks(tmp_db):
    conn = io.get_conn(tmp_db)
    cur = conn.execute("PRAGMA foreign_keys")
    assert cur.fetchone()[0] == 1
    conn.close()


def test_write_and_read_df_roundtrip(tmp_db):
    df = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    conn = io.get_conn(tmp_db)
    io.write_df(df, "demo", conn=conn, mode="replace")
    out = io.read_df("SELECT * FROM demo ORDER BY a", conn=conn)
    conn.close()
    pd.testing.assert_frame_equal(out.reset_index(drop=True), df)


def test_write_df_upsert(tmp_db):
    conn = io.get_conn(tmp_db)
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v REAL)")
    io.write_df(pd.DataFrame({"id": [1, 2], "v": [10.0, 20.0]}), "t", conn=conn, mode="upsert", pk=["id"])
    io.write_df(pd.DataFrame({"id": [2, 3], "v": [99.0, 30.0]}), "t", conn=conn, mode="upsert", pk=["id"])
    out = io.read_df("SELECT * FROM t ORDER BY id", conn=conn)
    conn.close()
    assert out["v"].tolist() == [10.0, 99.0, 30.0]
```

- [ ] **Step 2: Run and verify failure**

```bash
uv run pytest tests/test_io.py -v
```

Expected: 3 failures (`AttributeError: module 'exoproximo.io' has no attribute 'get_conn'`).

- [ ] **Step 3: Implement `io.py`**

Replace `src/exoproximo/io.py`:

```python
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
```

- [ ] **Step 4: Run tests, verify pass**

```bash
uv run pytest tests/test_io.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/io.py tests/test_io.py
git commit -m "feat(io): SQLite helpers (get_conn, write_df, read_df) with FK pragma and upsert"
```

---

## Task 5: `io.py` — `init_db()` schema bootstrap + model save/load

**Files:**
- Modify: `src/exoproximo/io.py`
- Modify: `tests/test_io.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_io.py`:

```python
def test_init_db_creates_all_tables(tmp_db):
    conn = io.get_conn(tmp_db)
    io.init_db(conn)
    tables = pd.read_sql_query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", conn
    )["name"].tolist()
    conn.close()
    expected = {
        "neo_asteroids", "neo_spectra_observations", "neo_spectra_features",
        "neo_spectra_points", "neo_orbit_elements", "neo_physical",
        "neo_close_approaches", "neo_ephemerides",
        "koi_objects", "koi_predictions", "meta_runs",
    }
    assert expected.issubset(set(tables))


def test_save_and_load_model_roundtrip(tmp_path):
    obj = {"a": 1, "b": [2, 3]}
    p = io.save_model(obj, "demo", models_dir=tmp_path)
    assert p.exists()
    out = io.load_model("demo", models_dir=tmp_path)
    assert out == obj
```

- [ ] **Step 2: Run and verify failure**

```bash
uv run pytest tests/test_io.py::test_init_db_creates_all_tables tests/test_io.py::test_save_and_load_model_roundtrip -v
```

Expected: 2 failures (`init_db` missing for the first; `save_model` / `load_model` already exist so that test passes — adjust expectation: only 1 failure for `init_db`).

- [ ] **Step 3: Add `init_db()` to `io.py`**

Append to `src/exoproximo/io.py`:

```python
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
```

- [ ] **Step 4: Run all io tests**

```bash
uv run pytest tests/test_io.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/io.py tests/test_io.py
git commit -m "feat(io): init_db() creates full SQLite schema; tests confirm round-trip + model save/load"
```

---

## Task 6: `features/spectra.py` — `normalize_reflectance`

**Files:**
- Modify: `src/exoproximo/features/spectra.py`
- Create: `tests/test_features_spectra.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_features_spectra.py`:

```python
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from exoproximo.features import spectra


def linear_spectrum(slope: float = 0.5, intercept: float = 0.5, n: int = 100) -> pd.DataFrame:
    wl = np.linspace(0.4, 2.5, n)
    refl = intercept + slope * wl
    err = np.full_like(wl, 0.01)
    return pd.DataFrame({"wavelength": wl, "reflectance": refl, "error": err})


def test_normalize_reflectance_at_anchor():
    df = linear_spectrum()
    out = spectra.normalize_reflectance(df, anchor_um=0.55)
    # At 0.55 µm, normalized reflectance must equal 1.0 (within interp tolerance)
    idx = (out["wavelength"] - 0.55).abs().idxmin()
    assert out.loc[idx, "reflectance"] == pytest.approx(1.0, abs=0.02)
```

- [ ] **Step 2: Run and verify failure**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: failure (`AttributeError: module 'exoproximo.features.spectra' has no attribute 'normalize_reflectance'`).

- [ ] **Step 3: Implement**

Replace `src/exoproximo/features/spectra.py`:

```python
"""Pure spectral feature functions.

Inputs are tidy DataFrames with columns: wavelength (µm), reflectance, error.
No filesystem access. No prints. No randomness.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from exoproximo import config


def normalize_reflectance(df: pd.DataFrame, anchor_um: float = config.ANCHOR_WAVELENGTH_UM) -> pd.DataFrame:
    """Divide reflectance and error by the interpolated reflectance at anchor_um."""
    wl = df["wavelength"].to_numpy()
    refl = df["reflectance"].to_numpy()
    if anchor_um < wl.min() or anchor_um > wl.max():
        raise ValueError(
            f"anchor {anchor_um} µm outside spectrum range "
            f"[{wl.min():.3f}, {wl.max():.3f}]"
        )
    r_anchor = float(np.interp(anchor_um, wl, refl))
    if r_anchor == 0:
        raise ValueError("reflectance at anchor is zero; cannot normalize")
    out = df.copy()
    out["reflectance"] = refl / r_anchor
    out["error"] = out["error"].to_numpy() / r_anchor
    return out
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/features/spectra.py tests/test_features_spectra.py
git commit -m "feat(features): normalize_reflectance with anchor-wavelength division"
```

---

## Task 7: `features/spectra.py` — `slope_vis` + `slope_nir`

**Files:**
- Modify: `src/exoproximo/features/spectra.py`
- Modify: `tests/test_features_spectra.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_features_spectra.py`:

```python
def test_slope_vis_recovers_linear_slope():
    df = linear_spectrum(slope=0.30, intercept=0.40)
    df = spectra.normalize_reflectance(df, anchor_um=0.55)
    s = spectra.slope_vis(df)
    # The slope of normalized reflectance vs wavelength over 0.45-0.70 µm
    # is approximately (raw_slope) / (intercept + raw_slope * 0.55) for small ranges
    expected = 0.30 / (0.40 + 0.30 * 0.55)
    assert s == pytest.approx(expected, rel=0.05)


def test_slope_nir_returns_finite_for_full_coverage():
    df = linear_spectrum(slope=0.10, intercept=0.50, n=200)
    df = spectra.normalize_reflectance(df, anchor_um=0.55)
    s = spectra.slope_nir(df)
    assert np.isfinite(s)


def test_slope_returns_nan_when_range_not_covered():
    # Spectrum only spans 0.4-0.6 µm; can't compute NIR slope
    wl = np.linspace(0.4, 0.6, 20)
    df = pd.DataFrame({"wavelength": wl, "reflectance": np.ones_like(wl), "error": np.full_like(wl, 0.01)})
    s = spectra.slope_nir(df)
    assert np.isnan(s)
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: 3 failures.

- [ ] **Step 3: Implement**

Append to `src/exoproximo/features/spectra.py`:

```python
def _linear_slope(df: pd.DataFrame, wmin: float, wmax: float) -> float:
    mask = (df["wavelength"] >= wmin) & (df["wavelength"] <= wmax)
    if mask.sum() < 3:
        return float("nan")
    wl = df.loc[mask, "wavelength"].to_numpy()
    refl = df.loc[mask, "reflectance"].to_numpy()
    slope, _ = np.polyfit(wl, refl, 1)
    return float(slope)


def slope_vis(df: pd.DataFrame) -> float:
    """Visible-range slope (0.45–0.70 µm) on (already-normalized) reflectance."""
    return _linear_slope(df, *config.VIS_SLOPE_RANGE_UM)


def slope_nir(df: pd.DataFrame) -> float:
    """Near-infrared slope (0.85–2.4 µm) on (already-normalized) reflectance."""
    return _linear_slope(df, *config.NIR_SLOPE_RANGE_UM)
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/features/spectra.py tests/test_features_spectra.py
git commit -m "feat(features): slope_vis and slope_nir via linear fit over wavelength windows"
```

---

## Task 8: `features/spectra.py` — band depth + center (1 µm and 2 µm)

**Files:**
- Modify: `src/exoproximo/features/spectra.py`
- Modify: `tests/test_features_spectra.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_features_spectra.py`:

```python
def gaussian_band_spectrum(
    band_center_um: float, band_depth: float, band_width_um: float = 0.2, n: int = 400
) -> pd.DataFrame:
    """Linear continuum (slope=0) at reflectance=1.0 with an absorption band subtracted."""
    wl = np.linspace(0.4, 2.5, n)
    continuum = np.ones_like(wl)
    band = band_depth * np.exp(-((wl - band_center_um) ** 2) / (2 * (band_width_um / 2.355) ** 2))
    refl = continuum - band
    err = np.full_like(wl, 0.005)
    return pd.DataFrame({"wavelength": wl, "reflectance": refl, "error": err})


def test_band_1um_recovers_synthetic_band():
    df = gaussian_band_spectrum(band_center_um=1.05, band_depth=0.20)
    df = spectra.normalize_reflectance(df, anchor_um=0.55)
    depth = spectra.band_depth_1um(df)
    center = spectra.band_center_1um(df)
    assert depth == pytest.approx(0.20, abs=0.04)
    assert center == pytest.approx(1.05, abs=0.05)


def test_band_2um_recovers_synthetic_band():
    df = gaussian_band_spectrum(band_center_um=1.95, band_depth=0.15)
    df = spectra.normalize_reflectance(df, anchor_um=0.55)
    depth = spectra.band_depth_2um(df)
    center = spectra.band_center_2um(df)
    assert depth == pytest.approx(0.15, abs=0.04)
    assert center == pytest.approx(1.95, abs=0.05)


def test_band_returns_nan_when_range_not_covered():
    wl = np.linspace(0.4, 0.6, 20)
    df = pd.DataFrame({"wavelength": wl, "reflectance": np.ones_like(wl), "error": np.full_like(wl, 0.01)})
    assert np.isnan(spectra.band_depth_1um(df))
    assert np.isnan(spectra.band_center_1um(df))
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: 3 failures.

- [ ] **Step 3: Implement**

Append to `src/exoproximo/features/spectra.py`:

```python
def _band_features(df: pd.DataFrame, wmin: float, wmax: float) -> tuple[float, float]:
    """Return (band_depth, band_center) for the absorption band in [wmin, wmax].

    Continuum is the straight line connecting the band endpoints. Band depth is
    1 - (min_reflectance / continuum_at_min). Band center is the wavelength at
    the minimum of the continuum-removed spectrum.
    """
    mask = (df["wavelength"] >= wmin) & (df["wavelength"] <= wmax)
    if mask.sum() < 5:
        return float("nan"), float("nan")
    wl = df.loc[mask, "wavelength"].to_numpy()
    refl = df.loc[mask, "reflectance"].to_numpy()
    # Endpoints: averages of first and last 3 points for noise robustness
    r_left = float(np.mean(refl[:3]))
    r_right = float(np.mean(refl[-3:]))
    wl_left = float(np.mean(wl[:3]))
    wl_right = float(np.mean(wl[-3:]))
    # Continuum at each wl point
    cont = r_left + (r_right - r_left) * (wl - wl_left) / (wl_right - wl_left)
    ratio = refl / cont
    idx_min = int(np.argmin(ratio))
    band_depth = 1.0 - float(ratio[idx_min])
    band_center = float(wl[idx_min])
    return band_depth, band_center


def band_depth_1um(df: pd.DataFrame) -> float:
    return _band_features(df, *config.BAND_1UM_RANGE)[0]


def band_center_1um(df: pd.DataFrame) -> float:
    return _band_features(df, *config.BAND_1UM_RANGE)[1]


def band_depth_2um(df: pd.DataFrame) -> float:
    return _band_features(df, *config.BAND_2UM_RANGE)[0]


def band_center_2um(df: pd.DataFrame) -> float:
    return _band_features(df, *config.BAND_2UM_RANGE)[1]
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/features/spectra.py tests/test_features_spectra.py
git commit -m "feat(features): band_depth/band_center for 1µm and 2µm absorption bands"
```

---

## Task 9: `features/spectra.py` — `load_spectra_dir` (filesystem reader, used by pipeline)

**Files:**
- Modify: `src/exoproximo/features/spectra.py`
- Modify: `tests/test_features_spectra.py`

- [ ] **Step 1: Add failing test**

Append to `tests/test_features_spectra.py`:

```python
def test_load_spectra_dir_reads_csv_files(tmp_path):
    src_dir = tmp_path / "src_dir"
    src_dir.mkdir()
    # MITHNEOS-style filename: "<asteroid_id>_<obsdate>.csv"
    (src_dir / "433_20100101.csv").write_text(
        "0.45,0.95,0.01\n0.55,1.00,0.01\n0.70,1.05,0.01\n1.00,1.10,0.01\n2.00,1.20,0.01\n"
    )
    (src_dir / "2062_20150206.csv").write_text(
        "0.50,0.97,0.01\n0.55,1.00,0.01\n0.80,1.05,0.01\n1.00,1.07,0.01\n2.20,1.18,0.01\n"
    )
    df = spectra.load_spectra_dir(src_dir, source="marsset")
    assert set(df["designation"].unique()) == {"433", "2062"}
    assert (df["source"] == "marsset").all()
    assert set(df.columns) >= {"designation", "obs_date", "source", "file_path", "wavelength", "reflectance", "error"}
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_features_spectra.py::test_load_spectra_dir_reads_csv_files -v
```

Expected: failure.

- [ ] **Step 3: Implement**

Append to `src/exoproximo/features/spectra.py`:

```python
from pathlib import Path  # add at top of file if not already imported


def load_spectra_dir(dir_path: Path, source: str) -> pd.DataFrame:
    """Read all *.csv files in dir_path and return one long DataFrame.

    Filename convention: '<designation>_<YYYYMMDD>.csv' with three unnamed columns:
    wavelength (µm), reflectance, error.
    """
    rows = []
    for csv_path in sorted(Path(dir_path).glob("*.csv")):
        stem = csv_path.stem
        if "_" not in stem:
            continue
        designation, obs_date_raw = stem.split("_", 1)
        try:
            obs_date = pd.to_datetime(obs_date_raw, format="%Y%m%d").date().isoformat()
        except ValueError:
            obs_date = None
        df = pd.read_csv(csv_path, header=None, names=["wavelength", "reflectance", "error"])
        df["designation"] = designation
        df["obs_date"] = obs_date
        df["source"] = source
        df["file_path"] = str(csv_path)
        rows.append(df)
    if not rows:
        return pd.DataFrame(
            columns=["designation", "obs_date", "source", "file_path", "wavelength", "reflectance", "error"]
        )
    return pd.concat(rows, ignore_index=True)
```

- [ ] **Step 4: Verify the `from pathlib import Path` is at the top of the file**

Open `src/exoproximo/features/spectra.py` and ensure the imports block at top reads:

```python
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from exoproximo import config
```

- [ ] **Step 5: Run all spectra tests**

```bash
uv run pytest tests/test_features_spectra.py -v
```

Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add src/exoproximo/features/spectra.py tests/test_features_spectra.py
git commit -m "feat(features): load_spectra_dir parses MITHNEOS-style CSVs into tidy DataFrame"
```

---

## Task 10: `ml/cluster.py` — PCA + UMAP + HDBSCAN

**Files:**
- Modify: `src/exoproximo/ml/cluster.py`
- Create: `tests/test_ml_cluster.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_ml_cluster.py`:

```python
from __future__ import annotations

import numpy as np
import pytest

from exoproximo.ml import cluster


@pytest.fixture
def blobs():
    rng = np.random.default_rng(0)
    a = rng.normal(loc=(0, 0, 0), scale=0.1, size=(40, 3))
    b = rng.normal(loc=(5, 5, 5), scale=0.1, size=(40, 3))
    c = rng.normal(loc=(-5, 5, -5), scale=0.1, size=(40, 3))
    return np.vstack([a, b, c])


def test_fit_pca_returns_model_and_3d_coords(blobs):
    model, coords = cluster.fit_pca(blobs, n_components=3)
    assert coords.shape == (120, 3)
    assert hasattr(model, "explained_variance_ratio_")


def test_fit_umap_returns_2d(blobs):
    model, emb = cluster.fit_umap(blobs)
    assert emb.shape == (120, 2)


def test_fit_hdbscan_finds_three_clusters(blobs):
    model, labels, probs = cluster.fit_hdbscan(blobs, min_cluster_size=10)
    non_noise = labels[labels >= 0]
    assert len(set(non_noise.tolist())) == 3
    assert probs.shape == (120,)
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_ml_cluster.py -v
```

Expected: 3 failures.

- [ ] **Step 3: Implement**

Replace `src/exoproximo/ml/cluster.py`:

```python
"""Clustering / dimensionality reduction. Pure functions; no I/O."""
from __future__ import annotations

import hdbscan
import numpy as np
import umap
from sklearn.decomposition import PCA

from exoproximo import config


def fit_pca(X: np.ndarray, n_components: int = 3) -> tuple[PCA, np.ndarray]:
    model = PCA(n_components=n_components, random_state=config.RANDOM_STATE)
    coords = model.fit_transform(X)
    return model, coords


def fit_umap(
    X: np.ndarray,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    n_components: int = 2,
) -> tuple["umap.UMAP", np.ndarray]:
    model = umap.UMAP(
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        n_components=n_components,
        random_state=config.RANDOM_STATE,
    )
    emb = model.fit_transform(X)
    return model, emb


def fit_hdbscan(
    X: np.ndarray,
    min_cluster_size: int = 5,
    min_samples: int = 3,
) -> tuple["hdbscan.HDBSCAN", np.ndarray, np.ndarray]:
    model = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, min_samples=min_samples)
    labels = model.fit_predict(X)
    return model, labels, model.probabilities_
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_ml_cluster.py -v
```

Expected: 3 passed (UMAP may emit a numba warning; that's fine).

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/ml/cluster.py tests/test_ml_cluster.py
git commit -m "feat(ml): fit_pca / fit_umap / fit_hdbscan wrappers seeded from config.RANDOM_STATE"
```

---

## Task 11: `ml/anomaly.py` — IsolationForest

**Files:**
- Modify: `src/exoproximo/ml/anomaly.py`
- Create: `tests/test_ml_anomaly.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_ml_anomaly.py`:

```python
from __future__ import annotations

import numpy as np

from exoproximo.ml import anomaly


def test_isolation_forest_flags_outliers():
    rng = np.random.default_rng(0)
    inliers = rng.normal(size=(200, 4))
    outliers = rng.normal(loc=8, scale=0.5, size=(20, 4))
    X = np.vstack([inliers, outliers])
    model, scores, is_anom = anomaly.fit_isolation_forest(X, contamination=0.1)
    assert scores.shape == (220,)
    assert is_anom.shape == (220,)
    # Outliers (last 20 rows) should have a high anomaly rate
    assert is_anom[-20:].sum() >= 15
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_ml_anomaly.py -v
```

Expected: failure.

- [ ] **Step 3: Implement**

Replace `src/exoproximo/ml/anomaly.py`:

```python
"""Anomaly detection via IsolationForest."""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest

from exoproximo import config


def fit_isolation_forest(
    X: np.ndarray,
    contamination: float | str = "auto",
) -> tuple[IsolationForest, np.ndarray, np.ndarray]:
    """Returns (model, anomaly_scores_higher_is_more_anomalous, is_anomaly_int_array)."""
    model = IsolationForest(
        contamination=contamination,
        random_state=config.RANDOM_STATE,
    )
    model.fit(X)
    # decision_function: higher = more normal. Flip sign so higher = more anomalous.
    scores = -model.decision_function(X)
    is_anomaly = (model.predict(X) == -1).astype(int)
    return model, scores, is_anomaly
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_ml_anomaly.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/ml/anomaly.py tests/test_ml_anomaly.py
git commit -m "feat(ml): fit_isolation_forest with seeded random_state and signed scores"
```

---

## Task 12: `ml/classify.py` — `train_classifier` + leakage guard + CV

**Files:**
- Modify: `src/exoproximo/ml/classify.py`
- Create: `tests/test_ml_classify.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_ml_classify.py`:

```python
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import make_classification

from exoproximo.ml import classify


def _toy_problem(n=400, leakage=False):
    X, y = make_classification(n_samples=n, n_features=8, n_informative=5, random_state=0)
    cols = [f"f{i}" for i in range(8)]
    df = pd.DataFrame(X, columns=cols)
    if leakage:
        df["koi_score"] = y.astype(float)  # explicit forbidden column
    return df, pd.Series(y, name="label")


def test_train_classifier_rf_returns_sane_cv():
    X, y = _toy_problem()
    res = classify.train_classifier(X, y, kind="rf", cv=3)
    assert "model" in res
    assert "cv_scores" in res
    assert "test_metrics" in res
    assert res["test_metrics"]["roc_auc"] > 0.85


def test_train_classifier_hgb_returns_sane_cv():
    X, y = _toy_problem()
    res = classify.train_classifier(X, y, kind="hgb", cv=3)
    assert res["test_metrics"]["roc_auc"] > 0.85


def test_train_classifier_rejects_forbidden_columns():
    X, y = _toy_problem(leakage=True)
    with pytest.raises(ValueError, match="forbidden"):
        classify.train_classifier(X, y, kind="rf", cv=3)


def test_assert_no_leakage_passes_for_clean_columns():
    classify.assert_no_leakage(["koi_period", "koi_depth", "koi_steff"])


def test_assert_no_leakage_raises_for_forbidden():
    with pytest.raises(ValueError, match="forbidden"):
        classify.assert_no_leakage(["koi_period", "koi_score"])
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_ml_classify.py -v
```

Expected: 5 failures.

- [ ] **Step 3: Implement**

Replace `src/exoproximo/ml/classify.py`:

```python
"""Supervised classification (RF + HGB) with CV, held-out test, and leakage guard."""
from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, roc_auc_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split

from exoproximo import config


def assert_no_leakage(columns: Iterable[str]) -> None:
    bad = [
        c for c in columns
        if any(c.startswith(p) for p in config.KOI_FORBIDDEN_FEATURE_PREFIXES)
    ]
    if bad:
        raise ValueError(f"forbidden (leakage-prone) columns in X: {bad}")


def _rf_with_grid() -> GridSearchCV:
    rf = RandomForestClassifier(random_state=config.RANDOM_STATE, n_jobs=-1)
    grid = {
        "n_estimators": [200, 400],
        "max_depth": [None, 10, 20],
        "min_samples_leaf": [1, 5],
    }
    return GridSearchCV(rf, grid, scoring="roc_auc", cv=3, n_jobs=-1)


def _hgb() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(random_state=config.RANDOM_STATE)


def train_classifier(
    X: pd.DataFrame,
    y: pd.Series,
    *,
    kind: str = "rf",
    cv: int = 5,
    test_size: float = 0.2,
) -> dict:
    """Train a binary classifier with stratified holdout + CV.

    Returns a dict with keys: model, cv_scores, test_metrics, feature_importance.
    Calls assert_no_leakage on X.columns and raises if any forbidden column is present.
    """
    assert_no_leakage(X.columns)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=test_size, stratify=y, random_state=config.RANDOM_STATE
    )

    if kind == "rf":
        estimator = _rf_with_grid()
    elif kind == "hgb":
        estimator = _hgb()
    else:
        raise ValueError(f"unknown kind: {kind}")

    skf = StratifiedKFold(n_splits=cv, shuffle=True, random_state=config.RANDOM_STATE)
    auc_scores, acc_scores, f1_scores = [], [], []
    for fold, (tr_idx, va_idx) in enumerate(skf.split(X_tr, y_tr)):
        X_fold_tr, X_fold_va = X_tr.iloc[tr_idx], X_tr.iloc[va_idx]
        y_fold_tr, y_fold_va = y_tr.iloc[tr_idx], y_tr.iloc[va_idx]
        clone = _rf_with_grid() if kind == "rf" else _hgb()
        clone.fit(X_fold_tr, y_fold_tr)
        proba = clone.predict_proba(X_fold_va)[:, 1]
        pred = (proba >= 0.5).astype(int)
        auc_scores.append(roc_auc_score(y_fold_va, proba))
        acc_scores.append(accuracy_score(y_fold_va, pred))
        f1_scores.append(f1_score(y_fold_va, pred))

    estimator.fit(X_tr, y_tr)
    # Unwrap GridSearchCV
    fitted = estimator.best_estimator_ if hasattr(estimator, "best_estimator_") else estimator

    proba_te = fitted.predict_proba(X_te)[:, 1]
    pred_te = (proba_te >= 0.5).astype(int)
    test_metrics = {
        "roc_auc": float(roc_auc_score(y_te, proba_te)),
        "accuracy": float(accuracy_score(y_te, pred_te)),
        "f1": float(f1_score(y_te, pred_te)),
        "brier": float(brier_score_loss(y_te, proba_te)),
    }

    if hasattr(fitted, "feature_importances_"):
        fi = dict(zip(X.columns, fitted.feature_importances_.tolist()))
    else:
        fi = {}

    return {
        "model": fitted,
        "cv_scores": {
            "roc_auc": {"mean": float(np.mean(auc_scores)), "std": float(np.std(auc_scores))},
            "accuracy": {"mean": float(np.mean(acc_scores)), "std": float(np.std(acc_scores))},
            "f1": {"mean": float(np.mean(f1_scores)), "std": float(np.std(f1_scores))},
        },
        "test_metrics": test_metrics,
        "feature_importance": fi,
        "test_indices": X_te.index.tolist(),
    }
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_ml_classify.py -v
```

Expected: 5 passed (RF test may take ~20s due to GridSearch — that's fine).

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/ml/classify.py tests/test_ml_classify.py
git commit -m "feat(ml): train_classifier (RF+grid / HGB) with leakage guard and held-out test"
```

---

## Task 13: `pipelines/fetch.py` — KOI TAP fetch (mocked)

**Files:**
- Modify: `src/exoproximo/pipelines/fetch.py`
- Create: `tests/test_pipeline_fetch.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_pipeline_fetch.py`:

```python
from __future__ import annotations

import io as stdio
from pathlib import Path

import pandas as pd
import pytest

from exoproximo.pipelines import fetch


CSV_FIXTURE = """kepoi_name,kepler_name,koi_disposition,koi_period,koi_steff
K00001.01,Kepler-1 b,CONFIRMED,2.47,5455
K00002.01,Kepler-2 b,CONFIRMED,2.20,6350
K00003.01,Kepler-3 b,FALSE POSITIVE,4.88,4769
"""


def test_fetch_koi_writes_parquet(tmp_path: Path, httpx_mock):
    httpx_mock.add_response(
        url=fetch.KOI_TAP_URL_TEMPLATE.format(query=fetch.KOI_QUERY).replace(" ", "+"),
        text=CSV_FIXTURE,
        status_code=200,
    )
    out = fetch.fetch_koi(out_path=tmp_path / "koi.parquet", http_client=fetch._make_httpx_client())
    df = pd.read_parquet(out)
    assert len(df) == 3
    assert "kepoi_name" in df.columns


def test_fetch_koi_skips_when_exists(tmp_path: Path, httpx_mock):
    p = tmp_path / "koi.parquet"
    pd.DataFrame({"kepoi_name": ["K00001.01"]}).to_parquet(p)
    out = fetch.fetch_koi(out_path=p, refresh=False, http_client=fetch._make_httpx_client())
    assert out == p
    # No HTTP call should have been made
    assert len(httpx_mock.get_requests()) == 0
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_pipeline_fetch.py -v
```

Expected: failure (`fetch.fetch_koi` undefined).

- [ ] **Step 3: Implement**

Replace `src/exoproximo/pipelines/fetch.py`:

```python
"""Bootstrap data fetching: KOI cumulative table + (optional) MITHNEOS verification."""
from __future__ import annotations

import io as stdio
import logging
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd

from exoproximo import config

log = logging.getLogger(__name__)

KOI_TAP_URL_TEMPLATE = (
    "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query={query}&format=csv"
)
KOI_QUERY = "SELECT * FROM cumulative"


def _make_httpx_client(timeout: float = 60.0) -> httpx.Client:
    return httpx.Client(timeout=timeout, follow_redirects=True)


def fetch_koi(
    out_path: Optional[Path] = None,
    *,
    refresh: bool = False,
    http_client: Optional[httpx.Client] = None,
) -> Path:
    out = Path(out_path) if out_path is not None else config.KOI_RAW_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not refresh:
        log.info("koi parquet already exists at %s; skipping (use refresh=True to force)", out)
        return out

    client = http_client if http_client is not None else _make_httpx_client()
    url = KOI_TAP_URL_TEMPLATE.format(query=KOI_QUERY).replace(" ", "+")
    log.info("fetching KOI cumulative table from NASA Exoplanet Archive...")
    r = client.get(url)
    r.raise_for_status()
    df = pd.read_csv(stdio.StringIO(r.text))
    df.to_parquet(out, index=False)
    log.info("wrote %d rows to %s", len(df), out)
    return out


def verify_mithneos(dir_path: Optional[Path] = None) -> bool:
    p = Path(dir_path) if dir_path is not None else config.MITHNEOS_DIR
    if not p.exists():
        log.warning("MITHNEOS dir not found at %s", p)
        return False
    has_marsset = (p / "marsset2022").exists()
    has_binzel = (p / "binzel2019").exists()
    ok = has_marsset and has_binzel
    log.info("MITHNEOS verification: marsset=%s binzel=%s", has_marsset, has_binzel)
    return ok


def run(*, refresh_koi: bool = False) -> dict:
    """High-level fetch: verify MITHNEOS, fetch KOI if absent."""
    mithneos_ok = verify_mithneos()
    if not mithneos_ok:
        log.error(
            "MITHNEOS bundle missing. Download manually from "
            "https://sbnarchive.psi.edu/pds4/non_mission/gbo.ast.mithneos.spectra_2000-2021_V1_0/ "
            "into data/MITHNEOS/"
        )
    koi_path = fetch_koi(refresh=refresh_koi)
    return {"mithneos_ok": mithneos_ok, "koi_path": str(koi_path)}
```

Note: this design defers the recursive MITHNEOS download to a manual step. If the bundle is missing, we log an actionable error. (The spec said the bootstrap script should download; we softened it because PSI's directory listings are HTML and crawling is best done manually with `wget -r` if needed. We can revisit if a contributor wants `fetch_mithneos` automated.)

- [ ] **Step 4: Write `scripts/bootstrap_data.py`**

```python
"""CLI entry point for bootstrap fetching."""
from __future__ import annotations

import argparse
import logging

from exoproximo.pipelines import fetch


def main() -> None:
    ap = argparse.ArgumentParser(description="Bootstrap exoproximo data")
    ap.add_argument("--refresh-koi", action="store_true", help="re-download KOI cumulative table")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = fetch.run(refresh_koi=args.refresh_koi)
    print(result)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run, verify pass**

```bash
uv run pytest tests/test_pipeline_fetch.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/exoproximo/pipelines/fetch.py scripts/bootstrap_data.py tests/test_pipeline_fetch.py
git commit -m "feat(pipelines): fetch_koi via TAP + MITHNEOS verification (manual download for v1)"
```

---

## Task 14: `pipelines/neo_spectra.py` — full pipeline + smoke test

**Files:**
- Create: `tests/fixtures/spectra/binzel2019/`, `tests/fixtures/spectra/marsset2022/`
- Modify: `src/exoproximo/pipelines/neo_spectra.py`
- Create: `tests/test_pipeline_neo_spectra.py`

**Deviation from spec note:** the spec mentions loading `observationalparameters_marsset.csv` / `observationalparameters_binzel.csv` and fixing the Binzel-filename bug. This plan derives `designation` and `obs_date` directly from the spectra CSV *filenames* (which encode `{designation}_{YYYYMMDD}.csv`), so the observational-parameter CSVs are not read. The Binzel filename bug is therefore moot here; if richer metadata (asteroid name, telescope, observer) is wanted later, add a `load_metadata(marsset_csv, binzel_csv)` function and merge into `neo_asteroids.name`. Tracked as a v2 follow-up.

- [ ] **Step 1: Create fixture spectra files**

Run this to materialize 8 fixture CSVs (4 per source) with realistic shapes:

```bash
mkdir -p tests/fixtures/spectra/binzel2019 tests/fixtures/spectra/marsset2022
uv run python - <<'PY'
import numpy as np
from pathlib import Path
np.random.seed(0)
def make_spec(slope, band1_depth, band1_center, band2_depth, path):
    wl = np.linspace(0.45, 2.40, 80)
    cont = 1.0 + slope * (wl - 0.55)
    band1 = band1_depth * np.exp(-((wl - band1_center) ** 2) / (2 * 0.08 ** 2))
    band2 = band2_depth * np.exp(-((wl - 1.95) ** 2) / (2 * 0.12 ** 2))
    refl = cont - band1 - band2 + np.random.normal(scale=0.005, size=wl.shape)
    err = np.full_like(wl, 0.01)
    np.savetxt(path, np.column_stack([wl, refl, err]), delimiter=",", fmt="%.4f")

base = Path("tests/fixtures/spectra")
make_spec(0.10, 0.15, 1.00, 0.10, base / "binzel2019" / "433_20100101.csv")
make_spec(0.40, 0.05, 1.05, 0.03, base / "binzel2019" / "1862_20110115.csv")
make_spec(0.05, 0.20, 0.95, 0.18, base / "binzel2019" / "1620_20120220.csv")
make_spec(0.50, 0.02, 1.10, 0.02, base / "binzel2019" / "2062_20130301.csv")
make_spec(0.12, 0.16, 1.02, 0.11, base / "marsset2022" / "433_20200101.csv")
make_spec(0.15, 0.18, 1.01, 0.13, base / "marsset2022" / "1036_20210202.csv")
make_spec(0.08, 0.22, 0.97, 0.19, base / "marsset2022" / "1685_20220303.csv")
make_spec(0.30, 0.10, 1.05, 0.05, base / "marsset2022" / "3200_20230404.csv")
print("ok")
PY
```

Expected: prints `ok` and 8 CSVs are created.

- [ ] **Step 2: Write failing smoke test**

Create `tests/test_pipeline_neo_spectra.py`:

```python
from __future__ import annotations

from pathlib import Path

import pandas as pd

from exoproximo import io
from exoproximo.pipelines import neo_spectra


FIXTURES = Path(__file__).parent / "fixtures" / "spectra"


def test_neo_spectra_pipeline_smoke(tmp_outputs):
    neo_spectra.run(
        binzel_dir=FIXTURES / "binzel2019",
        marsset_dir=FIXTURES / "marsset2022",
        write_points=True,
    )
    conn = io.get_conn()
    asteroids = io.read_df("SELECT * FROM neo_asteroids", conn=conn)
    obs = io.read_df("SELECT * FROM neo_spectra_observations", conn=conn)
    feats = io.read_df("SELECT * FROM neo_spectra_features", conn=conn)
    pts = io.read_df("SELECT COUNT(*) AS n FROM neo_spectra_points", conn=conn)
    runs = io.read_df("SELECT * FROM meta_runs", conn=conn)
    conn.close()

    assert len(asteroids) >= 6  # 8 observations, some asteroids appear twice
    assert len(obs) == 8
    assert len(feats) == 8
    assert pts["n"].iloc[0] > 100  # 80 points per obs × 8 obs
    assert feats[["slope_vis", "slope_nir", "band_depth_1um"]].notna().all().all()
    assert len(runs) == 1
    assert runs["status"].iloc[0] == "ok"
```

- [ ] **Step 3: Run, verify failure**

```bash
uv run pytest tests/test_pipeline_neo_spectra.py -v
```

Expected: failure.

- [ ] **Step 4: Implement `pipelines/neo_spectra.py`**

Replace `src/exoproximo/pipelines/neo_spectra.py`:

```python
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
```

- [ ] **Step 5: Run, verify pass**

```bash
uv run pytest tests/test_pipeline_neo_spectra.py -v
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/exoproximo/pipelines/neo_spectra.py tests/test_pipeline_neo_spectra.py tests/fixtures/spectra
git commit -m "feat(pipelines): neo_spectra end-to-end (features → PCA/UMAP/HDBSCAN/IsoForest → SQLite)"
```

---

## Task 15: `pipelines/neo_orbits.py` — JPL queries with cache + retry (mocked test)

**Cache design:** every `_fetch_*` call is wrapped in `_cached_fetch(query_type, designation, fn, *args)` which checks `data/raw/jpl_cache/{designation}__{query_type}.json`. Cache hit → deserialize and return without hitting the network. Cache miss → call `fn`, serialize the result, save. `--refresh` invalidates the cache (deletes the file before fetching).

**Files:**
- Modify: `src/exoproximo/pipelines/neo_orbits.py`
- Create: `tests/test_pipeline_neo_orbits.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_pipeline_neo_orbits.py`:

```python
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


def test_neo_orbits_pipeline_uses_mockable_wrappers(seeded_asteroids, monkeypatch):
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


def test_neo_orbits_pipeline_tolerates_single_failure(seeded_asteroids, monkeypatch):
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
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_pipeline_neo_orbits.py -v
```

Expected: 2 failures.

- [ ] **Step 3: Implement**

Replace `src/exoproximo/pipelines/neo_orbits.py`:

```python
"""NEO orbits + physical + ephemerides + close approaches via astroquery.

Module-level `_fetch_*` functions wrap astroquery calls so tests can monkeypatch them.
Per-designation errors are tolerated; the run completes with partial data.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import subprocess
import time
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from exoproximo import config, io

log = logging.getLogger(__name__)

DEFAULT_CADENCE_DAYS = 7
DEFAULT_WINDOW_YEARS = 10
DEFAULT_CA_WINDOW = ("2026-01-01", "2076-01-01")
REQUEST_SLEEP_S = 1.0
MAX_RETRIES = 3
JPL_CACHE_DIR = config.JPL_CACHE_DIR  # rebindable via monkeypatch in tests


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


# ---------- monkeypatchable network wrappers ----------

def _fetch_sbdb(designation: str) -> dict:
    """Query JPL SBDB. Returns dict with 'elements' and 'physical' sub-dicts."""
    from astroquery.jplsbdb import SBDB
    raw = SBDB.query(designation, full_precision=True, phys=True)
    orb = raw.get("orbit", {}).get("elements", {})
    phys = raw.get("phys_par", {})
    def _f(k, src):
        v = src.get(k)
        if hasattr(v, "value"):
            return float(v.value)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None
    return {
        "elements": {
            "a": _f("a", orb), "e": _f("e", orb), "i": _f("i", orb),
            "om": _f("om", orb), "w": _f("w", orb), "ma": _f("ma", orb),
            "epoch": _f("epoch", orb),
        },
        "physical": {
            "h_mag": _f("H", phys),
            "diameter_km": _f("diameter", phys),
            "albedo": _f("albedo", phys),
            "spec_class": phys.get("spec_T") or phys.get("spec_B"),
        },
    }


def _fetch_ephemerides(designation: str, cadence_days: int, window_years: int) -> pd.DataFrame:
    """Query JPL Horizons for heliocentric ecliptic positions. Returns tidy DataFrame."""
    from astroquery.jplhorizons import Horizons
    start = (dt.datetime.utcnow() - dt.timedelta(days=365 * window_years / 2)).strftime("%Y-%m-%d")
    stop = (dt.datetime.utcnow() + dt.timedelta(days=365 * window_years / 2)).strftime("%Y-%m-%d")
    obj = Horizons(id=designation, location="@sun",
                   epochs={"start": start, "stop": stop, "step": f"{cadence_days}d"})
    vec = obj.vectors()
    return pd.DataFrame({
        "t": [str(s) for s in vec["datetime_str"]],
        "x_au": list(vec["x"].astype(float)),
        "y_au": list(vec["y"].astype(float)),
        "z_au": list(vec["z"].astype(float)),
        "vx": list(vec["vx"].astype(float)),
        "vy": list(vec["vy"].astype(float)),
        "vz": list(vec["vz"].astype(float)),
    })


def _fetch_close_approaches(designation: str) -> pd.DataFrame:
    """Query JPL CAD API for Earth close approaches."""
    import httpx
    r = httpx.get(
        "https://ssd-api.jpl.nasa.gov/cad.api",
        params={
            "des": designation,
            "date-min": DEFAULT_CA_WINDOW[0],
            "date-max": DEFAULT_CA_WINDOW[1],
            "body": "Earth",
        },
        timeout=30.0,
    )
    r.raise_for_status()
    data = r.json()
    fields = data.get("fields", [])
    rows = data.get("data", [])
    if not rows:
        return pd.DataFrame(columns=["body", "ca_date", "dist_au", "v_rel_km_s"])
    df = pd.DataFrame(rows, columns=fields)
    return pd.DataFrame({
        "body": ["Earth"] * len(df),
        "ca_date": df["cd"].tolist(),
        "dist_au": df["dist"].astype(float).tolist(),
        "v_rel_km_s": df["v_rel"].astype(float).tolist(),
    })


# ---------- retry + cache helpers ----------

def _with_retry(fn, *args, **kwargs):
    delay = 1.0
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if attempt == MAX_RETRIES:
                raise
            log.warning("attempt %d failed for %s: %s; sleeping %ss", attempt, fn.__name__, e, delay)
            time.sleep(delay)
            delay *= 2


def _cache_path(query_type: str, designation: str) -> Path:
    safe = designation.replace(" ", "_").replace("/", "_")
    return Path(JPL_CACHE_DIR) / f"{safe}__{query_type}.json"


def _cached_fetch(query_type: str, designation: str, fn, *args, refresh: bool = False):
    """Wrap a network fetch with on-disk JSON caching.

    The return value of `fn` must be JSON-serializable (dict, list, or DataFrame).
    DataFrames are stored as a {"__df__": True, "records": [...]} envelope.
    """
    path = _cache_path(query_type, designation)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not refresh:
        with path.open() as f:
            payload = json.load(f)
        if isinstance(payload, dict) and payload.get("__df__"):
            return pd.DataFrame.from_records(payload["records"])
        return payload
    result = _with_retry(fn, designation, *args)
    if isinstance(result, pd.DataFrame):
        payload = {"__df__": True, "records": result.to_dict(orient="records")}
    else:
        payload = result
    with path.open("w") as f:
        json.dump(payload, f, default=str)
    return result


# ---------- pipeline ----------

def run(
    *,
    cadence_days: int = DEFAULT_CADENCE_DAYS,
    window_years: int = DEFAULT_WINDOW_YEARS,
) -> dict:
    started = dt.datetime.utcnow().isoformat()
    conn = io.get_conn()
    io.init_db(conn)
    designations = io.read_df("SELECT designation FROM neo_asteroids ORDER BY designation", conn=conn)["designation"].tolist()
    if not designations:
        conn.close()
        raise RuntimeError("neo_asteroids is empty. Run `exo neo-spectra` first.")

    elements_rows, physical_rows, ca_rows, ephem_frames = [], [], [], []
    errors: dict[str, str] = {}
    now = dt.datetime.utcnow().isoformat()

    for des in designations:
        log.info("orbits: %s", des)
        try:
            sb = _cached_fetch("sbdb", des, _fetch_sbdb)
            elements_rows.append({"designation": des, **sb["elements"], "fetched_at": now})
            physical_rows.append({"designation": des, **sb["physical"], "fetched_at": now})
        except Exception as e:
            errors[des] = f"sbdb: {e}"
            continue

        try:
            eph = _cached_fetch("ephem", des, _fetch_ephemerides, cadence_days, window_years).copy()
            eph.insert(0, "designation", des)
            ephem_frames.append(eph)
        except Exception as e:
            errors[des] = errors.get(des, "") + f"; ephem: {e}"

        try:
            ca = _cached_fetch("ca", des, _fetch_close_approaches).copy()
            ca.insert(0, "designation", des)
            ca["fetched_at"] = now
            ca_rows.append(ca)
        except Exception as e:
            errors[des] = errors.get(des, "") + f"; ca: {e}"

        time.sleep(REQUEST_SLEEP_S)

    if elements_rows:
        io.write_df(pd.DataFrame(elements_rows), "neo_orbit_elements", conn=conn, mode="upsert", pk=["designation"])
    if physical_rows:
        io.write_df(pd.DataFrame(physical_rows), "neo_physical", conn=conn, mode="upsert", pk=["designation"])
    if ephem_frames:
        ephem_all = pd.concat(ephem_frames, ignore_index=True)
        io.write_df(ephem_all, "neo_ephemerides", conn=conn, mode="upsert", pk=["designation", "t"])
    if ca_rows:
        ca_all = pd.concat(ca_rows, ignore_index=True).reset_index(drop=True)
        ca_all.insert(0, "ca_id", range(1, len(ca_all) + 1))
        io.write_df(ca_all, "neo_close_approaches", conn=conn, mode="append")

    rows_written = len(elements_rows) + len(physical_rows) + sum(len(f) for f in ephem_frames) + sum(len(c) for c in ca_rows)
    finished = dt.datetime.utcnow().isoformat()
    params = {
        "cadence_days": cadence_days,
        "window_years": window_years,
        "errors": errors,
        "request_sleep_s": REQUEST_SLEEP_S,
    }
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("neo_orbits", _git_sha(), started, finished, "ok", rows_written, json.dumps(params)),
    )
    conn.commit()
    conn.close()

    return {"n_designations": len(designations), "errors": errors, "rows_written": rows_written}
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_pipeline_neo_orbits.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/pipelines/neo_orbits.py tests/test_pipeline_neo_orbits.py
git commit -m "feat(pipelines): neo_orbits with mockable JPL wrappers, retry, partial-failure tolerance"
```

---

## Task 16: `pipelines/koi.py` — Kepler Object of Interest classifier (smoke test)

**Files:**
- Create: `tests/fixtures/koi_small.parquet` (generated from sklearn)
- Modify: `src/exoproximo/pipelines/koi.py`
- Create: `tests/test_pipeline_koi.py`

- [ ] **Step 1: Generate fixture KOI parquet**

```bash
uv run python - <<'PY'
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.datasets import make_classification

rng = np.random.default_rng(0)
X, y = make_classification(n_samples=300, n_features=12, n_informative=8, class_sep=1.5, random_state=0)
cols = ["koi_period", "koi_duration", "koi_depth", "koi_prad", "koi_teq", "koi_insol",
        "koi_model_snr", "koi_steff", "koi_slogg", "koi_srad", "koi_smass", "koi_smet"]
df = pd.DataFrame(X, columns=cols)
# Scale-shift each col to plausible ranges
df["koi_period"] = np.abs(df["koi_period"]) * 50 + 1
df["koi_duration"] = np.abs(df["koi_duration"]) * 5 + 1
df["koi_depth"] = np.abs(df["koi_depth"]) * 1000 + 10
df["koi_prad"] = np.abs(df["koi_prad"]) * 5 + 0.5
df["koi_teq"] = np.abs(df["koi_teq"]) * 1000 + 200
df["koi_insol"] = np.abs(df["koi_insol"]) * 500 + 1
df["koi_model_snr"] = np.abs(df["koi_model_snr"]) * 30 + 5
df["koi_steff"] = df["koi_steff"] * 500 + 5500
df["koi_slogg"] = df["koi_slogg"] * 0.3 + 4.3
df["koi_srad"] = np.abs(df["koi_srad"]) * 0.5 + 1.0
df["koi_smass"] = np.abs(df["koi_smass"]) * 0.5 + 1.0
df["koi_smet"] = df["koi_smet"] * 0.3
df["koi_disposition"] = np.where(y == 1, "CONFIRMED", "FALSE POSITIVE")
# Add 30 CANDIDATEs with random features in plausible range
cand_idx = rng.choice(df.index, size=30, replace=False)
df.loc[cand_idx, "koi_disposition"] = "CANDIDATE"
df["kepoi_name"] = [f"K{i:05d}.01" for i in range(len(df))]
df["kepler_name"] = None
out = Path("tests/fixtures/koi_small.parquet")
out.parent.mkdir(parents=True, exist_ok=True)
df.to_parquet(out, index=False)
print(f"wrote {len(df)} rows to {out}")
PY
```

Expected: prints `wrote 300 rows to tests/fixtures/koi_small.parquet`.

- [ ] **Step 2: Write failing smoke test**

Create `tests/test_pipeline_koi.py`:

```python
from __future__ import annotations

from pathlib import Path

import pandas as pd

from exoproximo import io
from exoproximo.pipelines import koi


FIXTURE = Path(__file__).parent / "fixtures" / "koi_small.parquet"


def test_koi_pipeline_smoke(tmp_outputs):
    result = koi.run(koi_parquet=FIXTURE)

    conn = io.get_conn()
    objs = io.read_df("SELECT * FROM koi_objects", conn=conn)
    preds = io.read_df("SELECT * FROM koi_predictions", conn=conn)
    runs = io.read_df("SELECT * FROM meta_runs WHERE pipeline='koi'", conn=conn)
    conn.close()

    assert len(objs) == 300
    # Predictions exist only for CANDIDATE rows (30 of them)
    assert len(preds) == 30
    assert runs.iloc[0]["status"] == "ok"
    assert result["test_metrics"]["roc_auc"] > 0.85
    # Calibration PNG should be saved
    assert (tmp_outputs / "koi_calibration.png").exists()
```

- [ ] **Step 3: Run, verify failure**

```bash
uv run pytest tests/test_pipeline_koi.py -v
```

Expected: failure.

- [ ] **Step 4: Implement**

Replace `src/exoproximo/pipelines/koi.py`:

```python
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
```

- [ ] **Step 5: Run, verify pass**

```bash
uv run pytest tests/test_pipeline_koi.py -v
```

Expected: 1 passed (may take ~30s for RF GridSearch).

- [ ] **Step 6: Commit**

```bash
git add src/exoproximo/pipelines/koi.py tests/test_pipeline_koi.py tests/fixtures/koi_small.parquet
git commit -m "feat(pipelines): koi classifier with leakage guard, RF+HGB, candidate predictions"
```

---

## Task 17: `cli.py` — Typer entrypoint wiring all subcommands

**Files:**
- Modify: `src/exoproximo/cli.py`
- Create: `tests/test_cli.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_cli.py`:

```python
from __future__ import annotations

from typer.testing import CliRunner

from exoproximo.cli import app


runner = CliRunner()


def test_cli_help():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "fetch" in result.stdout
    assert "neo-spectra" in result.stdout
    assert "neo-orbits" in result.stdout
    assert "koi" in result.stdout


def test_cli_neo_spectra_help():
    result = runner.invoke(app, ["neo-spectra", "--help"])
    assert result.exit_code == 0
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/test_cli.py -v
```

Expected: failure (`app` doesn't exist or doesn't have subcommands).

- [ ] **Step 3: Implement**

Replace `src/exoproximo/cli.py`:

```python
"""The `exo` CLI. One subcommand per pipeline."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import typer

from exoproximo.pipelines import fetch as fetch_mod
from exoproximo.pipelines import koi as koi_mod
from exoproximo.pipelines import neo_orbits as neo_orbits_mod
from exoproximo.pipelines import neo_spectra as neo_spectra_mod

app = typer.Typer(add_completion=False, help="Exoproximo pipelines.")


def _configure_logging(verbosity: int) -> None:
    level = {0: logging.WARNING, 1: logging.INFO}.get(verbosity, logging.DEBUG)
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@app.callback()
def main(verbose: int = typer.Option(0, "-v", count=True, help="Increase verbosity (-v, -vv).")) -> None:
    _configure_logging(verbose)


@app.command()
def fetch(refresh_koi: bool = typer.Option(False, help="Re-download the KOI cumulative table.")) -> None:
    """Bootstrap raw data (KOI; MITHNEOS verified, not auto-downloaded)."""
    result = fetch_mod.run(refresh_koi=refresh_koi)
    typer.echo(result)


@app.command("neo-spectra")
def neo_spectra(
    binzel_dir: Optional[Path] = typer.Option(None, help="Override Binzel data directory."),
    marsset_dir: Optional[Path] = typer.Option(None, help="Override Marsset data directory."),
    no_points: bool = typer.Option(False, help="Skip writing the raw spectra points table."),
) -> None:
    """Run the NEO spectra pipeline."""
    result = neo_spectra_mod.run(
        binzel_dir=binzel_dir, marsset_dir=marsset_dir, write_points=not no_points
    )
    typer.echo(result)


@app.command("neo-orbits")
def neo_orbits(
    cadence_days: int = typer.Option(7, help="Ephemeris cadence in days."),
    window_years: int = typer.Option(10, help="Ephemeris window in years centered on today."),
) -> None:
    """Run the NEO orbits pipeline (SBDB + Horizons ephemerides + close approaches)."""
    result = neo_orbits_mod.run(cadence_days=cadence_days, window_years=window_years)
    typer.echo(result)


@app.command()
def koi(
    koi_parquet: Optional[Path] = typer.Option(None, help="Override path to KOI parquet."),
) -> None:
    """Run the KOI classifier pipeline."""
    result = koi_mod.run(koi_parquet=koi_parquet)
    typer.echo(result)


if __name__ == "__main__":
    app()
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/test_cli.py -v
uv run exo --help
```

Expected: tests pass; `exo --help` prints subcommand list.

- [ ] **Step 5: Commit**

```bash
git add src/exoproximo/cli.py tests/test_cli.py
git commit -m "feat(cli): exo entrypoint with fetch/neo-spectra/neo-orbits/koi subcommands"
```

---

## Task 18: README rewrite

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README contents**

```markdown
# Exoproximo

ML/AI pipelines over near-Earth-object spectra (MITHNEOS), orbital state (JPL), and Kepler Object of Interest exoplanet candidates.

## Layout

```
src/exoproximo/        # Python package
data/MITHNEOS/         # vendored MITHNEOS spectral bundle (PDS V1_0)
data/raw/              # bootstrap target (gitignored)
outputs/exoproximo.db  # SQLite output store
outputs/models/        # joblib model artifacts
```

## Setup

```bash
uv sync --extra dev
```

## Pipelines

```bash
# 1. Bootstrap (downloads KOI; verifies MITHNEOS is present)
uv run exo fetch

# 2. NEO spectra: load → features → PCA/UMAP/HDBSCAN/IsolationForest → SQLite
uv run exo neo-spectra

# 3. NEO orbits: JPL SBDB + Horizons ephemerides + close approaches
uv run exo neo-orbits --cadence-days 7 --window-years 10

# 4. KOI classifier: RF + HGB with leakage guard, persists predictions
uv run exo koi
```

Use `-v` or `-vv` before the subcommand for more verbose logging.

## Outputs

All structured outputs land in `outputs/exoproximo.db`. Use any SQLite client to inspect:

```bash
sqlite3 outputs/exoproximo.db ".tables"
sqlite3 outputs/exoproximo.db "SELECT pipeline, status, n_rows_written FROM meta_runs"
```

## Tests

```bash
uv run pytest
```

## Pre-rewrite branch

The original Jupyter-notebook implementation lives on the `archive/pre-pipeline-master` branch.

## Data sources

- **MITHNEOS spectra** — vendored from [PDS Small Bodies Node](https://sbnarchive.psi.edu/pds4/non_mission/gbo.ast.mithneos.spectra_2000-2021_V1_0/)
- **JPL SBDB / Horizons / CAD** — queried live via `astroquery` and `https://ssd-api.jpl.nasa.gov`
- **NASA Exoplanet Archive** — KOI cumulative table via TAP
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README around the new pipeline CLI"
```

---

## Task 19: End-to-end verification run

**Files:** none modified. This task is a manual smoke test of the whole system on real data.

- [ ] **Step 1: Verify all tests pass**

```bash
uv run pytest -v
```

Expected: all tests pass (~25–30 passed).

- [ ] **Step 2: Run `exo fetch`**

```bash
uv run -v exo fetch
```

Expected: KOI parquet downloads to `data/raw/koi_cumulative.parquet`; MITHNEOS verified present. If MITHNEOS check fails, follow the actionable error to download from PSI.

- [ ] **Step 3: Run `exo neo-spectra` against real MITHNEOS data**

```bash
uv run -v exo neo-spectra
```

Expected: pipeline completes, prints `{'n_observations': <N>, 'rows_written': <M>}`.

- [ ] **Step 4: Sanity-check spectra outputs in SQLite**

```bash
sqlite3 outputs/exoproximo.db <<'SQL'
.headers on
.mode column
SELECT COUNT(*) AS n_asteroids FROM neo_asteroids;
SELECT COUNT(*) AS n_observations FROM neo_spectra_observations;
SELECT designation, slope_vis, band_depth_1um, hdbscan_label, is_anomaly
FROM neo_spectra_features LIMIT 10;
SQL
```

Expected: ~hundreds of asteroids/observations, finite feature values, mix of cluster labels.

- [ ] **Step 5: Run `exo neo-orbits` (small window first for speed)**

```bash
uv run -v exo neo-orbits --cadence-days 30 --window-years 5
```

Expected: queries every designation in `neo_asteroids` (slow — at ~1s/query, expect minutes for hundreds of asteroids). Prints `{'n_designations': N, 'errors': {...}, 'rows_written': M}`. Some designations may fail (e.g. provisional designations Horizons doesn't know); that's tolerated.

- [ ] **Step 6: Sanity-check orbits outputs**

```bash
sqlite3 outputs/exoproximo.db <<'SQL'
.headers on
.mode column
SELECT COUNT(*) AS n_orbits FROM neo_orbit_elements;
SELECT COUNT(*) AS n_ephem FROM neo_ephemerides;
SELECT designation, a, e, i FROM neo_orbit_elements LIMIT 5;
SELECT designation, ca_date, dist_au FROM neo_close_approaches
WHERE dist_au < 0.05 ORDER BY ca_date LIMIT 10;
SQL
```

- [ ] **Step 7: Run `exo koi`**

```bash
uv run -v exo koi
```

Expected: trains RF + HGB, prints `{'best_kind': ..., 'test_metrics': {'roc_auc': ..., ...}, 'n_candidates_predicted': N}`. AUC > 0.85 on real KOI data is reasonable.

- [ ] **Step 8: Sanity-check KOI outputs**

```bash
sqlite3 outputs/exoproximo.db <<'SQL'
.headers on
.mode column
SELECT COUNT(*) AS n_objects FROM koi_objects;
SELECT predicted_label, COUNT(*) FROM koi_predictions GROUP BY predicted_label;
SELECT pipeline, status, n_rows_written, json_extract(params_json, '$.best_kind') AS best
FROM meta_runs ORDER BY run_id;
SQL
```

- [ ] **Step 9: Commit any incidental fixes**

If any of steps 2–8 surfaced bugs that required patches, group those patches into a final commit:

```bash
git add -p
git commit -m "fix: address issues found during end-to-end verification"
```

If nothing needed fixing, skip the commit.

- [ ] **Step 10: Tag the milestone**

```bash
git tag v0.2.0 -m "Pipeline modernization complete; ready for UI sub-project"
git log --oneline | head -25
```

---

## Done

At this point:

- `master` contains the pipeline package and CLI; no notebooks.
- `archive/pre-pipeline-master` preserves the pre-rewrite world.
- `outputs/exoproximo.db` holds clusterable/queryable NEO + KOI data.
- `outputs/models/` holds joblib model artifacts.
- All tests pass.

This is the data contract sub-project B (asteroid belt explorer UI) will consume. Brainstorm B as a separate session.
