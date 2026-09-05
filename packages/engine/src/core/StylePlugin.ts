import {
  MaterialPluginBase,
  RegisterMaterialPlugin,
  PBRBaseMaterial,
  type Material,
  type MaterialDefines,
  type UniformBuffer,
  type Nullable,
} from '@babylonjs/core'

/**
 * The look, applied to every material through one plugin.
 *
 * **Toon ramp.** Babylon's PBR lighting is physically smooth, which on
 * flat-coloured low-poly assets reads as plastic. After all lights have
 * been summed, the diffuse term is quantised into three soft bands —
 * shade, lit, sun-lit — and a rim highlight is added on silhouettes.
 * Albedo (texture, vertex colour, tint) is untouched, so the zone tints
 * and the baked gradients still come through; only the *light* is
 * banded.
 *
 * **Road curve.** The classic runner trick: the world bends sideways
 * in the vertex shader as a function of distance ahead of the player,
 * so the road sweeps left and right while the lanes, the physics and
 * the camera stay perfectly straight. Applied after the world transform,
 * so it costs nothing and works on every mesh regardless of hierarchy.
 * Sky, sun and clouds are camera-relative and opt out by name.
 *
 * Registered once via RegisterMaterialPlugin, so materials loaded from
 * GLBs, created by MeshBuilder, or subclassed (PBRCustomMaterial) all
 * pick it up automatically.
 */

/** Per-frame inputs for the curve, written by Game. */
export const CurveState = {
  /** Lateral bend coefficient: x += k · dz². ±0.00035 → ~8 m at 150 m. */
  k: 0,
  /** Bending starts here and grows with distance ahead. */
  playerZ: 0,
}

export const StyleState = {
  toon: true,
}

/** Materials that must not bend: anything parked relative to the camera. */
const NO_CURVE = /^(skyMat|sunMat|cloudMat|birdMat|bfMat)/

class StylePlugin extends MaterialPluginBase {
  private toonCapable: boolean
  private curveCapable: boolean

  constructor(material: Material) {
    super(material, 'Style', 250, { TOON: false, CURVE: false })
    this.toonCapable  = material instanceof PBRBaseMaterial
    this.curveCapable = !NO_CURVE.test(material.name)
    this._enable(true)
  }

  getClassName(): string { return 'StylePlugin' }

  prepareDefines(defines: MaterialDefines): void {
    const d = defines as MaterialDefines & { TOON: boolean; CURVE: boolean }
    const toon  = this.toonCapable && StyleState.toon
    const curve = this.curveCapable
    if (d.TOON !== toon || d.CURVE !== curve) {
      d.TOON  = toon
      d.CURVE = curve
      defines.markAsUnprocessed()
    }
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'curveK', size: 1, type: 'float' },
        { name: 'curveZ', size: 1, type: 'float' },
      ],
      vertex: 'uniform float curveK; uniform float curveZ;',
    }
  }

  bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat('curveK', CurveState.k)
    ubo.updateFloat('curveZ', CurveState.playerZ)
  }

  getCustomCode(shaderType: string): Nullable<Record<string, string>> {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
          #ifdef CURVE
          {
            float dzc = max(0.0, worldPos.z - curveZ);
            worldPos.x += curveK * dzc * dzc;
          }
          #endif
        `,
      }
    }
    return {
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        #ifdef TOON
        {
          float lum = dot(diffuseBase, vec3(0.299, 0.587, 0.114));
          // Three bands: hemisphere-only shade, half-lit, full sun.
          float t1 = smoothstep(0.70, 0.84, lum);
          float t2 = smoothstep(1.12, 1.30, lum);
          float toonLum = 0.62 + t1 * 0.36 + t2 * 0.42;
          vec3 banded = diffuseBase * (toonLum / max(lum, 1e-3));
          finalDiffuse = max(banded, 0.0) * surfaceAlbedo * vLightingIntensity.x;
          float rim = pow(1.0 - clamp(dot(normalW, viewDirectionW), 0.0, 1.0), 3.0);
          finalDiffuse += surfaceAlbedo * rim * 0.20;
        }
        #endif
      `,
    }
  }
}

let _registered = false

/** Call once, before any material is created. */
export function registerStylePlugin(): void {
  if (_registered) return
  _registered = true
  RegisterMaterialPlugin('Style', (material) => new StylePlugin(material))
}
