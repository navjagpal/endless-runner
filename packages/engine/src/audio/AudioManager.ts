// ─── Music model ─────────────────────────────────────────────────────────────
//
// A game hands the AudioManager one ZoneMusic per zone: a key, a mode, a
// four-chord loop and a style. The composer below turns that into bass,
// chords, an arpeggio, drums and a melody improvised over the chord tones
// — so the music is different every run but always in key.

export type Style = 'pluck' | 'pad' | 'funk' | 'chug' | 'offbeat' | 'arp'

export interface ZoneMusic {
  bpm:   number
  /** Root of the key, Hz (octave 3). */
  root:  number
  mode:  'major' | 'minor'
  /** Chord roots as scale degrees (0-based) for a four-bar loop. */
  chords: number[]
  style: Style
  echo?: boolean
}

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
}

const semi = (root: number, n: number) => root * Math.pow(2, n / 12)

// ─── AudioManager ─────────────────────────────────────────────────────────────

/** Sample files a game ships under public/audio/<name>.ogg. */
export const DEFAULT_SAMPLES = [
  'coin', 'jump', 'bump', 'spill', 'star', 'magnet', 'streak', 'whee', 'best', 'zone',
  'starJingle', 'click', 'select', 'locked', 'land', 'step',
]
type SampleName = string

export class AudioManager {
  private ctx: AudioContext | null = null
  private buffers = new Map<SampleName, AudioBuffer>()
  private preloaded = false
  private music: Record<string, ZoneMusic>
  private samples: string[]

  /**
   * @param music   one ZoneMusic per zone id; the first key is the default
   * @param samples names of the .ogg files under public/audio/ to preload
   */
  constructor(music: Record<string, ZoneMusic>, samples: string[] = DEFAULT_SAMPLES) {
    this.music   = music
    this.samples = samples
    const first  = Object.keys(music)[0] ?? 'meadow'
    this._currentZone = first
    this._targetZone  = first
  }
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
    await Promise.all(this.samples.map(async name => {
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
  playBoardBreak(): void { if (!this._play('spill', 0.8, 0.7)) this.playBump() }
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

    // A feedback delay the space zone fades in; silent elsewhere.
    this._delay = ctx.createDelay(1.0)
    this._delay.delayTime.value = 0.28
    this._delayGain = ctx.createGain()
    this._delayGain.gain.value = 0
    const fb = ctx.createGain(); fb.gain.value = 0.42
    this._musicGain.connect(this._delay)
    this._delay.connect(fb); fb.connect(this._delay)
    this._delay.connect(this._delayGain); this._delayGain.connect(this._masterGain)

    this._nextBar = ctx.currentTime + 0.05
    this._scheduleBar()
    this._loop()
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _delay!: DelayNode
  private _delayGain!: GainNode
  private _bar = 0
  private _phrase: number[] = []

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
      if (this._nextBar - ctx.currentTime < this._beatDuration() * 6) {
        this._scheduleBar()
      }
      this._loop()
    }, 250)
  }

  private _beatDuration(): number {
    const zm = this.music[this._currentZone] ?? this.music[Object.keys(this.music)[0]]
    return 60 / zm.bpm
  }

  /**
   * One bar of four beats. The chord for the bar comes from the zone's
   * loop; the melody is a two-bar phrase generated from chord tones and
   * scale steps, re-rolled every eight bars so it develops without ever
   * leaving the key.
   */
  private _scheduleBar(): void {
    const zoneChanged = this._currentZone !== this._targetZone
    this._currentZone = this._targetZone
    if (zoneChanged) this._phrase = []

    const zm    = this.music[this._currentZone] ?? this.music[Object.keys(this.music)[0]]
    const beat  = 60 / zm.bpm
    const t0    = this._nextBar
    const bar   = this._bar++
    this._nextBar += beat * 4
    const scale = SCALES[zm.mode]
    const deg   = zm.chords[bar % zm.chords.length]
    // Chord tones in semitones above the key root: 1, 3, 5 of the degree.
    const tone  = (d: number, oct = 0) => semi(zm.root, scale[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct))
    const chord = [tone(deg), tone(deg + 2), tone(deg + 4)]

    if (this._delayGain) this._delayGain.gain.setTargetAtTime(zm.echo ? 0.35 : 0, t0, 0.5)

    // Drums
    const s = zm.style
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * beat / 4
      const onBeat = i % 4 === 0
      if (s === 'chug') {
        if (i % 4 === 0) this._kick(t, 0.5)
        if (i % 8 === 4) this._snare(t, 0.14)
        if (i % 2 === 0) this._hihat(t, false, 0.03)
        if (i % 4 === 2) this._woodblock(t)
      } else if (s === 'funk') {
        if (i === 0 || i === 6 || i === 10) this._kick(t, 0.55)
        if (i === 4 || i === 12) this._snare(t, 0.16)
        this._hihat(t, i % 4 === 2, i % 2 ? 0.02 : 0.035)
      } else if (s === 'pad') {
        if (i === 0 || i === 8) this._kick(t, 0.35)
        if (i === 4 || i === 12) this._snare(t, 0.08)
        if (i % 4 === 2) this._hihat(t, true, 0.02)
      } else {
        if (i === 0 || i === 8) this._kick(t, 0.5)
        if (i === 4 || i === 12) this._snare(t, 0.14)
        if (i % 2 === 0) this._hihat(t, i === 6 || i === 14, onBeat ? 0.04 : 0.03)
      }
      // A little fill into every fourth bar
      if (bar % 4 === 3 && i >= 12) this._snare(t, 0.06 + (i - 12) * 0.02)
    }

    // Bass
    const bassRoot = chord[0] / 2
    const fifth    = chord[2] / 2
    if (s === 'chug') {
      for (let i = 0; i < 8; i++) this._voice(t0 + i * beat / 2, i % 2 ? fifth : bassRoot, beat * 0.4, 0.07, 'sawtooth', 700)
    } else if (s === 'funk') {
      for (const [i, f] of [[0, bassRoot], [1.5, bassRoot], [2, fifth], [3, bassRoot], [3.5, bassRoot * 1.5]] as [number, number][]) {
        this._voice(t0 + i * beat, f, beat * 0.35, 0.075, 'square', 900)
      }
    } else if (s === 'offbeat') {
      for (let i = 0; i < 4; i++) this._voice(t0 + i * beat, i % 2 ? fifth : bassRoot, beat * 0.9, 0.07, 'triangle', 600)
    } else {
      for (let i = 0; i < 4; i++) this._voice(t0 + i * beat, i === 2 ? fifth : bassRoot, beat * 0.8, 0.07, 'sawtooth', 500)
    }

    // Chords
    if (s === 'pad') {
      for (const f of chord) this._voice(t0, f, beat * 3.9, 0.035, 'triangle', 1400, 0.4)
    } else if (s === 'offbeat') {
      for (let i = 0; i < 4; i++) for (const f of chord) this._voice(t0 + (i + 0.5) * beat, f, beat * 0.28, 0.03, 'triangle', 2200)
    } else if (s === 'funk') {
      for (const i of [0.5, 1.75, 2.5]) for (const f of chord) this._voice(t0 + i * beat, f * 2, beat * 0.2, 0.025, 'square', 2600)
    } else {
      for (const i of [0, 2]) for (const f of chord) this._voice(t0 + i * beat, f, beat * 0.9, 0.028, 'triangle', 1800)
    }

    // Arpeggio (16ths on chord tones, two octaves)
    if (s === 'arp' || s === 'pluck' || s === 'chug') {
      const arp = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 4, chord[2] * 2, chord[1] * 2]
      const step = s === 'arp' ? beat / 4 : beat / 2
      const n = s === 'arp' ? 16 : 8
      for (let i = 0; i < n; i++) {
        this._voice(t0 + i * step, arp[i % arp.length], step * 0.9, s === 'arp' ? 0.03 : 0.02, 'triangle', 3000)
      }
    }

    // Melody: a two-bar phrase of eighth notes, re-rolled every eight bars.
    if (bar % 8 === 0 || !this._phrase.length) this._phrase = this._makePhrase(zm)
    const half = (bar % 2) * 8
    for (let i = 0; i < 8; i++) {
      const d = this._phrase[half + i]
      if (d < 0) continue
      // Pull the note toward the current chord so the phrase follows the harmony.
      const chordDeg = [deg, deg + 2, deg + 4].map(x => ((x % 7) + 7) % 7)
      const degree = i % 2 === 0 && !chordDeg.includes(((d % 7) + 7) % 7) ? deg + 2 : d
      const f = tone(degree, 2)
      const type: OscillatorType = s === 'funk' ? 'square' : s === 'pad' ? 'sine' : 'triangle'
      this._voice(t0 + i * beat / 2, f, beat * (s === 'pad' ? 0.95 : 0.45), 0.05, type, 2600, s === 'pad' ? 0.15 : 0.005)
    }
  }

  /** Sixteen eighth-note slots: scale degrees, or -1 for a rest. */
  private _makePhrase(zm: ZoneMusic): number[] {
    const out: number[] = []
    let d = 0
    for (let i = 0; i < 16; i++) {
      const r = Math.random()
      if (r < 0.18 && i % 4 !== 0) { out.push(-1); continue }         // rests off the beat
      if (r < 0.5)      d += Math.random() < 0.5 ? 1 : -1              // step
      else if (r < 0.7) d += Math.random() < 0.5 ? 2 : -2              // skip
      else if (r < 0.8) d = 0                                          // home
      if (d > 8) d = 4
      if (d < -3) d = 0
      out.push(d)
    }
    if (zm.style === 'pad') for (let i = 1; i < 16; i += 2) out[i] = -1  // slower phrases for the pad zone
    return out
  }

  // ─── Audio primitives ────────────────────────────────────────────────────

  private _kick(t: number, vol = 0.55): void {
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(this._musicGain)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, t)
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.20)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
    osc.start(t); osc.stop(t + 0.28)
  }

  private _noise(t: number, dur: number, filterType: BiquadFilterType, freq: number, vol: number): void {
    const ctx = this._ctx()
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
    const d   = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const flt = ctx.createBiquadFilter(); flt.type = filterType; flt.frequency.value = freq
    const g   = ctx.createGain()
    src.connect(flt); flt.connect(g); g.connect(this._musicGain)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.start(t); src.stop(t + dur)
  }

  private _snare(t: number, vol = 0.16): void { this._noise(t, 0.11, 'bandpass', 2600, vol) }
  private _hihat(t: number, open: boolean, vol = 0.035): void { this._noise(t, open ? 0.14 : 0.05, 'highpass', 9000, vol) }
  private _woodblock(t: number): void { this._voice(t, 1800, 0.05, 0.05, 'square', 4000) }

  /** A filtered oscillator note with a short envelope. */
  private _voice(t: number, freq: number, dur: number, vol: number, type: OscillatorType, cutoff = 2000, attack = 0.005): void {
    const ctx = this._ctx()
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff; flt.Q.value = 0.7
    osc.connect(flt); flt.connect(g); g.connect(this._musicGain)
    osc.type = type; osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(attack + 0.02, dur))
    osc.start(t); osc.stop(t + Math.max(attack + 0.02, dur) + 0.02)
  }
}
