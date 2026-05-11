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
