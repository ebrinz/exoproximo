"""Anomaly detection via IsolationForest."""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest

from exoproximo import config


def fit_isolation_forest(
    X: np.ndarray,
    contamination: float | str = "auto",
) -> tuple[IsolationForest, np.ndarray, np.ndarray]:
    """Returns (model, anomaly_scores_higher_is_more_anomalous, is_anomaly_int_array)."""
    model = IsolationForest(
        contamination=contamination,
        random_state=config.RANDOM_STATE,
    )
    model.fit(X)
    # decision_function: higher = more normal. Flip sign so higher = more anomalous.
    scores = -model.decision_function(X)
    is_anomaly = (model.predict(X) == -1).astype(int)
    return model, scores, is_anomaly
