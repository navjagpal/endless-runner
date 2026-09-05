import {
  Scene,
  MeshBuilder,
  PBRMaterial,
  Color3,
  Vector3,
  TransformNode,
  Mesh,
} from '@babylonjs/core'
import type { Character, CharacterContext, CharacterState } from './Character'

/**
 * Procedural character — the fallback used until a GLB is dropped at
 * `public/models/runner.glb`.
 *
 * The previous version was a capsule, a sphere, four capsules and two
 * boxes, with all four limbs driven by a single `Math.sin(t)`. That
 * reads as a mannequin because a real run cycle isn't four pendulums:
 * the knees and elbows bend, the pelvis and chest counter-rotate
 * against each other, the head holds steady while the body bobs, and
 * the whole figure leans into turns.
 *
 * This version builds a two-segment limb hierarchy and drives it with
 * those relationships. It's still primitives — but primitives moving
 * correctly read far better than a detailed mesh moving wrongly, and
 * this is the cheaper half of that trade.
 *
 * Proportions are deliberately stylized: a head roughly a quarter of
 * total height. Realistic proportions (1:7.5) look gaunt at this scale
 * and on a small tablet screen; the big-head silhouette is what makes
 * kids' runners readable at speed.
 */

const RUN_CADENCE = 9.5    // rad/sec of the primary leg pendulum

function pbr(scene: Scene, color: Color3, roughness = 0.85): PBRMaterial {
  const m = new PBRMaterial('', scene)
  m.albedoColor = color
  m.metallic    = 0
  m.roughness   = roughness
  // Flat-shaded stylized look: kill the specular highlight that makes
  // untextured PBR primitives read as wet plastic.
  m.environmentIntensity = 0.35
  return m
}

interface Limb {
  upper: TransformNode   // shoulder / hip
  lower: TransformNode   // elbow / knee
}

export class CharacterMesh implements Character {
  public root: TransformNode
  public readonly height = 1.5

  /** Whole-body tilt: roll into lane changes, pitch with speed. */
  private tilt: TransformNode
  private pelvis: TransformNode
  private chest: TransformNode
  private headNode: TransformNode

  private arms: { left: Limb; right: Limb }
  private legs: { left: Limb; right: Limb }

  private bodyMat: PBRMaterial
  private baseBodyColor: Color3

  private time = 0
  private landSquash = 0
  private wasAirborne = false
  private allMeshes: Mesh[] = []

  constructor(scene: Scene, parent: TransformNode) {
    this.root = new TransformNode('charViz', scene)
    this.root.parent = parent

    this.tilt = new TransformNode('charTilt', scene)
    this.tilt.parent = this.root

    const skin   = pbr(scene, new Color3(1.00, 0.78, 0.60))
    const shirt  = pbr(scene, new Color3(1.00, 0.35, 0.12))
    const pants  = pbr(scene, new Color3(0.10, 0.32, 0.85))
    const shoe   = pbr(scene, new Color3(1.00, 0.98, 0.96), 0.6)
    const hair   = pbr(scene, new Color3(0.24, 0.13, 0.07))
    const eye    = pbr(scene, new Color3(0.06, 0.05, 0.10))
    const white  = pbr(scene, new Color3(1, 1, 1), 0.5)
    const cheek  = pbr(scene, new Color3(1.00, 0.55, 0.50))
    const mouth  = pbr(scene, new Color3(0.55, 0.10, 0.12))

    this.bodyMat       = shirt
    this.baseBodyColor = shirt.albedoColor.clone()

    // ── Pelvis: the root of the run cycle. Counter-rotates against the
    //    chest, which is most of what sells a run as a run.
    this.pelvis = new TransformNode('pelvis', scene)
    this.pelvis.parent = this.tilt
    this.pelvis.position.y = 0.62

    this.chest = new TransformNode('chest', scene)
    this.chest.parent = this.pelvis
    this.chest.position.y = 0.20

    const torso = this._mesh(MeshBuilder.CreateCapsule('torso',
      { radius: 0.20, height: 0.46, tessellation: 12 }, scene))
    torso.parent   = this.chest
    torso.material = shirt
    torso.position.y = 0.02

    // Hips — slightly wider than the torso, reads as shorts
    const hips = this._mesh(MeshBuilder.CreateCapsule('hips',
      { radius: 0.19, height: 0.20, tessellation: 12 }, scene))
    hips.parent   = this.pelvis
    hips.material = pants

    // ── Head ────────────────────────────────────────────────────────
    this.headNode = new TransformNode('headNode', scene)
    this.headNode.parent = this.chest
    this.headNode.position.y = 0.42

    const head = this._mesh(MeshBuilder.CreateSphere('head',
      { diameter: 0.50, segments: 14 }, scene))
    head.parent   = this.headNode
    head.material = skin
    head.scaling.set(1, 1.05, 0.95)

    // Hair cap — a scaled hemisphere sitting slightly back on the skull
    const hairCap = this._mesh(MeshBuilder.CreateSphere('hair',
      { diameter: 0.53, segments: 14, slice: 0.58 }, scene))
    hairCap.parent   = this.headNode
    hairCap.material = hair
    hairCap.position.set(0, 0.02, -0.02)
    hairCap.scaling.set(1, 1.0, 1.02)

    for (const side of [-1, 1]) {
      const sclera = this._mesh(MeshBuilder.CreateSphere('eyeW', { diameter: 0.115, segments: 10 }, scene))
      sclera.parent   = this.headNode
      sclera.position = new Vector3(side * 0.105, 0.04, 0.205)
      sclera.material = white
      sclera.scaling.set(1, 1.15, 0.6)

      const pupil = this._mesh(MeshBuilder.CreateSphere('pupil', { diameter: 0.062, segments: 8 }, scene))
      pupil.parent   = this.headNode
      pupil.position = new Vector3(side * 0.108, 0.035, 0.238)
      pupil.material = eye

      const blush = this._mesh(MeshBuilder.CreateSphere('cheek', { diameter: 0.10, segments: 8 }, scene))
      blush.parent   = this.headNode
      blush.position = new Vector3(side * 0.185, -0.05, 0.165)
      blush.material = cheek
      blush.scaling.set(1, 0.7, 0.4)

      const ear = this._mesh(MeshBuilder.CreateSphere('ear', { diameter: 0.11, segments: 8 }, scene))
      ear.parent   = this.headNode
      ear.position = new Vector3(side * 0.245, -0.01, 0)
      ear.material = skin
      ear.scaling.set(0.5, 1, 0.9)
    }

    // Open smile — a flattened sphere, so it reads as delight rather
    // than the three-dot arc the old version used.
    const smile = this._mesh(MeshBuilder.CreateSphere('smile', { diameter: 0.13, segments: 10 }, scene))
    smile.parent   = this.headNode
    smile.material = mouth
    smile.position = new Vector3(0, -0.115, 0.215)
    smile.scaling.set(1.05, 0.55, 0.35)

    // ── Limbs ────────────────────────────────────────────────────────
    this.arms = {
      left:  this._buildArm(scene, -1, shirt, skin),
      right: this._buildArm(scene,  1, shirt, skin),
    }
    this.legs = {
      left:  this._buildLeg(scene, -1, pants, shoe),
      right: this._buildLeg(scene,  1, pants, shoe),
    }
  }

  private _mesh(m: Mesh): Mesh {
    m.isPickable = false
    // Every part is a rigid child of a pivot and never deforms, so
    // Babylon can skip the per-frame world-matrix recompute chain.
    m.alwaysSelectAsActiveMesh = true
    this.allMeshes.push(m)
    return m
  }

  private _buildArm(scene: Scene, side: number, sleeveMat: PBRMaterial, skinMat: PBRMaterial): Limb {
    const shoulder = new TransformNode('shoulder', scene)
    shoulder.parent = this.chest
    shoulder.position = new Vector3(side * 0.255, 0.16, 0)

    const upperArm = this._mesh(MeshBuilder.CreateCapsule('upperArm',
      { radius: 0.075, height: 0.26, tessellation: 8 }, scene))
    upperArm.parent   = shoulder
    upperArm.position.y = -0.13
    upperArm.material = sleeveMat

    const elbow = new TransformNode('elbow', scene)
    elbow.parent = shoulder
    elbow.position.y = -0.26

    const forearm = this._mesh(MeshBuilder.CreateCapsule('forearm',
      { radius: 0.065, height: 0.24, tessellation: 8 }, scene))
    forearm.parent   = elbow
    forearm.position.y = -0.12
    forearm.material = skinMat

    const hand = this._mesh(MeshBuilder.CreateSphere('hand', { diameter: 0.135, segments: 8 }, scene))
    hand.parent   = elbow
    hand.position.y = -0.26
    hand.material = skinMat
    hand.scaling.set(1, 1.1, 0.8)

    return { upper: shoulder, lower: elbow }
  }

  private _buildLeg(scene: Scene, side: number, pantsMat: PBRMaterial, shoeMat: PBRMaterial): Limb {
    const hip = new TransformNode('hip', scene)
    hip.parent = this.pelvis
    hip.position = new Vector3(side * 0.115, -0.10, 0)

    const thigh = this._mesh(MeshBuilder.CreateCapsule('thigh',
      { radius: 0.095, height: 0.28, tessellation: 8 }, scene))
    thigh.parent   = hip
    thigh.position.y = -0.14
    thigh.material = pantsMat

    const knee = new TransformNode('knee', scene)
    knee.parent = hip
    knee.position.y = -0.28

    const shin = this._mesh(MeshBuilder.CreateCapsule('shin',
      { radius: 0.078, height: 0.26, tessellation: 8 }, scene))
    shin.parent   = knee
    shin.position.y = -0.13
    shin.material = pantsMat

    const foot = this._mesh(MeshBuilder.CreateBox('shoe',
      { width: 0.155, height: 0.095, depth: 0.28 }, scene))
    foot.parent   = knee
    foot.position = new Vector3(0, -0.28, 0.055)
    foot.material = shoeMat

    return { upper: hip, lower: knee }
  }

  // ─── Animation ─────────────────────────────────────────────────────

  update(dt: number, state: CharacterState, ctx: CharacterContext): void {
    // Cadence tracks speed, so the legs don't windmill at the same rate
    // whether jogging or sprinting.
    const cadence = RUN_CADENCE * (0.75 + ctx.speedFrac * 0.5)

    if (state === 'running' || state === 'bumping') {
      this.time += dt * cadence
      this._poseRun(this.time)
    } else if (state === 'jumping') {
      this.time += dt * cadence * 0.35   // slow pedal in the air
      this._poseJump(ctx)
    } else if (state === 'sliding') {
      this._poseSlide()
    }

    this._applyBodyTilt(dt, state, ctx)
    this._applyLandingSquash(dt, ctx)
  }

  /**
   * The run cycle. Legs are the primary pendulum; everything else is
   * phase-shifted off it.
   */
  private _poseRun(t: number): void {
    const s = Math.sin(t)
    const c = Math.cos(t)

    // Thighs swing in opposition.
    this.legs.left.upper.rotation.x  =  s * 0.85
    this.legs.right.upper.rotation.x = -s * 0.85

    // Knees only bend one way, and bend most as the leg swings through
    // behind the body. Hence the rectified, phase-shifted cosine —
    // a plain sine would hyperextend the knee backwards.
    this.legs.left.lower.rotation.x  = -Math.max(0,  c) * 1.5 - 0.12
    this.legs.right.lower.rotation.x = -Math.max(0, -c) * 1.5 - 0.12

    // Arms oppose the legs on the same side.
    this.arms.left.upper.rotation.x  = -s * 0.70
    this.arms.right.upper.rotation.x =  s * 0.70
    // Elbows hold a runner's bend, tightening on the forward swing.
    this.arms.left.lower.rotation.x  = -1.05 - Math.max(0, -s) * 0.45
    this.arms.right.lower.rotation.x = -1.05 - Math.max(0,  s) * 0.45
    // Slight inward tuck so the arms track across the chest, not out
    // to the sides like a marching toy.
    this.arms.left.upper.rotation.z  =  0.18
    this.arms.right.upper.rotation.z = -0.18

    // Counter-rotation: pelvis follows the legs, chest opposes it.
    this.pelvis.rotation.y = s * 0.13
    this.chest.rotation.y  = -s * 0.22
    this.chest.rotation.z  = c * 0.05

    // Vertical bob peaks twice per stride, at each foot plant.
    const bob = Math.abs(Math.sin(t)) * 0.055
    this.pelvis.position.y = 0.62 + bob

    // The head largely cancels the bob — real runners stabilize their
    // gaze, and a head that bobs with the hips looks like a bobblehead.
    this.headNode.position.y = 0.42 - bob * 0.55
    this.headNode.rotation.y = -this.chest.rotation.y * 0.6
  }

  private _poseJump(ctx: CharacterContext): void {
    const rising = ctx.verticalVel > 0
    const t = 0.25

    // Tuck the knees on the way up, reach for the ground on the way down.
    const thigh = rising ? -1.05 : -0.35
    const knee  = rising ? -1.35 : -0.45

    this.legs.left.upper.rotation.x  += (thigh - this.legs.left.upper.rotation.x) * t
    this.legs.right.upper.rotation.x += (thigh * 0.75 - this.legs.right.upper.rotation.x) * t
    this.legs.left.lower.rotation.x  += (knee - this.legs.left.lower.rotation.x) * t
    this.legs.right.lower.rotation.x += (knee * 0.8 - this.legs.right.lower.rotation.x) * t

    // Arms up and out for the launch, settling as they fall.
    const arm = rising ? -1.5 : -0.9
    this.arms.left.upper.rotation.x  += (arm - this.arms.left.upper.rotation.x) * t
    this.arms.right.upper.rotation.x += (arm - this.arms.right.upper.rotation.x) * t
    this.arms.left.lower.rotation.x  += (-0.5 - this.arms.left.lower.rotation.x) * t
    this.arms.right.lower.rotation.x += (-0.5 - this.arms.right.lower.rotation.x) * t

    this.pelvis.rotation.y = 0
    this.chest.rotation.y  = 0
    this.chest.rotation.z  = 0
    this.pelvis.position.y = 0.62
    this.headNode.position.y = 0.42
  }

  private _poseSlide(): void {
    const t = 0.3
    // Legs forward, torso back — a baseball slide, not a crouch.
    this.legs.left.upper.rotation.x  += (-1.25 - this.legs.left.upper.rotation.x) * t
    this.legs.right.upper.rotation.x += (-0.95 - this.legs.right.upper.rotation.x) * t
    this.legs.left.lower.rotation.x  += (-0.25 - this.legs.left.lower.rotation.x) * t
    this.legs.right.lower.rotation.x += (-0.85 - this.legs.right.lower.rotation.x) * t

    this.arms.left.upper.rotation.x  += (0.85 - this.arms.left.upper.rotation.x) * t
    this.arms.right.upper.rotation.x += (0.60 - this.arms.right.upper.rotation.x) * t
    this.arms.left.lower.rotation.x  += (-0.35 - this.arms.left.lower.rotation.x) * t
    this.arms.right.lower.rotation.x += (-0.35 - this.arms.right.lower.rotation.x) * t

    this.chest.rotation.y  = 0
    this.pelvis.rotation.y = 0
  }

  /**
   * Roll into lane changes and pitch forward with speed. This is a
   * disproportionate amount of the "feels good" budget for how little
   * code it is — a body that banks into a turn reads as intent, where
   * one that slides sideways flat reads as a sprite being dragged.
   */
  private _applyBodyTilt(dt: number, state: CharacterState, ctx: CharacterContext): void {
    const t = Math.min(1, dt * 10)

    const roll  = -ctx.lateralVel * 0.075
    let   pitch = ctx.speedFrac * 0.13

    if (state === 'sliding') pitch = -0.55        // lean back into the slide
    else if (state === 'bumping') pitch = -0.25   // rock back off the impact

    const r = this.tilt.rotation
    r.z += (Math.max(-0.5, Math.min(0.5, roll)) - r.z) * t
    r.x += (pitch - r.x) * t
    // Steer the whole figure slightly toward the lane it's moving to.
    r.y += (Math.max(-0.45, Math.min(0.45, ctx.lateralVel * 0.06)) - r.y) * t
  }

  /**
   * Squash on touchdown, easing back out. Anticipation and follow-
   * through are what make a landing feel weighted rather than
   * teleported.
   */
  private _applyLandingSquash(dt: number, ctx: CharacterContext): void {
    const airborne = ctx.height > 0.05
    if (this.wasAirborne && !airborne) this.landSquash = 1
    this.wasAirborne = airborne

    if (this.landSquash > 0) {
      this.landSquash = Math.max(0, this.landSquash - dt * 4.5)
      const k = this.landSquash * this.landSquash
      this.tilt.scaling.set(1 + k * 0.18, 1 - k * 0.22, 1 + k * 0.18)
    } else if (this.tilt.scaling.y !== 1) {
      this.tilt.scaling.set(1, 1, 1)
    }
  }

  flashRed(active: boolean): void {
    this.bodyMat.albedoColor = active
      ? new Color3(1, 0.2, 0.2)
      : this.baseBodyColor
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v)
  }

  /** Meshes to register as shadow casters. */
  get castingMeshes(): Mesh[] {
    return this.allMeshes
  }

  dispose(): void {
    for (const m of this.allMeshes) m.dispose()
    this.root.dispose()
  }
}
