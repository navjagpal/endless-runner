# Endless Runner — Feature Backlog

A living list of gameplay, art, and polish ideas aimed at making the game more
delightful for young players (target audience: ~5 years old). Inspiration drawn
from **Subway Surfers**, **Sonic Dash**, **Temple Run**, and similar endless
runners.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 🎢 1. Traversal & Level Geometry

The single biggest feeling-upgrade: give the road some shape. Right now the
track is a perfectly flat strip — adding ramps and vertical traversal is what
makes Subway Surfers feel exciting.

- [x] **Ramps onto trucks & buses.** ~40% of trucks and buses now spawn with a
      rear hazard-striped yellow ramp. Running/jumping up the ramp puts the
      player on the vehicle's roof where a bonus trail of coins awaits, and
      the player falls back to the road after running off the front end.
      Implemented via per-obstacle `surface` bounds + a grace period so
      falling off the front doesn't insta-bump the cab.
- [x] **Multi-car "trains"** — Railway zone: 2–4 Kenney train units per set, ramp at the back, roof runs the full length.
- [ ] **Rainbow bridges / arches** — Decorative curved overpasses the player
      runs under.
- [x] **Hills & dips** — Rolling hills (visual; gameplay stays flat). No dips: the far ground would show.
- [x] **Tunnels with glowing lights** — Rock tunnels in the forest with ceiling lamps.
- [x] **Curving road** — Vertex-shader bend; lanes and physics stay straight.

## 🦸 2. Character & Customization

- [~] **Characters** — Twelve Kenney chibis, unlockable with the coin bank. Animals would need another pack.
- [~] **Coin-purchased characters** — Done for whole characters; outfits not yet.
- [x] **Pet companion** — Puppy, kitten, bunny; collects coins it touches.
- [ ] **Nameable character** — Personal touch.

## ⚡ 3. Power-ups

- [x] **Coin magnet** — Pickup on the track; pulls coins in for 9 seconds.
- [x] **Jetpack** — Flies above obstacles along a trail of coins.
- [x] **Coin multiplier** — x2/x3/x4 for a clean coin streak, reset on a bump.
- [x] **Hoverboard** — Absorbs one collision before breaking.
- [x] **Rainbow star** — Star Power: fill the ⭐ meter with dodges; ~7 s invincible + magnet + rainbow trail.

## 🌟 4. Collectibles Beyond Coins

- [ ] **Colored gems** — Rare bigger pickups for celebration moments.
- [ ] **Letter pickups** — Spell simple words for a bonus (literacy sneak-in).
- [ ] **Mystery gift boxes** — Random power-up / outfit reward on pickup.
- [ ] **Floating balloons** — Popped for points; placed above ramp jumps.

## 🎨 5. Environment Polish

- [~] **Friendly animals in scenery** — Birds and butterflies; no ground animals yet.
- [x] **Weather events** — Rain then a rainbow in the forest, snowy forest variant, petals/leaves/sparkles, golden-hour sweep.
- [ ] **Candy-land biome** — Lollipops, gingerbread road, marshmallow clouds.
- [ ] **Underwater biome** — Soft blue filter, bubbles, fish.
- [~] **Animated billboards** — City billboards have smiley faces (static).
- [ ] **Cozy night cycle** — Replace scary space with moon + twinkly stars.

## 🎵 6. Audio & Juice

- [x] **Callouts** — "Wheee!" on rooftops, "x2 coins!", "N in a row!", "Oops!" text pops (text, not voice).
- [x] **Combo chime escalation** — Coin chime pitch climbs with the streak.
- [ ] **Milestone celebrations** — Confetti + chime every 100 coins / 500 m.
- [x] **Softer collision sound** — Gentle "boing" instead of harsh buzz.

## 🎯 7. Progression & Rewards

- [ ] **Missions / stickers** — "Jump 5 buses!" → sticker in a scrapbook.
- [ ] **Daily login gift** — Coin bonus or outfit piece per day.
- [x] **High score celebration** — Confetti + "New Best!" pop; best persists.
- [x] **Lower kids-mode speed cap** — Kid Mode caps at 17 m/s with a slow ramp.
- [x] **No-fail option** — Bumps slow the player and spill a few coins, never force restart.

## 🕹️ 8. Controls

- [x] **Bigger visible tap zones** — On-screen direction buttons (auto on touch devices).
- [ ] **Assisted mode** — Auto-jump obvious obstacles so she can focus on coins.

---

## Top 5 priorities to start

1. Ramps onto trucks / buses (category #1) — biggest wow factor
2. Coin magnet power-up
3. Jetpack power-up
4. Selectable animal characters
5. Voice "wheee!" callouts
