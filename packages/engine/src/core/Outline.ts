import { Scene, Camera, PostProcess, Effect, Vector2 } from '@babylonjs/core'

/**
 * Screen-space outlines from the depth buffer.
 *
 * Inverted-hull outlines (Babylon's per-mesh renderOutline) fall apart
 * on flat-shaded, merged geometry: every hard edge opens a gap. Edge
 * detection on depth draws a clean dark line wherever one surface
 * stands in front of another, which on this scene is exactly the
 * silhouettes. It's one extra full-screen pass plus the depth prepass,
 * so it's reserved for the high tier.
 */

Effect.ShadersStore['edgeOutlineFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 texel;
uniform float strength;

void main(void) {
  vec4 color = texture2D(textureSampler, vUV);
  float d  = texture2D(depthSampler, vUV).r;
  float dl = texture2D(depthSampler, vUV - vec2(texel.x, 0.0)).r;
  float dr = texture2D(depthSampler, vUV + vec2(texel.x, 0.0)).r;
  float du = texture2D(depthSampler, vUV - vec2(0.0, texel.y)).r;
  float dd = texture2D(depthSampler, vUV + vec2(0.0, texel.y)).r;
  // Relative depth step: a fixed threshold would outline every ripple
  // near the camera and nothing far away.
  float edge = (abs(d - dl) + abs(d - dr) + abs(d - du) + abs(d - dd)) / max(d, 0.004);
  float e = smoothstep(0.06, 0.16, edge);
  // Fade with distance so the horizon doesn't turn to scribble.
  e *= 1.0 - smoothstep(0.35, 0.8, d);
  gl_FragColor = vec4(color.rgb * (1.0 - e * strength), color.a);
}
`

export function setupOutline(scene: Scene, camera: Camera): PostProcess {
  const depth = scene.enableDepthRenderer(camera, false)
  const pp = new PostProcess('edgeOutline', 'edgeOutline', ['texel', 'strength'], ['depthSampler'], 1.0, camera)
  pp.onApply = (effect) => {
    effect.setTexture('depthSampler', depth.getDepthMap())
    effect.setVector2('texel', new Vector2(1 / pp.width, 1 / pp.height))
    effect.setFloat('strength', 0.55)
  }
  return pp
}
