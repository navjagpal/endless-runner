import {
  Scene,
  TransformNode,
  Color3,
  AnimationGroup,
  AbstractMesh,
  Mesh,
  PBRMaterial,
  StandardMaterial,
  VertexBuffer,
  LoadAssetContainerAsync,
} from '@babylonjs/core'
import type { Character, CharacterContext, CharacterState } from './Character'

/**
 * Skinned-GLB character.
 *
 * The single largest visual gap between this game and a commercial
 * runner is that the player is a stack of primitives rotated by a sine
 * wave rather than a rigged mesh playing a real run cycle. This class
 * closes that: drop a GLB at `public/models/runner.glb` and it is used
 * automatically, with the procedural character kept as the fallback.
 *
 * Animation clips are matched by keyword rather than exact name,
 * because every source names them differently — Mixamo exports
 * "mixamo.com" or "Armature|mixamo.com", Ready Player Me uses
 * "Idle"/"Run", Blender exports whatever the NLA track was called. A
 * clip that isn't found is synthesized procedurally from the run pose
 * instead of failing.
 */

/** "glTF" as a little-endian uint32 — the first four bytes of every GLB. */
const GLB_MAGIC = 0x46546c67

/**
 * Keyword sets tried in order; first set that matches wins, and within a
 * set every keyword must be present.
 *
 * Ordering carries real weight. The bundled Quaternius rig ships both
 * `Man_Jump` (a standing hop) and `Man_RunningJump`, and a plain 'jump'
 * search hits the standing one first purely because of glTF clip order.
 * For an endless runner the running jump is obviously the right clip,
 * so it gets its own earlier, more specific entry.
 *
 * The misspelled 'recieve' is deliberate — that's how Quaternius names
 * the hit-reaction clip, and matching the correct spelling would miss it.
 */
const CLIP_KEYWORDS: Record<CharacterState, string[][]> = {
  running:  [['sprint'], ['run', 'forward'], ['run'], ['jog'], ['walk']],
  jumping:  [['running', 'jump'], ['run', 'jump'], ['jump'], ['leap'], ['air'], ['fall']],
  sliding:  [['slide'], ['slid'], ['roll'], ['crouch'], ['duck'], ['dive']],
  bumping:  [['stumble'], ['recieve'], ['receive'], ['impact'], ['hit'], ['react'], ['bump'], ['trip']],
}

/**
 * Clips that must never be auto-matched.
 *
 * CC0 character packs are built for generic action games, so they carry
 * combat and directional-strafe clips alongside the locomotion. A bare
 * substring search happily binds `Run_Shoot` or `Run_Back` to the run
 * state; excluding them is cheaper than making every keyword exact.
 */
const CLIP_BLOCKLIST = ['shoot', 'gun', 'sword', 'punch', 'kick', 'slash', 'back', 'left', 'right', 'death', 'wheelchair', 'die', 'sit', 'drive']

const BLEND_SPEED = 8.0     // weight units/sec during a state cross-fade

/** Extra yaw applied to the loaded model so it faces +z (down the track). */
const HERO_YAW = 0

function _findClip(groups: AnimationGroup[], state: CharacterState): AnimationGroup | null {
  for (const keywords of CLIP_KEYWORDS[state]) {
    const hit = groups.find(g => {
      const n = g.name.toLowerCase()
      if (!keywords.every(k => n.includes(k))) return false
      // Don't let a blocked word veto a keyword we explicitly asked for
      // — 'roll' should still match a clip literally named "Roll".
      return !CLIP_BLOCKLIST.some(b => n.includes(b) && !keywords.includes(b))
    })
    if (hit) return hit
  }
  return null
}

export class CharacterRig implements Character {
  public root: TransformNode
  public readonly height: number

  private meshes: AbstractMesh[] = []
  private clips: Partial<Record<CharacterState, AnimationGroup>> = {}
  private weights: Record<string, number> = {}
  private originalColors = new Map<PBRMaterial | StandardMaterial, Color3>()

  /** Node we apply lean/tilt to, so clip animation on the root is preserved. */
  private tiltNode: TransformNode

  private constructor(scene: Scene, parent: TransformNode, container: {
    meshes: AbstractMesh[]
    animationGroups: AnimationGroup[]
    rootNodes: TransformNode[]
  }, height: number) {
    this.height = height

    this.root = new TransformNode('rigRoot', scene)
    this.root.parent = parent

    this.tiltNode = new TransformNode('rigTilt', scene)
    this.tiltNode.parent = this.root

    // glTF has no "forward" convention worth trusting; this is the knob
    // for a model that arrives facing the camera.
    this.tiltNode.rotation.y = HERO_YAW

    for (const node of container.rootNodes) node.parent = this.tiltNode
    this.meshes = container.meshes

    for (const state of ['running', 'jumping', 'sliding', 'bumping'] as CharacterState[]) {
      const clip = _findClip(container.animationGroups, state)
      if (clip) {
        this.clips[state] = clip
        // All clips run continuously at weight 0; state changes just
        // move weights. Starting and stopping groups instead produces a
        // visible pop at every transition.
        clip.play(true)
        clip.setWeightForAllAnimatables(0)
        this.weights[state] = 0
      }
    }

    // Weight the run clip in immediately so frame one isn't a T-pose.
    if (this.clips.running) {
      this.weights.running = 1
      this.clips.running.setWeightForAllAnimatables(1)
    }

    this._cacheMaterialColors()

    const found = Object.keys(this.clips)
    console.info(
      `[rig] loaded ${container.meshes.length} meshes, clips: ${found.join(', ') || 'none'}`,
    )
  }

  /**
   * Attempts to load the rig. Resolves null when no model is present or
   * the file fails to parse — the caller falls back to the procedural
   * character, so a missing asset degrades rather than breaks.
   */
  static async tryLoad(scene: Scene, parent: TransformNode, url: string): Promise<CharacterRig | null> {
    try {
      // A 200 is not proof of a model. Vite's dev server and most static
      // hosts fall back to index.html for unknown paths, so a HEAD check
      // passes and the loader then dies on "Unexpected magic" — the
      // first four bytes being "<!do". Verify the glTF magic ourselves
      // and treat anything else as "no model present", which is an
      // expected state here rather than an error.
      const res = await fetch(url)
      if (!res.ok) {
        console.info(`[rig] no model at ${url} — using procedural character`)
        return null
      }

      const buffer = await res.arrayBuffer()
      if (buffer.byteLength < 4 || new DataView(buffer).getUint32(0, true) !== GLB_MAGIC) {
        console.info(`[rig] ${url} is not a GLB (server likely served HTML) — using procedural character`)
        return null
      }

      // Only pull the glTF loader in once we know there's something to
      // load with it. Registering it at module scope drags the whole
      // parser into the main bundle for every player, including the
      // ones running the procedural character.
      await import('@babylonjs/loaders/glTF')

      // Load from the bytes already in hand rather than re-fetching.
      const file = new File([buffer], url.split('/').pop() || 'runner.glb')
      const container = await LoadAssetContainerAsync(file, scene)
      container.addAllToScene()

      // Kenney's characters ship unlit and without normals — fine for a
      // flat-colour toy render, wrong next to a lit track. Give them
      // normals and a matte lit material so the sun and zone tint apply.
      for (const m of container.meshes) {
        if (m instanceof Mesh && m.getTotalVertices() > 0 && !m.isVerticesDataPresent(VertexBuffer.NormalKind)) {
          m.createNormals(false)
        }
        if (m.material instanceof PBRMaterial) {
          m.material.unlit     = false
          m.material.metallic  = 0
          m.material.roughness = 0.85
        }
      }

      // A skinned PBR shader takes a moment to compile, and Babylon
      // simply doesn't draw a mesh whose material isn't ready. Swapping
      // the procedural character out before that point leaves the
      // player invisible for a few frames — on a slow GPU, a lot of
      // frames. Compile first, swap second.
      await Promise.all(
        container.meshes
          .filter(m => m.material && m.getTotalVertices() > 0)
          .map(m => m.material!.forceCompilationAsync(m)),
      )

      const rootNodes = container.rootNodes.filter(
        (n): n is TransformNode => n instanceof TransformNode,
      )
      if (!rootNodes.length) {
        console.warn(`[rig] ${url} has no root nodes — using procedural character`)
        return null
      }

      const height = CharacterRig._measureHeight(container.meshes)
      const rig = new CharacterRig(
        scene,
        parent,
        { meshes: container.meshes, animationGroups: container.animationGroups, rootNodes },
        height,
      )
      rig._normalizeScale(height)
      return rig
    } catch (e) {
      console.warn(`[rig] failed to load ${url}, using procedural character:`, e)
      return null
    }
  }

  private static _measureHeight(meshes: AbstractMesh[]): number {
    let min = Infinity
    let max = -Infinity
    for (const m of meshes) {
      if (!m.getTotalVertices()) continue
      const bb = m.getBoundingInfo().boundingBox
      min = Math.min(min, bb.minimumWorld.y)
      max = Math.max(max, bb.maximumWorld.y)
    }
    const h = max - min
    return isFinite(h) && h > 0.01 ? h : 1.7
  }

  /**
   * Rescales the model to the ~1.5-unit character the track, camera and
   * collision box are all tuned around. Mixamo exports in centimetres,
   * Blender in metres, and asset stores in whatever — without this, a
   * dropped-in model is either a speck or a skyscraper.
   */
  private _normalizeScale(measured: number): void {
    const TARGET = 1.5
    const s = TARGET / measured
    this.root.scaling.setAll(s)
    console.info(`[rig] measured height ${measured.toFixed(2)} → scale ${s.toFixed(3)}`)
  }

  private _cacheMaterialColors(): void {
    for (const m of this.meshes) {
      const mat = m.material
      if (mat instanceof PBRMaterial) {
        this.originalColors.set(mat, mat.albedoColor.clone())
      } else if (mat instanceof StandardMaterial) {
        this.originalColors.set(mat, mat.diffuseColor.clone())
      }
    }
  }

  update(dt: number, state: CharacterState, ctx: CharacterContext): void {
    this._blendTo(state, dt)
    this._applyProceduralLayer(dt, state, ctx)
  }

  /** Cross-fades clip weights toward the active state. */
  private _blendTo(state: CharacterState, dt: number): void {
    // A bump with no dedicated clip should keep the run cycle going
    // rather than freeze — the flash and particles carry the feedback.
    const target: CharacterState =
      this.clips[state] ? state : 'running'

    const step = BLEND_SPEED * dt
    for (const key of Object.keys(this.clips) as CharacterState[]) {
      const clip = this.clips[key]
      if (!clip) continue
      const want = key === target ? 1 : 0
      const cur  = this.weights[key] ?? 0
      const next = cur + Math.sign(want - cur) * Math.min(step, Math.abs(want - cur))
      if (next !== cur) {
        this.weights[key] = next
        clip.setWeightForAllAnimatables(next)
      }
    }
  }

  /**
   * Motion the clips can't know about, layered on top: roll into lane
   * changes, forward pitch with speed, and a tuck synthesized when the
   * model shipped without a jump or slide clip.
   */
  private _applyProceduralLayer(dt: number, state: CharacterState, ctx: CharacterContext): void {
    const targetRoll  = -ctx.lateralVel * 0.055
    const targetPitch = ctx.speedFrac * 0.10

    let extraPitch = 0
    let squash     = 1

    if (state === 'jumping' && !this.clips.jumping) {
      // No jump clip: tuck forward on the way up, reach on the way down.
      extraPitch = ctx.verticalVel > 0 ? 0.35 : -0.20
    } else if (state === 'sliding' && !this.clips.sliding) {
      // No slide clip: pitch hard forward and squash vertically.
      extraPitch = 1.05
      squash     = 0.55
    }

    const t = Math.min(1, dt * 12)
    const r = this.tiltNode.rotation
    r.z += (targetRoll - r.z) * t
    r.x += (targetPitch + extraPitch - r.x) * t

    const sy = this.tiltNode.scaling.y
    this.tiltNode.scaling.y = sy + (squash - sy) * t
  }

  flashRed(active: boolean): void {
    for (const [mat, original] of this.originalColors) {
      const c = active ? new Color3(1, 0.25, 0.25) : original
      if (mat instanceof PBRMaterial) mat.albedoColor = c
      else mat.diffuseColor = c
    }
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v)
  }

  dispose(): void {
    for (const key of Object.keys(this.clips) as CharacterState[]) {
      this.clips[key]?.dispose()
    }
    for (const m of this.meshes) m.dispose()
    this.root.dispose()
  }

  /** Meshes to register as shadow casters. */
  get castingMeshes(): AbstractMesh[] {
    return this.meshes.filter(m => m.getTotalVertices() > 0)
  }
}
