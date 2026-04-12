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
