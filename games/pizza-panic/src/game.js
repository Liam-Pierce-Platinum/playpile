// Simulation: scooter physics, traffic, rivals, orders, throwing, scoring. No drawing here.
import { P, R, NB, W, rc, makeCity, solidsNear, onGrass, inBuilding, rng } from './city.js';
import * as A from './audio.js';

export const UPG = {
  engine: { name: 'Engine', desc: 'Higher top speed', max: 5 },
  boost: { name: 'Nitro tank', desc: 'Bigger boost, faster refill', max: 5 },
  bag: { name: 'Thermal bag', desc: 'Pizzas cool slower', max: 5 },
  size: { name: 'Bigger rack', desc: '+1 pizza per run', max: 3 },
  arm: { name: 'Pitching arm', desc: 'Longer throws, more aim help', max: 4 },
};
export const upCost = (k, l) => Math.round((k === 'size' ? 140 : 70) * Math.pow(1.75, l));
export const shiftTarget = (n) => 95 + (n - 1) * 50 + Math.max(0, n - 3) * 30;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const CAR_COLS = ['#e85d4a', '#3f8fd8', '#f2c230', '#5cb85c', '#ffffff', '#8e6bd6', '#f08a3c', '#2c3e50', '#e8e8e8', '#f2c230'];

export function newGame(save, opts = {}) {
  const G = {
    city: makeCity(7), save, t: 0, state: 'play', shift: save.shift, time: 0, cash: 0, target: 0,
    orders: [], inflight: 0, proj: [], cars: [], rivals: [], parts: [], pops: [], skids: [], decals: [],
    combo: 0, comboT: 0, shake: 0, banner: null, hitTarget: false, throwCd: 0, driftAcc: 0, tickT: 0,
    input: { thr: 0, steer: 0, hb: false, boost: false, head: null }, bot: !!opts.bot, r: rng(opts.seed || 1234),
    stats: null, result: null, events: [],
  };
  return G;
}

function mkScooter(x, y, a, max, acc) { return { x, y, a, vx: 0, vy: 0, r: 12, max, acc, boost: 0, drift: false, vl: 0, path: [], pathT: 0, stuck: 0, rev: 0 }; }

export function startShift(G) {
  const s = G.save, u = s.up, pz = G.city.pizza, r = G.r;
  G.shift = s.shift; G.state = 'play';
  G.time = 80; G.cash = 0; G.target = shiftTarget(G.shift); G.hitTarget = false;
  G.orders = []; G.inflight = 0; G.proj = []; G.parts = []; G.pops = []; G.skids = []; G.decals = [];
  G.combo = 0; G.comboT = 0; G.shake = 0; G.driftAcc = 0; G.result = null;
  G.stats = { deliv: 0, miss: 0, near: 0, bull: 0, stolen: 0, best: 0 };
  G.p = mkScooter(pz.x, pz.y, 0, 400 * (1 + u.engine * 0.07), 560 * (1 + u.engine * 0.05));
  G.p.tank = 100 * (1 + u.boost * 0.25); G.p.boost = G.p.tank;
  G.cap = 3 + u.size; G.decay = (100 / 50) * Math.pow(0.82, u.bag); G.range = 250 * (1 + u.arm * 0.15); G.assist = 70 + u.arm * 16;
  G.cars = [];
  const nCars = Math.min(26 + G.shift * 5, 60);
  for (let k = 0; k < nCars; k++) {
    let i = Math.floor(r() * (NB + 1)), j = Math.floor(r() * (NB + 1)), dir = Math.floor(r() * 4);
    if (!validDir(i, j, dir)) dir = (dir + 2) % 4;
    const c = { i, j, dir, d: 30 + r() * (P - 60), spd: 110 + r() * 80 + G.shift * 6, col: CAR_COLS[k % CAR_COLS.length], taxi: k % 10 === 9, stun: 0, nm: 0, touched: -9, L: 52, Wd: 26 };
    carPos(c); c.rx = c.x; c.ry = c.y; c.ra = c.a;
    if (Math.hypot(c.x - pz.x, c.y - pz.y) < 220) continue;
    G.cars.push(c);
  }
  G.rivals = [];
  const nRiv = G.shift < 2 ? 0 : Math.min(G.shift - 1, 4);
  for (let k = 0; k < nRiv; k++) spawnRival(G);
  refill(G, true);
  G.banner = { text: 'SHIFT ' + G.shift, sub: 'Earn $' + G.target + (G.shift >= 2 ? ' - BOOST into rivals for a TAKEDOWN' : ' before the clock runs out'), t: 2.6, col: '#ffd23f' };
}

function spawnRival(G, rv) {
  const r = G.r; let x, y, tries = 0;
  do { x = rc(Math.floor(r() * (NB + 1))); y = rc(Math.floor(r() * (NB + 1))); tries++; } while (Math.hypot(x - G.p.x, y - G.p.y) < 900 && tries < 40);
  const e = rv || mkScooter(x, y, 0, 0, 0);
  Object.assign(e, { x, y, vx: 0, vy: 0, max: Math.min(330 + G.shift * 14, 440), acc: 520, cool: 2.5, rival: true, path: [], pathT: 0 });
  if (!rv) G.rivals.push(e);
}

// ---------- traffic on the road grid ----------
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
function validDir(i, j, d) { const ni = i + DX[d], nj = j + DY[d]; return ni >= 0 && nj >= 0 && ni <= NB && nj <= NB; }
function carPos(c) {
  const dx = DX[c.dir], dy = DY[c.dir];
  c.x = rc(c.i) + dx * c.d - dy * 28; c.y = rc(c.j) + dy * c.d + dx * 28; c.a = Math.atan2(dy, dx);
}
function stepCars(G, dt) {
  for (const c of G.cars) {
    let v = c.spd;
    if (c.stun > 0) { c.stun -= dt; v = 0; }
    for (const o of G.cars) if (o !== c && o.i === c.i && o.j === c.j && o.dir === c.dir && o.d > c.d && o.d - c.d < 70) { v = Math.min(v, Math.max(0, (o.d - c.d - 55) * 3)); }
    // brake for the player if right in front
    const fx = Math.cos(c.a), fy = Math.sin(c.a), px = G.p.x - c.rx, py = G.p.y - c.ry, along = px * fx + py * fy, side = Math.abs(-px * fy + py * fx);
    if (along > 20 && along < 80 && side < 22) v = Math.min(v, 30);
    c.d += v * dt;
    if (c.d >= P) {
      c.i += DX[c.dir]; c.j += DY[c.dir]; c.d -= P;
      const opts = [0, 1, 2, 3].filter((d) => d !== (c.dir + 2) % 4 && validDir(c.i, c.j, d));
      const straight = opts.includes(c.dir) && G.r() < 0.55;
      c.dir = straight ? c.dir : (opts.length ? opts[Math.floor(G.r() * opts.length)] : (c.dir + 2) % 4);
    }
    carPos(c);
    const k = Math.min(1, dt * 7);
    c.rx += (c.x - c.rx) * k; c.ry += (c.y - c.ry) * k; c.ra += angDiff(c.a, c.ra) * Math.min(1, dt * 6);
    c.nm -= dt;
  }
}

// ---------- scooter physics (player, bot and rivals share it) ----------
function drive(G, e, inp, dt) {
  let { thr, steer, hb, boost } = inp;
  const fx = Math.cos(e.a), fy = Math.sin(e.a), lx = -fy, ly = fx;
  let vf = e.vx * fx + e.vy * fy, vl = e.vx * lx + e.vy * ly;
  if (inp.head != null) { const d = angDiff(inp.head, e.a); steer = clamp(d * 2.6, -1, 1); if (Math.abs(d) > 2.3 && Math.abs(vf) < 60) { thr = -0.6; steer = -steer; } }
  const spd = Math.hypot(e.vx, e.vy), grass = onGrass(G.city, e.x, e.y);
  let max = e.max * (grass ? 0.68 : 1);
  e.boosting = !!(boost && e.boost > 1 && thr >= 0);
  if (e.boosting) { max *= 1.5; e.boost -= 32 * dt; vf += 1000 * dt; }
  e.a += steer * 3.5 * clamp(Math.abs(vf) / 130, 0, 1) * Math.sign(vf || 1) * (hb ? 1.55 : 1) * (1 - 0.3 * clamp(spd / 700, 0, 1)) * dt;
  if (thr > 0) { if (vf < max) vf += e.acc * thr * dt * (vf < 0 ? 2 : 1); }
  else if (thr < 0) { vf -= (vf > 20 ? 1200 : 420) * -thr * dt; vf = Math.max(vf, -170); }
  else vf -= vf * 1.1 * dt;
  if (vf > max) vf -= (vf - max) * 2.5 * dt;
  if (hb) vf -= vf * 0.5 * dt;
  vl *= Math.exp(-(hb ? 1.7 : grass ? 5 : 10) * dt);
  const nfx = Math.cos(e.a), nfy = Math.sin(e.a);
  e.vx = nfx * vf - nfy * vl; e.vy = nfy * vf + nfx * vl; e.vl = vl;
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.drift = Math.abs(vl) > 85 && spd > 170;
  return collideWorld(G, e);
}
function collideWorld(G, e) {
  let hit = 0;
  for (const c of solidsNear(G.city, e.x, e.y)) {
    for (const b of c.b) {
      const qx = clamp(e.x, b.x, b.x + b.w), qy = clamp(e.y, b.y, b.y + b.h);
      let dx = e.x - qx, dy = e.y - qy, d = Math.hypot(dx, dy);
      if (d < e.r) {
        if (d < 0.01) { dx = 0; dy = -1; d = 1; }
        const nx = dx / d, ny = dy / d; e.x = qx + nx * e.r; e.y = qy + ny * e.r;
        const imp = -(e.vx * nx + e.vy * ny); if (imp > 0) { e.vx += nx * imp * 1.3; e.vy += ny * imp * 1.3; e.vx *= 0.85; e.vy *= 0.85; hit = Math.max(hit, imp); }
      }
    }
    for (const t of c.t) {
      const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy), m = e.r + t.r * 0.6;
      if (d < m && d > 0.01) { const nx = dx / d, ny = dy / d; e.x = t.x + nx * m; e.y = t.y + ny * m; const imp = -(e.vx * nx + e.vy * ny); if (imp > 0) { e.vx += nx * imp * 1.4; e.vy += ny * imp * 1.4; hit = Math.max(hit, imp); } }
    }
  }
  if (e.x < 20) { e.x = 20; hit = Math.max(hit, -e.vx); e.vx = Math.abs(e.vx) * 0.4; }
  if (e.y < 20) { e.y = 20; hit = Math.max(hit, -e.vy); e.vy = Math.abs(e.vy) * 0.4; }
  if (e.x > W - 20) { e.x = W - 20; hit = Math.max(hit, e.vx); e.vx = -Math.abs(e.vx) * 0.4; }
  if (e.y > W - 20) { e.y = W - 20; hit = Math.max(hit, e.vy); e.vy = -Math.abs(e.vy) * 0.4; }
  return hit;
}
function collideCars(G, e, dt) {
  let hit = 0, car = null;
  for (const c of G.cars) {
    if (Math.abs(c.rx - e.x) > 60 || Math.abs(c.ry - e.y) > 60) continue;
    const fx = Math.cos(c.ra), fy = Math.sin(c.ra);
    for (const s of [-13, 13]) {
      const cx = c.rx + fx * s, cy = c.ry + fy * s, dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy), m = e.r + 14;
      if (d < m && d > 0.01) {
        const nx = dx / d, ny = dy / d; e.x = cx + nx * m; e.y = cy + ny * m;
        const cvx = fx * (c.stun > 0 ? 0 : c.spd), cvy = fy * (c.stun > 0 ? 0 : c.spd);
        const imp = -((e.vx - cvx) * nx + (e.vy - cvy) * ny);
        if (imp > 0) { e.vx += nx * imp * 1.25; e.vy += ny * imp * 1.25; hit = Math.max(hit, imp); car = c; }
      }
    }
  }
  if (car) { car.stun = 0.9; car.touched = G.t; }
  return { hit, car };
}

// ---------- navigation on the road grid (bot + rivals) ----------
function routeTo(e, tx, ty) {
  const starts = segNodes(e.x, e.y), ends = segNodes(tx, ty);
  let best = null, bc = 1e9;
  for (const s of starts) for (const g of ends) {
    const cost = Math.hypot(e.x - rc(s[0]), e.y - rc(s[1])) + (Math.abs(s[0] - g[0]) + Math.abs(s[1] - g[1])) * P + Math.hypot(tx - rc(g[0]), ty - rc(g[1]));
    if (cost < bc) { bc = cost; best = [s, g]; }
  }
  const [s, g] = best, pts = [[rc(s[0]), rc(s[1])], [rc(g[0]), rc(s[1])], [rc(g[0]), rc(g[1])], [tx, ty]];
  // skip the first node if we are already heading along the right road past it
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 4) out.push(p); }
  if (out.length > 1 && sameRoad(e.x, e.y, out[1][0], out[1][1])) out.shift();
  if (out.length && sameRoad(e.x, e.y, tx, ty) && Math.hypot(e.x - tx, e.y - ty) < P * 1.1) return [[tx, ty]];
  return out;
}
function sameRoad(x0, y0, x1, y1) { return (Math.abs(x0 - x1) < 30 && Math.abs(((x0 - R / 2) / P) - Math.round((x0 - R / 2) / P)) * P < R / 2) || (Math.abs(y0 - y1) < 30 && Math.abs(((y0 - R / 2) / P) - Math.round((y0 - R / 2) / P)) * P < R / 2); }
function segNodes(x, y) {
  const fi = (x - R / 2) / P, fj = (y - R / 2) / P, ri = Math.round(fi), rj = Math.round(fj);
  const onV = Math.abs(fi - ri) * P < R / 2, onH = Math.abs(fj - rj) * P < R / 2;
  const cl = (v) => clamp(v, 0, NB);
  if (onH && !onV) return [[cl(Math.floor(fi)), rj], [cl(Math.ceil(fi)), rj]];
  if (onV && !onH) return [[ri, cl(Math.floor(fj))], [ri, cl(Math.ceil(fj))]];
  return [[cl(ri), cl(rj)]];
}
function follow(G, e, tx, ty, dt, inp, arrive = 45) {
  e.pathT -= dt;
  if (e.pathT <= 0 || !e.path.length) { e.path = routeTo(e, tx, ty); e.pathT = 0.6; }
  while (e.path.length > 1 && Math.hypot(e.path[0][0] - e.x, e.path[0][1] - e.y) < arrive) e.path.shift();
  const wp = e.path[0] || [tx, ty];
  const head = Math.atan2(wp[1] - e.y, wp[0] - e.x), d = Math.abs(angDiff(head, e.a)), spd = Math.hypot(e.vx, e.vy);
  inp.head = head; inp.thr = d > 0.9 && spd > 200 ? 0.2 : 1; inp.hb = d > 1.0 && spd > 260; inp.steer = 0;
  // un-stick
  if (spd < 25 && inp.thr > 0) e.stuck += dt; else e.stuck = Math.max(0, e.stuck - dt);
  if (e.stuck > 1.2) { e.rev = 0.7; e.stuck = 0; e.pathT = 0; }
  if (e.rev > 0) { e.rev -= dt; inp.head = null; inp.thr = -1; inp.steer = 0.6; }
  return Math.hypot(tx - e.x, ty - e.y);
}

// ---------- orders ----------
function refill(G, silent) {
  const pz = G.city.pizza, want = G.cap - (G.orders.length - G.inflight);
  if (want <= 0) return;
  const r = G.r, picked = [];
  for (let k = 0, tries = 0; k < want && tries < 200; tries++) {
    const d = G.city.doors[Math.floor(r() * G.city.doors.length)], dist = Math.hypot(d.x - pz.x, d.y - pz.y);
    const lim = 500 + Math.min(G.shift, 6) * 70;
    if (dist < 380 || dist > lim + 600) continue;
    if (G.orders.some((o) => o.door === d) || [...G.orders, ...picked].some((o) => Math.hypot(o.door.x - d.x, o.door.y - d.y) < 160)) continue;
    picked.push({ door: d, heat: 100, base: 9 + dist / 85 }); k++;
  }
  G.orders.push(...picked);
  if (!silent) { A.sfx('pickup'); G.banner = { text: 'ORDERS UP!', sub: picked.length + ' hot pizzas - go go go', t: 1.2, col: '#ffd23f' }; burst(G, G.p.x, G.p.y, 18, '#ffd23f', 260, 'conf'); }
}
export function avail(G) { return G.orders.length - G.inflight; }

export function throwAt(G, x, y) {
  if (G.state !== 'play' || G.throwCd > 0 || avail(G) <= 0) return false;
  const p = G.p;
  // aim assist: snap to the nearest order door near the aim point
  let best = null, bd = G.assist;
  for (const o of G.orders) { const d = Math.hypot(o.door.x - x, o.door.y - y); if (d < bd) { bd = d; best = o; } }
  if (best) { x = best.door.x; y = best.door.y; }
  let dx = x - p.x, dy = y - p.y, dist = Math.hypot(dx, dy);
  if (dist < 1) { dx = Math.cos(p.a); dy = Math.sin(p.a); dist = 1; }
  const L = Math.min(dist, G.range), ex = p.x + dx / dist * L, ey = p.y + dy / dist * L;
  G.proj.push({ L, x0: p.x, y0: p.y, x1: ex, y1: ey, x: p.x, y: p.y, z: 0, t: 0, dur: clamp(L / 620, 0.2, 0.55), spin: (G.r() - 0.5) * 30, rot: 0 });
  G.inflight++; G.throwCd = 0.22; A.sfx('throw');
  return true;
}
function resolveProj(G, pr, hitWall) {
  G.inflight--;
  let best = null, bd = hitWall ? 46 : 40;
  for (const o of G.orders) { const d = Math.hypot(o.door.x - pr.x, o.door.y - pr.y); if (d < bd) { bd = d; best = o; } }
  if (best) return deliver(G, best, pr.L > G.range * 0.8, pr);
  // miss: lose the order you were most likely aiming at
  let near = null, nd = 1e9;
  for (const o of G.orders) { const d = Math.hypot(o.door.x - pr.x, o.door.y - pr.y); if (d < nd) { nd = d; near = o; } }
  if (near && G.orders.length > G.inflight) G.orders.splice(G.orders.indexOf(near), 1);
  G.stats.miss++; G.combo = 0;
  G.decals.push({ x: pr.x, y: pr.y, a: G.r() * 6, t: G.t }); if (G.decals.length > 60) G.decals.shift();
  burst(G, pr.x, pr.y, 14, '#d8452f', 160, 'blob'); pop(G, pr.x, pr.y, 'SPLAT!', '#ff7b5c', 24);
  A.sfx('miss'); G.shake = Math.max(G.shake, 3);
}
function deliver(G, o, bull, pr) {
  G.orders.splice(G.orders.indexOf(o), 1);
  G.combo++; G.comboT = 5;
  const heatM = 0.35 + 0.65 * (o.heat / 100), mult = comboMult(G);
  const tip = Math.round(o.base * heatM * mult * (bull ? 1.5 : 1));
  G.cash += tip; G.time += 5; G.stats.deliv++; if (bull) G.stats.bull++; G.stats.best = Math.max(G.stats.best, G.combo);
  const d = o.door; d.happy = G.t;
  burst(G, d.x, d.y, bull ? 40 : 26, null, 300, 'conf');
  pop(G, d.x, d.y - 10, '+$' + tip, '#7dff8a', 34);
  pop(G, d.x, d.y + 22, o.heat > 70 ? 'PIPING HOT!' : o.heat > 35 ? 'warm' : 'cold...', o.heat > 70 ? '#ffb340' : '#9fd3ff', 18, 0.15);
  if (bull) { G.banner = { text: 'LONG SHOT!', sub: 'x1.5 tip', t: 1, col: '#ff5ca8' }; A.sfx('bull'); G.slow = 0.25; }
  A.sfx('deliver'); G.shake = Math.max(G.shake, bull ? 7 : 4);
  G.events.push('deliver');
  checkTarget(G);
}
function checkTarget(G) { if (!G.hitTarget && G.cash >= G.target) { G.hitTarget = true; G.banner = { text: 'TARGET HIT!', sub: 'Keep going - everything extra is bonus', t: 1.8, col: '#7dff8a' }; A.sfx('win'); } }
export const comboMult = (G) => 1 + Math.min(G.combo, 20) * 0.1;

function addCash(G, v, x, y, text, col) { const n = Math.max(1, Math.round(v * comboMult(G))); G.cash += n; pop(G, x, y, text + ' +$' + n, col, 18); checkTarget(G); }

// ---------- juice ----------
export function burst(G, x, y, n, col, spd, kind = 'dot') {
  const CON = ['#ffd23f', '#ff5ca8', '#5cd6ff', '#7dff8a', '#ff7b3c', '#ffffff'];
  for (let k = 0; k < n; k++) {
    const a = G.r() * Math.PI * 2, s = spd * (0.3 + G.r() * 0.7);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + G.r() * 0.6, t: 0, col: col || CON[k % CON.length], kind, size: kind === 'smoke' ? 6 + G.r() * 6 : 2 + G.r() * 3, rot: G.r() * 6 });
  }
  if (G.parts.length > 700) G.parts.splice(0, G.parts.length - 700);
}
function pop(G, x, y, text, col, size, delay = 0) { G.pops.push({ x, y, text, col, size, t: -delay }); }

// ---------- main step ----------
export function step(G, dt) {
  if (G.state !== 'play') return;
  if (G.slow > 0) { G.slow -= dt; dt *= 0.45; }
  G.t += dt;
  const p = G.p, inp = G.input;
  if (G.bot) botInput(G, dt);
  const hit = drive(G, p, inp, dt);
  const cc = collideCars(G, p, dt);
  const big = Math.max(hit, cc.hit);
  if (big > 120) {
    G.shake = Math.max(G.shake, Math.min(14, big / 30)); burst(G, p.x, p.y, 10, '#fff4c2', 200, 'spark');
    if (big > 230) { A.sfx('crash'); for (const o of G.orders) o.heat = Math.max(0, o.heat - 6); pop(G, p.x, p.y - 20, 'CRASH! pizzas -6 heat', '#ff9b7a', 16); G.combo = 0; }
    else A.sfx('bump');
    if (cc.car && G.r() < 0.6) A.sfx('horn');
  }
  if (p.boosting && !p.wasBoost) A.sfx('boost'); p.wasBoost = p.boosting;
  if (p.boosting) burst(G, p.x - Math.cos(p.a) * 18, p.y - Math.sin(p.a) * 18, 1, G.r() < 0.5 ? '#ffb340' : '#ff5c3c', 60, 'dot');

  // drift scoring + skids
  if (p.drift) {
    G.driftAcc += dt; p.boost = Math.min(p.tank, p.boost + 16 * dt * (1 + G.save.up.boost * 0.15));
    const bx = p.x - Math.cos(p.a) * 14, by = p.y - Math.sin(p.a) * 14;
    if (p.lsx != null) G.skids.push([p.lsx, p.lsy, bx, by, G.t]);
    p.lsx = bx; p.lsy = by;
    if (G.r() < 0.5) burst(G, bx, by, 1, 'rgba(235,235,235,0.6)', 40, 'smoke');
  } else {
    p.lsx = null;
    if (G.driftAcc > 0.7) { G.combo++; G.comboT = 5; addCash(G, G.driftAcc * 2.2, p.x, p.y - 26, 'DRIFT', '#5cd6ff'); A.sfx('combo', G.combo); }
    G.driftAcc = 0;
  }
  if (G.skids.length > 500) G.skids.splice(0, G.skids.length - 500);

  // near misses
  const spd = Math.hypot(p.vx, p.vy);
  if (spd > 250) for (const c of G.cars) {
    if (c.nm > 0 || G.t - c.touched < 1.2) continue;
    const fx = Math.cos(c.ra), fy = Math.sin(c.ra);
    let dmin = 1e9; for (const s of [-13, 13]) dmin = Math.min(dmin, Math.hypot(p.x - c.rx - fx * s, p.y - c.ry - fy * s));
    if (dmin < p.r + 14 + 20) {
      c.nm = 2.5; G.stats.near++; G.combo++; G.comboT = 5;
      p.boost = Math.min(p.tank, p.boost + 18); addCash(G, 2, p.x, p.y - 30, 'NEAR MISS', '#ffd23f'); A.sfx('near'); A.sfx('combo', G.combo);
      G.shake = Math.max(G.shake, 2);
    }
  }

  // rivals
  for (const rv of G.rivals) {
    const ri = { thr: 0, steer: 0, hb: false, boost: false, head: null };
    rv.cool -= dt;
    if (rv.cool > 0) follow(G, rv, rv.fleeX ?? rc(0), rv.fleeY ?? rc(0), dt, ri);
    else {
      const d = Math.hypot(G.p.x - rv.x, G.p.y - rv.y);
      if (d < 240) { rv.rev = (rv.rev || 0) + dt; ri.head = Math.atan2(G.p.y - rv.y, G.p.x - rv.x); ri.thr = rv.rev < 0.6 ? 0.35 : 1; ri.boost = rv.rev >= 0.6 && d < 160; rv.boost = 50; }
      else { rv.rev = 0; follow(G, rv, G.p.x, G.p.y, dt, ri); }
      if (d > 1800) spawnRival(G, rv);
    }
    drive(G, rv, ri, dt); collideCars(G, rv, dt);
    if (rv.spinT > 0) { rv.spinT -= dt; rv.a += 14 * dt; }
    const dx = p.x - rv.x, dy = p.y - rv.y, d = Math.hypot(dx, dy);
    if (d < p.r + rv.r && d > 0.01) {
      const nx = dx / d, ny = dy / d, ov = (p.r + rv.r - d) / 2; p.x += nx * ov; p.y += ny * ov; rv.x -= nx * ov; rv.y -= ny * ov;
      const ps = Math.hypot(p.vx, p.vy), rs = Math.hypot(rv.vx, rv.vy);
      if (rv.cool <= 0 && (p.boosting || ps > rs + 60)) { // TAKEDOWN: hit them first / faster and they spin out
        rv.vx -= nx * 420; rv.vy -= ny * 420; rv.cool = 6; rv.rev = 0; rv.spinT = 0.8; rv.path = [];
        rv.fleeX = rc(Math.floor(G.r() * (NB + 1))); rv.fleeY = rc(Math.floor(G.r() * (NB + 1)));
        G.shake = 12; G.stats.takedown = (G.stats.takedown || 0) + 1; G.combo++; G.comboT = 5; A.sfx('combo', G.combo);
        addCash(G, 6, rv.x, rv.y - 26, 'TAKEDOWN!', '#7dff8a'); burst(G, rv.x, rv.y, 18, '#ffd23f', 240, 'dot');
      } else if (rv.cool <= 0) {
        rv.rev = 0;
        p.vx += nx * 260; p.vy += ny * 260; rv.vx -= nx * 150; rv.vy -= ny * 150; rv.cool = 7;
        rv.fleeX = rc(Math.floor(G.r() * (NB + 1))); rv.fleeY = rc(Math.floor(G.r() * (NB + 1))); rv.path = [];
        G.shake = 10; A.sfx('steal'); G.combo = 0;
        if (avail(G) > 0) {
          const o = G.orders[Math.floor(G.r() * G.orders.length)]; G.orders.splice(G.orders.indexOf(o), 1); G.stats.stolen++;
          G.banner = { text: 'STOLEN!', sub: 'Rival rammed a pizza off your rack', t: 1.2, col: '#ff5c5c' };
          burst(G, p.x, p.y, 20, '#d8452f', 220, 'blob');
        } else pop(G, p.x, p.y - 20, 'RAMMED!', '#ff5c5c', 22);
      }
    }
  }

  stepCars(G, dt);

  // pizzas in flight
  for (let k = G.proj.length - 1; k >= 0; k--) {
    const pr = G.proj[k];
    pr.t += dt / pr.dur; pr.rot += pr.spin * dt;
    const u = Math.min(1, pr.t);
    pr.x = pr.x0 + (pr.x1 - pr.x0) * u; pr.y = pr.y0 + (pr.y1 - pr.y0) * u; pr.z = 4 * u * (1 - u) * 40;
    let done = false;
    for (const o of G.orders) if (Math.hypot(o.door.x - pr.x, o.door.y - pr.y) < 30) { G.inflight--; deliver(G, o, pr.L > G.range * 0.8, pr); done = true; break; }
    if (!done && u > 0.15 && inBuilding(G.city, pr.x, pr.y)) { resolveProj(G, pr, true); done = true; }
    if (!done && pr.t >= 1) { resolveProj(G, pr, false); done = true; }
    if (done) G.proj.splice(k, 1);
  }

  // heat, restock, timers
  for (const o of G.orders) o.heat = Math.max(0, o.heat - G.decay * dt);
  const pz = G.city.pizza;
  if (Math.hypot(p.x - pz.x, p.y - pz.y) < 75 && avail(G) < G.cap) refill(G, false);
  G.throwCd -= dt; G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
  G.shake *= Math.exp(-8 * dt);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  for (const q of G.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-3 * dt); q.vy *= Math.exp(-3 * dt); }
  G.parts = G.parts.filter((q) => q.t < q.life);
  for (const q of G.pops) q.t += dt; G.pops = G.pops.filter((q) => q.t < 1.3);

  G.time -= dt;
  if (G.time < 10 && Math.floor(G.time) !== Math.floor(G.time + dt) && G.time > 0) A.sfx('tick');
  if (G.time <= 0) endShift(G);
}

function endShift(G) {
  G.time = 0; G.state = 'result';
  const win = G.cash >= G.target, s = G.save;
  const bonus = win ? Math.round(G.target * 0.25) : 0;
  s.bank += G.cash + bonus; s.total = (s.total || 0) + G.cash;
  if (win) s.shift++;
  s.best = Math.max(s.best || 0, G.cash);
  G.result = { win, cash: G.cash, bonus, target: G.target, shift: G.shift, ...G.stats };
  A.sfx(win ? 'win' : 'lose');
  G.events.push('end');
}

// ---------- autopilot used by the headless playthrough (?bot=1) ----------
function botInput(G, dt) {
  const p = G.p, inp = G.input; inp.boost = false;
  let tx, ty, target = null;
  if (avail(G) <= 0 && G.proj.length === 0) { tx = G.city.pizza.x; ty = G.city.pizza.y; }
  else {
    let bd = 1e9;
    for (const o of G.orders) { const d = Math.hypot(o.door.x - p.x, o.door.y - p.y); if (d < bd) { bd = d; target = o; } }
    if (!target) { tx = G.city.pizza.x; ty = G.city.pizza.y; }
    else { tx = target.door.x + target.door.nx * 62; ty = target.door.y + target.door.ny * 62; }
  }
  if (G.botT !== target) { G.botT = target; p.path = []; }
  const d = follow(G, p, tx, ty, dt, inp);
  inp.boost = d > 500 && p.boost > 30 && Math.abs(angDiff(inp.head ?? p.a, p.a)) < 0.3;
  for (const rv of G.rivals) if (rv.cool <= 0 && rv.rev > 0 && Math.hypot(rv.x - p.x, rv.y - p.y) < 200 && p.boost > 15) { inp.boost = true; inp.head = Math.atan2(rv.y - p.y, rv.x - p.x); }
  if (target && Math.hypot(target.door.x - p.x, target.door.y - p.y) < Math.min(G.range - 30, 200) && !G.proj.length) throwAt(G, target.door.x, target.door.y);
  // unstick: stalled against a car or wall -> back up and turn for a moment
  const sp = Math.hypot(p.vx, p.vy); G.botStall = sp < 40 ? (G.botStall || 0) + dt : 0;
  if (G.botStall > 0.8) { G.botRev = 0.7; G.botStall = 0; p.path = []; }
  if (G.botRev > 0) { G.botRev -= dt; inp.head = null; inp.thr = -1; inp.steer = 1; inp.boost = false; }
}

export function fast(G, sec) { const n = Math.round(sec * 60); for (let k = 0; k < n && G.state === 'play'; k++) step(G, 1 / 60); }
