// The three arenas: walls (one convex outer boundary), static obstacles (convex polygons and
// tyre stacks), hay bales you can shove, mud puddles, spawn spots and the scenery.
// World is centred on 0,0. The static ground (floor, walls, stands) is baked once per round.
import { ARENAS } from './data.js';
import { rng, TAU, shade } from './util.js';

const ellipse = (rx, ry, n) => Array.from({ length: n }, (_, k) => ({ x: Math.cos((k / n) * TAU) * rx, y: Math.sin((k / n) * TAU) * ry }));
function roundRect(hw, hh, r, nc) {
  const out = [];
  const corner = (cx, cy, a0) => { for (let k = 0; k <= nc; k++) { const a = a0 + (k / nc) * (Math.PI / 2); out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
  corner(hw - r, hh - r, 0); corner(-hw + r, hh - r, Math.PI / 2); corner(-hw + r, -hh + r, Math.PI); corner(hw - r, -hh + r, Math.PI * 1.5);
  return out;
}
function stadium(a, R, n) {
  const out = [];
  for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + (k / n) * Math.PI; out.push({ x: a + Math.cos(t) * R, y: Math.sin(t) * R }); }
  for (let k = 0; k <= n; k++) { const t = Math.PI / 2 + (k / n) * Math.PI; out.push({ x: -a + Math.cos(t) * R, y: Math.sin(t) * R }); }
  return out;
}
const circ = (cx, cy, r, n) => Array.from({ length: n }, (_, k) => ({ x: cx + Math.cos((k / n) * TAU) * r, y: cy + Math.sin((k / n) * TAU) * r }));

// convex polygon with outward edge normals and a bounding circle
export function makePoly(pts, kind, soft = 1) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; } cx /= pts.length; cy /= pts.length;
  const on = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; let nx = b.y - a.y, ny = -(b.x - a.x); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; if ((a.x - cx) * nx + (a.y - cy) * ny < 0) { nx = -nx; ny = -ny; } return { x: nx, y: ny }; });
  let br = 0; for (const p of pts) br = Math.max(br, Math.hypot(p.x - cx, p.y - cy));
  return { type: 'poly', pts, on, cx, cy, br, kind, soft };
}

export function buildArena(i) {
  const meta = ARENAS[i], R = rng(9001 + i * 131);
  const A = { i, key: meta.key, name: meta.name, statics: [], hay: [], puddles: [], spawns: [], avoid: [], lights: [], flags: [], stands: [], banners: [] };
  let bnd;
  if (meta.key === 'bowl') {
    bnd = ellipse(920, 620, 84);
    A.wall = 'tyre';
    for (const [x, y] of [[-430, -210], [430, 210], [-430, 230], [430, -230]]) A.statics.push({ type: 'circle', x, y, r: 26, kind: 'tyres', soft: 0.5 });
    for (const [x, y] of [[0, -420], [0, 420], [-700, 0], [700, 0], [-180, 60], [200, -40]]) A.hay.push({ x, y, r: 21 });
    A.stands = [
      { x: -780, y: -980, w: 1560, h: 300, face: 's' }, { x: -780, y: 680, w: 1560, h: 300, face: 'n' },
      { x: 1000, y: -330, w: 240, h: 660, face: 'w' }, { x: -1240, y: -330, w: 240, h: 660, face: 'e' },
    ];
    A.lights = [{ x: -1050, y: -720 }, { x: 1050, y: -720 }, { x: -1050, y: 720 }, { x: 1050, y: 720 }];
    A.outside = '#3a6630'; A.floor = '#b98250'; A.floorDark = '#8c5c34';
    A.banners = ['COUNTY FAIR', 'DEMOLITION DERBY', 'LAST CAR RUNNING', 'FRIDAY NIGHT SMASH'];
  } else if (meta.key === 'mud') {
    bnd = roundRect(950, 640, 260, 12);
    A.wall = 'hay';
    for (let k = 0; k < 8; k++) {
      let x, y, ok;
      for (let t = 0; t < 40; t++) {
        x = (R() - 0.5) * 1450; y = (R() - 0.5) * 900; ok = true;
        for (const p of A.puddles) if (Math.hypot(p.x - x, p.y - y) < 260) ok = false;
        if (ok) break;
      }
      A.puddles.push({ x, y, rx: 90 + R() * 80, ry: 55 + R() * 45, a: R() * Math.PI });
    }
    for (const [x, y] of [[0, 0], [-520, -330], [560, 320]]) A.statics.push({ type: 'circle', x, y, r: 26, kind: 'tyres', soft: 0.5 });
    for (const [x, y] of [[-760, -420], [760, -420], [-760, 420], [760, 420], [-300, 120], [320, -150], [0, -480], [0, 480]]) A.hay.push({ x, y, r: 21 });
    A.stands = [{ x: -700, y: -960, w: 1400, h: 240, face: 's' }, { x: -500, y: 700, w: 1000, h: 200, face: 'n' }];
    A.lights = [{ x: -1080, y: -760 }, { x: 1080, y: -760 }, { x: -1080, y: 760 }, { x: 1080, y: 760 }];
    A.outside = '#4a7a36'; A.floor = '#7a5434'; A.floorDark = '#563a22';
    A.banners = ['MUD BATH', 'DEMOLITION DERBY', 'FARM FIELD FRENZY'];
  } else {
    const a = 560, Rr = 520;
    bnd = stadium(a, Rr, 26);
    A.wall = 'concrete';
    A.statics.push(makePoly(circ(-a, 0, 250, 28), 'island', 0.8), makePoly(circ(a, 0, 250, 28), 'island', 0.8));
    A.statics.push(makePoly([{ x: -240, y: -560 }, { x: 240, y: -560 }, { x: 0, y: -178 }], 'wedge', 0.9));
    A.statics.push(makePoly([{ x: 240, y: 560 }, { x: -240, y: 560 }, { x: 0, y: 178 }], 'wedge', 0.9));
    A.avoid.push({ x: -a, y: 0, r: 255 }, { x: a, y: 0, r: 255 }, { x: 0, y: -430, r: 120 }, { x: 0, y: -265, r: 62 }, { x: 0, y: 430, r: 120 }, { x: 0, y: 265, r: 62 });
    A.stands = [
      { x: -1080, y: -880, w: 2160, h: 270, face: 's' }, { x: -1080, y: 610, w: 2160, h: 270, face: 'n' },
    ];
    A.lights = [{ x: -1250, y: -640 }, { x: 1250, y: -640 }, { x: -1250, y: 640 }, { x: 1250, y: 640 }, { x: 0, y: -580 }, { x: 0, y: 580 }];
    A.outside = '#4b4d52'; A.floor = '#9a6440'; A.floorDark = '#6e4428';
    A.banners = ['FIGURE-8', 'CROSSOVER CARNAGE', 'DEMOLITION DERBY', 'SPEEDWAY'];
  }
  // outer boundary with inward normals
  A.bnd = bnd;
  A.bn = bnd.map((p, k) => { const b = bnd[(k + 1) % bnd.length]; let nx = -(b.y - p.y), ny = b.x - p.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; if (-(p.x + b.x) * nx - (p.y + b.y) * ny < 0) { nx = -nx; ny = -ny; } return { x: nx, y: ny }; });
  for (const s of A.statics) if (s.type === 'circle') A.avoid.push({ x: s.x, y: s.y, r: s.r });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of bnd) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  A.inner = { minX, maxX, minY, maxY };
  const M = 380;
  A.minX = minX - M; A.maxX = maxX + M; A.minY = minY - M; A.maxY = maxY + M;
  A.ringR = Math.hypot(maxX, maxY) + 40;
  // spawn ring, everyone facing in (figure-8: four cars round each loop)
  if (meta.key === 'eight') {
    const angs = [[90, 150, 210, 270], [-90, -30, 30, 90]];
    [-560, 560].forEach((cx, s) => angs[s].forEach((d) => { const t = (d * Math.PI) / 180; A.spawns.push({ x: cx + Math.cos(t) * 388, y: Math.sin(t) * 388, h: t + (s ? -Math.PI / 2 : Math.PI / 2) }); }));
  } else {
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * TAU + 0.39, sx = Math.cos(t) * (meta.key === 'bowl' ? 920 : 900) * 0.74, sy = Math.sin(t) * (meta.key === 'bowl' ? 620 : 620) * 0.74;
      A.spawns.push({ x: sx, y: sy, h: Math.atan2(-sy, -sx) });
    }
  }
  // flags along the wall
  for (let k = 0; k < bnd.length; k += Math.max(2, Math.round(bnd.length / 14))) {
    const p = bnd[k], n = A.bn[k];
    A.flags.push({ x: p.x - n.x * 42, y: p.y - n.y * 42, col: ['#e8302a', '#ffd23a', '#2a62d0', '#ffffff', '#2e9e4a'][Math.floor(R() * 5)], ph: R() * TAU });
  }
  return A;
}

// signed distance to the outer wall (positive = inside), and which edge is nearest
export function wallDist(A, x, y) {
  let m = Infinity, mi = 0;
  const B = A.bnd, N = A.bn;
  for (let k = 0; k < B.length; k++) { const d = (x - B[k].x) * N[k].x + (y - B[k].y) * N[k].y; if (d < m) { m = d; mi = k; } }
  return { d: m, k: mi };
}

export function inPuddle(A, x, y) {
  for (const p of A.puddles) {
    const dx = x - p.x, dy = y - p.y, c = Math.cos(-p.a), s = Math.sin(-p.a);
    const u = (dx * c - dy * s) / p.rx, v = (dx * s + dy * c) / p.ry;
    if (u * u + v * v < 1) return true;
  }
  return false;
}

// ------------------------------------------------------------ baking the ground
const CROWD = ['#e8302a', '#2a62d0', '#ffd23a', '#ffffff', '#2e9e4a', '#ff8a1e', '#8a3ad8', '#1a1a1a', '#3fb4e8', '#f06aa8', '#c8b090'];
export const GS = 1.25;   // ground canvas pixels per world px

function tile(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }

export function bakeGround(A) {
  const R = rng(4242 + A.i);
  const W = Math.ceil((A.maxX - A.minX) * GS), H = Math.ceil((A.maxY - A.minY) * GS);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.setTransform(GS, 0, 0, GS, -A.minX * GS, -A.minY * GS);
  // --- outside the wall
  x.fillStyle = A.outside; x.fillRect(A.minX, A.minY, A.maxX - A.minX, A.maxY - A.minY);
  const outsideTex = tile(256, 256, (t, w, h) => {
    t.fillStyle = A.outside; t.fillRect(0, 0, w, h);
    const asphalt = A.key === 'eight';
    for (let k = 0; k < 2200; k++) {
      if (asphalt) { const v = 60 + Math.random() * 40; t.fillStyle = `rgba(${v},${v},${v + 4},0.35)`; t.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      else { const g = 70 + Math.random() * 60; t.fillStyle = `rgba(${g * 0.55},${g},${g * 0.4},0.45)`; t.fillRect(Math.random() * w, Math.random() * h, 1.5, 3.5); }
    }
  });
  x.fillStyle = x.createPattern(outsideTex, 'repeat'); x.fillRect(A.minX, A.minY, A.maxX - A.minX, A.maxY - A.minY);
  if (A.key === 'eight') {   // parking bay lines
    x.strokeStyle = 'rgba(240,240,230,0.35)'; x.lineWidth = 3;
    for (let px = A.minX + 40; px < A.maxX; px += 70) { x.beginPath(); x.moveTo(px, A.minY + 20); x.lineTo(px, A.minY + 120); x.moveTo(px, A.maxY - 20); x.lineTo(px, A.maxY - 120); x.stroke(); }
  }
  // gravel walkway hugging the wall
  x.save();
  x.lineJoin = 'round';
  x.strokeStyle = A.key === 'eight' ? '#5e6066' : '#a49a84'; x.lineWidth = 150;
  pathPoly(x, A.bnd); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 152; x.setLineDash([4, 9]); pathPoly(x, A.bnd); x.stroke(); x.setLineDash([]);
  x.restore();
  // stands, floodlight bases
  for (const s of A.stands) drawStand(x, s, R, A);
  // --- the arena floor
  x.save();
  pathPoly(x, A.bnd); x.clip();
  const dirt = tile(256, 256, (t, w, h) => {
    t.fillStyle = A.floor; t.fillRect(0, 0, w, h);
    for (let k = 0; k < 3200; k++) {
      const v = Math.random();
      t.fillStyle = v < 0.5 ? `rgba(60,36,18,${0.08 + Math.random() * 0.14})` : `rgba(255,226,180,${0.05 + Math.random() * 0.1})`;
      t.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2);
    }
    for (let k = 0; k < 90; k++) { t.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},${50 + Math.random() * 30},0.8)`; t.beginPath(); t.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.8, 0, TAU); t.fill(); }
    for (let k = 0; k < 10; k++) { t.fillStyle = 'rgba(70,44,22,0.07)'; t.beginPath(); t.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 30, 8 + Math.random() * 16, Math.random() * 3, 0, TAU); t.fill(); }
  });
  x.fillStyle = x.createPattern(dirt, 'repeat');
  x.fillRect(A.inner.minX - 10, A.inner.minY - 10, A.inner.maxX - A.inner.minX + 20, A.inner.maxY - A.inner.minY + 20);
  // big soft blotches so the tile doesn't read as a tile
  for (let k = 0; k < 70; k++) {
    const px = (R() - 0.5) * 2 * A.inner.maxX, py = (R() - 0.5) * 2 * A.inner.maxY, r = 60 + R() * 200;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = R() < 0.55;
    g.addColorStop(0, dark ? 'rgba(70,40,18,0.16)' : 'rgba(255,230,190,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // raked grooves that follow the wall, darker edge where the dirt piles up
  x.strokeStyle = 'rgba(80,50,26,0.10)'; x.lineWidth = 2;
  for (let s = 0.2; s < 1; s += 0.035) { x.beginPath(); A.bnd.forEach((p, k) => { const px = p.x * s + Math.sin(k * 0.7 + s * 40) * 3, py = p.y * s; k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke(); }
  x.strokeStyle = 'rgba(60,34,16,0.35)'; x.lineWidth = 60; pathPoly(x, A.bnd); x.stroke();
  x.strokeStyle = 'rgba(60,34,16,0.25)'; x.lineWidth = 120; pathPoly(x, A.bnd); x.stroke();
  // puddles: dark wet ring, muddy water, sky sheen
  for (const p of A.puddles) {
    const sd = p.x * 0.01 + p.y * 0.003;
    x.save(); x.translate(p.x, p.y); x.rotate(p.a);
    x.fillStyle = 'rgba(46,30,16,0.45)'; blob(x, p.rx * 1.25, p.ry * 1.3, R, sd); x.fill();
    x.fillStyle = 'rgba(46,30,16,0.35)'; blob(x, p.rx * 1.1, p.ry * 1.12, R, sd); x.fill();
    const g = x.createLinearGradient(-p.rx, -p.ry, p.rx, p.ry);
    g.addColorStop(0, '#7a5e40'); g.addColorStop(0.45, '#5a442c'); g.addColorStop(1, '#3a2a1a');
    x.fillStyle = g; blob(x, p.rx, p.ry, R, sd); x.fill();
    x.save(); blob(x, p.rx, p.ry, R, sd); x.clip();
    const s2 = x.createLinearGradient(-p.rx, -p.ry, p.rx * 0.3, p.ry * 0.3);
    s2.addColorStop(0, 'rgba(190,200,215,0.22)'); s2.addColorStop(1, 'rgba(170,190,215,0)');
    x.fillStyle = s2; x.fillRect(-p.rx, -p.ry, p.rx * 2, p.ry * 2);
    x.strokeStyle = 'rgba(220,228,240,0.16)'; x.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) { const cx = p.rx * (R() - 0.5) * 0.9, cy = p.ry * (R() - 0.5) * 0.9; for (let j = 1; j <= 2; j++) { x.beginPath(); x.ellipse(cx, cy, 6 * j + k * 2, 3 * j + k, 0, 0, TAU); x.stroke(); } }
    x.restore();
    x.strokeStyle = 'rgba(30,20,10,0.6)'; x.lineWidth = 2.5; blob(x, p.rx, p.ry, R, sd); x.stroke();
    x.strokeStyle = 'rgba(230,220,200,0.18)'; x.lineWidth = 1.2; blob(x, p.rx * 0.97, p.ry * 0.96, R, sd); x.stroke();
    x.restore();
  }
  if (A.key === 'eight') {
    // painted crossover box in the middle
    x.save(); x.rotate(Math.PI / 4);
    for (let k = -6; k <= 6; k++) { x.fillStyle = k % 2 ? 'rgba(245,245,235,0.55)' : 'rgba(20,20,20,0.35)'; x.fillRect(k * 16 - 8, -110, 16, 24); x.fillRect(k * 16 - 8, 86, 16, 24); }
    x.restore();
    x.font = '48px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(245,240,225,0.28)'; x.fillText('X', 0, 0);
  }
  x.restore();
  // --- walls
  if (A.wall === 'tyre') tyreWall(x, A.bnd, A.bn, 1, R);
  else if (A.wall === 'hay') hayWall(x, A.bnd, A.bn, R);
  else concreteWall(x, A.bnd, A.bn);
  // --- static obstacles
  for (const s of A.statics) {
    if (s.type === 'circle') tyreStack(x, s.x, s.y, s.r);
    else if (s.kind === 'island') island(x, s, R);
    else wedge(x, s);
  }
  // floodlight towers and flag poles
  for (const l of A.lights) {
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(l.x - 14 + 10, l.y - 14 + 12, 28, 28);
    x.fillStyle = '#6a6e76'; x.fillRect(l.x - 14, l.y - 14, 28, 28);
    x.fillStyle = '#3a3e46'; x.fillRect(l.x - 9, l.y - 9, 18, 18);
    const a = Math.atan2(-l.y, -l.x);
    x.save(); x.translate(l.x, l.y); x.rotate(a);
    x.fillStyle = '#2a2c32'; x.fillRect(4, -30, 16, 60);
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) { x.fillStyle = '#fff6d8'; x.fillRect(14 + j * 0, -26 + k * 14, 5, 10); }
    x.restore();
  }
  for (const f of A.flags) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(f.x + 3, f.y + 4, 3.5, 0, TAU); x.fill(); x.fillStyle = '#d8dce4'; x.beginPath(); x.arc(f.x, f.y, 3, 0, TAU); x.fill(); }
  return cv;
}

function pathPoly(x, P) { x.beginPath(); P.forEach((p, k) => (k ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); }
// a smooth wobbly ellipse (puddle edge), drawn through midpoints so it has no corners
function blob(x, rx, ry, R, seed = 1) {
  const n = 32, pts = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU, w = 0.9 + 0.08 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 5 + seed * 2.3); pts.push([Math.cos(a) * rx * w, Math.sin(a) * ry * w]); }
  x.beginPath();
  const mid = (i) => { const p = pts[i % n], q = pts[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
  let m = mid(0); x.moveTo(m[0], m[1]);
  for (let k = 1; k <= n; k++) { const p = pts[k % n]; m = mid(k); x.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
  x.closePath();
}

// walk a closed polygon at a fixed spacing, offset outward by `off`
function walk(P, N, spacing, off, fn) {
  let carry = 0, idx = 0;
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length], n = N[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let t = carry;
    while (t < len) {
      const f = t / len;
      fn(a.x + (b.x - a.x) * f - n.x * off, a.y + (b.y - a.y) * f - n.y * off, Math.atan2(b.y - a.y, b.x - a.x), idx++);
      t += spacing;
    }
    carry = t - len;
  }
}

function tyre(x, px, py, r, white) {
  x.fillStyle = white ? '#e8e6de' : '#18181b'; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  x.strokeStyle = white ? '#b8b6ae' : '#2e2e33'; x.lineWidth = r * 0.28; x.beginPath(); x.arc(px, py, r * 0.66, 0, TAU); x.stroke();
  x.fillStyle = '#09090a'; x.beginPath(); x.arc(px, py, r * 0.4, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1.2; x.beginPath(); x.arc(px, py, r * 0.9, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
}
function tyreWall(x, P, N, rows, R) {
  // shadow band, then two staggered rows of tyres just outside the line
  x.save(); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 50; x.lineJoin = 'round';
  x.beginPath(); P.forEach((p, k) => { const n = N[k]; const px = p.x - n.x * 26 + 6, py = p.y - n.y * 26 + 8; k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke(); x.restore();
  walk(P, N, 21, 32, (px, py, a, i) => tyre(x, px, py, 11.5, false));
  walk(P, N, 21, 11, (px, py, a, i) => tyre(x, px, py, 11.5, (Math.floor(i / 3) % 3) === 0));
}
function hayWall(x, P, N, R) {
  x.save(); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 34; x.lineJoin = 'round';
  x.beginPath(); P.forEach((p, k) => { const n = N[k]; const px = p.x - n.x * 15 + 6, py = p.y - n.y * 15 + 8; k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke(); x.restore();
  walk(P, N, 38, 13, (px, py, a, i) => {
    x.save(); x.translate(px, py); x.rotate(a);
    const tone = ['#d9b45e', '#cfa850', '#e2c06c'][i % 3];
    x.fillStyle = shade(tone, -0.35); x.fillRect(-19, -13, 38, 26);
    x.fillStyle = tone; x.fillRect(-18, -12, 36, 23);
    x.strokeStyle = 'rgba(120,84,30,0.45)'; x.lineWidth = 1;
    for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(-17 + k * 5, -11); x.lineTo(-15 + k * 5, 10); x.stroke(); }
    x.strokeStyle = '#7a5a2a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-8, -12); x.lineTo(-8, 11); x.moveTo(8, -12); x.lineTo(8, 11); x.stroke();
    x.fillStyle = 'rgba(255,240,200,0.22)'; x.fillRect(-18, -12, 36, 5);
    x.restore();
  });
}
function concreteWall(x, P, N) {
  x.save(); x.lineJoin = 'round';
  const band = (off, w, col, dash) => { x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash || []); x.beginPath(); P.forEach((p, k) => { const n = N[k]; const px = p.x - n.x * off, py = p.y - n.y * off; k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke(); x.setLineDash([]); };
  x.translate(6, 8); band(13, 28, 'rgba(0,0,0,0.35)'); x.translate(-6, -8);
  band(13, 26, '#b8b4aa'); band(13, 26, '#d42c26', [40, 40]); band(13, 14, '#e6e2d8');
  band(1, 2, 'rgba(0,0,0,0.35)');
  x.restore();
}
function tyreStack(x, px, py, r) {
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(px + 7, py + 9, r + 2, 0, TAU); x.fill();
  tyre(x, px, py, r, false);
  x.strokeStyle = '#2a2a2e'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, r * 0.86, 0, TAU); x.stroke();
  x.fillStyle = '#e8e6de'; x.beginPath(); x.arc(px, py, r * 0.3, 0, TAU); x.fill();
  x.fillStyle = '#d42c26'; x.beginPath(); x.arc(px, py, r * 0.18, 0, TAU); x.fill();
}
function island(x, s, R) {
  // raised grass infield ringed by tyres
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(s.cx + 8, s.cy + 10, s.br, 0, TAU); x.fill();
  x.fillStyle = '#3d7232'; pathPoly(x, s.pts); x.fill();
  x.save(); pathPoly(x, s.pts); x.clip();
  for (let k = -12; k < 12; k++) { x.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; x.fillRect(s.cx + k * 24, s.cy - s.br, 24, s.br * 2); }
  for (let k = 0; k < 500; k++) { const a = R() * TAU, d = Math.sqrt(R()) * s.br; x.fillStyle = `rgba(${40 + R() * 40},${100 + R() * 60},${30 + R() * 30},0.5)`; x.fillRect(s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, 1.5, 3); }
  x.restore();
  const N = s.pts.map((p, k) => ({ x: -s.on[k].x, y: -s.on[k].y }));   // walk() offsets against N, so this puts tyres just inside
  walk(s.pts, N, 21, -11, (px, py, a, i) => tyre(x, px, py, 11.5, (Math.floor(i / 2) % 2) === 0));
  // big tyre sculpture and a sign in the middle
  tyreStack(x, s.cx, s.cy, 34);
}
function wedge(x, s) {
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.save(); x.translate(6, 8); pathPoly(x, s.pts); x.fill(); x.restore();
  x.fillStyle = '#c8c4ba'; pathPoly(x, s.pts); x.fill();
  x.save(); pathPoly(x, s.pts); x.clip();
  for (let k = -40; k < 40; k++) { x.fillStyle = k % 2 ? '#d42c26' : '#ece8de'; x.save(); x.translate(s.cx, s.cy); x.rotate(Math.PI / 4); x.fillRect(k * 22, -400, 22, 800); x.restore(); }
  x.restore();
  x.strokeStyle = '#8a867c'; x.lineWidth = 4; pathPoly(x, s.pts); x.stroke();
}
function drawStand(x, s, R, A) {
  // grandstand: steel tiers stepping up away from the arena, rows of people, a roof edge at the back
  x.save();
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(s.x + 10, s.y + 12, s.w, s.h);
  x.fillStyle = '#4a4f5a'; x.fillRect(s.x, s.y, s.w, s.h);
  const vertical = s.face === 'e' || s.face === 'w';
  const depth = vertical ? s.w : s.h, len = vertical ? s.h : s.w;
  const rows = Math.floor((depth - 40) / 14);
  for (let r = 0; r < rows; r++) {
    // r = 0 is the front row (nearest the arena)
    const off = 18 + r * 14;
    const tone = r % 2 ? '#626875' : '#575d69';
    x.fillStyle = tone;
    if (s.face === 's') x.fillRect(s.x, s.y + s.h - off - 14, s.w, 14);
    else if (s.face === 'n') x.fillRect(s.x, s.y + off, s.w, 14);
    else if (s.face === 'e') x.fillRect(s.x + s.w - off - 14, s.y, 14, s.h);
    else x.fillRect(s.x + off, s.y, 14, s.h);
    for (let t = 6; t < len - 6; t += 8 + R() * 3) {
      if (R() < 0.14) continue;
      const jitter = (R() - 0.5) * 3;
      let px, py;
      if (s.face === 's') { px = s.x + t; py = s.y + s.h - off - 7 + jitter; }
      else if (s.face === 'n') { px = s.x + t; py = s.y + off + 7 + jitter; }
      else if (s.face === 'e') { px = s.x + s.w - off - 7 + jitter; py = s.y + t; }
      else { px = s.x + off + 7 + jitter; py = s.y + t; }
      x.fillStyle = CROWD[Math.floor(R() * CROWD.length)];
      x.beginPath(); x.ellipse(px, py, 3.6, 3.6, 0, 0, TAU); x.fill();
      x.fillStyle = ['#f2d0b0', '#c89670', '#8a5a3a', '#5a3a26', '#e8b890'][Math.floor(R() * 5)];
      x.beginPath(); x.arc(px, py, 2.1, 0, TAU); x.fill();
      if (R() < 0.08) { x.fillStyle = CROWD[Math.floor(R() * 6)]; x.fillRect(px - 4, py - 4, 8, 2); }   // a raised arm / banner
    }
  }
  // front rail and the roof edge
  x.fillStyle = '#ffd23a';
  if (s.face === 's') x.fillRect(s.x, s.y + s.h - 6, s.w, 4); else if (s.face === 'n') x.fillRect(s.x, s.y + 2, s.w, 4);
  else if (s.face === 'e') x.fillRect(s.x + s.w - 6, s.y, 4, s.h); else x.fillRect(s.x + 2, s.y, 4, s.h);
  x.fillStyle = '#2c3038';
  if (s.face === 's') x.fillRect(s.x, s.y, s.w, 18); else if (s.face === 'n') x.fillRect(s.x, s.y + s.h - 18, s.w, 18);
  else if (s.face === 'e') x.fillRect(s.x, s.y, 18, s.h); else x.fillRect(s.x + s.w - 18, s.y, 18, s.h);
  // banner on the roof edge
  if (!vertical) {
    const text = A.banners[Math.floor(R() * A.banners.length)];
    const by = s.face === 's' ? s.y + 9 : s.y + s.h - 9;
    x.font = '13px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let k = 0; k < Math.floor(s.w / 420); k++) {
      const bx = s.x + 210 + k * 420;
      x.fillStyle = k % 2 ? '#d42c26' : '#ffd23a'; x.fillRect(bx - 110, by - 8, 220, 16);
      x.fillStyle = k % 2 ? '#ffffff' : '#141414'; x.fillText(A.banners[(k + Math.floor(R() * 3)) % A.banners.length], bx, by + 1);
    }
    void text;
  }
  x.restore();
}
