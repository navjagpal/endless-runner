export class HUD {
  private container:    HTMLDivElement
  private distanceEl:   HTMLSpanElement
  private coinsEl:      HTMLSpanElement
  private speedBar:     HTMLDivElement
  private startScreen:  HTMLDivElement
  private pauseScreen:  HTMLDivElement
  private pauseBtn:     HTMLButtonElement

  onPlay?:   () => void
  onPause?:  () => void
  onResume?: () => void

  constructor() {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position:fixed; inset:0; pointer-events:none;
      font-family:'Nunito','Arial Rounded MT Bold',Arial,sans-serif;
      user-select:none;
    `

    // ── Top bar ──────────────────────────────────────────────────────────────
    const topBar = document.createElement('div')
    topBar.style.cssText = `
      position:absolute; top:16px; left:50%; transform:translateX(-50%);
      display:flex; align-items:center; gap:24px;
      background:rgba(0,0,0,0.48); border-radius:40px;
      padding:10px 32px; backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 4px 24px rgba(0,0,0,0.3);
    `

    // Distance
    const distWrap = document.createElement('div')
    distWrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const distIcon = document.createElement('span')
    distIcon.textContent = '🏃'
    distIcon.style.fontSize = '1.3rem'
    this.distanceEl = document.createElement('span')
    this.distanceEl.style.cssText = 'color:#fff;font-size:1.5rem;font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    this.distanceEl.textContent = '0 m'
    distWrap.appendChild(distIcon)
    distWrap.appendChild(this.distanceEl)

    // Divider
    const div = document.createElement('div')
    div.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.25);'

    // Coins
    const coinWrap = document.createElement('div')
    coinWrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const coinIcon = document.createElement('span')
    coinIcon.textContent = '⭐'
    coinIcon.style.fontSize = '1.3rem'
    this.coinsEl = document.createElement('span')
    this.coinsEl.style.cssText = 'color:#ffd700;font-size:1.5rem;font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,0.5);'
    this.coinsEl.textContent = '0'
    coinWrap.appendChild(coinIcon)
    coinWrap.appendChild(this.coinsEl)

    topBar.appendChild(distWrap)
    topBar.appendChild(div)
    topBar.appendChild(coinWrap)
    this.container.appendChild(topBar)

    // ── Pause button (top-right) ──────────────────────────────────────────────
    this.pauseBtn = document.createElement('button')
    this.pauseBtn.style.cssText = `
      position:absolute; top:16px; right:20px;
      width:48px; height:48px; border-radius:50%; border:none; cursor:pointer;
      background:rgba(0,0,0,0.48); backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 4px 16px rgba(0,0,0,0.3);
      font-size:1.4rem; display:none; align-items:center; justify-content:center;
      pointer-events:all; transition:transform 0.12s, background 0.12s;
    `
    this.pauseBtn.textContent = '⏸'
    this.pauseBtn.addEventListener('pointerenter', () => { this.pauseBtn.style.background = 'rgba(0,0,0,0.7)' })
    this.pauseBtn.addEventListener('pointerleave', () => { this.pauseBtn.style.background = 'rgba(0,0,0,0.48)' })
    this.pauseBtn.addEventListener('pointerdown',  () => { this.pauseBtn.style.transform = 'scale(0.9)' })
    this.pauseBtn.addEventListener('pointerup',    () => {
      this.pauseBtn.style.transform = 'scale(1)'
      this.onPause?.()
    })
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
    speedTrack.style.cssText = `
      width:100%;height:6px;background:rgba(255,255,255,0.15);
      border-radius:3px;overflow:hidden;
    `
    this.speedBar = document.createElement('div')
    this.speedBar.style.cssText = `
      height:100%;width:0%;border-radius:3px;
      background:linear-gradient(90deg,#4ade80,#facc15,#f97316);
      transition:width 0.3s ease;
    `
    speedTrack.appendChild(this.speedBar)
    speedWrap.appendChild(speedLabel)
    speedWrap.appendChild(speedTrack)
    this.container.appendChild(speedWrap)

    // ── Start screen ──────────────────────────────────────────────────────────
    this.startScreen = document.createElement('div')
    this.startScreen.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:24px;
      background:linear-gradient(180deg,rgba(30,20,60,0.85) 0%,rgba(10,30,70,0.85) 100%);
      pointer-events:all;
    `

    const title = document.createElement('div')
    title.style.cssText = `
      font-size:clamp(2.4rem,10vw,5.5rem);font-weight:900;
      background:linear-gradient(135deg,#fde68a,#fb923c,#ec4899);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
      background-clip:text;
      filter:drop-shadow(0 4px 16px rgba(251,146,60,0.5));
      letter-spacing:-1px;
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
      transform:scale(1);transition:transform 0.12s,box-shadow 0.12s;
      pointer-events:all;
    `
    playBtn.textContent = '▶  Play!'
    playBtn.addEventListener('pointerenter', () => { playBtn.style.transform = 'scale(1.05)'; playBtn.style.boxShadow = '0 12px 40px rgba(236,72,153,0.6)' })
    playBtn.addEventListener('pointerleave', () => { playBtn.style.transform = 'scale(1)';    playBtn.style.boxShadow = '0 8px 32px rgba(236,72,153,0.45)' })
    playBtn.addEventListener('pointerdown',  () => { playBtn.style.transform = 'scale(0.96)' })
    playBtn.addEventListener('pointerup',    () => { playBtn.style.transform = 'scale(1)'; this.onPlay?.() })

    this.startScreen.appendChild(title)
    this.startScreen.appendChild(sub)
    this.startScreen.appendChild(playBtn)
    this.container.appendChild(this.startScreen)

    // ── Pause screen ──────────────────────────────────────────────────────────
    this.pauseScreen = document.createElement('div')
    this.pauseScreen.style.cssText = `
      position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;gap:28px;
      background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);
      pointer-events:all;
    `

    const pauseTitle = document.createElement('div')
    pauseTitle.style.cssText = `
      font-size:clamp(2rem,8vw,4rem);font-weight:900;color:#fff;
      text-shadow:0 4px 20px rgba(0,0,0,0.6);
      letter-spacing:-1px;
    `
    pauseTitle.textContent = '⏸ Paused'

    const resumeBtn = document.createElement('button')
    resumeBtn.style.cssText = `
      font-family:inherit;font-size:clamp(1.1rem,3.5vw,1.8rem);font-weight:900;
      padding:16px 56px;border:none;border-radius:60px;cursor:pointer;
      background:linear-gradient(135deg,#4ade80,#22d3ee);color:#fff;
      box-shadow:0 8px 32px rgba(34,211,238,0.4);
      transform:scale(1);transition:transform 0.12s,box-shadow 0.12s;
      pointer-events:all;
    `
    resumeBtn.textContent = '▶  Resume'
    resumeBtn.addEventListener('pointerenter', () => { resumeBtn.style.transform = 'scale(1.05)'; resumeBtn.style.boxShadow = '0 12px 40px rgba(34,211,238,0.6)' })
    resumeBtn.addEventListener('pointerleave', () => { resumeBtn.style.transform = 'scale(1)';    resumeBtn.style.boxShadow = '0 8px 32px rgba(34,211,238,0.4)' })
    resumeBtn.addEventListener('pointerdown',  () => { resumeBtn.style.transform = 'scale(0.96)' })
    resumeBtn.addEventListener('pointerup',    () => { resumeBtn.style.transform = 'scale(1)'; this.onResume?.() })

    const escHint = document.createElement('div')
    escHint.style.cssText = 'color:rgba(255,255,255,0.45);font-size:0.85rem;letter-spacing:1px;'
    escHint.textContent = 'Press ESC to resume'

    this.pauseScreen.appendChild(pauseTitle)
    this.pauseScreen.appendChild(resumeBtn)
    this.pauseScreen.appendChild(escHint)
    this.container.appendChild(this.pauseScreen)

    document.body.appendChild(this.container)

    // ── ESC key ───────────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.pauseScreen.style.display === 'flex') {
          this.onResume?.()
        } else if (this.pauseBtn.style.display === 'flex') {
          this.onPause?.()
        }
      }
    })
  }

  showStart(): void  { this.startScreen.style.display = 'flex' }
  hideStart(): void  {
    this.startScreen.style.display = 'none'
    this.pauseBtn.style.display = 'flex'
  }

  showPause(): void  { this.pauseScreen.style.display = 'flex' }
  hidePause(): void  { this.pauseScreen.style.display = 'none' }

  update(distanceM: number, coins: number, speedFraction: number): void {
    this.distanceEl.textContent = `${Math.floor(distanceM)} m`
    this.coinsEl.textContent    = String(coins)
    this.speedBar.style.width   = `${Math.round(speedFraction * 100)}%`
  }
}
