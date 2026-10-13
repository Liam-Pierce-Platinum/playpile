// Species batch 1. Each entry is ONE species object; see SPECIES_GUIDE.md.
// Check with: node tools/check.mjs   See them with: node tools/gallery.mjs batch1
// The first 4 are the engine's worked examples (tiny flyer, big quadruped, serpent, plant).
export default [
  { id: 'tuftlet', name: 'Tuftlet', type: 'gale', rarity: 'common', size: 'tiny', plan: 'flyer',
    build: 'chubby',
    parts: { head: 'beaked', eyes: 'sparkle', mouth: 'beak', wings: 'tiny', tail: 'fan', crest: 'tuft', cheeks: 'blush' },
    palette: { main: '#f4f0e0', belly: '#ffffff', accent: '#6ac8b0', accent2: '#c8fff0', eye: '#2a8a78', beak: '#ffb347' },
    stats: { hp: 84, atk: 12, def: 8, spd: 96 },
    movePool: ['gust', 'bonk', 'air_slash', 'tailwind', 'sky_dive', 'feather_storm'],
    evolved: { name: 'Galeplume', size: 'medium', build: 'normal',
      parts: { wings: 'feather', eyes: 'fierce', extras: ['brows'], pattern: ['belly', 'tipped'] },
      palette: { main: '#e8f4ec', accent: '#3aa890' } } },

  { id: 'frostusk', name: 'Frostusk', type: 'frost', rarity: 'rare', size: 'medium', plan: 'quadruped',
    build: 'chubby',
    parts: { head: 'muzzle', ears: 'floppy', mouth: 'tusks', eyes: 'sleepy', mane: 'fluffy', tail: 'curly', pattern: ['belly', 'socks'] },
    palette: { main: '#b8d8f0', belly: '#f0faff', accent: '#ffffff', accent2: '#e0f4ff', eye: '#3a6a9a' },
    stats: { hp: 124, atk: 12, def: 13, spd: 58 },
    movePool: ['frost_shard', 'tackle', 'ice_slide', 'glacier_wall', 'blizzard', 'avalanche'],
    evolved: { name: 'Glaciath', size: 'huge',
      parts: { spikes: 'crystals', horns: 'ram', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#8ab8e0', accent: '#e8faff', accent2: '#9ae8ff' } } },

  { id: 'hexadder', name: 'Hexadder', type: 'shade', rarity: 'epic', size: 'small', plan: 'serpent',
    parts: { head: 'long', eyes: 'glowing', mouth: 'fangs', crest: 'fin', tail: 'split', pattern: ['belly', 'diamonds'] },
    palette: { main: '#4a3a6a', belly: '#b8a0d8', accent: '#ff5ab0', accent2: '#ffb0e0', eye: '#ffe04a', pattern: '#2a1f40' },
    stats: { hp: 98, atk: 15, def: 10, spd: 84 },
    movePool: ['shadow_bolt', 'night_slash', 'umbral_dash', 'curse_pit', 'shadow_veil', 'dread_pulse'],
    evolved: { name: 'Nocturnis', size: 'large',
      parts: { wings: 'bat', horns: 'twin', crest: 'mohawk', mouth: 'grin' },
      palette: { main: '#3a2a5a' } } },

  { id: 'pollenpod', name: 'Pollenpod', type: 'fae', rarity: 'common', size: 'small', plan: 'plant',
    parts: { head: 'wide', ears: 'leaf', crest: 'petals', eyes: 'sparkle', mouth: 'smile', cheeks: 'blush', leaves: 'vines' },
    palette: { main: '#ffe8f4', belly: '#fffaff', accent: '#ff8ad0', accent2: '#ffd0ec', eye: '#c04a98', stem: '#4a9a4a' },
    stats: { hp: 98, atk: 11, def: 11, spd: 74 },
    movePool: ['pixie_dust', 'bonk', 'charm_wave', 'wish', 'sparkle_dash', 'moonbeam'],
    evolved: { name: 'Blossarina', size: 'medium',
      parts: { head: 'tall', wings: 'fairy', leaves: 'petals', eyes: 'sparkle', crest: 'crown' },
      palette: { accent: '#ff5ab8', accent2: '#ffe0f4' } } },

  // ---- batch1 roster: fire and electric (author 1) ----

  // Fire salamander: low, long, flat-headed, coal-black with glowing magma spots.
  { id: 'coalnewt', name: 'Coalnewt', type: 'ember', rarity: 'common', size: 'small', plan: 'quadruped',
    build: { w: 1.25, h: 0.8, head: 1, legs: 0.6 },
    parts: { head: 'frog', eyes: 'round', mouth: 'smile', tail: 'long', pattern: ['belly', 'spots'] },
    palette: { main: '#544a5a', belly: '#ff9a4a', accent: '#ff7a2a', accent2: '#ffd060', spot: '#ffb020', eye: '#ffb020' },
    stats: { hp: 100, atk: 13, def: 11, spd: 72 },
    movePool: ['ember_spit', 'bonk', 'flame_dash', 'heat_up', 'fire_ring', 'meteor'],
    evolved: { name: 'Lavalisk',
      parts: { spikes: 'back', crest: 'flame', eyes: 'fierce', mouth: 'fangs' },
      palette: { main: '#3a3040' } } },

  // Electric fennec: slim, leggy, enormous ears, zigzag tail.
  { id: 'sparkfen', name: 'Sparkfen', type: 'spark', rarity: 'epic', size: 'small', plan: 'quadruped',
    build: 'leggy',
    parts: { head: 'fox', ears: 'bat', eyes: 'sparkle', mouth: 'cat', tail: 'bolt', pattern: ['belly', 'tipped', 'socks'] },
    palette: { main: '#f0d49a', belly: '#fff6e0', accent: '#3aa8ff', accent2: '#a8e4ff', eye: '#2a78d0' },
    stats: { hp: 92, atk: 15, def: 9, spd: 98 },
    movePool: ['zap', 'bolt_dash', 'chain_spark', 'overcharge', 'static_field', 'thunder'],
    evolved: { name: 'Thunderfen', size: 'medium',
      parts: { mane: 'spiky', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#e6c07a' } } },

  // Sooty swift: slim dark bird, forked tail, a candle flame for a crest.
  { id: 'sootswift', name: 'Sootswift', type: 'ember', rarity: 'common', size: 'small', plan: 'flyer',
    build: 'slim',
    parts: { head: 'beaked', eyes: 'round', mouth: 'beak', wings: 'feather', tail: 'split', crest: 'flame', pattern: ['belly', 'tipped'] },
    palette: { main: '#5a5266', belly: '#ffcf8a', accent: '#ff6a2a', accent2: '#ffd050', eye: '#2a2030', beak: '#ffb030', wing: '#4a4258' },
    stats: { hp: 80, atk: 14, def: 7, spd: 100 },
    movePool: ['ember_spit', 'gust', 'flame_dash', 'fireball', 'sky_dive', 'meteor'],
    evolved: { name: 'Pyreswift', size: 'medium',
      parts: { wings: 'flame', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#4a4256' } } },

  // Rhino beetle with a smelting-hot horn.
  { id: 'smeltle', name: 'Smeltle', type: 'ember', rarity: 'common', size: 'small', plan: 'insect',
    parts: { head: 'round', eyes: 'compound', ears: 'none', horns: 'single', shell: 'dome' },
    palette: { main: '#c0703a', belly: '#f0c090', accent: '#ffb030', accent2: '#ffe890', eye: '#ffe060', horn: '#fff0b0' },
    stats: { hp: 78, atk: 13, def: 13, spd: 70 },
    movePool: ['ember_spit', 'pincer_snap', 'flame_dash', 'heat_up', 'hive_burst', 'fire_ring'],
    evolved: { name: 'Forgehorn',
      parts: { wings: 'bug', claws: 'pincers', eyes: 'glowing' },
      palette: { main: '#a0502a', accent: '#ffd040' } } },

  // Storm-cloud ram: stocky, grey thundercloud wool, gold curled horns.
  { id: 'nimbram', name: 'Nimbram', type: 'spark', rarity: 'rare', size: 'small', plan: 'quadruped',
    build: { w: 1.2, h: 1.1, head: 1, legs: 0.7 },
    parts: { head: 'round', eyes: 'sleepy', mouth: 'smile', mane: 'fluffy', horns: 'ram', pattern: ['belly'] },
    palette: { main: '#dde2ee', belly: '#b4bcd2', accent: '#6a7292', accent2: '#ffe060', eye: '#3a4060', horn: '#ffd84a' },
    stats: { hp: 124, atk: 11, def: 14, spd: 58 },
    movePool: ['zap', 'tackle', 'static_field', 'overcharge', 'chain_spark', 'thunder'],
    evolved: { name: 'Stormhorn', size: 'medium',
      parts: { tail: 'bolt', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#c8cfe0', accent: '#4a5274' } } },

  // Live eel: round-headed spotted ribbon with a tall ribbed sail.
  { id: 'livewire', name: 'Livewire', type: 'spark', rarity: 'rare', size: 'medium', plan: 'serpent',
    build: 'slim',
    parts: { head: 'frog', eyes: 'dot', mouth: 'grin', cheeks: 'spark', ears: 'antenna', fins: 'side', tail: 'bolt', pattern: ['belly', 'spots'] },
    palette: { main: '#2f6a7a', belly: '#e8e090', accent: '#ffe040', accent2: '#fff4a0', spot: '#ffe040', cheek: '#ffe040', eye: '#1a2a30' },
    stats: { hp: 100, atk: 15, def: 9, spd: 88 },
    movePool: ['zap', 'bubble', 'bolt_dash', 'chain_spark', 'aqua_jet', 'thunder'],
    evolved: { name: 'Arcwyrm', size: 'large',
      parts: { head: 'long', fins: 'both', crest: 'mohawk', eyes: 'glowing', mouth: 'fangs' },
      palette: { main: '#24586a' } } },

  // Paper lantern spirit: striped glowing oval with a candle flame on top.
  { id: 'lampwick', name: 'Lampwick', type: 'ember', rarity: 'common', size: 'tiny', plan: 'floater',
    build: { w: 0.85, h: 1.4, head: 1, legs: 1 },
    parts: { eyes: 'happy', mouth: 'smile', cheeks: 'blush', fins: 'none', tail: 'none', crest: 'flame', wings: 'tiny', pattern: ['plain', 'stripes'] },
    palette: { main: '#ffc860', belly: '#fff0c0', accent: '#ff5a2a', accent2: '#ffe060', pattern: '#d04a20', eye: '#4a2010' },
    stats: { hp: 90, atk: 13, def: 9, spd: 90 },
    movePool: ['ember_spit', 'bonk', 'fire_ring', 'heat_up', 'fireball', 'meteor'],
    evolved: { name: 'Paperpyre', size: 'small',
      parts: { fins: 'tentacles', eyes: 'sparkle', wings: 'flame', gem: 'chest' },
      palette: { main: '#ffb048', gem: '#ff5a2a' } } },

  // Kiln tortoise: iron body, brick shell glowing at the rim, chimney fire.
  { id: 'kilnoise', name: 'Kilnoise', type: 'ember', rarity: 'rare', size: 'medium', plan: 'shell',
    parts: { head: 'wide', eyes: 'sleepy', mouth: 'smile', shell: 'plates', crest: 'flame', extras: ['brows'] },
    palette: { main: '#6a6470', belly: '#d8c0a0', accent: '#c8643a', accent2: '#ffb040', eye: '#ffb040' },
    stats: { hp: 128, atk: 11, def: 14, spd: 52 },
    movePool: ['ember_spit', 'rock_throw', 'fire_ring', 'heat_up', 'quake', 'meteor'],
    evolved: { name: 'Furnadon', size: 'large',
      parts: { shell: 'spiky', horns: 'twin', eyes: 'fierce' },
      palette: { main: '#58525e', accent: '#b8502a' } } },

  // Plasma blob: a one-eyed squishy battery with antennae.
  { id: 'zaplet', name: 'Zaplet', type: 'spark', rarity: 'common', size: 'tiny', plan: 'blob',
    parts: { eyes: 'cyclops', mouth: 'grin', cheeks: 'spark', ears: 'antenna', crest: 'curl', tail: 'bolt', pattern: ['belly'] },
    palette: { main: '#ffd83a', belly: '#fff6c0', accent: '#3a3a5a', accent2: '#8a8aa8', eye: '#3a2a6a', cheek: '#ff7a3a' },
    stats: { hp: 96, atk: 12, def: 10, spd: 84 },
    movePool: ['zap', 'bonk', 'static_field', 'overcharge', 'bolt_dash', 'thunder'],
    evolved: { name: 'Plasmound', size: 'medium',
      parts: { crest: 'mohawk', horns: 'stubs', extras: ['brows'] },
      palette: { main: '#f4c020', accent: '#2a2a48' } } },
];
