# TODO

Open work after the v0.2.0 pipeline rewrite.

## Next session

- [ ] **Brainstorm sub-project B: asteroid belt explorer UI.**
  The SQLite DB (`outputs/exoproximo.db`) is the data contract. See
  `docs/superpowers/specs/2026-05-11-pipeline-modernization-design.md`
  §"Connection to sub-project B" for which tables the UI will consume.

## Data completeness

- [ ] **Run `exo neo-orbits` without `--limit` (~30 min wall time).**
  Verification only populated 5/667 asteroids. Full run fills
  `neo_orbit_elements`, `neo_physical`, `neo_close_approaches`, and
  `neo_ephemerides` for every designation that has a spectrum. JPL
  cache means re-runs are cheap.

## Pipeline tuning (non-blocking)

- [ ] **HDBSCAN clustering is bimodal** on real MITHNEOS data
  (1 tiny + 1 dominant cluster, ~30 noise). Try smaller
  `min_cluster_size` (e.g. 10), or `cluster_selection_epsilon`, or
  reconsider feature set. Inspect via the UI once it exists.
- [ ] **Eyeball `outputs/koi_calibration.png`.** Best model is HGB with
  test AUC 0.976 / Brier 0.06. If reliability diagram shows
  systematic over/under-confidence, add `CalibratedClassifierCV`
  wrapper or isotonic calibration.
- [ ] **Load MITHNEOS observational metadata** to populate
  `neo_asteroids.name`. Currently derives only designation + obs_date
  from filenames; `observationalparameters_marsset.csv` and
  `observationalparameters_binzel.csv` have proper names + telescope
  + observer info.

## Maintenance

- [ ] **`datetime.utcnow()` deprecation warnings** in Python 3.12.
  Three pipeline modules use it. Replace with
  `dt.datetime.now(dt.UTC).isoformat()` when convenient. Pure
  cosmetic.
- [ ] **Parallelize MITHNEOS bootstrap** if the manual download ever
  becomes automated. Currently `fetch.run()` only verifies the
  vendored bundle.

## Done (this session, v0.2.0)

- 19-task pipeline rewrite: notebooks → plain-Python package with `exo`
  CLI, SQLite output store, joblib model artifacts, TDD throughout.
- Spec: `docs/superpowers/specs/2026-05-11-pipeline-modernization-design.md`
- Plan: `docs/superpowers/plans/2026-05-11-pipeline-modernization.md`
- Pre-rewrite world preserved on `archive/pre-pipeline-master`.
