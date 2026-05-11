"""Supervised classification (RF + HGB) with CV, held-out test, and leakage guard."""
from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, roc_auc_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split

from exoproximo import config


def assert_no_leakage(columns: Iterable[str]) -> None:
    bad = [
        c for c in columns
        if any(c.startswith(p) for p in config.KOI_FORBIDDEN_FEATURE_PREFIXES)
    ]
    if bad:
        raise ValueError(f"forbidden (leakage-prone) columns in X: {bad}")


def _rf_with_grid() -> GridSearchCV:
    rf = RandomForestClassifier(random_state=config.RANDOM_STATE, n_jobs=-1)
    grid = {
        "n_estimators": [200, 400],
        "max_depth": [None, 10, 20],
        "min_samples_leaf": [1, 5],
    }
    return GridSearchCV(rf, grid, scoring="roc_auc", cv=3, n_jobs=-1)


def _hgb() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(random_state=config.RANDOM_STATE)


def train_classifier(
    X: pd.DataFrame,
    y: pd.Series,
    *,
    kind: str = "rf",
    cv: int = 5,
    test_size: float = 0.2,
) -> dict:
    """Train a binary classifier with stratified holdout + CV.

    Returns a dict with keys: model, cv_scores, test_metrics, feature_importance, test_indices.
    Calls assert_no_leakage on X.columns and raises if any forbidden column is present.
    """
    assert_no_leakage(X.columns)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=test_size, stratify=y, random_state=config.RANDOM_STATE
    )

    if kind == "rf":
        estimator = _rf_with_grid()
    elif kind == "hgb":
        estimator = _hgb()
    else:
        raise ValueError(f"unknown kind: {kind}")

    skf = StratifiedKFold(n_splits=cv, shuffle=True, random_state=config.RANDOM_STATE)
    auc_scores, acc_scores, f1_scores = [], [], []
    for fold, (tr_idx, va_idx) in enumerate(skf.split(X_tr, y_tr)):
        X_fold_tr, X_fold_va = X_tr.iloc[tr_idx], X_tr.iloc[va_idx]
        y_fold_tr, y_fold_va = y_tr.iloc[tr_idx], y_tr.iloc[va_idx]
        clone = _rf_with_grid() if kind == "rf" else _hgb()
        clone.fit(X_fold_tr, y_fold_tr)
        proba = clone.predict_proba(X_fold_va)[:, 1]
        pred = (proba >= 0.5).astype(int)
        auc_scores.append(roc_auc_score(y_fold_va, proba))
        acc_scores.append(accuracy_score(y_fold_va, pred))
        f1_scores.append(f1_score(y_fold_va, pred))

    estimator.fit(X_tr, y_tr)
    # Unwrap GridSearchCV
    fitted = estimator.best_estimator_ if hasattr(estimator, "best_estimator_") else estimator

    proba_te = fitted.predict_proba(X_te)[:, 1]
    pred_te = (proba_te >= 0.5).astype(int)
    test_metrics = {
        "roc_auc": float(roc_auc_score(y_te, proba_te)),
        "accuracy": float(accuracy_score(y_te, pred_te)),
        "f1": float(f1_score(y_te, pred_te)),
        "brier": float(brier_score_loss(y_te, proba_te)),
    }

    if hasattr(fitted, "feature_importances_"):
        fi = dict(zip(X.columns, fitted.feature_importances_.tolist()))
    else:
        fi = {}

    return {
        "model": fitted,
        "cv_scores": {
            "roc_auc": {"mean": float(np.mean(auc_scores)), "std": float(np.std(auc_scores))},
            "accuracy": {"mean": float(np.mean(acc_scores)), "std": float(np.std(acc_scores))},
            "f1": {"mean": float(np.mean(f1_scores)), "std": float(np.std(f1_scores))},
        },
        "test_metrics": test_metrics,
        "feature_importance": fi,
        "test_indices": X_te.index.tolist(),
    }
