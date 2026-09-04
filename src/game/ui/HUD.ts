import {
  type GameSettings, type BestRecord, loadSettings, saveSettings, SPEED_MIN, SPEED_MAX,
} from './Settings'
import type { CharacterDef, PetDef, Roster } from '../player/Characters'
import { icon } from './Icons'

export interface HudExtra {
  multiplier:      number
  /** 0..1 */
  starMeter:       number
  starActive:      boolean
  magnetRemaining: number
  jetpackRemaining: number
  boardRemaining:  number
  bestDistance:    number
}

export type InputAction = 'left' | 'right' | 'jump' | 'slide'

const FONT = `'Fredoka','Nunito','Arial Rounded MT Bold','Segoe UI Rounded',Arial,sans-serif`

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
    .hud-btn { position:relative; }
    .hud-btn:active { transform:translateY(4px) !important; box-shadow:0 2px 0 rgba(0,0,0,0.3), 0 4px 10px rgba(0,0,0,0.25) !important; }
    .touch-btn { -webkit-tap-highlight-color: transparent; }
    .touch-btn:active { transform:translateY(4px); background:rgba(255,255,255,0.45) !important; box-shadow:0 2px 0 rgba(0,0,0,0.3) !important; }
    .hud-icon svg { filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35)); }
  `
  document.head.appendChild(style)
}

export class HUD {
  private container:      HTMLDivElement
  private topBar!:        HTMLDivElement
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
  private playBtn!:       HTMLButtonElement
  private touchPad:       HTMLDivElement
  private charName!:      HTMLDivElement
  private charStatus!:    HTMLDivElement
  private unlockBtn!:     HTMLButtonElement
  private bankEl!:        HTMLDivElement
  private roster:         Roster = { selected: '', bank: 0, unlocked: [], pet: 'none', unlockedPets: ['none'] }
  private characters:     CharacterDef[] = []
  private viewIndex       = 0
  private pets:           PetDef[] = []
  private petIndex        = 0
  private petName!:       HTMLDivElement
  private petBtn!:        HTMLButtonElement

  private settings: GameSettings = loadSettings()
  private _openedDuringPlay = false
  private _lastMult = 1
  private _playing = false

  onPlay?:            () => void
  onPause?:           () => void
  onResume?:          () => void
  onSettingsChange?:  (s: GameSettings) => void
  onInput?:           (a: InputAction) => void
  /** Browsing the roster on the start screen — preview this one. */
  onCharacterChange?: (id: string) => void
  /** Tap on the unlock / pick button. */
  onCharacterUnlock?: (id: string) => void
  /** "Home" from the pause menu — back to the start screen. */
  onHome?:            () => void
  onPetChange?:       (id: string) => void
  onPetUnlock?:       (id: string) => void

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
    distIcon.className = 'hud-icon'
    distIcon.innerHTML = icon('runner', '1.5rem'); distIcon.style.fontSize = '1.3rem'
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
    coinIcon.className = 'hud-icon'
    coinIcon.innerHTML = icon('coin', '1.6rem'); coinIcon.style.fontSize = '1.3rem'
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
    topBar.style.display = 'none'
    this.topBar = topBar
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
    this.settingsBtn = this._iconBtn(icon('gear', '1.5rem'), 'top:14px;left:16px;display:none;')
    this.settingsBtn.addEventListener('pointerup', () => this._openSettings())
    this.container.appendChild(this.settingsBtn)

    // ── Pause button (top-right) ──────────────────────────────────────────
    this.pauseBtn = this._iconBtn(icon('pause', '1.4rem'), 'top:14px;right:16px;display:none;')
    this.pauseBtn.addEventListener('pointerup', () => this.onPause?.())
    this.container.appendChild(this.pauseBtn)

    // ── Star meter (left edge) ────────────────────────────────────────────
    this.starWrap = document.createElement('div')
    this.starWrap.style.cssText = `
      position:absolute; left:18px; top:50%; transform:translateY(-50%);
      display:none; flex-direction:column; align-items:center; gap:6px;
    `
    this.starLabel = document.createElement('div')
    this.starLabel.innerHTML = icon('star', '2rem')
    this.starLabel.style.cssText = 'font-size:1.6rem;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));'
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
    this.topBar.style.display      = 'flex'
    this.settingsBtn.style.display = 'flex'
    this.pauseBtn.style.display    = 'flex'
    this.starWrap.style.display    = 'flex'
    this._playing = true
    this.setTouchButtons(this.settings.touchButtons)
  }

  /** Models are still loading: keep the Play button visibly waiting. */
  setReady(ready: boolean): void {
    this.playBtn.disabled = !ready
    this.playBtn.innerHTML = ready ? `${icon('play', '1.2em')} Play!` : '⏳  Loading…'
    this.playBtn.style.opacity = ready ? '1' : '0.7'
  }

  /** The roster to browse; call again whenever the bank or unlocks change. */
  setRoster(characters: CharacterDef[], roster: Roster): void {
    this.characters = characters
    this.roster     = roster
    const idx = characters.findIndex(c => c.id === roster.selected)
    if (idx >= 0 && this.viewIndex >= characters.length) this.viewIndex = idx
    if (!this.characters[this.viewIndex]) this.viewIndex = Math.max(0, idx)
    this._renderCharacter()
  }

  /** Character currently shown in the carousel. */
  get viewedCharacter(): string { return this.characters[this.viewIndex]?.id ?? this.roster.selected }

  setPets(pets: PetDef[], roster: Roster): void {
    this.pets = pets
    this.roster = roster
    const idx = pets.findIndex(p => p.id === roster.pet)
    if (!this.pets[this.petIndex]) this.petIndex = Math.max(0, idx)
    this._renderPet()
  }

  private _cyclePet(dir: number): void {
    if (!this.pets.length) return
    this.petIndex = (this.petIndex + dir + this.pets.length) % this.pets.length
    this._renderPet()
    this.onPetChange?.(this.pets[this.petIndex].id)
  }

  private _renderPet(): void {
    const p = this.pets[this.petIndex]
    if (!p) return
    const owned = this.roster.unlockedPets.includes(p.id)
    const chosen = this.roster.pet === p.id
    const icon = { none: '🚫', puppy: '🐶', kitten: '🐱', bunny: '🐰' }[p.id] ?? '🐾'
    this.petName.textContent = `${icon} ${p.name}`
    if (chosen) {
      this.petBtn.style.display = 'none'
    } else {
      this.petBtn.style.display = 'inline-block'
      const can = owned || this.roster.bank >= p.cost
      this.petBtn.textContent = owned ? `Take ${p.name}` : can ? `🔓 🪙 ${p.cost}` : `🔒 🪙 ${p.cost}`
      this.petBtn.style.background = owned
        ? 'linear-gradient(135deg,#4ade80,#22d3ee)'
        : can ? 'linear-gradient(135deg,#fbbf24,#f97316)' : 'linear-gradient(135deg,#94a3b8,#64748b)'
    }
  }

  shakePet(): void {
    this.petBtn.style.animation = 'none'
    void this.petBtn.offsetWidth
    this.petBtn.style.animation = 'hudShake 0.4s ease'
  }

  private _cycleCharacter(dir: number): void {
    if (!this.characters.length) return
    this.viewIndex = (this.viewIndex + dir + this.characters.length) % this.characters.length
    this._renderCharacter()
    this.onCharacterChange?.(this.characters[this.viewIndex].id)
  }

  private _renderCharacter(): void {
    const c = this.characters[this.viewIndex]
    if (!c) return
    const owned    = this.roster.unlocked.includes(c.id)
    const selected = this.roster.selected === c.id
    this.charName.textContent = c.name
    this.bankEl.innerHTML     = `${icon('coin', '1.2em')} ${this.roster.bank}`
    if (selected) {
      this.charStatus.textContent = '✓ Ready to run!'
      this.unlockBtn.style.display = 'none'
    } else if (owned) {
      this.charStatus.textContent = 'Unlocked'
      this.unlockBtn.style.display = 'inline-block'
      this.unlockBtn.textContent   = `Pick ${c.name}`
      this.unlockBtn.style.background = 'linear-gradient(135deg,#4ade80,#22d3ee)'
    } else {
      const can = this.roster.bank >= c.cost
      this.charStatus.textContent = can ? `Unlock for 🪙 ${c.cost}` : `🔒 Needs 🪙 ${c.cost}`
      this.unlockBtn.style.display = 'inline-block'
      this.unlockBtn.textContent   = can ? `🔓 Unlock for 🪙 ${c.cost}` : `🔒 ${c.cost - this.roster.bank} more coins`
      this.unlockBtn.style.background = can
        ? 'linear-gradient(135deg,#fbbf24,#f97316)'
        : 'linear-gradient(135deg,#94a3b8,#64748b)'
    }
  }

  /** Wiggle the unlock button when a kid taps a character they can't afford yet. */
  shakeUnlock(): void {
    this.unlockBtn.style.animation = 'none'
    void this.unlockBtn.offsetWidth
    this.unlockBtn.style.animation = 'hudShake 0.4s ease'
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

    const powers: string[] = []
    if (x.jetpackRemaining > 0) powers.push(`<div class="hud-icon">${icon('jet', '2.2rem')}</div><div>${Math.ceil(x.jetpackRemaining)}s</div>`)
    if (x.magnetRemaining > 0)  powers.push(`<div class="hud-icon">${icon('magnet', '2.2rem')}</div><div>${Math.ceil(x.magnetRemaining)}s</div>`)
    if (x.boardRemaining > 0)   powers.push(`<div class="hud-icon">${icon('board', '2.2rem')}</div><div>${Math.ceil(x.boardRemaining)}s</div>`)
    if (powers.length) {
      this.magnetEl.style.display = 'flex'
      this.magnetEl.innerHTML = powers.join('<div style="height:10px"></div>')
    } else {
      this.magnetEl.style.display = 'none'
    }

    if (x.bestDistance > 0 && this.bestEl.style.display !== 'block') {
      this.bestEl.style.display = 'block'
      this.bestEl.innerHTML = `${icon('trophy', '1.1em')} BEST ${Math.floor(x.bestDistance)} m`
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
      b.innerHTML = label
      const fire = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.onInput?.(action) }
      b.addEventListener('pointerdown', fire)
      return b
    }
    const left = document.createElement('div')
    left.style.cssText = 'display:flex;gap:min(3vw,18px);align-items:flex-end;'
    left.append(mk(icon('arrowL', '0.9em'), 'left'), mk(icon('arrowR', '0.9em'), 'right'))
    const right = document.createElement('div')
    right.style.cssText = 'display:flex;flex-direction:column;gap:min(2.5vw,14px);align-items:center;'
    right.append(mk(icon('arrowU', '0.9em'), 'jump'), mk(icon('arrowD', '0.9em'), 'slide'))
    pad.append(left, right)
    return pad
  }

  // ─── Screen builders ──────────────────────────────────────────────────────

  private _buildStartScreen(): { screen: HTMLDivElement; best: HTMLDivElement } {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:space-between;gap:8px;
      padding:4vh 0 3vh;
      background:linear-gradient(180deg,rgba(25,18,70,0.80) 0%,rgba(25,18,70,0.35) 28%,rgba(25,18,70,0.05) 50%,rgba(25,18,70,0.35) 72%,rgba(25,18,70,0.85) 100%);
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
      font-family:inherit;font-size:clamp(1.4rem,4.5vw,2.3rem);font-weight:700;
      padding:18px 68px;border:4px solid rgba(255,255,255,0.7);border-radius:70px;cursor:pointer;
      background:linear-gradient(180deg,#ffb347,#ff5fa2);color:#fff;
      box-shadow:0 8px 0 rgba(160,30,90,0.6),0 16px 40px rgba(255,95,162,0.45);
      transform:translateY(0);transition:transform 0.08s,box-shadow 0.08s;pointer-events:all;
      text-shadow:0 2px 0 rgba(0,0,0,0.2);
    `
    playBtn.innerHTML = `${icon('play', '1.2em')} Play!`
    this.playBtn = playBtn
    playBtn.addEventListener('pointerup', () => this.onPlay?.())

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

    // ── Character carousel: arrows either side of the orbiting runner ──
    const carousel = document.createElement('div')
    carousel.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      width:min(92vw,720px); pointer-events:none;
    `
    const arrow = (label: string, dir: number) => {
      const b = document.createElement('button')
      b.className = 'hud-btn'
      b.style.cssText = `
        font-family:inherit;font-size:clamp(1.6rem,5vw,2.6rem);font-weight:900;
        width:min(16vw,84px);height:min(16vw,84px);border-radius:50%;cursor:pointer;
        background:rgba(255,255,255,0.22);border:3px solid rgba(255,255,255,0.7);color:#fff;
        box-shadow:0 6px 18px rgba(0,0,0,0.3);pointer-events:all;transition:transform 0.1s;
      `
      b.textContent = label
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); this._cycleCharacter(dir) })
      return b
    }
    const centre = document.createElement('div')
    centre.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;min-height:150px;justify-content:flex-end;'
    this.charName = document.createElement('div')
    this.charName.style.cssText = `
      font-size:clamp(1.5rem,5.5vw,2.6rem);font-weight:900;color:#fff;
      text-shadow:0 3px 0 rgba(0,0,0,0.3),0 6px 18px rgba(0,0,0,0.5);
    `
    this.charStatus = document.createElement('div')
    this.charStatus.style.cssText = 'font-size:clamp(0.85rem,2.6vw,1.1rem);font-weight:800;color:rgba(255,255,255,0.9);text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    this.unlockBtn = document.createElement('button')
    this.unlockBtn.className = 'hud-btn'
    this.unlockBtn.style.cssText = `
      display:none;font-family:inherit;font-size:clamp(0.9rem,2.8vw,1.15rem);font-weight:900;
      padding:9px 22px;border:3px solid rgba(255,255,255,0.7);border-radius:40px;cursor:pointer;
      color:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.3);pointer-events:all;
    `
    this.unlockBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation()
      const c = this.characters[this.viewIndex]
      if (c) this.onCharacterUnlock?.(c.id)
    })
    centre.append(this.charName, this.charStatus, this.unlockBtn)
    carousel.append(arrow('◀', -1), centre, arrow('▶', 1))

    // Pet row: small arrows either side of the pet's name and a take/unlock button
    const petRow = document.createElement('div')
    petRow.style.cssText = `
      display:flex; align-items:center; justify-content:center; gap:10px; margin-top:6px;
      background:rgba(0,0,0,0.25); border:2px solid rgba(255,255,255,0.3); border-radius:40px;
      padding:6px 12px; pointer-events:all;
    `
    const petArrow = (label: string, dir: number) => {
      const b = document.createElement('button')
      b.className = 'hud-btn'
      b.style.cssText = `
        font-family:inherit;font-size:1.1rem;font-weight:900;width:38px;height:38px;border-radius:50%;
        cursor:pointer;background:rgba(255,255,255,0.22);border:2px solid rgba(255,255,255,0.6);color:#fff;
        pointer-events:all;transition:transform 0.1s;
      `
      b.textContent = label
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); this._cyclePet(dir) })
      return b
    }
    const petLabel = document.createElement('div')
    petLabel.style.cssText = 'color:rgba(255,255,255,0.8);font-weight:800;font-size:0.85rem;letter-spacing:1px;'
    petLabel.innerHTML = `${icon('paw', '1.1em')} PET`
    this.petName = document.createElement('div')
    this.petName.style.cssText = 'color:#fff;font-weight:900;font-size:clamp(1rem,3vw,1.25rem);min-width:7ch;text-align:center;text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    this.petBtn = document.createElement('button')
    this.petBtn.className = 'hud-btn'
    this.petBtn.style.cssText = `
      display:none;font-family:inherit;font-size:0.9rem;font-weight:900;padding:6px 14px;
      border:2px solid rgba(255,255,255,0.7);border-radius:30px;cursor:pointer;color:#fff;pointer-events:all;
    `
    this.petBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation()
      const p = this.pets[this.petIndex]
      if (p) this.onPetUnlock?.(p.id)
    })
    petRow.append(petLabel, petArrow('◀', -1), this.petName, petArrow('▶', 1), this.petBtn)
    centre.append(petRow)

    this.bankEl = document.createElement('div')
    this.bankEl.style.cssText = `
      position:absolute;top:14px;right:16px;color:#ffe45c;font-weight:900;
      font-size:clamp(1rem,3vw,1.3rem);background:rgba(0,0,0,0.3);padding:6px 16px;border-radius:30px;
      border:2px solid rgba(255,228,92,0.45);
    `
    this.bankEl.innerHTML = `${icon('coin', '1.2em')} 0`

    const top = document.createElement('div')
    top.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;'
    top.append(title, sub)
    const bottom = document.createElement('div')
    bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;'
    bottom.append(best, playBtn, settingsLink)

    screen.append(top, carousel, bottom, this.bankEl)
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

    const resumeBtn = this._actionBtn(`${icon('play', '1.1em')} Keep Running!`, 'linear-gradient(180deg,#4ade80,#22d3ee)', 'rgba(34,211,238,0.4)')
    resumeBtn.addEventListener('pointerup', () => this.onResume?.())

    const settingsBtn = this._actionBtn(`${icon('gear', '1.1em')} Settings`, 'linear-gradient(180deg,#818cf8,#6366f1)', 'rgba(99,102,241,0.4)')
    settingsBtn.style.fontSize = 'clamp(0.95rem,2.5vw,1.3rem)'
    settingsBtn.style.padding  = '12px 44px'
    settingsBtn.addEventListener('pointerup', () => this._openSettings(true))

    const homeBtn = this._actionBtn(`${icon('home', '1.1em')} Home`, 'linear-gradient(180deg,#f472b6,#fb923c)', 'rgba(251,146,60,0.4)')
    homeBtn.style.fontSize = 'clamp(0.95rem,2.5vw,1.3rem)'
    homeBtn.style.padding  = '12px 44px'
    homeBtn.addEventListener('pointerup', () => this.onHome?.())

    const escHint = document.createElement('div')
    escHint.style.cssText = 'color:rgba(255,255,255,0.5);font-size:0.82rem;letter-spacing:1px;'
    escHint.textContent = 'Press ESC to resume'

    screen.append(pauseTitle, resumeBtn, settingsBtn, homeBtn, escHint)
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
    // (icon is an SVG string)
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
    btn.innerHTML = icon
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
      box-shadow:0 6px 0 rgba(0,0,0,0.28), 0 12px 28px ${shadow};
      transform:translateY(0);transition:transform 0.08s,box-shadow 0.08s;pointer-events:all;
      text-shadow:0 2px 0 rgba(0,0,0,0.2);
    `
    btn.innerHTML = label
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
