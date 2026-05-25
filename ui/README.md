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

## Known limitations

- Tuned for desktop Chromium. Touch input works incidentally via OrbitControls but isn't designed for.
- All orbital propagation is 2-body Keplerian; positions are accurate to arcseconds over months,
  degrade over decades. Re-run `exo neo-orbits` periodically to refresh element fits.
- All ~9,200 KOIs are in the Kepler field (~115 deg² in Cygnus); the sky map zooms to that patch.
