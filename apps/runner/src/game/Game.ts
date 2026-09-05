import { Vector3, type Scene } from '@babylonjs/core'
import { GameEngine }          from '@kids/engine'
import { FollowCamera }        from '@kids/engine'
import { setupPostProcessing } from '@kids/engine'
import { setupEnvironment }    from '@kids/engine'
import { TrackManager }        from './track/TrackManager'
import { Player }              from './player/Player'
import { InputHandler }        from './player/InputHandler'
import { ObstacleManager }     from './obstacles/ObstacleManager'
import { AudioManager }        from '@kids/engine'
import { SpeedLines }          from './fx/SpeedLines'
import { ZoneManager }         from './zones/ZoneManager'
import { Backdrop }            from './zones/Backdrop'
import { CelebrationManager }  from '@kids/engine'
import { HUD }                 from './ui/HUD'
import { ZONE_MUSIC }          from './audio/music'
import { MILESTONES }          from './ui/milestones'
import { Kits }                from '@kids/engine'
import { Ambient }             from './fx/Ambient'
import { terrainY }            from '@kids/engine'
import { curveAt }             from '@kids/engine'
import { CurveState }          from '@kids/engine'
import { CHARACTERS, PETS, loadRoster, saveRoster, type Roster } from './player/Characters'
import { Pet, type PetKind } from './player/Pet'
import {
  type GameSettings, SPEED_MIN, SPEED_MAX, KID_SPEED_MAX, loadBest, saveBest, type BestRecord,
} from './ui/Settings'

const BASE_SPEED     = 11
const ACCEL          = 0.42
// Kid mode ramps up more gently and never reaches the top speeds.
// The base speed is NOT lowered: scripts/verify-vertical.mjs shows a car
// stops being jumpable below 11 m/s, and a jump that "should" work but
// doesn't is the worst thing this game could do to a six-year-old.
const KID_BASE_SPEED = 11
const KID_ACCEL      = 0.12

// Freeze frame on impact. A few tens of milliseconds of stopped time is
// the cheapest way to make a collision land as a hit rather than a
// clipping glitch — the eye reads the pause as force.
const HIT_STOP_SECS = 0.09

/**
 * The no-death ruleset.
 *
 * A young player should never see a "game over", but a bump still has to
 * cost something or there is no reason to dodge. Three costs, all
 * visible and all recoverable:
 *
 *   speed   — drops to BUMP_SLOW of current and climbs back
 *   coins   — a small handful spill out (capped, never below zero)
 *   streak  — the star meter empties and the coin multiplier resets
 *
 * And three rewards for *not* bumping, so the incentive is pull as much
 * as push: the multiplier climbs with a clean streak, the star meter
 * fills with every dodge and coin, and a full meter triggers Star Power.
 */
const BUMP_SLOW        = 0.70
const BUMP_RECOVER     = 6.0     // m/s² back toward the target speed
const BUMP_COIN_LOSS   = 5
const STAR_METER_MAX   = 100
const STAR_PER_DODGE   = 15      // ~7 clean dodges fill the meter
const STAR_PER_COIN    = 0.25    // coins are plentiful, so they only nudge it
const STAR_DURATION    = 7.5
const MULTIPLIER_STEPS = [0, 30, 80, 160]    // coin streak needed for x1..x4

export class Game {
  private engine:       GameEngine
  private camera:       FollowCamera
  private player:       Player
  private audio:        AudioManager
  private speedLines:   SpeedLines | null = null
  // Built once the model kits are in — see _init().
  private track!:       TrackManager
  private obstacles!:   ObstacleManager
  private zones:        ZoneManager | null = null
  private ambient!:     Ambient
  private pet:          Pet
  private ready         = false
  private roster:       Roster
  private backdrop:     Backdrop
  private celebrations: CelebrationManager | null = null
  private hud:          HUD
  private clouds:       ReturnType<typeof setupEnvironment>['clouds']
  private farGround:    ReturnType<typeof setupEnvironment>['farGround']

  private runSpeed      = BASE_SPEED
  private targetSpeed   = BASE_SPEED   // what the run wants to be doing; bumps knock runSpeed under it
  private running       = false
  private paused        = false
  private totalDistance = 0
  private hitStopTimer  = 0

  // Progress & rewards
  private coins         = 0
  private coinStreak    = 0
  private multiplier    = 1
  private starMeter     = 0
  private starTimer     = 0
  private best:         BestRecord
  private prevBest      = 0      // record at the start of this run — what the HUD shows
  private bestBeaten    = false
  private bestSaveTimer = 0
  private dodgeStreak   = 0

  // Live settings (updated immediately when changed in UI)
  private settings: GameSettings

  // Dev-only tallies, printed by the `?sim=` autopilot.
  private statBumps = 0
  private statDodges = 0
  private statStars = 0
  private statCoins = 0

  constructor(canvas: HTMLCanvasElement) {
    this.engine    = new GameEngine(canvas)
    const scene    = this.engine.scene

    // Dev aid: `?auto=1` starts the run immediately (headless screenshots),
    // `&dist=600` fast-forwards to any world, `&star=1` starts with Star
    // Power on, `&sim=20` runs 20 s of autopilot before the first frame.
    const q = new URLSearchParams(location.search)
    const devDist = Math.max(0, Number(q.get('dist')) || 0)

    const env = setupEnvironment(scene)
    this.clouds    = env.clouds
    this.farGround = env.farGround
    this.roster    = loadRoster()

    this.player    = new Player(scene, this.engine, this.roster.selected)
    this.pet       = new Pet(scene)
    this.pet.setKind(this.roster.pet as PetKind)
    this.camera    = new FollowCamera(scene)
    this.audio     = new AudioManager(ZONE_MUSIC)
    this.hud       = new HUD()
    this.backdrop  = new Backdrop(scene)
    this.best      = loadBest()

    // Read initial settings from the HUD (which loaded from localStorage)
    this.settings = this.hud.getSettings()

    this.player.setAudio(this.audio)
    new InputHandler(this.player, canvas)
    this.hud.onInput = (a) => {
      if (!this.running || this.paused) return
      if (a === 'left') this.player.moveLeft()
      else if (a === 'right') this.player.moveRight()
      else if (a === 'jump') this.player.jump()
      else this.player.slide()
    }
    this.hud.setTouchButtons(this.settings.touchButtons)

    // Start screen: the camera orbits the runner and the carousel swaps it.
    this.camera.setShowcase(true)
    this.hud.setRoster(CHARACTERS, this.roster)
    this.hud.onCharacterChange = (id) => { this.audio.playClick(); void this.player.setCharacter(id) }
    this.hud.onCharacterUnlock = (id) => this._unlockCharacter(id)
    this.hud.setPets(PETS, this.roster)
    this.hud.onPetChange = (id) => { this.audio.playClick(); this.pet.setKind(id as PetKind) }
    this.hud.onPetUnlock = (id) => this._unlockPet(id)
    this.hud.onHome = () => { this._saveBest(); location.reload() }
    void this.audio.preload()

    this.hud.onPlay   = () => this._startRun()
    this.hud.onPause  = () => this._pause()
    this.hud.onResume = () => this._resume()

    this.hud.onSettingsChange = (s: GameSettings) => {
      this.settings = s
      this.zones?.setBrightMode(s.brightZones)
      this.hud.setTouchButtons(s.touchButtons)
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this._saveBest(); this._pause() }
    })

    this.hud.showStart(this.best)
    this.hud.setReady(false)
    this.engine.start(() => this._tick())

    void this._init(scene, env, devDist, q)
  }

  /**
   * The part of setup that needs the model kits: the track and the
   * obstacles are built from them, and everything downstream hangs off
   * the track's materials. The sky, camera and start screen are already
   * up while this runs, so the wait reads as a loading beat, not a hang.
   */
  private async _init(
    scene: Scene,
    env: ReturnType<typeof setupEnvironment>,
    devDist: number,
    q: URLSearchParams,
  ): Promise<void> {
    await Kits.load(scene, ['vehicles', 'nature', 'city', 'trains'])

    this.track     = new TrackManager(scene, devDist)
    this.obstacles = new ObstacleManager(scene)
    this.ambient   = new Ambient(scene)

    this.zones = new ZoneManager(
      scene,
      env.sky,
      env.clouds,
      this.engine.sunLight,
      this.engine.hemiLight,
    )
    this.zones.setGrassMat(this.track.grassMat)
    this.zones.setRoadMat(this.track.roadMat)
    this.zones.setFarGround(env.farGround)
    this.zones.setBackdrop(this.backdrop)
    this.zones.setBrightMode(this.settings.brightZones)

    this.zones.onZoneEntered = (zone) => {
      this.ambient.setZone(zone.id, this.zones!.winter)
      this.audio.setZone(zone.id)
      this.audio.playCelebration()
      this.celebrations?.celebrateZone(zone)
    }

    scene.onAfterRenderObservable.addOnce(() => {
      if (scene.activeCamera) {
        const pipeline = setupPostProcessing(scene, scene.activeCamera, this.engine.quality)
        this.zones!.setPipeline(pipeline)
      }
      this.speedLines   = new SpeedLines(scene, this.player.mesh)
      this.celebrations = new CelebrationManager(scene, this.player.mesh, MILESTONES)
    })

    this.ready = true
    this.hud.setReady(true)

    if (q.has('auto') || q.has('sim')) {
      this._startRun()
      if (devDist > 0) { this.totalDistance = devDist; this.zones!.snap(devDist); this.ambient.setZone(this.zones!.currentZone.id, this.zones!.winter) }
      if (q.has('star')) this._startStarPower()
      if (q.get('pet')) this.pet.setKind(q.get('pet') as PetKind)
      if (q.has('jet')) this._onJetpack()
      if (q.has('board')) this._onBoard()
      const simSecs = Number(q.get('sim')) || 0
      if (simSecs > 0) this._simulate(simSecs)
    }
  }

  /**
   * Fixed-step autopilot for headless checks: random lane changes, jumps
   * and slides, then a one-line summary in the console.
   */
  private _simulate(seconds: number): void {
    const dt = 1 / 60
    let nextAction = 0
    for (let t = 0; t < seconds; t += dt) {
      if (t >= nextAction) {
        nextAction = t + 0.5 + Math.random() * 0.7
        const r = Math.random()
        if (r < 0.3) this.player.moveLeft()
        else if (r < 0.6) this.player.moveRight()
        else if (r < 0.85) this.player.jump()
        else this.player.slide()
      }
      this._step(dt)
    }
    console.info(
      `[sim] ${seconds}s: dist=${this.totalDistance.toFixed(0)} speed=${this.runSpeed.toFixed(1)} ` +
      `coins=${this.coins} (collected ${this.statCoins}) bumps=${this.statBumps} dodges=${this.statDodges} ` +
      `stars=${this.statStars} mult=${this.multiplier} meter=${this.starMeter.toFixed(0)}`,
    )
  }

  private _baseSpeed(): number { return this.settings.kidMode ? KID_BASE_SPEED : BASE_SPEED }
  private _maxSpeed():  number { return this.settings.kidMode ? KID_SPEED_MAX  : SPEED_MAX }

  private _unlockCharacter(id: string): void {
    const def = CHARACTERS.find(c => c.id === id)
    if (!def) return
    const owned = this.roster.unlocked.includes(id)
    if (!owned) {
      if (this.roster.bank < def.cost) {
        this.audio.playLocked()
        this.hud.shakeUnlock()
        return
      }
      this.roster.bank -= def.cost
      this.roster.unlocked.push(id)
      this.celebrations?.burst(1.5)
    }
    this.roster.selected = id
    saveRoster(this.roster)
    this.audio.playSelect()
    this.hud.setRoster(CHARACTERS, this.roster)
    void this.player.setCharacter(id)
  }

  private _unlockPet(id: string): void {
    const def = PETS.find(p => p.id === id)
    if (!def) return
    if (!this.roster.unlockedPets.includes(id)) {
      if (this.roster.bank < def.cost) {
        this.audio.playLocked()
        this.hud.shakePet()
        return
      }
      this.roster.bank -= def.cost
      this.roster.unlockedPets.push(id)
      this.celebrations?.burst(1.5)
    }
    this.roster.pet = id
    saveRoster(this.roster)
    this.audio.playSelect()
    this.hud.setRoster(CHARACTERS, this.roster)
    this.hud.setPets(PETS, this.roster)
    this.pet.setKind(id as PetKind)
  }

  private _onJetpack(): void {
    const secs = 6.5
    this.player.startJetpack(secs)
    this.obstacles.spawnSkyCoins(this.player.position.z, secs * this.runSpeed * 1.1)
    this.audio.playStar()
    this.celebrations?.pop('🚀 Jetpack!', '#fdba74', true)
  }

  private _onBoard(): void {
    this.player.startBoard(20)
    this.audio.playSelect()
    this.celebrations?.pop('🛹 Hoverboard!', '#f9a8d4')
  }

  private _startRun(): void {
    if (!this.ready) return
    this.camera.setShowcase(false)
    // Browsing a locked character or pet doesn't let you run with it.
    void this.player.setCharacter(this.roster.selected)
    this.pet.setKind(this.roster.pet as PetKind)
    this.audio.resume()
    this.audio.startMusic()
    this.running       = true
    this.paused        = false
    this.targetSpeed   = this.settings.speedMode === 'manual'
      ? this.settings.manualSpeed
      : this._baseSpeed()
    this.runSpeed      = this.targetSpeed
    this.totalDistance = 0
    this.coins         = 0
    this.coinStreak    = 0
    this.dodgeStreak   = 0
    this.multiplier    = 1
    this.starMeter     = 0
    this.starTimer     = 0
    this.bestBeaten    = false
    this.prevBest      = this.best.distance
    this.player.setStarPower(false)
    this.player.setMagnet(false)
    this.obstacles.reset()
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

  // ─── Rewards & penalties ────────────────────────────────────────────

  private _onBump(): void {
    this.statBumps++
    this.camera.shake(0.30, 0.40)
    this.hitStopTimer = HIT_STOP_SECS

    // Speed penalty: fall well under the target and climb back.
    this.runSpeed = Math.max(SPEED_MIN, this.runSpeed * BUMP_SLOW)

    // Coin penalty, spilled visibly. Never below zero, and smaller in
    // kid mode so it stings without discouraging.
    const loss = Math.min(this.coins, this.settings.kidMode ? BUMP_COIN_LOSS : Math.max(BUMP_COIN_LOSS, Math.floor(this.coins * 0.1)))
    if (loss > 0) {
      this.coins -= loss
      this.obstacles.spillCoins(Math.min(loss, 8), this.player.position)
      this.audio.playSpill()
      this.hud.flashCoins()
    }

    // Streak penalties
    const hadMultiplier = this.multiplier > 1
    this.coinStreak  = 0
    this.dodgeStreak = 0
    this.multiplier  = 1
    // Half the meter, not all of it: the loss is obvious on the bar, but
    // a single slip doesn't wipe out a minute of good running.
    if (this.starTimer <= 0) this.starMeter *= 0.5
    this.celebrations?.pop(hadMultiplier ? 'Oops! Streak lost' : 'Oops!', '#ff6b6b')
  }

  private _onCoin(pos: Vector3): void {
    void pos
    this.statCoins  += 1
    this.coins      += this.multiplier
    this.roster.bank += this.multiplier
    this.coinStreak += 1
    this.player.triggerCoinEffect()
    this.audio.playCoin(Math.min(7, Math.floor(this.coinStreak / 4)))
    this._addStar(STAR_PER_COIN)
    this._updateMultiplier()
  }

  private _onDodge(): void {
    this.statDodges  += 1
    this.dodgeStreak += 1
    this._addStar(STAR_PER_DODGE)
    if (this.dodgeStreak % 5 === 0) {
      this.celebrations?.pop(`${this.dodgeStreak} in a row! ⭐`, '#ffd93d')
      this.audio.playStreak(Math.min(4, this.dodgeStreak / 5))
    }
  }

  private _onMagnet(): void {
    this.audio.playMagnet()
    this.celebrations?.pop('Magnet! 🧲', '#7dd3fc')
  }

  private _onRooftop(): void {
    this.audio.playWhee()
    this.celebrations?.pop('Wheee! 🎉', '#a5f3fc')
    this._addStar(STAR_PER_DODGE)
  }

  private _updateMultiplier(): void {
    let m = 1
    for (let i = 1; i < MULTIPLIER_STEPS.length; i++) {
      if (this.coinStreak >= MULTIPLIER_STEPS[i]) m = i + 1
    }
    if (m !== this.multiplier) {
      this.multiplier = m
      this.celebrations?.pop(`x${m} coins!`, '#fbbf24')
      this.audio.playStreak(m)
    }
  }

  private _addStar(amount: number): void {
    if (this.starTimer > 0) return
    this.starMeter += amount
    if (this.starMeter >= STAR_METER_MAX) this._startStarPower()
  }

  private _startStarPower(): void {
    this.statStars++
    this.starMeter = STAR_METER_MAX
    this.starTimer = STAR_DURATION
    this.player.setStarPower(true)
    this.obstacles.setStarPower(true)
    this.audio.playStar()
    this.celebrations?.pop('⭐ STAR POWER! ⭐', '#f0abfc', true)
    this.celebrations?.burst()
  }

  private _endStarPower(): void {
    this.starTimer = 0
    this.starMeter = 0
    this.player.setStarPower(false)
    this.obstacles.setStarPower(false)
  }

  private _checkBest(): void {
    if (!this.bestBeaten && this.best.distance > 60 && this.totalDistance > this.best.distance) {
      this.bestBeaten = true
      this.celebrations?.pop('🏆 New Best!', '#fde68a', true)
      this.celebrations?.burst()
      this.audio.playBest()
    }
    if (this.totalDistance > this.best.distance) this.best.distance = Math.floor(this.totalDistance)
    if (this.coins > this.best.coins) this.best.coins = this.coins
  }

  private _saveBest(): void { saveBest(this.best); saveRoster(this.roster) }

  // ─── Frame ──────────────────────────────────────────────────────────

  private _tick(): void {
    const dt = Math.min(this.engine.deltaTime, 0.05)
    if (this.ready && !this.running) {
      // Start screen: the runner jogs on the spot while the camera orbits.
      this.player.update(dt, 0, 0)
      this.pet.update(dt, this.player.position.x, this.player.position.z, this.player.bodyBottom, 0)
      this.camera.update(this.player.position, dt, 0, 0, terrainY(this.player.position.z))
      this.ambient.update(this.player.position, dt)
      this.clouds.update(this.player.position.z, dt)
      this.backdrop.update(this.player.position.z, dt)
      return
    }
    this._step(dt)
  }

  private _step(rawDt: number): void {
    if (!this.ready || !this.running || this.paused) return

    // Hit-stop: hold the world still for a beat after an impact. The
    // camera still updates so the shake reads during the freeze.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDt
      this.camera.update(this.player.position, rawDt, this._speedFrac(), 0, terrainY(this.player.position.z))
      return
    }
    const dt = rawDt

    // Speed: the target creeps up (auto) or holds (manual); the actual
    // speed chases it, which is what lets a bump knock it down and let
    // it recover.
    const maxSpeed = this._maxSpeed()
    if (this.settings.speedMode === 'auto') {
      const accel = this.settings.kidMode ? KID_ACCEL : ACCEL
      this.targetSpeed = Math.min(maxSpeed, this.targetSpeed + accel * dt)
    } else {
      this.targetSpeed = Math.min(maxSpeed, this.settings.manualSpeed)
    }
    if (this.runSpeed < this.targetSpeed) {
      this.runSpeed = Math.min(this.targetSpeed, this.runSpeed + BUMP_RECOVER * dt)
    } else {
      this.runSpeed = this.targetSpeed
    }
    const starBoost = this.starTimer > 0 ? 1.12 : 1
    const speed = this.runSpeed * starBoost

    this.totalDistance += speed * dt
    const speedFrac = this._speedFrac()

    if (this.starTimer > 0) {
      this.starTimer -= dt
      this.starMeter = STAR_METER_MAX * Math.max(0, this.starTimer / STAR_DURATION)
      if (this.starTimer <= 0) this._endStarPower()
    }

    this.player.update(dt, speed, speedFrac)
    this.track.update(this.player.position.z, this.totalDistance)
    this.obstacles.update(
      this.player,
      this.player.position.z,
      dt,
      speed,
      this.settings.kidMode,
      {
        onBump:    () => this._onBump(),
        onCoin:    (p) => this._onCoin(p),
        onDodge:   () => this._onDodge(),
        onMagnet:  () => this._onMagnet(),
        onJetpack: () => this._onJetpack(),
        onBoard:   () => this._onBoard(),
        onRooftop: () => this._onRooftop(),
      },
      this.zones?.currentZone.id ?? 'meadow',
      this.pet.active ? this.pet.position : null,
    )
    this.pet.update(dt, this.player.position.x, this.player.position.z, this.player.bodyBottom, speed)
    this.player.setMagnet(this.obstacles.magnetActive)

    this.camera.update(this.player.position, dt, speedFrac, this.player.lateralVelocity, terrainY(this.player.position.z))
    // The road bends ahead of wherever the player is; ease the amount so
    // a lane's worth of sideways sweep never appears between frames.
    CurveState.playerZ = this.player.position.z
    CurveState.k += (curveAt(this.player.position.z) - CurveState.k) * Math.min(1, dt * 2)
    this.ambient.update(this.player.position, dt, this.totalDistance)
    this.engine.updateLampLights(this.player.position.z)
    this.clouds.update(this.player.position.z, dt)
    this.backdrop.update(this.player.position.z, dt)
    this.farGround.position.z = this.player.position.z

    this.zones?.update(this.totalDistance, dt)
    this.speedLines?.setSpeed(speed, SPEED_MAX)
    this.celebrations?.checkMilestone(this.totalDistance)

    this._checkBest()
    this.bestSaveTimer += dt
    if (this.bestSaveTimer > 5) { this.bestSaveTimer = 0; this._saveBest() }

    this.hud.update(this.totalDistance, this.coins, speedFrac, {
      multiplier:      this.multiplier,
      starMeter:       this.starMeter / STAR_METER_MAX,
      starActive:      this.starTimer > 0,
      magnetRemaining: this.obstacles.magnetRemaining,
      jetpackRemaining: this.player.jetpackRemaining,
      boardRemaining:  this.player.boardRemaining,
      bestDistance:    this.prevBest,
    })
  }

  private _speedFrac(): number {
    const f = (this.runSpeed - SPEED_MIN) / (this._maxSpeed() - SPEED_MIN)
    return Math.max(0, Math.min(1, f))
  }
}
