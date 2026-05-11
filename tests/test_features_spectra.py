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
