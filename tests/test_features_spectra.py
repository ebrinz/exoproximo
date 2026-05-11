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
