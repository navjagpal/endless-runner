# 🏃 Endless Runner

A high-quality 3D endless runner PWA built with Babylon.js — inspired by Subway Surfers, designed for kids.

**▶ [Play Now](https://navjagpal.github.io/endless-runner/)**

## Features

- **3D graphics** powered by Babylon.js 9 with PBR materials, bloom, SSAO, and dynamic shadows
- **5 themed zones** — Meadow → Forest → City → Beach → Space, each with unique props, lighting, music, and sky
- **No death mechanic** — the character bumps on collision and keeps running, perfect for young players
- **Vehicles as obstacles** — procedurally built cars, delivery trucks, and school buses
- **Animated character** — runs, jumps, slides, and flashes on collision
- **Coin collection** with bobbing animations and particle effects
- **Milestone celebrations** at 100 m, 250 m, 500 m, 1 km, and beyond
- **Pause menu** — tap the ⏸ button or press `Esc`
- **Procedural audio** — zone-specific music and sound effects via Web Audio API

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

## The character model

The game ships a rigged, skinned character at `public/models/runner.glb`
— a CC0 model from Quaternius' Animated Men Pack (31 joints, 11 clips).
See `public/models/CREDITS.md` for provenance and swap options.

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
