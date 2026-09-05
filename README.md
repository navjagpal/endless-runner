# Kids' games

Two browser games for two kids, one shared engine, one GitHub Pages site:
**https://navjagpal.github.io/endless-runner/**

| Folder | What |
|--------|------|
| `apps/runner/` | **Runner** — an endless runner for a six-year-old (Kid Mode, never dies). [README](apps/runner/README.md) |
| `apps/vroom/`  | **Vroom Road** — an endless drive with jumps for a four-year-old (garage of vehicles, ramps, traffic, puddles, car washes, never loses). [README](apps/vroom/README.md) |
| `packages/engine/` | `@kids/engine`: Babylon setup and device tiers, toon/curve style plugin, outlines, sky, terrain, Kenney kit loader, procedural textures, chunk merging, audio (samples + generative music), celebration pops, icons |
| `site/` | The landing page and a kill-switch for the old root service worker |
| `scripts/` | `build-kits.mjs <app>` builds model and sound kits from Kenney's CC0 packs; `build-site.mjs` builds everything into `dist/`; `verify-vertical.mjs` checks the runner's jump rules |

## Develop

```bash
npm install
npm run dev:runner     # http://localhost:5173
npm run dev:vroom      # http://localhost:5174
npm run typecheck      # every workspace
npm run build          # dist/ = landing page + dist/runner + dist/vroom
```

Each app is its own PWA with its own scope, so they install as separate
icons. The games share the origin's localStorage, so saved progress from
the old single-game URL carries over.
