// All playfield geometry, in table units: 600 wide x 1120 tall, y grows downward.
// Walls are thin line segments (the ball has the radius). Circles are posts/bumpers.
export const TW = 600, TH = 1120;
export const BALL_R = 11;

export const LANE_X = 560, LANE_REST_Y = 1063, LANE_FLOOR = 1075;
export const ARC = { cx: 300, cy: 280, r: 280 };

export const FLIPPERS = [
  { px: 186, py: 985, sgn: 1, len: 84, r1: 12, r2: 7, aRest: 0.52, aUp: -0.47 },
  { px: 374, py: 985, sgn: -1, len: 84, r1: 12, r2: 7, aRest: 0.52, aUp: -0.47 },
];

export const BUMPERS = [
  { x: 215, y: 282, r: 26 },
  { x: 335, y: 282, r: 26 },
  { x: 275, y: 368, r: 26 },
];

export const SLINGS = [
  { a: [108, 790], b: [108, 880], c: [168, 915] },
  { a: [452, 790], b: [452, 880], c: [392, 915] },
];

export const DROPS = [
  { x: 81, y0: 410, y1: 446 },
  { x: 81, y0: 460, y1: 496 },
  { x: 81, y0: 510, y1: 546 },
];

export const STANDUPS = [
  { x: 531, y0: 610, y1: 646 },
  { x: 531, y0: 664, y1: 700 },
  { x: 531, y0: 718, y1: 754 },
];

export const LANES = [{ x: 200, y: 124 }, { x: 260, y: 124 }, { x: 320, y: 124 }];
export const LANE_GUIDES = [[170, 100], [230, 92], [290, 92], [350, 100]];

export const SAUCER = { x: 280, y: 612, r: 15 };
export const RAMP_MOUTH = { x0: 392, x1: 470, top: 520, bot: 594 };
export const RETURN_DEFLECT = [540, 764];
// Left outlane kickback: fires the ball back up when lit.
export const KICKBACK = { x0: 20, x1: 62, y: 960 };
export const ORBIT = { x0: 20, x1: 75, sensorY: 385, spinnerY: 478 };

// Ramp: the ball rides this path on an elevated wire, from the mouth up the
// right, over the top and down the left side into the left inlane.
export const RAMP_PATH = [
  [432, 540], [440, 430], [438, 330], [425, 255], [395, 212], [340, 197], [280, 195], [215, 197],
  [160, 210], [130, 245], [121, 300], [121, 400], [121, 490], [115, 590], [101, 690], [87, 770], [85, 800],
];

function S(ax, ay, bx, by, o = {}) { return { ax, ay, bx, by, e: 0.42, kind: 'wall', ...o }; }
function C(x, y, r, o = {}) { return { x, y, r, e: 0.55, kind: 'post', ...o }; }

export function buildTable() {
  const segs = [], circles = [];
  // top arc
  const N = 44;
  for (let i = 0; i < N; i++) {
    const t0 = Math.PI + (i / N) * Math.PI, t1 = Math.PI + ((i + 1) / N) * Math.PI;
    segs.push(S(ARC.cx + ARC.r * Math.cos(t0), ARC.cy + ARC.r * Math.sin(t0), ARC.cx + ARC.r * Math.cos(t1), ARC.cy + ARC.r * Math.sin(t1), { e: 0.3 }));
  }
  segs.push(S(20, 280, 20, 1160));                       // left outer wall
  segs.push(S(580, 280, 580, LANE_FLOOR + 5));            // right outer wall (shooter lane)
  segs.push(S(540, 318, 540, 1160));                     // shooter lane divider / right outlane wall
  segs.push(S(540, LANE_FLOOR, 580, LANE_FLOOR, { e: 0.1, kind: 'floor' }));
  circles.push(C(540, 318, 4));
  // one-way gate at the top of the shooter lane: blocks from the upper-left side
  segs.push(S(540, 318, 580, 268, { oneway: true, nx: -0.78, ny: -0.625, kind: 'gate', e: 0.3 }));
  // left orbit: inner wall plus a one-way gate at its top (ball may only go UP through it)
  segs.push(S(75, 352, 75, 600));
  circles.push(C(75, 352, 4), C(75, 600, 5));
  segs.push(S(20, 322, 75, 352, { oneway: true, nx: 0.454, ny: -0.891, kind: 'gate', e: 0.3 }));
  // top lane guides
  for (const [x, y] of LANE_GUIDES) { segs.push(S(x, y, x, 150)); circles.push(C(x, 150, 5)); }
  // ramp mouth: two side walls and a roof (the ball enters from below)
  const M = RAMP_MOUTH;
  segs.push(S(M.x0, M.top, M.x0, M.bot), S(M.x1, M.top, M.x1, M.bot), S(M.x0, M.top, M.x1, M.top, { e: 0.3 }));
  // peaked cover over the mouth so a ball landing on top rolls off instead of parking there
  const mid = (M.x0 + M.x1) / 2 + 0.7;
  segs.push(S(M.x0, M.top, mid, M.top - 22, { e: 0.25 }), S(mid, M.top - 22, M.x1, M.top, { e: 0.25 }));
  circles.push(C(M.x0, M.bot, 6), C(M.x1, M.bot, 6));
  // slingshots: two plain sides and a kicker face (a-c)
  SLINGS.forEach((s, i) => {
    segs.push(S(...s.a, ...s.b, { e: 0.3 }), S(...s.b, ...s.c, { e: 0.3 }));
    segs.push(S(...s.a, ...s.c, { kind: 'sling', idx: i, e: 0.5 }));
    circles.push(C(...s.a, 6), C(...s.b, 6), C(...s.c, 6));
  });
  // inlane / outlane guides
  segs.push(S(62, 790, 62, 885), S(62, 885, 184, 974)); // guides run INTO the flipper pivot: ending short of it left a V pocket that balanced the ball on the pivot top
  segs.push(S(498, 790, 498, 885), S(498, 885, 376, 974));
  circles.push(C(62, 790, 5), C(498, 790, 5));
  // right return deflector: balls falling down the right wall are steered into the right
  // inlane instead of straight down the outlane (the old layout drained most balls there)
  segs.push(S(RETURN_DEFLECT[0], RETURN_DEFLECT[1], 492, 786.7, { e: 0.25 })); // passes just above the guide post so nothing can park in the corner
  // drop targets and stand-ups
  DROPS.forEach((d, i) => segs.push(S(d.x, d.y0, d.x, d.y1, { kind: 'drop', idx: i, e: 0.35 })));
  STANDUPS.forEach((d, i) => segs.push(S(d.x, d.y0, d.x, d.y1, { kind: 'standup', idx: i, e: 0.5 })));
  // bumpers
  BUMPERS.forEach((b, i) => circles.push(C(b.x, b.y, b.r, { kind: 'bumper', idx: i, e: 0.5 })));

  for (const s of segs) { s.dx = s.bx - s.ax; s.dy = s.by - s.ay; s.len2 = s.dx * s.dx + s.dy * s.dy; s.on = true; }
  return { segs, circles };
}

// Ramp path with cumulative lengths for the ball to ride.
export function rampTrack() {
  const pts = RAMP_PATH.map(([x, y]) => ({ x, y, d: 0 }));
  for (let i = 1; i < pts.length; i++) pts[i].d = pts[i - 1].d + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, len: pts[pts.length - 1].d };
}
export function rampAt(track, d) {
  const p = track.pts;
  if (d <= 0) return { x: p[0].x, y: p[0].y, tx: 0, ty: -1 };
  for (let i = 1; i < p.length; i++) {
    if (d <= p[i].d) {
      const seg = p[i].d - p[i - 1].d, k = (d - p[i - 1].d) / seg;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k, tx: (p[i].x - p[i - 1].x) / seg, ty: (p[i].y - p[i - 1].y) / seg };
    }
  }
  const a = p[p.length - 2], b = p[p.length - 1], seg = b.d - a.d;
  return { x: b.x, y: b.y, tx: (b.x - a.x) / seg, ty: (b.y - a.y) / seg };
}
