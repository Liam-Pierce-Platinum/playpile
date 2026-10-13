// Species batch 4. Each entry is ONE species object; see SPECIES_GUIDE.md.
// Check with: node tools/check.mjs   See them with: node tools/gallery.mjs batch4
// Theme: rock, ghost and strange creatures (Stone / Shade) plus two legendary dragons.
export default [
  // ---- STONE ----
  // Mole: low, stocky, pointy snout, beady eyes and big digging claws.
  { id: 'burrowbit', name: 'Burrowbit', type: 'stone', rarity: 'common', size: 'small', plan: 'quadruped',
    build: { w: 1.1, h: 0.95, head: 1.05, legs: 0.6 },
    parts: { head: 'fox', eyes: 'dot', mouth: 'smile', ears: 'none', claws: 'claws', tail: 'curly', extras: ['whiskers'], pattern: ['belly'] },
    palette: { main: '#8a6a58', belly: '#e8c8b0', accent: '#f0a0a8', accent2: '#ffd0d4', eye: '#2a1a1a' },
    stats: { hp: 96, atk: 13, def: 11, spd: 72 },
    movePool: ['rock_throw', 'bonk', 'boulder_roll', 'spike_trap', 'snack', 'quake'],
    evolved: { name: 'Drillmole', size: 'medium',
      parts: { horns: 'single', eyes: 'fierce', spikes: 'studs', extras: ['whiskers', 'brows'] },
      palette: { main: '#6e5244', horn: '#d0d8e0' } } },

  // Armadillo: a turtle-style body with banded armour and a long snout.
  { id: 'rollodillo', name: 'Rollodillo', type: 'stone', rarity: 'rare', size: 'small', plan: 'shell',
    parts: { head: 'long', shell: 'plates', ears: 'cat', eyes: 'round', mouth: 'smile', tail: 'long', cheeks: 'blush' },
    palette: { main: '#d8b088', belly: '#f4e0c8', accent: '#a8846a', accent2: '#e8c8a0' },
    stats: { hp: 104, atk: 10, def: 17, spd: 64 },
    movePool: ['bonk', 'boulder_roll', 'rock_throw', 'stone_skin', 'spike_trap', 'quake'],
    evolved: { name: 'Rampardillo', size: 'medium',
      parts: { shell: 'spiky', tail: 'club', horns: 'stubs', eyes: 'fierce', cheeks: 'none' },
      palette: { main: '#c09870', accent: '#7a6a62' } } },

  // Crystal bat: tiny, one huge eye, a crystal sprouting from its head.
  { id: 'gemflit', name: 'Gemflit', type: 'stone', rarity: 'rare', size: 'tiny', plan: 'flyer',
    build: 'bighead',
    parts: { head: 'round', eyes: 'cyclops', mouth: 'fangs', wings: 'bat', tail: 'none', horns: 'crystal', ears: 'none' },
    palette: { main: '#5a5078', belly: '#b0a8c8', accent: '#5ae8f0', accent2: '#e0ffff', eye: '#40c8e0', horn: '#9af0ff', beak: '#a8a0c0' },
    stats: { hp: 80, atk: 14, def: 9, spd: 100 },
    movePool: ['rock_throw', 'gust', 'shard_spray', 'air_slash', 'stone_skin', 'spike_trap'],
    evolved: { name: 'Prismaw', size: 'medium',
      parts: { spikes: 'crystals', mouth: 'grin', gem: 'chest', tail: 'split' },
      palette: { main: '#4a5878', accent: '#b08af8', accent2: '#f0e0ff', horn: '#c8a8ff', gem: '#c8a8ff' } } },

  // Golem: mossy cobblestone heap with a squat face and tusks.
  { id: 'cobblin', name: 'Cobblin', type: 'stone', rarity: 'common', size: 'medium', plan: 'golem',
    build: { w: 0.85, h: 1.3, head: 1, legs: 0.8 },
    parts: { head: 'wide', eyes: 'dot', mouth: 'tusks', claws: 'mitts', spikes: 'studs', crest: 'sprout', pattern: ['spots'] },
    palette: { main: '#9a9488', belly: '#c8c0b0', accent: '#6a9a4a', accent2: '#a8d878', spot: '#7a7468', eye: '#1a1a1a' },
    stats: { hp: 112, atk: 12, def: 13, spd: 52 },
    movePool: ['rock_throw', 'bonk', 'stone_skin', 'quake', 'boulder_roll', 'spike_trap'],
    evolved: { name: 'Rubblord', size: 'large', build: { w: 1.4, h: 0.95, head: 0.9, legs: 0.65 },
      parts: { crest: 'mohawk', spikes: 'back', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#888276', accent: '#5a8a3a' } } },

  // ---- SHADE ----
  // Living candle: tall wax drip with a violet flame for hair.
  { id: 'waxwick', name: 'Waxwick', type: 'shade', rarity: 'common', size: 'small', plan: 'blob',
    build: { w: 0.7, h: 1.45, head: 1, legs: 1 },
    parts: { crest: 'flame', eyes: 'sleepy', mouth: 'smile', cheeks: 'none', leaves: 'vines', pattern: ['plain'] },
    palette: { main: '#f0e8d8', belly: '#ffffff', accent: '#9a5ae8', accent2: '#f0d0ff', eye: '#5a2a8a', stem: '#fff8ec', leaf: '#fff8ec' },
    stats: { hp: 88, atk: 14, def: 8, spd: 72 },
    movePool: ['shadow_bolt', 'ember_spit', 'curse_pit', 'fire_ring', 'shadow_veil', 'dread_pulse'],
    evolved: { name: 'Candelabre', size: 'medium',
      parts: { wings: 'flame', eyes: 'glowing', mouth: 'grin', horns: 'twin', extras: ['brows'], pattern: ['plain'] },
      palette: { main: '#e8dcc8', accent: '#7a3ad8', eye: '#c890ff', horn: '#9a5ae8' } } },

  // Ghost cat: floating cat head with a wisp body.
  { id: 'purrgeist', name: 'Purrgeist', type: 'shade', rarity: 'common', size: 'small', plan: 'ghost',
    parts: { ears: 'cat', eyes: 'happy', mouth: 'cat', cheeks: 'blush', extras: ['whiskers'], pattern: ['plain', 'gradient'] },
    palette: { main: '#8a80c0', belly: '#d8d0f8', accent: '#d8c8ff', accent2: '#ffffff', cheek: '#ff9ac8' },
    stats: { hp: 84, atk: 13, def: 8, spd: 92 },
    movePool: ['night_slash', 'shadow_bolt', 'umbral_dash', 'snack', 'curse_pit', 'dread_pulse'],
    evolved: { name: 'Spectabby', size: 'medium',
      parts: { eyes: 'glowing', tail: 'split', mouth: 'fangs', pattern: ['plain', 'gradient', 'stripes'] },
      palette: { main: '#6a5aa8', eye: '#ffe04a', pattern: '#4a3a88' } } },

  // Eyeball blob: a squat dark puddle with one big eye and dangling tendrils.
  { id: 'gazeblot', name: 'Gazeblot', type: 'shade', rarity: 'common', size: 'small', plan: 'blob',
    build: { w: 1.2, h: 0.95, head: 1, legs: 1 },
    parts: { eyes: 'cyclops', mouth: 'none', cheeks: 'none', ears: 'antenna', pattern: ['belly', 'spots'] },
    palette: { main: '#6a4a8a', belly: '#a888c0', accent: '#ff6a8a', accent2: '#ffc0d0', eye: '#ff3a5a', spot: '#8a6aa8' },
    stats: { hp: 90, atk: 12, def: 10, spd: 80 },
    movePool: ['shadow_bolt', 'bonk', 'curse_pit', 'shadow_veil', 'dread_pulse', 'umbral_dash'],
    evolved: { name: 'Oculoom', size: 'medium',
      parts: { wings: 'bat', horns: 'twin', mouth: 'grin', ears: 'none' },
      palette: { main: '#5a3a7a' } } },

  // Mask spirit: a floating carved mask with horns and a toothy grin.
  { id: 'masquin', name: 'Masquin', type: 'shade', rarity: 'epic', size: 'small', plan: 'floater',
    build: { w: 0.9, h: 1.25, head: 1, legs: 1 },
    parts: { fins: 'none', tail: 'none', horns: 'twin', eyes: 'glowing', mouth: 'grin', cheeks: 'freckles', pattern: ['plain', 'mask'] },
    palette: { main: '#e8e0d0', belly: '#ffffff', accent: '#d83a3a', accent2: '#ffd0a0', eye: '#ff4a3a', pattern: '#2a2030', horn: '#d83a3a', cheek: '#d83a3a' },
    stats: { hp: 96, atk: 16, def: 11, spd: 84 },
    movePool: ['shadow_bolt', 'pixie_dust', 'dread_pulse', 'charm_wave', 'shadow_veil', 'curse_pit'],
    evolved: { name: 'Masquerath', size: 'medium', plan: 'ghost',
      parts: { horns: 'bull', fins: 'tentacles', extras: ['brows'] },
      palette: { accent: '#a82a3a', horn: '#c8303a' } } },

  // Puppet: wooden doll on two glowing strings, painted cheeks, nutcracker grin.
  { id: 'puppick', name: 'Puppick', type: 'shade', rarity: 'rare', size: 'small', plan: 'biped',
    build: 'bighead',
    parts: { head: 'block', ears: 'antenna', eyes: 'round', mouth: 'grin', cheeks: 'blush', pattern: ['belly', 'stripes'] },
    palette: { main: '#c88a5a', belly: '#f0d8b8', accent: '#e8e0ff', accent2: '#c8a0ff', pattern: '#7a3a6a', cheek: '#e84a6a' },
    stats: { hp: 92, atk: 15, def: 10, spd: 82 },
    movePool: ['night_slash', 'tackle', 'shadow_bolt', 'umbral_dash', 'shadow_veil', 'dread_pulse'],
    evolved: { name: 'Marionox', size: 'medium',
      parts: { crest: 'crown', claws: 'claws', mane: 'spiky', eyes: 'glowing', cheeks: 'none' },
      palette: { main: '#a86a48', accent: '#a080e8', eye: '#c8a0ff' } } },

  // Shadow stag: long-legged, faceless deer of the night forest.
  { id: 'gloomstag', name: 'Gloomstag', type: 'shade', rarity: 'epic', size: 'medium', plan: 'quadruped',
    build: 'leggy',
    parts: { head: 'long', antlers: 'branch', eyes: 'glowing', mouth: 'none', tail: 'fluffy', pattern: ['plain', 'gradient', 'socks'] },
    palette: { main: '#3a3a5a', belly: '#6a6a90', accent: '#9adcff', accent2: '#e0f8ff', eye: '#9adcff', horn: '#d8e8ff' },
    stats: { hp: 100, atk: 15, def: 10, spd: 96 },
    movePool: ['night_slash', 'umbral_dash', 'shadow_bolt', 'moonbeam', 'curse_pit', 'dread_pulse'],
    evolved: { name: 'Wraithstag', size: 'large',
      parts: { antlers: 'paddle', mane: 'spiky', gem: 'forehead' },
      palette: { main: '#2a2a4a', gem: '#9adcff' } } },

  // ---- LEGENDARIES ----
  // Shade dragon: winged eclipse wyrm with ram horns and a forked tail.
  { id: 'duskwyrm', name: 'Duskwyrm', type: 'shade', rarity: 'legendary', size: 'medium', plan: 'dragon',
    parts: { head: 'long', horns: 'ram', wings: 'bat', tail: 'split', eyes: 'glowing', mouth: 'fangs', pattern: ['belly', 'tipped'] },
    palette: { main: '#3a2a6a', belly: '#9a8ad0', accent: '#c05aff', accent2: '#f0c8ff', eye: '#ffc030', horn: '#ffd890' },
    stats: { hp: 124, atk: 17, def: 12, spd: 88 },
    movePool: ['night_slash', 'shadow_bolt', 'umbral_dash', 'sky_dive', 'dread_pulse', 'cyclone'],
    evolved: { name: 'Eclipsidon', size: 'huge',
      parts: { mane: 'spiky', crest: 'crown', spikes: 'back', wings: 'bat' },
      palette: { main: '#2a1a5a', accent: '#e040ff', horn: '#ffc860' } } },

  // Stone dragon: wingless, heavy-jawed bedrock beast with a club tail.
  { id: 'cragmaw', name: 'Cragmaw', type: 'stone', rarity: 'legendary', size: 'medium', plan: 'dragon',
    build: 'chubby',
    parts: { head: 'wide', wings: 'none', horns: 'bull', spikes: 'back', tail: 'club', claws: 'claws', gem: 'chest', eyes: 'fierce', mouth: 'tusks' },
    palette: { main: '#7a7488', belly: '#cfc6bc', accent: '#46404e', accent2: '#ff9a40', gem: '#ff6a20', horn: '#f0e4c8' },
    stats: { hp: 136, atk: 16, def: 15, spd: 60 },
    movePool: ['rock_throw', 'boulder_roll', 'shard_spray', 'stone_skin', 'quake', 'spike_trap'],
    evolved: { name: 'Titanmaw', size: 'huge',
      parts: { spikes: 'crystals', mane: 'spiky', eyes: 'glowing', extras: ['brows'] },
      palette: { main: '#5e586c', accent2: '#ff8a30', eye: '#ffb050' } } },
];
