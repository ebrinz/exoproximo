"""SQLite + joblib I/O. The only module in exoproximo that touches the filesystem."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable, Optional

import joblib
import pandas as pd

from exoproximo import config


def get_conn(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path is not None else config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def write_df(
    df: pd.DataFrame,
    table: str,
    *,
    conn: sqlite3.Connection,
    mode: str = "append",
    pk: Optional[Iterable[str]] = None,
) -> int:
    """Write a DataFrame to SQLite.

    mode:
        'append'   -> INSERT only (default).
        'replace'  -> DROP + CREATE + INSERT (uses pandas.to_sql).
        'upsert'   -> INSERT ... ON CONFLICT(pk) DO UPDATE SET ... (table must exist; pk required).
    """
    if mode == "replace":
        df.to_sql(table, conn, if_exists="replace", index=False)
        conn.commit()
        return len(df)
    if mode == "append":
        df.to_sql(table, conn, if_exists="append", index=False)
        conn.commit()
        return len(df)
    if mode == "upsert":
        if not pk:
            raise ValueError("upsert requires pk=[col, ...]")
        cols = list(df.columns)
        placeholders = ",".join(["?"] * len(cols))
        cols_sql = ",".join(cols)
        pk_sql = ",".join(pk)
        update_sql = ",".join(f"{c}=excluded.{c}" for c in cols if c not in pk)
        sql = (
            f"INSERT INTO {table} ({cols_sql}) VALUES ({placeholders}) "
            f"ON CONFLICT({pk_sql}) DO UPDATE SET {update_sql}"
        )
        conn.executemany(sql, df.itertuples(index=False, name=None))
        conn.commit()
        return len(df)
    raise ValueError(f"unknown mode: {mode}")


def read_df(query: str, *, conn: sqlite3.Connection, params: tuple = ()) -> pd.DataFrame:
    return pd.read_sql_query(query, conn, params=params)


def save_model(model: object, name: str, *, models_dir: Optional[Path] = None) -> Path:
    out_dir = Path(models_dir) if models_dir is not None else config.MODELS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.joblib"
    joblib.dump(model, path)
    return path


def load_model(name: str, *, models_dir: Optional[Path] = None) -> object:
    in_dir = Path(models_dir) if models_dir is not None else config.MODELS_DIR
    return joblib.load(in_dir / f"{name}.joblib")
