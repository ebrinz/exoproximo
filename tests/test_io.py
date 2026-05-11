from __future__ import annotations

import pandas as pd

from exoproximo import io


def test_get_conn_enables_fks(tmp_db):
    conn = io.get_conn(tmp_db)
    cur = conn.execute("PRAGMA foreign_keys")
    assert cur.fetchone()[0] == 1
    conn.close()


def test_write_and_read_df_roundtrip(tmp_db):
    df = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    conn = io.get_conn(tmp_db)
    io.write_df(df, "demo", conn=conn, mode="replace")
    out = io.read_df("SELECT * FROM demo ORDER BY a", conn=conn)
    conn.close()
    pd.testing.assert_frame_equal(out.reset_index(drop=True), df)


def test_write_df_upsert(tmp_db):
    conn = io.get_conn(tmp_db)
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v REAL)")
    io.write_df(pd.DataFrame({"id": [1, 2], "v": [10.0, 20.0]}), "t", conn=conn, mode="upsert", pk=["id"])
    io.write_df(pd.DataFrame({"id": [2, 3], "v": [99.0, 30.0]}), "t", conn=conn, mode="upsert", pk=["id"])
    out = io.read_df("SELECT * FROM t ORDER BY id", conn=conn)
    conn.close()
    assert out["v"].tolist() == [10.0, 99.0, 30.0]


def test_init_db_creates_all_tables(tmp_db):
    conn = io.get_conn(tmp_db)
    io.init_db(conn)
    tables = pd.read_sql_query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", conn
    )["name"].tolist()
    conn.close()
    expected = {
        "neo_asteroids", "neo_spectra_observations", "neo_spectra_features",
        "neo_spectra_points", "neo_orbit_elements", "neo_physical",
        "neo_close_approaches", "neo_ephemerides",
        "koi_objects", "koi_predictions", "meta_runs",
    }
    assert expected.issubset(set(tables))


def test_save_and_load_model_roundtrip(tmp_path):
    obj = {"a": 1, "b": [2, 3]}
    p = io.save_model(obj, "demo", models_dir=tmp_path)
    assert p.exists()
    out = io.load_model("demo", models_dir=tmp_path)
    assert out == obj
