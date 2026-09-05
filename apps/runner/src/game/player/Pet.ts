import {
  Scene,
  Mesh,
  MeshBuilder,
  TransformNode,
  PBRMaterial,
  Color3,
  Vector3,
} from '@babylonjs/core'
import { terrainY } from '@kids/engine'

/**
 * A pet that runs at the player's heel.
 *
 * Built from boxes in the same flat-colour style as the kits (Kenney's
 * animal pack is 2D only). Three kinds; each is a small hierarchy of
 * parts so the ears, tail and legs can animate. It bounds along in a
 * low hop, keeps to the road-centre side of the player so it never
 * leaves the tarmac, follows jumps with a little lag, and collects any
 * coin it touches — the payoff for owning one.
 */

export type PetKind = 'none' | 'puppy' | 'kitten' | 'bunny'

interface Parts {
  body: Mesh
  head: TransformNode
  tail: TransformNode
  legs: TransformNode[]
  ears: TransformNode[]
}

export class Pet {
  readonly root: TransformNode
  private scene: Scene
  private kind: PetKind = 'none'
  private parts: Parts | null = null
  private time = 0
  private x = 0
  private y = 0
  private z = 0

  constructor(scene: Scene) {
    this.scene = scene
    this.root  = new TransformNode('pet', scene)
    this.root.setEnabled(false)
  }

  get currentKind(): PetKind { return this.kind }
  get active(): boolean { return this.kind !== 'none' }
  /** World position of the pet's chest, for coin pickup. */
  get position(): Vector3 { return this.root.position }

  setKind(kind: PetKind): void {
    if (kind === this.kind) return
    this.kind = kind
    for (const c of this.root.getChildren()) c.dispose()
    this.parts = null
    this.root.setEnabled(kind !== 'none')
    if (kind !== 'none') this.parts = this._build(kind)
  }

  private _mat(c: Color3): PBRMaterial {
    const m = new PBRMaterial('pet', this.scene)
    m.albedoColor = c; m.metallic = 0; m.roughness = 0.9
    return m
  }

  private _build(kind: PetKind): Parts {
    const palette = {
      puppy:  { fur: new Color3(0.78, 0.52, 0.28), light: new Color3(0.95, 0.85, 0.70), nose: new Color3(0.12, 0.10, 0.10) },
      kitten: { fur: new Color3(0.55, 0.56, 0.62), light: new Color3(0.92, 0.92, 0.95), nose: new Color3(0.95, 0.55, 0.60) },
      bunny:  { fur: new Color3(0.96, 0.95, 0.94), light: new Color3(1.00, 0.80, 0.85), nose: new Color3(0.95, 0.55, 0.60) },
    }[kind as Exclude<PetKind, 'none'>]
    const fur = this._mat(palette.fur), light = this._mat(palette.light), nose = this._mat(palette.nose)
    const eye = this._mat(new Color3(0.08, 0.08, 0.1))

    const body = MeshBuilder.CreateBox('petBody', { width: 0.36, height: 0.30, depth: 0.52 }, this.scene)
    body.material = fur; body.parent = this.root; body.position.y = 0.30
    const belly = MeshBuilder.CreateBox('petBelly', { width: 0.30, height: 0.12, depth: 0.40 }, this.scene)
    belly.material = light; belly.parent = body; belly.position.y = -0.11

    const head = new TransformNode('petHead', this.scene)
    head.parent = body; head.position.set(0, 0.22, 0.30)
    const skull = MeshBuilder.CreateBox('petSkull', { width: 0.36, height: 0.32, depth: 0.32 }, this.scene)
    skull.material = fur; skull.parent = head
    const muzzle = MeshBuilder.CreateBox('petMuzzle', { width: 0.2, height: 0.14, depth: 0.14 }, this.scene)
    muzzle.material = light; muzzle.parent = head; muzzle.position.set(0, -0.06, 0.2)
    const snout = MeshBuilder.CreateBox('petNose', { width: 0.08, height: 0.06, depth: 0.06 }, this.scene)
    snout.material = nose; snout.parent = head; snout.position.set(0, -0.02, 0.28)
    for (const ex of [-0.1, 0.1]) {
      const e = MeshBuilder.CreateBox('petEye', { width: 0.06, height: 0.07, depth: 0.03 }, this.scene)
      e.material = eye; e.parent = head; e.position.set(ex, 0.05, 0.17)
    }

    const ears: TransformNode[] = []
    for (const ex of [-0.12, 0.12]) {
      const pivot = new TransformNode('petEar', this.scene)
      pivot.parent = head; pivot.position.set(ex, 0.14, -0.02)
      const dims = kind === 'bunny' ? { width: 0.09, height: 0.36, depth: 0.05 }
                 : kind === 'kitten' ? { width: 0.11, height: 0.13, depth: 0.05 }
                 : { width: 0.11, height: 0.20, depth: 0.06 }
      const ear = MeshBuilder.CreateBox('petEarMesh', dims, this.scene)
      ear.material = kind === 'puppy' ? light : fur
      ear.parent = pivot
      ear.position.y = kind === 'puppy' ? -0.06 : dims.height / 2
      if (kind === 'puppy') pivot.rotation.z = ex > 0 ? -0.5 : 0.5
      ears.push(pivot)
    }

    const tail = new TransformNode('petTail', this.scene)
    tail.parent = body; tail.position.set(0, 0.08, -0.26)
    const tailMesh = MeshBuilder.CreateBox('petTailMesh', kind === 'bunny'
      ? { width: 0.12, height: 0.12, depth: 0.12 } : { width: 0.07, height: 0.07, depth: 0.26 }, this.scene)
    tailMesh.material = kind === 'bunny' ? light : fur
    tailMesh.parent = tail
    tailMesh.position.z = kind === 'bunny' ? -0.04 : -0.12
    tail.rotation.x = -0.6

    const legs: TransformNode[] = []
    for (const [lx, lz] of [[-0.12, 0.17], [0.12, 0.17], [-0.12, -0.17], [0.12, -0.17]]) {
      const pivot = new TransformNode('petLeg', this.scene)
      pivot.parent = body; pivot.position.set(lx, -0.15, lz)
      const leg = MeshBuilder.CreateBox('petLegMesh', { width: 0.09, height: 0.16, depth: 0.09 }, this.scene)
      leg.material = fur; leg.parent = pivot; leg.position.y = -0.08
      legs.push(pivot)
    }

    for (const m of this.root.getChildMeshes()) { m.isPickable = false }
    return { body, head, tail, legs, ears }
  }

  /**
   * @param playerX     player lane position
   * @param playerZ     player z
   * @param playerFeetY player feet height above the flat track (posY)
   * @param speed       run speed, drives the hop cadence
   */
  update(dt: number, playerX: number, playerZ: number, playerFeetY: number, speed: number): void {
    if (!this.parts) return
    this.time += dt
    // Stay on the road-centre side of the runner, half a step behind.
    const side = playerX > 0.1 ? -1 : 1
    const tx = playerX + side * 1.15
    const tz = playerZ - 0.55
    const k = Math.min(1, dt * 7)
    this.x += (tx - this.x) * k
    this.z = tz
    // Follow jumps with lag; hop when on the ground.
    const hopRate = 8 + speed * 0.35
    const hop = speed > 0 ? Math.abs(Math.sin(this.time * hopRate)) * 0.22 : 0
    this.y += (playerFeetY * 0.85 - this.y) * Math.min(1, dt * 6)
    this.root.position.set(this.x, this.y + hop + terrainY(this.z), this.z)
    this.root.rotation.z = (tx - this.x) * -0.6
    this.root.rotation.x = -hop * 0.8

    const p = this.parts
    const swing = Math.sin(this.time * hopRate)
    p.legs[0].rotation.x = swing * 0.7; p.legs[3].rotation.x = swing * 0.7
    p.legs[1].rotation.x = -swing * 0.7; p.legs[2].rotation.x = -swing * 0.7
    p.tail.rotation.y = Math.sin(this.time * 14) * 0.5
    p.head.rotation.x = Math.sin(this.time * hopRate) * 0.08 - 0.05
    for (let i = 0; i < p.ears.length; i++) {
      p.ears[i].rotation.x = Math.sin(this.time * hopRate + i) * (this.kind === 'bunny' ? 0.25 : 0.15)
    }
  }
}
