import {
  Scene,
  TransformNode,
  Mesh,
  Material,
  PBRMaterial,
  Color3,
  Vector3,
  Quaternion,
  LoadAssetContainerAsync,
} from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'

/**
 * Model kits — the CC0 Kenney assets built by scripts/build-kits.mjs.
 *
 * Each kit is one GLB whose root children are named models ("sedan",
 * "tree_oak", …). The kit is loaded once, left disabled, and every
 * placement clones its meshes under a chunk or obstacle root, where
 * styleChunk merges them by material exactly as it merges primitives.
 * A chunk full of Kenney trees therefore costs the same handful of draw
 * calls as a chunk full of cones did.
 *
 * Everything degrades: if a kit fails to load (offline before the first
 * cache, a bad build), `has()` is false and the callers fall back to the
 * procedural primitives they always had.
 */

export type KitName = 'vehicles' | 'nature' | 'city' | 'trains'

interface Template {
  meshes: Mesh[]
  min: Vector3
  max: Vector3
}

/** "glTF" as a little-endian uint32 — the first four bytes of every GLB. */
const GLB_MAGIC = 0x46546c67

let _loader: Promise<unknown> | null = null

/**
 * Kit colours re-keyed to the game's palette. Kenney's foliage is a
 * minty teal that reads as a different world from the grass texture the
 * verge is tinted with; the game's greens win.
 */
/** Materials whose vertices sway in the wind (leaves, not trunks). */
const SWAY = new Set(['leafsGreen', 'leafsDark'])

const PALETTE: Record<string, Color3> = {
  leafsGreen: new Color3(0.30, 0.74, 0.26),
  leafsDark:  new Color3(0.17, 0.56, 0.22),
  grass:      new Color3(0.36, 0.80, 0.28),
}

export class Kits {
  private static templates = new Map<string, Template>()
  private static mats = new Set<Material>()
  private static loaded = new Set<KitName>()

  /** Materials owned by kit models — already flat-shaded, skip re-splitting. */
  static get materials(): Set<Material> { return Kits.mats }

  static isLoaded(kit: KitName): boolean { return Kits.loaded.has(kit) }
  static has(model: string): boolean { return Kits.templates.has(model) }

  /** Unscaled size of a model, or null when it isn't loaded. */
  static size(model: string): Vector3 | null {
    const t = Kits.templates.get(model)
    return t ? t.max.subtract(t.min) : null
  }

  static async load(scene: Scene, kits: KitName[]): Promise<void> {
    await Promise.all(kits.map(k => Kits._loadOne(scene, k)))
  }

  private static async _loadOne(scene: Scene, kit: KitName): Promise<void> {
    try {
      const url = `${import.meta.env.BASE_URL}models/kits/${kit}.glb`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} for ${url}`)
      const buffer = await res.arrayBuffer()
      if (buffer.byteLength < 4 || new DataView(buffer).getUint32(0, true) !== GLB_MAGIC) {
        throw new Error('not a GLB (server likely served HTML)')
      }

      if (!_loader) _loader = import('@babylonjs/loaders/glTF')
      await _loader

      const container = await LoadAssetContainerAsync(new File([buffer], `${kit}.glb`), scene)
      container.addAllToScene()

      // Kit materials arrive as glTF PBR — some flagged unlit, some with
      // metallic defaults that go black without an environment map. Make
      // them all plain lit, matte surfaces so they take the zone lighting
      // like everything else on the track.
      for (const m of container.materials) {
        if (m instanceof PBRMaterial && SWAY.has(m.name)) {
          // Foliage gets a vertex-shader wind: a slow sway that grows
          // with height, so canopies move and trunks (another material)
          // stay put. Positions are world space by the time a chunk is
          // merged, which is what the phase terms rely on.
          const sway = new PBRCustomMaterial(`${m.name}_sway`, scene)
          sway.albedoColor = PALETTE[m.name] ?? m.albedoColor
          sway.metallic = 0; sway.roughness = 0.9; sway.specularIntensity = 0.3
          sway.AddUniform('swayTime', 'float', 0)
          sway.Vertex_Before_PositionUpdated(`
            float swayK = clamp((positionUpdated.y - 0.8) * 0.3, 0.0, 1.0);
            positionUpdated.x += sin(swayTime * 1.3 + positionUpdated.z * 0.35 + positionUpdated.x * 0.2) * 0.07 * swayK;
            positionUpdated.z += cos(swayTime * 1.1 + positionUpdated.x * 0.3) * 0.045 * swayK;
          `)
          sway.onBindObservable.add(() => { sway.getEffect()?.setFloat('swayTime', performance.now() / 1000) })
          for (const mesh of container.meshes) if (mesh.material === m) mesh.material = sway
          m.dispose()
          Kits.mats.add(sway)
          continue
        }
        if (m instanceof PBRMaterial) {
          m.unlit     = false
          m.metallic  = 0
          m.roughness = 0.9
          m.specularIntensity = 0.3
          const tint = PALETTE[m.name]
          if (tint) m.albedoColor = tint
        }
        Kits.mats.add(m)
      }

      let count = 0
      for (const root of container.rootNodes) {
        root.setEnabled(false)
        root.computeWorldMatrix(true)
        for (const group of root.getChildren()) {
          if (!(group instanceof TransformNode)) continue
          const meshes = group.getChildMeshes(false)
            .filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0)
          if (!meshes.length) continue
          const min = new Vector3(Infinity, Infinity, Infinity)
          const max = new Vector3(-Infinity, -Infinity, -Infinity)
          for (const m of meshes) {
            m.computeWorldMatrix(true)
            m.refreshBoundingInfo()
            const bb = m.getBoundingInfo().boundingBox
            min.minimizeInPlace(bb.minimumWorld)
            max.maximizeInPlace(bb.maximumWorld)
          }
          Kits.templates.set(group.name, { meshes, min, max })
          count++
        }
      }
      Kits.loaded.add(kit)
      console.info(`[kits] ${kit}: ${count} models, ${container.materials.length} materials`)
    } catch (e) {
      console.warn(`[kits] ${kit} unavailable — using primitives:`, e)
    }
  }

  /**
   * Places a copy of `model` under `parent`, footprint centred on (x, z)
   * with its base at `y`, uniformly scaled and yawed. The copies are plain
   * clones sharing the template geometry; styleChunk bakes them down.
   * Returns the placed size, or null when the model isn't available.
   */
  static place(
    parent: TransformNode,
    model: string,
    x: number, y: number, z: number,
    scale: number,
    yaw = 0,
  ): Vector3 | null {
    const t = Kits.templates.get(model)
    if (!t) return null

    const holder = new TransformNode(model, parent.getScene())
    holder.parent = parent
    holder.position.set(x, y, z)
    holder.rotation.y = yaw
    holder.scaling.setAll(scale)

    const cx = (t.min.x + t.max.x) / 2
    const cz = (t.min.z + t.max.z) / 2
    const shift = new Vector3(cx, t.min.y, cz)

    for (const m of t.meshes) {
      const c = m.clone(`${model}_p`, holder, true) as Mesh
      // The template's world matrix carries the glTF loader's handedness
      // flip and any quantization offsets; keep all of it, just re-origin
      // the model to its footprint centre and base.
      const wm = m.getWorldMatrix().clone()
      wm.setTranslation(wm.getTranslation().subtract(shift))
      const s = new Vector3(), q = new Quaternion(), p = new Vector3()
      wm.decompose(s, q, p)
      c.scaling            = s
      c.rotationQuaternion = q
      c.position           = p
      c.setEnabled(true)
      c.isPickable = false
      c.receiveShadows = true
    }

    return t.max.subtract(t.min).scale(scale)
  }
}
