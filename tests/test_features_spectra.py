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
