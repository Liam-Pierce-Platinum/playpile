// BANNERFALL :: data/battles.js - the campaign (DESIGN.md 7.2): 10 main battles plus 2 optional.
//
// Map coordinates are metres, x east, z north, origin at the south-west corner.
// The player always deploys in the south, Varkhal holds or comes from the north.
// zones.pflag is the player's flag (defend), zones.eflag Varkhal's (attack), zones.cflag the
// middle (field battles). The world picks one as zones.flag from the battle mode, so every
// field can also be played the other way round in Skirmish.
//
// enemy:
//   waves      authored waves (battle 1), or
//   wavePlan   { count, budget, doctrine, must, first, gap }  generated waves (defend)
//   garrison   { budget, doctrine, must }  the army that holds a fort (attack / field)
//   fort       { rings, rects, lines, towers, auto }  what Varkhal's builder raises
//   tech       techs Varkhal has in this battle
// Budgets are gold at Captain (Recruit x0.8, Warlord x1.25), already x2.5 (LIAM 2026-10-10).

const S = -Math.PI / 2, N = Math.PI / 2;

export const BATTLES = [
  {
    id: 1, name: 'Millbrook Ford', type: 'defend', seed: 1101, size: 256, env: 'spring',
    blurb: 'Varkhal raiders are fording the Millbrook. Dig in on the south bank and keep them off the windmill.',
    levy: 6000, floor: 6000, gift: ['spear', 'spear', 'archer'], deployCap: 24, timeLimit: 330,
    unlockUnits: ['spear', 'sword', 'archer', 'healer'],
    builds: ['trench', 'stakes', 'palisade', 'gate', 'tower', 'stoneWall'],
    terrain: {
      base: 1.2,
      hills: [[62, 66, 7, 34], [196, 52, 4, 30], [128, 214, 6, 44], [40, 210, 9, 36], [222, 206, 7, 40]],
      river: { path: [[-10, 150], [50, 140], [100, 134], [150, 132], [200, 138], [266, 146]], width: 16, depth: 2.4 },
      fords: [[128, 133, 18], [26, 145, 8]],
      forests: [[18, 96, 22, 40], [238, 92, 22, 46], [228, 30, 20, 30], [30, 236, 22, 26], [232, 244, 18, 22], [176, 196, 12, 14]],
      rocks: [[200, 60, 10], [88, 186, 8], [160, 170, 6]],
      road: [[128, -4], [128, 60], [126, 110], [128, 133], [130, 170], [128, 260]],
    },
    zones: {
      player: [[36, 14], [220, 14], [220, 118], [36, 118]],
      enemy: [[36, 160], [220, 160], [220, 244], [36, 244]],
      enemySpawn: [[128, 244], [70, 238], [190, 238]],
      pflag: { pos: [128, 58], r: 12, name: 'the windmill' },
      eflag: { pos: [128, 214], r: 12, name: 'the raiders\' camp' },
    },
    props: [
      { type: 'windmill', pos: [128, 58], rot: 0.5 },
      { type: 'cottage', pos: [104, 42], rot: 0.3 }, { type: 'cottage', pos: [152, 38], rot: -0.4 },
      { type: 'cottage', pos: [146, 70], rot: 1.2 },
      { type: 'hay', pos: [112, 70] }, { type: 'hay', pos: [117, 74] }, { type: 'hay', pos: [160, 52] },
      { type: 'fence', a: [92, 30], b: [118, 26] }, { type: 'fence', a: [140, 26], b: [168, 32] },
      { type: 'tent', pos: [128, 236], team: 1 }, { type: 'tent', pos: [110, 242], team: 1 }, { type: 'tent', pos: [148, 242], team: 1 },
    ],
    enemy: {
      doctrine: 'horde', budget: 4600,
      waves: [
        { t: 15, spawn: 0, units: ['spear', 'spear', 'spear', 'archer', 'archer'] },
        { t: 70, spawn: 1, units: ['spear', 'spear', 'sword', 'spear', 'outrider', 'outrider', 'archer', 'archer'] },
        { t: 130, spawn: 2, units: ['spear', 'spear', 'sword', 'sword', 'spear', 'spear', 'outrider', 'outrider', 'archer', 'archer', 'archer', 'healer'] },
        { t: 190, spawn: 0, units: ['spear', 'sword', 'spear', 'sword', 'spear', 'sword', 'spear', 'outrider', 'outrider', 'archer', 'archer', 'archer', 'xbow', 'healer'] },
        { t: 245, spawn: 1, units: ['knight', 'knight', 'sword', 'sword', 'spear', 'spear', 'spear', 'outrider', 'outrider', 'archer', 'archer', 'xbow', 'xbow', 'healer'] },
      ],
      garrison: { budget: 2600, doctrine: 'shieldbow' },
    },
    stars: { maxLossPct: 40, objective: 'noEnemyInFlag', objectiveText: 'No enemy reaches the windmill' },
    reward: 1600,
    tutorial: true,
  },
  {
    id: 2, name: 'Hollow Ridge', type: 'attack', seed: 2202, size: 256, env: 'forest',
    blurb: 'Varkhal has dug in on Hollow Ridge, 14 m above the valley, behind a trench and a palisade. Storm the camp and take its banner. The village smith has built you a ram.',
    levy: 5000, floor: 6500, gift: ['healer', 'ram'], deployCap: 24, timeLimit: 540,
    unlockUnits: ['ram'],
    terrain: {
      base: 1.0,
      hills: [[128, 190, 9, 70], [52, 206, 9, 40], [206, 210, 10, 42], [128, 52, 2.5, 40]],
      mesas: [[128, 194, 13, 36]],
      forests: [[18, 122, 22, 48], [238, 118, 22, 48], [36, 240, 30, 30], [220, 240, 30, 30], [66, 156, 11, 12], [192, 152, 11, 12], [30, 40, 18, 18], [228, 46, 18, 18]],
      rocks: [[96, 168, 7], [168, 172, 6], [70, 92, 5]],
      road: [[128, -4], [124, 70], [132, 130], [128, 165], [128, 196]],
    },
    zones: {
      player: [[30, 12], [226, 12], [226, 76], [30, 76]],
      enemy: [[44, 140], [212, 140], [212, 246], [44, 246]],
      enemySpawn: [[128, 244], [70, 236], [190, 236]],
      pflag: { pos: [128, 44], r: 12, name: 'your camp' },
      eflag: { pos: [128, 198], r: 12, name: 'the ridge camp' },
    },
    props: [
      { type: 'tent', pos: [112, 206], team: 1 }, { type: 'tent', pos: [144, 210], team: 1 }, { type: 'tent', pos: [128, 214], team: 1, big: true },
      { type: 'campfire', pos: [128, 190] }, { type: 'standard', pos: [128, 199], team: 1 },
      { type: 'tent', pos: [104, 40], team: 0 }, { type: 'tent', pos: [150, 38], team: 0 }, { type: 'campfire', pos: [128, 36] },
      { type: 'ruin', pos: [74, 66], rot: 0.4 }, { type: 'cart', pos: [140, 70], rot: 1.1 },
    ],
    enemy: {
      doctrine: 'shieldbow', budget: 4200,
      garrison: { budget: 2300, doctrine: 'shieldbow' },
      fort: {
        rings: [{ c: [128, 196], r: 30, sides: 14, wall: 'palisade', gate: 'gate', gateDir: S }],
        lines: [{ type: 'trench', pts: [[84, 156], [104, 152], [128, 150], [152, 152], [172, 156]] }, { type: 'stakes', pts: [[100, 144], [156, 144]] }],
        towers: [{ type: 'tower', pos: [104, 214] }, { type: 'tower', pos: [152, 214] }],
      },
    },
    stars: { maxLossPct: 45, objective: 'healersAlive', objectiveText: 'All your healers survive' },
    reward: 1800,
  },
  {
    id: 3, name: 'Ashwood Bridge', type: 'defend', seed: 3303, size: 256, env: 'noon',
    blurb: 'Varkhal\'s horse are coming for the old stone bridge at Ashwood. Hold the village. Stakes and outriders are yours now; there is a ford downstream.',
    levy: 5500, floor: 7000, deployCap: 26, timeLimit: 360,
    unlockUnits: ['outrider'], unlockBuilds: ['caltrops'],
    terrain: {
      base: 1.1,
      hills: [[60, 60, 6, 36], [200, 70, 5, 34], [70, 214, 8, 40], [196, 212, 7, 40]],
      river: { path: [[-10, 156], [60, 152], [120, 150], [180, 148], [266, 154]], width: 22, depth: 2.6 },
      fords: [[214, 151, 11]],
      bridge: { x: 118, z0: 132, z1: 170, w: 7 },
      forests: [[18, 100, 20, 36], [240, 110, 18, 30], [30, 236, 24, 26], [232, 240, 22, 24], [160, 200, 10, 10]],
      rocks: [[88, 120, 5], [176, 118, 5]],
      road: [[118, -4], [118, 90], [118, 132], [118, 170], [124, 210], [128, 260]],
    },
    zones: {
      player: [[28, 14], [228, 14], [228, 134], [28, 134]],
      enemy: [[28, 176], [228, 176], [228, 246], [28, 246]],
      enemySpawn: [[124, 244], [60, 238], [196, 238]],
      pflag: { pos: [118, 84], r: 12, name: 'Ashwood village' },
      eflag: { pos: [126, 214], r: 12, name: 'the horse lines' },
    },
    props: [
      { type: 'bridge', pos: [118, 151], len: 38, w: 7 },
      { type: 'cottage', pos: [100, 74], rot: 1.4 }, { type: 'cottage', pos: [138, 92], rot: -1.6 }, { type: 'cottage', pos: [102, 100], rot: 1.7 },
      { type: 'cottage', pos: [138, 66], rot: -1.3 }, { type: 'well', pos: [118, 84] }, { type: 'hay', pos: [150, 74] }, { type: 'hay', pos: [86, 92] },
      { type: 'fence', a: [70, 40], b: [104, 46] }, { type: 'fence', a: [140, 44], b: [170, 38] },
      { type: 'tent', pos: [110, 230], team: 1 }, { type: 'tent', pos: [142, 232], team: 1 },
    ],
    enemy: {
      doctrine: 'hammer', budget: 5200,
      wavePlan: { count: 4, first: 15, gap: 70, must: ['outrider', 'outrider', 'outrider', 'outrider', 'outrider'] },
      garrison: { budget: 2600, doctrine: 'hammer' },
    },
    stars: { maxLossPct: 40, objective: 'noHorseSouth', objectiveText: 'No Varkhal horse crosses the river', riverZ: 140 },
    reward: 2000,
  },
  {
    id: '4a', name: 'Greywater Mill', type: 'attack', seed: 4404, size: 256, env: 'harvest',
    blurb: 'Two trench lines guard the Greywater mill, and Varkhal crossbowmen hold its towers. Break through and take the mill. Crossbows join you after this battle.',
    levy: 5500, floor: 7500, deployCap: 26, timeLimit: 540,
    unlockAfter: ['xbow'],
    terrain: {
      base: 0.7,
      hills: [[128, 204, 4, 50], [40, 40, 4, 30], [216, 46, 4, 30]],
      fields: [[40, 104, 96, 132], [160, 100, 220, 130], [36, 180, 84, 230], [176, 186, 228, 232], [70, 30, 108, 70], [150, 24, 196, 66]],
      hedges: [[[30, 138], [100, 136]], [[156, 136], [226, 140]], [[90, 176], [90, 236]], [[168, 176], [168, 236]]],
      forests: [[14, 160, 16, 20], [244, 160, 14, 20], [128, 252, 30, 16]],
      road: [[128, -4], [128, 90], [128, 150], [128, 204]],
    },
    zones: {
      player: [[24, 12], [232, 12], [232, 74], [24, 74]],
      enemy: [[24, 140], [232, 140], [232, 246], [24, 246]],
      enemySpawn: [[128, 244], [60, 238], [196, 238]],
      pflag: { pos: [128, 40], r: 12, name: 'the farm' },
      eflag: { pos: [128, 204], r: 13, name: 'Greywater mill' },
    },
    props: [
      { type: 'windmill', pos: [128, 210], rot: -0.3 },
      { type: 'cottage', pos: [104, 196], rot: 0.2 }, { type: 'cottage', pos: [152, 196], rot: -0.2 },
      { type: 'hay', pos: [60, 120] }, { type: 'hay', pos: [70, 112] }, { type: 'hay', pos: [190, 116] }, { type: 'hay', pos: [200, 200] },
      { type: 'cottage', pos: [100, 36], rot: 0.5 }, { type: 'cart', pos: [146, 42], rot: 0.2 }, { type: 'well', pos: [116, 30] },
    ],
    enemy: {
      doctrine: 'turtle', budget: 4800, tech: ['chainmail'],
      garrison: { budget: 2400, doctrine: 'turtle', must: ['xbow', 'xbow', 'xbow', 'xbow'] },
      fort: {
        lines: [
          { type: 'trench', pts: [[56, 152], [92, 148], [128, 147], [164, 148], [200, 152]] },
          { type: 'stakes', pts: [[74, 142], [182, 142]] },
          { type: 'trench', pts: [[82, 180], [106, 177], [128, 176], [150, 177], [174, 180]] },
          { type: 'palisade', pts: [[96, 188], [118, 186]] }, { type: 'palisade', pts: [[138, 186], [160, 188]] },
        ],
        towers: [{ type: 'tower', pos: [104, 216] }, { type: 'tower', pos: [152, 216] }, { type: 'tower', pos: [128, 186] }],
      },
    },
    stars: { maxLossPct: 45, objective: 'lowLoss', objectiveText: 'Capture it losing under 30% of your men', lossPct: 30 },
    reward: 2200,
  },
  {
    id: '4b', name: 'Saltmarsh Abbey', type: 'defend', seed: 4505, size: 256, env: 'marsh', optional: true,
    blurb: 'The brothers of Saltmarsh have walled their abbey on its mound. Varkhal wants the abbey\'s grain. Hold the gate through the fog and the brothers will serve you: Abbey tech free.',
    levy: 6000, floor: 7500, deployCap: 26, timeLimit: 360,
    unlockAfter: ['xbow'], rewardTech: ['abbey'],
    terrain: {
      base: 0.45,
      hills: [[128, 70, 2, 60]],
      mesas: [[128, 66, 3.6, 32]],
      pools: [[40, 120, 18], [84, 150, 14], [176, 144, 16], [220, 112, 18], [130, 176, 12], [60, 200, 16], [204, 196, 18], [20, 60, 12], [236, 60, 12], [100, 110, 7], [160, 112, 8]],
      mud: 0.35,
      forests: [[20, 230, 18, 16], [236, 232, 18, 16], [24, 24, 14, 10], [232, 20, 14, 10]],
      road: [[128, 66], [128, 120], [126, 170], [128, 260]],
    },
    zones: {
      player: [[30, 12], [226, 12], [226, 124], [30, 124]],
      enemy: [[30, 168], [226, 168], [226, 246], [30, 246]],
      enemySpawn: [[128, 244], [56, 236], [200, 236]],
      pflag: { pos: [128, 62], r: 12, name: 'Saltmarsh Abbey' },
      eflag: { pos: [128, 210], r: 12, name: 'the reed camp' },
    },
    playerFort: { rings: [{ c: [128, 64], r: 25, sides: 12, wall: 'stoneWall', gate: 'gate', gateDir: N, tag: 'abbeyGate' }] },
    props: [
      { type: 'abbey', pos: [128, 58], rot: 0 },
      { type: 'well', pos: [140, 74] }, { type: 'hay', pos: [112, 76] },
      { type: 'tent', pos: [116, 226], team: 1 }, { type: 'tent', pos: [140, 228], team: 1 },
    ],
    enemy: {
      doctrine: 'horde', budget: 4400, fireArrows: true,
      wavePlan: { count: 4, first: 18, gap: 72, must: ['outrider', 'outrider', 'outrider', 'outrider', 'ram'] },
      garrison: { budget: 2600, doctrine: 'horde' },
    },
    stars: { maxLossPct: 40, objective: 'gateHeld', objectiveText: 'The abbey gate is never broken' },
    reward: 1600,
  },
  {
    id: 5, name: 'Thornfield', type: 'field', seed: 5505, size: 256, env: 'autumn',
    blurb: 'Two armies, one hill. Both sides dig in on the golden fields of Thornfield, then fight for the crest. Hold it when the horns sound. Sappers join you: they dig in the middle of a fight.',
    levy: 6500, floor: 8000, deployCap: 28, timeLimit: 420,
    unlockUnits: ['sapper'],
    terrain: {
      base: 1.2,
      hills: [[128, 128, 10, 48], [36, 60, 5, 30], [220, 196, 5, 30]],
      fields: [[30, 30, 86, 76], [170, 40, 230, 82], [26, 176, 84, 226], [168, 180, 230, 230]],
      hedges: [[[24, 100], [92, 104]], [[164, 104], [232, 100]], [[24, 156], [92, 152]], [[164, 152], [232, 156]]],
      forests: [[14, 128, 14, 22], [242, 128, 14, 22], [128, 6, 26, 10], [128, 250, 26, 10]],
      road: [[-4, 128], [80, 126], [128, 128], [176, 130], [260, 128]],
    },
    zones: {
      player: [[24, 12], [232, 12], [232, 100], [24, 100]],
      enemy: [[24, 156], [232, 156], [232, 244], [24, 244]],
      enemySpawn: [[128, 236], [60, 232], [196, 232]],
      pflag: { pos: [128, 46], r: 12, name: 'your baggage' },
      eflag: { pos: [128, 210], r: 12, name: 'their baggage' },
      cflag: { pos: [128, 128], r: 15, name: 'the hill' },
    },
    props: [
      { type: 'ruin', pos: [118, 130], rot: 0.3 }, { type: 'standard', pos: [128, 128], team: -1 },
      { type: 'hay', pos: [50, 60] }, { type: 'hay', pos: [200, 60] }, { type: 'hay', pos: [60, 200] }, { type: 'hay', pos: [196, 206] },
      { type: 'tent', pos: [116, 30], team: 0 }, { type: 'tent', pos: [140, 30], team: 0 },
      { type: 'tent', pos: [116, 226], team: 1 }, { type: 'tent', pos: [140, 226], team: 1 },
    ],
    enemy: {
      doctrine: 'hammer', budget: 5000, tech: ['chainmail'],
      garrison: { budget: 2000, doctrine: 'hammer', must: ['outrider', 'outrider'] },
      fort: { auto: true, budget: 420 },
    },
    stars: { maxLossPct: 45, objective: 'holdHill', objectiveText: 'Your banner stands on the hill at the end' },
    reward: 2400,
  },
  {
    id: 6, name: 'Kestrel Pass', type: 'defend', seed: 6606, size: 256, env: 'snow',
    blurb: 'Snow in the high pass. Varkhal is bringing mangonels up the Kestrel road to smash a way south. Wall the pass, keep your towers standing. Stone stands up to boulders better than wood.',
    levy: 8000, floor: 9000, deployCap: 28, timeLimit: 420,
    terrain: {
      base: 1.4,
      ridges: [[-10, 0, 40, 260, 26, 46], [266, 0, 216, 260, 26, 46], [60, 150, 72, 200, 12, 22], [196, 140, 186, 196, 12, 22]],
      hills: [[128, 230, 5, 40]],
      forests: [[86, 90, 10, 10], [172, 96, 10, 10], [80, 230, 12, 14], [176, 236, 12, 14], [100, 30, 10, 8], [160, 26, 10, 8]],
      rocks: [[96, 120, 6], [162, 130, 6], [128, 180, 5]],
      road: [[128, -4], [124, 60], [132, 130], [126, 200], [128, 260]],
    },
    zones: {
      player: [[64, 12], [192, 12], [192, 120], [64, 120]],
      enemy: [[64, 170], [192, 170], [192, 246], [64, 246]],
      enemySpawn: [[128, 244], [100, 238], [156, 238]],
      pflag: { pos: [128, 44], r: 12, name: 'the pass fort' },
      eflag: { pos: [128, 214], r: 12, name: 'the siege camp' },
    },
    props: [
      { type: 'ruin', pos: [128, 40], rot: 0, big: true }, { type: 'campfire', pos: [118, 54] },
      { type: 'tent', pos: [114, 226], team: 1 }, { type: 'tent', pos: [142, 228], team: 1 },
    ],
    enemy: {
      doctrine: 'siege', budget: 5200, tech: ['chainmail'], fireArrows: true,
      wavePlan: { count: 4, first: 16, gap: 80, must: ['mangonel', 'mangonel'] },
      garrison: { budget: 3000, doctrine: 'siege' },
    },
    stars: { maxLossPct: 40, objective: 'noTowersLost', objectiveText: 'Lose no towers' },
    reward: 2600,
  },
  {
    id: '7a', name: 'Fort Brannoc', type: 'attack', seed: 7707, size: 256, env: 'highland',
    blurb: 'Fort Brannoc: stone walls, a gatehouse and four towers on a grey highland. Your engineers have drawn up mangonels. Batter the towers, break the gate and take the keep.',
    levy: 8000, floor: 9500, deployCap: 30, timeLimit: 600,
    unlockUnits: ['mangonel'], rewardTech: ['siegecraft'],
    terrain: {
      base: 1.6,
      hills: [[40, 200, 10, 40], [216, 206, 10, 40], [128, 40, 3, 50]],
      mesas: [[128, 196, 5, 50]],
      rocks: [[60, 130, 8], [196, 126, 8], [100, 100, 5], [160, 96, 5], [30, 70, 7], [226, 70, 7]],
      forests: [[16, 140, 14, 14], [240, 150, 14, 14], [40, 20, 16, 12], [216, 18, 16, 12]],
      road: [[128, -4], [128, 80], [128, 158], [128, 196]],
    },
    zones: {
      player: [[24, 12], [232, 12], [232, 74], [24, 74]],
      enemy: [[40, 140], [216, 140], [216, 246], [40, 246]],
      enemySpawn: [[128, 244], [60, 238], [196, 238]],
      pflag: { pos: [128, 40], r: 12, name: 'your siege camp' },
      eflag: { pos: [128, 200], r: 12, name: 'the keep' },
    },
    props: [
      { type: 'keep', pos: [128, 210], rot: 0, small: true }, { type: 'standard', pos: [128, 198], team: 1 },
      { type: 'tent', pos: [108, 40], team: 0 }, { type: 'tent', pos: [148, 42], team: 0 }, { type: 'campfire', pos: [128, 32] },
    ],
    enemy: {
      doctrine: 'turtle', budget: 6000, tech: ['chainmail', 'longbows'],
      garrison: { budget: 3200, doctrine: 'turtle', must: ['healer', 'healer'] },
      fort: {
        rects: [{ c: [128, 196], w: 84, d: 64, wall: 'stoneWall', gate: 'stoneGate', gateSide: 'south', corners: 'stoneTower' }],
        lines: [{ type: 'trench', pts: [[90, 150], [110, 147], [146, 147], [166, 150]] }],
      },
    },
    stars: { maxLossPct: 45, objective: 'breachFast', objectiveText: 'Breach the walls within 6 minutes', breachT: 360 },
    reward: 3000,
  },
  {
    id: '7b', name: 'Wolfden Raid', type: 'attack', seed: 7808, size: 256, env: 'woods', optional: true,
    blurb: 'Three supply wagons are crawling up the Wolfden road under guard. Raid the camp in the forest, seize the wagons, and the captured horses become your first Knights (plus 2,000 g).',
    levy: 5000, floor: 9500, deployCap: 30, timeLimit: 420,
    unlockAfter: ['knight'], bonusGold: 2000,
    terrain: {
      base: 1.0,
      hills: [[60, 160, 7, 40], [200, 150, 7, 40], [128, 222, 4, 34]],
      forests: [[30, 120, 34, 70], [226, 120, 34, 70], [60, 220, 28, 34], [200, 224, 28, 34], [84, 70, 16, 18], [176, 66, 16, 18], [40, 30, 20, 16], [216, 30, 20, 16], [96, 150, 10, 10], [164, 160, 10, 10]],
      road: [[128, -4], [116, 60], [138, 120], [120, 170], [128, 210], [128, 260]],
    },
    zones: {
      player: [[50, 12], [206, 12], [206, 82], [50, 82]],
      enemy: [[50, 140], [206, 140], [206, 246], [50, 246]],
      enemySpawn: [[128, 244], [80, 236], [176, 236]],
      pflag: { pos: [128, 46], r: 12, name: 'the road' },
      eflag: { pos: [128, 206], r: 12, name: 'the wagon camp' },
      wagons: [{ pos: [112, 168], r: 8 }, { pos: [146, 184], r: 8 }, { pos: [124, 222], r: 8 }],
    },
    props: [
      { type: 'wagon', pos: [112, 168], rot: 0.6 }, { type: 'wagon', pos: [146, 184], rot: -0.5 }, { type: 'wagon', pos: [124, 222], rot: 1.4 },
      { type: 'tent', pos: [108, 200], team: 1 }, { type: 'tent', pos: [150, 206], team: 1 }, { type: 'campfire', pos: [128, 198] },
      { type: 'standard', pos: [128, 207], team: 1 }, { type: 'cart', pos: [100, 60], rot: 0.4 },
    ],
    enemy: {
      doctrine: 'hammer', budget: 3800,
      garrison: { budget: 2300, doctrine: 'hammer' },
      fort: {
        lines: [{ type: 'stakes', pts: [[108, 154], [148, 154]] }, { type: 'palisade', pts: [[96, 190], [116, 188]] }, { type: 'palisade', pts: [[140, 188], [160, 190]] }],
        towers: [{ type: 'tower', pos: [104, 214] }],
      },
    },
    stars: { maxLossPct: 40, objective: 'wagons', objectiveText: 'Seize all three wagons' },
    reward: 1600,
  },
  {
    id: 8, name: 'Redmarsh', type: 'defend', seed: 8808, size: 256, env: 'dusk',
    blurb: 'Dusk over the mud of Redmarsh. Everything moves slowly here, except Varkhal\'s first armoured knights. Stakes and crossbows break knights. Bring both.',
    levy: 8000, floor: 10000, deployCap: 30, timeLimit: 480,
    terrain: {
      base: 0.7, mud: 0.55, mudSpeed: 0.8,
      hills: [[128, 60, 4, 40], [50, 200, 5, 36], [206, 204, 5, 36]],
      pools: [[40, 150, 14], [216, 144, 16], [90, 180, 10], [170, 176, 10], [20, 90, 10], [236, 96, 10]],
      forests: [[18, 40, 18, 18], [238, 44, 18, 18], [40, 240, 22, 18], [216, 240, 22, 18]],
      road: [[128, -4], [128, 60], [130, 130], [124, 200], [128, 260]],
    },
    zones: {
      player: [[28, 12], [228, 12], [228, 124], [28, 124]],
      enemy: [[28, 168], [228, 168], [228, 246], [28, 246]],
      enemySpawn: [[128, 244], [60, 236], [196, 236]],
      pflag: { pos: [128, 60], r: 12, name: 'Redmarsh hall' },
      eflag: { pos: [128, 214], r: 12, name: 'the dusk camp' },
    },
    props: [
      { type: 'cottage', pos: [128, 68], rot: 0, big: true }, { type: 'cottage', pos: [104, 52], rot: 0.8 }, { type: 'cottage', pos: [152, 50], rot: -0.8 },
      { type: 'torch', pos: [118, 62] }, { type: 'torch', pos: [138, 62] }, { type: 'campfire', pos: [128, 44] },
      { type: 'tent', pos: [114, 228], team: 1 }, { type: 'tent', pos: [142, 230], team: 1 }, { type: 'campfire', pos: [128, 220] },
    ],
    enemy: {
      doctrine: 'royal', budget: 7800, tech: ['chainmail', 'longbows'], fireArrows: true,
      wavePlan: { count: 5, first: 16, gap: 76, must: ['knight', 'knight', 'knight', 'knight', 'knight'] },
      garrison: { budget: 3400, doctrine: 'royal' },
    },
    stars: { maxLossPct: 40, objective: 'killKnights', objectiveText: 'Destroy every knight squad' },
    reward: 3000,
  },
  {
    id: 9, name: 'Varkhal Outer Walls', type: 'attack', seed: 9909, size: 256, env: 'overcast',
    blurb: 'The border wall of Varkhal: stone from cliff to cliff, a gatehouse, towers and a trench in front. Mangonels on the far side. Bring the heaviest engines you own.',
    levy: 10000, floor: 11000, deployCap: 32, timeLimit: 600,
    terrain: {
      base: 1.3,
      ridges: [[-10, 120, 22, 260, 22, 30], [266, 120, 234, 260, 22, 30]],
      hills: [[70, 30, 8, 44], [186, 34, 8, 44], [128, 228, 5, 40]],
      rocks: [[92, 120, 6], [168, 116, 6]],
      forests: [[40, 70, 16, 16], [216, 70, 16, 16], [60, 230, 20, 18], [200, 230, 20, 18]],
      road: [[128, -4], [128, 100], [128, 182], [128, 260]],
    },
    zones: {
      player: [[24, 12], [232, 12], [232, 84], [24, 84]],
      enemy: [[34, 150], [222, 150], [222, 246], [34, 246]],
      enemySpawn: [[128, 244], [70, 238], [186, 238]],
      pflag: { pos: [128, 52], r: 12, name: 'your siege lines' },
      eflag: { pos: [128, 212], r: 12, name: 'the muster yard' },
    },
    props: [
      { type: 'house', pos: [100, 214], rot: 0.1 }, { type: 'house', pos: [156, 212], rot: -0.1 }, { type: 'house', pos: [96, 232], rot: 1.6 },
      { type: 'house', pos: [160, 232], rot: 1.5 }, { type: 'standard', pos: [128, 213], team: 1 },
      { type: 'tent', pos: [104, 44], team: 0 }, { type: 'tent', pos: [152, 44], team: 0 }, { type: 'campfire', pos: [128, 36] },
    ],
    enemy: {
      doctrine: 'siege', budget: 7600, tech: ['chainmail', 'longbows', 'bodkin'],
      garrison: { budget: 3000, doctrine: 'turtle', must: ['mangonel', 'mangonel', 'healer', 'healer'] },
      fort: {
        lines: [
          { type: 'stoneWall', pts: [[30, 184], [72, 182], [128, 182], [184, 182], [226, 184]] },
          { type: 'trench', pts: [[40, 162], [84, 160], [118, 159]] }, { type: 'trench', pts: [[138, 159], [172, 160], [216, 162]] },
          { type: 'stakes', pts: [[112, 168], [144, 168]] },
        ],
        gates: [{ type: 'stoneGate', pos: [128, 182] }],
        towers: [{ type: 'stoneTower', pos: [76, 186] }, { type: 'stoneTower', pos: [180, 186] }, { type: 'stoneTower', pos: [36, 188] }, { type: 'stoneTower', pos: [220, 188] }],
      },
    },
    stars: { maxLossPct: 45, objective: 'killMangonels', objectiveText: 'Destroy both mangonels' },
    reward: 3400,
  },
  {
    id: 10, name: 'The Crown of Varkhal', type: 'attack', seed: 10101, size: 256, env: 'night', final: true,
    blurb: 'Night over the capital. Break the lower town gate, then storm the citadel on its rock and take the throne court. King Oswin waits with his Royal Guard.',
    levy: 12000, floor: 12000, deployCap: 32, timeLimit: 540,
    stages: [
      { text: 'Break the town gate', key: 'keyGate' },
      { text: 'Take the throne court or defeat King Oswin', time: 420, flag: 'flag2', hold: 40 },
    ],
    terrain: {
      base: 1.2,
      ridges: [[-10, 110, 26, 260, 24, 30], [266, 110, 230, 260, 24, 30]],
      hills: [[128, 24, 3, 46], [128, 205, 6, 60]],
      mesas: [[128, 220, 9, 30]],
      forests: [[40, 30, 16, 12], [216, 30, 16, 12], [20, 70, 12, 10], [236, 70, 12, 10]],
      road: [[128, -4], [128, 139], [124, 170], [128, 196], [128, 220]],
    },
    zones: {
      player: [[30, 12], [226, 12], [226, 54], [30, 54]],
      enemy: [[40, 146], [216, 146], [216, 246], [40, 246]],
      enemySpawn: [[128, 244], [80, 240], [176, 240]],
      pflag: { pos: [128, 32], r: 12, name: 'your siege camp' },
      eflag: { pos: [128, 144], r: 9, name: 'the town gate' },
      flag2: { pos: [128, 221], r: 12, name: 'the throne court' },
    },
    props: [
      { type: 'keep', pos: [128, 232], rot: 0 },
      { type: 'house', pos: [94, 158], rot: 0.2 }, { type: 'house', pos: [162, 160], rot: -0.2 }, { type: 'house', pos: [74, 174], rot: 1.5 },
      { type: 'house', pos: [182, 176], rot: 1.6 }, { type: 'house', pos: [100, 184], rot: 0.1 }, { type: 'house', pos: [156, 186], rot: -0.1 },
      { type: 'house', pos: [62, 156], rot: 0.4 }, { type: 'house', pos: [194, 158], rot: -0.4 },
      { type: 'torch', pos: [116, 134] }, { type: 'torch', pos: [140, 134] }, { type: 'torch', pos: [116, 196] }, { type: 'torch', pos: [140, 196] },
      { type: 'torch', pos: [104, 168] }, { type: 'torch', pos: [152, 168] }, { type: 'standard', pos: [128, 222], team: 1 },
      { type: 'tent', pos: [104, 26], team: 0 }, { type: 'tent', pos: [152, 26], team: 0 }, { type: 'campfire', pos: [128, 20] }, { type: 'campfire', pos: [86, 44] }, { type: 'campfire', pos: [170, 44] },
    ],
    enemy: {
      doctrine: 'royal', budget: 8000, tech: ['chainmail', 'longbows', 'bodkin', 'barding'], fireArrows: true,
      garrison: { budget: 2700, doctrine: 'turtle', must: ['healer', 'healer'] },
      reserves: { units: ['knight', 'knight', 'knight', 'knight', 'sword', 'sword', 'sword', 'xbow', 'xbow', 'healer', 'healer'], vet: 3, king: true, at: [128, 226] },
      fort: {
        lines: [{ type: 'stoneWall', pts: [[34, 142], [80, 140], [128, 139], [176, 140], [222, 142]] }, { type: 'trench', pts: [[62, 124], [110, 121]] }, { type: 'trench', pts: [[146, 121], [194, 124]] }],
        gates: [{ type: 'stoneGate', pos: [128, 139], tag: 'keyGate' }],
        towers: [{ type: 'stoneTower', pos: [84, 144] }, { type: 'stoneTower', pos: [172, 144] }],
        rings: [{ c: [128, 220], r: 22, sides: 12, wall: 'stoneWall', gate: 'stoneGate', gateDir: S }],
      },
    },
    stars: { maxLossPct: 50, objective: 'kingCaptured', objectiveText: 'King Oswin is captured, not slain' },
    reward: 5000,
  },
];

// the campaign route (DESIGN.md 7.1): forks are one-way choices
export const ROUTE = {
  1: ['2'], 2: ['3'], 3: ['4a', '4b'], '4a': ['5'], '4b': ['5'], 5: ['6'], 6: ['7a', '7b'], '7a': ['8'], '7b': ['8'], 8: ['9'], 9: ['10'], 10: [],
};
export const FORKS = [['4a', '4b'], ['7a', '7b']];

export const battleById = (id) => BATTLES.find((b) => String(b.id) === String(id)) || BATTLES[0];
export const battleIndex = (id) => BATTLES.findIndex((b) => String(b.id) === String(id));
