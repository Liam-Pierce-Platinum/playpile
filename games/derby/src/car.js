// A derby car: physics state, the four damage zones + engine, dents, lost panels, and the
// top-down drawing (deformed body outline, glass, roof number, door names, smoke points).
import { CARS } from './data.js';
import { clamp, rng, shade, TAU } from './util.js';
import { toLocal } from './physics.js';

export const ZONES = ['front', 'rear', 'left', 'right'];
let nextId = 1;

export class Car {
  constructor(model, livery, isPlayer = false) {
    const M = CARS[model];
    this.id = nextId++;
    this.model = model; this.M = M;
    this.L = M.L; this.W = M.W; this.mass = M.mass;
    this.I = (M.mass * (M.L * M.L + M.W * M.W)) / 3;
    this.livery = livery;   // { top, stripe, num, name }
    this.name = livery.name;
    this.isPlayer = isPlayer;
    this.x = 0; this.y = 0; this.h = 0; this.vx = 0; this.vy = 0; this.w = 0;
    this.steer = 0; this.drift = 0; this.speed = 0; this.slip = 0; this.vf = 0; this.stun = 0; this.wob = 0;
    this.zmax = M.zone; this.zones = [M.zone, M.zone, M.zone, M.zone];
    this.emax = M.engine; this.engine = M.engine;
    this.boost = 1; this.boostOn = false; this.spikes = 0;
    this.alive = true; this.deadT = 0; this.deathTime = null; this.place = 0;
    this.dents = [];
    this.lost = { bumperF: false, bumperR: false, bonnet: false, boot: false, doorL: false, doorR: false };
    this.seed = Math.random() * 1000;
    this.crack = rng(this.id * 977 + 13);
    this.cracks = { front: null, rear: null };
    this.stats = { dealt: 0, taken: 0, wrecks: 0, hits: 0, survived: 0 };
    this.lastHitBy = null; this.lastHitT = -99;
    this.input = { steer: 0, throttle: 0, brake: 0, hand: false, boost: false };
    this.marks = [null, null, null, null];
  }
  get health() { return (this.zones[0] + this.zones[1] + this.zones[2] + this.zones[3] + this.engine * 2) / (this.zmax * 4 + this.emax * 2); }
  zf(i) { return this.zones[i] / this.zmax; }
  get ef() { return clamp(this.engine / this.emax, 0, 1); }

  // which zone a world point falls on
  zoneAt(px, py) {
    const p = toLocal(this, px, py);
    const u = p.x / this.L, v = p.y / this.W;
    if (Math.abs(u) * 1.15 > Math.abs(v)) return u > 0 ? 0 : 1;
    return v > 0 ? 3 : 2;
  }

  // apply damage to a zone. Returns the list of parts that came off.
  damage(amount, zone, px, py) {
    if (!this.alive || amount <= 0) return [];
    const z = this.zones[zone], take = Math.min(z, amount), over = amount - take;
    this.zones[zone] -= take;
    // the engine sits up front: front hits shake it most; a zone with nothing left passes it all through
    this.engine -= amount * [0.3, 0.18, 0.15, 0.15][zone] + over * 0.9;
    this.stats.taken += amount;
    if (px !== undefined) this.dent(px, py, amount);
    const lostNow = [];
    const f = (i) => this.zones[i] / this.zmax;
    const L = this.lost;
    if (!L.bumperF && f(0) < 0.62) { L.bumperF = true; lostNow.push('bumperF'); }
    if (!L.bonnet && f(0) < 0.26) { L.bonnet = true; lostNow.push('bonnet'); }
    if (!L.bumperR && f(1) < 0.62) { L.bumperR = true; lostNow.push('bumperR'); }
    if (!L.boot && f(1) < 0.26 && this.M.shape !== 'bus') { L.boot = true; lostNow.push('boot'); }
    if (!L.doorL && f(2) < 0.4) { L.doorL = true; lostNow.push('doorL'); }
    if (!L.doorR && f(3) < 0.4) { L.doorR = true; lostNow.push('doorR'); }
    if (amount > 14 && Math.random() < 0.3) lostNow.push('hubcap');
    if (amount > 10 && Math.random() < 0.5) lostNow.push('glass');
    if (!this.cracks.front && f(0) < 0.72) this.cracks.front = this.makeCrack();
    if (!this.cracks.rear && f(1) < 0.72) this.cracks.rear = this.makeCrack();
    return lostNow;
  }
  repair() {
    let wi = 0; for (let i = 1; i < 4; i++) if (this.zones[i] < this.zones[wi]) wi = i;
    this.zones[wi] = Math.min(this.zmax, this.zones[wi] + this.zmax * 0.55);
    this.engine = Math.min(this.emax, this.engine + this.emax * 0.3);
    for (const d of this.dents) d.d *= 0.55;
    return ZONES[wi];
  }
  dent(px, py, amount) {
    const p = toLocal(this, px, py);
    const lx = clamp(p.x, -this.L, this.L), ly = clamp(p.y, -this.W, this.W);
    const add = Math.min(7, amount * 0.16);
    for (const d of this.dents) {
      if (Math.hypot(d.x - lx, d.y - ly) < 9) { d.d = Math.min(this.W * 0.75, d.d + add); d.r = Math.min(26, d.r + amount * 0.08); return; }
    }
    this.dents.push({ x: lx, y: ly, d: add, r: clamp(9 + amount * 0.3, 9, 22), s: Math.random() * 100 });
    if (this.dents.length > 16) this.dents.shift();
  }
  makeCrack() {
    const R = this.crack, lines = [];
    const cy = (R() - 0.5) * this.W * 0.9;
    for (let k = 0; k < 7; k++) { const a = R() * TAU, l = 3 + R() * 6; lines.push([cy, a, l]); }
    return lines;
  }
}

// ------------------------------------------------------------ drawing
const outlines = new Map();
function perimeter(L, W, rcF, rcR) {
  const key = `${L}|${W}|${rcF}|${rcR}`;
  if (outlines.has(key)) return outlines.get(key);
  const pts = [], step = 3.2;
  const seg = (x0, y0, x1, y1, nx, ny) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step)); for (let i = 0; i < n; i++) { const t = i / n; pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny }); } };
  const arc = (cx, cy, rc, a0) => { for (let i = 0; i < 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2); pts.push({ x: cx + Math.cos(a) * rc, y: cy + Math.sin(a) * rc, nx: Math.cos(a), ny: Math.sin(a) }); } };
  seg(L, -W + rcF, L, W - rcF, 1, 0); arc(L - rcF, W - rcF, rcF, 0);
  seg(L - rcF, W, -L + rcR, W, 0, 1); arc(-L + rcR, W - rcR, rcR, Math.PI / 2);
  seg(-L, W - rcR, -L, -W + rcR, -1, 0); arc(-L + rcR, -W + rcR, rcR, Math.PI);
  seg(-L + rcR, -W, L - rcF, -W, 0, -1); arc(L - rcF, -W + rcF, rcF, -Math.PI / 2);
  outlines.set(key, pts);
  return pts;
}

// the body outline pushed in wherever it's been hit, with a jagged crumple
function deformed(car) {
  const L = car.L, W = car.W;
  const base = perimeter(L, W, car.M.shape === 'bus' ? 4 : 7, 4);
  if (!car.dents.length) return base;
  return base.map((p, i) => {
    let d = 0;
    for (const dn of car.dents) { const k = 1 - Math.hypot(p.x - dn.x, p.y - dn.y) / dn.r; if (k > 0) d += dn.d * k * (0.75 + 0.5 * Math.abs(Math.sin(i * 2.7 + dn.s))); }
    const max = Math.abs(p.nx) > 0.7 ? L * 0.3 : W * 0.6;
    d = Math.min(max, d);
    return { x: p.x - p.nx * d, y: p.y - p.ny * d, nx: p.nx, ny: p.ny, d };
  });
}
function trace(x, P) { x.beginPath(); P.forEach((p, k) => (k ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); }
const rr = (x, px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); };

// cabin layout per shape, as fractions of the half length
const LAYOUT = {
  hatch:  { ws: [0.18, 0.42], roof: [-0.55, 0.18], rg: [-0.76, -0.55] },
  wagon:  { ws: [0.2, 0.38], roof: [-0.78, 0.2], rg: [-0.9, -0.78] },
  muscle: { ws: [-0.02, 0.2], roof: [-0.44, -0.02], rg: [-0.62, -0.44] },
  pickup: { ws: [0.24, 0.4], roof: [-0.08, 0.24], rg: [-0.14, -0.08] },
  bus:    { ws: [0.74, 0.84], roof: [-0.97, 0.74], rg: null },
};

export function drawShadow(x, car) {
  x.save(); x.translate(car.x + 5, car.y + 7); x.rotate(car.h);
  x.fillStyle = 'rgba(0,0,0,0.32)'; rr(x, -car.L - 1, -car.W - 1, car.L * 2 + 2, car.W * 2 + 2, 7); x.fill();
  x.restore();
}

export function drawCar(x, car, time = 0, opts = {}) {
  const L = car.L, W = car.W, M = car.M, S = car.livery, lay = LAYOUT[M.shape];
  const top = S.top, side = shade(top, -0.42);
  x.save();
  x.translate(car.x, car.y); x.rotate(car.h);
  // wheels (fronts steer, wrecked corners wobble)
  const ax = M.shape === 'bus' ? [L * 0.72, -L * 0.6] : [L * 0.6, -L * 0.6];
  const wl = M.shape === 'bus' ? 13 : 11;
  const wheel = (wx, wy, a) => { x.save(); x.translate(wx, wy); x.rotate(a); x.fillStyle = '#0d0d0f'; rr(x, -wl / 2, -3.3, wl, 6.6, 2); x.fill(); x.fillStyle = '#4a4e56'; x.fillRect(-wl / 2 + 2, -3.3, wl - 4, 1.4); x.restore(); };
  const wob = (z1, z2, k) => { const f = Math.min(car.zf(z1), car.zf(z2)); return f < 0.3 ? Math.sin(time * 22 + k + car.seed) * 0.4 * (1 - f / 0.3) : 0; };
  const sa = (car.steer || 0) * 0.42;
  wheel(ax[0], -W + 1.2, sa + wob(0, 2, 1)); wheel(ax[0], W - 1.2, sa + wob(0, 3, 2));
  wheel(ax[1], -W + 1.2, wob(1, 2, 3)); wheel(ax[1], W - 1.2, wob(1, 3, 4));
  if (M.shape === 'bus') { wheel(-L * 0.38, -W + 1.2, 0); wheel(-L * 0.38, W - 1.2, 0); }
  // bumpers stick out past the body
  const fd = frontDent(car, 1), rd = frontDent(car, -1);
  if (!car.lost.bumperF) { x.fillStyle = '#2a2b30'; rr(x, L - 2 - fd, -W + 2.5, 5, W * 2 - 5, 2); x.fill(); x.fillStyle = '#9aa0aa'; x.fillRect(L + 1.2 - fd, -W + 4, 1.2, W * 2 - 8); }
  if (!car.lost.bumperR) { x.fillStyle = '#2a2b30'; rr(x, -L - 3 + rd, -W + 2.5, 5, W * 2 - 5, 2); x.fill(); }
  if (car.spikes > 0) {
    x.fillStyle = '#d8dce4';
    for (let k = 0; k < 5; k++) { const py = -W + 3 + k * ((W * 2 - 6) / 4); x.beginPath(); x.moveTo(L + 2 - fd, py - 2.6); x.lineTo(L + 9 - fd, py); x.lineTo(L + 2 - fd, py + 2.6); x.fill(); }
  }
  // body
  const P = deformed(car);
  x.fillStyle = side; trace(x, P); x.fill();
  x.save(); trace(x, P); x.clip();
  const g = x.createLinearGradient(0, -W, 0, W);
  g.addColorStop(0, shade(top, -0.2)); g.addColorStop(0.42, shade(top, 0.14)); g.addColorStop(0.58, shade(top, 0.14)); g.addColorStop(1, shade(top, -0.26));
  x.fillStyle = g; x.fillRect(-L - 2, -W - 2, L * 2 + 4, W * 2 + 4);
  // racing stripes
  x.fillStyle = S.stripe;
  if (M.shape === 'muscle') { x.fillRect(-L, -4.5, L * 2, 3); x.fillRect(-L, 1.5, L * 2, 3); }
  else if (M.shape === 'bus') { x.fillRect(-L, -W + 2.5, L * 2, 2); x.fillRect(-L, W - 4.5, L * 2, 2); }
  else x.fillRect(-L, -1.8, L * 2, 3.6);
  // panel lines: bonnet seam, door gaps, fuel cap
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 0.8;
  const wsF = L * lay.ws[1], wsB = L * lay.ws[0];
  x.beginPath(); x.moveTo(wsF + 2, -W + 3); x.lineTo(wsF + 2, W - 3); x.stroke();
  if (M.shape !== 'bus') {
    const d1 = L * 0.12, d2 = -L * 0.32;
    for (const sy of [-1, 1]) { x.beginPath(); x.moveTo(d1, sy * (W - 0.5)); x.lineTo(d1, sy * (W - 4)); x.moveTo(d2, sy * (W - 0.5)); x.lineTo(d2, sy * (W - 4)); x.stroke(); }
  }
  // cabin
  const glass = (x0, x1, h0, h1) => {
    x.beginPath(); x.moveTo(x0, -h0); x.lineTo(x1, -h1); x.lineTo(x1, h1); x.lineTo(x0, h0); x.closePath();
    const gg = x.createLinearGradient(x0, -W, x1, W); gg.addColorStop(0, '#3a4658'); gg.addColorStop(0.5, '#151a24'); gg.addColorStop(1, '#0a0c12');
    x.fillStyle = gg; x.fill();
  };
  const roofW = W - 4.4;
  if (M.shape === 'pickup') {
    // bed with ribs and a tailgate
    const b0 = -L + 2.5, b1 = L * -0.18;
    x.fillStyle = '#26272b'; x.fillRect(b0, -W + 2.5, b1 - b0, W * 2 - 5);
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(b0 + 2, k * 4.4); x.lineTo(b1 - 1, k * 4.4); x.stroke(); }
    x.fillStyle = shade(top, -0.1); x.fillRect(b0 - 2, -W + 2, 2.5, W * 2 - 4);
  }
  glass(wsB, wsF, roofW + 0.5, roofW - 1.8);
  x.fillStyle = shade(top, 0.04); rr(x, L * lay.roof[0], -roofW, L * (lay.roof[1] - lay.roof[0]), roofW * 2, 3); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(L * lay.roof[0] + 2, -roofW + 2, L * (lay.roof[1] - lay.roof[0]) - 4, 2);
  if (M.shape === 'muscle') { x.fillStyle = S.stripe; x.fillRect(L * lay.roof[0], -4.5, L * (lay.roof[1] - lay.roof[0]), 3); x.fillRect(L * lay.roof[0], 1.5, L * (lay.roof[1] - lay.roof[0]), 3); }
  if (lay.rg) glass(L * lay.rg[1], L * lay.rg[0], roofW - 0.5, roofW - 2);
  if (M.shape === 'wagon') { x.strokeStyle = 'rgba(30,30,34,0.7)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(L * lay.roof[0] + 2, -roofW + 2.5); x.lineTo(L * lay.roof[1] - 2, -roofW + 2.5); x.moveTo(L * lay.roof[0] + 2, roofW - 2.5); x.lineTo(L * lay.roof[1] - 2, roofW - 2.5); x.stroke(); }
  if (M.shape === 'bus') {
    x.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 9; k++) x.fillRect(-L + 6 + k * 9.5, -roofW + 1, 6, 2.2), x.fillRect(-L + 6 + k * 9.5, roofW - 3.2, 6, 2.2);
    x.fillStyle = '#d8dade'; rr(x, -L * 0.55, -5, 9, 10, 1.5); x.fill(); rr(x, L * 0.25, -5, 9, 10, 1.5); x.fill();
  }
  if (M.shape === 'muscle') { x.fillStyle = shade(top, -0.3); rr(x, L * 0.42, -3.5, 9, 7, 2); x.fill(); x.fillStyle = '#111'; x.fillRect(L * 0.42 + 6, -2.5, 2, 5); }
  if (M.shape === 'hatch') { x.fillStyle = shade(top, -0.35); x.fillRect(-L + 1, -W + 2, 3, W * 2 - 4); }
  // roof number in a white roundel
  const rcx = M.shape === 'bus' ? 0 : L * (lay.roof[0] + lay.roof[1]) / 2, rad = Math.min(roofW - 1, 7.5);
  x.fillStyle = '#f8f6ee'; x.beginPath(); x.arc(rcx, 0, rad, 0, TAU); x.fill();
  x.strokeStyle = '#141414'; x.lineWidth = 1; x.stroke();
  x.save(); x.translate(rcx, 0);
  x.fillStyle = '#141414'; x.font = `${rad * 1.25}px Bungee, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(S.num), 0, rad * 0.08);
  x.restore();
  // names painted down both doors
  if (S.name) {
    x.font = `${M.shape === 'bus' ? 6 : 4.6}px Bungee, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = S.stripe === '#ffffff' || S.stripe === '#ffd23a' ? S.stripe : '#ffffff';
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1.2; x.lineJoin = 'round';
    const nx = M.shape === 'pickup' ? L * 0.08 : M.shape === 'bus' ? 0 : -L * 0.1, ny = W - 2.5;
    if (!car.lost.doorL) { x.strokeText(S.name, nx, -ny); x.fillText(S.name, nx, -ny); }
    if (!car.lost.doorR) { x.strokeText(S.name, nx, ny); x.fillText(S.name, nx, ny); }
  }
  // lights
  x.fillStyle = car.lost.bumperF ? '#55504a' : '#fff4c8';
  x.fillRect(L - 3.5, -W + 2.5, 2.8, 4.5); x.fillRect(L - 3.5, W - 7, 2.8, 4.5);
  x.fillStyle = car.lost.bumperR ? '#4a2020' : car.input.brake && car.vf > 20 ? '#ff4a3a' : '#a81c1c';
  x.fillRect(-L + 0.6, -W + 2.5, 2.4, 4.5); x.fillRect(-L + 0.6, W - 7, 2.4, 4.5);
  // missing panels
  if (car.lost.bonnet) {
    const b0 = wsF + 3, b1 = L - 1;
    x.fillStyle = '#1e1f23'; x.fillRect(b0, -W + 2.5, b1 - b0, W * 2 - 5);
    x.fillStyle = '#5a5e66'; rr(x, b0 + 2, -5.5, Math.max(4, b1 - b0 - 6), 11, 1.5); x.fill();
    x.fillStyle = '#2a2c30'; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(b0 + 5 + k * ((b1 - b0 - 9) / 2.2), -2.6, 1.6, 0, TAU); x.arc(b0 + 5 + k * ((b1 - b0 - 9) / 2.2), 2.6, 1.6, 0, TAU); x.fill(); }
    x.fillStyle = '#b8bcc4'; x.fillRect(b1 - 2.2, -W + 3.5, 1.6, W * 2 - 7);
    x.strokeStyle = '#c84a2a'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(b0 + 2, -W + 4); x.quadraticCurveTo(b0 + 6, -W + 1, b1 - 4, -W + 4); x.stroke();
  }
  if (car.lost.boot) {
    const b0 = -L + 1.5, b1 = Math.max(b0 + L * 0.25, (lay.rg ? L * lay.rg[0] : -L * 0.7) - 1);
    x.fillStyle = '#1e1f23'; x.fillRect(b0, -W + 2.5, b1 - b0, W * 2 - 5);
    x.fillStyle = '#0c0c0e'; x.beginPath(); x.arc((b0 + b1) / 2, 0, Math.max(1.5, Math.min(6, (b1 - b0) / 2 - 1)), 0, TAU); x.fill();
    x.strokeStyle = '#3a3a40'; x.lineWidth = 1.5; x.stroke();
  }
  for (const [lostIt, sy] of [[car.lost.doorL, -1], [car.lost.doorR, 1]]) {
    if (!lostIt || M.shape === 'bus') continue;
    const d0 = -L * 0.32, d1 = L * 0.12;
    x.fillStyle = '#3c3e44'; x.fillRect(d0, sy > 0 ? W - 4.5 : -W, d1 - d0, 4.5);
    x.fillStyle = '#6a4a32'; x.fillRect(d0 + 3, sy > 0 ? W - 4 : -W + 0.5, 7, 3.5);
  }
  // crumples: dark creases and bare metal where the paint has gone
  for (const dn of car.dents) {
    if (dn.d < 2) continue;
    const k = Math.min(1, dn.d / 8);
    x.fillStyle = `rgba(190,190,180,${0.18 * k})`; x.beginPath(); x.arc(dn.x, dn.y, dn.r * 0.65, 0, TAU); x.fill();
    x.strokeStyle = `rgba(0,0,0,${0.35 + 0.3 * k})`; x.lineWidth = 0.9;
    const cr = rng(Math.floor(dn.s * 1000));
    for (let c = 0; c < 2 + Math.floor(k * 3); c++) {
      const a = cr() * TAU, l = dn.r * (0.4 + cr() * 0.4);
      x.beginPath(); x.moveTo(dn.x, dn.y);
      x.lineTo(dn.x + Math.cos(a) * l * 0.5 + (cr() - 0.5) * 3, dn.y + Math.sin(a) * l * 0.5 + (cr() - 0.5) * 3);
      x.lineTo(dn.x + Math.cos(a) * l, dn.y + Math.sin(a) * l); x.stroke();
    }
  }
  // cracked glass
  const crack = (lines, gx) => { if (!lines) return; x.strokeStyle = 'rgba(235,240,250,0.75)'; x.lineWidth = 0.6; for (const [cy, a, l] of lines) { x.beginPath(); x.moveTo(gx, cy); x.lineTo(gx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); } };
  crack(car.cracks.front, (wsB + wsF) / 2);
  if (lay.rg) crack(car.cracks.rear, L * (lay.rg[0] + lay.rg[1]) / 2);
  // dead: scorched and dull
  if (!car.alive) {
    x.fillStyle = 'rgba(28,20,14,0.55)'; x.fillRect(-L - 2, -W - 2, L * 2 + 4, W * 2 + 4);
    const sg = x.createRadialGradient(L * 0.5, 0, 0, L * 0.5, 0, L); sg.addColorStop(0, 'rgba(0,0,0,0.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sg; x.fillRect(-L, -W, L * 2, W * 2);
  }
  x.restore();
  // rim of the body, then crisp outline
  x.strokeStyle = side; x.lineWidth = 2.2; trace(x, P); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 0.8; x.stroke();
  // mirrors
  if (M.shape !== 'bus') {
    x.fillStyle = side;
    if (!car.lost.doorL) { x.beginPath(); x.ellipse(wsB - 1, -W - 1.6, 2.2, 1.4, 0, 0, TAU); x.fill(); }
    if (!car.lost.doorR) { x.beginPath(); x.ellipse(wsB - 1, W + 1.6, 2.2, 1.4, 0, 0, TAU); x.fill(); }
  }
  if (opts.flash) { x.globalCompositeOperation = 'lighter'; x.fillStyle = `rgba(255,255,255,${opts.flash})`; trace(x, P); x.fill(); x.globalCompositeOperation = 'source-over'; }
  x.restore();
}

// how far the front (s=1) or rear (s=-1) has been pushed in, so the bumper stays attached
function frontDent(car, s) {
  let m = 0;
  for (const d of car.dents) if (d.x * s > car.L * 0.6) m = Math.max(m, d.d * (1 - Math.abs(d.y) / (car.W + d.r)));
  return Math.min(car.L * 0.3, m);
}

// engine bay (smoke and fire come out here), in world space
export function enginePos(car) {
  const f = car.M.shape === 'bus' ? 0.78 : 0.55;
  return { x: car.x + Math.cos(car.h) * car.L * f, y: car.y + Math.sin(car.h) * car.L * f };
}

// a loose panel, drawn flat on the dirt
export function drawDebris(x, d) {
  x.save(); x.translate(d.x, d.y); x.rotate(d.a);
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(-d.len / 2 + 2, -d.wid / 2 + 3, d.len, d.wid);
  if (d.kind === 'hubcap') {
    x.fillStyle = '#c8ccd4'; x.beginPath(); x.arc(0, 0, d.r, 0, TAU); x.fill();
    x.strokeStyle = '#8a8e96'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, d.r * 0.6, 0, TAU); x.stroke();
  } else if (d.kind === 'bumper') {
    x.fillStyle = '#2a2b30'; rr(x, -d.len / 2, -d.wid / 2, d.len, d.wid, 2); x.fill();
    x.fillStyle = '#9aa0aa'; x.fillRect(-d.len / 2 + 2, -0.6, d.len - 4, 1.2);
    // bent in the middle
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-2, -d.wid / 2); x.lineTo(1, d.wid / 2); x.stroke();
  } else {
    x.fillStyle = shade(d.col, -0.35); rr(x, -d.len / 2, -d.wid / 2, d.len, d.wid, 2); x.fill();
    x.fillStyle = d.col; rr(x, -d.len / 2 + 1, -d.wid / 2 + 1, d.len - 2, d.wid - 2, 1.5); x.fill();
    x.fillStyle = 'rgba(200,200,190,0.35)'; x.beginPath(); x.arc(d.len * 0.15, 0, d.wid * 0.3, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-d.len * 0.3, -d.wid / 2 + 1); x.lineTo(-d.len * 0.1, 0); x.lineTo(-d.len * 0.25, d.wid / 2 - 1); x.stroke();
    if (d.stripe) { x.fillStyle = d.stripe; x.fillRect(-d.len / 2 + 2, -1, d.len - 4, 2); }
  }
  x.restore();
}
