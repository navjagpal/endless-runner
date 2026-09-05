/**
 * Device tiering.
 *
 * The target device is an Amazon Fire tablet — a weak PowerVR/Mali GPU
 * behind the Silk browser. Rendering at native resolution with soft
 * shadows and a stack of full-screen post-process passes puts it well
 * under 30 fps, and a low framerate reads as "cheap" faster than any
 * art deficiency does.
 *
 * So: sniff the GPU once at startup, pick a quality profile, and let
 * every renderer-touching module read its budget from here rather than
 * hard-coding desktop-class numbers.
 *
 * Detection is best-effort and biased toward *under*-estimating. An
 * unknown device gets the mid profile, which is still comfortable on a
 * desktop and survivable on a tablet.
 */

export type Tier = 'low' | 'mid' | 'high'

export interface QualityProfile {
  tier: Tier
  /** Babylon hardware scaling. >1 renders below native res and upscales. */
  hardwareScaling: number
  /** Multiply canvas backing store by devicePixelRatio. Off on low. */
  adaptToDeviceRatio: boolean
  /** MSAA on the default framebuffer. */
  antialias: boolean
  /** Real-time shadow map. Low tier uses a blob shadow under the player. */
  realtimeShadows: boolean
  shadowMapSize: number
  /** Percentage-closer filtering — soft edges, but costs taps per pixel. */
  softShadows: boolean
  /** Recycled warm point lights along the lamp posts. */
  lampLightCount: number
  bloom: boolean
  bloomKernel: number
  fxaa: boolean
  /** Scales every particle system's capacity. */
  particleScale: number
  /** Depth-based screen-space outlines: a full-screen pass plus a depth prepass. */
  outline: boolean
  /** Camera far plane — shorter draws less. */
  maxZ: number
  /**
   * Split prop normals so low-poly facets catch light individually.
   *
   * On for every tier, including low. It roughly triples vertex count,
   * but the props total only a few thousand triangles a chunk — draw
   * calls are what hurt these GPUs, not vertices — and this is the
   * single largest visual return in the renderer. Kept as a flag so it
   * can be turned off if a real device says otherwise.
   */
  flatShade: boolean
  /** Human-readable reason the tier was chosen, for the debug overlay. */
  reason: string
}

const PROFILES: Record<Tier, Omit<QualityProfile, 'tier' | 'reason'>> = {
  low: {
    hardwareScaling: 1.5,
    adaptToDeviceRatio: false,
    antialias: false,
    realtimeShadows: false,
    shadowMapSize: 0,
    softShadows: false,
    lampLightCount: 2,
    bloom: true,
    bloomKernel: 32,
    fxaa: true,
    particleScale: 0.4,
    outline: false,
    maxZ: 220,
    flatShade: true,
  },
  mid: {
    hardwareScaling: 1.0,
    adaptToDeviceRatio: false,
    antialias: true,
    realtimeShadows: true,
    shadowMapSize: 1024,
    softShadows: false,
    lampLightCount: 4,
    bloom: true,
    bloomKernel: 64,
    fxaa: true,
    particleScale: 0.8,
    outline: false,
    maxZ: 300,
    flatShade: true,
  },
  high: {
    hardwareScaling: 1.0,
    adaptToDeviceRatio: true,
    antialias: true,
    realtimeShadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    lampLightCount: 6,
    bloom: true,
    bloomKernel: 128,
    fxaa: true,
    particleScale: 1.0,
    outline: true,
    maxZ: 350,
    flatShade: true,
  },
}

const OVERRIDE_KEY = 'runner_tier_override'

/** Reads the GPU string via WEBGL_debug_renderer_info on a throwaway context. */
function _detectRenderer(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ||
                canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return ''

    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const raw = dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)

    // Free the context immediately — browsers cap concurrent WebGL contexts
    // and we're about to create the real one.
    gl.getExtension('WEBGL_lose_context')?.loseContext()

    return String(raw ?? '').toLowerCase()
  } catch {
    return ''
  }
}

/** Amazon Fire tablets report Silk, or a KF* model code, in the UA. */
function _isFireTablet(ua: string): boolean {
  return /\bsilk\b/.test(ua) || /\bkf[a-z]{2,}\b/.test(ua) || /kindle/.test(ua)
}

function _classify(): { tier: Tier; reason: string } {
  // `?tier=high` for one-off checks (headless captures of the outline pass).
  try {
    const q = new URLSearchParams(location.search).get('tier')
    if (q === 'low' || q === 'mid' || q === 'high') return { tier: q, reason: 'forced via ?tier' }
  } catch { /* no location */ }
  const stored = (() => {
    try { return localStorage.getItem(OVERRIDE_KEY) } catch { return null }
  })()
  if (stored === 'low' || stored === 'mid' || stored === 'high') {
    return { tier: stored, reason: `forced via ${OVERRIDE_KEY}` }
  }

  const ua       = navigator.userAgent.toLowerCase()
  const renderer = _detectRenderer()

  // Fire tablets are the design target and are uniformly weak — the
  // cheapest models share a GPU family with the mid ones, so don't try
  // to split them.
  if (_isFireTablet(ua)) {
    return { tier: 'low', reason: `Fire tablet (${renderer || 'unknown gpu'})` }
  }

  // Mobile GPU families that will not hold 60 fps with shadows + post.
  //   PowerVR GE/GM  — Fire HD 8, budget MediaTek
  //   Mali-4xx/T/G3x/G5x — budget ARM
  //   Adreno 3xx-5xx — older Qualcomm
  const WEAK_GPU =
    /powervr|mali-4|mali-t|mali-g3|mali-g5|adreno \(tm\) [345]|adreno [345]|videocore|swiftshader|llvmpipe/
  if (WEAK_GPU.test(renderer)) {
    return { tier: 'low', reason: `weak gpu (${renderer})` }
  }

  // deviceMemory and hardwareConcurrency are advisory and absent on
  // Safari, hence the guards.
  const mem   = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const cores = navigator.hardwareConcurrency

  if (typeof mem === 'number' && mem > 0 && mem <= 3) {
    return { tier: 'low', reason: `deviceMemory ${mem} GB` }
  }
  if (typeof cores === 'number' && cores > 0 && cores <= 4) {
    return { tier: 'mid', reason: `${cores} cores` }
  }

  const isMobile = /android|iphone|ipad|ipod|mobile|tablet/.test(ua)
  if (isMobile) {
    return { tier: 'mid', reason: `mobile (${renderer || 'unknown gpu'})` }
  }

  if (renderer) return { tier: 'high', reason: renderer }
  return { tier: 'mid', reason: 'unknown device, defaulting conservative' }
}

let _cached: QualityProfile | null = null

export function getQualityProfile(): QualityProfile {
  if (_cached) return _cached
  const { tier, reason } = _classify()
  _cached = { tier, reason, ...PROFILES[tier] }
  console.info(`[quality] tier=${tier} — ${reason}`)
  return _cached
}

/**
 * Force a tier for the rest of the session and persist it. Used by the
 * settings panel so a device can be tested at every quality level
 * without editing code. Requires a reload to take effect, because the
 * Engine's antialias and devicePixelRatio flags are construction-time.
 */
export function setTierOverride(tier: Tier | null): void {
  try {
    if (tier) localStorage.setItem(OVERRIDE_KEY, tier)
    else localStorage.removeItem(OVERRIDE_KEY)
  } catch { /* storage unavailable */ }
  _cached = null
}

export function getTierOverride(): Tier | null {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY)
    return v === 'low' || v === 'mid' || v === 'high' ? v : null
  } catch { return null }
}
