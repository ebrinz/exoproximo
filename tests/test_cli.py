from __future__ import annotations

from typer.testing import CliRunner

from exoproximo.cli import app


runner = CliRunner()


def test_cli_help():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "fetch" in result.stdout
    assert "neo-spectra" in result.stdout
    assert "neo-orbits" in result.stdout
    assert "koi" in result.stdout


def test_cli_neo_spectra_help():
    result = runner.invoke(app, ["neo-spectra", "--help"])
    assert result.exit_code == 0
