# 🏃 Endless Runner

A high-quality 3D endless runner PWA built with Babylon.js — inspired by Subway Surfers, designed for kids.

**▶ [Play Now](https://navjagpal.github.io/endless-runner/)**

## Features

- **Stylized 3D graphics** powered by Babylon.js 9 — gradient sky dome with sun and cartoon
  clouds, procedural textures (asphalt, grass, lit building facades), a painted-backdrop
  layer of hills / mountains / skyline / ocean / planets per zone, flat-shaded props with
  baked light gradients, bloom and a saturated colour grade
- **5 themed zones** — Meadow → Forest → City → Beach → Space, each with unique props, lighting, music, and sky
- **No death mechanic** — the character bumps on collision and keeps running, perfect for young players
- **Kid Mode** (default on) — see below
- **Rewards for clean running** — coin multiplier, a Star Power meter, magnet pickups
- **Vehicles as obstacles** — procedurally built cars, delivery trucks, and school buses, some with
  ramps onto the roof and a coin trail up top
- **Animated character** — rigged run/jump, procedural slide and stumble, dust at the heels
- **Coin collection** with sparkles, coin arcs over barriers, low coins under gantries
- **Milestone celebrations** and zone-change confetti; persistent best distance with "New Best!"
- **Big on-screen buttons** for touch devices (toggle in settings)
- **Pause menu** — tap the ⏸ button or press `Esc`
- **Procedural audio** — zone-specific music and sound effects via Web Audio API

## Kid Mode

The game is tuned for a six-year-old who should never lose but should still
have a reason to play well. With Kid Mode on (the default, toggle in ⚙️):

| What | Kid Mode | Off |
|------|----------|-----|
| Top speed | 17 m/s, reached slowly | 28 m/s |
| Gap between obstacles | ≥ 1.35 s of travel | ≥ 0.95 s |
| Ramps on trucks/buses | 55 % | 40 % |
| Magnet pickups | every ~170–260 m | every ~260–400 m |
| Coins lost on a bump | 5 (never below 0) | 10 % of coins, min 5 |

A **bump never ends the run**. It costs a little: the runner slows for a
moment, a handful of coins spill out, the coin multiplier resets and the
Star meter halves. Running clean pays: every dodge fills the ⭐ meter, a
full meter gives ~7 s of **Star Power** (can't be bumped, coins fly in, a
rainbow trails behind), and collecting coins without a bump climbs the
multiplier to x2 / x3 / x4.

## Dev shortcuts

Query parameters, useful for screenshots and balance checks:

| Param | Effect |
|-------|--------|
| `?auto=1` | Start the run immediately |
| `&dist=1010` | Start in the zone for that distance (0 / 500 / 1000 / 1500 / 2000) |
| `&star=1` | Start with Star Power on |
| `?sim=60` | Run 60 s of random-input autopilot before the first frame and log `[sim] …` to the console |

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Jump | `↑` / `Space` | Swipe up or tap |
| Slide | `↓` | Swipe down |
| Move left | `←` | Swipe left |
| Move right | `→` | Swipe right |
| Pause | `Esc` | ⏸ button |

## Install as PWA

The game works offline and can be installed directly to your home screen:

- **Android (Chrome):** tap the install banner or ⋮ → *Add to Home Screen*
- **iOS (Safari):** Share → *Add to Home Screen*
- **Desktop Chrome:** click the ⊕ icon in the address bar

## Models

Vehicles, trees, plants, rocks and buildings are CC0 models from
[Kenney](https://kenney.nl)'s Car Kit, Nature Kit and City Kit, merged into
one GLB per kit under `public/models/kits/` by `scripts/build-kits.mjs`
(`npm run assets:kits` downloads the packs and rebuilds them). Each kit is
loaded once at startup; every placement clones its meshes into the chunk
and the chunk is merged per material, so a chunk full of models costs the
same few draw calls as the old primitives. If a kit fails to load, the
original procedural primitives are used instead.

## The character model

The runner at `public/models/runner.glb` is a Kenney Mini Character (CC0,
skinned chibi with `sprint`, `jump` and `crouch` clips). See
`public/models/CREDITS.md`; pick a different one by changing `HERO` in
`scripts/build-kits.mjs`.

There is also a fully procedural character built from primitives, used
automatically whenever the GLB is missing or fails to parse. It's a real
fallback, not a stub: two-segment limbs with knee and elbow bend,
pelvis/chest counter-rotation, head stabilization, lean and landing
squash.

**To swap in a different character,** replace `public/models/runner.glb`
with any rigged GLB. On startup the game verifies the GLB magic bytes,
lazily pulls in the glTF loader, rescales the model to the ~1.5-unit
character the camera and collision are tuned around, and cross-fades
between clips.

Clips are matched by keyword, not exact name, so most sources work
untouched — `run`, `jump`, `slide`/`roll`, `stumble`/`hit` and several
synonyms all resolve, with combat and strafe clips blocklisted so they
can't bind by accident (see `CLIP_KEYWORDS` in
`src/game/player/CharacterRig.ts`). **Any state whose clip is missing is
synthesized procedurally**, so a model with only a run cycle still
works — the bundled one has no slide or stumble clip and those are
generated.

**From Mixamo** (free, needs an Adobe account) if you want all four
states as real animation:

1. Pick a character, then add `Running`, `Running Jump`, `Running
   Slide`, and `Stumble Backwards`.
2. Download each as FBX — **With Skin** for the first, **Without Skin**
   for the rest.
3. Merge into one file (Blender: import all, export glTF 2.0 with
   *Animation → Group by NLA Track*).
4. Save as `public/models/runner.glb`.

> **Note on bundle size:** the model pushes the PWA precache to ~7.2 MB
> against the 8 MB `maximumFileSizeToCacheInBytes` set in
> `vite.config.ts`. A much larger character will need that limit raised.

## Performance

The target device is an Amazon Fire tablet, so the renderer is budgeted
rather than maxed. `src/game/core/DeviceTier.ts` sniffs the GPU at
startup and picks a `low` / `mid` / `high` profile controlling render
scale, shadows, light count, bloom kernel and particle counts. Fire
tablets and known-weak mobile GPUs are pinned to `low`.

A framerate governor drops render resolution if the framerate stays
under 45 fps, and gives it back after a sustained stretch above 57. It
ignores backgrounded tabs and the first six seconds of a session, since
shader compilation makes early samples meaningless.

To test another tier without editing code, set the override in the
console and reload:

```js
localStorage.setItem('runner_tier_override', 'low')   // or 'mid' / 'high'
```

## Tech Stack

- [Babylon.js 9](https://www.babylonjs.com/) — 3D engine
- [TypeScript](https://www.typescriptlang.org/) — language
- [Vite 8](https://vitejs.dev/) — build tool
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — PWA & service worker
- GitHub Actions + GitHub Pages — CI/CD

## Local Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build
npm run preview    # preview production build
```
