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
