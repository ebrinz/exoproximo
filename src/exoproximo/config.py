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

# Spectral feature constants. MITHNEOS spectra are SpeX/IRTF NIR (~0.7-2.5 µm),
# so anchors and slope windows are NIR-centric. The vis/nir naming is retained
# for schema compatibility — semantically these are the "blue NIR" and
# "red NIR" portions of the spectrum.
ANCHOR_WAVELENGTH_UM = 1.25  # J-band anchor; standard MITHNEOS convention
VIS_SLOPE_RANGE_UM = (0.85, 1.25)  # blue-NIR slope
NIR_SLOPE_RANGE_UM = (1.40, 2.20)  # red-NIR slope
BAND_1UM_RANGE = (0.85, 1.30)
BAND_2UM_RANGE = (1.70, 2.20)

# KOI: forbidden columns to keep out of X (leakage)
KOI_FORBIDDEN_FEATURE_PREFIXES = ("koi_disp", "koi_pdisp", "koi_score", "koi_fpflag", "koi_tce")
