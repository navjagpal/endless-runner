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
} from '@babylonjs/core'

const LAMP_SPACING = 15     // must match TrackChunk lamp spacing
const LAMP_SIDE_X  = [5.5, -5.5, 5.5, -5.5, 5.5, -5.5]
const LAMP_Z_OFFSET= [5, 5, 20, 20, 35, 35]

export class GameEngine {
  public engine:          Engine
  public scene:           Scene
  public shadowGenerator: ShadowGenerator
  public sunLight:        DirectionalLight
  public hemiLight:       HemisphericLight

  private lampLights: PointLight[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
      adaptToDeviceRatio: true,
    })

    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.55, 0.78, 0.95, 1)

    ;({ sunLight: this.sunLight, hemiLight: this.hemiLight, shadowGenerator: this.shadowGenerator } =
      this._setupLighting())

    this._setupLampLights()

    window.addEventListener('resize', () => this.engine.resize())
  }

  private _setupLighting(): { sunLight: DirectionalLight; hemiLight: HemisphericLight; shadowGenerator: ShadowGenerator } {
    const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene)
    hemiLight.intensity   = 0.65
    hemiLight.groundColor = new Color3(0.40, 0.30, 0.20)
    hemiLight.diffuse     = new Color3(0.80, 0.90, 1.00)

    const sunLight = new DirectionalLight('sun', new Vector3(-0.6, -1.8, -1), this.scene)
    sunLight.intensity = 1.2
    sunLight.diffuse   = new Color3(1.0, 0.95, 0.85)
    sunLight.position  = new Vector3(30, 60, 30)

    // High-quality shadows: 2048 map, PCF soft
    const shadowGenerator = new ShadowGenerator(2048, sunLight)
    shadowGenerator.usePercentageCloserFiltering = true
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH
    shadowGenerator.frustumEdgeFalloff = 0.1

    return { sunLight, hemiLight, shadowGenerator }
  }

  private _setupLampLights(): void {
    // 6 warm point lights that we reposition to nearest lamp posts each frame
    for (let i = 0; i < 6; i++) {
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

  start(gameLoop: () => void): void {
    this.engine.runRenderLoop(() => {
      gameLoop()
      this.scene.render()
    })
  }

  stop(): void { this.engine.stopRenderLoop() }

  get deltaTime(): number { return this.engine.getDeltaTime() / 1000 }
}
