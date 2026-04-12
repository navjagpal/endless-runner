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

export class AudioManager {
  private ctx: AudioContext | null = null
  private _musicRunning = false
  private _currentZone  = 'meadow'
  private _targetZone   = 'meadow'
  private _masterGain!: GainNode
  private _musicGain!:  GainNode
  private _nextBar      = 0

  resume():  void { this._ctx().resume() }
  suspend(): void { this.ctx?.suspend() }

  // ─── Zone crossfade ──────────────────────────────────────────────────────

  setZone(zoneId: string): void {
    if (this._targetZone === zoneId) return
    this._targetZone = zoneId
    // Crossfade will apply at next bar boundary
  }

  // ─── SFX ─────────────────────────────────────────────────────────────────

  playJump(): void {
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

  playCoin(): void {
    const ctx   = this._ctx()
    const freqs = [880, 1100, 1320]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(this._masterGain)
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.07
      osc.frequency.value = f
      g.gain.setValueAtTime(0.11, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      osc.start(t); osc.stop(t + 0.18)
    })
  }

  playBump(): void {
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._masterGain)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.30)
    g.gain.setValueAtTime(0.34, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.42)
  }

  playCelebration(): void {
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
    this._masterGain  = ctx.createGain()
    this._masterGain.gain.value = 0.7
    this._masterGain.connect(ctx.destination)

    this._musicGain   = ctx.createGain()
    this._musicGain.gain.value = 0.55
    this._musicGain.connect(this._masterGain)

    this._nextBar = ctx.currentTime + 0.05
    this._scheduleBar()
    this._loop()
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _ctx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
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
