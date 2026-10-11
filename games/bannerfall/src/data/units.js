// BANNERFALL :: data/units.js - every unit type, numbers from DESIGN.md 2.1.
// Pure data: imported by the sim (node-safe) and the UI. Tech upgrades are applied per team
// in sim/world.js (world.defs[team][type] is a modded copy of these).
//
// vs: counter multipliers keyed by the TARGET's class tag.
//   cav      = outrider, knight, commander, king
//   spear    = spearmen
//   ranged   = archer, crossbow
//   support  = healers, sappers
//   siege    = ram, mangonel, trebuchet

export const UNIT_TYPES = {
  spear: {
    name: 'Spearmen', short: 'Spears', men: 12, cost: 60, hp: 100, armour: 3, speed: 4.0, radius: 0.45,
    melee: { dmg: 8, interval: 1.2, reach: 2.5, vs: { cav: 3 } },
    ranged: null, ability: 'brace', cls: 'spear', tags: ['infantry', 'melee'], unlock: 'start',
    beats: 'Outriders, Knights', fears: 'Swordsmen, Archers', glyph: 'spear', ranks: 3,
    blurb: 'Cheap, steady pikes. Brace in Hold stance and horses break on them.',
  },
  sword: {
    name: 'Swordsmen', short: 'Swords', men: 10, cost: 90, hp: 120, armour: 5, speed: 4.0, radius: 0.45,
    melee: { dmg: 14, interval: 1.0, reach: 1.6, vs: { spear: 1.5, ranged: 1.5 } },
    ranged: null, ability: 'warCry', cls: 'sword', tags: ['infantry', 'melee', 'shield'], unlock: 'start',
    beats: 'Spearmen, Archers', fears: 'Crossbowmen, Knights', glyph: 'sword', ranks: 3,
    blurb: 'Shield and blade. Frontal arrows glance off their shields.',
  },
  archer: {
    name: 'Archers', short: 'Archers', men: 10, cost: 80, hp: 70, armour: 1, speed: 4.5, radius: 0.45,
    melee: { dmg: 4, interval: 1.2, reach: 1.5 },
    ranged: { kind: 'arrow', dmg: 10, range: 70, reload: 3.0, muzzle: 38, pierce: 0, minRange: 5 }, ammo: 24,
    ability: 'volley', cls: 'ranged', tags: ['infantry', 'ranged'], unlock: 'start',
    beats: 'Spearmen, Healers', fears: 'Outriders, Swordsmen', glyph: 'bow', ranks: 2,
    blurb: '70 m longbows. High arcs drop over walls. Keep them behind a trench.',
  },
  xbow: {
    name: 'Crossbowmen', short: 'Xbows', men: 8, cost: 110, hp: 85, armour: 3, speed: 3.8, radius: 0.45,
    melee: { dmg: 5, interval: 1.2, reach: 1.5 },
    ranged: { kind: 'bolt', dmg: 26, range: 55, reload: 6.0, muzzle: 70, pierce: 0.6, minRange: 4, los: true }, ammo: 18,
    ability: 'volley', cls: 'ranged', tags: ['infantry', 'ranged'], unlock: 'B4',
    beats: 'Knights, Swordsmen', fears: 'Outriders, Archers', glyph: 'xbow', ranks: 2,
    blurb: 'Bolts punch through armour, but they need a clear, flat shot.',
  },
  healer: {
    name: 'Healers', short: 'Monks', men: 4, cost: 100, hp: 60, armour: 0, speed: 4.2, radius: 0.45,
    melee: null, ranged: null, heal: { perMan: 4, radius: 12, morale: 1 },
    ability: 'sanctuary', cls: 'support', tags: ['infantry', 'support'], unlock: 'start',
    beats: 'Makes any line last twice as long', fears: 'Outriders, focused arrows', glyph: 'heal', ranks: 2,
    blurb: 'Each monk heals 4 HP/s inside a glowing 12 m circle. The enemy hunts them.',
  },
  sapper: {
    name: 'Engineers', short: 'Engineers', men: 6, cost: 70, hp: 90, armour: 2, speed: 3.8, radius: 0.45,
    melee: { dmg: 6, interval: 1.2, reach: 1.5, structMult: 3 }, ranged: null,
    ability: 'dig', cls: 'support', tags: ['infantry', 'support', 'sapper'], unlock: 'B5',
    beats: 'Walls (x3 damage), repairs your own', fears: 'Everything in a fight', glyph: 'shovel', ranks: 2,
    blurb: 'Dig trenches in the middle of a battle (F), repair your walls, tear down theirs.',
  },
  outrider: {
    name: 'Outriders', short: 'Riders', men: 6, cost: 120, hp: 130, armour: 2, speed: 9.0, radius: 0.9,
    melee: { dmg: 11, interval: 1.0, reach: 2.0, vs: { ranged: 1.5, support: 1.5, siege: 1.5 } },
    ranged: null, ability: 'hitAndRun', cls: 'cav', tags: ['cavalry', 'melee'], unlock: 'B3', impact: 15,
    beats: 'Archers, Crossbows, Healers, Siege', fears: 'Spearmen, stakes, trenches', glyph: 'horse', ranks: 2,
    blurb: 'Fast light horse. Runs down archers, monks and siege crews.',
  },
  knight: {
    name: 'Knights', short: 'Knights', men: 6, cost: 190, hp: 220, armour: 7, speed: 7.5, radius: 0.9,
    melee: { dmg: 16, interval: 1.1, reach: 2.2, vs: { siege: 1.5 } },
    ranged: null, ability: 'charge', cls: 'cav', tags: ['cavalry', 'melee', 'heavy'], unlock: 'B7', impact: 45,
    beats: 'Swordsmen, anything in the open', fears: 'Braced spears, Crossbows, stakes', glyph: 'knight', ranks: 2,
    blurb: 'Armoured lances. A charge knocks a line flat.',
  },
  ram: {
    name: 'Battering Ram', short: 'Ram', men: 1, crew: 6, cost: 150, hp: 900, armour: 8, speed: 2.0, radius: 1.7,
    melee: null, ranged: null, engine: 'ram', siege: { structDmg: 120, interval: 3 }, arrowMult: 0.2,
    ability: 'none', cls: 'siege', tags: ['siege', 'engine'], unlock: 'B2',
    beats: 'Gates and walls (120 every 3 s)', fears: 'Cavalry, sallies, fire', glyph: 'ram', ranks: 1,
    blurb: 'A roofed log on wheels. Arrows barely scratch it. Right-click a gate.',
  },
  mangonel: {
    name: 'Mangonel', short: 'Mangonel', men: 1, crew: 4, cost: 220, hp: 400, armour: 4, speed: 1.6, radius: 1.7,
    melee: null, engine: 'mangonel', deployTime: 5, arrowMult: 0.6,
    ranged: { kind: 'stone', dmg: 35, structDmg: 180, splash: 5, range: 140, minRange: 30, reload: 10, pierce: 0.3 },
    ability: 'none', cls: 'siege', tags: ['siege', 'engine', 'artillery'], unlock: 'siegecraft',
    beats: 'Towers, walls, clumped men', fears: 'Cavalry, sallies', glyph: 'catapult', ranks: 1,
    blurb: 'Lobs boulders 140 m. Sets up for 5 s after it stops. Smashes towers first.',
  },
  trebuchet: {
    name: 'Trebuchet', short: 'Trebuchet', men: 1, crew: 6, cost: 340, hp: 500, armour: 4, speed: 1.2, radius: 2.0,
    melee: null, engine: 'trebuchet', deployTime: 12, arrowMult: 0.6,
    ranged: { kind: 'stone', dmg: 50, structDmg: 450, splash: 6, range: 220, minRange: 60, reload: 16, pierce: 0.3 },
    ability: 'none', cls: 'siege', tags: ['siege', 'engine', 'artillery'], unlock: 'counterweights',
    beats: 'Stone walls from 220 m', fears: 'Cavalry, anything close', glyph: 'trebuchet', ranks: 1,
    blurb: 'The wall-breaker. 12 s to set up, then 450 damage a shot from across the field.',
  },
  // ---- v2 (DESIGN.md 6.1, 7.1). Prices here are v1 gold; a war world multiplies every price x5.
  builder: {
    name: 'Builders', short: 'Builders', men: 6, cost: 50, hp: 70, armour: 1, speed: 4.2, radius: 0.45, look: 'sapper',
    melee: { dmg: 4, interval: 1.2, reach: 1.5, structMult: 3 }, ranged: null, builder: true, train: 8,
    ability: 'none', cls: 'support', tags: ['infantry', 'support', 'sapper', 'builder'], unlock: 'start',
    beats: 'Builds trenches, walls and towers anywhere you hold', fears: 'Everything in a fight', glyph: 'shovel', ranks: 2,
    blurb: 'Peasant engineers. Select them and draw a build: they walk over and raise it.',
  },
  militia: {
    name: 'Militia', short: 'Militia', men: 8, cost: 40, hp: 70, armour: 1, speed: 4.0, radius: 0.45, look: 'spear',
    melee: { dmg: 6, interval: 1.2, reach: 2.3, vs: { cav: 2 } }, ranged: null, ability: 'none', cls: 'spear',
    tags: ['infantry', 'melee', 'militia'], unlock: 'never', glyph: 'spear', ranks: 2,
    beats: 'Raiders on foot', fears: 'Real soldiers', blurb: 'Farmers with pitchforks and old spears.',
  },
  militiaBow: {
    name: 'Village Bowmen', short: 'Bowmen', men: 8, cost: 40, hp: 60, armour: 0, speed: 4.2, radius: 0.45, look: 'archer',
    melee: { dmg: 3, interval: 1.2, reach: 1.5 },
    ranged: { kind: 'arrow', dmg: 7, range: 60, reload: 3.4, muzzle: 36, pierce: 0, minRange: 5 }, ammo: 16,
    ability: 'none', cls: 'ranged', tags: ['infantry', 'ranged', 'militia'], unlock: 'never', glyph: 'bow', ranks: 2,
    beats: 'Raiders in the open', fears: 'Everything else', blurb: 'Hunters and poachers.',
  },
  // ---- v3.1 roster (LIAM_BRIEF item 6): every type has a role and a counter. look = which body
  // kit the renderer uses until builder C gives it its own art.
  pike: {
    name: 'Pikemen', short: 'Pikes', men: 14, cost: 75, hp: 100, armour: 3, speed: 3.6, radius: 0.45, look: 'spear',
    melee: { dmg: 9, interval: 1.4, reach: 3.6, vs: { cav: 3.5 } }, ranged: null, ability: 'brace', cls: 'spear',
    tags: ['infantry', 'melee'], unlock: 'start', glyph: 'spear', ranks: 4,
    beats: 'Knights, Heavy Cavalry, Horse Archers caught close', fears: 'Archers, Men-at-Arms, Javelins',
    blurb: '5 m pikes in deep ranks. Nothing on four legs gets through a braced block.',
  },
  menAtArms: {
    name: 'Men-at-Arms', short: 'Men-at-Arms', men: 10, cost: 140, hp: 160, armour: 7, speed: 3.6, radius: 0.5, look: 'sword',
    melee: { dmg: 16, interval: 1.0, reach: 1.7, vs: { spear: 1.4, ranged: 1.4, support: 1.3 } }, ranged: null, ability: 'shieldWall', cls: 'sword',
    tags: ['infantry', 'melee', 'shield', 'heavy'], unlock: 'start', glyph: 'sword', ranks: 3,
    beats: 'Spearmen, Pikemen, Archers, Militia', fears: 'Halberdiers, Crossbows, Knights in the flank',
    blurb: 'Plate and mail. Slow, expensive and very hard to kill.',
  },
  halberd: {
    name: 'Halberdiers', short: 'Halberds', men: 10, cost: 110, hp: 120, armour: 5, speed: 3.8, radius: 0.45, look: 'spear',
    melee: { dmg: 17, interval: 1.3, reach: 2.6, vs: { cav: 2, sword: 1.5, siege: 1.5 } }, ranged: null, ability: 'warCry', cls: 'spear',
    tags: ['infantry', 'melee'], unlock: 'start', glyph: 'spear', ranks: 3,
    beats: 'Men-at-Arms, Knights, rams', fears: 'Archers, Swordsmen in the open',
    blurb: 'Axe-blade and hook on a long haft: the answer to armour, on foot or on a horse.',
  },
  longbow: {
    name: 'Longbowmen', short: 'Longbows', men: 10, cost: 120, hp: 75, armour: 1, speed: 4.4, radius: 0.45, look: 'archer',
    melee: { dmg: 5, interval: 1.2, reach: 1.5 },
    ranged: { kind: 'arrow', dmg: 13, range: 95, reload: 3.4, muzzle: 44, pierce: 0.15, minRange: 6 }, ammo: 30,
    ability: 'volley', cls: 'ranged', tags: ['infantry', 'ranged'], unlock: 'start', glyph: 'bow', ranks: 2,
    beats: 'Pikemen, Spearmen, anything slow at 90 m', fears: 'Outriders, Horse Archers, Men-at-Arms up close',
    blurb: 'Yew bows that out-range every other shooter on the field. 30 arrows a man.',
  },
  javelin: {
    name: 'Javelin Skirmishers', short: 'Javelins', men: 8, cost: 70, hp: 80, armour: 2, speed: 5.2, radius: 0.45, look: 'spear',
    melee: { dmg: 7, interval: 1.1, reach: 2.0 },
    ranged: { kind: 'bolt', dmg: 22, range: 32, reload: 4.0, muzzle: 26, pierce: 0.35, minRange: 3 }, ammo: 4,
    ability: 'hitAndRun', cls: 'ranged', tags: ['infantry', 'ranged'], unlock: 'start', glyph: 'spear', ranks: 2,
    beats: 'Pikes and Men-at-Arms (one heavy throw), siege crews', fears: 'Archers, cavalry',
    blurb: 'Fast light foot. Four javelins each that punch through mail, then short spears.',
  },
  horseArcher: {
    name: 'Horse Archers', short: 'H.Archers', men: 6, cost: 160, hp: 110, armour: 2, speed: 8.6, radius: 0.9, look: 'outrider',
    melee: { dmg: 7, interval: 1.0, reach: 1.8 },
    ranged: { kind: 'arrow', dmg: 9, range: 58, reload: 3.0, muzzle: 38, pierce: 0, minRange: 5 }, ammo: 20,
    ability: 'hitAndRun', cls: 'cav', tags: ['cavalry', 'ranged'], unlock: 'start', glyph: 'horse', ranks: 2, impact: 6,
    beats: 'Pikes, slow foot, siege trains', fears: 'Archers and Longbows, Outriders',
    blurb: 'Loose from the saddle, wheel away, loose again. 20 arrows a rider.',
  },
  heavyCav: {
    name: 'Heavy Cavalry', short: 'Heavy Cav', men: 6, cost: 230, hp: 270, armour: 9, speed: 6.6, radius: 0.95, look: 'knight',
    melee: { dmg: 18, interval: 1.2, reach: 2.2, vs: { ranged: 1.4, siege: 1.6 } }, ranged: null,
    ability: 'charge', cls: 'cav', tags: ['cavalry', 'melee', 'heavy'], unlock: 'start', impact: 60, glyph: 'knight', ranks: 2,
    beats: 'Lines in the open, archers, Men-at-Arms from the flank', fears: 'Braced Pikes, Halberds, Crossbows, stakes',
    blurb: 'Barded horses and lances. The heaviest charge in the realm.',
  },
  shieldbearer: {
    name: 'Shieldbearers', short: 'Pavises', men: 8, cost: 80, hp: 130, armour: 6, speed: 3.6, radius: 0.5, look: 'sword',
    melee: { dmg: 6, interval: 1.2, reach: 1.6 }, ranged: null, cover: { radius: 10, mult: 0.5 },
    ability: 'pavise', cls: 'support', tags: ['infantry', 'melee', 'shield'], unlock: 'start', glyph: 'sword', ranks: 1,
    beats: 'Enemy arrows: shooters within 10 m behind them take half', fears: 'Melee of any kind',
    blurb: 'Tall pavise shields carried forward: a moving wall for your archers.',
  },
  standard: {
    name: 'Standard Bearer', short: 'Standard', men: 3, cost: 90, hp: 110, armour: 4, speed: 4.2, radius: 0.45, look: 'spear',
    melee: { dmg: 6, interval: 1.2, reach: 1.6 }, ranged: null, aura: { radius: 28, morale: 0.35 },
    ability: 'rally', cls: 'support', tags: ['infantry', 'support'], unlock: 'start', glyph: 'crown', ranks: 1,
    beats: 'Routs: squads within 28 m hold their nerve and rally faster', fears: 'Losing the banner (every squad near it loses heart)',
    blurb: 'The war banner on a tall pole. Keep it standing and the men keep fighting.',
  },
  surgeon: {
    name: 'Field Surgeons', short: 'Surgeons', men: 3, cost: 90, hp: 60, armour: 0, speed: 4.2, radius: 0.45, look: 'healer',
    melee: null, ranged: null, heal: { perMan: 7, radius: 7, morale: 0.5 },
    ability: 'sanctuary', cls: 'support', tags: ['infantry', 'support'], unlock: 'start', glyph: 'heal', ranks: 1,
    beats: 'One squad at a time: 21 HP/s in a tight 7 m ring', fears: 'Anything that reaches them',
    blurb: 'Saws, splints and strong drink. Fewer hands than the monks, faster work.',
  },
  siegeTower: {
    name: 'Siege Tower', short: 'Siege Tower', men: 1, crew: 8, cost: 260, hp: 1500, armour: 8, speed: 1.3, radius: 2.4,
    melee: null, ranged: null, engine: 'siegeTower', arrowMult: 0.15, siege: { dock: 8 },
    ability: 'none', cls: 'siege', tags: ['siege', 'engine'], unlock: 'siegecraft', glyph: 'ram', ranks: 1,
    beats: 'Stone walls: docked at a wall, your men walk over it', fears: 'Fire, cavalry, mangonels',
    blurb: 'A hide-clad tower on wheels. Right-click an enemy wall: when it docks, your army climbs over.',
  },
  ballista: {
    name: 'Ballista', short: 'Ballista', men: 1, crew: 3, cost: 180, hp: 380, armour: 4, speed: 1.8, radius: 1.6,
    melee: null, engine: 'ballista', deployTime: 3, arrowMult: 0.6,
    ranged: { kind: 'bolt', dmg: 70, structDmg: 50, range: 125, minRange: 12, reload: 7, pierce: 0.85, muzzle: 90, los: true }, ammo: 24,
    ability: 'none', cls: 'siege', tags: ['siege', 'engine', 'artillery'], unlock: 'siegecraft', glyph: 'catapult', ranks: 1,
    beats: 'Knights, Heavy Cavalry, siege engines, commanders', fears: 'Light horse, swarms of foot',
    blurb: 'A giant crossbow: one bolt goes through a knight and the man behind him.',
  },
  commander: {
    name: 'Commander', short: 'Marshal', men: 1, cost: 0, hp: 600, armour: 6, speed: 7.5, radius: 0.9,
    melee: { dmg: 18, interval: 1.0, reach: 2.2 }, ranged: null,
    ability: 'rally', cls: 'cav', tags: ['cavalry', 'melee', 'commander'], unlock: 'start', impact: 15,
    beats: 'Morale: +10 within 30 m', fears: 'If he falls, the army loses heart', glyph: 'crown', ranks: 1,
    blurb: 'Your Marshal. Rally (F) lifts every squad within 30 m.',
  },
  king: {
    name: 'King Oswin', short: 'King', men: 1, cost: 0, hp: 1400, armour: 8, speed: 7.0, radius: 0.9,
    melee: { dmg: 26, interval: 1.0, reach: 2.4 }, ranged: null,
    ability: 'rally', cls: 'cav', tags: ['cavalry', 'melee', 'commander', 'king'], unlock: 'never', impact: 30,
    beats: 'His guard', fears: 'Losing his throne', glyph: 'crown', ranks: 1,
    blurb: 'Oswin the Iron, King of Varkhal.',
  },
};

// unit types the player can buy (others exist for the enemy only)
export const RECRUITABLE = ['spear', 'sword', 'archer', 'xbow', 'healer', 'sapper', 'outrider', 'knight', 'ram', 'mangonel', 'trebuchet'];
// what a war-mode castle can raise (builder A: every owned keep raises all of these; B adds yard buildings)
export const WAR_RECRUITABLE = ['builder', 'militia', 'spear', 'pike', 'sword', 'menAtArms', 'halberd', 'shieldbearer', 'archer', 'longbow', 'xbow', 'javelin', 'healer', 'surgeon', 'standard', 'sapper', 'outrider', 'horseArcher', 'knight', 'heavyCav', 'ram', 'siegeTower', 'mangonel', 'ballista', 'trebuchet'];
// what an outpost or a held fort can raise (DESIGN.md 5.4)
export const OUTPOST_RECRUITABLE = ['builder', 'militia', 'spear', 'archer', 'javelin'];
// train time in seconds (DESIGN.md 7.1)
export const TRAIN = { builder: 8, militia: 6, spear: 10, pike: 12, sword: 12, menAtArms: 18, halberd: 14, shieldbearer: 10, archer: 12, longbow: 16, xbow: 14, javelin: 9, healer: 14, surgeon: 12, standard: 10, outrider: 15, horseArcher: 18, knight: 22, heavyCav: 28, ram: 20, siegeTower: 34, mangonel: 30, ballista: 24, trebuchet: 45, sapper: 10 };

export const isCav = (type) => UNIT_TYPES[type].tags.includes('cavalry');
export const isRanged = (type) => !!UNIT_TYPES[type].ranged;
export const isEngine = (type) => !!UNIT_TYPES[type].engine;

export const ABILITIES = {
  brace: { name: 'Brace', cd: 0, desc: 'Automatic in Hold stance: charges break on the spears.' },
  warCry: { name: 'War Cry', cd: 40, desc: '+20 morale and a short burst of speed.' },
  shieldWall: { name: 'Shield Wall', cd: 2, desc: 'Frontal arrows x0.25, speed x0.5. Toggle.' },
  volley: { name: 'Volley', cd: 30, desc: 'Reload twice as fast for 12 s.' },
  fireArrows: { name: 'Fire Arrows', cd: 1, desc: 'Toggle burning arrows: +burn, set wood alight. Reload x1.3.' },
  pavise: { name: 'Pavise', cd: 30, desc: 'Plant shields: ranged damage taken x0.5 while stationary for 20 s.' },
  sanctuary: { name: 'Sanctuary', cd: 45, desc: 'Heal x3 for 8 s. The ring flares gold.' },
  dig: { name: 'Dig', cd: 4, desc: 'Dig a 12 m trench across their front (2 g/m). Not within 15 m of the enemy.' },
  hitAndRun: { name: 'Hit and Run', cd: 0, desc: 'Toggles Skirmish: strike, wheel away, charge again.' },
  charge: { name: 'Charge', cd: 25, desc: 'Sprint 9.5 m/s for 4 s. Impact x1.5.' },
  rally: { name: 'Rally', cd: 60, desc: '+25 morale to every squad within 30 m and stop routs.' },
  none: { name: 'No ability', cd: 0, desc: 'Right-click an enemy wall, gate or tower to batter it.' },
};
