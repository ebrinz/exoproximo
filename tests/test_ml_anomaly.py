from __future__ import annotations

import numpy as np

from exoproximo.ml import anomaly


def test_isolation_forest_flags_outliers():
    rng = np.random.default_rng(0)
    inliers = rng.normal(size=(200, 4))
    outliers = rng.normal(loc=8, scale=0.5, size=(20, 4))
    X = np.vstack([inliers, outliers])
    model, scores, is_anom = anomaly.fit_isolation_forest(X, contamination=0.1)
    assert scores.shape == (220,)
    assert is_anom.shape == (220,)
    # Outliers (last 20 rows) should have a high anomaly rate
    assert is_anom[-20:].sum() >= 15
