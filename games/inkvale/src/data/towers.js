// Towers. Five lines. Each starts as one level-1 tower; at the first upgrade
// you pick one of THREE paths, each with its own focus, and climb it through
// tiers 2, 3 and 4. A tier-4 tower has two abilities bought in three ranks.
//
// Units: range in map pixels (the map is 1280x720), rate = seconds per shot,
// dmg = [min,max] per hit. dtype: 'phys' is cut by armour, 'magic' by magic
// resistance, 'true' ignores both.

export const BUILD = ['archer1', 'barracks1', 'mage1', 'artillery1', 'beast1'];

// what each path is FOR - shown when you choose
export const PATHS = {
  warden: { line: 'archer', name: 'Wardens', focus: 'The archers come down off the tower and fight on the road. Send them anywhere in reach.' },
  venom: { line: 'archer', name: 'Venom', focus: 'Poisoned arrows that stack. Ignores armour; great against tough, slow foes.' },
  marks: { line: 'archer', name: 'Marksmen', focus: 'Longest reach in the kingdom and huge single shots.' },
  knight: { line: 'barracks', name: 'Knights', focus: 'Heavily armoured soldiers who hold the road for a long time.' },
  raider: { line: 'barracks', name: 'Raiders', focus: 'Light armour, heavy blows. Kills things fast, dies fast.' },
  rider: { line: 'barracks', name: 'Riders', focus: 'Fast cavalry. Charges hit three times as hard and knock foes down.' },
  lens: { line: 'mage', name: 'Prism', focus: 'A beam that burns hotter the longer it holds one target.' },
  sorc: { line: 'mage', name: 'Sorcery', focus: 'Huge magic bolts, a golem of wet paint and an armour-melting curse.' },
  frost: { line: 'mage', name: 'Hourglass', focus: 'Slows, freezes, and even turns enemies back down the road.' },
  spark: { line: 'artillery', name: 'Storm', focus: 'Lightning that jumps from foe to foe - flyers included.' },
  bomb: { line: 'artillery', name: 'Bombard', focus: 'Ever bigger explosions. Cluster shells and homing rockets.' },
  fire: { line: 'artillery', name: 'Inkfire', focus: 'Lobs burning ink that leaves fire on the road.' },
  drake: { line: 'beast', name: 'Dragons', focus: 'A drake that grows into a dragon. Flies, breathes fire, hits flyers.' },
  bear: { line: 'beast', name: 'Bears', focus: 'A bear that grows into a war mammoth. Enormous health, stuns with a roar.' },
  serpent: { line: 'beast', name: 'Serpents', focus: 'A viper that grows into a hydra. Poison, petrifying gaze, many heads.' },
};

export const TOWERS = {
  // ================================================================ ARCHERS
  archer1: {
    line: 'archer', level: 1, top: -44, name: "Fletcher's Post", cost: 70, next: ['warden2', 'venom2', 'marks2'],
    range: 150, rate: 0.8, dmg: [4, 7], dtype: 'phys', proj: 'arrow', air: true, shooters: 2,
    desc: 'Two village bowmen. Quick, cheap, and they can shoot at flyers.',
  },
  warden2: {
    line: 'archer', path: 'warden', level: 2, top: -30, name: 'Warden Lodge', cost: 110, next: ['warden3'],
    range: 200, dtype: 'phys', air: true, field: true,
    soldier: { name: 'Warden', hp: 60, dmg: [2, 4], armor: 0, rate: 1, respawn: 9, look: 'warden', n: 2, ranged: { range: 135, dmg: [6, 10], rate: 0.8, proj: 'arrow', air: true } },
    desc: 'Two wardens who stand wherever you send them and shoot.',
  },
  warden3: {
    line: 'archer', path: 'warden', level: 3, top: -34, name: 'Warden Hall', cost: 160, next: ['warden4'],
    range: 220, dtype: 'phys', air: true, field: true,
    soldier: { name: 'Warden', hp: 90, dmg: [3, 6], armor: 0.05, rate: 1, respawn: 9, look: 'warden', n: 3, ranged: { range: 145, dmg: [9, 14], rate: 0.7, proj: 'arrow', air: true } },
    desc: 'Three wardens, better bows.',
  },
  warden4: {
    line: 'archer', path: 'warden', level: 4, top: -40, name: 'Greenwood Wardens', cost: 240, spec: true,
    range: 240, dtype: 'phys', air: true, field: true,
    soldier: { name: 'Greenwood Warden', hp: 130, dmg: [5, 8], armor: 0.1, rate: 1, respawn: 8, look: 'warden', n: 3, ranged: { range: 160, dmg: [13, 20], rate: 0.6, proj: 'arrow', air: true } },
    abilities: ['volley', 'snare'],
    desc: 'Veteran rangers of the greenwood. Put them right where the fight is.',
  },
  venom2: {
    line: 'archer', path: 'venom', level: 2, top: -40, name: 'Bramble Hide', cost: 110, next: ['venom3'],
    range: 160, rate: 0.75, dmg: [5, 8], dtype: 'phys', proj: 'arrow', air: true, shooters: 2,
    poison: { dps: 4, dur: 3, stacks: 2 },
    desc: 'Thorn-tipped arrows: 4 poison a second, stacking twice.',
  },
  venom3: {
    line: 'archer', path: 'venom', level: 3, top: -44, name: 'Thornwood Blind', cost: 160, next: ['venom4'],
    range: 170, rate: 0.65, dmg: [7, 12], dtype: 'phys', proj: 'arrow', air: true, shooters: 2,
    poison: { dps: 7, dur: 3, stacks: 3 },
    desc: 'Nightshade on every arrow: 7 poison a second, stacking three times.',
  },
  venom4: {
    line: 'archer', path: 'venom', level: 4, top: -48, name: 'Nightshade Grove', cost: 230, spec: true,
    range: 185, rate: 0.5, dmg: [10, 16], dtype: 'phys', proj: 'arrow', air: true, shooters: 2,
    poison: { dps: 11, dur: 3.5, stacks: 3 },
    abilities: ['plague', 'thornroot'],
    desc: 'A living tree of poisoners. Up to 33 poison a second on one foe.',
  },
  marks2: {
    line: 'archer', path: 'marks', level: 2, top: -46, name: 'Longbow Tower', cost: 120, next: ['marks3'],
    range: 200, rate: 1.2, dmg: [16, 26], dtype: 'phys', proj: 'arrow', air: true, shooters: 2,
    desc: 'Longbows: slower, much further, much harder.',
  },
  marks3: {
    line: 'archer', path: 'marks', level: 3, top: -48, name: 'Crossbow Bastion', cost: 170, next: ['marks4'],
    range: 215, rate: 1.3, dmg: [28, 46], dtype: 'phys', proj: 'arrow', air: true, shooters: 2, pierce: 0.25,
    desc: 'Heavy crossbows that punch through a quarter of any armour.',
  },
  marks4: {
    line: 'archer', path: 'marks', level: 4, top: -52, name: 'Inkshot Musketeers', cost: 240, spec: true,
    range: 240, rate: 1.4, dmg: [42, 72], dtype: 'phys', proj: 'shot', air: true, shooters: 2, pierce: 0.3,
    abilities: ['deadeye', 'grapeshot'],
    desc: 'Black-powder sharpshooters with the longest reach in the kingdom.',
  },

  // ================================================================ BARRACKS
  barracks1: {
    line: 'barracks', level: 1, top: -30, name: 'Militia Camp', cost: 70, next: ['knight2', 'raider2', 'rider2'],
    range: 160, dtype: 'phys', air: false,
    soldier: { name: 'Militia', hp: 50, dmg: [1, 3], armor: 0, rate: 1, respawn: 10, look: 'militia' },
    desc: 'Three farmhands with pitchforks. They hold the road so your archers can work.',
  },
  knight2: {
    line: 'barracks', path: 'knight', level: 2, top: -30, name: 'Footmen Hall', cost: 110, next: ['knight3'],
    range: 160, dtype: 'phys', air: false,
    soldier: { name: 'Footman', hp: 110, dmg: [3, 5], armor: 0.2, rate: 1, respawn: 10, look: 'footman' },
    desc: 'Spear and kite shield.',
  },
  knight3: {
    line: 'barracks', path: 'knight', level: 3, top: -40, name: 'Knights Keep', cost: 160, next: ['knight4'],
    range: 160, dtype: 'phys', air: false,
    soldier: { name: 'Knight', hp: 170, dmg: [6, 10], armor: 0.35, rate: 1, respawn: 10, look: 'knight' },
    desc: 'Mail and longsword.',
  },
  knight4: {
    line: 'barracks', path: 'knight', level: 4, top: -48, name: 'Order of the Gilded Quill', cost: 230, spec: true,
    range: 170, dtype: 'phys', air: false,
    soldier: { name: 'Paladin', hp: 240, dmg: [12, 18], armor: 0.5, rate: 1, respawn: 12, look: 'paladin' },
    abilities: ['heal', 'holystrike'],
    desc: 'Gold-trimmed holy knights. Armoured, stubborn, self-healing.',
  },
  raider2: {
    line: 'barracks', path: 'raider', level: 2, top: -30, name: 'Raider Camp', cost: 110, next: ['raider3'],
    range: 160, dtype: 'phys', air: false,
    soldier: { name: 'Raider', hp: 100, dmg: [6, 10], armor: 0.05, rate: 0.95, respawn: 9, look: 'raider' },
    desc: 'Marsh raiders with hand axes. Twice the bite of footmen.',
  },
  raider3: {
    line: 'barracks', path: 'raider', level: 3, top: -34, name: 'Reaver Longhouse', cost: 160, next: ['raider4'],
    range: 160, dtype: 'phys', air: false,
    soldier: { name: 'Reaver', hp: 160, dmg: [11, 17], armor: 0.1, rate: 0.9, respawn: 9, look: 'raider' },
    desc: 'Bigger axes, bigger appetites.',
  },
  raider4: {
    line: 'barracks', path: 'raider', level: 4, top: -36, name: 'Bog Berserkers', cost: 230, spec: true,
    range: 170, dtype: 'phys', air: false,
    soldier: { name: 'Berserker', hp: 240, dmg: [17, 27], armor: 0.1, rate: 0.85, respawn: 10, look: 'berserker' },
    abilities: ['whirlwind', 'axes'],
    desc: 'Marsh-folk in bearskins who hit very, very hard.',
  },
  rider2: {
    line: 'barracks', path: 'rider', level: 2, top: -30, name: 'Outrider Stables', cost: 120, next: ['rider3'],
    range: 190, dtype: 'phys', air: false,
    soldier: { name: 'Outrider', hp: 110, dmg: [4, 7], armor: 0.1, rate: 1, respawn: 11, look: 'rider', n: 2, speed: 125, engage: 90, charge: 3 },
    desc: 'Two riders who gallop to the fight. Their first blow lands three times as hard.',
  },
  rider3: {
    line: 'barracks', path: 'rider', level: 3, top: -34, name: 'Lancer Stables', cost: 170, next: ['rider4'],
    range: 200, dtype: 'phys', air: false,
    soldier: { name: 'Lancer', hp: 170, dmg: [8, 13], armor: 0.2, rate: 1, respawn: 11, look: 'lancer', n: 3, speed: 125, engage: 95, charge: 3 },
    desc: 'Three lancers. Charges knock small foes flat.',
  },
  rider4: {
    line: 'barracks', path: 'rider', level: 4, top: -40, name: 'Royal Lancers', cost: 240, spec: true,
    range: 210, dtype: 'phys', air: false,
    soldier: { name: 'Royal Lancer', hp: 230, dmg: [13, 20], armor: 0.3, rate: 1, respawn: 11, look: 'lancer', n: 3, speed: 135, engage: 100, charge: 3 },
    abilities: ['charge', 'trample'],
    desc: "The Queen's own horse. Nothing on the road enjoys meeting them.",
  },

  // ================================================================ MAGES
  mage1: {
    line: 'mage', level: 1, top: -50, name: 'Apprentice Spire', cost: 100, next: ['lens2', 'sorc2', 'frost2'],
    range: 140, rate: 1.5, dmg: [9, 17], dtype: 'magic', proj: 'bolt', air: true,
    desc: 'Magic bolts melt armour. Slow but sure.',
  },
  lens2: {
    line: 'mage', path: 'lens', level: 2, top: -58, name: 'Lens Spire', cost: 160, next: ['lens3'],
    range: 150, rate: 0.1, dmg: [2, 3], dtype: 'magic', proj: 'beam', air: true, beam: { start: 10, max: 55, ramp: 1 },
    desc: 'A ground lens that focuses sunlight into a beam: 10 rising to 55 a second.',
  },
  lens3: {
    line: 'mage', path: 'lens', level: 3, top: -66, name: 'Crystal Spire', cost: 230, next: ['lens4'],
    range: 160, rate: 0.1, dmg: [2, 3], dtype: 'magic', proj: 'beam', air: true, beam: { start: 16, max: 95, ramp: 1 },
    desc: 'A great crystal: 16 rising to 95 a second.',
  },
  lens4: {
    line: 'mage', path: 'lens', level: 4, top: -76, name: 'Prism Sanctum', cost: 300, spec: true,
    range: 170, rate: 0.1, dmg: [2, 3], dtype: 'magic', proj: 'beam', air: true, beam: { start: 22, max: 150, ramp: 1 },
    abilities: ['refract', 'glare'],
    desc: 'A prism that splits sunlight into a beam that burns hotter the longer it holds.',
  },
  sorc2: {
    line: 'mage', path: 'sorc', level: 2, top: -64, name: 'Adept Spire', cost: 160, next: ['sorc3'],
    range: 150, rate: 1.5, dmg: [21, 39], dtype: 'magic', proj: 'bolt', air: true,
    desc: 'Brighter bolts from a better-read mage.',
  },
  sorc3: {
    line: 'mage', path: 'sorc', level: 3, top: -72, name: 'Wizard Spire', cost: 240, next: ['sorc4'],
    range: 160, rate: 1.5, dmg: [38, 70], dtype: 'magic', proj: 'bolt', air: true,
    desc: 'A true wizard.',
  },
  sorc4: {
    line: 'mage', path: 'sorc', level: 4, top: -70, name: 'Pigment Sorcerer', cost: 300, spec: true,
    range: 165, rate: 1.4, dmg: [62, 110], dtype: 'magic', proj: 'bolt', air: true, poly: true,
    abilities: ['elemental', 'curse'],
    desc: 'Paints living colour into the world - including a golem of wet paint.',
  },
  frost2: {
    line: 'mage', path: 'frost', level: 2, top: -60, name: 'Frost Spire', cost: 150, next: ['frost3'],
    range: 150, rate: 1.3, dmg: [12, 20], dtype: 'magic', proj: 'frostbolt', air: true, slow: { f: 0.3, dur: 1.5 },
    desc: 'Icy bolts that slow by 30%.',
  },
  frost3: {
    line: 'mage', path: 'frost', level: 3, top: -68, name: 'Rime Spire', cost: 220, next: ['frost4'],
    range: 160, rate: 1.2, dmg: [20, 34], dtype: 'magic', proj: 'frostbolt', air: true, slow: { f: 0.4, dur: 1.8 },
    desc: 'Bolts that slow by 40%.',
  },
  frost4: {
    line: 'mage', path: 'frost', level: 4, top: -74, name: 'Hourglass Sanctum', cost: 280, spec: true,
    range: 170, rate: 1.1, dmg: [40, 64], dtype: 'magic', proj: 'frostbolt', air: true, slow: { f: 0.5, dur: 2 },
    abilities: ['freeze', 'rewind'],
    desc: 'The keepers of the royal hourglass. Time itself runs slow around them.',
  },

  // ================================================================ ARTILLERY
  artillery1: {
    line: 'artillery', level: 1, top: -22, name: 'Dwarven Mortar', cost: 125, next: ['spark2', 'bomb2', 'fire2'],
    range: 160, rate: 3, dmg: [8, 15], splash: 50, dtype: 'phys', proj: 'bomb', air: false,
    desc: 'Lobs a powder keg into the crowd. Cannot hit flyers.',
  },
  spark2: {
    line: 'artillery', path: 'spark', level: 2, top: -44, name: 'Spark Kiln', cost: 210, next: ['spark3'],
    range: 160, rate: 2.2, dmg: [14, 26], dtype: 'magic', proj: 'lightning', air: true, chain: 2,
    desc: 'Lightning that jumps to a second foe - and it can hit flyers.',
  },
  spark3: {
    line: 'artillery', path: 'spark', level: 3, top: -52, name: 'Thunder Kiln', cost: 290, next: ['spark4'],
    range: 165, rate: 2.2, dmg: [22, 42], dtype: 'magic', proj: 'lightning', air: true, chain: 3,
    desc: 'Lightning that jumps to three foes.',
  },
  spark4: {
    line: 'artillery', path: 'spark', level: 4, top: -61, name: 'Storm Kiln', cost: 375, spec: true,
    range: 170, rate: 2.2, dmg: [32, 62], dtype: 'magic', proj: 'lightning', air: true, chain: 3,
    abilities: ['overcharge', 'static'],
    desc: 'A kiln that fires lightning instead of clay.',
  },
  bomb2: {
    line: 'artillery', path: 'bomb', level: 2, top: -28, name: 'Bombard', cost: 220, next: ['bomb3'],
    range: 165, rate: 3, dmg: [16, 30], splash: 55, dtype: 'phys', proj: 'bomb', air: false,
    desc: 'Bigger barrel, bigger bang.',
  },
  bomb3: {
    line: 'artillery', path: 'bomb', level: 3, top: -30, name: 'Great Mortar', cost: 320, next: ['bomb4'],
    range: 175, rate: 3, dmg: [28, 50], splash: 60, dtype: 'phys', proj: 'bomb', air: false,
    desc: 'The pride of the dwarf foundries.',
  },
  bomb4: {
    line: 'artillery', path: 'bomb', level: 4, top: -30, name: 'Grand Bombardier', cost: 400, spec: true,
    range: 200, rate: 3.5, dmg: [52, 92], splash: 72, dtype: 'phys', proj: 'bomb', air: false, big: true,
    abilities: ['cluster', 'rockets'],
    desc: 'A siege mortar on a turntable. Shakes the whole map.',
  },
  fire2: {
    line: 'artillery', path: 'fire', level: 2, top: -34, name: 'Inkfire Pot', cost: 200, next: ['fire3'],
    range: 155, rate: 2.6, dmg: [7, 12], splash: 40, dtype: 'phys', proj: 'firepot', air: false, burn: { dps: 12, dur: 3, r: 38 },
    desc: 'Burning ink that keeps burning on the road: 12 a second for 3s.',
  },
  fire3: {
    line: 'artillery', path: 'fire', level: 3, top: -38, name: 'Inkfire Cauldron', cost: 280, next: ['fire4'],
    range: 165, rate: 2.5, dmg: [11, 18], splash: 45, dtype: 'phys', proj: 'firepot', air: false, burn: { dps: 20, dur: 3.5, r: 44 },
    desc: 'A bigger cauldron: 20 a second for 3.5s.',
  },
  fire4: {
    line: 'artillery', path: 'fire', level: 4, top: -44, name: 'Dragonfire Cauldron', cost: 360, spec: true,
    range: 175, rate: 2.4, dmg: [15, 25], splash: 50, dtype: 'phys', proj: 'firepot', air: false, burn: { dps: 32, dur: 4, r: 50 },
    abilities: ['firestorm', 'scorch'],
    desc: 'A cauldron of ink that never stops burning.',
  },

  // ================================================================ BEASTS
  beast1: {
    line: 'beast', level: 1, top: -24, name: 'Wolf Kennel', cost: 120, next: ['drake2', 'bear2', 'serpent2'],
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'Grey Wolf', look: 'wolf', hp: 130, dmg: [7, 11], rate: 0.8, speed: 95, armor: 0.05, respawn: 14 },
    desc: 'A wolf that roams the whole map on its own, hunting whatever it finds.',
  },
  drake2: {
    line: 'beast', path: 'drake', level: 2, top: -30, name: 'Drake Roost', cost: 160, next: ['drake3'],
    range: 0, dtype: 'magic', air: true,
    beast: { name: 'Drake', look: 'drake', hp: 190, dmg: [10, 16], rate: 1.1, speed: 80, armor: 0.1, respawn: 16, fly: true, breath: { range: 85, splash: 26 } },
    desc: 'A young drake. Flies over the fight and breathes fire - even at flyers.',
  },
  drake3: {
    line: 'beast', path: 'drake', level: 3, top: -36, name: 'Wyvern Eyrie', cost: 240, next: ['drake4'],
    range: 0, dtype: 'magic', air: true,
    beast: { name: 'Wyvern', look: 'wyvern', hp: 300, dmg: [18, 28], rate: 1.1, speed: 85, armor: 0.2, respawn: 16, fly: true, breath: { range: 95, splash: 32 } },
    desc: 'A wyvern with a wider, hotter breath.',
  },
  drake4: {
    line: 'beast', path: 'drake', level: 4, top: -44, name: "Dragon's Lair", cost: 340, spec: true,
    range: 0, dtype: 'magic', air: true,
    beast: { name: 'Ink Dragon', look: 'dragon', hp: 520, dmg: [30, 48], rate: 1.1, speed: 90, armor: 0.3, respawn: 18, fly: true, breath: { range: 110, splash: 40 } },
    abilities: ['inferno', 'scales'],
    desc: 'A true dragon, painted in the darkest ink there is - and on your side.',
  },
  bear2: {
    line: 'beast', path: 'bear', level: 2, top: -28, name: 'Bear Den', cost: 150, next: ['bear3'],
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'Brown Bear', look: 'bear', hp: 330, dmg: [12, 20], rate: 1.1, speed: 70, armor: 0.2, respawn: 16, blocks: 2 },
    desc: 'A bear. Holds two foes at once and takes a beating.',
  },
  bear3: {
    line: 'beast', path: 'bear', level: 3, top: -32, name: 'Dire Bear Cave', cost: 220, next: ['bear4'],
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'Dire Bear', look: 'direbear', hp: 520, dmg: [20, 32], rate: 1.1, speed: 70, armor: 0.3, respawn: 16, blocks: 3 },
    desc: 'A dire bear. Holds three foes.',
  },
  bear4: {
    line: 'beast', path: 'bear', level: 4, top: -40, name: 'Mammoth Hold', cost: 320, spec: true,
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'War Mammoth', look: 'mammoth', hp: 900, dmg: [30, 46], rate: 1.3, speed: 60, armor: 0.35, respawn: 18, blocks: 4, stomp: 40 },
    abilities: ['roar', 'thickhide'],
    desc: 'A war mammoth. Every blow it lands splashes the crowd.',
  },
  serpent2: {
    line: 'beast', path: 'serpent', level: 2, top: -22, name: 'Viper Pit', cost: 150, next: ['serpent3'],
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'Giant Viper', look: 'viper', hp: 180, dmg: [8, 13], rate: 0.7, speed: 110, armor: 0.1, respawn: 14, venom: 6 },
    desc: 'A fast giant viper with a poison bite.',
  },
  serpent3: {
    line: 'beast', path: 'serpent', level: 3, top: -26, name: 'Basilisk Hollow', cost: 220, next: ['serpent4'],
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'Basilisk', look: 'basilisk', hp: 300, dmg: [14, 22], rate: 0.8, speed: 95, armor: 0.2, respawn: 15, venom: 10, gazeSlow: 0.35 },
    desc: 'A basilisk. Its gaze slows everything near it.',
  },
  serpent4: {
    line: 'beast', path: 'serpent', level: 4, top: -34, name: 'Hydra Mire', cost: 320, spec: true,
    range: 0, dtype: 'phys', air: false,
    beast: { name: 'Hydra', look: 'hydra', hp: 520, dmg: [18, 28], rate: 0.9, speed: 85, armor: 0.25, respawn: 16, venom: 14, heads: 3, blocks: 3 },
    abilities: ['heads', 'petrify'],
    desc: 'A hydra. Each head bites a different foe.',
  },
};

// Abilities: three ranks each. `cost` per rank.
export const ABILITIES = {
  volley: { name: 'Volley', icon: 'volley', cost: [175, 125, 125],
    desc: r => `Every 8s each warden looses a spread of ${[3, 4, 5][r]} arrows.` },
  snare: { name: 'Snares', icon: 'thornroot', cost: [150, 125, 125],
    desc: r => `Every ${[10, 8, 6][r]}s the wardens snare the nearest foe for 2.5s and deal ${[40, 70, 100][r]}.` },
  plague: { name: 'Plague Bloom', icon: 'bramble', cost: [200, 150, 150],
    desc: r => `Poisoned foes burst into a poison cloud when they die: ${[20, 35, 50][r]} a second for 3s.` },
  thornroot: { name: 'Thornroots', icon: 'thornroot', cost: [175, 125, 125],
    desc: r => `Every 10s, roots ${[2, 4, 6][r]} enemies in place for 2s and deals ${[30, 60, 90][r]} damage.` },
  deadeye: { name: 'Deadeye', icon: 'deadeye', cost: [250, 100, 100],
    desc: r => `Every ${[14, 12, 10][r]}s, a careful shot for ${[260, 420, 580][r]} true damage at the toughest enemy in range.` },
  grapeshot: { name: 'Grapeshot', icon: 'grapeshot', cost: [200, 100, 100],
    desc: r => `Every 9s, blasts a cone of ${[6, 8, 10][r]} pellets at close range, 20-35 each.` },

  heal: { name: 'Healing Light', icon: 'heal', cost: [150, 150, 150],
    desc: r => `Paladins under half health heal ${[40, 80, 120][r]} (every 10s).` },
  holystrike: { name: 'Holy Strike', icon: 'holystrike', cost: [200, 150, 150],
    desc: r => `${[15, 20, 25][r]}% chance per swing to smite everything nearby for ${[30, 55, 80][r]} magic damage.` },
  whirlwind: { name: 'Whirlwind', icon: 'whirlwind', cost: [200, 125, 125],
    desc: r => `Every 6s, spins and hits all adjacent enemies for ${[25, 45, 65][r]}.` },
  axes: { name: 'Hurled Axes', icon: 'axes', cost: [150, 125, 125],
    desc: r => `Throws axes at enemies up to 120 away for ${[18, 30, 42][r]} - even at flyers.` },
  charge: { name: 'Thundering Charge', icon: 'charge', cost: [175, 125, 125],
    desc: r => `Charges hit ${[4, 5, 6][r]} times as hard and stun for ${[1, 1.5, 2][r]}s.` },
  trample: { name: 'Trample', icon: 'trample', cost: [175, 125, 125],
    desc: r => `Every 6s, rears and tramples everything close for ${[30, 50, 70][r]}.` },

  refract: { name: 'Refraction', icon: 'refract', cost: [250, 150, 150],
    desc: r => `The beam splits onto ${[1, 2, 3][r]} more enemies at half strength.` },
  glare: { name: 'Blinding Glare', icon: 'glare', cost: [200, 125, 125],
    desc: r => `Every 10s, slows everything in range by 45% for ${[2, 3, 4][r]}s.` },
  elemental: { name: 'Paint Elemental', icon: 'elemental', cost: [250, 150, 150],
    desc: r => `Summons a golem of wet paint (${[300, 450, 600][r]} hp) that holds the road.` },
  curse: { name: 'Polychrome Curse', icon: 'curse', cost: [200, 100, 100],
    desc: r => `Bolts strip ${[20, 35, 50][r]}% armour and magic resistance for 5s.` },
  freeze: { name: 'Deep Freeze', icon: 'freeze', cost: [200, 150, 150],
    desc: r => `Every 9s, freezes up to ${[3, 5, 7][r]} foes solid for ${[1.5, 2, 2.5][r]}s.` },
  rewind: { name: 'Rewind', icon: 'rewind', cost: [250, 150, 150],
    desc: r => `Every ${[12, 10, 8][r]}s, sends the foe nearest the gate ${[110, 170, 230][r]} paces back down the road.` },

  overcharge: { name: 'Overcharge', icon: 'overcharge', cost: [250, 125, 125],
    desc: r => `Lightning jumps ${[1, 2, 3][r]} more times and hits ${[10, 20, 30][r]}% harder.` },
  static: { name: 'Static Field', icon: 'static', cost: [200, 125, 125],
    desc: r => `Every strike shocks everything within 65 of the kiln for ${[14, 26, 38][r]}.` },
  cluster: { name: 'Cluster Shells', icon: 'cluster', cost: [250, 125, 125],
    desc: r => `Every 10s, a shell bursts into ${[4, 6, 8][r]} bomblets of 30-50.` },
  rockets: { name: 'Firework Rockets', icon: 'rockets', cost: [250, 150, 150],
    desc: r => `Every 9s, ${[1, 2, 3][r]} homing rockets for 120-200 each - they can hit flyers.` },
  firestorm: { name: 'Firestorm', icon: 'firestorm', cost: [225, 150, 150],
    desc: r => `Every 10s, rains ${[3, 5, 7][r]} extra fire pots across the crowd.` },
  scorch: { name: 'Scorch', icon: 'scorch', cost: [175, 125, 125],
    desc: r => `Burning ground melts ${[15, 25, 35][r]}% of a foe's armour.` },

  inferno: { name: 'Inferno', icon: 'inferno', cost: [250, 175, 175],
    desc: r => `Every 10s, a great gout of fire: ${[70, 110, 150][r]} damage around the target, leaving flames.` },
  scales: { name: 'Ink Scales', icon: 'scales', cost: [175, 125, 125],
    desc: r => `+${[25, 50, 75][r]}% health and heals ${[5, 10, 15][r]} a second.` },
  roar: { name: 'Roar', icon: 'roar', cost: [200, 125, 125],
    desc: r => `Every 12s, stuns everything nearby for ${[1.5, 2, 2.5][r]}s.` },
  thickhide: { name: 'Thick Hide', icon: 'thickhide', cost: [175, 125, 125],
    desc: r => `+${[10, 20, 30][r]}% armour and +${[20, 40, 60][r]}% health.` },
  heads: { name: 'More Heads', icon: 'heads', cost: [225, 175, 175],
    desc: r => `Grows ${[1, 2, 3][r]} more head${r ? 's' : ''}: bites that many more foes at once.` },
  petrify: { name: 'Petrifying Gaze', icon: 'petrify', cost: [200, 150, 150],
    desc: r => `Every ${[10, 8, 6][r]}s, turns the toughest nearby foe to stone for 3s.` },
};

export const SELL_BACK = 0.6;

export function towerSpent(id, ranks) {
  let total = 0, cur = id;
  while (cur) {
    total += TOWERS[cur].cost;
    cur = Object.keys(TOWERS).find(k => (TOWERS[k].next || []).includes(cur));
  }
  for (const [ab, r] of Object.entries(ranks || {})) for (let i = 0; i < r; i++) total += ABILITIES[ab].cost[i];
  return total;
}
