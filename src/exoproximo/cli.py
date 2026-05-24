"""The `exo` CLI. One subcommand per pipeline."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import typer

from exoproximo.pipelines import fetch as fetch_mod
from exoproximo.pipelines import koi as koi_mod
from exoproximo.pipelines import neo_orbits as neo_orbits_mod
from exoproximo.pipelines import neo_spectra as neo_spectra_mod

app = typer.Typer(add_completion=False, help="Exoproximo pipelines.")


def _configure_logging(verbosity: int) -> None:
    level = {0: logging.WARNING, 1: logging.INFO}.get(verbosity, logging.DEBUG)
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@app.callback()
def main(verbose: int = typer.Option(0, "-v", count=True, help="Increase verbosity (-v, -vv).")) -> None:
    _configure_logging(verbose)


@app.command()
def fetch(refresh_koi: bool = typer.Option(False, help="Re-download the KOI cumulative table.")) -> None:
    """Bootstrap raw data (KOI; MITHNEOS verified, not auto-downloaded)."""
    result = fetch_mod.run(refresh_koi=refresh_koi)
    typer.echo(result)


@app.command("neo-spectra")
def neo_spectra(
    binzel_dir: Optional[Path] = typer.Option(None, help="Override Binzel data directory."),
    marsset_dir: Optional[Path] = typer.Option(None, help="Override Marsset data directory."),
    no_points: bool = typer.Option(False, help="Skip writing the raw spectra points table."),
) -> None:
    """Run the NEO spectra pipeline."""
    result = neo_spectra_mod.run(
        binzel_dir=binzel_dir, marsset_dir=marsset_dir, write_points=not no_points
    )
    typer.echo(result)


@app.command("neo-orbits")
def neo_orbits(
    cadence_days: int = typer.Option(7, help="Ephemeris cadence in days."),
    window_years: int = typer.Option(10, help="Ephemeris window in years centered on today."),
    limit: Optional[int] = typer.Option(None, help="Process only the first N designations (smoke testing)."),
    no_ephemerides: bool = typer.Option(False, "--no-ephemerides", help="Skip Horizons ephemeris fetch; only SBDB + CAD."),
) -> None:
    """Run the NEO orbits pipeline (SBDB + Horizons ephemerides + close approaches)."""
    result = neo_orbits_mod.run(
        cadence_days=cadence_days, window_years=window_years, limit=limit, no_ephemerides=no_ephemerides,
    )
    typer.echo(result)


@app.command()
def koi(
    koi_parquet: Optional[Path] = typer.Option(None, help="Override path to KOI parquet."),
) -> None:
    """Run the KOI classifier pipeline."""
    result = koi_mod.run(koi_parquet=koi_parquet)
    typer.echo(result)


if __name__ == "__main__":
    app()
