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
  private showcase       = false
  private orbit          = 0.6
  private recover        = 0
  // Smoothed look-at, kept here rather than read back from the camera:
  // Babylon only refreshes its notion of the target when it renders, so
  // a frame-less update loop (the headless autopilot) would never see it
  // move.
  private lookTarget     = LOOK_AT.clone()

  constructor(scene: Scene) {
    this.camera = new UniversalCamera('followCam', OFFSET.clone(), scene)
    this.camera.setTarget(LOOK_AT.clone())
    this.camera.minZ = 0.1
    this.camera.maxZ = getQualityProfile().maxZ
    this.camera.fov  = BASE_FOV
  }

  /**
   * Start-screen mode: slowly orbit the runner at eye level so the
   * character select actually shows the character. Turning it off eases
   * back into the chase position.
   */
  setShowcase(on: boolean): void {
    if (this.showcase && !on) this.recover = 1
    this.showcase = on
  }

  get position(): Vector3 { return this.camera.position }

  /** Trigger a camera shake — call on bump */
  shake(intensity = 0.25, duration = 0.35): void {
    this.shakeIntensity = intensity
    this.shakeTimer     = duration
  }

  update(targetPos: Vector3, dt: number, speedFrac = 0, lateralVel = 0, groundY = 0): void {
    void lateralVel
    if (this.showcase) {
      this.orbit += dt * 0.45
      const r = 3.6
      const desired = new Vector3(
        targetPos.x + Math.sin(this.orbit) * r,
        groundY + 1.45,
        targetPos.z + Math.cos(this.orbit) * r,
      )
      const t = Math.min(1, 3 * dt)
      this.camera.position = Vector3.Lerp(this.camera.position, desired, t)
      const look = new Vector3(targetPos.x, groundY + 1.15, targetPos.z)
      this.lookTarget = Vector3.Lerp(this.lookTarget, look, Math.min(1, 6 * dt))
      this.camera.setTarget(this.lookTarget.clone())
      this.camera.rotation.z = 0
      this.camera.fov = BASE_FOV
      return
    }
    if (this.recover > 0) this.recover = Math.max(0, this.recover - dt / 1.2)
    // Sideways follow gets its own, slower smoothing. Tracking the lane
    // snap at the same rate as the forward motion made the whole frame
    // lurch on every swipe, which reads as shaking.
    const followX = targetPos.x * LANE_FOLLOW
    const tx = 1 - Math.pow(0.001, dt / 0.55)
    this.smoothX += (followX - this.smoothX) * tx

    // The terrain is followed fully; only the jump above it is softened,
    // so a jump lifts the camera a little rather than yanking it along.
    const liftY   = groundY + (targetPos.y - groundY) * 0.35
    const desired = new Vector3(this.smoothX + OFFSET.x, liftY + OFFSET.y, targetPos.z + OFFSET.z)
    // Ease out of the showcase orbit instead of snapping to the chase.
    const t       = Math.min(1, (this.recover > 0 ? 2.5 + 6.5 * (1 - this.recover) : 9) * dt)
    this.camera.position = Vector3.Lerp(this.camera.position, desired, t)

    // A very gentle bob keyed to speed sells the running even when the eye
    // is on the road ahead rather than the character.
    this.bobT += dt * (6 + speedFrac * 3)
    this.camera.position.y += Math.sin(this.bobT) * 0.01

    const lookAt = new Vector3(this.smoothX + LOOK_AT.x, liftY + LOOK_AT.y, targetPos.z + LOOK_AT.z)
    this.lookTarget = Vector3.Lerp(this.lookTarget, lookAt, t)
    this.camera.setTarget(this.lookTarget.clone())
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
