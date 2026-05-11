"""Clustering / dimensionality reduction. Pure functions; no I/O."""
from __future__ import annotations

import hdbscan
import numpy as np
import umap
from sklearn.decomposition import PCA

from exoproximo import config


def fit_pca(X: np.ndarray, n_components: int = 3) -> tuple[PCA, np.ndarray]:
    model = PCA(n_components=n_components, random_state=config.RANDOM_STATE)
    coords = model.fit_transform(X)
    return model, coords


def fit_umap(
    X: np.ndarray,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    n_components: int = 2,
) -> tuple["umap.UMAP", np.ndarray]:
    model = umap.UMAP(
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        n_components=n_components,
        random_state=config.RANDOM_STATE,
    )
    emb = model.fit_transform(X)
    return model, emb


def fit_hdbscan(
    X: np.ndarray,
    min_cluster_size: int = 5,
    min_samples: int = 3,
) -> tuple["hdbscan.HDBSCAN", np.ndarray, np.ndarray]:
    model = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, min_samples=min_samples)
    labels = model.fit_predict(X)
    return model, labels, model.probabilities_
