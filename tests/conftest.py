"""Shared pytest fixtures."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture
def tmp_outputs(tmp_path: Path, monkeypatch) -> Path:
    """Redirect OUTPUTS_DIR/DB_PATH/MODELS_DIR to a tmp directory."""
    from exoproximo import config

    outputs = tmp_path / "outputs"
    models = outputs / "models"
    models.mkdir(parents=True)
    monkeypatch.setattr(config, "OUTPUTS_DIR", outputs)
    monkeypatch.setattr(config, "DB_PATH", outputs / "exoproximo.db")
    monkeypatch.setattr(config, "MODELS_DIR", models)
    return outputs
