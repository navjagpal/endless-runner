import { Scene, DynamicTexture, Texture } from '@babylonjs/core'

/**
 * Procedural particle textures.
 *
 * Four particle systems previously pulled
 * `https://assets.babylonjs.com/particles/flare.png` off the network at
 * construction time. That silently broke the offline PWA promise: the
 * service worker precaches the app shell, not a third-party CDN, so a
 * cold offline launch showed untextured white quads.
 *
 * A flare is a radial alpha gradient. Drawing it into a DynamicTexture
 * costs microseconds, adds nothing to the bundle, and works offline by
 * construction — strictly better than shipping a PNG.
 */

const FLARE_SIZE = 128

// Keyed by scene so a torn-down scene's textures aren't handed out to a
// fresh one, and so nothing is retained after the scene is collected.
const _flareCache    = new WeakMap<Scene, Texture>()
const _softDiscCache = new WeakMap<Scene, Texture>()

/** Bright additive flare — sparks, coin pops, celebration bursts. */
export function getFlareTexture(scene: Scene): Texture {
  const cached = _flareCache.get(scene)
  if (cached) return cached

  const tex = new DynamicTexture(
    'flareTex',
    { width: FLARE_SIZE, height: FLARE_SIZE },
    scene,
    false,
  )
  const ctx = tex.getContext() as CanvasRenderingContext2D
  const c   = FLARE_SIZE / 2

  const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
  grad.addColorStop(0.00, 'rgba(255,255,255,1)')
  grad.addColorStop(0.22, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.28)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, FLARE_SIZE, FLARE_SIZE)
  tex.update(false)

  tex.hasAlpha = true
  _flareCache.set(scene, tex)
  return tex
}

/**
 * Softer, wider falloff. Reads as a streak rather than a point when
 * stretched — used for the speed lines, where the hard-centred flare
 * looked like a field of dots.
 */
export function getSoftDiscTexture(scene: Scene): Texture {
  const cached = _softDiscCache.get(scene)
  if (cached) return cached

  const tex = new DynamicTexture(
    'softDiscTex',
    { width: FLARE_SIZE, height: FLARE_SIZE },
    scene,
    false,
  )
  const ctx = tex.getContext() as CanvasRenderingContext2D
  const c   = FLARE_SIZE / 2

  const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, FLARE_SIZE, FLARE_SIZE)
  tex.update(false)

  tex.hasAlpha = true
  _softDiscCache.set(scene, tex)
  return tex
}

/**
 * Blob shadow — a soft dark ellipse laid flat under the player.
 *
 * This is the mobile-runner standard and it does the job a real shadow
 * map is doing here: telling the player where they are relative to the
 * ground while airborne. It costs one textured quad instead of a
 * depth-map render pass, so the low tier can drop real-time shadows
 * entirely without losing the jump readability that matters.
 */
export function getBlobShadowTexture(scene: Scene): Texture {
  const size = 128
  const tex = new DynamicTexture('blobShadow', { width: size, height: size }, scene, false)
  const ctx = tex.getContext() as CanvasRenderingContext2D
  const c   = size / 2

  const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
  grad.addColorStop(0.00, 'rgba(0,0,0,0.55)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.30)')
  grad.addColorStop(1.00, 'rgba(0,0,0,0)')

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.update(false)

  tex.hasAlpha = true
  return tex
}
