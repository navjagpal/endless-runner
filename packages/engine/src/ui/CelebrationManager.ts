import {
  Scene,
  ParticleSystem,
  Color4,
  Vector3,
  Mesh,
} from '@babylonjs/core'
import { getFlareTexture } from '../fx/Textures'

// ─── Milestone list ────────────────────────────────────────────────────────────

export interface Milestone {
  dist: number
  text: string
  sub: string
  emoji: string
  big: boolean       // big = full zone-change style, small = quick pop
}

// ─── Confetti colours ──────────────────────────────────────────────────────────

const CONFETTI_COLORS: Array<[number, number, number]> = [
  [1.0, 0.20, 0.20],   // red
  [1.0, 0.82, 0.00],   // yellow
  [0.20, 0.90, 0.25],  // green
  [0.20, 0.55, 1.00],  // blue
  [0.90, 0.20, 0.90],  // purple
  [1.00, 0.50, 0.00],  // orange
]

// ─── CSS (injected once) ───────────────────────────────────────────────────────

let cssInjected = false
function injectCSS(): void {
  if (cssInjected) return
  cssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes celebIn {
      0%   { opacity:0; transform:translate(-50%,-50%) scale(0.4); }
      55%  { opacity:1; transform:translate(-50%,-50%) scale(1.08); }
      75%  { transform:translate(-50%,-50%) scale(0.96); }
      100% { opacity:1; transform:translate(-50%,-50%) scale(1); }
    }
    @keyframes celebOut {
      0%   { opacity:1; transform:translate(-50%,-50%) scale(1); }
      100% { opacity:0; transform:translate(-50%,-50%) scale(0.7) translateY(-30px); }
    }
    @keyframes emojiPop {
      0%  { transform:scale(1); }
      40% { transform:scale(1.35) rotate(-8deg); }
      70% { transform:scale(0.92) rotate(4deg); }
      100%{ transform:scale(1); }
    }
    @keyframes shimmer {
      0%,100% { opacity:1; }
      50%     { opacity:0.7; }
    }
    @keyframes popIn {
      0%   { opacity:0; transform:translate(-50%,-50%) scale(0.5) rotate(-6deg); }
      35%  { opacity:1; transform:translate(-50%,-50%) scale(1.15) rotate(2deg); }
      60%  { transform:translate(-50%,-50%) scale(1) rotate(0deg); }
      80%  { opacity:1; transform:translate(-50%,-60%) scale(1); }
      100% { opacity:0; transform:translate(-50%,-90%) scale(0.9); }
    }
  `
  document.head.appendChild(style)
}

// ─── CelebrationManager ───────────────────────────────────────────────────────

export class CelebrationManager {
  private scene: Scene
  private emitter: Mesh
  private psSystems: ParticleSystem[] = []
  private popEl: HTMLDivElement
  private popTimer: ReturnType<typeof setTimeout> | null = null
  private nextMilestoneIdx = 0
  private lastTriggerDist  = -1

  private milestones: Milestone[]

  constructor(scene: Scene, playerMesh: Mesh, milestones: Milestone[] = []) {
    this.scene   = scene
    this.emitter = playerMesh
    this.milestones = milestones
    injectCSS()
    this.popEl = this._buildPop()
    this.psSystems = this._buildConfettiSystems()
  }

  /**
   * Short floating text near the runner — "x2!", "Oops!", "Wheee!".
   * Cheap, frequent feedback — the only kind of banner this game shows.
   */
  pop(text: string, color = '#fff', big = false): void {
    const el = this.popEl
    el.textContent = text
    el.style.color = color
    el.style.fontSize = big ? 'clamp(1.4rem,5vw,2.6rem)' : 'clamp(1.05rem,3.6vw,1.8rem)'
    el.style.display = 'block'
    el.style.animation = 'none'
    void el.offsetWidth
    el.style.animation = `popIn ${big ? 1.6 : 1.1}s ease-out forwards`
    if (this.popTimer) clearTimeout(this.popTimer)
    this.popTimer = setTimeout(() => { el.style.display = 'none' }, big ? 1600 : 1100)
  }

  /** Confetti without an overlay. */
  burst(multiplier = 1.5): void {
    this._fireConfetti(multiplier)
  }

  // Call every frame
  checkMilestone(distance: number): void {
    if (this.nextMilestoneIdx >= this.milestones.length) return
    const m = this.milestones[this.nextMilestoneIdx]
    if (distance >= m.dist && distance !== this.lastTriggerDist) {
      this.lastTriggerDist = distance
      this.nextMilestoneIdx++
      this._trigger(m)
    }
  }

  /**
   * Zone change. This used to raise the big centre overlay; a child mid-
   * dodge doesn't want a banner over the road, so it is now the same
   * small pop as everything else plus a little confetti.
   */
  celebrateZone(zone: { label: string; emoji: string }): void {
    this.pop(`${zone.emoji} ${zone.label}!`, '#fff')
    this._fireConfetti(1)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _trigger(m: Milestone): void {
    this.pop(`${m.emoji} ${m.text}`, '#ffe45c')
    if (m.big) this._fireConfetti(1)
  }

  private _buildPop(): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = `
      display:none; position:fixed; top:66%; left:50%; transform:translate(-50%,-50%);
      font-family:'Fredoka','Nunito','Arial Rounded MT Bold',Arial,sans-serif;
      font-weight:900; white-space:nowrap; pointer-events:none; z-index:90;
      text-shadow:0 3px 0 rgba(0,0,0,0.25), 0 6px 18px rgba(0,0,0,0.45);
      letter-spacing:-0.5px;
    `
    document.body.appendChild(el)
    return el
  }

  private _buildConfettiSystems(): ParticleSystem[] {
    const systems: ParticleSystem[] = []

    for (const [r, g, b] of CONFETTI_COLORS) {
      const ps = new ParticleSystem(`confetti_${r}`, 35, this.scene)
      ps.particleTexture = getFlareTexture(this.scene)
      ps.emitter        = this.emitter
      ps.minEmitBox     = new Vector3(-1.5, 0, -1)
      ps.maxEmitBox     = new Vector3( 1.5, 0,  1)
      ps.direction1     = new Vector3(-3, 12, -2)
      ps.direction2     = new Vector3( 3, 18,  2)
      ps.minLifeTime    = 1.2
      ps.maxLifeTime    = 2.2
      ps.emitRate       = 0
      ps.manualEmitCount = 0
      ps.minSize        = 0.12
      ps.maxSize        = 0.30
      ps.color1         = new Color4(r, g, b, 1.0)
      ps.color2         = new Color4(Math.min(r + 0.2, 1), Math.min(g + 0.2, 1), Math.min(b + 0.2, 1), 1.0)
      ps.colorDead      = new Color4(r, g, b, 0)
      ps.minEmitPower   = 4
      ps.maxEmitPower   = 10
      ps.gravity        = new Vector3(0, -6, 0)
      ps.blendMode      = ParticleSystem.BLENDMODE_ADD
      ps.targetStopDuration = 0.3
      systems.push(ps)
    }

    return systems
  }

  private _fireConfetti(multiplier: number): void {
    for (const ps of this.psSystems) {
      ps.manualEmitCount = Math.floor(28 * multiplier)
      ps.start()
    }
  }
}
