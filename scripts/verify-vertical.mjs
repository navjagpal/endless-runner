#!/usr/bin/env node
/**
 * Verifies the vertical-collision design contract.
 *
 * Obstacles have a solid vertical span and the player has a standing and a
 * sliding height, which together decide what each input is *for*:
 *
 *   barrier — must be jumpable
 *   car     — must be jumpable, at every run speed
 *   truck   — must NOT be jumpable, or lane-changing is pointless
 *   bus     — must NOT be jumpable, or the rooftop ramps have no purpose
 *   gantry  — must NOT be jumpable, must be slideable
 *
 * These are not free parameters. Clearing an obstacle means staying above
 * it for the *whole* time the bodies overlap in z, so the jump's hang time
 * matters as much as its apex — a value tuned against the apex alone
 * leaves the car unjumpable at the starting speed but jumpable once the
 * run accelerates, which reads as the game randomly changing its rules.
 *
 * Constants are parsed out of the source rather than duplicated here, so
 * this can't quietly drift away from what the game actually does.
 *
 * Run: npm run verify:vertical
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const playerSrc = readFileSync(join(root, 'src/game/player/Player.ts'), 'utf8')
const obstacleSrc = readFileSync(join(root, 'src/game/obstacles/ObstacleManager.ts'), 'utf8')

function num(src, name, where) {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`))
  if (!m) {
    console.error(`could not find constant ${name} in ${where} — has it been renamed?`)
    process.exit(2)
  }
  return parseFloat(m[1])
}

const JUMP_HEIGHT     = num(playerSrc, 'JUMP_HEIGHT', 'Player.ts')
const JUMP_RISE_TIME  = num(playerSrc, 'JUMP_RISE_TIME', 'Player.ts')
const FALL_MULTIPLIER = num(playerSrc, 'FALL_MULTIPLIER', 'Player.ts')
const STAND_HEIGHT    = num(playerSrc, 'STAND_HEIGHT', 'Player.ts')
const SLIDE_HEIGHT    = num(playerSrc, 'SLIDE_HEIGHT', 'Player.ts')
const PLAYER_HALF     = num(obstacleSrc, 'PLAYER_HALF', 'ObstacleManager.ts')
const CAR_ROOF        = num(obstacleSrc, 'CAR_ROOF', 'ObstacleManager.ts')
const TRUCK_ROOF      = num(obstacleSrc, 'TRUCK_ROOF', 'ObstacleManager.ts')
const BUS_ROOF        = num(obstacleSrc, 'BUS_ROOF', 'ObstacleManager.ts')
const GANTRY_CLEAR    = num(obstacleSrc, 'GANTRY_CLEARANCE', 'ObstacleManager.ts')

// collD values live inline in the builders; keep them here but assert they
// still appear in the source so a change to one is noticed.
const OBSTACLES = [
  { name: 'barrier', bottom: 0,            top: 0.82,       collD: 0.35, jumpable: true  },
  { name: 'car',     bottom: 0,            top: CAR_ROOF,   collD: 1.55, jumpable: false },
  { name: 'truck',   bottom: 0,            top: TRUCK_ROOF, collD: 2.00, jumpable: false },
  { name: 'bus',     bottom: 0,            top: BUS_ROOF,   collD: 1.60, jumpable: false },
  { name: 'gantry',  bottom: GANTRY_CLEAR, top: 3.40,       collD: 0.30, jumpable: false },
]
OBSTACLES[1].jumpable = true   // car is jumpable; set here to keep the table readable

const SPEEDS = [11, 14, 16, 20, 22, 25, 28]   // SPEED_MIN..SPEED_MAX from Settings
const DT = 1 / 60

const G  = (2 * JUMP_HEIGHT) / (JUMP_RISE_TIME * JUMP_RISE_TIME)
const V0 = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME

/** Mirrors Player._updateVertical for a jump from flat ground. */
function jumpTrace() {
  let posY = 0, velY = V0
  const trace = [0]
  for (let i = 0; i < 900; i++) {
    velY -= G * (velY < 0 ? FALL_MULTIPLIER : 1) * DT
    posY += velY * DT
    if (posY <= 0 && velY <= 0) { trace.push(0); break }
    trace.push(posY)
  }
  return trace
}

const trace = jumpTrace()
const apex = Math.max(...trace)

/** Mirrors the vertical half of the ObstacleManager collision test. */
const overlaps = (bottom, top, obs) => bottom < obs.top && top > obs.bottom

function clearsWithBestTiming(obs, speed) {
  const windowZ = 2 * (obs.collD + PLAYER_HALF)
  const frames = Math.ceil(windowZ / speed / DT)
  for (let start = 0; start + frames <= trace.length; start++) {
    let ok = true
    for (let f = start; f < start + frames; f++) {
      if (overlaps(trace[f], trace[f] + STAND_HEIGHT, obs)) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

let failures = 0
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`) }
const pass = (msg) => console.log(`  ok    ${msg}`)

console.log(`jump apex ${apex.toFixed(3)}  airtime ${((trace.length - 1) * DT).toFixed(3)}s`)
console.log(`(H=${JUMP_HEIGHT} rise=${JUMP_RISE_TIME} fall=${FALL_MULTIPLIER})\n`)

console.log('jump clearance, consistent across every run speed:')
for (const obs of OBSTACLES) {
  const results = SPEEDS.map(s => clearsWithBestTiming(obs, s))
  const consistent = results.every(r => r === results[0])
  if (!consistent) {
    const bad = SPEEDS.filter((_, i) => results[i] !== obs.jumpable)
    fail(`${obs.name}: clearance depends on speed (differs at ${bad.join(', ')})`)
  } else if (results[0] !== obs.jumpable) {
    fail(`${obs.name} (top ${obs.top}): jumpable=${results[0]}, expected ${obs.jumpable}`)
  } else {
    pass(`${obs.name} (top ${obs.top}): jumpable=${results[0]} at all speeds`)
  }
}

console.log('\nslide clearance:')
for (const obs of OBSTACLES) {
  const sliding  = overlaps(0, SLIDE_HEIGHT, obs)
  const standing = overlaps(0, STAND_HEIGHT, obs)
  // Only the gantry should be passable while sliding; everything else is
  // solid from the road up and must still block a sliding player.
  const shouldSlide  = obs.name === 'gantry'
  const expectBlocked = !shouldSlide
  if (sliding === expectBlocked) {
    pass(`${obs.name}: sliding ${sliding ? 'blocked' : 'clears'}`)
  } else {
    fail(`${obs.name}: sliding ${sliding ? 'blocked' : 'clears'} — expected ${expectBlocked ? 'blocked' : 'clears'}`)
  }
  if (shouldSlide && !standing) {
    fail('gantry: a standing player passes under it, so sliding is pointless')
  }
}

console.log('\nrooftop: standing on a vehicle must not collide with it:')
for (const obs of OBSTACLES.filter(o => o.top === TRUCK_ROOF || o.top === BUS_ROOF)) {
  const hits = overlaps(obs.top, obs.top + STAND_HEIGHT, obs)
  hits ? fail(`${obs.name}: feet at roof height still collide`)
       : pass(`${obs.name}: feet at ${obs.top} clear`)
}

// ─── Ramp traversal ──────────────────────────────────────────────────────────
//
// The static checks above can't catch the case the merge actually put at
// risk: running up a ramped vehicle. That's a dynamic interaction between
// _groundUnderPlayer (which lifts groundY along the slope) and
// _updateVertical (which sticks the player to it), with the collision test
// firing every frame throughout. Simulate the whole approach → ramp →
// rooftop → fall-off sequence and assert it never bumps.

console.log('\nramp traversal (approach → ramp → rooftop → fall off the front):')

// Geometry from _makeTruck's ramped branch.
const TRUCK_Z = 40
const RAMP_LENGTH = 3.6
const RAMP_LOCAL_Z = -2.40
const TOP_FRONT_LZ = 0.50
const surface = {
  rampStartZ: TRUCK_Z + RAMP_LOCAL_Z - RAMP_LENGTH,
  rampEndZ:   TRUCK_Z + RAMP_LOCAL_Z,
  topEndZ:    TRUCK_Z + TOP_FRONT_LZ,
  topY:       TRUCK_ROOF,
}
const truck = { name: 'truck', bottom: 0, top: TRUCK_ROOF, collD: 2.00, z: TRUCK_Z }

/** Mirrors ObstacleManager._groundUnderPlayer for a single surface. */
function groundUnder(pz) {
  if (pz >= surface.rampStartZ && pz <= surface.rampEndZ) {
    return ((pz - surface.rampStartZ) / (surface.rampEndZ - surface.rampStartZ)) * surface.topY
  }
  if (pz > surface.rampEndZ && pz <= surface.topEndZ) return surface.topY
  return 0
}

// Matches ObstacleManager's grace window: after stepping off a vehicle,
// collision with it stays suppressed briefly. Dropping off the front of the
// rooftop puts the player inside the cab's solid span on the way down, so
// without this the landing always registers as a bump.
const ON_GRACE_SECS = 0.6

function simulateRamp(speed) {
  let pz = TRUCK_Z - 15, posY = 0, velY = 0, state = 'running'
  let maxY = 0, bumped = false, reachedRoof = false, fellBack = false
  let graceTimer = 0

  for (let i = 0; i < 3000 && pz < TRUCK_Z + 20; i++) {
    pz += speed * DT
    const groundY = groundUnder(pz)
    const onThis = groundY > 0

    // Player._updateVertical
    const airborne = state === 'jumping' || posY > groundY + 0.02
    if (airborne) {
      velY -= G * (velY < 0 ? FALL_MULTIPLIER : 1) * DT
      posY += velY * DT
      if (posY <= groundY && velY <= 0) { posY = groundY; velY = 0; state = 'running' }
    } else {
      posY = groundY; velY = 0
    }
    maxY = Math.max(maxY, posY)
    if (posY >= surface.topY - 0.01) reachedRoof = true
    if (reachedRoof && posY <= 0.01) fellBack = true

    // ObstacleManager collision, including the post-dismount grace window.
    if (onThis) graceTimer = ON_GRACE_SECS
    else if (graceTimer > 0) graceTimer -= DT

    const suppressed = onThis || graceTimer > 0
    if (!suppressed) {
      const dz = Math.abs(pz - truck.z)
      const vertical = posY < truck.top && posY + STAND_HEIGHT > truck.bottom
      if (dz < truck.collD + PLAYER_HALF && vertical) bumped = true
    }
  }
  return { maxY, bumped, reachedRoof, fellBack }
}

for (const speed of SPEEDS) {
  const r = simulateRamp(speed)
  const problems = []
  if (r.bumped) problems.push('collided while traversing')
  if (!r.reachedRoof) problems.push(`never reached roof (peak ${r.maxY.toFixed(2)})`)
  if (!r.fellBack) problems.push('never came back down off the front')
  problems.length
    ? fail(`speed ${speed}: ${problems.join('; ')}`)
    : pass(`speed ${speed}: rides to ${r.maxY.toFixed(2)} and drops off cleanly, no bump`)
}

console.log()
if (failures) {
  console.log(`${failures} check(s) failed — the vertical model is inconsistent.`)
  process.exit(1)
}
console.log('all vertical-model checks passed')
