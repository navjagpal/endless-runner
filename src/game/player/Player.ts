import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  ParticleSystem,
  Color3,
  Color4,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core'
import { LANE_POSITIONS } from '../track/TrackChunk'
import { CharacterMesh } from './CharacterMesh'
import { CharacterRig } from './CharacterRig'
import type { Character, CharacterState } from './Character'
import type { AudioManager } from '../audio/AudioManager'
import type { GameEngine } from '../core/GameEngine'
import { getFlareTexture, getBlobShadowTexture } from '../fx/Textures'
import { getQualityProfile } from '../core/DeviceTier'

/**
 * Jump apex, and it's a balance point rather than a feel knob.
 *
 * Now that obstacles have a solid vertical span, the apex decides what is
 * jumpable and therefore what the other inputs are *for*:
 *
 *   barrier  0.82  — clears easily; the jump's bread and butter
 *   car      1.45  — clears with decent timing; rewarding
 *   truck    2.21  ┐ must NOT clear, or lane-changing becomes pointless
 *   bus      2.24  ┘ and the rooftop ramps have no reason to exist
 *
 * The old 3.2 predates solid spans — back then jumping had no effect on
 * collision at all, so the value was free. At 3.2 a well-timed jump now
 * clears everything in the game, so it comes down to sit between the car
 * and the truck.
 *
 * Height alone isn't enough though: clearing an obstacle means staying
 * above it for the *whole* time the bodies overlap in z, and a car's
 * overlap window is 3.86 units. At the starting speed of 11 that's 0.35 s
 * of hang time needed — so the rise time matters as much as the apex, and
 * a value tuned only against the apex leaves the car unjumpable at slow
 * speed but jumpable once the run speeds up.
 *
 * These two were solved for rather than guessed: apex 2.15 (0.06 under
 * the truck roof) with the car clearing at every speed from 11 to 28.
 */
const JUMP_HEIGHT        = 2.25
const JUMP_RISE_TIME     = 0.37
// Falling faster than rising is the oldest trick in platformer feel:
// it keeps the airtime readable while making the landing feel decisive.
const FALL_MULTIPLIER    = 1.55
const SLIDE_DURATION     = 0.55
const BUMP_DURATION      = 0.38
const INVINCIBILITY_TIME = 1.6

// How long before landing a jump input is still honoured. Without this,
// a player who taps a few frames early gets nothing and reads it as the
// game dropping their input — the single most common complaint about
// touch runners.
const INPUT_BUFFER_TIME  = 0.18

const LANE_SWITCH_TIME   = 0.16

// Collision body height standing vs. sliding. The slide has to duck
// under a 1.35-unit gantry, and the stand has to be tall enough that
// clearing a car actually requires the jump.
const STAND_HEIGHT       = 1.50
const SLIDE_HEIGHT       = 0.70

export class Player {
  public mesh: Mesh                // invisible root — position + collision

  private scene: Scene
  private engine: GameEngine
  private character: Character
  private charAnchor: TransformNode

  private state: CharacterState = 'running'
  private targetLane = 1
  private laneX: number
  private lateralVel = 0

  // posY is the absolute height of the feet above the road (y=0).
  // groundY is the height of whatever surface is under the player right now
  // — 0 on the road, higher on a ramp or a vehicle rooftop. ObstacleManager
  // resolves it and pushes it in each frame before update().
  private posY = 0
  private velY = 0
  private groundY = 0

  private slideTimer  = 0
  private bumpTimer   = 0
  private bufferedJump = 0

  private invincible      = false
  private invincibleTimer = 0
  private audio: AudioManager | null = null

  private blobShadow: Mesh
  private bumpPs: ParticleSystem
  private coinPs: ParticleSystem

  constructor(scene: Scene, engine: GameEngine) {
    this.scene  = scene
    this.engine = engine
    this.laneX  = LANE_POSITIONS[1]

    // Invisible collision root. Kept a plain box so collision stays
    // independent of whatever the character visual happens to be.
    this.mesh = MeshBuilder.CreateBox('playerRoot', { width: 0.75, height: 1.50, depth: 0.75 }, scene)
    this.mesh.position   = new Vector3(this.laneX, 0.75, 0)
    this.mesh.isVisible  = false
    this.mesh.isPickable = false

    // Character hangs off an anchor so the slide squash applied to the
    // collision root doesn't also squash the visual — the two want
    // different shapes.
    this.charAnchor = new TransformNode('charAnchor', scene)
    this.charAnchor.parent = this.mesh
    this.charAnchor.position.y = -0.75

    const procedural = new CharacterMesh(scene, this.charAnchor)
    this.character = procedural
    this._registerShadowCasters(procedural.castingMeshes)

    // Try to upgrade to a skinned rig in the background. Loading it
    // synchronously would stall the start screen for no reason — the
    // procedural character is a perfectly good first frame.
    void this._tryUpgradeToRig()

    this.blobShadow = this._makeBlobShadow(scene)
    this.bumpPs     = this._makeBumpParticles(scene)
    this.coinPs     = this._makeCoinParticles(scene)
  }

  private async _tryUpgradeToRig(): Promise<void> {
    const rig = await CharacterRig.tryLoad(this.scene, this.charAnchor)
    if (!rig) return
    this.character.dispose()
    this.character = rig
    this._registerShadowCasters(rig.castingMeshes)
  }

  private _registerShadowCasters(meshes: { getTotalVertices(): number }[]): void {
    if (!this.engine.shadowGenerator) return
    for (const m of meshes) {
      this.engine.addShadowCaster(m as Mesh, false)
    }
  }

  /**
   * Soft dark ellipse projected under the player.
   *
   * The scene's real shadow map has no casters registered and never had
   * — so despite a 2048px PCF map being rendered every frame, nothing
   * has ever cast a shadow in this game. That matters beyond looks:
   * without a ground contact point, a player mid-jump can't tell where
   * they'll land relative to an obstacle.
   */
  private _makeBlobShadow(scene: Scene): Mesh {
    const blob = MeshBuilder.CreateGround('blobShadow', { width: 1.1, height: 1.3 }, scene)
    const tex  = getBlobShadowTexture(scene)

    const mat = new StandardMaterial('blobShadowMat', scene)
    // The gradient carries the shape in its alpha; the surface itself is
    // pure black and unlit, so it darkens the road without picking up
    // zone lighting.
    mat.diffuseColor    = Color3.Black()
    mat.specularColor   = Color3.Black()
    mat.emissiveColor   = Color3.Black()
    mat.opacityTexture  = tex
    mat.disableLighting = true
    mat.backFaceCulling = false

    blob.material   = mat
    blob.isPickable = false
    blob.alwaysSelectAsActiveMesh = true
    return blob
  }

  setAudio(audio: AudioManager): void { this.audio = audio }

  // ─── Controls ──────────────────────────────────────────────────────

  moveLeft(): void {
    if (this.state === 'bumping') return
    if (this.targetLane > 0) this.targetLane--
  }

  moveRight(): void {
    if (this.state === 'bumping') return
    if (this.targetLane < 2) this.targetLane++
  }

  jump(): void {
    if (this._tryJump()) return
    // Not jumpable right now — remember the intent briefly instead of
    // discarding it.
    this.bufferedJump = INPUT_BUFFER_TIME
  }

  private _tryJump(): boolean {
    if (this.state === 'jumping' || this.state === 'bumping') return false
    // Jumping is legal from any surface, not just the road — standing on a
    // vehicle rooftop still counts as grounded. What's disallowed is
    // jumping again while genuinely in the air.
    if (this.airborne) return false
    if (this.state === 'sliding') this.slideTimer = 0   // slide cancels into a jump
    this.state = 'jumping'
    this.velY  = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME
    this.audio?.playJump()
    return true
  }

  /** True when the feet are off the current surface. */
  private get airborne(): boolean {
    return this.state === 'jumping' || this.posY > this.groundY + 0.02
  }

  slide(): void {
    if (this.state === 'bumping') return
    if (this.state === 'jumping') {
      // Slam down out of a jump rather than ignoring the input.
      this.velY = Math.min(this.velY, -8)
      return
    }
    this.state      = 'sliding'
    this.slideTimer = SLIDE_DURATION
  }

  // ─── Called by ObstacleManager ─────────────────────────────────────

  handleCollision(): void {
    if (this.invincible) return
    this.state           = 'bumping'
    this.bumpTimer       = BUMP_DURATION
    this.invincible      = true
    this.invincibleTimer = INVINCIBILITY_TIME
    this.character.flashRed(true)
    this.audio?.playBump()
    this.bumpPs.start()
  }

  triggerCoinEffect(): void {
    this.coinPs.start()
    this.audio?.playCoin()
  }

  // ─── Update loop ───────────────────────────────────────────────────

  update(dt: number, runSpeed: number, speedFrac: number): void {
    this._tickTimers(dt)

    // Consume a buffered jump the instant it becomes legal.
    if (this.bufferedJump > 0) {
      this.bufferedJump -= dt
      if (this._tryJump()) this.bufferedJump = 0
    }

    if (this.invincible) {
      this.invincibleTimer -= dt
      this.character.setVisible(Math.sin(this.invincibleTimer * 22) > 0)
      if (this.invincibleTimer <= 0) {
        this.invincible = false
        this.character.setVisible(true)
      }
    }

    this._updateLane(dt)
    this._updateVertical(dt)

    this.mesh.position.x  = this.laneX
    this.mesh.position.y  = 0.75 + this.posY
    this.mesh.position.z += runSpeed * dt

    this._updateBlobShadow()

    this.character.update(dt, this.state, {
      speed: runSpeed,
      speedFrac,
      lateralVel: this.lateralVel,
      verticalVel: this.velY,
      // Height above the *current* surface, not above the road. Using the
      // absolute height would read a player standing on a bus roof as
      // permanently airborne, so the landing squash would never fire again
      // after the first ramp.
      height: Math.max(0, this.posY - this.groundY),
    })
  }

  private _tickTimers(dt: number): void {
    if (this.slideTimer > 0) {
      this.slideTimer -= dt
      if (this.slideTimer <= 0 && this.state === 'sliding') this.state = 'running'
    }
    if (this.bumpTimer > 0) {
      this.bumpTimer -= dt
      if (this.bumpTimer <= 0) {
        this.character.flashRed(false)
        if (this.state === 'bumping') this.state = 'running'
      }
    }
  }

  private _updateLane(dt: number): void {
    const targetX = LANE_POSITIONS[this.targetLane]
    const prevX   = this.laneX

    // Critically-damped-ish approach rather than a fixed lerp: fast off
    // the mark, settling without overshoot.
    const t = 1 - Math.pow(0.0015, dt / LANE_SWITCH_TIME)
    this.laneX += (targetX - this.laneX) * t
    if (Math.abs(this.laneX - targetX) < 0.005) this.laneX = targetX

    this.lateralVel = dt > 0 ? (this.laneX - prevX) / dt : 0
  }

  /**
   * Vertical physics, unified so a ramp or rooftop behaves exactly like the
   * road. Airborne means gravity; grounded means stick to the surface, which
   * is what makes a ramp visibly carry the player upward and what makes
   * running off the far end of a rooftop become a fall rather than a
   * teleport to ground level.
   */
  private _updateVertical(dt: number): void {
    if (this.airborne) {
      const g = (2 * JUMP_HEIGHT) / (JUMP_RISE_TIME * JUMP_RISE_TIME)
      this.velY -= g * (this.velY < 0 ? FALL_MULTIPLIER : 1) * dt
      this.posY += this.velY * dt

      if (this.posY <= this.groundY && this.velY <= 0) {
        this.posY = this.groundY
        this.velY = 0
        if (this.state === 'jumping') this.state = 'running'
      }
    } else {
      this.posY = this.groundY
      this.velY = 0
    }
  }

  /**
   * Height of the surface under the player. Resolved and pushed in by
   * ObstacleManager each frame, before update().
   */
  setGroundY(y: number): void { this.groundY = y }

  /**
   * Shadow sits on whatever surface is under the player and shrinks with
   * height above it. Pinning it to y=0 would leave it on the road while the
   * player ran along a bus roof two metres up.
   */
  private _updateBlobShadow(): void {
    const h = Math.max(0, this.posY - this.groundY)
    this.blobShadow.position.set(this.laneX, this.groundY + 0.02, this.mesh.position.z)
    const k = Math.max(0.45, 1 - h / (JUMP_HEIGHT * 1.6))
    this.blobShadow.scaling.set(k, 1, k)
    this.blobShadow.visibility = 0.15 + 0.85 * k
  }

  get position(): Vector3 { return this.mesh.position }
  get isInvincible(): boolean { return this.invincible }
  get isSliding(): boolean { return this.state === 'sliding' }

  /**
   * Vertical extent of the collision body, in world units above the road.
   *
   * Collision used to test x and z only, which meant jumping over and
   * sliding under an obstacle did nothing — both inputs were purely
   * cosmetic. These two accessors are what make them mechanical.
   */
  get bodyBottom(): number { return this.posY }
  get bodyTop(): number {
    return this.posY + (this.state === 'sliding' ? SLIDE_HEIGHT : STAND_HEIGHT)
  }

  // ─── Particle systems ──────────────────────────────────────────────

  private _makeBumpParticles(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const count = Math.ceil(80 * scale)
    const ps = new ParticleSystem('bump', count, scene)
    ps.particleTexture = getFlareTexture(scene)
    ps.emitter         = this.mesh
    ps.minSize         = 0.10; ps.maxSize         = 0.45
    ps.minLifeTime     = 0.25; ps.maxLifeTime     = 0.55
    ps.emitRate        = 0;    ps.manualEmitCount = count
    ps.color1          = new Color4(1, 0.5, 0, 1)
    ps.color2          = new Color4(1, 0.2, 0.2, 1)
    ps.colorDead       = new Color4(1, 0, 0, 0)
    ps.minEmitPower    = 4;    ps.maxEmitPower    = 9
    ps.gravity         = new Vector3(0, -12, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_ADD
    ps.targetStopDuration = 0.3
    return ps
  }

  private _makeCoinParticles(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const count = Math.ceil(30 * scale)
    const ps = new ParticleSystem('coinFx', count, scene)
    ps.particleTexture = getFlareTexture(scene)
    ps.emitter         = this.mesh
    ps.minSize         = 0.08; ps.maxSize         = 0.22
    ps.minLifeTime     = 0.20; ps.maxLifeTime     = 0.40
    ps.emitRate        = 0;    ps.manualEmitCount = count
    ps.color1          = new Color4(1, 0.95, 0, 1)
    ps.color2          = new Color4(1, 0.8, 0.2, 1)
    ps.colorDead       = new Color4(1, 1, 0, 0)
    ps.minEmitPower    = 2;    ps.maxEmitPower    = 6
    ps.gravity         = new Vector3(0, -8, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_ADD
    ps.targetStopDuration = 0.25
    return ps
  }
}
