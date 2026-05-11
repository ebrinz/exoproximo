from __future__ import annotations

import io as stdio
from pathlib import Path

import pandas as pd
import pytest

from exoproximo.pipelines import fetch


CSV_FIXTURE = """kepoi_name,kepler_name,koi_disposition,koi_period,koi_steff
K00001.01,Kepler-1 b,CONFIRMED,2.47,5455
K00002.01,Kepler-2 b,CONFIRMED,2.20,6350
K00003.01,Kepler-3 b,FALSE POSITIVE,4.88,4769
"""


def test_fetch_koi_writes_parquet(tmp_path: Path, httpx_mock):
    httpx_mock.add_response(
        url=fetch.KOI_TAP_URL_TEMPLATE.format(query=fetch.KOI_QUERY).replace(" ", "+"),
        text=CSV_FIXTURE,
        status_code=200,
    )
    out = fetch.fetch_koi(out_path=tmp_path / "koi.parquet", http_client=fetch._make_httpx_client())
    df = pd.read_parquet(out)
    assert len(df) == 3
    assert "kepoi_name" in df.columns


def test_fetch_koi_skips_when_exists(tmp_path: Path, httpx_mock):
    p = tmp_path / "koi.parquet"
    pd.DataFrame({"kepoi_name": ["K00001.01"]}).to_parquet(p)
    out = fetch.fetch_koi(out_path=p, refresh=False, http_client=fetch._make_httpx_client())
    assert out == p
    # No HTTP call should have been made
    assert len(httpx_mock.get_requests()) == 0
