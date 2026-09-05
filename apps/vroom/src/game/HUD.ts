import { icon } from '@kids/engine'
import type { VehicleDef, GarageState } from './Garage'

/**
 * A HUD for a four-year-old: two numbers at the top, a big JUMP button,
 * a big ACTION button, and nothing else during play. Steering is tapping
 * either side of the screen (handled on the canvas by Game).
 */

const FONT = `'Fredoka','Nunito','Arial Rounded MT Bold','Segoe UI Rounded',Arial,sans-serif`

let _css = false
function injectCSS(): void {
  if (_css) return
  _css = true
  const s = document.createElement('style')
  s.textContent = `
    @keyframes vPop { 0%{transform:scale(1)} 40%{transform:scale(1.35)} 100%{transform:scale(1)} }
    @keyframes vBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes vShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
    .vb { position:relative; }
    .vb:active { transform:translateY(5px) !important; box-shadow:0 2px 0 rgba(0,0,0,0.3) !important; }
    .vicon svg { filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35)); }
  `
  document.head.appendChild(s)
}

export class HUD {
  private container: HTMLDivElement
  private topBar: HTMLDivElement
  private distEl: HTMLSpanElement
  private coinsEl: HTMLSpanElement
  private pauseBtn: HTMLButtonElement
  private jumpBtn: HTMLButtonElement
  private actionBtn: HTMLButtonElement
  private airEl: HTMLDivElement
  private startScreen: HTMLDivElement
  private pauseScreen: HTMLDivElement
  private playBtn!: HTMLButtonElement
  private vehName!: HTMLDivElement
  private vehStatus!: HTMLDivElement
  private bankEl!: HTMLDivElement
  private bestEl!: HTMLDivElement

  private vehicles: VehicleDef[] = []
  private garage: GarageState = { selected: '', bank: 0 }
  private viewIndex = 0

  onPlay?: () => void
  onPause?: () => void
  onResume?: () => void
  onHome?: () => void
  onJump?: () => void
  onAction?: () => void
  onVehicleChange?: (id: string) => void

  constructor() {
    injectCSS()
    this.container = document.createElement('div')
    this.container.style.cssText = `position:fixed;inset:0;pointer-events:none;font-family:${FONT};user-select:none;-webkit-user-select:none;`

    // Top bar
    this.topBar = document.createElement('div')
    this.topBar.style.cssText = `
      position:absolute;top:14px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:18px;
      background:linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.10));border-radius:40px;padding:8px 26px;
      backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.35);box-shadow:0 6px 24px rgba(0,0,0,0.25);
    `
    const dist = document.createElement('div'); dist.style.cssText = 'display:flex;align-items:center;gap:8px;'
    const distIcon = document.createElement('span'); distIcon.className = 'vicon'; distIcon.innerHTML = icon('runner', '1.5rem')
    this.distEl = document.createElement('span')
    this.distEl.style.cssText = 'color:#fff;font-size:1.6rem;font-weight:700;text-shadow:0 2px 0 rgba(0,0,0,0.25);min-width:4.2ch;'
    this.distEl.textContent = '0 m'
    dist.append(distIcon, this.distEl)
    const div = document.createElement('div'); div.style.cssText = 'width:2px;height:26px;background:rgba(255,255,255,0.35);border-radius:2px;'
    const coins = document.createElement('div'); coins.style.cssText = 'display:flex;align-items:center;gap:8px;'
    const coinIcon = document.createElement('span'); coinIcon.className = 'vicon'; coinIcon.innerHTML = icon('coin', '1.6rem')
    this.coinsEl = document.createElement('span')
    this.coinsEl.style.cssText = 'color:#ffe45c;font-size:1.6rem;font-weight:700;text-shadow:0 2px 0 rgba(120,70,0,0.5);min-width:2ch;'
    this.coinsEl.textContent = '0'
    coins.append(coinIcon, this.coinsEl)
    this.topBar.append(dist, div, coins)
    this.container.appendChild(this.topBar)

    this.pauseBtn = this._iconBtn(icon('pause', '1.4rem'), 'top:14px;right:16px;')
    this.pauseBtn.style.display = 'none'
    this.pauseBtn.addEventListener('pointerup', () => this.onPause?.())
    this.container.appendChild(this.pauseBtn)

    // Air-time readout
    this.airEl = document.createElement('div')
    this.airEl.style.cssText = `
      position:absolute;top:22%;left:50%;transform:translateX(-50%);display:none;color:#fff;
      font-size:clamp(1.4rem,5vw,2.6rem);font-weight:700;text-shadow:0 3px 0 rgba(0,0,0,0.25),0 6px 18px rgba(0,0,0,0.45);
    `
    this.container.appendChild(this.airEl)

    // Big buttons
    this.jumpBtn = this._bigBtn(`${icon('arrowU', '1.1em')}<div style="font-size:0.45em;letter-spacing:2px">JUMP</div>`, 'right:4vw;bottom:5vh;', 'linear-gradient(180deg,#4ade80,#16a34a)')
    this.jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onJump?.() })
    this.actionBtn = this._bigBtn('📣', 'left:4vw;bottom:5vh;', 'linear-gradient(180deg,#f472b6,#db2777)')
    this.actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onAction?.() })
    this.container.append(this.jumpBtn, this.actionBtn)

    this.startScreen = this._buildStart()
    this.pauseScreen = this._buildPause()
    this.container.append(this.startScreen, this.pauseScreen)
    document.body.appendChild(this.container)

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      if (this.pauseScreen.style.display === 'flex') this.onResume?.()
      else if (this.pauseBtn.style.display === 'flex') this.onPause?.()
    })
  }

  // ─── Public ─────────────────────────────────────────────────────────────

  showStart(best: number): void {
    this.startScreen.style.display = 'flex'
    this.bestEl.style.display = best > 0 ? 'block' : 'none'
    this.bestEl.innerHTML = `${icon('trophy', '1.1em')} Best: ${Math.floor(best)} m`
  }
  hideStart(): void {
    this.startScreen.style.display = 'none'
    this.topBar.style.display = 'flex'
    this.pauseBtn.style.display = 'flex'
    this.jumpBtn.style.display = 'flex'
    this.actionBtn.style.display = 'flex'
  }
  showPause(): void { this.pauseScreen.style.display = 'flex' }
  hidePause(): void { this.pauseScreen.style.display = 'none' }

  setReady(ready: boolean): void {
    this.playBtn.disabled = !ready
    this.playBtn.innerHTML = ready ? `${icon('play', '1.2em')} Drive!` : '⏳  Loading…'
    this.playBtn.style.opacity = ready ? '1' : '0.7'
  }

  /** Label the action button for the current vehicle. */
  setAction(kind: string): void {
    this.actionBtn.innerHTML = { siren: '🚨', horn: '📣', wheelie: '🏍️', bounce: '🦘' }[kind] ?? '📣'
  }

  setGarage(vehicles: VehicleDef[], garage: GarageState): void {
    this.vehicles = vehicles
    this.garage = garage
    if (!this.vehicles[this.viewIndex]) this.viewIndex = Math.max(0, vehicles.findIndex(v => v.id === garage.selected))
    this._renderVehicle()
  }

  update(distance: number, coins: number, airTime: number): void {
    this.distEl.textContent = `${Math.floor(distance)} m`
    const t = String(coins)
    if (this.coinsEl.textContent !== t) {
      this.coinsEl.textContent = t
      this.coinsEl.style.animation = 'none'; void this.coinsEl.offsetWidth
      this.coinsEl.style.animation = 'vPop 0.25s ease'
    }
    if (airTime > 0.25) {
      this.airEl.style.display = 'block'
      this.airEl.textContent = `✈ ${airTime.toFixed(1)}s`
    } else {
      this.airEl.style.display = 'none'
    }
  }

  // ─── Garage carousel ────────────────────────────────────────────────────

  private _cycle(dir: number): void {
    if (!this.vehicles.length) return
    this.viewIndex = (this.viewIndex + dir + this.vehicles.length) % this.vehicles.length
    this._renderVehicle()
    this.onVehicleChange?.(this.vehicles[this.viewIndex].id)
  }

  private _renderVehicle(): void {
    const v = this.vehicles[this.viewIndex]
    if (!v) return
    this.vehName.textContent = `${v.emoji} ${v.name}`
    this.bankEl.innerHTML = `${icon('coin', '1.2em')} ${this.garage.bank}`
    this.vehStatus.textContent = { siren: 'Big button: SIREN!', horn: 'Big button: HONK!', wheelie: 'Big button: WHEELIE!', bounce: 'Big button: BOUNCE!' }[v.action]
  }

  // ─── Screens ────────────────────────────────────────────────────────────

  private _buildStart(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
      padding:4vh 0 3vh;pointer-events:all;
      background:linear-gradient(180deg,rgba(12,40,80,0.80) 0%,rgba(12,40,80,0.30) 28%,rgba(12,40,80,0.05) 50%,rgba(12,40,80,0.35) 72%,rgba(12,40,80,0.85) 100%);
    `
    const title = document.createElement('div')
    title.style.cssText = `
      font-size:clamp(2.6rem,11vw,6rem);font-weight:700;line-height:1;
      background:linear-gradient(135deg,#fff6b0,#7dd3fc 45%,#4ade80);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
      filter:drop-shadow(0 6px 0 rgba(10,40,90,0.6)) drop-shadow(0 10px 24px rgba(80,200,255,0.5));animation:vBounce 2.4s ease-in-out infinite;
    `
    title.textContent = '🚒 Vroom Road'
    const sub = document.createElement('div')
    sub.style.cssText = 'color:rgba(255,255,255,0.9);font-size:clamp(0.95rem,3vw,1.3rem);font-weight:700;text-align:center;'
    sub.textContent = 'Tap left or right to steer · JUMP over everything · Honk!'
    const top = document.createElement('div'); top.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;'
    top.append(title, sub)

    // Carousel
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:min(92vw,720px);pointer-events:none;'
    const arrow = (label: string, dir: number) => {
      const b = document.createElement('button')
      b.className = 'vb'
      b.style.cssText = `
        font-family:inherit;width:min(16vw,84px);height:min(16vw,84px);border-radius:50%;cursor:pointer;
        background:rgba(255,255,255,0.22);border:3px solid rgba(255,255,255,0.7);color:#fff;font-size:2rem;
        box-shadow:0 6px 0 rgba(0,0,0,0.28);pointer-events:all;transition:transform 0.08s;
      `
      b.innerHTML = label
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); this._cycle(dir) })
      return b
    }
    const centre = document.createElement('div')
    centre.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;min-height:150px;justify-content:flex-end;'
    this.vehName = document.createElement('div')
    this.vehName.style.cssText = 'font-size:clamp(1.5rem,5.5vw,2.6rem);font-weight:700;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,0.3),0 6px 18px rgba(0,0,0,0.5);'
    this.vehStatus = document.createElement('div')
    this.vehStatus.style.cssText = 'font-size:clamp(0.85rem,2.6vw,1.1rem);font-weight:700;color:rgba(255,255,255,0.9);text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    centre.append(this.vehName, this.vehStatus)
    row.append(arrow(icon('arrowL', '1em'), -1), centre, arrow(icon('arrowR', '1em'), 1))

    this.bankEl = document.createElement('div')
    this.bankEl.style.cssText = `
      position:absolute;top:14px;right:16px;color:#ffe45c;font-weight:700;font-size:clamp(1rem,3vw,1.3rem);
      background:rgba(0,0,0,0.3);padding:6px 16px;border-radius:30px;border:2px solid rgba(255,228,92,0.45);
    `
    this.bestEl = document.createElement('div')
    this.bestEl.style.cssText = `display:none;color:#ffe45c;font-weight:700;font-size:clamp(1rem,3.2vw,1.4rem);background:rgba(0,0,0,0.25);padding:8px 22px;border-radius:30px;border:2px solid rgba(255,228,92,0.4);`

    this.playBtn = document.createElement('button')
    this.playBtn.className = 'vb'
    this.playBtn.style.cssText = `
      font-family:inherit;font-size:clamp(1.4rem,4.5vw,2.3rem);font-weight:700;padding:18px 68px;border:4px solid rgba(255,255,255,0.7);
      border-radius:70px;cursor:pointer;background:linear-gradient(180deg,#4ade80,#16a34a);color:#fff;
      box-shadow:0 8px 0 rgba(10,80,40,0.6),0 16px 40px rgba(74,222,128,0.45);pointer-events:all;text-shadow:0 2px 0 rgba(0,0,0,0.2);
    `
    this.playBtn.innerHTML = `${icon('play', '1.2em')} Drive!`
    this.playBtn.addEventListener('pointerup', () => this.onPlay?.())
    const bottom = document.createElement('div'); bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;'
    bottom.append(this.bestEl, this.playBtn)
    screen.append(top, row, bottom, this.bankEl)
    return screen
  }

  private _buildPause(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:26px;background:rgba(12,40,80,0.62);backdrop-filter:blur(6px);pointer-events:all;`
    const title = document.createElement('div')
    title.style.cssText = 'font-size:clamp(2rem,8vw,4rem);font-weight:700;color:#fff;text-shadow:0 4px 0 rgba(0,0,0,0.25);'
    title.textContent = 'Paused'
    const resume = this._actionBtn(`${icon('play', '1.1em')} Keep Driving!`, 'linear-gradient(180deg,#4ade80,#22d3ee)')
    resume.addEventListener('pointerup', () => this.onResume?.())
    const home = this._actionBtn(`${icon('home', '1.1em')} Garage`, 'linear-gradient(180deg,#f472b6,#fb923c)')
    home.style.fontSize = 'clamp(0.95rem,2.5vw,1.3rem)'; home.style.padding = '12px 44px'
    home.addEventListener('pointerup', () => this.onHome?.())
    screen.append(title, resume, home)
    return screen
  }

  private _iconBtn(svg: string, css: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'vb'
    b.style.cssText = `position:absolute;${css}width:50px;height:50px;border-radius:50%;cursor:pointer;background:rgba(255,255,255,0.18);backdrop-filter:blur(8px);border:2px solid rgba(255,255,255,0.45);box-shadow:0 4px 0 rgba(0,0,0,0.25);align-items:center;justify-content:center;pointer-events:all;`
    b.innerHTML = svg
    return b
  }

  private _bigBtn(html: string, css: string, bg: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'vb'
    b.style.cssText = `
      position:absolute;${css}display:none;flex-direction:column;align-items:center;justify-content:center;
      width:min(24vw,150px);height:min(24vw,150px);border-radius:50%;cursor:pointer;background:${bg};
      border:4px solid rgba(255,255,255,0.75);color:#fff;font-family:inherit;font-size:min(10vw,3.4rem);font-weight:700;
      box-shadow:0 8px 0 rgba(0,0,0,0.3),0 14px 30px rgba(0,0,0,0.3);pointer-events:all;touch-action:none;transition:transform 0.08s;
    `
    b.innerHTML = html
    return b
  }

  private _actionBtn(label: string, bg: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'vb'
    b.style.cssText = `font-family:inherit;font-size:clamp(1.1rem,3.5vw,1.8rem);font-weight:700;padding:16px 56px;border:3px solid rgba(255,255,255,0.6);border-radius:60px;cursor:pointer;background:${bg};color:#fff;box-shadow:0 6px 0 rgba(0,0,0,0.28);pointer-events:all;text-shadow:0 2px 0 rgba(0,0,0,0.2);`
    b.innerHTML = label
    return b
  }
}
