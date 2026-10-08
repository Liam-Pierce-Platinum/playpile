// Everybody you can fight. A fighter is a STAT SHEET (same 0..10 scale as the
// gym, so an NPC and the player are built by the same code), a BRAIN (how the
// AI behaves) and a set of WEAKNESSES and STRENGTHS that are real numbers in
// the fight, not flavour text:
//
//   dmgTaken  multiplies damage by target (head/body) and by punch kind
//   ai.def    how likely they are to get the RIGHT defence up once they read
//             a punch coming, per punch kind - a hole here is a weakness
//   quirks    behaviours you can exploit: dropping the guard after a combo,
//             taunting, gassing out, going wild when hurt
//
// The text lines are what the scouting report shows. Each one corresponds to
// a number below it; if you change one, change the other.

export const ARENAS = {
  pit:    { name: 'THE PIT',        sub: 'basement gym, east side' },
  rec:    { name: 'ROSEWOOD REC',   sub: 'community center, saturday night' },
  pier:   { name: 'PIER 9',         sub: 'warehouse smoker on the docks' },
  casino: { name: 'LUCKY 7 CASINO', sub: 'the strip, ringside high rollers' },
  roof:   { name: 'CHINATOWN ROOF', sub: 'rooftop card at sundown' },
  garden: { name: 'THE GARDEN',     sub: 'world title, sold out' },
  wbowl:  { name: 'THE SLAMBOWL',   sub: 'wrestling, under the big screen' },
  dohyo:  { name: 'RYOGOKU HALL',   sub: 'the sumo hall' },
};
export const ARENA_ORDER = ['pit', 'rec', 'pier', 'casino', 'roof', 'garden'];

const L = (o) => Object.assign({ power: 0, speed: 0, foot: 0, health: 0, stamina: 0, chin: 0, dodge: 0, bStraight: 0, bHook: 0, bUpper: 0, bBody: 0 }, o);
const DMG = (o) => Object.assign({ head: 1, body: 1, straight: 1, hook: 1, upper: 1, over: 1 }, o);
const DEF = (o) => Object.assign({ straight: 0.4, hook: 0.35, upper: 0.3, over: 0.35, body: 0.3 }, o);

export const ROSTER = [
  {
    id: 'ruiz', name: 'TOMMY RUIZ', nick: 'TWO-STEP', from: 'BRONX, NY', record: '6-2', style: 'OUT-BOXER',
    bio: 'Quick feet, quick mouth. Dances all night and hopes you get bored.',
    arena: 'pit',
    look: { skin: 1, hair: 'short', hairC: '#3d2618', beard: 'none', trunks: ['#ffe066', '#d9a826', '#8a6410'], stripe: '#2b2b3a', gloves: ['#e8463c', '#a8231c'], shoes: '#f4efe4', build: { w: 0.92, h: 1.0 } },
    lv: L({ power: 0, speed: 2, foot: 4, health: 0, stamina: 2, chin: 0, dodge: 2, bStraight: 1 }),
    ai: { react: 0.34, def: DEF({ straight: 0.45, body: 0.1 }), guard: 0.35, aggro: 0.45, range: 40, counter: 0.15, bodyIQ: 0.1, learn: 0.25, heart: 0.35,
      combos: [['J', 4], ['J J', 3], ['J C', 2]], quirks: ['circles'] },
    dmgTaken: DMG({ body: 1.45 }),
    strengths: ['FAST FEET - circles out of the corner', 'pecks with the jab from range'],
    weaknesses: ['BODY - takes 45% more downstairs and never guards low', 'light hands - nothing behind the jab'],
  },
  {
    id: 'lou', name: 'BIG LOU BAKER', nick: 'THE OVEN', from: 'PHILADELPHIA', record: '14-3', style: 'SLUGGER',
    bio: 'Two hundred and sixty pounds of bad intentions. Winds up the haymaker like a mail truck backing up.',
    arena: 'pit', champ: 'PIT CHAMPION',
    look: { skin: 0, hair: 'bald', hairC: '#000', beard: 'full', beardC: '#7a3f22', trunks: ['#4a4a55', '#2e2e38', '#1a1a22'], stripe: '#e8463c', gloves: ['#2b2b33', '#141418'], shoes: '#2b2b33', build: { w: 1.28, h: 1.06 } },
    lv: L({ power: 6, speed: 0, foot: 0, health: 4, stamina: 0, chin: 6, dodge: 0, bStraight: 2, bHook: 2 }),
    reach: 2,
    ai: { react: 0.4, def: DEF({ straight: 0.3, hook: 0.35, upper: 0.2, body: 0.2 }), guard: 0.45, aggro: 0.55, range: 30, counter: 0.1, bodyIQ: 0.2, learn: 0.15, heart: 0.75,
      combos: [['R', 3], ['J R', 3], ['O', 2], ['R. R', 1]],
      special: { seq: 'O', name: 'THE MAIL TRUCK', tell: 0.62, every: 7, power: 1.6 },
      quirks: ['dropsGuard', 'gasses'] },
    dmgTaken: DMG({ head: 0.85, upper: 1.25 }),
    strengths: ['HEAVY HANDS - the overhand can end it', 'IRON CHIN - head shots do less'],
    weaknesses: ['SLOW - winds the big one up for half a second, SLIP it', 'GASSES OUT by round 2', 'drops his hands after he swings - counter right there'],
  },
  {
    id: 'chen', name: 'MICKEY CHEN', nick: 'THE MOSQUITO', from: 'OAKLAND, CA', record: '11-1', style: 'SWARMER',
    bio: 'Never stops buzzing. Throws twelve punches a breath and you feel every one of them.',
    arena: 'rec',
    look: { skin: 2, hair: 'spiky', hairC: '#1a1414', beard: 'none', trunks: ['#5fd4a8', '#2f9e78', '#16614a'], stripe: '#ffffff', gloves: ['#ffffff', '#b8b8c4'], shoes: '#ffffff', build: { w: 0.86, h: 0.92 } },
    lv: L({ power: 1, speed: 6, foot: 5, health: 2, stamina: 5, chin: 0, dodge: 4, bStraight: 3, bHook: 2 }),
    ai: { react: 0.26, def: DEF({ straight: 0.6, hook: 0.3, upper: 0.2, body: 0.35 }), guard: 0.3, aggro: 0.85, range: 26, counter: 0.3, bodyIQ: 0.35, learn: 0.3, heart: 0.5,
      combos: [['J J C', 3], ['J C H', 3], ['H. H', 2], ['J J J', 1], ['C H C', 2]], quirks: ['swarms'] },
    dmgTaken: DMG({ head: 1.3, upper: 1.3 }),
    strengths: ['FAST HANDS - three and four punch combos', 'slips straight punches well'],
    weaknesses: ['GLASS JAW - head shots do 30% more', 'walks right into UPPERCUTS when he swarms'],
  },
  {
    id: 'vance', name: 'DOLORES VANCE', nick: 'DEE', from: 'DETROIT, MI', record: '18-2', style: 'COUNTER-PUNCHER',
    bio: 'Waits. Watches. Makes you pay for every punch you miss. Rosewood has not seen her lose.',
    arena: 'rec', champ: 'ROSEWOOD CHAMPION',
    look: { skin: 3, hair: 'braids', hairC: '#1c1210', beard: 'none', trunks: ['#b05cff', '#7a34c4', '#4a1a80'], stripe: '#ffd36b', gloves: ['#ffd36b', '#c99a2e'], shoes: '#2a2033', build: { w: 0.9, h: 1.0 }, top: '#7a34c4' },
    lv: L({ power: 3, speed: 5, foot: 4, health: 3, stamina: 4, chin: 3, dodge: 6, bStraight: 5, bHook: 2, bUpper: 4 }),
    ai: { react: 0.2, def: DEF({ straight: 0.75, hook: 0.25, upper: 0.55, over: 0.6, body: 0.25 }), guard: 0.55, aggro: 0.3, range: 38, counter: 0.85, bodyIQ: 0.3, learn: 0.45, heart: 0.6,
      combos: [['C', 3], ['J C', 3], ['C H', 2], ['U H', 1]], quirks: ['counters'] },
    dmgTaken: DMG({ body: 1.35, hook: 1.25 }),
    strengths: ['COUNTERS - miss and she hits you back, hard', 'slips straights and uppercuts'],
    weaknesses: ['HOOKS - she can not duck them', 'BODY - work the body and her legs go'],
  },
  {
    id: 'petrov', name: 'IVAN PETROV', nick: 'THE FREEZER', from: 'MURMANSK', record: '21-1', style: 'TALL OUT-BOXER',
    bio: 'Six foot six and all of it jab. Keeps you at the end of a long cold pole.',
    arena: 'pier',
    look: { skin: 0, hair: 'buzz', hairC: '#c9b48a', beard: 'none', trunks: ['#e8eef4', '#aab6c4', '#6a7888'], stripe: '#3a6ed8', gloves: ['#3a6ed8', '#1f4499'], shoes: '#e8eef4', build: { w: 0.98, h: 1.14 } },
    lv: L({ power: 4, speed: 4, foot: 4, health: 5, stamina: 5, chin: 6, dodge: 3, bStraight: 6, bHook: 4, bUpper: 1 }),
    reach: 8,
    ai: { react: 0.22, def: DEF({ straight: 0.6, hook: 0.5, upper: 0.12, body: 0.4 }), guard: 0.5, aggro: 0.5, range: 46, counter: 0.35, bodyIQ: 0.2, learn: 0.45, heart: 0.7,
      combos: [['J', 4], ['J J', 3], ['J C', 3], ['J J C', 2]], quirks: ['circles', 'hatesInside'] },
    dmgTaken: DMG({ upper: 1.6 }),
    strengths: ['REACH - his jab lands from further than yours', 'IRON CHIN', 'tight high guard against straights'],
    weaknesses: ['INSIDE - get close and he panics, UPPERCUTS do 60% more', 'no answer to the uppercut at all'],
  },
  {
    id: 'hale', name: 'MARCUS HALE', nick: 'HAMMER', from: 'NEWARK, NJ', record: '24-3', style: 'PRESSURE FIGHTER',
    bio: 'Walks you down and breaks your ribs one at a time. Pier 9 belongs to him.',
    arena: 'pier', champ: 'PIER 9 CHAMPION',
    look: { skin: 4, hair: 'flattop', hairC: '#120c0a', beard: 'goatee', beardC: '#120c0a', trunks: ['#ff7a2e', '#d1501a', '#8a2e0a'], stripe: '#1a1a22', gloves: ['#1a1a22', '#000000'], shoes: '#ff7a2e', build: { w: 1.12, h: 1.0 } },
    lv: L({ power: 5, speed: 3, foot: 4, health: 5, stamina: 3, chin: 4, dodge: 2, bStraight: 5, bHook: 5, bUpper: 1, bBody: 4 }),
    ai: { react: 0.22, def: DEF({ straight: 0.55, hook: 0.6, upper: 0.15, body: 0.5 }), guard: 0.7, aggro: 0.75, range: 24, counter: 0.3, bodyIQ: 0.75, learn: 0.4, heart: 0.8,
      combos: [['H. H', 3], ['R. U', 2], ['J. C', 2], ['H. R. U', 2], ['J C H', 1]], quirks: ['swarms', 'gasses'] },
    dmgTaken: DMG({ upper: 1.4 }),
    strengths: ['BODY PUNCHER - drains your gas fast', 'PEEK-A-BOO GUARD - straights and hooks bounce off'],
    weaknesses: ['UPPERCUTS split the guard and do 40% more', 'all that pressure - he GASSES in the late rounds'],
  },
  {
    id: 'leo', name: 'LUCKY LEO SANTOS', nick: 'SHOWTIME', from: 'LAS VEGAS', record: '27-4', style: 'SHOWBOAT',
    bio: 'Gold trunks, gold teeth, golden reflexes. Loves the crowd more than he loves winning.',
    arena: 'casino',
    look: { skin: 2, hair: 'slick', hairC: '#140e0a', beard: 'stache', beardC: '#140e0a', trunks: ['#ffd84a', '#d9a400', '#8a6400'], stripe: '#ff3d7f', gloves: ['#ff3d7f', '#b81a52'], shoes: '#ffd84a', build: { w: 0.96, h: 1.0 } },
    lv: L({ power: 5, speed: 8, foot: 7, health: 5, stamina: 6, chin: 2, dodge: 7, bStraight: 5, bHook: 5, bUpper: 4, bBody: 4 }),
    ai: { react: 0.17, def: DEF({ straight: 0.7, hook: 0.6, upper: 0.5, over: 0.6, body: 0.45 }), guard: 0.25, aggro: 0.65, range: 34, counter: 0.5, bodyIQ: 0.35, learn: 0.4, heart: 0.5,
      combos: [['J C H', 3], ['U H', 2], ['J C H U', 2], ['C H C', 2], ['H H', 1]],
      special: { seq: 'J C H U', name: 'THE JACKPOT', tell: 0.4, every: 9, power: 1.25 },
      quirks: ['taunts', 'circles'] },
    dmgTaken: DMG({ head: 1.25 }),
    strengths: ['FASTEST HANDS on the strip', 'slips and ducks nearly everything', 'THE JACKPOT four-piece'],
    weaknesses: ['TAUNTS when he is ahead - wide open for a second, take it', 'GLASS JAW under all that gold'],
  },
  {
    id: 'mori', name: 'KENJI MORI', nick: 'THE PROFESSOR', from: 'OSAKA', record: '30-2', style: 'SWITCH-HITTER',
    bio: 'Has watched every fight you ever had. By round two he knows what you are going to throw before you do.',
    arena: 'casino', champ: 'LUCKY 7 CHAMPION',
    look: { skin: 1, hair: 'topknot', hairC: '#0e0a0a', beard: 'none', trunks: ['#f2f2f2', '#b9b9c2', '#6d6d78'], stripe: '#d8263c', gloves: ['#d8263c', '#8f1222'], shoes: '#f2f2f2', build: { w: 0.94, h: 1.02 } },
    lv: L({ power: 5, speed: 7, foot: 6, health: 6, stamina: 7, chin: 5, dodge: 6, bStraight: 6, bHook: 6, bUpper: 5, bBody: 2 }),
    ai: { react: 0.18, def: DEF({ straight: 0.55, hook: 0.55, upper: 0.5, over: 0.55, body: 0.2 }), guard: 0.5, aggro: 0.55, range: 34, counter: 0.6, bodyIQ: 0.6, learn: 1.0, heart: 0.7,
      combos: [['J C', 3], ['J. C', 2], ['J C H', 2], ['H. H', 2], ['U H', 1]], quirks: ['reads'] },
    dmgTaken: DMG({ body: 1.4 }),
    strengths: ['READS YOU - learns your favourite punch twice as fast as anyone', 'answers everything upstairs'],
    weaknesses: ['BODY - his low guard is an afterthought, 40% more', 'mix it up: he only reads what you REPEAT'],
  },
  {
    id: 'okafor', name: 'BRUTUS OKAFOR', nick: 'THE WALL', from: 'LAGOS / LONDON', record: '33-1', style: 'FORTRESS',
    bio: 'Nobody has knocked him down. Nobody has really tried twice.',
    arena: 'roof', champ: 'CONTINENTAL CHAMPION',
    look: { skin: 5, hair: 'bald', hairC: '#000', beard: 'short', beardC: '#0c0808', trunks: ['#2fbf5a', '#1d8a3c', '#0d5422'], stripe: '#f2f2f2', gloves: ['#f2f2f2', '#b0b0bc'], shoes: '#1a1a22', build: { w: 1.24, h: 1.12 } },
    lv: L({ power: 8, speed: 3, foot: 2, health: 9, stamina: 6, chin: 9, dodge: 1, bStraight: 9, bHook: 8, bUpper: 6, bBody: 2 }),
    reach: 5,
    ai: { react: 0.26, def: DEF({ straight: 0.8, hook: 0.75, upper: 0.5, over: 0.7, body: 0.15 }), guard: 0.9, aggro: 0.4, range: 30, counter: 0.4, bodyIQ: 0.4, learn: 0.5, heart: 0.95,
      combos: [['C', 3], ['R', 3], ['J R', 2], ['R. U', 2]],
      special: { seq: 'R', name: 'THE DROP', tell: 0.55, every: 8, power: 1.7 },
      quirks: ['walls'] },
    dmgTaken: DMG({ head: 0.75, body: 1.5, hook: 1.1 }),
    strengths: ['THE WALL - his high guard stops almost everything upstairs', 'IRON CHIN - the hardest head in the sport', 'THE DROP right hand'],
    weaknesses: ['BODY HOOKS - his liver is open, 50% more downstairs', 'SLOW FEET - make him turn'],
  },
  {
    id: 'carter', name: 'KING CARTER', nick: 'THE CHAMP', from: 'BROOKLYN, NY', record: '41-0', style: 'COMPLETE',
    bio: 'Undefeated. Does everything well. There is one crack, and he hides it well.',
    arena: 'garden', champ: 'WORLD CHAMPION',
    look: { skin: 4, hair: 'fade', hairC: '#0e0a08', beard: 'short', beardC: '#0e0a08', trunks: ['#f2f2f2', '#c9c9d2', '#7a7a88'], stripe: '#ffd36b', gloves: ['#ffd36b', '#b8861c'], shoes: '#f2f2f2', build: { w: 1.04, h: 1.04 }, belt: true },
    lv: L({ power: 8, speed: 8, foot: 7, health: 9, stamina: 8, chin: 7, dodge: 7, bStraight: 7, bHook: 7, bUpper: 6, bBody: 6 }),
    reach: 3,
    ai: { react: 0.15, def: DEF({ straight: 0.7, hook: 0.65, upper: 0.55, over: 0.65, body: 0.55 }), guard: 0.6, aggro: 0.65, range: 34, counter: 0.7, bodyIQ: 0.55, learn: 0.7, heart: 0.9,
      combos: [['J C H', 3], ['J C', 3], ['H. H', 2], ['C H C', 2], ['J C H U', 1]],
      special: { seq: 'J C R', name: 'THE CROWN', tell: 0.38, every: 10, power: 1.35 },
      quirks: ['breathes', 'wildWhenHurt'] },
    dmgTaken: DMG({}),
    strengths: ['DOES EVERYTHING - no real hole in the defence', 'THE CROWN three-piece', 'counters and reads like the Professor'],
    weaknesses: ['BREATHES after THE CROWN - stands still for most of a second', 'gets WILD when hurt - stops defending, starts swinging'],
  },
];

export const byId = (id) => ROSTER.find((r) => r.id === id);

// Skin ramps, light to dark. Index into this from look.skin.
export const SKINS = [
  ['#ffd9b8', '#eab48c', '#c08660'],
  ['#f6caa0', '#d9a074', '#a8704a'],
  ['#e0ac7e', '#c08656', '#8c5a34'],
  ['#c08a5c', '#9c6a40', '#6e4626'],
  ['#9a6640', '#784c2c', '#52321c'],
  ['#6e4428', '#52301a', '#341e10'],
];

// The player. Gym stats replace lv; the look is fixed but readable against
// everybody above (red corner, red trunks).
export const PLAYER_LOOK = {
  skin: 1, hair: 'messy', hairC: '#5a3a26', beard: 'none', trunks: ['#ff5b4d', '#d2372c', '#8a1e16'], stripe: '#ffe9c0',
  gloves: ['#ff5b4d', '#b02a20'], shoes: '#f6f2e6', build: { w: 1.0, h: 1.0 },
};
export const RIVAL_LOOK = {
  skin: 3, hair: 'short', hairC: '#1a120e', beard: 'none', trunks: ['#4f8fe8', '#2f63b8', '#1a3a78'], stripe: '#ffffff',
  gloves: ['#4f8fe8', '#24489a'], shoes: '#1a1a22', build: { w: 1.0, h: 1.0 },
};
