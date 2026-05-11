from __future__ import annotations

import numpy as np
import pytest

from exoproximo.ml import cluster


@pytest.fixture
def blobs():
    rng = np.random.default_rng(0)
    a = rng.normal(loc=(0, 0, 0), scale=0.1, size=(40, 3))
    b = rng.normal(loc=(5, 5, 5), scale=0.1, size=(40, 3))
    c = rng.normal(loc=(-5, 5, -5), scale=0.1, size=(40, 3))
    return np.vstack([a, b, c])


def test_fit_pca_returns_model_and_3d_coords(blobs):
    model, coords = cluster.fit_pca(blobs, n_components=3)
    assert coords.shape == (120, 3)
    assert hasattr(model, "explained_variance_ratio_")


def test_fit_umap_returns_2d(blobs):
    model, emb = cluster.fit_umap(blobs)
    assert emb.shape == (120, 2)


def test_fit_hdbscan_finds_three_clusters(blobs):
    model, labels, probs = cluster.fit_hdbscan(blobs, min_cluster_size=10)
    non_noise = labels[labels >= 0]
    assert len(set(non_noise.tolist())) == 3
    assert probs.shape == (120,)
