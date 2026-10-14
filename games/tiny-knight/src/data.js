// Game data: materials, gear tiers, recipes, enemies, spawn tables, bridge stages.
export const MATS = ['wood', 'stone', 'iron', 'gel', 'bone', 'cloth', 'shard'];
export const MAT_NAME = { wood: 'Wood', stone: 'Stone', iron: 'Iron', gel: 'Slime Gel', bone: 'Bone', cloth: 'Old Cloth', shard: 'Shadow Shard', arrow: 'Arrows', potion: 'Potions' };
export const SELL = { wood: 1, stone: 2, iron: 6, gel: 2, bone: 3, cloth: 3, shard: 12 };

export const SWORDS = [
  { name: 'Fists', icon: 'fist', dmg: 2, reach: 11 },
  { name: 'Wooden Sword', icon: 'sword_wood', dmg: 4, reach: 15, col: '#c98a4b' },
  { name: 'Stone Sword', icon: 'sword_stone', dmg: 7, reach: 16, col: '#94b0c2' },
  { name: 'Iron Sword', icon: 'sword_iron', dmg: 11, reach: 17, col: '#f4f4f4' },
  { name: 'Shadowbane', icon: 'sword_shadow', dmg: 16, reach: 19, col: '#e6b8ff' },
];
export const AXES = [{ name: 'Old Hatchet', icon: 'axe_0', pow: 1 }, { name: 'Stone Axe', icon: 'axe_1', pow: 2 }, { name: 'Iron Axe', icon: 'axe_2', pow: 4 }];
export const PICKS = [{ name: 'No Pickaxe', icon: 'pick_1', pow: 0 }, { name: 'Wooden Pickaxe', icon: 'pick_1', pow: 1 }, { name: 'Stone Pickaxe', icon: 'pick_2', pow: 2 }];
export const ARMORS = [{ name: 'Tunic', icon: 'armor_1', def: 0 }, { name: 'Patchwork Armor', icon: 'armor_1', def: 1 }, { name: 'Bone Armor', icon: 'armor_2', def: 2 }, { name: 'Iron Armor', icon: 'armor_3', def: 4 }];
export const SHIELDS = [{ name: 'No Shield', icon: 'shield_wood', block: 0 }, { name: 'Wooden Shield', icon: 'shield_wood', block: 0.4 }, { name: 'Iron Shield', icon: 'shield_iron', block: 0.65 }];

// have(p) = already owned (hidden from list), apply(p) = give it
export const RECIPES = [
  { id: 'sword1', name: 'Wooden Sword', icon: 'sword_wood', cost: { wood: 5 }, desc: '4 damage. Better than fists!', have: (p) => p.sword >= 1, apply: (p) => { p.sword = 1; } },
  { id: 'pick1', name: 'Wooden Pickaxe', icon: 'pick_1', cost: { wood: 8 }, desc: 'Mine grey rocks for stone.', have: (p) => p.pick >= 1, apply: (p) => { p.pick = 1; } },
  { id: 'potion', name: 'Potion', icon: 'potion', cost: { gel: 3 }, desc: 'Heals 40% HP. Press Q.', repeat: true, apply: (p) => { p.potions++; } },
  { id: 'sword2', name: 'Stone Sword', icon: 'sword_stone', cost: { wood: 4, stone: 8 }, desc: '7 damage.', have: (p) => p.sword >= 2, apply: (p) => { p.sword = Math.max(p.sword, 2); } },
  { id: 'axe1', name: 'Stone Axe', icon: 'axe_1', cost: { wood: 5, stone: 6 }, desc: 'Chop trees twice as fast.', have: (p) => p.axe >= 1, apply: (p) => { p.axe = Math.max(p.axe, 1); } },
  { id: 'shield1', name: 'Wooden Shield', icon: 'shield_wood', cost: { wood: 10, gel: 2 }, desc: 'Blocks 40% of hits from the front.', have: (p) => p.shield >= 1, apply: (p) => { p.shield = Math.max(p.shield, 1); } },
  { id: 'bow', name: 'Hunting Bow', icon: 'bow', cost: { wood: 12, gel: 4 }, desc: 'Shoot with L / F. Comes with 15 arrows.', have: (p) => p.bow, apply: (p) => { p.bow = true; p.arrows += 15; } },
  { id: 'arrows', name: 'Arrows x10', icon: 'arrow', cost: { wood: 3, stone: 1 }, desc: 'Ammo for the bow.', repeat: true, need: (p) => p.bow, apply: (p) => { p.arrows += 10; } },
  { id: 'armor1', name: 'Patchwork Armor', icon: 'armor_1', cost: { cloth: 5, gel: 2 }, desc: '-1 damage taken. Zombies drop cloth.', have: (p) => p.armor >= 1, apply: (p) => { p.armor = Math.max(p.armor, 1); } },
  { id: 'pick2', name: 'Stone Pickaxe', icon: 'pick_2', cost: { wood: 6, stone: 10 }, desc: 'Mine orange iron ore. Faster on rock.', have: (p) => p.pick >= 2, apply: (p) => { p.pick = 2; } },
  { id: 'armor2', name: 'Bone Armor', icon: 'armor_2', cost: { bone: 8, cloth: 4 }, desc: '-2 damage taken. Skeletons drop bones.', have: (p) => p.armor >= 2, apply: (p) => { p.armor = Math.max(p.armor, 2); } },
  { id: 'sword3', name: 'Iron Sword', icon: 'sword_iron', cost: { wood: 4, iron: 8 }, desc: '11 damage, longer reach.', have: (p) => p.sword >= 3, apply: (p) => { p.sword = Math.max(p.sword, 3); } },
  { id: 'axe2', name: 'Iron Axe', icon: 'axe_2', cost: { wood: 4, iron: 5 }, desc: 'One-chop trees, +1 wood.', have: (p) => p.axe >= 2, apply: (p) => { p.axe = 2; } },
  { id: 'shield2', name: 'Iron Shield', icon: 'shield_iron', cost: { wood: 4, iron: 8 }, desc: 'Blocks 65% of hits from the front.', have: (p) => p.shield >= 2, apply: (p) => { p.shield = 2; } },
  { id: 'armor3', name: 'Iron Armor', icon: 'armor_3', cost: { iron: 12, cloth: 4 }, desc: '-4 damage taken.', have: (p) => p.armor >= 3, apply: (p) => { p.armor = 3; } },
  { id: 'sword4', name: 'Shadowbane', icon: 'sword_shadow', cost: { iron: 6, shard: 6 }, desc: '16 damage. Forged from shadow shards.', have: (p) => p.sword >= 4, apply: (p) => { p.sword = 4; } },
];

export const BRIDGE = [
  { coins: 60, wood: 15 },
  { coins: 120, wood: 20, stone: 10 },
  { coins: 200, stone: 20, iron: 6 },
  { coins: 300, wood: 20, iron: 12 },
  { coins: 420, stone: 20, iron: 16 },
];

// base stats. coins [min,max], drops [[mat, chance, n]]
export const ENEMIES = {
  slime: { name: 'Slime', hp: 8, dmg: 2, spd: 30, xp: 3, coins: [1, 3], drops: [['gel', 0.6, 1]], r: 6, sprite: 'slime', kind: 'green' },
  bslime: { name: 'Blue Slime', hp: 18, dmg: 4, spd: 40, xp: 5, coins: [2, 4], drops: [['gel', 0.75, 2]], r: 6, sprite: 'slime', kind: 'blue' },
  bigslime: { name: 'King Slime', hp: 44, dmg: 6, spd: 26, xp: 12, coins: [5, 9], drops: [['gel', 1, 3]], r: 10, sprite: 'slime', kind: 'red', scale: 1.7 },
  zombie: { name: 'Zombie', hp: 34, dmg: 6, spd: 20, xp: 9, coins: [3, 7], drops: [['cloth', 0.65, 1]], r: 5 },
  skeleton: { name: 'Skeleton', hp: 26, dmg: 6, spd: 34, xp: 11, coins: [4, 8], drops: [['bone', 0.75, 1]], r: 5 },
  bat: { name: 'Bat', hp: 12, dmg: 4, spd: 60, xp: 5, coins: [1, 4], drops: [], r: 5, fly: true },
  rockling: { name: 'Rockling', hp: 60, dmg: 8, spd: 30, xp: 16, coins: [7, 13], drops: [['stone', 1, 2], ['iron', 0.5, 1]], r: 7, def: 2 },
  hound: { name: 'Shadow Hound', hp: 50, dmg: 9, spd: 55, xp: 18, coins: [6, 11], drops: [['shard', 0.35, 1]], r: 7, shadow: true },
  wisp: { name: 'Shadow Wisp', hp: 42, dmg: 8, spd: 40, xp: 20, coins: [6, 11], drops: [['shard', 0.45, 1]], r: 6, fly: true, shadow: true },
  sknight: { name: 'Shadow Knight', hp: 110, dmg: 11, spd: 32, xp: 32, coins: [11, 18], drops: [['shard', 0.7, 1]], r: 6, def: 3, shadow: true },
  sentinel: { name: 'Shadow Sentinel', hp: 260, dmg: 13, spd: 36, xp: 80, coins: [35, 45], drops: [['shard', 1, 3]], r: 8, def: 3, shadow: true, scale: 1.45 },
  sslime: { name: 'Shadow Slime', hp: 30, dmg: 8, spd: 44, xp: 8, coins: [2, 4], drops: [['shard', 0.15, 1]], r: 6, sprite: 'slime', kind: 'shadow', shadow: true },
};

// zone index -> [type, weight], cap
export const SPAWNS = {
  0: { cap: 5, list: [['slime', 80], ['bslime', 20]] },
  1: { cap: 6, list: [['slime', 25], ['bslime', 25], ['zombie', 40], ['bigslime', 10]] },
  2: { cap: 6, list: [['skeleton', 45], ['rockling', 20], ['bat', 20], ['bslime', 15]] },
  3: { cap: 7, list: [['zombie', 35], ['skeleton', 35], ['bat', 30]] },
  4: { cap: 6, list: [['hound', 35], ['wisp', 30], ['sknight', 20], ['sslime', 15]] },
};
export const NIGHT_EXTRA = { 0: [['zombie', 30], ['bat', 20]], 1: [['zombie', 40], ['bat', 20]], 2: [['bat', 30], ['zombie', 20]], 3: [['zombie', 20], ['bat', 20]] };

export const xpNeeded = (L) => 12 + 10 * (L - 1) + 2 * (L - 1) * (L - 1);
export const maxHpFor = (L) => 30 + 6 * (L - 1);
export const atkBonus = (L) => Math.floor((L - 1) * 0.8);
