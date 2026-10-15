// Level data. Ground is y=172 (screen is 180 tall). Building = [x, width, height-from-ground].
// ring = [x,y]. shell = [x,y]. wire = [x1,y1,x2,y2,sag]. bird = [x,y,range,speed].
// via = extra waypoints only the test bot uses. pops = fireworks you must burst to clear.
export const GROUND = 172;
export const COLORS = ['#ff4f6d', '#ffd23f', '#3fd0ff', '#9dff5c', '#c77dff', '#ff9a3c'];

function cluster(cx, cy, n, sp = 13) {
  const out = []; const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) out.push([cx + (i % cols - (cols - 1) / 2) * sp + (Math.floor(i / cols) % 2) * sp / 2, cy + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * sp * 0.85]);
  return out;
}
function heart(cx, cy, s, n = 14) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; out.push([cx + 16 * Math.sin(t) ** 3 * s, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s]); }
  return out;
}
function star(cx, cy, r1, r2) {
  const out = [];
  for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2, r = i % 2 ? r2 : r1; out.push([cx + Math.sin(t) * r, cy - Math.cos(t) * r]); }
  return out;
}
function circle(cx, cy, r, n) { const out = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return out; }

const B = (x, w, h) => [x, w, h];

export const LEVELS = [
  {
    name: 'FIRST LIGHT', hint: 'HOLD SPACE TO THRUST - ARROWS TURN', w: 440, fuel: 10, start: [40, GROUND],
    buildings: [B(150, 40, 26), B(250, 30, 40)],
    rings: [[110, 120], [200, 80], [300, 105]],
    shells: [cluster(380, 70, 3)], pops: 3,
  },
  {
    name: 'OVER THE TOP', hint: 'THRUST ONLY PUSHES WHERE YOU FACE', w: 540, fuel: 11, start: [40, GROUND],
    buildings: [B(150, 50, 90), B(330, 60, 60), B(250, 30, 24)],
    rings: [[100, 95], [175, 52], [265, 118], [360, 82], [460, 120]],
    shells: [cluster(480, 62, 2)], pops: 2,
  },
  {
    name: 'CHAIN REACTION', hint: 'TOUCH ONE - THEY ALL GO', w: 500, fuel: 6, start: [40, GROUND],
    buildings: [B(200, 40, 40), B(390, 50, 30)],
    rings: [[140, 110]],
    shells: [cluster(300, 72, 10), cluster(440, 105, 5)], pops: 15,
  },
  {
    name: 'LIVE WIRES', hint: 'WIRES SNAG - DROP IN, CLIMB OUT', w: 660, fuel: 14, start: [30, GROUND],
    buildings: [B(80, 30, 110), B(200, 30, 120), B(330, 30, 100), B(460, 30, 115), B(580, 40, 80)],
    wires: [[110, 120, 200, 116, 12], [230, 110, 330, 114, 12], [360, 134, 460, 130, 8], [490, 116, 580, 122, 12]],
    rings: [[155, 94], [280, 86], [410, 96], [535, 92]],
    shells: [cluster(280, 34, 3)], pops: 3,
  },
  {
    name: 'BIRD SEASON', hint: 'BIRDS HURT - TIME YOUR GAPS', w: 640, fuel: 11, start: [40, GROUND],
    buildings: [B(230, 40, 40), B(400, 30, 50)],
    birds: [[190, 95, 30, 1.2], [300, 60, 40, 1.6], [430, 105, 35, 1.4], [520, 70, 30, 2]],
    rings: [[140, 120], [250, 72], [360, 122], [470, 56], [580, 110]],
    shells: [cluster(330, 30, 4)], pops: 4,
  },
  {
    name: 'HEART OF THE CITY', hint: 'POP A WHOLE SHAPE FOR A BONUS', w: 540, fuel: 6, start: [40, GROUND],
    buildings: [B(190, 40, 50), B(410, 40, 40)],
    rings: [[130, 110], [470, 118]],
    shells: [heart(300, 78, 2.6, 14)], shape: true, pops: 14,
  },
  {
    name: 'SLALOM', hint: 'LOW - HIGH - LOW - HIGH', w: 780, fuel: 15, start: [40, GROUND],
    buildings: [B(180, 24, 72), B(300, 24, 72), B(420, 24, 72), B(540, 24, 72)],
    rings: [[120, 140], [192, 68], [252, 142], [312, 68], [372, 142], [432, 68], [492, 142], [552, 68], [660, 120]],
    shells: [cluster(720, 64, 3)], pops: 3,
  },
  {
    name: 'THE ALLEY', hint: 'DROP IN - CLIMB OUT', w: 660, fuel: 14, start: [40, GROUND],
    buildings: [B(200, 60, 140), B(302, 60, 140), B(470, 40, 60)],
    rings: [[130, 100], [281, 60], [281, 146], [420, 44], [540, 132]],
    shells: [cluster(590, 52, 5)], pops: 5,
  },
  {
    name: 'STARLIGHT', hint: 'THE STAR WANTS ALL FIVE POINTS', w: 740, fuel: 11, start: [40, GROUND],
    buildings: [B(200, 40, 60), B(320, 30, 40), B(530, 40, 70), B(650, 30, 50)],
    wires: [[237, 104, 323, 124, 10]],
    birds: [[270, 70, 30, 1.5], [650, 100, 22, 1.8]],
    rings: [[150, 120], [270, 98], [600, 140], [690, 70]],
    shells: [star(430, 72, 34, 15)], shape: true, pops: 10,
  },
  {
    name: 'GRAND FINALE', hint: 'LIGHT UP THE WHOLE SKY', w: 1060, fuel: 20, start: [40, GROUND],
    buildings: [B(120, 30, 50), B(230, 40, 100), B(360, 30, 70), B(520, 50, 120), B(640, 40, 60), B(770, 30, 90), B(900, 50, 50)],
    wires: [[390, 126, 520, 120, 10]],
    birds: [[300, 55, 30, 1.6], [700, 50, 30, 1.8], [840, 120, 25, 2.2]],
    rings: [[170, 100], [300, 140], [450, 100], [590, 30], [700, 135], [840, 70], [980, 120]],
    shells: [cluster(250, 40, 5), circle(450, 60, 22, 8), heart(840, 30, 1.4, 10), cluster(1000, 60, 6)], shape: true, pops: 29,
  },
];

// Resolves helpers into a flat level. Shapes are tagged so popping a whole one gives a bonus.
export function expand(L) {
  const shells = [];
  L.shells.forEach((group, gi) => group.forEach(([x, y]) => shells.push({ x, y, shape: L.shape && group.length >= 8 ? gi : -1, c: COLORS[(gi * 2 + shells.length) % COLORS.length] })));
  const wires = L.wires || [];
  return { ...L, shells, wires, birds: L.birds || [], via: L.via || [] };
}
