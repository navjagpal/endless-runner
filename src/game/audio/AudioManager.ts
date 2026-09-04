// ─── Zone music configs ───────────────────────────────────────────────────────

interface ZoneMusic {
  bpm:    number
  melody: number[]
  bass:   number[]
  scale:  'major' | 'minor' | 'pentatonic' | 'chromatic'
}

const ZONE_MUSIC: Record<string, ZoneMusic> = {
  meadow: {
    bpm: 132,
    melody: [659, 784, 880, 784, 659, 587, 523, 587, 659, 784, 880, 1047, 988, 880, 784, 659],
    bass:   [131, 131, 165, 131, 110, 110, 131, 110, 131, 131, 165, 131,  147, 131, 110, 131],
    scale: 'major',
  },
  forest: {
    bpm: 108,
    melody: [440, 392, 349, 330, 294, 330, 349, 392, 440, 494, 523, 494, 440, 392, 349, 330],
    bass:   [110, 110,  88,  88,  73,  73,  88,  88, 110, 110, 131, 110,  98,  98,  88,  88],
    scale: 'minor',
  },
  city: {
    bpm: 148,
    melody: [880, 988, 880, 784, 880, 988, 1047, 988, 880, 784, 698, 784, 880, 784, 698, 659],
    bass:   [220, 220, 247, 220, 196, 196, 220,  196, 220, 220, 175, 196, 220, 196, 175, 165],
    scale: 'chromatic',
  },
  beach: {
    bpm: 128,
    melody: [523, 659, 784, 880, 784, 659, 523, 440, 523, 659, 784, 1047, 880, 784, 659, 523],
    bass:   [131, 131, 165, 165, 147, 131, 110, 110, 131, 131, 165, 165,  147, 131, 110, 110],
    scale: 'pentatonic',
  },
  space: {
    bpm: 120,
    melody: [440, 494, 440, 392, 370, 392, 440, 494, 523, 587, 523, 494, 440, 415, 440, 494],
    bass:   [110, 110, 123, 110,  92,  98, 110, 110, 131, 131, 123, 110, 110,  98, 110, 110],
    scale: 'minor',
  },
}

// ─── AudioManager ─────────────────────────────────────────────────────────────

/** Files under public/audio/, copied from Kenney's CC0 packs by scripts/build-kits.mjs. */
const SAMPLES = [
  'coin', 'jump', 'bump', 'spill', 'star', 'magnet', 'streak', 'whee', 'best', 'zone',
  'starJingle', 'click', 'select', 'locked', 'land', 'step',
] as const
type SampleName = typeof SAMPLES[number]

export class AudioManager {
  private ctx: AudioContext | null = null
  private buffers = new Map<SampleName, AudioBuffer>()
  private preloaded = false
  private _musicRunning = false
  private _currentZone  = 'meadow'
  private _targetZone   = 'meadow'
  private _masterGain!: GainNode
  private _musicGain!:  GainNode
  private _nextBar      = 0

  resume():  void { this._ctx().resume(); void this.preload() }
  suspend(): void { this.ctx?.suspend() }

  /**
   * Fetch and decode the sample set. Safe to call early — decoding
   * doesn't need a user gesture, only playback does — and every play*
   * method falls back to its synthesised version until the sample is in.
   */
  async preload(): Promise<void> {
    if (this.preloaded) return
    this.preloaded = true
    const ctx = this._ctx()
    await Promise.all(SAMPLES.map(async name => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${name}.ogg`)
        if (!res.ok) return
        const buf = await ctx.decodeAudioData(await res.arrayBuffer())
        this.buffers.set(name, buf)
      } catch { /* keep the synth fallback */ }
    }))
  }

  /** Plays a sample; returns false when it isn't loaded so the caller can synthesise. */
  private _play(name: SampleName, gain = 1, rate = 1, delay = 0): boolean {
    const buf = this.buffers.get(name)
    if (!buf) return false
    const ctx = this._ctx()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(g); g.connect(this._masterGain)
    src.start(ctx.currentTime + delay)
    return true
  }

  // UI
  playClick():  void { this._play('click', 0.5) }
  playSelect(): void { this._play('select', 0.7) }
  playLocked(): void { this._play('locked', 0.6) }
  playSpill():  void { this._play('spill', 0.6) }
  playLand():   void { this._play('land', 0.35, 0.9 + Math.random() * 0.2) }

  // ─── Zone crossfade ──────────────────────────────────────────────────────

  setZone(zoneId: string): void {
    if (this._targetZone === zoneId) return
    this._targetZone = zoneId
    // Crossfade will apply at next bar boundary
  }

  // ─── SFX ─────────────────────────────────────────────────────────────────

  playJump(): void {
    if (this._play('jump', 0.45, 1.05)) return
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._masterGain)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.14)
    g.gain.setValueAtTime(0.20, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.28)
  }

  /**
   * Coin chime. `level` climbs with the coin streak so a long clean run
   * literally sounds higher and brighter — the reward is audible.
   */
  playCoin(level = 0): void {
    if (this._play('coin', 0.5, Math.pow(2, Math.min(level, 7) / 12))) return
    const ctx   = this._ctx()
    const base  = 880 * Math.pow(2, Math.min(level, 7) / 12)
    const freqs = [base, base * 1.25, base * 1.5]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(this._masterGain)
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.06
      osc.frequency.value = f
      g.gain.setValueAtTime(0.10, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      osc.start(t); osc.stop(t + 0.16)
    })
  }

  /** A soft cartoon "boing" rather than a harsh buzz — it's a kids' game. */
  playBump(): void {
    if (this._play('bump', 0.8, 0.95)) return
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._masterGain)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(320, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.22)
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.34)
    g.gain.setValueAtTime(0.26, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.40)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.40)
  }

  /** Rising arpeggio when the star meter fills. */
  playStar(): void {
    if (this._play('star', 0.7) && this._play('starJingle', 0.5, 1, 0.15)) return
    const ctx   = this._ctx()
    const freqs = [523, 659, 784, 1047, 1319, 1568, 2093]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(this._masterGain)
      osc.type = i % 2 ? 'triangle' : 'square'
      const t = ctx.currentTime + i * 0.07
      osc.frequency.value = f
      g.gain.setValueAtTime(0.08, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.30)
      osc.start(t); osc.stop(t + 0.30)
    })
  }

  playMagnet(): void {
    if (this._play('magnet', 0.6)) return
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._masterGain)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(400, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.35)
    g.gain.setValueAtTime(0.14, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45)
  }

  /** Streak / multiplier fanfare; `level` picks how many notes. */
  playStreak(level: number): void {
    if (this._play('streak', 0.6, 1 + Math.min(4, level) * 0.06)) return
    const ctx   = this._ctx()
    const count = 2 + Math.min(4, Math.round(level))
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(this._masterGain)
      osc.type = 'triangle'
      const t = ctx.currentTime + i * 0.08
      osc.frequency.value = 660 * Math.pow(2, i * 2 / 12)
      g.gain.setValueAtTime(0.09, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      osc.start(t); osc.stop(t + 0.22)
    }
  }

  /** A swoopy "wheee" for ramps and rooftops. */
  playWhee(): void {
    if (this._play('whee', 0.6)) return
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._masterGain)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(500, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1300, ctx.currentTime + 0.30)
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.55)
    g.gain.setValueAtTime(0.12, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
  }

  playBest(): void {
    if (this._play('best', 0.7)) return
    const ctx   = this._ctx()
    const freqs = [784, 784, 784, 1047, 1319]
    const gaps  = [0, 0.12, 0.24, 0.36, 0.60]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(this._masterGain)
      osc.type = 'square'
      const t = ctx.currentTime + gaps[i]
      osc.frequency.value = f
      const d = i === 4 ? 0.6 : 0.14
      g.gain.setValueAtTime(0.07, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + d)
      osc.start(t); osc.stop(t + d)
    })
  }

  playCelebration(): void {
    if (this._play('zone', 0.6)) return
    const ctx   = this._ctx()
    const freqs = [523, 659, 784, 1047, 1318]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(this._masterGain)
      osc.type = 'triangle'
      const t = ctx.currentTime + i * 0.10
      osc.frequency.value = f
      g.gain.setValueAtTime(0.10, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t); osc.stop(t + 0.35)
    })
  }

  // ─── Background music ────────────────────────────────────────────────────

  startMusic(): void {
    if (this._musicRunning) return
    this._musicRunning = true

    const ctx         = this._ctx()

    this._musicGain   = ctx.createGain()
    this._musicGain.gain.value = 0.42
    this._musicGain.connect(this._masterGain)

    this._nextBar = ctx.currentTime + 0.05
    this._scheduleBar()
    this._loop()
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _ctx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    // SFX can fire before the music starts (a tap on the start screen),
    // so the master bus is created on first use rather than in startMusic.
    if (!this._masterGain) {
      this._masterGain = this.ctx.createGain()
      this._masterGain.gain.value = 0.7
      this._masterGain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  private _loop(): void {
    setTimeout(() => {
      const ctx = this._ctx()
      if (this._nextBar - ctx.currentTime < this._beatDuration() * 10) {
        this._scheduleBar()
      }
      this._loop()
    }, 250)
  }

  private _beatDuration(): number {
    const zm = ZONE_MUSIC[this._currentZone] ?? ZONE_MUSIC['meadow']
    return 60 / zm.bpm
  }

  private _scheduleBar(): void {
    // Snap zone change at bar boundary
    this._currentZone = this._targetZone

    const zm   = ZONE_MUSIC[this._currentZone] ?? ZONE_MUSIC['meadow']
    const beat = 60 / zm.bpm
    const t    = this._nextBar
    this._nextBar += beat * 16

    for (let i = 0; i < 16; i++) {
      const bt = t + i * beat

      // Kick  — beats 0, 8
      if (i === 0 || i === 8)  this._kick(bt)

      // Snare — beats 4, 12
      if (i === 4 || i === 12) this._snare(bt)

      // Hi-hat every 2 steps, open on 6 & 14
      if (i % 2 === 0) {
        const open = i === 6 || i === 14
        this._hihat(bt, open)
      }

      // Melody
      this._tone(bt, zm.melody[i], beat * 0.82, 0.045, 'sine')

      // Bass every 2 steps
      if (i % 2 === 0) this._tone(bt, zm.bass[i], beat * 1.75, 0.06, 'square')

      // Arp every 4 steps (zone flavour)
      if (i % 4 === 0) {
        const arpFreq = zm.melody[i] * 2
        this._tone(bt + beat * 0.5, arpFreq, beat * 0.30, 0.025, 'triangle')
        this._tone(bt + beat * 0.75, arpFreq * 1.25, beat * 0.25, 0.018, 'triangle')
      }
    }
  }

  // ─── Audio primitives ────────────────────────────────────────────────────

  private _kick(t: number): void {
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._musicGain)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, t)
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.20)
    g.gain.setValueAtTime(0.55, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
    osc.start(t); osc.stop(t + 0.28)
  }

  private _snare(t: number): void {
    const ctx = this._ctx()
    const dur = 0.10
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
    const d   = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 2800
    const g   = ctx.createGain()
    src.connect(flt); flt.connect(g); g.connect(this._musicGain)
    g.gain.setValueAtTime(0.16, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.start(t); src.stop(t + dur)
  }

  private _hihat(t: number, open: boolean): void {
    const ctx = this._ctx()
    const dur = open ? 0.14 : 0.055
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
    const d   = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 9000
    const g   = ctx.createGain()
    src.connect(flt); flt.connect(g); g.connect(this._musicGain)
    g.gain.setValueAtTime(open ? 0.06 : 0.035, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.start(t); src.stop(t + dur)
  }

  private _tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._musicGain)
    osc.type = type; osc.frequency.value = freq
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.start(t); osc.stop(t + dur)
  }
}
