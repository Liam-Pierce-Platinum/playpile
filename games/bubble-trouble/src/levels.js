// Levels are strips of hand-made 15-row segments, glued left to right.
// Tiles: # candy block  = wafer (one-way)  B gum crate (slam breaks)  ^ rock-candy spikes
// Things: P start  o candy  G golden gumball  H heart  C checkpoint  E exit machine  i sign
//         s spring  w sour drop (walker)  h jelly bean (hopper)  f gummy bee (flyer)  K boss
export const T = 32;

// Segment lines are bottom-aligned (last line = row 14); short lines are right-padded with '.'.
const SEG = {
  start: [
    '.P..i.....',
    '##########', '##########', '##########'],
  flat: [
    '..............',
    '..o.o.o...w...',
    '##############', '##############', '##############'],
  gap: [
    '.....oo.....',
    '....o..o....',
    '............',
    '............',
    '####....####', '####....####', '####....####'],
  stairs: [
    '..........G.....',
    '.........####...',
    '......o..####...',
    '......#######...',
    '...o..#######...',
    '...##########...',
    '...##########...',
    '################', '################', '################'],
  floatgap: [
    '.....o.......o......',
    '...o.....G.....o....',
    '....................',
    '....................',
    '.i..................',
    '####..........######', '####..........######', '####..........######'],
  wall: [
    '........G.....',
    '......########',
    '......########',
    '......########',
    '......########',
    '..i...########',
    '......########',
    '##############', '##############', '##############'],
  tallwall: [
    '.......G......',
    '.....o#########',
    '......#########',
    '.....o#########',
    '......#########',
    '.....o#########',
    '......#########',
    '......#########',
    '......#########',
    '##.....########',
    '###############', '###############', '###############'],
  spikes: [
    '.......o........',
    '................',
    '.....====.......',
    '...^^^^^^^^^^...',
    '################', '################', '################'],
  crate: [
    '..i...........',
    '####BBBBBB####',
    '####.oGoo.####',
    '##############'],
  spring: [
    '..........G...',
    '.........====.',
    '..............', '..............', '..............', '..............', '..............',
    '..........o...',
    '....s.........',
    '##############', '##############', '##############'],
  enemies: [
    '........o.o.......',
    '..................',
    '...w.....h.....w..',
    '##################', '##################', '##################'],
  flyers: [
    '.......f..........',
    '...........f......',
    '.....o.....o......',
    '..................',
    '..................',
    '..................',
    '###............###', '###............###', '###............###'],
  pillars: [
    '...o....o....o....',
    '...##...##...##...',
    '...##...##...##...',
    '##.##...##...##.##', '##.##...##...##.##', '##.##...##...##.##'],
  sourpit: [
    '.....w....w.....',
    '....####..####..',
    '...^^^^^^^^^^...',
    '################', '################', '################'],
  check: [
    '..C...',
    '######', '######', '######'],
  end: [
    '.......E....',
    '############', '############', '############'],
};

const BOSS_ROWS = [
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#.....H..............H.......#',
  '#....====............====....#',
  '#............................#',
  '#............................#',
  '#.P..................K.......#',
  '##############################',
  '##############################',
  '##############################',
];

export const LEVELS = [
  { name: 'SUGAR STREET', theme: 0,
    segs: ['start', 'flat', 'gap', 'stairs', 'check', 'crate', 'enemies', 'gap', 'spring', 'end'],
    hints: { start: 'A D / ARROWS to roll  -  SPACE to jump', crate: 'In the air, S / DOWN = SLAM. Smash the gum crates!' } },
  { name: 'BUBBLE BOULEVARD', theme: 1,
    segs: ['start', 'floatgap', 'flat', 'check', 'wall', 'pillars', 'enemies', 'floatgap', 'end'],
    hints: { floatgap: 'HOLD JUMP in the air to blow a bubble and float', wall: 'Hold toward a wall to STICK. Jump again to climb' } },
  { name: 'STICKY HEIGHTS', theme: 2,
    segs: ['start', 'wall', 'spikes', 'gap', 'check', 'tallwall', 'flyers', 'sourpit', 'stairs', 'end'],
    hints: { tallwall: 'Stick, jump, stick, jump... keep holding toward the wall' } },
  { name: 'SOUR SIDE', theme: 3,
    segs: ['start', 'enemies', 'sourpit', 'pillars', 'check', 'flyers', 'crate', 'spikes', 'wall', 'floatgap', 'end'],
    hints: { crate: 'Something shiny under those crates...' } },
  { name: 'ROCK CANDY ROOFTOPS', theme: 4,
    segs: ['start', 'tallwall', 'floatgap', 'sourpit', 'check', 'flyers', 'pillars', 'spikes', 'check', 'stairs', 'spring', 'sourpit', 'end'],
    hints: {} },
  { name: 'THE SOUR KING', theme: 5, boss: true, rows: BOSS_ROWS, hints: {} },
];

export function buildLevel(def) {
  let rows;
  const hints = [];
  if (def.rows) rows = def.rows.slice();
  else {
    rows = Array(15).fill('');
    const used = new Set();
    for (const name of def.segs) {
      const s = SEG[name];
      const w = Math.max(...s.map((l) => l.length));
      const lines = Array(15 - s.length).fill('').concat(s);
      const hint = def.hints && def.hints[name] && !used.has(name) ? def.hints[name] : null;
      if (hint) { used.add(name); hints.push(hint); }
      for (let y = 0; y < 15; y++) {
        let l = lines[y].padEnd(w, '.');
        if (!hint) l = l.replace(/i/g, '.');
        rows[y] += l;
      }
    }
  }
  const h = rows.length, w = rows[0].length;
  const g = rows.map((r) => r.padEnd(w, '.').split(''));
  const L = { w, h, g, theme: def.theme, name: def.name, boss: null, items: [], enemies: [], checks: [], signs: [], springs: [], start: { x: 64, y: 352 }, exit: null };
  let si = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = g[y][x], px = x * T, py = y * T;
    if ('#=B^'.includes(c) || c === '.') continue;
    g[y][x] = '.';
    if (c === 'P') L.start = { x: px, y: py };
    else if (c === 'o' || c === 'G' || c === 'H') L.items.push({ type: c, x: px + 16, y: py + 16 });
    else if (c === 'w' || c === 'h' || c === 'f') L.enemies.push({ type: c, x: px + 3, y: py + T - 24 });
    else if (c === 'C') L.checks.push({ x: px, y: py, on: false });
    else if (c === 'E') L.exit = { x: px - 8, y: py + T - 72, w: 48, h: 72 };
    else if (c === 'i') { const text = hints[si++]; if (text) L.signs.push({ x: px, y: py, text }); }
    else if (c === 's') L.springs.push({ x: px, y: py, t: 0 });
    else if (c === 'K') L.boss = { x: px, y: py };
  }
  return L;
}
