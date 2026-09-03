import {
  Engine,
  Scene,
  Color4,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  Color3,
  PointLight,
  type Mesh,
} from '@babylonjs/core'
import { getQualityProfile, type QualityProfile } from './DeviceTier'

const LAMP_SPACING = 15     // must match TrackChunk lamp spacing
const LAMP_SIDE_X  = [5.5, -5.5, 5.5, -5.5, 5.5, -5.5]
const LAMP_Z_OFFSET= [5, 5, 20, 20, 35, 35]

// Adaptive governor: insurance against a device the tier sniffer guessed
// wrong about.
//
// The warm-up matters. Babylon's getFps() is a rolling average that
// starts near zero, and the first seconds of a session are spent
// compiling shaders and building the first track chunks — genuinely
// slow, and not representative. Sampling through that window degrades
// quality on every device, including ones that would have held 60 fps
// comfortably a second later.
const FPS_FLOOR      = 45
const FPS_CEILING    = 57     // sustained above this, try giving resolution back
const FPS_SUSTAIN    = 3.0
const WARMUP_SECS    = 6.0
const MAX_SCALING    = 2.0
const SCALING_STEP   = 0.25

export class GameEngine {
  public engine:          Engine
  public scene:           Scene
  public shadowGenerator: ShadowGenerator | null
  public sunLight:        DirectionalLight
  public hemiLight:       HemisphericLight
  public quality:         QualityProfile

  private lampLights: PointLight[] = []
  private _slowTimer  = 0
  private _fastTimer  = 0
  private _warmup     = 0
  private _scaling:   number

  constructor(canvas: HTMLCanvasElement) {
    this.quality = getQualityProfile()

    this.engine = new Engine(canvas, this.quality.antialias, {
      preserveDrawingBuffer: false,
      stencil: false,               // nothing in the scene uses the stencil buffer
      antialias: this.quality.antialias,
      adaptToDeviceRatio: this.quality.adaptToDeviceRatio,
      powerPreference: 'high-performance',
    })

    this._scaling = this.quality.hardwareScaling
    this.engine.setHardwareScalingLevel(this._scaling)

    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.80, 0.92, 1.0, 1)

    ;({ sunLight: this.sunLight, hemiLight: this.hemiLight, shadowGenerator: this.shadowGenerator } =
      this._setupLighting())

    this._setupLampLights()

    window.addEventListener('resize', () => this.engine.resize())
  }

  private _setupLighting(): {
    sunLight: DirectionalLight
    hemiLight: HemisphericLight
    shadowGenerator: ShadowGenerator | null
  } {
    const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene)
    hemiLight.intensity   = 0.65
    hemiLight.groundColor = new Color3(0.40, 0.30, 0.20)
    hemiLight.diffuse     = new Color3(0.80, 0.90, 1.00)

    // The light travels +z (over the camera's shoulder, down the track), so
    // the faces the camera actually sees — the runner's back, the tails
    // of the traffic, the fronts of everything approaching — are the lit
    // ones. The decorative sun disc in the sky sits ahead of the player
    // regardless; nobody checks.
    const sunLight = new DirectionalLight('sun', new Vector3(-0.45, -1.6, 1.0), this.scene)
    sunLight.intensity = 1.2
    sunLight.diffuse   = new Color3(1.0, 0.95, 0.85)
    sunLight.position  = new Vector3(20, 60, -40)

    if (!this.quality.realtimeShadows) {
      // Low tier reads depth from the player's blob shadow instead. The
      // meshes keep receiveShadows = true harmlessly — with no generator
      // attached to the light, Babylon compiles them without the shadow
      // sampler.
      return { sunLight, hemiLight, shadowGenerator: null }
    }

    const shadowGenerator = new ShadowGenerator(this.quality.shadowMapSize, sunLight)
    if (this.quality.softShadows) {
      shadowGenerator.usePercentageCloserFiltering = true
      shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
    } else {
      shadowGenerator.usePoissonSampling = true
    }
    shadowGenerator.frustumEdgeFalloff = 0.1
    shadowGenerator.bias               = 0.0015
    // Casters are registered explicitly by whoever owns the mesh. The
    // shadow map only ever contains the player and near obstacles —
    // rendering the whole corridor into it costs far more than it shows.
    shadowGenerator.getShadowMap()!.refreshRate = 1

    return { sunLight, hemiLight, shadowGenerator }
  }

  /** Register a mesh as a shadow caster. No-op when shadows are off. */
  addShadowCaster(mesh: Mesh, includeDescendants = true): void {
    this.shadowGenerator?.addShadowCaster(mesh, includeDescendants)
  }

  private _setupLampLights(): void {
    // Warm point lights that we reposition to the nearest lamp posts each
    // frame rather than creating one per post. Count is tier-gated —
    // every additional light is another forward pass over lit geometry.
    for (let i = 0; i < this.quality.lampLightCount; i++) {
      const pl = new PointLight(`lamp${i}`, Vector3.Zero(), this.scene)
      pl.diffuse    = new Color3(1.0, 0.88, 0.55)
      pl.specular   = new Color3(1.0, 0.88, 0.55)
      pl.intensity  = 1.8
      pl.range      = 14
      this.lampLights.push(pl)
    }
  }

  /** Call every frame to snap lamp lights to nearest grid positions */
  updateLampLights(playerZ: number): void {
    const baseZ = Math.floor(playerZ / LAMP_SPACING) * LAMP_SPACING
    for (let i = 0; i < this.lampLights.length; i++) {
      this.lampLights[i].position.set(
        LAMP_SIDE_X[i],
        3.85,
        baseZ + LAMP_Z_OFFSET[i],
      )
    }
  }

  /**
   * Trades render resolution against framerate.
   *
   * Steps down after a sustained stretch below the floor, and back up
   * after a much longer stretch above the ceiling — recovery is
   * deliberately slower than degradation so a one-off hitch doesn't
   * leave the game permanently soft, but normal frame-to-frame jitter
   * can't set off an oscillation either.
   */
  private _governFramerate(dt: number): void {
    // A backgrounded tab gets its rAF throttled to ~1 Hz. Those samples
    // say nothing about the device.
    if (typeof document !== 'undefined' && document.hidden) {
      this._slowTimer = 0
      this._fastTimer = 0
      return
    }

    if (this._warmup < WARMUP_SECS) {
      this._warmup += dt
      return
    }

    const fps = this.engine.getFps()
    if (!isFinite(fps) || fps <= 0) return

    if (fps < FPS_FLOOR && this._scaling < MAX_SCALING) {
      this._fastTimer = 0
      this._slowTimer += dt
      if (this._slowTimer >= FPS_SUSTAIN) {
        this._slowTimer = 0
        this._scaling = Math.min(MAX_SCALING, this._scaling + SCALING_STEP)
        this.engine.setHardwareScalingLevel(this._scaling)
        console.info(`[quality] sustained ${fps.toFixed(0)} fps — render scale ${this._scaling}`)
      }
    } else if (fps > FPS_CEILING && this._scaling > this.quality.hardwareScaling) {
      this._slowTimer = 0
      this._fastTimer += dt
      if (this._fastTimer >= FPS_SUSTAIN * 4) {
        this._fastTimer = 0
        this._scaling = Math.max(this.quality.hardwareScaling, this._scaling - SCALING_STEP)
        this.engine.setHardwareScalingLevel(this._scaling)
        console.info(`[quality] headroom at ${fps.toFixed(0)} fps — render scale ${this._scaling}`)
      }
    } else {
      this._slowTimer = 0
      this._fastTimer = 0
    }
  }

  start(gameLoop: () => void): void {
    this.engine.runRenderLoop(() => {
      gameLoop()
      this.scene.render()
      this._governFramerate(this.deltaTime)
    })
  }

  stop(): void { this.engine.stopRenderLoop() }

  get deltaTime(): number { return this.engine.getDeltaTime() / 1000 }
}
