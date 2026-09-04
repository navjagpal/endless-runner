# Character models

`characters/*.glb` — all twelve characters from the **Mini Characters** pack
by [Kenney](https://kenney.nl/assets/mini-characters), built by
`scripts/build-kits.mjs`. The default runner is `female-b`.

- License: **CC0 1.0 Universal (Public Domain)** — no attribution required,
  free for personal and commercial use. Credited here anyway.
- Rig: skinned chibi, one colormap texture, ~144 KB.
- Clips used: `sprint` → running, `jump` → jumping, `crouch` → sliding.
  There is no stumble clip, so the bump reaction is procedural (flash,
  particles, hit-stop) over the run cycle.

Names and unlock costs are in `src/game/player/Characters.ts`. The
previous runner (Quaternius' Animated Men Pack, also CC0) is in git
history.

The scenery and vehicle kits are documented in `kits/CREDITS.md`.
