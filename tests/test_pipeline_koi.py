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
