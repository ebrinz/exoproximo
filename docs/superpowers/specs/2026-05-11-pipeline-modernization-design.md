# Pipeline Modernization — Design

**Date:** 2026-05-11
**Status:** Approved (brainstorm complete; awaiting user review of spec doc before implementation planning)
**Sub-project:** A (pipeline). Sub-project B (asteroid belt explorer UI) is out of scope here and will be brainstormed separately once A lands.

## Summary

Port the three Jupyter notebooks (`neo_analysis.ipynb`, `neo_api_query.ipynb`, `keppler_objs_random_forest.ipynb`) into a plain-Python package with a `exo` CLI, and take an opinionated rewrite pass: fix correctness bugs, replace dated algorithm choices, add proper CV / leakage hygiene for the classifier, persist all outputs to SQLite + joblib so the eventual UI has a single, queryable data contract.

Before any code changes land, master is preserved on an `archive/pre-pipeline-master` branch so the original notebook-based world remains browsable.

## Goals

- Run the analyses outside Jupyter, reproducibly, from a single CLI.
- Identify and fix correctness issues in the original notebooks (most notably a Binzel metadata filename bug and likely target leakage in the KOI classifier).
- Produce a single SQLite database that an interactive UI can read directly.
- Replace one-shot K-Means with HDBSCAN; add UMAP alongside PCA; add a gradient-boosting baseline alongside RandomForest.
- Precompute orbital ephemerides so the UI can animate orbits without doing Keplerian math in JS.

## Non-goals

- The asteroid belt explorer UI itself (sub-project B).
- Distributed / orchestrated execution (Airflow / Prefect / Dagster). Plain Python CLI is sufficient.
- Re-deriving spectral feature definitions from primary literature; we use the same definitions the original notebook implies (vis slope, NIR slope, 1 µm + 2 µm bands).
- Real-time / streaming refresh of JPL / MPC data.

## Inputs to the design (decisions made during brainstorm)

- All three notebooks in scope.
- "Port + opinionated rewrite" — free to restructure algorithms and feature engineering.
- Output store: **SQLite** + `joblib` model artifacts.
- Environment: **uv + pyproject.toml**. Pipenv dropped.
- Data acquisition: **one-time bootstrap script**; JPL/MPC stays live with on-disk cache.
- Pipeline structure: **library + subcommand CLI** (Approach A).
- Ephemerides included in v1 (UI animates from precomputed positions).

## Project layout

```
exoproximo/
├── pyproject.toml
├── uv.lock
├── README.md
├── .gitignore                     # adds data/raw/, outputs/, .venv/
├── src/
│   └── exoproximo/
│       ├── __init__.py
│       ├── cli.py                 # Typer; `exo` entrypoint
│       ├── config.py              # paths, seeds, feature constants
│       ├── io.py                  # SQLite + parquet + joblib helpers
│       ├── features/
│       │   ├── spectra.py
│       │   └── orbits.py
│       ├── ml/
│       │   ├── cluster.py         # PCA, UMAP, HDBSCAN
│       │   ├── anomaly.py         # IsolationForest
│       │   └── classify.py        # RF + HGB, CV, calibration
│       └── pipelines/
│           ├── fetch.py
│           ├── neo_spectra.py
│           ├── neo_orbits.py
│           └── koi.py
├── scripts/
│   └── bootstrap_data.py          # thin wrapper around pipelines.fetch
├── data/
│   ├── MITHNEOS/                  # KEEP — already-vendored bundle
│   └── raw/                       # gitignored; bootstrap target
├── outputs/                       # gitignored
│   ├── exoproximo.db
│   ├── models/
│   └── koi_calibration.png
├── notebooks/                     # (intentionally absent on master; lives on archive branch)
└── tests/
    ├── fixtures/
    │   ├── spectra/               # ~5 hand-picked MITHNEOS CSVs
    │   ├── koi_small.parquet      # ~200 KOI rows
    │   └── jpl/                   # canned JSON responses
    ├── test_features_spectra.py
    ├── test_ml_classify.py
    ├── test_io.py
    ├── test_pipeline_neo_spectra.py
    ├── test_pipeline_koi.py
    └── test_pipeline_neo_orbits.py
```

### Pre-implementation step 0 — archive branch

Before any of the above lands on `master`:

```
git switch -c archive/pre-pipeline-master
git push -u origin archive/pre-pipeline-master    # optional but recommended
git switch master
```

The three `.ipynb` files are then deleted from `master`. They remain fully runnable on the archive branch.

### Dependencies (pyproject.toml)

Runtime: `pandas`, `numpy`, `scipy`, `scikit-learn`, `umap-learn`, `hdbscan`, `astroquery`, `astropy`, `typer`, `joblib`, `tqdm`, `requests`, `pyarrow`.

Dev: `pytest`, `pytest-cov`, `responses` (or `pytest-httpx`), `ruff`.

## Architecture & module boundaries

Strict layering — upper layers may import lower, never the reverse:

```
cli.py
   │
   ▼
pipelines/*.py     (thin orchestrators; one per subcommand)
   │
   ▼
ml/*.py + features/*.py    (pure functions: data in → data/model out)
   │
   ▼
io.py + config.py  (filesystem, SQLite, paths, constants)
```

### Module responsibilities

| Module | Responsibility |
| --- | --- |
| `cli.py` | Typer app. One function per subcommand. Args parsing, dispatch, summary printing. No business logic. |
| `config.py` | Path constants, `RANDOM_STATE`, feature-engineering constants (wavelength bands, normalization anchor). |
| `io.py` | The only module that touches the filesystem. `get_conn()`, `write_df(df, table, mode='upsert')`, `read_df(query)`, `save_model(model, name)`, `load_model(name)`. |
| `features/spectra.py` | Pure feature functions: `normalize_reflectance`, `slope_vis`, `slope_nir`, `band_depth_1um`, `band_center_1um`, `band_depth_2um`, `band_center_2um`. |
| `features/orbits.py` | Pure transforms over astroquery responses. |
| `ml/cluster.py` | `fit_pca`, `fit_umap`, `fit_hdbscan`. Each returns `(model, transform_or_labels)`. |
| `ml/anomaly.py` | `fit_isolation_forest(X) → (model, scores, threshold)`. |
| `ml/classify.py` | `train_classifier(X, y, kind, cv)`. Handles stratified k-fold + held-out test internally. |
| `pipelines/*.py` | One `run(args)` function each. ~50–150 lines. Calls features/ + ml/, persists via io.py. |

### Invariants

- Pipelines never import each other. Shared code goes in `features/`, `ml/`, or `io.py`.
- `features/` and `ml/` have no `print` and no filesystem access.
- Every random source seeded from `config.RANDOM_STATE`.
- All SQLite writes go through `io.write_df`.
- No bare `except:`. Catch named exceptions; let unexpected ones propagate.
- `cli.py` is the only place `print` is allowed (besides `logging`).

## SQLite schema

Single file: `outputs/exoproximo.db`. Three namespaces by prefix (`neo_*`, `koi_*`, `meta_*`).

```sql
-- ===== NEO spectra =====

CREATE TABLE neo_asteroids (
    designation TEXT PRIMARY KEY,
    name TEXT,
    n_observations INTEGER,
    sources TEXT                          -- JSON array
);

CREATE TABLE neo_spectra_observations (
    obs_id INTEGER PRIMARY KEY,
    designation TEXT REFERENCES neo_asteroids(designation),
    source TEXT,                          -- 'marsset' | 'binzel'
    obs_date TEXT,                        -- ISO 8601, nullable
    file_path TEXT,
    n_points INTEGER
);

CREATE TABLE neo_spectra_features (
    obs_id INTEGER PRIMARY KEY REFERENCES neo_spectra_observations(obs_id),
    designation TEXT REFERENCES neo_asteroids(designation),
    slope_vis REAL,
    slope_nir REAL,
    band_depth_1um REAL,
    band_center_1um REAL,
    band_depth_2um REAL,
    band_center_2um REAL,
    pc1 REAL, pc2 REAL, pc3 REAL,
    umap1 REAL, umap2 REAL,
    hdbscan_label INTEGER,
    hdbscan_probability REAL,
    isoforest_score REAL,
    is_anomaly INTEGER
);

CREATE TABLE neo_spectra_points (
    obs_id INTEGER REFERENCES neo_spectra_observations(obs_id),
    wavelength REAL,
    reflectance REAL,
    error REAL
);
CREATE INDEX idx_neo_points_obs ON neo_spectra_points(obs_id);

-- ===== NEO orbits / physical / ephemerides =====

CREATE TABLE neo_orbit_elements (
    designation TEXT PRIMARY KEY REFERENCES neo_asteroids(designation),
    a REAL, e REAL, i REAL,
    om REAL, w REAL, ma REAL,
    epoch REAL,
    fetched_at TEXT
);

CREATE TABLE neo_physical (
    designation TEXT PRIMARY KEY REFERENCES neo_asteroids(designation),
    h_mag REAL,
    diameter_km REAL,
    albedo REAL,
    spec_class TEXT,
    fetched_at TEXT
);

CREATE TABLE neo_close_approaches (
    ca_id INTEGER PRIMARY KEY,
    designation TEXT REFERENCES neo_asteroids(designation),
    body TEXT,
    ca_date TEXT,
    dist_au REAL,
    v_rel_km_s REAL,
    fetched_at TEXT
);
CREATE INDEX idx_neo_ca_designation ON neo_close_approaches(designation);

CREATE TABLE neo_ephemerides (
    designation TEXT REFERENCES neo_asteroids(designation),
    t TEXT,                               -- ISO 8601 UTC
    x_au REAL, y_au REAL, z_au REAL,      -- heliocentric ecliptic
    vx REAL, vy REAL, vz REAL,            -- AU/day
    PRIMARY KEY (designation, t)
);
CREATE INDEX idx_neo_ephem_t ON neo_ephemerides(t);

-- ===== KOI =====

CREATE TABLE koi_objects (
    kepoi_name TEXT PRIMARY KEY,
    kepler_name TEXT,
    koi_disposition TEXT,                 -- ground truth
    koi_period REAL, koi_duration REAL, koi_depth REAL, koi_prad REAL,
    koi_teq REAL, koi_insol REAL, koi_model_snr REAL,
    koi_steff REAL, koi_slogg REAL, koi_srad REAL, koi_smass REAL, koi_smet REAL
);

CREATE TABLE koi_predictions (
    kepoi_name TEXT REFERENCES koi_objects(kepoi_name),
    model_run_id INTEGER REFERENCES meta_runs(run_id),
    prob_planet REAL,
    predicted_label TEXT,
    PRIMARY KEY (kepoi_name, model_run_id)
);

-- ===== Meta =====

CREATE TABLE meta_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline TEXT,                        -- 'neo_spectra' | 'neo_orbits' | 'koi' | 'fetch'
    git_sha TEXT,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,                          -- 'ok' | 'failed'
    n_rows_written INTEGER,
    params_json TEXT
);
```

### Schema notes

- `neo_spectra_features` is intentionally **wide** (features + PCA + UMAP + cluster + anomaly co-located). UI ergonomics > strict normalization.
- `neo_spectra_points` may be skipped in v1 if storage matters; the UI works fine without it.
- `koi_predictions` is versioned by `model_run_id` so multiple training runs coexist.
- All FK references are advisory in SQLite (PRAGMA `foreign_keys` enabled at connection time).

## Pipelines

### 4.1 `exo fetch` — bootstrap data

1. **MITHNEOS** — if `data/MITHNEOS/gbo.ast.mithneos.spectra_2000-2021_V1_0/` exists and non-empty, skip. Otherwise recursively mirror from `https://sbnarchive.psi.edu/pds4/non_mission/gbo.ast.mithneos.spectra_2000-2021_V1_0/` with `requests` (PSI serves a directory tree, no single zip). Verify a sentinel file size at the end.
2. **KOI cumulative** — TAP query against `https://exoplanetarchive.ipac.caltech.edu/TAP/sync`:
   ```
   query=SELECT * FROM cumulative&format=csv
   ```
   Save to `data/raw/koi_cumulative.parquet`. Re-fetch only with `exo fetch --refresh koi`.
3. **JPL / MPC are not fetched here** — they're queried live by `neo-orbits` with on-disk caching.

### 4.2 `exo neo-spectra`

1. **Load metadata** — Marsset & Binzel observation parameter CSVs. **Bug fix from the original notebook**: `neo_analysis.ipynb` line 172 reuses the Marsset metadata file for Binzel. Use `observationalparameters_binzel.csv` for Binzel.
2. **Load spectra** — walk `binzel2019/` and `marsset2022/`, parse each `(wavelength, reflectance, error)` CSV, join to metadata by filename → designation.
3. **Normalize** reflectance to the 0.55 µm anchor wavelength. Drop observations that don't span the anchor or that lack coverage of both the 1 µm and 2 µm band regions.
4. **Feature engineering** (`features/spectra.py`, pure functions, unit-tested on synthetic spectra):
   - `slope_vis` (0.45–0.70 µm linear fit slope)
   - `slope_nir` (0.85–2.4 µm linear fit slope)
   - `band_depth_1um`, `band_center_1um` (continuum-removed minimum near 1 µm)
   - `band_depth_2um`, `band_center_2um` (same near 2 µm)
5. **Anomaly detection** — `IsolationForest(contamination='auto', random_state=42)`. Score + binary `is_anomaly` flag at threshold derived from contamination. Threshold recorded in `meta_runs.params_json`.
6. **Dim reduction** — PCA(3 components) + UMAP(2D, n_neighbors=15, min_dist=0.1).
7. **Clustering** — HDBSCAN(min_cluster_size=5, min_samples=3). Returns labels (-1 = noise) and probabilities. Replaces K-Means.
8. **Persist** — upsert into `neo_asteroids`, insert into `neo_spectra_observations`, `neo_spectra_features`, `neo_spectra_points`.
9. **Save models** — `outputs/models/spectra_{pca,umap,hdbscan,isoforest}.joblib`.
10. **Insert** `meta_runs` row with hyperparams, seed, input fingerprint.

**Improvements vs. notebook:** Binzel metadata bug fixed; feature math extracted into tested pure functions; HDBSCAN replaces K-Means; UMAP added; IsoForest threshold explicit and recorded; all randomness seeded.

### 4.3 `exo neo-orbits`

1. **Designation list** — `SELECT DISTINCT designation FROM neo_asteroids`. If empty, fail with "Run `exo neo-spectra` first."
2. **Per-designation queries**:
   - `astroquery.jplsbdb.SBDB.query()` → orbital elements + physical properties + spectral class.
   - `astroquery.jplhorizons.Horizons(...).ephemerides()` → ephemerides over a configurable window. Default: weekly samples, 10-year window centered on today (`--ephemeris-cadence=7d --ephemeris-window=10y`).
   - JPL CAD API for Earth close approaches, default window `2026–2076` (`--ca-window=2026:2076`).
3. **On-disk cache** — `data/raw/jpl_cache/{designation}__{query_type}.json`. Cache hit → use as-is. Miss → fetch, sleep 1 s (polite), save. `--refresh` invalidates.
4. **Resilience** — wrap each request with retry on 5xx / connection errors (3 attempts, exponential backoff with jitter). Failed designations logged into `meta_runs.params_json.errors`; pipeline completes with partial data.
5. **Write** — `neo_orbit_elements`, `neo_physical`, `neo_close_approaches`, `neo_ephemerides`.

**Storage estimate for ephemerides:** ~80 B/row × 520 points × ~500 NEOs ≈ 20 MB. Fits comfortably.

**Improvements vs. notebook:** on-disk caching (the notebook hits the network every cell run), explicit retry, structured storage instead of in-memory DataFrames, rate-limit politeness, ephemerides precomputed.

### 4.4 `exo koi`

1. **Load** `data/raw/koi_cumulative.parquet`.
2. **Label setup** — drop `koi_disposition == 'CANDIDATE'` from the training set; keep them aside for inference. Binary target: CONFIRMED (1) vs. FALSE POSITIVE (0).
3. **Feature allowlist**:
   - Stellar: `koi_steff, koi_slogg, koi_srad, koi_smass, koi_smet`
   - Transit: `koi_period, koi_duration, koi_depth, koi_prad, koi_teq, koi_insol, koi_model_snr`
4. **Leakage audit** — explicitly forbid `koi_score`, `koi_pdisposition`, `koi_fpflag_*`, any `koi_disp*`, any `koi_tce_*`. Build fails if any forbidden column appears in `X`.
5. **Imputation** — median for stellar params; drop rows missing transit params.
6. **Stratified 80/20 split** — held-out test set, never used during CV.
7. **Cross-validation** — 5-fold stratified on the 80%; report `roc_auc`, `accuracy`, `f1` (mean ± std).
8. **Models**:
   - `RandomForestClassifier` + `GridSearchCV` over `{n_estimators: [200, 400], max_depth: [None, 10, 20], min_samples_leaf: [1, 5]}`.
   - `HistGradientBoostingClassifier` with defaults (sklearn-native — no LightGBM dep required).
9. **Selection** — best model by held-out test AUC.
10. **Calibration** — Brier score + reliability diagram saved to `outputs/koi_calibration.png`.
11. **Inference** — predict on CANDIDATE rows; write `koi_predictions` keyed by `model_run_id`.
12. **Persist** best model: `outputs/models/koi_best.joblib`.

**Improvements vs. notebook:** explicit leakage allowlist; held-out test set discipline; HGB baseline; calibration reported; CV stats with std; candidate predictions actually persisted.

## Testing strategy

### Unit tests (pure functions, fast)

- `tests/test_features_spectra.py` — synthetic spectra (linear continuum + Gaussian band) fed into each feature function; assert recovered values within tolerance.
- `tests/test_ml_classify.py` — small synthetic classification problem; assert `train_classifier` returns sane CV scores, no forbidden column makes it through, `model_run_id` is recorded.
- `tests/test_io.py` — write/read round-trips through SQLite; assert schema constraints, FK behavior, upsert semantics.

### Pipeline smoke tests (slow but small)

- `tests/test_pipeline_neo_spectra.py` — full `neo-spectra` pipeline against ~5 hand-picked spectra files in `tests/fixtures/spectra/`. Asserts row counts in each output table, no NaN in feature columns, HDBSCAN finds ≥1 cluster.
- `tests/test_pipeline_koi.py` — full `koi` pipeline against `tests/fixtures/koi_small.parquet` (~200 rows). Asserts test AUC > 0.85 (sanity floor), no forbidden columns in `X`.

### Network-mocked integration tests

- `tests/test_pipeline_neo_orbits.py` — `responses` / `pytest-httpx` to fake JPL/MPC responses from canned JSON in `tests/fixtures/jpl/`. Asserts retry behavior on injected 503s, cache hits skip the network, ephemeris rows written.

### Deliberately not tested

- sklearn / astroquery internals.
- Full-pipeline golden-file regressions (brittle across sklearn versions).
- Bootstrap download itself — too slow / flaky; only its skip-if-exists logic is unit-tested.

## Error handling & logging

- **Loud / early failure on missing inputs.** Missing `data/raw/koi_cumulative.parquet` → actionable error: "Run `exo fetch` first."
- **Per-record API errors tolerated.** A failed SBDB lookup for one designation logs a warning, gets recorded in `meta_runs.params_json.errors`, and the run continues.
- **No bare `except:`.** Catch named exceptions; let unexpected ones propagate.
- **`meta_runs.status`** ∈ {`ok`, `failed`}. CLI exits non-zero on `failed`, so it composes with shell scripts.
- **Logging** via stdlib `logging`. INFO for stage transitions and counts; DEBUG for per-record traces. `-v` / `-vv` flags control verbosity.

## Reproducibility

- `config.RANDOM_STATE = 42` is the single source of randomness; passed explicitly into every sklearn / UMAP / HDBSCAN call.
- `meta_runs.git_sha` records the code version.
- `meta_runs.params_json` records every hyperparameter, the input fingerprint (row counts + sha256 of sorted designations), and the seed.
- `uv.lock` pins the exact dependency tree.

## Migration plan (high level)

Detailed implementation steps will be produced by the writing-plans skill. The high-level order is:

1. Create `archive/pre-pipeline-master` branch.
2. Delete `.ipynb` files from `master`.
3. Add `pyproject.toml`, set up uv environment, gitignore additions.
4. Land `config.py`, `io.py` + their tests.
5. Land `features/spectra.py` + tests.
6. Land `ml/` modules + tests.
7. Land `pipelines/fetch.py` + bootstrap script.
8. Land `pipelines/neo_spectra.py` + smoke test.
9. Land `pipelines/neo_orbits.py` + mocked test (this is where ephemerides land).
10. Land `pipelines/koi.py` + smoke test.
11. Land `cli.py` wiring + a top-level `README.md` rewrite.
12. Run all three pipelines end-to-end; sanity-check `exoproximo.db`.
13. Hand-off doc: which tables the UI sub-project will consume.

## Open questions for the implementation plan

- Should `exo fetch` parallelize the MITHNEOS recursive download, or is sequential-with-progress fine? (Probably fine; bundle is small.)
- Do we keep `neo_spectra_points` in v1 or defer? (Spec keeps it; can drop if storage becomes an issue.)

## Connection to sub-project B (asteroid belt explorer UI)

This pipeline's outputs are the UI's data contract:

- `neo_orbit_elements` + `neo_ephemerides` → draw orbits and animate positions.
- `neo_physical` → asteroid size/albedo for visual encoding.
- `neo_spectra_features` → cluster coloring, anomaly highlights, PCA/UMAP scatter view, per-asteroid spectral feature panel.
- `neo_close_approaches` → "next 50 years of Earth approaches" timeline.
- `koi_*` → likely a separate view ("exoplanet candidates classified by our model"), conceptually distinct from the belt explorer.

Sub-project B will be brainstormed once A's outputs are landed and inspected.
