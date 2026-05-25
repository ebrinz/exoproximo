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

## UI

Static-export Next.js app at `ui/`. See [`ui/README.md`](./ui/README.md).
