import {
  Scene,
  Color3,
  DirectionalLight,
  HemisphericLight,
  PBRMaterial,
  Mesh,
} from '@babylonjs/core'
import type { DefaultRenderingPipeline } from '@babylonjs/core'
import type { SkyDome, CloudLayer } from '@kids/engine'
import type { Backdrop } from './Backdrop'

// ─── Zone config schema ────────────────────────────────────────────────────────

export interface ZoneConfig {
  id: string
  label: string
  emoji: string
  startDist: number
  /** Sky dome colours: straight up, eye level, and below the horizon. */
  skyZenith: Color3
  skyHorizon: Color3
  skyGround: Color3
  /** Sun disc tint and brightness; 0 hides it. */
  sunDisc: Color3
  sunDiscStrength: number
  cloudTint: Color3
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
  /**
   * Time-of-day sweep: over the last `eveningSpan` metres of the zone the
   * palette eases toward these overrides. The meadow ends at golden hour.
   */
  evening?: Partial<ZoneConfig>
  eveningSpan?: number
}

// ─── Zone definitions ─────────────────────────────────────────────────────────
//
// Colours are authored for a saturated poster look: a deep zenith falling
// to a bright, slightly warm horizon, with the fog colour matched to the
// horizon so the far ground dissolves into the sky rather than into a
// differently-coloured haze.

export const ZONES: ZoneConfig[] = [
  // 0 — Meadow
  {
    id: 'meadow', label: 'Meadow', emoji: '🌸', startDist: 0,
    skyZenith: new Color3(0.22, 0.52, 0.98), skyHorizon: new Color3(0.82, 0.93, 1.00), skyGround: new Color3(0.62, 0.80, 0.92),
    sunDisc: new Color3(1.0, 0.96, 0.80), sunDiscStrength: 1.0, cloudTint: new Color3(1, 1, 1),
    fogColor:    new Color3(0.80, 0.92, 1.00), fogDensity: 0.0045,
    clearColor:  [0.80, 0.92, 1.00],
    groundColor: new Color3(0.32, 0.74, 0.22), roadColor: new Color3(0.30, 0.31, 0.37),
    sunColor:    new Color3(1.00, 0.96, 0.86), sunIntensity: 1.35,
    hemiDiffuse: new Color3(0.78, 0.88, 1.00), hemiGround: new Color3(0.45, 0.42, 0.32), hemiIntensity: 0.75,
    contrast: 1.10, exposure: 1.05, saturation: 135, vignetteWeight: 1.2,
    bpm: 132,
    eveningSpan: 180,
    evening: {
      skyZenith: new Color3(0.30, 0.30, 0.72), skyHorizon: new Color3(1.00, 0.70, 0.42), skyGround: new Color3(0.80, 0.55, 0.45),
      sunDisc: new Color3(1.0, 0.72, 0.38), sunDiscStrength: 1.4, cloudTint: new Color3(1.0, 0.80, 0.70),
      fogColor: new Color3(0.98, 0.78, 0.60), clearColor: [0.98, 0.78, 0.60],
      sunColor: new Color3(1.00, 0.74, 0.45), sunIntensity: 1.25,
      hemiDiffuse: new Color3(0.92, 0.72, 0.62), hemiGround: new Color3(0.42, 0.30, 0.26),
      groundColor: new Color3(0.36, 0.62, 0.22),
    },
  },
  // 1 — Forest
  {
    id: 'forest', label: 'Forest', emoji: '🌲', startDist: 450,
    skyZenith: new Color3(0.20, 0.42, 0.72), skyHorizon: new Color3(0.70, 0.84, 0.76), skyGround: new Color3(0.42, 0.58, 0.46),
    sunDisc: new Color3(0.95, 1.0, 0.85), sunDiscStrength: 0.6, cloudTint: new Color3(0.9, 0.95, 0.9),
    fogColor:    new Color3(0.66, 0.80, 0.70), fogDensity: 0.0075,
    clearColor:  [0.66, 0.80, 0.70],
    groundColor: new Color3(0.14, 0.42, 0.12), roadColor: new Color3(0.24, 0.25, 0.28),
    sunColor:    new Color3(0.82, 0.95, 0.70), sunIntensity: 1.05,
    hemiDiffuse: new Color3(0.60, 0.76, 0.58), hemiGround: new Color3(0.24, 0.34, 0.16), hemiIntensity: 0.62,
    contrast: 1.12, exposure: 0.98, saturation: 125, vignetteWeight: 1.5,
    bpm: 108,
  },
  // 2 — City (golden hour)
  {
    id: 'city', label: 'City', emoji: '🏙️', startDist: 900,
    skyZenith: new Color3(0.28, 0.32, 0.82), skyHorizon: new Color3(1.00, 0.72, 0.46), skyGround: new Color3(0.80, 0.55, 0.45),
    sunDisc: new Color3(1.0, 0.75, 0.40), sunDiscStrength: 1.3, cloudTint: new Color3(1.0, 0.82, 0.72),
    fogColor:    new Color3(0.98, 0.76, 0.58), fogDensity: 0.0060,
    clearColor:  [0.98, 0.76, 0.58],
    groundColor: new Color3(0.62, 0.60, 0.62), roadColor: new Color3(0.30, 0.30, 0.36),
    sunColor:    new Color3(1.00, 0.72, 0.42), sunIntensity: 1.25,
    hemiDiffuse: new Color3(0.95, 0.75, 0.60), hemiGround: new Color3(0.32, 0.28, 0.26), hemiIntensity: 0.72,
    contrast: 1.15, exposure: 1.08, saturation: 140, vignetteWeight: 1.4,
    bpm: 148,
  },
  // 3 — Railway: a sunny freight yard, trains to run along
  {
    id: 'railway', label: 'Railway', emoji: '🚂', startDist: 1300,
    skyZenith: new Color3(0.24, 0.55, 0.96), skyHorizon: new Color3(0.90, 0.92, 0.88), skyGround: new Color3(0.70, 0.68, 0.62),
    sunDisc: new Color3(1.0, 0.97, 0.85), sunDiscStrength: 1.1, cloudTint: new Color3(1, 1, 1),
    fogColor:    new Color3(0.88, 0.90, 0.86), fogDensity: 0.0050,
    clearColor:  [0.88, 0.90, 0.86],
    groundColor: new Color3(0.66, 0.60, 0.52), roadColor: new Color3(0.40, 0.37, 0.34),
    sunColor:    new Color3(1.00, 0.95, 0.85), sunIntensity: 1.35,
    hemiDiffuse: new Color3(0.80, 0.86, 0.95), hemiGround: new Color3(0.45, 0.40, 0.34), hemiIntensity: 0.75,
    contrast: 1.10, exposure: 1.06, saturation: 130, vignetteWeight: 1.2,
    bpm: 140,
  },
  // 4 — Beach
  {
    id: 'beach', label: 'Beach', emoji: '🌊', startDist: 1750,
    skyZenith: new Color3(0.12, 0.50, 0.98), skyHorizon: new Color3(0.86, 0.96, 1.00), skyGround: new Color3(0.40, 0.72, 0.92),
    sunDisc: new Color3(1.0, 0.98, 0.88), sunDiscStrength: 1.2, cloudTint: new Color3(1, 1, 1),
    fogColor:    new Color3(0.84, 0.95, 1.00), fogDensity: 0.0040,
    clearColor:  [0.84, 0.95, 1.00],
    groundColor: new Color3(0.98, 0.88, 0.60), roadColor: new Color3(0.86, 0.78, 0.60),
    sunColor:    new Color3(1.00, 0.98, 0.90), sunIntensity: 1.45,
    hemiDiffuse: new Color3(0.88, 0.95, 1.00), hemiGround: new Color3(0.85, 0.78, 0.45), hemiIntensity: 0.85,
    contrast: 1.05, exposure: 1.12, saturation: 145, vignetteWeight: 1.0,
    bpm: 128,
  },
  // 4 — Space (dark)
  {
    id: 'space', label: 'Space', emoji: '🚀', startDist: 2250,
    skyZenith: new Color3(0.02, 0.01, 0.09), skyHorizon: new Color3(0.20, 0.08, 0.40), skyGround: new Color3(0.06, 0.03, 0.14),
    sunDisc: new Color3(0.85, 0.90, 1.0), sunDiscStrength: 0.7, cloudTint: new Color3(0.4, 0.3, 0.6),
    fogColor:    new Color3(0.12, 0.05, 0.26), fogDensity: 0.0030,
    clearColor:  [0.12, 0.05, 0.26],
    groundColor: new Color3(0.10, 0.08, 0.20), roadColor: new Color3(0.08, 0.08, 0.22),
    sunColor:    new Color3(0.55, 0.45, 0.95), sunIntensity: 0.8,
    hemiDiffuse: new Color3(0.30, 0.20, 0.60), hemiGround: new Color3(0.10, 0.05, 0.22), hemiIntensity: 0.45,
    contrast: 1.18, exposure: 1.20, saturation: 115, vignetteWeight: 1.8,
    bpm: 120,
  },
]

// ─── Bright variants (brightZones = true) ─────────────────────────────────────
//  Only forest and space need a brighter override; the rest are already bright.

const FOREST_BRIGHT: ZoneConfig = {
  ...ZONES[1],
  skyZenith: new Color3(0.26, 0.58, 0.96), skyHorizon: new Color3(0.84, 0.95, 0.86), skyGround: new Color3(0.55, 0.75, 0.58),
  sunDisc: new Color3(1.0, 1.0, 0.88), sunDiscStrength: 1.0, cloudTint: new Color3(1, 1, 1),
  fogColor:    new Color3(0.78, 0.90, 0.80), fogDensity: 0.0045,
  clearColor:  [0.78, 0.90, 0.80],
  groundColor: new Color3(0.20, 0.60, 0.18),
  sunColor:    new Color3(0.98, 1.00, 0.88), sunIntensity: 1.30,
  hemiDiffuse: new Color3(0.78, 0.92, 0.74), hemiGround: new Color3(0.38, 0.50, 0.22), hemiIntensity: 0.75,
  contrast: 1.08, exposure: 1.08, saturation: 135, vignetteWeight: 1.2,
}

// Bright space = vivid cosmic purple/nebula — clearly space, but well-lit
const SPACE_BRIGHT: ZoneConfig = {
  ...ZONES[5],
  skyZenith: new Color3(0.10, 0.04, 0.32), skyHorizon: new Color3(0.58, 0.30, 0.86), skyGround: new Color3(0.22, 0.10, 0.40),
  sunDisc: new Color3(0.90, 0.92, 1.0), sunDiscStrength: 0.9, cloudTint: new Color3(0.75, 0.62, 0.95),
  fogColor:    new Color3(0.42, 0.22, 0.70), fogDensity: 0.0025,
  clearColor:  [0.42, 0.22, 0.70],
  groundColor: new Color3(0.30, 0.22, 0.55), roadColor: new Color3(0.14, 0.12, 0.34),
  sunColor:    new Color3(0.80, 0.62, 1.00), sunIntensity: 1.20,
  hemiDiffuse: new Color3(0.62, 0.45, 0.95), hemiGround: new Color3(0.30, 0.18, 0.55), hemiIntensity: 0.80,
  contrast: 1.10, exposure: 1.25, saturation: 132, vignetteWeight: 1.3,
}

// Snow day: the forest is white every other run or so. Ground goes white,
// the road grey-blue, the sky pale, and Ambient drops flakes.
const FOREST_WINTER: ZoneConfig = {
  ...ZONES[1],
  skyZenith: new Color3(0.55, 0.68, 0.86), skyHorizon: new Color3(0.92, 0.94, 0.97), skyGround: new Color3(0.85, 0.88, 0.92),
  sunDisc: new Color3(1.0, 1.0, 1.0), sunDiscStrength: 0.5, cloudTint: new Color3(0.95, 0.95, 0.98),
  fogColor:    new Color3(0.90, 0.93, 0.97), fogDensity: 0.0055,
  clearColor:  [0.90, 0.93, 0.97],
  groundColor: new Color3(0.94, 0.96, 1.00), roadColor: new Color3(0.50, 0.54, 0.62),
  sunColor:    new Color3(0.95, 0.97, 1.00), sunIntensity: 1.15,
  hemiDiffuse: new Color3(0.80, 0.86, 0.95), hemiGround: new Color3(0.55, 0.58, 0.66), hemiIntensity: 0.85,
  contrast: 1.06, exposure: 1.08, saturation: 118, vignetteWeight: 1.1,
}

// Per-index override; null = use standard zone
const BRIGHT_OVERRIDE: (ZoneConfig | null)[] = [null, FOREST_BRIGHT, null, null, null, SPACE_BRIGHT]

/** Lerp every tunable of two configs. */
function _mix(a: ZoneConfig, b: ZoneConfig, t: number): ZoneConfig {
  const n = (x: number, y: number) => x + (y - x) * t
  const c = (x: Color3, y: Color3) => Color3.Lerp(x, y, t)
  return {
    ...a,
    skyZenith: c(a.skyZenith, b.skyZenith), skyHorizon: c(a.skyHorizon, b.skyHorizon), skyGround: c(a.skyGround, b.skyGround),
    sunDisc: c(a.sunDisc, b.sunDisc), sunDiscStrength: n(a.sunDiscStrength, b.sunDiscStrength), cloudTint: c(a.cloudTint, b.cloudTint),
    fogColor: c(a.fogColor, b.fogColor), fogDensity: n(a.fogDensity, b.fogDensity),
    clearColor: [n(a.clearColor[0], b.clearColor[0]), n(a.clearColor[1], b.clearColor[1]), n(a.clearColor[2], b.clearColor[2])],
    groundColor: c(a.groundColor, b.groundColor), roadColor: c(a.roadColor, b.roadColor),
    sunColor: c(a.sunColor, b.sunColor), sunIntensity: n(a.sunIntensity, b.sunIntensity),
    hemiDiffuse: c(a.hemiDiffuse, b.hemiDiffuse), hemiGround: c(a.hemiGround, b.hemiGround), hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    contrast: n(a.contrast, b.contrast), exposure: n(a.exposure, b.exposure), saturation: n(a.saturation, b.saturation),
    vignetteWeight: n(a.vignetteWeight, b.vignetteWeight),
  }
}

const TRANSITION_SECS = 6.0

// ─── ZoneManager ──────────────────────────────────────────────────────────────

export class ZoneManager {
  private scene:  Scene
  private sky:    SkyDome
  private clouds: CloudLayer
  private sun:    DirectionalLight
  private hemi:   HemisphericLight

  private pipeline:  DefaultRenderingPipeline | null = null
  private grassMat:  PBRMaterial | null = null
  private roadMat:   PBRMaterial | null = null
  private farGround: Mesh | null = null
  private backdrop:  Backdrop | null = null

  private _brightMode = true   // matches Settings default
  private prevIdx     = 0
  private currIdx     = 0
  private transT      = 1.0
  private prevCfg: ZoneConfig | null = null
  /** Chosen once per run: a snowy forest about two runs in five. */
  readonly winter = Math.random() < 0.4

  onZoneEntered?: (zone: ZoneConfig) => void

  constructor(scene: Scene, sky: SkyDome, clouds: CloudLayer, sun: DirectionalLight, hemi: HemisphericLight) {
    this.scene  = scene
    this.sky    = sky
    this.clouds = clouds
    this.sun    = sun
    this.hemi   = hemi
    this._apply(this._zone(0), this._zone(0), 1.0)
  }

  setPipeline(p: DefaultRenderingPipeline): void { this.pipeline  = p }
  setGrassMat(m: PBRMaterial):  void             { this.grassMat  = m }
  setRoadMat(m: PBRMaterial):   void             { this.roadMat   = m }
  setFarGround(m: Mesh):        void             { this.farGround = m }
  setBackdrop(b: Backdrop):     void             { this.backdrop  = b; b.show(this._zone(this.currIdx).id) }

  setBrightMode(v: boolean): void {
    this._brightMode = v
    // Snap-apply current zone so the change is visible instantly
    this._apply(this._zone(this.currIdx), this._zone(this.currIdx), 1.0)
  }

  get currentZone(): ZoneConfig { return this._zone(this.currIdx) }

  /** Jump straight to the zone for `distance` with no transition. */
  snap(distance: number): void {
    let idx = 0
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (distance >= ZONES[i].startDist) { idx = i; break }
    }
    this.prevIdx = this.currIdx = idx
    this.transT  = 1.0
    this._apply(this._zone(idx), this._zone(idx), 1.0)
    this.backdrop?.show(this._zone(idx).id)
  }

  update(distance: number, dt: number): void {
    let targetIdx = 0
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (distance >= ZONES[i].startDist) { targetIdx = i; break }
    }

    if (targetIdx !== this.currIdx && this.transT >= 1.0) {
      // Snapshot where the previous zone's palette actually is (it may be
      // mid-evening) so the crossfade starts from what's on screen.
      this.prevCfg = this._effective(this.currIdx, distance)
      this.prevIdx = this.currIdx
      this.currIdx = targetIdx
      this.transT  = 0
      this.backdrop?.show(this._zone(targetIdx).id)
      this.onZoneEntered?.(this._zone(targetIdx))
    }

    if (this.transT < 1.0) {
      this.transT = Math.min(1.0, this.transT + dt / TRANSITION_SECS)
      const from = this.prevCfg ?? this._zone(this.prevIdx)
      this._apply(from, this._effective(this.currIdx, distance), this._ease(this.transT))
    } else {
      const eff = this._effective(this.currIdx, distance)
      this._apply(eff, eff, 1.0)
    }
  }

  /** The zone's palette at this distance, with any evening sweep applied. */
  private _effective(idx: number, distance: number): ZoneConfig {
    const base = this._zone(idx)
    if (!base.evening || !base.eveningSpan) return base
    const end  = idx + 1 < ZONES.length ? ZONES[idx + 1].startDist : Infinity
    if (!isFinite(end)) return base
    const t = Math.max(0, Math.min(1, (distance - (end - base.eveningSpan)) / base.eveningSpan))
    if (t <= 0) return base
    return _mix(base, { ...base, ...base.evening } as ZoneConfig, t * t * (3 - 2 * t))
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /** Returns effective ZoneConfig for index, applying bright override when enabled. */
  private _zone(idx: number): ZoneConfig {
    if (idx === 1 && this.winter) return FOREST_WINTER
    return (this._brightMode ? BRIGHT_OVERRIDE[idx] : null) ?? ZONES[idx]
  }

  private _ease(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  private _apply(from: ZoneConfig, to: ZoneConfig, t: number): void {
    const n = (a: number, b: number) => a + (b - a) * t
    const c = (a: Color3, b: Color3) => Color3.Lerp(a, b, t)

    this.sky.setColors(c(from.skyZenith, to.skyZenith), c(from.skyHorizon, to.skyHorizon), c(from.skyGround, to.skyGround))
    this.sky.setSun(c(from.sunDisc, to.sunDisc), n(from.sunDiscStrength, to.sunDiscStrength))
    this.clouds.setTint(c(from.cloudTint, to.cloudTint))

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
