import {
  Scene,
  Mesh,
  MeshBuilder,
  TransformNode,
  StandardMaterial,
  PBRMaterial,
  Color3,
  Color4,
  Vector3,
  ParticleSystem,
} from '@babylonjs/core'
import { Kits, terrainY, getSoftDiscTexture, getSparkleTexture, getQualityProfile, type AudioManager } from '@kids/engine'
import { LANE_X } from './Road'
import type { VehicleDef } from './Garage'

/**
 * The player's vehicle.
 *
 * Steering is by lane, like the runner, but the vehicle leans into the
 * change and its nose pitches up on jumps and down on landings. Jumps
 * are the point of the game for this player: a tap hops, a ramp launches,
 * hang time is tracked for a "big air" pop, and landing squashes the
 * body with a puff of dust.
 */

const GRAVITY    = 24
const LANE_TIME  = 0.22
const HOP_HEIGHT = 1.4

export class Vehicle {
  readonly root: TransformNode        // world: (x, posY + terrain, z)
  private body: TransformNode         // pitch, roll, squash
  private parts: TransformNode | null = null
  private scene: Scene
  private def: VehicleDef | null = null

  private lane = 1
  private x = LANE_X[1]
  private lateralVel = 0
  private z = 0
  private posY = 0
  private velY = 0
  private groundY = 0
  private airTime = 0
  private wasAirborne = false

  private wobble = 0
  private squash = 1
  private pitchExtra = 0
  private wheelieTimer = 0
  private time = 0

  private lights: StandardMaterial[] = []
  private sirenOn = false
  private wheels: Mesh[] = []

  private dust: ParticleSystem
  private sparks: ParticleSystem
  private sound: VehicleSound | null = null

  halfW = 1.0
  halfD = 1.8
  height = 1.5

  /** Called when the vehicle lands after being airborne, with the hang time. */
  onLand?: (airTime: number) => void

  constructor(scene: Scene) {
    this.scene = scene
    this.root  = new TransformNode('vehicle', scene)
    this.body  = new TransformNode('vehicleBody', scene)
    this.body.parent = this.root
    this.dust   = this._makeDust()
    this.sparks = this._makeSparks()
  }

  get position(): Vector3 { return this.root.position }
  get laneIndex(): number { return this.lane }
  get bottom(): number { return this.posY }
  get airborne(): boolean { return this.posY > this.groundY + 0.02 || this.velY > 0 }
  get definition(): VehicleDef | null { return this.def }
  get lateralVelocity(): number { return this.lateralVel }
  get sirenActive(): boolean { return this.sirenOn }

  attachAudio(audio: AudioManager): void { this.sound = new VehicleSound(audio) }
  startEngine(): void { this.sound?.start() }
  stopEngine(): void { this.sound?.stop(); this.sirenOn = false; this.sound?.setSiren(false) }

  // ─── Building ──────────────────────────────────────────────────────────

  setVehicle(def: VehicleDef): void {
    this.def = def
    this.parts?.dispose()
    this.lights = []
    this.wheels = []
    this.sirenOn = false
    this.sound?.setSiren(false)
    this.parts = new TransformNode('vehicleParts', this.scene)
    this.parts.parent = this.body

    if (def.model === 'moto') this._buildMoto()
    else if (def.model === 'monster') this._buildMonster(def.scale)
    else {
      const size = Kits.place(this.parts, def.model, 0, 0, 0, def.scale, Math.PI)
      if (size) { this.halfW = size.x / 2; this.halfD = size.z / 2; this.height = size.y }
      else this._buildFallback()
    }

    for (const l of def.lights ?? []) {
      const m = new StandardMaterial('light', this.scene)
      m.disableLighting = true
      m.emissiveColor = new Color3(...l.color)
      const box = MeshBuilder.CreateBox('lightbox', { width: 0.22, height: 0.16, depth: 0.3 }, this.scene)
      box.position.set(l.pos[0], l.pos[1] * (def.scale / 1.25), l.pos[2])
      box.material = m; box.parent = this.parts
      this.lights.push(m)
    }
    for (const m of this.parts.getChildMeshes()) m.isPickable = false
  }

  private _buildFallback(): void {
    const mat = new PBRMaterial('fallback', this.scene)
    mat.albedoColor = new Color3(0.9, 0.2, 0.2); mat.metallic = 0; mat.roughness = 0.6
    const b = MeshBuilder.CreateBox('fb', { width: 1.9, height: 0.9, depth: 3.6 }, this.scene)
    b.position.y = 0.6; b.material = mat; b.parent = this.parts
    this.halfW = 0.95; this.halfD = 1.8; this.height = 1.4
  }

  /** SUV lifted on four huge wheels. */
  private _buildMonster(scale: number): void {
    const size = Kits.place(this.parts!, 'suv', 0, 0.85, 0, scale, Math.PI)
    const tire = new PBRMaterial('tire', this.scene)
    tire.albedoColor = new Color3(0.08, 0.08, 0.09); tire.metallic = 0; tire.roughness = 0.95
    const rim = new PBRMaterial('rim', this.scene)
    rim.albedoColor = new Color3(0.85, 0.85, 0.9); rim.metallic = 0.7; rim.roughness = 0.3
    const w = size ? size.x / 2 : 1
    for (const [sx, sz] of [[-1, 1.15], [1, 1.15], [-1, -1.15], [1, -1.15]]) {
      const wheel = MeshBuilder.CreateCylinder('mwheel', { diameter: 1.6, height: 0.7, tessellation: 14 }, this.scene)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(sx * (w + 0.1), 0.8, sz)
      wheel.material = tire; wheel.parent = this.parts
      const hub = MeshBuilder.CreateCylinder('mhub', { diameter: 0.8, height: 0.74, tessellation: 8 }, this.scene)
      hub.rotation.z = Math.PI / 2
      hub.position.copyFrom(wheel.position); hub.material = rim; hub.parent = this.parts
      this.wheels.push(wheel, hub)
    }
    this.halfW = (size ? size.x / 2 : 1) + 0.4
    this.halfD = size ? size.z / 2 : 1.9
    this.height = (size ? size.y : 1.4) + 0.85
  }

  /** A chunky motorbike with a rider, built from primitives. */
  private _buildMoto(): void {
    const p = this.parts!
    const red   = this._mat(new Color3(0.9, 0.15, 0.2))
    const dark  = this._mat(new Color3(0.1, 0.1, 0.12))
    const chrome = this._mat(new Color3(0.8, 0.82, 0.88), 0.7, 0.3)
    const skin  = this._mat(new Color3(1.0, 0.8, 0.62))
    const blue  = this._mat(new Color3(0.2, 0.4, 0.9))
    for (const zz of [1.05, -1.0]) {
      const wheel = MeshBuilder.CreateCylinder('wheel', { diameter: 0.9, height: 0.3, tessellation: 14 }, this.scene)
      wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0.45, zz); wheel.material = dark; wheel.parent = p
      const hub = MeshBuilder.CreateCylinder('hub', { diameter: 0.4, height: 0.32, tessellation: 8 }, this.scene)
      hub.rotation.z = Math.PI / 2; hub.position.copyFrom(wheel.position); hub.material = chrome; hub.parent = p
      this.wheels.push(wheel, hub)
    }
    const frame = MeshBuilder.CreateBox('frame', { width: 0.36, height: 0.5, depth: 1.5 }, this.scene)
    frame.position.set(0, 0.75, 0); frame.material = red; frame.parent = p
    const tank = MeshBuilder.CreateBox('tank', { width: 0.44, height: 0.34, depth: 0.7 }, this.scene)
    tank.position.set(0, 1.05, 0.35); tank.material = red; tank.parent = p
    const fork = MeshBuilder.CreateCylinder('fork', { diameter: 0.1, height: 0.9, tessellation: 6 }, this.scene)
    fork.rotation.x = -0.45; fork.position.set(0, 0.85, 0.9); fork.material = chrome; fork.parent = p
    const bars = MeshBuilder.CreateBox('bars', { width: 0.9, height: 0.06, depth: 0.06 }, this.scene)
    bars.position.set(0, 1.25, 0.75); bars.material = chrome; bars.parent = p
    // Rider
    const torso = MeshBuilder.CreateBox('torso', { width: 0.5, height: 0.6, depth: 0.36 }, this.scene)
    torso.rotation.x = 0.35; torso.position.set(0, 1.45, -0.05); torso.material = blue; torso.parent = p
    const head = MeshBuilder.CreateSphere('head', { diameter: 0.42, segments: 6 }, this.scene)
    head.position.set(0, 1.9, 0.12); head.material = skin; head.parent = p
    const helmet = MeshBuilder.CreateSphere('helmet', { diameter: 0.48, segments: 6, slice: 0.55 }, this.scene)
    helmet.position.set(0, 1.95, 0.12); helmet.material = red; helmet.parent = p
    for (const sx of [-0.3, 0.3]) {
      const arm = MeshBuilder.CreateBox('arm', { width: 0.14, height: 0.14, depth: 0.7 }, this.scene)
      arm.rotation.x = -0.5; arm.position.set(sx, 1.4, 0.4); arm.material = blue; arm.parent = p
      const leg = MeshBuilder.CreateBox('leg', { width: 0.16, height: 0.55, depth: 0.16 }, this.scene)
      leg.position.set(sx * 1.1, 0.85, -0.2); leg.material = dark; leg.parent = p
    }
    this.halfW = 0.55; this.halfD = 1.35; this.height = 2.1
  }

  private _mat(c: Color3, metallic = 0, roughness = 0.75): PBRMaterial {
    const m = new PBRMaterial('vm', this.scene)
    m.albedoColor = c; m.metallic = metallic; m.roughness = roughness
    return m
  }

  // ─── Controls ──────────────────────────────────────────────────────────

  steerLeft(): void  { if (this.lane > 0) this.lane-- }
  steerRight(): void { if (this.lane < 2) this.lane++ }

  /** A hop from the ground. `power` scales the height (the monster truck jumps higher). */
  jump(power = 1): boolean {
    if (this.airborne) return false
    const h = HOP_HEIGHT * power * (this.def?.jump ?? 1)
    this.velY = Math.sqrt(2 * GRAVITY * h)
    this.sound?.hop()
    return true
  }

  /** A ramp launch: the ramp decides the upward speed. */
  launch(vy: number): void {
    this.velY = Math.max(this.velY, vy * (this.def?.jump ?? 1))
    this.posY = Math.max(this.posY, this.groundY)
  }

  /** The big button: whatever this vehicle does. */
  action(): void {
    switch (this.def?.action) {
      case 'siren':
        this.sirenOn = !this.sirenOn
        this.sound?.setSiren(this.sirenOn)
        break
      case 'wheelie':
        this.wheelieTimer = 1.1
        this.sound?.horn(0.6)
        break
      case 'bounce':
        this.jump(0.7)
        this.squash = 0.75
        this.sound?.horn(0.4)
        break
      default:
        this.squash = 0.86
        this.sound?.horn(1)
    }
  }

  bonk(): void {
    this.wobble = 1
    this.squash = 0.8
    this.sound?.bonk()
  }

  /** Height of whatever the vehicle is on (a ramp), in track space. */
  setGroundY(y: number): void { this.groundY = y }

  // ─── Update ────────────────────────────────────────────────────────────

  update(dt: number, speed: number): void {
    this.time += dt
    const prevX = this.x
    const tx = LANE_X[this.lane]
    const k = 1 - Math.pow(0.0015, dt / LANE_TIME)
    this.x += (tx - this.x) * k
    if (Math.abs(this.x - tx) < 0.005) this.x = tx
    this.lateralVel = dt > 0 ? (this.x - prevX) / dt : 0

    this.z += speed * dt

    // Vertical
    if (this.airborne) {
      this.velY -= GRAVITY * dt
      this.posY += this.velY * dt
      this.airTime += dt
      if (this.posY <= this.groundY && this.velY <= 0) {
        this.posY = this.groundY
        this.velY = 0
      }
    } else {
      this.posY = this.groundY
      this.velY = 0
    }
    const air = this.airborne
    if (this.wasAirborne && !air) {
      this.squash = 0.72
      this.sparks.manualEmitCount = Math.ceil(30 * getQualityProfile().particleScale)
      this.sparks.start()
      this.onLand?.(this.airTime)
      this.sound?.land()
      this.airTime = 0
    }
    this.wasAirborne = air

    this.root.position.set(this.x, this.posY + terrainY(this.z), this.z)

    // Body pose
    if (this.wheelieTimer > 0) this.wheelieTimer -= dt
    const wheelie = this.wheelieTimer > 0 ? -0.55 * Math.sin(Math.min(1, this.wheelieTimer / 1.1) * Math.PI) : 0
    const pitchTarget = air ? Math.max(-0.5, Math.min(0.35, -this.velY * 0.045)) : 0
    this.pitchExtra += (pitchTarget - this.pitchExtra) * Math.min(1, dt * 8)
    this.wobble = Math.max(0, this.wobble - dt * 1.8)
    this.squash += (1 - this.squash) * Math.min(1, dt * 9)
    this.body.rotation.x = this.pitchExtra + wheelie
    this.body.rotation.z = -this.lateralVel * 0.035 + Math.sin(this.time * 28) * this.wobble * 0.18
    this.body.scaling.set(1 + (1 - this.squash) * 0.5, this.squash, 1)

    for (let i = 0; i < this.wheels.length; i++) this.wheels[i].rotation.x -= speed * dt / 0.45

    if (this.lights.length) {
      const on = this.sirenOn
      const phase = Math.floor(this.time * 6) % 2
      this.lights.forEach((m, i) => {
        const bright = on ? (i % 2 === phase ? 2.2 : 0.25) : 0.6
        const base = (this.def?.lights ?? [])[i]?.color ?? [1, 1, 1]
        m.emissiveColor = new Color3(base[0] * bright, base[1] * bright, base[2] * bright)
      })
    }

    this.dust.emitRate = !air && speed > 0 ? 18 + speed * 1.5 : 0
    this.sound?.update(speed, air)
  }

  // ─── FX ────────────────────────────────────────────────────────────────

  private _makeDust(): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const ps = new ParticleSystem('vdust', Math.ceil(140 * scale), this.scene)
    ps.particleTexture = getSoftDiscTexture(this.scene)
    ps.emitter = this.root as unknown as Mesh
    ps.minEmitBox = new Vector3(-0.9, 0.05, -1.6); ps.maxEmitBox = new Vector3(0.9, 0.2, -1.2)
    ps.minSize = 0.25; ps.maxSize = 0.6
    ps.minLifeTime = 0.35; ps.maxLifeTime = 0.7
    ps.emitRate = 20
    ps.color1 = new Color4(1, 1, 1, 0.5); ps.color2 = new Color4(0.95, 0.9, 0.85, 0.35); ps.colorDead = new Color4(1, 1, 1, 0)
    ps.direction1 = new Vector3(-0.8, 0.6, -3); ps.direction2 = new Vector3(0.8, 1.6, -5)
    ps.minEmitPower = 0.6; ps.maxEmitPower = 1.4
    ps.gravity = new Vector3(0, -1.5, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD
    ps.start()
    return ps
  }

  private _makeSparks(): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const ps = new ParticleSystem('vland', Math.ceil(40 * scale), this.scene)
    ps.particleTexture = getSparkleTexture(this.scene)
    ps.emitter = this.root as unknown as Mesh
    ps.minEmitBox = new Vector3(-1, 0, -1.5); ps.maxEmitBox = new Vector3(1, 0.2, 1.5)
    ps.minSize = 0.2; ps.maxSize = 0.5
    ps.minLifeTime = 0.2; ps.maxLifeTime = 0.45
    ps.emitRate = 0; ps.manualEmitCount = 30
    ps.color1 = new Color4(1, 0.9, 0.4, 1); ps.color2 = new Color4(1, 1, 1, 1); ps.colorDead = new Color4(1, 1, 1, 0)
    ps.direction1 = new Vector3(-3, 1, -2); ps.direction2 = new Vector3(3, 4, 2)
    ps.minEmitPower = 1; ps.maxEmitPower = 3
    ps.gravity = new Vector3(0, -9, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.targetStopDuration = 0.2
    return ps
  }
}

/**
 * Engine hum that follows speed, a two-tone siren, a horn, and small
 * hop/land/bonk sounds — all synthesised on the shared audio context so
 * they start and stop with no loading.
 */
class VehicleSound {
  private ctx: AudioContext
  private out: GainNode
  private engine: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private siren: OscillatorNode | null = null
  private sirenGain: GainNode | null = null
  private sirenLfo: OscillatorNode | null = null
  private running = false

  constructor(audio: AudioManager) {
    this.ctx = audio.context
    this.out = this.ctx.createGain()
    this.out.gain.value = 0.9
    this.out.connect(audio.master)
  }

  start(): void {
    if (this.running) return
    this.running = true
    const ctx = this.ctx
    this.engine = ctx.createOscillator()
    this.engine.type = 'sawtooth'
    this.engine.frequency.value = 70
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 420
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0.045
    this.engine.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.out)
    this.engine.start()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.engine?.stop(); this.engine = null
    this.setSiren(false)
  }

  update(speed: number, airborne: boolean): void {
    if (!this.engine || !this.engineGain || !this.engineFilter) return
    const t = this.ctx.currentTime
    const f = 55 + speed * 5.5 + (airborne ? 40 : 0)
    this.engine.frequency.setTargetAtTime(f, t, 0.08)
    this.engineFilter.frequency.setTargetAtTime(300 + speed * 22, t, 0.1)
    this.engineGain.gain.setTargetAtTime(speed > 0 ? 0.045 : 0.02, t, 0.1)
  }

  setSiren(on: boolean): void {
    if (on && !this.siren) {
      const ctx = this.ctx
      this.siren = ctx.createOscillator()
      this.siren.type = 'square'
      this.siren.frequency.value = 700
      this.sirenLfo = ctx.createOscillator()
      this.sirenLfo.type = 'square'
      this.sirenLfo.frequency.value = 1.4
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 180
      this.sirenLfo.connect(lfoGain); lfoGain.connect(this.siren.frequency)
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1800
      this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0.05
      this.siren.connect(flt); flt.connect(this.sirenGain); this.sirenGain.connect(this.out)
      this.siren.start(); this.sirenLfo.start()
    } else if (!on && this.siren) {
      this.siren.stop(); this.sirenLfo?.stop()
      this.siren = null; this.sirenLfo = null; this.sirenGain = null
    }
  }

  horn(len = 1): void {
    const ctx = this.ctx, t = ctx.currentTime
    for (const f of [340, 425]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.02)
      g.gain.setValueAtTime(0.07, t + 0.3 * len); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38 * len)
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1400
      o.connect(flt); flt.connect(g); g.connect(this.out)
      o.start(t); o.stop(t + 0.4 * len)
    }
  }

  hop(): void { this._blip(260, 520, 0.12, 0.05) }
  land(): void { this._blip(180, 90, 0.14, 0.06) }
  bonk(): void { this._blip(220, 70, 0.3, 0.09) }

  private _blip(f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx, t = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'triangle'
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur)
  }
}
