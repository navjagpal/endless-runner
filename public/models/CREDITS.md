# Character model

`runner.glb` — from the **Animated Men Pack** by [Quaternius](https://quaternius.com/).

- Source: https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT
- License: **CC0 1.0 Universal (Public Domain)** — no attribution required,
  free for personal and commercial use. Credited here anyway, because
  knowing where an asset came from is worth more than the licence
  technically demands.
- Rig: 31 joints, single skinned mesh, no textures (vertex/material
  colours only — which is why it drops straight into the game's flat
  stylized palette without an atlas).
- Clips: `Clapping`, `Death`, `Idle`, `Jump`, `Punch`, `Run`,
  `RunningJump`, `Sitting`, `Standing`, `SwordSlash`, `Walk`.

The game binds `Run` → running and `RunningJump` → jumping. It has no
slide or stumble clip, so those two states are synthesized procedurally
(see `_applyProceduralLayer` in `src/game/player/CharacterRig.ts`).

## Swapping the character

Drop any rigged GLB in as `runner.glb` — clips are matched by keyword,
scale is normalized automatically, and missing states fall back to
procedural motion. Other characters worth knowing about:

- The other three men in the same pack (suit, long sleeves, hoodie),
  same rig and same clips.
- [Animated Woman](https://poly.pizza/m/nIItLV9nxS) (also Quaternius,
  CC0) has a different trade-off: it *does* have `Roll` and
  `HitRecieve`, which bind to the slide and stumble states, but it has
  **no jump clip**, so jumping would be procedural instead.
