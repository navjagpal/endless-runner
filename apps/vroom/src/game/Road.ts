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
import { styleChunk, getQualityProfile, getAsphaltTexture, getGrassTexture, Kits, terrainYAt } from '@kids/engine'
import { zoneIdAt } from './Zones'

/**
 * The road and its verges, built in 30 m chunks and merged per material,
 * with the hills baked in. Wider than the runner's: vehicles are wide,
 * and a four-year-old wants room to steer.
 */

export const LANE_X       = [-3.1, 0, 3.1]
export const CHUNK_LENGTH = 30
const ROAD_WIDTH = 11

export interface ChunkData { root: Mesh; zStart: number; zEnd: number }

let _scene: Scene | null = null
const _matCache = new Map<string, PBRMaterial | StandardMaterial>()

export let roadMat:  PBRMaterial
export let grassMat: PBRMaterial
let curbMat: PBRMaterial
let dashMat: StandardMaterial
let poleMat: PBRMaterial
let glowMat: StandardMaterial

function initShared(scene: Scene): void {
  if (_scene === scene) return
  _scene = scene
  _matCache.clear()
  roadMat = new PBRMaterial('road', scene)
  roadMat.albedoColor = new Color3(0.32, 0.33, 0.38); roadMat.albedoTexture = getAsphaltTexture(scene)
  roadMat.metallic = 0; roadMat.roughness = 0.85
  grassMat = new PBRMaterial('grass', scene)
  grassMat.albedoColor = new Color3(0.34, 0.74, 0.24); grassMat.albedoTexture = getGrassTexture(scene)
  grassMat.metallic = 0; grassMat.roughness = 1
  curbMat = _pbr(scene, new Color3(0.92, 0.90, 0.86), 0, 0.7)
  dashMat = _emissive(scene, new Color3(1, 1, 0.92))
  poleMat = _pbr(scene, new Color3(0.30, 0.34, 0.42), 0.4, 0.5)
  glowMat = _emissive(scene, new Color3(1.0, 0.92, 0.60))
}

function _pbr(scene: Scene, color: Color3, metallic = 0, roughness = 0.82): PBRMaterial {
  const key = `p:${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)},${metallic},${roughness}`
  let m = _matCache.get(key) as PBRMaterial | undefined
  if (!m) { m = new PBRMaterial(key, scene); m.albedoColor = color; m.metallic = metallic; m.roughness = roughness; _matCache.set(key, m) }
  return m
}
function _emissive(scene: Scene, color: Color3): StandardMaterial {
  const key = `e:${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)}`
  let m = _matCache.get(key) as StandardMaterial | undefined
  if (!m) { m = new StandardMaterial(key, scene); m.emissiveColor = color; m.disableLighting = true; _matCache.set(key, m) }
  return m
}

const _pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
const _rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const _yaw = () => Math.random() * Math.PI * 2

let _footprints: { x: number; z: number; r: number }[] = []
function _place(root: Mesh, model: string, x: number, y: number, z: number, scale: number, yaw = 0): void {
  const size = Kits.place(root, model, x, y, z, scale, yaw)
  if (size) _footprints.push({ x, z, r: Math.max(size.x, size.z) * 0.42 })
}
function _aoAt(x: number, z: number): number {
  let k = 1
  for (const f of _footprints) {
    const d = Math.hypot(x - f.x, z - f.z), reach = f.r * 1.7
    if (d < reach) { const t = d / reach; k *= 1 - 0.42 * (1 - t * t * (3 - 2 * t)) }
  }
  return k
}

export function createChunk(scene: Scene, zStart: number, zoneId: string): ChunkData {
  initShared(scene)
  const root = new Mesh('chunk', scene)
  const zMid = zStart + CHUNK_LENGTH / 2
  _footprints = []

  // Road slab + surface
  const base = MeshBuilder.CreateBox('roadBase', { width: ROAD_WIDTH, height: 0.2, depth: CHUNK_LENGTH }, scene)
  base.position = new Vector3(0, -0.1, zMid); base.material = roadMat; base.parent = root
  _fillVertexColors(base, 0.86)
  const road = MeshBuilder.CreateGround('road', { width: ROAD_WIDTH, height: CHUNK_LENGTH, subdivisionsX: 12, subdivisionsY: 24 }, scene)
  road.position = new Vector3(0, 0.002, zMid)
  const pos = road.getVerticesData(VertexBuffer.PositionKind)!, uvs = road.getVerticesData(VertexBuffer.UVKind)!
  const colors = new Float32Array((pos.length / 3) * 4)
  for (let i = 0, c = 0, u = 0; i < pos.length; i += 3, c += 4, u += 2) {
    const x = pos[i], wz = zMid + pos[i + 2]
    const edge = Math.max(0, (Math.abs(x) - 4.2) / 1.3) * 0.10
    const tint = Math.max(0.6, 1 - edge + Math.sin(wz * 0.9) * Math.cos(x * 1.7) * 0.02)
    colors[c] = colors[c + 1] = colors[c + 2] = tint; colors[c + 3] = 1
    uvs[u] = (x + ROAD_WIDTH / 2) / 3; uvs[u + 1] = wz / 3
  }
  road.setVerticesData(VertexBuffer.ColorKind, colors, false)
  road.setVerticesData(VertexBuffer.UVKind, uvs, false)
  road.useVertexColors = true
  road.material = roadMat; road.parent = root

  // Kerbs, lane dashes, edge lines
  for (const side of [-1, 1]) {
    const curb = MeshBuilder.CreateBox('curb', { width: 0.4, height: 0.18, depth: CHUNK_LENGTH }, scene)
    curb.position = new Vector3(side * (ROAD_WIDTH / 2 + 0.2), 0, zMid); curb.material = curbMat; curb.parent = root
    const line = MeshBuilder.CreateBox('edge', { width: 0.14, height: 0.012, depth: CHUNK_LENGTH }, scene)
    line.position = new Vector3(side * (ROAD_WIDTH / 2 - 0.35), 0.012, zMid); line.material = dashMat; line.parent = root
  }
  for (const lx of [-1.55, 1.55]) {
    for (let i = 0; i < 5; i++) {
      const dash = MeshBuilder.CreateBox('dash', { width: 0.14, height: 0.012, depth: 2.4 }, scene)
      dash.position = new Vector3(lx, 0.012, zStart + 3 + i * 5.5); dash.material = dashMat; dash.parent = root
    }
  }

  _addProps(scene, root, zStart, zoneId)

  for (const side of [-1, 1]) _addShoulder(scene, root, side, zMid)

  styleChunk(root, {
    plainMaterials: new Set<Material>([roadMat, curbMat, dashMat, glowMat]),
    authoredColorMaterials: new Set<Material>([grassMat]),
    preShadedMaterials: Kits.materials,
    flatShade: getQualityProfile().flatShade,
    terrain: terrainYAt,
  })
  return { root, zStart, zEnd: zStart + CHUNK_LENGTH }
}

function _fillVertexColors(mesh: Mesh, tint: number): void {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind)!
  const colors = new Float32Array((p.length / 3) * 4)
  for (let v = 0; v < p.length / 3; v++) { colors[v * 4] = colors[v * 4 + 1] = colors[v * 4 + 2] = tint; colors[v * 4 + 3] = 1 }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false); mesh.useVertexColors = true
}

function _addShoulder(scene: Scene, root: Mesh, side: number, zMid: number): void {
  const WIDTH = 22, cx = side * (ROAD_WIDTH / 2 + WIDTH / 2)
  const g = MeshBuilder.CreateGround('grass', { width: WIDTH, height: CHUNK_LENGTH, subdivisionsX: 22, subdivisionsY: 30 }, scene)
  g.position = new Vector3(cx, -0.05, zMid)
  const pos = g.getVerticesData(VertexBuffer.PositionKind)!, uvs = g.getVerticesData(VertexBuffer.UVKind)!
  const colors = new Float32Array((pos.length / 3) * 4)
  for (let i = 0, c = 0, u = 0; i < pos.length; i += 3, c += 4, u += 2) {
    const wx = cx + pos[i], wz = zMid + pos[i + 2]
    const fromRoad = Math.max(0, Math.abs(wx) - (ROAD_WIDTH / 2 + 1.0)), fade = Math.min(1, fromRoad / 3.5)
    const n = Math.sin(wx * 0.35) * Math.cos(wz * 0.28) + 0.5 * Math.sin(wx * 0.8 + 1.7) * Math.cos(wz * 0.53)
    pos[i + 1] = Math.min(0, (n - 1) * 0.5) * 0.38 * fade
    const tint = (0.90 + n * 0.09 + Math.sin(wx * 1.8 + wz * 0.9) * 0.04) * _aoAt(wx, wz)
    colors[c] = colors[c + 1] = colors[c + 2] = tint; colors[c + 3] = 1
    uvs[u] = wx / 4; uvs[u + 1] = wz / 4
  }
  g.setVerticesData(VertexBuffer.PositionKind, pos, false)
  g.setVerticesData(VertexBuffer.ColorKind, colors, false)
  g.setVerticesData(VertexBuffer.UVKind, uvs, false)
  g.useVertexColors = true; g.createNormals(false)
  g.material = grassMat; g.parent = root
}

const TREES  = ['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_simple', 'tree_tall', 'tree_blocks']
const BUSHES = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed']
const FLOWERS = ['flower_redA', 'flower_purpleA', 'flower_yellowA', 'flower_redB', 'flower_yellowB']
const PINES  = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundA', 'tree_pineRoundB', 'tree_pineDefaultA']
const PALMS  = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palmShort']
const ROCKS  = ['rock_largeA', 'rock_largeB', 'rock_tallA', 'rock_smallA']
const BUILDINGS = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h']
const EDGE = ROAD_WIDTH / 2 + 1.2   // first metre of verge past the kerb

function _addProps(scene: Scene, root: Mesh, zStart: number, zoneId: string): void {
  const nature = Kits.isLoaded('nature'), city = Kits.isLoaded('city')
  const spacing = CHUNK_LENGTH / 5
  if (zoneId === 'country') {
    for (let i = 0; i < 5; i++) {
      const z = zStart + 1 + i * spacing + _rnd(-1, 1)
      for (const side of [-1, 1]) {
        if (nature) _place(root, _pick(TREES), side * _rnd(EDGE + 1.5, EDGE + 3.5), 0, z, _rnd(3.4, 4.8), _yaw())
        if (nature && Math.random() < 0.7) _place(root, _pick(TREES), side * _rnd(EDGE + 6, EDGE + 14), 0, z + spacing / 2, _rnd(3, 4.6), _yaw())
      }
    }
    if (nature) {
      for (let i = 0; i < CHUNK_LENGTH / 2; i++) for (const side of [-1, 1]) _place(root, 'fence_simple', side * (EDGE - 0.2), 0, zStart + 1 + i * 2, 2, Math.PI / 2)
      for (let i = 0; i < 6; i++) _place(root, _pick(BUSHES), (Math.random() > 0.5 ? 1 : -1) * _rnd(EDGE + 0.5, EDGE + 4), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2.4, 3.6), _yaw())
      for (let i = 0; i < 6; i++) {
        const cx = (Math.random() > 0.5 ? 1 : -1) * _rnd(EDGE + 0.5, EDGE + 10), cz = zStart + Math.random() * CHUNK_LENGTH, f = _pick(FLOWERS)
        for (let k = 0; k < 3; k++) _place(root, f, cx + _rnd(-0.8, 0.8), 0, cz + _rnd(-0.8, 0.8), _rnd(2, 2.6), _yaw())
      }
      // A hay bale or two (a rock stands in — round and gold would be better)
      for (let i = 0; i < 2; i++) _place(root, 'log_stack', (Math.random() > 0.5 ? 1 : -1) * _rnd(EDGE + 2, EDGE + 8), 0, zStart + Math.random() * CHUNK_LENGTH, 2.5, _yaw())
    }
  } else if (zoneId === 'city') {
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const bz = zStart + 3.8 + i * (CHUNK_LENGTH / 4) + _rnd(-0.6, 0.6)
      if (city) {
        const model = _pick(BUILDINGS), size = Kits.size(model)
        if (size) { const sc = _rnd(5.6, 6.6); _place(root, model, side * (EDGE + 1.5 + size.x * sc / 2), 0, bz, sc, side > 0 ? -Math.PI / 2 : Math.PI / 2) }
      }
    }
    if (nature) for (let i = 0; i < 3; i++) for (const side of [-1, 1]) _place(root, _pick(['tree_small', 'tree_simple']), side * (EDGE + 0.4), 0, zStart + 4 + i * 10, _rnd(2.2, 2.8), _yaw())
    for (let i = 0; i < 2; i++) {
      const lz = zStart + 5 + i * 15
      for (const side of [-1, 1]) _addLamp(scene, root, side * (EDGE - 0.4), lz)
    }
  } else if (zoneId === 'beach') {
    for (let i = 0; i < 5; i++) {
      const z = zStart + 1 + i * spacing + _rnd(-1, 1)
      for (const side of [-1, 1]) {
        if (nature) _place(root, _pick(PALMS), side * _rnd(EDGE + 1, EDGE + 4), 0, z, _rnd(3.6, 4.8), _yaw())
        if (nature && Math.random() < 0.6) _place(root, _pick(PALMS), side * _rnd(EDGE + 6, EDGE + 12), 0, z + 3, _rnd(3.2, 4.4), _yaw())
      }
    }
    const ballMats = [_pbr(scene, new Color3(1, 0.25, 0.3)), _pbr(scene, new Color3(0.2, 0.6, 1)), _pbr(scene, new Color3(1, 0.85, 0.1))]
    for (let i = 0; i < 3; i++) {
      const b = MeshBuilder.CreateSphere('ball', { diameter: 0.7, segments: 6 }, scene)
      b.position = new Vector3((Math.random() > 0.5 ? 1 : -1) * _rnd(EDGE + 0.5, EDGE + 3), 0.35, zStart + Math.random() * CHUNK_LENGTH)
      b.material = ballMats[i % 3]; b.parent = root
      const pole = MeshBuilder.CreateCylinder('up', { height: 2.2, diameter: 0.08, tessellation: 5 }, scene)
      const ux = (Math.random() > 0.5 ? 1 : -1) * _rnd(EDGE + 1, EDGE + 4), uz = zStart + Math.random() * CHUNK_LENGTH
      pole.position = new Vector3(ux, 1.1, uz); pole.material = _pbr(scene, new Color3(0.9, 0.9, 0.9)); pole.parent = root
      const canopy = MeshBuilder.CreateCylinder('uc', { height: 0.5, diameterBottom: 2.2, diameterTop: 0, tessellation: 8 }, scene)
      canopy.position = new Vector3(ux, 2.3, uz); canopy.material = ballMats[(i + 1) % 3]; canopy.parent = root
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const z = zStart + i * (spacing * 0.85)
      for (const side of [-1, 1]) {
        if (nature) _place(root, _pick(PINES), side * _rnd(EDGE + 1, EDGE + 4), 0, z, _rnd(3.8, 5.4), _yaw())
        if (nature && Math.random() < 0.85) _place(root, _pick(PINES), side * _rnd(EDGE + 6, EDGE + 15), 0, z + 2.5, _rnd(3.6, 5.6), _yaw())
      }
    }
    if (nature) for (let i = 0; i < 4; i++) _place(root, _pick(ROCKS), (Math.random() > 0.5 ? 1 : -1) * _rnd(EDGE + 0.5, EDGE + 8), 0, zStart + Math.random() * CHUNK_LENGTH, _rnd(2, 3.2), _yaw())
  }
}

function _addLamp(scene: Scene, parent: Mesh, x: number, z: number): void {
  const inward = x > 0 ? -1 : 1
  const pole = MeshBuilder.CreateCylinder('pole', { height: 4.6, diameter: 0.12, tessellation: 6 }, scene)
  pole.position = new Vector3(x, 2.3, z); pole.material = poleMat; pole.parent = parent
  const arm = MeshBuilder.CreateBox('arm', { width: 1.2, height: 0.1, depth: 0.1 }, scene)
  arm.position = new Vector3(x + inward * 0.6, 4.5, z); arm.material = poleMat; arm.parent = parent
  const bulb = MeshBuilder.CreateSphere('bulb', { diameter: 0.38, segments: 5 }, scene)
  bulb.position = new Vector3(x + inward * 1.2, 4.38, z); bulb.material = glowMat; bulb.parent = parent
}

// ─── Manager ──────────────────────────────────────────────────────────────────

const VISIBLE_AHEAD  = 7
const DESPAWN_BEHIND = CHUNK_LENGTH * 2

export class RoadManager {
  private scene: Scene
  private chunks: ChunkData[] = []
  private nextZ = 0
  private distOffset = 0

  constructor(scene: Scene, distOffset = 0) {
    this.scene = scene
    this.distOffset = distOffset
    for (let i = 0; i < VISIBLE_AHEAD; i++) this._spawn()
  }

  get roadMat(): PBRMaterial { return roadMat }
  get grassMat(): PBRMaterial { return grassMat }

  private _spawn(): void {
    const chunk = createChunk(this.scene, this.nextZ, zoneIdAt(this.nextZ + this.distOffset))
    this.chunks.push(chunk)
    this.nextZ += CHUNK_LENGTH
  }

  update(playerZ: number, distance: number): void {
    this.distOffset = distance - playerZ
    const last = this.chunks[this.chunks.length - 1]
    if (last && last.zEnd - playerZ < CHUNK_LENGTH * 3) this._spawn()
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      if (this.chunks[i].zEnd < playerZ - DESPAWN_BEHIND) { this.chunks[i].root.dispose(); this.chunks.splice(i, 1) }
    }
  }
}
