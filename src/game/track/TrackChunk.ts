import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Material,
  Color3,
  Vector3,
  Vector4,
  VertexBuffer,
} from '@babylonjs/core'
import { styleChunk } from './ChunkStyling'
import { getQualityProfile } from '../core/DeviceTier'
import { getAsphaltTexture, getGrassTexture, getBuildingTextures } from '../fx/Textures'
import { Kits } from '../assets/Kits'
import { terrainYAt } from './Terrain'

export const LANE_POSITIONS = [-2.5, 0, 2.5]
export const CHUNK_LENGTH   = 30

/** Report the merge ratio once per session rather than every 30 metres. */
let _loggedStyleStats = false

/**
 * Footprints of the props placed in the chunk being built. The verge
 * darkens under each one — baked contact occlusion, the cheapest thing
 * that makes a tree look like it stands on the ground rather than
 * hovers over it.
 */
let _footprints: { x: number; z: number; r: number }[] = []

function _place(root: Mesh, model: string, x: number, y: number, z: number, scale: number, yaw = 0): void {
  const size = Kits.place(root, model, x, y, z, scale, yaw)
  if (size) _footprints.push({ x, z, r: Math.max(size.x, size.z) * 0.42 })
}

function _aoAt(x: number, z: number): number {
  let k = 1
  for (const f of _footprints) {
    const dx = x - f.x, dz = z - f.z
    const d = Math.sqrt(dx * dx + dz * dz)
    const reach = f.r * 1.7
    if (d < reach) {
      const t = d / reach
      k *= 1 - 0.42 * (1 - t * t * (3 - 2 * t))
    }
  }
  return k
}

export interface ChunkData { root: Mesh; zStart: number; zEnd: number }

/**
 * Landmark features, one every few chunks per zone, keyed off the chunk
 * index so a run always has them and never two in a row.
 */
export type ChunkFeature = 'none' | 'tunnel' | 'bridge' | 'overpass'
export function chunkFeature(zoneId: string, zStart: number): ChunkFeature {
  const idx = Math.round(zStart / CHUNK_LENGTH)
  if (zStart < 50) return 'none'
  if (zoneId === 'forest' && idx % 5 === 2) return 'tunnel'
  if (zoneId === 'beach'  && idx % 5 === 2) return 'bridge'
  if (zoneId === 'city'   && idx % 4 === 1) return 'overpass'
  return 'none'
}

// ─── Material cache — one instance per unique descriptor ─────────────────────

let _scene: Scene | null = null
const _matCache = new Map<string, PBRMaterial | StandardMaterial>()

// Exposed for ZoneManager
export let sharedRoadMat:  PBRMaterial
export let sharedGrassMat: PBRMaterial

// Private shared (initialised once)
let curbMat:  PBRMaterial
let dashMat:  StandardMaterial
let trunkMat: PBRMaterial
let poleMat:  PBRMaterial
let glowMat:  StandardMaterial
let bldMats:  PBRMaterial[] = []

function initShared(scene: Scene): void {
  if (_scene === scene) return
  _scene = scene
  _matCache.clear()

  // The road and verge carry tileable procedural textures. They're
  // near-white so the zone system keeps driving the hue through
  // albedoColor exactly as before — the texture only adds grain.
  sharedRoadMat               = new PBRMaterial('road', scene)
  sharedRoadMat.albedoColor   = new Color3(0.30, 0.31, 0.37)
  sharedRoadMat.albedoTexture = getAsphaltTexture(scene)
  sharedRoadMat.metallic      = 0.0
  sharedRoadMat.roughness     = 0.85

  sharedGrassMat               = new PBRMaterial('grass', scene)
  sharedGrassMat.albedoColor   = new Color3(0.32, 0.74, 0.22)
  sharedGrassMat.albedoTexture = getGrassTexture(scene)
  sharedGrassMat.metallic      = 0
  sharedGrassMat.roughness     = 1.0

  curbMat             = new PBRMaterial('curb', scene)
  curbMat.albedoColor = new Color3(0.92, 0.90, 0.86)
  curbMat.metallic    = 0; curbMat.roughness = 0.7

  dashMat                 = new StandardMaterial('dash', scene)
  dashMat.emissiveColor   = new Color3(1, 0.93, 0.45)
  dashMat.disableLighting = true

  trunkMat             = new PBRMaterial('trunk', scene)
  trunkMat.albedoColor = new Color3(0.50, 0.31, 0.14)
  trunkMat.metallic    = 0; trunkMat.roughness = 1.0

  poleMat             = new PBRMaterial('pole', scene)
  poleMat.albedoColor = new Color3(0.30, 0.34, 0.42)
  poleMat.metallic    = 0.4; poleMat.roughness = 0.5

  glowMat                 = new StandardMaterial('glow', scene)
  glowMat.emissiveColor   = new Color3(1.0, 0.92, 0.60)
  glowMat.disableLighting = true

  // City facades: textured walls with lit windows, in a few pastel tones.
  const { albedo, emissive } = getBuildingTextures(scene)
  bldMats = [
    new Color3(0.86, 0.88, 0.94), new Color3(0.95, 0.82, 0.72), new Color3(0.78, 0.86, 0.92),
    new Color3(0.92, 0.90, 0.80), new Color3(0.84, 0.78, 0.90),
  ].map((c, i) => {
    const m = new PBRMaterial(`bld${i}`, scene)
    m.albedoColor = c; m.albedoTexture = albedo
    m.emissiveTexture = emissive; m.emissiveColor = new Color3(0.85, 0.75, 0.50)
    m.metallic = 0; m.roughness = 0.9
    return m
  })
}

/**
 * Surfaces that should be merged but not flat-shaded or gradiented.
 *
 * Ground planes gain nothing from split normals, and a vertical gradient
 * across a road reads as grime rather than as light. The emissive
 * materials ignore lighting entirely, so a gradient would just dim them
 * unevenly.
 */
function _plainMaterials(): Set<Material> {
  return new Set<Material>([
    sharedRoadMat, curbMat, dashMat, glowMat,
  ])
}

// ─── Chunk factory ────────────────────────────────────────────────────────────

export function createChunk(scene: Scene, zStart: number, zoneId: string): ChunkData {
  initShared(scene)

  const root  = new Mesh('chunk', scene)
  const zMid  = zStart + CHUNK_LENGTH / 2
  const isSpace = zoneId === 'space'
  const feature = chunkFeature(zoneId, zStart)
  _footprints = []

  // ── Road ──
  _addRoadSurface(scene, root, zStart, zMid)

  // ── Curbs ──
  for (const side of [-1, 1]) {
    const curb = MeshBuilder.CreateBox('curb', { width: 0.36, height: 0.18, depth: CHUNK_LENGTH }, scene)
    curb.position = new Vector3(side * 4.7, 0.0, zMid)
    curb.material = curbMat
    curb.receiveShadows = true
    curb.parent = root
  }

  // ── Lane dashes (rails on the railway) ──
  if (zoneId === 'railway') _addRails(scene, root, zStart, zMid)
  else for (const laneX of [-1.25, 1.25]) {
    for (let i = 0; i < 5; i++) {
      const dash = MeshBuilder.CreateBox('dash', { width: 0.13, height: 0.012, depth: 2.2 }, scene)
      dash.position = new Vector3(laneX, 0.012, zStart + 3 + i * 5.5)
      dash.material = dashMat
      dash.parent   = root
    }
  }

  // ── Edge lines ──
  for (const side of [-1, 1]) {
    const line = MeshBuilder.CreateBox('edge', { width: 0.13, height: 0.012, depth: CHUNK_LENGTH }, scene)
    line.position = new Vector3(side * 4.35, 0.012, zMid)
    line.material = dashMat
    line.parent   = root
  }

  // ── Zone-specific props (a bridge has water instead of a verge) ──
  if (feature !== 'bridge') _addZoneProps(scene, root, zStart, zoneId)

  // ── Landmarks ──
  if (feature === 'tunnel')   _addTunnel(scene, root, zStart)
  if (feature === 'bridge')   _addBridge(scene, root, zStart, zMid)
  if (feature === 'overpass') _addOverpass(scene, root, zMid)

  // ── Lamp posts (all zones — colour changes via lamp point lights) ──
  if (!isSpace) {
    for (let i = 0; i < 2; i++) {
      const lz = zStart + 5 + i * 15
      for (const side of [-1, 1]) _addLamp(scene, root, side * 5.5, lz)
    }
  }

  // ── Grass / ground shoulders — last, so they can darken under the props ──
  if (feature !== 'bridge') {
    for (const side of [-1, 1]) _addGroundShoulder(scene, root, side, zStart, zMid)
  }

  // Collapse the chunk's ~100 loose meshes into one per material, then
  // flat-shade and gradient the props. Everything above this point is
  // static, so nothing is lost by baking it down.
  const stats = styleChunk(root, {
    plainMaterials: _plainMaterials(),
    authoredColorMaterials: new Set<Material>([sharedGrassMat]),
    preShadedMaterials: Kits.materials,
    flatShade: getQualityProfile().flatShade,
    terrain: terrainYAt,
  })
  if (!_loggedStyleStats) {
    _loggedStyleStats = true
    console.info(
      `[chunk] ${stats.before} meshes merged into ${stats.after} ` +
      `(${(stats.before / Math.max(1, stats.after)).toFixed(1)}x fewer draw calls per chunk)`,
    )
  }

  return { root, zStart, zEnd: zStart + CHUNK_LENGTH }
}

/** Writes a flat greyscale vertex colour so a mesh can merge with tinted ones. */
function _fillVertexColors(mesh: Mesh, tint: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)
  if (!positions) return
  const count = positions.length / 3
  const colors = new Float32Array(count * 4)
  for (let v = 0; v < count; v++) {
    colors[v * 4] = colors[v * 4 + 1] = colors[v * 4 + 2] = tint
    colors[v * 4 + 3] = 1
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false)
  mesh.useVertexColors = true
}

/**
 * The driving surface.
 *
 * A textured plane with per-vertex detail on top: transverse joints every
 * 6 m (a strong speed cue as they stream under the player), grime toward
 * the kerbs, and a low mottle. Sampled in world space so joints line up
 * across chunk seams. Kept out of the flat-shading and gradient passes
 * (see `_plainMaterials`).
 */
function _addRoadSurface(scene: Scene, root: Mesh, zStart: number, zMid: number): void {
  const WIDTH = 9
  const SUBDIV_Z = 48
  const ROW_PITCH = CHUNK_LENGTH / SUBDIV_Z
  const JOINT_SPACING = ROW_PITCH * 10

  const base = MeshBuilder.CreateBox('roadBase', { width: WIDTH, height: 0.20, depth: CHUNK_LENGTH }, scene)
  base.position = new Vector3(0, -0.10, zMid)
  base.material = sharedRoadMat
  base.receiveShadows = true
  base.parent = root
  _fillVertexColors(base, 0.86)

  const road = MeshBuilder.CreateGround('road', {
    width: WIDTH, height: CHUNK_LENGTH, subdivisionsX: 12, subdivisionsY: SUBDIV_Z,
  }, scene)
  road.position = new Vector3(0, 0.002, zMid)

  const positions = road.getVerticesData(VertexBuffer.PositionKind)
  const uvs       = road.getVerticesData(VertexBuffer.UVKind)
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4)
    for (let i = 0, c = 0, u = 0; i < positions.length; i += 3, c += 4, u += 2) {
      const x = positions[i]
      const worldZ = zStart + CHUNK_LENGTH / 2 + positions[i + 2]

      const phase = worldZ / JOINT_SPACING
      const toJoint = Math.abs(phase - Math.round(phase)) * JOINT_SPACING
      const joint = Math.max(0, 1 - toJoint / 0.40) * 0.13
      const edge = Math.max(0, (Math.abs(x) - 3.2) / 1.3) * 0.10
      const mottle = Math.sin(worldZ * 0.9) * Math.cos(x * 1.7) * 0.022

      const tint = Math.max(0.5, 1 - joint - edge + mottle)
      colors[c] = colors[c + 1] = colors[c + 2] = tint
      colors[c + 3] = 1

      // World-space UVs so the asphalt grain is continuous across seams.
      if (uvs) { uvs[u] = (x + WIDTH / 2) / 3.0; uvs[u + 1] = worldZ / 3.0 }
    }
    road.setVerticesData(VertexBuffer.ColorKind, colors, false)
    if (uvs) road.setVerticesData(VertexBuffer.UVKind, uvs, false)
    road.useVertexColors = true
  }

  road.material = sharedRoadMat
  road.receiveShadows = true
  road.parent = root
}

/**
 * The verge either side of the road: a subdivided grid with low-amplitude
 * noise pushed through it, flat-shaded so the facets catch the sun, with
 * a tileable grass texture on top. The displacement fades out toward the
 * road so the verge still meets the curb flush, and hangs *below* the
 * road plane so it can never stack up in perspective and hide obstacles.
 */
function _addGroundShoulder(scene: Scene, root: Mesh, side: number, zStart: number, zMid: number): void {
  const WIDTH = 22
  // Fine enough that a tree's contact shadow is a soft disc, not a
  // single dark vertex.
  const COLS  = 22
  const ROWS  = 30
  const AMPLITUDE = 0.38

  const ground = MeshBuilder.CreateGround('grass', {
    width: WIDTH, height: CHUNK_LENGTH, subdivisionsX: COLS, subdivisionsY: ROWS,
  }, scene)
  ground.position = new Vector3(side * 15.5, -0.05, zMid)

  const positions = ground.getVerticesData(VertexBuffer.PositionKind)
  const uvs       = ground.getVerticesData(VertexBuffer.UVKind)
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4)
    for (let i = 0, c = 0, u = 0; i < positions.length; i += 3, c += 4, u += 2) {
      const lx = positions[i]
      const lz = positions[i + 2]
      const worldX = side * 15.5 + lx
      const worldZ = zStart + CHUNK_LENGTH / 2 + lz
      const fromRoad = Math.max(0, Math.abs(worldX) - 5.6)
      const fade = Math.min(1, fromRoad / 3.5)

      const wx = worldX * 0.35
      const wz = (zStart + lz) * 0.28
      const n = Math.sin(wx) * Math.cos(wz) + 0.5 * Math.sin(wx * 2.3 + 1.7) * Math.cos(wz * 1.9)

      positions[i + 1] = Math.min(0, (n - 1) * 0.5) * AMPLITUDE * fade

      const tint = (0.90 + n * 0.09 + Math.sin(wx * 5.1 + wz * 3.3) * 0.04) * _aoAt(worldX, worldZ)
      colors[c] = colors[c + 1] = colors[c + 2] = tint
      colors[c + 3] = 1

      if (uvs) { uvs[u] = worldX / 4.0; uvs[u + 1] = worldZ / 4.0 }
    }
    ground.setVerticesData(VertexBuffer.PositionKind, positions, false)
    ground.setVerticesData(VertexBuffer.ColorKind, colors, false)
    if (uvs) ground.setVerticesData(VertexBuffer.UVKind, uvs, false)
    ground.useVertexColors = true
    ground.createNormals(false)
  }

  ground.material = sharedGrassMat
  ground.receiveShadows = true
  ground.parent = root
}

// ─── Zone prop dispatcher ──────────────────────────────────────────────────────

function _addZoneProps(scene: Scene, root: Mesh, zStart: number, zoneId: string): void {
  const spacing = CHUNK_LENGTH / 5
  switch (zoneId) {
    case 'meadow': _addMeadowProps(scene, root, zStart, spacing); break
    case 'forest': _addForestProps(scene, root, zStart, spacing); break
    case 'city':   _addCityProps(scene, root, zStart, spacing);   break
    case 'railway': _addRailwayProps(scene, root, zStart); break
    case 'beach':  _addBeachProps(scene, root, zStart, spacing);  break
    case 'space':  _addSpaceProps(scene, root, zStart, spacing);  break
    default:       _addMeadowProps(scene, root, zStart, spacing); break
  }
}

// ─── Meadow: puffy trees, bushes, white fences, flowers ───────────────────────

function _addMeadowProps(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  if (Kits.isLoaded('nature')) { _addMeadowKit(scene, root, zStart, spacing); return }
  const leafMatA = _pbr(scene, new Color3(0.22, 0.72, 0.20))
  const leafMatB = _pbr(scene, new Color3(0.36, 0.80, 0.16))
  const leafMatC = _pbr(scene, new Color3(0.16, 0.62, 0.26))
  const fenceMat = _pbr(scene, new Color3(0.98, 0.97, 0.94))
  const leafMats = [leafMatA, leafMatB, leafMatC]

  for (let i = 0; i < 5; i++) {
    const z = zStart + 1 + i * spacing + (Math.random() - 0.5) * 2
    for (const side of [-1, 1]) {
      _addPuffTree(scene, root, side * (7.6 + Math.random() * 1.5), z, leafMats[Math.floor(Math.random() * 3)])
      // A second, further row gives the verge depth.
      if (Math.random() < 0.7)
        _addPuffTree(scene, root, side * (12 + Math.random() * 8), z + spacing * 0.5, leafMats[Math.floor(Math.random() * 3)])
    }
  }

  // Bushes hugging the fence line
  for (let i = 0; i < 6; i++) {
    const side = Math.random() > 0.5 ? 1 : -1
    _addBush(scene, root, side * (6.3 + Math.random() * 3), zStart + Math.random() * CHUNK_LENGTH, leafMats[Math.floor(Math.random() * 3)])
  }

  // Fence posts + rails
  for (let i = 0; i < 6; i++) {
    const z = zStart + i * 5
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateBox('fp', { width: 0.14, height: 0.95, depth: 0.14 }, scene)
      post.position = new Vector3(side * 5.3, 0.47, z)
      post.material = fenceMat
      post.parent   = root
    }
  }
  for (const side of [-1, 1]) {
    for (const ry of [0.42, 0.72]) {
      const rail = MeshBuilder.CreateBox('rail', { width: 0.07, height: 0.09, depth: CHUNK_LENGTH }, scene)
      rail.position = new Vector3(side * 5.3, ry, zStart + CHUNK_LENGTH / 2)
      rail.material = fenceMat
      rail.parent   = root
    }
  }

  // Flowers in little clumps
  const stemMat   = _pbr(scene, new Color3(0.25, 0.72, 0.22))
  const petalMats = [
    _pbr(scene, new Color3(1, 0.85, 0.15)),
    _pbr(scene, new Color3(1, 0.38, 0.55)),
    _pbr(scene, new Color3(1, 1, 1)),
    _pbr(scene, new Color3(0.55, 0.45, 1)),
  ]
  for (let i = 0; i < 5; i++) {
    const cx = (Math.random() - 0.5) * 14 + (Math.random() > 0.5 ? 9 : -9)
    const cz = zStart + Math.random() * CHUNK_LENGTH
    const petalMat = petalMats[Math.floor(Math.random() * petalMats.length)]
    for (let k = 0; k < 4; k++) {
      const fx = cx + (Math.random() - 0.5) * 1.6
      const fz = cz + (Math.random() - 0.5) * 1.6
      const stem = MeshBuilder.CreateCylinder('stem', { height: 0.30, diameter: 0.05, tessellation: 4 }, scene)
      stem.position = new Vector3(fx, 0.15, fz)
      stem.material = stemMat
      stem.parent   = root
      const petal = MeshBuilder.CreateSphere('petal', { diameter: 0.26, segments: 4 }, scene)
      petal.position = new Vector3(fx, 0.34, fz)
      petal.material = petalMat
      petal.parent   = root
    }
  }
}

// ─── Forest: pine trees, mushrooms, rocks, stumps ─────────────────────────────

function _addForestProps(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  if (Kits.isLoaded('nature')) { _addForestKit(scene, root, zStart, spacing); return }
  const darkLeaf = _pbr(scene, new Color3(0.12, 0.46, 0.16))
  const pineLeaf = _pbr(scene, new Color3(0.08, 0.38, 0.12))
  const lightLeaf = _pbr(scene, new Color3(0.30, 0.62, 0.22))
  const rockMat  = _pbr(scene, new Color3(0.52, 0.50, 0.50))

  for (let i = 0; i < 6; i++) {
    const z = zStart + i * (spacing * 0.85)
    for (const side of [-1, 1]) {
      const x = side * (7.2 + Math.random() * 3)
      _addPineTree(scene, root, x, z, Math.random() > 0.4 ? darkLeaf : pineLeaf)
      if (Math.random() < 0.8)
        _addPineTree(scene, root, side * (12 + Math.random() * 9), z + 2.5, Math.random() > 0.5 ? pineLeaf : lightLeaf)
    }
  }

  for (let i = 0; i < 5; i++) {
    const mx = (Math.random() - 0.5) * 6 + (Math.random() > 0.5 ? 7 : -7)
    const mz = zStart + Math.random() * CHUNK_LENGTH
    _addMushroom(scene, root, mx, mz, 0.8 + Math.random() * 1.2)
  }

  for (let i = 0; i < 3; i++) {
    const rx = (Math.random() - 0.5) * 12 + (Math.random() > 0.5 ? 8 : -8)
    const rz = zStart + Math.random() * CHUNK_LENGTH
    const rock = MeshBuilder.CreateSphere('rock', { diameter: 0.6 + Math.random() * 0.8, segments: 4 }, scene)
    rock.scaling = new Vector3(1 + Math.random() * 0.4, 0.7, 1 + Math.random() * 0.4)
    rock.position = new Vector3(rx, 0.2, rz)
    rock.material = rockMat
    rock.parent = root
  }

  // Tree stumps
  for (let i = 0; i < 2; i++) {
    const sx = (Math.random() > 0.5 ? 6.5 : -6.5) + (Math.random() - 0.5) * 2
    const sz = zStart + Math.random() * CHUNK_LENGTH
    const stump = MeshBuilder.CreateCylinder('stump', { height: 0.5, diameter: 0.7, tessellation: 7 }, scene)
    stump.position = new Vector3(sx, 0.25, sz)
    stump.material = trunkMat; stump.parent = root
    const top = MeshBuilder.CreateCylinder('stumpTop', { height: 0.06, diameter: 0.62, tessellation: 7 }, scene)
    top.position = new Vector3(sx, 0.53, sz)
    top.material = _pbr(scene, new Color3(0.85, 0.70, 0.45)); top.parent = root
  }
}

// ─── City: textured buildings, billboards, street furniture ──────────────────

function _addCityProps(scene: Scene, root: Mesh, zStart: number, _spacing: number): void {
  if (Kits.isLoaded('city') && Kits.isLoaded('nature')) { _addCityKit(scene, root, zStart); return }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bz = zStart + i * (CHUNK_LENGTH / 4) + Math.random() * 2
      const bh = 6 + Math.random() * 16
      const bw = 4 + Math.random() * 4
      const bd = 4 + Math.random() * 3
      const bx = side * (12 + Math.random() * 6)
      _addCityBuilding(scene, root, bx, bz, bw, bh, bd)
    }
  }

  // Street trees in planters along the kerb
  const planterMat = _pbr(scene, new Color3(0.55, 0.30, 0.20))
  const leaf = _pbr(scene, new Color3(0.28, 0.68, 0.24))
  for (let i = 0; i < 3; i++) {
    const z = zStart + 4 + i * 10
    for (const side of [-1, 1]) {
      const planter = MeshBuilder.CreateBox('planter', { width: 0.9, height: 0.5, depth: 0.9 }, scene)
      planter.position = new Vector3(side * 6.4, 0.25, z)
      planter.material = planterMat; planter.parent = root
      const t = MeshBuilder.CreateSphere('st', { diameter: 1.5, segments: 5 }, scene)
      t.position = new Vector3(side * 6.4, 1.6, z)
      t.material = leaf; t.parent = root
      const tr = MeshBuilder.CreateCylinder('str', { height: 1.0, diameter: 0.14, tessellation: 5 }, scene)
      tr.position = new Vector3(side * 6.4, 0.9, z)
      tr.material = trunkMat; tr.parent = root
    }
  }

  _addCityFurniture(scene, root, zStart)
}

function _addCityFurniture(scene: Scene, root: Mesh, zStart: number): void {
  // Fire hydrants and traffic cones
  const hydrantMat = _pbr(scene, new Color3(0.92, 0.15, 0.12))
  const coneMat    = _pbr(scene, new Color3(1.0, 0.45, 0.05))
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const hz = zStart + 9 + i * 12 + Math.random() * 4
    const h = MeshBuilder.CreateCylinder('hyd', { height: 0.7, diameter: 0.32, tessellation: 7 }, scene)
    h.position = new Vector3(side * 5.9, 0.35, hz); h.material = hydrantMat; h.parent = root
    const cap = MeshBuilder.CreateSphere('hydCap', { diameter: 0.34, segments: 5 }, scene)
    cap.position = new Vector3(side * 5.9, 0.72, hz); cap.material = hydrantMat; cap.parent = root
    const cone = MeshBuilder.CreateCylinder('cone', { height: 0.6, diameterTop: 0.06, diameterBottom: 0.4, tessellation: 6 }, scene)
    cone.position = new Vector3(-side * 5.7, 0.3, hz + 5); cone.material = coneMat; cone.parent = root
  }

  // Billboards on posts
  for (let i = 0; i < 2; i++) {
    const side = i % 2 === 0 ? -1 : 1
    _addBillboard(scene, root, side * 9.5, zStart + 6 + i * 15)
  }
}

// ─── Beach: palm trees, umbrellas, beach balls, sandcastles ──────────────────

function _addBeachProps(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  if (Kits.isLoaded('nature')) { _addBeachKit(scene, root, zStart, spacing); return }
  for (let i = 0; i < 5; i++) {
    const z = zStart + 1 + i * spacing + (Math.random() - 0.5) * 2
    for (const side of [-1, 1]) {
      _addPalmTree(scene, root, side * (7 + Math.random() * 3), z)
      if (Math.random() < 0.6) _addPalmTree(scene, root, side * (12 + Math.random() * 6), z + 3)
    }
  }

  for (let i = 0; i < 3; i++) {
    const ux = (Math.random() > 0.5 ? 8 : -8) + (Math.random() - 0.5) * 2
    const uz = zStart + Math.random() * CHUNK_LENGTH
    _addUmbrella(scene, root, ux, uz)
  }

  const ballMats = [
    _pbr(scene, new Color3(1, 0.25, 0.3)), _pbr(scene, new Color3(0.2, 0.6, 1)), _pbr(scene, new Color3(1, 0.85, 0.1)),
  ]
  for (let i = 0; i < 3; i++) {
    const bx = (Math.random() > 0.5 ? 7 : -7) + (Math.random() - 0.5) * 3
    const bz = zStart + Math.random() * CHUNK_LENGTH
    const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.6, segments: 6 }, scene)
    ball.position = new Vector3(bx, 0.3, bz)
    ball.material = ballMats[i % 3]; ball.parent = root
  }

  // Sandcastles
  const sandMat = _pbr(scene, new Color3(0.94, 0.82, 0.55))
  for (let i = 0; i < 2; i++) {
    const sx = (Math.random() > 0.5 ? 9 : -9) + (Math.random() - 0.5) * 3
    const sz = zStart + 5 + i * 14
    const baseB = MeshBuilder.CreateBox('sc', { width: 1.4, height: 0.5, depth: 1.4 }, scene)
    baseB.position = new Vector3(sx, 0.25, sz); baseB.material = sandMat; baseB.parent = root
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const tower = MeshBuilder.CreateCylinder('sct', { height: 0.8, diameter: 0.36, tessellation: 6 }, scene)
      tower.position = new Vector3(sx + dx, 0.65, sz + dz); tower.material = sandMat; tower.parent = root
      const roof = MeshBuilder.CreateCylinder('scr', { height: 0.3, diameterTop: 0, diameterBottom: 0.4, tessellation: 6 }, scene)
      roof.position = new Vector3(sx + dx, 1.2, sz + dz); roof.material = sandMat; roof.parent = root
    }
  }
}

// ─── Space: neon pillars, asteroids, crystals, glowing grid lines ─────────────

function _addSpaceProps(scene: Scene, root: Mesh, zStart: number, _spacing: number): void {
  const neonGridMat  = _emissive(scene, new Color3(0.45, 0.20, 1.0))
  const starMat      = _emissive(scene, new Color3(0.9, 0.9, 1.0))
  const asteroidMat  = _pbr(scene, new Color3(0.42, 0.36, 0.52), 0.2, 0.8)
  const pillarColors = [new Color3(1, 0.2, 0.8), new Color3(0.2, 0.9, 1), new Color3(0.7, 0.3, 1)]

  for (let i = 0; i < 7; i++) {
    const gz = zStart + i * (CHUNK_LENGTH / 7) + 1
    const hLine = MeshBuilder.CreateBox('hg', { width: 8.8, height: 0.015, depth: 0.06 }, scene)
    hLine.position = new Vector3(0, 0.015, gz)
    hLine.material = neonGridMat
    hLine.parent   = root
  }

  for (let i = 0; i < 4; i++) {
    const z    = zStart + 3 + i * 7
    const side = i % 2 === 0 ? -1 : 1
    _addSpacePillar(scene, root, side * 6, z, pillarColors[i % pillarColors.length])
  }

  // Floating crystals
  for (let i = 0; i < 4; i++) {
    const col = pillarColors[(i + 1) % pillarColors.length]
    const cz = zStart + 2 + i * 7.5
    const cx = (i % 2 === 0 ? 1 : -1) * (8 + Math.random() * 6)
    const crystal = MeshBuilder.CreatePolyhedron('crystal', { type: 1, size: 0.5 + Math.random() * 0.5 }, scene)
    crystal.scaling.y = 1.8
    crystal.position = new Vector3(cx, 1.5 + Math.random() * 2, cz)
    crystal.rotation.y = Math.random() * Math.PI
    crystal.material = _emissive(scene, col); crystal.parent = root
  }

  for (let i = 0; i < 3; i++) {
    const az = zStart + 5 + i * 10
    const ax = (Math.random() - 0.5) * 30 + (Math.random() > 0.5 ? 12 : -12)
    const ay = 2 + Math.random() * 4
    const asteroid = MeshBuilder.CreateSphere('ast', { diameter: 0.8 + Math.random() * 1.2, segments: 5 }, scene)
    asteroid.scaling = new Vector3(1 + Math.random() * 0.5, 0.8, 1 + Math.random() * 0.4)
    asteroid.position = new Vector3(ax, ay, az)
    asteroid.material = asteroidMat
    asteroid.parent   = root
  }

  for (let i = 0; i < 20; i++) {
    const sx = (Math.random() - 0.5) * 24
    const sz = zStart + Math.random() * CHUNK_LENGTH
    if (Math.abs(sx) < 5) continue
    const star = MeshBuilder.CreateBox('s', { size: 0.08 }, scene)
    star.position = new Vector3(sx, 0.04, sz)
    star.material = starMat
    star.parent   = root
  }
}

// ─── Railway ──────────────────────────────────────────────────────────────────

/** Three pairs of rails on sleepers, one per lane, in place of the lane paint. */
function _addRails(scene: Scene, root: Mesh, zStart: number, zMid: number): void {
  const railMat    = _pbr(scene, new Color3(0.55, 0.56, 0.60), 0.6, 0.35)
  const sleeperMat = _pbr(scene, new Color3(0.40, 0.28, 0.18), 0, 0.95)
  for (const laneX of LANE_POSITIONS) {
    for (const dx of [-0.55, 0.55]) {
      const rail = MeshBuilder.CreateBox('rail', { width: 0.10, height: 0.10, depth: CHUNK_LENGTH }, scene)
      rail.position = new Vector3(laneX + dx, 0.06, zMid)
      rail.material = railMat; rail.parent = root
    }
    for (let i = 0; i < CHUNK_LENGTH / 1.5; i++) {
      const sleeper = MeshBuilder.CreateBox('sleeper', { width: 1.6, height: 0.06, depth: 0.32 }, scene)
      sleeper.position = new Vector3(laneX, 0.02, zStart + 0.75 + i * 1.5)
      sleeper.material = sleeperMat; sleeper.parent = root
    }
  }
}

function _addRailwayProps(scene: Scene, root: Mesh, zStart: number): void {
  const crateMat  = _pbr(scene, new Color3(0.72, 0.52, 0.30), 0, 0.9)
  const steelMat  = _pbr(scene, new Color3(0.42, 0.45, 0.50), 0.4, 0.5)
  const redLamp   = _emissive(scene, new Color3(1.0, 0.15, 0.10))
  const greenLamp = _emissive(scene, new Color3(0.20, 1.0, 0.30))
  const stripeMat = _pbr(scene, new Color3(0.95, 0.85, 0.10), 0, 0.8)

  // Signals at the kerb
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const z = zStart + 6 + i * 14
    const post = MeshBuilder.CreateCylinder('sigpost', { height: 3.6, diameter: 0.18, tessellation: 6 }, scene)
    post.position = new Vector3(side * 5.6, 1.8, z); post.material = steelMat; post.parent = root
    const head = MeshBuilder.CreateBox('sighead', { width: 0.5, height: 1.1, depth: 0.4 }, scene)
    head.position = new Vector3(side * 5.6, 3.7, z); head.material = steelMat; head.parent = root
    const lamp = MeshBuilder.CreateSphere('siglamp', { diameter: 0.28, segments: 5 }, scene)
    lamp.position = new Vector3(side * 5.6, 3.95, z - 0.22); lamp.material = i === 0 ? greenLamp : redLamp; lamp.parent = root
    const lamp2 = MeshBuilder.CreateSphere('siglamp', { diameter: 0.28, segments: 5 }, scene)
    lamp2.position = new Vector3(side * 5.6, 3.45, z - 0.22); lamp2.material = i === 0 ? redLamp : greenLamp; lamp2.parent = root
  }

  // Stacked crates and a striped barrier-arm on the verge
  for (let i = 0; i < 4; i++) {
    const side = Math.random() > 0.5 ? 1 : -1
    const cx = side * _rnd(7, 13), cz = zStart + Math.random() * CHUNK_LENGTH
    const n = 1 + Math.floor(Math.random() * 3)
    for (let k = 0; k < n; k++) {
      const crate = MeshBuilder.CreateBox('crate', { size: 1.1 }, scene)
      crate.position = new Vector3(cx + (k % 2) * 0.3, 0.55 + Math.floor(k / 2) * 1.1, cz + (k % 2) * 0.2)
      crate.rotation.y = _rnd(-0.3, 0.3)
      crate.material = crateMat; crate.parent = root
    }
  }
  for (const side of [-1, 1]) {
    const arm = MeshBuilder.CreateBox('gatearm', { width: 3.2, height: 0.16, depth: 0.16 }, scene)
    arm.position = new Vector3(side * 8.2, 1.1, zStart + 22); arm.material = stripeMat; arm.parent = root
    const box = MeshBuilder.CreateBox('gatebox', { width: 0.5, height: 1.2, depth: 0.5 }, scene)
    box.position = new Vector3(side * 6.7, 0.6, zStart + 22); box.material = steelMat; box.parent = root
  }

  // Kit dressing: fences, a couple of buildings, weeds
  if (Kits.isLoaded('nature')) {
    for (let i = 0; i < CHUNK_LENGTH / 2; i++) {
      for (const side of [-1, 1]) _place(root, 'fence_planks', side * 6.0, 0, zStart + 1 + i * 2, 2.0, Math.PI / 2)
    }
    for (let i = 0; i < 5; i++) {
      _place(root, 'grass_large', (Math.random() > 0.5 ? 1 : -1) * _rnd(6.5, 16), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2, 3), _yaw())
    }
  }
  if (Kits.isLoaded('city')) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.6) {
        const model = _pick(['building-a', 'building-c', 'building-f'])
        const size = Kits.size(model)
        if (size) {
          const scale = _rnd(4.5, 5.5)
          _place(root, model, side * (13 + size.x * scale / 2), 0, zStart + _rnd(6, 24), scale, side > 0 ? -Math.PI / 2 : Math.PI / 2)
        }
      }
    }
  }
}

// ─── Landmarks ────────────────────────────────────────────────────────────────

/**
 * A rock tunnel over the whole chunk: a half-cylinder shell the road runs
 * through, lit from inside by a row of warm lamps. Walls sit outside the
 * kerbs so nothing on the road changes.
 */
function _addTunnel(scene: Scene, root: Mesh, zStart: number): void {
  const rockMat  = _pbr(scene, new Color3(0.42, 0.40, 0.44), 0, 0.95)
  const innerMat = _pbr(scene, new Color3(0.30, 0.29, 0.34), 0, 0.95)
  const trimMat  = _pbr(scene, new Color3(0.62, 0.58, 0.55), 0, 0.9)
  const lampMat  = _emissive(scene, new Color3(1.0, 0.85, 0.55))

  // Shell: outer rock, inner lining, as ribbons between an arc at each
  // end of the chunk — no guessing at cylinder orientation.
  const arc = (r: number, z: number, yBase: number): Vector3[] => {
    const pts: Vector3[] = []
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI
      pts.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r + yBase, z))
    }
    return pts
  }
  for (const [r, mat] of [[6.9, rockMat], [6.5, innerMat]] as [number, PBRMaterial][]) {
    const shell = MeshBuilder.CreateRibbon('tunnel', {
      pathArray: [arc(r, zStart, 0.3), arc(r, zStart + CHUNK_LENGTH, 0.3)],
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene)
    shell.material = mat
    shell.parent = root
  }
  // Portal rings at both ends: a flat band between two arcs.
  for (const z of [zStart + 0.05, zStart + CHUNK_LENGTH - 0.05]) {
    const ring = MeshBuilder.CreateRibbon('portal', {
      pathArray: [arc(6.9, z, 0.3), arc(7.8, z, 0.3)],
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene)
    ring.material = trimMat
    ring.parent = root
  }
  // Ceiling lamps
  for (let i = 0; i < 6; i++) {
    const lz = zStart + 2.5 + i * 5
    const lamp = MeshBuilder.CreateBox('tlamp', { width: 1.2, height: 0.2, depth: 0.5 }, scene)
    lamp.position = new Vector3(0, 6.4, lz)
    lamp.material = lampMat
    lamp.parent = root
  }
}

/**
 * A bridge over water: the verge is gone, replaced by a wide blue plane
 * a couple of metres down, with railings and pylons on the road.
 */
function _addBridge(scene: Scene, root: Mesh, zStart: number, zMid: number): void {
  const water = _pbr(scene, new Color3(0.20, 0.62, 0.92), 0.05, 0.3)
  const railMat = _pbr(scene, new Color3(0.97, 0.97, 0.95), 0, 0.6)
  const pylonMat = _pbr(scene, new Color3(0.75, 0.72, 0.68), 0, 0.9)

  const sea = MeshBuilder.CreateGround('bridgeWater', { width: 80, height: CHUNK_LENGTH + 0.5 }, scene)
  sea.position = new Vector3(0, -0.32, zMid)
  sea.material = water
  sea.parent = root

  for (const side of [-1, 1]) {
    for (let i = 0; i <= CHUNK_LENGTH / 3; i++) {
      const post = MeshBuilder.CreateBox('bpost', { width: 0.16, height: 1.1, depth: 0.16 }, scene)
      post.position = new Vector3(side * 4.9, 0.55, zStart + i * 3)
      post.material = railMat; post.parent = root
    }
    for (const ry of [0.55, 1.0]) {
      const rail = MeshBuilder.CreateBox('brail', { width: 0.1, height: 0.1, depth: CHUNK_LENGTH }, scene)
      rail.position = new Vector3(side * 4.9, ry, zMid)
      rail.material = railMat; rail.parent = root
    }
    for (let i = 0; i < 3; i++) {
      const pylon = MeshBuilder.CreateBox('pylon', { width: 1.2, height: 0.9, depth: 1.2 }, scene)
      pylon.position = new Vector3(side * 5.2, -0.45, zStart + 5 + i * 10)
      pylon.material = pylonMat; pylon.parent = root
    }
  }
  // Road slab edge, deeper than usual so the bridge reads as a deck
  const deck = MeshBuilder.CreateBox('deck', { width: 10.6, height: 0.5, depth: CHUNK_LENGTH }, scene)
  deck.position = new Vector3(0, -0.28, zMid)
  deck.material = pylonMat
  deck.parent = root
}

/**
 * A city overpass crossing above the road, with a couple of parked kit
 * cars on it. Clearance is well above anything the player can reach.
 */
function _addOverpass(scene: Scene, root: Mesh, zMid: number): void {
  const concrete = _pbr(scene, new Color3(0.70, 0.68, 0.66), 0, 0.9)
  const railMat  = _pbr(scene, new Color3(0.35, 0.38, 0.45), 0.3, 0.6)
  const deck = MeshBuilder.CreateBox('odeck', { width: 26, height: 0.7, depth: 4.2 }, scene)
  deck.position = new Vector3(0, 5.6, zMid)
  deck.material = concrete; deck.parent = root
  for (const side of [-1, 1]) {
    const pylon = MeshBuilder.CreateBox('opylon', { width: 1.0, height: 5.3, depth: 3.0 }, scene)
    pylon.position = new Vector3(side * 6.6, 2.65, zMid)
    pylon.material = concrete; pylon.parent = root
  }
  for (const dz of [-1.95, 1.95]) {
    const rail = MeshBuilder.CreateBox('orail', { width: 26, height: 0.9, depth: 0.12 }, scene)
    rail.position = new Vector3(0, 6.4, zMid + dz)
    rail.material = railMat; rail.parent = root
  }
  if (Kits.isLoaded('vehicles')) {
    for (const [x, model] of [[-7.5, 'taxi'], [4, 'suv'], [10, 'van']] as [number, string][]) {
      _place(root, model, x, 5.95, zMid, 1.05, Math.PI / 2)
    }
  }
}

// ─── Kit-based props ──────────────────────────────────────────────────────────
//
// The same layouts as the primitive builders above, placed with Kenney
// models. Scales convert the kits' ~1-unit models to the metres the track
// is built in; the random spread on each keeps a row from reading as one
// asset stamped repeatedly.

function _pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
function _rnd(lo: number, hi: number): number { return lo + Math.random() * (hi - lo) }
function _yaw(): number { return Math.random() * Math.PI * 2 }

const MEADOW_TREES = ['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_simple', 'tree_tall', 'tree_blocks', 'tree_default_dark']
const BUSHES       = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed']
const FLOWERS      = ['flower_redA', 'flower_redB', 'flower_purpleA', 'flower_purpleC', 'flower_yellowA', 'flower_yellowB']
const PINES        = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundA', 'tree_pineRoundB', 'tree_pineDefaultA', 'tree_pineSmallA']
const MUSHROOMS    = ['mushroom_red', 'mushroom_redGroup', 'mushroom_tan', 'mushroom_tanTall']
const ROCKS        = ['rock_largeA', 'rock_largeB', 'rock_tallA']
const SMALL_ROCKS  = ['rock_smallA', 'rock_smallB']
const PALMS        = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palmShort']
const BUILDINGS    = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h']
const SKYSCRAPERS  = ['building-skyscraper-a', 'building-skyscraper-b']

function _addMeadowKit(_scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  for (let i = 0; i < 5; i++) {
    const z = zStart + 1 + i * spacing + _rnd(-1, 1)
    for (const side of [-1, 1]) {
      _place(root, _pick(MEADOW_TREES), side * _rnd(7.8, 9.3), 0, z, _rnd(3.4, 4.8), _yaw())
      if (Math.random() < 0.75)
        _place(root, _pick(MEADOW_TREES), side * _rnd(12.5, 20), 0, z + spacing * 0.5, _rnd(3.0, 4.6), _yaw())
    }
  }
  for (let i = 0; i < 6; i++) {
    const side = Math.random() > 0.5 ? 1 : -1
    _place(root, _pick(BUSHES), side * _rnd(6.2, 9.5), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.4, 3.6), _yaw())
  }
  // Wooden fence along the verge: 1-unit panels scaled to 2 m, laid end to end.
  for (let i = 0; i < CHUNK_LENGTH / 2; i++) {
    const z = zStart + 1 + i * 2
    for (const side of [-1, 1]) _place(root, 'fence_simple', side * 5.3, 0, z, 2.0, Math.PI / 2)
  }
  for (let i = 0; i < 6; i++) {
    const cx = (Math.random() > 0.5 ? 1 : -1) * _rnd(6.5, 16)
    const cz = zStart + Math.random() * CHUNK_LENGTH
    const flower = _pick(FLOWERS)
    for (let k = 0; k < 3; k++) _place(root, flower, cx + _rnd(-0.8, 0.8), 0, cz + _rnd(-0.8, 0.8), _rnd(2.0, 2.6), _yaw())
  }
  for (let i = 0; i < 6; i++) {
    _place(root, 'grass_large', (Math.random() > 0.5 ? 1 : -1) * _rnd(6, 18), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.2, 3.0), _yaw())
  }
  for (let i = 0; i < 2; i++) {
    _place(root, _pick(SMALL_ROCKS), (Math.random() > 0.5 ? 1 : -1) * _rnd(7, 15), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(1.8, 2.6), _yaw())
  }
}

function _addForestKit(_scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  for (let i = 0; i < 6; i++) {
    const z = zStart + i * (spacing * 0.85)
    for (const side of [-1, 1]) {
      _place(root, _pick(PINES), side * _rnd(7.2, 10), 0, z, _rnd(3.8, 5.4), _yaw())
      if (Math.random() < 0.85)
        _place(root, _pick(PINES), side * _rnd(12, 21), 0, z + 2.5, _rnd(3.6, 5.6), _yaw())
    }
  }
  for (let i = 0; i < 5; i++) {
    _place(root, _pick(MUSHROOMS), (Math.random() > 0.5 ? 1 : -1) * _rnd(6.2, 10), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.4, 4.0), _yaw())
  }
  for (let i = 0; i < 3; i++) {
    _place(root, _pick(ROCKS), (Math.random() > 0.5 ? 1 : -1) * _rnd(6.5, 14), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.0, 3.2), _yaw())
  }
  for (let i = 0; i < 2; i++) {
    _place(root, _pick(['stump_round', 'stump_oldTall', 'log', 'log_stack']), (Math.random() > 0.5 ? 1 : -1) * _rnd(6.2, 9), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.2, 3.0), _yaw())
  }
  for (let i = 0; i < 4; i++) {
    _place(root, _pick(BUSHES), (Math.random() > 0.5 ? 1 : -1) * _rnd(6.2, 12), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.2, 3.2), _yaw())
  }
}

function _addCityKit(scene: Scene, root: Mesh, zStart: number): void {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bz = zStart + 3.8 + i * (CHUNK_LENGTH / 4) + _rnd(-0.6, 0.6)
      const tall  = Math.random() < 0.15
      const model = tall ? _pick(SKYSCRAPERS) : _pick(BUILDINGS)
      const size  = Kits.size(model)
      if (!size) continue
      const scale = tall ? _rnd(4.6, 5.4) : _rnd(5.6, 6.6)
      // Facade flush with the sidewalk edge, whatever the footprint.
      const x = side * (11.4 + size.x * scale / 2)
      _place(root, model, x, 0, bz, scale, side > 0 ? -Math.PI / 2 : Math.PI / 2)
    }
  }

  // Street trees in planters along the kerb
  const planterMat = _pbr(scene, new Color3(0.55, 0.30, 0.20))
  for (let i = 0; i < 3; i++) {
    const z = zStart + 4 + i * 10
    for (const side of [-1, 1]) {
      const planter = MeshBuilder.CreateBox('planter', { width: 0.9, height: 0.5, depth: 0.9 }, scene)
      planter.position = new Vector3(side * 6.4, 0.25, z)
      planter.material = planterMat; planter.parent = root
      _place(root, _pick(['tree_small', 'tree_simple', 'tree_oak']), side * 6.4, 0.5, z, _rnd(2.2, 2.8), _yaw())
    }
  }

  _addCityFurniture(scene, root, zStart)
}

function _addBeachKit(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  for (let i = 0; i < 5; i++) {
    const z = zStart + 1 + i * spacing + _rnd(-1, 1)
    for (const side of [-1, 1]) {
      _place(root, _pick(PALMS), side * _rnd(7, 10), 0, z, _rnd(3.6, 4.8), _yaw())
      if (Math.random() < 0.6) _place(root, _pick(PALMS), side * _rnd(12, 18), 0, z + 3, _rnd(3.2, 4.4), _yaw())
    }
  }
  for (let i = 0; i < 3; i++) {
    _addUmbrella(scene, root, (Math.random() > 0.5 ? 8 : -8) + _rnd(-1, 1), zStart + Math.random() * CHUNK_LENGTH)
  }
  const ballMats = [
    _pbr(scene, new Color3(1, 0.25, 0.3)), _pbr(scene, new Color3(0.2, 0.6, 1)), _pbr(scene, new Color3(1, 0.85, 0.1)),
  ]
  for (let i = 0; i < 3; i++) {
    const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.6, segments: 6 }, scene)
    ball.position = new Vector3((Math.random() > 0.5 ? 7 : -7) + _rnd(-1.5, 1.5), 0.3, zStart + Math.random() * CHUNK_LENGTH)
    ball.material = ballMats[i % 3]; ball.parent = root
  }
  for (let i = 0; i < 3; i++) {
    _place(root, _pick(SMALL_ROCKS), (Math.random() > 0.5 ? 1 : -1) * _rnd(7, 16), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(1.8, 2.8), _yaw())
  }
  for (let i = 0; i < 5; i++) {
    _place(root, 'grass_large', (Math.random() > 0.5 ? 1 : -1) * _rnd(6, 16), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.0, 2.8), _yaw())
  }
  // Sandcastles stay primitive — the kit has none, and kids love them.
  const sandMat = _pbr(scene, new Color3(0.94, 0.82, 0.55))
  for (let i = 0; i < 2; i++) {
    const sx = (Math.random() > 0.5 ? 9 : -9) + _rnd(-1.5, 1.5)
    const sz = zStart + 5 + i * 14
    const baseB = MeshBuilder.CreateBox('sc', { width: 1.4, height: 0.5, depth: 1.4 }, scene)
    baseB.position = new Vector3(sx, 0.25, sz); baseB.material = sandMat; baseB.parent = root
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const tower = MeshBuilder.CreateCylinder('sct', { height: 0.8, diameter: 0.36, tessellation: 6 }, scene)
      tower.position = new Vector3(sx + dx, 0.65, sz + dz); tower.material = sandMat; tower.parent = root
      const roof = MeshBuilder.CreateCylinder('scr', { height: 0.3, diameterTop: 0, diameterBottom: 0.4, tessellation: 6 }, scene)
      roof.position = new Vector3(sx + dx, 1.2, sz + dz); roof.material = sandMat; roof.parent = root
    }
  }
}

// ─── Shared prop builders ─────────────────────────────────────────────────────

/**
 * Round "lollipop" tree: three overlapping low-segment spheres on a
 * trunk. Flat-shaded, the facets give it the chunky hand-made look the
 * reference art has; the offset spheres stop it reading as a single ball.
 */
function _addPuffTree(scene: Scene, parent: Mesh, x: number, z: number, leafMat: PBRMaterial): void {
  const s    = 0.85 + Math.random() * 0.55
  const yaw  = Math.random() * Math.PI * 2

  const trunk = MeshBuilder.CreateCylinder('tr', { height: 1.6 * s, diameterTop: 0.24 * s, diameterBottom: 0.34 * s, tessellation: 7 }, scene)
  trunk.position = new Vector3(x, 0.8 * s, z); trunk.rotation.y = yaw
  trunk.material = trunkMat; trunk.receiveShadows = true; trunk.parent = parent

  const puffs: [number, number, number, number][] = [
    [0, 2.4, 0, 2.3], [0.7, 2.0, 0.3, 1.6], [-0.6, 2.1, -0.4, 1.5], [0.1, 3.1, 0.2, 1.5],
  ]
  for (const [px, py, pz, d] of puffs) {
    const puff = MeshBuilder.CreateSphere('puff', { diameter: d * s, segments: 5 }, scene)
    puff.position = new Vector3(x + px * s, py * s, z + pz * s)
    puff.rotation.y = yaw
    puff.material = leafMat; puff.receiveShadows = true; puff.parent = parent
  }
}

function _addBush(scene: Scene, parent: Mesh, x: number, z: number, leafMat: PBRMaterial): void {
  const s = 0.6 + Math.random() * 0.5
  for (let i = 0; i < 3; i++) {
    const b = MeshBuilder.CreateSphere('bush', { diameter: (0.9 - i * 0.15) * s, segments: 4 }, scene)
    b.position = new Vector3(x + (i - 1) * 0.35 * s, 0.32 * s, z + (Math.random() - 0.5) * 0.3)
    b.material = leafMat; b.parent = parent
  }
}

function _addPineTree(scene: Scene, parent: Mesh, x: number, z: number, leafMat: PBRMaterial): void {
  const height = 3.8 + Math.random() * 2.4
  const s      = 0.85 + Math.random() * 0.45
  const yaw    = Math.random() * Math.PI * 2

  const trunk  = MeshBuilder.CreateCylinder('pt', { height: 1.2 * s, diameter: 0.26 * s, tessellation: 6 }, scene)
  trunk.position = new Vector3(x, 0.6 * s, z); trunk.rotation.y = yaw
  trunk.material = trunkMat; trunk.parent = parent

  for (let tier = 0; tier < 4; tier++) {
    const tierH  = height * (0.45 + tier * 0.12) * s
    const diam   = (2.6 - tier * 0.48) * s
    const cone   = MeshBuilder.CreateCylinder(`pc${tier}`, { height: diam * 0.95, diameterTop: 0, diameterBottom: diam, tessellation: 7 }, scene)
    cone.position = new Vector3(x, tierH, z)
    cone.rotation.y = yaw + tier * 0.55
    cone.material = leafMat; cone.parent = parent
  }
}

function _addMushroom(scene: Scene, parent: Mesh, x: number, z: number, s = 1): void {
  const stemMat = _pbr(scene, new Color3(0.95, 0.90, 0.82))
  const capMat  = _pbr(scene, new Color3(0.92, 0.15, 0.12))
  const dotMat  = _pbr(scene, new Color3(1, 1, 1))
  const stem    = MeshBuilder.CreateCylinder('ms', { height: 0.4 * s, diameterTop: 0.16 * s, diameterBottom: 0.22 * s, tessellation: 7 }, scene)
  stem.position = new Vector3(x, 0.2 * s, z); stem.material = stemMat; stem.parent = parent
  const cap     = MeshBuilder.CreateSphere('mc', { diameter: 0.6 * s, segments: 6 }, scene)
  cap.scaling   = new Vector3(1, 0.7, 1)
  cap.position  = new Vector3(x, 0.5 * s, z); cap.material = capMat; cap.parent = parent
  for (let i = 0; i < 3; i++) {
    const dot = MeshBuilder.CreateSphere('md', { diameter: 0.09 * s, segments: 3 }, scene)
    const a   = (i / 3) * Math.PI * 2
    dot.position = new Vector3(x + Math.cos(a) * 0.17 * s, 0.56 * s, z + Math.sin(a) * 0.17 * s)
    dot.material = dotMat; dot.parent = parent
  }
}

function _addPalmTree(scene: Scene, parent: Mesh, x: number, z: number): void {
  const palmTrunkMat = _pbr(scene, new Color3(0.76, 0.58, 0.32))
  const frondMat     = _pbr(scene, new Color3(0.22, 0.74, 0.28))
  const coconutMat   = _pbr(scene, new Color3(0.45, 0.28, 0.12))

  const tilt   = (Math.random() - 0.5) * 0.25
  const height = 4.5 + Math.random() * 1.8

  const trunk  = MeshBuilder.CreateCylinder('pmt', { height, diameterBottom: 0.40, diameterTop: 0.24, tessellation: 7 }, scene)
  trunk.position = new Vector3(x, height / 2, z)
  trunk.rotation.z = tilt; trunk.material = palmTrunkMat; trunk.parent = parent

  const topX = x + Math.sin(tilt) * height
  const topY = height

  for (let f = 0; f < 7; f++) {
    const angle = (f / 7) * Math.PI * 2
    const frond = MeshBuilder.CreateBox('pf', { width: 0.30, height: 0.06, depth: 2.4 }, scene)
    frond.scaling.x = 1 // tapered look comes from the flat shading + droop
    frond.position = new Vector3(topX + Math.cos(angle) * 1.05, topY + 0.15, z + Math.sin(angle) * 1.05)
    frond.rotation = new Vector3(-0.55, -angle + Math.PI / 2, 0.15)
    frond.material = frondMat; frond.parent = parent
  }

  for (let c = 0; c < 3; c++) {
    const ca = c / 3 * Math.PI * 2
    const coc = MeshBuilder.CreateSphere('cc', { diameter: 0.26, segments: 4 }, scene)
    coc.position = new Vector3(topX + Math.cos(ca) * 0.22, topY - 0.15, z + Math.sin(ca) * 0.22)
    coc.material = coconutMat; coc.parent = parent
  }
}

function _addUmbrella(scene: Scene, parent: Mesh, x: number, z: number): void {
  const umbrellaColors = [
    _pbr(scene, new Color3(1, 0.25, 0.3)),
    _pbr(scene, new Color3(1, 0.85, 0.1)),
    _pbr(scene, new Color3(0.2, 0.6, 1)),
  ]
  const poleMat2 = _pbr(scene, new Color3(0.9, 0.9, 0.9))

  const pole = MeshBuilder.CreateCylinder('up', { height: 2.2, diameter: 0.08, tessellation: 5 }, scene)
  pole.position = new Vector3(x, 1.1, z); pole.material = poleMat2; pole.parent = parent

  const canopy = MeshBuilder.CreateCylinder('uc', { height: 0.5, diameterBottom: 2.2, diameterTop: 0, tessellation: 8 }, scene)
  canopy.position = new Vector3(x, 2.3, z)
  canopy.material = umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)]
  canopy.parent = parent

  // A towel under it
  const towel = MeshBuilder.CreateBox('towel', { width: 0.9, height: 0.04, depth: 1.8 }, scene)
  towel.position = new Vector3(x + 0.6, 0.02, z)
  towel.material = umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)]
  towel.parent = parent
}

function _addSpacePillar(scene: Scene, parent: Mesh, x: number, z: number, col: Color3): void {
  const glowCol = _emissive(scene, col)
  const pillar  = MeshBuilder.CreateCylinder('pil', { height: 5, diameter: 0.22, tessellation: 6 }, scene)
  pillar.position = new Vector3(x, 2.5, z); pillar.material = glowCol; pillar.parent = parent

  for (let r = 0; r < 3; r++) {
    const ring = MeshBuilder.CreateTorus('ring', { diameter: 0.80, thickness: 0.06, tessellation: 16 }, scene)
    ring.position = new Vector3(x, 1.0 + r * 1.5, z); ring.material = glowCol; ring.parent = parent
  }
}

/**
 * Textured building. Window bays repeat every 3 m via faceUV, so the
 * facade is one box instead of dozens of window meshes — cheaper and it
 * looks like a building rather than a box with stickers.
 */
function _addCityBuilding(scene: Scene, parent: Mesh, x: number, z: number, w: number, h: number, d: number): void {
  const bay = 3
  const faceUV = [
    new Vector4(0, 0, w / bay, h / bay), new Vector4(0, 0, w / bay, h / bay),
    new Vector4(0, 0, d / bay, h / bay), new Vector4(0, 0, d / bay, h / bay),
    new Vector4(0, 0, 0.02, 0.02),       new Vector4(0, 0, 0.02, 0.02),
  ]
  const bld = MeshBuilder.CreateBox('bld', { width: w, height: h, depth: d, faceUV }, scene)
  bld.position = new Vector3(x, h / 2, z)
  bld.material = bldMats[Math.floor(Math.random() * bldMats.length)]
  bld.receiveShadows = true; bld.parent = parent

  // Roof lip and a water tank or antenna
  const lip = MeshBuilder.CreateBox('lip', { width: w + 0.3, height: 0.3, depth: d + 0.3 }, scene)
  lip.position = new Vector3(x, h + 0.1, z)
  lip.material = _pbr(scene, new Color3(0.45, 0.45, 0.50), 0.2, 0.8); lip.parent = parent

  if (Math.random() > 0.5) {
    const ant = MeshBuilder.CreateCylinder('ant', { height: 1.8, diameter: 0.08, tessellation: 4 }, scene)
    ant.position = new Vector3(x, h + 1.0, z); ant.material = poleMat; ant.parent = parent
    const blink = MeshBuilder.CreateSphere('blink', { diameter: 0.18, segments: 4 }, scene)
    blink.position = new Vector3(x, h + 1.95, z); blink.material = _emissive(scene, new Color3(1, 0.1, 0.1)); blink.parent = parent
  } else {
    const tank = MeshBuilder.CreateCylinder('tank', { height: 1.2, diameter: 1.2, tessellation: 8 }, scene)
    tank.position = new Vector3(x + w * 0.2, h + 0.85, z); tank.material = _pbr(scene, new Color3(0.60, 0.42, 0.30)); tank.parent = parent
  }
}

function _addBillboard(scene: Scene, parent: Mesh, x: number, z: number): void {
  const panelColors = [
    new Color3(1, 0.35, 0.55), new Color3(0.25, 0.75, 1), new Color3(1, 0.80, 0.10), new Color3(0.45, 0.85, 0.35),
  ]
  const col = panelColors[Math.floor(Math.random() * panelColors.length)]
  const post = MeshBuilder.CreateCylinder('bbp', { height: 4.5, diameter: 0.18, tessellation: 6 }, scene)
  post.position = new Vector3(x, 2.25, z); post.material = poleMat; post.parent = parent
  const frame = MeshBuilder.CreateBox('bbf', { width: 3.2, height: 1.9, depth: 0.16 }, scene)
  frame.position = new Vector3(x, 5.2, z); frame.material = _pbr(scene, new Color3(0.95, 0.95, 0.95)); frame.parent = parent
  const panel = MeshBuilder.CreateBox('bbpanel', { width: 2.9, height: 1.6, depth: 0.06 }, scene)
  panel.position = new Vector3(x, 5.2, z - 0.1); panel.material = _emissive(scene, col); panel.parent = parent
  // A big simple "smiley" — two eyes and a mouth — kids notice faces.
  const face = _emissive(scene, new Color3(1, 1, 1))
  for (const ex of [-0.5, 0.5]) {
    const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.28, segments: 4 }, scene)
    eye.position = new Vector3(x + ex, 5.45, z - 0.16); eye.material = face; eye.parent = parent
  }
  for (const [mx, my, rot] of [[-0.42, 4.95, -0.7], [0, 4.82, 0], [0.42, 4.95, 0.7]] as [number, number, number][]) {
    const m = MeshBuilder.CreateBox('mouth', { width: 0.42, height: 0.14, depth: 0.04 }, scene)
    m.position = new Vector3(x + mx, my, z - 0.16); m.rotation.z = rot
    m.material = face; m.parent = parent
  }
}

function _addLamp(scene: Scene, parent: Mesh, x: number, z: number): void {
  const inward = x > 0 ? -1 : 1
  const pole   = MeshBuilder.CreateCylinder('pole', { height: 4.2, diameter: 0.12, tessellation: 6 }, scene)
  pole.position = new Vector3(x, 2.1, z); pole.material = poleMat; pole.parent = parent

  const foot   = MeshBuilder.CreateCylinder('foot', { height: 0.3, diameter: 0.34, tessellation: 6 }, scene)
  foot.position = new Vector3(x, 0.15, z); foot.material = poleMat; foot.parent = parent

  const arm    = MeshBuilder.CreateBox('arm', { width: 0.10, height: 0.10, depth: 1.1 }, scene)
  arm.rotation.y = Math.PI / 2
  arm.position = new Vector3(x + inward * 0.55, 4.1, z); arm.material = poleMat; arm.parent = parent

  const bulb   = MeshBuilder.CreateSphere('bulb', { diameter: 0.36, segments: 5 }, scene)
  bulb.position = new Vector3(x + inward * 1.1, 3.98, z); bulb.material = glowMat; bulb.parent = parent
}

// ─── Material helpers (cached — never create duplicate materials) ─────────────

function _pbr(scene: Scene, color: Color3, metallic = 0, roughness = 0.82): PBRMaterial {
  const key = `p:${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)},${metallic},${roughness}`
  let m = _matCache.get(key) as PBRMaterial | undefined
  if (!m) {
    m = new PBRMaterial(key, scene)
    m.albedoColor = color; m.metallic = metallic; m.roughness = roughness
    _matCache.set(key, m)
  }
  return m
}

function _emissive(scene: Scene, color: Color3): StandardMaterial {
  const key = `e:${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)}`
  let m = _matCache.get(key) as StandardMaterial | undefined
  if (!m) {
    m = new StandardMaterial(key, scene)
    m.emissiveColor   = color
    m.disableLighting = true
    _matCache.set(key, m)
  }
  return m
}
