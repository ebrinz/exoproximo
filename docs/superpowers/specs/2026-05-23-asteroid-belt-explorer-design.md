# Asteroid Belt Explorer UI — Design

**Date:** 2026-05-23
**Status:** Approved (brainstorm complete; awaiting user review of spec doc before implementation planning)
**Sub-project:** B (UI). Sits on top of sub-project A (pipeline) whose outputs in `outputs/exoproximo.db` are the data contract.

## Summary

A Next.js 15 static-export web app, living in `ui/` inside the existing `exoproximo` repo, that visualizes the project's NEO and KOI data as a portfolio-grade interactive piece. Two routes share a mission-control HUD design system:

- `/` — a 3D heliocentric scene rendering all 667 NEOs along their real Keplerian orbits, with hover/click selection, a mining-score ranking, a Hohmann Δv trajectory overlay, and a time scrubber.
- `/exoplanets` — a 2D Kepler-FOV sky map of all ~9,200 KOIs, sized by radius and colored by our classifier's `prob_planet`, with an interactive reliability diagram.

All orbital propagation runs in the browser via a 60-LOC port of `kepler.ts` from the sibling `technolabe/natal-chart-app`. No server, no ephemeris table needed — positions are computed live from the 6 orbital elements at whatever JD the user is viewing.

## Goals

- A single-clone, static-deploy portfolio piece that looks distinct and reads as deliberate.
- Honor the underlying data: real orbital elements, real spectral features, real classifier probabilities, real Earth close approaches.
- Sci-fi but honest: Hohmann Δv and the mining score are clearly labeled as textbook/heuristic, not industrial-grade.
- Reuse proven code from the sibling project (`kepler.ts`) to keep new math surface small.
- Each route is a strong single-purpose composition that screenshots well.

## Non-goals

- Industry-grade trajectory optimization (Lambert solver, real launch windows, gravity assists).
- Real-time / live data refresh from JPL or the NASA Exoplanet Archive.
- Mobile / touch tuning. Works incidentally; not designed for.
- Cross-browser parity beyond Chromium / Safari (Firefox should work but isn't a CI target).
- Combining NEO and KOI into one continuous 3D scene. They live on separate routes; see "Decisions" below.

## Inputs to the design (decisions made during brainstorm)

- **Purpose:** Portfolio / demo piece. Polish > edge-case correctness.
- **Central viz:** 3D heliocentric scene (Sun + orbits + asteroids).
- **Data gap:** Add a `--no-ephemerides` flag to `exo neo-orbits` and run it to populate all 667. We never use the ephemerides table in the UI.
- **Trajectory math:** Real Hohmann Δv (textbook formula + inclination penalty), real Earth close approaches from `neo_close_approaches`.
- **KOI placement:** Two-tab approach (not a celestial-sphere far wall). Cygnus FOV at real RA/Dec on its own route, with native 2D treatment. Rejected unified-view because real KOI RA/Dec clusters in a tiny patch and would leave ⅔ of camera angles empty.
- **Repo layout:** `ui/` subdir in `exoproximo` (single repo).
- **Tech stack:** Next.js 15 (static export) + React Three Fiber + drei + TypeScript + Tailwind.
- **Data delivery:** Build-time JSON export from SQLite. Pure static.

## Project layout

```
exoproximo/
├── src/exoproximo/                          # existing Python package
├── outputs/exoproximo.db                    # existing — data contract
├── scripts/
│   └── export_ui_data.py                    # NEW — reads .db, writes JSON
└── ui/                                      # NEW — Next.js 15 app
    ├── package.json                         # "prebuild": calls export_ui_data
    ├── next.config.ts                       # output: 'export'
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── playwright.config.ts                 # local-only, not in CI
    ├── public/data/                         # generated; gitignored
    │   ├── neos.json
    │   ├── koi.json
    │   ├── close_approaches.json
    │   ├── meta.json
    │   └── spectra/{designation}.json
    └── src/
        ├── app/
        │   ├── layout.tsx                   # shared chrome + nav
        │   ├── page.tsx                     # `/` NEO belt
        │   └── exoplanets/page.tsx          # `/exoplanets` KOI
        ├── components/
        │   ├── chrome/                      # top bar, bottom HUD strip
        │   ├── belt/                        # R3F scene + panels
        │   │   ├── Scene.tsx
        │   │   ├── Sun.tsx
        │   │   ├── Earth.tsx
        │   │   ├── EarthOrbit.tsx
        │   │   ├── NeoOrbits.tsx
        │   │   ├── NeoInstances.tsx
        │   │   ├── SelectionHalo.tsx
        │   │   ├── TrajectoryArc.tsx
        │   │   ├── Starfield.tsx
        │   │   ├── TimeScrubber.tsx
        │   │   ├── SelectedPanel.tsx
        │   │   ├── RankingPanel.tsx
        │   │   └── SpectrumChart.tsx
        │   └── koi/
        │       ├── SkyMap.tsx
        │       ├── SelectedKoiPanel.tsx
        │       ├── TopCandidatesPanel.tsx
        │       └── ReliabilityDiagram.tsx
        ├── lib/
        │   ├── kepler.ts                    # port of technolabe kepler.ts
        │   ├── orbits.ts                    # ellipse sampling, propagation batch
        │   ├── hohmann.ts                   # Δv math
        │   ├── mining-score.ts              # composite heuristic
        │   ├── data.ts                      # typed JSON loaders
        │   ├── types.ts                     # shared TS types
        │   └── time.ts                      # JD <-> Date helpers
        └── styles/globals.css
```

`ui/public/data/` is gitignored. `scripts/export_ui_data.py` regenerates it from `outputs/exoproximo.db` on every `npm run build` via the `prebuild` hook.

### Dependencies (`ui/package.json`)

Runtime: `next@15`, `react@19`, `react-dom@19`, `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `clsx`, `zustand` (light global state for selection + JD).

Note: technolabe uses `astronomy-engine` for major planets, but for this UI we propagate **Earth** through `kepler.ts` with textbook J2000 elements (same approach technolabe's `asteroids.ts` uses for Ceres et al.). That removes a dependency and keeps the propagation path identical for Earth and asteroids.

Dev: `typescript`, `tailwindcss`, `eslint`, `vitest`, `@playwright/test`, `@types/three`.

## Architecture

Strict separation between pure math, data loaders, and React components:

```
app/* + components/*    (React, R3F — view layer)
        │
        ▼
lib/orbits.ts, lib/hohmann.ts, lib/mining-score.ts
        │                                  (pure functions, no React)
        ▼
lib/kepler.ts                              (pure math, ported)
        │
        ▼
lib/data.ts                                (typed fetch + parse from /data/*)
```

### Invariants

- `lib/` modules have zero React imports and zero DOM access.
- All randomness, if any, is deterministic (seeded). No `Math.random()` in render paths.
- The 3D canvas owns no persistent state of its own; it reads `jd` and `selectedDesignation` from a Zustand store and renders.
- Component files stay under ~150 LOC; split when they grow.

## Data contract

The single source of truth is `outputs/exoproximo.db`. `scripts/export_ui_data.py` projects it into the JSON files below. The UI never reads SQLite directly.

### `public/data/neos.json`

Array of 667 records:

```ts
type NeoRecord = {
  designation: string;        // e.g. "523934"
  name: string | null;
  elements: {
    a: number;                // AU
    e: number;
    i: number;                // deg
    om: number;               // deg (longitude of ascending node, Ω)
    w: number;                // deg (argument of periapsis, ω)
    ma: number;               // deg (mean anomaly at epoch)
    epoch: number;            // JD
    n: number;                // deg/day (mean motion); computed if SBDB absent
  };
  physical: {
    h_mag: number | null;
    diameter_km: number | null;
    albedo: number | null;
    spec_class: string | null;
  } | null;
  spectral: {
    slope_vis: number;
    slope_nir: number;
    band_depth_1um: number;
    band_center_1um: number;
    band_depth_2um: number;
    band_center_2um: number;
    pc1: number;
    pc2: number;
    hdbscan_label: number;
    isoforest_score: number;
  };
};
```

Source rows: `neo_asteroids ⨝ neo_orbit_elements ⨝ neo_physical ⨝ neo_spectra_features`. For asteroids with multiple `neo_spectra_observations`, the export picks the row with the most-recent `obs_date` (NULL-last); if tied, the larger `obs_id`. `n` is computed as `0.9856076686 / sqrt(a^3)` if SBDB didn't return one explicitly (Gauss's relation for AU/day).

### `public/data/koi.json`

Array of ~9,200 records:

```ts
type KoiRecord = {
  kepoi_name: string;
  kepler_name: string | null;
  ra: number;                 // deg
  dec: number;                // deg
  koi_disposition: 'CONFIRMED' | 'CANDIDATE' | 'FALSE POSITIVE';
  koi_period: number | null;
  koi_prad: number | null;
  koi_teq: number | null;
  koi_steff: number | null;
  koi_srad: number | null;
  prob_planet: number | null;       // from latest model_run_id; null if not predicted
};
```

Source: `koi_objects ⨝ koi_predictions` on `kepoi_name`, picking the latest `model_run_id`. `ra` and `dec` come from the widened `koi_objects` schema (see Pipeline-side changes).

### `public/data/close_approaches.json`

Flat array of all rows from `neo_close_approaches`:

```ts
type CloseApproachRecord = {
  designation: string;
  body: string;             // typically "Earth"
  ca_date: string;          // ISO 8601 or JPL's "YYYY-Mon-DD HH:MM"
  dist_au: number;
  v_rel_km_s: number;
};
```

### `public/data/spectra/{designation}.json`

Lazy-loaded on selection. ~250 points per file, ~5 KB each:

```ts
type SpectrumPoint = { wavelength: number; reflectance: number; error: number };
type SpectrumFile = SpectrumPoint[];
```

### `public/data/meta.json`

For the bottom HUD strip:

```ts
type Meta = {
  git_sha: string;            // from latest meta_runs row
  last_run_at: string;        // ISO 8601
  elements_age_days: number;  // days since the neo_orbits run that populated elements
  n_neos: number;
  n_koi: number;
};
```

## Pipeline-side prerequisites

Three small Python-side changes land before any UI work begins.

### P1. `exo neo-orbits --no-ephemerides` flag

In `src/exoproximo/pipelines/neo_orbits.py`, add a CLI flag that short-circuits the per-designation `Horizons(...).ephemerides()` loop. The pipeline still does SBDB (`neo_orbit_elements` + `neo_physical`) and CAD (`neo_close_approaches`). Cuts wall time from ~30 min to ~5–10 min for 667 designations.

Run once after merge:

```bash
uv run exo neo-orbits --no-ephemerides
```

### P2. KOI schema widening

Add `ra REAL` and `dec REAL` columns to `koi_objects`. Update the persist step in `src/exoproximo/pipelines/koi.py` to keep `ra` and `dec` (they're already in the cumulative TAP query result; we just need to stop dropping them at persist time). Re-run:

```bash
uv run exo koi
```

### P3. `scripts/export_ui_data.py`

New script. Reads `outputs/exoproximo.db`. Writes the JSON files described in the data contract section. Idempotent — overwrites existing output. Exits non-zero if any required table is empty (loud failure beats producing an empty UI).

Wired into `ui/package.json`:

```json
"scripts": {
  "prebuild": "uv run python ../scripts/export_ui_data.py",
  "predev":   "uv run python ../scripts/export_ui_data.py",
  "build":    "next build",
  "dev":      "next dev"
}
```

## Route `/` — NEO Belt Explorer

### Scene graph (R3F)

```tsx
<Canvas camera={{ position: [0,5,10], fov: 45 }}>
  <Starfield />                            // decorative distant points
  <Sun />                                  // glowing sphere + pointLight at origin
  <EarthOrbit />                           // static ellipse
  <Earth jd={jd} />                        // propagated each frame
  <NeoOrbits asteroids={neos} />           // 667 ellipses, single BufferGeometry
  <NeoInstances jd={jd} asteroids={neos} /> // 1 instancedMesh, 667 instances
  {selected && <SelectionHalo … />}
  {selected && <TrajectoryArc earthPos={…} target={…} />}
  <OrbitControls />
  <EffectComposer><Bloom /></EffectComposer>
</Canvas>
```

### Time-stepping

`jd` is global state (Zustand). A single `useFrame` in `NeoInstances` reads `jd`, propagates Earth + all 667 NEOs via `kepler.ts`, and writes positions into the instancedMesh matrix buffer. ~33k FLOPs per frame; trivial.

Time scrubber range: `jd_now − 5y` to `jd_now + 50y`, step 1 day. Play speeds: `1d/s`, `1mo/s`, `1y/s`. Numeric labels in the UI update at 10fps (less jitter than 60fps); positions update at 60fps.

### Orbit ellipses

For each asteroid, sample 128 points by sweeping mean anomaly 0→360° at fixed epoch. Concatenate into one BufferGeometry (~85k vertices). Faint by default (color `--rule`, opacity 0.25); the selected asteroid's orbit goes bright (color `--accent`, opacity 1).

### Asteroid rendering

Single low-poly icosahedron geometry, 667 instances. Per-instance:
- **Scale** = `clamp(log10(diameter_km + 0.1) * sizeMultiplier, minPx, maxPx)`. Asteroids without `diameter_km` get a fixed small dot.
- **Color** encodes `spec_class`:
  - S → `--accent` (cyan)
  - C / B → `--warn` (amber)
  - M / X → `--metal` (magenta)
  - Q / V → `--green`
  - others / null → `--dim`
- **Glow intensity** encodes `isoforest_score` (anomalies stand out without a legend).

### Selection

Raycast against the instancedMesh via R3F's `onPointerMove` / `onClick` on the mesh. Hover sets a transient `hoverDesignation`; cursor-follow HTML tooltip near the pointer:

```
[523934] · S · 0.9 km
```

Click sets `selectedDesignation` (persists until next click or empty-space click). On select:
- Camera tweens to a 3/4 view of the target (1.2s ease-out cubic).
- Left panel (`SelectedPanel`) populates.
- Right panel scrolls the matching ranking row into view.
- `TrajectoryArc` mounts.

### Trajectory arc

Quadratic Bezier from Earth position to target position, control point lifted above the ecliptic. Animated dashed line ("marching ants" via shader-driven `dashOffset`). Label at midpoint:

```
Δv ≈ 6.3 km/s   T ≈ 1.4 yr
```

`Δv` from `lib/hohmann.ts` (see below). Transfer time `T = π * sqrt(a_t³ / μ_sun)` where `a_t = (r_earth + a_target) / 2`. Numbers update live as `jd` changes (because `r_earth` from elliptical Earth orbit varies, though only slightly).

### Hohmann Δv math (`lib/hohmann.ts`)

```ts
// μ_sun in AU³/yr² so we get v in AU/yr; convert to km/s with 4.74 km/s per AU/yr.
const MU_SUN_AU3_YR2 = 4 * Math.PI ** 2;
const AU_PER_YR_TO_KM_S = 4.74047;

export function hohmannDv(targetA: number, targetIDeg: number): number {
  const r1 = 1.0;
  const r2 = targetA;
  const v1 = Math.sqrt(MU_SUN_AU3_YR2 / r1);
  const v2 = Math.sqrt(MU_SUN_AU3_YR2 / r2);
  const a_t = (r1 + r2) / 2;
  const v_peri = Math.sqrt(MU_SUN_AU3_YR2 * (2 / r1 - 1 / a_t));
  const v_apo  = Math.sqrt(MU_SUN_AU3_YR2 * (2 / r2 - 1 / a_t));
  const dv_burn = Math.abs(v_peri - v1) + Math.abs(v2 - v_apo);
  const i_rad = (targetIDeg * Math.PI) / 180;
  const dv_incl = 2 * v2 * Math.sin(i_rad / 2);
  return (dv_burn + dv_incl) * AU_PER_YR_TO_KM_S;
}
```

Order-of-magnitude accurate; aerospace people will recognize the formula. UI tooltip labels it `(Hohmann + plane change, heliocentric circular approx)`.

### Mining score (`lib/mining-score.ts`)

```ts
const SPEC_MULTIPLIER: Record<string, number> = {
  M: 3.0, C: 2.5, B: 2.0, S: 1.0, Q: 1.0, V: 1.0, X: 2.5,
};

export function miningScore(record: NeoRecord, dvKmS: number): number {
  const dia = record.physical?.diameter_km ?? 0.2;
  const cls = record.physical?.spec_class?.[0] ?? '';
  const mult = SPEC_MULTIPLIER[cls] ?? 0.5;
  return (dia / Math.max(dvKmS, 1.0)) * mult;
}
```

Labeled in the UI as `🜨 MINING SCORE (heuristic)`. Re-sortable; default sort is by this score descending.

### Panel content (`SelectedPanel`, `RankingPanel`)

**SelectedPanel** (left, ~360 px wide):

```
S E L E C T E D   A S T E R O I D
─────────────────────────────────
[523934]    "..." (if name)
S-type · 0.9 km · albedo 0.21
H mag 18.4

S P E C T R U M
  ╱╲___╱╲___    (inline mini chart, 250 pts)
  0.5     2.5 µm

S P E C T R A L   F E A T U R E S
slope_vis    0.42
slope_nir   -0.08
band_1µm     depth 0.13 · center 0.96 µm
band_2µm     depth 0.07 · center 2.04 µm
cluster      3
anomaly      false

T R A J E C T O R Y   F R O M   E A R T H
Δv ≈ 6.3 km/s   T ≈ 1.4 yr

N E X T   E A R T H   A P P R O A C H
2059-Mar-23   0.045 AU (17.6 LD)   12.0 km/s
```

**RankingPanel** (right, ~320 px wide), default sort by mining score descending, top 20 visible, scroll for the rest:

```
M I N I N G   T A R G E T S         🜨 score ↓
──────────────────────────────────────────────
designation   class  Δv   diam   score
[523934]      S      6.3  0.9    0.14
[101955]      B      5.7  0.5    0.18
…
```

Click row → selects in 3D + camera tween. Columns sortable.

### Time scrubber (`TimeScrubber`, bottom)

```
[◀◀]  [▶]  ●━━━━━━━━○━━━━━━━ +12y 4mo from now  [RESET TO NOW]
       ↑                       ↑
    play/pause              slider thumb
```

Slider range is computed from `Date.now()` at page load (so it follows the visitor's clock). Drag-scrub re-propagates instantly. Play loop uses `requestAnimationFrame` to advance `jd` at the current speed.

## Route `/exoplanets` — KOI Candidates

### Layout

```
┌──────────────────────────────────┬─────────────────────────┐
│        KEPLER FIELD              │  SELECTED KOI           │
│        (Cygnus, RA 280–310°)     │  ...                    │
│                                  ├─────────────────────────┤
│        · · ··  · ·  · · ·        │  TOP CANDIDATES         │
│       · ✦ ·· ·· ✦· · · ·· ·       │  (prob_planet ↓)        │
│        ·· · · ··· ·· ··          │                         │
├──────────────────────────────────┴─────────────────────────┤
│  RELIABILITY DIAGRAM (interactive)                          │
└─────────────────────────────────────────────────────────────┘
```

### Sky map (`SkyMap`)

Canvas 2D (not WebGL — 9,200 points is fine in 2D). Axes: RA (x) and Dec (y), zoomed to the Kepler quadrants (~115 deg²). Each KOI:

- **Position** = (ra, dec).
- **Size** ∝ `koi_prad` (clamped to a visible range, default for null).
- **Color** = ramp on `prob_planet` from cool (`--alert` rose for low) to hot (`--accent` cyan for high). KOIs with null prediction render in `--dim`.
- **Marker shape** by ground-truth disposition: filled circle = CONFIRMED, ring = CANDIDATE, ✕ = FALSE POSITIVE.

Background: faint Cygnus constellation outline + Kepler module boundary box.

Hover → tooltip; click → fills right panel, highlights the same row in the top-candidates list.

### Reliability diagram (`ReliabilityDiagram`, bottom)

10 equal-width bins on predicted probability (0–1). Plot bin observed-CONFIRMED-fraction vs bin midpoint. Reuses the math behind `outputs/koi_calibration.png` but interactive. Hover a bin → KOIs in that bin glow in the sky map above.

### Panels

**SelectedKoiPanel**: kepoi_name, kepler_name, period, prad, teq, disposition (with chip color), our model's `prob_planet`, host star params (Teff, R☉, logg, [Fe/H]).

**TopCandidatesPanel**: scrollable list of model's top-50 by `prob_planet`, filtered to `koi_disposition = 'CANDIDATE'`. Clicking a row selects in the sky map.

## Shared chrome

Mounted in `app/layout.tsx`:

- **Top-left**: `EXOPROXIMO · v0.3` in IBM Plex Mono.
- **Top-right**: `[BELT]` / `[EXOPLANETS]` tab links, current one lit (`--accent`).
- **Bottom strip**: pipeline metadata pulled from `meta.json`:
  ```
  pipeline: neo_orbits · last run: 2026-05-23 · 667 NEOs · 9201 KOI · git: 0d9f398
  ```
  Reads as telemetry, not chrome decoration.

Tab switch is instant — both JSON files (~350 KB total gzipped) preload on initial visit.

## Design system

### Palette

```
--bg:     #05070d   (near-black, blue undertone)
--fg:     #e8eef5   (off-white)
--dim:    #6b7385   (secondary text, faint UI)
--rule:   #1a2233   (panel borders, faint grid)
--accent: #7ee8ff   (cyan — primary highlights, S-type)
--warn:   #ffb547   (amber — anomalies, C-type)
--alert:  #ff5e7a   (rose — high Δv warnings, false positives)
--metal:  #b18cff   (magenta — M-type / X-class)
--green:  #8af0a7   (Q-type, model "true positive")
```

No gradients in chrome; gradients only inside the 3D canvas (bloom, glow).

### Typography

- UI: **IBM Plex Mono** for everything — labels, numbers, panels. Sizes: 11 / 13 / 16 / 22 px.
- Display: **Space Grotesk** at 32–48 px for tab titles only (`BELT EXPLORER`, `KOI CANDIDATES`). Sparingly.

### Chrome motifs

- 1px hairline rules between panels, color `--rule`.
- Numeric values with units in `--dim`, thin-space-separated: `2.34 km`, `5.7 km/s`, `0.04 AU`.
- Identifiers bracketed: `[523934]`, `[K00752.01]`.
- Section labels in spaced caps: `S E L E C T E D   A S T E R O I D`.
- Status pills are flat 1px-bordered rectangles, color = data class.

### Motion

- Easings: `cubic-bezier(.2,.7,.3,1)` for camera and panel transitions.
- Camera tweens 1.2s. Panel fade-in 200ms. Hover state 0ms (instant).
- No spinners. Skeleton lines for the inline spectrum chart while it loads.

### Empty / loading states

Every panel defines an empty state explicitly:
- Left panel pre-selection: `── select a target ──` in dim caps.
- Right panel during initial JSON load: skeleton rows.
- Spectrum chart pre-load: dashed horizontal baseline + `── loading spectrum ──` in dim text.

## Testing strategy

### Python (existing pytest)

- `test_neo_orbits_no_ephemerides.py` — pipeline runs with `--no-ephemerides` → `neo_ephemerides` row count unchanged, other three tables written. Uses existing JPL fixtures.
- `test_koi_persists_ra_dec.py` — persisted DF has `ra` and `dec`, all non-null.
- `test_export_ui_data.py` — feed `tests/fixtures/exoproximo_small.db` → assert every expected output file exists, row counts match, JSON parses, schema fields present.

### TypeScript (Vitest)

- `kepler.test.ts` — propagate Ceres at J2000.5; assert x/y/z within 1e-3 AU of values from the technolabe test suite. The port should pass identical numbers.
- `hohmann.test.ts` — Earth→Mars Δv ≈ 5.6 km/s; Earth→Vesta ≈ 5.1 km/s. Tolerance ±0.3 km/s.
- `mining-score.test.ts` — known-input expected-output table; invariants (monotonic in diameter, monotonic decreasing in Δv).
- `data-loaders.test.ts` — fixture JSON in known-bad shapes → loader rejects with a clear error; known-good shapes → typed values returned.

### Browser smoke (Playwright, one spec, local-only)

- Open `/`, wait for canvas, assert no console errors, screenshot.
- Open `/exoplanets`, wait for canvas, assert no console errors, screenshot.
- Navigate to `/#sel=523934` (debug-mode designation selector) → assert left panel populates within 2s.

### Deliberately not tested

- R3F component rendering (too brittle; visual review covers it).
- Real network calls to NASA / JPL (already mocked in pipeline tests).
- Cross-browser. Chromium-only via Playwright is fine for a portfolio piece.
- Mobile / touch. The 3D scene works incidentally; not tuned. Flag as known limitation in `ui/README.md`.

### CI

Existing `uv run pytest` keeps running. Add one GitHub Action job that runs `npm run lint && npm run test && npm run build` inside `ui/`. The Playwright spec runs locally via `npx playwright test` only — not in CI.

## Error handling

- **`scripts/export_ui_data.py`**: exits non-zero if any required table is empty or missing; CLI prints which table and suggests the pipeline command to re-run.
- **UI fetch failures**: each panel renders an inline error state (`── data unavailable ──`, color `--alert`). No app-wide error boundary swallowing everything.
- **Bad JSON shape**: `lib/data.ts` validates with a small runtime guard (hand-written, no Zod dependency); throws an error with the offending field path; the calling component shows the error state.
- **No spectrum file for a designation**: spectrum chart shows `── no spectral data ──`. The left panel's other fields still render.
- **No `prob_planet` for a KOI**: render in `--dim` and label `(not classified)`.

## Performance budget

- **First contentful paint**: under 1.5s on a typical laptop. Both top-level JSONs preload; the 3D canvas mounts immediately with the data already in memory.
- **Steady-state frame rate**: 60fps with 667 NEOs animating + bloom postprocessing. The `useFrame` propagation is the hot path; benchmarked target is < 2ms / frame.
- **Spectrum file load**: < 100ms from click to chart visible (single fetch, ~5 KB, same origin).

## Reproducibility

- `ui/package-lock.json` pins the JS dependency tree.
- `scripts/export_ui_data.py` records `meta.json` with `git_sha`, `last_run_at`, and `elements_age_days` so the rendered UI always exposes the data freshness honestly.
- The Python pipeline already records `git_sha` in `meta_runs`; the export script reads the latest row and propagates it.

## Migration plan (high level)

Detailed implementation steps will be produced by the writing-plans skill. The high-level order:

1. Pipeline P1: `--no-ephemerides` flag + test.
2. Pipeline P2: KOI schema widening + test.
3. Pipeline P3: `scripts/export_ui_data.py` + test.
4. Run pipelines to populate the DB; run export script; commit (data dir gitignored).
5. Scaffold `ui/` with Next.js 15 + R3F + Tailwind; verify static export.
6. Port `lib/kepler.ts` from technolabe + `kepler.test.ts`.
7. `lib/orbits.ts`, `lib/hohmann.ts`, `lib/mining-score.ts`, `lib/data.ts` + tests.
8. NEO scene: Sun, Earth, EarthOrbit, NeoOrbits, NeoInstances; manual visual review.
9. Selection wiring + `SelectedPanel` + `SpectrumChart` lazy-load.
10. `RankingPanel`, `TrajectoryArc`, `TimeScrubber`.
11. KOI route: `SkyMap`, panels, `ReliabilityDiagram`.
12. Chrome (top nav, bottom HUD), design system polish.
13. Playwright smoke spec, README, deploy target verification.

## Open questions for the implementation plan

- Do we want a small "ABOUT THE DATA" modal accessible from the bottom HUD that explains MITHNEOS, the classifier, and the Hohmann approximation? (Nice for non-technical viewers; defer to plan.)
- Should the `RankingPanel` filter out asteroids with null `diameter_km`, or render them at the bottom with dimmed score? (Probably the latter; defer to plan.)

## Connection back to sub-project A

This UI consumes — and only consumes — the SQLite output from sub-project A. The three small pipeline-side changes (P1–P3) close the data gap and add `ra`/`dec` to the KOI table, both of which are natural follow-ups to A's TODOs. After this UI lands, the README on `master` updates to point to the deployed URL and `ui/` directory.
