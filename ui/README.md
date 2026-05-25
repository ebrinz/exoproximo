# Exoproximo UI

Next.js 15 static-export app: 3D NEO belt explorer (`/`) and Kepler-FOV KOI map (`/exoplanets`).

## Develop

```bash
cd ui
npm install
npm run dev     # http://localhost:3000
```

The `predev`/`prebuild` hooks regenerate `public/data/*.json` from
`../outputs/exoproximo.db` via `../scripts/export_ui_data.py`. If you see
"data unavailable", run the upstream pipelines:

```bash
cd ..
uv run exo neo-orbits --no-ephemerides
uv run exo koi
```

## Build & deploy

```bash
npm run build   # produces ./out, fully static
```

Deploy `out/` to any static host (Vercel, Netlify, GitHub Pages, S3, ...).

## Test

```bash
npm run test    # vitest (unit + math)
```

Playwright smoke spec is local-only (not in CI):

```bash
npm run build && npx playwright install chromium
npx playwright test
```

## Deploy to GitHub Pages

The repo has a workflow at `.github/workflows/pages.yml` that builds and
deploys on push to `master`. To enable it:

1. Push the `feat/asteroid-belt-ui` branch's commits to `master`.
2. In the GitHub repo: **Settings → Pages → Source: GitHub Actions**.
3. The first deploy runs automatically on the next push to `master`.

Site lands at `https://ebrinz.github.io/exoproximo/`.

The deploy bakes in `NEXT_PUBLIC_BASE_PATH=/exoproximo` so all static
assets and data fetches resolve under that prefix. Local `npm run dev`
continues to work without the prefix because the env var is unset.

The data files in `public/data/` are committed snapshots. To refresh
them after a pipeline re-run:

```bash
cd ..
uv run python scripts/export_ui_data.py --out ui/public/data
git add ui/public/data
git commit -m "data: refresh UI snapshot"
```

## Known limitations

- Tuned for desktop Chromium. Touch input works incidentally via OrbitControls but isn't designed for.
- All orbital propagation is 2-body Keplerian; positions are accurate to arcseconds over months,
  degrade over decades. Re-run `exo neo-orbits` periodically to refresh element fits.
- All ~9,200 KOIs are in the Kepler field (~115 deg² in Cygnus); the sky map zooms to that patch.
