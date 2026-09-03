#!/usr/bin/env node
/**
 * Builds the game's model kits from Kenney's CC0 asset packs.
 *
 * Downloads the packs, picks the models the game uses, joins each model
 * into as few meshes as possible, merges every model of a kit into one
 * GLB (one request per kit, one shared texture), deduplicates materials
 * and textures across models, quantizes vertex data (KHR_mesh_quantization
 * — decoded natively by Babylon, no wasm decoder needed offline) and
 * writes to public/models/kits/.
 *
 * Each model ends up as a root node named after its source file
 * ("sedan", "tree_oak", ...), which is how `src/game/assets/Kits.ts`
 * looks it up.
 *
 * Run: npm run assets:kits
 *
 * Kenney's download URLs carry a content hash that changes when a pack is
 * updated. If a download 404s, open the asset page listed below, copy the
 * new zip URL, and update it here.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { NodeIO, Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, flatten, join as joinMeshes, mergeDocuments, weld, unpartition } from '@gltf-transform/functions'

const root  = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'node_modules', '.cache', 'kenney')
const out   = join(root, 'public', 'models', 'kits')

// ─── Sources ─────────────────────────────────────────────────────────────────

const PACKS = {
  car: {
    page: 'https://kenney.nl/assets/car-kit',
    url:  'https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip',
    dir:  'Models/GLB format',
  },
  nature: {
    page: 'https://kenney.nl/assets/nature-kit',
    url:  'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip',
    dir:  'Models/GLTF format',
  },
  city: {
    page: 'https://kenney.nl/assets/city-kit-commercial',
    url:  'https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip',
    dir:  'Models/GLB format',
  },
  blocky: {
    page: 'https://kenney.nl/assets/blocky-characters',
    url:  'https://kenney.nl/media/pages/assets/blocky-characters/8369c0cf30-1749547469/kenney_blocky-characters_20.zip',
    dir:  'Models/GLB format',
  },
  mini: {
    page: 'https://kenney.nl/assets/mini-characters',
    url:  'https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip',
    dir:  'Models/GLB format',
  },
  // Audio
  impact: {
    page: 'https://kenney.nl/assets/impact-sounds',
    url:  'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    dir:  'Audio',
  },
  interface: {
    page: 'https://kenney.nl/assets/interface-sounds',
    url:  'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
    dir:  'Audio',
  },
  jingles: {
    page: 'https://kenney.nl/assets/music-jingles',
    url:  'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
    dir:  'Audio',
  },
  digital: {
    page: 'https://kenney.nl/assets/digital-audio',
    url:  'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
    dir:  'Audio',
  },
  casino: {
    page: 'https://kenney.nl/assets/casino-audio',
    url:  'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
    dir:  'Audio',
  },
}

/**
 * Sound effects: game name → pack + file. Everything the game plays is
 * copied to public/audio/<name>.ogg; AudioManager falls back to its old
 * synthesised beeps for any file that fails to load.
 */
const SOUNDS = {
  coin:      ['interface', 'glass_002.ogg'],
  jump:      ['digital',   'phaseJump1.ogg'],
  bump:      ['impact',    'impactSoft_heavy_001.ogg'],
  spill:     ['casino',    'chips-collide-2.ogg'],
  star:      ['digital',   'powerUp7.ogg'],
  magnet:    ['digital',   'powerUp2.ogg'],
  streak:    ['interface', 'confirmation_002.ogg'],
  whee:      ['digital',   'phaserUp5.ogg'],
  best:      ['jingles',   'Pizzicato jingles/jingles_PIZZI03.ogg'],
  zone:      ['jingles',   'Pizzicato jingles/jingles_PIZZI01.ogg'],
  starJingle:['jingles',   'Pizzicato jingles/jingles_PIZZI04.ogg'],
  click:     ['interface', 'click_001.ogg'],
  select:    ['interface', 'confirmation_003.ogg'],
  locked:    ['interface', 'error_004.ogg'],
  land:      ['impact',    'footstep_concrete_002.ogg'],
  step:      ['impact',    'footstep_concrete_000.ogg'],
}

/**
 * The playable characters: every skinned chibi in Kenney's Mini
 * Characters pack, each with sprint, jump, fall and crouch clips — so
 * running, jumping and sliding are all real animation. Kept un-joined
 * and un-quantized so the skins and clips survive untouched. Written one
 * file each to public/models/characters/ so the game only fetches the
 * one that's selected. The roster (names, unlock costs) lives in
 * src/game/player/Characters.ts.
 */
const CHARACTERS = {
  pack: 'mini',
  models: [
    'character-female-a', 'character-female-b', 'character-female-c',
    'character-female-d', 'character-female-e', 'character-female-f',
    'character-male-a', 'character-male-b', 'character-male-c',
    'character-male-d', 'character-male-e', 'character-male-f',
  ],
}

// Which models each kit ships. Keep this tight: every entry is bytes the
// tablet downloads before the first run.
const KITS = {
  vehicles: { pack: 'car', models: [
    'sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'taxi', 'police', 'van', 'race',
    'delivery', 'firetruck', 'ambulance',
  ] },
  nature: { pack: 'nature', models: [
    'tree_default', 'tree_default_dark', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_simple',
    'tree_small', 'tree_tall', 'tree_blocks',
    'tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundA', 'tree_pineRoundB', 'tree_pineDefaultA', 'tree_pineSmallA',
    'tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palmShort',
    'plant_bush', 'plant_bushLarge', 'plant_bushDetailed',
    'flower_redA', 'flower_redB', 'flower_purpleA', 'flower_purpleC', 'flower_yellowA', 'flower_yellowB',
    'mushroom_red', 'mushroom_redGroup', 'mushroom_tan', 'mushroom_tanTall',
    'rock_largeA', 'rock_largeB', 'rock_smallA', 'rock_smallB', 'rock_tallA',
    'stump_round', 'stump_oldTall', 'log', 'log_stack', 'fence_simple', 'fence_planks', 'grass_large',
  ] },
  city: { pack: 'city', models: [
    'building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h',
    'building-skyscraper-a', 'building-skyscraper-b',
    'low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d',
    'low-detail-building-e', 'low-detail-building-f', 'low-detail-building-wide-a', 'low-detail-building-wide-b',
    'detail-awning', 'detail-awning-wide',
  ] },
}

// ─── Download & extract ──────────────────────────────────────────────────────

async function fetchPack(name) {
  const p = PACKS[name]
  const zip = join(cache, `${name}.zip`)
  const dir = join(cache, name)
  if (existsSync(join(dir, p.dir))) return join(dir, p.dir)
  mkdirSync(cache, { recursive: true })
  if (!existsSync(zip)) {
    console.log(`downloading ${p.url}`)
    const res = await fetch(p.url)
    if (!res.ok) throw new Error(`${res.status} fetching ${p.url} — check ${p.page} for the current zip link`)
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  }
  mkdirSync(dir, { recursive: true })
  // bsdtar (Windows 10+, macOS) reads zips; fall back to unzip.
  try {
    execSync(`tar -xf "${zip}" -C "${dir}"`, { stdio: 'ignore' })
  } catch {
    execSync(`unzip -oq "${zip}" -d "${dir}"`, { stdio: 'ignore' })
  }
  return join(dir, p.dir)
}

// ─── Build ───────────────────────────────────────────────────────────────────

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

async function buildKit(kitName, kit) {
  const srcDir = await fetchPack(kit.pack)
  const target = new Document()
  const scene  = target.createScene(kitName)
  target.getRoot().setDefaultScene(scene)

  for (const model of kit.models) {
    const file = join(srcDir, `${model}.glb`)
    if (!existsSync(file)) { console.warn(`  missing ${file}`); continue }
    const doc = await io.read(file)
    // Collapse each model's node tree to one mesh per material.
    await doc.transform(flatten(), joinMeshes({ keepNamed: false }))

    const map = mergeDocuments(target, doc)
    const group = target.createNode(model)
    for (const srcScene of doc.getRoot().listScenes()) {
      const copied = map.get(srcScene)
      for (const child of copied.listChildren()) group.addChild(child)
      copied.dispose()
    }
    scene.addChild(group)
  }

  await target.transform(
    dedup(),
    weld(),
    quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0)$/ }),
    prune(),
    // GLB allows exactly one buffer; merged documents arrive with one each.
    unpartition(),
  )

  mkdirSync(out, { recursive: true })
  const file = join(out, `${kitName}.glb`)
  await io.write(file, target)
  const kb = (readFileSync(file).length / 1024).toFixed(0)
  console.log(`${kitName}.glb: ${kit.models.length} models, ${kb} KB`)
}

async function buildCharacters() {
  const srcDir = await fetchPack(CHARACTERS.pack)
  const dir = join(root, 'public', 'models', 'characters')
  mkdirSync(dir, { recursive: true })
  let total = 0
  for (const model of CHARACTERS.models) {
    const doc = await io.read(join(srcDir, `${model}.glb`))
    await doc.transform(dedup(), prune(), unpartition())
    const file = join(dir, `${model.replace('character-', '')}.glb`)
    await io.write(file, doc)
    total += readFileSync(file).length
  }
  console.log(`characters: ${CHARACTERS.models.length} files, ${(total / 1024).toFixed(0)} KB total`)
  // The old single-hero file, if present from an earlier build.
  const legacy = join(root, 'public', 'models', 'runner.glb')
  if (existsSync(legacy)) rmSync(legacy)
}

async function buildSounds() {
  const dir = join(root, 'public', 'audio')
  mkdirSync(dir, { recursive: true })
  let total = 0
  for (const [name, [pack, file]] of Object.entries(SOUNDS)) {
    const srcDir = await fetchPack(pack)
    const src = join(srcDir, file)
    if (!existsSync(src)) { console.warn(`  missing sound ${src}`); continue }
    const bytes = readFileSync(src)
    writeFileSync(join(dir, `${name}.ogg`), bytes)
    total += bytes.length
  }
  console.log(`audio: ${Object.keys(SOUNDS).length} files, ${(total / 1024).toFixed(0)} KB total`)
  writeFileSync(join(dir, 'CREDITS.md'), `# Sound effects

All from [Kenney](https://kenney.nl) audio packs, **CC0 1.0** (public domain):
Impact Sounds, Interface Sounds, Music Jingles, Digital Audio, Casino Audio.
Copied by \`scripts/build-kits.mjs\`; the mapping is the SOUNDS table there.
`)
}

for (const [name, kit] of Object.entries(KITS)) await buildKit(name, kit)
await buildCharacters()
await buildSounds()

writeFileSync(join(out, 'CREDITS.md'), `# Model kits

Built by \`scripts/build-kits.mjs\` from these packs by [Kenney](https://kenney.nl),
all **CC0 1.0** (public domain — no attribution required, credited anyway):

- Car Kit — ${PACKS.car.page}
- Nature Kit — ${PACKS.nature.page}
- City Kit (Commercial) — ${PACKS.city.page}
- Mini Characters (the runners, \`public/models/characters/\`) — ${PACKS.mini.page}

Do not edit the .glb files by hand; change the model lists in the script
and rebuild with \`npm run assets:kits\`.
`)
void basename
