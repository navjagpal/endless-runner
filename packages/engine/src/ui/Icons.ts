/**
 * Inline SVG icons for the HUD. Emoji render differently on every device
 * (and as monochrome glyphs on some tablets); these are the same everywhere,
 * scale to any size, and match the game's colours.
 */

const svg = (body: string, view = '0 0 24 24') =>
  `<svg viewBox="${view}" width="1em" height="1em" style="vertical-align:-0.15em;display:inline-block" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

export const ICONS = {
  coin: svg(`
    <circle cx="12" cy="12" r="10.5" fill="#f6b800" stroke="#b97600" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="7.2" fill="#ffd34a" stroke="#e39a00" stroke-width="1.2"/>
    <path d="M12 6.8l1.55 3.2 3.5.45-2.55 2.4.65 3.5L12 14.7l-3.15 1.65.65-3.5-2.55-2.4 3.5-.45z" fill="#fff3b0"/>`),
  star: svg(`
    <path d="M12 2.2l2.95 6.2 6.8.85-5 4.7 1.3 6.75L12 17.4l-6.05 3.3 1.3-6.75-5-4.7 6.8-.85z" fill="#ffd93d" stroke="#d4930a" stroke-width="1.4" stroke-linejoin="round"/>`),
  runner: svg(`
    <circle cx="15.5" cy="4.2" r="2.2" fill="#fff"/>
    <path d="M13.2 7.6l-4.3 2.6 1 3.1 2.6-1.6-1.8 4.2-3.6 3.6 2.2 1.6 3.9-4 1.1-2.4 2.4 2.2.8 4.7 2.5-.5-1-5.8-2.5-2.5 1-2.9 3 2 1.4-2.1-4.3-2.9z" fill="#fff"/>`),
  trophy: svg(`
    <path d="M7 3h10v2h3v3c0 2.6-2 4.6-4.5 4.9A5 5 0 0 1 13 15.8V18h3v2H8v-2h3v-2.2A5 5 0 0 1 8.5 12.9C6 12.6 4 10.6 4 8V5h3zM4.9 6.8V8c0 1.5 1 2.7 2.4 3V6.8zm14.2 0h-2.4V11c1.4-.3 2.4-1.5 2.4-3z" fill="#ffd93d" stroke="#b97600" stroke-width="0.8"/>`),
  magnet: svg(`
    <path d="M5 3h5v8a2 2 0 0 0 4 0V3h5v8a7 7 0 0 1-14 0z" fill="#e5484d" stroke="#9f1d21" stroke-width="1.2"/>
    <rect x="5" y="3" width="5" height="4" fill="#dfe5ec"/><rect x="14" y="3" width="5" height="4" fill="#dfe5ec"/>`),
  jet: svg(`
    <path d="M12 2c2.6 1.8 4 5 4 9v5l3 3v2H5v-2l3-3v-5c0-4 1.4-7.2 4-9z" fill="#dfe5ec" stroke="#5d6b7a" stroke-width="1.2"/>
    <circle cx="12" cy="10" r="2" fill="#6fc3ff"/>
    <path d="M9 21l3-3 3 3-3 2z" fill="#ff8a3d"/>`),
  board: svg(`
    <path d="M3 13c3-3 15-3 18 0v2c-3 3-15 3-18 0z" fill="#ff5fa2" stroke="#9f2461" stroke-width="1.2"/>
    <path d="M6 14.5h12" stroke="#66e5ff" stroke-width="1.6" stroke-linecap="round"/>`),
  pause: svg(`<rect x="6" y="4" width="4.5" height="16" rx="1.5" fill="#fff"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.5" fill="#fff"/>`),
  play: svg(`<path d="M7 4.5v15l12-7.5z" fill="#fff"/>`),
  gear: svg(`
    <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zm8.4 5.1l-2.1-.5a6.6 6.6 0 0 0-.6-1.5l1.2-1.8-1.9-1.9-1.8 1.2a6.6 6.6 0 0 0-1.5-.6l-.5-2.1h-2.7l-.5 2.1a6.6 6.6 0 0 0-1.5.6L6.7 7.6 4.8 9.5 6 11.3a6.6 6.6 0 0 0-.6 1.5l-2.1.5v2.7l2.1.5c.1.5.4 1 .6 1.5l-1.2 1.8 1.9 1.9 1.8-1.2c.5.3 1 .5 1.5.6l.5 2.1h2.7l.5-2.1c.5-.1 1-.4 1.5-.6l1.8 1.2 1.9-1.9-1.2-1.8c.3-.5.5-1 .6-1.5l2.1-.5z" fill="#fff"/>`),
  home: svg(`<path d="M12 3l9 8h-2.5v9h-4.5v-6h-4v6H5.5v-9H3z" fill="#fff"/>`),
  paw: svg(`
    <circle cx="6" cy="9" r="2.2" fill="#fff"/><circle cx="18" cy="9" r="2.2" fill="#fff"/>
    <circle cx="9" cy="5" r="2.2" fill="#fff"/><circle cx="15" cy="5" r="2.2" fill="#fff"/>
    <path d="M12 10c3.5 0 6 3 6 5.5 0 2-1.5 3.3-3.5 3.3-1 0-1.7-.4-2.5-.4s-1.5.4-2.5.4C7.5 18.8 6 17.5 6 15.5 6 13 8.5 10 12 10z" fill="#fff"/>`),
  arrowL: svg(`<path d="M15 4l-8 8 8 8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  arrowR: svg(`<path d="M9 4l8 8-8 8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  arrowU: svg(`<path d="M4 15l8-8 8 8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  arrowD: svg(`<path d="M4 9l8 8 8-8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
}

export type IconName = keyof typeof ICONS

export function icon(name: IconName, size = '1em'): string {
  return ICONS[name].replace('width="1em" height="1em"', `width="${size}" height="${size}"`)
}
