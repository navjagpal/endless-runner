import {
  Scene,
  Mesh,
  MeshBuilder,
  InstancedMesh,
  Vector3,
  Vector4,
  Color3,
  Color4,
  PBRMaterial,
  StandardMaterial,
  ParticleSystem,
} from '@babylonjs/core'
import { Kits, styleChunk, getQualityProfile, getCoinTexture, getSoftDiscTexture, terrainY, terrainSlope } from '@kids/engine'
import { LANE_X } from './Road'
import type { Vehicle } from './Vehicle'

/**
 * Everything on the road besides the player: slow traffic to overtake,
 * ramps to launch off, puddles to splash through, car washes to drive
 * under, and coins. Nothing here can end the run; a bump is a bonk.
 */

export interface TrafficEvents {
  onCoin:     (pos: Vector3) => void
  onBonk:     () => void
  onOvertake: () => void
  onRamp:     () => void
  onSplash:   () => void
  onWash:     () => void
}

interface Car    { root: Mesh; lane: number; z: number; halfD: number; top: number; speed: number; bumped: boolean; passed: boolean }
interface Ramp   { root: Mesh; lane: number; z: number; rise: number; length: number; launched: boolean }
interface Puddle { mesh: Mesh; lane: number; z: number; done: boolean }
interface Wash   { root: Mesh; z: number; rollers: Mesh[]; done: boolean }
interface Coin   { mesh: InstancedMesh; baseY: number; bob: number; collected: boolean }

const SPAWN_AHEAD = 80
const DESPAWN = 25
const TRAFFIC_SPEED = 5
const CAR_MODELS = ['sedan', 'hatchback-sports', 'suv', 'taxi', 'van', 'sedan-sports', 'delivery']
const COIN_Y = 1.15

let _mats: { coin: PBRMaterial; rampY: PBRMaterial; rampS: PBRMaterial; puddle: StandardMaterial; wash: PBRMaterial; roller: PBRMaterial } | null = null
function mats(scene: Scene) {
  if (_mats) return _mats
  const coin = new PBRMaterial('coin', scene)
  coin.albedoColor = new Color3(1, 0.92, 0.55); coin.albedoTexture = getCoinTexture(scene)
  coin.emissiveColor = new Color3(0.42, 0.30, 0.02); coin.metallic = 0.35; coin.roughness = 0.35
  const rampY = new PBRMaterial('rampY', scene); rampY.albedoColor = new Color3(0.99, 0.80, 0.04); rampY.metallic = 0.1; rampY.roughness = 0.55
  const rampS = new PBRMaterial('rampS', scene); rampS.albedoColor = new Color3(0.07, 0.07, 0.08); rampS.metallic = 0.1; rampS.roughness = 0.85
  const puddle = new StandardMaterial('puddle', scene)
  puddle.diffuseColor = new Color3(0.35, 0.6, 0.95); puddle.specularColor = new Color3(0.9, 0.9, 0.9); puddle.alpha = 0.75
  const wash = new PBRMaterial('wash', scene); wash.albedoColor = new Color3(0.25, 0.55, 0.95); wash.metallic = 0.1; wash.roughness = 0.5
  const roller = new PBRMaterial('roller', scene); roller.albedoColor = new Color3(0.30, 0.75, 1.0); roller.metallic = 0; roller.roughness = 0.9
  _mats = { coin, rampY, rampS, puddle, wash, roller }
  return _mats
}

export class TrafficManager {
  private scene: Scene
  private cars: Car[] = []
  private ramps: Ramp[] = []
  private puddles: Puddle[] = []
  private washes: Wash[] = []
  private coins: Coin[] = []
  private coinTemplate: Mesh
  private splash: ParticleSystem
  private bubbles: ParticleSystem
  private time = 0

  private nextCarZ    = 50
  private nextRampZ   = 70
  private nextPuddleZ = 40
  private nextWashZ   = 260
  private nextCoinZ   = 20

  constructor(scene: Scene) {
    this.scene = scene
    mats(scene)
    this.coinTemplate = this._makeCoinTemplate()
    this.splash  = this._makeSplash()
    this.bubbles = this._makeBubbles()
  }

  // ─── Spawning ──────────────────────────────────────────────────────────

  private _laneBlocked(lane: number, z: number, margin: number): boolean {
    return this.cars.some(c => c.lane === lane && Math.abs(c.z - z) < c.halfD + margin)
      || this.ramps.some(r => r.lane === lane && Math.abs(r.z - z) < r.length + margin)
  }

  private _spawnCar(z: number): void {
    const lane = Math.floor(Math.random() * 3)
    if (!Kits.isLoaded('vehicles')) return
    const model = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)]
    const size = Kits.size(model)!
    const scale = 1.25
    const root = new Mesh('car', this.scene)
    root.position.set(LANE_X[lane], 0, z)
    // Facing +z: traffic drives the same way the player does, slower.
    Kits.place(root, model, 0, 0, 0, scale, Math.PI)
    styleChunk(root, { plainMaterials: new Set(), preShadedMaterials: Kits.materials, flatShade: getQualityProfile().flatShade, gradient: { bottom: 0.8, top: 1.08 } })
    this.cars.push({ root, lane, z, halfD: size.z * scale / 2, top: size.y * scale, speed: TRAFFIC_SPEED, bumped: false, passed: false })
  }

  private _spawnRamp(z: number): void {
    const lane = Math.floor(Math.random() * 3)
    if (this._laneBlocked(lane, z, 6)) return
    const m = mats(this.scene)
    const length = 4.2, rise = 1.35, width = 2.7
    const root = new Mesh('ramp', this.scene)
    root.position.set(LANE_X[lane], 0, z)
    const slopeLen = Math.hypot(length, rise), angle = Math.atan2(rise, length)
    const slab = MeshBuilder.CreateBox('rampSlab', { width, height: 0.2, depth: slopeLen }, this.scene)
    slab.rotation.x = -angle
    slab.position.set(0, rise / 2, -length / 2)
    slab.material = m.rampY; slab.parent = root
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4, s = (t - 0.5) * slopeLen
      const stripe = MeshBuilder.CreateBox('stripe', { width: width * 0.92, height: 0.04, depth: slopeLen * 0.11 }, this.scene)
      stripe.rotation.x = -angle
      stripe.position.set(0, rise / 2 + Math.sin(angle) * s + Math.cos(angle) * 0.11, -length / 2 + Math.cos(angle) * s - Math.sin(angle) * 0.11)
      stripe.material = m.rampS; stripe.parent = root
    }
    for (const sx of [-1, 1]) {
      const rail = MeshBuilder.CreateBox('rail', { width: 0.12, height: 0.24, depth: slopeLen }, this.scene)
      rail.rotation.x = -angle
      rail.position.set(sx * (width / 2 + 0.02), rise / 2 + Math.cos(angle) * 0.11, -length / 2 - Math.sin(angle) * 0.11)
      rail.material = m.rampS; rail.parent = root
    }
    // Back wall so it reads as a solid wedge from behind... the player only
    // ever sees the slope, so a lip at the top is enough.
    const lip = MeshBuilder.CreateBox('lip', { width, height: 0.3, depth: 0.25 }, this.scene)
    lip.position.set(0, rise - 0.1, 0.1); lip.material = m.rampS; lip.parent = root
    styleChunk(root, { plainMaterials: new Set(), flatShade: getQualityProfile().flatShade, gradient: { bottom: 0.85, top: 1.05 } })
    root.position.y = terrainY(z)
    root.rotation.x = -Math.atan(terrainSlope(z))
    this.ramps.push({ root, lane, z, rise, length, launched: false })
    // Coin arc over the jump — the reward is the flight itself, but coins draw the eye.
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      this._addCoin(LANE_X[lane], COIN_Y + rise + Math.sin(t * Math.PI) * 2.6, z + 1 + t * 11, i * 0.4)
    }
  }

  private _spawnPuddle(z: number): void {
    const lane = Math.floor(Math.random() * 3)
    if (this._laneBlocked(lane, z, 3)) return
    const disc = MeshBuilder.CreateDisc('puddle', { radius: 1.1, tessellation: 18 }, this.scene)
    disc.rotation.x = Math.PI / 2
    disc.scaling.y = 1.6
    disc.position.set(LANE_X[lane], 0.03 + terrainY(z), z)
    disc.material = mats(this.scene).puddle
    disc.isPickable = false
    this.puddles.push({ mesh: disc, lane, z, done: false })
  }

  private _spawnWash(z: number): void {
    const m = mats(this.scene)
    const root = new Mesh('wash', this.scene)
    root.position.set(0, 0, z)
    for (const sx of [-1, 1]) {
      const post = MeshBuilder.CreateBox('wpost', { width: 0.6, height: 4.6, depth: 1.2 }, this.scene)
      post.position.set(sx * 6.0, 2.3, 0); post.material = m.wash; post.parent = root
    }
    const beam = MeshBuilder.CreateBox('wbeam', { width: 12.6, height: 0.8, depth: 1.4 }, this.scene)
    beam.position.set(0, 4.8, 0); beam.material = m.wash; beam.parent = root
    const sign = MeshBuilder.CreateBox('wsign', { width: 6, height: 1.2, depth: 0.2 }, this.scene)
    sign.position.set(0, 5.8, -0.5)
    const signMat = new StandardMaterial('wsignMat', this.scene); signMat.disableLighting = true; signMat.emissiveColor = new Color3(1, 0.4, 0.7)
    sign.material = signMat; sign.parent = root
    const rollers: Mesh[] = []
    for (const lx of LANE_X) {
      const roller = MeshBuilder.CreateCylinder('roller', { diameter: 1.6, height: 2.2, tessellation: 12 }, this.scene)
      roller.rotation.z = Math.PI / 2
      roller.position.set(lx, 3.2, 0.3)
      roller.material = m.roller; roller.parent = root
      rollers.push(roller)
    }
    for (const sx of [-1, 1]) {
      const side = MeshBuilder.CreateCylinder('sroller', { diameter: 1.2, height: 3.0, tessellation: 12 }, this.scene)
      side.position.set(sx * 5.3, 1.6, 0.3); side.material = m.roller; side.parent = root
      rollers.push(side)
    }
    root.position.y = terrainY(z)
    this.washes.push({ root, z, rollers, done: false })
  }

  private _makeCoinTemplate(): Mesh {
    const faceUV = [new Vector4(0, 0, 1, 1), new Vector4(0.02, 0.02, 0.04, 0.04), new Vector4(0, 0, 1, 1)]
    const mesh = MeshBuilder.CreateCylinder('coinTemplate', { diameter: 0.7, height: 0.14, tessellation: 18, faceUV }, this.scene)
    mesh.material = mats(this.scene).coin
    mesh.isVisible = false; mesh.isPickable = false
    return mesh
  }

  private _addCoin(x: number, y: number, z: number, bob: number): void {
    const inst = this.coinTemplate.createInstance('coin')
    inst.rotation.x = Math.PI / 2
    inst.position.set(x, y + terrainY(z), z)
    inst.isPickable = false
    this.coins.push({ mesh: inst, baseY: y, bob, collected: false })
  }

  private _spawnCoinRow(z: number): void {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5)
    const count = 5 + Math.floor(Math.random() * 3)
    for (const lane of lanes) {
      let clear = true
      for (let i = 0; i < count && clear; i++) if (this._laneBlocked(lane, z + i * 1.5, 2.5)) clear = false
      if (!clear) continue
      for (let i = 0; i < count; i++) this._addCoin(LANE_X[lane], COIN_Y, z + i * 1.5, i * 0.5)
      return
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────

  update(v: Vehicle, dt: number, speed: number, ev: TrafficEvents): void {
    this.time += dt
    const pz = v.position.z
    const px = v.position.x

    while (this.nextCarZ < pz + SPAWN_AHEAD)    { this._spawnCar(this.nextCarZ);       this.nextCarZ    += 26 + Math.random() * 18 }
    while (this.nextRampZ < pz + SPAWN_AHEAD)   { this._spawnRamp(this.nextRampZ);     this.nextRampZ   += 85 + Math.random() * 60 }
    while (this.nextPuddleZ < pz + SPAWN_AHEAD) { this._spawnPuddle(this.nextPuddleZ); this.nextPuddleZ += 55 + Math.random() * 40 }
    while (this.nextWashZ < pz + SPAWN_AHEAD)   { this._spawnWash(this.nextWashZ);     this.nextWashZ   += 380 + Math.random() * 160 }
    while (this.nextCoinZ < pz + SPAWN_AHEAD)   { this._spawnCoinRow(this.nextCoinZ);  this.nextCoinZ   += 12 + Math.random() * 9 }

    // Ramps: the surface under the vehicle, and the launch at the lip.
    let groundY = 0
    for (let i = this.ramps.length - 1; i >= 0; i--) {
      const r = this.ramps[i]
      if (r.z < pz - DESPAWN) { r.root.dispose(); this.ramps.splice(i, 1); continue }
      if (Math.abs(px - LANE_X[r.lane]) > 1.5) continue
      const start = r.z - r.length, end = r.z
      if (pz >= start && pz <= end && !v.airborne) {
        groundY = Math.max(groundY, (pz - start) / r.length * r.rise)
      }
      if (!r.launched && pz > end - 0.4 && pz < end + 1.2 && v.bottom < r.rise + 0.5) {
        r.launched = true
        v.launch(8.5 + speed * 0.3)
        ev.onRamp()
      }
    }
    v.setGroundY(groundY)

    // Traffic: rolls forward slowly; bonk on overlap unless the player is above it.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i]
      c.z += c.speed * dt
      c.root.position.z = c.z
      c.root.position.y = terrainY(c.z)
      c.root.rotation.x = -Math.atan(terrainSlope(c.z))
      if (c.z < pz - DESPAWN - 10) { c.root.dispose(); this.cars.splice(i, 1); continue }
      if (!c.passed && c.z + c.halfD < pz - v.halfD) {
        c.passed = true
        if (!c.bumped) ev.onOvertake()
      }
      if (!c.bumped && !c.passed) {
        const dx = Math.abs(px - LANE_X[c.lane]), dz = Math.abs(pz - c.z)
        if (dx < v.halfW + 0.9 && dz < c.halfD + v.halfD && v.bottom < c.top - 0.1) {
          c.bumped = true
          v.bonk()
          ev.onBonk()
        }
      }
    }

    // Puddles
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i]
      if (p.z < pz - DESPAWN) { p.mesh.dispose(); this.puddles.splice(i, 1); continue }
      if (!p.done && Math.abs(px - LANE_X[p.lane]) < 1.4 && Math.abs(pz - p.z) < 1.4 && !v.airborne) {
        p.done = true
        this.splash.emitter = v.root as unknown as Mesh
        this.splash.manualEmitCount = Math.ceil(60 * getQualityProfile().particleScale)
        this.splash.start()
        ev.onSplash()
      }
    }

    // Car washes
    for (let i = this.washes.length - 1; i >= 0; i--) {
      const w = this.washes[i]
      if (w.z < pz - DESPAWN) { w.root.dispose(); this.washes.splice(i, 1); continue }
      for (const r of w.rollers) r.rotation.x += dt * 4
      if (!w.done && Math.abs(pz - w.z) < 1.5) {
        w.done = true
        this.bubbles.emitter = v.root as unknown as Mesh
        this.bubbles.manualEmitCount = Math.ceil(80 * getQualityProfile().particleScale)
        this.bubbles.start()
        ev.onWash()
      }
    }

    // Coins
    const cy = v.position.y + 0.9
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i]
      const cp = c.mesh.position
      if (cp.z < pz - DESPAWN) { c.mesh.dispose(); this.coins.splice(i, 1); continue }
      if (c.collected) continue
      cp.y = c.baseY + terrainY(cp.z) + Math.sin(this.time * 3.5 + c.bob) * 0.16
      c.mesh.rotation.z += dt * 3.8
      if (Math.abs(px - cp.x) < 1.4 && Math.abs(pz - cp.z) < 1.5 && Math.abs(cp.y - cy) < 2.0) {
        c.collected = true
        c.mesh.isVisible = false
        ev.onCoin(cp.clone())
      }
    }
  }

  reset(): void {
    for (const c of this.cars) c.root.dispose()
    for (const r of this.ramps) r.root.dispose()
    for (const p of this.puddles) p.mesh.dispose()
    for (const w of this.washes) w.root.dispose()
    for (const c of this.coins) c.mesh.dispose()
    this.cars = []; this.ramps = []; this.puddles = []; this.washes = []; this.coins = []
    this.nextCarZ = 50; this.nextRampZ = 70; this.nextPuddleZ = 40; this.nextWashZ = 260; this.nextCoinZ = 20
  }

  private _makeSplash(): ParticleSystem {
    const ps = new ParticleSystem('splash', 120, this.scene)
    ps.particleTexture = getSoftDiscTexture(this.scene)
    ps.minEmitBox = new Vector3(-1, 0, -1); ps.maxEmitBox = new Vector3(1, 0.3, 1)
    ps.minSize = 0.25; ps.maxSize = 0.6
    ps.minLifeTime = 0.3; ps.maxLifeTime = 0.6
    ps.emitRate = 0; ps.manualEmitCount = 60
    ps.color1 = new Color4(0.5, 0.75, 1, 0.9); ps.color2 = new Color4(0.8, 0.9, 1, 0.8); ps.colorDead = new Color4(0.6, 0.8, 1, 0)
    ps.direction1 = new Vector3(-4, 3, -2); ps.direction2 = new Vector3(4, 7, 2)
    ps.minEmitPower = 1; ps.maxEmitPower = 2
    ps.gravity = new Vector3(0, -14, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD
    ps.targetStopDuration = 0.15
    return ps
  }

  private _makeBubbles(): ParticleSystem {
    const ps = new ParticleSystem('bubbles', 160, this.scene)
    ps.particleTexture = getSoftDiscTexture(this.scene)
    ps.minEmitBox = new Vector3(-1.5, 0, -2); ps.maxEmitBox = new Vector3(1.5, 2.5, 2)
    ps.minSize = 0.2; ps.maxSize = 0.55
    ps.minLifeTime = 0.8; ps.maxLifeTime = 1.6
    ps.emitRate = 0; ps.manualEmitCount = 80
    ps.color1 = new Color4(0.85, 0.95, 1, 0.8); ps.color2 = new Color4(1, 0.9, 1, 0.7); ps.colorDead = new Color4(1, 1, 1, 0)
    ps.direction1 = new Vector3(-1, 1, -1); ps.direction2 = new Vector3(1, 3, 1)
    ps.minEmitPower = 0.5; ps.maxEmitPower = 1.5
    ps.gravity = new Vector3(0, 0.8, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD
    ps.targetStopDuration = 0.6
    return ps
  }
}
