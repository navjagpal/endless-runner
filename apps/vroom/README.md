# 🚒 Vroom Road

An endless drive for a four-year-old. Pick a vehicle, steer between three
lanes, jump off everything, honk. Nothing can end the run.

**▶ [Play](https://navjagpal.github.io/endless-runner/vroom/)**

## The rules (all of them)

| Do | How |
|----|-----|
| Steer | Tap the left or right half of the screen (`←` `→` on a keyboard) |
| Jump | The big green **JUMP** button (`Space` / `↑`) — a hop; ramps launch you properly |
| Action | The big pink button (`Enter` / `↓`): siren on the police car, fire truck and ambulance; horn on the cars; wheelie on the motorcycle; bounce on the monster truck |

- **Ramps** every hundred metres or so, with a coin arc over each. Hang time
  is shown while airborne; a long flight earns "Big air!" and bonus coins.
- **Traffic** drives slowly ahead. Overtaking earns coins; clipping a car
  is a bonk and a wobble and a moment's slowdown. Jumping clean over one
  works too.
- **Puddles** splash, **car washes** bubble and pay coins.
- **Worlds** loop forever: countryside → city → beach → mountains.
- **Coins** only ever go up. They buy vehicles in the garage on the start
  screen (race car, police car, fire truck, monster truck, motorcycle,
  ambulance, taxi, sports car).

## Tech

Same engine as the runner (`@kids/engine`): Babylon.js, toon look with
outlines on the high tier, rolling hills, curving road, Kenney CC0 kits
(`npm run assets:kits -- vroom --no-characters --kits=vehicles,nature,city`),
generative music. The monster truck is a kit SUV on big procedural
wheels; the motorcycle is built from primitives.

Dev params: `?auto=1` start immediately, `&sim=30` run a 30 s random
autopilot and log a `[sim]` line, `&vehicle=monster` drive any vehicle,
`&dist=1400` start in a later world, `&tier=high` force a quality tier.

```bash
npm run dev:vroom      # http://localhost:5174
```
