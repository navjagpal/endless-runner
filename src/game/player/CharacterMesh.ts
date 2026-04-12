import {
  Scene,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Color3,
  Vector3,
  TransformNode,
} from '@babylonjs/core'

export type CharacterState = 'running' | 'jumping' | 'sliding' | 'bumping'

function pbr(scene: Scene, color: Color3, metallic = 0, roughness = 0.75): PBRMaterial {
  const m = new PBRMaterial('', scene)
  m.albedoColor = color
  m.metallic = metallic
  m.roughness = roughness
  return m
}

export class CharacterMesh {
  public root: TransformNode

  private _leftLegPivot!: TransformNode
  private _rightLegPivot!: TransformNode
  private _leftArmPivot!: TransformNode
  private _rightArmPivot!: TransformNode
  private _bodyNode: TransformNode
  private _headNode: TransformNode
  private _bodyMat: PBRMaterial
  private _time = 0

  constructor(scene: Scene, parent: Mesh) {
    this.root = new TransformNode('charViz', scene)
    this.root.parent = parent

    const skinMat  = pbr(scene, new Color3(1.00, 0.80, 0.62))
    this._bodyMat  = pbr(scene, new Color3(1.00, 0.38, 0.10))
    const pantsMat = pbr(scene, new Color3(0.08, 0.25, 0.82))
    const shoeMat  = pbr(scene, new Color3(0.92, 0.92, 0.92))
    const eyeMat   = pbr(scene, new Color3(0.05, 0.05, 0.10))
    const cheekMat = pbr(scene, new Color3(1.00, 0.60, 0.55))

    // ── BODY ────────────────────────────────────────────────────
    this._bodyNode = new TransformNode('bodyNode', scene)
    this._bodyNode.parent = this.root
    this._bodyNode.position.y = 0.72

    const body = MeshBuilder.CreateCapsule('body', { radius: 0.22, height: 0.50, tessellation: 10 }, scene)
    body.parent = this._bodyNode
    body.material = this._bodyMat

    // ── HEAD ─────────────────────────────────────────────────────
    this._headNode = new TransformNode('headNode', scene)
    this._headNode.parent = this.root
    this._headNode.position.y = 1.30

    const head = MeshBuilder.CreateSphere('head', { diameter: 0.52, segments: 10 }, scene)
    head.parent = this._headNode
    head.material = skinMat

    // Eyes
    for (const side of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.10 }, scene)
      eye.parent = this._headNode
      eye.position = new Vector3(side * 0.12, 0.06, 0.22)
      eye.material = eyeMat

      const pupil = MeshBuilder.CreateSphere('pupil', { diameter: 0.055 }, scene)
      pupil.parent = this._headNode
      pupil.position = new Vector3(side * 0.12, 0.06, 0.245)
      pupil.material = pbr(scene, new Color3(1, 1, 1))

      const cheek = MeshBuilder.CreateSphere('cheek', { diameter: 0.09 }, scene)
      cheek.parent = this._headNode
      cheek.position = new Vector3(side * 0.19, -0.05, 0.20)
      cheek.material = cheekMat
    }

    // Smile (3 small spheres arc)
    for (let i = -1; i <= 1; i++) {
      const dot = MeshBuilder.CreateSphere('smileDot', { diameter: 0.04 }, scene)
      dot.parent = this._headNode
      dot.position = new Vector3(i * 0.07, -0.11 + Math.abs(i) * 0.03, 0.25)
      dot.material = pbr(scene, new Color3(0.6, 0.1, 0.1))
    }

    // ── ARMS ─────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      const pivot = new TransformNode('armPivot', scene)
      pivot.parent = this._bodyNode
      pivot.position = new Vector3(side * 0.31, 0.18, 0)

      const arm = MeshBuilder.CreateCapsule('arm', { radius: 0.085, height: 0.40, tessellation: 7 }, scene)
      arm.parent = pivot
      arm.position.y = -0.20
      arm.material = this._bodyMat

      const hand = MeshBuilder.CreateSphere('hand', { diameter: 0.14 }, scene)
      hand.parent = pivot
      hand.position.y = -0.42
      hand.material = skinMat

      if (side === -1) this._leftArmPivot = pivot
      else this._rightArmPivot = pivot
    }

    // ── LEGS ─────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      const pivot = new TransformNode('legPivot', scene)
      pivot.parent = this.root
      pivot.position = new Vector3(side * 0.14, 0.50, 0)

      const leg = MeshBuilder.CreateCapsule('leg', { radius: 0.10, height: 0.50, tessellation: 7 }, scene)
      leg.parent = pivot
      leg.position.y = -0.25
      leg.material = pantsMat

      const shoe = MeshBuilder.CreateBox('shoe', { width: 0.22, height: 0.10, depth: 0.30 }, scene)
      shoe.parent = pivot
      shoe.position = new Vector3(0, -0.56, 0.04)
      shoe.material = shoeMat

      if (side === -1) this._leftLegPivot = pivot
      else this._rightLegPivot = pivot
    }
  }

  update(dt: number, state: CharacterState): void {
    if (state === 'running' || state === 'bumping') {
      this._time += dt
      const t = this._time * 9.5
      const swing = 0.75
      this._leftLegPivot.rotation.x  =  Math.sin(t) * swing
      this._rightLegPivot.rotation.x = -Math.sin(t) * swing
      this._leftArmPivot.rotation.x  = -Math.sin(t) * 0.55
      this._rightArmPivot.rotation.x =  Math.sin(t) * 0.55
      const bob = Math.abs(Math.sin(t * 2)) * 0.03
      this._bodyNode.position.y = 0.72 + bob
      this._headNode.position.y = 1.30 + bob
    } else if (state === 'jumping') {
      this._leftLegPivot.rotation.x  = -0.65
      this._rightLegPivot.rotation.x = -0.65
      this._leftArmPivot.rotation.x  = -1.0
      this._rightArmPivot.rotation.x = -1.0
    } else if (state === 'sliding') {
      this._leftLegPivot.rotation.x  = 0.5
      this._rightLegPivot.rotation.x = 0.5
      this._leftArmPivot.rotation.x  = 0.7
      this._rightArmPivot.rotation.x = 0.7
    }
  }

  flashRed(active: boolean): void {
    this._bodyMat.albedoColor = active
      ? new Color3(1, 0.2, 0.2)
      : new Color3(1.0, 0.38, 0.10)
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v)
  }
}
