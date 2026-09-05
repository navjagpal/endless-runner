import {
  Scene,
  Color3,
  DirectionalLight,
  HemisphericLight,
  PBRMaterial,
  Mesh,
  type DefaultRenderingPipeline,
} from '@babylonjs/core'
import type { SkyDome, CloudLayer } from '@kids/engine'
import { Backdrop } from './Backdrop'

/**
 * Four worlds that loop forever: countryside → city → beach → mountains →
 * countryside… Each is ZONE_LENGTH metres. A 4-year-old doesn't need a
 * destination; he needs the scenery to keep changing.
 */

export const ZONE_LENGTH = 650

export interface ZoneConfig {
  id: string
  label: string
  emoji: string
  skyZenith: Color3; skyHorizon: Color3; skyGround: Color3
  sunDisc: Color3; sunDiscStrength: number; cloudTint: Color3
  fogColor: Color3; fogDensity: number
  clearColor: [number, number, number]
  groundColor: Color3; roadColor: Color3
  sunColor: Color3; sunIntensity: number
  hemiDiffuse: Color3; hemiGround: Color3; hemiIntensity: number
  contrast: number; exposure: number; saturation: number; vignetteWeight: number
}

export const ZONES: ZoneConfig[] = [
  {
    id: 'country', label: 'Countryside', emoji: '🌻',
    skyZenith: new Color3(0.22, 0.52, 0.98), skyHorizon: new Color3(0.82, 0.93, 1.00), skyGround: new Color3(0.62, 0.80, 0.92),
    sunDisc: new Color3(1.0, 0.96, 0.80), sunDiscStrength: 1.0, cloudTint: new Color3(1, 1, 1),
    fogColor: new Color3(0.80, 0.92, 1.00), fogDensity: 0.0045, clearColor: [0.80, 0.92, 1.00],
    groundColor: new Color3(0.34, 0.74, 0.24), roadColor: new Color3(0.32, 0.33, 0.38),
    sunColor: new Color3(1.00, 0.96, 0.86), sunIntensity: 1.35,
    hemiDiffuse: new Color3(0.78, 0.88, 1.00), hemiGround: new Color3(0.45, 0.42, 0.32), hemiIntensity: 0.75,
    contrast: 1.10, exposure: 1.05, saturation: 135, vignetteWeight: 1.2,
  },
  {
    id: 'city', label: 'City', emoji: '🏙️',
    skyZenith: new Color3(0.28, 0.32, 0.82), skyHorizon: new Color3(1.00, 0.72, 0.46), skyGround: new Color3(0.80, 0.55, 0.45),
    sunDisc: new Color3(1.0, 0.75, 0.40), sunDiscStrength: 1.3, cloudTint: new Color3(1.0, 0.82, 0.72),
    fogColor: new Color3(0.98, 0.76, 0.58), fogDensity: 0.0060, clearColor: [0.98, 0.76, 0.58],
    groundColor: new Color3(0.62, 0.60, 0.62), roadColor: new Color3(0.30, 0.30, 0.36),
    sunColor: new Color3(1.00, 0.72, 0.42), sunIntensity: 1.25,
    hemiDiffuse: new Color3(0.95, 0.75, 0.60), hemiGround: new Color3(0.32, 0.28, 0.26), hemiIntensity: 0.72,
    contrast: 1.15, exposure: 1.08, saturation: 140, vignetteWeight: 1.4,
  },
  {
    id: 'beach', label: 'Beach', emoji: '🌊',
    skyZenith: new Color3(0.12, 0.50, 0.98), skyHorizon: new Color3(0.86, 0.96, 1.00), skyGround: new Color3(0.40, 0.72, 0.92),
    sunDisc: new Color3(1.0, 0.98, 0.88), sunDiscStrength: 1.2, cloudTint: new Color3(1, 1, 1),
    fogColor: new Color3(0.84, 0.95, 1.00), fogDensity: 0.0040, clearColor: [0.84, 0.95, 1.00],
    groundColor: new Color3(0.98, 0.88, 0.60), roadColor: new Color3(0.86, 0.78, 0.60),
    sunColor: new Color3(1.00, 0.98, 0.90), sunIntensity: 1.45,
    hemiDiffuse: new Color3(0.88, 0.95, 1.00), hemiGround: new Color3(0.85, 0.78, 0.45), hemiIntensity: 0.85,
    contrast: 1.05, exposure: 1.12, saturation: 145, vignetteWeight: 1.0,
  },
  {
    id: 'mountain', label: 'Mountains', emoji: '🏔️',
    skyZenith: new Color3(0.26, 0.58, 0.96), skyHorizon: new Color3(0.84, 0.95, 0.86), skyGround: new Color3(0.55, 0.75, 0.58),
    sunDisc: new Color3(1.0, 1.0, 0.88), sunDiscStrength: 1.0, cloudTint: new Color3(1, 1, 1),
    fogColor: new Color3(0.78, 0.90, 0.80), fogDensity: 0.0045, clearColor: [0.78, 0.90, 0.80],
    groundColor: new Color3(0.20, 0.60, 0.18), roadColor: new Color3(0.28, 0.29, 0.33),
    sunColor: new Color3(0.98, 1.00, 0.88), sunIntensity: 1.30,
    hemiDiffuse: new Color3(0.78, 0.92, 0.74), hemiGround: new Color3(0.38, 0.50, 0.22), hemiIntensity: 0.75,
    contrast: 1.08, exposure: 1.08, saturation: 135, vignetteWeight: 1.2,
  },
]

export function zoneIndexAt(distance: number): number {
  return Math.floor(Math.max(0, distance) / ZONE_LENGTH) % ZONES.length
}
export function zoneIdAt(distance: number): string { return ZONES[zoneIndexAt(distance)].id }

const TRANSITION_SECS = 6.0

export class ZoneManager {
  private scene: Scene
  private sky: SkyDome
  private clouds: CloudLayer
  private sun: DirectionalLight
  private hemi: HemisphericLight
  private pipeline: DefaultRenderingPipeline | null = null
  private grassMat: PBRMaterial | null = null
  private roadMat: PBRMaterial | null = null
  private farGround: Mesh | null = null
  private backdrop: Backdrop | null = null
  private prevIdx = 0
  private currIdx = 0
  private transT = 1

  onZoneEntered?: (zone: ZoneConfig) => void

  constructor(scene: Scene, sky: SkyDome, clouds: CloudLayer, sun: DirectionalLight, hemi: HemisphericLight) {
    this.scene = scene; this.sky = sky; this.clouds = clouds; this.sun = sun; this.hemi = hemi
    this._apply(ZONES[0], ZONES[0], 1)
  }

  setPipeline(p: DefaultRenderingPipeline): void { this.pipeline = p }
  setGrassMat(m: PBRMaterial): void { this.grassMat = m }
  setRoadMat(m: PBRMaterial): void { this.roadMat = m }
  setFarGround(m: Mesh): void { this.farGround = m }
  setBackdrop(b: Backdrop): void { this.backdrop = b; b.show(ZONES[this.currIdx].id) }

  get currentZone(): ZoneConfig { return ZONES[this.currIdx] }

  snap(distance: number): void {
    this.prevIdx = this.currIdx = zoneIndexAt(distance)
    this.transT = 1
    this._apply(ZONES[this.currIdx], ZONES[this.currIdx], 1)
    this.backdrop?.show(ZONES[this.currIdx].id)
  }

  update(distance: number, dt: number): void {
    const target = zoneIndexAt(distance)
    if (target !== this.currIdx && this.transT >= 1) {
      this.prevIdx = this.currIdx
      this.currIdx = target
      this.transT = 0
      this.backdrop?.show(ZONES[target].id)
      this.onZoneEntered?.(ZONES[target])
    }
    if (this.transT < 1) {
      this.transT = Math.min(1, this.transT + dt / TRANSITION_SECS)
      const t = this.transT < 0.5 ? 2 * this.transT * this.transT : 1 - Math.pow(-2 * this.transT + 2, 2) / 2
      this._apply(ZONES[this.prevIdx], ZONES[this.currIdx], t)
    }
  }

  private _apply(from: ZoneConfig, to: ZoneConfig, t: number): void {
    const n = (a: number, b: number) => a + (b - a) * t
    const c = (a: Color3, b: Color3) => Color3.Lerp(a, b, t)
    this.sky.setColors(c(from.skyZenith, to.skyZenith), c(from.skyHorizon, to.skyHorizon), c(from.skyGround, to.skyGround))
    this.sky.setSun(c(from.sunDisc, to.sunDisc), n(from.sunDiscStrength, to.sunDiscStrength))
    this.clouds.setTint(c(from.cloudTint, to.cloudTint))
    this.scene.fogColor = c(from.fogColor, to.fogColor)
    this.scene.fogDensity = n(from.fogDensity, to.fogDensity)
    const [fr, fg, fb] = from.clearColor, [tr, tg, tb] = to.clearColor
    this.scene.clearColor.set(n(fr, tr), n(fg, tg), n(fb, tb), 1)
    this.sun.diffuse = c(from.sunColor, to.sunColor); this.sun.intensity = n(from.sunIntensity, to.sunIntensity)
    this.hemi.diffuse = c(from.hemiDiffuse, to.hemiDiffuse); this.hemi.groundColor = c(from.hemiGround, to.hemiGround)
    this.hemi.intensity = n(from.hemiIntensity, to.hemiIntensity)
    if (this.grassMat) this.grassMat.albedoColor = c(from.groundColor, to.groundColor)
    if (this.roadMat) this.roadMat.albedoColor = c(from.roadColor, to.roadColor)
    if (this.farGround?.material) (this.farGround.material as PBRMaterial).albedoColor = c(from.groundColor, to.groundColor)
    if (this.pipeline?.imageProcessingEnabled) {
      const ip = this.pipeline.imageProcessing
      ip.contrast = n(from.contrast, to.contrast); ip.exposure = n(from.exposure, to.exposure)
      ip.vignetteWeight = n(from.vignetteWeight, to.vignetteWeight)
      if (ip.colorCurves) ip.colorCurves.globalSaturation = n(from.saturation, to.saturation)
    }
  }
}
