import {
  Scene,
  Camera,
  DefaultRenderingPipeline,
  Color4,
  ColorCurves,
  SSAO2RenderingPipeline,
  VolumetricLightScatteringPostProcess, // Added
  Mesh, // Added
  DirectionalLight, // Added
  Texture, // Added
} from '@babylonjs/core'

export function setupPostProcessing(scene: Scene, camera: Camera, sunLight: DirectionalLight): DefaultRenderingPipeline {
  // ── Main pipeline (bloom, FXAA, chromatic aberration, vignette, color grading) ──
  const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera])

  // Bloom — emissive lamps, coin glows
  pipeline.bloomEnabled   = true
  pipeline.bloomThreshold = 0.50
  pipeline.bloomWeight    = 0.60
  pipeline.bloomKernel    = 128
  pipeline.bloomScale     = 0.5

  // FXAA
  pipeline.fxaaEnabled = true

  // Chromatic aberration — subtle lens feel
  pipeline.chromaticAberrationEnabled               = true
  pipeline.chromaticAberration.aberrationAmount     = 1.2
  pipeline.chromaticAberration.radialIntensity      = 0.8

  // Depth of field — foreground sharp, far background blurs
  pipeline.depthOfFieldEnabled                      = true
  pipeline.depthOfField.focalLength                 = 150     // mm
  pipeline.depthOfField.fStop                       = 2.8
  pipeline.depthOfField.focusDistance               = 6000    // mm ahead (~6m in scene units)
  pipeline.depthOfField.lensSize                    = 50

  // Image processing
  pipeline.imageProcessingEnabled                   = true
  pipeline.imageProcessing.toneMappingEnabled       = true
  pipeline.imageProcessing.toneMappingType          = 1        // ACES filmic
  pipeline.imageProcessing.vignetteEnabled          = true
  pipeline.imageProcessing.vignetteWeight           = 2.8
  pipeline.imageProcessing.vignetteColor            = new Color4(0, 0, 0, 0)
  pipeline.imageProcessing.contrast                 = 1.10
  pipeline.imageProcessing.exposure                 = 1.05

  // Color curves (saturation, etc.)
  pipeline.imageProcessing.colorCurvesEnabled       = true
  const curves = new ColorCurves()
  curves.globalSaturation = 115
  curves.highlightsDensity = 10
  curves.shadowsDensity    = -10
  pipeline.imageProcessing.colorCurves = curves

  // ── Volumetric Light Scattering (God Rays) ──
  try {
    // Create a mesh to act as the light source for volumetric scattering
    const godRayLightMesh = Mesh.CreateSphere('godRayLightMesh', 16, 1.0, scene)
    godRayLightMesh.position = sunLight.position.clone()
    godRayLightMesh.isVisible = false // Make it invisible

    const volumetricLight = new VolumetricLightScatteringPostProcess(
      'volumetricLight',
      1.0, // Render ratio
      camera,
      godRayLightMesh,
      100, // Samples
      Texture.BILINEAR_SAMPLINGMODE,
      scene.getEngine(), // Corrected: Pass the engine instead of the scene
      false // Use only one post process
    )
    volumetricLight.exposure = 0.15
    volumetricLight.decay = 0.99
    volumetricLight.density = 0.9
    volumetricLight.weight = 0.8
    volumetricLight.excludedMeshes.push(godRayLightMesh) // Exclude the light mesh itself

  } catch (e) {
    console.warn('Volumetric Light Scattering not supported or failed to initialize:', e)
  }

  // ── SSAO — ambient occlusion for contact shadows ──
  try {
    const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera])
    ssao.radius        = 2.0
    ssao.totalStrength = 1.3
    ssao.maxZ          = 120
    ssao.samples       = 16
    ssao.expensiveBlur = true
    // Attach SSAO to scene render pipeline manager
    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera)
  } catch {
    // SSAO2 not supported on this device — silently skip
  }

  return pipeline
}
