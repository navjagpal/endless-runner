import {
  Scene,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  StandardMaterial,
  Color3,
  Vector3,
  VertexBuffer,
  Constants,
} from '@babylonjs/core'
import { getFlareTexture, getCloudTexture, getGrassTexture } from '../fx/Textures'
import { getQualityProfile } from './DeviceTier'

/**
 * Sky, sun, clouds and the far ground plane.
 *
 * The sky used to be Babylon's physically-based SkyMaterial on a 900-unit
 * box. Two problems: the camera's far plane is 220–350 units, so the box
 * was clipped and the "sky" on screen was really just the clear colour;
 * and an atmospheric-scattering model is the wrong tool for a cartoon
 * runner anyway — it produces washed, realistic gradients where the
 * reference look wants a saturated zenith falling to a bright, warm
 * horizon.
 *
 * This is a vertex-coloured dome sized inside the far plane, with the
 * colours rewritten per frame during zone transitions. Cheap, and the
 * colours are authored per zone rather than emerging from turbidity.
 */

export interface EnvironmentAssets {
  sky:          SkyDome
  clouds:       CloudLayer
  farGround:    Mesh
  farGroundMat: PBRMaterial
}

export function setupEnvironment(scene: Scene): EnvironmentAssets {
  const sky    = new SkyDome(scene)
  const clouds = new CloudLayer(scene)
  const { farGround, farGroundMat } = _createFarGround(scene)
  scene.fogMode    = Scene.FOGMODE_EXP2
  scene.fogColor   = new Color3(0.78, 0.90, 1.0)
  scene.fogDensity = 0.005
  return { sky, clouds, farGround, farGroundMat }
}

// ─── Sky dome ─────────────────────────────────────────────────────────────────

export class SkyDome {
  private dome:   Mesh
  private sun:    Mesh
  private sunMat: StandardMaterial
  private colors: Float32Array
  private ys:     Float32Array   // normalised vertex height, -1..1

  constructor(scene: Scene) {
    const radius = getQualityProfile().maxZ * 0.82
    this.dome = MeshBuilder.CreateSphere('skyDome', {
      diameter: radius * 2, segments: 20, sideOrientation: Mesh.BACKSIDE,
    }, scene)
    this.dome.infiniteDistance = true
    this.dome.isPickable       = false
    this.dome.alwaysSelectAsActiveMesh = true

    const positions = this.dome.getVerticesData(VertexBuffer.PositionKind)!
    const count = positions.length / 3
    this.ys     = new Float32Array(count)
    this.colors = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      this.ys[i] = positions[i * 3 + 1] / radius
      this.colors[i * 4 + 3] = 1
    }
    this.dome.setVerticesData(VertexBuffer.ColorKind, this.colors, true)
    this.dome.useVertexColors = true

    // Unlit: with lighting disabled a StandardMaterial outputs
    // emissive × vertex colour, so white emissive hands the vertex colours
    // straight to the screen. Fog is off — the dome IS the horizon.
    const mat = new StandardMaterial('skyMat', scene)
    mat.disableLighting = true
    mat.emissiveColor   = Color3.White()
    mat.backFaceCulling = false
    mat.fogEnabled      = false
    this.dome.material  = mat

    // Sun: a soft additive disc parked along the sun light's direction.
    this.sun = MeshBuilder.CreatePlane('sunDisc', { size: radius * 0.42 }, scene)
    this.sun.infiniteDistance = true
    this.sun.billboardMode    = Mesh.BILLBOARDMODE_ALL
    this.sun.isPickable       = false
    this.sun.alwaysSelectAsActiveMesh = true
    const dir = new Vector3(0.6, 1.8, 1.0).normalize()
    this.sun.position = dir.scale(radius * 0.92)

    this.sunMat = new StandardMaterial('sunMat', scene)
    this.sunMat.disableLighting = true
    this.sunMat.emissiveColor   = new Color3(1, 0.95, 0.75)
    this.sunMat.opacityTexture  = getFlareTexture(scene)
    this.sunMat.alphaMode       = Constants.ALPHA_ADD
    this.sunMat.fogEnabled      = false
    this.sunMat.backFaceCulling = false
    this.sun.material = this.sunMat

    this.setColors(new Color3(0.30, 0.58, 0.98), new Color3(0.80, 0.92, 1.0), new Color3(0.60, 0.78, 0.92))
  }

  /**
   * zenith — straight up; horizon — the bright band at eye level;
   * ground — everything below the horizon (only visible over cliffs and
   * through gaps, but it must not be black).
   */
  setColors(zenith: Color3, horizon: Color3, ground: Color3): void {
    const c = this.colors
    for (let i = 0; i < this.ys.length; i++) {
      const y = this.ys[i]
      let r: number, g: number, b: number
      if (y < 0) {
        const t = Math.min(1, -y * 6)
        r = horizon.r + (ground.r - horizon.r) * t
        g = horizon.g + (ground.g - horizon.g) * t
        b = horizon.b + (ground.b - horizon.b) * t
      } else {
        // Hold the horizon colour for a while, then ease to the zenith.
        const t = Math.pow(Math.min(1, y / 0.75), 0.85)
        r = horizon.r + (zenith.r - horizon.r) * t
        g = horizon.g + (zenith.g - horizon.g) * t
        b = horizon.b + (zenith.b - horizon.b) * t
      }
      c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b
    }
    this.dome.updateVerticesData(VertexBuffer.ColorKind, c)
  }

  setSun(color: Color3, strength: number): void {
    this.sunMat.emissiveColor = color.scale(strength)
    this.sun.setEnabled(strength > 0.02)
  }
}

// ─── Clouds ───────────────────────────────────────────────────────────────────

interface Cloud { mesh: Mesh; drift: number }

/**
 * Cartoon clouds: alpha-blended billboards scattered high over the
 * corridor and recycled ahead of the player as they fall behind. They
 * sit inside the fog so the far ones fade into the horizon naturally.
 */
export class CloudLayer {
  private clouds: Cloud[] = []
  private mats: StandardMaterial[] = []
  private time = 0

  constructor(scene: Scene) {
    const count = getQualityProfile().tier === 'low' ? 8 : 14
    for (let v = 0; v < 3; v++) {
      const mat = new StandardMaterial(`cloudMat${v}`, scene)
      mat.disableLighting = true
      mat.emissiveColor   = Color3.White()
      mat.diffuseTexture  = getCloudTexture(scene, v)
      mat.diffuseTexture.hasAlpha = true
      mat.useAlphaFromDiffuseTexture = true
      mat.backFaceCulling = false
      mat.alphaMode = Constants.ALPHA_COMBINE
      this.mats.push(mat)
    }
    for (let i = 0; i < count; i++) {
      const w = 26 + Math.random() * 30
      const mesh = MeshBuilder.CreatePlane(`cloud${i}`, { width: w, height: w * 0.5 }, scene)
      mesh.material      = this.mats[i % 3]
      mesh.billboardMode = Mesh.BILLBOARDMODE_Y
      mesh.isPickable    = false
      this.clouds.push({ mesh, drift: 0.4 + Math.random() * 0.8 })
      this._place(mesh, 20 + Math.random() * 220)
    }
  }

  private _place(mesh: Mesh, z: number): void {
    const side = Math.random() > 0.5 ? 1 : -1
    mesh.position.set(side * (30 + Math.random() * 90), 34 + Math.random() * 26, z)
  }

  setTint(c: Color3): void {
    for (const m of this.mats) m.emissiveColor = c
  }

  update(playerZ: number, dt: number): void {
    this.time += dt
    for (const c of this.clouds) {
      c.mesh.position.x += c.drift * dt
      if (c.mesh.position.z < playerZ + 10) {
        this._place(c.mesh, playerZ + 160 + Math.random() * 90)
      }
    }
  }
}

// ─── Far ground ───────────────────────────────────────────────────────────────

function _createFarGround(scene: Scene): { farGround: Mesh; farGroundMat: PBRMaterial } {
  // A textured plane that follows the player under everything, so the
  // verges never run out and the ground reaches the horizon.
  const farGround = MeshBuilder.CreateGround('farGround', { width: 700, height: 700 }, scene)
  farGround.position.y  = -0.45
  farGround.isPickable  = false

  const farGroundMat = new PBRMaterial('farGroundMat', scene)
  farGroundMat.albedoColor   = new Color3(0.22, 0.55, 0.15)
  farGroundMat.albedoTexture = getGrassTexture(scene)
  ;(farGroundMat.albedoTexture as import('@babylonjs/core').Texture).uScale = 90
  ;(farGroundMat.albedoTexture as import('@babylonjs/core').Texture).vScale = 90
  farGroundMat.metallic  = 0
  farGroundMat.roughness = 1
  farGroundMat.environmentIntensity = 0.3
  farGround.material     = farGroundMat
  farGround.receiveShadows = true

  return { farGround, farGroundMat }
}
