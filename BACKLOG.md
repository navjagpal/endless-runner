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
- [ ] **Multi-car "trains"** — 2–3 buses/trucks in a row with ramps front and
      back. The player can run the full length up top.
- [ ] **Rainbow bridges / arches** — Decorative curved overpasses the player
      runs under.
- [ ] **Hills & dips** — Gentle rolling terrain rather than a flat road.
- [ ] **Tunnels with glowing lights** — Brief enclosed sections that feel cozy,
      not scary.
- [ ] **Banked / curving road** — Road visually curves left/right even though
      lane gameplay stays linear.

## 🦸 2. Character & Customization

- [ ] **Animal characters** — Unlockable bunny, kitten, puppy, unicorn,
      dinosaur.
- [ ] **Coin-purchased outfits** — Hats, capes, tutus, fairy wings.
- [ ] **Pet companion** — A small dog/cat that runs alongside the player.
- [ ] **Nameable character** — Personal touch.

## ⚡ 3. Power-ups

- [ ] **Coin magnet** — Auto-pulls nearby coins for ~8 seconds.
- [ ] **Jetpack** — Flies above obstacles along a trail of coins.
- [ ] **2× coin multiplier** — Coins briefly sparkle and count double.
- [ ] **Hoverboard / scooter** — Absorbs one collision before breaking.
- [ ] **Rainbow star** — Short invincibility, plow through obstacles.

## 🌟 4. Collectibles Beyond Coins

- [ ] **Colored gems** — Rare bigger pickups for celebration moments.
- [ ] **Letter pickups** — Spell simple words for a bonus (literacy sneak-in).
- [ ] **Mystery gift boxes** — Random power-up / outfit reward on pickup.
- [ ] **Floating balloons** — Popped for points; placed above ramp jumps.

## 🎨 5. Environment Polish

- [ ] **Friendly animals in scenery** — Bunnies, dolphins, astronauts.
- [ ] **Weather events** — Rainbow after rain, snowflakes, cherry blossoms.
- [ ] **Candy-land biome** — Lollipops, gingerbread road, marshmallow clouds.
- [ ] **Underwater biome** — Soft blue filter, bubbles, fish.
- [ ] **Animated billboards** — Cartoon faces that wave at the player.
- [ ] **Cozy night cycle** — Replace scary space with moon + twinkly stars.

## 🎵 6. Audio & Juice

- [ ] **Voice callouts** — "Wheee!", "Yay!", "Woohoo!" on big jumps.
- [ ] **Combo chime escalation** — Pitch climbs with consecutive coin pickups.
- [ ] **Milestone celebrations** — Confetti + chime every 100 coins / 500 m.
- [ ] **Softer collision sound** — Gentle "boing" instead of harsh buzz.

## 🎯 7. Progression & Rewards

- [ ] **Missions / stickers** — "Jump 5 buses!" → sticker in a scrapbook.
- [ ] **Daily login gift** — Coin bonus or outfit piece per day.
- [ ] **High score celebration** — Fireworks + "New Best!" banner.
- [ ] **Lower kids-mode speed cap** — Max ~18 m/s instead of 28.
- [ ] **No-fail option** — Bumps slow the player, never force restart.

## 🕹️ 8. Controls

- [ ] **Bigger visible tap zones** — On-screen direction buttons.
- [ ] **Assisted mode** — Auto-jump obvious obstacles so she can focus on coins.

---

## Top 5 priorities to start

1. Ramps onto trucks / buses (category #1) — biggest wow factor
2. Coin magnet power-up
3. Jetpack power-up
4. Selectable animal characters
5. Voice "wheee!" callouts
