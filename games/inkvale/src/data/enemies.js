// Enemies. Everything here was once an ordinary creature of the Vale until the
// Black Inkwell spilled on it.
//
// hp, speed (map px/s), armor & mr (0..1 fraction of that damage type removed),
// gold on kill, lives taken on leak, melee [min,max] and rate (s).
// flags: fly (ignores soldiers, artillery can't hit), ranged {range,dmg,rate},
// heal {amount, radius, every}, split {into, n}, spawn {kind, n, every},
// silence {every, dur}, boss.

export const ENEMIES = {
  inkling: {
    name: 'Inkling', hp: 30, speed: 38, armor: 0, mr: 0, gold: 5, lives: 1, dmg: [1, 4], rate: 1,
    size: 1, col: '#3b3550', accent: '#7b6fa8',
    lore: 'A goblin-sized drip of living ink. Alone it is a nuisance. They are never alone.',
  },
  scuttler: {
    name: 'Scuttler', hp: 18, speed: 72, armor: 0, mr: 0, gold: 3, lives: 1, dmg: [1, 3], rate: 0.8,
    size: 0.75, col: '#4a3b3b', accent: '#b0533d',
    lore: 'Beetles that drank from the spill. Fast, flimsy, and many.',
  },
  brute: {
    name: 'Blot Brute', hp: 120, speed: 30, armor: 0.3, mr: 0, gold: 18, lives: 1, dmg: [8, 14], rate: 1.2,
    size: 1.35, col: '#4c5a3a', accent: '#93a35a',
    lore: 'An orc soaked to the bone. Ink hardens on its hide like lacquer.',
  },
  quill: {
    name: 'Quillshot', hp: 50, speed: 36, armor: 0, mr: 0, gold: 13, lives: 1, dmg: [2, 5], rate: 1,
    ranged: { range: 115, dmg: [6, 10], rate: 1.6 },
    size: 1, col: '#5a3d4f', accent: '#d4a04a',
    lore: 'Goblin archers who fire sharpened pen nibs. They stop to shoot your soldiers.',
  },
  crow: {
    name: 'Rag Crow', hp: 40, speed: 52, armor: 0, mr: 0, gold: 10, lives: 1, fly: true,
    size: 1, col: '#2f2a35', accent: '#6a5f7a',
    lore: 'Crows stitched from wet rags. They fly over soldiers and mortar fire alike.',
  },
  ironsmudge: {
    name: 'Iron Smudge', hp: 260, speed: 24, armor: 0.75, mr: 0, gold: 32, lives: 1, dmg: [14, 22], rate: 1.3,
    size: 1.3, col: '#55606b', accent: '#9aa7b3',
    lore: 'A suit of plate armour with nobody inside but ink. Arrows ping off it. Use magic.',
  },
  wraith: {
    name: 'Murk Wraith', hp: 120, speed: 40, armor: 0, mr: 0.85, gold: 24, lives: 1, dmg: [10, 16], rate: 1,
    size: 1.1, col: '#4b6f7a', accent: '#9fd3d6',
    lore: 'A drowned soul in a shroud of fog. Magic passes straight through. Steel does not.',
  },
  shaman: {
    name: 'Bog Shaman', hp: 90, speed: 34, armor: 0, mr: 0.5, gold: 22, lives: 1, dmg: [3, 6], rate: 1,
    heal: { amount: 30, radius: 80, every: 4 },
    size: 1, col: '#5b6a3c', accent: '#d9c46a',
    lore: 'Hums the old marsh songs backwards. Every few seconds its friends knit back together.',
  },
  splotch: {
    name: 'Splotch', hp: 180, speed: 30, armor: 0, mr: 0, gold: 15, lives: 1, dmg: [6, 10], rate: 1,
    split: { into: 'inkling', n: 3 },
    size: 1.4, col: '#3a3150', accent: '#8d7cc4',
    lore: 'A great quivering puddle. Pop it and three Inklings crawl out.',
  },
  hound: {
    name: 'Stain Hound', hp: 80, speed: 76, armor: 0.1, mr: 0, gold: 15, lives: 1, dmg: [6, 10], rate: 0.8,
    size: 1.15, col: '#5c4433', accent: '#c47a45',
    lore: 'Hunting dogs gone feral and black-tongued. They run past slow towers.',
  },
  moth: {
    name: 'Ink Moth', hp: 14, speed: 66, armor: 0, mr: 0, gold: 2, lives: 1, fly: true,
    size: 0.7, col: '#4a4060', accent: '#c9b7e8',
    lore: 'They come in clouds. Each one dies to a sneeze, but there are always more.',
  },
  golem: {
    name: 'Inkstone Golem', hp: 900, speed: 18, armor: 0.35, mr: 0, gold: 110, lives: 3, dmg: [40, 60], rate: 1.8,
    size: 2.0, col: '#4a4552', accent: '#8f86a3',
    lore: 'A hillside that stood up. It costs three lives if it reaches the gate.',
  },
  brood: {
    name: 'Brood Mother', hp: 360, speed: 26, armor: 0.15, mr: 0, gold: 55, lives: 2, dmg: [12, 20], rate: 1.2,
    spawn: { kind: 'scuttler', n: 2, every: 5 },
    size: 1.7, col: '#4a3536', accent: '#c0604a',
    lore: 'A beetle the size of a cart. Lays Scuttlers as she walks.',
  },
  hknight: {
    name: 'Hollow Knight', hp: 600, speed: 26, armor: 0.6, mr: 0.3, gold: 80, lives: 2, dmg: [30, 50], rate: 1.2,
    size: 1.5, col: '#2c2a38', accent: '#c8423b',
    lore: "The Hollow King's household guard. Black plate, red plume, no face.",
  },
  gargoyle: {
    name: 'Blot Gargoyle', hp: 220, speed: 40, armor: 0.5, mr: 0, gold: 40, lives: 1, fly: true,
    size: 1.3, col: '#5a5560', accent: '#a39aad',
    lore: 'Stone that learned to fly. Armoured, so arrows struggle.',
  },
  shade: {
    name: 'Shade Scribe', hp: 190, speed: 36, armor: 0, mr: 0.6, gold: 40, lives: 1, dmg: [8, 14], rate: 1,
    silence: { every: 8, dur: 3, range: 140 },
    size: 1.1, col: '#33284a', accent: '#e05a8a',
    lore: 'Writes your towers out of the story for a few seconds at a time.',
  },

  // ---------------- BOSSES ----------------
  troll: {
    name: 'The Gutter Troll', hp: 3600, speed: 16, armor: 0.25, mr: 0, gold: 300, lives: 20, dmg: [60, 100], rate: 2,
    boss: true, regen: 12, stomp: { every: 7, radius: 90, dmg: 50, stun: 2 },
    size: 2.8, col: '#4f6440', accent: '#a3b86a',
    lore: 'Lived under Gutter Bridge for three hundred years, eating boots. The ink made it ambitious.',
  },
  matron: {
    name: 'The Moth Matron', hp: 6500, speed: 18, armor: 0.1, mr: 0.4, gold: 400, lives: 20, dmg: [50, 80], rate: 1.8,
    boss: true, summon: { kind: 'moth', n: 6, every: 8 }, douse: { every: 12, n: 2, dur: 5 },
    size: 2.7, col: '#4c3f68', accent: '#e3c9ff',
    lore: 'Queen of every moth in the Marches. Her wings put out lights - including your towers.',
  },
  hollowking: {
    name: 'The Hollow King', hp: 12500, speed: 14, armor: 0.45, mr: 0.45, gold: 0, lives: 20, dmg: [90, 140], rate: 1.6,
    boss: true, summon: { kind: 'hknight', n: 1, every: 16 }, douse: { every: 16, n: 3, dur: 6 },
    blink: { every: 24, dist: 120 }, phases: true,
    size: 3.0, col: '#1e1a28', accent: '#d8b24a',
    lore: 'Once Lord Mortimer Gall, keeper of the royal inks. He broke the Black Inkwell to repaint the world in his own hand.',
  },
};

// order the encyclopaedia shows them in
export const ENEMY_ORDER = Object.keys(ENEMIES);
