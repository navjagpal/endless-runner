/**
 * The garage: every vehicle he can drive and what its big button does.
 * Nothing is locked — at four and a half, picking the fire truck is the
 * whole point, not a reward. Coins are just a number that goes up.
 */

export type VehicleAction = 'horn' | 'siren' | 'wheelie' | 'bounce'

export interface VehicleDef {
  id:     string
  name:   string
  /** Kenney car-kit model, or 'moto' / 'monster' for the built ones. */
  model:  string
  action: VehicleAction
  /** Jump height multiplier. */
  jump:   number
  /** Uniform scale on the kit model. */
  scale:  number
  /** Emissive lights on the roof: positions (x, y, z) in metres, colours. */
  lights?: { pos: [number, number, number]; color: [number, number, number] }[]
  emoji:  string
}

export const VEHICLES: VehicleDef[] = [
  { id: 'race',      name: 'Race Car',      model: 'race',      action: 'horn',    jump: 1.0, scale: 1.45, emoji: '🏎️' },
  { id: 'police',    name: 'Police Car',    model: 'police',    action: 'siren',   jump: 1.0, scale: 1.25, emoji: '🚓',
    lights: [{ pos: [-0.3, 1.42, -0.1], color: [0.2, 0.4, 1] }, { pos: [0.3, 1.42, -0.1], color: [1, 0.2, 0.2] }] },
  { id: 'fire',      name: 'Fire Truck',    model: 'firetruck', action: 'siren',   jump: 0.9, scale: 1.3, emoji: '🚒',
    lights: [{ pos: [-0.35, 2.28, 1.0], color: [1, 0.2, 0.2] }, { pos: [0.35, 2.28, 1.0], color: [1, 0.2, 0.2] }] },
  { id: 'monster',   name: 'Monster Truck', model: 'monster',   action: 'bounce',  jump: 1.5, scale: 1.35, emoji: '🛻' },
  { id: 'moto',      name: 'Motorcycle',    model: 'moto',      action: 'wheelie', jump: 1.2, scale: 1.0, emoji: '🏍️' },
  { id: 'ambulance', name: 'Ambulance',     model: 'ambulance', action: 'siren',   jump: 0.9, scale: 1.22, emoji: '🚑',
    lights: [{ pos: [-0.35, 2.25, 0.2], color: [1, 0.25, 0.2] }, { pos: [0.35, 2.25, 0.2], color: [0.3, 0.5, 1] }] },
  { id: 'taxi',      name: 'Taxi',          model: 'taxi',      action: 'horn',    jump: 1.0, scale: 1.25, emoji: '🚕',
    lights: [{ pos: [0, 1.9, 0], color: [1, 0.85, 0.2] }] },
  { id: 'sports',    name: 'Sports Car',    model: 'sedan-sports', action: 'horn', jump: 1.1, scale: 1.4, emoji: '🚗' },
]

export const DEFAULT_VEHICLE = 'race'

export interface GarageState {
  selected: string
  bank:     number
}

const KEY = 'vroom_garage_v1'

export function loadGarage(): GarageState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const g = JSON.parse(raw) as Partial<GarageState>
      const selected = typeof g.selected === 'string' && VEHICLES.some(v => v.id === g.selected) ? g.selected : DEFAULT_VEHICLE
      return { selected, bank: Math.max(0, Number(g.bank) || 0) }
    }
  } catch { /* storage unavailable */ }
  return { selected: DEFAULT_VEHICLE, bank: 0 }
}

export function saveGarage(g: GarageState): void {
  try { localStorage.setItem(KEY, JSON.stringify(g)) } catch { /* ignore */ }
}

const BEST_KEY = 'vroom_best_v1'
export function loadBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 }
}
export function saveBest(d: number): void {
  try { localStorage.setItem(BEST_KEY, String(Math.floor(d))) } catch { /* ignore */ }
}
