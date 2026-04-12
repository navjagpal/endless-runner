import { GameEngine }          from './core/GameEngine'
import { FollowCamera }        from './core/FollowCamera'
import { setupPostProcessing } from './core/PostProcessing'
import { setupEnvironment }    from './core/Environment'
import { TrackManager }        from './track/TrackManager'
import { Player }              from './player/Player'
import { InputHandler }        from './player/InputHandler'
import { ObstacleManager }     from './obstacles/ObstacleManager'
import { AudioManager }        from './audio/AudioManager'
import { SpeedLines }          from './fx/SpeedLines'
import { ZoneManager }         from './zones/ZoneManager'
import { CelebrationManager }  from './ui/CelebrationManager'
import { HUD }                 from './ui/HUD'

const BASE_SPEED = 11
const MAX_SPEED  = 28
const ACCEL      = 0.42

export class Game {
  private engine:       GameEngine
  private camera:       FollowCamera
  private track:        TrackManager
  private player:       Player
  private obstacles:    ObstacleManager
  private audio:        AudioManager
  private speedLines:   SpeedLines | null = null
  private zones:        ZoneManager | null = null
  private celebrations: CelebrationManager | null = null
  private hud:          HUD

  private runSpeed      = BASE_SPEED
  private running       = false
  private paused        = false
  private totalDistance = 0

  constructor(canvas: HTMLCanvasElement) {
    this.engine    = new GameEngine(canvas)
    const scene    = this.engine.scene

    // Environment — returns sky + ground materials for ZoneManager
    const envAssets = setupEnvironment(scene)

    this.player    = new Player(scene)
    this.camera    = new FollowCamera(scene)
    this.track     = new TrackManager(scene)
    this.obstacles = new ObstacleManager(scene)
    this.audio     = new AudioManager()
    this.hud       = new HUD()

    this.player.setAudio(this.audio)
    new InputHandler(this.player, canvas)

    // ZoneManager — drives sky, fog, lighting, materials, audio per zone
    this.zones = new ZoneManager(
      scene,
      envAssets.skyMat,
      this.engine.sunLight,
      this.engine.hemiLight,
    )
    this.zones.setGrassMat(this.track.grassMat)
    this.zones.setRoadMat(this.track.roadMat)
    this.zones.setFarGround(envAssets.farGround)
    this.zones.onZoneEntered = (zone) => {
      this.audio.setZone(zone.id)
      this.audio.playCelebration()
      this.celebrations?.celebrateZone(zone)
    }

    // Post-processing + speed lines + celebration particles need active camera
    scene.onAfterRenderObservable.addOnce(() => {
      if (scene.activeCamera) {
        const pipeline = setupPostProcessing(scene, scene.activeCamera)
        this.zones!.setPipeline(pipeline)
      }
      this.speedLines   = new SpeedLines(scene, this.player.mesh)
      this.celebrations = new CelebrationManager(scene, this.player.mesh)
    })

    this.hud.onPlay   = () => this._startRun()
    this.hud.onPause  = () => this._pause()
    this.hud.onResume = () => this._resume()
    this.hud.showStart()

    this.engine.start(() => this._tick())
  }

  private _startRun(): void {
    this.audio.resume()
    this.audio.startMusic()
    this.running       = true
    this.paused        = false
    this.runSpeed      = BASE_SPEED
    this.totalDistance = 0
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

  private _tick(): void {
    const dt = Math.min(this.engine.deltaTime, 0.05)
    if (!this.running || this.paused) return

    this.runSpeed      = Math.min(MAX_SPEED, this.runSpeed + ACCEL * dt)
    this.totalDistance += this.runSpeed * dt

    this.player.update(dt, this.runSpeed)
    this.track.update(this.player.position.z, this.totalDistance)
    this.obstacles.update(
      this.player,
      this.player.position.z,
      dt,
      () => this.camera.shake(0.28, 0.38),
    )
    this.camera.update(this.player.position, dt)
    this.engine.updateLampLights(this.player.position.z)

    this.zones?.update(this.totalDistance, dt)
    this.speedLines?.setSpeed(this.runSpeed, MAX_SPEED)
    this.celebrations?.checkMilestone(this.totalDistance)

    const speedFrac = (this.runSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)
    this.hud.update(this.totalDistance, this.obstacles.score / 10, speedFrac)
  }
}
