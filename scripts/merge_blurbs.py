"""Merge a batch JSON of {designation: blurb} into outputs/neo_summary_blurbs.json."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
MASTER = ROOT / "outputs" / "neo_summary_blurbs.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=Path, help="Path to a JSON file containing {designation: blurb} entries to merge")
    args = parser.parse_args()
    cur = json.loads(MASTER.read_text()) if MASTER.exists() else {}
    incoming = json.loads(args.batch.read_text())
    cur.update(incoming)
    MASTER.write_text(json.dumps(cur, indent=2, ensure_ascii=False))
    print(f"merged {len(incoming)} blurbs; total now {len(cur)}")


if __name__ == "__main__":
    main()
