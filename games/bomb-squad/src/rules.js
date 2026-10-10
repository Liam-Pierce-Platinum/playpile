// THE RULES. Every module's rules live here as data: the manual text is printed straight
// from these entries, and the game checks your moves with the same entries, so the
// booklet can never disagree with the bomb. tools/solver.mjs re-implements the manual
// independently and proves every generated module can be solved from it.
import { rng, ri, pick, shuffle } from './rng.js';

// ---------- the bomb's outside: serial plate, batteries, indicator lights ----------
export const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXZ'; // no I, O or Y (they look like 1, 0 and V)
export const VOWELS = 'AEU';
export const INDICATOR_LABELS = ['SIG', 'FRQ', 'CLR', 'NSA', 'TRN', 'MSA'];

export function makeWidgets(R) {
  let serial = '';
  for (let i = 0; i < 5; i++) serial += R() < 0.6 ? pick(R, LETTERS) : String(ri(R, 0, 9));
  serial += String(ri(R, 0, 9));
  const labels = shuffle(R, INDICATOR_LABELS).slice(0, ri(R, 0, 2));
  return {
    serial,
    batteries: ri(R, 0, 4),
    indicators: labels.map(label => ({ label, lit: R() < 0.55 })),
  };
}
// Everything the rules may ask about the outside of the bomb.
export function facts(w) {
  const last = +w.serial[w.serial.length - 1];
  return {
    last, odd: last % 2 === 1, even: last % 2 === 0,
    vowel: [...w.serial].some(c => VOWELS.includes(c)),
    bat: w.batteries,
    anyLit: w.indicators.some(i => i.lit),
    lit: label => w.indicators.some(i => i.lit && i.label === label),
  };
}

const count = (arr, c) => arr.filter(x => x === c).length;

// ---------- WIRES ----------
export const WIRE_COLORS = ['red', 'blue', 'yellow', 'white', 'black'];
// {red} etc. in the text turns into a colour chip in the manual.
export const WIRE_RULES = {
  3: [
    { if: 'There are no {red} wires', test: (w) => count(w, 'red') === 0, then: 'cut the 2nd wire', cut: () => 1 },
    { if: 'The 1st wire is {yellow}', test: (w) => w[0] === 'yellow', then: 'cut the last wire', cut: (w) => w.length - 1 },
    { if: 'There is more than one {blue} wire', test: (w) => count(w, 'blue') > 1, then: 'cut the 1st {blue} wire', cut: (w) => w.indexOf('blue') },
    { if: 'Otherwise', test: () => true, then: 'cut the last {red} wire', cut: (w) => w.lastIndexOf('red') },
  ],
  4: [
    { if: 'There is more than one {red} wire and the serial ends in an odd digit', test: (w, f) => count(w, 'red') > 1 && f.odd, then: 'cut the last {red} wire', cut: (w) => w.lastIndexOf('red') },
    { if: 'There are no {yellow} wires', test: (w) => count(w, 'yellow') === 0, then: 'cut the 3rd wire', cut: () => 2 },
    { if: 'There is exactly one {white} wire', test: (w) => count(w, 'white') === 1, then: 'cut the 1st wire', cut: () => 0 },
    { if: 'Otherwise', test: () => true, then: 'cut the last wire', cut: (w) => w.length - 1 },
  ],
  5: [
    { if: 'The last wire is {black}', test: (w) => w[w.length - 1] === 'black', then: 'cut the 2nd wire', cut: () => 1 },
    { if: 'There is exactly one {red} wire and 2 or more batteries', test: (w, f) => count(w, 'red') === 1 && f.bat >= 2, then: 'cut the 1st wire', cut: () => 0 },
    { if: 'There are no {white} wires', test: (w) => count(w, 'white') === 0, then: 'cut the last wire', cut: (w) => w.length - 1 },
    { if: 'Otherwise', test: () => true, then: 'cut the 4th wire', cut: () => 3 },
  ],
  6: [
    { if: 'There are no {yellow} wires and the serial ends in an even digit', test: (w, f) => count(w, 'yellow') === 0 && f.even, then: 'cut the 4th wire', cut: () => 3 },
    { if: 'There is more than one {white} wire', test: (w) => count(w, 'white') > 1, then: 'cut the last {white} wire', cut: (w) => w.lastIndexOf('white') },
    { if: 'There are no {black} wires', test: (w) => count(w, 'black') === 0, then: 'cut the 2nd wire', cut: () => 1 },
    { if: 'Otherwise', test: () => true, then: 'cut the 5th wire', cut: () => 4 },
  ],
};
export function firstRule(rules, ...args) { return rules.findIndex(r => r.test(...args)); }
export function wireAnswer(colors, f) { const rs = WIRE_RULES[colors.length]; return rs[firstRule(rs, colors, f)].cut(colors); }

// ---------- THE BUTTON ----------
export const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'];
export const BUTTON_LABELS = ['HOLD', 'PUSH', 'ABORT', 'DEFUSE'];
export const BUTTON_RULES = [
  { if: 'The button is {red} and says HOLD', test: (b) => b.color === 'red' && b.label === 'HOLD', act: 'tap' },
  { if: 'It says PUSH and there are 2 or more batteries', test: (b, f) => b.label === 'PUSH' && f.bat >= 2, act: 'tap' },
  { if: 'The button is {blue}', test: (b) => b.color === 'blue', act: 'hold' },
  { if: 'It says ABORT and the serial has a vowel', test: (b, f) => b.label === 'ABORT' && f.vowel, act: 'tap' },
  { if: 'The button is {white}', test: (b) => b.color === 'white', act: 'hold' },
  { if: 'Otherwise', test: () => true, act: 'tap' },
];
// While held, a light strip comes on. Let go when the clock's LAST digit matches.
export const STRIP_DIGIT = { red: 2, blue: 7, yellow: 5, white: 0 };
export const TAP_MAX = 0.45; // seconds: shorter than this is a tap, longer is a hold
export function buttonAct(b, f) { return BUTTON_RULES[firstRule(BUTTON_RULES, b, f)].act; }

// ---------- SWITCHES ----------
export const SWITCH_COLORS = ['red', 'blue', 'green', 'yellow', 'white'];
export const SWITCH_RULES = {
  red: { text: 'UP if there are 2 or more batteries', up: (i, f) => f.bat >= 2 },
  blue: { text: 'UP if the serial has a vowel', up: (i, f) => f.vowel },
  green: { text: 'UP if it sits in an odd slot (1st, 3rd, 5th)', up: (i) => i % 2 === 0 },
  yellow: { text: 'UP if any indicator light is lit', up: (i, f) => f.anyLit },
  white: { text: 'UP if the serial ends in an odd digit', up: (i, f) => f.odd },
};
export function switchTarget(colors, f) { return colors.map((c, i) => SWITCH_RULES[c].up(i, f)); }

// ---------- KEYPAD (symbols drawn as SVG path data on a 20x20 box; canvas uses Path2D) ----------
export const SYMBOLS = [
  'M2 10 Q10 2 18 10 Q10 18 2 10 Z M12.5 10 A2.5 2.5 0 1 1 7.5 10 A2.5 2.5 0 1 1 12.5 10',      // 0 eye
  'M10 3 L10 18 M4 4 L4 8 Q4 12 10 12 Q16 12 16 8 L16 4 M6.5 15.5 L13.5 15.5',                     // 1 trident
  'M13 2.5 A7.5 7.5 0 1 0 13 17.5 A5.8 5.8 0 1 1 13 2.5 Z',                                         // 2 crescent
  'M10 10 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -6 0 a5 5 0 1 1 10 0 a7 7 0 1 1 -14 0',                   // 3 spiral
  'M12 2 L5 11.5 L10 11.5 L8 18 L15 8 L10.5 8 Z',                                                   // 4 bolt
  'M10 6 L10 17 M6.5 8.5 L13.5 8.5 M4 12 Q4 17 10 17 Q16 17 16 12 M11.8 4 A1.8 1.8 0 1 1 8.2 4 A1.8 1.8 0 1 1 11.8 4', // 5 anchor
  'M4 3 L16 3 L4 17 L16 17 Z',                                                                      // 6 hourglass
  'M3 17 L7.5 17 L7.5 15 Q3 12.5 3.5 8.5 Q4.5 3 10 3 Q15.5 3 16.5 8.5 Q17 12.5 12.5 15 L12.5 17 L17 17', // 7 horseshoe
  'M6 18 L6 6 Q6 2.5 9.5 2.5 Q13.5 2.5 13.5 6.5 Q13.5 10 9.5 10 L6 10 M10 13 L15.5 18.5',           // 8 hooked R
  'M10 2.5 L18 17 L2 17 Z M11.3 12.3 A1.3 1.3 0 1 1 8.7 12.3 A1.3 1.3 0 1 1 11.3 12.3',             // 9 triangle dot
  'M9 2 L9 18 M3.5 7.5 L14.5 7.5 M14.5 7.5 Q17 7.5 17 10.5 Q17 13 14 13',                           // 10 hooked cross
  'M2 8 Q6 4 10 8 Q14 12 18 8 M2 14 Q6 10 10 14 Q14 18 18 14',                                     // 11 waves
  'M10 2 L18 10 L10 18 L2 10 Z M6 6 L14 14',                                                       // 12 split diamond
  'M10 18 L10 9 L4 3 M10 9 L16 3 M10 9 L10 2.5',                                                   // 13 fork
  'M4 11 L15.5 11 Q15.5 4 10 4 Q4 4 4 10.5 Q4 17 11 17 L16 17',                                     // 14 curly e
  'M10 9 L10 18.5 M5 12.5 L15 12.5 M10 9 Q6 9 6 5.5 Q6 2 10 2 Q14 2 14 5.5 Q14 9 10 9',              // 15 ankh
  'M13.5 10 A3.5 3.5 0 1 1 6.5 10 A3.5 3.5 0 1 1 13.5 10 M10 1 L10 4 M10 16 L10 19 M1 10 L4 10 M16 10 L19 10 M3.6 3.6 L5.7 5.7 M14.3 14.3 L16.4 16.4', // 16 sun
  'M15 3 L6 3 L6 17 L15 17 M10.5 7 L10.5 13',                                                       // 17 bracket bar
  'M3 3.5 L17 3.5 L3 16.5 L17 16.5 M6.5 10 L13.5 10',                                               // 18 crossed Z
  'M2.5 5 L17.5 5 M7 5 Q7 14 3.5 17.5 M13 5 L13 15 Q13 17.5 16.5 16.5',                             // 19 pi
  'M12 10 A4.5 4.5 0 1 1 3 10 A4.5 4.5 0 1 1 12 10 M17 10 A4.5 4.5 0 1 1 8 10 A4.5 4.5 0 1 1 17 10', // 20 twin rings
];
// Five columns of six. Every symbol is in at least one column; some are in two.
export const KEY_COLUMNS = [
  [0, 1, 2, 3, 4, 5],
  [6, 0, 7, 8, 9, 3],
  [10, 11, 6, 12, 1, 13],
  [14, 15, 8, 16, 10, 2],
  [17, 18, 19, 20, 12, 14],
];
export function keypadColumn(syms) { return KEY_COLUMNS.findIndex(col => syms.every(s => col.includes(s))); }
export function keypadOrder(syms) { const col = KEY_COLUMNS[keypadColumn(syms)]; return syms.map((s, i) => i).sort((a, b) => col.indexOf(syms[a]) - col.indexOf(syms[b])); }

// ---------- SIMON (pads: top red, right blue, bottom green, left yellow) ----------
export const SIMON_COLORS = ['red', 'blue', 'green', 'yellow'];
export const SIMON_MAP = {
  even: { red: 'blue', blue: 'red', green: 'yellow', yellow: 'green' },
  odd: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
};
export function simonTable(f) { return f.bat % 2 === 0 ? SIMON_MAP.even : SIMON_MAP.odd; }

// ---------- DIAL MAZE: six fixed 5x5 mazes, each marked by one ring in its own spot ----------
export const MAZE_N = 5;
export const DIRS = { up: [0, -1, 1], right: [1, 0, 2], down: [0, 1, 4], left: [-1, 0, 8] }; // dx, dy, wall-open bit
const OPP = { 1: 4, 4: 1, 2: 8, 8: 2 };
function buildMazes() {
  const R = rng(90210);
  const rings = shuffle(R, Array.from({ length: 25 }, (_, i) => i)).slice(0, 6);
  const out = [];
  for (let m = 0; m < 6; m++) {
    const open = new Array(25).fill(0), seen = new Array(25).fill(false);
    const stack = [ri(R, 0, 24)]; seen[stack[0]] = true;
    while (stack.length) {
      const c = stack[stack.length - 1], x = c % 5, y = (c / 5) | 0;
      const nb = Object.values(DIRS).map(([dx, dy, bit]) => [x + dx, y + dy, bit]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < 5 && ny < 5 && !seen[ny * 5 + nx]);
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, bit] = pick(R, nb), n = ny * 5 + nx;
      open[c] |= bit; open[n] |= OPP[bit]; seen[n] = true; stack.push(n);
    }
    // knock out two extra walls so there are a few loops
    for (let k = 0; k < 2; k++) {
      const c = ri(R, 0, 24), x = c % 5, y = (c / 5) | 0;
      const opts = Object.values(DIRS).filter(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < 5 && y + dy < 5);
      const [dx, dy, bit] = pick(R, opts); open[c] |= bit; open[(y + dy) * 5 + x + dx] |= OPP[bit];
    }
    out.push({ open, ring: rings[m] });
  }
  return out;
}
export const MAZES = buildMazes();
export function mazeFromRing(cell) { return MAZES.findIndex(m => m.ring === cell); }
export function mazeDist(open, a, b) {
  const d = new Array(25).fill(-1); d[a] = 0; const q = [a];
  while (q.length) { const c = q.shift(); for (const [dx, dy, bit] of Object.values(DIRS)) if (open[c] & bit) { const n = c + dx + dy * 5; if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); } } }
  return d[b];
}

// ---------- CODE WHEEL ----------
export const WORDS = ['BELL', 'BOLT', 'CODE', 'CORK', 'DESK', 'DIAL', 'FIRE', 'FUSE', 'GEAR', 'GLOW', 'HOOK', 'LAMP',
  'LOCK', 'MINE', 'NAIL', 'PIPE', 'ROPE', 'SAFE', 'SNIP', 'TAPE', 'TICK', 'VOLT', 'WIRE', 'ZERO'];
export function formable(wheels) { return WORDS.filter(w => [...w].every((c, i) => wheels[i].includes(c))); }

// ---------- VENT (needy) ----------
export const VENT_COLORS = ['red', 'green', 'blue'];
export const VENT_VALVE = { red: 0, green: 1, blue: 2 }; // 0 left, 1 middle, 2 right
export function ventAnswer(color, blink) { return (VENT_VALVE[color] + (blink ? 1 : 0)) % 3; }
export const VENT_TIME = 14; // seconds to answer once it starts hissing

// ---------- GENERATORS ----------
export const MODULE_TYPES = ['wires', 'button', 'switches', 'keypad', 'simon', 'maze', 'code'];
export const MODULE_NAMES = { wires: 'Wires', button: 'The Button', switches: 'Switches', keypad: 'Keypad', simon: 'Simon', maze: 'Dial Maze', code: 'Code Wheel', vent: 'Vent (needy)' };

const gens = {
  wires(R, f, d) {
    const n = ri(R, d.wires?.[0] ?? 3, d.wires?.[1] ?? 6), rs = WIRE_RULES[n];
    const want = ri(R, 0, rs.length - 1); // aim for an even spread of which rule fires
    let colors;
    for (let t = 0; t < 300; t++) {
      colors = Array.from({ length: n }, () => pick(R, WIRE_COLORS));
      if (firstRule(rs, colors, f) === want) break;
    }
    return { colors, sag: colors.map(() => R() * 2 - 1) };
  },
  button(R, f) {
    const want = ri(R, 0, BUTTON_RULES.length - 1);
    let b;
    for (let t = 0; t < 300; t++) { b = { color: pick(R, BUTTON_COLORS), label: pick(R, BUTTON_LABELS) }; if (firstRule(BUTTON_RULES, b, f) === want) break; }
    b.strip = pick(R, Object.keys(STRIP_DIGIT));
    return b;
  },
  switches(R, f) {
    const colors = Array.from({ length: 5 }, () => pick(R, SWITCH_COLORS));
    const target = switchTarget(colors, f);
    let start;
    do { start = colors.map(() => R() < 0.5); } while (start.every((s, i) => s === target[i]));
    return { colors, start };
  },
  keypad(R) {
    for (;;) {
      const col = pick(R, KEY_COLUMNS), syms = shuffle(R, col).slice(0, 4);
      if (KEY_COLUMNS.filter(c => syms.every(s => c.includes(s))).length === 1) return { syms };
    }
  },
  simon(R, f, d) { return { seq: Array.from({ length: d.simon ?? 3 }, () => pick(R, SIMON_COLORS)) }; },
  maze(R, f, d) {
    const maze = ri(R, 0, MAZES.length - 1), open = MAZES[maze].open;
    for (;;) {
      const start = ri(R, 0, 24), goal = ri(R, 0, 24), dist = mazeDist(open, start, goal);
      if (dist >= (d.mazeMin ?? 4) && dist <= (d.mazeMax ?? 8)) return { maze, start, goal };
    }
  },
  code(R) {
    for (;;) {
      const word = pick(R, WORDS), others = WORDS.filter(w => w !== word);
      const wheels = [...word].map((c, i) => {
        const set = new Set([c]);
        while (set.size < 5) set.add(R() < 0.65 ? pick(R, others)[i] : pick(R, LETTERS));
        return shuffle(R, [...set]);
      });
      if (formable(wheels).length === 1) return { wheels, start: wheels.map(w => ri(R, 0, 4)) };
    }
  },
  vent(R) { return { seed: ri(R, 1, 1e9) }; },
};

// spec: { mods: [...types], time, needy, diff }
export function genBomb(spec, seed) {
  const R = rng(seed);
  const widgets = makeWidgets(R);
  const f = facts(widgets);
  const d = spec.diff || {};
  const types = spec.mods.slice();
  if (spec.needy) types.push('vent');
  const modules = types.map(type => ({ type, data: gens[type](R, f, d) }));
  return { seed, widgets, modules, time: spec.time };
}

// Pick n different module types (repeats only if n > the pool).
export function randomMods(R, n, pool = MODULE_TYPES) {
  const out = [];
  let bag = shuffle(R, pool);
  while (out.length < n) { if (!bag.length) bag = shuffle(R, pool); out.push(bag.pop()); }
  return out;
}
