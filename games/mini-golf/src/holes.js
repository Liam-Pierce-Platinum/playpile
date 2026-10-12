// The 18 holes. World units; most holes live in a 1000 x 600 box (wider than tall).
// green: outline polygon (railed). blocks: railed obstacle polygons. bumpers: [x,y,r].
// water/sand: shapes (polygon array or {c:[x,y,r]}). belts: {r:[x,y,w,h], d:[dx,dy], s:speed}.
// ramps: {r:[x,y,w,h], d:[dx,dy], a:accel} (d points downhill). bowls: {c:[x,y], r, a}.
// portals: {a:[x,y], b:[x,y]} (two-way). mills: {c:[x,y], len, n, w:rad/s}.
// movers: {w,h, a:[x,y], b:[x,y], T:period, ph:phase 0..1} (a/b = centre positions).

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const oct = (x, y, w, h, c) => [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];

export const HOLES = [
  { name: 'First Putt', par: 2, tee: [170, 300], cup: [830, 300],
    green: oct(80, 200, 840, 200, 40) },

  { name: 'Dogleg', par: 2, tee: [170, 170], cup: [810, 430],
    green: [[80, 80], [920, 80], [920, 520], [700, 520], [700, 260], [80, 260]] },

  { name: 'Bumper Alley', par: 2, tee: [160, 300], cup: [860, 300],
    green: oct(80, 150, 840, 300, 50),
    bumpers: [[400, 230, 22], [400, 370, 22], [560, 300, 26], [720, 220, 22], [720, 380, 22]] },

  { name: 'Sand Trap', par: 2, tee: [170, 300], cup: [830, 300],
    green: oct(80, 120, 840, 360, 60),
    blocks: [[[500, 255], [545, 300], [500, 345], [455, 300]]],
    sand: [{ c: [680, 205, 62] }, { c: [680, 395, 62] }, { c: [760, 300, 34] }] },

  { name: 'The Windmill', par: 3, tee: [160, 300], cup: [840, 300],
    green: rect(80, 140, 840, 320),
    blocks: [rect(470, 140, 60, 120), rect(470, 340, 60, 120)],
    mills: [{ c: [500, 200], len: 155, n: 3, w: 1.15 }] },

  { name: 'Hill Climb', par: 2, tee: [160, 300], cup: [840, 300],
    green: oct(80, 180, 840, 240, 50),
    ramps: [{ r: [400, 187, 240, 226], d: [-1, 0], a: 900 }] },

  { name: 'Water Hazard', par: 3, tee: [160, 200], cup: [830, 400],
    green: rect(80, 100, 840, 400),
    water: [rect(400, 100, 200, 168), rect(400, 332, 200, 168)] },

  { name: 'Conveyor', par: 2, tee: [160, 300], cup: [840, 190],
    green: oct(80, 120, 840, 360, 50),
    belts: [{ r: [430, 127, 140, 346], d: [0, 1], s: 260 }] },

  { name: 'Portal Jump', par: 2, tee: [170, 300], cup: [840, 300],
    green: rect(80, 100, 840, 400),
    blocks: [rect(520, 100, 40, 400)],
    portals: [{ a: [430, 300], b: [650, 300] }] },

  { name: 'Sliders', par: 2, tee: [160, 300], cup: [850, 300],
    green: rect(80, 120, 840, 360),
    movers: [{ w: 40, h: 120, a: [380, 220], b: [380, 380], T: 2.6, ph: 0 },
             { w: 40, h: 120, a: [620, 220], b: [620, 380], T: 2.6, ph: 0.5 }] },

  { name: 'Zig Zag', par: 3, tee: [160, 150], cup: [840, 450],
    green: rect(80, 80, 840, 440),
    blocks: [rect(80, 213, 640, 40), rect(280, 347, 640, 40)] },

  { name: 'The Bowl', par: 2, tee: [170, 300], cup: [720, 300],
    green: oct(80, 110, 840, 380, 90),
    blocks: [[[470, 275], [500, 300], [470, 325], [440, 300]]],
    bumpers: [[600, 190, 20], [600, 410, 20]],
    bowls: [{ c: [720, 300], r: 130, a: 650 }] },

  { name: 'Twin Mills', par: 4, tee: [130, 300], cup: [870, 300],
    green: rect(60, 120, 880, 360),
    blocks: [rect(330, 120, 40, 140), rect(330, 340, 40, 140), rect(630, 120, 40, 140), rect(630, 340, 40, 140)],
    mills: [{ c: [350, 190], len: 155, n: 3, w: 1.2 }, { c: [650, 410], len: 155, n: 3, w: -1.1 }] },

  { name: 'Belt Maze', par: 3, tee: [160, 150], cup: [840, 450],
    green: rect(80, 80, 840, 440),
    blocks: [rect(700, 80, 30, 300)],
    belts: [{ r: [280, 87, 120, 426], d: [0, -1], s: 220 }, { r: [520, 87, 120, 426], d: [0, 1], s: 220 }] },

  { name: 'Lake Loop', par: 3, tee: [150, 450], cup: [850, 150],
    green: oct(80, 80, 840, 440, 70),
    water: [{ c: [500, 300, 150] }, { c: [380, 330, 90] }],
    sand: [{ c: [790, 205, 48] }, { c: [855, 300, 36] }],
    bumpers: [[690, 470, 20]] },

  { name: 'Portal Maze', par: 3, tee: [150, 430], cup: [850, 170],
    green: rect(80, 80, 840, 440),
    blocks: [rect(400, 80, 40, 440), rect(640, 80, 40, 440)],
    portals: [{ a: [300, 170], b: [520, 430] }, { a: [520, 170], b: [760, 430] }] },

  { name: 'Pinball', par: 3, tee: [150, 300], cup: [860, 300],
    green: oct(80, 120, 840, 360, 70),
    bumpers: [[360, 300, 24], [470, 220, 22], [470, 380, 22], [580, 300, 24], [580, 170, 18], [580, 430, 18], [680, 225, 20], [680, 375, 20]],
    movers: [{ w: 30, h: 100, a: [770, 230], b: [770, 370], T: 2.2, ph: 0.25 }] },

  { name: 'Grand Finale', par: 5, tee: [130, 160], cup: [130, 440],
    green: rect(60, 60, 880, 480),
    blocks: [rect(60, 270, 700, 40)],
    mills: [{ c: [850, 290], len: 95, n: 3, w: 1.6, hub: 16 }],
    water: [rect(380, 310, 120, 152)],
    movers: [{ w: 30, h: 80, a: [250, 382], b: [250, 468], T: 2.4, ph: 0 }],
    portals: [{ a: [560, 120], b: [320, 400] }],
    bumpers: [[620, 200, 20]] },
];
