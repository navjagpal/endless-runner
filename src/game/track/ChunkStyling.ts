import { Mesh, Material, VertexBuffer } from '@babylonjs/core'

/**
 * Post-processes a finished track chunk: merges its props by material,
 * flat-shades them, and bakes a vertical light gradient into vertex
 * colours.
 *
 * Three problems are being solved at once, and they're related.
 *
 * **Draw calls.** `createChunk` builds 60–120 separate meshes, and seven
 * chunks are live at a time. That's several hundred draw calls a frame
 * for a scene with almost no actual geometry in it — by far the biggest
 * cost on a weak tablet GPU. Everything in a chunk is static once built,
 * so anything sharing a material can be one mesh.
 *
 * **Flat shading.** Babylon smooth-shades cylinders and cones by
 * default, which blends a 7-sided low-poly tree's facets into a soft
 * plastic gradient. That single default is most of why the props read as
 * untextured primitives rather than as deliberate low-poly art. Splitting
 * the normals so each facet catches light on its own is what makes the
 * style look chosen.
 *
 * **Vertical gradient.** Baked per-vertex, darker at the base and lighter
 * at the top. It's the cheap stand-in for ambient occlusion and sky
 * light that hand-painted mobile games get from their texture atlases —
 * free here, since it costs no textures, no extra passes and no draw
 * calls.
 *
 * Order matters: merge first (so the gradient spans the whole chunk and
 * reads as one coherent light direction rather than restarting on every
 * bush), then flat-shade, then write colours — flat shading rebuilds the
 * vertex buffers, so colours written before it would be discarded.
 */

/** Multiplied into albedo at the bottom and top of a chunk's props. */
const GRADIENT_BOTTOM = 0.62
const GRADIENT_TOP    = 1.14

export interface ChunkStyleOptions {
  /**
   * Materials to merge but otherwise leave alone — the road, grass,
   * curbs, lane markings and glowing emissive bits. Flat-shading a
   * ground plane does nothing, and a vertical gradient across a road
   * surface just makes it look dirty.
   */
  plainMaterials: Set<Material>
  /**
   * Materials whose meshes already carry hand-authored vertex colours —
   * the ground shoulders, which bake their own height-linked tint. These
   * still want flat shading, but the generic gradient would overwrite the
   * very data that makes them interesting.
   */
  authoredColorMaterials?: Set<Material>
  /** Flat shading roughly triples vertex count; skip it on the low tier. */
  flatShade: boolean
  /**
   * Materials whose meshes were authored flat-shaded already (the model
   * kits). They still get merged and gradiented, but re-splitting their
   * normals would only triple their vertex count for nothing.
   */
  preShadedMaterials?: Set<Material>
  /** Override the gradient range. Vehicles want a shallower ramp than foliage. */
  gradient?: { bottom: number; top: number }
}

export interface ChunkStyleStats {
  before: number
  after: number
}

export function styleChunk(root: Mesh, opts: ChunkStyleOptions): ChunkStyleStats {
  const children = root.getChildMeshes(false).filter(
    (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
  )
  const before = children.length

  // MergeMeshes bakes each source's world matrix, but Babylon computes
  // those lazily at render time — and these meshes were built moments ago
  // and have never been rendered. Without forcing the computation the
  // merge bakes stale identity matrices, which silently collapses every
  // obstacle onto the world origin.
  root.computeWorldMatrix(true)
  for (const mesh of children) mesh.computeWorldMatrix(true)

  // Group by material — a merged mesh can only carry one — and by vertex
  // layout, because VertexData.merge refuses sources whose attribute
  // sets differ (a kit model with UVs next to one without, say). Two
  // layouts under one material simply become two meshes.
  const groups = new Map<string, { mat: Material; meshes: Mesh[] }>()
  for (const mesh of children) {
    const mat = mesh.material
    if (!mat) continue
    const key = `${mat.uniqueId}|${mesh.getVerticesDataKinds().sort().join(',')}`
    const g = groups.get(key)
    g ? g.meshes.push(mesh) : groups.set(key, { mat, meshes: [mesh] })
  }

  let after = 0
  for (const { mat, meshes } of groups.values()) {
    const merged = meshes.length > 1
      ? Mesh.MergeMeshes(meshes, true, true, undefined, false, false)
      : meshes[0]
    if (!merged) continue

    merged.material = mat
    // MergeMeshes bakes each source's world matrix into the vertices, so
    // the result already sits in world space with an identity transform.
    // setParent (rather than assigning .parent) works out the local
    // transform that preserves that world position, instead of applying
    // the root's offset a second time.
    merged.setParent(root)
    merged.isPickable = false
    after++

    if (opts.plainMaterials.has(mat)) {
      merged.receiveShadows = true
      continue
    }

    if (opts.flatShade && !opts.preShadedMaterials?.has(mat)) merged.convertToFlatShadedMesh()

    if (opts.authoredColorMaterials?.has(mat)) {
      merged.receiveShadows = true
      merged.useVertexColors = true
      continue
    }

    const g = opts.gradient
    _bakeHeightGradient(merged, g?.bottom ?? GRADIENT_BOTTOM, g?.top ?? GRADIENT_TOP)
  }

  return { before, after }
}

/**
 * Writes a greyscale vertical ramp into vertex colours. PBRMaterial
 * multiplies albedo by these, so the same material still drives the hue
 * — the ramp only shifts how much light each height receives.
 */
function _bakeHeightGradient(mesh: Mesh, bottom: number, top: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)
  if (!positions) return

  let minY = Infinity
  let maxY = -Infinity
  for (let i = 1; i < positions.length; i += 3) {
    if (positions[i] < minY) minY = positions[i]
    if (positions[i] > maxY) maxY = positions[i]
  }
  const span = maxY - minY
  if (!isFinite(span) || span < 1e-4) return

  const vertexCount = positions.length / 3
  const colors = new Float32Array(vertexCount * 4)
  for (let v = 0; v < vertexCount; v++) {
    const t = (positions[v * 3 + 1] - minY) / span
    const k = bottom + (top - bottom) * t
    colors[v * 4 + 0] = k
    colors[v * 4 + 1] = k
    colors[v * 4 + 2] = k
    colors[v * 4 + 3] = 1
  }

  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false)
  mesh.useVertexColors = true
}
