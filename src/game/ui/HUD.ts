import { type GameSettings, loadSettings, saveSettings, SPEED_MIN, SPEED_MAX } from './Settings'

export class HUD {
  private container:      HTMLDivElement
  private distanceEl:     HTMLSpanElement
  private coinsEl:        HTMLSpanElement
  private speedBar:       HTMLDivElement
  private startScreen:    HTMLDivElement
  private pauseScreen:    HTMLDivElement
  private settingsScreen: HTMLDivElement
  private pauseBtn:       HTMLButtonElement
  private settingsBtn:    HTMLButtonElement

  // Current in-memory settings (kept in sync with localStorage)
  private settings: GameSettings = loadSettings()

  // Whether settings were opened mid-game (so Done resumes)
  private _openedDuringPlay = false

  onPlay?:            () => void
  onPause?:           () => void
  onResume?:          () => void
  onSettingsChange?:  (s: GameSettings) => void

  constructor() {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position:fixed; inset:0; pointer-events:none;
      font-family:'Nunito','Arial Rounded MT Bold',Arial,sans-serif;
      user-select:none;
    `

    // ── Top bar ───────────────────────────────────────────────────────────────
    const topBar = document.createElement('div')
    topBar.style.cssText = `
      position:absolute; top:16px; left:50%; transform:translateX(-50%);
      display:flex; align-items:center; gap:24px;
      background:rgba(0,0,0,0.48); border-radius:40px;
      padding:10px 32px; backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 4px 24px rgba(0,0,0,0.3);
    `
    const distWrap = document.createElement('div')
    distWrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const distIcon = document.createElement('span')
    distIcon.textContent = '🏃'; distIcon.style.fontSize = '1.3rem'
    this.distanceEl = document.createElement('span')
    this.distanceEl.style.cssText = 'color:#fff;font-size:1.5rem;font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    this.distanceEl.textContent = '0 m'
    distWrap.append(distIcon, this.distanceEl)

    const divider = document.createElement('div')
    divider.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.25);'

    const coinWrap = document.createElement('div')
    coinWrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const coinIcon = document.createElement('span')
    coinIcon.textContent = '⭐'; coinIcon.style.fontSize = '1.3rem'
    this.coinsEl = document.createElement('span')
    this.coinsEl.style.cssText = 'color:#ffd700;font-size:1.5rem;font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    this.coinsEl.textContent = '0'
    coinWrap.append(coinIcon, this.coinsEl)

    topBar.append(distWrap, divider, coinWrap)
    this.container.appendChild(topBar)

    // ── Settings button (top-left) ────────────────────────────────────────────
    this.settingsBtn = this._iconBtn('⚙', 'top:16px;left:20px;display:none;')
    this.settingsBtn.addEventListener('pointerup', () => this._openSettings())
    this.container.appendChild(this.settingsBtn)

    // ── Pause button (top-right) ──────────────────────────────────────────────
    this.pauseBtn = this._iconBtn('⏸', 'top:16px;right:20px;display:none;')
    this.pauseBtn.addEventListener('pointerup', () => this.onPause?.())
    this.container.appendChild(this.pauseBtn)

    // ── Speed bar (bottom) ────────────────────────────────────────────────────
    const speedWrap = document.createElement('div')
    speedWrap.style.cssText = `
      position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
      width:160px; display:flex; flex-direction:column; align-items:center; gap:4px;
    `
    const speedLabel = document.createElement('div')
    speedLabel.textContent = 'SPEED'
    speedLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:0.65rem;letter-spacing:2px;'
    const speedTrack = document.createElement('div')
    speedTrack.style.cssText = 'width:100%;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;'
    this.speedBar = document.createElement('div')
    this.speedBar.style.cssText = `
      height:100%;width:0%;border-radius:3px;
      background:linear-gradient(90deg,#4ade80,#facc15,#f97316);
      transition:width 0.3s ease;
    `
    speedTrack.appendChild(this.speedBar)
    speedWrap.append(speedLabel, speedTrack)
    this.container.appendChild(speedWrap)

    // ── Start screen ──────────────────────────────────────────────────────────
    this.startScreen = this._buildStartScreen()
    this.container.appendChild(this.startScreen)

    // ── Pause screen ──────────────────────────────────────────────────────────
    this.pauseScreen = this._buildPauseScreen()
    this.container.appendChild(this.pauseScreen)

    // ── Settings screen ───────────────────────────────────────────────────────
    this.settingsScreen = this._buildSettingsScreen()
    this.container.appendChild(this.settingsScreen)

    document.body.appendChild(this.container)

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      if (this.settingsScreen.style.display === 'flex') { this._closeSettings(); return }
      if (this.pauseScreen.style.display    === 'flex') { this.onResume?.();     return }
      if (this.pauseBtn.style.display       === 'flex') { this.onPause?.() }
    })
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  showStart(): void {
    this.startScreen.style.display = 'flex'
  }
  hideStart(): void {
    this.startScreen.style.display = 'none'
    this.settingsBtn.style.display = 'flex'
    this.pauseBtn.style.display    = 'flex'
  }

  showPause(): void { this.pauseScreen.style.display = 'flex' }
  hidePause(): void { this.pauseScreen.style.display = 'none' }

  getSettings(): GameSettings { return { ...this.settings } }

  update(distanceM: number, coins: number, speedFraction: number): void {
    this.distanceEl.textContent = `${Math.floor(distanceM)} m`
    this.coinsEl.textContent    = String(coins)
    this.speedBar.style.width   = `${Math.round(speedFraction * 100)}%`
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

  // ─── Screen builders ──────────────────────────────────────────────────────

  private _buildStartScreen(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:24px;
      background:linear-gradient(180deg,rgba(30,20,60,0.85) 0%,rgba(10,30,70,0.85) 100%);
      pointer-events:all;
    `

    const title = document.createElement('div')
    title.style.cssText = `
      font-size:clamp(2.4rem,10vw,5.5rem);font-weight:900;
      background:linear-gradient(135deg,#fde68a,#fb923c,#ec4899);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
      filter:drop-shadow(0 4px 16px rgba(251,146,60,0.5));letter-spacing:-1px;
    `
    title.textContent = '🏃 Runner!'

    const sub = document.createElement('div')
    sub.style.cssText = 'color:rgba(255,255,255,0.7);font-size:clamp(0.9rem,3vw,1.2rem);'
    sub.textContent = 'Swipe or tap to jump · Swipe down to slide'

    const playBtn = document.createElement('button')
    playBtn.style.cssText = `
      font-family:inherit;font-size:clamp(1.2rem,4vw,2rem);font-weight:900;
      padding:18px 64px;border:none;border-radius:60px;cursor:pointer;
      background:linear-gradient(135deg,#fb923c,#ec4899);color:#fff;
      box-shadow:0 8px 32px rgba(236,72,153,0.45);
      transform:scale(1);transition:transform 0.12s,box-shadow 0.12s;pointer-events:all;
    `
    playBtn.textContent = '▶  Play!'
    playBtn.addEventListener('pointerenter', () => { playBtn.style.transform='scale(1.05)'; playBtn.style.boxShadow='0 12px 40px rgba(236,72,153,0.6)' })
    playBtn.addEventListener('pointerleave', () => { playBtn.style.transform='scale(1)';    playBtn.style.boxShadow='0 8px 32px rgba(236,72,153,0.45)' })
    playBtn.addEventListener('pointerdown',  () => { playBtn.style.transform='scale(0.96)' })
    playBtn.addEventListener('pointerup',    () => { playBtn.style.transform='scale(1)'; this.onPlay?.() })

    // Settings link on start screen
    const settingsLink = document.createElement('button')
    settingsLink.style.cssText = `
      font-family:inherit;font-size:0.95rem;font-weight:700;
      background:none;border:none;cursor:pointer;
      color:rgba(255,255,255,0.55);pointer-events:all;
      text-decoration:underline;text-underline-offset:3px;
      transition:color 0.12s;
    `
    settingsLink.textContent = '⚙  Settings'
    settingsLink.addEventListener('pointerenter', () => { settingsLink.style.color='rgba(255,255,255,0.9)' })
    settingsLink.addEventListener('pointerleave', () => { settingsLink.style.color='rgba(255,255,255,0.55)' })
    settingsLink.addEventListener('pointerup', () => this._openSettings(false))

    screen.append(title, sub, playBtn, settingsLink)
    return screen
  }

  private _buildPauseScreen(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;gap:28px;
      background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);pointer-events:all;
    `

    const pauseTitle = document.createElement('div')
    pauseTitle.style.cssText = `
      font-size:clamp(2rem,8vw,4rem);font-weight:900;color:#fff;
      text-shadow:0 4px 20px rgba(0,0,0,0.6);letter-spacing:-1px;
    `
    pauseTitle.textContent = '⏸ Paused'

    const resumeBtn = this._actionBtn('▶  Resume', 'linear-gradient(135deg,#4ade80,#22d3ee)', 'rgba(34,211,238,0.4)')
    resumeBtn.addEventListener('pointerup', () => this.onResume?.())

    const settingsBtn = this._actionBtn('⚙  Settings', 'linear-gradient(135deg,#818cf8,#6366f1)', 'rgba(99,102,241,0.4)')
    settingsBtn.style.fontSize = 'clamp(0.95rem,2.5vw,1.3rem)'
    settingsBtn.style.padding  = '12px 44px'
    settingsBtn.addEventListener('pointerup', () => this._openSettings(true))

    const escHint = document.createElement('div')
    escHint.style.cssText = 'color:rgba(255,255,255,0.4);font-size:0.82rem;letter-spacing:1px;'
    escHint.textContent = 'Press ESC to resume'

    screen.append(pauseTitle, resumeBtn, settingsBtn, escHint)
    return screen
  }

  private _buildSettingsScreen(): HTMLDivElement {
    const screen = document.createElement('div')
    screen.style.cssText = `
      position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;
      background:rgba(0,0,0,0.72);backdrop-filter:blur(10px);pointer-events:all;
    `

    // Card
    const card = document.createElement('div')
    card.style.cssText = `
      background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);
      border-radius:24px;padding:32px 40px;min-width:min(420px,90vw);
      display:flex;flex-direction:column;gap:28px;
      box-shadow:0 16px 64px rgba(0,0,0,0.5);
    `

    const title = document.createElement('div')
    title.style.cssText = 'font-size:1.6rem;font-weight:900;color:#fff;text-align:center;'
    title.textContent = '⚙  Settings'

    const sep = () => {
      const d = document.createElement('div')
      d.style.cssText = 'height:1px;background:rgba(255,255,255,0.10);'
      return d
    }

    // ── Bright Zones toggle ──
    const brightRow = this._settingRow(
      '☀️  Always Bright',
      'Keep all zones sunny (no dark forest or space)',
    )
    const brightToggle = this._toggle(
      this.settings.brightZones,
      (v) => this._save({ brightZones: v }),
    )
    brightRow.appendChild(brightToggle)

    // ── Speed mode ──
    const speedRow = this._settingRow(
      '🏃  Speed',
      'Auto = gradually increases · Custom = you choose',
    )

    // Auto / Custom radio buttons
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

    // Speed slider (visible only in manual mode)
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

    // ── Done button ──
    const doneBtn = this._actionBtn('✓  Done', 'linear-gradient(135deg,#4ade80,#22d3ee)', 'rgba(34,211,238,0.4)')
    doneBtn.style.alignSelf = 'center'
    doneBtn.addEventListener('pointerup', () => this._closeSettings())

    card.append(title, sep(), brightRow, sep(), speedRow, sep(), doneBtn)
    screen.appendChild(card)
    return screen
  }

  // ─── UI component helpers ────────────────────────────────────────────────

  private _iconBtn(icon: string, extraCss: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.style.cssText = `
      position:absolute; ${extraCss}
      width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;
      background:rgba(0,0,0,0.48);backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 4px 16px rgba(0,0,0,0.3);
      font-size:1.4rem;align-items:center;justify-content:center;
      pointer-events:all;transition:transform 0.12s,background 0.12s;
    `
    btn.textContent = icon
    btn.addEventListener('pointerenter', () => { btn.style.background='rgba(0,0,0,0.7)' })
    btn.addEventListener('pointerleave', () => { btn.style.background='rgba(0,0,0,0.48)' })
    btn.addEventListener('pointerdown',  () => { btn.style.transform='scale(0.9)' })
    btn.addEventListener('pointerup',    () => { btn.style.transform='scale(1)' })
    return btn
  }

  private _actionBtn(label: string, bg: string, shadow: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.style.cssText = `
      font-family:inherit;font-size:clamp(1.1rem,3.5vw,1.8rem);font-weight:900;
      padding:16px 56px;border:none;border-radius:60px;cursor:pointer;
      background:${bg};color:#fff;
      box-shadow:0 8px 32px ${shadow};
      transform:scale(1);transition:transform 0.12s,box-shadow 0.12s;pointer-events:all;
    `
    btn.textContent = label
    btn.addEventListener('pointerenter', () => { btn.style.transform='scale(1.05)'; btn.style.boxShadow=`0 12px 40px ${shadow}` })
    btn.addEventListener('pointerleave', () => { btn.style.transform='scale(1)';    btn.style.boxShadow=`0 8px 32px ${shadow}` })
    btn.addEventListener('pointerdown',  () => { btn.style.transform='scale(0.96)' })
    return btn
  }

  private _settingRow(label: string, desc: string): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;flex-direction:column;gap:4px;'

    const lbl = document.createElement('div')
    lbl.style.cssText = 'font-size:1.05rem;font-weight:800;color:#fff;'
    lbl.textContent = label

    const d = document.createElement('div')
    d.style.cssText = 'font-size:0.78rem;color:rgba(255,255,255,0.45);'
    d.textContent = desc

    row.append(lbl, d)
    return row
  }

  private _toggle(initial: boolean, onChange: (v: boolean) => void): HTMLDivElement {
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

    const onBtn  = makeBtn('☀️  On',  true)
    const offBtn = makeBtn('🌙  Off', false)

    const refreshAll = () => { onBtn.refresh(); offBtn.refresh() }
    wrap.append(onBtn.btn, offBtn.btn)
    return wrap
  }
}
