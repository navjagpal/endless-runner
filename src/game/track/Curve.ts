/**
 * How much the road bends at a given distance. The bend itself is done
 * in the vertex shader (see StylePlugin); this only decides the amount,
 * which drifts slowly so the road sweeps left, straightens, sweeps right
 * over a few hundred metres — like a real road, never a hairpin.
 *
 * Zero for the first stretch so the start screen and the tutorial
 * metres are dead straight.
 */
export function curveAt(z: number): number {
  const ramp = Math.max(0, Math.min(1, (z - 60) / 120))
  return ramp * 0.00034 * Math.sin(z * 0.0115 + 0.8)
}
