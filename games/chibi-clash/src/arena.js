// Field arenas: pixel ground per zone (pre-rendered once) + solid obstacles (circle colliders).
import { ZONES } from './data.js';
import { Grid, dk, lt, mix } from './sprites.js';
import { GW, GH } from './input.js';

export const BOUNDS = { x0: 16, y0: 34, x1: GW - 16, y1: GH - 12 };

function rngFrom(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

function obstacleSprite(kind, variant) {
  let g;
  if (kind === 'tree') {
    g = new Grid(30, 38);
    g.rect(13, 24, 5, 11, '#7a4e2e'); g.rect(13, 24, 2, 11, '#9a6a3e');
    const leaf = variant ? '#3f9a3a' : '#4aa83e';
    g.ell(15, 15, 12, 11, (nx, ny) => { const l = -(nx * 0.5 + ny * 0.85); return l > 0.5 ? lt(leaf, 0.35) : l < -0.35 ? dk(leaf, 0.35) : leaf; });
    for (const [x, y] of [[9, 9], [18, 7], [21, 15], [10, 17], [15, 12]]) g.rect(x, y, 2, 1, lt(leaf, 0.5));
    if (variant) for (const [x, y] of [[8, 14], [19, 11], [14, 19]]) g.rect(x, y, 2, 2, '#ff5a5a');
    g.outline('#1e2a1e');
    return { cv: g.toCanvas(), ax: 15, ay: 35, r: 9 };
  }
  if (kind === 'rock') {
    g = new Grid(26, 20);
    const c = variant ? '#7a6a64' : '#8a7a70';
    g.ell(13, 11, 11, 8, (nx, ny) => { const l = -(nx * 0.5 + ny * 0.85); return l > 0.45 ? lt(c, 0.3) : l < -0.35 ? dk(c, 0.4) : c; });
    g.line(9, 8, 13, 12, dk(c, 0.3)); g.line(13, 12, 16, 9, dk(c, 0.3));
    if (variant) { g.line(6, 14, 10, 16, '#ff7a2e'); g.line(10, 16, 12, 15, '#ffd36b'); }
    g.outline('#2a1e1e');
    return { cv: g.toCanvas(), ax: 13, ay: 18, r: 10 };
  }
  if (kind === 'coral') {
    g = new Grid(26, 24);
    const c = variant ? '#ff8a9a' : '#ff9a6a';
    g.ell(13, 18, 10, 5, '#a89070');
    for (const [x0, y0, x1, y1] of [[13, 18, 13, 5], [13, 12, 7, 6], [13, 14, 19, 7], [8, 9, 5, 4], [18, 10, 21, 5]]) { g.line(x0, y0, x1, y1, c); g.line(x0 + 1, y0, x1 + 1, y1, lt(c, 0.3)); }
    g.outline('#3a1e2a');
    return { cv: g.toCanvas(), ax: 13, ay: 22, r: 9 };
  }
  if (kind === 'shroom') { // glowing toadstool for Gloomwood Hollow
    g = new Grid(26, 30);
    const cap = variant ? '#6affc0' : '#b07aff', stem = '#e8dcc8';
    g.rect(10, 15, 6, 12, stem); g.rect(10, 15, 2, 12, '#fff6e8'); g.rect(15, 15, 1, 12, '#b8a890');
    g.ell(13, 12, 12, 8, (nx, ny) => { const l = -(nx * 0.5 + ny * 0.85); return l > 0.45 ? lt(cap, 0.35) : l < -0.3 ? dk(cap, 0.35) : cap; });
    g.rect(2, 14, 22, 2, dk(cap, 0.45));
    for (const [x, y] of [[7, 8], [15, 6], [19, 10], [11, 11]]) g.rect(x, y, 2, 2, '#ffffff');
    g.outline('#14101e');
    return { cv: g.toCanvas(), ax: 13, ay: 27, r: 8 };
  }
  if (kind === 'pillar') { // broken stone column for the Endless Arena
    g = new Grid(20, 34);
    const c = variant ? '#c8bca8' : '#d8ccb4';
    g.rect(3, 28, 14, 4, dk(c, 0.25));
    g.rect(5, 6, 10, 22, c); g.rect(5, 6, 2, 22, lt(c, 0.35)); g.rect(13, 6, 2, 22, dk(c, 0.25));
    for (const x of [8, 11]) g.rect(x, 7, 1, 21, dk(c, 0.15));
    g.rect(3, 4, 14, 3, lt(c, 0.15));
    if (variant) { g.rect(5, 2, 4, 2, c); g.rect(11, 3, 3, 1, c); } else g.rect(4, 1, 12, 3, c);
    g.outline('#2a1e1a');
    return { cv: g.toCanvas(), ax: 10, ay: 31, r: 7 };
  }
  // crystal
  g = new Grid(24, 30);
  const c = variant ? '#8ae0ff' : '#c08aff';
  g.ell(12, 25, 9, 3.5, '#4a4660');
  g.poly([[6, 26], [8, 8], [12, 4], [14, 26]], c);
  g.poly([[12, 26], [16, 12], [20, 16], [19, 26]], dk(c, 0.2));
  g.poly([[3, 26], [4, 16], [8, 19], [8, 26]], lt(c, 0.2));
  g.line(10, 7, 10, 22, lt(c, 0.6));
  g.outline('#1e1630');
  return { cv: g.toCanvas(), ax: 12, ay: 27, r: 8 };
}

export function makeArena(zi, seed = 1) {
  const Z = ZONES[zi], rnd = rngFrom(seed * 7919 + zi * 31);
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
  const x = cv.getContext('2d');
  // ground: 4px blocks, 3 shades, clumped with low-frequency noise
  for (let y = 0; y < GH; y += 4) for (let i = 0; i < GW; i += 4) {
    const n = Math.sin(i * 0.05 + seed) * Math.cos(y * 0.07 + seed * 2) + (rnd() - 0.5) * 0.9;
    x.fillStyle = n > 0.45 ? Z.ground[1] : n < -0.45 ? Z.ground[2] : Z.ground[0];
    x.fillRect(i, y, 4, 4);
  }
  // tufts and decorations
  for (let k = 0; k < 260; k++) {
    const px = Math.floor(rnd() * GW), py = Math.floor(rnd() * GH);
    x.fillStyle = dk(Z.ground[0], 0.25); x.fillRect(px, py, 1, 2); x.fillRect(px + 2, py - 1, 1, 3); x.fillRect(px + 4, py, 1, 2);
  }
  for (let k = 0; k < 70; k++) {
    const px = Math.floor(rnd() * GW), py = Math.floor(rnd() * GH), c = Z.deco[k % Z.deco.length];
    x.fillStyle = c; x.fillRect(px, py, 2, 2);
    if (k % 3 === 0) { x.fillRect(px - 2, py, 2, 2); x.fillRect(px + 2, py, 2, 2); x.fillRect(px, py - 2, 2, 2); x.fillRect(px, py + 2, 2, 2); x.fillStyle = '#ffe04a'; x.fillRect(px, py, 2, 2); }
  }
  // border: the arena edge (hedge / cliff / surf / rock wall)
  const B = BOUNDS, e = Z.edge;
  x.fillStyle = e;
  x.fillRect(0, 0, GW, B.y0 - 6); x.fillRect(0, B.y1 + 4, GW, GH); x.fillRect(0, 0, B.x0 - 6, GH); x.fillRect(B.x1 + 6, 0, GW, GH);
  for (let i = 0; i < GW; i += 6) {
    x.fillStyle = lt(e, 0.2); x.fillRect(i, B.y0 - 8 + ((i / 6) % 2) * 2, 6, 3);
    x.fillStyle = dk(e, 0.3); x.fillRect(i, B.y1 + 3 - ((i / 6) % 2), 6, 3);
  }
  for (let j = 0; j < GH; j += 6) { x.fillStyle = lt(e, 0.15); x.fillRect(B.x0 - 8 + ((j / 6) % 2), j, 3, 6); x.fillRect(B.x1 + 5 - ((j / 6) % 2), j, 3, 6); }
  if (zi === 2) { // surf foam on the coast
    for (let i = 0; i < GW; i += 3) { x.fillStyle = '#ffffff'; if ((i * 7) % 5 < 2) x.fillRect(i, B.y1 + 6 + ((i * 3) % 4), 3, 1); }
  }
  // obstacles
  const obs = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let tries = 0; obs.length < n && tries < 300; tries++) {
    const ox = B.x0 + 40 + rnd() * (B.x1 - B.x0 - 80), oy = B.y0 + 26 + rnd() * (B.y1 - B.y0 - 40);
    if (ox < 130 && Math.abs(oy - 150) < 50) continue; // keep player spawn clear
    if (ox > 340 && Math.abs(oy - 150) < 60) continue; // enemy spawn
    if (obs.some((o) => Math.hypot(o.x - ox, o.y - oy) < 52)) continue;
    const spr = obstacleSprite(Z.obst, rnd() < 0.35 ? 1 : 0);
    obs.push({ x: ox, y: oy, r: spr.r, spr });
  }
  // contact shadows baked into the ground
  for (const o of obs) { x.fillStyle = 'rgba(20,10,30,0.28)'; x.beginPath(); x.ellipse(Math.round(o.x), Math.round(o.y), o.r + 3, 4, 0, 0, Math.PI * 2); x.fill(); }
  return { bg: cv, obs, zone: Z };
}

export function drawObstacle(ctx, o) {
  ctx.drawImage(o.spr.cv, Math.round(o.x - o.spr.ax), Math.round(o.y - o.spr.ay));
}
export { mix };
