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
import type { AudioManager } from '@kids/engine'
import type { GameEngine } from '@kids/engine'
import {
  getBlobShadowTexture, getSoftDiscTexture, getSparkleTexture, getRainbowTexture,
} from '@kids/engine'
import { getQualityProfile } from '@kids/engine'
import { terrainY } from '@kids/engine'
import { characterUrl } from './Characters'

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
 * Height alone isn't enough though: clearing an obstacle means staying
 * above it for the *whole* time the bodies overlap in z, and a car's
 * overlap window is 3.86 units. At the starting speed of 11 that's 0.35 s
 * of hang time needed — so the rise time matters as much as the apex.
 * These two were solved for rather than guessed (see
 * scripts/verify-vertical.mjs).
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

/** Jetpack cruise height: above the tallest obstacle (bus roof 2.24, gantry 3.4). */
export const FLY_HEIGHT  = 4.6

export class Player {
  public mesh: Mesh                // invisible root — position + collision

  private scene: Scene
  private engine: GameEngine
  private character: Character
  private charAnchor: TransformNode
  private characterId = ''
  private charToken = 0

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
  private wasAirborne = false

  private slideTimer  = 0
  private bumpTimer   = 0
  private bufferedJump = 0

  private invincible      = false
  private invincibleTimer = 0
  private starPower       = false
  private flyTimer        = 0
  private boardTimer      = 0
  private audio: AudioManager | null = null

  private blobShadow: Mesh
  private bumpPs: ParticleSystem
  private coinPs: ParticleSystem
  private dustPs: ParticleSystem
  private starPs: ParticleSystem
  private rainbowTrail: Mesh
  private magnetRing: Mesh
  private jetpack: Mesh
  private jetFlame: ParticleSystem
  private board: Mesh
  private fxTime = 0

  constructor(scene: Scene, engine: GameEngine, characterId: string) {
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

    // Load the chosen rig in the background. Loading it synchronously
    // would stall the start screen for no reason — the procedural
    // character is a perfectly good first frame.
    void this.setCharacter(characterId)

    this.blobShadow   = this._makeBlobShadow(scene)
    this.bumpPs       = this._makeBumpParticles(scene)
    this.coinPs       = this._makeCoinParticles(scene)
    this.dustPs       = this._makeDustParticles(scene)
    this.starPs       = this._makeStarParticles(scene)
    this.rainbowTrail = this._makeRainbowTrail(scene)
    this.magnetRing   = this._makeMagnetRing(scene)
    this.jetpack      = this._makeJetpack(scene)
    this.jetFlame     = this._makeJetFlame(scene)
    this.board        = this._makeBoard(scene)
  }

  // ─── Power-ups ─────────────────────────────────────────────────────

  /** Fly above everything for a while; the landing is a normal fall. */
  startJetpack(seconds: number): void {
    this.flyTimer = seconds
    this.state    = 'jumping'
    this.jetpack.setEnabled(true)
    this.jetFlame.start()
  }

  /** A board that soaks up one bump, then breaks. */
  startBoard(seconds: number): void {
    this.boardTimer = seconds
    this.board.setEnabled(true)
    this.charAnchor.position.y = -0.75 + 0.14
  }

  private _endBoard(): void {
    this.boardTimer = 0
    this.board.setEnabled(false)
    this.charAnchor.position.y = -0.75
  }

  get isFlying(): boolean { return this.flyTimer > 0 }
  get hasBoard(): boolean { return this.boardTimer > 0 }
  get jetpackRemaining(): number { return this.flyTimer }
  get boardRemaining(): number { return this.boardTimer }

  /**
   * Swaps the visual to another roster character. The old one stays on
   * screen until the new one has loaded and compiled, and a newer
   * request supersedes an older one still in flight.
   */
  async setCharacter(id: string): Promise<void> {
    if (id === this.characterId) return
    this.characterId = id
    const token = ++this.charToken
    const rig = await CharacterRig.tryLoad(this.scene, this.charAnchor, characterUrl(id))
    if (!rig) return
    if (token !== this.charToken) { rig.dispose(); return }
    this.character.dispose()
    this.character = rig
    this._registerShadowCasters(rig.castingMeshes)
  }

  get currentCharacter(): string { return this.characterId }

  private _registerShadowCasters(meshes: { getTotalVertices(): number }[]): void {
    if (!this.engine.shadowGenerator) return
    for (const m of meshes) {
      this.engine.addShadowCaster(m as Mesh, false)
    }
  }

  /** Soft dark ellipse projected under the player — the landing cue. */
  private _makeBlobShadow(scene: Scene): Mesh {
    const blob = MeshBuilder.CreateGround('blobShadow', { width: 1.1, height: 1.3 }, scene)
    const tex  = getBlobShadowTexture(scene)

    const mat = new StandardMaterial('blobShadowMat', scene)
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

  // ─── Controls ──────────────────────────────────────────────────────────

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
    if (this.flyTimer > 0) return false
    if (this.state === 'jumping' || this.state === 'bumping') return false
    // Jumping is legal from any surface, not just the road — standing on a
    // vehicle rooftop still counts as grounded. What's disallowed is
    // jumping again while genuinely in the air.
    if (this.airborne) return false
    if (this.state === 'sliding') this.slideTimer = 0   // slide cancels into a jump
    this.state = 'jumping'
    this.velY  = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME
    this.audio?.playJump()
    this._puff(10)
    return true
  }

  /** True when the feet are off the current surface. */
  private get airborne(): boolean {
    return this.state === 'jumping' || this.posY > this.groundY + 0.02
  }

  slide(): void {
    if (this.state === 'bumping' || this.flyTimer > 0) return
    if (this.state === 'jumping') {
      // Slam down out of a jump rather than ignoring the input.
      this.velY = Math.min(this.velY, -8)
      return
    }
    this.state      = 'sliding'
    this.slideTimer = SLIDE_DURATION
    this._puff(6)
  }

  // ─── Called by ObstacleManager ─────────────────────────────────────

  /** Returns true when the hit counted (false while invincible). */
  handleCollision(): boolean {
    if (this.isInvincible) return false
    if (this.boardTimer > 0) {
      // The board takes the hit and breaks; a moment of grace so the
      // same obstacle can't land a second one.
      this._endBoard()
      this.invincible      = true
      this.invincibleTimer = 1.0
      this.bumpPs.start()
      this.audio?.playBoardBreak()
      return false
    }
    this.state           = 'bumping'
    this.bumpTimer       = BUMP_DURATION
    this.invincible      = true
    this.invincibleTimer = INVINCIBILITY_TIME
    this.character.flashRed(true)
    this.audio?.playBump()
    this.bumpPs.start()
    return true
  }

  triggerCoinEffect(): void {
    this.coinPs.start()
  }

  /**
   * Star power: a reward for a clean streak. Nothing can bump the player,
   * coins fly in, and a rainbow streams out behind — the most visible
   * thing the game can do, which is the point of a reward.
   */
  setStarPower(on: boolean): void {
    if (this.starPower === on) return
    this.starPower = on
    this.rainbowTrail.setEnabled(on)
    if (on) this.starPs.start(); else this.starPs.stop()
    if (on) this.character.setVisible(true)
  }

  setMagnet(on: boolean): void {
    this.magnetRing.setEnabled(on)
  }

  // ─── Update loop ───────────────────────────────────────────────────

  update(dt: number, runSpeed: number, speedFrac: number): void {
    this.fxTime += dt
    this._tickTimers(dt)

    // Consume a buffered jump the instant it becomes legal.
    if (this.bufferedJump > 0) {
      this.bufferedJump -= dt
      if (this._tryJump()) this.bufferedJump = 0
    }

    if (this.invincible) {
      this.invincibleTimer -= dt
      if (!this.starPower) this.character.setVisible(Math.sin(this.invincibleTimer * 22) > 0)
      if (this.invincibleTimer <= 0) {
        this.invincible = false
        this.character.setVisible(true)
      }
    }

    this._updateLane(dt)
    this._updateVertical(dt)

    this.mesh.position.x  = this.laneX
    this.mesh.position.z += runSpeed * dt
    // Feet on the flat track plane, then the whole thing lifted onto the
    // hill at this z — the same lift the chunks and obstacles got.
    this.mesh.position.y  = 0.75 + this.posY + terrainY(this.mesh.position.z)

    this._updateBlobShadow()
    this._updateFx(dt, speedFrac, runSpeed)

    this.character.update(dt, this.state, {
      speed: runSpeed,
      speedFrac,
      lateralVel: this.lateralVel,
      verticalVel: this.velY,
      // Height above the *current* surface, not above the road.
      height: Math.max(0, this.posY - this.groundY),
    })
  }

  private _tickTimers(dt: number): void {
    if (this.flyTimer > 0) {
      this.flyTimer -= dt
      if (this.flyTimer <= 0) { this.flyTimer = 0; this.jetpack.setEnabled(false); this.jetFlame.stop() }
    }
    if (this.boardTimer > 0) {
      this.boardTimer -= dt
      if (this.boardTimer <= 0) this._endBoard()
    }
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
   * road. Airborne means gravity; grounded means stick to the surface.
   */
  private _updateVertical(dt: number): void {
    if (this.flyTimer > 0) {
      // Rise to cruise height and hold it; gravity resumes when the
      // timer runs out, which reads as a glide down.
      this.posY += (FLY_HEIGHT - this.posY) * Math.min(1, dt * 3.5)
      this.velY  = 0
      this.state = 'jumping'
      this.wasAirborne = true
      return
    }
    const wasAir = this.airborne
    if (wasAir) {
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
    const nowAir = this.airborne
    if (this.wasAirborne && !nowAir) this._puff(14)
    this.wasAirborne = nowAir
  }

  /** Height of the surface under the player, pushed in by ObstacleManager. */
  setGroundY(y: number): void { this.groundY = y }

  private _updateBlobShadow(): void {
    const h = Math.max(0, this.posY - this.groundY)
    this.blobShadow.position.set(this.laneX, this.groundY + 0.02 + terrainY(this.mesh.position.z), this.mesh.position.z)
    const k = Math.max(0.45, 1 - h / (JUMP_HEIGHT * 1.6))
    this.blobShadow.scaling.set(k, 1, k)
    this.blobShadow.visibility = 0.15 + 0.85 * k
  }

  private _updateFx(dt: number, speedFrac: number, runSpeed: number): void {
    // Dust only while the feet are on a surface and actually moving.
    this.dustPs.emitRate = this.airborne || runSpeed <= 0 ? 0 : 14 + speedFrac * 30

    const z = this.mesh.position.z
    const feetY = this.posY + terrainY(z)
    this.rainbowTrail.position.set(this.laneX, this.posY + 0.06 + terrainY(z - 2.4), z - 2.4)
    this.rainbowTrail.scaling.x = 0.9 + Math.sin(this.fxTime * 9) * 0.12

    this.magnetRing.position.set(this.laneX, feetY + 0.9, z)
    this.magnetRing.rotation.y += dt * 2.5
    this.magnetRing.rotation.x = Math.PI / 2 + Math.sin(this.fxTime * 3) * 0.35
    void dt
  }

  private _puff(count: number): void {
    const scale = getQualityProfile().particleScale
    this.dustPs.manualEmitCount = Math.ceil(count * scale)
  }

  get position(): Vector3 { return this.mesh.position }
  get isInvincible(): boolean { return this.invincible || this.starPower || this.flyTimer > 0 }
  get isSliding(): boolean { return this.state === 'sliding' }
  get lateralVelocity(): number { return this.lateralVel }
  get isAirborne(): boolean { return this.airborne }

  /** Vertical extent of the collision body, in world units above the road. */
  get bodyBottom(): number { return this.posY }
  get bodyTop(): number {
    return this.posY + (this.state === 'sliding' ? SLIDE_HEIGHT : STAND_HEIGHT)
  }

  // ─── Particle systems & trail ──────────────────────────────────────────

  private _makeBumpParticles(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const count = Math.ceil(80 * scale)
    const ps = new ParticleSystem('bump', count, scene)
    ps.particleTexture = getSparkleTexture(scene)
    ps.emitter         = this.mesh
    ps.minSize         = 0.15; ps.maxSize         = 0.55
    ps.minLifeTime     = 0.25; ps.maxLifeTime     = 0.55
    ps.emitRate        = 0;    ps.manualEmitCount = count
    ps.color1          = new Color4(1, 0.6, 0.1, 1)
    ps.color2          = new Color4(1, 0.3, 0.3, 1)
    ps.colorDead       = new Color4(1, 0.2, 0, 0)
    ps.minEmitPower    = 4;    ps.maxEmitPower    = 9
    ps.gravity         = new Vector3(0, -12, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_ADD
    ps.targetStopDuration = 0.3
    return ps
  }

  private _makeCoinParticles(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const count = Math.ceil(24 * scale)
    const ps = new ParticleSystem('coinFx', count, scene)
    ps.particleTexture = getSparkleTexture(scene)
    ps.emitter         = this.mesh
    ps.minEmitBox      = new Vector3(-0.3, 0.2, -0.3)
    ps.maxEmitBox      = new Vector3( 0.3, 0.9,  0.3)
    ps.minSize         = 0.12; ps.maxSize         = 0.34
    ps.minLifeTime     = 0.20; ps.maxLifeTime     = 0.45
    ps.emitRate        = 0;    ps.manualEmitCount = count
    ps.color1          = new Color4(1, 0.95, 0.3, 1)
    ps.color2          = new Color4(1, 0.8, 0.2, 1)
    ps.colorDead       = new Color4(1, 1, 0.6, 0)
    ps.minEmitPower    = 2;    ps.maxEmitPower    = 6
    ps.gravity         = new Vector3(0, -6, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_ADD
    ps.targetStopDuration = 0.25
    return ps
  }

  /** Little dust kicks at the heels — cheap, and it grounds the runner. */
  private _makeDustParticles(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const ps = new ParticleSystem('dust', Math.ceil(120 * scale), scene)
    ps.particleTexture = getSoftDiscTexture(scene)
    ps.emitter         = this.mesh
    ps.minEmitBox      = new Vector3(-0.25, -0.75, -0.3)
    ps.maxEmitBox      = new Vector3( 0.25, -0.65,  0.1)
    ps.minSize         = 0.18; ps.maxSize = 0.45
    ps.minLifeTime     = 0.30; ps.maxLifeTime = 0.6
    ps.emitRate        = 20
    ps.color1          = new Color4(1, 1, 1, 0.55)
    ps.color2          = new Color4(0.95, 0.92, 0.85, 0.4)
    ps.colorDead       = new Color4(1, 1, 1, 0)
    ps.direction1      = new Vector3(-0.6, 0.6, -2.5)
    ps.direction2      = new Vector3( 0.6, 1.6, -4.0)
    ps.minEmitPower    = 0.6; ps.maxEmitPower = 1.4
    ps.gravity         = new Vector3(0, -1.5, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_STANDARD
    ps.start()
    return ps
  }

  private _makeStarParticles(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const ps = new ParticleSystem('starFx', Math.ceil(160 * scale), scene)
    ps.particleTexture = getSparkleTexture(scene)
    ps.emitter         = this.mesh
    ps.minEmitBox      = new Vector3(-0.5, -0.6, -0.4)
    ps.maxEmitBox      = new Vector3( 0.5,  0.9,  0.4)
    ps.minSize         = 0.15; ps.maxSize = 0.45
    ps.minLifeTime     = 0.35; ps.maxLifeTime = 0.8
    ps.emitRate        = 55 * scale
    ps.color1          = new Color4(1, 0.4, 0.9, 1)
    ps.color2          = new Color4(0.4, 0.9, 1, 1)
    ps.colorDead       = new Color4(1, 1, 0.5, 0)
    ps.direction1      = new Vector3(-1.5, 0.5, -4)
    ps.direction2      = new Vector3( 1.5, 2.5, -6)
    ps.minEmitPower    = 0.8; ps.maxEmitPower = 1.8
    ps.gravity         = new Vector3(0, -2, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_ADD
    return ps
  }

  private _makeRainbowTrail(scene: Scene): Mesh {
    const trail = MeshBuilder.CreatePlane('rainbowTrail', { width: 1.1, height: 4.4 }, scene)
    trail.rotation.x = Math.PI / 2
    const mat = new StandardMaterial('rainbowMat', scene)
    mat.disableLighting = true
    mat.emissiveColor   = Color3.White()
    mat.diffuseTexture  = getRainbowTexture(scene)
    ;(mat.diffuseTexture as import('@babylonjs/core').Texture).wAng = Math.PI / 2
    mat.alpha           = 0.78
    mat.backFaceCulling = false
    trail.material   = mat
    trail.isPickable = false
    trail.setEnabled(false)
    return trail
  }

  /** Two tanks on the back with red caps. Hidden until a jetpack pickup. */
  private _makeJetpack(scene: Scene): Mesh {
    const root = new Mesh('jetpack', scene)
    root.parent = this.charAnchor
    root.position.set(0, 0.95, -0.34)
    const tank = new StandardMaterial('jetTank', scene)
    tank.diffuseColor = new Color3(0.75, 0.78, 0.82); tank.specularColor = new Color3(0.3, 0.3, 0.3)
    const cap = new StandardMaterial('jetCap', scene)
    cap.diffuseColor = new Color3(0.95, 0.25, 0.20); cap.specularColor = Color3.Black()
    for (const sx of [-0.16, 0.16]) {
      const t = MeshBuilder.CreateCylinder('tank', { diameter: 0.22, height: 0.55, tessellation: 10 }, scene)
      t.position.set(sx, 0, 0); t.material = tank; t.parent = root
      const c = MeshBuilder.CreateCylinder('cap', { diameterTop: 0.08, diameterBottom: 0.22, height: 0.14, tessellation: 10 }, scene)
      c.position.set(sx, 0.34, 0); c.material = cap; c.parent = root
      const n = MeshBuilder.CreateCylinder('nozzle', { diameterTop: 0.20, diameterBottom: 0.12, height: 0.12, tessellation: 10 }, scene)
      n.position.set(sx, -0.33, 0); n.material = cap; n.parent = root
    }
    const strap = MeshBuilder.CreateBox('strap', { width: 0.5, height: 0.08, depth: 0.1 }, scene)
    strap.position.set(0, 0.1, 0.12); strap.material = cap; strap.parent = root
    root.setEnabled(false)
    return root
  }

  private _makeJetFlame(scene: Scene): ParticleSystem {
    const scale = getQualityProfile().particleScale
    const ps = new ParticleSystem('jetFlame', Math.ceil(120 * scale), scene)
    ps.particleTexture = getSoftDiscTexture(scene)
    ps.emitter         = this.jetpack
    ps.minEmitBox      = new Vector3(-0.2, -0.4, -0.05)
    ps.maxEmitBox      = new Vector3( 0.2, -0.35, 0.05)
    ps.minSize = 0.18; ps.maxSize = 0.4
    ps.minLifeTime = 0.15; ps.maxLifeTime = 0.3
    ps.emitRate    = 90 * scale
    ps.color1      = new Color4(1, 0.85, 0.3, 1)
    ps.color2      = new Color4(1, 0.4, 0.1, 1)
    ps.colorDead   = new Color4(0.6, 0.6, 0.6, 0)
    ps.direction1  = new Vector3(-0.3, -3, -1.5)
    ps.direction2  = new Vector3( 0.3, -4, -2.5)
    ps.minEmitPower = 1; ps.maxEmitPower = 2
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    return ps
  }

  /** A hoverboard under the feet: pink deck, cyan glow stripe. */
  private _makeBoard(scene: Scene): Mesh {
    const deck = MeshBuilder.CreateBox('board', { width: 0.9, height: 0.08, depth: 1.7 }, scene)
    deck.parent = this.charAnchor
    deck.position.set(0, -0.08, 0.05)
    const mat = new StandardMaterial('boardMat', scene)
    mat.diffuseColor = new Color3(0.98, 0.35, 0.65); mat.specularColor = new Color3(0.2, 0.2, 0.2)
    deck.material = mat
    const stripe = MeshBuilder.CreateBox('boardStripe', { width: 0.94, height: 0.03, depth: 1.0 }, scene)
    const glow = new StandardMaterial('boardGlow', scene)
    glow.disableLighting = true; glow.emissiveColor = new Color3(0.4, 0.95, 1.0)
    stripe.material = glow; stripe.parent = deck; stripe.position.y = -0.045
    deck.isPickable = false
    deck.setEnabled(false)
    return deck
  }

  private _makeMagnetRing(scene: Scene): Mesh {
    const ring = MeshBuilder.CreateTorus('magnetRing', { diameter: 1.7, thickness: 0.07, tessellation: 24 }, scene)
    const mat = new StandardMaterial('magnetRingMat', scene)
    mat.disableLighting = true
    mat.emissiveColor   = new Color3(0.45, 0.85, 1.0)
    mat.alpha           = 0.85
    ring.material   = mat
    ring.isPickable = false
    ring.setEnabled(false)
    return ring
  }
}
