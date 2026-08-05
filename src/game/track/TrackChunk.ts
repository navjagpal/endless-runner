import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Material,
  Color3,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core'
import { styleChunk } from './ChunkStyling'
import { getQualityProfile } from '../core/DeviceTier'

export const LANE_POSITIONS = [-2.5, 0, 2.5]
export const CHUNK_LENGTH   = 30

/** Report the merge ratio once per session rather than every 30 metres. */
let _loggedStyleStats = false

export interface ChunkData { root: Mesh; zStart: number; zEnd: number }

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

function initShared(scene: Scene): void {
  if (_scene === scene) return
  _scene = scene
  _matCache.clear()

  sharedRoadMat             = new PBRMaterial('road', scene)
  sharedRoadMat.albedoColor = new Color3(0.22, 0.22, 0.26)
  sharedRoadMat.metallic    = 0.0
  sharedRoadMat.roughness   = 0.40

  sharedGrassMat             = new PBRMaterial('grass', scene)
  sharedGrassMat.albedoColor = new Color3(0.20, 0.56, 0.14)
  sharedGrassMat.metallic    = 0
  sharedGrassMat.roughness   = 1.0

  curbMat             = new PBRMaterial('curb', scene)
  curbMat.albedoColor = new Color3(0.88, 0.88, 0.85)
  curbMat.metallic    = 0; curbMat.roughness = 0.65

  dashMat                 = new StandardMaterial('dash', scene)
  dashMat.emissiveColor   = new Color3(1, 0.96, 0.35)
  dashMat.disableLighting = true

  trunkMat             = new PBRMaterial('trunk', scene)
  trunkMat.albedoColor = new Color3(0.45, 0.28, 0.10)
  trunkMat.metallic    = 0; trunkMat.roughness = 1.0

  poleMat             = new PBRMaterial('pole', scene)
  poleMat.albedoColor = new Color3(0.72, 0.72, 0.76)
  poleMat.metallic    = 0.6; poleMat.roughness = 0.35

  glowMat                 = new StandardMaterial('glow', scene)
  glowMat.emissiveColor   = new Color3(1.0, 0.92, 0.60)
  glowMat.disableLighting = true
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

  // ── Road ──
  const road = MeshBuilder.CreateBox('road', { width: 9, height: 0.20, depth: CHUNK_LENGTH }, scene)
  road.position = new Vector3(0, -0.10, zMid)
  road.material = sharedRoadMat
  road.receiveShadows = true
  road.parent = root

  // ── Grass / ground shoulders ──
  for (const side of [-1, 1]) _addGroundShoulder(scene, root, side, zStart, zMid)

  // ── Curbs ──
  for (const side of [-1, 1]) {
    const curb = MeshBuilder.CreateBox('curb', { width: 0.36, height: 0.18, depth: CHUNK_LENGTH }, scene)
    curb.position = new Vector3(side * 4.7, 0.0, zMid)
    curb.material = curbMat
    curb.receiveShadows = true
    curb.parent = root
  }

  // ── Lane dashes ──
  for (const laneX of [-1.25, 1.25]) {
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

  // ── Zone-specific props ──
  _addZoneProps(scene, root, zStart, zoneId)

  // ── Lamp posts (all zones — colour changes via lamp point lights) ──
  if (!isSpace) {
    for (let i = 0; i < 2; i++) {
      const lz = zStart + 5 + i * 15
      for (const side of [-1, 1]) _addLamp(scene, root, side * 5.5, lz)
    }
  }

  // Collapse the chunk's ~100 loose meshes into one per material, then
  // flat-shade and gradient the props. Everything above this point is
  // static, so nothing is lost by baking it down.
  const stats = styleChunk(root, {
    plainMaterials: _plainMaterials(),
    authoredColorMaterials: new Set<Material>([sharedGrassMat]),
    flatShade: getQualityProfile().flatShade,
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

/**
 * The verge either side of the road.
 *
 * This used to be a single flat box, which made it the largest unbroken
 * area of one colour on the screen — and it got *more* conspicuous once
 * the props around it were flat-shaded and gradiented, because it was
 * then the only thing left with no form at all.
 *
 * A flat plane can't be helped by a vertical gradient, so it gets actual
 * geometry instead: a subdivided grid with low-amplitude noise pushed
 * through it. Combined with flat shading, the facets catch the sun at
 * slightly different angles and the ground reads as terrain rather than
 * as a fill colour. Per-vertex tint variation on top breaks up whatever
 * uniformity survives.
 *
 * The displacement is faded out toward the road so the verge still meets
 * the curb flush — a bumpy edge there would show daylight under the
 * kerbstones.
 */
function _addGroundShoulder(scene: Scene, root: Mesh, side: number, zStart: number, zMid: number): void {
  const WIDTH = 22
  const COLS  = 10
  const ROWS  = 10
  const AMPLITUDE = 0.38

  const ground = MeshBuilder.CreateGround('grass', {
    width: WIDTH, height: CHUNK_LENGTH, subdivisionsX: COLS, subdivisionsY: ROWS,
  }, scene)
  ground.position = new Vector3(side * 15.5, -0.05, zMid)

  const positions = ground.getVerticesData(VertexBuffer.PositionKind)
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4)
    for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
      const lx = positions[i]      // local x, -WIDTH/2 .. WIDTH/2
      const lz = positions[i + 2]
      // World x of this vertex; distance from the road edge decides how
      // much displacement it's allowed.
      const worldX = side * 15.5 + lx
      const fromRoad = Math.max(0, Math.abs(worldX) - 5.6)
      const fade = Math.min(1, fromRoad / 3.5)

      // Cheap deterministic noise — two offset sine products. Value noise
      // would be better but this is a verge seen at speed, not a heightmap.
      const wx = worldX * 0.35
      const wz = (zStart + lz) * 0.28
      const n = Math.sin(wx) * Math.cos(wz) + 0.5 * Math.sin(wx * 2.3 + 1.7) * Math.cos(wz * 1.9)

      // The undulation hangs *below* the road plane and never rises above
      // it. The camera sits low and sights a long way down the corridor,
      // so ground even a few centimetres proud of the road stacks up in
      // perspective into a band that closes over the track and hides the
      // obstacles the player is trying to read. Mapping the noise to
      // [-AMPLITUDE, 0] rather than ±AMPLITUDE keeps all the shape and
      // makes that failure geometrically impossible.
      positions[i + 1] = Math.min(0, (n - 1) * 0.5) * AMPLITUDE * fade

      // Tint follows the height a little, plus a small independent wobble,
      // so even the flat strip beside the road isn't one solid colour.
      const tint = 0.88 + n * 0.10 + Math.sin(wx * 5.1 + wz * 3.3) * 0.045
      colors[c] = colors[c + 1] = colors[c + 2] = tint
      colors[c + 3] = 1
    }
    ground.setVerticesData(VertexBuffer.PositionKind, positions, false)
    ground.setVerticesData(VertexBuffer.ColorKind, colors, false)
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
    case 'beach':  _addBeachProps(scene, root, zStart, spacing);  break
    case 'space':  _addSpaceProps(scene, root, zStart, spacing);  break
    default:       _addMeadowProps(scene, root, zStart, spacing); break
  }
}

// ─── Meadow: round trees, white fences, daisies ───────────────────────────────

function _addMeadowProps(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  const leafMatA = _pbr(scene, new Color3(0.14, 0.62, 0.12))
  const leafMatB = _pbr(scene, new Color3(0.22, 0.74, 0.08))
  const fenceMat = _pbr(scene, new Color3(0.96, 0.96, 0.94))

  for (let i = 0; i < 5; i++) {
    const z = zStart + 1 + i * spacing + (Math.random() - 0.5) * 2
    for (const side of [-1, 1]) {
      _addRoundTree(scene, root, side * 7.8, z, Math.random() > 0.5 ? leafMatA : leafMatB)
    }
  }

  // Fence posts + rails
  for (let i = 0; i < 6; i++) {
    const z = zStart + i * 5
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateBox('fp', { width: 0.12, height: 0.9, depth: 0.12 }, scene)
      post.position = new Vector3(side * 5.3, 0.45, z)
      post.material = fenceMat
      post.parent   = root
    }
  }
  for (const side of [-1, 1]) {
    const rail = MeshBuilder.CreateBox('rail', { width: 0.08, height: 0.08, depth: CHUNK_LENGTH }, scene)
    rail.position = new Vector3(side * 5.3, 0.65, zStart + CHUNK_LENGTH / 2)
    rail.material = fenceMat
    rail.parent   = root
  }

  // Daisy flowers
  const stemMat   = _pbr(scene, new Color3(0.2, 0.7, 0.2))
  const petalMats = [
    _pbr(scene, new Color3(1, 0.9, 0.2)),
    _pbr(scene, new Color3(1, 0.4, 0.5)),
    _pbr(scene, new Color3(1, 1, 1)),
  ]
  for (let i = 0; i < 8; i++) {
    const fx = (Math.random() - 0.5) * 18 + (Math.random() > 0.5 ? 8 : -8)
    const fz = zStart + Math.random() * CHUNK_LENGTH
    const stem = MeshBuilder.CreateCylinder('stem', { height: 0.22, diameter: 0.04, tessellation: 4 }, scene)
    stem.position = new Vector3(fx, 0.11, fz)
    stem.material = stemMat
    stem.parent   = root
    const petal = MeshBuilder.CreateSphere('petal', { diameter: 0.18 }, scene)
    petal.position = new Vector3(fx, 0.26, fz)
    petal.material = petalMats[Math.floor(Math.random() * petalMats.length)]
    petal.parent   = root
  }
}

// ─── Forest: pine trees, mushrooms, rocks ─────────────────────────────────────

function _addForestProps(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  const darkLeaf = _pbr(scene, new Color3(0.10, 0.40, 0.08))
  const pineLeaf = _pbr(scene, new Color3(0.05, 0.32, 0.04))
  const rockMat  = _pbr(scene, new Color3(0.40, 0.38, 0.35))

  for (let i = 0; i < 6; i++) {
    const z = zStart + i * (spacing * 0.85)
    for (const side of [-1, 1]) {
      const x = side * (7.5 + Math.random() * 3)
      _addPineTree(scene, root, x, z, Math.random() > 0.4 ? darkLeaf : pineLeaf)
    }
  }

  for (let i = 0; i < 4; i++) {
    const mx = (Math.random() - 0.5) * 16 + (Math.random() > 0.5 ? 7 : -7)
    const mz = zStart + Math.random() * CHUNK_LENGTH
    _addMushroom(scene, root, mx, mz)
  }

  for (let i = 0; i < 3; i++) {
    const rx = (Math.random() - 0.5) * 12 + (Math.random() > 0.5 ? 8 : -8)
    const rz = zStart + Math.random() * CHUNK_LENGTH
    const rock = MeshBuilder.CreateSphere('rock', { diameter: 0.5 + Math.random() * 0.6, segments: 4 }, scene)
    rock.scaling = new Vector3(1 + Math.random() * 0.4, 0.7, 1 + Math.random() * 0.4)
    rock.position = new Vector3(rx, 0.2, rz)
    rock.material = rockMat
    rock.parent = root
  }
}

// ─── City: buildings, neon signs, more props ─────────────────────────────────

function _addCityProps(scene: Scene, root: Mesh, zStart: number, _spacing: number): void {
  // More buildings, more variety, neon trim
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const bz = zStart + i * (CHUNK_LENGTH / 5) + Math.random() * 2
      const bh = 5 + Math.random() * 16
      const bw = 2.5 + Math.random() * 4
      const bd = 2.5 + Math.random() * 2.5
      const bx = side * (15 + Math.random() * 8)
      _addCityBuilding(scene, root, bx, bz, bw, bh, bd)
    }
  }

  // Neon billboard frames on building faces
  for (let i = 0; i < 3; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const bz   = zStart + 3 + i * 9
    const bx   = side * 14
    _addNeonSign(scene, root, bx, bz)
  }
}

// ─── Beach: palm trees, umbrellas, surfboards ─────────────────────────────────

function _addBeachProps(scene: Scene, root: Mesh, zStart: number, spacing: number): void {
  const surfMats = [
    _pbr(scene, new Color3(1, 0.2, 0.2), 0.3, 0.4),
    _pbr(scene, new Color3(0.2, 0.6, 1), 0.3, 0.4),
    _pbr(scene, new Color3(1, 0.85, 0.1), 0.3, 0.4),
  ]

  for (let i = 0; i < 5; i++) {
    const z = zStart + 1 + i * spacing + (Math.random() - 0.5) * 2
    for (const side of [-1, 1]) {
      _addPalmTree(scene, root, side * (7 + Math.random() * 3), z)
    }
  }

  for (let i = 0; i < 3; i++) {
    const ux = (Math.random() > 0.5 ? 8 : -8) + (Math.random() - 0.5) * 2
    const uz = zStart + Math.random() * CHUNK_LENGTH
    _addUmbrella(scene, root, ux, uz)
  }

  for (let i = 0; i < 2; i++) {
    const sx = (Math.random() > 0.5 ? 9 : -9)
    const sz = zStart + 5 + i * 12
    const sb = MeshBuilder.CreateBox('surf', { width: 0.4, height: 0.08, depth: 1.8 }, scene)
    sb.position = new Vector3(sx, 0.04, sz)
    sb.rotation.y = Math.random() * 0.5
    sb.material = surfMats[i % surfMats.length]
    sb.parent = root
  }
}

// ─── Space: neon pillars, asteroids, glowing grid lines ──────────────────────

function _addSpaceProps(scene: Scene, root: Mesh, zStart: number, _spacing: number): void {
  const neonGridMat  = _emissive(scene, new Color3(0.28, 0.08, 1.0))
  const starMat      = _emissive(scene, new Color3(0.8, 0.8, 1.0))
  const asteroidMat  = _pbr(scene, new Color3(0.22, 0.18, 0.28), 0.2, 0.8)
  const pillarColors = [new Color3(1, 0.1, 0.8), new Color3(0.1, 0.8, 1), new Color3(0.6, 0.1, 1)]

  for (let i = 0; i < 7; i++) {
    const gz = zStart + i * (CHUNK_LENGTH / 7) + 1
    const hLine = MeshBuilder.CreateBox('hg', { width: 8.8, height: 0.015, depth: 0.06 }, scene)
    hLine.position = new Vector3(0, 0.015, gz)
    hLine.material = neonGridMat
    hLine.parent   = root
  }
  for (const lx of [-2.2, 0, 2.2]) {
    const vLine = MeshBuilder.CreateBox('vg', { width: 0.06, height: 0.015, depth: CHUNK_LENGTH }, scene)
    vLine.position = new Vector3(lx, 0.015, zStart + CHUNK_LENGTH / 2)
    vLine.material = neonGridMat
    vLine.parent   = root
  }

  for (let i = 0; i < 4; i++) {
    const z    = zStart + 3 + i * 7
    const side = i % 2 === 0 ? -1 : 1
    _addSpacePillar(scene, root, side * 6, z, pillarColors[i % pillarColors.length])
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
    const star = MeshBuilder.CreateSphere('s', { diameter: 0.06 }, scene)
    star.position = new Vector3(sx, 0.01, sz)
    star.material = starMat
    star.parent   = root
  }
}

// ─── Shared prop builders ─────────────────────────────────────────────────────

// Silhouette variance.
//
// Every tree used to be built at exactly one size and orientation, so a
// row of them read as the same asset stamped repeatedly — the strongest
// "this is placeholder" tell there is. Scale and yaw cost nothing.
//
// Yaw is only worth applying because of flat shading: a smooth-shaded
// cone is rotationally symmetric and turning it changes nothing, but a
// faceted one presents different edges to the light.

function _addRoundTree(scene: Scene, parent: Mesh, x: number, z: number, leafMat: PBRMaterial): void {
  const s    = 0.82 + Math.random() * 0.46
  const yaw  = Math.random() * Math.PI * 2

  const trunk = MeshBuilder.CreateCylinder('tr', { height: 1.5 * s, diameter: 0.28 * s, tessellation: 7 }, scene)
  trunk.position = new Vector3(x, 0.75 * s, z); trunk.rotation.y = yaw
  trunk.material = trunkMat; trunk.receiveShadows = true; trunk.parent = parent

  const low = MeshBuilder.CreateCylinder('tl0', { height: 1.7 * s, diameterTop: 0, diameterBottom: 2.2 * s, tessellation: 8 }, scene)
  low.position = new Vector3(x, 2.1 * s, z); low.rotation.y = yaw
  low.material = leafMat; low.receiveShadows = true; low.parent = parent

  const high = MeshBuilder.CreateCylinder('tl1', { height: 1.3 * s, diameterTop: 0, diameterBottom: 1.5 * s, tessellation: 8 }, scene)
  high.position = new Vector3(x, 3.05 * s, z); high.rotation.y = yaw + 0.4
  high.material = leafMat; high.parent = parent
}

function _addPineTree(scene: Scene, parent: Mesh, x: number, z: number, leafMat: PBRMaterial): void {
  const height = 3.5 + Math.random() * 2
  const s      = 0.85 + Math.random() * 0.40
  const yaw    = Math.random() * Math.PI * 2

  const trunk  = MeshBuilder.CreateCylinder('pt', { height: 1.0 * s, diameter: 0.22 * s, tessellation: 6 }, scene)
  trunk.position = new Vector3(x, 0.5 * s, z); trunk.rotation.y = yaw
  trunk.material = trunkMat; trunk.parent = parent

  for (let tier = 0; tier < 4; tier++) {
    const tierH  = height * (0.45 + tier * 0.12) * s
    const diam   = (2.4 - tier * 0.44) * s
    const cone   = MeshBuilder.CreateCylinder(`pc${tier}`, { height: diam * 0.9, diameterTop: 0, diameterBottom: diam, tessellation: 7 }, scene)
    cone.position = new Vector3(x, tierH, z)
    // Stagger the yaw per tier so the facets don't line up into a seam
    // running down the tree.
    cone.rotation.y = yaw + tier * 0.55
    cone.material = leafMat; cone.parent = parent
  }
}

function _addMushroom(scene: Scene, parent: Mesh, x: number, z: number): void {
  const stemMat = _pbr(scene, new Color3(0.92, 0.88, 0.82))
  const capMat  = _pbr(scene, new Color3(0.85, 0.12, 0.10))
  const dotMat  = _pbr(scene, new Color3(1, 1, 1))
  const stem    = MeshBuilder.CreateCylinder('ms', { height: 0.35, diameterTop: 0.14, diameterBottom: 0.18, tessellation: 7 }, scene)
  stem.position = new Vector3(x, 0.175, z); stem.material = stemMat; stem.parent = parent
  const cap     = MeshBuilder.CreateSphere('mc', { diameter: 0.52 }, scene)
  cap.scaling   = new Vector3(1, 0.72, 1)
  cap.position  = new Vector3(x, 0.47, z); cap.material = capMat; cap.parent = parent
  for (let i = 0; i < 3; i++) {
    const dot = MeshBuilder.CreateSphere('md', { diameter: 0.07 }, scene)
    const a   = (i / 3) * Math.PI * 2
    dot.position = new Vector3(x + Math.cos(a) * 0.14, 0.52, z + Math.sin(a) * 0.14)
    dot.material = dotMat; dot.parent = parent
  }
}

function _addPalmTree(scene: Scene, parent: Mesh, x: number, z: number): void {
  const palmTrunkMat = _pbr(scene, new Color3(0.72, 0.55, 0.28))
  const frondMat     = _pbr(scene, new Color3(0.18, 0.70, 0.22))
  const coconutMat   = _pbr(scene, new Color3(0.45, 0.28, 0.12))

  const tilt   = (Math.random() - 0.5) * 0.2
  const height = 4.5 + Math.random() * 1.5

  const trunk  = MeshBuilder.CreateCylinder('pmt', { height, diameterBottom: 0.36, diameterTop: 0.22, tessellation: 7 }, scene)
  trunk.position = new Vector3(x, height / 2, z)
  trunk.rotation.z = tilt; trunk.material = palmTrunkMat; trunk.parent = parent

  const topX = x + Math.sin(tilt) * height
  const topY = height

  // Fronds fanning out
  for (let f = 0; f < 7; f++) {
    const angle = (f / 7) * Math.PI * 2
    const frond = MeshBuilder.CreateBox('pf', { width: 0.14, height: 0.08, depth: 1.8 }, scene)
    frond.position = new Vector3(topX + Math.cos(angle) * 0.9, topY + 0.3, z + Math.sin(angle) * 0.9)
    frond.rotation = new Vector3(-0.4, angle, 0.2)
    frond.material = frondMat; frond.parent = parent
  }

  // Coconut cluster
  for (let c = 0; c < 3; c++) {
    const ca = c / 3 * Math.PI * 2
    const coc = MeshBuilder.CreateSphere('cc', { diameter: 0.24 }, scene)
    coc.position = new Vector3(topX + Math.cos(ca) * 0.22, topY - 0.15, z + Math.sin(ca) * 0.22)
    coc.material = coconutMat; coc.parent = parent
  }
}

function _addUmbrella(scene: Scene, parent: Mesh, x: number, z: number): void {
  const umbrellaColors = [
    _pbr(scene, new Color3(1, 0.2, 0.2)),
    _pbr(scene, new Color3(1, 0.85, 0.1)),
    _pbr(scene, new Color3(0.2, 0.6, 1)),
  ]
  const poleMat2 = _pbr(scene, new Color3(0.9, 0.9, 0.9))

  const pole = MeshBuilder.CreateCylinder('up', { height: 2.2, diameter: 0.08, tessellation: 5 }, scene)
  pole.position = new Vector3(x, 1.1, z); pole.material = poleMat2; pole.parent = parent

  const canopy = MeshBuilder.CreateCylinder('uc', { height: 0.2, diameterBottom: 2.0, diameterTop: 0, tessellation: 12 }, scene)
  canopy.position = new Vector3(x, 2.25, z)
  canopy.material = umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)]
  canopy.parent = parent
}

function _addSpacePillar(scene: Scene, parent: Mesh, x: number, z: number, col: Color3): void {
  const glowCol = _emissive(scene, col)
  const pillar  = MeshBuilder.CreateCylinder('pil', { height: 5, diameter: 0.22, tessellation: 6 }, scene)
  pillar.position = new Vector3(x, 2.5, z); pillar.material = glowCol; pillar.parent = parent

  // Rings
  for (let r = 0; r < 3; r++) {
    const ring = MeshBuilder.CreateTorus('ring', { diameter: 0.80, thickness: 0.06, tessellation: 16 }, scene)
    ring.position = new Vector3(x, 1.0 + r * 1.5, z); ring.material = glowCol; ring.parent = parent
  }
}

function _addCityBuilding(scene: Scene, parent: Mesh, x: number, z: number, w: number, h: number, d: number): void {
  const hue    = Math.random()
  const r      = 0.45 + hue * 0.2
  const g      = 0.48 + hue * 0.1
  const bldMat = _pbr(scene, new Color3(r, g, 0.60), 0.2, 0.75)
  const winMat = _emissive(scene, new Color3(1.0, 0.95, 0.7))
  const antMat = _pbr(scene, new Color3(0.5, 0.5, 0.5), 0.6, 0.4)
  const blinkMat = _emissive(scene, new Color3(1, 0.1, 0.1))

  const bld = MeshBuilder.CreateBox('bld', { width: w, height: h, depth: d }, scene)
  bld.position = new Vector3(x, h / 2, z); bld.material = bldMat; bld.receiveShadows = true; bld.parent = parent

  const cols = Math.max(1, Math.floor(w / 0.85))
  for (let row = 0; row < Math.floor(h / 1.5); row++) {
    for (let col = 0; col < cols; col++) {
      if (Math.random() < 0.55) {
        const win = MeshBuilder.CreateBox('win', { width: 0.28, height: 0.38, depth: 0.05 }, scene)
        win.position = new Vector3(x - w / 2 + 0.5 + col * (w / cols), h * 0.12 + row * 1.4, z - d / 2 - 0.01)
        win.material = winMat; win.parent = parent
      }
    }
  }

  if (h > 8 && Math.random() > 0.5) {
    const ant = MeshBuilder.CreateCylinder('ant', { height: 1.5, diameter: 0.06, tessellation: 4 }, scene)
    ant.position = new Vector3(x, h + 0.75, z); ant.material = antMat; ant.parent = parent
    const blink = MeshBuilder.CreateSphere('blink', { diameter: 0.14 }, scene)
    blink.position = new Vector3(x, h + 1.55, z); blink.material = blinkMat; blink.parent = parent
  }
}

function _addNeonSign(scene: Scene, parent: Mesh, x: number, z: number): void {
  const neonColors = [
    _emissive(scene, new Color3(1, 0.05, 0.5)),
    _emissive(scene, new Color3(0.05, 0.8, 1)),
    _emissive(scene, new Color3(1, 0.8, 0.05)),
  ]
  const nMat = neonColors[Math.floor(Math.random() * neonColors.length)]

  const frame = MeshBuilder.CreateBox('nsf', { width: 1.8, height: 0.8, depth: 0.05 }, scene)
  frame.position = new Vector3(x, 4.5, z); frame.material = nMat; frame.parent = parent

  // Border
  for (const [dx, dy, dw, dh] of [
    [0, 0.38, 1.8, 0.06], [0, -0.38, 1.8, 0.06],
    [-0.88, 0, 0.06, 0.8], [0.88, 0, 0.06, 0.8],
  ] as [number, number, number, number][]) {
    const b = MeshBuilder.CreateBox('nb', { width: dw, height: dh, depth: 0.06 }, scene)
    b.position = new Vector3(x + dx, 4.5 + dy, z - 0.04); b.material = nMat; b.parent = parent
  }
}

function _addLamp(scene: Scene, parent: Mesh, x: number, z: number): void {
  const inward = x > 0 ? -1 : 1
  const pole   = MeshBuilder.CreateCylinder('pole', { height: 4.2, diameter: 0.11, tessellation: 6 }, scene)
  pole.position = new Vector3(x, 2.1, z); pole.material = poleMat; pole.parent = parent

  const arm    = MeshBuilder.CreateBox('arm', { width: 0.10, height: 0.10, depth: 1.1 }, scene)
  arm.position = new Vector3(x + inward * 0.55, 4.1, z); arm.material = poleMat; arm.parent = parent

  const bulb   = MeshBuilder.CreateSphere('bulb', { diameter: 0.32 }, scene)
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
