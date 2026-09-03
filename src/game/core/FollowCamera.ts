import { Scene, Vector3, UniversalCamera } from '@babylonjs/core'
import { getQualityProfile } from './DeviceTier'

/**
 * Chase camera.
 *
 * Framing follows the mobile-runner convention: close and slightly low,
 * so the character is large on screen and obstacles loom rather than
 * appearing as distant specks. It tracks only a fraction of the
 * player's lane offset — the world slides under the runner instead of
 * the runner staying glued to screen centre — with the sideways follow
 * smoothed on its own, slower curve so a swipe never jolts the frame.
 */

const OFFSET   = new Vector3(0, 4.1, -9.0)
const LOOK_AT  = new Vector3(0, 1.5, 9.5)
const BASE_FOV = 0.88              // radians
const FOV_RANGE = 0.14             // added at full speed
const LANE_FOLLOW = 0.55           // how much of the lane offset the camera copies

export class FollowCamera {
  private camera: UniversalCamera
  private shakeIntensity = 0
  private shakeTimer     = 0
  private fov            = BASE_FOV
  private smoothX        = 0
  private bobT           = 0

  constructor(scene: Scene) {
    this.camera = new UniversalCamera('followCam', OFFSET.clone(), scene)
    this.camera.setTarget(LOOK_AT.clone())
    this.camera.minZ = 0.1
    this.camera.maxZ = getQualityProfile().maxZ
    this.camera.fov  = BASE_FOV
  }

  /** Trigger a camera shake — call on bump */
  shake(intensity = 0.25, duration = 0.35): void {
    this.shakeIntensity = intensity
    this.shakeTimer     = duration
  }

  update(targetPos: Vector3, dt: number, speedFrac = 0, lateralVel = 0): void {
    void lateralVel
    // Sideways follow gets its own, slower smoothing. Tracking the lane
    // snap at the same rate as the forward motion made the whole frame
    // lurch on every swipe, which reads as shaking.
    const followX = targetPos.x * LANE_FOLLOW
    const tx = 1 - Math.pow(0.001, dt / 0.55)
    this.smoothX += (followX - this.smoothX) * tx

    // Vertical is softened too, so a jump lifts the camera a little
    // rather than yanking it along. Forward tracks tightly.
    const desired = new Vector3(this.smoothX + OFFSET.x, targetPos.y * 0.35 + OFFSET.y, targetPos.z + OFFSET.z)
    const t       = Math.min(1, 9 * dt)
    this.camera.position = Vector3.Lerp(this.camera.position, desired, t)

    // A very gentle bob keyed to speed sells the running even when the eye
    // is on the road ahead rather than the character.
    this.bobT += dt * (6 + speedFrac * 3)
    this.camera.position.y += Math.sin(this.bobT) * 0.01

    const lookAt = new Vector3(this.smoothX + LOOK_AT.x, targetPos.y * 0.35 + LOOK_AT.y, targetPos.z + LOOK_AT.z)
    this.camera.setTarget(Vector3.Lerp(this.camera.target, lookAt, t))
    // No roll into lane changes: the tilt felt like the screen shaking.
    this.camera.rotation.z = 0

    // Widening the field of view as speed climbs pushes the periphery
    // outward and stretches the road — the standard trick for conveying
    // acceleration without actually moving faster.
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
