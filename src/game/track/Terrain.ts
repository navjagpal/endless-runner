/**
 * Rolling terrain.
 *
 * The road rises and falls, but only visually: gameplay stays on a flat
 * plane and every visible thing is lifted by the same height function
 * at its own z. Chunks get it baked into their vertices, obstacles are
 * lifted and tilted at spawn, coins and the player add it per frame.
 * Because the offset is a smooth function of z and every object is
 * small compared to its wavelength, the world stays consistent — a
 * truck tilted to the local slope has its roof where the terrain puts
 * the player's feet.
 *
 * Never negative: the far ground plane sits just under road level and
 * a dip would show it through the verge. So the road runs on hills,
 * from road level up to ~3.6 m, and the first stretch is flat so the
 * start screen frames a level road.
 */

const BASE  = 1.8
const AMP_1 = 1.2, FREQ_1 = 0.026
const AMP_2 = 0.6, FREQ_2 = 0.061

/** Lateral extent of the hills: full under the road, gone beyond the verge. */
const FLAT_HALF_WIDTH = 9
const EDGE_HALF_WIDTH = 26

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Height of the road surface above the base plane at distance z. */
export function terrainY(z: number): number {
  const ramp = smoothstep(30, 110, z)
  return ramp * (BASE + AMP_1 * Math.sin(z * FREQ_1) + AMP_2 * Math.sin(z * FREQ_2 + 1.3))
}

/** dY/dz — what to tilt an obstacle by. Max ~7 %. */
export function terrainSlope(z: number): number {
  const e = 0.5
  return (terrainY(z + e) - terrainY(z - e)) / (2 * e)
}

/** Height for scenery at (x, z): the hill fades out across the verge. */
export function terrainYAt(x: number, z: number): number {
  const k = 1 - smoothstep(FLAT_HALF_WIDTH, EDGE_HALF_WIDTH, Math.abs(x))
  return terrainY(z) * k
}
