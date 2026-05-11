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
