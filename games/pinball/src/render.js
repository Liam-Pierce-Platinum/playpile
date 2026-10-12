// Table drawing. A static layer (art, walls, rubbers, labels) is pre-rendered once per
// resize; everything that moves or lights up is drawn each frame on top of it.
import * as T from './table.js';
import { rampAt } from './table.js';

const FONT = "'Orbitron', 'Segoe UI', system-ui, sans-serif";
const C = {
  wall: '#3ff0ff', wallCore: '#d8fdff', sling: '#ff3fa4', pink: '#ff5ad2', yellow: '#ffd34a',
  orange: '#ff9b3d', green: '#9dff6a', purple: '#b07bff', cyan: '#7dfcff',
};

// ---------- glow sprite cache ----------
const glowCache = new Map();
function glowSprite(col) {
  if (glowCache.has(col)) return glowCache.get(col);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col); gr.addColorStop(0.25, col + 'aa'); gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(col, c); return c;
}
function glow(ctx, x, y, r, col, a = 1) {
  ctx.globalAlpha = a; ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}

// ---------- inserts (lamps) ----------
export const INSERTS = [
  { id: 'ramp', x: 432, y: 650, shape: 'arrow', ang: -Math.PI / 2, col: C.cyan, size: 20, label: 'RAMP' },
  { id: 'orbit', x: 52, y: 668, shape: 'arrow', ang: -Math.PI / 2 - 0.25, col: C.cyan, size: 18, label: 'ORBIT' },
  { id: 'drops', x: 162, y: 478, shape: 'arrow', ang: Math.PI, col: C.orange, size: 15 },
  { id: 'kick', x: 41, y: 918, shape: 'arrow', ang: -Math.PI / 2, col: C.orange, size: 13, label: 'KICK' },
  { id: 'stars', x: 488, y: 682, shape: 'arrow', ang: 0, col: C.green, size: 15 },
  { id: 'lock', x: 244, y: 676, shape: 'pill', col: C.purple, size: 13, label: 'LOCK' },
  { id: 'extra', x: 316, y: 676, shape: 'pill', col: C.green, size: 13, label: 'EXTRA' },
  { id: 'st0', x: 506, y: 628, shape: 'star', col: C.green, size: 8 },
  { id: 'st1', x: 506, y: 682, shape: 'star', col: C.green, size: 8 },
  { id: 'st2', x: 506, y: 736, shape: 'star', col: C.green, size: 8 },
  { id: 'x2', x: 220, y: 800, shape: 'dot', col: C.yellow, size: 9, label: '2X' },
  { id: 'x3', x: 250, y: 812, shape: 'dot', col: C.yellow, size: 9, label: '3X' },
  { id: 'x4', x: 280, y: 816, shape: 'dot', col: C.yellow, size: 9, label: '4X' },
  { id: 'x5', x: 310, y: 812, shape: 'dot', col: C.yellow, size: 9, label: '5X' },
  { id: 'x6', x: 340, y: 800, shape: 'dot', col: C.yellow, size: 9, label: '6X' },
];
for (let i = 0; i < 3; i++) INSERTS.push({ id: 'lane' + i, x: T.LANES[i].x, y: T.LANES[i].y + 2, shape: 'dot', col: C.cyan, size: 9 });
for (let i = 0; i < 8; i++) INSERTS.push({ id: 'rk' + i, x: 196 + i * 24, y: 742, shape: 'chev', col: C.pink, size: 7 });

function insertPath(ctx, s) {
  ctx.beginPath();
  if (s.shape === 'arrow') {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang);
    const z = s.size;
    ctx.moveTo(z, 0); ctx.lineTo(-z * 0.6, -z * 0.7); ctx.lineTo(-z * 0.25, 0); ctx.lineTo(-z * 0.6, z * 0.7); ctx.closePath();
    ctx.restore();
  } else if (s.shape === 'pill') {
    const w = s.size * 2.4, h = s.size;
    ctx.roundRect(s.x - w / 2, s.y - h / 2, w, h, h / 2);
  } else if (s.shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s.size * 0.45 : s.size, a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    }
    ctx.closePath();
  } else if (s.shape === 'chev') {
    const z = s.size; ctx.moveTo(s.x - z, s.y + z * 0.4); ctx.lineTo(s.x, s.y - z * 0.5); ctx.lineTo(s.x + z, s.y + z * 0.4);
    ctx.lineTo(s.x + z, s.y + z * 0.9); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x - z, s.y + z * 0.9); ctx.closePath();
  } else ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
}

// ---------- static layer ----------
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function tableOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(20, 1120); ctx.lineTo(20, T.ARC.cy);
  ctx.arc(T.ARC.cx, T.ARC.cy, T.ARC.r, Math.PI, Math.PI * 2);
  ctx.lineTo(580, 1120); ctx.closePath();
}

function neonLine(ctx, pts, col, w = 4, closed = false) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (closed) ctx.closePath(); };
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 14;
  ctx.strokeStyle = col; ctx.lineWidth = w; path(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#eafcff'; ctx.lineWidth = w * 0.35; path(); ctx.stroke();
  ctx.restore();
}

function post(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fillStyle = '#10142a'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff7ccf'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#ffffffaa'; ctx.fill();
}

export function drawStatic(ctx) {
  // cabinet surround
  ctx.fillStyle = '#07041a'; ctx.fillRect(-40, -40, 680, 1200);
  // playfield
  ctx.save();
  tableOutline(ctx); ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, 1120);
  bg.addColorStop(0, '#1d0f55'); bg.addColorStop(0.45, '#2a1570'); bg.addColorStop(0.75, '#1a0d4a'); bg.addColorStop(1, '#0c0628');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 600, 1120);
  // retro grid
  ctx.strokeStyle = 'rgba(255,90,210,0.07)'; ctx.lineWidth = 1;
  for (let x = 0; x <= 600; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1120); ctx.stroke(); }
  for (let y = 0; y <= 1120; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke(); }
  // stars
  const rnd = seeded(7);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * 600, y = rnd() * 1100, r = rnd() * 1.4 + 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // big ringed planet behind the bumper nest
  {
    const px = 275, py = 320, pr = 120;
    const halo = ctx.createRadialGradient(px, py, pr * 0.8, px, py, pr * 1.7);
    halo.addColorStop(0, 'rgba(255,90,210,0.25)'); halo.addColorStop(1, 'rgba(255,90,210,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, pr * 1.7, 0, Math.PI * 2); ctx.fill();
    const pg = ctx.createLinearGradient(px, py - pr, px, py + pr);
    pg.addColorStop(0, '#ff9a5a'); pg.addColorStop(0.5, '#ff4f9a'); pg.addColorStop(1, '#6a2bd6');
    ctx.globalAlpha = 0.55; ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#1d0f55';
    for (let k = 0; k < 6; k++) ctx.fillRect(px - pr, py + 10 + k * 16, pr * 2, 4 + k * 1.5);
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(px, py + 6, pr * 1.55, pr * 0.32, -0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // sunset stripes behind the flippers
  {
    const sx = 280, sy = 1010, sr = 170;
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy);
    sg.addColorStop(0, 'rgba(255,211,74,0.35)'); sg.addColorStop(1, 'rgba(255,63,164,0.25)');
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr, Math.PI, Math.PI * 2); ctx.clip();
    ctx.fillStyle = sg; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr);
    ctx.fillStyle = '#1a0d4a';
    for (let k = 0; k < 7; k++) ctx.fillRect(sx - sr, sy - 70 + k * 11, sr * 2, 2 + k);
    ctx.restore();
  }
  // title decal
  ctx.save();
  ctx.font = `900 34px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(125,252,255,0.16)'; ctx.fillText('STARLANE', 280, 880);
  ctx.font = `700 11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText('RANK', 280, 760);
  ctx.restore();
  // orbit lane floor tint + shooter lane
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(20, 352, 55, 260); ctx.fillRect(540, 300, 40, 820);
  ctx.fillStyle = 'rgba(63,240,255,0.06)'; ctx.fillRect(540, 300, 40, 820);
  ctx.restore();

  // inserts (unlit)
  for (const s of INSERTS) {
    insertPath(ctx, s);
    ctx.fillStyle = s.col + '30'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = s.col + '90'; ctx.stroke();
  }
  ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of INSERTS) {
    if (!s.label) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    if (s.shape === 'pill') ctx.fillText(s.label, s.x, s.y + 1);
    else if (s.shape === 'arrow') ctx.fillText(s.label, s.x, s.y + 30);
    else ctx.fillText(s.label, s.x, s.y + 19);
  }
  // labels
  ctx.font = `800 10px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.save(); ctx.translate(562, 760); ctx.rotate(-Math.PI / 2); ctx.fillText('LAUNCH', 0, 0); ctx.restore();
  ctx.fillText('BLACK HOLE', T.SAUCER.x, T.SAUCER.y + 36);

  // saucer pit
  {
    const S = T.SAUCER;
    const g = ctx.createRadialGradient(S.x, S.y, 2, S.x, S.y, 26);
    g.addColorStop(0, '#000'); g.addColorStop(0.6, '#0a0418'); g.addColorStop(1, 'rgba(176,123,255,0.0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S.x, S.y, 26, 0, Math.PI * 2); ctx.fill();
  }
  // ramp mouth floor
  ctx.fillStyle = 'rgba(63,240,255,0.10)';
  ctx.fillRect(T.RAMP_MOUTH.x0, T.RAMP_MOUTH.top, T.RAMP_MOUTH.x1 - T.RAMP_MOUTH.x0, T.RAMP_MOUTH.bot - T.RAMP_MOUTH.top);

  // walls
  const arcPts = [];
  for (let i = 0; i <= 60; i++) { const a = Math.PI + (i / 60) * Math.PI; arcPts.push([T.ARC.cx + T.ARC.r * Math.cos(a), T.ARC.cy + T.ARC.r * Math.sin(a)]); }
  neonLine(ctx, [[20, 1120], ...arcPts, [580, 1120]], C.wall, 6);
  neonLine(ctx, [[540, 318], [540, 1120]], C.wall, 4);
  neonLine(ctx, [[75, 352], [75, 600]], C.wall, 4);
  for (const [x, y] of T.LANE_GUIDES) neonLine(ctx, [[x, y], [x, 150]], C.wall, 4);
  const M = T.RAMP_MOUTH;
  neonLine(ctx, [[M.x0, M.bot], [M.x0, M.top], [(M.x0 + M.x1) / 2, M.top - 22], [M.x1, M.top], [M.x1, M.bot]], C.wall, 4);
  neonLine(ctx, [[62, 790], [62, 885], [184, 974]], '#c7d2ff', 4);
  // right return: the old right outlane is closed off by a deflector into the inlane
  {
    const [rx, ry] = T.RETURN_DEFLECT;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(494, 786); ctx.lineTo(498, 790); ctx.lineTo(498, 885); ctx.lineTo(376, 974); ctx.lineTo(384, 1068); ctx.lineTo(rx, 1068); ctx.closePath();
    const dg = ctx.createLinearGradient(0, ry, 0, 1068);
    dg.addColorStop(0, '#3a1670'); dg.addColorStop(1, '#170a3a');
    ctx.fillStyle = dg; ctx.fill();
    ctx.font = '800 10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(125,252,255,0.45)';
    ctx.translate(520, 900); ctx.rotate(-Math.PI / 2); ctx.fillText('RETURN', 0, 0);
    ctx.restore();
  }
  neonLine(ctx, [[T.RETURN_DEFLECT[0], T.RETURN_DEFLECT[1]], [494, 786], [498, 790], [498, 885], [376, 974]], '#c7d2ff', 4);
  // one-way gates (thin wire)
  ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(540, 318); ctx.lineTo(580, 268); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 322); ctx.lineTo(75, 352); ctx.stroke();
  ctx.setLineDash([]);
  // drop-target and star-target slots
  ctx.fillStyle = '#05030f';
  for (const d of T.DROPS) ctx.fillRect(d.x - 4, d.y0 - 2, 10, d.y1 - d.y0 + 4);
  // slingshot bodies
  for (const s of T.SLINGS) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(...s.a); ctx.lineTo(...s.b); ctx.lineTo(...s.c); ctx.closePath();
    const g = ctx.createLinearGradient(s.a[0], s.a[1], s.c[0], s.c[1]);
    g.addColorStop(0, '#5a1b6e'); g.addColorStop(1, '#2a0d40');
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = C.sling; ctx.shadowBlur = 12; ctx.strokeStyle = C.sling; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  // posts
  for (const p of [[540, 318, 4], [75, 352, 4], [75, 600, 5], [62, 790, 5], [498, 790, 5], [M.x0, M.bot, 6], [M.x1, M.bot, 6]]) post(ctx, ...p);
  for (const [x] of T.LANE_GUIDES) post(ctx, x, 150, 5);
  for (const s of T.SLINGS) for (const p of [s.a, s.b, s.c]) post(ctx, p[0], p[1], 6);
  // bumper skirts
  for (const b of T.BUMPERS) {
    ctx.beginPath(); ctx.arc(b.x + 3, b.y + 5, b.r + 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  }
  // flipper pivots
  for (const f of T.FLIPPERS) { ctx.beginPath(); ctx.arc(f.px, f.py, 15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill(); }
}

// Apron (drawn over draining balls) + plunger housing
export function drawApron(ctx, g, t) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(20, 1120); ctx.lineTo(20, 1068); ctx.lineTo(196, 1068); ctx.quadraticCurveTo(280, 1050, 364, 1068); ctx.lineTo(540, 1068); ctx.lineTo(540, 1120); ctx.closePath();
  const ag = ctx.createLinearGradient(0, 1050, 0, 1120);
  ag.addColorStop(0, '#2c1a63'); ag.addColorStop(1, '#120a30');
  ctx.fillStyle = ag; ctx.fill();
  ctx.strokeStyle = C.wall; ctx.lineWidth = 2; ctx.stroke();
  const save = g.ballSave > 0 && (g.ballSave > 2 || Math.floor(t * 8) % 2 === 0);
  lampText(ctx, 'BALL SAVE', 110, 1094, save, C.green);
  lampText(ctx, 'SHOOT AGAIN', 450, 1094, g.extraBalls > 0, C.orange);
  lampText(ctx, 'BALL ' + g.ballNum, 280, 1094, true, C.cyan);
  // plunger housing
  ctx.fillStyle = '#120a30'; ctx.fillRect(540, 1080, 40, 40);
  ctx.restore();
}
function lampText(ctx, txt, x, y, on, col) {
  ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (on) { glow(ctx, x, y, 46, col, 0.35); ctx.fillStyle = col; } else ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillText(txt, x, y);
}

// ---------- dynamic ----------
function insertLit(g, s, t) {
  const blink = Math.floor(t * 6) % 2 === 0, slow = Math.floor(t * 3) % 2 === 0;
  const m = g.mission.id;
  switch (s.id) {
    case 'ramp': return g.jackpotLit ? (blink ? 1 : 0.3) : m === 'ramp' ? (slow ? 1 : 0.35) : g.fx.ramp;
    case 'orbit': return m === 'orbit' || m === 'spin' ? (slow ? 1 : 0.35) : g.fx.orbit;
    case 'drops': return m === 'drop' ? (slow ? 1 : 0.35) : 0;
    case 'stars': return m === 'stand' ? (slow ? 1 : 0.35) : 0;
    case 'lock': return g.lockLit ? (blink ? 1 : 0.4) : g.locks > 0 ? 0.5 : 0;
    case 'kick': return g.kickLit ? (slow ? 1 : 0.6) : g.fx.kick;
    case 'extra': return g.extraLit ? (blink ? 1 : 0.4) : 0;
  }
  if (s.id.startsWith('st')) return g.stands[+s.id[2]] ? 1 : g.fx.stand[+s.id[2]];
  if (s.id[0] === 'x') return g.bonusX >= +s.id[1] ? 1 : 0;
  if (s.id.startsWith('lane')) {
    const i = +s.id[4];
    return g.lanes[i] ? 1 : g.fx.lane[i];
  }
  if (s.id.startsWith('rk')) return +s.id.slice(2) <= g.rank ? 1 : 0;
  return 0;
}

const flipPrev = new WeakMap();
function flipperTrail(ctx, f) {
  const prev = flipPrev.has(f) ? flipPrev.get(f) : f.a;
  flipPrev.set(f, f.a);
  if (Math.abs(prev - f.a) < 0.05 || f.a > prev) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.moveTo(f.px, f.py);
  const n = 6;
  for (let i = 0; i <= n; i++) { const a = prev + (f.a - prev) * (i / n); ctx.lineTo(f.px + f.sgn * Math.cos(a) * (f.len + 6), f.py + Math.sin(a) * (f.len + 6)); }
  ctx.closePath(); ctx.fillStyle = 'rgba(255,90,210,0.28)'; ctx.fill();
  ctx.restore();
}
function drawFlipper(ctx, f) {
  flipperTrail(ctx, f);
  const L = f.len, a = f.a, dx = f.sgn * Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const tx = f.px + dx * L, ty = f.py + dy * L;
  const path = (grow) => {
    const r1 = f.r1 + grow, r2 = f.r2 + grow, ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(f.px, f.py, r1, ang + Math.PI / 2, ang - Math.PI / 2);
    ctx.lineTo(tx + nx * -r2 * 1, ty + ny * -r2 * 1);
    ctx.arc(tx, ty, r2, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(4, 6); path(1); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill(); ctx.translate(-4, -6);
  path(2); ctx.fillStyle = '#ff3fa4'; ctx.fill();          // rubber
  path(-1);
  const gr = ctx.createLinearGradient(f.px + nx * 12, f.py + ny * 12, f.px - nx * 12, f.py - ny * 12);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#e9e4ff'); gr.addColorStop(1, '#a596e6');
  ctx.fillStyle = gr; ctx.fill();
  ctx.beginPath(); ctx.arc(f.px, f.py, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#ff3fa4'; ctx.fill();
  ctx.restore();
}

function drawBall(ctx, b, t, lift = 0) {
  const r = T.BALL_R * (1 + lift * 0.18);
  ctx.beginPath(); ctx.arc(b.x + 3 + lift * 10, b.y + 5 + lift * 14, r * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,' + (0.45 - lift * 0.15) + ')'; ctx.fill();
  const g = ctx.createRadialGradient(b.x - r * 0.4, b.y - r * 0.45, r * 0.1, b.x, b.y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#dfe6ff'); g.addColorStop(0.75, '#7c84b8'); g.addColorStop(1, '#2a2350');
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  // environment reflection band
  ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(255,90,210,0.35)'; ctx.fillRect(b.x - r, b.y + r * 0.25, r * 2, r * 0.35);
  ctx.fillStyle = 'rgba(63,240,255,0.3)'; ctx.fillRect(b.x - r, b.y + r * 0.6, r * 2, r * 0.4);
  ctx.restore();
  ctx.beginPath(); ctx.arc(b.x - r * 0.35, b.y - r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

function rampPath(ctx, track) {
  const p = track.pts;
  ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
    ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
  }
  ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
}

function drawRamp(ctx, g, t) {
  const tr = g.track;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // shadow
  ctx.translate(7, 10); rampPath(ctx, tr); ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 32; ctx.stroke(); ctx.translate(-7, -10);
  // plastic
  rampPath(ctx, tr); ctx.strokeStyle = 'rgba(125,252,255,0.16)'; ctx.lineWidth = 32; ctx.stroke();
  const hot = g.fx.ramp + (g.jackpotLit ? 0.5 + 0.5 * Math.sin(t * 10) : 0);
  // rails
  ctx.strokeStyle = hot > 0.05 ? `rgba(255,255,255,${0.6 + 0.4 * Math.min(1, hot)})` : 'rgba(200,250,255,0.75)';
  ctx.lineWidth = 2.5;
  for (const off of [-14, 14]) { ctx.save(); ctx.setLineDash([]); offsetStroke(ctx, tr, off); ctx.restore(); }
  // moving chevrons
  ctx.fillStyle = g.jackpotLit ? '#ff5ad2' : '#7dfcff';
  const step = 46, ph = (t * 140) % step;
  for (let d = ph; d < tr.len - 20; d += step) {
    const p = rampAt(tr, d);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty, p.tx));
    ctx.globalAlpha = 0.35 + 0.3 * Math.min(1, hot);
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -7); ctx.lineTo(-1, 0); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
function offsetStroke(ctx, tr, off) {
  ctx.beginPath();
  const n = Math.ceil(tr.len / 12);
  for (let i = 0; i <= n; i++) {
    const p = rampAt(tr, (i / n) * tr.len);
    const x = p.x - p.ty * off, y = p.y + p.tx * off;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

export function drawDynamic(ctx, g, t) {
  const fx = g.fx;
  ctx.globalCompositeOperation = 'lighter';
  for (const s of INSERTS) {
    const lit = insertLit(g, s, t);
    if (lit <= 0.02) continue;
    glow(ctx, s.x, s.y, s.size * 3.2, s.col, 0.55 * lit);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const s of INSERTS) {
    const lit = insertLit(g, s, t);
    if (lit <= 0.02) continue;
    insertPath(ctx, s); ctx.globalAlpha = Math.min(1, lit); ctx.fillStyle = s.col; ctx.fill();
    ctx.globalAlpha = 1;
    if (s.shape === 'pill') { ctx.font = `800 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#12082c'; ctx.fillText(s.label, s.x, s.y + 1); }
  }

  // saucer swirl
  {
    const S = T.SAUCER, lit = g.lockLit || g.extraLit || g.mission.id === 'saucer';
    ctx.save(); ctx.translate(S.x, S.y); ctx.rotate(t * 3);
    for (let k = 0; k < 3; k++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, 1.6);
      ctx.strokeStyle = lit ? `rgba(197,139,255,${0.7 + 0.3 * Math.sin(t * 8)})` : 'rgba(197,139,255,0.45)'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
    if (fx.saucer > 0) glow(ctx, S.x, S.y, 60 * fx.saucer + 20, C.purple, fx.saucer);
    if (fx.kick > 0) glow(ctx, 41, T.KICKBACK.y, 90 * fx.kick + 20, C.orange, fx.kick);
  }

  // drop targets
  T.DROPS.forEach((d, i) => {
    if (g.drops[i]) {
      const gr = ctx.createLinearGradient(d.x - 4, 0, d.x + 6, 0);
      gr.addColorStop(0, '#ffcf8a'); gr.addColorStop(1, '#ff7a1a');
      ctx.fillStyle = gr; ctx.fillRect(d.x - 3, d.y0, 9, d.y1 - d.y0);
      ctx.fillStyle = '#fff6'; ctx.fillRect(d.x + 3, d.y0 + 2, 2, d.y1 - d.y0 - 4);
    } else if (fx.drop[i] > 0) glow(ctx, d.x + 4, (d.y0 + d.y1) / 2, 40, C.orange, fx.drop[i]);
  });
  // star targets
  T.STANDUPS.forEach((d, i) => {
    const on = g.stands[i] || fx.stand[i] > 0;
    ctx.fillStyle = on ? '#d8ffbf' : '#5fc23a';
    ctx.fillRect(d.x - 3, d.y0, 8, d.y1 - d.y0);
    if (fx.stand[i] > 0) glow(ctx, d.x, (d.y0 + d.y1) / 2, 34, C.green, fx.stand[i]);
  });
  // spinner
  {
    const y = T.ORBIT.spinnerY, c = Math.cos(g.spinner.phase * Math.PI * 2);
    ctx.fillStyle = '#9aa3d6'; ctx.fillRect(20, y - 1, 55, 2);
    ctx.beginPath(); ctx.arc(22, y, 3, 0, Math.PI * 2); ctx.arc(73, y, 3, 0, Math.PI * 2); ctx.fill();
    const h = Math.abs(c) * 8 + 1;
    const sg = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    sg.addColorStop(0, c > 0 ? '#ffffff' : '#ffe27a'); sg.addColorStop(1, c > 0 ? '#8f98d0' : '#ff9b3d');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(26, y - h / 2, 43, h, 2); ctx.fill();
    if (g.spinner.w > 2) glow(ctx, 47, y, 30, C.yellow, Math.min(1, g.spinner.w / 15));
  }
  // slings: kicker rubber flash
  T.SLINGS.forEach((s, i) => {
    const k = fx.sling[i];
    ctx.save(); ctx.lineCap = 'round';
    const mx = (s.a[0] + s.c[0]) / 2, my = (s.a[1] + s.c[1]) / 2;
    const dx = s.c[0] - s.a[0], dy = s.c[1] - s.a[1], l = Math.hypot(dx, dy), nx = dy / l * (i ? -1 : 1), ny = -dx / l * (i ? -1 : 1);
    ctx.beginPath(); ctx.moveTo(...s.a); ctx.quadraticCurveTo(mx + nx * 8 * k, my + ny * 8 * k, ...s.c);
    ctx.strokeStyle = k > 0 ? '#ffffff' : '#ffb3dd'; ctx.lineWidth = 4 + k * 2; ctx.stroke();
    ctx.restore();
    if (k > 0) glow(ctx, mx, my, 70, C.sling, k);
  });
  // bumpers
  T.BUMPERS.forEach((b, i) => {
    const k = fx.bump[i], r = b.r * (1 + k * 0.12);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1240'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = k > 0 ? '#ffffff' : C.wall; ctx.stroke();
    const gr = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, 2, b.x, b.y, r);
    gr.addColorStop(0, k > 0 ? '#ffffff' : '#fff2b0'); gr.addColorStop(0.55, '#ffc23a'); gr.addColorStop(1, '#ff5a1f');
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.82, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
    // star cap
    ctx.beginPath();
    for (let j = 0; j < 10; j++) { const rr = j % 2 ? r * 0.2 : r * 0.48, a = -Math.PI / 2 + (j * Math.PI) / 5 + i; ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = '#ffffffcc'; ctx.fill();
    if (k > 0) glow(ctx, b.x, b.y, b.r * 3.5, C.yellow, k);
  });
  // plunger
  {
    const pull = g.plunger, top = T.LANE_FLOOR + pull * 34;
    ctx.fillStyle = '#9aa3d6';
    for (let k = 0; k < 6; k++) { const y = top + 6 + k * ((1115 - top) / 6); ctx.fillRect(549, y, 22, 2); }
    const pg = ctx.createLinearGradient(545, 0, 575, 0);
    pg.addColorStop(0, '#ff3fa4'); pg.addColorStop(0.5, '#ffd0ec'); pg.addColorStop(1, '#ff3fa4');
    ctx.fillStyle = pg; ctx.fillRect(546, top, 28, 7);
    if (pull > 0) glow(ctx, 560, top, 30 + pull * 30, C.pink, 0.5 + pull * 0.5);
    // power gauge with the skill-shot sweet spot, shown while a ball waits
    const lb = g.laneBall();
    if (lb && !lb.launched && lb.y > 1000 && !lb.auto) {
      const y0 = 1040, H = 170, zy = y0 - g.skillZone * H, zh = 0.14 * H;
      ctx.fillStyle = 'rgba(5,3,15,0.85)'; ctx.beginPath(); ctx.roundRect(549, y0 - H - 4, 22, H + 8, 6); ctx.fill();
      glow(ctx, 560, zy, 34, C.green, 0.5 + 0.3 * Math.sin(t * 8));
      ctx.fillStyle = '#9dff6a'; ctx.fillRect(551, zy - zh / 2, 18, zh);
      const fg = ctx.createLinearGradient(0, y0, 0, y0 - H);
      fg.addColorStop(0, '#ff3fa4'); fg.addColorStop(1, '#ffd34a');
      ctx.fillStyle = fg; ctx.globalAlpha = 0.9; ctx.fillRect(554, y0 - pull * H, 12, pull * H); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.fillRect(549, y0 - pull * H - 1.5, 22, 3);
      ctx.save(); ctx.translate(560, y0 - H - 16); ctx.font = '800 9px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = '#9dff6a'; ctx.fillText('SKILL', 0, 0); ctx.restore();
    }
  }
  // flippers
  for (const f of g.W.flips) drawFlipper(ctx, f);

  // balls on the playfield, with speed trails
  ctx.globalCompositeOperation = 'lighter';
  for (const b of g.W.balls) {
    if (b.ramp || b.held > 0) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 900) continue;
    const tr = b.trail, n = tr.length / 2;
    for (let i = 0; i < n - 1; i++) glow(ctx, tr[i * 2], tr[i * 2 + 1], T.BALL_R * (0.6 + i / n), '#9ff3ff', ((i + 1) / n) * 0.25 * Math.min(1, (sp - 900) / 900));
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of g.W.balls) if (!b.ramp) {
    if (b.held > 0) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 10)); drawBall(ctx, b, t); ctx.globalAlpha = 1; }
    else drawBall(ctx, b, t);
  }
  drawApron(ctx, g, t);
  drawRamp(ctx, g, t);
  for (const b of g.W.balls) if (b.ramp) drawBall(ctx, b, t, 1);

  // particles + popups
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.parts) {
    const a = Math.max(0, p.life / p.max);
    ctx.strokeStyle = p.col; ctx.globalAlpha = a; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of g.pops) {
    const k = p.t / 0.9, big = p.text.length > 5;
    ctx.font = `900 ${big ? 18 : 13}px ${FONT}`;
    ctx.globalAlpha = 1 - k * k;
    ctx.lineWidth = 4; ctx.strokeStyle = '#12082c'; ctx.strokeText(p.text, p.x, p.y - k * 40);
    ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y - k * 40);
  }
  ctx.globalAlpha = 1;
  // tilt overlay
  if (g.tilted) {
    ctx.fillStyle = 'rgba(255,0,40,0.12)'; ctx.fillRect(0, 0, 600, 1120);
  }
}
