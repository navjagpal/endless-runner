import type { ZoneMusic } from '@kids/engine'

/** Upbeat, simple, major keys — driving music for a four-year-old. */
export const ZONE_MUSIC: Record<string, ZoneMusic> = {
  country:  { bpm: 128, root: 130.81, mode: 'major', chords: [0, 3, 4, 0], style: 'pluck' },      // C  I IV V I
  city:     { bpm: 140, root: 164.81, mode: 'major', chords: [0, 5, 3, 4], style: 'funk' },       // E  I vi IV V
  beach:    { bpm: 124, root: 146.83, mode: 'major', chords: [0, 3, 0, 4], style: 'offbeat' },    // D  I IV I V
  mountain: { bpm: 132, root: 196.00, mode: 'major', chords: [0, 4, 5, 3], style: 'chug' },       // G  I V vi IV
}
