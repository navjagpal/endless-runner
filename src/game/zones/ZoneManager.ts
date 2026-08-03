import {
  Scene,
  Color3,
  DirectionalLight,
  HemisphericLight,
  PBRMaterial,
  Mesh,
} from '@babylonjs/core'
import type { SkyMaterial } from '@babylonjs/materials'
import type { DefaultRenderingPipeline } from '@babylonjs/core'

// ─── Zone config schema ────────────────────────────────────────────────────────

export interface ZoneConfig {
  id: string
  label: string
  emoji: string
  startDist: number
  skyTurbidity: number
  skyInclination: number
  skyRayleigh: number
  skyAzimuth: number
  skyLuminance: number
  fogColor: Color3
  fogDensity: number
  clearColor: [number, number, number]
  groundColor: Color3
  roadColor: Color3
  sunColor: Color3
  sunIntensity: number
  hemiDiffuse: Color3
  hemiGround: Color3
  hemiIntensity: number
  contrast: number
  exposure: number
  saturation: number
  vignetteWeight: number
  bpm: number
}

// ─── Zone definitions (standard) ─────────────────────────────────────────────

export const ZONES: ZoneConfig[] = [
  // 0 — Meadow
  {
    id: 'meadow', label: 'Meadow', emoji: 'ðŸŒ¸', startDist: 0,
    skyTurbidity: 5,  skyInclination: 0.38, skyRayleigh: 2.0, skyAzimuth: 0.25, skyLuminance: 1.00,
    fogColor:    new Color3(0.72, 0.88, 0.98), fogDensity: 0.005,
    clearColor:  [0.55, 0.78, 0.95],
    groundColor: new Color3(0.22, 0.55, 0.15), roadColor: new Color3(0.22, 0.22, 0.26),
    sunColor:    new Color3(1.00, 0.95, 0.85), sunIntensity: 1.2,
    hemiDiffuse: new Color3(0.80, 0.90, 1.00), hemiGround: new Color3(0.40, 0.30, 0.20), hemiIntensity: 0.65,
    contrast: 1.10, exposure: 1.05, saturation: 132, vignetteWeight: 1.4,
    bpm: 132,
  },
  // 1 — Forest  (green hue fixed: hemiDiffuse desaturated, fog less green, density halved)
  {
    id: 'forest', label: 'Forest', emoji: 'ðŸŒ²', startDist: 500,
    skyTurbidity: 12, skyInclination: 0.30, skyRayleigh: 2.5, skyAzimuth: 0.35, skyLuminance: 0.90,
    fogColor:    new Color3(0.52, 0.66, 0.50), fogDensity: 0.010,
    clearColor:  [0.38, 0.54, 0.36],
    groundColor: new Color3(0.10, 0.28, 0.06), roadColor: new Color3(0.18, 0.18, 0.20),
    sunColor:    new Color3(0.75, 0.92, 0.60), sunIntensity: 0.95,
    // was hemiDiffuse(0.35,0.65,0.35) — very saturated green; now more neutral:
    hemiDiffuse: new Color3(0.55, 0.72, 0.50), hemiGround: new Color3(0.22, 0.32, 0.14), hemiIntensity: 0.58,
    contrast: 1.14, exposure: 0.95, saturation: 118, vignetteWeight: 1.6,
    bpm: 108,
  },
  // 2 — City
  {
    id: 'city', label: 'City', emoji: 'ðŸ™ï¸', startDist: 1000,
    skyTurbidity: 18, skyInclination: 0.08, skyRayleigh: 3.5, skyAzimuth: 0.50, skyLuminance: 0.80,
    fogColor:    new Color3(0.72, 0.52, 0.42), fogDensity: 0.009,
    clearColor:  [0.78, 0.52, 0.38],
    groundColor: new Color3(0.28, 0.28, 0.30), roadColor: new Color3(0.26, 0.26, 0.30),
    sunColor:    new Color3(1.00, 0.65, 0.35), sunIntensity: 1.1,
    hemiDiffuse: new Color3(1.00, 0.70, 0.50), hemiGround: new Color3(0.30, 0.25, 0.20), hemiIntensity: 0.70,
    contrast: 1.15, exposure: 1.10, saturation: 140, vignetteWeight: 1.5,
    bpm: 148,
  },
  // 3 — Beach
  {
    id: 'beach', label: 'Beach', emoji: 'ðŸŒŠ', startDist: 1500,
    skyTurbidity: 3,  skyInclination: 0.48, skyRayleigh: 1.5, skyAzimuth: 0.15, skyLuminance: 1.10,
    fogColor:    new Color3(0.78, 0.92, 0.96), fogDensity: 0.004,
    clearColor:  [0.60, 0.85, 0.95],
    groundColor: new Color3(0.90, 0.80, 0.52), roadColor: new Color3(0.80, 0.72, 0.52),
    sunColor:    new Color3(1.00, 0.98, 0.90), sunIntensity: 1.4,
    hemiDiffuse: new Color3(0.90, 0.95, 1.00), hemiGround: new Color3(0.85, 0.78, 0.42), hemiIntensity: 0.80,
    contrast: 1.05, exposure: 1.15, saturation: 145, vignetteWeight: 1.1,
    bpm: 128,
  },
  // 4 — Space (dark)
  {
    id: 'space', label: 'Space', emoji: '🚀', startDist: 2000,
    skyTurbidity: 30, skyInclination: -0.5, skyRayleigh: 0.3, skyAzimuth: 0.00, skyLuminance: 0.20,
    fogColor:    new Color3(0.04, 0.02, 0.12), fogDensity: 0.003,
    clearColor:  [0.04, 0.02, 0.12],
    groundColor: new Color3(0.04, 0.04, 0.10), roadColor: new Color3(0.06, 0.06, 0.18),
    sunColor:    new Color3(0.50, 0.40, 0.90), sunIntensity: 0.7,
    hemiDiffuse: new Color3(0.25, 0.15, 0.55), hemiGround: new Color3(0.08, 0.04, 0.18), hemiIntensity: 0.35,
    contrast: 1.20, exposure: 1.20, saturation: 108, vignetteWeight: 2.0,
    bpm: 120,
  },
]

// ─── Bright variants (brightZones = true) ─────────────────────────────────────
//  Only forest and space need a brighter override; the rest are already bright.

const FOREST_BRIGHT: ZoneConfig = {
  ...ZONES[1],
  skyTurbidity: 6, skyInclination: 0.42, skyRayleigh: 2.2, skyLuminance: 1.00,
  fogColor:    new Color3(0.70, 0.86, 0.68), fogDensity: 0.005,
  clearColor:  [0.55, 0.76, 0.52],
  sunColor:    new Color3(0.96, 0.98, 0.88), sunIntensity: 1.20,
  hemiDiffuse: new Color3(0.76, 0.90, 0.70), hemiGround: new Color3(0.38, 0.50, 0.22), hemiIntensity: 0.72,
  contrast: 1.08, exposure: 1.10, saturation: 132, vignetteWeight: 1.3,
}

// Bright space = vivid cosmic purple/nebula — clearly space, but well-lit
const SPACE_BRIGHT: ZoneConfig = {
  ...ZONES[4],
  skyTurbidity: 6, skyInclination: 0.38, skyRayleigh: 0.6, skyLuminance: 0.65,
  fogColor:    new Color3(0.28, 0.14, 0.58), fogDensity: 0.0025,
  clearColor:  [0.20, 0.08, 0.48],
  sunColor:    new Color3(0.75, 0.55, 1.00), sunIntensity: 1.15,
  hemiDiffuse: new Color3(0.60, 0.42, 0.92), hemiGround: new Color3(0.28, 0.16, 0.52), hemiIntensity: 0.78,
  contrast: 1.10, exposure: 1.30, saturation: 128, vignetteWeight: 1.4,
}

// Per-index override; null = use standard zone
const BRIGHT_OVERRIDE: (ZoneConfig | null)[] = [null, FOREST_BRIGHT, null, null, SPACE_BRIGHT]

const TRANSITION_SECS = 6.0

// ─── ZoneManager ──────────────────────────────────────────────────────────────

export class ZoneManager {
  private scene:     Scene
  private skyMat:    SkyMaterial
  private sun:       DirectionalLight
  private hemi:      HemisphericLight

  private pipeline:  DefaultRenderingPipeline | null = null
  private grassMat:  PBRMaterial | null = null
  private roadMat:   PBRMaterial | null = null
  private farGround: Mesh | null = null

  private _brightMode = true   // matches Settings default
  private prevIdx     = 0
  private currIdx     = 0
  private transT      = 1.0

  onZoneEntered?: (zone: ZoneConfig) => void

  constructor(scene: Scene, skyMat: SkyMaterial, sun: DirectionalLight, hemi: HemisphericLight) {
    this.scene  = scene
    this.skyMat = skyMat
    this.sun    = sun
    this.hemi   = hemi
    this._apply(this._zone(0), this._zone(0), 1.0)
  }

  setPipeline(p: DefaultRenderingPipeline): void { this.pipeline  = p }
  setGrassMat(m: PBRMaterial):  void             { this.grassMat  = m }
  setRoadMat(m: PBRMaterial):   void             { this.roadMat   = m }
  setFarGround(m: Mesh):        void             { this.farGround = m }

  setBrightMode(v: boolean): void {
    this._brightMode = v
    // Snap-apply current zone so the change is visible instantly
    this._apply(this._zone(this.currIdx), this._zone(this.currIdx), 1.0)
  }

  get currentZone(): ZoneConfig { return this._zone(this.currIdx) }

  update(distance: number, dt: number): void {
    let targetIdx = 0
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (distance >= ZONES[i].startDist) { targetIdx = i; break }
    }

    if (targetIdx !== this.currIdx && this.transT >= 1.0) {
      this.prevIdx = this.currIdx
      this.currIdx = targetIdx
      this.transT  = 0
      this.onZoneEntered?.(this._zone(targetIdx))
    }

    if (this.transT < 1.0) {
      this.transT = Math.min(1.0, this.transT + dt / TRANSITION_SECS)
      this._apply(this._zone(this.prevIdx), this._zone(this.currIdx), this._ease(this.transT))
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /** Returns effective ZoneConfig for index, applying bright override when enabled. */
  private _zone(idx: number): ZoneConfig {
    return (this._brightMode ? BRIGHT_OVERRIDE[idx] : null) ?? ZONES[idx]
  }

  private _ease(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  private _apply(from: ZoneConfig, to: ZoneConfig, t: number): void {
    const n = (a: number, b: number) => a + (b - a) * t
    const c = (a: Color3, b: Color3) => Color3.Lerp(a, b, t)

    this.skyMat.turbidity   = n(from.skyTurbidity,   to.skyTurbidity)
    this.skyMat.inclination = n(from.skyInclination, to.skyInclination)
    this.skyMat.rayleigh    = n(from.skyRayleigh,    to.skyRayleigh)
    this.skyMat.luminance   = n(from.skyLuminance,   to.skyLuminance)

    this.scene.fogColor   = c(from.fogColor,   to.fogColor)
    this.scene.fogDensity = n(from.fogDensity,  to.fogDensity)

    const [fr, fg, fb] = from.clearColor
    const [tr, tg, tb] = to.clearColor
    this.scene.clearColor.set(n(fr, tr), n(fg, tg), n(fb, tb), 1)

    this.sun.diffuse      = c(from.sunColor,     to.sunColor)
    this.sun.intensity    = n(from.sunIntensity,  to.sunIntensity)
    this.hemi.diffuse     = c(from.hemiDiffuse,   to.hemiDiffuse)
    this.hemi.groundColor = c(from.hemiGround,    to.hemiGround)
    this.hemi.intensity   = n(from.hemiIntensity, to.hemiIntensity)

    if (this.grassMat)
      this.grassMat.albedoColor = c(from.groundColor, to.groundColor)
    if (this.roadMat)
      this.roadMat.albedoColor  = c(from.roadColor,   to.roadColor)
    if (this.farGround?.material)
      (this.farGround.material as PBRMaterial).albedoColor = c(from.groundColor, to.groundColor)

    if (this.pipeline?.imageProcessingEnabled) {
      this.pipeline.imageProcessing.contrast       = n(from.contrast,       to.contrast)
      this.pipeline.imageProcessing.exposure       = n(from.exposure,        to.exposure)
      this.pipeline.imageProcessing.vignetteWeight = n(from.vignetteWeight, to.vignetteWeight)
      if (this.pipeline.imageProcessing.colorCurves)
        this.pipeline.imageProcessing.colorCurves.globalSaturation = n(from.saturation, to.saturation)
    }
  }
}
