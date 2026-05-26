"""Populate neo_asteroids.name from MITHNEOS observational CSVs.

Reads Binzel and Marsset observational parameter CSVs, builds a
designation->name map, and fills in NULL names in the database idempotently.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

# Allow running as a script without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from exoproximo import config
from exoproximo.io import get_conn

BINZEL_CSV = config.MITHNEOS_DIR / "observationalparameters_binzel.csv"
MARSSET_CSV = config.MITHNEOS_DIR / "observationalparameters_marsset.csv"


def parse_names_csv(path: Path) -> dict[str, str]:
    """Parse a MITHNEOS observational CSV and return designation->name map.

    CSV format (no header, comma-delimited):
      col 0: numbered designation (e.g. "132")
      col 1: provisional designation (e.g. "A922 XB")
      col 2: name (e.g. "Aethra", or "-" if absent)
    """
    name_map: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row:
                continue
            # Trim whitespace from each field
            row = [field.strip() for field in row]
            if len(row) < 3:
                continue
            designation = row[0].strip()
            name = row[2].strip()
            # Skip if designation is blank or non-numeric header artifact
            if not designation or not designation.isdigit():
                continue
            # Skip empty names, dash placeholders, or name == designation
            if not name or name == "-" or name == designation:
                continue
            name_map[designation] = name
    return name_map


def main() -> None:
    print(f"Parsing {BINZEL_CSV.name} ...")
    binzel_names = parse_names_csv(BINZEL_CSV)
    print(f"  {len(binzel_names)} names found in Binzel CSV")

    print(f"Parsing {MARSSET_CSV.name} ...")
    marsset_names = parse_names_csv(MARSSET_CSV)
    print(f"  {len(marsset_names)} names found in Marsset CSV")

    # Merge: Binzel takes precedence; Marsset fills gaps
    combined: dict[str, str] = {**marsset_names, **binzel_names}
    print(f"  {len(combined)} unique designations with names (after merge)")

    conn = get_conn()
    n_updated = 0
    for designation, name in combined.items():
        cur = conn.execute(
            "UPDATE neo_asteroids SET name = ? WHERE designation = ? AND name IS NULL",
            (name, designation),
        )
        n_updated += cur.rowcount
    conn.commit()
    conn.close()

    print(f"\nDone. n_updated = {n_updated}")


if __name__ == "__main__":
    main()
