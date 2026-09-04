import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Color3,
  Color4,
  Vector3,
  ParticleSystem,
  Constants,
} from '@babylonjs/core'
import { getQualityProfile } from '../core/DeviceTier'

/**
 * Ambient life — the small motion that stops the world reading as a
 * diorama. Flocks of birds cross the sky, butterflies flutter along the
 * meadow verge, petals and leaves drift down around the runner. All of
 * it is decorative: nothing here is collidable or collectable.
 *
 * Everything is a handful of billboards or one particle system, and each
 * effect is gated by zone so the beach doesn't get autumn leaves.
 */

const BIRD_COUNT      = 5
const BUTTERFLY_COUNT = 8

interface Bird { mesh: Mesh; offset: Vector3; phase: number }
interface Butterfly { mesh: Mesh; homeX: number; y: number; z: number; phase: number; speed: number }

export class Ambient {
  private scene: Scene
  private zone = 'meadow'
  private time = 0

  private birds: Bird[] = []
  private flockActive = false
  private flockPos = new Vector3()
  private flockVel = new Vector3()
  private flockTimer = 6

  private butterflies: Butterfly[] = []
  private petals: ParticleSystem
  private petalEmitter: Mesh

  constructor(scene: Scene) {
    this.scene = scene
    this._buildBirds()
    this._buildButterflies()
    this.petalEmitter = new Mesh('petalEmitter', scene)
    this.petals = this._buildPetals()
    this.setZone('meadow')
  }

  setZone(zoneId: string): void {
    this.zone = zoneId
    const meadow = zoneId === 'meadow'
    for (const b of this.butterflies) b.mesh.setEnabled(meadow)

    // Petal colour per zone; off where nothing would fall.
    const p = this.petals
    if (zoneId === 'meadow') {
      p.color1 = new Color4(1.0, 0.65, 0.80, 1); p.color2 = new Color4(1.0, 0.85, 0.90, 1)
      p.colorDead = new Color4(1, 0.7, 0.8, 0); p.start()
    } else if (zoneId === 'forest') {
      p.color1 = new Color4(0.95, 0.55, 0.15, 1); p.color2 = new Color4(0.60, 0.80, 0.25, 1)
      p.colorDead = new Color4(0.9, 0.5, 0.1, 0); p.start()
    } else if (zoneId === 'space') {
      p.color1 = new Color4(0.60, 0.90, 1.0, 1); p.color2 = new Color4(1.0, 0.60, 1.0, 1)
      p.colorDead = new Color4(0.8, 0.8, 1, 0); p.start()
    } else {
      p.stop()
    }
  }

  update(playerPos: Vector3, dt: number): void {
    this.time += dt
    this.petalEmitter.position.copyFrom(playerPos)
    this._updateBirds(playerPos, dt)
    if (this.zone === 'meadow') this._updateButterflies(playerPos, dt)
  }

  // ─── Birds ─────────────────────────────────────────────────────────────────

  private _buildBirds(): void {
    const tex = new DynamicTexture('birdTex', { width: 64, height: 32 }, this.scene, false)
    const ctx = tex.getContext() as CanvasRenderingContext2D
    ctx.clearRect(0, 0, 64, 32)
    ctx.strokeStyle = 'rgba(30,30,45,0.95)'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(4, 22); ctx.quadraticCurveTo(18, 4, 32, 18)
    ctx.quadraticCurveTo(46, 4, 60, 22)
    ctx.stroke()
    tex.update(false)
    tex.hasAlpha = true

    const mat = new StandardMaterial('birdMat', this.scene)
    mat.disableLighting = true
    mat.emissiveColor   = Color3.White()
    mat.diffuseTexture  = tex
    mat.useAlphaFromDiffuseTexture = true
    mat.backFaceCulling = false
    mat.alphaMode = Constants.ALPHA_COMBINE

    for (let i = 0; i < BIRD_COUNT; i++) {
      const mesh = MeshBuilder.CreatePlane(`bird${i}`, { width: 1.6, height: 0.8 }, this.scene)
      mesh.material      = mat
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL
      mesh.isPickable    = false
      mesh.setEnabled(false)
      const k = i - (BIRD_COUNT - 1) / 2
      // V formation: trailing and spreading out from the leader.
      this.birds.push({ mesh, offset: new Vector3(k * 1.8, -Math.abs(k) * 0.4, -Math.abs(k) * 2.2), phase: i * 0.7 })
    }
  }

  private _updateBirds(playerPos: Vector3, dt: number): void {
    if (!this.flockActive) {
      if (this.zone === 'space') return
      this.flockTimer -= dt
      if (this.flockTimer > 0) return
      // Launch a flock from one side, crossing ahead of the player.
      const side = Math.random() > 0.5 ? 1 : -1
      this.flockPos.set(side * 55, 16 + Math.random() * 10, playerPos.z + 50 + Math.random() * 50)
      this.flockVel.set(-side * (7 + Math.random() * 4), 0, 5 + Math.random() * 4)
      this.flockActive = true
      for (const b of this.birds) b.mesh.setEnabled(true)
      return
    }

    this.flockPos.addInPlace(this.flockVel.scale(dt))
    for (const b of this.birds) {
      const flap = 0.35 + Math.abs(Math.sin(this.time * 13 + b.phase)) * 0.65
      b.mesh.position.set(
        this.flockPos.x + b.offset.x + Math.sin(this.time * 2 + b.phase) * 0.3,
        this.flockPos.y + b.offset.y + Math.sin(this.time * 1.5 + b.phase) * 0.5,
        this.flockPos.z + b.offset.z,
      )
      b.mesh.scaling.y = flap
    }

    if (Math.abs(this.flockPos.x) > 70 || this.flockPos.z < playerPos.z - 10) {
      this.flockActive = false
      this.flockTimer  = 9 + Math.random() * 10
      for (const b of this.birds) b.mesh.setEnabled(false)
    }
  }

  // ─── Butterflies ───────────────────────────────────────────────────────────

  private _buildButterflies(): void {
    const colors = ['#ff7eb6', '#ffd23f', '#7ec8ff', '#c084fc']
    const mats = colors.map((c, i) => {
      const tex = new DynamicTexture(`bfTex${i}`, { width: 32, height: 32 }, this.scene, false)
      const ctx = tex.getContext() as CanvasRenderingContext2D
      ctx.clearRect(0, 0, 32, 32)
      ctx.fillStyle = c
      for (const [cx, cy, rx, ry] of [[10, 12, 9, 10], [22, 12, 9, 10], [11, 22, 6, 7], [21, 22, 6, 7]]) {
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#332'
      ctx.fillRect(15, 6, 2, 22)
      tex.update(false)
      tex.hasAlpha = true
      const mat = new StandardMaterial(`bfMat${i}`, this.scene)
      mat.disableLighting = true
      mat.emissiveColor   = Color3.White()
      mat.diffuseTexture  = tex
      mat.useAlphaFromDiffuseTexture = true
      mat.backFaceCulling = false
      mat.alphaMode = Constants.ALPHA_COMBINE
      return mat
    })

    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const mesh = MeshBuilder.CreatePlane(`butterfly${i}`, { width: 0.42, height: 0.42 }, this.scene)
      mesh.material   = mats[i % mats.length]
      mesh.rotation.x = Math.PI / 2 - 0.5     // seen mostly from above
      mesh.isPickable = false
      this.butterflies.push({
        mesh,
        homeX: (i % 2 === 0 ? 1 : -1) * (5.5 + Math.random() * 4),
        y: 0.8 + Math.random() * 1.4,
        z: 0,
        phase: Math.random() * 10,
        speed: 0.8 + Math.random() * 0.6,
      })
    }
  }

  private _updateButterflies(playerPos: Vector3, dt: number): void {
    for (const b of this.butterflies) {
      if (b.z === 0 || b.z < playerPos.z - 4) {
        b.z = playerPos.z + 8 + Math.random() * 35
        b.homeX = (Math.random() > 0.5 ? 1 : -1) * (5.5 + Math.random() * 4)
      }
      // Slow drift back toward the player, so they're passed rather than static.
      b.z -= b.speed * dt
      const t = this.time * b.speed + b.phase
      b.mesh.position.set(
        b.homeX + Math.sin(t * 1.7) * 0.8,
        b.y + Math.sin(t * 2.3) * 0.3 + Math.abs(Math.sin(t * 9)) * 0.08,
        b.z + Math.cos(t * 1.1) * 0.6,
      )
      b.mesh.scaling.x = 0.3 + Math.abs(Math.sin(t * 9)) * 0.7
    }
  }

  // ─── Petals / leaves / sparkles ───────────────────────────────────────────

  private _buildPetals(): ParticleSystem {
    const tex = new DynamicTexture('petalTex', { width: 32, height: 32 }, this.scene, false)
    const ctx = tex.getContext() as CanvasRenderingContext2D
    ctx.clearRect(0, 0, 32, 32)
    ctx.fillStyle = 'rgba(255,255,255,1)'
    ctx.beginPath(); ctx.ellipse(16, 16, 12, 7, 0.6, 0, Math.PI * 2); ctx.fill()
    tex.update(false)
    tex.hasAlpha = true

    const scale = getQualityProfile().particleScale
    const ps = new ParticleSystem('petals', Math.ceil(160 * scale), this.scene)
    ps.particleTexture = tex as Texture
    ps.emitter         = this.petalEmitter
    ps.minEmitBox      = new Vector3(-11, 6, -4)
    ps.maxEmitBox      = new Vector3( 11, 9, 30)
    ps.minSize         = 0.10; ps.maxSize = 0.22
    ps.minLifeTime     = 3.5;  ps.maxLifeTime = 6
    ps.emitRate        = 14 * scale
    ps.direction1      = new Vector3(-0.6, -0.4, -0.4)
    ps.direction2      = new Vector3( 0.6, -0.2,  0.4)
    ps.minEmitPower    = 0.6;  ps.maxEmitPower = 1.2
    ps.minAngularSpeed = -2;   ps.maxAngularSpeed = 2
    ps.gravity         = new Vector3(0, -0.9, 0)
    ps.blendMode       = ParticleSystem.BLENDMODE_STANDARD
    return ps
  }
}
