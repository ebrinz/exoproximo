"""Generate heuristic summary tags for every NEO in the database.

Reads neo_asteroids + neo_orbit_elements + neo_physical + neo_spectra_features
+ neo_close_approaches, applies classification heuristics, and writes
outputs/neo_summary_tags.json.

Usage:
    uv run python scripts/generate_neo_tags.py [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Allow running as a script without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from exoproximo import config
from exoproximo.io import get_conn

TODAY = datetime.now(tz=timezone.utc)

# ---------------------------------------------------------------------------
# Orbital mechanics helpers
# ---------------------------------------------------------------------------

MU = 4 * math.pi**2          # AU³/yr²
AU_YR_TO_KM_S = 4.74047      # conversion factor


def hohmann_dv(a_au: float, i_deg: float) -> float:
    """Estimate Hohmann transfer Δv (km/s) from Earth to a NEO at semi-major axis a_au."""
    r1, r2 = 1.0, a_au
    v1 = math.sqrt(MU / r1)
    a_t = (r1 + r2) / 2
    v_peri = math.sqrt(MU * (2 / r1 - 1 / a_t))
    v_apo = math.sqrt(MU * (2 / r2 - 1 / a_t))
    dv_burn = abs(v_peri - v1) + abs(math.sqrt(MU / r2) - v_apo)
    dv_incl = 2 * math.sqrt(MU / r2) * math.sin(math.radians(i_deg) / 2)
    return (dv_burn + dv_incl) * AU_YR_TO_KM_S


def transfer_time_yr(a_au: float) -> float:
    """Hohmann transfer time in years (half-ellipse)."""
    a_t = (1.0 + a_au) / 2
    return math.pi * math.sqrt(a_t**3 / MU)


# ---------------------------------------------------------------------------
# Tag derivation
# ---------------------------------------------------------------------------

COMPOSITION_MAP = {
    "S": "silicate",
    "Q": "silicate",
    "C": "carbonaceous",
    "B": "carbonaceous",
    "M": "metallic",
    "X": "metallic-or-enstatite",
    "V": "basaltic",
    "D": "primitive",
    "P": "primitive",
    "T": "primitive",
}


def derive_composition(spec_class: Optional[str]) -> str:
    if not spec_class:
        return "unknown"
    first = spec_class[0].upper()
    return COMPOSITION_MAP.get(first, "unknown")


def derive_composition_confidence(
    spec_class: Optional[str],
    band_1um: Optional[float],
    band_2um: Optional[float],
) -> str:
    if not spec_class:
        # No class, but check if slopes/bands hint at something
        if band_1um is not None and band_2um is not None:
            return "low"
        return "unknown"

    first = spec_class[0].upper()
    composition = COMPOSITION_MAP.get(first)

    if composition is None:
        return "unknown"

    if band_1um is None and band_2um is None:
        return "medium"  # class exists but no band data to validate

    b1 = band_1um if band_1um is not None else 0.0
    b2 = band_2um if band_2um is not None else 0.0

    if composition in ("silicate", "basaltic"):
        # Silicate/basaltic: expect band_1um_depth > 0.05
        if b1 > 0.05:
            return "high"
        else:
            return "medium"
    elif composition == "carbonaceous":
        # Carbonaceous: expect low bands < 0.04
        if b1 < 0.04 and b2 < 0.04:
            return "high"
        else:
            return "medium"
    else:
        # metallic, metallic-or-enstatite, primitive, unknown
        return "medium"


def derive_accessibility(a_au: Optional[float], i_deg: Optional[float]) -> str:
    if a_au is None or i_deg is None:
        return "unknown"
    dv = hohmann_dv(a_au, i_deg)
    if dv < 6:
        return "easy"
    elif dv < 9:
        return "moderate"
    elif dv < 12:
        return "hard"
    else:
        return "extreme"


def derive_mass_tier(diameter_km: Optional[float]) -> str:
    if diameter_km is None:
        return "unknown_size"
    if diameter_km < 0.5:
        return "small"
    elif diameter_km < 2:
        return "medium"
    elif diameter_km < 10:
        return "large"
    else:
        return "massive"


def derive_anomaly(isoforest_score: Optional[float]) -> bool:
    if isoforest_score is None:
        return False
    return isoforest_score < -0.15


def parse_ca_date(date_str: str) -> Optional[datetime]:
    """Parse ca_date string like '2059-Mar-23 21:11' into a datetime."""
    try:
        return datetime.strptime(date_str, "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_data(conn: sqlite3.Connection) -> dict:
    """Load all relevant data from the DB into dictionaries keyed by designation."""
    # NEO asteroids (designation, name)
    cur = conn.execute("SELECT designation, name FROM neo_asteroids")
    neos = {row[0]: {"designation": row[0], "name": row[1]} for row in cur.fetchall()}

    # Orbital elements
    cur = conn.execute("SELECT designation, a, e, i FROM neo_orbit_elements")
    orbits: dict[str, dict] = {}
    for row in cur.fetchall():
        orbits[row[0]] = {"a_au": row[1], "e": row[2], "i_deg": row[3]}

    # Physical properties
    cur = conn.execute(
        "SELECT designation, h_mag, diameter_km, albedo, spec_class FROM neo_physical"
    )
    physical: dict[str, dict] = {}
    for row in cur.fetchall():
        physical[row[0]] = {
            "h_mag": row[1],
            "diameter_km": row[2],
            "albedo": row[3],
            "spec_class": row[4],
        }

    # Spectral features — aggregate per designation (average numeric fields)
    # Also take the most common hdbscan_label and the mean isoforest_score
    cur = conn.execute(
        """
        SELECT
            designation,
            AVG(slope_vis)         AS slope_vis,
            AVG(slope_nir)         AS slope_nir,
            AVG(band_depth_1um)    AS band_1um_depth,
            AVG(band_depth_2um)    AS band_2um_depth,
            AVG(isoforest_score)   AS anomaly_score,
            -- pick the most frequent hdbscan_label
            (
                SELECT hdbscan_label FROM neo_spectra_features sf2
                WHERE sf2.designation = nsf.designation
                GROUP BY hdbscan_label
                ORDER BY COUNT(*) DESC
                LIMIT 1
            ) AS hdbscan_label
        FROM neo_spectra_features nsf
        GROUP BY designation
        """
    )
    spectra: dict[str, dict] = {}
    for row in cur.fetchall():
        spectra[row[0]] = {
            "slope_vis": row[1],
            "slope_nir": row[2],
            "band_1um_depth": row[3],
            "band_2um_depth": row[4],
            "anomaly_score": row[5],
            "hdbscan_label": row[6],
        }

    # Close approaches: earliest future approach per designation
    cur = conn.execute(
        "SELECT designation, ca_date, dist_au FROM neo_close_approaches"
    )
    approaches: dict[str, tuple] = {}
    for row in cur.fetchall():
        desg, ca_date_str, dist_au = row
        ca_dt = parse_ca_date(ca_date_str)
        if ca_dt is None or ca_dt <= TODAY:
            continue
        if desg not in approaches or ca_dt < approaches[desg][0]:
            approaches[desg] = (ca_dt, dist_au)

    return {
        "neos": neos,
        "orbits": orbits,
        "physical": physical,
        "spectra": spectra,
        "approaches": approaches,
    }


def build_record(
    designation: str,
    data: dict,
) -> dict:
    neo = data["neos"][designation]
    orbit = data["orbits"].get(designation, {})
    phys = data["physical"].get(designation, {})
    spec = data["spectra"].get(designation, {})
    approach = data["approaches"].get(designation)

    a_au: Optional[float] = orbit.get("a_au")
    i_deg: Optional[float] = orbit.get("i_deg")
    e: Optional[float] = orbit.get("e")
    spec_class: Optional[str] = phys.get("spec_class")
    diameter_km: Optional[float] = phys.get("diameter_km")
    band_1um: Optional[float] = spec.get("band_1um_depth")
    band_2um: Optional[float] = spec.get("band_2um_depth")
    isoforest: Optional[float] = spec.get("anomaly_score")

    # Compute derived metrics
    dv: Optional[float] = None
    tt: Optional[float] = None
    if a_au is not None and i_deg is not None:
        dv = round(hohmann_dv(a_au, i_deg), 3)
        tt = round(transfer_time_yr(a_au), 3)

    next_year: Optional[int] = None
    next_dist: Optional[float] = None
    if approach is not None:
        next_year = approach[0].year
        next_dist = round(approach[1], 6)

    metrics = {
        "diameter_km": diameter_km,
        "albedo": phys.get("albedo"),
        "h_mag": phys.get("h_mag"),
        "spec_class": spec_class,
        "a_au": round(a_au, 4) if a_au is not None else None,
        "e": round(e, 4) if e is not None else None,
        "i_deg": round(i_deg, 4) if i_deg is not None else None,
        "delta_v_km_s": dv,
        "transfer_time_yr": tt,
        "next_approach_year": next_year,
        "next_approach_dist_au": next_dist,
        "slope_vis": round(spec.get("slope_vis"), 4) if spec.get("slope_vis") is not None else None,
        "slope_nir": round(spec.get("slope_nir"), 4) if spec.get("slope_nir") is not None else None,
        "band_1um_depth": round(band_1um, 4) if band_1um is not None else None,
        "band_2um_depth": round(band_2um, 4) if band_2um is not None else None,
        "hdbscan_label": spec.get("hdbscan_label"),
        "anomaly_score": round(isoforest, 4) if isoforest is not None else None,
    }

    composition = derive_composition(spec_class)
    tags = {
        "composition": composition,
        "composition_confidence": derive_composition_confidence(spec_class, band_1um, band_2um),
        "accessibility": derive_accessibility(a_au, i_deg),
        "mass_tier": derive_mass_tier(diameter_km),
        "anomaly": derive_anomaly(isoforest),
    }

    return {
        "designation": designation,
        "name": neo["name"],
        "metrics": metrics,
        "tags": tags,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate NEO summary tags JSON.")
    parser.add_argument(
        "--out",
        type=Path,
        default=config.OUTPUTS_DIR / "neo_summary_tags.json",
        help="Output JSON path (default: outputs/neo_summary_tags.json)",
    )
    args = parser.parse_args()

    conn = get_conn()
    print("Loading data from DB ...")
    data = load_data(conn)
    conn.close()

    designations = sorted(data["neos"].keys())
    print(f"  {len(designations)} NEOs found")

    records = []
    for desg in designations:
        records.append(build_record(desg, data))

    out_path: Path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2)

    n_named = sum(1 for r in records if r["name"])
    n_with_diameter = sum(1 for r in records if r["metrics"]["diameter_km"] is not None)
    n_anomaly = sum(1 for r in records if r["tags"]["anomaly"])
    print(
        f"\nWrote {len(records)} records to {out_path}\n"
        f"  n_named          = {n_named}\n"
        f"  n_with_diameter  = {n_with_diameter}\n"
        f"  n_anomaly        = {n_anomaly}"
    )


if __name__ == "__main__":
    main()
