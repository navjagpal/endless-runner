import type { ZoneMusic } from '@kids/engine'

/** Key, mode, four-chord loop and style per zone. */
export const ZONE_MUSIC: Record<string, ZoneMusic> = {
  meadow:  { bpm: 132, root: 130.81, mode: 'major', chords: [0, 4, 5, 3], style: 'pluck' },      // C  I V vi IV
  forest:  { bpm: 108, root: 110.00, mode: 'minor', chords: [0, 5, 2, 6], style: 'pad' },        // Am i VI III VII
  city:    { bpm: 148, root: 164.81, mode: 'major', chords: [0, 3, 4, 3], style: 'funk' },       // E  I IV V IV
  railway: { bpm: 140, root: 196.00, mode: 'major', chords: [0, 0, 3, 4], style: 'chug' },       // G  I I IV V
  beach:   { bpm: 126, root: 146.83, mode: 'major', chords: [0, 3, 0, 4], style: 'offbeat' },    // D  I IV I V
  space:   { bpm: 120, root: 138.59, mode: 'minor', chords: [0, 5, 3, 4], style: 'arp', echo: true }, // C#m i VI iv v
}
