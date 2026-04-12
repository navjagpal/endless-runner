import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  ParticleSystem,
  Texture,
  Color4,
} from '@babylonjs/core'
import { LANE_POSITIONS } from '../track/TrackChunk'
import { CharacterMesh, type CharacterState } from './CharacterMesh'
import type { AudioManager } from '../audio/AudioManager'

const JUMP_HEIGHT        = 3.2
const JUMP_DURATION      = 0.55
const LANE_SWITCH_SPEED  = 0.18   // seconds to cross a lane
const BUMP_DURATION_MS   = 380
const INVINCIBILITY_TIME = 1.6

export class Player {
  public mesh: Mesh                // invisible root — used for position/collision

  private charMesh: CharacterMesh

  private state: CharacterState = 'running'
  private targetLane = 1
  private laneX: number

  private posY   = 0
  private velY   = 0

  private invincible      = false
  private invincibleTimer = 0
  private audio: AudioManager | null = null

  private bumpPs: ParticleSystem
  private coinPs: ParticleSystem

  constructor(scene: Scene) {
    this.laneX  = LANE_POSITIONS[1]

    // Invisible collision root (thin box standing on ground)
    this.mesh = MeshBuilder.CreateBox('playerRoot', { width: 0.75, height: 1.50, depth: 0.75 }, scene)
    this.mesh.position = new Vector3(this.laneX, 0.75, 0)
    this.mesh.isVisible   = false
    this.mesh.isPickable  = false

    // Visible character — positioned so feet sit at y=0 relative to root bottom
    this.charMesh = new CharacterMesh(scene, this.mesh)
    this.charMesh.root.position.y = -0.75   // shift so feet land at ground level

    this.bumpPs = this._makeBumpParticles(scene)
    this.coinPs = this._makeCoinParticles(scene)
  }

  setAudio(audio: AudioManager): void { this.audio = audio }

  // ─── Controls ──────────────────────────────────────────────────────────────

  moveLeft(): void {
    if (this.state === 'bumping') return
    if (this.targetLane > 0) this.targetLane--
  }

  moveRight(): void {
    if (this.state === 'bumping') return
    if (this.targetLane < 2) this.targetLane++
  }

  jump(): void {
    if (this.state !== 'running') return
    this.state = 'jumping'
    this.velY  = (2 * JUMP_HEIGHT) / JUMP_DURATION
    this.audio?.playJump()
  }

  slide(): void {
    if (this.state !== 'running') return
    this.state = 'sliding'
    setTimeout(() => { if (this.state === 'sliding') this.state = 'running' }, 500)
  }

  // ─── Called by ObstacleManager ─────────────────────────────────────────────

  handleCollision(): void {
    if (this.invincible) return
    this.state          = 'bumping'
    this.invincible     = true
    this.invincibleTimer = INVINCIBILITY_TIME
    this.charMesh.flashRed(true)
    this.audio?.playBump()
    this.bumpPs.start()
    setTimeout(() => {
      this.charMesh.flashRed(false)
      if (this.state === 'bumping') this.state = 'running'
    }, BUMP_DURATION_MS)
  }

  // Called by ObstacleManager when a coin is collected
  triggerCoinEffect(): void {
    this.coinPs.start()
    this.audio?.playCoin()
  }

  // ─── Update loop ───────────────────────────────────────────────────────────

  update(dt: number, runSpeed: number): void {
    // Invincibility flicker
    if (this.invincible) {
      this.invincibleTimer -= dt
      this.charMesh.setVisible(Math.sin(this.invincibleTimer * 22) > 0)
      if (this.invincibleTimer <= 0) {
        this.invincible = false
        this.charMesh.setVisible(true)
      }
    }

    // Lane interpolation
    const targetX = LANE_POSITIONS[this.targetLane]
    const lerpT   = Math.min(1, dt / LANE_SWITCH_SPEED)
    this.laneX   += (targetX - this.laneX) * lerpT
    if (Math.abs(this.laneX - targetX) < 0.01) {
      this.laneX = targetX
    }

    // Jump physics
    if (this.state === 'jumping') {
      const g  = (2 * JUMP_HEIGHT) / (JUMP_DURATION * JUMP_DURATION)
      this.velY -= g * dt
      this.posY += this.velY * dt
      if (this.posY <= 0) {
        this.posY  = 0
        this.velY  = 0
        this.state = 'running'
      }
    } else {
      this.posY = 0
    }

    // Root position (y=0.75 keeps box centre at mid-height above ground)
    this.mesh.position.x  = this.laneX
    this.mesh.position.y  = 0.75 + this.posY
    this.mesh.position.z += runSpeed * dt

    // Scale for slide
    const slideScale = this.state === 'sliding' ? 0.55 : 1.0
    const curScaleY  = this.mesh.scaling.y
    this.mesh.scaling.y = curScaleY + (slideScale - curScaleY) * Math.min(1, dt * 14)

    // Animate character
    this.charMesh.update(dt, this.state)
  }

  get position(): Vector3 { return this.mesh.position }
  get isInvincible(): boolean { return this.invincible }

  // ─── Particle systems ──────────────────────────────────────────────────────

  private _makeBumpParticles(scene: Scene): ParticleSystem {
    const ps = new ParticleSystem('bump', 80, scene)
    ps.particleTexture = new Texture('https://assets.babylonjs.com/particles/flare.png', scene)
    ps.emitter         = this.mesh
    ps.minSize         = 0.10; ps.maxSize         = 0.45
    ps.minLifeTime     = 0.25; ps.maxLifeTime     = 0.55
    ps.emitRate        = 0;    ps.manualEmitCount = 80
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
    const ps = new ParticleSystem('coinFx', 30, scene)
    ps.particleTexture = new Texture('https://assets.babylonjs.com/particles/flare.png', scene)
    ps.emitter         = this.mesh
    ps.minSize         = 0.08; ps.maxSize         = 0.22
    ps.minLifeTime     = 0.20; ps.maxLifeTime     = 0.40
    ps.emitRate        = 0;    ps.manualEmitCount = 30
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
