// Game data: spells, monsters, relics, meta upgrades. All names original.

// kind: 'primary' goes in the left-click slot, 'active' in RMB/Q/E/R.
export const SPELLS = {
  bolt: { name: 'Arcane Bolt', kind: 'primary', hex: 0xb48cff, cd: 0.28, mana: 0, dmg: 11, speed: 24, count: 1, life: 0.9, glyph: '✦',
    mods: ['dmg', 'cd', 'count', 'bounce', 'pierce'], desc: 'A quick dart of raw arcana. Reliable.' },
  scatter: { name: 'Spark Scatter', kind: 'primary', hex: 0xffd36b, cd: 0.5, mana: 0, dmg: 6, speed: 21, count: 5, life: 0.45, glyph: '✸',
    mods: ['dmg', 'cd', 'count', 'pierce'], desc: 'A short cone of crackling sparks. Brutal up close.' },
  shard: { name: 'Frost Shard', kind: 'primary', hex: 0x8fe3ff, cd: 0.24, mana: 0, dmg: 8, speed: 27, count: 1, life: 0.8, slow: 0.45, glyph: '❄',
    mods: ['dmg', 'cd', 'count', 'pierce'], desc: 'Icy needles that slow whatever they touch.' },

  fireball: { name: 'Fireball', kind: 'active', hex: 0xff7a2a, cd: 1.8, mana: 16, dmg: 28, area: 2.6, speed: 17, count: 1, glyph: '☄',
    mods: ['dmg', 'cd', 'count', 'area', 'bounce'], desc: 'Explodes on impact and sets foes burning.' },
  nova: { name: 'Frost Nova', kind: 'active', hex: 0x9ff0ff, cd: 6, mana: 24, dmg: 16, area: 5.5, dur: 1.6, glyph: '✺',
    mods: ['dmg', 'cd', 'area', 'dur'], desc: 'A ring of frost bursts from you, freezing everything nearby.' },
  chain: { name: 'Chain Lightning', kind: 'active', hex: 0x9ad8ff, cd: 2.4, mana: 18, dmg: 24, chain: 4, range: 11, glyph: 'ϟ',
    mods: ['dmg', 'cd', 'chain'], desc: 'Lightning leaps from foe to foe.' },
  missiles: { name: 'Arcane Missiles', kind: 'active', hex: 0xff6bf0, cd: 4, mana: 22, dmg: 10, count: 5, glyph: '❖',
    mods: ['dmg', 'cd', 'count'], desc: 'A volley of seeking missiles that hunt the nearest foes.' },
  meteor: { name: 'Meteor', kind: 'active', hex: 0xff5020, cd: 8, mana: 34, dmg: 85, area: 4, count: 1, glyph: '✹',
    mods: ['dmg', 'cd', 'area', 'count'], desc: 'Call a burning rock down on the cursor after a short delay.' },
  poison: { name: 'Poison Cloud', kind: 'active', hex: 0x8cff5a, cd: 7, mana: 22, dmg: 14, area: 3.6, dur: 5, glyph: '☁',
    mods: ['dmg', 'cd', 'area', 'dur'], desc: 'A lingering toxic cloud. Damage every second inside it.' },
  lance: { name: 'Ice Lance', kind: 'active', hex: 0xbff6ff, cd: 1.6, mana: 14, dmg: 38, speed: 36, count: 1, pierce: 99, glyph: '➶',
    mods: ['dmg', 'cd', 'count'], desc: 'Pierces every foe in a line. Double damage to slowed or frozen foes.' },
  blink: { name: 'Blink', kind: 'active', hex: 0xc6a0ff, cd: 4, mana: 12, dmg: 18, area: 2.6, range: 7.5, glyph: '⟿',
    mods: ['dmg', 'cd', 'area'], desc: 'Teleport toward the cursor, bursting arcana where you land.' },
  familiar: { name: 'Summon Familiar', kind: 'active', hex: 0x7dffc4, cd: 14, mana: 28, dmg: 9, dur: 15, count: 1, glyph: '✿',
    mods: ['dmg', 'cd', 'count', 'dur'], desc: 'A spirit owl circles you and pecks at foes with bolts.' },
  shield: { name: 'Arcane Shield', kind: 'active', hex: 0x7fb2ff, cd: 12, mana: 22, dmg: 45, dur: 6, glyph: '⛨',
    mods: ['dmg', 'cd', 'dur'], desc: 'A bubble that soaks up damage for a few seconds.' },
  gravity: { name: 'Gravity Well', kind: 'active', hex: 0x9a6bff, cd: 10, mana: 28, dmg: 10, area: 6, dur: 3, glyph: '◉',
    mods: ['dmg', 'cd', 'area', 'dur'], desc: 'A tiny star that drags foes inward and grinds them.' },
  orbit: { name: 'Blade Orbit', kind: 'active', hex: 0xe0e6ff, cd: 9, mana: 22, dmg: 14, count: 3, dur: 6, glyph: '✧',
    mods: ['dmg', 'cd', 'count', 'dur'], desc: 'Spectral blades whirl around you, cutting what they touch.' },
};
export const PRIMARIES = Object.keys(SPELLS).filter((k) => SPELLS[k].kind === 'primary');
export const ACTIVES = Object.keys(SPELLS).filter((k) => SPELLS[k].kind === 'active');

export const MOD_MAX = 5;
export function modLabel(spellId, mod) {
  const s = SPELLS[spellId];
  switch (mod) {
    case 'dmg': return spellId === 'shield' ? '+30% absorb' : '+25% damage';
    case 'cd': return '-15% cooldown';
    case 'count':
      if (spellId === 'missiles') return '+2 missiles';
      if (spellId === 'familiar') return '+1 familiar';
      if (spellId === 'orbit') return '+1 blade';
      if (spellId === 'meteor') return '+1 meteor';
      if (spellId === 'scatter') return '+2 sparks';
      return '+1 projectile';
    case 'area': return '+30% area';
    case 'bounce': return '+1 bounce';
    case 'pierce': return '+1 pierce';
    case 'chain': return '+2 chains';
    case 'dur': return '+40% duration';
  }
  return mod + (s ? '' : '');
}

// Derived stats for a spell given its mod counts.
export function spellStats(id, m = {}, P = null) {
  const s = SPELLS[id];
  const dmgMul = P ? P.dmgMul : 1;
  const cdMul = P ? P.cdMul : 1;
  const c = (k) => m[k] || 0;
  let count = s.count || 1;
  const cstep = id === 'missiles' || id === 'scatter' ? 2 : 1;
  count += c('count') * cstep;
  return {
    dmg: id === 'shield' ? s.dmg * (1 + 0.3 * c('dmg')) : s.dmg * (1 + 0.25 * c('dmg')) * dmgMul,
    cd: s.cd * Math.pow(0.85, c('cd')) * cdMul,
    mana: s.mana,
    count,
    area: (s.area || 0) * (1 + 0.3 * c('area')),
    bounce: c('bounce'),
    pierce: (s.pierce || 0) + c('pierce'),
    chain: (s.chain || 0) + 2 * c('chain'),
    dur: (s.dur || 0) * (1 + 0.4 * c('dur')),
  };
}

export const MONSTERS = {
  slime: { name: 'Slime', hp: 30, speed: 2.8, r: 0.62, dmg: 10, xp: 4, gold: [1, 3] },
  slimelet: { name: 'Slimelet', hp: 11, speed: 3.6, r: 0.38, dmg: 6, xp: 1, gold: [0, 1] },
  skeleton: { name: 'Skeleton Archer', hp: 26, speed: 2.7, r: 0.45, dmg: 12, xp: 6, gold: [2, 4] },
  bat: { name: 'Cave Bat', hp: 14, speed: 5, r: 0.42, dmg: 8, xp: 3, gold: [0, 2], fly: true },
  goblin: { name: 'Goblin Charger', hp: 38, speed: 3.2, r: 0.52, dmg: 16, xp: 6, gold: [2, 5] },
  ghost: { name: 'Wailing Ghost', hp: 32, speed: 2.3, r: 0.5, dmg: 10, xp: 8, gold: [2, 5], fly: true },
  knight: { name: 'Grave Knight', hp: 95, speed: 2.0, r: 0.66, dmg: 20, xp: 14, gold: [4, 8] },
  spider: { name: 'Crypt Spider', hp: 20, speed: 5.0, r: 0.48, dmg: 10, xp: 5, gold: [1, 3] },
  mimic: { name: 'Mimic', hp: 85, speed: 3.8, r: 0.72, dmg: 18, xp: 16, gold: [10, 18] },
  // bosses
  gloop: { name: 'King Gloop', hp: 1200, speed: 2.6, r: 2.0, dmg: 18, xp: 120, gold: [60, 80], boss: true },
  warden: { name: 'The Iron Warden', hp: 2300, speed: 2.4, r: 1.6, dmg: 26, xp: 200, gold: [90, 110], boss: true },
  matriarch: { name: 'Bone Matriarch', hp: 3400, speed: 2.2, r: 1.4, dmg: 24, xp: 300, gold: [120, 150], boss: true, fly: true },
  crown: { name: 'The Hollow Crown', hp: 6000, speed: 2.4, r: 1.8, dmg: 28, xp: 0, gold: [250, 250], boss: true, fly: true },
};
export const BOSS_FLOORS = { 3: 'gloop', 6: 'warden', 9: 'matriarch', 10: 'crown' };
export const LAST_FLOOR = 10;

export function monsterPool(floor) {
  const p = ['slime', 'bat', 'goblin', 'skeleton'];
  if (floor >= 2) p.push('spider', 'ghost');
  if (floor >= 4) p.push('knight', 'knight');
  if (floor >= 5) p.push('ghost', 'skeleton', 'spider');
  return p;
}

export const RELICS = {
  ember: { name: 'Ember Heart', glyph: '♨', desc: 'Every spell hit has a 25% chance to set the foe burning.' },
  vamp: { name: 'Vampire Fang', glyph: '♆', desc: 'Heal 2 HP whenever a foe dies.' },
  echo: { name: 'Echo Ring', glyph: '◎', desc: 'Active spells have a 25% chance to cast twice.' },
  boots: { name: 'Quickstep Boots', glyph: '⇶', desc: '+15% move speed and the dodge recharges 35% faster.' },
  prism: { name: 'Mana Prism', glyph: '◇', desc: 'Spells cost 25% less mana.' },
  crown: { name: 'Storm Circlet', glyph: 'ϟ', desc: 'Every 6th primary cast also throws chain lightning.' },
  frostward: { name: 'Frost Ward', glyph: '❆', desc: 'When you are hit, a free Frost Nova bursts out (5 s cooldown).' },
  glass: { name: 'Glass Sigil', glyph: '◈', desc: '+35% spell damage, but -20% max HP.' },
  coin: { name: 'Lucky Coin', glyph: '⊛', desc: '+40% gold from every source.' },
  phoenix: { name: 'Phoenix Feather', glyph: '❦', desc: 'Once per run, rise again at half HP when you would die.' },
  bell: { name: 'Familiar Bell', glyph: '♫', desc: 'A familiar joins you whenever a room locks.' },
  hourglass: { name: 'Sand Hourglass', glyph: '⧗', desc: 'All cooldowns 15% shorter.' },
  heartstone: { name: 'Heartstone', glyph: '❤', desc: '+30 max HP and regenerate 1 HP per second.' },
};

export const META = {
  vitality: { name: 'Vitality', desc: '+12 max HP', max: 5, cost: (l) => 100 + l * 100 },
  wellspring: { name: 'Wellspring', desc: '+15 max mana', max: 5, cost: (l) => 100 + l * 100 },
  flow: { name: 'Flow', desc: '+12% mana regen', max: 5, cost: (l) => 120 + l * 110 },
  purse: { name: 'Purse', desc: '+25 starting gold', max: 5, cost: (l) => 80 + l * 80 },
  wisdom: { name: 'Wisdom', desc: '+10% XP gained', max: 5, cost: (l) => 120 + l * 120 },
  reroll: { name: 'Second Thoughts', desc: '+1 level-up reroll per run', max: 3, cost: (l) => 200 + l * 200 },
};
// starting active spell choices and unlock prices
export const START_SPELLS = { fireball: 0, nova: 200, chain: 260, missiles: 320, poison: 320, lance: 400 };
