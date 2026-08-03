import type { TransformNode } from '@babylonjs/core'

export type CharacterState = 'running' | 'jumping' | 'sliding' | 'bumping'

/**
 * Per-frame context handed to the character so its visual can react to
 * motion it doesn't own — leaning into a lane change, leaning forward
 * with speed, tucking at the apex of a jump.
 */
export interface CharacterContext {
  /** Current run speed in world units/sec. */
  speed: number
  /** Speed normalised to 0..1 across the game's min/max. */
  speedFrac: number
  /** Signed horizontal velocity from the lane lerp — drives body roll. */
  lateralVel: number
  /** Signed vertical velocity — distinguishes rise from fall mid-jump. */
  verticalVel: number
  /** Height above the ground plane. */
  height: number
}

/**
 * The runner's visual representation.
 *
 * Two implementations satisfy this: a procedural one built from
 * primitives (always available, no assets) and a skinned GLB rig. The
 * Player owns collision and physics and doesn't care which it has.
 */
export interface Character {
  readonly root: TransformNode
  update(dt: number, state: CharacterState, ctx: CharacterContext): void
  /** Tint on collision. */
  flashRed(active: boolean): void
  setVisible(v: boolean): void
  /** Approximate standing height, used to place the blob shadow. */
  readonly height: number
  dispose(): void
}
