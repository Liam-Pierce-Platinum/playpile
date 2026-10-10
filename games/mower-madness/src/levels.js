// The 15 gardens. World units are pixels; (0,0) is the top-left corner of the
// fenced lawn. Shapes: R(x,y,w,h) rectangles, C(x,y,r) circles.
//   paths/patios  walkable, no grass       beds   flower beds (mowing = penalty)
//   water         pond / moat, solid       sand   bunker, walkable but slow
//   hedges/walls/houses/sheds/tents/kennels/towers/bushes/fountains  solid
//   trees [x,y,canopyR]  trunk is solid, grass under the canopy is mowable
//   gnomes sprinklers dogs cats fuel [x,y]   toys [x,y,kind]
//   slopes {x,y,w,h,dir(deg, downhill),s(strength px/s^2)}
export const R = (x, y, w, h) => ({ t: 'r', x, y, w, h });
export const C = (x, y, r) => ({ t: 'c', x, y, r });

export const MOWERS = [
  { id: 'classic', name: 'Old Faithful', desc: 'A trusty red ride-on. Does the job.', need: 0, speed: 290, accel: 800, turn: 4.6, deck: 50, grip: 8, fuel: 1, body: '#e8453c', dark: '#a82a24' },
  { id: 'zippy', name: 'Zippy', desc: 'Lightweight and quick. Slides about a bit.', need: 7, speed: 345, accel: 980, turn: 5.2, deck: 46, grip: 6, fuel: 1.1, body: '#ffc93c', dark: '#c48a12' },
  { id: 'wide', name: 'Wide Boy', desc: 'An enormous deck. Turns like a sofa.', need: 15, speed: 270, accel: 700, turn: 4.0, deck: 72, grip: 8, fuel: 1, body: '#3fa34d', dark: '#23702f' },
  { id: 'monster', name: 'Monster Mower', desc: 'Giant tyres. Chews toys, shrugs off gnomes and hills.', need: 25, speed: 315, accel: 880, turn: 4.6, deck: 58, grip: 7.5, fuel: 1.2, body: '#8a4fd8', dark: '#5a2f9a', monster: true },
  { id: 'gold', name: 'The Golden Blade', desc: 'Fast, wide, frugal. For lawn royalty.', need: 38, speed: 355, accel: 1000, turn: 5.3, deck: 66, grip: 8.5, fuel: 0.7, body: '#f2b630', dark: '#a8761a', gold: true },
];

const L = [];

// 1 -------------------------------------------------------------------------
L.push({
  name: 'Number 12', sub: 'A tidy suburban front lawn', theme: 'suburb', w: 760, h: 540, time: 50, target: 0.85, stripeT: 0.45,
  start: [300, 470, -90],
  houses: [{ ...R(150, 0, 460, 96), roof: '#c8553d' }],
  hedges: [R(0, 0, 150, 34), R(610, 0, 150, 34)],
  paths: [R(355, 96, 50, 444)],
  beds: [R(170, 96, 170, 30), R(420, 96, 170, 30)],
  gnomes: [[210, 330], [560, 270]],
  fuel: [[690, 470]],
  tip: 'Drive in straight lines, back and forth. Parallel passes make STRIPES.',
});
// 2 -------------------------------------------------------------------------
L.push({
  name: 'Back Garden', sub: 'Mind the toys on the lawn', theme: 'suburb', w: 860, h: 620, time: 65, target: 0.8, stripeT: 0.45,
  start: [330, 90, 0],
  patios: [R(0, 0, 250, 170)],
  sheds: [R(735, 0, 125, 100)],
  beds: [R(0, 210, 44, 340), C(560, 390, 58)],
  trees: [[700, 520, 70]],
  toys: [[420, 250, 'ball'], [290, 470, 'duck']],
  gnomes: [[610, 190], [170, 570]],
  fuel: [[820, 580]],
  tip: 'Toys clog your blades. Steer around them.',
});
// 3 -------------------------------------------------------------------------
{
  const g = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; g.push([450 + Math.cos(a) * 140, 320 + Math.sin(a) * 125]); }
  g.push([120, 300], [780, 330], [300, 560], [620, 90]);
  L.push({
    name: 'Gnome Sweet Gnome', sub: 'A dozen gnomes and a fishing pond', theme: 'suburb', w: 900, h: 640, time: 80, target: 0.8, stripeT: 0.45,
    start: [80, 580, -90],
    water: [C(450, 320, 78)],
    beds: [C(110, 110, 46), C(790, 530, 46)],
    gnomes: g,
    fuel: [[820, 80], [80, 80]],
    tip: 'Hitting a gnome costs 3 seconds. Thread between them for CLOSE SHAVE points.',
  });
}
// 4 -------------------------------------------------------------------------
L.push({
  name: 'Sprinkler Season', sub: 'Pop-up sprinklers leave slippery mud', theme: 'suburb', w: 920, h: 660, time: 75, target: 0.82, stripeT: 0.45,
  start: [60, 330, 0],
  paths: [R(0, 310, 920, 40)],
  beds: [R(400, 40, 120, 60), R(400, 560, 120, 60)],
  sprinklers: [[230, 165], [690, 165], [230, 495], [690, 495]],
  gnomes: [[460, 210]], toys: [[460, 460, 'ball']],
  fuel: [[60, 60], [860, 600]],
  tip: 'Sprinklers pop up and make mud. Mud is slippery, so ease off.',
});
// 5 -------------------------------------------------------------------------
L.push({
  name: 'Beware of the Dog', sub: 'Biscuit wants to play', theme: 'suburb', w: 960, h: 680, time: 85, target: 0.82, stripeT: 0.45,
  start: [80, 620, -90],
  kennels: [R(830, 30, 80, 66)],
  beds: [R(0, 0, 210, 40), R(400, 640, 200, 40)],
  trees: [[220, 230, 78], [700, 520, 66]],
  toys: [[480, 340, 'ball'], [300, 520, 'truck'], [640, 240, 'duck']],
  gnomes: [[480, 560]],
  dogs: [[800, 150]],
  fuel: [[900, 620]],
  tip: 'The dog chases you. Boost (Space) to escape, but boosting burns fuel.',
});
// 6 -------------------------------------------------------------------------
L.push({
  name: 'Hillside Cottage', sub: 'Steep slopes drag you downhill', theme: 'suburb', w: 980, h: 720, time: 85, target: 0.82, stripeT: 0.45,
  start: [500, 690, -90],
  houses: [{ ...R(380, 0, 240, 120), roof: '#7a6a5a' }],
  paths: [R(475, 120, 50, 600)],
  slopes: [{ x: 0, y: 190, w: 475, h: 300, dir: 90, s: 150 }, { x: 525, y: 300, w: 455, h: 300, dir: 0, s: 130 }],
  trees: [[120, 120, 64], [870, 620, 70]],
  beds: [C(250, 590, 52), R(660, 150, 150, 36)],
  gnomes: [[300, 330], [760, 430], [160, 650]],
  fuel: [[920, 60], [60, 680]],
  tip: 'Slopes push you downhill (see the arrows). Mow across them carefully.',
});
// 7 -------------------------------------------------------------------------
L.push({
  name: 'The 18th Green', sub: 'Golf balls, bunkers and a pond', theme: 'golf', w: 1080, h: 740, time: 90, target: 0.85, scale: 0.95, stripeT: 0.45,
  start: [70, 680, -45],
  sand: [C(300, 220, 70), C(820, 560, 78), R(560, 90, 150, 56)],
  water: [C(870, 200, 84)],
  flag: [560, 400],
  beds: [R(0, 0, 160, 40)],
  toys: [[420, 460, 'golf'], [700, 300, 'golf'], [260, 590, 'golf'], [960, 420, 'golf']],
  sprinklers: [[180, 420], [980, 650]],
  fuel: [[1020, 60], [40, 400]],
  tip: 'Bunkers slow you down. Golf balls clog the blades.',
});
// 8 -------------------------------------------------------------------------
L.push({
  name: 'Sunday League', sub: 'Match day. Stripe the pitch!', theme: 'pitch', w: 1100, h: 720, time: 85, target: 0.82, scale: 0.92, stripeT: 0.5,
  start: [550, 690, -90],
  lines: 'football',
  goals: [R(0, 290, 22, 140), R(1078, 290, 22, 140)],
  beds: [C(0, 0, 60), C(1100, 0, 60), C(0, 720, 60), C(1100, 720, 60)],
  toys: [[550, 180, 'cone'], [550, 540, 'cone'], [300, 360, 'cone'], [800, 360, 'cone']],
  dogs: [[550, 360]],
  sprinklers: [[380, 180], [720, 540]],
  fuel: [[40, 360], [1060, 360]],
  tip: 'A football pitch was born to be striped. Long straight passes!',
});
// 9 -------------------------------------------------------------------------
L.push({
  name: 'Cat Nap Close', sub: 'Do not wake the cats', theme: 'suburb', w: 960, h: 700, time: 80, target: 0.82, stripeT: 0.5,
  start: [480, 670, -90],
  beds: [R(0, 0, 960, 40), C(480, 330, 58)],
  cats: [[260, 240], [720, 460], [560, 590]],
  toys: [[150, 560, 'ball'], [820, 150, 'duck']],
  gnomes: [[830, 610], [130, 130]],
  trees: [[860, 300, 64]],
  fuel: [[40, 670], [920, 670]],
  tip: 'Sleeping cats wake up if you roar past. Slow down near them.',
});
// 10 ------------------------------------------------------------------------
L.push({
  name: 'Hedge Maze Estate', sub: 'Find your way through the hedges', theme: 'estate', w: 1200, h: 900, time: 90, target: 0.68, scale: 0.86, stripeT: 0.5,
  start: [600, 865, -90],
  hedges: [
    R(150, 120, 100, 30), R(370, 120, 680, 30), R(150, 750, 390, 30), R(660, 750, 390, 30),
    R(150, 120, 30, 660), R(1020, 120, 30, 660),
    R(300, 260, 240, 30), R(660, 260, 240, 30), R(300, 610, 600, 30), R(300, 260, 30, 380),
    R(870, 260, 30, 140), R(870, 520, 30, 120),
  ],
  fountains: [C(600, 450, 56)],
  beds: [C(420, 450, 40), C(780, 450, 40)],
  gnomes: [[75, 450], [1125, 450], [600, 195], [240, 690], [960, 690], [600, 560]],
  cats: [[90, 90]],
  fuel: [[1125, 75], [600, 340]],
  tip: 'Lost? When you are close to the target an arrow points to the grass you missed.',
});
// 11 ------------------------------------------------------------------------
L.push({
  name: 'Fountain Court', sub: 'Four sprinklers, four flower beds', theme: 'estate', w: 1100, h: 800, time: 90, target: 0.75, scale: 0.9, stripeT: 0.5,
  start: [60, 400, 0],
  paths: [R(0, 385, 1100, 30), R(535, 0, 30, 800)],
  fountains: [C(550, 400, 76)],
  beds: [C(275, 200, 52), C(825, 200, 52), C(275, 600, 52), C(825, 600, 52)],
  sprinklers: [[410, 280], [690, 520], [690, 280], [410, 520]],
  gnomes: [[120, 120], [980, 120], [120, 680], [980, 680]],
  toys: [[275, 400 - 110, 'ball'], [825, 520, 'duck']],
  fuel: [[1060, 40], [40, 760]],
  tip: 'Cross the paths and keep your stripes straight.',
});
// 12 ------------------------------------------------------------------------
L.push({
  name: 'Vicarage Fete', sub: 'Flowers everywhere, and the vicar\'s dog', theme: 'suburb', w: 1100, h: 760, time: 90, target: 0.74, scale: 0.9, stripeT: 0.5,
  start: [550, 720, -90],
  tents: [R(450, 30, 200, 116)],
  beds: [R(140, 150, 210, 32), R(140, 580, 210, 32), R(750, 150, 210, 32), R(750, 580, 210, 32), C(550, 380, 66)],
  cats: [[300, 380], [820, 380]],
  dogs: [[1000, 700]],
  toys: [[180, 300, 'ball'], [920, 470, 'duck'], [550, 520, 'truck']],
  gnomes: [[80, 80], [1020, 80], [400, 680]],
  fuel: [[40, 720], [1060, 260]],
  tip: 'So many flowers. Mow every one of them and you lose a star.',
});
// 13 ------------------------------------------------------------------------
L.push({
  name: 'Castle Lawn', sub: 'Keep the inner bailey in order', theme: 'castle', w: 1240, h: 880, time: 90, target: 0.75, scale: 0.87, stripeT: 0.5,
  start: [620, 840, -90],
  walls: [R(0, 0, 500, 56), R(740, 0, 500, 56)],
  keep: [R(500, 0, 240, 170)],
  towers: [C(70, 70, 62), C(1170, 70, 62)],
  paths: [R(590, 170, 60, 710)],
  water: [R(0, 845, 560, 35), R(680, 845, 560, 35)],
  fountains: [C(1000, 500, 40)],
  slopes: [{ x: 120, y: 330, w: 330, h: 330, dir: 135, s: 120 }],
  beds: [R(150, 56, 300, 34), R(790, 56, 300, 34)],
  gnomes: [[300, 760], [940, 760], [260, 240], [980, 260]],
  dogs: [[1100, 700]],
  sprinklers: [[900, 380], [300, 500]],
  toys: [[800, 600, 'truck'], [420, 160, 'ball']],
  fuel: [[40, 800], [1200, 800], [1180, 200]],
  tip: 'The motte is steep. Use the slope or fight it.',
});
// 14 ------------------------------------------------------------------------
L.push({
  name: 'Grand Estate', sub: 'Everything at once', theme: 'estate', w: 1240, h: 880, time: 90, target: 0.72, scale: 0.86, stripeT: 0.5,
  start: [620, 845, -90],
  houses: [{ ...R(420, 0, 400, 140), roof: '#5d6b7a' }],
  paths: [R(595, 140, 50, 740)],
  hedges: [R(140, 300, 30, 260), R(1070, 300, 30, 260)],
  water: [C(300, 200, 70)],
  beds: [R(200, 640, 220, 34), R(820, 640, 220, 34), C(930, 210, 50)],
  trees: [[1120, 120, 70], [120, 760, 64]],
  slopes: [{ x: 700, y: 330, w: 330, h: 260, dir: 0, s: 120 }],
  gnomes: [[400, 420], [840, 420], [260, 540], [980, 540], [460, 760], [780, 760]],
  dogs: [[1150, 800]],
  cats: [[340, 360], [900, 780]],
  sprinklers: [[420, 280], [820, 300], [600 + 280, 520]],
  toys: [[520, 520, 'duck'], [720, 220, 'ball'], [200, 420, 'truck']],
  fuel: [[40, 40], [1200, 300], [40, 840]],
  tip: 'The big one. Plan your stripes.',
});
// 15 ------------------------------------------------------------------------
L.push({
  name: 'Royal Garden Party', sub: 'The corgis are loose', theme: 'castle', w: 1240, h: 880, time: 90, target: 0.72, scale: 0.83, stripeT: 0.55,
  start: [620, 845, -90],
  houses: [{ ...R(340, 0, 560, 120), roof: '#8c8c96' }],
  paths: [R(0, 425, 1240, 30)],
  fountains: [C(620, 440, 70)],
  tents: [R(60, 120, 150, 96), R(1030, 120, 150, 96)],
  beds: [C(300, 250, 50), C(940, 250, 50), C(300, 640, 50), C(940, 640, 50), R(380, 120, 480, 30)],
  dogs: [[200, 760], [1040, 760]],
  cats: [[620, 250]],
  sprinklers: [[460, 300], [780, 300], [460, 600], [780, 600]],
  gnomes: [[120, 330], [1120, 330], [120, 560], [1120, 560], [460, 760], [780, 760], [620, 640], [620, 340]],
  toys: [[300, 760, 'ball'], [940, 360, 'duck'], [1000, 520, 'truck']],
  fuel: [[40, 840], [1200, 840], [620, 160]],
  tip: 'Royal standards: 88% and proper stripes.',
});

export const LEVELS = L;
// shrink a whole garden (keeps the mower and the props the same size)
function scaleLevel(l, k) {
  const sc = (v) => Math.round(v * k);
  const shape = (o) => { const n = { ...o }; for (const key of ['x', 'y', 'w', 'h', 'r']) if (typeof n[key] === 'number' && !(key === 'r' && n.t !== 'c')) n[key] = sc(n[key]); return n; };
  l.w = sc(l.w); l.h = sc(l.h);
  l.start = [sc(l.start[0]), sc(l.start[1]), l.start[2]];
  for (const key of ['houses', 'hedges', 'walls', 'paths', 'patios', 'beds', 'water', 'sand', 'sheds', 'tents', 'kennels', 'towers', 'keep', 'fountains', 'goals', 'bushes']) if (l[key]) l[key] = l[key].map(shape);
  for (const key of ['gnomes', 'sprinklers', 'dogs', 'cats', 'fuel', 'toys', 'trees']) if (l[key]) l[key] = l[key].map((p) => [sc(p[0]), sc(p[1]), ...p.slice(2)]);
  if (l.slopes) l.slopes = l.slopes.map((o) => ({ ...o, x: sc(o.x), y: sc(o.y), w: sc(o.w), h: sc(o.h) }));
  if (l.flag) l.flag = [sc(l.flag[0]), sc(l.flag[1])];
}
for (const l of L) { if (l.scale) scaleLevel(l, l.scale); l.starLeft = l.starLeft ?? Math.round(l.time * 0.22); }

// the attract-mode lawn on the title screen
export const DEMO = {
  name: 'demo', theme: 'suburb', w: 900, h: 600, time: 999, target: 2, stripeT: 0,
  start: [70, 70, 0],
  trees: [[880, 30, 70], [20, 590, 60]],
  beds: [R(330, 0, 240, 26)],
};
