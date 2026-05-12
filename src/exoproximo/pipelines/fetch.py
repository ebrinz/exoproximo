"""Bootstrap data fetching: KOI cumulative table + (optional) MITHNEOS verification."""
from __future__ import annotations

import io as stdio
import logging
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd

from exoproximo import config

log = logging.getLogger(__name__)

KOI_TAP_URL_TEMPLATE = (
    "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query={query}&format=csv"
)
KOI_QUERY = "SELECT * FROM cumulative"


def _make_httpx_client(timeout: float = 60.0) -> httpx.Client:
    return httpx.Client(timeout=timeout, follow_redirects=True)


def fetch_koi(
    out_path: Optional[Path] = None,
    *,
    refresh: bool = False,
    http_client: Optional[httpx.Client] = None,
) -> Path:
    out = Path(out_path) if out_path is not None else config.KOI_RAW_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not refresh:
        log.info("koi parquet already exists at %s; skipping (use refresh=True to force)", out)
        return out

    client = http_client if http_client is not None else _make_httpx_client()
    url = KOI_TAP_URL_TEMPLATE.format(query=KOI_QUERY).replace(" ", "+")
    log.info("fetching KOI cumulative table from NASA Exoplanet Archive...")
    r = client.get(url)
    r.raise_for_status()
    df = pd.read_csv(stdio.StringIO(r.text))
    # Force object columns to string. The KOI table includes columns like
    # `koi_quarters` whose values are 32-character bitmask strings; pyarrow
    # otherwise tries to infer them as int and overflows C long.
    obj_cols = df.select_dtypes(include="object").columns
    if len(obj_cols):
        df = df.astype({c: "string" for c in obj_cols})
    df.to_parquet(out, index=False)
    log.info("wrote %d rows to %s", len(df), out)
    return out


def verify_mithneos(dir_path: Optional[Path] = None) -> bool:
    p = Path(dir_path) if dir_path is not None else config.MITHNEOS_DIR
    if not p.exists():
        log.warning("MITHNEOS dir not found at %s", p)
        return False
    has_marsset = (p / "marsset2022").exists()
    has_binzel = (p / "binzel2019").exists()
    ok = has_marsset and has_binzel
    log.info("MITHNEOS verification: marsset=%s binzel=%s", has_marsset, has_binzel)
    return ok


def run(*, refresh_koi: bool = False) -> dict:
    """High-level fetch: verify MITHNEOS, fetch KOI if absent."""
    mithneos_ok = verify_mithneos()
    if not mithneos_ok:
        log.error(
            "MITHNEOS bundle missing. Download manually from "
            "https://sbnarchive.psi.edu/pds4/non_mission/gbo.ast.mithneos.spectra_2000-2021_V1_0/ "
            "into data/MITHNEOS/"
        )
    koi_path = fetch_koi(refresh=refresh_koi)
    return {"mithneos_ok": mithneos_ok, "koi_path": str(koi_path)}
