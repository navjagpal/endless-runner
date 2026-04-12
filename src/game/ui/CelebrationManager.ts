import {
  Scene,
  ParticleSystem,
  Texture,
  Color4,
  Vector3,
  Mesh,
} from '@babylonjs/core'
import type { ZoneConfig } from '../zones/ZoneManager'

// ─── Milestone list ────────────────────────────────────────────────────────────

interface Milestone {
  dist: number
  text: string
  sub: string
  emoji: string
  big: boolean       // big = full zone-change style, small = quick pop
}

const MILESTONES: Milestone[] = [
  { dist:  100, text: 'Nice!',       sub: '100 metres',  emoji: '🌟', big: false },
  { dist:  250, text: 'Amazing!',    sub: '250 metres',  emoji: '⭐', big: false },
  { dist:  500, text: 'New World!',  sub: 'Forest',      emoji: '🌲', big: true  },
  { dist:  750, text: 'Superstar!',  sub: '750 metres',  emoji: '💫', big: false },
  { dist: 1000, text: 'New World!',  sub: 'City',        emoji: '🏙️', big: true  },
  { dist: 1250, text: 'Incredible!', sub: '1250 metres', emoji: '🎉', big: false },
  { dist: 1500, text: 'New World!',  sub: 'Beach',       emoji: '🌊', big: true  },
  { dist: 1750, text: 'Legendary!',  sub: '1750 metres', emoji: '🏆', big: false },
  { dist: 2000, text: 'New World!',  sub: 'Space',       emoji: '🚀', big: true  },
  { dist: 3000, text: 'Cosmic!',     sub: '3000 metres', emoji: '🌌', big: false },
  { dist: 5000, text: 'INFINITE!',   sub: '5000 metres', emoji: '🌈', big: true  },
]

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
  `
  document.head.appendChild(style)
}

// ─── CelebrationManager ───────────────────────────────────────────────────────

export class CelebrationManager {
  private scene: Scene
  private emitter: Mesh
  private psSystems: ParticleSystem[] = []
  private overlay: HTMLDivElement
  private nextMilestoneIdx = 0
  private lastTriggerDist  = -1

  constructor(scene: Scene, playerMesh: Mesh) {
    this.scene   = scene
    this.emitter = playerMesh
    injectCSS()
    this.overlay = this._buildOverlay()
    this.psSystems = this._buildConfettiSystems()
  }

  // Call every frame
  checkMilestone(distance: number): void {
    if (this.nextMilestoneIdx >= MILESTONES.length) return
    const m = MILESTONES[this.nextMilestoneIdx]
    if (distance >= m.dist && distance !== this.lastTriggerDist) {
      this.lastTriggerDist = distance
      this.nextMilestoneIdx++
      this._trigger(m)
    }
  }

  // Also callable from Game.ts when zone changes
  celebrateZone(zone: ZoneConfig): void {
    const m: Milestone = {
      dist: 0, text: 'New World!', sub: zone.label,
      emoji: zone.emoji, big: true,
    }
    this._trigger(m)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _trigger(m: Milestone): void {
    this._showOverlay(m)
    this._fireConfetti(m.big ? 2 : 1)
  }

  private _showOverlay(m: Milestone): void {
    const el = this.overlay
    const emojiEl  = el.querySelector<HTMLDivElement>('.cel-emoji')!
    const textEl   = el.querySelector<HTMLDivElement>('.cel-text')!
    const subEl    = el.querySelector<HTMLDivElement>('.cel-sub')!

    emojiEl.textContent = m.emoji
    textEl.textContent  = m.text
    subEl.textContent   = m.sub

    const holdMs = m.big ? 2800 : 1800
    const bgGrad = m.big
      ? 'linear-gradient(135deg,rgba(30,10,70,0.88),rgba(80,20,120,0.88))'
      : 'linear-gradient(135deg,rgba(10,30,70,0.82),rgba(20,60,100,0.82))'

    el.style.background = bgGrad
    textEl.style.fontSize = m.big ? 'clamp(2rem,8vw,4.5rem)' : 'clamp(1.5rem,5vw,2.8rem)'

    el.style.display    = 'flex'
    el.style.animation  = 'celebIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards'

    const hideTimer = setTimeout(() => {
      el.style.animation = 'celebOut 0.4s ease-in forwards'
      setTimeout(() => { el.style.display = 'none' }, 400)
    }, holdMs)

    // Cancel if another celebration fires soon
    ;(el as HTMLDivElement & { _hideTimer?: ReturnType<typeof setTimeout> })._hideTimer &&
      clearTimeout((el as HTMLDivElement & { _hideTimer?: ReturnType<typeof setTimeout> })._hideTimer)
    ;(el as HTMLDivElement & { _hideTimer?: ReturnType<typeof setTimeout> })._hideTimer = hideTimer
  }

  private _buildOverlay(): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = `
      display:none; position:fixed;
      top:42%; left:50%; transform:translate(-50%,-50%);
      flex-direction:column; align-items:center; gap:6px;
      padding:24px 48px 20px;
      border-radius:24px;
      border:1px solid rgba(255,255,255,0.2);
      backdrop-filter:blur(12px);
      pointer-events:none; z-index:100;
      text-align:center;
      font-family:'Nunito','Arial Rounded MT Bold',Arial,sans-serif;
      box-shadow:0 8px 48px rgba(0,0,0,0.5);
    `

    const emoji = document.createElement('div')
    emoji.className = 'cel-emoji'
    emoji.style.cssText = 'font-size:clamp(2.5rem,10vw,5rem);animation:emojiPop 0.6s ease forwards;'

    const text = document.createElement('div')
    text.className = 'cel-text'
    text.style.cssText = `
      font-weight:900; color:#fff;
      text-shadow:0 2px 12px rgba(0,0,0,0.6);
      letter-spacing:-0.5px;
      animation:shimmer 1.2s ease-in-out infinite;
    `

    const sub = document.createElement('div')
    sub.className = 'cel-sub'
    sub.style.cssText = 'color:rgba(255,255,255,0.75); font-size:clamp(0.9rem,3vw,1.3rem); font-weight:600;'

    el.appendChild(emoji)
    el.appendChild(text)
    el.appendChild(sub)
    document.body.appendChild(el)
    return el
  }

  private _buildConfettiSystems(): ParticleSystem[] {
    const systems: ParticleSystem[] = []

    for (const [r, g, b] of CONFETTI_COLORS) {
      const ps = new ParticleSystem(`confetti_${r}`, 35, this.scene)
      ps.particleTexture = new Texture('https://assets.babylonjs.com/particles/flare.png', this.scene)
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
