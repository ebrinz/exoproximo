"""Pure spectral feature functions.

Inputs are tidy DataFrames with columns: wavelength (µm), reflectance, error.
No filesystem access. No prints. No randomness.
"""
from __future__ import annotations

from pathlib import Path

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
