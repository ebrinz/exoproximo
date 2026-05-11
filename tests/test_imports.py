def test_package_imports():
    import exoproximo
    from exoproximo import config
    from exoproximo.features import spectra, orbits  # noqa: F401
    from exoproximo.ml import cluster, anomaly, classify  # noqa: F401
    from exoproximo.pipelines import fetch, neo_spectra, neo_orbits, koi  # noqa: F401

    assert exoproximo.__version__ == "0.2.0"
    assert config.RANDOM_STATE == 42
