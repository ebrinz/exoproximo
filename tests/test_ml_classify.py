from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import make_classification

from exoproximo.ml import classify


def _toy_problem(n=400, leakage=False):
    X, y = make_classification(n_samples=n, n_features=8, n_informative=5, random_state=0)
    cols = [f"f{i}" for i in range(8)]
    df = pd.DataFrame(X, columns=cols)
    if leakage:
        df["koi_score"] = y.astype(float)  # explicit forbidden column
    return df, pd.Series(y, name="label")


def test_train_classifier_rf_returns_sane_cv():
    X, y = _toy_problem()
    res = classify.train_classifier(X, y, kind="rf", cv=3)
    assert "model" in res
    assert "cv_scores" in res
    assert "test_metrics" in res
    assert res["test_metrics"]["roc_auc"] > 0.85


def test_train_classifier_hgb_returns_sane_cv():
    X, y = _toy_problem()
    res = classify.train_classifier(X, y, kind="hgb", cv=3)
    assert res["test_metrics"]["roc_auc"] > 0.85


def test_train_classifier_rejects_forbidden_columns():
    X, y = _toy_problem(leakage=True)
    with pytest.raises(ValueError, match="forbidden"):
        classify.train_classifier(X, y, kind="rf", cv=3)


def test_assert_no_leakage_passes_for_clean_columns():
    classify.assert_no_leakage(["koi_period", "koi_depth", "koi_steff"])


def test_assert_no_leakage_raises_for_forbidden():
    with pytest.raises(ValueError, match="forbidden"):
        classify.assert_no_leakage(["koi_period", "koi_score"])
