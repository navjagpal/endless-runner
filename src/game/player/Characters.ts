/**
 * The playable roster — Kenney's twelve Mini Characters, built to
 * public/models/characters/<id>.glb by scripts/build-kits.mjs.
 *
 * Unlocking costs coins from the bank, which is every coin ever
 * collected (a bump spills coins from the run, never from the bank —
 * the bank only goes up, so a new character is always getting closer).
 * Costs are tuned so a typical kid-mode run of ~250 coins buys one
 * early and the last one takes a few sessions.
 */

export interface CharacterDef {
  id:   string
  name: string
  cost: number
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'female-b', name: 'Ruby',  cost: 0 },
  { id: 'female-a', name: 'Zoe',   cost: 30 },
  { id: 'female-c', name: 'Mia',   cost: 60 },
  { id: 'male-a',   name: 'Max',   cost: 100 },
  { id: 'female-d', name: 'Ava',   cost: 150 },
  { id: 'male-c',   name: 'Sam',   cost: 200 },
  { id: 'female-e', name: 'Lily',  cost: 260 },
  { id: 'male-d',   name: 'Leo',   cost: 330 },
  { id: 'female-f', name: 'Nora',  cost: 420 },
  { id: 'male-e',   name: 'Ben',   cost: 520 },
  { id: 'male-f',   name: 'Kai',   cost: 640 },
  { id: 'male-b',   name: 'Gus',   cost: 800 },
]

export const DEFAULT_CHARACTER = 'female-b'

export function characterUrl(id: string): string {
  return `${import.meta.env.BASE_URL}models/characters/${id}.glb`
}

export interface Roster {
  selected: string
  bank:     number
  unlocked: string[]
}

const KEY = 'runner_roster_v1'

export function loadRoster(): Roster {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const r = JSON.parse(raw) as Partial<Roster>
      const unlocked = Array.isArray(r.unlocked) ? r.unlocked.filter(id => CHARACTERS.some(c => c.id === id)) : []
      if (!unlocked.includes(DEFAULT_CHARACTER)) unlocked.unshift(DEFAULT_CHARACTER)
      const selected = typeof r.selected === 'string' && unlocked.includes(r.selected) ? r.selected : DEFAULT_CHARACTER
      return { selected, bank: Math.max(0, Number(r.bank) || 0), unlocked }
    }
  } catch { /* storage unavailable */ }
  return { selected: DEFAULT_CHARACTER, bank: 0, unlocked: [DEFAULT_CHARACTER] }
}

export function saveRoster(r: Roster): void {
  try { localStorage.setItem(KEY, JSON.stringify(r)) } catch { /* ignore */ }
}
