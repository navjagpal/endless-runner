import { Scene, Vector3, UniversalCamera } from '@babylonjs/core'

export class FollowCamera {
  private camera: UniversalCamera
  private shakeIntensity = 0
  private shakeTimer     = 0

  constructor(scene: Scene) {
    this.camera = new UniversalCamera('followCam', new Vector3(0, 4.75, -11), scene)
    this.camera.setTarget(new Vector3(0, 1, 10))
    this.camera.minZ = 0.1
    this.camera.maxZ = 350
  }

  /** Trigger a camera shake — call on bump */
  shake(intensity = 0.25, duration = 0.35): void {
    this.shakeIntensity = intensity
    this.shakeTimer     = duration
  }

  update(targetPos: Vector3, dt: number): void {
    const desired = targetPos.add(new Vector3(0, 4.75, -11))
    const t       = Math.min(1, 8 * dt)
    this.camera.position = Vector3.Lerp(this.camera.position, desired, t)

    const lookAt = targetPos.add(new Vector3(0, 1.2, 9))
    this.camera.setTarget(Vector3.Lerp(this.camera.target, lookAt, t))

    // Screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt
      const s = this.shakeIntensity * (this.shakeTimer > 0 ? 1 : 0)
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s * 0.5
    }
  }
}
