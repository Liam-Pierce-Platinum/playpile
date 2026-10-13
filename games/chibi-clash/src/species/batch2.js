// Species batch 2: water, ice and sky creatures. Each entry is ONE species object; see SPECIES_GUIDE.md.
// Check with: node tools/check.mjs batch2   See them with: node tools/gallery.mjs batch2
export default [
  // round spiny pufferfish
  { id: 'bristlefin', name: 'Bristlefin', type: 'splash', rarity: 'common', size: 'small', plan: 'floater',
    build: { w: 1.1, h: 1.15, head: 1, legs: 1 },
    parts: { fins: 'none', spikes: 'quills', tail: 'fin', eyes: 'round', mouth: 'grin', cheeks: 'none', pattern: ['belly', 'stripes'] },
    palette: { main: '#ff9a4a', belly: '#fff0d8', accent: '#3a8ad8', accent2: '#a8d8ff', eye: '#1a2a4a', pattern: '#e06a2a' },
    stats: { hp: 96, atk: 14, def: 8, spd: 80 },
    movePool: ['bubble', 'bonk', 'aqua_jet', 'whirlpool', 'tidal_wave', 'geyser'],
    evolved: { name: 'Urchinmaw', size: 'medium',
      parts: { fins: 'dorsal', mouth: 'fangs', eyes: 'fierce', extras: ['brows', 'scar'] },
      palette: { main: '#e8702a', pattern: '#b84a1a' } } },

  // squat pond frog
  { id: 'puddlet', name: 'Puddlet', type: 'splash', rarity: 'common', size: 'small', plan: 'biped',
    build: { w: 1.3, h: 0.85, head: 1.1, legs: 0.6 },
    parts: { head: 'frog', eyes: 'round', mouth: 'tongue', cheeks: 'blush', pattern: ['belly', 'spots'] },
    palette: { main: '#5ac87a', belly: '#f0f8c8', accent: '#2a7ad8', spot: '#2a8a4a', eye: '#1a2a1a' },
    stats: { hp: 104, atk: 11, def: 10, spd: 72 },
    movePool: ['bubble', 'vine_whip', 'aqua_jet', 'rain_mend', 'geyser', 'spore_cloud'],
    evolved: { name: 'Bogbaron', size: 'medium', build: 'chubby',
      parts: { crest: 'crown', leaves: 'leaves', eyes: 'sleepy', extras: ['brows'] },
      palette: { main: '#3aa85a', spot: '#1a6a3a' } } },

  // long slinky river otter
  { id: 'slipwhisk', name: 'Slipwhisk', type: 'splash', rarity: 'rare', size: 'small', plan: 'quadruped',
    build: { w: 1.0, h: 0.85, head: 1.05, legs: 0.7 },
    parts: { head: 'muzzle', ears: 'round', crest: 'curl', tail: 'long', eyes: 'sparkle', mouth: 'cat', extras: ['nose'], pattern: ['belly', 'tipped'] },
    palette: { main: '#a8703a', belly: '#f4e0c0', accent: '#4ab8e8', accent2: '#c8f0ff', eye: '#2a4a6a', pattern: '#6a4020' },
    stats: { hp: 92, atk: 13, def: 9, spd: 92 },
    movePool: ['bubble', 'bonk', 'aqua_jet', 'whirlpool', 'snack', 'tidal_wave'],
    evolved: { name: 'Rapidrift', size: 'medium',
      parts: { fins: 'dorsal', claws: 'claws', eyes: 'fierce', extras: ['nose', 'brows'] },
      palette: { main: '#8a5a2a' } } },

  // tiny drifting jellyfish
  { id: 'driftbell', name: 'Driftbell', type: 'splash', rarity: 'common', size: 'tiny', plan: 'floater',
    build: { w: 0.95, h: 1.2, head: 1, legs: 1 },
    parts: { fins: 'tentacles', crest: 'curl', tail: 'none', eyes: 'happy', mouth: 'smile', cheeks: 'blush', pattern: ['plain', 'gradient'] },
    palette: { main: '#c8a0f0', belly: '#f4e8ff', accent: '#ff8ad0', accent2: '#ffd0f0', eye: '#4a2a7a' },
    stats: { hp: 80, atk: 11, def: 9, spd: 96 },
    movePool: ['bubble', 'pixie_dust', 'geyser', 'rain_mend', 'charm_wave', 'whirlpool'],
    evolved: { name: 'Moonbell', size: 'small',
      parts: { crest: 'crown', gem: 'forehead', eyes: 'sparkle', pattern: ['plain', 'gradient', 'spots'] },
      palette: { main: '#a880e8', spot: '#f4e8ff' } } },

  // waddling penguin
  { id: 'waddlet', name: 'Waddlet', type: 'frost', rarity: 'common', size: 'small', plan: 'biped',
    build: 'stocky',
    parts: { head: 'beaked', eyes: 'dot', mouth: 'beak', cheeks: 'blush', wings: 'tiny', pattern: ['belly', 'socks'] },
    palette: { main: '#3a4a6a', belly: '#f4f8ff', accent: '#ffb030', accent2: '#ffe08a', eye: '#1a1a2a', wing: '#2a3a5a', beak: '#ffb030' },
    stats: { hp: 100, atk: 11, def: 11, spd: 70 },
    movePool: ['frost_shard', 'bonk', 'ice_slide', 'snack', 'hailstorm', 'blizzard'],
    evolved: { name: 'Floebeak', size: 'medium',
      parts: { crest: 'tuft', spikes: 'crystals', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#2a3a5a', accent2: '#bff0ff' } } },

  // big-eyed night owl
  { id: 'mooncowl', name: 'Mooncowl', type: 'gale', rarity: 'rare', size: 'small', plan: 'flyer',
    build: 'chubby',
    parts: { head: 'wide', ears: 'tuft', eyes: 'sparkle', mouth: 'beak', wings: 'feather', tail: 'fan', pattern: ['belly', 'spots'] },
    palette: { main: '#b8885a', belly: '#f8ecd8', accent: '#ffd84a', accent2: '#fff2b0', eye: '#ffb000', spot: '#f8ecd8', beak: '#ffd84a', wing: '#8a5a3a' },
    stats: { hp: 88, atk: 12, def: 10, spd: 90 },
    movePool: ['gust', 'night_slash', 'air_slash', 'shadow_veil', 'feather_storm', 'cyclone'],
    evolved: { name: 'Starcowl', size: 'medium',
      parts: { eyes: 'glowing', gem: 'forehead', crest: 'mohawk', extras: ['brows'] },
      palette: { main: '#8a5a3a', wing: '#5a3622' } } },

  // ice whale with a spout
  { id: 'bergspout', name: 'Bergspout', type: 'frost', rarity: 'epic', size: 'medium', plan: 'floater',
    build: { w: 1.5, h: 0.95, head: 1, legs: 1 },
    parts: { fins: 'both', tail: 'fin', crest: 'spout', spikes: 'studs', eyes: 'dot', mouth: 'smile', cheeks: 'blush', pattern: ['belly'] },
    palette: { main: '#7ab0e0', belly: '#f0f8ff', accent: '#3a6aa8', accent2: '#d8f4ff', eye: '#1a2a4a' },
    stats: { hp: 136, atk: 12, def: 13, spd: 56 },
    movePool: ['frost_shard', 'bubble', 'ice_slide', 'glacier_wall', 'tidal_wave', 'avalanche'],
    evolved: { name: 'Bergmonarch', size: 'large',
      parts: { horns: 'single', spikes: 'crystals', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#5a90c8', horn: '#e8faff' } } },

  // puffy little cloud
  { id: 'cumulet', name: 'Cumulet', type: 'gale', rarity: 'common', size: 'tiny', plan: 'blob',
    build: { w: 1.3, h: 0.95, head: 1, legs: 1 },
    parts: { crest: 'puffs', wings: 'tiny', eyes: 'happy', mouth: 'smile', cheeks: 'blush', pattern: ['plain'] },
    palette: { main: '#eef4fc', belly: '#ffffff', accent: '#6aa8e8', accent2: '#ffffff', eye: '#4a6a9a' },
    stats: { hp: 90, atk: 9, def: 11, spd: 92 },
    movePool: ['gust', 'bonk', 'tailwind', 'cyclone', 'snack', 'feather_storm'],
    evolved: { name: 'Cumulord', size: 'small',
      parts: { tail: 'bolt', horns: 'stubs', eyes: 'fierce', mouth: 'grin', extras: ['brows'] },
      palette: { main: '#8a9ad0', wing: '#8a9ad0', accent: '#ffd23a', accent2: '#fff2a0', horn: '#ffd23a' } } },

  // armoured shore crab
  { id: 'snipsnap', name: 'Snipsnap', type: 'splash', rarity: 'common', size: 'small', plan: 'golem',
    build: { w: 1.4, h: 0.75, head: 1, legs: 0.6 },
    parts: { head: 'wide', ears: 'antenna', claws: 'pincers', eyes: 'round', mouth: 'grin', pattern: ['belly'] },
    palette: { main: '#e85a4a', belly: '#ffe0c8', accent: '#ffb0a0', accent2: '#fff0e8', eye: '#1a1a1a' },
    stats: { hp: 92, atk: 13, def: 14, spd: 60 },
    movePool: ['bubble', 'rock_throw', 'aqua_jet', 'stone_skin', 'whirlpool', 'geyser'],
    evolved: { name: 'Siegeclaw', size: 'medium',
      parts: { spikes: 'back', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#c83a3a' } } },

  // ice eel with a frozen sail
  { id: 'rimecoil', name: 'Rimecoil', type: 'frost', rarity: 'epic', size: 'small', plan: 'serpent',
    parts: { head: 'round', fins: 'sail', tail: 'fin', eyes: 'sleepy', mouth: 'fangs', pattern: ['belly', 'rings'] },
    palette: { main: '#5ad0d8', belly: '#e8ffff', accent: '#e8f8ff', accent2: '#ffffff', eye: '#1a4a6a', pattern: '#2a98a8' },
    stats: { hp: 96, atk: 15, def: 11, spd: 84 },
    movePool: ['frost_shard', 'bonk', 'ice_slide', 'blizzard', 'hailstorm', 'avalanche'],
    evolved: { name: 'Glazeviper', size: 'large',
      parts: { horns: 'crystal', eyes: 'glowing', mouth: 'grin', extras: ['brows'] },
      palette: { main: '#3ab0c8', eye: '#c8ffff' } } },

  // little iceberg golem
  { id: 'bergling', name: 'Bergling', type: 'frost', rarity: 'rare', size: 'small', plan: 'golem',
    build: 'tall',
    parts: { head: 'wide', horns: 'crystal', spikes: 'crystals', claws: 'mitts', eyes: 'glowing', mouth: 'none' },
    palette: { main: '#a8d8f0', belly: '#e8f8ff', accent: '#4a88c8', accent2: '#e0f8ff', eye: '#2a6ad8', horn: '#d8f8ff' },
    stats: { hp: 110, atk: 13, def: 15, spd: 50 },
    movePool: ['frost_shard', 'rock_throw', 'ice_slide', 'glacier_wall', 'quake', 'avalanche'],
    evolved: { name: 'Glacitan', size: 'large',
      build: 'chubby',
      parts: { mane: 'spiky', horns: 'ram', eyes: 'fierce', mouth: 'tusks', extras: ['brows'] },
      palette: { main: '#80b8e0' } } },

  // gliding sky manta
  { id: 'glidray', name: 'Glidray', type: 'gale', rarity: 'rare', size: 'small', plan: 'flyer',
    build: { w: 1.3, h: 0.8, head: 1, legs: 0.6 },
    parts: { head: 'wide', wings: 'bat', tail: 'long', eyes: 'sleepy', mouth: 'smile', cheeks: 'none', pattern: ['belly', 'spots'] },
    palette: { main: '#4a7ac8', belly: '#f0f4ff', accent: '#1a3a88', accent2: '#c8e8ff', eye: '#1a2a4a', spot: '#e0ecff', wing: '#3a62b0' },
    stats: { hp: 84, atk: 13, def: 9, spd: 100 },
    movePool: ['gust', 'bubble', 'sky_dive', 'tailwind', 'cyclone', 'tidal_wave'],
    evolved: { name: 'Stratoray', size: 'medium',
      parts: { horns: 'twin', tail: 'split', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#2a5aa8', wing: '#1a4a98' } } },
];
