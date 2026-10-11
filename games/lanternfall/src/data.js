// All the tuning tables: upgrades, evolutions, enemies, characters, maps,
// the Lamplighter's Shed, achievements and the reward / spawn pacing.

export const RUN_LEN = 300;          // a full night is 5:00
export const BOSS_AT = 270;          // Night Warden arrives at 4:30
export const ELITE_AT = 150;         // the Grey Stag at 2:30
export const STAG_FLEE_AT = 210;     // still alive at 3:30: it flees and a golden moth brings the chest instead
export const ACTIVE_SLOTS = 6, PASSIVE_SLOTS = 4;

export const FAMS = {
  light: { name: 'Light', col: '#e8a92e', ink: '#7a4b06' },
  flame: { name: 'Flame', col: '#e5532d', ink: '#7c1e0b' },
  ward: { name: 'Ward', col: '#3f9a7a', ink: '#14503c' },
  spirit: { name: 'Spirit', col: '#8a72d6', ink: '#3d2c80' },
};

// ---- Upgrades -------------------------------------------------------------
// kind: 'active' (6 slots, 5 levels each), 'passive' (4 slots), 'lantern' (no slot, levels the lantern itself)
// L[i] is the stat block at level i+1. desc[i] is what the card says when you are about to take level i+1.
export const UP = {
  lantern: { name: 'Brighter Lantern', fam: 'light', kind: 'lantern', max: 8,
    desc: ['Trim the wick: light radius +8%.', 'Richer oil: lantern burn +15%.', 'Light radius +8%.', 'Lantern burn +15%.', 'Light radius +8%.', 'Lantern burn +15%.', 'Light radius +8%.', 'Lantern burn +15%.'] },

  // LIGHT actives
  flicker: { name: 'Flicker Pulse', fam: 'light', kind: 'active', max: 5, evo: 'solarflare', with: 'mirror',
    L: [{ dmg: 22, cd: 3.2, reach: 1.15, n: 1 }, { dmg: 30, cd: 3.2, reach: 1.15, n: 1 }, { dmg: 30, cd: 2.6, reach: 1.5, n: 1 }, { dmg: 42, cd: 2.6, reach: 1.5, n: 1 }, { dmg: 42, cd: 2.1, reach: 1.5, n: 2 }],
    desc: ['Every few seconds your lantern throws out a ring of light that scorches and shoves back.', 'Pulse damage +8.', 'Pulses come faster and reach much further.', 'Pulse damage +12.', 'Faster, and every pulse echoes twice.'] },
  beacon: { name: 'Beacon Beam', fam: 'light', kind: 'active', max: 5, evo: 'lighthouse', with: 'oil',
    L: [{ dps: 32, len: 240, half: 0.2, rot: 1.5, n: 1 }, { dps: 44, len: 240, half: 0.2, rot: 1.5, n: 1 }, { dps: 44, len: 300, half: 0.2, rot: 2.1, n: 1 }, { dps: 56, len: 300, half: 0.27, rot: 2.1, n: 1 }, { dps: 62, len: 320, half: 0.27, rot: 2.1, n: 2 }],
    desc: ['A sweeping lighthouse beam circles you, burning and revealing everything it touches.', 'Beam burn +12/s.', 'Reaches further and sweeps faster.', 'Wider, hotter beam.', 'A second beam sweeps opposite the first.'] },
  // FLAME actives
  wisps: { name: 'Orbiting Wisps', fam: 'flame', kind: 'active', max: 5, evo: 'sunwheel', with: 'kindling',
    L: [{ n: 2, dmg: 11, r: 62, spd: 3.1 }, { n: 3, dmg: 11, r: 62, spd: 3.1 }, { n: 3, dmg: 15, r: 66, spd: 3.3 }, { n: 4, dmg: 19, r: 80, spd: 3.5 }, { n: 5, dmg: 23, r: 84, spd: 3.6 }],
    desc: ['Two little flames circle you and singe whatever they touch. They glow, too.', 'One more wisp.', 'Wisp damage +4, a little faster.', 'One more wisp, wider orbit, damage +4.', 'One more wisp, damage +4.'] },
  firefly: { name: 'Firefly Bolts', fam: 'flame', kind: 'active', max: 5, evo: 'prism', with: 'lens',
    L: [{ n: 1, dmg: 15, cd: 1.1, pierce: 0 }, { n: 2, dmg: 15, cd: 1.1, pierce: 0 }, { n: 2, dmg: 21, cd: 0.85, pierce: 0 }, { n: 3, dmg: 21, cd: 0.85, pierce: 1 }, { n: 3, dmg: 28, cd: 0.8, pierce: 2 }],
    desc: ['Fireflies dart out at the nearest enemy, even ones hiding in the dark.', 'One more firefly per volley.', 'Damage +6, volleys come faster.', 'One more firefly, and they pierce one enemy.', 'Damage +7, pierce two.'] },
  trail: { name: 'Ember Trail', fam: 'flame', kind: 'active', max: 5, evo: 'wildfire', with: 'tinder',
    L: [{ r: 17, life: 1.6, dps: 20 }, { r: 17, life: 2.1, dps: 20 }, { r: 21, life: 2.1, dps: 28 }, { r: 21, life: 2.7, dps: 28 }, { r: 26, life: 2.7, dps: 36 }],
    desc: ['You leave burning embers in your footsteps. Kite them through it.', 'Embers last longer.', 'Bigger, hotter embers.', 'Embers last longer.', 'Bigger and hotter.'] },
  // WARD actives
  runes: { name: 'Rune Circle', fam: 'ward', kind: 'active', max: 5, evo: 'sigil', with: 'echo',
    L: [{ r: 50, life: 2.5, dps: 26, cd: 3, n: 1 }, { r: 60, life: 2.5, dps: 26, cd: 2.4, n: 1 }, { r: 60, life: 2.5, dps: 38, cd: 2.4, n: 1 }, { r: 60, life: 2.5, dps: 38, cd: 2.4, n: 2 }, { r: 66, life: 3.5, dps: 50, cd: 2.4, n: 2 }],
    desc: ['Glowing runes flare up under groups of enemies, burning and slowing them.', 'Bigger circles, and they come faster.', 'Rune burn +12/s.', 'Two runes at a time.', 'Bigger, longer, hotter.'] },
  thorns: { name: 'Thorn Hedge', fam: 'ward', kind: 'active', max: 5, evo: 'briar', with: 'bark',
    L: [{ n: 6, dmg: 26, r: 92, cd: 4.5, life: 3 }, { n: 6, dmg: 36, r: 92, cd: 4.5, life: 3 }, { n: 8, dmg: 36, r: 110, cd: 3.5, life: 3 }, { n: 8, dmg: 36, r: 110, cd: 3.5, life: 4.5 }, { n: 10, dmg: 50, r: 116, cd: 3.5, life: 4.5 }],
    desc: ['A ring of thorny hedges bursts up around you. They hurt, and they hold the line.', 'Thorn damage +10.', 'More hedges in a wider ring, regrowing faster.', 'Hedges last longer.', 'More hedges, damage +14.'] },
  moths: { name: 'Shield Moths', fam: 'ward', kind: 'active', max: 5, evo: 'lunar', with: 'moonsilk',
    L: [{ n: 1, dmg: 32, re: 6 }, { n: 1, dmg: 46, re: 6 }, { n: 2, dmg: 46, re: 4.5 }, { n: 3, dmg: 46, re: 4.5 }, { n: 4, dmg: 56, re: 3.5 }],
    desc: ['A pale moth circles you and throws itself in front of one hit, stinging the attacker.', 'Moth sting +14.', 'A second moth, and they return faster.', 'A third moth.', 'A fourth moth, sting +10, faster return.'] },
  // SPIRIT active
  bell: { name: 'Spirit Bell', fam: 'spirit', kind: 'active', max: 5, evo: 'cathedral', with: 'lodestone',
    L: [{ dmg: 30, r: 150, cd: 5, stun: 1 }, { dmg: 45, r: 150, cd: 5, stun: 1 }, { dmg: 45, r: 180, cd: 4, stun: 1 }, { dmg: 45, r: 180, cd: 4, stun: 1.6 }, { dmg: 70, r: 210, cd: 4, stun: 1.6 }],
    desc: ['A ghostly bell tolls, stunning and hurting everything nearby.', 'Toll damage +15.', 'Carries further and tolls more often.', 'Stuns for longer.', 'Damage +25, carries further.'] },

  // passives (5 levels)
  wick: { name: 'Long Wick', fam: 'light', kind: 'passive', max: 5, desc: ['Light radius +10%.'] },
  oil: { name: 'Hot Oil', fam: 'light', kind: 'passive', max: 5, desc: ['Lantern burn +15%.'] },
  mirror: { name: 'Silver Mirror', fam: 'light', kind: 'passive', max: 5, desc: ['Area of every effect +8%.'] },
  kindling: { name: 'Kindling', fam: 'flame', kind: 'passive', max: 5, desc: ['All damage +8%.'] },
  lens: { name: 'Glass Lens', fam: 'flame', kind: 'passive', max: 5, desc: ['Projectile speed +10%, critical chance +6%.'] },
  tinder: { name: 'Tinderbox', fam: 'flame', kind: 'passive', max: 5, desc: ['Effects last 12% longer.'] },
  bark: { name: 'Ironbark', fam: 'ward', kind: 'passive', max: 5, desc: ['Take 1 less damage from every hit.'] },
  moonsilk: { name: 'Moonsilk Cloak', fam: 'ward', kind: 'passive', max: 5, desc: ['Max health +20.'] },
  echo: { name: 'Echo Stone', fam: 'ward', kind: 'passive', max: 5, desc: ['Cooldowns 6% shorter.'] },
  lodestone: { name: 'Lodestone', fam: 'spirit', kind: 'passive', max: 5, desc: ['Pick up embers from 25% further.'] },
  feather: { name: 'Owl Feather', fam: 'spirit', kind: 'passive', max: 5, desc: ['Move 8% faster.'] },
  heartwood: { name: 'Heartwood', fam: 'spirit', kind: 'passive', max: 5, desc: ['Regenerate 0.3 health a second.'] },
  clover: { name: 'Four-leaf Clover', fam: 'spirit', kind: 'passive', max: 5, desc: ['Luck +10%: more chests, more crits, sometimes a fourth card.'] },

  // fillers when nothing else is left
  lampoil: { name: 'Flask of Lamp Oil', fam: 'spirit', kind: 'filler', max: 99, desc: ['Restore 30% health.'] },
  purse: { name: 'Ember Purse', fam: 'light', kind: 'filler', max: 99, desc: ['+30 embers toward your Oil.'] },

  // evolutions (only from chests, when an active is maxed and its partner passive is owned)
  sunwheel: { name: 'Sunwheel', fam: 'flame', kind: 'evo', base: 'wisps', desc: ['Eight blazing wisps on two counter-turning rings, each a little sun.'] },
  prism: { name: 'Prism Beam', fam: 'flame', kind: 'evo', base: 'firefly', desc: ['A beam that splits into three colours and pierces everything in line.'] },
  wildfire: { name: 'Wildfire Path', fam: 'flame', kind: 'evo', base: 'trail', desc: ['Your footsteps burn for seconds, and the fire spreads to whatever walks through.'] },
  solarflare: { name: 'Solar Flare', fam: 'light', kind: 'evo', base: 'flicker', desc: ['Huge rings of daylight burst out every two seconds.'] },
  lighthouse: { name: 'Lighthouse', fam: 'light', kind: 'evo', base: 'beacon', desc: ['Three long beams sweep the forest without pause.'] },
  sigil: { name: 'Sigil of Dawn', fam: 'ward', kind: 'evo', base: 'runes', desc: ['A great rune circle follows you, and smaller runes keep blooming.'] },
  briar: { name: 'Briar Crown', fam: 'ward', kind: 'evo', base: 'thorns', desc: ['A permanent turning crown of thorns that never wilts.'] },
  lunar: { name: 'Lunar Swarm', fam: 'ward', kind: 'evo', base: 'moths', desc: ['Six moon moths dart out to sting, and still shield you.'] },
  cathedral: { name: 'Cathedral Bell', fam: 'spirit', kind: 'evo', base: 'bell', desc: ['A thunderous toll across the whole clearing that drags every ember to you.'] },
};
export const ACTIVES = ['flicker', 'beacon', 'wisps', 'firefly', 'trail', 'runes', 'thorns', 'moths', 'bell'];
export const PASSIVES = ['wick', 'oil', 'mirror', 'kindling', 'lens', 'tinder', 'bark', 'moonsilk', 'echo', 'lodestone', 'feather', 'heartwood', 'clover'];
export const EVOS = ACTIVES.map((a) => ({ base: a, with: UP[a].with, evo: UP[a].evo }));
// Index used for per-enemy hit cooldowns.
export const WEAPON_IDX = {}; [...ACTIVES, ...ACTIVES.map((a) => UP[a].evo), 'pilot', 'lantern'].forEach((id, i) => (WEAPON_IDX[id] = i));
export const WEAPON_N = Object.keys(WEAPON_IDX).length;

// ---- Enemies ----------------------------------------------------------------
// hp is at 0:00; it scales with time. xp is embers dropped. r is the body radius.
export const ENEMY = {
  moth: { hp: 8, spd: 72, dmg: 4, xp: 1, r: 10, rim: '#d9c8ff', eye: '#c79bff', mass: 0.6 },
  wolf: { hp: 20, spd: 84, dmg: 7, xp: 2, r: 15, rim: '#ffb347', eye: '#ffb02e', mass: 1.2 },
  tree: { hp: 120, spd: 32, dmg: 11, xp: 5, r: 24, rim: '#b9d36b', eye: '#d9ff5a', mass: 4 },
  wraith: { hp: 38, spd: 96, dmg: 8, xp: 3, r: 13, rim: '#6ff3ff', eye: '#9ffcff', mass: 0.9 },
  brood: { hp: 220, spd: 22, dmg: 12, xp: 10, r: 22, rim: '#ff7fb0', eye: '#ff9ccf', mass: 6 },
  lumen: { hp: 60, spd: 120, dmg: 0, xp: 6, r: 12, rim: '#ffe27a', eye: '#fff6c2', mass: 1 },
  stag: { hp: 1400, spd: 62, dmg: 22, xp: 40, r: 34, rim: '#ffd27a', eye: '#ff5a3a', mass: 30 },
  warden: { hp: 5200, spd: 52, dmg: 28, xp: 0, r: 46, rim: '#9a7dff', eye: '#ff3b3b', mass: 99 },
};

// ---- Characters (each has a different lantern) -----------------------------
export const CHARS = {
  lamplighter: { name: 'Wren', title: 'the Lamplighter', lantern: 'round', hp: 100, spd: 122, radius: 132, burn: 12,
    blurb: 'A steady round lantern. Everything inside the glow burns.', cloak: '#2f4a6a', trim: '#c9a25a' },
  miner: { name: 'Old Bram', title: 'the Miner', lantern: 'cone', hp: 125, spd: 112, radius: 132, burn: 12,
    blurb: 'A narrow headlamp cone that reaches twice as far and burns 40% hotter, plus a small pool of light at his feet.', cloak: '#5a4a32', trim: '#e0b040', unlock: 'dawn1' },
  monk: { name: 'Brother Ash', title: 'the Monk', lantern: 'pulse', hp: 100, spd: 120, radius: 132, burn: 13,
    blurb: 'His light breathes: it swells far past normal, then draws in close.', cloak: '#7a4a24', trim: '#e6c27a', unlock: 'evolve1' },
  child: { name: 'Pip', title: 'the Child', lantern: 'tiny', hp: 80, spd: 134, radius: 132, burn: 11,
    blurb: 'A tiny jar of light, but three firefly friends circle close and glow.', cloak: '#7a3a4a', trim: '#f0d080', unlock: 'kills3000' },
  witch: { name: 'Morrow', title: 'the Witch', lantern: 'green', hp: 92, spd: 118, radius: 132, burn: 10,
    blurb: 'Green witchfire clings: burning enemies keep burning, and it leaps to their neighbours when they fall.', cloak: '#2f3a2a', trim: '#8fe07a', unlock: 'wardenbane' },
};
export const CHAR_ORDER = ['lamplighter', 'miner', 'monk', 'child', 'witch'];

export const MAPS = {
  forest: { name: 'Hollow Forest', blurb: 'Moss, roots and fallen leaves under black pines.' },
  marsh: { name: 'Fogmarsh', blurb: 'Fog banks swallow your light and the black water slows you.', unlock: 'survive150' },
};

// ---- Lamplighter's Shed (12 nodes x 5 tiers, deliberately modest) ---------
export const SHED = [
  { id: 'wick', name: 'Trimmed Wick', icon: 'wick', per: 'Light radius +4%', base: 30 },
  { id: 'oil', name: 'Lamp Oil Stock', icon: 'oil', per: 'Lantern burn +5%', base: 30 },
  { id: 'might', name: 'Sharpened Flame', icon: 'kindling', per: 'All damage +4%', base: 40 },
  { id: 'vigor', name: 'Thick Coat', icon: 'moonsilk', per: 'Max health +10', base: 25 },
  { id: 'boots', name: 'Soft Boots', icon: 'feather', per: 'Move speed +3%', base: 25 },
  { id: 'magnet', name: 'Iron Filings', icon: 'lodestone', per: 'Pickup range +8%', base: 20 },
  { id: 'mending', name: 'Herb Pouch', icon: 'heartwood', per: '+0.1 health a second', base: 35 },
  { id: 'greed', name: 'Oil Press', icon: 'purse', per: 'Oil earned +8%', base: 30 },
  { id: 'haste', name: 'Oiled Hinges', icon: 'echo', per: 'Cooldowns 3% shorter', base: 40 },
  { id: 'reroll', name: 'Second Thoughts', icon: 'reroll', per: '+1 reroll a run', base: 35 },
  { id: 'banish', name: 'Snuffer', icon: 'banish', per: '+1 banish a run', base: 35 },
  { id: 'pilot', name: 'Pilot Wisp', icon: 'wisps', per: 'A companion wisp; each tier makes it stronger', base: 45 },
];
export const SHED_MULT = [1, 2, 3.4, 5.2, 7.6];
export const shedCost = (node, tier) => Math.round(node.base * SHED_MULT[tier]);

// ---- Achievements ------------------------------------------------------------
export const ACH = [
  { id: 'survive150', name: 'Halfway Through', desc: 'Survive to 2:30.', reward: 'Unlocks the Fogmarsh map' },
  { id: 'dawn1', name: 'Dawnbringer', desc: 'Carry the light to dawn.', reward: 'Unlocks Old Bram, the Miner' },
  { id: 'evolve1', name: 'Alchemy', desc: 'Evolve a weapon.', reward: 'Unlocks Brother Ash, the Monk' },
  { id: 'kills3000', name: 'Ember Hoard', desc: 'Burn 3,000 enemies in total.', reward: 'Unlocks Pip, the Child' },
  { id: 'wardenbane', name: 'Wardenbane', desc: 'Defeat the Night Warden before dawn.', reward: 'Unlocks Morrow, the Witch' },
  { id: 'marshdawn', name: 'Through the Fog', desc: 'Reach dawn on the Fogmarsh.', reward: 'Unlocks Moonless mode' },
  { id: 'untouched', name: 'Not a Scratch', desc: 'Reach 2:00 without taking damage.', reward: '' },
  { id: 'fullkit', name: 'Full Satchel', desc: 'Fill all six weapon slots.', reward: '' },
  { id: 'twosuns', name: 'Two Suns', desc: 'Evolve two weapons in one run.', reward: '' },
  { id: 'moonlessdawn', name: 'Moonless Dawn', desc: 'Reach dawn in Moonless mode.', reward: '' },
  { id: 'daily1', name: 'Morning Ritual', desc: 'Finish a Daily run.', reward: '' },
  { id: 'streak3', name: 'Three Mornings', desc: 'Play the Daily three days in a row.', reward: '' },
  { id: 'kills1000run', name: 'Bonfire', desc: 'Burn 1,000 enemies in one run.', reward: '' },
  { id: 'allchars', name: 'Lantern Circle', desc: 'Reach dawn with every character.', reward: '' },
];

// ---- Reward pacing -------------------------------------------------------------
// Embers needed for the next level, indexed by current level. Tuned with the bot
// (tools/pacing.mjs) so the first three level-ups land near 0:12, 0:30 and 0:50,
// then roughly one every 20-25 s.
export function xpNeed(level) {
  const early = [0, 7, 30, 50];
  if (level < early.length) return early[level];
  const k = level - 4;
  return Math.round(40 + k * 13 + k * k * 1);
}

// Night phases (banner text below the moon).
export const PHASES = [
  { t: 0, name: 'Dusk', banner: 'Dusk. Keep the lantern lit until dawn.' },
  { t: 40, name: 'First Dark', banner: 'The wolves wake.' },
  { t: 90, name: 'Deep Night', banner: 'The hollow trees walk.' },
  { t: 120, name: 'Deep Night', banner: 'Wraiths drift at the edge of your light.' },
  { t: ELITE_AT, name: 'Witching Hour', banner: 'The Grey Stag hunts you. It carries a chest.' },
  { t: 200, name: 'Black Hour', banner: 'Brood nests hatch swarms.' },
  { t: BOSS_AT, name: 'The Warden', banner: 'THE NIGHT WARDEN' },
];
