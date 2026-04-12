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
  label: string           // shown in zone celebration
  emoji: string
  startDist: number
  // Sky (SkyMaterial props)
  skyTurbidity: number
  skyInclination: number
  skyRayleigh: number
  skyAzimuth: number
  skyLuminance: number
  // Fog
  fogColor: Color3
  fogDensity: number
  // Scene clear
  clearColor: [number, number, number]
  // Ground / road material colours (lerped by ZoneManager on live mats)
  groundColor: Color3
  roadColor: Color3
  // Lighting
  sunColor: Color3
  sunIntensity: number
  hemiDiffuse: Color3
  hemiGround: Color3
  hemiIntensity: number
  // Post-processing
  contrast: number
  exposure: number
  saturation: number       // ColorCurves.globalSaturation 0-200 (100 = neutral)
  vignetteWeight: number
  // Audio
  bpm: number
}

// ─── Zone definitions ──────────────────────────────────────────────────────────

export const ZONES: ZoneConfig[] = [
  {
    id: 'meadow', label: 'Meadow', emoji: '🌸',
    startDist: 0,
    skyTurbidity: 5,   skyInclination: 0.38, skyRayleigh: 2.0,  skyAzimuth: 0.25, skyLuminance: 1.00,
    fogColor:    new Color3(0.72, 0.88, 0.98), fogDensity: 0.005,
    clearColor:  [0.55, 0.78, 0.95],
    groundColor: new Color3(0.22, 0.55, 0.15), roadColor: new Color3(0.22, 0.22, 0.26),
    sunColor:    new Color3(1.00, 0.95, 0.85), sunIntensity:  1.2,
    hemiDiffuse: new Color3(0.80, 0.90, 1.00), hemiGround: new Color3(0.40, 0.30, 0.20), hemiIntensity: 0.65,
    contrast: 1.10, exposure: 1.05, saturation: 115, vignetteWeight: 2.8,
    bpm: 132,
  },
  {
    id: 'forest', label: 'Forest', emoji: '🌲',
    startDist: 500,
    skyTurbidity: 14,  skyInclination: 0.28, skyRayleigh: 3.0,  skyAzimuth: 0.35, skyLuminance: 0.85,
    fogColor:    new Color3(0.38, 0.58, 0.36), fogDensity: 0.015,
    clearColor:  [0.32, 0.50, 0.32],
    groundColor: new Color3(0.10, 0.28, 0.06), roadColor: new Color3(0.18, 0.18, 0.20),
    sunColor:    new Color3(0.65, 0.90, 0.55), sunIntensity:  0.85,
    hemiDiffuse: new Color3(0.35, 0.65, 0.35), hemiGround: new Color3(0.15, 0.25, 0.10), hemiIntensity: 0.50,
    contrast: 1.18, exposure: 0.90, saturation:  90, vignetteWeight: 3.5,
    bpm: 108,
  },
  {
    id: 'city', label: 'City', emoji: '🏙️',
    startDist: 1000,
    skyTurbidity: 18,  skyInclination: 0.08, skyRayleigh: 3.5,  skyAzimuth: 0.50, skyLuminance: 0.80,
    fogColor:    new Color3(0.72, 0.52, 0.42), fogDensity: 0.009,
    clearColor:  [0.78, 0.52, 0.38],
    groundColor: new Color3(0.28, 0.28, 0.30), roadColor: new Color3(0.26, 0.26, 0.30),
    sunColor:    new Color3(1.00, 0.65, 0.35), sunIntensity:  1.1,
    hemiDiffuse: new Color3(1.00, 0.70, 0.50), hemiGround: new Color3(0.30, 0.25, 0.20), hemiIntensity: 0.70,
    contrast: 1.15, exposure: 1.10, saturation: 125, vignetteWeight: 3.0,
    bpm: 148,
  },
  {
    id: 'beach', label: 'Beach', emoji: '🌊',
    startDist: 1500,
    skyTurbidity:  3,  skyInclination: 0.48, skyRayleigh: 1.5,  skyAzimuth: 0.15, skyLuminance: 1.10,
    fogColor:    new Color3(0.78, 0.92, 0.96), fogDensity: 0.004,
    clearColor:  [0.60, 0.85, 0.95],
    groundColor: new Color3(0.90, 0.80, 0.52), roadColor: new Color3(0.80, 0.72, 0.52),
    sunColor:    new Color3(1.00, 0.98, 0.90), sunIntensity:  1.4,
    hemiDiffuse: new Color3(0.90, 0.95, 1.00), hemiGround: new Color3(0.85, 0.78, 0.42), hemiIntensity: 0.80,
    contrast: 1.05, exposure: 1.15, saturation: 130, vignetteWeight: 2.2,
    bpm: 128,
  },
  {
    id: 'space', label: 'Space', emoji: '🚀',
    startDist: 2000,
    skyTurbidity: 30,  skyInclination: -0.5, skyRayleigh: 0.3,  skyAzimuth: 0.00, skyLuminance: 0.20,
    fogColor:    new Color3(0.04, 0.02, 0.12), fogDensity: 0.003,
    clearColor:  [0.04, 0.02, 0.12],
    groundColor: new Color3(0.04, 0.04, 0.10), roadColor: new Color3(0.06, 0.06, 0.18),
    sunColor:    new Color3(0.50, 0.40, 0.90), sunIntensity:  0.7,
    hemiDiffuse: new Color3(0.25, 0.15, 0.55), hemiGround: new Color3(0.08, 0.04, 0.18), hemiIntensity: 0.35,
    contrast: 1.20, exposure: 1.20, saturation:  75, vignetteWeight: 4.0,
    bpm: 120,
  },
]

const TRANSITION_SECS = 6.0  // smooth 6-second crossfade

// ─── ZoneManager ──────────────────────────────────────────────────────────────

export class ZoneManager {
  private scene: Scene
  private skyMat: SkyMaterial
  private sun: DirectionalLight
  private hemi: HemisphericLight

  private pipeline: DefaultRenderingPipeline | null = null
  private grassMat:   PBRMaterial | null = null
  private roadMat:    PBRMaterial | null = null
  private farGround:  Mesh | null = null

  private prevIdx  = 0
  private currIdx  = 0
  private transT   = 1.0    // 1 = fully in current zone

  onZoneEntered?: (zone: ZoneConfig) => void

  constructor(
    scene: Scene,
    skyMat: SkyMaterial,
    sun: DirectionalLight,
    hemi: HemisphericLight,
  ) {
    this.scene  = scene
    this.skyMat = skyMat
    this.sun    = sun
    this.hemi   = hemi
    // Apply initial zone immediately
    this._apply(ZONES[0], ZONES[0], 1.0)
  }

  setPipeline(p: DefaultRenderingPipeline): void { this.pipeline = p }
  setGrassMat(m: PBRMaterial):  void { this.grassMat  = m }
  setRoadMat(m: PBRMaterial):   void { this.roadMat   = m }
  setFarGround(m: Mesh):        void { this.farGround  = m }

  get currentZone(): ZoneConfig { return ZONES[this.currIdx] }

  update(distance: number, dt: number): void {
    // Find which zone we should be in
    let targetIdx = 0
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (distance >= ZONES[i].startDist) { targetIdx = i; break }
    }

    // Start transition when zone changes and previous one is done
    if (targetIdx !== this.currIdx && this.transT >= 1.0) {
      this.prevIdx = this.currIdx
      this.currIdx = targetIdx
      this.transT  = 0
      this.onZoneEntered?.(ZONES[targetIdx])
    }

    if (this.transT < 1.0) {
      this.transT = Math.min(1.0, this.transT + dt / TRANSITION_SECS)
      this._apply(ZONES[this.prevIdx], ZONES[this.currIdx], this._easeInOut(this.transT))
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  private _apply(from: ZoneConfig, to: ZoneConfig, t: number): void {
    const n = (a: number, b: number) => a + (b - a) * t
    const c = (a: Color3, b: Color3) => Color3.Lerp(a, b, t)

    // ── Sky ──
    this.skyMat.turbidity   = n(from.skyTurbidity,  to.skyTurbidity)
    this.skyMat.inclination = n(from.skyInclination, to.skyInclination)
    this.skyMat.rayleigh    = n(from.skyRayleigh,   to.skyRayleigh)
    this.skyMat.luminance   = n(from.skyLuminance,  to.skyLuminance)

    // ── Fog ──
    this.scene.fogColor   = c(from.fogColor,   to.fogColor)
    this.scene.fogDensity = n(from.fogDensity,  to.fogDensity)

    // ── Scene clear ──
    const [fr, fg, fb] = from.clearColor
    const [tr, tg, tb] = to.clearColor
    this.scene.clearColor.set(n(fr, tr), n(fg, tg), n(fb, tb), 1)

    // ── Lighting ──
    this.sun.diffuse     = c(from.sunColor,    to.sunColor)
    this.sun.intensity   = n(from.sunIntensity, to.sunIntensity)
    this.hemi.diffuse    = c(from.hemiDiffuse,  to.hemiDiffuse)
    this.hemi.groundColor= c(from.hemiGround,   to.hemiGround)
    this.hemi.intensity  = n(from.hemiIntensity,to.hemiIntensity)

    // ── Ground materials ──
    if (this.grassMat)  this.grassMat.albedoColor  = c(from.groundColor, to.groundColor)
    if (this.roadMat)   this.roadMat.albedoColor   = c(from.roadColor,   to.roadColor)
    if (this.farGround?.material) {
      ;(this.farGround.material as PBRMaterial).albedoColor = c(from.groundColor, to.groundColor)
    }

    // ── Post-processing ──
    if (this.pipeline?.imageProcessingEnabled) {
      this.pipeline.imageProcessing.contrast = n(from.contrast, to.contrast)
      this.pipeline.imageProcessing.exposure = n(from.exposure, to.exposure)
      this.pipeline.imageProcessing.vignetteWeight = n(from.vignetteWeight, to.vignetteWeight)
      if (this.pipeline.imageProcessing.colorCurves) {
        this.pipeline.imageProcessing.colorCurves.globalSaturation = n(from.saturation, to.saturation)
      }
    }
  }
}
