"""CLI entry point for bootstrap fetching."""
from __future__ import annotations

import argparse
import logging

from exoproximo.pipelines import fetch


def main() -> None:
    ap = argparse.ArgumentParser(description="Bootstrap exoproximo data")
    ap.add_argument("--refresh-koi", action="store_true", help="re-download KOI cumulative table")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = fetch.run(refresh_koi=args.refresh_koi)
    print(result)


if __name__ == "__main__":
    main()
