import { Scene, Vector3, UniversalCamera } from '@babylonjs/core'
import { getQualityProfile } from './DeviceTier'

const BASE_FOV  = 0.85              // radians
const FOV_RANGE = 0.16              // added at full speed

export class FollowCamera {
  private camera: UniversalCamera
  private shakeIntensity = 0
  private shakeTimer     = 0
  private fov            = BASE_FOV

  constructor(scene: Scene) {
    this.camera = new UniversalCamera('followCam', new Vector3(0, 4.75, -11), scene)
    this.camera.setTarget(new Vector3(0, 1, 10))
    this.camera.minZ = 0.1
    this.camera.maxZ = getQualityProfile().maxZ
    this.camera.fov  = BASE_FOV
  }

  /** Trigger a camera shake — call on bump */
  shake(intensity = 0.25, duration = 0.35): void {
    this.shakeIntensity = intensity
    this.shakeTimer     = duration
  }

  update(targetPos: Vector3, dt: number, speedFrac = 0): void {
    const desired = targetPos.add(new Vector3(0, 4.75, -11))
    const t       = Math.min(1, 8 * dt)
    this.camera.position = Vector3.Lerp(this.camera.position, desired, t)

    const lookAt = targetPos.add(new Vector3(0, 1.2, 9))
    this.camera.setTarget(Vector3.Lerp(this.camera.target, lookAt, t))

    // Widening the field of view as speed climbs pushes the periphery
    // outward and stretches the road — the standard trick for conveying
    // acceleration without actually moving faster. Eased slowly so it
    // registers as mounting pressure rather than a zoom.
    const targetFov = BASE_FOV + speedFrac * FOV_RANGE
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 1.5)
    this.camera.fov = this.fov

    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt
      const s = this.shakeIntensity * Math.max(0, this.shakeTimer)
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s * 0.5
    }
  }
}
