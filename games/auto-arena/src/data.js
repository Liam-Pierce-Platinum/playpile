// data.js - every unit, trait, item, opponent and economy number in AUTO ARENA.
// Pure data, no DOM. sim.js and run.js read it; art.js paints from it.

// ---------------------------------------------------------------- traits
// Each unit has one ORIGIN (Sylvan, Ember, Tide, Gloom) and one CLASS.
// Traits count UNIQUE unit types on the board. `t` = breakpoints, `v` = values.
export const TRAITS = {
  knight: { name: 'Knight', kind: 'class', col: '#7d8fa8', t: [2, 4, 6], v: [180, 380, 650], text: v => `Knights start each fight with a ${v} shield.`, all6: 'At 6, every ally gets half.' },
  mage: { name: 'Mage', kind: 'class', col: '#6a5bc4', t: [2, 4, 6], v: [45, 95, 160], text: v => `Mages' abilities hit ${v}% harder.` },
  beast: { name: 'Beast', kind: 'class', col: '#a8743a', t: [2, 4, 6], v: [3.5, 6, 10], text: v => `Beasts grow +${v}% attack with every hit they land.` },
  undead: { name: 'Undead', kind: 'class', col: '#7f9a86', t: [2, 4], v: [45, 80], text: v => `Undead rise once after dying, with ${v}% health.` },
  ranger: { name: 'Ranger', kind: 'class', col: '#4f8a52', t: [2, 4], v: [35, 85], text: v => `Rangers attack ${v}% faster.` },
  rogue: { name: 'Rogue', kind: 'class', col: '#8a4a6a', t: [2, 4], v: [18, 40], text: v => `Rogues leap to the enemy back line and have ${v}% crit chance (crits deal double).` },
  sylvan: { name: 'Sylvan', kind: 'origin', col: '#5a9a48', t: [2, 4, 6], v: [2, 3.5, 5], text: v => `Sylvan units heal ${v}% of max health each second.`, all6: 'At 6, every ally does.' },
  ember: { name: 'Ember', kind: 'origin', col: '#d0602e', t: [2, 4, 6], v: [4, 8, 13], text: v => `Ember attacks set foes burning for ${v}% of their max health over 3s.` },
  tide: { name: 'Tide', kind: 'origin', col: '#3d7fb8', t: [2, 4, 6], v: [5, 10, 18], text: v => `Tide units gain +${v} extra mana per attack.`, all6: 'At 6, every ally does.' },
  gloom: { name: 'Gloom', kind: 'origin', col: '#5b3f78', t: [2, 4, 6], v: [30, 60, 110], text: v => `Gloom units deal +${v}% damage to foes under half health.` },
};
export const TRAIT_IDS = Object.keys(TRAITS);

// ---------------------------------------------------------------- abilities
// kind + numbers. Numbers are for 1 star; star scaling happens in sim.js.
// dmg/heal/shield values scale with star (x1.6 / x2.6) and ability power.
export const ABILITY_TEXT = {
  shield: a => `Raises a ${a.v} shield.`,
  bolt: a => `Hurls a bolt for ${a.v} damage.`,
  maul: a => `Mauls the target for ${a.v} and heals half of it.`,
  stun: a => `Strikes for ${a.v} and stuns for ${a.dur}s.`,
  volley: a => `Looses ${a.n} arrows at random foes, ${a.v} each.`,
  backstab: a => `Vanishes behind the weakest foe and stabs for ${a.v}.`,
  taunt: a => `Shields for ${a.v} and forces nearby foes to attack it.`,
  frenzy: a => `Attacks ${a.v}% faster for 4s.`,
  drain: a => `Drains ${a.v} health from the target.`,
  heal: a => `Heals the most hurt ally for ${a.v}.`,
  roar: a => `Stuns nearby foes for ${a.dur}s and deals ${a.v}.`,
  splash: a => `Splashes ${a.v} damage around the target.`,
  chain: a => `Lightning jumps through ${a.n} foes, ${a.v} each.`,
  snipe: a => `Snipes the farthest foe for ${a.v}.`,
  summon: a => `Raises ${a.n > 1 ? a.n + ' minions' : 'a minion'} to fight.`,
  meteor: a => `Drops ${a.v} damage on the biggest cluster of foes.`,
  grow: a => `Grows: +${a.v} max health, +${a.atk} attack, heals fully.`,
  healall: a => `Heals every ally for ${a.v}.`,
  freeze: a => `Freezes every foe for ${a.dur}s and deals ${a.v}.`,
  rally: a => `Allies attack ${a.v}% faster for 5s and gain a ${a.sh} shield.`,
};

// ---------------------------------------------------------------- units
// species = head painter, body = 'biped' | 'quad' | 'float'
// col = skin/fur, garb = clothes, acc = metal/trim
const U = (id, name, cost, origin, cls, species, body, col, garb, acc, hp, atk, as, range, armor, mana, ab, flavour) =>
  ({ id, name, cost, origin, cls, species, body, col, garb, acc, hp, atk, as, range, armor, mana, ab, flavour });

export const UNITS = [
  // ---- cost 1
  U('pip', 'Squire Pip', 1, 'sylvan', 'knight', 'mouse', 'biped', '#b89a7a', '#6f9a4a', '#b0b6c0', 650, 46, 0.65, 1, 35, 80, { k: 'shield', v: 260 }, 'A field mouse in a thimble helmet. Has never once run away.'),
  U('imp', 'Ember Imp', 1, 'ember', 'mage', 'imp', 'biped', '#e0743a', '#7a3a2e', '#f2c14e', 450, 40, 0.7, 3, 15, 60, { k: 'bolt', v: 230 }, 'Lives in the bottom of candles. Bites if you blow it out.'),
  U('moss', 'Moss Hound', 1, 'sylvan', 'beast', 'wolf', 'quad', '#7c8f5a', '#7c8f5a', '#4f6a35', 600, 50, 0.75, 1, 25, 70, { k: 'maul', v: 190 }, 'Grows a little moss every time it naps. It naps a lot.'),
  U('bonelet', 'Bonelet', 1, 'gloom', 'undead', 'skull', 'biped', '#e9e2cf', '#5b4a6e', '#9a8f7a', 540, 48, 0.7, 1, 20, 70, { k: 'stun', v: 130, dur: 1.2 }, 'Small, rattly, and very proud of its sword.'),
  U('reed', 'Reed Archer', 1, 'tide', 'ranger', 'frog', 'biped', '#6aa86a', '#3f6f8f', '#c9a76a', 440, 50, 0.75, 4, 10, 80, { k: 'volley', v: 110, n: 3 }, 'Strings its bow with pond weed. Somehow it works.'),
  U('wick', 'Wick the Cutpurse', 1, 'gloom', 'rogue', 'cat', 'biped', '#4a4258', '#3a3046', '#c7c2d0', 480, 52, 0.8, 1, 15, 70, { k: 'backstab', v: 210 }, 'You will not see Wick. Your purse will not see you again.'),
  U('toad', 'Shield Toad', 1, 'tide', 'knight', 'toad', 'biped', '#8aa65a', '#3d6e9a', '#b0b6c0', 720, 40, 0.6, 1, 40, 90, { k: 'taunt', v: 220 }, 'Sits in front of things. That is the whole plan.'),
  U('cinder', 'Cinder Pup', 1, 'ember', 'beast', 'fox', 'quad', '#d8743a', '#d8743a', '#f2d0a0', 560, 52, 0.75, 1, 20, 70, { k: 'frenzy', v: 60 }, 'Chases its own tail. Sets it on fire. Keeps chasing.'),
  U('ash', 'Ash Wight', 1, 'ember', 'undead', 'ghost', 'float', '#c9b9a8', '#6a4a3a', '#e07a3a', 500, 46, 0.7, 2, 15, 80, { k: 'drain', v: 170 }, 'What is left when a hearth goes cold and angry.'),
  U('sprig', 'Sprig', 1, 'sylvan', 'mage', 'sprout', 'biped', '#9ac46a', '#5a8a3a', '#e8c86a', 440, 38, 0.7, 3, 10, 70, { k: 'heal', v: 230 }, 'A seedling who learned one spell and uses it on everyone.'),
  // ---- cost 2
  U('bram', 'Sir Bramble', 2, 'sylvan', 'knight', 'boar', 'biped', '#8a6a52', '#5a7a3a', '#a8b0b8', 820, 56, 0.65, 1, 45, 90, { k: 'roar', v: 110, dur: 1.1, r: 1.4 }, 'A boar knight sworn to the hedgerows. Snorts at dragons.'),
  U('kelpie', 'Kelpie', 2, 'tide', 'beast', 'seal', 'quad', '#5f8aa8', '#5f8aa8', '#a8d0e0', 720, 60, 0.7, 1, 25, 80, { k: 'splash', v: 210, r: 1.2 }, 'A river horse that forgot which half was the horse.'),
  U('hexling', 'Hexling', 2, 'gloom', 'mage', 'owl', 'biped', '#6a5a8a', '#3a2e4e', '#c7a0e0', 520, 42, 0.7, 3, 15, 70, { k: 'chain', v: 180, n: 3 }, 'An owl who reads the wrong books on purpose.'),
  U('tallow', 'Tallow Archer', 2, 'ember', 'ranger', 'human', 'biped', '#e2b48c', '#a8452e', '#6a4a2e', 520, 56, 0.75, 4, 15, 70, { k: 'snipe', v: 320 }, 'Dips every arrow in candle wax and lights it. Sometimes on purpose.'),
  U('gravedig', 'Grave Digger', 2, 'sylvan', 'undead', 'mushroom', 'biped', '#c9b8a0', '#5a5a3a', '#8a7a5a', 660, 50, 0.65, 1, 25, 90, { k: 'summon', n: 1, hp: 320, atk: 36 }, 'A toadstool with a shovel. Plants things that get back up.'),
  U('needle', 'Needle', 2, 'tide', 'rogue', 'crab', 'biped', '#d0604a', '#3a5a7a', '#e8e0d0', 580, 58, 0.85, 1, 30, 70, { k: 'backstab', v: 250 }, 'A crab who walks sideways straight into your back line.'),
  U('cogg', 'Brass Warden', 2, 'ember', 'knight', 'golem', 'biped', '#c8a050', '#8a5a2e', '#e8c870', 860, 50, 0.6, 1, 55, 100, { k: 'shield', v: 420 }, 'Clockwork guard. Runs on coal and stubbornness.'),
  U('nightjar', 'Nightjar', 2, 'gloom', 'ranger', 'bird', 'biped', '#4a4a6a', '#2e2a3e', '#a0a0c8', 500, 58, 0.8, 4, 10, 80, { k: 'volley', v: 120, n: 4 }, 'Only shoots at night. It is always night somewhere.'),
  // ---- cost 3
  U('tidecaller', 'Tidecaller', 3, 'tide', 'mage', 'fish', 'biped', '#6ab0c8', '#2e5a8a', '#e8d070', 660, 50, 0.7, 3, 20, 80, { k: 'meteor', v: 300, r: 1.3 }, 'Calls a wave down on your head. Very polite about it.'),
  U('thornmaw', 'Thornmaw', 3, 'sylvan', 'beast', 'bear', 'quad', '#7a5a3a', '#7a5a3a', '#6a9a4a', 1000, 70, 0.65, 1, 40, 90, { k: 'grow', v: 220, atk: 16 }, 'A bear with brambles for fur. Hugging is not advised.'),
  U('lantern', 'Lantern Lich', 3, 'ember', 'mage', 'skull', 'float', '#efe6cf', '#3e2e4a', '#f2b23a', 640, 48, 0.7, 3, 15, 90, { k: 'meteor', v: 340, r: 1.2 }, 'Carries its own soul in a lantern so it never gets lost.'),
  U('duskblade', 'Duskblade', 3, 'gloom', 'rogue', 'fox', 'biped', '#5a4a6a', '#2a2238', '#d0c8e0', 700, 72, 0.85, 1, 25, 80, { k: 'backstab', v: 380 }, 'A fox in a shadow. Or a shadow in a fox.'),
  U('oakshield', 'Oakshield', 3, 'sylvan', 'knight', 'treant', 'biped', '#8a6a42', '#5a7a3a', '#6aa04a', 1100, 55, 0.55, 1, 60, 100, { k: 'taunt', v: 520 }, 'A tree that decided to stand in front of its friends.'),
  U('drowned', 'Drowned Captain', 3, 'tide', 'undead', 'skull', 'biped', '#d8dcc8', '#2e4a5a', '#c8a050', 860, 66, 0.7, 1, 30, 90, { k: 'summon', n: 2, hp: 300, atk: 40 }, 'Went down with the ship. Came back up without it.'),
  U('emberhawk', 'Ember Hawk-Eye', 3, 'ember', 'ranger', 'bird', 'biped', '#c8603a', '#6a3a2a', '#f2c14e', 620, 70, 0.8, 4, 15, 80, { k: 'volley', v: 140, n: 5 }, 'Never misses. Has missed once. Does not talk about it.'),
  // ---- cost 4
  U('stormstag', 'Storm Stag', 4, 'tide', 'beast', 'stag', 'quad', '#8a9ab0', '#8a9ab0', '#e8e070', 1150, 82, 0.75, 1, 40, 90, { k: 'chain', v: 260, n: 4 }, 'Lightning lives in its antlers. It is a bad roommate.'),
  U('mourn', 'Mourning Bell', 4, 'gloom', 'knight', 'golem', 'biped', '#5a5a6a', '#2e2a3a', '#a08ac0', 1300, 66, 0.6, 1, 60, 110, { k: 'roar', v: 200, dur: 1.6, r: 1.7 }, 'A walking bell tower. When it rings, everyone stops.'),
  U('sable', 'Sable Queen', 4, 'ember', 'rogue', 'cat', 'biped', '#3a2e2e', '#8a2a2a', '#f2c14e', 880, 86, 0.9, 1, 30, 80, { k: 'backstab', v: 520 }, 'Queen of the alley cats. Her crown is stolen. So is her name.'),
  U('elderwisp', 'Elder Wisp', 4, 'sylvan', 'mage', 'wisp', 'float', '#b8e0a0', '#5a8a5a', '#f2f0a0', 820, 55, 0.7, 3, 20, 100, { k: 'healall', v: 260 }, 'The oldest light in the forest. Hums when it heals.'),
  U('bonelord', 'Bone Marshal', 4, 'gloom', 'undead', 'skull', 'biped', '#e2dccb', '#3a2e4a', '#c8a050', 1150, 76, 0.7, 1, 40, 100, { k: 'summon', n: 2, hp: 420, atk: 52 }, 'Commands an army it keeps in a sack.'),
  U('willow', 'Willow Longbow', 4, 'sylvan', 'ranger', 'treant', 'biped', '#8aa06a', '#4a6a3a', '#c8b07a', 860, 92, 0.75, 4, 20, 90, { k: 'snipe', v: 720 }, 'A willow that bends its own branches into bows.'),
  // ---- cost 5
  U('inkwyrm', 'Inkwyrm', 5, 'ember', 'beast', 'dragon', 'quad', '#3a3a4a', '#3a3a4a', '#e0602e', 1550, 100, 0.7, 2, 50, 100, { k: 'meteor', v: 600, r: 1.6 }, 'A dragon made of the ink at the bottom of every story.'),
  U('abyss', 'Abyss Mother', 5, 'tide', 'mage', 'fish', 'float', '#3a6a8a', '#1e3a5a', '#e8d070', 1250, 72, 0.7, 3, 30, 110, { k: 'freeze', v: 260, dur: 1.6 }, 'Every ocean has a bottom. She lives under it.'),
  U('gloamking', 'The Gloam King', 5, 'gloom', 'knight', 'human', 'biped', '#c8b0a0', '#2e2240', '#e8c060', 1650, 92, 0.7, 1, 70, 110, { k: 'rally', v: 60, sh: 320 }, 'Rules the hour between day and night. Hates mornings.'),
];
export const UNIT = Object.fromEntries(UNITS.map(u => [u.id, u]));

// summoned minion template (borrowed look)
export const MINION = { id: 'minion', name: 'Risen Bones', cost: 0, origin: null, cls: null, species: 'skull', body: 'biped', col: '#ddd5c0', garb: '#4a4040', acc: '#8a8070', hp: 300, atk: 36, as: 0.8, range: 1, armor: 15, mana: 999, ab: { k: 'none' }, flavour: '' };

export const STAR_MULT = [0, 1, 1.8, 3.24];
export const ABIL_MULT = [0, 1, 1.6, 2.6];

// ---------------------------------------------------------------- items
export const ITEMS = [
  { id: 'blade', name: 'Ink Blade', icon: 'sword', col: '#c84a3a', text: '+22 attack', mod: { atk: 22 } },
  { id: 'quill', name: 'Quick Quill', icon: 'quill', col: '#e0a030', text: '+30% attack speed', mod: { asPct: 30 } },
  { id: 'rod', name: "Seer's Rod", icon: 'rod', col: '#6a5bc4', text: '+40% ability power', mod: { ap: 40 } },
  { id: 'plate', name: 'Iron Plate', icon: 'plate', col: '#7d8fa8', text: '+35 armour', mod: { armor: 35 } },
  { id: 'heart', name: 'Oak Heart', icon: 'heart', col: '#5a9a48', text: '+300 health', mod: { hp: 300 } },
  { id: 'tear', name: 'Tear Vial', icon: 'tear', col: '#3d7fb8', text: 'Start with +35 mana', mod: { mana0: 35 } },
  { id: 'thorn', name: 'Thorn Mail', icon: 'thorn', col: '#4a7a3a', text: 'Reflects 30% of attack damage taken', mod: { thorns: 30, armor: 15 } },
  { id: 'fang', name: 'Leech Fang', icon: 'fang', col: '#8a2a4a', text: '30% lifesteal', mod: { leech: 30 } },
  { id: 'nib', name: 'Lucky Nib', icon: 'nib', col: '#e8c060', text: '+25% crit chance', mod: { crit: 25 } },
  { id: 'feather', name: 'Phoenix Feather', icon: 'feather', col: '#e0602e', text: 'Rise once with 40% health', mod: { revive: 40 } },
];
export const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const ITEM_ROUNDS = [2, 5, 8, 11, 14, 17];

// ---------------------------------------------------------------- economy
export const START_GOLD = 8;
export const START_LEVEL = 2;
export const MAX_LEVEL = 9;
export const XP_TO_NEXT = { 1: 2, 2: 2, 3: 6, 4: 10, 5: 20, 6: 32, 7: 48, 8: 66 };
export const BUY_XP_COST = 4, BUY_XP_AMT = 4;
export const REROLL_COST = 1;
export const BASE_INCOME = 5;
export const MAX_INTEREST = 5;
export const BENCH_SIZE = 8;
export const BOARD_COLS = 5, BOARD_ROWS = 2;
export const START_HEARTS = 6;
export const WINS_TO_WIN = 10;
export const SHOP_SIZE = 5;
// percent odds for costs 1..5 by level
export const SHOP_ODDS = {
  1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0], 4: [55, 30, 15, 0, 0],
  5: [42, 35, 20, 3, 0], 6: [28, 38, 26, 8, 0], 7: [19, 30, 33, 16, 2], 8: [15, 20, 33, 26, 6], 9: [10, 15, 28, 30, 17],
};
export const POOL_SIZE = { 1: 22, 2: 18, 3: 14, 4: 10, 5: 8 };
export function streakBonus(s) { const a = Math.abs(s); return a >= 5 ? 3 : a >= 4 ? 2 : a >= 2 ? 1 : 0; }

// ---------------------------------------------------------------- opponents
// Seven rivals with distinct plans. `fav` = traits they chase, `econ` = gold they
// like to sit on, `lvlAt` = gold above which they buy xp, `roll` = gold they will
// spend rerolling looking for upgrades.
export const RIVALS = [
  { id: 'gauntlet', name: 'Lady Gauntlet', plan: 'Shieldwall', blurb: 'Knights in front, Sylvan healing behind.', fav: ['knight', 'sylvan'], econ: 20, lvlAt: 30, roll: 2, col: '#7d8fa8' },
  { id: 'hexmother', name: 'The Hexmother', plan: 'Arcane Burst', blurb: 'Stacks Mages and Ember for one huge volley of spells.', fav: ['mage', 'ember'], econ: 10, lvlAt: 34, roll: 4, col: '#6a5bc4' },
  { id: 'oldfang', name: 'Old Fang', plan: 'The Pack', blurb: 'Beasts that keep getting bigger the longer the fight goes.', fav: ['beast', 'tide'], econ: 10, lvlAt: 40, roll: 6, col: '#a8743a' },
  { id: 'sexton', name: 'Sexton Mold', plan: 'Gravecall', blurb: 'Undead that will not stay down, plus Gloom finishers.', fav: ['undead', 'gloom'], econ: 10, lvlAt: 34, roll: 5, col: '#7f9a86' },
  { id: 'quiver', name: 'The Quiver Twins', plan: 'Volley', blurb: 'Rangers in the back row, a wall of anything in front.', fav: ['ranger', 'tide'], econ: 30, lvlAt: 30, roll: 2, col: '#4f8a52' },
  { id: 'velvet', name: 'Velvet Knife', plan: 'Assassins', blurb: 'Rogues that skip your front line entirely.', fav: ['rogue', 'gloom'], econ: 10, lvlAt: 44, roll: 6, col: '#8a4a6a' },
  { id: 'crane', name: 'Banker Crane', plan: 'Greed', blurb: 'Hoards gold, levels fast, buys only the expensive stuff.', fav: ['ember', 'mage'], econ: 50, lvlAt: 24, roll: 0, col: '#c8a050' },
];

// ---------------------------------------------------------------- ladder
export const TIERS = [
  { name: 'Paper', min: 0, col: '#bfae8e' },
  { name: 'Charcoal', min: 1100, col: '#5a5560' },
  { name: 'Sepia', min: 1250, col: '#8a5a3a' },
  { name: 'Indigo', min: 1400, col: '#3a4a8a' },
  { name: 'Vermilion', min: 1550, col: '#c8402e' },
  { name: 'Gold Leaf', min: 1700, col: '#d0a030' },
  { name: 'Masterwork', min: 1850, col: '#2a2230' },
];
export function tierOf(r) { let t = TIERS[0]; for (const x of TIERS) if (r >= x.min) t = x; return t; }
export function tierIndex(r) { let i = 0; TIERS.forEach((x, k) => { if (r >= x.min) i = k; }); return i; }
