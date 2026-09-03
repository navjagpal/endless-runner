import {
  Scene,
  Mesh,
  MeshBuilder,
  TransformNode,
  StandardMaterial,
  PBRMaterial,
  Material,
  Color3,
  Vector3,
  Vector4,
} from '@babylonjs/core'
import { styleChunk } from '../track/ChunkStyling'
import { getBuildingTextures } from '../fx/Textures'
import { getQualityProfile } from '../core/DeviceTier'
import { Kits } from '../assets/Kits'

/**
 * Distant scenery — the painted-backdrop layer.
 *
 * Subway-Surfers-class runners always have something big on the horizon:
 * a skyline, hills, mountains. It's what stops the world ending at the
 * edge of the verge. These are large, cheap, flat-shaded shapes that ride
 * along with the player (so they read as a static backdrop, the way a
 * far-off mountain doesn't visibly move when you run) and sit deep in
 * the fog so they take on the sky's colour.
 *
 * One set per zone, built lazily, swapped with a rise/sink animation
 * rather than an alpha fade — no transparency sorting, and the motion
 * itself is a small event for a kid to notice.
 */

const SWAP_SECS  = 3.2
const SINK_DEPTH = 90

interface ZoneSet {
  node:     TransformNode
  animated: { mesh: Mesh; baseY: number; phase: number; rate: number }[]
  spinners: { node: TransformNode; rate: number }[]
}

export class Backdrop {
  private scene: Scene
  private root:  TransformNode
  private sets = new Map<string, ZoneSet>()
  private current:  ZoneSet | null = null
  private outgoing: ZoneSet | null = null
  private swapT = 1
  private time  = 0

  constructor(scene: Scene) {
    this.scene = scene
    this.root  = new TransformNode('backdropRoot', scene)
  }

  show(zoneId: string): void {
    const next = this._set(zoneId)
    if (next === this.current) return
    if (this.outgoing) this.outgoing.node.setEnabled(false)
    this.outgoing = this.current
    this.current  = next
    this.swapT    = this.current && this.outgoing ? 0 : 1
    next.node.setEnabled(true)
    if (this.swapT >= 1) next.node.position.y = 0
  }

  update(playerZ: number, dt: number): void {
    this.time += dt
    this.root.position.z = playerZ

    if (this.swapT < 1) {
      this.swapT = Math.min(1, this.swapT + dt / SWAP_SECS)
      const e = this.swapT < 0.5 ? 2 * this.swapT * this.swapT : 1 - Math.pow(-2 * this.swapT + 2, 2) / 2
      if (this.current)  this.current.node.position.y  = -SINK_DEPTH * (1 - e)
      if (this.outgoing) {
        this.outgoing.node.position.y = -SINK_DEPTH * e
        if (this.swapT >= 1) { this.outgoing.node.setEnabled(false); this.outgoing = null }
      }
    }

    if (this.current) {
      for (const a of this.current.animated) {
        a.mesh.position.y = a.baseY + Math.sin(this.time * a.rate + a.phase) * 1.4
      }
      for (const sp of this.current.spinners) sp.node.rotation.z += sp.rate * dt
    }
  }

  // ─── Construction ──────────────────────────────────────────────────────────

  private _set(zoneId: string): ZoneSet {
    let s = this.sets.get(zoneId)
    if (s) return s
    const node = new TransformNode(`backdrop_${zoneId}`, this.scene)
    node.parent = this.root
    node.setEnabled(false)
    const statics = new Mesh(`backdropStatic_${zoneId}`, this.scene)
    statics.parent = node
    const animated: ZoneSet['animated'] = []
    const spinners: ZoneSet['spinners'] = []
    const plain = new Set<Material>()

    switch (zoneId) {
      case 'forest': this._buildForest(statics); break
      case 'city':   this._buildCity(statics, plain); break
      case 'beach':  this._buildBeach(statics, node, animated, plain); break
      case 'space':  this._buildSpace(statics, node, animated, plain); break
      default:       this._buildMeadow(statics, node, animated, spinners); break
    }

    styleChunk(statics, {
      plainMaterials: plain,
      preShadedMaterials: Kits.materials,
      flatShade: getQualityProfile().flatShade,
      gradient: { bottom: 0.72, top: 1.10 },
    })
    s = { node, animated, spinners }
    this.sets.set(zoneId, s)
    return s
  }

  private _mat(color: Color3): StandardMaterial {
    const m = new StandardMaterial('', this.scene)
    m.diffuseColor  = color
    m.specularColor = Color3.Black()
    return m
  }

  private _hill(parent: Mesh, x: number, z: number, w: number, h: number, mat: Material): void {
    const s = MeshBuilder.CreateSphere('hill', { diameter: 1, segments: 7 }, this.scene)
    s.scaling  = new Vector3(w, h * 2, w * (0.7 + Math.random() * 0.5))
    s.position = new Vector3(x, -h * 0.15, z)
    s.material = mat
    s.parent   = parent
  }

  // Meadow: two rows of round green hills, hot-air balloons overhead.
  private _buildMeadow(statics: Mesh, node: TransformNode, animated: ZoneSet['animated'], spinners: ZoneSet['spinners']): void {
    const near = this._mat(new Color3(0.40, 0.78, 0.30))
    const far  = this._mat(new Color3(0.52, 0.82, 0.48))
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const z = -30 + i * 42 + Math.random() * 12
        this._hill(statics, side * (72 + Math.random() * 24), z, 44 + Math.random() * 22, 6 + Math.random() * 4, near)
        this._hill(statics, side * (120 + Math.random() * 30), z + 18, 70 + Math.random() * 30, 12 + Math.random() * 7, far)
      }
    }
    this._balloons(node, animated, 4)
    this._windmill(statics, node, spinners, 1)
    this._windmill(statics, node, spinners, -1)
  }

  /** A turning windmill on the hillside — the one thing a kid always points at. */
  private _windmill(statics: Mesh, node: TransformNode, spinners: ZoneSet['spinners'], side: number): void {
    const x = side * 62, z = side > 0 ? 95 : 150
    const wall = this._mat(new Color3(0.96, 0.94, 0.86))
    const roof = this._mat(new Color3(0.80, 0.30, 0.25))
    const wood = this._mat(new Color3(0.55, 0.38, 0.22))
    const tower = MeshBuilder.CreateCylinder('mill', { height: 15, diameterBottom: 5.5, diameterTop: 3.6, tessellation: 8 }, this.scene)
    tower.position = new Vector3(x, 7.5 - 0.5, z); tower.material = wall; tower.parent = statics
    const cap = MeshBuilder.CreateCylinder('millRoof', { height: 3.2, diameterBottom: 4.4, diameterTop: 0.6, tessellation: 8 }, this.scene)
    cap.position = new Vector3(x, 15.6, z); cap.material = roof; cap.parent = statics

    // Hub faces the road, blades in its local x/y plane spinning about z.
    const hub = new TransformNode('millHub', this.scene)
    hub.parent = node
    hub.position = new Vector3(x - side * 2.4, 13.2, z - 1.2)
    hub.rotation.y = -side * Math.PI * 0.42
    for (let i = 0; i < 4; i++) {
      const blade = MeshBuilder.CreateBox('blade', { width: 1.4, height: 7.5, depth: 0.25 }, this.scene)
      blade.position = new Vector3(0, 3.6, 0)
      blade.material = wood
      const arm = new TransformNode('arm', this.scene)
      arm.parent = hub
      arm.rotation.z = i * Math.PI / 2
      blade.parent = arm
    }
    spinners.push({ node: hub, rate: 0.7 })
  }

  // Forest: snow-capped mountains behind a band of dark pine hills.
  private _buildForest(statics: Mesh): void {
    const rock = this._mat(new Color3(0.38, 0.46, 0.62))
    const snow = this._mat(new Color3(0.96, 0.98, 1.00))
    const pine = this._mat(new Color3(0.14, 0.42, 0.22))
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = -20 + i * 52 + Math.random() * 14
        const x = side * (95 + Math.random() * 40)
        const h = 55 + Math.random() * 45
        const d = 60 + Math.random() * 30
        const m = MeshBuilder.CreateCylinder('mtn', { height: h, diameterTop: 0, diameterBottom: d, tessellation: 6 }, this.scene)
        m.position = new Vector3(x, h / 2 - 4, z)
        m.rotation.y = Math.random() * Math.PI
        m.material = rock; m.parent = statics
        const capH = h * 0.30
        const cap = MeshBuilder.CreateCylinder('snow', { height: capH, diameterTop: 0, diameterBottom: d * 0.31, tessellation: 6 }, this.scene)
        cap.position = new Vector3(x, h - capH / 2 - 3.9, z)
        cap.rotation.y = m.rotation.y
        cap.material = snow; cap.parent = statics
        this._hill(statics, side * (52 + Math.random() * 16), z - 10, 40 + Math.random() * 20, 8 + Math.random() * 5, pine)
      }
    }
  }

  // City: a textured skyline with lit windows.
  private _buildCity(statics: Mesh, plain: Set<Material>): void {
    if (Kits.isLoaded('city')) {
      const towers = ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c',
        'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f']
      const wide = ['low-detail-building-wide-a', 'low-detail-building-wide-b']
      for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
          const z = -30 + i * 25 + Math.random() * 8
          const tall = Math.random() < 0.6
          const model = tall ? towers[Math.floor(Math.random() * towers.length)] : wide[Math.floor(Math.random() * wide.length)]
          const scale = tall ? 11 + Math.random() * 9 : 13 + Math.random() * 6
          Kits.place(statics, model, side * (46 + Math.random() * 60), -1, z, scale, Math.random() < 0.5 ? 0 : Math.PI / 2)
        }
      }
      return
    }
    const { albedo, emissive } = getBuildingTextures(this.scene)
    const tones = [
      new Color3(0.78, 0.82, 0.90), new Color3(0.90, 0.80, 0.72),
      new Color3(0.70, 0.78, 0.86), new Color3(0.85, 0.85, 0.80),
    ]
    const mats = tones.map(c => {
      const m = new PBRMaterial('skyline', this.scene)
      m.albedoColor = c; m.albedoTexture = albedo
      m.emissiveTexture = emissive; m.emissiveColor = new Color3(0.9, 0.8, 0.55)
      m.metallic = 0; m.roughness = 0.9
      return m
    })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const z = -30 + i * 27 + Math.random() * 8
        const w = 14 + Math.random() * 12, d = 12 + Math.random() * 10
        const h = 24 + Math.random() * 46
        const x = side * (48 + Math.random() * 60)
        this._building(statics, x, z, w, h, d, mats[Math.floor(Math.random() * mats.length)])
      }
    }
    // Sun is low in the city zone, so the textured facades stay 'plain'
    // (no vertex gradient) — the windows do the work.
    for (const m of mats) plain.add(m)
  }

  private _building(parent: Mesh, x: number, z: number, w: number, h: number, d: number, mat: Material): void {
    // One texture repeat per 3 m window bay; top/bottom faces get a single
    // flat texel so the roof reads as a plain slab.
    const bay = 3
    const faceUV = [
      new Vector4(0, 0, w / bay, h / bay), new Vector4(0, 0, w / bay, h / bay),
      new Vector4(0, 0, d / bay, h / bay), new Vector4(0, 0, d / bay, h / bay),
      new Vector4(0, 0, 0.02, 0.02),       new Vector4(0, 0, 0.02, 0.02),
    ]
    const b = MeshBuilder.CreateBox('bld', { width: w, height: h, depth: d, faceUV }, this.scene)
    b.position = new Vector3(x, h / 2 - 1, z)
    b.material = mat; b.parent = parent
  }

  // Beach: ocean to the horizon on both sides, islands, balloons.
  private _buildBeach(statics: Mesh, node: TransformNode, animated: ZoneSet['animated'], plain: Set<Material>): void {
    const water = new PBRMaterial('ocean', this.scene)
    water.albedoColor = new Color3(0.16, 0.60, 0.92)
    water.metallic = 0.05; water.roughness = 0.25
    plain.add(water)
    for (const side of [-1, 1]) {
      const sea = MeshBuilder.CreateGround('sea', { width: 400, height: 520 }, this.scene)
      sea.position = new Vector3(side * 232, -0.30, 80)
      sea.material = water; sea.parent = statics
    }
    const sand   = this._mat(new Color3(0.98, 0.90, 0.66))
    const island = this._mat(new Color3(0.35, 0.72, 0.36))
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = 10 + i * 70 + Math.random() * 20
        const x = side * (120 + Math.random() * 60)
        this._hill(statics, x, z, 40 + Math.random() * 20, 2.5, sand)
        this._hill(statics, x, z, 22 + Math.random() * 14, 7 + Math.random() * 5, island)
      }
    }
    this._balloons(node, animated, 3)
  }

  // Space: planets and a starfield. The sky dome handles the nebula colour.
  private _buildSpace(statics: Mesh, node: TransformNode, animated: ZoneSet['animated'], plain: Set<Material>): void {
    const planetCols = [
      new Color3(1.00, 0.55, 0.30), new Color3(0.45, 0.85, 1.00),
      new Color3(0.85, 0.50, 1.00), new Color3(0.60, 1.00, 0.60),
    ]
    for (let i = 0; i < 4; i++) {
      const mat = new StandardMaterial('planet', this.scene)
      mat.diffuseColor  = planetCols[i]
      mat.emissiveColor = planetCols[i].scale(0.35)
      mat.specularColor = Color3.Black()
      const side = i % 2 === 0 ? -1 : 1
      const dia  = 14 + Math.random() * 16
      const p = MeshBuilder.CreateSphere('planet', { diameter: dia, segments: 10 }, this.scene)
      p.position = new Vector3(side * (70 + Math.random() * 60), 34 + Math.random() * 30, 30 + i * 45)
      p.material = mat; p.parent = node
      animated.push({ mesh: p, baseY: p.position.y, phase: i * 1.7, rate: 0.5 + Math.random() * 0.4 })
      if (i === 0 || i === 2) {
        const ring = MeshBuilder.CreateTorus('ring', { diameter: dia * 1.9, thickness: dia * 0.12, tessellation: 24 }, this.scene)
        ring.rotation.x = 1.2; ring.rotation.z = 0.3
        ring.material = mat; ring.parent = p
      }
    }
    const star = new StandardMaterial('star', this.scene)
    star.emissiveColor = new Color3(1, 1, 0.9); star.disableLighting = true
    plain.add(star)
    for (let i = 0; i < 70; i++) {
      const s = MeshBuilder.CreateBox('s', { size: 0.6 + Math.random() * 0.7 }, this.scene)
      s.position = new Vector3((Math.random() - 0.5) * 260, 12 + Math.random() * 90, -40 + Math.random() * 240)
      s.material = star; s.parent = statics
    }
  }

  private _balloons(node: TransformNode, animated: ZoneSet['animated'], count: number): void {
    const cols = [new Color3(1, 0.30, 0.35), new Color3(1, 0.80, 0.15), new Color3(0.30, 0.65, 1), new Color3(0.60, 0.35, 0.95)]
    const basket = this._mat(new Color3(0.55, 0.35, 0.15))
    for (let i = 0; i < count; i++) {
      const mat = this._mat(cols[i % cols.length])
      const side = i % 2 === 0 ? -1 : 1
      const env = MeshBuilder.CreateSphere('balloon', { diameter: 8, segments: 8 }, this.scene)
      env.scaling.y = 1.2
      env.position = new Vector3(side * (48 + Math.random() * 34), 30 + Math.random() * 16, 40 + i * 45 + Math.random() * 20)
      env.material = mat; env.parent = node
      const b = MeshBuilder.CreateBox('basket', { width: 2, height: 1.6, depth: 2 }, this.scene)
      b.position = new Vector3(0, -6.2, 0)
      b.material = basket; b.parent = env
      animated.push({ mesh: env, baseY: env.position.y, phase: i * 2.1, rate: 0.7 + Math.random() * 0.4 })
    }
  }
}
