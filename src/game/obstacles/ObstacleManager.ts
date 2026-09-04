import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  Vector4,
  Color3,
  PBRMaterial,
  StandardMaterial,
  Material,
  InstancedMesh,
} from '@babylonjs/core'
import { LANE_POSITIONS } from '../track/TrackChunk'
import { styleChunk } from '../track/ChunkStyling'
import { getQualityProfile } from '../core/DeviceTier'
import { getCoinTexture } from '../fx/Textures'
import { Kits } from '../assets/Kits'
import { terrainY, terrainSlope } from '../track/Terrain'
import { Player } from '../player/Player'

const SPAWN_AHEAD    = 70
const DESPAWN_BEHIND = 22

/** Report the obstacle merge ratio once rather than on every spawn. */
let _loggedObstacleStats = false
const PLAYER_HALF    = 0.38   // half player body size added to each collision side

// Roof heights, shared between a vehicle's solid `top` and its ramp's `topY`.
// These must agree: if the ramp deposits the player above the solid span the
// vehicle stops blocking, and if it deposits them below it they're inside it.
const CAR_ROOF   = 1.45
const TRUCK_ROOF = 2.21
const BUS_ROOF   = 2.24

// Underside of the gantry sign. Sits above a sliding player (0.70) and below
// a standing one (1.50), so sliding is the only way through.
const GANTRY_CLEARANCE = 1.35

// Coin hover height above whatever surface it belongs to.
const COIN_Y = 1.10

// Kit vehicles. Cars are scaled so no roof rises above CAR_ROOF (the
// jumpable ceiling); trucks are scaled to exactly TRUCK_ROOF so the ramp
// deposits the player on the real roof. Only the box truck gets a ramp:
// the fire truck's ladder and the ambulance's light bar aren't runnable.
const CAR_MODELS   = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'taxi', 'police', 'van', 'race']
const TRUCK_MODELS = ['delivery', 'firetruck', 'ambulance']
const RAMP_TRUCK   = 'delivery'
// The kit vehicles arrive facing the camera; turned round so the traffic
// drives away from the player and shows its tail lights.
const VEHICLE_YAW  = Math.PI

// Magnet: how far coins get pulled from, and how fast they fly in.
const MAGNET_REACH_X = 6.5
const MAGNET_REACH_Z = 11
const MAGNET_SPEED   = 26

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Runnable surface bounds in world space — populated for ramped vehicles so
 * the player can run up a ramp, across the rooftop, and fall off the far end.
 *
 *     topY  ┌────────────┐
 *           │  rooftop   │
 *          /└────────────┘
 *         / ramp
 *  0 ────/              (player approaches from -z, enters at rampStartZ)
 *        ^              ^              ^
 *        rampStartZ     rampEndZ       topEndZ
 */
interface Surface {
  rampStartZ: number
  rampEndZ:   number
  topEndZ:    number
  xMin:       number
  xMax:       number
  topY:       number
}

/**
 * `bottom`/`top` are the obstacle's *solid* vertical span above the road —
 * the volume that blocks you. `surface` is the volume you can stand on.
 * Collision requires overlap in all three axes, which is what makes jump
 * and slide mechanical rather than decorative.
 */
interface Obstacle {
  mesh:     Mesh
  collW:    number
  collD:    number
  bottom:   number
  top:      number
  surface?: Surface
  /** Lane indices this obstacle blocks, for coin placement. */
  lanes:    number[]
  passed:   boolean
  bumped:   boolean
}

interface Coin {
  mesh:      InstancedMesh
  collected: boolean
  bobOffset: number
  /** Rest height — rooftop coins sit higher than road coins. */
  baseY:     number
  /** Set while the magnet is dragging it in; bob is suspended. */
  pulled:    boolean
}

interface SpilledCoin { mesh: InstancedMesh; vel: Vector3; life: number }

interface Pickup { mesh: Mesh; kind: 'magnet'; collected: boolean; bobOffset: number }

export interface RunEvents {
  /** The player hit something and it counted (not invincible). */
  onBump:    () => void
  /** A coin was collected, at this world position. */
  onCoin:    (pos: Vector3) => void
  /** An obstacle went by without a bump. */
  onDodge:   () => void
  onMagnet:  () => void
  /** The player just got onto a vehicle roof. */
  onRooftop: () => void
}

// ─── Material cache ───────────────────────────────────────────────────────────

let _scene: Scene | null = null
const _matCache = new Map<string, PBRMaterial | StandardMaterial>()

// Shared across all vehicles
let tireMat:     PBRMaterial
let rimMat:      PBRMaterial
let glassMat:    PBRMaterial
let coinMat:     PBRMaterial
let rampYellow:  PBRMaterial
let rampStripe:  PBRMaterial

// ── Per-spawn random color palettes ──────────────────────────────────────────

const CAR_BODY_COLORS = [
  new Color3(0.90, 0.12, 0.10),  // fire red
  new Color3(0.12, 0.30, 0.90),  // royal blue
  new Color3(0.72, 0.72, 0.75),  // silver
  new Color3(0.10, 0.10, 0.12),  // midnight black
  new Color3(0.95, 0.95, 0.95),  // pearl white
  new Color3(0.95, 0.50, 0.05),  // orange
  new Color3(0.14, 0.60, 0.22),  // green
  new Color3(0.55, 0.15, 0.70),  // purple
  new Color3(0.98, 0.45, 0.70),  // pink
  new Color3(0.10, 0.75, 0.80),  // teal
]

const TRUCK_CAB_COLORS = [
  new Color3(0.95, 0.95, 0.95),  // white
  new Color3(0.14, 0.14, 0.16),  // dark grey
  new Color3(0.70, 0.18, 0.10),  // dark red
  new Color3(0.08, 0.22, 0.58),  // navy
  new Color3(0.90, 0.65, 0.10),  // gold
  new Color3(0.20, 0.62, 0.30),  // green
]

function initMats(scene: Scene): void {
  if (_scene === scene) return
  _scene = scene
  _matCache.clear()

  tireMat  = _pbr(scene, new Color3(0.06, 0.06, 0.07), 0.0,  0.95)
  rimMat   = _pbr(scene, new Color3(0.76, 0.76, 0.80), 0.88, 0.12)
  glassMat = _pbr(scene, new Color3(0.30, 0.42, 0.58), 0.05, 0.10)

  coinMat               = new PBRMaterial('coin', scene)
  coinMat.albedoColor   = new Color3(1.0, 0.92, 0.55)
  coinMat.albedoTexture = getCoinTexture(scene)
  coinMat.emissiveColor = new Color3(0.42, 0.30, 0.02)
  coinMat.metallic      = 0.35; coinMat.roughness = 0.35

  // Bright hazard-yellow ramp with black diagonal stripes — very legible to kids.
  rampYellow = _pbr(scene, new Color3(0.99, 0.80, 0.04), 0.10, 0.55)
  rampStripe = _pbr(scene, new Color3(0.07, 0.07, 0.08), 0.10, 0.85)
}

function _pbr(scene: Scene, color: Color3, metallic = 0, roughness = 0.72): PBRMaterial {
  const key = `p:${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)},${metallic},${roughness}`
  let m = _matCache.get(key) as PBRMaterial | undefined
  if (!m) {
    m = new PBRMaterial(key, scene)
    m.albedoColor = color; m.metallic = metallic; m.roughness = roughness
    _matCache.set(key, m)
  }
  return m
}

function _emissive(scene: Scene, color: Color3): StandardMaterial {
  const key = `e:${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)}`
  let m = _matCache.get(key) as StandardMaterial | undefined
  if (!m) {
    m = new StandardMaterial(key, scene)
    m.emissiveColor = color; m.disableLighting = true
    _matCache.set(key, m)
  }
  return m
}

/** Headlights, taillights, warning lamps: unlit, so they get no gradient. */
function _emissiveMaterials(): Set<Material> {
  const out = new Set<Material>()
  for (const [key, mat] of _matCache) if (key.startsWith('e:')) out.add(mat)
  return out
}

// ─── Obstacle Manager ─────────────────────────────────────────────────────────

export class ObstacleManager {
  private scene:         Scene
  private obstacles:     Obstacle[]     = []
  private coins:         Coin[]         = []
  private spilled:       SpilledCoin[]  = []
  private pickups:       Pickup[]       = []
  private coinTemplate:  Mesh
  private nextObstacleZ = 38
  private nextCoinZ     = 16
  private nextPickupZ   = 140
  private time          = 0
  private magnetTimer   = 0
  private starPower     = false
  // Remember the vehicle the player was most recently standing on — collision
  // stays suppressed for a short grace period afterwards so falling off the
  // front of the rooftop doesn't immediately bump into the cab below.
  private lastOnObstacle: Obstacle | null = null
  private onGraceTimer   = 0
  private wasOnRoof      = false

  constructor(scene: Scene) {
    this.scene = scene
    initMats(scene)
    this.coinTemplate = this._makeCoinTemplate()
  }

  get magnetActive(): boolean { return this.magnetTimer > 0 }
  get magnetRemaining(): number { return this.magnetTimer }

  setStarPower(on: boolean): void { this.starPower = on }

  // ─── Spawning ──────────────────────────────────────────────────────────────

  /**
   * Returns the extra z-length the spawned obstacle wants after it (ramps
   * need breathing room so the player can line up with them).
   */
  private _spawnObstacle(z: number, kidMode: boolean): number {
    const roll = Math.random()
    let obs: Obstacle
    let extraGap = 0

    if (roll < 0.20) {
      // Low barrier — must be jumped. A coin arc over it shows the way.
      const lane = Math.floor(Math.random() * 3)
      obs = this._makeBarrier(z, LANE_POSITIONS[lane], lane)
      this._spawnCoinArc(LANE_POSITIONS[lane], z)
    } else if (roll < 0.32) {
      // Overhead gantry — must be slid under. Low coins underneath.
      const lane = Math.floor(Math.random() * 3)
      obs = this._makeGantry(z, LANE_POSITIONS[lane], lane)
      this._spawnLowCoins(LANE_POSITIONS[lane], z)
    } else if (roll < 0.56) {
      const lane = Math.floor(Math.random() * 3)
      obs = this._makeCar(z, LANE_POSITIONS[lane], lane)
    } else if (roll < 0.80) {
      // Delivery truck — often with a rear ramp the player can run up.
      const lane    = Math.floor(Math.random() * 3)
      const ramped  = Math.random() < (kidMode ? 0.55 : 0.40)
      obs = this._makeTruck(z, LANE_POSITIONS[lane], lane, ramped)
      if (ramped) {
        this._spawnRooftopCoins(obs.surface!)
        extraGap = 6
      }
    } else {
      // Bus spanning two lanes.
      const left    = Math.random() > 0.5
      const busX    = left ? -1.25 : 1.25
      const ramped  = Math.random() < (kidMode ? 0.55 : 0.40)
      obs = this._makeBus(z, busX, left ? [0, 1] : [1, 2], ramped)
      if (ramped) {
        this._spawnRooftopCoins(obs.surface!)
        extraGap = 6
      }
    }

    // Same treatment the track props get: collapse to one mesh per
    // material, split the normals, bake a vertical light ramp.
    const stats = styleChunk(obs.mesh, {
      plainMaterials: _emissiveMaterials(),
      preShadedMaterials: Kits.materials,
      flatShade: getQualityProfile().flatShade,
      gradient: { bottom: 0.80, top: 1.08 },
    })
    if (!_loggedObstacleStats) {
      _loggedObstacleStats = true
      console.info(
        `[obstacle] ${obs.mesh.name}: ${stats.before} meshes merged into ${stats.after}`,
      )
    }

    // Sit on the hill and lean with it. Collision is unaffected: it
    // works in flat track space, and the player is lifted the same way.
    obs.mesh.position.y = terrainY(z)
    obs.mesh.rotation.x = -Math.atan(terrainSlope(z))

    this.obstacles.push(obs)
    return extraGap
  }

  // ─── Road barrier (jump over) ─────────────────────────────────────────────

  private _makeBarrier(z: number, x: number, lane: number): Obstacle {
    const root    = new Mesh('barrier', this.scene)
    root.position = new Vector3(x, 0, z)

    const frameMat  = _pbr(this.scene, new Color3(0.95, 0.95, 0.97), 0.1, 0.55)
    const stripeMat = _pbr(this.scene, new Color3(0.98, 0.32, 0.05), 0.0, 0.60)
    const legMat    = _pbr(this.scene, new Color3(0.22, 0.22, 0.26), 0.3, 0.70)

    const plank = MeshBuilder.CreateBox('plank', { width: 2.10, height: 0.42, depth: 0.16 }, this.scene)
    plank.position = new Vector3(0, 0.60, 0)
    plank.material = frameMat
    plank.parent   = root

    for (let i = -2; i <= 2; i++) {
      const stripe = MeshBuilder.CreateBox('stripe', { width: 0.26, height: 0.44, depth: 0.05 }, this.scene)
      stripe.position = new Vector3(i * 0.40, 0.60, -0.10)
      stripe.rotation.z = 0.45
      stripe.material = stripeMat
      stripe.parent   = root
    }

    const rail = MeshBuilder.CreateBox('rail', { width: 2.10, height: 0.14, depth: 0.12 }, this.scene)
    rail.position = new Vector3(0, 0.26, 0)
    rail.material = stripeMat
    rail.parent   = root

    for (const side of [-1, 1]) {
      const leg = MeshBuilder.CreateBox('leg', { width: 0.12, height: 0.82, depth: 0.12 }, this.scene)
      leg.position = new Vector3(side * 0.95, 0.41, 0)
      leg.material = legMat
      leg.parent   = root
    }

    // Warning lamps on top so it reads from far away
    const lampMat = _emissive(this.scene, new Color3(1.0, 0.85, 0.2))
    for (const side of [-1, 1]) {
      const lamp = MeshBuilder.CreateSphere('blamp', { diameter: 0.16, segments: 5 }, this.scene)
      lamp.position = new Vector3(side * 0.95, 0.90, 0)
      lamp.material = lampMat
      lamp.parent   = root
    }

    return { mesh: root, collW: 1.05, collD: 0.35, bottom: 0, top: 0.82, lanes: [lane], passed: false, bumped: false }
  }

  // ─── Overhead gantry (slide under) ────────────────────────────────────────

  private _makeGantry(z: number, x: number, lane: number): Obstacle {
    const root    = new Mesh('gantry', this.scene)
    root.position = new Vector3(x, 0, z)

    const postMat  = _pbr(this.scene, new Color3(0.42, 0.44, 0.48), 0.55, 0.45)
    const signMat  = _pbr(this.scene, new Color3(0.08, 0.50, 0.24), 0.0, 0.65)
    const trimMat  = _pbr(this.scene, new Color3(0.95, 0.95, 0.95), 0.0, 0.50)
    const lampMat  = _emissive(this.scene, new Color3(1.00, 0.72, 0.10))
    const arrowMat = _emissive(this.scene, new Color3(1.0, 1.0, 1.0))

    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder('post',
        { diameter: 0.20, height: 3.40, tessellation: 10 }, this.scene)
      post.position = new Vector3(side * 1.35, 1.70, 0)
      post.material = postMat
      post.parent   = root
    }

    const beam = MeshBuilder.CreateBox('beam', { width: 2.90, height: 0.22, depth: 0.30 }, this.scene)
    beam.position = new Vector3(0, GANTRY_CLEARANCE + 0.13, 0)
    beam.material = postMat
    beam.parent   = root

    const board = MeshBuilder.CreateBox('board', { width: 2.40, height: 1.10, depth: 0.14 }, this.scene)
    board.position = new Vector3(0, 2.20, 0)
    board.material = signMat
    board.parent   = root

    const trim = MeshBuilder.CreateBox('trim', { width: 2.52, height: 1.22, depth: 0.08 }, this.scene)
    trim.position = new Vector3(0, 2.20, 0.05)
    trim.material = trimMat
    trim.parent   = root

    // A big downward arrow on the sign: "go under".
    const shaft = MeshBuilder.CreateBox('arrowShaft', { width: 0.22, height: 0.5, depth: 0.05 }, this.scene)
    shaft.position = new Vector3(0, 2.38, -0.10)
    shaft.material = arrowMat; shaft.parent = root
    const head = MeshBuilder.CreateCylinder('arrowHead', { diameterTop: 0, diameterBottom: 0.6, height: 0.36, tessellation: 3 }, this.scene)
    head.rotation.x = Math.PI
    head.rotation.y = Math.PI / 6
    head.position = new Vector3(0, 1.95, -0.10)
    head.material = arrowMat; head.parent = root

    for (const side of [-1, 1]) {
      const lamp = MeshBuilder.CreateSphere('lamp', { diameter: 0.16, segments: 8 }, this.scene)
      lamp.position = new Vector3(side * 0.75, GANTRY_CLEARANCE + 0.01, -0.10)
      lamp.material = lampMat
      lamp.parent   = root
    }

    return { mesh: root, collW: 1.20, collD: 0.30, bottom: GANTRY_CLEARANCE, top: 3.40, lanes: [lane], passed: false, bumped: false }
  }

  // ─── Car (sedan) ──────────────────────────────────────────────────────────

  private _makeCar(z: number, x: number, lane: number): Obstacle {
    const root     = new Mesh('car', this.scene)
    root.position  = new Vector3(x, 0, z)

    if (Kits.isLoaded('vehicles')) {
      const model = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)]
      const size  = Kits.size(model)!
      const scale = Math.min(1.25, CAR_ROOF / size.y)
      Kits.place(root, model, 0, 0, 0, scale, VEHICLE_YAW)
      return { mesh: root, collW: 0.84, collD: 1.55, bottom: 0, top: CAR_ROOF, lanes: [lane], passed: false, bumped: false }
    }

    const bodyColor = CAR_BODY_COLORS[Math.floor(Math.random() * CAR_BODY_COLORS.length)]
    const bodyMat   = _pbr(this.scene, bodyColor, 0.10, 0.40)
    const bumpMat   = _pbr(this.scene, new Color3(0.10, 0.10, 0.12), 0.05, 0.80)
    const hlMat     = _emissive(this.scene, new Color3(1.00, 0.97, 0.88))
    const tlMat     = _emissive(this.scene, new Color3(0.95, 0.04, 0.04))

    const frame = MeshBuilder.CreateBox('frame', { width: 1.60, height: 0.16, depth: 3.20 }, this.scene)
    frame.position = new Vector3(0, 0.14, 0)
    frame.material = _pbr(this.scene, new Color3(0.08, 0.08, 0.10), 0.3, 0.9)
    frame.parent   = root

    const body = MeshBuilder.CreateBox('body', { width: 1.96, height: 0.56, depth: 3.60 }, this.scene)
    body.position = new Vector3(0, 0.58, 0)
    body.material = bodyMat; body.receiveShadows = true; body.parent = root

    const cabin = MeshBuilder.CreateBox('cabin', { width: 1.68, height: 0.52, depth: 1.96 }, this.scene)
    cabin.position = new Vector3(0, 1.12, -0.18)
    cabin.material = bodyMat; cabin.parent = root

    const wf = MeshBuilder.CreateBox('wf', { width: 1.44, height: 0.36, depth: 0.05 }, this.scene)
    wf.position = new Vector3(0, 1.12, 0.80)
    wf.material = glassMat; wf.parent = root

    const wr = MeshBuilder.CreateBox('wr', { width: 1.44, height: 0.36, depth: 0.05 }, this.scene)
    wr.position = new Vector3(0, 1.12, -1.16)
    wr.material = glassMat; wr.parent = root

    for (const sx of [-1, 1]) {
      const ws = MeshBuilder.CreateBox('ws', { width: 0.05, height: 0.30, depth: 1.22 }, this.scene)
      ws.position = new Vector3(sx * 0.865, 1.12, -0.18)
      ws.material = glassMat; ws.parent = root
    }

    for (const bz of [1.86, -1.86]) {
      const bump = MeshBuilder.CreateBox('bump', { width: 1.96, height: 0.24, depth: 0.14 }, this.scene)
      bump.position = new Vector3(0, 0.30, bz)
      bump.material = bumpMat; bump.parent = root
    }

    for (const hx of [-0.64, 0.64]) {
      const hl = MeshBuilder.CreateBox('hl', { width: 0.30, height: 0.14, depth: 0.05 }, this.scene)
      hl.position = new Vector3(hx, 0.62, 1.83)
      hl.material = hlMat; hl.parent = root
    }

    for (const tx of [-0.64, 0.64]) {
      const tl = MeshBuilder.CreateBox('tl', { width: 0.34, height: 0.13, depth: 0.05 }, this.scene)
      tl.position = new Vector3(tx, 0.62, -1.83)
      tl.material = tlMat; tl.parent = root
    }

    const wR = 0.26, wW = 0.18
    for (const [wx, wz] of [[-0.97, 1.25], [0.97, 1.25], [-0.97, -1.25], [0.97, -1.25]]) {
      this._addWheel(root, new Vector3(wx, wR, wz), wR, wW)
    }

    return { mesh: root, collW: 0.84, collD: 1.55, bottom: 0, top: CAR_ROOF, lanes: [lane], passed: false, bumped: false }
  }

  // ─── Delivery truck ───────────────────────────────────────────────────────

  private _makeTruck(z: number, x: number, lane: number, ramped = false): Obstacle {
    const root    = new Mesh('truck', this.scene)
    root.position = new Vector3(x, 0, z)

    if (Kits.isLoaded('vehicles')) {
      const model  = ramped ? RAMP_TRUCK : TRUCK_MODELS[Math.floor(Math.random() * TRUCK_MODELS.length)]
      const size   = Kits.size(model)!
      const scale  = TRUCK_ROOF / size.y
      const placed = Kits.place(root, model, 0, 0, 0, scale, VEHICLE_YAW)!
      let surface: Surface | undefined
      if (ramped) {
        const rampLength = 3.6
        const rampLocalZ = -placed.z / 2 + 0.1        // rear bumper
        const topFrontLZ = placed.z / 2 - 1.5         // where the cargo box meets the cab
        const widthX     = placed.x
        this._addRamp(root, 0, rampLocalZ, rampLength, TRUCK_ROOF, widthX)
        surface = {
          rampStartZ: z + rampLocalZ - rampLength,
          rampEndZ:   z + rampLocalZ,
          topEndZ:    z + topFrontLZ,
          xMin:       x - widthX / 2,
          xMax:       x + widthX / 2,
          topY:       TRUCK_ROOF,
        }
      }
      return { mesh: root, collW: 0.94, collD: 2.00, bottom: 0, top: TRUCK_ROOF, surface, lanes: [lane], passed: false, bumped: false }
    }

    const cabColor = TRUCK_CAB_COLORS[Math.floor(Math.random() * TRUCK_CAB_COLORS.length)]
    const cabMat   = _pbr(this.scene, cabColor, 0.08, 0.50)
    const cargoMat = _pbr(this.scene, new Color3(0.92, 0.92, 0.92), 0.04, 0.80)
    const darkMat  = _pbr(this.scene, new Color3(0.08, 0.08, 0.10), 0.20, 0.88)
    const hlMat    = _emissive(this.scene, new Color3(1.00, 0.97, 0.88))
    const tlMat    = _emissive(this.scene, new Color3(0.95, 0.04, 0.04))
    const signalMat = _emissive(this.scene, new Color3(0.95, 0.55, 0.02))
    const chromeMat = _pbr(this.scene, new Color3(0.82, 0.82, 0.86), 0.92, 0.08)
    const logoMat  = _pbr(this.scene, [new Color3(0.95, 0.30, 0.30), new Color3(0.25, 0.55, 0.95), new Color3(0.30, 0.75, 0.35)][Math.floor(Math.random() * 3)], 0.0, 0.7)

    const frame = MeshBuilder.CreateBox('frame', { width: 2.10, height: 0.22, depth: 4.80 }, this.scene)
    frame.position = new Vector3(0, 0.20, -0.15)
    frame.material = darkMat; frame.parent = root

    const cab = MeshBuilder.CreateBox('cab', { width: 2.20, height: 1.70, depth: 1.80 }, this.scene)
    cab.position = new Vector3(0, 1.16, 1.10)
    cab.material = cabMat; cab.receiveShadows = true; cab.parent = root

    const cabRoof = MeshBuilder.CreateBox('cabRoof', { width: 2.22, height: 0.12, depth: 1.84 }, this.scene)
    cabRoof.position = new Vector3(0, 2.02, 1.10)
    cabRoof.material = cabMat; cabRoof.parent = root

    const cws = MeshBuilder.CreateBox('cws', { width: 1.72, height: 0.58, depth: 0.05 }, this.scene)
    cws.position = new Vector3(0, 1.55, 2.01)
    cws.material = glassMat; cws.parent = root

    for (const sx of [-1, 1]) {
      const csw = MeshBuilder.CreateBox('csw', { width: 0.05, height: 0.46, depth: 0.90 }, this.scene)
      csw.position = new Vector3(sx * 1.115, 1.55, 1.10)
      csw.material = glassMat; csw.parent = root
    }

    const cargo = MeshBuilder.CreateBox('cargo', { width: 2.20, height: 1.90, depth: 2.90 }, this.scene)
    cargo.position = new Vector3(0, 1.26, -0.95)
    cargo.material = cargoMat; cargo.receiveShadows = true; cargo.parent = root

    // A coloured stripe along the cargo box — reads as a delivery brand.
    for (const sx of [-1, 1]) {
      const stripe = MeshBuilder.CreateBox('stripe', { width: 0.04, height: 0.45, depth: 2.60 }, this.scene)
      stripe.position = new Vector3(sx * 1.11, 1.30, -0.95)
      stripe.material = logoMat; stripe.parent = root
    }

    const seam = MeshBuilder.CreateBox('seam', { width: 0.04, height: 1.88, depth: 0.05 }, this.scene)
    seam.position = new Vector3(0, 1.26, -2.41)
    seam.material = darkMat; seam.parent = root

    const hbar = MeshBuilder.CreateBox('hbar', { width: 2.20, height: 0.06, depth: 0.05 }, this.scene)
    hbar.position = new Vector3(0, 1.00, -2.41)
    hbar.material = darkMat; hbar.parent = root

    const grille = MeshBuilder.CreateBox('grille', { width: 1.80, height: 0.52, depth: 0.06 }, this.scene)
    grille.position = new Vector3(0, 0.70, 2.02)
    grille.material = chromeMat; grille.parent = root

    for (let i = 0; i < 4; i++) {
      const bar = MeshBuilder.CreateBox('gb', { width: 1.80, height: 0.05, depth: 0.07 }, this.scene)
      bar.position = new Vector3(0, 0.46 + i * 0.15, 2.02)
      bar.material = chromeMat; bar.parent = root
    }

    const fBump = MeshBuilder.CreateBox('fbump', { width: 2.20, height: 0.28, depth: 0.18 }, this.scene)
    fBump.position = new Vector3(0, 0.38, 2.10)
    fBump.material = chromeMat; fBump.parent = root

    const rBump = MeshBuilder.CreateBox('rbump', { width: 2.20, height: 0.18, depth: 0.16 }, this.scene)
    rBump.position = new Vector3(0, 0.38, -2.42)
    rBump.material = chromeMat; rBump.parent = root

    for (const hx of [-0.78, 0.78]) {
      const hl = MeshBuilder.CreateBox('hl', { width: 0.32, height: 0.20, depth: 0.05 }, this.scene)
      hl.position = new Vector3(hx, 0.96, 2.02)
      hl.material = hlMat; hl.parent = root
      const sig = MeshBuilder.CreateBox('sig', { width: 0.20, height: 0.12, depth: 0.05 }, this.scene)
      sig.position = new Vector3(hx, 0.75, 2.02)
      sig.material = signalMat; sig.parent = root
    }

    for (const tx of [-0.78, 0.78]) {
      const tl = MeshBuilder.CreateBox('tl', { width: 0.28, height: 0.20, depth: 0.05 }, this.scene)
      tl.position = new Vector3(tx, 1.00, -2.42)
      tl.material = tlMat; tl.parent = root
    }

    const exh = MeshBuilder.CreateCylinder('exh', { height: 1.10, diameter: 0.10, tessellation: 8 }, this.scene)
    exh.position = new Vector3(-1.00, 1.82, 1.10)
    exh.material = chromeMat; exh.parent = root

    const wR = 0.34, wW = 0.22
    for (const wx of [-1.06, 1.06]) {
      this._addWheel(root, new Vector3(wx, wR, 1.55), wR, wW)
    }
    for (const wx of [-1.06, 1.06]) {
      this._addWheel(root, new Vector3(wx, wR, -0.52), wR, wW)
      this._addWheel(root, new Vector3(wx, wR, -1.55), wR, wW)
    }

    let surface: Surface | undefined
    if (ramped) {
      const topY        = TRUCK_ROOF
      const rampLength  = 3.6
      const rampLocalZ  = -2.40
      const rampBackLZ  = rampLocalZ - rampLength
      const topFrontLZ  = 0.50
      const widthX      = 2.20
      this._addRamp(root, 0, rampLocalZ, rampLength, topY, widthX)
      surface = {
        rampStartZ: z + rampBackLZ,
        rampEndZ:   z + rampLocalZ,
        topEndZ:    z + topFrontLZ,
        xMin:       x - widthX / 2,
        xMax:       x + widthX / 2,
        topY,
      }
    }

    return { mesh: root, collW: 0.94, collD: 2.00, bottom: 0, top: TRUCK_ROOF, surface, lanes: [lane], passed: false, bumped: false }
  }

  // ─── School bus (spans 2 lanes) ───────────────────────────────────────────

  private _makeBus(z: number, x: number, lanes: number[], ramped = false): Obstacle {
    const root    = new Mesh('bus', this.scene)
    root.position = new Vector3(x, 0, z)

    const busMat    = _pbr(this.scene, new Color3(1.00, 0.80, 0.05), 0.04, 0.60)  // school bus yellow
    const darkMat   = _pbr(this.scene, new Color3(0.08, 0.08, 0.10), 0.10, 0.85)
    const chromeMat = _pbr(this.scene, new Color3(0.80, 0.80, 0.84), 0.90, 0.10)
    const hlMat     = _emissive(this.scene, new Color3(1.00, 0.97, 0.88))
    const tlMat     = _emissive(this.scene, new Color3(0.95, 0.04, 0.04))
    const winMat    = _emissive(this.scene, new Color3(0.60, 0.72, 0.90))
    const stopMat   = _emissive(this.scene, new Color3(0.92, 0.05, 0.05))

    const frame = MeshBuilder.CreateBox('frame', { width: 3.30, height: 0.26, depth: 3.90 }, this.scene)
    frame.position = new Vector3(0, 0.22, 0)
    frame.material = darkMat; frame.parent = root

    const body = MeshBuilder.CreateBox('body', { width: 3.40, height: 1.80, depth: 3.90 }, this.scene)
    body.position = new Vector3(0, 1.25, 0)
    body.material = busMat; body.receiveShadows = true; body.parent = root

    const roof = MeshBuilder.CreateBox('roof', { width: 3.44, height: 0.14, depth: 3.94 }, this.scene)
    roof.position = new Vector3(0, 2.17, 0)
    roof.material = busMat; roof.parent = root

    for (const vz of [-0.8, 0.2]) {
      const vent = MeshBuilder.CreateBox('vent', { width: 0.60, height: 0.14, depth: 0.42 }, this.scene)
      vent.position = new Vector3(0, 2.32, vz)
      vent.material = darkMat; vent.parent = root
    }

    const skirt = MeshBuilder.CreateBox('skirt', { width: 3.42, height: 0.28, depth: 3.92 }, this.scene)
    skirt.position = new Vector3(0, 0.50, 0)
    skirt.material = darkMat; skirt.parent = root

    // Black side stripe under the windows — the classic school-bus band.
    for (const sx of [-1, 1]) {
      const band = MeshBuilder.CreateBox('band', { width: 0.05, height: 0.12, depth: 3.80 }, this.scene)
      band.position = new Vector3(sx * 1.72, 1.22, 0)
      band.material = darkMat; band.parent = root
    }

    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const win = MeshBuilder.CreateBox('win', { width: 0.06, height: 0.50, depth: 0.60 }, this.scene)
        win.position = new Vector3(sx * 1.73, 1.60, -1.30 + i * 0.84)
        win.material = winMat; win.parent = root
      }
    }

    const fws = MeshBuilder.CreateBox('fws', { width: 2.60, height: 0.60, depth: 0.06 }, this.scene)
    fws.position = new Vector3(0, 1.68, 1.98)
    fws.material = glassMat; fws.parent = root

    const destSign = MeshBuilder.CreateBox('dest', { width: 2.60, height: 0.22, depth: 0.06 }, this.scene)
    destSign.position = new Vector3(0, 2.05, 1.98)
    destSign.material = darkMat; destSign.parent = root

    const rws = MeshBuilder.CreateBox('rws', { width: 1.80, height: 0.55, depth: 0.06 }, this.scene)
    rws.position = new Vector3(0, 1.68, -1.98)
    rws.material = glassMat; rws.parent = root

    for (const hx of [-1.22, 1.22]) {
      const hl = MeshBuilder.CreateBox('hl', { width: 0.42, height: 0.22, depth: 0.06 }, this.scene)
      hl.position = new Vector3(hx, 0.90, 1.98)
      hl.material = hlMat; hl.parent = root
    }

    for (const tx of [-1.22, 1.22]) {
      const tl = MeshBuilder.CreateBox('tl', { width: 0.44, height: 0.22, depth: 0.06 }, this.scene)
      tl.position = new Vector3(tx, 0.90, -1.98)
      tl.material = tlMat; tl.parent = root
    }

    const fBump = MeshBuilder.CreateBox('fbump', { width: 3.40, height: 0.24, depth: 0.18 }, this.scene)
    fBump.position = new Vector3(0, 0.42, 2.06)
    fBump.material = chromeMat; fBump.parent = root

    const rBump = MeshBuilder.CreateBox('rbump', { width: 3.40, height: 0.24, depth: 0.18 }, this.scene)
    rBump.position = new Vector3(0, 0.42, -2.06)
    rBump.material = chromeMat; rBump.parent = root

    const door = MeshBuilder.CreateBox('door', { width: 0.06, height: 1.50, depth: 0.74 }, this.scene)
    door.position = new Vector3(1.73, 1.00, 1.32)
    door.material = darkMat; door.parent = root

    const doorWin = MeshBuilder.CreateBox('doorwin', { width: 0.06, height: 0.44, depth: 0.36 }, this.scene)
    doorWin.position = new Vector3(1.73, 1.50, 1.32)
    doorWin.material = winMat; doorWin.parent = root

    const stop = MeshBuilder.CreateCylinder('stop', { diameter: 0.50, height: 0.07, tessellation: 8 }, this.scene)
    stop.rotation.x = Math.PI / 2
    stop.position   = new Vector3(-1.76, 1.42, 0.50)
    stop.material   = stopMat; stop.parent = root

    const stopRing = MeshBuilder.CreateCylinder('stopRing', { diameter: 0.54, height: 0.04, tessellation: 8 }, this.scene)
    stopRing.rotation.x = Math.PI / 2
    stopRing.position   = new Vector3(-1.76, 1.42, 0.50)
    stopRing.material   = _emissive(this.scene, new Color3(1.0, 1.0, 1.0))
    stopRing.parent     = root

    const wR = 0.42, wW = 0.26
    for (const [wx, wz] of [[-1.62, 1.48], [1.62, 1.48], [-1.62, -1.38], [1.62, -1.38]]) {
      this._addWheel(root, new Vector3(wx, wR, wz), wR, wW)
    }

    let surface: Surface | undefined
    if (ramped) {
      const topY        = BUS_ROOF
      const rampLength  = 3.8
      const rampLocalZ  = -1.95
      const rampBackLZ  = rampLocalZ - rampLength
      const topFrontLZ  = 1.90
      const widthX      = 3.40
      this._addRamp(root, 0, rampLocalZ, rampLength, topY, widthX)
      surface = {
        rampStartZ: z + rampBackLZ,
        rampEndZ:   z + rampLocalZ,
        topEndZ:    z + topFrontLZ,
        xMin:       x - widthX / 2,
        xMax:       x + widthX / 2,
        topY,
      }
    }

    return { mesh: root, collW: 1.55, collD: 1.60, bottom: 0, top: BUS_ROOF, surface, lanes, passed: false, bumped: false }
  }

  // ─── Ramp builder ─────────────────────────────────────────────────────────

  private _addRamp(
    parent: Mesh,
    x: number,
    topZ: number,
    length: number,
    topY: number,
    widthX: number,
  ): void {
    const slopeLen = Math.sqrt(length * length + topY * topY)
    const angle    = Math.atan2(topY, length)

    const ramp = MeshBuilder.CreateBox('ramp', {
      width: widthX, height: 0.18, depth: slopeLen,
    }, this.scene)
    ramp.rotation.x = -angle
    ramp.position   = new Vector3(x, topY / 2, topZ - length / 2)
    ramp.material       = rampYellow
    ramp.receiveShadows = true
    ramp.parent         = parent

    const stripeCount = 4
    for (let i = 0; i < stripeCount; i++) {
      const t = (i + 0.5) / stripeCount
      const stripe = MeshBuilder.CreateBox('rampStripe', {
        width: widthX * 0.92, height: 0.04, depth: slopeLen * 0.11,
      }, this.scene)
      stripe.rotation.x = -angle
      const s = (t - 0.5) * slopeLen
      stripe.position = new Vector3(
        x,
        topY / 2 + Math.sin(angle) * s + Math.cos(angle) * 0.10,
        topZ - length / 2 + Math.cos(angle) * s + Math.sin(angle) * 0.10 * -1,
      )
      stripe.material = rampStripe
      stripe.parent   = parent
    }

    for (const sx of [-1, 1]) {
      const rail = MeshBuilder.CreateBox('rampRail', {
        width: 0.12, height: 0.22, depth: slopeLen,
      }, this.scene)
      rail.rotation.x = -angle
      rail.position   = new Vector3(
        x + sx * (widthX / 2 + 0.02),
        topY / 2 + Math.cos(angle) * 0.10,
        topZ - length / 2 + Math.sin(angle) * -0.10,
      )
      rail.material = rampStripe
      rail.parent   = parent
    }
  }

  // ─── Wheel builder ─────────────────────────────────────────────────────────

  private _addWheel(parent: Mesh, pos: Vector3, radius: number, width: number): void {
    const tire = MeshBuilder.CreateCylinder('tire', {
      diameter: radius * 2, height: width, tessellation: 16,
    }, this.scene)
    tire.rotation.z = Math.PI / 2
    tire.position   = pos.clone()
    tire.material   = tireMat
    tire.parent     = parent

    const rim = MeshBuilder.CreateCylinder('rim', {
      diameter: radius * 1.30, height: width + 0.01, tessellation: 8,
    }, this.scene)
    rim.rotation.z = Math.PI / 2
    rim.position   = pos.clone()
    rim.material   = rimMat
    rim.parent     = parent
  }

  // ─── Coins ────────────────────────────────────────────────────────────────

  /**
   * One real coin mesh, never rendered; every coin on the track is an
   * instance of it. Dozens of coins are live at once and instancing turns
   * them into a single draw call.
   */
  private _makeCoinTemplate(): Mesh {
    // Cylinder faceUV: [bottom cap, side, top cap]. Caps get the whole
    // star face; the side samples a plain gold corner of the texture.
    const faceUV = [
      new Vector4(0, 0, 1, 1),
      new Vector4(0.02, 0.02, 0.04, 0.04),
      new Vector4(0, 0, 1, 1),
    ]
    const mesh = MeshBuilder.CreateCylinder('coinTemplate', {
      diameter: 0.62, height: 0.12, tessellation: 18, faceUV,
    }, this.scene)
    mesh.material  = coinMat
    mesh.isVisible = false
    mesh.isPickable = false
    return mesh
  }

  private _addCoin(x: number, y: number, z: number, bobOffset: number): void {
    const inst = this.coinTemplate.createInstance('coin')
    inst.rotation.x = Math.PI / 2
    inst.position.set(x, y, z)
    inst.isPickable = false
    this.coins.push({ mesh: inst, collected: false, bobOffset, baseY: y, pulled: false })
  }

  /** True when an obstacle occupies this lane within ±margin of z. */
  private _laneBlocked(lane: number, z: number, margin: number): boolean {
    for (const o of this.obstacles) {
      if (!o.lanes.includes(lane)) continue
      if (Math.abs(o.mesh.position.z - z) < o.collD + margin) return true
    }
    return false
  }

  private _spawnCoinRow(z: number): void {
    const count = 5 + Math.floor(Math.random() * 3)
    const span  = (count - 1) * 1.3
    // Prefer a lane with nothing in it along the whole row.
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5)
    let lane = -1
    for (const l of lanes) {
      let clear = true
      for (let i = 0; i < count && clear; i++) {
        if (this._laneBlocked(l, z + i * 1.3, 2.5)) clear = false
      }
      if (clear) { lane = l; break }
    }
    if (lane < 0) return
    for (let i = 0; i < count; i++) {
      this._addCoin(LANE_POSITIONS[lane], COIN_Y, z + i * 1.3, i * 0.5)
    }
    void span
  }

  /** Arc over a barrier: the coins draw the jump the player should make. */
  private _spawnCoinArc(x: number, z: number): void {
    const n = 5
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const y = COIN_Y + Math.sin(t * Math.PI) * 1.5
      this._addCoin(x, y, z - 2.6 + t * 5.2, i * 0.4)
    }
  }

  /** Low coins under a gantry: reachable only by sliding. */
  private _spawnLowCoins(x: number, z: number): void {
    for (let i = 0; i < 3; i++) {
      this._addCoin(x, 0.62, z - 1.2 + i * 1.2, i * 0.4)
    }
  }

  // Spawns a trail of coins up the ramp and across the rooftop — the big
  // reward for a kid who takes the ramp.
  private _spawnRooftopCoins(s: Surface): void {
    const centerX = (s.xMin + s.xMax) / 2
    const step    = 1.3

    for (let z = s.rampStartZ + 0.6; z < s.rampEndZ; z += step) {
      const t = (z - s.rampStartZ) / (s.rampEndZ - s.rampStartZ)
      this._addCoin(centerX, 0.6 + t * s.topY, z, z * 0.3)
    }
    for (let z = s.rampEndZ + 0.4; z < s.topEndZ; z += step) {
      this._addCoin(centerX, s.topY + 0.7, z, z * 0.3)
    }
  }

  /**
   * Coins knocked loose on a bump. Purely visual — they scatter, bounce
   * once and fade — but seeing them spill is what makes the loss legible
   * to a young player without any text.
   */
  spillCoins(count: number, from: Vector3): void {
    for (let i = 0; i < count; i++) {
      const inst = this.coinTemplate.createInstance('spill')
      inst.rotation.x = Math.PI / 2
      inst.position.set(from.x, from.y + 0.6, from.z)
      inst.isPickable = false
      const a = Math.random() * Math.PI * 2
      const vel = new Vector3(Math.cos(a) * (1.5 + Math.random() * 2), 5 + Math.random() * 3, Math.sin(a) * (1 + Math.random() * 2) - 4)
      this.spilled.push({ mesh: inst, vel, life: 1.3 })
    }
  }

  // ─── Pickups ──────────────────────────────────────────────────────────────

  private _makeMagnet(x: number, z: number): Pickup {
    const root = new Mesh('magnet', this.scene)
    root.position = new Vector3(x, COIN_Y + 0.15, z)
    const red    = _pbr(this.scene, new Color3(0.95, 0.15, 0.15), 0.1, 0.5)
    const silver = _pbr(this.scene, new Color3(0.85, 0.87, 0.92), 0.8, 0.2)
    const glow   = _emissive(this.scene, new Color3(0.4, 0.8, 1.0))

    for (const sx of [-0.3, 0.3]) {
      const leg = MeshBuilder.CreateBox('mleg', { width: 0.24, height: 0.55, depth: 0.24 }, this.scene)
      leg.position = new Vector3(sx, 0.2, 0); leg.material = red; leg.parent = root
      const tip = MeshBuilder.CreateBox('mtip', { width: 0.26, height: 0.18, depth: 0.26 }, this.scene)
      tip.position = new Vector3(sx, 0.56, 0); tip.material = silver; tip.parent = root
    }
    const bridge = MeshBuilder.CreateTorus('mbridge', { diameter: 0.6, thickness: 0.24, tessellation: 12 }, this.scene)
    bridge.rotation.x = Math.PI / 2
    bridge.position = new Vector3(0, -0.08, 0); bridge.material = red; bridge.parent = root
    // hide the top half of the torus inside the legs — cheap U shape
    const ring = MeshBuilder.CreateTorus('mring', { diameter: 1.5, thickness: 0.05, tessellation: 20 }, this.scene)
    ring.position = new Vector3(0, 0.2, 0); ring.material = glow; ring.parent = root

    return { mesh: root, kind: 'magnet', collected: false, bobOffset: Math.random() * 6 }
  }

  private _spawnPickup(z: number): void {
    const lanes = [0, 1, 2].filter(l => !this._laneBlocked(l, z, 4))
    if (!lanes.length) return
    const lane = lanes[Math.floor(Math.random() * lanes.length)]
    this.pickups.push(this._makeMagnet(LANE_POSITIONS[lane], z))
  }

  // ─── Ground query ─────────────────────────────────────────────────────────

  private _groundUnderPlayer(px: number, pz: number): { groundY: number; onObstacle: Obstacle | null } {
    let best = 0
    let owner: Obstacle | null = null
    for (const obs of this.obstacles) {
      const s = obs.surface
      if (!s) continue
      if (px < s.xMin || px > s.xMax) continue
      let h = 0
      if (pz >= s.rampStartZ && pz <= s.rampEndZ) {
        const t = (pz - s.rampStartZ) / (s.rampEndZ - s.rampStartZ)
        h = t * s.topY
      } else if (pz > s.rampEndZ && pz <= s.topEndZ) {
        h = s.topY
      } else {
        continue
      }
      if (h > best) { best = h; owner = obs }
    }
    return { groundY: best, onObstacle: owner }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(player: Player, playerZ: number, dt: number, speed: number, kidMode: boolean, ev: RunEvents): void {
    this.time += dt
    if (this.magnetTimer > 0) this.magnetTimer -= dt

    // ── Spawn ahead ──
    // Spacing is in *seconds* of travel, not metres, so speeding up never
    // compresses the decisions a young player has to make.
    const gapSecs = kidMode ? 1.35 : 0.95
    const minGap  = kidMode ? 15 : 12
    while (this.nextObstacleZ < playerZ + SPAWN_AHEAD) {
      const extraGap = this._spawnObstacle(this.nextObstacleZ, kidMode)
      this.nextObstacleZ += Math.max(minGap, speed * gapSecs) + Math.random() * speed * 0.6 + extraGap
    }
    while (this.nextCoinZ < playerZ + SPAWN_AHEAD) {
      this._spawnCoinRow(this.nextCoinZ)
      this.nextCoinZ += 9 + Math.random() * 7
    }
    while (this.nextPickupZ < playerZ + SPAWN_AHEAD) {
      this._spawnPickup(this.nextPickupZ)
      this.nextPickupZ += kidMode ? 170 + Math.random() * 90 : 260 + Math.random() * 140
    }

    const pp = player.position

    // ── Ground height under player (road vs ramp vs rooftop) ──
    const { groundY, onObstacle } = this._groundUnderPlayer(pp.x, pp.z)
    player.setGroundY(groundY)

    const onRoof = !!onObstacle && groundY >= onObstacle.top - 0.05
    if (onRoof && !this.wasOnRoof) ev.onRooftop()
    this.wasOnRoof = onRoof

    if (onObstacle) {
      this.lastOnObstacle = onObstacle
      this.onGraceTimer   = 0.6
    } else if (this.onGraceTimer > 0) {
      this.onGraceTimer -= dt
      if (this.onGraceTimer <= 0) this.lastOnObstacle = null
    }

    // ── Obstacle collision, dodge credit, despawn ──
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i]
      const op  = obs.mesh.position
      if (op.z < playerZ - DESPAWN_BEHIND) {
        obs.mesh.dispose()
        this.obstacles.splice(i, 1)
        continue
      }

      if (!obs.passed && op.z + obs.collD + PLAYER_HALF < pp.z) {
        obs.passed = true
        if (!obs.bumped) ev.onDodge()
      }

      if (!player.isInvincible && !obs.passed) {
        if (obs === onObstacle) continue
        if (obs === this.lastOnObstacle) continue

        const dx = Math.abs(pp.x - op.x)
        const dz = Math.abs(pp.z - op.z)
        const vertical =
          player.bodyBottom < obs.top && player.bodyTop > obs.bottom

        if (dx < obs.collW + PLAYER_HALF && dz < obs.collD + PLAYER_HALF && vertical) {
          if (player.handleCollision()) {
            obs.bumped = true
            ev.onBump()
          }
        }
      }
    }

    // ── Coins: bob, magnet pull, collect, despawn ──
    const attract = this.magnetTimer > 0 || this.starPower
    // World-space centre of the player (includes the terrain lift).
    const centerY = pp.y
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]
      if (coin.collected) continue
      const cp = coin.mesh.position
      if (cp.z < playerZ - DESPAWN_BEHIND) {
        coin.mesh.dispose()
        this.coins.splice(i, 1)
        continue
      }

      const dzAhead = cp.z - pp.z
      if (attract && dzAhead > -1.5 && dzAhead < MAGNET_REACH_Z &&
          Math.abs(cp.x - pp.x) < MAGNET_REACH_X && Math.abs(cp.y - centerY) < 4) {
        coin.pulled = true
      }

      if (coin.pulled) {
        const target = new Vector3(pp.x, centerY, pp.z)
        const d = target.subtract(cp)
        const len = d.length()
        const step = Math.min(len, MAGNET_SPEED * dt)
        if (len > 1e-3) cp.addInPlace(d.scale(step / len))
      } else {
        cp.y = coin.baseY + terrainY(cp.z) + Math.sin(this.time * 3.5 + coin.bobOffset) * 0.16
      }
      coin.mesh.rotation.z += dt * 3.8

      if (Math.abs(pp.x - cp.x) < 1.05 && Math.abs(pp.z - cp.z) < 1.05 && Math.abs(cp.y - centerY) < 1.35) {
        coin.collected      = true
        coin.mesh.isVisible = false
        ev.onCoin(cp.clone())
      }
    }

    // ── Spilled coins: tiny physics, then fade ──
    for (let i = this.spilled.length - 1; i >= 0; i--) {
      const s = this.spilled[i]
      s.life -= dt
      if (s.life <= 0) { s.mesh.dispose(); this.spilled.splice(i, 1); continue }
      s.vel.y -= 16 * dt
      s.mesh.position.addInPlace(s.vel.scale(dt))
      const floor = terrainY(s.mesh.position.z) + 0.3
      if (s.mesh.position.y < floor) { s.mesh.position.y = floor; s.vel.y = Math.abs(s.vel.y) * 0.45 }
      s.mesh.rotation.z += dt * 9
      const k = Math.min(1, s.life * 2)
      s.mesh.scaling.setAll(k)
    }

    // ── Pickups ──
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p  = this.pickups[i]
      const mp = p.mesh.position
      if (p.collected || mp.z < playerZ - DESPAWN_BEHIND) {
        p.mesh.dispose()
        this.pickups.splice(i, 1)
        continue
      }
      mp.y = COIN_Y + 0.15 + terrainY(mp.z) + Math.sin(this.time * 2.5 + p.bobOffset) * 0.2
      p.mesh.rotation.y += dt * 2.2
      if (Math.abs(pp.x - mp.x) < 1.1 && Math.abs(pp.z - mp.z) < 1.1 && Math.abs(mp.y - centerY) < 1.5) {
        p.collected = true
        this.magnetTimer = 9
        ev.onMagnet()
      }
    }
  }

  reset(): void {
    this.obstacles.forEach(o => o.mesh.dispose())
    this.coins.forEach(c => c.mesh.dispose())
    this.spilled.forEach(s => s.mesh.dispose())
    this.pickups.forEach(p => p.mesh.dispose())
    this.obstacles      = []
    this.coins          = []
    this.spilled        = []
    this.pickups        = []
    this.nextObstacleZ  = 38
    this.nextCoinZ      = 16
    this.nextPickupZ    = 140
    this.magnetTimer    = 0
    this.starPower      = false
    this.lastOnObstacle = null
    this.onGraceTimer   = 0
    this.wasOnRoof      = false
  }
}
