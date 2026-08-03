import {
  Scene,
  Camera,
  DefaultRenderingPipeline,
  Color4,
  ColorCurves,
  ImageProcessingConfiguration,
} from '@babylonjs/core'
import type { QualityProfile } from './DeviceTier'

/**
 * Stylized post-processing.
 *
 * This used to stack chromatic aberration, depth of field, ACES filmic
 * tonemapping, volumetric god rays and SSAO2 — a photorealism toolkit
 * applied to a scene made of untextured primitives. It cost a lot and
 * pushed the image *away* from the reference look.
 *
 * Subway-Surfers-class mobile runners use almost none of that. They are
 * flat, saturated, high-contrast and readable at a glance, because the
 * player has to parse three lanes of obstacles at speed. What survives
 * here is the short list that actually serves that: bloom on the coins
 * and lamps, antialiasing on the hard silhouette edges, and a colour
 * grade with the saturation pushed up.
 *
 * Notably absent and deliberately so:
 *   - Depth of field: blurs exactly the obstacles the player is trying
 *     to read, and burns two full-res passes to do it.
 *   - Chromatic aberration: a lens artifact. This scene has no lens.
 *   - SSAO2: needs a depth prepass and a wide blur. Contact shadows on
 *     flat-shaded boxes are close to invisible.
 *   - Volumetric scattering: 100 texture fetches per pixel.
 */
export function setupPostProcessing(
  scene: Scene,
  camera: Camera,
  quality: QualityProfile,
): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera])

  // ── Bloom — coin glints, lamp glow, celebration bursts ──────────────
  pipeline.bloomEnabled   = quality.bloom
  pipeline.bloomThreshold = 0.72   // was 0.50, which bloomed ordinary
                                   // mid-tones and washed the image out
  pipeline.bloomWeight    = 0.45
  pipeline.bloomKernel    = quality.bloomKernel
  pipeline.bloomScale     = 0.5

  pipeline.fxaaEnabled = quality.fxaa

  // Explicitly off — see the note above. Listed rather than omitted so
  // it's obvious these were considered and rejected, not forgotten.
  pipeline.chromaticAberrationEnabled = false
  pipeline.depthOfFieldEnabled        = false
  pipeline.grainEnabled               = false
  pipeline.sharpenEnabled             = false

  // ── Colour grade ────────────────────────────────────────────────────
  pipeline.imageProcessingEnabled = true
  const ip = pipeline.imageProcessing

  // Standard tonemapping, not ACES. ACES rolls highlights off toward a
  // filmic desaturation — the opposite of the punchy, poster-flat look
  // the reference has.
  ip.toneMappingEnabled = true
  ip.toneMappingType    = ImageProcessingConfiguration.TONEMAPPING_STANDARD

  ip.contrast = 1.15
  ip.exposure = 1.05

  // A light vignette frames the corridor. The old weight of 2.8 was
  // heavy enough to darken obstacles entering from the screen edges,
  // which is precisely where they need to be readable.
  ip.vignetteEnabled = true
  ip.vignetteWeight  = 1.4
  ip.vignetteColor   = new Color4(0, 0, 0, 0)

  ip.colorCurvesEnabled = true
  const curves = new ColorCurves()
  curves.globalSaturation    = 135   // the single biggest "this looks like
                                     // a kids' game" lever there is
  curves.highlightsSaturation = 115
  curves.shadowsSaturation    = 120
  curves.highlightsDensity    = 15
  curves.shadowsDensity       = -12
  ip.colorCurves = curves

  return pipeline
}
