export interface GameSettings {
  brightZones:  boolean           // default true — skip dark forest/space variants
  speedMode:    'auto' | 'manual' // default 'auto'
  manualSpeed:  number            // 8–28, used when speedMode === 'manual'
}

export const SETTINGS_DEFAULTS: GameSettings = {
  brightZones: true,
  speedMode:   'auto',
  manualSpeed: 16,
}

export const SPEED_MIN = 8
export const SPEED_MAX = 28

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
