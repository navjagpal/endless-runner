import { Scene, DynamicTexture, Texture } from '@babylonjs/core'

/**
 * Procedural textures.
 *
 * Everything the game draws on a surface is generated here at startup
 * into DynamicTextures. That keeps the bundle small, works offline by
 * construction (the PWA can't precache a CDN), and — more importantly
 * for the look — lets every texture be tinted by the material's albedo
 * colour, so the zone system can keep lerping one colour per material
 * while the surface still carries grain, speckle and pattern.
 *
 * The tileable ones are built on a periodic value-noise lattice so they
 * wrap with no visible seam at any repeat count.
 */

const FLARE_SIZE = 128

// Keyed by scene so a torn-down scene's textures aren't handed out to a
// fresh one, and so nothing is retained after the scene is collected.
const _cache = new WeakMap<Scene, Map<string, Texture>>()

function _cached(scene: Scene, key: string, build: () => Texture): Texture {
  let map = _cache.get(scene)
  if (!map) { map = new Map(); _cache.set(scene, map) }
  let tex = map.get(key)
  if (!tex) { tex = build(); map.set(key, tex) }
  return tex
}

function _dyn(scene: Scene, name: string, size: number, mipmaps = true): DynamicTexture {
  return new DynamicTexture(name, { width: size, height: size }, scene, mipmaps)
}

/**
 * Deterministic periodic value noise in [0,1]. `cells` lattice points per
 * texture edge — the pattern repeats exactly every `cells` units, so a
 * texture sampled at (x/size*cells) tiles seamlessly.
 */
function _makeNoise(cells: number, seed: number): (u: number, v: number) => number {
  const lattice = new Float32Array(cells * cells)
  let s = seed >>> 0
  for (let i = 0; i < lattice.length; i++) {
    // xorshift32
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0
    lattice[i] = (s % 10000) / 10000
  }
  const at = (x: number, y: number) =>
    lattice[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)]
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (u: number, v: number) => {
    const x0 = Math.floor(u), y0 = Math.floor(v)
    const fx = smooth(u - x0), fy = smooth(v - y0)
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
  }
}

/** Sums three octaves of periodic noise; still tiles because each octave's period divides the texture. */
function _fbm(seed: number): (u: number, v: number) => number {
  const n1 = _makeNoise(8, seed), n2 = _makeNoise(16, seed + 7), n3 = _makeNoise(32, seed + 13)
  return (u: number, v: number) =>
    (n1(u * 8, v * 8) * 0.55 + n2(u * 16, v * 16) * 0.30 + n3(u * 32, v * 32) * 0.15)
}

function _tile(tex: Texture): Texture {
  tex.wrapU = Texture.WRAP_ADDRESSMODE
  tex.wrapV = Texture.WRAP_ADDRESSMODE
  return tex
}

// ─── Particle sprites ─────────────────────────────────────────────────────────

/** Bright additive flare — sparks, coin pops, celebration bursts. */
export function getFlareTexture(scene: Scene): Texture {
  return _cached(scene, 'flare', () => {
    const tex = _dyn(scene, 'flareTex', FLARE_SIZE, false)
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
    return tex
  })
}

/** Softer, wider falloff — speed streaks, dust puffs. */
export function getSoftDiscTexture(scene: Scene): Texture {
  return _cached(scene, 'softDisc', () => {
    const tex = _dyn(scene, 'softDiscTex', FLARE_SIZE, false)
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
    return tex
  })
}

/** Four-point sparkle — coin glints, star power, celebration. */
export function getSparkleTexture(scene: Scene): Texture {
  return _cached(scene, 'sparkle', () => {
    const tex = _dyn(scene, 'sparkleTex', FLARE_SIZE, false)
    const ctx = tex.getContext() as CanvasRenderingContext2D
    const c   = FLARE_SIZE / 2
    ctx.clearRect(0, 0, FLARE_SIZE, FLARE_SIZE)
    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.35)
    core.addColorStop(0, 'rgba(255,255,255,1)')
    core.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = core
    ctx.fillRect(0, 0, FLARE_SIZE, FLARE_SIZE)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    for (let i = 0; i < 2; i++) {
      ctx.save()
      ctx.translate(c, c)
      ctx.rotate(i * Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(0, -c * 0.98)
      ctx.quadraticCurveTo(c * 0.08, -c * 0.08, c * 0.98, 0)
      ctx.quadraticCurveTo(c * 0.08, c * 0.08, 0, c * 0.98)
      ctx.quadraticCurveTo(-c * 0.08, c * 0.08, -c * 0.98, 0)
      ctx.quadraticCurveTo(-c * 0.08, -c * 0.08, 0, -c * 0.98)
      ctx.fill()
      ctx.restore()
    }
    tex.update(false)
    tex.hasAlpha = true
    return tex
  })
}

/**
 * Blob shadow — a soft dark ellipse laid flat under the player. Does the
 * job of a shadow map for the one thing that matters: telling the player
 * where they'll land.
 */
export function getBlobShadowTexture(scene: Scene): Texture {
  return _cached(scene, 'blob', () => {
    const size = 128
    const tex = _dyn(scene, 'blobShadow', size, false)
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
  })
}

// ─── Surfaces (tileable, near-white so albedo carries the hue) ───────────────

/**
 * Asphalt: fine aggregate speckle over a soft mottle. Values sit in
 * 0.78–1.0 so the road's dark albedo still decides the tone; the texture
 * only stops it being one flat grey.
 */
export function getAsphaltTexture(scene: Scene): Texture {
  return _cached(scene, 'asphalt', () => {
    const size = 512
    const tex  = _dyn(scene, 'asphaltTex', size)
    const ctx  = tex.getContext() as CanvasRenderingContext2D
    const img  = ctx.createImageData(size, size)
    const fbm  = _fbm(11)
    const fine = _makeNoise(128, 99)
    const wear = _makeNoise(8, 41)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size
        const m = fbm(u, v)
        const f = fine(u * 128, v * 128)
        // Broad worn patches (lighter) over the aggregate speckle.
        const w = wear(u * 8, v * 8)
        let k = 0.84 + (m - 0.5) * 0.14 + (f - 0.5) * 0.16 + (w - 0.5) * 0.10
        if (f > 0.94) k += 0.12
        k = Math.max(0.68, Math.min(1.02, k))
        const i = (y * size + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(Math.min(255, k * 255))
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // Hairline cracks and tar seams, drawn with wrap so the tile stays seamless.
    let s = 4242
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    ctx.lineCap = 'round'
    for (let i = 0; i < 14; i++) {
      const x0 = rnd() * size, y0 = rnd() * size
      const segs = 4 + Math.floor(rnd() * 5)
      const dark = i < 9
      ctx.strokeStyle = dark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.11)'
      ctx.lineWidth = dark ? 1.4 : 3.5
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        ctx.beginPath()
        let x = x0 + ox, y = y0 + oy
        ctx.moveTo(x, y)
        let ang = rnd() * Math.PI * 2
        for (let k = 0; k < segs; k++) {
          ang += (rnd() - 0.5) * 1.2
          const len = 8 + rnd() * 22
          x += Math.cos(ang) * len; y += Math.sin(ang) * len
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    tex.update(true)
    return _tile(tex)
  })
}

/**
 * Grass: clumpy mottle, blade strokes, and a scatter of bright specks
 * that read as clover flowers once the material tints it green. Still
 * near-white so the same texture serves sand and moon-dust.
 */
export function getGrassTexture(scene: Scene): Texture {
  return _cached(scene, 'grass', () => {
    const size = 512
    const tex  = _dyn(scene, 'grassTex', size)
    const ctx  = tex.getContext() as CanvasRenderingContext2D
    const img  = ctx.createImageData(size, size)
    const fbm  = _fbm(23)
    const fine = _makeNoise(64, 5)
    const clump = _makeNoise(16, 77)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size
        const m = fbm(u, v)
        const f = fine(u * 64, v * 64)
        const c = clump(u * 16, v * 16)
        let k = 0.82 + (m - 0.5) * 0.26 + (f - 0.5) * 0.12 + (c > 0.62 ? (c - 0.62) * 0.5 : 0)
        k = Math.max(0.62, Math.min(1.06, k))
        const i = (y * size + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(Math.min(255, k * 255))
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    let s = 1234
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    const wrapStroke = (x: number, y: number, dx: number, dy: number) => {
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + dx, y + oy + dy); ctx.stroke()
      }
    }
    // Blade strokes: darker at the base, lighter tips.
    ctx.lineWidth = 1.6
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * size, y = rnd() * size
      const len = 4 + rnd() * 8
      const dx = (rnd() - 0.5) * 3
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'
      wrapStroke(x, y, dx * 0.6, -len * 0.6)
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      wrapStroke(x + dx * 0.6, y - len * 0.6, dx * 0.4, -len * 0.4)
    }
    // Clover specks
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size, y = rnd() * size, r = 1.2 + rnd() * 1.6
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    tex.update(true)
    return _tile(tex)
  })
}

/**
 * Building facade: a grid of windows. Returns the albedo (light wall with
 * darker window recesses) and a matching emissive map (a random subset of
 * windows lit warm). One repeat = one window, so a face's UVs are scaled
 * to its size in metres by the builder.
 */
export function getBuildingTextures(scene: Scene): { albedo: Texture; emissive: Texture } {
  const albedo = _cached(scene, 'bldAlbedo', () => {
    const size = 128
    const tex  = _dyn(scene, 'bldAlbedoTex', size)
    const ctx  = tex.getContext() as CanvasRenderingContext2D
    ctx.fillStyle = '#e9e9ec'
    ctx.fillRect(0, 0, size, size)
    // subtle panel lines
    ctx.fillStyle = 'rgba(0,0,0,0.05)'
    ctx.fillRect(0, 0, size, 3)
    ctx.fillRect(0, 0, 3, size)
    // window recess
    ctx.fillStyle = '#4d5666'
    ctx.fillRect(28, 26, 72, 76)
    ctx.fillStyle = '#6d7a90'
    ctx.fillRect(32, 30, 64, 32)
    ctx.fillStyle = '#5b6780'
    ctx.fillRect(32, 66, 64, 32)
    // sill
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(24, 102, 80, 5)
    tex.update(true)
    return _tile(tex)
  })
  const emissive = _cached(scene, 'bldEmissive', () => {
    const size = 128
    const tex  = _dyn(scene, 'bldEmissiveTex', size)
    const ctx  = tex.getContext() as CanvasRenderingContext2D
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#ffd27a'
    ctx.fillRect(32, 30, 64, 32)
    ctx.fillStyle = '#ffe6a8'
    ctx.fillRect(32, 66, 64, 32)
    tex.update(true)
    return _tile(tex)
  })
  return { albedo, emissive }
}

/** Puffy cartoon cloud, white with soft alpha edges, for billboard planes. */
export function getCloudTexture(scene: Scene, variant = 0): Texture {
  return _cached(scene, `cloud${variant}`, () => {
    const W = 256, H = 128
    const tex = new DynamicTexture(`cloudTex${variant}`, { width: W, height: H }, scene, true)
    const ctx = tex.getContext() as CanvasRenderingContext2D
    ctx.clearRect(0, 0, W, H)
    let s = 77 + variant * 31
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    const puffs: [number, number, number][] = []
    const n = 6 + variant
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const x = 40 + t * (W - 80) + (rnd() - 0.5) * 20
      const r = 26 + Math.sin(t * Math.PI) * 26 + rnd() * 10
      const y = H - 34 - r * 0.55 - rnd() * 8
      puffs.push([x, y, r])
    }
    // shadowed underside first, then bright tops
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(x, y + r * 0.35, r * 0.2, x, y + r * 0.35, r * 1.05)
      g.addColorStop(0, 'rgba(214,226,244,1)')
      g.addColorStop(0.8, 'rgba(214,226,244,0.9)')
      g.addColorStop(1, 'rgba(214,226,244,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y + r * 0.35, r * 1.05, 0, Math.PI * 2); ctx.fill()
    }
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(x, y - r * 0.15, r * 0.1, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.75, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // flat base
    ctx.fillStyle = 'rgba(230,238,250,1)'
    ctx.beginPath()
    ctx.roundRect(36, H - 44, W - 72, 22, 11)
    ctx.fill()
    tex.update(true)
    tex.hasAlpha = true
    return tex
  })
}

/** Coin face: gold disc with an embossed star and a bright rim. */
export function getCoinTexture(scene: Scene): Texture {
  return _cached(scene, 'coin', () => {
    const size = 128
    const tex  = _dyn(scene, 'coinTex', size)
    const ctx  = tex.getContext() as CanvasRenderingContext2D
    const c = size / 2
    ctx.fillStyle = '#ffd34a'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#ffb200'
    ctx.lineWidth = 10
    ctx.beginPath(); ctx.arc(c, c, c - 8, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#ffa800'
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 36 : 16
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#fff2b0'
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 28 : 12
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
      const x = c + Math.cos(a) * r, y = c - 3 + Math.sin(a) * r
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.fill()
    tex.update(true)
    return tex
  })
}

/** Horizontal rainbow band with soft edges, for the star-power trail. */
export function getRainbowTexture(scene: Scene): Texture {
  return _cached(scene, 'rainbow', () => {
    const W = 64, H = 128
    const tex = new DynamicTexture('rainbowTex', { width: W, height: H }, scene, false)
    const ctx = tex.getContext() as CanvasRenderingContext2D
    const g = ctx.createLinearGradient(0, 0, 0, H)
    const stops = ['#ff3b3b', '#ff9a1f', '#ffe32b', '#38e05a', '#2bb0ff', '#7b4bff']
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    tex.update(false)
    return tex
  })
}
