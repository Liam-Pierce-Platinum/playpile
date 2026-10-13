// CHIBI CLASH game data: types, moves, zones, gacha rates. Species live in src/species/.
// All names and creatures are original.
import { ALL_SPECIES } from './species/index.js';

export const TYPES = {
  ember:  { name: 'EMBER',  col: '#ff7a2e', dark: '#b8381c', light: '#ffd36b' },
  leaf:   { name: 'LEAF',   col: '#5fcf4a', dark: '#2a8a3a', light: '#c4f27a' },
  splash: { name: 'SPLASH', col: '#3fa2ff', dark: '#2357c4', light: '#a8e4ff' },
  spark:  { name: 'SPARK',  col: '#ffd93a', dark: '#c48a12', light: '#fff6b0' },
  stone:  { name: 'STONE',  col: '#b0906a', dark: '#6e5640', light: '#e2cfa8' },
  frost:  { name: 'FROST',  col: '#8ee8f0', dark: '#3a98b8', light: '#e8fcff' },
  shade:  { name: 'SHADE',  col: '#8a64c0', dark: '#3a2a5a', light: '#d0b4f4' },
  gale:   { name: 'GALE',   col: '#b4e4cc', dark: '#4e9a84', light: '#f0fff8' },
  bug:    { name: 'BUG',    col: '#aacc3a', dark: '#5a7a1a', light: '#e4f48a' },
  fae:    { name: 'FAE',    col: '#ff9ad8', dark: '#c04a98', light: '#ffe0f4' },
  normal: { name: 'NORMAL', col: '#d8d0e8', dark: '#8a82a0', light: '#ffffff' },
};
// Types a species may have (normal is a move type only).
export const SPECIES_TYPES = ['ember', 'leaf', 'splash', 'spark', 'stone', 'frost', 'shade', 'gale', 'bug', 'fae'];

// Who beats whom (x1.5). The reverse direction is resisted (x0.66).
// Ember > Leaf > Splash > Ember is the core triangle; the rest hook in. No pair is mutual.
export const STRONG = {
  ember: ['leaf', 'frost', 'bug'],
  leaf: ['splash', 'stone'],
  splash: ['ember', 'stone'],
  spark: ['splash', 'gale'],
  stone: ['spark', 'ember', 'frost'],
  frost: ['leaf', 'gale'],
  gale: ['bug', 'fae'],
  bug: ['leaf', 'shade', 'fae'],
  shade: ['spark', 'gale'],
  fae: ['shade', 'stone'],
  normal: [],
};
export function typeMult(atk, def) {
  if (STRONG[atk] && STRONG[atk].includes(def)) return 1.5;
  if (STRONG[def] && STRONG[def].includes(atk)) return 0.66;
  return 1;
}

// kind: melee | proj | dash | nova | zone | heal | buff
// power is roughly "damage when atk == def". cd in seconds.
export const MOVES = {
  bonk:        { name: 'Bonk',         type: 'normal', kind: 'melee', power: 11, cd: 0.45, range: 24, arc: 1.4, desc: 'Quick swat in front.' },
  tackle:      { name: 'Tackle',       type: 'normal', kind: 'dash', power: 16, cd: 2.6, dist: 70, desc: 'Lunge forward and ram.' },
  snack:       { name: 'Snack Time',   type: 'normal', kind: 'heal', heal: 0.25, cd: 13, desc: 'Munch a berry: heal 25%.' },

  ember_spit:  { name: 'Ember Spit',   type: 'ember', kind: 'proj', power: 9, cd: 0.55, speed: 210, size: 3, burn: 0.25, desc: 'Fast spark of fire. May burn.' },
  flame_dash:  { name: 'Flame Dash',   type: 'ember', kind: 'dash', power: 18, cd: 3, dist: 80, burn: 0.6, trail: true, desc: 'Burning charge, leaves fire.' },
  fire_ring:   { name: 'Fire Ring',    type: 'ember', kind: 'nova', power: 20, cd: 5, radius: 42, burn: 0.7, desc: 'Ring of flame around you.' },
  fireball:    { name: 'Fireball',     type: 'ember', kind: 'proj', power: 24, cd: 3.4, speed: 150, size: 6, explode: 26, burn: 0.5, desc: 'Big slow ball that explodes.' },
  meteor:      { name: 'Meteor',       type: 'ember', kind: 'zone', power: 40, cd: 7, radius: 30, delay: 0.8, burn: 1, desc: 'Call a meteor on the target.' },
  heat_up:     { name: 'Heat Up',      type: 'ember', kind: 'buff', buff: 'atk', amt: 0.35, dur: 6, cd: 12, desc: '+35% attack for 6s.' },

  leaf_dart:   { name: 'Leaf Darts',   type: 'leaf', kind: 'proj', power: 7, cd: 0.9, speed: 230, size: 3, count: 3, spread: 0.28, desc: 'Three spinning leaves.' },
  vine_whip:   { name: 'Vine Whip',    type: 'leaf', kind: 'melee', power: 14, cd: 0.8, range: 40, arc: 0.9, slow: 0.4, desc: 'Long lash. Slows.' },
  spore_cloud: { name: 'Spore Cloud',  type: 'leaf', kind: 'zone', power: 7, cd: 6, radius: 34, delay: 0.2, ticks: 5, slow: 0.5, desc: 'Lingering cloud: hurts and slows.' },
  thorn_burst: { name: 'Thorn Burst',  type: 'leaf', kind: 'nova', power: 18, cd: 4.5, radius: 38, desc: 'Thorns burst out of you.' },
  photo_heal:  { name: 'Sunsoak',      type: 'leaf', kind: 'heal', heal: 0.3, cd: 12, desc: 'Soak up sun: heal 30%.' },
  razor_storm: { name: 'Razor Storm',  type: 'leaf', kind: 'proj', power: 8, cd: 6, speed: 190, size: 3, count: 12, spread: 6.283, desc: 'Leaves fly in every direction.' },

  bubble:      { name: 'Bubble',       type: 'splash', kind: 'proj', power: 10, cd: 0.7, speed: 160, size: 4, slow: 0.35, desc: 'Wobbly bubble. Slows.' },
  aqua_jet:    { name: 'Aqua Jet',     type: 'splash', kind: 'dash', power: 15, cd: 2.2, dist: 90, desc: 'Rocket forward on water.' },
  tidal_wave:  { name: 'Tidal Wave',   type: 'splash', kind: 'proj', power: 22, cd: 5, speed: 170, size: 9, pierce: true, knock: 160, desc: 'Wide wave that pushes through.' },
  geyser:      { name: 'Geyser',       type: 'splash', kind: 'zone', power: 30, cd: 6, radius: 24, delay: 0.6, stun: 0.6, desc: 'Water erupts under the target.' },
  rain_mend:   { name: 'Rain Mend',    type: 'splash', kind: 'heal', heal: 0.25, cd: 11, desc: 'Cool rain: heal 25%.' },
  whirlpool:   { name: 'Whirlpool',    type: 'splash', kind: 'nova', power: 16, cd: 5, radius: 48, pull: true, desc: 'Drags foes in close.' },

  zap:         { name: 'Zap',          type: 'spark', kind: 'proj', power: 8, cd: 0.4, speed: 300, size: 2, desc: 'Very fast little bolt.' },
  bolt_dash:   { name: 'Bolt Dash',    type: 'spark', kind: 'dash', power: 17, cd: 3, dist: 110, stun: 0.3, desc: 'Lightning-fast dash. Stuns.' },
  thunder:     { name: 'Thunder',      type: 'spark', kind: 'zone', power: 36, cd: 6, radius: 26, delay: 0.6, stun: 0.5, desc: 'Lightning strikes the target.' },
  static_field:{ name: 'Static Field', type: 'spark', kind: 'nova', power: 14, cd: 5, radius: 40, stun: 0.6, desc: 'Shock everything nearby.' },
  chain_spark: { name: 'Chain Spark',  type: 'spark', kind: 'proj', power: 9, cd: 1.6, speed: 280, size: 2, count: 3, spread: 0.2, desc: 'Three crackling bolts.' },
  overcharge:  { name: 'Overcharge',   type: 'spark', kind: 'buff', buff: 'spd', amt: 0.5, dur: 5, cd: 12, desc: '+50% speed, faster cooldowns.' },

  rock_throw:  { name: 'Rock Throw',   type: 'stone', kind: 'proj', power: 15, cd: 1.0, speed: 170, size: 4, knock: 90, desc: 'Heavy rock. Knocks back.' },
  quake:       { name: 'Quake',        type: 'stone', kind: 'nova', power: 24, cd: 6, radius: 50, slow: 0.5, desc: 'Shake the ground. Slows.' },
  boulder_roll:{ name: 'Boulder Roll', type: 'stone', kind: 'dash', power: 22, cd: 3.5, dist: 80, knock: 200, desc: 'Roll and flatten.' },
  stone_skin:  { name: 'Stone Skin',   type: 'stone', kind: 'buff', buff: 'shield', amt: 0.35, dur: 6, cd: 11, desc: 'Shield worth 35% HP.' },
  spike_trap:  { name: 'Spike Trap',   type: 'stone', kind: 'zone', power: 26, cd: 5, radius: 22, delay: 0.5, desc: 'Spikes jut from the ground.' },
  shard_spray: { name: 'Shard Spray',  type: 'stone', kind: 'proj', power: 6, cd: 1.4, speed: 220, size: 2, count: 5, spread: 0.6, desc: 'Cone of sharp pebbles.' },

  frost_shard: { name: 'Frost Shard',  type: 'frost', kind: 'proj', power: 9, cd: 0.6, speed: 220, size: 3, slow: 0.3, desc: 'Icy dart. Slows.' },
  ice_slide:   { name: 'Ice Slide',    type: 'frost', kind: 'dash', power: 16, cd: 2.6, dist: 90, slow: 0.4, desc: 'Skate forward on ice. Slows.' },
  blizzard:    { name: 'Blizzard',     type: 'frost', kind: 'nova', power: 18, cd: 5.5, radius: 46, slow: 0.6, desc: 'Freezing storm around you.' },
  hailstorm:   { name: 'Hailstorm',    type: 'frost', kind: 'zone', power: 8, cd: 6, radius: 34, delay: 0.3, ticks: 5, slow: 0.4, desc: 'Hail pounds an area.' },
  glacier_wall:{ name: 'Glacier Wall', type: 'frost', kind: 'buff', buff: 'shield', amt: 0.3, dur: 6, cd: 11, desc: 'Ice shield worth 30% HP.' },
  avalanche:   { name: 'Avalanche',    type: 'frost', kind: 'zone', power: 34, cd: 7, radius: 30, delay: 0.8, stun: 0.4, desc: 'Snow crashes on the target.' },

  shadow_bolt: { name: 'Shadow Bolt',  type: 'shade', kind: 'proj', power: 9, cd: 0.5, speed: 250, size: 3, desc: 'Fast bolt of darkness.' },
  night_slash: { name: 'Night Slash',  type: 'shade', kind: 'melee', power: 15, cd: 0.8, range: 30, arc: 1.2, desc: 'Sharp slash from the dark.' },
  umbral_dash: { name: 'Umbral Dash',  type: 'shade', kind: 'dash', power: 18, cd: 3, dist: 100, desc: 'Blink forward through shadow.' },
  dread_pulse: { name: 'Dread Pulse',  type: 'shade', kind: 'nova', power: 15, cd: 5, radius: 42, stun: 0.4, desc: 'Fear burst. Stuns.' },
  curse_pit:   { name: 'Curse Pit',    type: 'shade', kind: 'zone', power: 7, cd: 6, radius: 32, delay: 0.2, ticks: 6, desc: 'A pool of curses that lingers.' },
  shadow_veil: { name: 'Shadow Veil',  type: 'shade', kind: 'buff', buff: 'spd', amt: 0.45, dur: 5, cd: 12, desc: '+45% speed, faster cooldowns.' },

  gust:        { name: 'Gust',         type: 'gale', kind: 'proj', power: 10, cd: 0.7, speed: 240, size: 4, knock: 140, desc: 'Puff of wind. Pushes back.' },
  air_slash:   { name: 'Air Slash',    type: 'gale', kind: 'melee', power: 13, cd: 0.6, range: 32, arc: 1.8, desc: 'Wide cutting wind.' },
  sky_dive:    { name: 'Sky Dive',     type: 'gale', kind: 'dash', power: 20, cd: 3.2, dist: 120, desc: 'Long diving strike.' },
  cyclone:     { name: 'Cyclone',      type: 'gale', kind: 'nova', power: 15, cd: 5, radius: 50, pull: true, desc: 'Whirlwind that drags foes in.' },
  feather_storm:{ name: 'Feather Storm', type: 'gale', kind: 'proj', power: 7, cd: 5.5, speed: 200, size: 2, count: 10, spread: 6.283, desc: 'Feathers fly every way.' },
  tailwind:    { name: 'Tailwind',     type: 'gale', kind: 'buff', buff: 'spd', amt: 0.5, dur: 5, cd: 12, desc: '+50% speed, faster cooldowns.' },

  stinger_shot:{ name: 'Stinger Shot', type: 'bug', kind: 'proj', power: 9, cd: 0.5, speed: 260, size: 2, desc: 'Quick stinger dart.' },
  swarm:       { name: 'Swarm',        type: 'bug', kind: 'proj', power: 5, cd: 1.2, speed: 200, size: 2, count: 4, spread: 0.5, desc: 'A buzzing spread of bugs.' },
  silk_snare:  { name: 'Silk Snare',   type: 'bug', kind: 'proj', power: 6, cd: 2.5, speed: 180, size: 5, slow: 0.7, desc: 'Sticky web. Big slow.' },
  pincer_snap: { name: 'Pincer Snap',  type: 'bug', kind: 'melee', power: 15, cd: 0.7, range: 26, arc: 1.1, desc: 'Crushing snap up close.' },
  hive_burst:  { name: 'Hive Burst',   type: 'bug', kind: 'nova', power: 17, cd: 4.5, radius: 38, desc: 'Bugs burst out all around.' },
  molt:        { name: 'Molt',         type: 'bug', kind: 'heal', heal: 0.3, cd: 12, desc: 'Shed old skin: heal 30%.' },

  pixie_dust:  { name: 'Pixie Dust',   type: 'fae', kind: 'proj', power: 7, cd: 0.6, speed: 200, size: 3, count: 2, spread: 0.15, desc: 'Two twinkling motes.' },
  moonbeam:    { name: 'Moonbeam',     type: 'fae', kind: 'zone', power: 32, cd: 6, radius: 24, delay: 0.6, stun: 0.4, desc: 'Moonlight strikes the target.' },
  charm_wave:  { name: 'Charm Wave',   type: 'fae', kind: 'nova', power: 14, cd: 5, radius: 44, slow: 0.5, desc: 'Dizzying wave. Slows.' },
  sparkle_dash:{ name: 'Sparkle Dash', type: 'fae', kind: 'dash', power: 16, cd: 2.6, dist: 90, stun: 0.2, desc: 'Glittering dash. Dazes.' },
  wish:        { name: 'Wish',         type: 'fae', kind: 'heal', heal: 0.3, cd: 12, desc: 'Make a wish: heal 30%.' },
  fae_ward:    { name: 'Fae Ward',     type: 'fae', kind: 'buff', buff: 'shield', amt: 0.3, dur: 6, cd: 11, desc: 'Magic shield worth 30% HP.' },
};

export const RARITY = {
  common:    { name: 'COMMON',    rate: 0.60, col: '#c8d0e0', mult: 1.0,  dupXp: 40,  dupCoins: 10 },
  rare:      { name: 'RARE',      rate: 0.28, col: '#4fb4ff', mult: 1.1,  dupXp: 80,  dupCoins: 20 },
  epic:      { name: 'EPIC',      rate: 0.10, col: '#c25cff', mult: 1.22, dupXp: 150, dupCoins: 40 },
  legendary: { name: 'LEGENDARY', rate: 0.02, col: '#ffcc33', mult: 1.38, dupXp: 300, dupCoins: 100 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
export const EGG_COST = 100, EGG10_COST = 900;

// Species live in src/species/*.js (see SPECIES_GUIDE.md); index.js resolves them.
export const SPECIES = ALL_SPECIES;
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
export const STARTERS = ['pipkin', 'sproutle', 'bubbit'];

// Learning: pool index 0..2 known at hatch. 3..5 learnable.
export const LEARN = [null, null, null, { lvl: 2, cost: 40 }, { lvl: 4, cost: 70 }, { lvl: 6, cost: 110 }];
export const EVOLVE = { lvl: 5, cost: 150 };
export const MAX_LVL = 30;
export function xpForLevel(lvl) { // total xp needed to reach lvl
  let t = 0; for (let l = 1; l < lvl; l++) t += 40 + 20 * l; return t;
}
export function levelFromXp(total) {
  let l = 1; while (l < MAX_LVL && total >= xpForLevel(l + 1)) l++; return l;
}

// Zones: 3 fights then a boss. Arena palettes for the tile renderer. Each pool is themed to its zone.
// The last entry is the ENDLESS arena (unlocked by the zone 5 boss): waves forever, every species can show up.
export const ZONES = [
  { name: 'Sunny Meadow', lvl: 1, pool: ['sproutle', 'acornik', 'seedbit', 'pollenpod', 'spotsy', 'buzzlet', 'tuftlet', 'dewdrop', 'mosslug', 'pebblo'],
    boss: { sp: 'acornik', stage: 1, title: 'Old Oakwarden' },
    ground: ['#5cb04a', '#6cc058', '#4fa040'], deco: ['#ffffff', '#ffe04a', '#ff8ac0'], obst: 'tree', edge: '#3a7a34' },
  { name: 'Ashen Ridge', lvl: 5, pool: ['pipkin', 'coalnewt', 'smeltle', 'lampwick', 'sootswift', 'burrowbit', 'cobblin', 'pebblo', 'kilnoise', 'rollodillo'],
    boss: { sp: 'smoldo', stage: 1, title: 'Cinderhulk the Furnace' },
    ground: ['#6a5048', '#78584e', '#5e463e'], deco: ['#ff7a2e', '#3e2e2a', '#a08070'], obst: 'rock', edge: '#3a2a26' },
  { name: 'Tidepool Coast', lvl: 9, pool: ['bubbit', 'bristlefin', 'puddlet', 'snipsnap', 'driftbell', 'slipwhisk', 'waddlet', 'mosshell', 'dewdrop', 'frostusk'],
    boss: { sp: 'puddlefin', stage: 1, title: 'Surgeseal Tyrant' },
    ground: ['#e8d49a', '#f0dca8', '#dcc68a'], deco: ['#ffffff', '#ff9a8a', '#c0a070'], obst: 'coral', edge: '#3aa0d8' },
  { name: 'Stormcrag Peak', lvl: 13, pool: ['voltwisp', 'zaplet', 'bzzle', 'nimbram', 'cumulet', 'glidray', 'mooncowl', 'gemflit', 'bergling', 'livewire'],
    boss: { sp: 'joltbat', stage: 1, title: 'Thundrake Stormlord' },
    ground: ['#6e6a84', '#7a7690', '#625e78'], deco: ['#c8c0ff', '#ffe04a', '#4a4660'], obst: 'crystal', edge: '#3a3650' },
  { name: 'Gloomwood Hollow', lvl: 17, pool: ['purrgeist', 'gazeblot', 'waxwick', 'puppick', 'morelet', 'dandewisp', 'scythling', 'knobbeet', 'lilacat', 'masquin'],
    boss: { sp: 'duskwyrm', stage: 1, title: 'Eclipsidon, Night Tyrant' },
    ground: ['#3e4a3a', '#48563f', '#343f32'], deco: ['#b07aff', '#6affc0', '#2a2a36'], obst: 'shroom', edge: '#1e2420' },
  { name: 'Endless Arena', lvl: 20, endless: true, pool: null, // filled below with every species
    boss: { sp: 'sunmane', stage: 1, title: 'Champion' },
    ground: ['#c8a878', '#d4b484', '#b89868'], deco: ['#ffffff', '#ffcc33', '#a07850'], obst: 'pillar', edge: '#6a4a3a' },
];
export const ENDLESS = ZONES.length - 1;
ZONES[ENDLESS].pool = ALL_SPECIES.filter((s) => s.rarity === 'common' || s.rarity === 'rare').map((s) => s.id);
// Endless boss waves (every 5th wave) cycle through the big epics and the legendaries.
export const ENDLESS_BOSSES = ALL_SPECIES.filter((s) => s.rarity === 'legendary' || s.rarity === 'epic').map((s) => s.id);
export const STORY_ZONES = ENDLESS; // zones 0..4 have 3 fights + a boss

// Stat budget per rarity: score = hp/8 + atk + def + spd/8 must sit inside the range.
// (The rarity multiplier above is applied on top in battle, so do not pre-inflate.)
export const STAT_BUDGET = { common: [41, 46], rare: [43, 48], epic: [45, 50], legendary: [51, 56] };
export const STAT_LIMITS = { hp: [70, 140], atk: [8, 18], def: [6, 18], spd: [50, 100] };
export const statScore = (b) => b.hp / 8 + b.atk + b.def + b.spd / 8;
