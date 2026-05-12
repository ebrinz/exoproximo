"""NEO orbits + physical + ephemerides + close approaches via astroquery.

Module-level `_fetch_*` functions wrap astroquery calls so tests can monkeypatch them.
Per-designation errors are tolerated; the run completes with partial data.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import subprocess
import time
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from exoproximo import config, io

log = logging.getLogger(__name__)

DEFAULT_CADENCE_DAYS = 7
DEFAULT_WINDOW_YEARS = 10
DEFAULT_CA_WINDOW = ("2026-01-01", "2076-01-01")
REQUEST_SLEEP_S = 1.0
MAX_RETRIES = 3
JPL_CACHE_DIR = config.JPL_CACHE_DIR  # rebindable via monkeypatch in tests


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


# ---------- monkeypatchable network wrappers ----------

def _fetch_sbdb(designation: str) -> dict:
    """Query JPL SBDB. Returns dict with 'elements' and 'physical' sub-dicts."""
    from astroquery.jplsbdb import SBDB
    raw = SBDB.query(designation, full_precision=True, phys=True)
    orb = raw.get("orbit", {}).get("elements", {})
    phys = raw.get("phys_par", {})
    def _f(k, src):
        v = src.get(k)
        if hasattr(v, "value"):
            return float(v.value)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None
    return {
        "elements": {
            "a": _f("a", orb), "e": _f("e", orb), "i": _f("i", orb),
            "om": _f("om", orb), "w": _f("w", orb), "ma": _f("ma", orb),
            "epoch": _f("epoch", orb),
        },
        "physical": {
            "h_mag": _f("H", phys),
            "diameter_km": _f("diameter", phys),
            "albedo": _f("albedo", phys),
            "spec_class": phys.get("spec_T") or phys.get("spec_B"),
        },
    }


def _fetch_ephemerides(designation: str, cadence_days: int, window_years: int) -> pd.DataFrame:
    """Query JPL Horizons for heliocentric ecliptic positions. Returns tidy DataFrame."""
    from astroquery.jplhorizons import Horizons
    start = (dt.datetime.utcnow() - dt.timedelta(days=365 * window_years / 2)).strftime("%Y-%m-%d")
    stop = (dt.datetime.utcnow() + dt.timedelta(days=365 * window_years / 2)).strftime("%Y-%m-%d")
    obj = Horizons(id=designation, location="@sun",
                   epochs={"start": start, "stop": stop, "step": f"{cadence_days}d"})
    vec = obj.vectors()
    return pd.DataFrame({
        "t": [str(s) for s in vec["datetime_str"]],
        "x_au": list(vec["x"].astype(float)),
        "y_au": list(vec["y"].astype(float)),
        "z_au": list(vec["z"].astype(float)),
        "vx": list(vec["vx"].astype(float)),
        "vy": list(vec["vy"].astype(float)),
        "vz": list(vec["vz"].astype(float)),
    })


def _fetch_close_approaches(designation: str) -> pd.DataFrame:
    """Query JPL CAD API for Earth close approaches."""
    import httpx
    r = httpx.get(
        "https://ssd-api.jpl.nasa.gov/cad.api",
        params={
            "des": designation,
            "date-min": DEFAULT_CA_WINDOW[0],
            "date-max": DEFAULT_CA_WINDOW[1],
            "body": "Earth",
        },
        timeout=30.0,
    )
    r.raise_for_status()
    data = r.json()
    fields = data.get("fields", [])
    rows = data.get("data", [])
    if not rows:
        return pd.DataFrame(columns=["body", "ca_date", "dist_au", "v_rel_km_s"])
    df = pd.DataFrame(rows, columns=fields)
    return pd.DataFrame({
        "body": ["Earth"] * len(df),
        "ca_date": df["cd"].tolist(),
        "dist_au": df["dist"].astype(float).tolist(),
        "v_rel_km_s": df["v_rel"].astype(float).tolist(),
    })


# ---------- retry + cache helpers ----------

def _with_retry(fn, *args, **kwargs):
    delay = 1.0
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if attempt == MAX_RETRIES:
                raise
            log.warning("attempt %d failed for %s: %s; sleeping %ss", attempt, fn.__name__, e, delay)
            time.sleep(delay)
            delay *= 2


def _cache_path(query_type: str, designation: str) -> Path:
    safe = designation.replace(" ", "_").replace("/", "_")
    return Path(JPL_CACHE_DIR) / f"{safe}__{query_type}.json"


def _cached_fetch(query_type: str, designation: str, fn, *args, refresh: bool = False):
    """Wrap a network fetch with on-disk JSON caching.

    The return value of `fn` must be JSON-serializable (dict, list, or DataFrame).
    DataFrames are stored as a {"__df__": True, "records": [...]} envelope.
    """
    path = _cache_path(query_type, designation)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not refresh:
        with path.open() as f:
            payload = json.load(f)
        if isinstance(payload, dict) and payload.get("__df__"):
            return pd.DataFrame.from_records(payload["records"])
        return payload
    result = _with_retry(fn, designation, *args)
    if isinstance(result, pd.DataFrame):
        payload = {"__df__": True, "records": result.to_dict(orient="records")}
    else:
        payload = result
    with path.open("w") as f:
        json.dump(payload, f, default=str)
    return result


# ---------- pipeline ----------

def run(
    *,
    cadence_days: int = DEFAULT_CADENCE_DAYS,
    window_years: int = DEFAULT_WINDOW_YEARS,
    limit: Optional[int] = None,
) -> dict:
    started = dt.datetime.utcnow().isoformat()
    conn = io.get_conn()
    io.init_db(conn)
    designations = io.read_df("SELECT designation FROM neo_asteroids ORDER BY designation", conn=conn)["designation"].tolist()
    if not designations:
        conn.close()
        raise RuntimeError("neo_asteroids is empty. Run `exo neo-spectra` first.")
    if limit is not None and limit > 0:
        designations = designations[:limit]
        log.info("limiting orbits run to first %d designations", limit)

    elements_rows, physical_rows, ca_rows, ephem_frames = [], [], [], []
    errors: dict[str, str] = {}
    now = dt.datetime.utcnow().isoformat()

    for des in designations:
        log.info("orbits: %s", des)
        try:
            sb = _cached_fetch("sbdb", des, _fetch_sbdb)
            elements_rows.append({"designation": des, **sb["elements"], "fetched_at": now})
            physical_rows.append({"designation": des, **sb["physical"], "fetched_at": now})
        except Exception as e:
            errors[des] = f"sbdb: {e}"
            continue

        try:
            eph = _cached_fetch("ephem", des, _fetch_ephemerides, cadence_days, window_years).copy()
            eph.insert(0, "designation", des)
            ephem_frames.append(eph)
        except Exception as e:
            errors[des] = errors.get(des, "") + f"; ephem: {e}"

        try:
            ca = _cached_fetch("ca", des, _fetch_close_approaches).copy()
            ca.insert(0, "designation", des)
            ca["fetched_at"] = now
            ca_rows.append(ca)
        except Exception as e:
            errors[des] = errors.get(des, "") + f"; ca: {e}"

        time.sleep(REQUEST_SLEEP_S)

    if elements_rows:
        io.write_df(pd.DataFrame(elements_rows), "neo_orbit_elements", conn=conn, mode="upsert", pk=["designation"])
    if physical_rows:
        io.write_df(pd.DataFrame(physical_rows), "neo_physical", conn=conn, mode="upsert", pk=["designation"])
    if ephem_frames:
        ephem_all = pd.concat(ephem_frames, ignore_index=True)
        io.write_df(ephem_all, "neo_ephemerides", conn=conn, mode="upsert", pk=["designation", "t"])
    if ca_rows:
        ca_all = pd.concat(ca_rows, ignore_index=True).reset_index(drop=True)
        # Remove stale rows for the designations we processed so re-runs don't
        # hit the ca_id PRIMARY KEY constraint.
        processed_des = list({row["designation"] for row in ca_all.to_dict(orient="records")})
        placeholders = ",".join("?" * len(processed_des))
        conn.execute(f"DELETE FROM neo_close_approaches WHERE designation IN ({placeholders})", processed_des)
        conn.commit()
        # Assign fresh sequential ca_id after deletion.
        max_id_row = conn.execute("SELECT COALESCE(MAX(ca_id), 0) FROM neo_close_approaches").fetchone()
        start_id = (max_id_row[0] if max_id_row else 0) + 1
        ca_all.insert(0, "ca_id", range(start_id, start_id + len(ca_all)))
        io.write_df(ca_all, "neo_close_approaches", conn=conn, mode="append")

    rows_written = len(elements_rows) + len(physical_rows) + sum(len(f) for f in ephem_frames) + sum(len(c) for c in ca_rows)
    finished = dt.datetime.utcnow().isoformat()
    params = {
        "cadence_days": cadence_days,
        "window_years": window_years,
        "errors": errors,
        "request_sleep_s": REQUEST_SLEEP_S,
    }
    conn.execute(
        "INSERT INTO meta_runs (pipeline, git_sha, started_at, finished_at, status, n_rows_written, params_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("neo_orbits", _git_sha(), started, finished, "ok", rows_written, json.dumps(params)),
    )
    conn.commit()
    conn.close()

    return {"n_designations": len(designations), "errors": errors, "rows_written": rows_written}
