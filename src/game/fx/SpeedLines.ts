import {
  Scene,
  ParticleSystem,
  Texture,
  Color4,
  Vector3,
  Mesh,
} from '@babylonjs/core'

export class SpeedLines {
  private ps: ParticleSystem

  constructor(scene: Scene, emitter: Mesh) {
    this.ps = new ParticleSystem('speedLines', 500, scene)

    // Use Babylon.js hosted flare texture (tiny CDN hit, cached after first load)
    this.ps.particleTexture = new Texture(
      'https://assets.babylonjs.com/particles/flare.png',
      scene
    )

    this.ps.emitter = emitter
    // Spawn in a wide corridor ahead of the player
    this.ps.minEmitBox = new Vector3(-8, -1, 6)
    this.ps.maxEmitBox = new Vector3( 8,  5, 28)

    // Fly backward past the camera at high speed
    this.ps.direction1 = new Vector3(-0.4, -0.2, -65)
    this.ps.direction2 = new Vector3( 0.4,  0.2, -55)

    this.ps.minLifeTime = 0.10
    this.ps.maxLifeTime = 0.22

    this.ps.emitRate = 0          // controlled dynamically
    this.ps.minSize  = 0.04
    this.ps.maxSize  = 0.14

    this.ps.color1   = new Color4(1.0, 1.0, 1.0, 0.90)
    this.ps.color2   = new Color4(0.8, 0.95, 1.0, 0.70)
    this.ps.colorDead = new Color4(1, 1, 1, 0)

    this.ps.blendMode = ParticleSystem.BLENDMODE_ADD
    this.ps.gravity   = Vector3.Zero()

    this.ps.start()
  }

  /** Call every frame — ramps up particles as speed increases past threshold */
  setSpeed(speed: number, maxSpeed: number): void {
    const threshold = maxSpeed * 0.55
    const t = Math.max(0, (speed - threshold) / (maxSpeed - threshold))
    this.ps.emitRate = Math.floor(t * t * 320)
  }
}
