// The rules of the punch. Every number the fight uses lives here so balance is
// one file. Times are seconds at 1x speed; a fighter's hand speed scales them.
//
// A punch is (kind, hand, target). Kind decides the shape, hand decides which
// arm, target is head or body. The table is keyed `kind:hand`.

export const PUNCH = {
  'straight:lead': { name: 'JAB',        start: 0.09, active: 0.05, rec: 0.13, dmg: 4.5, stam: 3,  reach: 38, knock: 26 },
  'straight:rear': { name: 'CROSS',      start: 0.15, active: 0.05, rec: 0.20, dmg: 8.5, stam: 6,  reach: 42, knock: 50 },
  'hook:lead':     { name: 'LEAD HOOK',  start: 0.18, active: 0.06, rec: 0.23, dmg: 10.5, stam: 8, reach: 31, knock: 44 },
  'hook:rear':     { name: 'REAR HOOK',  start: 0.22, active: 0.06, rec: 0.26, dmg: 12,  stam: 9,  reach: 31, knock: 52 },
  'upper:lead':    { name: 'LEAD UPPER', start: 0.19, active: 0.06, rec: 0.25, dmg: 10.5, stam: 8, reach: 25, knock: 30 },
  'upper:rear':    { name: 'UPPERCUT',   start: 0.23, active: 0.06, rec: 0.28, dmg: 13,  stam: 10, reach: 25, knock: 36 },
  'over:rear':     { name: 'OVERHAND',   start: 0.30, active: 0.06, rec: 0.32, dmg: 15,  stam: 12, reach: 38, knock: 60 },
  'star:rear':     { name: 'STAR PUNCH', start: 0.40, active: 0.07, rec: 0.42, dmg: 26,  stam: 0,  reach: 42, knock: 140 },
};

export function spec(kind, hand) {
  return PUNCH[kind + ':' + hand] || PUNCH[kind + ':rear'] || PUNCH[kind + ':lead'];
}

// One letter per punch, used to spell combos. Body shots get a trailing dot.
export function sig(p) {
  const L = {
    'straight:lead': 'J', 'straight:rear': 'C', 'hook:lead': 'H', 'hook:rear': 'R',
    'upper:lead': 'L', 'upper:rear': 'U', 'over:rear': 'O', 'star:rear': '*',
  }[p.kind + ':' + p.hand] || '?';
  return p.target === 'body' ? L + '.' : L;
}

// Named combos. Land the sequence (each punch thrown inside the previous one's
// cancel window) and the name goes up in lights. Every step past the first in
// a chain hits a little harder; finishing a NAMED one pays star power.
export const COMBOS = [
  { seq: 'J J',       name: 'DOUBLE JAB',      star: 0.15 },
  { seq: 'J C',       name: 'ONE-TWO',         star: 0.2 },
  { seq: 'J J C',     name: 'DOUBLE-JAB CROSS', star: 0.3 },
  { seq: 'J C H',     name: 'ONE-TWO-THREE',   star: 0.35 },
  { seq: 'J C H U',   name: 'THE FULL FOUR',   star: 0.6 },
  { seq: 'H U',       name: 'HOOK-UPPER',      star: 0.25 },
  { seq: 'U H',       name: 'UPPER-HOOK',      star: 0.3 },
  { seq: 'C H C',     name: 'CROSS-HOOK-CROSS', star: 0.4 },
  { seq: 'J H C',     name: 'JAB-HOOK-CROSS',  star: 0.35 },
  { seq: 'H H',       name: 'DOUBLE HOOK',     star: 0.25 },
  { seq: 'H. H',      name: 'BODY-HEAD HOOK',  star: 0.45 },
  { seq: 'J. C',      name: 'JAB DOWNSTAIRS',  star: 0.3 },
  { seq: 'R. U',      name: 'LIVER-CHIN',      star: 0.5 },
  { seq: 'J C. H',    name: 'MIX IT UP',       star: 0.45 },
  { seq: 'U O',       name: 'SKY FALL',        star: 0.5 },
  { seq: 'H. R. U',   name: 'THE DIG',         star: 0.6 },
];

// ---------------------------------------------------------------- stats ---
// The gym. Every stat goes 0..10. `fx` turns a level into the number the fight
// actually reads; `blurb` is what the gym page says it does.
export const STATS = [
  { id: 'power',   name: 'POWER',          blurb: 'every punch hits harder' },
  { id: 'speed',   name: 'HAND SPEED',     blurb: 'punches come out and come back faster' },
  { id: 'foot',    name: 'FOOTWORK',       blurb: 'move around the ring faster' },
  { id: 'health',  name: 'HEALTH',         blurb: 'a bigger health bar' },
  { id: 'stamina', name: 'STAMINA',        blurb: 'more gas in the tank, and it refills faster' },
  { id: 'chin',    name: 'CHIN',           blurb: 'head shots hurt less and you get up quicker' },
  { id: 'dodge',   name: 'DODGING',        blurb: 'slips and ducks last longer and reset faster' },
  { id: 'bStraight', name: 'BLOCK: STRAIGHTS', blurb: 'jabs, crosses and overhands leak less through the guard' },
  { id: 'bHook',   name: 'BLOCK: HOOKS',   blurb: 'hooks leak less through the guard' },
  { id: 'bUpper',  name: 'BLOCK: UPPERCUTS', blurb: 'uppercuts stop splitting your guard' },
  { id: 'bBody',   name: 'BLOCK: BODY',    blurb: 'the low guard soaks more of a body shot' },
];
export const MAX_LEVEL = 10;
export const statCost = (lvl) => lvl + 1;   // level 0->1 costs 1 EP, 9->10 costs 10

// Turn gym levels (or an NPC's sheet, which uses the same scale) into the
// numbers the fight reads.
export function resolveStats(lv) {
  const g = (k) => lv[k] || 0;
  return {
    hpMax: 135 + 12 * g('health'),
    stamMax: 100 + 8 * g('stamina'),
    regen: 15 + 1.3 * g('stamina'),
    power: 1 + 0.06 * g('power'),
    speed: 1 - 0.03 * g('speed'),             // multiplies punch times
    foot: 66 * (1 + 0.05 * g('foot')),         // px per second
    chin: 1 - 0.035 * g('chin'),               // multiplies head damage taken
    chinLv: g('chin'),
    dodgeWin: 0.2 + 0.016 * g('dodge'),        // seconds a slip/duck is safe
    dodgeLen: 0.44 - 0.01 * g('dodge'),        // whole move, start to reset
    blk: {
      straight: 0.55 + 0.04 * g('bStraight'),
      hook: 0.5 + 0.045 * g('bHook'),
      upper: 0.3 + 0.05 * g('bUpper'),
      body: 0.5 + 0.045 * g('bBody'),
    },
    reach: 0,
  };
}

// Energy points for a win. Campaign pays more than free play; a stoppage and
// a clean sheet both pay a bonus.
export function epFor({ mode, bout = 0, ko, perfect, title }) {
  if (mode === 'online') return 6 + (ko ? 2 : 0);
  if (mode === 'free') return 2 + (ko ? 1 : 0);
  if (mode === 'special') return 4 + (title ? 3 : 0);
  return 4 + bout + (ko ? 3 : 0) + (perfect ? 3 : 0) + (title ? 5 : 0);
}
