import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  Color3,
  PBRMaterial,
  StandardMaterial,
} from '@babylonjs/core'
import { LANE_POSITIONS } from '../track/TrackChunk'
import { Player } from '../player/Player'

const SPAWN_AHEAD    = 65
const DESPAWN_BEHIND = 22
const PLAYER_HALF    = 0.38   // half player body size added to each collision side

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

interface Obstacle {
  mesh:     Mesh
  collW:    number
  collD:    number
  surface?: Surface
}
interface Coin     { mesh: Mesh; collected: boolean; bobOffset: number }

// ─── Material cache ───────────────────────────────────────────────────────────

let _scene: Scene | null = null
const _matCache = new Map<string, PBRMaterial | StandardMaterial>()

// Shared across all vehicles
let tireMat:     PBRMaterial
let rimMat:      PBRMaterial
let glassMat:    PBRMaterial
let coinMat:     PBRMaterial
let coinGlowMat: StandardMaterial
let rampYellow:  PBRMaterial
let rampStripe:  PBRMaterial

// ── Per-spawn random color palettes ──────────────────────────────────────────

const CAR_BODY_COLORS = [
  new Color3(0.82, 0.10, 0.08),  // fire red
  new Color3(0.10, 0.26, 0.82),  // royal blue
  new Color3(0.70, 0.70, 0.72),  // silver
  new Color3(0.07, 0.07, 0.09),  // midnight black
  new Color3(0.92, 0.92, 0.92),  // pearl white
  new Color3(0.88, 0.46, 0.05),  // burnt orange
  new Color3(0.12, 0.52, 0.18),  // forest green
  new Color3(0.45, 0.10, 0.60),  // purple
]

const TRUCK_CAB_COLORS = [
  new Color3(0.92, 0.92, 0.92),  // white
  new Color3(0.12, 0.12, 0.14),  // dark grey
  new Color3(0.60, 0.16, 0.08),  // dark red
  new Color3(0.06, 0.18, 0.50),  // navy
  new Color3(0.82, 0.60, 0.08),  // gold
]

function initMats(scene: Scene): void {
  if (_scene === scene) return
  _scene = scene
  _matCache.clear()

  tireMat  = _pbr(scene, new Color3(0.06, 0.06, 0.07), 0.0,  0.95)
  rimMat   = _pbr(scene, new Color3(0.76, 0.76, 0.80), 0.88, 0.12)
  glassMat = _pbr(scene, new Color3(0.18, 0.24, 0.34), 0.05, 0.04)

  coinMat             = new PBRMaterial('coin', scene)
  coinMat.albedoColor = new Color3(1.0, 0.85, 0.0)
  coinMat.metallic    = 0.8; coinMat.roughness = 0.2

  coinGlowMat                 = new StandardMaterial('coinGlow', scene)
  coinGlowMat.emissiveColor   = new Color3(0.8, 0.65, 0.0)
  coinGlowMat.disableLighting = true

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

// ─── Obstacle Manager ─────────────────────────────────────────────────────────

export class ObstacleManager {
  private scene:         Scene
  private obstacles:     Obstacle[] = []
  private coins:         Coin[]     = []
  private nextObstacleZ = 35
  private nextCoinZ     = 18
  public  score         = 0
  private time          = 0
  // Remember the vehicle the player was most recently standing on — collision
  // stays suppressed for a short grace period afterwards so falling off the
  // front of the rooftop doesn't immediately bump into the cab below.
  private lastOnObstacle: Obstacle | null = null
  private onGraceTimer   = 0

  constructor(scene: Scene) {
    this.scene = scene
    initMats(scene)
  }

  // ─── Spawning ──────────────────────────────────────────────────────────────

  // Returns the z-length taken up by the spawned obstacle (ramps need extra
  // breathing room so the player can line up with them), so the caller can
  // advance nextObstacleZ by a suitable amount.
  private _spawnObstacle(z: number): number {
    const roll = Math.random()
    let obs: Obstacle
    let extraGap = 0

    if (roll < 0.42) {
      // Single-lane car
      const lane = Math.floor(Math.random() * 3)
      obs = this._makeCar(z, LANE_POSITIONS[lane])
    } else if (roll < 0.74) {
      // Delivery truck — ~40% chance it has a rear ramp the player can run up.
      const lane    = Math.floor(Math.random() * 3)
      const ramped  = Math.random() < 0.40
      obs = this._makeTruck(z, LANE_POSITIONS[lane], ramped)
      if (ramped) {
        this._spawnRooftopCoins(obs.surface!)
        extraGap = 6      // extra spacing so ramp doesn't jam into prior obstacle
      }
    } else {
      // Bus spanning two lanes — ~40% chance it has a rear ramp.
      const busX    = Math.random() > 0.5 ? 1.25 : -1.25
      const ramped  = Math.random() < 0.40
      obs = this._makeBus(z, busX, ramped)
      if (ramped) {
        this._spawnRooftopCoins(obs.surface!)
        extraGap = 6
      }
    }

    this.obstacles.push(obs)
    return extraGap
  }

  // ─── Car (sedan) ──────────────────────────────────────────────────────────
  //
  //  Side view (player approaches from -Z, sees rear):
  //       ┌──────┐
  //       │cabin │
  //  ┌────┴──────┴────┐   ← lower body
  //  ○              ○     ← wheels
  //
  private _makeCar(z: number, x: number): Obstacle {
    const root     = new Mesh('car', this.scene)
    root.position  = new Vector3(x, 0, z)

    const bodyColor = CAR_BODY_COLORS[Math.floor(Math.random() * CAR_BODY_COLORS.length)]
    const bodyMat   = _pbr(this.scene, bodyColor, 0.10, 0.40)
    const bumpMat   = _pbr(this.scene, new Color3(0.10, 0.10, 0.12), 0.05, 0.80)
    const hlMat     = _emissive(this.scene, new Color3(1.00, 0.97, 0.88))
    const tlMat     = _emissive(this.scene, new Color3(0.95, 0.04, 0.04))

    // ── Underframe (dark chassis visible under body) ──
    const frame = MeshBuilder.CreateBox('frame', { width: 1.60, height: 0.16, depth: 3.20 }, this.scene)
    frame.position = new Vector3(0, 0.14, 0)
    frame.material = _pbr(this.scene, new Color3(0.08, 0.08, 0.10), 0.3, 0.9)
    frame.parent   = root

    // ── Lower body (full length) ──
    const body = MeshBuilder.CreateBox('body', { width: 1.96, height: 0.56, depth: 3.60 }, this.scene)
    body.position = new Vector3(0, 0.58, 0)
    body.material = bodyMat; body.receiveShadows = true; body.parent = root

    // ── Cabin / glasshouse (sits on body, shifted slightly rearward) ──
    const cabin = MeshBuilder.CreateBox('cabin', { width: 1.68, height: 0.52, depth: 1.96 }, this.scene)
    cabin.position = new Vector3(0, 1.12, -0.18)
    cabin.material = bodyMat; cabin.parent = root

    // ── Windows ──
    // Front windshield (faces away from player)
    const wf = MeshBuilder.CreateBox('wf', { width: 1.44, height: 0.36, depth: 0.05 }, this.scene)
    wf.position = new Vector3(0, 1.12, 0.80)
    wf.material = glassMat; wf.parent = root

    // Rear window (faces the approaching player — most visible)
    const wr = MeshBuilder.CreateBox('wr', { width: 1.44, height: 0.36, depth: 0.05 }, this.scene)
    wr.position = new Vector3(0, 1.12, -1.16)
    wr.material = glassMat; wr.parent = root

    // Side windows (left & right)
    for (const sx of [-1, 1]) {
      const ws = MeshBuilder.CreateBox('ws', { width: 0.05, height: 0.30, depth: 1.22 }, this.scene)
      ws.position = new Vector3(sx * 0.865, 1.12, -0.18)
      ws.material = glassMat; ws.parent = root
    }

    // ── Front & rear bumpers ──
    for (const bz of [1.86, -1.86]) {
      const bump = MeshBuilder.CreateBox('bump', { width: 1.96, height: 0.24, depth: 0.14 }, this.scene)
      bump.position = new Vector3(0, 0.30, bz)
      bump.material = bumpMat; bump.parent = root
    }

    // ── Headlights (front, faces away) ──
    for (const hx of [-0.64, 0.64]) {
      const hl = MeshBuilder.CreateBox('hl', { width: 0.30, height: 0.14, depth: 0.05 }, this.scene)
      hl.position = new Vector3(hx, 0.62, 1.83)
      hl.material = hlMat; hl.parent = root
    }

    // ── Taillights (rear, faces player — most prominent) ──
    for (const tx of [-0.64, 0.64]) {
      const tl = MeshBuilder.CreateBox('tl', { width: 0.34, height: 0.13, depth: 0.05 }, this.scene)
      tl.position = new Vector3(tx, 0.62, -1.83)
      tl.material = tlMat; tl.parent = root
    }

    // ── 4 Wheels ──
    const wR = 0.26, wW = 0.18
    for (const [wx, wz] of [[-0.97, 1.25], [0.97, 1.25], [-0.97, -1.25], [0.97, -1.25]]) {
      this._addWheel(root, new Vector3(wx, wR, wz), wR, wW)
    }

    return { mesh: root as unknown as Mesh, collW: 0.84, collD: 1.55 }
  }

  // ─── Delivery truck ───────────────────────────────────────────────────────
  //
  //  Side view:
  //  ┌──┐┌─────────────┐
  //  │cb││  cargo box  │
  //  ○  ○○             ○
  //
  private _makeTruck(z: number, x: number, ramped = false): Obstacle {
    const root    = new Mesh('truck', this.scene)
    root.position = new Vector3(x, 0, z)

    const cabColor = TRUCK_CAB_COLORS[Math.floor(Math.random() * TRUCK_CAB_COLORS.length)]
    const cabMat   = _pbr(this.scene, cabColor, 0.08, 0.50)
    const cargoMat = _pbr(this.scene, new Color3(0.90, 0.90, 0.90), 0.04, 0.80)
    const darkMat  = _pbr(this.scene, new Color3(0.08, 0.08, 0.10), 0.20, 0.88)
    const hlMat    = _emissive(this.scene, new Color3(1.00, 0.97, 0.88))
    const tlMat    = _emissive(this.scene, new Color3(0.95, 0.04, 0.04))
    const signalMat = _emissive(this.scene, new Color3(0.95, 0.55, 0.02))
    const chromeMat = _pbr(this.scene, new Color3(0.82, 0.82, 0.86), 0.92, 0.08)

    // ── Underframe ──
    const frame = MeshBuilder.CreateBox('frame', { width: 2.10, height: 0.22, depth: 4.80 }, this.scene)
    frame.position = new Vector3(0, 0.20, -0.15)
    frame.material = darkMat; frame.parent = root

    // ── Cab (front section) ──
    const cab = MeshBuilder.CreateBox('cab', { width: 2.20, height: 1.70, depth: 1.80 }, this.scene)
    cab.position = new Vector3(0, 1.16, 1.10)
    cab.material = cabMat; cab.receiveShadows = true; cab.parent = root

    // Cab roof overhang
    const cabRoof = MeshBuilder.CreateBox('cabRoof', { width: 2.22, height: 0.12, depth: 1.84 }, this.scene)
    cabRoof.position = new Vector3(0, 2.02, 1.10)
    cabRoof.material = cabMat; cabRoof.parent = root

    // Cab windshield
    const cws = MeshBuilder.CreateBox('cws', { width: 1.72, height: 0.58, depth: 0.05 }, this.scene)
    cws.position = new Vector3(0, 1.55, 2.01)
    cws.material = glassMat; cws.parent = root

    // Cab side windows
    for (const sx of [-1, 1]) {
      const csw = MeshBuilder.CreateBox('csw', { width: 0.05, height: 0.46, depth: 0.90 }, this.scene)
      csw.position = new Vector3(sx * 1.115, 1.55, 1.10)
      csw.material = glassMat; csw.parent = root
    }

    // ── Cargo box (rear section) ──
    const cargo = MeshBuilder.CreateBox('cargo', { width: 2.20, height: 1.90, depth: 2.90 }, this.scene)
    cargo.position = new Vector3(0, 1.26, -0.95)
    cargo.material = cargoMat; cargo.receiveShadows = true; cargo.parent = root

    // Cargo door split line (vertical center seam)
    const seam = MeshBuilder.CreateBox('seam', { width: 0.04, height: 1.88, depth: 0.05 }, this.scene)
    seam.position = new Vector3(0, 1.26, -2.41)
    seam.material = darkMat; seam.parent = root

    // Cargo door horizontal bar
    const hbar = MeshBuilder.CreateBox('hbar', { width: 2.20, height: 0.06, depth: 0.05 }, this.scene)
    hbar.position = new Vector3(0, 1.00, -2.41)
    hbar.material = darkMat; hbar.parent = root

    // ── Chrome grille ──
    const grille = MeshBuilder.CreateBox('grille', { width: 1.80, height: 0.52, depth: 0.06 }, this.scene)
    grille.position = new Vector3(0, 0.70, 2.02)
    grille.material = chromeMat; grille.parent = root

    // Chrome grille bars
    for (let i = 0; i < 4; i++) {
      const bar = MeshBuilder.CreateBox('gb', { width: 1.80, height: 0.05, depth: 0.07 }, this.scene)
      bar.position = new Vector3(0, 0.46 + i * 0.15, 2.02)
      bar.material = chromeMat; bar.parent = root
    }

    // ── Front bumper ──
    const fBump = MeshBuilder.CreateBox('fbump', { width: 2.20, height: 0.28, depth: 0.18 }, this.scene)
    fBump.position = new Vector3(0, 0.38, 2.10)
    fBump.material = chromeMat; fBump.parent = root

    // ── Rear step/bumper ──
    const rBump = MeshBuilder.CreateBox('rbump', { width: 2.20, height: 0.18, depth: 0.16 }, this.scene)
    rBump.position = new Vector3(0, 0.38, -2.42)
    rBump.material = chromeMat; rBump.parent = root

    // ── Headlights (front) ──
    for (const hx of [-0.78, 0.78]) {
      const hl = MeshBuilder.CreateBox('hl', { width: 0.32, height: 0.20, depth: 0.05 }, this.scene)
      hl.position = new Vector3(hx, 0.96, 2.02)
      hl.material = hlMat; hl.parent = root
      // Turn signal below headlight
      const sig = MeshBuilder.CreateBox('sig', { width: 0.20, height: 0.12, depth: 0.05 }, this.scene)
      sig.position = new Vector3(hx, 0.75, 2.02)
      sig.material = signalMat; sig.parent = root
    }

    // ── Taillights (rear, facing player) ──
    for (const tx of [-0.78, 0.78]) {
      const tl = MeshBuilder.CreateBox('tl', { width: 0.28, height: 0.20, depth: 0.05 }, this.scene)
      tl.position = new Vector3(tx, 1.00, -2.42)
      tl.material = tlMat; tl.parent = root
    }

    // ── Exhaust pipe (left side of cab) ──
    const exh = MeshBuilder.CreateCylinder('exh', { height: 1.10, diameter: 0.10, tessellation: 8 }, this.scene)
    exh.position = new Vector3(-1.00, 1.82, 1.10)
    exh.material = chromeMat; exh.parent = root

    // ── 6 Wheels (2 front, 4 rear dual) ──
    const wR = 0.34, wW = 0.22
    // Front axle
    for (const wx of [-1.06, 1.06]) {
      this._addWheel(root, new Vector3(wx, wR, 1.55), wR, wW)
    }
    // Rear dual axle (spaced slightly apart)
    for (const wx of [-1.06, 1.06]) {
      this._addWheel(root, new Vector3(wx, wR, -0.52), wR, wW)
      this._addWheel(root, new Vector3(wx, wR, -1.55), wR, wW)
    }

    // ── Optional rear ramp (player runs up it onto the cargo-box roof) ──
    // Cargo box: center z=-0.95, depth 2.90, height 1.90 → top at y=2.21,
    // back at z=-2.40. Ramp rises from ground at z=-2.40 down to rear.
    let surface: Surface | undefined
    if (ramped) {
      const topY        = 2.21
      const rampLength  = 3.6
      const rampLocalZ  = -2.40           // where rooftop meets ramp (local z)
      const rampBackLZ  = rampLocalZ - rampLength
      const topFrontLZ  = 0.50            // front end of cargo roof (local z)
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

    return { mesh: root as unknown as Mesh, collW: 0.94, collD: 2.00, surface }
  }

  // ─── School bus (spans 2 lanes) ───────────────────────────────────────────
  //
  //  Top view (x centered between two lanes):
  //  ┌─────────────────────────────┐
  //  │  [w][w][w][w]  [w][w][w][w]│   ← window rows
  //  └─────────────────────────────┘
  //     lane 0 blocked  lane 1 blocked   lane 2 free (or vice versa)
  //
  private _makeBus(z: number, x: number, ramped = false): Obstacle {
    const root    = new Mesh('bus', this.scene)
    root.position = new Vector3(x, 0, z)

    const busMat    = _pbr(this.scene, new Color3(0.98, 0.78, 0.02), 0.04, 0.60)  // school bus yellow
    const darkMat   = _pbr(this.scene, new Color3(0.08, 0.08, 0.10), 0.10, 0.85)
    const chromeMat = _pbr(this.scene, new Color3(0.80, 0.80, 0.84), 0.90, 0.10)
    const hlMat     = _emissive(this.scene, new Color3(1.00, 0.97, 0.88))
    const tlMat     = _emissive(this.scene, new Color3(0.95, 0.04, 0.04))
    const winMat    = _emissive(this.scene, new Color3(0.60, 0.72, 0.90))
    const stopMat   = _emissive(this.scene, new Color3(0.92, 0.05, 0.05))

    // ── Underframe ──
    const frame = MeshBuilder.CreateBox('frame', { width: 3.30, height: 0.26, depth: 3.90 }, this.scene)
    frame.position = new Vector3(0, 0.22, 0)
    frame.material = darkMat; frame.parent = root

    // ── Main body ──
    const body = MeshBuilder.CreateBox('body', { width: 3.40, height: 1.80, depth: 3.90 }, this.scene)
    body.position = new Vector3(0, 1.25, 0)
    body.material = busMat; body.receiveShadows = true; body.parent = root

    // ── Roof (slightly wider/longer for overhang effect) ──
    const roof = MeshBuilder.CreateBox('roof', { width: 3.44, height: 0.14, depth: 3.94 }, this.scene)
    roof.position = new Vector3(0, 2.17, 0)
    roof.material = busMat; roof.parent = root

    // Roof vents / HVAC bumps
    for (const vz of [-0.8, 0.2]) {
      const vent = MeshBuilder.CreateBox('vent', { width: 0.60, height: 0.14, depth: 0.42 }, this.scene)
      vent.position = new Vector3(0, 2.32, vz)
      vent.material = darkMat; vent.parent = root
    }

    // ── Black rubber skirt along bottom ──
    const skirt = MeshBuilder.CreateBox('skirt', { width: 3.42, height: 0.28, depth: 3.92 }, this.scene)
    skirt.position = new Vector3(0, 0.50, 0)
    skirt.material = darkMat; skirt.parent = root

    // ── Side windows (left & right faces, 4 per side) ──
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const win = MeshBuilder.CreateBox('win', { width: 0.06, height: 0.50, depth: 0.60 }, this.scene)
        win.position = new Vector3(sx * 1.73, 1.55, -1.30 + i * 0.84)
        win.material = winMat; win.parent = root
      }
    }

    // ── Front face ──
    // Windshield (faces away from player)
    const fws = MeshBuilder.CreateBox('fws', { width: 2.60, height: 0.60, depth: 0.06 }, this.scene)
    fws.position = new Vector3(0, 1.68, 1.98)
    fws.material = glassMat; fws.parent = root

    // Front destination sign (black strip above windshield)
    const destSign = MeshBuilder.CreateBox('dest', { width: 2.60, height: 0.22, depth: 0.06 }, this.scene)
    destSign.position = new Vector3(0, 2.05, 1.98)
    destSign.material = darkMat; destSign.parent = root

    // ── Rear face (player-facing) ──
    // Rear window
    const rws = MeshBuilder.CreateBox('rws', { width: 1.80, height: 0.55, depth: 0.06 }, this.scene)
    rws.position = new Vector3(0, 1.68, -1.98)
    rws.material = glassMat; rws.parent = root

    // ── Headlights (front, rounded) ──
    for (const hx of [-1.22, 1.22]) {
      const hl = MeshBuilder.CreateBox('hl', { width: 0.42, height: 0.22, depth: 0.06 }, this.scene)
      hl.position = new Vector3(hx, 0.90, 1.98)
      hl.material = hlMat; hl.parent = root
    }

    // ── Taillights (rear, large — faces player) ──
    for (const tx of [-1.22, 1.22]) {
      const tl = MeshBuilder.CreateBox('tl', { width: 0.44, height: 0.22, depth: 0.06 }, this.scene)
      tl.position = new Vector3(tx, 0.90, -1.98)
      tl.material = tlMat; tl.parent = root
    }

    // ── Front chrome bumper ──
    const fBump = MeshBuilder.CreateBox('fbump', { width: 3.40, height: 0.24, depth: 0.18 }, this.scene)
    fBump.position = new Vector3(0, 0.42, 2.06)
    fBump.material = chromeMat; fBump.parent = root

    // ── Rear chrome bumper ──
    const rBump = MeshBuilder.CreateBox('rbump', { width: 3.40, height: 0.24, depth: 0.18 }, this.scene)
    rBump.position = new Vector3(0, 0.42, -2.06)
    rBump.material = chromeMat; rBump.parent = root

    // ── Door (front right side) ──
    const door = MeshBuilder.CreateBox('door', { width: 0.06, height: 1.50, depth: 0.74 }, this.scene)
    door.position = new Vector3(1.73, 1.00, 1.32)
    door.material = darkMat; door.parent = root

    const doorWin = MeshBuilder.CreateBox('doorwin', { width: 0.06, height: 0.44, depth: 0.36 }, this.scene)
    doorWin.position = new Vector3(1.73, 1.50, 1.32)
    doorWin.material = winMat; doorWin.parent = root

    // ── Stop sign octagon (left side — the classic school bus detail) ──
    const stop = MeshBuilder.CreateCylinder('stop', { diameter: 0.50, height: 0.07, tessellation: 8 }, this.scene)
    stop.rotation.x = Math.PI / 2
    stop.position   = new Vector3(-1.76, 1.42, 0.50)
    stop.material   = stopMat; stop.parent = root

    // White "STOP" ring
    const stopRing = MeshBuilder.CreateCylinder('stopRing', { diameter: 0.54, height: 0.04, tessellation: 8 }, this.scene)
    stopRing.rotation.x = Math.PI / 2
    stopRing.position   = new Vector3(-1.76, 1.42, 0.50)
    stopRing.material   = _emissive(this.scene, new Color3(1.0, 1.0, 1.0))
    stopRing.parent     = root

    // ── 4 Large wheels ──
    const wR = 0.42, wW = 0.26
    for (const [wx, wz] of [[-1.62, 1.48], [1.62, 1.48], [-1.62, -1.38], [1.62, -1.38]]) {
      this._addWheel(root, new Vector3(wx, wR, wz), wR, wW)
    }

    // ── Optional rear ramp (player runs up it onto the bus roof) ──
    // Body: center y=1.25, height 1.80; roof at y=2.17 + 0.07 half → top y=2.24.
    // Rear of body at z=-1.95 (body depth 3.90 → half 1.95).
    let surface: Surface | undefined
    if (ramped) {
      const topY        = 2.24
      const rampLength  = 3.8
      const rampLocalZ  = -1.95
      const rampBackLZ  = rampLocalZ - rampLength
      const topFrontLZ  = 1.90            // front end of bus roof (local z)
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

    return { mesh: root as unknown as Mesh, collW: 1.55, collD: 1.60, surface }
  }

  // ─── Ramp builder ─────────────────────────────────────────────────────────
  //
  // Builds a sloped yellow ramp attached to `parent`. Dimensions are in the
  // parent's local frame. The ramp's high end sits at (x, topY, topZ) and
  // slopes down to (x, 0, topZ - length) along +y / -z.
  //
  // Visually: a thin rotated box tinted hazard yellow plus black diagonal
  // stripes along the top surface. Kid-friendly and unmistakably "run up me".
  //
  private _addRamp(
    parent: Mesh,
    x: number,
    topZ: number,
    length: number,
    topY: number,
    widthX: number,
  ): void {
    const slopeLen = Math.sqrt(length * length + topY * topY)
    const angle    = Math.atan2(topY, length)  // pitch around X

    // Solid sloped slab
    const ramp = MeshBuilder.CreateBox('ramp', {
      width: widthX, height: 0.18, depth: slopeLen,
    }, this.scene)
    ramp.rotation.x = -angle   // tilt so +z end rises
    ramp.position   = new Vector3(
      x,
      topY / 2,
      topZ - length / 2,
    )
    ramp.material       = rampYellow
    ramp.receiveShadows = true
    ramp.parent         = parent

    // Black hazard stripes across the top surface (sit just above the slab)
    const stripeCount = 4
    for (let i = 0; i < stripeCount; i++) {
      const t = (i + 0.5) / stripeCount   // 0.125, 0.375, 0.625, 0.875
      const stripe = MeshBuilder.CreateBox('rampStripe', {
        width: widthX * 0.92, height: 0.04, depth: slopeLen * 0.11,
      }, this.scene)
      stripe.rotation.x = -angle
      // Position along the slope: offset from center along the tilted axis
      const s = (t - 0.5) * slopeLen                // signed distance along slope
      stripe.position = new Vector3(
        x,
        topY / 2 + Math.sin(angle) * s + Math.cos(angle) * 0.10,
        topZ - length / 2 + Math.cos(angle) * s + Math.sin(angle) * 0.10 * -1,
      )
      stripe.material = rampStripe
      stripe.parent   = parent
    }

    // Short side rails so the ramp reads as a 3D object and not a flat decal
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
    // Rubber tyre
    const tire = MeshBuilder.CreateCylinder('tire', {
      diameter: radius * 2, height: width, tessellation: 16,
    }, this.scene)
    tire.rotation.z = Math.PI / 2
    tire.position   = pos.clone()
    tire.material   = tireMat
    tire.parent     = parent

    // Alloy rim (slightly smaller diameter, pops through tire)
    const rim = MeshBuilder.CreateCylinder('rim', {
      diameter: radius * 1.30, height: width + 0.01, tessellation: 8,
    }, this.scene)
    rim.rotation.z = Math.PI / 2
    rim.position   = pos.clone()
    rim.material   = rimMat
    rim.parent     = parent
  }

  // ─── Coins ────────────────────────────────────────────────────────────────

  private _spawnCoinRow(z: number): void {
    const lane  = Math.floor(Math.random() * 3)
    const count = 4 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const mesh = MeshBuilder.CreateCylinder('coin', { diameter: 0.48, height: 0.10, tessellation: 16 }, this.scene)
      mesh.rotation.x = Math.PI / 2
      mesh.position   = new Vector3(LANE_POSITIONS[lane], 1.10, z + i * 1.3)
      mesh.material   = coinMat
      this.coins.push({ mesh, collected: false, bobOffset: i * 0.5 })
    }
  }

  // Spawns a trail of coins up the ramp and across the rooftop — the big
  // reward for a kid who nails the ramp jump.
  private _spawnRooftopCoins(s: Surface): void {
    const centerX = (s.xMin + s.xMax) / 2
    const step    = 1.3

    // Ramp: coins hover ~0.6 above the ramp surface (linear rise from 0 to topY)
    for (let z = s.rampStartZ + 0.6; z < s.rampEndZ; z += step) {
      const t = (z - s.rampStartZ) / (s.rampEndZ - s.rampStartZ)
      const y = 0.6 + t * s.topY
      const mesh = MeshBuilder.CreateCylinder('coin', { diameter: 0.48, height: 0.10, tessellation: 16 }, this.scene)
      mesh.rotation.x = Math.PI / 2
      mesh.position   = new Vector3(centerX, y, z)
      mesh.material   = coinMat
      this.coins.push({ mesh, collected: false, bobOffset: z * 0.3 })
    }

    // Rooftop: coins at topY + 0.6
    for (let z = s.rampEndZ + 0.4; z < s.topEndZ; z += step) {
      const mesh = MeshBuilder.CreateCylinder('coin', { diameter: 0.48, height: 0.10, tessellation: 16 }, this.scene)
      mesh.rotation.x = Math.PI / 2
      mesh.position   = new Vector3(centerX, s.topY + 0.6, z)
      mesh.material   = coinMat
      this.coins.push({ mesh, collected: false, bobOffset: z * 0.3 })
    }
  }

  // Given the player's (x, z), returns the highest runnable surface height
  // under them and the obstacle that owns it (so collision can be skipped
  // while they're on top of it). Returns { groundY: 0 } if on the road.
  private _groundUnderPlayer(px: number, pz: number): { groundY: number; onObstacle: Obstacle | null } {
    let best = 0
    let owner: Obstacle | null = null
    for (const obs of this.obstacles) {
      const s = obs.surface
      if (!s) continue
      if (px < s.xMin || px > s.xMax) continue
      let h = 0
      if (pz >= s.rampStartZ && pz <= s.rampEndZ) {
        // On the ramp — linear ramp-up
        const t = (pz - s.rampStartZ) / (s.rampEndZ - s.rampStartZ)
        h = t * s.topY
      } else if (pz > s.rampEndZ && pz <= s.topEndZ) {
        // On the flat rooftop
        h = s.topY
      } else {
        continue
      }
      if (h > best) { best = h; owner = obs }
    }
    return { groundY: best, onObstacle: owner }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(player: Player, playerZ: number, dt: number, onShake: () => void): void {
    this.time += dt

    // Spawn ahead
    while (this.nextObstacleZ < playerZ + SPAWN_AHEAD) {
      const extraGap = this._spawnObstacle(this.nextObstacleZ)
      this.nextObstacleZ += 12 + Math.random() * 10 + extraGap
    }
    while (this.nextCoinZ < playerZ + SPAWN_AHEAD) {
      this._spawnCoinRow(this.nextCoinZ)
      this.nextCoinZ += 7 + Math.random() * 6
    }

    const pp = player.position

    // ── Determine ground height under player (road vs ramp vs rooftop) ──
    // Compute *before* obstacle collision so we can skip collisions with any
    // vehicle the player is currently standing on.
    const { groundY, onObstacle } = this._groundUnderPlayer(pp.x, pp.z)
    player.setGroundY(groundY)

    if (onObstacle) {
      this.lastOnObstacle = onObstacle
      this.onGraceTimer   = 0.6
    } else if (this.onGraceTimer > 0) {
      this.onGraceTimer -= dt
      if (this.onGraceTimer <= 0) this.lastOnObstacle = null
    }

    // Obstacle collision + despawn
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i]
      const op  = obs.mesh.position
      if (op.z < playerZ - DESPAWN_BEHIND) {
        obs.mesh.dispose()
        this.obstacles.splice(i, 1)
        continue
      }
      if (!player.isInvincible) {
        // Skip collision with the vehicle the player is currently running on
        // top of (or was on in the last 0.6s), OR any vehicle whose rooftop
        // the player is clearly above.
        if (obs === onObstacle) continue
        if (obs === this.lastOnObstacle) continue
        if (obs.surface && player.feetY >= obs.surface.topY - 0.15) continue

        const dx = Math.abs(pp.x - op.x)
        const dz = Math.abs(pp.z - op.z)
        if (dx < obs.collW + PLAYER_HALF && dz < obs.collD + PLAYER_HALF) {
          player.handleCollision()
          onShake()
        }
      }
    }

    // Coin bob + collect + despawn
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]
      if (coin.collected) continue
      const cp = coin.mesh.position
      if (cp.z < playerZ - DESPAWN_BEHIND) {
        coin.mesh.dispose()
        this.coins.splice(i, 1)
        continue
      }
      coin.mesh.position.y = 1.10 + Math.sin(this.time * 3.5 + coin.bobOffset) * 0.18
      coin.mesh.rotation.z += dt * 3.5

      if (Math.abs(pp.x - cp.x) < 1.1 && Math.abs(pp.z - cp.z) < 1.1) {
        coin.collected      = true
        coin.mesh.isVisible = false
        this.score         += 10
        player.triggerCoinEffect()
      }
    }
  }

  reset(): void {
    this.obstacles.forEach(o => o.mesh.dispose())
    this.coins.forEach(c => c.mesh.dispose())
    this.obstacles      = []
    this.coins          = []
    this.nextObstacleZ  = 35
    this.nextCoinZ      = 18
    this.score          = 0
    this.lastOnObstacle = null
    this.onGraceTimer   = 0
  }
}
