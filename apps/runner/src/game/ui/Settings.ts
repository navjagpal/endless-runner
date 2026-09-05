export interface GameSettings {
  brightZones:  boolean           // default true — skip dark forest/space variants
  speedMode:    'auto' | 'manual' // default 'auto'
  manualSpeed:  number            // 8–28, used when speedMode === 'manual'
  /**
   * Kid mode: a gentler ruleset for young players. Lower speed cap and
   * slower ramp-up, wider gaps between obstacles, a lane always left
   * open, and a softer penalty on bumps. Default on — this game is for
   * a six-year-old.
   */
  kidMode:      boolean
  /** Big on-screen arrow buttons. Defaults on for touch devices. */
  touchButtons: boolean
}

function _hasTouch(): boolean {
  try {
    return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
  } catch { return false }
}

export const SETTINGS_DEFAULTS: GameSettings = {
  brightZones:  true,
  speedMode:    'auto',
  manualSpeed:  16,
  kidMode:      true,
  touchButtons: _hasTouch(),
}

export const SPEED_MIN = 8
export const SPEED_MAX = 28
/** Kid mode never runs faster than this. */
export const KID_SPEED_MAX = 17

const STORAGE_KEY = 'runner_settings_v1'

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* storage unavailable */ }
  return { ...SETTINGS_DEFAULTS }
}

export function saveSettings(s: GameSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

// ─── Persistent bests ────────────────────────────────────────────────────────

const BEST_KEY = 'runner_best_v1'

export interface BestRecord { distance: number; coins: number }

export function loadBest(): BestRecord {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    if (raw) {
      const b = JSON.parse(raw)
      return { distance: Number(b.distance) || 0, coins: Number(b.coins) || 0 }
    }
  } catch { /* storage unavailable */ }
  return { distance: 0, coins: 0 }
}

export function saveBest(b: BestRecord): void {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)) } catch { /* ignore */ }
}
