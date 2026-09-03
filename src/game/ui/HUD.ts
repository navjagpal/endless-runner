import {
  type GameSettings, type BestRecord, loadSettings, saveSettings, SPEED_MIN, SPEED_MAX,
} from './Settings'

export interface HudExtra {
  multiplier:      number
  /** 0..1 */
  starMeter:       number
  starActive:      boolean
  magnetRemaining: number
  bestDistance:    number
}

export type InputAction = 'left' | 'right' | 'jump' | 'slide'

const FONT = `'Nunito','Fredoka','Arial Rounded MT Bold','Segoe UI Rounded',Arial,sans-serif`

let _cssInjected = false
function injectCSS(): void {
  if (_cssInjected) return
  _cssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes hudCoinPop { 0%{transform:scale(1)} 40%{transform:scale(1.35)} 100%{transform:scale(1)} }
    @keyframes hudShake   { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
    @keyframes hudPulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
    @keyframes hudRainbow { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
    @keyframes hudBounce  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    .hud-btn:active { transform:scale(0.92) !important; }
    .touch-btn { -webkit-tap-highlight-color: transparent; }
    .touch-btn:active { transform:scale(0.9); background:rgba(255,255,255,0.45) !important; }
  `
  document.head.appendChild(style)
}

export class HUD {
  private container:      HTMLDivElement
  private distanceEl:     HTMLSpanElement
  private coinsEl:        HTMLSpanElement
  private coinWrap:       HTMLDivElement
  private multEl:         HTMLDivElement
  private starFill:       HTMLDivElement
  private starWrap:       HTMLDivElement
  private starLabel:      HTMLDivElement
  private magnetEl:       HTMLDivElement
  private speedBar:       HTMLDivElement
  private bestEl:         HTMLDivElement
  private startScreen:    HTMLDivElement
  private startBest:      HTMLDivElement
  private pauseScreen:    HTMLDivElement
  private settingsScreen: HTMLDivElement
  private pauseBtn:       HTMLButtonElement
  private settingsBtn:    HTMLButtonElement
  private touchPad:       HTMLDivElement

  private settings: GameSettings = loadSettings()
  private _openedDuringPlay = false
  private _lastMult = 1
  private _playing = false

  onPlay?:            () => void
  onPause?:           () => void
  onResume?:          () => void
  onSettingsChange?:  (s: GameSettings) => void
  onInput?:           (a: InputAction) => void

  constructor() {
    injectCSS()
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position:fixed; inset:0; pointer-events:none;
      font-family:${FONT}; user-select:none; -webkit-user-select:none;
    `

    // ── Top bar: distance + coins ─────────────────────────────────────────
    const topBar = document.createElement('div')
    topBar.style.cssText = `
      position:absolute; top:14px; left:50%; transform:translateX(-50%);
      display:flex; align-items:center; gap:18px;
      background:linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.10));
      border-radius:40px; padding:8px 26px; backdrop-filter:blur(10px);
      border:2px solid rgba(255,255,255,0.35);
      box-shadow:0 6px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5);
    `
    const distWrap = document.createElement('div')
    distWrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const distIcon = document.createElement('span')
    distIcon.textContent = '🏃'; distIcon.style.fontSize = '1.3rem'
    this.distanceEl = document.createElement('span')
    this.distanceEl.style.cssText = `color:#fff;font-size:1.55rem;font-weight:900;
      text-shadow:0 2px 0 rgba(0,0,0,0.25),0 3px 10px rgba(0,0,0,0.35);min-width:4.2ch;`
    this.distanceEl.textContent = '0 m'
    distWrap.append(distIcon, this.distanceEl)

    const divider = document.createElement('div')
    divider.style.cssText = 'width:2px;height:26px;background:rgba(255,255,255,0.35);border-radius:2px;'

    this.coinWrap = document.createElement('div')
    this.coinWrap.style.cssText = 'display:flex;align-items:center;gap:6px;position:relative;'
    const coinIcon = document.createElement('span')
    coinIcon.textContent = '🪙'; coinIcon.style.fontSize = '1.3rem'
    this.coinsEl = document.createElement('span')
    this.coinsEl.style.cssText = `color:#ffe45c;font-size:1.55rem;font-weight:900;
      text-shadow:0 2px 0 rgba(120,70,0,0.5),0 3px 10px rgba(0,0,0,0.35);min-width:2ch;`
    this.coinsEl.textContent = '0'
    this.multEl = document.createElement('div')
    this.multEl.style.cssText = `
      display:none; margin-left:6px; padding:2px 10px; border-radius:20px;
      background:linear-gradient(135deg,#fb923c,#f43f5e); color:#fff;
      font-size:0.95rem; font-weight:900; box-shadow:0 3px 10px rgba(244,63,94,0.5);
      animation:hudPulse 0.9s ease-in-out infinite;
    `
    this.coinWrap.append(coinIcon, this.coinsEl, this.multEl)

    topBar.append(distWrap, divider, this.coinWrap)
    this.container.appendChild(topBar)

    // ── Best distance (small, under the top bar) ──────────────────────────
    this.bestEl = document.createElement('div')
    this.bestEl.style.cssText = `
      position:absolute; top:66px; left:50%; transform:translateX(-50%);
      color:rgba(255,255,255,0.85); font-size:0.8rem; font-weight:800; letter-spacing:1px;
      text-shadow:0 2px 6px rgba(0,0,0,0.4); display:none;
    `
    this.container.appendChild(this.bestEl)

    // ── Settings button (top-left) ────────────────────────────────────────
    this.settingsBtn = this._iconBtn('⚙️', 'top:14px;left:16px;display:none;')
    this.settingsBtn.addEventListener('pointerup', () => this._openSettings())
    this.container.appendChild(this.settingsBtn)

    // ── Pause button (top-right) ──────────────────────────────────────────
    this.pauseBtn = this._iconBtn('⏸', 'top:14px;right:16px;display:none;')
    this.pauseBtn.addEventListener('pointerup', () => this.onPause?.())
    this.container.appendChild(this.pauseBtn)

    // ── Star meter (left edge) ────────────────────────────────────────────
    this.starWrap = document.createElement('div')
    this.starWrap.style.cssText = `
      position:absolute; left:18px; top:50%; transform:translateY(-50%);
      display:none; flex-direction:column; align-items:center; gap:6px;
    `
    this.starLabel = document.createElement('div')
    this.starLabel.textContent = '⭐'
    this.starLabel.style.cssText = 'font-size:1.6rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));'
    const starTrack = document.createElement('div')
    starTrack.style.cssText = `
      width:16px; height:150px; border-radius:10px; overflow:hidden;
      background:rgba(0,0,0,0.30); border:2px solid rgba(255,255,255,0.5);
      display:flex; flex-direction:column; justify-content:flex-end;
      box-shadow:0 4px 12px rgba(0,0,0,0.3);
    `
    this.starFill = document.createElement('div')
    this.starFill.style.cssText = `
      width:100%; height:0%; border-radius:8px;
      background:linear-gradient(180deg,#fff7ae,#fbbf24,#f97316);
      transition:height 0.25s ease;
    `
    starTrack.appendChild(this.starFill)
    this.starWrap.append(this.starLabel, starTrack)
    this.container.appendChild(this.starWrap)

    // ── Magnet timer (right edge) ─────────────────────────────────────────
    this.magnetEl = document.createElement('div')
    this.magnetEl.style.cssText = `
      position:absolute; right:18px; top:50%; transform:translateY(-50%);
      display:none; flex-direction:column; align-items:center; gap:4px;
      color:#fff; font-weight:900; font-size:1.05rem;
      text-shadow:0 2px 6px rgba(0,0,0,0.5);
    `
    this.container.appendChild(this.magnetEl)

    // ── Speed bar (bottom) ────────────────────────────────────────────────
    const speedWrap = document.createElement('div')
    speedWrap.style.cssText = `
      position:absolute; bottom:18px; left:50%; transform:translateX(-50%);
      width:150px; display:flex; flex-direction:column; align-items:center; gap:4px;
    `
    const speedLabel = document.createElement('div')
    speedLabel.textContent = 'SPEED'
    speedLabel.style.cssText = 'color:rgba(255,255,255,0.8);font-size:0.62rem;font-weight:800;letter-spacing:2px;text-shadow:0 1px 4px rgba(0,0,0,0.5);'
    const speedTrack = document.createElement('div')
    speedTrack.style.cssText = 'width:100%;height:8px;background:rgba(0,0,0,0.3);border:1.5px solid rgba(255,255,255,0.45);border-radius:6px;overflow:hidden;'
    this.speedBar = document.createElement('div')
    this.speedBar.style.cssText = `
      height:100%;width:0%;border-radius:4px;
      background:linear-gradient(90deg,#4ade80,#facc15,#f97316);
      transition:width 0.3s ease;
    `
    speedTrack.appendChild(this.speedBar)
    speedWrap.append(speedLabel, speedTrack)
    this.container.appendChild(speedWrap)

    // ── Touch pad (big arrow buttons) ─────────────────────────────────────
    this.touchPad = this._buildTouchPad()
    this.container.appendChild(this.touchPad)

    // ── Screens ───────────────────────────────────────────────────────────
    const { screen: startScreen, best: startBest } = this._buildStartScreen()
    this.startScreen = startScreen
    this.startBest   = startBest
    this.container.appendChild(this.startScreen)

    this.pauseScreen = this._buildPauseScreen()
    this.container.appendChild(this.pauseScreen)

    this.settingsScreen = this._buildSettingsScreen()
    this.container.appendChild(this.settingsScreen)

    document.body.appendChild(this.container)

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      if (this.settingsScreen.style.display === 'flex') { this._closeSettings(); return }
      if (this.pauseScreen.style.display    === 'flex') { this.onResume?.();     return }
      if (this.pauseBtn.style.display       === 'flex') { this.onPause?.() }
    })
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  showStart(best?: BestRecord): void {
    this.startScreen.style.display = 'flex'
    if (best && best.distance > 0) {
      this.startBest.style.display = 'block'
      this.startBest.textContent = `🏆 Best: ${Math.floor(best.distance)} m · 🪙 ${best.coins}`
    }
  }
  hideStart(): void {
    this.startScreen.style.display = 'none'
    this.settingsBtn.style.display = 'flex'
    this.pauseBtn.style.display    = 'flex'
    this.starWrap.style.display    = 'flex'
    this._playing = true
    this.setTouchButtons(this.settings.touchButtons)
  }

  showPause(): void { this.pauseScreen.style.display = 'flex' }
  hidePause(): void { this.pauseScreen.style.display = 'none' }

  getSettings(): GameSettings { return { ...this.settings } }

  setTouchButtons(visible: boolean): void {
    this.touchPad.style.display = visible && this._playing ? 'flex' : 'none'
  }

  /** Coin counter shakes red — the visible half of a coin penalty. */
  flashCoins(): void {
    this.coinsEl.style.color = '#ff6b6b'
    this.coinWrap.style.animation = 'none'
    void this.coinWrap.offsetWidth
    this.coinWrap.style.animation = 'hudShake 0.4s ease'
    setTimeout(() => { this.coinsEl.style.color = '#ffe45c' }, 500)
  }

  update(distanceM: number, coins: number, speedFraction: number, x: HudExtra): void {
    this.distanceEl.textContent = `${Math.floor(distanceM)} m`
    const coinText = String(coins)
    if (this.coinsEl.textContent !== coinText) {
      this.coinsEl.textContent = coinText
      this.coinsEl.style.animation = 'none'
      void this.coinsEl.offsetWidth
      this.coinsEl.style.animation = 'hudCoinPop 0.25s ease'
    }
    this.speedBar.style.width = `${Math.round(speedFraction * 100)}%`

    if (x.multiplier !== this._lastMult) {
      this._lastMult = x.multiplier
      this.multEl.style.display = x.multiplier > 1 ? 'block' : 'none'
      this.multEl.textContent   = `x${x.multiplier}`
    }

    this.starFill.style.height = `${Math.round(x.starMeter * 100)}%`
    if (x.starActive) {
      this.starFill.style.background = 'linear-gradient(180deg,#f0abfc,#60a5fa,#4ade80,#facc15,#f87171)'
      this.starFill.style.animation  = 'hudRainbow 1.2s linear infinite'
      this.starLabel.style.animation = 'hudBounce 0.5s ease-in-out infinite'
    } else {
      this.starFill.style.background = 'linear-gradient(180deg,#fff7ae,#fbbf24,#f97316)'
      this.starFill.style.animation  = 'none'
      this.starLabel.style.animation = x.starMeter > 0.85 ? 'hudPulse 0.6s ease-in-out infinite' : 'none'
    }

    if (x.magnetRemaining > 0) {
      this.magnetEl.style.display = 'flex'
      this.magnetEl.innerHTML = `<div style="font-size:1.8rem">🧲</div><div>${Math.ceil(x.magnetRemaining)}s</div>`
    } else {
      this.magnetEl.style.display = 'none'
    }

    if (x.bestDistance > 0) {
      this.bestEl.style.display = 'block'
      this.bestEl.textContent = `🏆 BEST ${Math.floor(x.bestDistance)} m`
    }
  }

  // ─── Settings helpers ─────────────────────────────────────────────────────

  private _openSettings(fromPlay = true): void {
    this._openedDuringPlay = fromPlay
    if (fromPlay) this.onPause?.()
    this.pauseScreen.style.display    = 'none'
    this.settingsScreen.style.display = 'flex'
  }

  private _closeSettings(): void {
    this.settingsScreen.style.display = 'none'
    if (this._openedDuringPlay) this.onResume?.()
  }

  private _save(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch }
    saveSettings(this.settings)
    this.onSettingsChange?.(this.settings)
  }

  // ─── Touch pad ────────────────────────────────────────────────────────────

  private _buildTouchPad(): HTMLDivElement {
    const pad = document.createElement('div')
    pad.style.cssText = `
      position:absolute; left:0; right:0; bottom:0; height:38%;
      display:none; justify-content:space-between; align-items:flex-end;
      padding:0 4vw 6vh; pointer-events:none;
    `
    const mk = (label: string, action: InputAction, extra = '') => {
      const b = document.createElement('div')
      b.className = 'touch-btn'
      b.style.cssText = `
        width:min(18vw,110px); height:min(18vw,110px); border-radius:50%;
        background:rgba(255,255,255,0.22); border:3px solid rgba(255,255,255,0.65);
        display:flex; align-items:center; justify-content:center;
        font-size:min(9vw,52px); color:#fff; pointer-events:all;
        box-shadow:0 6px 18px rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.4);
        backdrop-filter:blur(6px); transition:transform 0.08s, background 0.08s;
        touch-action:none; ${extra}
      `
      b.textContent = label
      const fire = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.onInput?.(action) }
      b.addEventListener('pointerdown', fire)
      return b
    }
    const left = document.createElement('div')
    left.style.cssText = 'display:flex;gap:min(3vw,18px);align-items:flex-end;'
    left.append(mk('◀', 'left'), mk('▶', 'right'))
    const right = document.createElement('div')
    right.style.cssText = 'display:flex;flex-direction:column;gap:min(2.5vw,14px);align-items:center;'
    right.append(mk('▲', 'jump'), mk('▼', 'slide'))
    pad.append(left, right)
    return pad
  }

  // ─── Screen builders ──────────────────────────────────────────────────────

  private _buildStartScreen(): { screen: HTMLDivElement; best: HTMLDivElement } {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:20px;
      background:radial-gradient(ellipse at 50% 30%,rgba(90,40,160,0.55) 0%,rgba(20,20,60,0.80) 70%);
      pointer-events:all;
    `

    const title = document.createElement('div')
    title.style.cssText = `
      font-size:clamp(2.6rem,11vw,6rem);font-weight:900;line-height:1;
      background:linear-gradient(135deg,#fff6b0,#ffb347 45%,#ff5fa2);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
      filter:drop-shadow(0 6px 0 rgba(120,30,90,0.55)) drop-shadow(0 10px 24px rgba(255,120,80,0.5));
      letter-spacing:-1px; animation:hudBounce 2.4s ease-in-out infinite;
    `
    title.textContent = '🏃 Runner!'

    const sub = document.createElement('div')
    sub.style.cssText = 'color:rgba(255,255,255,0.85);font-size:clamp(0.95rem,3vw,1.25rem);font-weight:700;text-align:center;line-height:1.5;'
    sub.innerHTML = 'Swipe ◀ ▶ to change lane · Swipe ▲ or tap to jump · Swipe ▼ to slide<br><span style="opacity:0.75">Collect coins, dodge everything, fill the ⭐ for Star Power!</span>'

    const best = document.createElement('div')
    best.style.cssText = `
      display:none; color:#ffe45c; font-weight:900; font-size:clamp(1rem,3.2vw,1.4rem);
      background:rgba(0,0,0,0.25); padding:8px 22px; border-radius:30px;
      border:2px solid rgba(255,228,92,0.4);
    `

    const playBtn = document.createElement('button')
    playBtn.className = 'hud-btn'
    playBtn.style.cssText = `
      font-family:inherit;font-size:clamp(1.4rem,4.5vw,2.3rem);font-weight:900;
      padding:20px 72px;border:4px solid rgba(255,255,255,0.7);border-radius:70px;cursor:pointer;
      background:linear-gradient(135deg,#ffb347,#ff5fa2);color:#fff;
      box-shadow:0 10px 0 rgba(160,30,90,0.6),0 16px 40px rgba(255,95,162,0.45);
      transform:scale(1);transition:transform 0.12s,box-shadow 0.12s;pointer-events:all;
      text-shadow:0 2px 0 rgba(0,0,0,0.2);
    `
    playBtn.textContent = '▶  Play!'
    playBtn.addEventListener('pointerenter', () => { playBtn.style.transform='scale(1.06)' })
    playBtn.addEventListener('pointerleave', () => { playBtn.style.transform='scale(1)' })
    playBtn.addEventListener('pointerup',    () => { playBtn.style.transform='scale(1)'; this.onPlay?.() })

    const settingsLink = document.createElement('button')
    settingsLink.style.cssText = `
      font-family:inherit;font-size:1rem;font-weight:800;
      background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.3);
      border-radius:30px;padding:8px 20px;cursor:pointer;
      color:rgba(255,255,255,0.9);pointer-events:all;transition:background 0.12s;
    `
    settingsLink.textContent = '⚙️  Settings'
    settingsLink.addEventListener('pointerenter', () => { settingsLink.style.background='rgba(255,255,255,0.25)' })
    settingsLink.addEventListener('pointerleave', () => { settingsLink.style.background='rgba(255,255,255,0.12)' })
    settingsLink.addEventListener('pointerup', () => this._openSettings(false))

    screen.append(title, sub, best, playBtn, settingsLink)
    return { screen, best }
  }

  private _buildPauseScreen(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;gap:26px;
      background:rgba(20,20,60,0.62);backdrop-filter:blur(6px);pointer-events:all;
    `

    const pauseTitle = document.createElement('div')
    pauseTitle.style.cssText = `
      font-size:clamp(2rem,8vw,4rem);font-weight:900;color:#fff;
      text-shadow:0 4px 0 rgba(0,0,0,0.25),0 8px 24px rgba(0,0,0,0.5);letter-spacing:-1px;
    `
    pauseTitle.textContent = '⏸ Paused'

    const resumeBtn = this._actionBtn('▶  Keep Running!', 'linear-gradient(135deg,#4ade80,#22d3ee)', 'rgba(34,211,238,0.4)')
    resumeBtn.addEventListener('pointerup', () => this.onResume?.())

    const settingsBtn = this._actionBtn('⚙️  Settings', 'linear-gradient(135deg,#818cf8,#6366f1)', 'rgba(99,102,241,0.4)')
    settingsBtn.style.fontSize = 'clamp(0.95rem,2.5vw,1.3rem)'
    settingsBtn.style.padding  = '12px 44px'
    settingsBtn.addEventListener('pointerup', () => this._openSettings(true))

    const escHint = document.createElement('div')
    escHint.style.cssText = 'color:rgba(255,255,255,0.5);font-size:0.82rem;letter-spacing:1px;'
    escHint.textContent = 'Press ESC to resume'

    screen.append(pauseTitle, resumeBtn, settingsBtn, escHint)
    return screen
  }

  private _buildSettingsScreen(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;
      background:rgba(15,15,45,0.78);backdrop-filter:blur(10px);pointer-events:all;
      overflow:auto;
    `

    const card = document.createElement('div')
    card.style.cssText = `
      background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.18);
      border-radius:28px;padding:26px 36px;min-width:min(440px,92vw);max-height:92vh;overflow:auto;
      display:flex;flex-direction:column;gap:20px;
      box-shadow:0 16px 64px rgba(0,0,0,0.5);
    `

    const title = document.createElement('div')
    title.style.cssText = 'font-size:1.6rem;font-weight:900;color:#fff;text-align:center;'
    title.textContent = '⚙️  Settings'

    const sep = () => {
      const d = document.createElement('div')
      d.style.cssText = 'height:1px;background:rgba(255,255,255,0.12);'
      return d
    }

    // ── Kid mode ──
    const kidRow = this._settingRow(
      '🧒  Kid Mode',
      'Gentler speed, more room between obstacles, softer bumps',
    )
    kidRow.appendChild(this._toggle(this.settings.kidMode, (v) => this._save({ kidMode: v }), '😊  On', '🔥  Off'))

    // ── Touch buttons ──
    const touchRow = this._settingRow(
      '🎮  Big Buttons',
      'On-screen arrows for jumping, sliding and changing lanes',
    )
    touchRow.appendChild(this._toggle(this.settings.touchButtons, (v) => this._save({ touchButtons: v }), '👍  Show', '🙈  Hide'))

    // ── Bright Zones toggle ──
    const brightRow = this._settingRow(
      '☀️  Always Bright',
      'Keep all worlds sunny (no dark forest or space)',
    )
    brightRow.appendChild(this._toggle(this.settings.brightZones, (v) => this._save({ brightZones: v }), '☀️  On', '🌙  Off'))

    // ── Speed mode ──
    const speedRow = this._settingRow(
      '🏃  Speed',
      'Auto = gradually increases · Custom = you choose',
    )

    const speedBtns = document.createElement('div')
    speedBtns.style.cssText = 'display:flex;gap:10px;margin-top:12px;'

    const makeSpeedBtn = (label: string, mode: 'auto' | 'manual') => {
      const btn = document.createElement('button')
      btn.style.cssText = `
        font-family:inherit;font-size:0.95rem;font-weight:800;
        padding:8px 22px;border-radius:40px;cursor:pointer;
        transition:all 0.14s;pointer-events:all;
        border:2px solid rgba(255,255,255,0.25);
      `
      const refresh = () => {
        const active = this.settings.speedMode === mode
        btn.style.background = active ? '#6366f1' : 'rgba(255,255,255,0.08)'
        btn.style.color      = active ? '#fff' : 'rgba(255,255,255,0.6)'
        btn.style.borderColor = active ? '#6366f1' : 'rgba(255,255,255,0.2)'
      }
      refresh()
      btn.textContent = label
      btn.addEventListener('pointerup', () => {
        this._save({ speedMode: mode })
        document.querySelectorAll('[data-speedbtn]').forEach(b => {
          const bEl = b as HTMLButtonElement
          const bMode = bEl.dataset.speedbtn as 'auto' | 'manual'
          const active = this.settings.speedMode === bMode
          bEl.style.background  = active ? '#6366f1' : 'rgba(255,255,255,0.08)'
          bEl.style.color       = active ? '#fff' : 'rgba(255,255,255,0.6)'
          bEl.style.borderColor = active ? '#6366f1' : 'rgba(255,255,255,0.2)'
        })
        sliderWrap.style.display = this.settings.speedMode === 'manual' ? 'flex' : 'none'
      })
      btn.dataset.speedbtn = mode
      return btn
    }

    speedBtns.append(makeSpeedBtn('Auto ↗', 'auto'), makeSpeedBtn('Custom ─', 'manual'))

    const sliderWrap = document.createElement('div')
    sliderWrap.style.cssText = `
      display:${this.settings.speedMode === 'manual' ? 'flex' : 'none'};
      flex-direction:column;gap:8px;margin-top:4px;
    `
    const sliderLabels = document.createElement('div')
    sliderLabels.style.cssText = 'display:flex;justify-content:space-between;color:rgba(255,255,255,0.5);font-size:0.78rem;'
    sliderLabels.innerHTML = '<span>Slow 🐢</span><span>Fast 🚀</span>'

    const sliderValEl = document.createElement('div')
    sliderValEl.style.cssText = 'text-align:center;color:#a5b4fc;font-size:0.9rem;font-weight:700;'
    const pct = Math.round((this.settings.manualSpeed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN) * 100)
    sliderValEl.textContent = `Speed: ${pct}%`

    const slider = document.createElement('input')
    slider.type  = 'range'
    slider.min   = String(SPEED_MIN)
    slider.max   = String(SPEED_MAX)
    slider.step  = '2'
    slider.value = String(this.settings.manualSpeed)
    slider.style.cssText = `
      width:100%;accent-color:#6366f1;cursor:pointer;pointer-events:all;
      height:6px;border-radius:3px;
    `
    slider.addEventListener('input', () => {
      const v = Number(slider.value)
      const p = Math.round((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN) * 100)
      sliderValEl.textContent = `Speed: ${p}%`
      this._save({ manualSpeed: v })
    })

    sliderWrap.append(sliderLabels, slider, sliderValEl)
    speedRow.append(speedBtns, sliderWrap)

    const doneBtn = this._actionBtn('✓  Done', 'linear-gradient(135deg,#4ade80,#22d3ee)', 'rgba(34,211,238,0.4)')
    doneBtn.style.alignSelf = 'center'
    doneBtn.addEventListener('pointerup', () => this._closeSettings())

    card.append(title, sep(), kidRow, sep(), touchRow, sep(), brightRow, sep(), speedRow, sep(), doneBtn)
    screen.appendChild(card)
    return screen
  }

  // ─── UI component helpers ────────────────────────────────────────────────

  private _iconBtn(icon: string, extraCss: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'hud-btn'
    btn.style.cssText = `
      position:absolute; ${extraCss}
      width:50px;height:50px;border-radius:50%;cursor:pointer;
      background:rgba(255,255,255,0.18);backdrop-filter:blur(8px);
      border:2px solid rgba(255,255,255,0.45);
      box-shadow:0 4px 16px rgba(0,0,0,0.25);
      font-size:1.35rem;align-items:center;justify-content:center;
      pointer-events:all;transition:transform 0.12s,background 0.12s;
    `
    btn.textContent = icon
    btn.addEventListener('pointerenter', () => { btn.style.background='rgba(255,255,255,0.32)' })
    btn.addEventListener('pointerleave', () => { btn.style.background='rgba(255,255,255,0.18)' })
    return btn
  }

  private _actionBtn(label: string, bg: string, shadow: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'hud-btn'
    btn.style.cssText = `
      font-family:inherit;font-size:clamp(1.1rem,3.5vw,1.8rem);font-weight:900;
      padding:16px 56px;border:3px solid rgba(255,255,255,0.6);border-radius:60px;cursor:pointer;
      background:${bg};color:#fff;
      box-shadow:0 8px 32px ${shadow};
      transform:scale(1);transition:transform 0.12s,box-shadow 0.12s;pointer-events:all;
      text-shadow:0 2px 0 rgba(0,0,0,0.2);
    `
    btn.textContent = label
    btn.addEventListener('pointerenter', () => { btn.style.transform='scale(1.05)' })
    btn.addEventListener('pointerleave', () => { btn.style.transform='scale(1)' })
    return btn
  }

  private _settingRow(label: string, desc: string): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;flex-direction:column;gap:4px;'

    const lbl = document.createElement('div')
    lbl.style.cssText = 'font-size:1.05rem;font-weight:800;color:#fff;'
    lbl.textContent = label

    const d = document.createElement('div')
    d.style.cssText = 'font-size:0.78rem;color:rgba(255,255,255,0.5);'
    d.textContent = desc

    row.append(lbl, d)
    return row
  }

  private _toggle(initial: boolean, onChange: (v: boolean) => void, onLabel: string, offLabel: string): HTMLDivElement {
    let value = initial
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;gap:10px;margin-top:10px;'

    const makeBtn = (label: string, isOn: boolean) => {
      const btn = document.createElement('button')
      btn.style.cssText = `
        font-family:inherit;font-size:0.92rem;font-weight:800;
        padding:7px 20px;border-radius:40px;cursor:pointer;
        transition:all 0.14s;pointer-events:all;
        border:2px solid rgba(255,255,255,0.2);
      `
      const refresh = () => {
        const active = value === isOn
        btn.style.background  = active ? (isOn ? '#f59e0b' : '#64748b') : 'rgba(255,255,255,0.08)'
        btn.style.color       = active ? '#fff' : 'rgba(255,255,255,0.55)'
        btn.style.borderColor = active ? (isOn ? '#f59e0b' : '#64748b') : 'rgba(255,255,255,0.18)'
      }
      refresh()
      btn.textContent = label
      btn.addEventListener('pointerup', () => {
        value = isOn
        onChange(value)
        refreshAll()
      })
      return { btn, refresh }
    }

    const onBtn  = makeBtn(onLabel,  true)
    const offBtn = makeBtn(offLabel, false)

    const refreshAll = () => { onBtn.refresh(); offBtn.refresh() }
    wrap.append(onBtn.btn, offBtn.btn)
    return wrap
  }
}
