import { type Scene, Vector3 } from '@babylonjs/core'
import {
  GameEngine, FollowCamera, setupPostProcessing, setupEnvironment, Kits, AudioManager, CelebrationManager,
  CurveState, curveAt, terrainY,
} from '@kids/engine'
import { RoadManager } from './Road'
import { Vehicle } from './Vehicle'
import { TrafficManager } from './Traffic'
import { ZoneManager } from './Zones'
import { Backdrop } from './Backdrop'
import { HUD } from './HUD'
import { InputHandler, type InputAction } from './Input'
import { ZONE_MUSIC } from './music'
import { VEHICLES, loadGarage, saveGarage, loadBest, saveBest, type GarageState, type VehicleDef } from './Garage'

/**
 * Vroom Road — an endless drive for a four-year-old.
 *
 * Rules, all of them: tap a side to change lane, tap JUMP to hop, tap the
 * other button to honk or turn the siren on. Ramps launch you. Slow cars
 * are for overtaking and, if you clip one, you bonk and wobble and keep
 * going. Coins only ever go up. There is no way to lose.
 */

const BASE_SPEED = 12
const MAX_SPEED  = 20
const ACCEL      = 0.10
const BONK_SLOW  = 0.6
const RECOVER    = 6

export class Game {
  private engine: GameEngine
  private camera: FollowCamera
  private vehicle: Vehicle
  private audio: AudioManager
  private hud: HUD
  private backdrop: Backdrop
  private clouds: ReturnType<typeof setupEnvironment>['clouds']
  private farGround: ReturnType<typeof setupEnvironment>['farGround']
  private road!: RoadManager
  private traffic!: TrafficManager
  private zones: ZoneManager | null = null
  private celebrations: CelebrationManager | null = null
  private ready = false

  private running = false
  private paused = false
  private speed = BASE_SPEED
  private targetSpeed = BASE_SPEED
  private distance = 0
  private coins = 0
  private garage: GarageState
  private best: number
  private bestBeaten = false
  private saveTimer = 0
  private overtakes = 0

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new GameEngine(canvas)
    const scene = this.engine.scene
    const q = new URLSearchParams(location.search)
    const devDist = Math.max(0, Number(q.get('dist')) || 0)

    const env = setupEnvironment(scene)
    this.clouds = env.clouds
    this.farGround = env.farGround
    this.garage = loadGarage()
    this.best = loadBest()

    this.vehicle = new Vehicle(scene)
    this.camera = new FollowCamera(scene)
    this.audio = new AudioManager(ZONE_MUSIC)
    this.hud = new HUD()
    this.backdrop = new Backdrop(scene)
    this.vehicle.attachAudio(this.audio)

    this.hud.setGarage(VEHICLES, this.garage)
    this.hud.setReady(false)
    this.hud.onVehicleChange = (id) => {
      this.audio.playSelect()
      this.garage.selected = id
      saveGarage(this.garage)
      this._preview(id)
    }
    this.hud.onPlay = () => this._start()
    this.hud.onPause = () => this._pause()
    this.hud.onResume = () => this._resume()
    this.hud.onHome = () => { this._save(); location.reload() }
    this.camera.setShowcase(true)

    // Same gestures as the runner; the on-screen pad routes through the same handler.
    const act = (a: InputAction) => {
      if (!this.running || this.paused) return
      if (a === 'left') this.vehicle.steerLeft()
      else if (a === 'right') this.vehicle.steerRight()
      else if (a === 'jump') this._jump()
      else this.vehicle.action()
    }
    new InputHandler(canvas, act)
    this.hud.onInput = act
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this._save(); this._pause() } })

    this.hud.showStart(this.best)
    this.engine.start(() => this._tick())
    void this._init(scene, env, devDist, q)
  }

  private async _init(scene: Scene, env: ReturnType<typeof setupEnvironment>, devDist: number, q: URLSearchParams): Promise<void> {
    await Kits.load(scene, ['vehicles', 'nature', 'city'])
    this._preview(this.garage.selected)

    this.road = new RoadManager(scene, devDist)
    this.traffic = new TrafficManager(scene)
    this.zones = new ZoneManager(scene, env.sky, env.clouds, this.engine.sunLight, this.engine.hemiLight)
    this.zones.setGrassMat(this.road.grassMat)
    this.zones.setRoadMat(this.road.roadMat)
    this.zones.setFarGround(env.farGround)
    this.zones.setBackdrop(this.backdrop)
    this.zones.onZoneEntered = (zone) => {
      this.audio.setZone(zone.id)
      this.audio.playCelebration()
      this.celebrations?.pop(`${zone.emoji} ${zone.label}!`, '#fff')
      this.celebrations?.burst(1)
    }
    scene.onAfterRenderObservable.addOnce(() => {
      if (scene.activeCamera) {
        const pipeline = setupPostProcessing(scene, scene.activeCamera, this.engine.quality)
        this.zones!.setPipeline(pipeline)
      }
      this.celebrations = new CelebrationManager(scene, this.vehicle.root as unknown as import('@babylonjs/core').Mesh, [
        { dist: 100,  text: 'Nice driving!', sub: '', emoji: '🌟', big: false },
        { dist: 300,  text: 'Zoom zoom!',    sub: '', emoji: '⭐', big: false },
        { dist: 1000, text: 'Super driver!', sub: '', emoji: '🏆', big: true },
        { dist: 2000, text: 'Amazing!',      sub: '', emoji: '🎉', big: true },
      ])
    })
    this.vehicle.onLand = (air) => {
      if (air > 0.9) { this.celebrations?.pop(air > 1.4 ? '🚀 HUGE AIR!' : '✈ Big air!', '#a5f3fc', air > 1.4); this.audio.playWhee(); this._addCoins(air > 1.4 ? 10 : 5) }
    }
    void this.audio.preload()
    this.ready = true
    this.hud.setReady(true)

    if (q.has('auto') || q.has('sim')) {
      // Dev: `&vehicle=monster` drives any vehicle without unlocking it (not saved).
      if (q.get('vehicle')) this.garage.selected = q.get('vehicle')!
      this._start()
      if (devDist > 0) { this.distance = devDist; this.zones.snap(devDist) }
      const sim = Number(q.get('sim')) || 0
      if (sim > 0) this._simulate(sim)
    }
  }

  private _def(id: string): VehicleDef { return VEHICLES.find(v => v.id === id) ?? VEHICLES[0] }

  private _preview(id: string): void {
    const def = this._def(id)
    this.vehicle.setVehicle(def)
    this.hud.setAction(def.action)
  }

  private _start(): void {
    if (!this.ready) return
    this._preview(this.garage.selected)
    this.camera.setShowcase(false)
    this.audio.resume()
    this.audio.startMusic()
    this.vehicle.startEngine()
    this.running = true
    this.paused = false
    this.speed = this.targetSpeed = BASE_SPEED
    this.distance = 0
    this.coins = 0
    this.overtakes = 0
    this.bestBeaten = false
    this.traffic.reset()
    this.hud.hideStart()
  }

  private _pause(): void {
    if (!this.running || this.paused) return
    this.paused = true
    this.audio.suspend()
    this.hud.showPause()
  }
  private _resume(): void {
    if (!this.paused) return
    this.paused = false
    this.audio.resume()
    this.hud.hidePause()
  }

  private _jump(): void {
    if (!this.running || this.paused) return
    if (this.vehicle.jump()) this.audio.playJump()
  }

  private _addCoins(n: number): void {
    this.coins += n
    this.garage.bank += n
  }

  private _save(): void {
    saveGarage(this.garage)
    if (this.distance > this.best) { this.best = this.distance; saveBest(this.best) }
  }

  // ─── Frame ──────────────────────────────────────────────────────────────

  private _tick(): void {
    const dt = Math.min(this.engine.deltaTime, 0.05)
    if (this.ready && !this.running) {
      this.vehicle.update(dt, 0)
      this.camera.update(this.vehicle.position, dt, 0, 0, terrainY(this.vehicle.position.z))
      this.clouds.update(this.vehicle.position.z, dt)
      this.backdrop.update(this.vehicle.position.z, dt)
      return
    }
    this._step(dt)
  }

  private _step(dt: number): void {
    if (!this.ready || !this.running || this.paused) return

    this.targetSpeed = Math.min(MAX_SPEED, this.targetSpeed + ACCEL * dt)
    this.speed = this.speed < this.targetSpeed ? Math.min(this.targetSpeed, this.speed + RECOVER * dt) : this.targetSpeed
    this.distance += this.speed * dt

    this.vehicle.update(dt, this.speed)
    this.road.update(this.vehicle.position.z, this.distance)
    this.traffic.update(this.vehicle, dt, this.speed, {
      onCoin: () => { this._addCoins(1); this.audio.playCoin(0) },
      onBonk: () => {
        this.speed = Math.max(6, this.speed * BONK_SLOW)
        this.camera.shake(0.25, 0.35)
        this.audio.playBump()
        this.celebrations?.pop('Bonk!', '#fca5a5')
      },
      onOvertake: () => {
        this.overtakes++
        this._addCoins(2)
        if (this.overtakes % 3 === 0) { this.celebrations?.pop('Zoom! 💨', '#bbf7d0'); this.audio.playStreak(1) }
      },
      onRamp:   () => { this.audio.playWhee(); this.celebrations?.pop('Wheee!', '#fde68a') },
      onSplash: () => { this.audio.playSpill(); this.celebrations?.pop('Splash! 💦', '#93c5fd') },
      onWash:   () => { this.audio.playMagnet(); this.celebrations?.pop('Squeaky clean! 🫧', '#e9d5ff'); this._addCoins(5) },
    })

    const pz = this.vehicle.position.z
    this.camera.update(this.vehicle.position, dt, (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), this.vehicle.lateralVelocity, terrainY(pz))
    CurveState.playerZ = pz
    CurveState.k += (curveAt(pz) - CurveState.k) * Math.min(1, dt * 2)
    this.engine.updateLampLights(pz)
    this.clouds.update(pz, dt)
    this.backdrop.update(pz, dt)
    this.farGround.position.z = pz
    this.zones?.update(this.distance, dt)
    this.celebrations?.checkMilestone(this.distance)

    if (!this.bestBeaten && this.best > 60 && this.distance > this.best) {
      this.bestBeaten = true
      this.celebrations?.pop('🏆 New Best!', '#fde68a', true)
      this.celebrations?.burst(2)
      this.audio.playBest()
    }
    this.saveTimer += dt
    if (this.saveTimer > 5) { this.saveTimer = 0; this._save() }

    this.hud.update(this.distance, this.coins, this.vehicle.airborne ? this._airTime(dt) : 0)
  }

  private _air = 0
  private _airTime(dt: number): number {
    this._air = this.vehicle.airborne ? this._air + dt : 0
    return this._air
  }

  /** Random-input autopilot for headless checks. */
  private _simulate(seconds: number): void {
    const dt = 1 / 60
    let next = 0
    let bonks = 0, ramps = 0
    const origBonk = this.audio.playBump.bind(this.audio)
    this.audio.playBump = () => { bonks++; origBonk() }
    const origWhee = this.audio.playWhee.bind(this.audio)
    this.audio.playWhee = () => { ramps++; origWhee() }
    for (let t = 0; t < seconds; t += dt) {
      if (t >= next) {
        next = t + 0.5 + Math.random() * 0.8
        const r = Math.random()
        if (r < 0.3) this.vehicle.steerLeft()
        else if (r < 0.6) this.vehicle.steerRight()
        else if (r < 0.85) this._jump()
        else this.vehicle.action()
      }
      this._step(dt)
    }
    console.info(`[sim] ${seconds}s: dist=${this.distance.toFixed(0)} speed=${this.speed.toFixed(1)} coins=${this.coins} bonks=${bonks} whees=${ramps} overtakes=${this.overtakes} pos=${this.vehicle.position.x.toFixed(1)},${this.vehicle.position.y.toFixed(2)},${this.vehicle.position.z.toFixed(0)}`)
  }
}

void Vector3
