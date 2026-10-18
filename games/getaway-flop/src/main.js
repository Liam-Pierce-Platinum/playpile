import * as THREE from 'three';
import { toon, Post, makeChar, makeCar, wordTex, SPH, BOX, CYL, HAT_NAMES } from './gfx.js';
import { sfx, ac, music } from './audio.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const BOTP1 = Q.has('bot');
const $ = (id) => document.getElementById(id);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeee0bd);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
const post = new Post(renderer);
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.setSize(); }
addEventListener('resize', resize); resize();
const isTouch = 'ontouchstart' in window || matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

// ---------- save / progression ----------
const SAVE_KEY = 'getaway_flop_v1';
const save = { stage: 1, best: 1, hat: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* no storage */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* no storage */ } };
const HAT_AT = [1, 2, 3, 5, 7, 10];
const hatOpen = (h) => save.best >= HAT_AT[h];

// ---------- rng ----------
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = Math.random;

// ---------- static backdrop: sun, rays, clouds ----------
const sky = new THREE.Group(); scene.add(sky);
const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: 0xf4d27a }));
sun.position.set(0, 16, -90); sky.add(sun);
const rays = new THREE.Group(); rays.position.set(0, 16, -92); sky.add(rays);
for (let i = 0; i < 14; i++) {
  const r = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 80), new THREE.MeshBasicMaterial({ color: 0xf1dca6 }));
  r.rotation.z = (i / 14) * Math.PI; r.position.z = -0.1 * (i % 2); rays.add(r);
}
const clouds = [];
for (let i = 0; i < 9; i++) {
  const c = new THREE.Group(), mat = toon(0xfff6e2, { fog: 0.4 });
  for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(SPH, mat); s.position.set(k * 1.3 - 2, (k % 2) * 0.6, 0); s.scale.setScalar(1.2 + (k % 3) * 0.4); c.add(s); }
  c.position.set(i * 22 - 30, 11 + (i % 3) * 3, -38 - (i % 2) * 8); sky.add(c); clouds.push(c);
}

// ---------- level ----------
const level = new THREE.Group(); scene.add(level);
const BLD = [0x8f5b43, 0x6e7a6a, 0xa8744b, 0x7d5a62, 0x5f6d73];
const FAR = [0x8c9a90, 0x9aa69a, 0xa79c88];
let L = null;
function addMesh(geo, mat, x, y, z, sx, sy, sz) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); level.add(o); return o; }
function addBox(L, x0, x1, y0, y1, o = {}) { const b = { x0, x1, y0, y1, dx: 0, ...o }; L.boxes.push(b); return b; }

function buildLevel(seed, len, diff) {
  level.clear();
  const R = rng(seed), lv = { boxes: [], crates: [], x0: -8, carX: 0, carY: 0 };
  const building = (x0, x1, top, ci) => {
    const b = addBox(lv, x0, x1, -30, top, { roof: true });
    addMesh(BOX, toon(BLD[ci % BLD.length], { pattern: 1, color2: 0x2a3434 }), (x0 + x1) / 2, (top - 30) / 2, -1.5, x1 - x0, top + 30, 7);
    addMesh(BOX, toon(0x3e3029, { rim: 0 }), (x0 + x1) / 2, top - 0.12, -1.5, x1 - x0 + 0.35, 0.3, 7.35);
    if (x1 - x0 > 5 && R() < 0.4) { // water tower behind the play plane
      const wx = x0 + 1 + R() * (x1 - x0 - 2);
      addMesh(CYL, toon(0x7a5236, { pattern: 3 }), wx, top + 2.2, -3.2, 1.1, 1.8, 1.1);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.9, 16), toon(0x3e3029)); cone.position.set(wx, top + 3.55, -3.2); level.add(cone);
      for (const s of [-1, 1]) addMesh(BOX, toon(0x3e3029, { rim: 0 }), wx + s * 0.7, top + 0.65, -3.2, 0.12, 1.3, 0.12);
    }
    return b;
  };
  let x = 6, y = 0;
  building(-8, 6, 0, 0);
  let ci = 1;
  while (x < len) {
    const r = R();
    if (r < 0.12 + diff * 0.12) { // swinging window-washer scaffold across a wide gap
      const gw = 5.5 + R() * 1.5, sy = y + (R() - 0.4) * 1.2, cx = x + gw / 2;
      const b = addBox(lv, cx - 1.3, cx + 1.3, sy - 0.35, sy, { move: true, cx, amp: 1.1 + diff * 0.6, sp: 1.2 + R() * 0.8, ph: R() * 6 });
      b.mesh = new THREE.Group(); b.mesh.position.set(cx, sy - 0.17, 0); level.add(b.mesh);
      const plank = new THREE.Mesh(BOX, toon(0x9a6a3a, { pattern: 3 })); plank.scale.set(2.6, 0.34, 1.6); b.mesh.add(plank);
      for (const s of [-1, 1]) { const rope = new THREE.Mesh(CYL, toon(0x2e231b, { rim: 0 })); rope.scale.set(0.04, 30, 0.04); rope.position.set(s * 1.15, 15, 0); b.mesh.add(rope); }
      x += gw; y = sy + (R() - 0.3) * 1.2;
    } else if (r < 0.24 + diff * 0.06) { // bouncy awning down in the gap
      const gw = 4.2 + R() * 1.2, ay = y - 1.6, cx = x + gw / 2;
      addBox(lv, cx - 1.1, cx + 1.1, ay - 0.25, ay, { bounce: true });
      const aw = addMesh(BOX, toon(0xb8352a, { pattern: 2, color2: 0xeee0bd }), cx, ay - 0.12, 0, 2.3, 0.26, 2.2); aw.rotation.x = 0.05;
      addMesh(CYL, toon(0x2e231b, { rim: 0 }), cx, ay - 15, 0, 0.09, 30, 0.09);
      x += gw; y = ay + 1.6 + R() * 1.6;
    } else {
      x += 1.3 + R() * (1.5 + diff * 1.3);
      y += (R() - 0.48) * 2.6;
    }
    y = Math.max(-3, Math.min(4, y));
    const w = 3.5 + R() * 6;
    const b = building(x, x + w, y, ci++);
    if (w > 5 && R() < 0.5) { // chimney to hop over
      const cxp = x + 1.6 + R() * (w - 3.2), ch = 0.8 + R() * 0.5;
      addBox(lv, cxp - 0.35, cxp + 0.35, y, y + ch, { chimney: true });
      addMesh(BOX, toon(0x8a3f2c), cxp, y + ch / 2, 0, 0.7, ch, 0.8);
      addMesh(BOX, toon(0x3e3029, { rim: 0 }), cxp, y + ch, 0, 0.85, 0.16, 0.95);
    }
    if (R() < 0.38) lv.crates.push({ x: x + w * (0.3 + R() * 0.4), y: y + 0.9, t: 0, mesh: null });
    x += w; void b;
  }
  // the getaway roof + car
  x += 1.6;
  building(x, x + 13, y, ci);
  lv.carX = x + 8; lv.carY = y;
  const car = makeCar(); car.g.position.set(lv.carX, y, 0.2); level.add(car.g);
  lv.car = car; lv.carVX = 0; lv.end = x + 13;
  // crates
  for (const c of lv.crates) {
    c.mesh = new THREE.Group(); c.mesh.position.set(c.x, c.y, 0);
    const box = new THREE.Mesh(BOX, toon(0xc48a3e, { pattern: 3 })); box.scale.setScalar(0.62); c.mesh.add(box);
    const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTex('?', '#eee0bd'), depthWrite: false })); q.scale.set(0.9, 0.56, 1); q.position.set(0, 0.75, 0.3); c.mesh.add(q);
    level.add(c.mesh);
  }
  // far skyline
  for (let i = -30; i < lv.end + 40; i += 3 + R() * 4) {
    const z = -14 - R() * 18, h = 4 + R() * 16, w = 3 + R() * 5;
    addMesh(BOX, toon(FAR[(R() * 3) | 0], { pattern: 1, color2: 0x55625e }), i, -30 + h / 2 + 22, z, w, h + 4, 4);
  }
  lv.boxes.sort((a, b) => a.x0 - b.x0);
  return lv;
}

// ---------- players ----------
const NAMES = ['SPUD', 'DOT', 'LEFTY', 'MUGSY'];
const COLORS = [0xd8452a, 0x2a8c80, 0xe2a326, 0x7a5590];
const CSS = ['#d8452a', '#2a8c80', '#e2a326', '#7a5590'];
const HW = 0.35, PH = 1.9, GRAV = -30;
let players = [], mode = 1, round = 0, state = 'title', stateT = 0, T = 0, simT = 0, timeScale = 1, slowT = 0, shake = 0, flash = 0;
let winner = null, result = null, iris = 0, irisTarget = 2, attract = false;

function makePlayers() {
  for (const p of players) scene.remove(p.c.root);
  players = [];
  const sk = Math.min(0.95, 0.38 + save.stage * 0.06);
  for (let i = 0; i < 4; i++) {
    const human = !attract && (i === 0 || (i === 1 && mode === 2)) && !(i === 0 && BOTP1);
    const hat = i === 0 ? save.hat : i === 1 && mode === 2 ? 1 : [0, 0, 2, 4][i];
    const c = makeChar(COLORS[i], hat); scene.add(c.root);
    players.push({ i, name: NAMES[i], human, c, wins: 0, skill: (BOTP1 && i === 0) ? 0.9 : mode === 2 ? 0.5 : Math.max(0.3, sk + (i - 2) * 0.05),
      x: 0, y: 0, vx: 0, vy: 0, ang: 0, angV: 0, face: 1, ground: null, airHops: 1, stun: 0, flat: 0, getUp: 0, inv: 0, pied: 0,
      weap: null, ammo: 0, cool: 0, kick: 0, sq: 0, dead: false, deadT: 0, gone: false, safe: null, thinkT: 0, wantHop: 0, wantFire: false });
  }
}

function placePlayers() {
  players.forEach((p, k) => {
    Object.assign(p, { x: -3.5 + k * 1.3, y: 0, vx: 0, vy: 0, ang: 0, angV: 0, face: 1, ground: null, airHops: 1, stun: 0, flat: 0, inv: 0, pied: 0,
      weap: null, ammo: 0, cool: 0, dead: false, gone: false, safe: L.boxes.find((b) => b.x0 === -8), thinkT: 0.3 + rnd() * 0.4 });
  });
}

// ---------- match flow ----------
function startMatch(m) {
  mode = m; attract = false; hideCard(); makePlayers(); round = 0; result = null; newRound();
  if (Q.get('stage') == null) persist();
}
function startAttract() { attract = true; mode = 1; makePlayers(); round = 0; newRound(); state = 'play'; }
function newRound() {
  round++;
  const st = mode === 2 ? 4 : save.stage;
  L = buildLevel(st * 977 + round * 31 + mode * 7, 55 + Math.min(st, 12) * 6, Math.min(1, (st - 1) / 9));
  bullets.forEach((b) => (b.m.visible = false)); bullets.length = 0;
  placePlayers(); winner = null; readyK = -1;
  state = attract ? 'play' : 'ready'; stateT = 0; iris = 0; irisTarget = 2; camSnap = true;
}
function getaway(p) {
  winner = p; p.gone = true; p.wins++; state = 'getaway'; stateT = 0; slowT = 0.7; flash = 0.5;
  sfx.honk(); word(p.x, p.y + 2.6, 'SCRAM!'); hud(true);
}
function endMatch() {
  state = 'over';
  const w = players.reduce((a, b) => (b.wins > a.wins ? b : a));
  const humanWon = w.human;
  result = { winner: w.name, human: humanWon, stage: save.stage, rounds: round };
  if (humanWon) sfx.win(); else sfx.lose();
  let h = '';
  if (mode === 1) {
    if (humanWon) {
      const was = save.best; save.stage++; save.best = Math.max(save.best, save.stage); persist();
      const nh = HAT_AT.findIndex((a, i) => a > was && hatOpen(i));
      h = `<h1>CLEAN GETAWAY!</h1><h2>Heist No. ${save.stage - 1} pulled off</h2>` +
        (nh > 0 ? `<p>New hat in the wardrobe: <b>${HAT_NAMES[nh]}</b></p>` : '') +
        `<button data-a="next">NEXT HEIST &#9654;</button>`;
    } else {
      h = `<h1>BUSTED!</h1><h2>${w.name} drove off with the loot</h2><button data-a="next">TRY AGAIN</button>`;
    }
  } else {
    h = `<h1>${w.name} WINS!</h1><h2>${w.human ? 'the getaway king' : 'the bots out-flopped you both'}</h2><button data-a="again">REMATCH</button>`;
  }
  showCard(h + '<button data-a="menu">MENU</button><small>Space / Enter to continue</small>');
}

// ---------- physics ----------
const overlap = (p, b) => p.x + HW > b.x0 && p.x - HW < b.x1 && p.y + PH > b.y0 && p.y < b.y1;
function hop(p, d) {
  if (!p.ground && p.airHops <= 0) return;
  const air = !p.ground; if (air) p.airHops--;
  const pw = p.flat > 0 ? 0.65 : 1;
  p.vx = p.vx * (air ? 0.3 : 0.2) + (d * 5.8 + Math.sin(p.ang) * 2.4) * pw;
  p.vy = (air ? 9.2 : 10.8) * pw - Math.abs(Math.sin(p.ang)) * 1.6;
  p.angV += d * (air ? 3 : 4.6) + (rnd() - 0.5) * 2.2;
  p.face = d; p.ground = null; p.flat = 0; p.getUp = 0.3; p.sq = 0.35;
  puff(p.x, p.y + 0.1, air ? 2 : 4, 0.22);
  if (near(p)) sfx.hop(air ? 1.25 : 1 + p.i * 0.06);
}
const WEAPS = { pop: { n: 'POPGUN', ammo: 6 }, blun: { n: 'BLUNDERBUSS', ammo: 3 }, pie: { n: 'CREAM PIE', ammo: 3 } };
const bullets = [], bpool = [];
function bullet(o) {
  let b = bpool.find((q) => !q.m.visible);
  if (!b) { b = { m: new THREE.Mesh(SPH, toon(0xfff2d0)) }; scene.add(b.m); bpool.push(b); }
  Object.assign(b, o); b.m.visible = true; b.m.scale.setScalar(o.type === 'pie' ? 0.22 : 0.11); b.m.position.set(b.x, b.y, 0); bullets.push(b);
}
function fire(p) {
  if (!p.weap || p.cool > 0) return;
  const a = (p.face > 0 ? 0 : Math.PI) - p.ang * 0.8, dx = Math.cos(a), dy = Math.sin(a);
  const hx = p.x + dx * 0.9, hy = p.y + 1.2 + dy * 0.9;
  if (p.weap === 'pop') { bullet({ x: hx, y: hy, vx: dx * 26, vy: dy * 26, g: 0, life: 0.8, k: 7, stun: 0.35, type: 'pop', own: p }); p.cool = 0.28; recoil(p, dx, dy, 1.6); sfx.pop(); }
  if (p.weap === 'blun') {
    for (let i = 0; i < 5; i++) { const s = (i - 2) * 0.12 + (rnd() - 0.5) * 0.06; bullet({ x: hx, y: hy, vx: Math.cos(a + s) * 22, vy: Math.sin(a + s) * 22, g: 0, life: 0.38, k: 4.6, stun: 0.3, type: 'blun', own: p }); }
    p.cool = 0.7; recoil(p, dx, dy, 8); sfx.boom(); if (near(p)) shake = Math.max(shake, 0.35); puff(hx, hy, 5, 0.3);
  }
  if (p.weap === 'pie') { bullet({ x: hx, y: hy, vx: dx * 13 + p.vx * 0.3, vy: dy * 13 + 4.5, g: -16, life: 2, k: 3, stun: 1.2, type: 'pie', own: p }); p.cool = 0.5; sfx.toss(); }
  p.kick = 1; if (--p.ammo <= 0) p.weap = null;
}
function recoil(p, dx, dy, f) { p.vx -= dx * f; p.vy -= dy * f * (dy < 0 ? 1.3 : 0.6); if (f > 3) { p.ground = null; p.angV -= p.face * 3; } }

function stepPlayer(p, dt) {
  if (p.gone) return;
  if (p.dead) { if ((p.deadT -= dt) <= 0) respawn(p); return; }
  p.stun = Math.max(0, p.stun - dt); p.cool = Math.max(0, p.cool - dt); p.flat = Math.max(0, p.flat - dt);
  p.getUp = Math.max(0, p.getUp - dt); p.inv = Math.max(0, p.inv - dt); p.pied = Math.max(0, p.pied - dt);
  if (!p.human) think(p, dt);
  if (state === 'play') {
    if (p.wantHop && p.stun <= 0) hop(p, p.wantHop);
    if (p.wantFire && p.stun <= 0) fire(p);
  }
  p.wantHop = 0; p.wantFire = false;
  if (p.ground && p.ground.dx) p.x += p.ground.dx;
  p.vy += GRAV * dt;
  p.vx *= Math.pow(p.ground ? 0.0004 : 0.55, dt);
  const k = p.ground ? (p.flat > 0 ? 0 : 42) : 7, c = p.ground ? 6.5 : 1.2;
  p.angV += (-k * Math.sin(p.ang) - c * p.angV) * dt; p.ang += p.angV * dt;
  if (p.ground && Math.abs(p.ang) > 1.3 && p.flat <= 0 && p.getUp <= 0) { p.flat = 0.7; p.ang = Math.sign(p.ang) * 1.45; p.angV = 0; p.getUp = 1.2; puff(p.x + Math.sign(p.ang) * 1, p.y, 3, 0.25); if (near(p)) sfx.land(); }
  if (p.flat > 0) p.ang = Math.sign(p.ang) * 1.45;
  p.ang = Math.max(-1.55, Math.min(1.55, p.ang));
  // x then y against the city
  const px = p.x, py = p.y;
  p.x += p.vx * dt;
  for (const b of L.boxes) if (overlap(p, b)) {
    if (px + HW <= b.x0 + 0.1) p.x = b.x0 - HW; else if (px - HW >= b.x1 - 0.1) p.x = b.x1 + HW; else continue;
    p.vx *= -0.25; p.angV += -Math.sign(p.vx || 1) * 1.5;
  }
  p.y += p.vy * dt;
  const wasG = p.ground; p.ground = null;
  for (const b of L.boxes) if (overlap(p, b)) {
    if (py >= b.y1 - 0.12) {
      p.y = b.y1;
      if (b.bounce) { if (p.vy < 0) { p.vy = 15.5; p.sq = -0.4; p.airHops = 1; p.angV += (rnd() - 0.5) * 4; if (near(p)) sfx.hop(0.6); word(p.x, p.y + 1.2, 'BOING!', '#2a8c80'); } continue; }
      if (!wasG && p.vy < -3) { p.sq = -0.32; p.angV += p.vx * 0.28 + (rnd() - 0.5) * 1.2; puff(p.x, p.y + 0.05, 3, 0.2); if (near(p)) sfx.land(); }
      p.vy = 0; p.ground = b; p.airHops = 1; if (!b.chimney) p.safe = b;
    } else if (py + PH <= b.y0 + 0.12) { p.y = b.y0 - PH; p.vy = Math.min(0, p.vy); }
    else if (!b.move) { p.y = b.y1; p.vy = 0; p.ground = b; }
  }
  // grab crates
  for (const cr of L.crates) if (cr.t <= 0 && Math.abs(cr.x - p.x) < 0.8 && Math.abs(cr.y - (p.y + 0.9)) < 1.2) {
    cr.t = 6; cr.mesh.visible = false; const ks = Object.keys(WEAPS); p.weap = ks[(rnd() * 3) | 0]; p.ammo = WEAPS[p.weap].ammo;
    if (near(p)) sfx.ding(); puff(cr.x, cr.y, 5, 0.2);
  }
  if (p.y < -9) { p.dead = true; p.deadT = 1.3; p.weap = null; if (near(p)) sfx.whistle(); word(p.x, -3, 'YIKES!', '#2a8c80'); }
}
function respawn(p) {
  const s = p.safe || L.boxes[0];
  Object.assign(p, { dead: false, x: (s.x0 + s.x1) / 2, y: s.y1 + 0.2, vx: 0, vy: 0, ang: 0, angV: 0, inv: 1.2, stun: 0, flat: 0, ground: null });
  puff(p.x, p.y + 0.5, 6, 0.3);
}

// ---------- bots ----------
function aheadBox(x) { for (const b of L.boxes) if (b.x0 > x + HW - 0.05 && !b.chimney) return b; return null; }
function think(p, dt) {
  p.thinkT -= dt;
  const sk = p.skill;
  if (p.weap && p.cool <= 0 && rnd() < dt * 4 * sk) {
    for (const q of players) if (q !== p && !q.dead && !q.gone) {
      const dx = q.x - p.x, dy = q.y - p.y;
      if (Math.sign(dx) === p.face && Math.abs(dx) < (p.weap === 'blun' ? 6 : 11) && Math.abs(dy) < 2.2) { p.wantFire = true; break; }
    }
  }
  if (p.stun > 0 || state !== 'play') return;
  const dir = p.x > L.carX + 0.5 ? -1 : 1;
  if (p.ground) {
    if (p.thinkT <= 0) {
      if (Math.abs(p.ang) > 0.55 && rnd() < sk) { p.thinkT = 0.08; return; } // let the wobble settle
      p.wantHop = dir; p.thinkT = (0.12 + rnd() * 0.4) * (1.7 - sk);
    }
  } else if (p.airHops > 0 && p.vy < 0.5) {
    const nb = aheadBox(p.x);
    const short = nb && p.x < nb.x0 && p.y < nb.y1 + 0.4;
    if ((short || p.y < (p.safe ? p.safe.y1 - 1 : -2)) && rnd() < dt * 14 * sk) p.wantHop = dir;
  }
}

// ---------- fx: puffs, POW words ----------
const puffs = [];
function puff(x, y, n, s) {
  for (let i = 0; i < n; i++) {
    let q = puffs.find((o) => o.t <= 0);
    if (!q) { q = { m: new THREE.Mesh(SPH, toon(0xfff3d6)), t: 0 }; scene.add(q.m); puffs.push(q); }
    Object.assign(q, { t: 0.35 + rnd() * 0.25, x, y, z: (rnd() - 0.5) * 0.8, vx: (rnd() - 0.5) * 3, vy: rnd() * 2, s: s * (0.7 + rnd() * 0.6) });
    q.T = q.t; q.m.visible = true;
  }
}
const WORDS = {}, words = [];
function word(x, y, w, col) {
  if (!WORDS[w]) WORDS[w] = wordTex(w, col);
  let s = words.find((o) => o.t <= 0);
  if (!s) { s = { sp: new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, depthTest: false })) }; s.sp.renderOrder = 10; scene.add(s.sp); words.push(s); }
  s.sp.material.map = WORDS[w]; s.sp.material.needsUpdate = true; s.t = 0.9; s.x = x; s.y = y; s.r = (rnd() - 0.5) * 0.4; s.sp.visible = true;
}
const near = (p) => !attract && Math.abs(p.x - camX) < 22;

// ---------- main step ----------
function step(dt) {
  simT += dt; stateT += dt;
  if (state === 'ready') {
    const k = Math.floor(stateT / 0.55);
    if (k !== readyK) { readyK = k; if (k < 2) { say(['READY...', 'SET...'][k]); sfx.tick(); } else { say('SCRAM!'); sfx.go(); state = 'play'; stateT = 0; } }
  }
  for (const b of L.boxes) if (b.move) {
    const nx = b.cx + Math.sin(simT * b.sp + b.ph) * b.amp, cur = (b.x0 + b.x1) / 2;
    b.dx = nx - cur; b.x0 += b.dx; b.x1 += b.dx; b.mesh.position.x = nx; b.mesh.rotation.z = Math.cos(simT * b.sp + b.ph) * 0.03;
  }
  for (const p of players) stepPlayer(p, dt);
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) { // shoulder bumps
    const a = players[i], b = players[j];
    if (a.dead || b.dead || a.gone || b.gone) continue;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 0.6 && Math.abs(b.y - a.y) < 1.4) { const s = Math.sign(dx || 1) * (0.6 - Math.abs(dx)) * 0.5; a.x -= s; b.x += s; }
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let hit = b.life <= 0;
    for (const bx of L.boxes) if (!hit && b.x > bx.x0 && b.x < bx.x1 && b.y > bx.y0 && b.y < bx.y1) { hit = true; puff(b.x, b.y, 2, 0.15); if (b.type === 'pie') { word(b.x, b.y + 1, 'SPLAT!', '#eee0bd'); if (Math.abs(b.x - camX) < 22) sfx.splat(); } }
    if (!hit) for (const q of players) {
      if (q === b.own || q.dead || q.gone || q.inv > 0) continue;
      if (b.x > q.x - HW - 0.15 && b.x < q.x + HW + 0.15 && b.y > q.y && b.y < q.y + PH) {
        hit = true; const d = Math.sign(b.vx || 1);
        q.vx += d * b.k; q.vy = Math.max(q.vy, 0) + b.k * 0.55; q.ground = null; q.angV += d * 7; q.stun = Math.max(q.stun, b.stun); q.sq = -0.25;
        if (b.type === 'pie') { q.pied = 1.4; word(q.x, q.y + 2.4, 'SPLAT!', '#eee0bd'); sfx.splat(); }
        else { word(q.x, q.y + 2.4, ['POW!', 'BONK!', 'WHAM!', 'ZOWIE!'][(rnd() * 4) | 0]); sfx.bonk(); }
        if (q.human || b.own.human) { shake = Math.max(shake, 0.3); slowT = Math.max(slowT, 0.12); }
        puff(b.x, b.y, 3, 0.18); break;
      }
    }
    if (hit) { b.m.visible = false; bullets.splice(i, 1); } else b.m.position.set(b.x, b.y, 0);
  }
  for (const cr of L.crates) if (cr.t > 0 && (cr.t -= dt) <= 0) cr.mesh.visible = true;
  if (state === 'play') {
    for (const p of players) if (!p.dead && !p.gone && Math.abs(p.x - L.carX) < 1.7 && p.y >= L.carY - 0.1 && p.y < L.carY + 3) {
      if (attract) { newRound(); return; }
      getaway(p); break;
    }
  }
  if (state === 'getaway') {
    L.carVX = Math.min(22, L.carVX + dt * 14 * (stateT > 0.5 ? 1 : 0));
    L.car.g.position.x += L.carVX * dt; L.carX = L.car.g.position.x;
    if (L.carVX > 0) puff(L.carX - 2, L.carY + 0.3, 1, 0.25);
    if (stateT > 2.0) irisTarget = 0;
    if (stateT > 2.7) { if (winner.wins >= 3) endMatch(); else newRound(); }
  }
}
let readyK = -1;

// ---------- posing the cartoon ----------
function pose(p, dt) {
  const c = p.c, r = c.root;
  if (p.gone && L.car) { r.position.set(L.car.g.position.x - 0.4, L.carY + 1.0, 0.3); r.rotation.z = Math.sin(simT * 20) * 0.05; }
  else { r.position.set(p.x, p.y, 0); r.rotation.z = -p.ang; }
  r.visible = !p.dead && !(p.inv > 0 && ((simT * 18) | 0) % 2 === 0);
  if (!r.visible) return;
  const tgt = p.face > 0 ? -0.6 : -2.54;
  c.facer.rotation.y += (tgt - c.facer.rotation.y) * Math.min(1, dt * 12);
  p.sq += -p.sq * Math.min(1, dt * 9); p.kick += -p.kick * Math.min(1, dt * 12);
  const s = 1 + p.sq + (p.ground ? 0 : Math.max(-0.1, Math.min(0.15, p.vy * 0.012)));
  c.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  const g = !!p.ground || p.gone, t = simT, f = p.face;
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1, z = side * 0.17;
    let fx, fy;
    if (g) { fx = side * 0.2 + Math.sin(t * 9 + k * 3) * 0.02; fy = 0.1; }
    else { fx = side * 0.28 - p.vx * f * 0.02 + Math.sin(t * 15 + k * Math.PI) * 0.12; fy = 0.22 + (p.vy > 0 ? 0.28 : 0) + Math.cos(t * 15 + k * Math.PI) * 0.08; }
    const hy = 0.72 * s;
    c.legs[k].set(side * 0.06, hy, (side * 0.06 + fx) / 2 + 0.16 + Math.sin(t * 6 + k) * 0.04, (hy + fy) / 2, fx, fy + 0.08, z);
    c.shoes[k].position.set(fx + 0.09, fy, z);
  }
  const armed = !!p.weap, e = 0.2 * p.ang * f, sy = 1.2 * s;
  // front (gun) arm
  let hx = Math.cos(e) * 0.62 - p.kick * 0.18, hy = sy + Math.sin(e) * 0.62 + p.kick * 0.12;
  if (!armed) { hx = 0.32; hy = g ? 0.85 + Math.sin(t * 4) * 0.04 : 1.7 + Math.sin(t * 17) * 0.22; }
  c.arms[1].set(0.02, sy, (hx + 0.02) / 2, (sy + hy) / 2 - 0.18, hx, hy, 0.3);
  c.gloves[1].position.set(hx, hy, 0.3);
  // back arm flails in the air
  const bx = g ? -0.28 : -0.42, by = g ? 0.85 + Math.sin(t * 3.3) * 0.04 : 1.55 + Math.sin(t * 16 + 1) * 0.25;
  c.arms[0].set(-0.02, sy, (bx - 0.02) / 2 - 0.05, (sy + by) / 2 - 0.15, bx, by, -0.3);
  c.gloves[0].position.set(bx, by, -0.3);
  c.weap.pop.visible = p.weap === 'pop'; c.weap.blun.visible = p.weap === 'blun'; c.weap.pie.visible = p.weap === 'pie';
  c.head.rotation.z = Math.sin(t * 7 + p.i) * 0.05 - p.angV * 0.03;
  c.head.position.y = 1.72 * s;
  c.pieFace.visible = p.pied > 0;
  if (c.prop) c.prop.rotation.y += dt * (g ? 6 : 30);
  const dizzy = p.stun > 0.25 || p.flat > 0;
  c.stars.forEach((st, i) => { st.visible = dizzy; const a = t * 6 + i * 2.1; st.position.set(Math.cos(a) * 0.5, 2.25, Math.sin(a) * 0.5); });
}

// ---------- camera ----------
let camX = 0, camY = 2, camZ = 17, camSnap = true;
const v3 = new THREE.Vector3();
function updCam(dt) {
  let xs = [], ys = [];
  if (state === 'getaway' || state === 'over') { xs = [L.car.g.position.x]; ys = [L.carY]; }
  else {
    let fp = players.filter((p) => p.human && !p.gone);
    if (!fp.length) fp = [players.filter((p) => !p.gone && !p.dead).sort((a, b) => b.x - a.x)[0] || players[0]];
    for (const p of fp) { xs.push(p.dead ? (p.safe ? (p.safe.x0 + p.safe.x1) / 2 : p.x) : p.x); ys.push(p.dead ? (p.safe ? p.safe.y1 : 0) : p.y); }
  }
  const mn = Math.min(...xs), mx = Math.max(...xs), tx = (mn + mx) / 2 + 2.5, ty = ys.reduce((a, b) => a + b, 0) / ys.length + 2;
  const tz = Math.max(16, Math.min(30, 15 + (mx - mn) * 0.6)) + (camera.aspect < 1 ? 7 : 0);
  const k = camSnap ? 1 : 1 - Math.exp(-dt * 4);
  camSnap = false;
  camX += (tx - camX) * k; camY += (ty - camY) * k; camZ += (tz - camZ) * k;
  shake *= Math.exp(-dt * 7);
  camera.position.set(camX + (rnd() - 0.5) * shake, camY + 1.6 + (rnd() - 0.5) * shake, camZ);
  camera.lookAt(camX, camY, 0);
  sky.position.x = camX * 0.9; rays.rotation.z += dt * 0.05;
  for (const c of clouds) { c.position.x += dt * 0.4; if (c.position.x > 100) c.position.x -= 200; }
  // iris follows the focus
  v3.set(xs[0], ys[0] + 1, 0).project(camera);
  post.u.uIrisC.value.set(Math.max(0.1, Math.min(0.9, v3.x * 0.5 + 0.5)), Math.max(0.1, Math.min(0.9, v3.y * 0.5 + 0.5)));
}

// ---------- HUD ----------
let hudKey = '';
function hud(force) {
  const key = players.map((p) => p.wins).join() + mode + attract;
  if (force || key !== hudKey) {
    hudKey = key;
    $('pips').innerHTML = attract ? '' : players.map((p) => `<span class="pp"><b style="background:${CSS[p.i]}"></b>${p.name}${p.human ? '' : '<small style="opacity:.6">&nbsp;bot</small>'} ${[0, 1, 2].map((k) => `<i class="${k < p.wins ? 'on' : ''}"></i>`).join('')}</span>`).join('');
    $('lane').innerHTML = players.map((p) => `<span class="dot" id="d${p.i}" style="background:${CSS[p.i]}"></span>`).join('');
  }
  $('track').style.display = attract ? 'none' : '';
  const span = L.carX - (-4);
  for (const p of players) { const d = $('d' + p.i); if (d) d.style.left = Math.max(0, Math.min(100, ((p.x + 4) / span) * 100)) + '%'; }
  const me = players.find((p) => p.human) || players[0];
  $('weap').textContent = attract || !me.weap ? '' : `${WEAPS[me.weap].n}  x${me.ammo}`;
}
let sayT = 0;
function say(t) { const e = $('say'); e.textContent = t; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); sayT = 0.9; }

// ---------- cards / menu ----------
function showCard(html) { const c = $('card'); c.innerHTML = html; c.classList.remove('hide'); }
function hideCard() { $('card').classList.add('hide'); }
function menu() {
  if (!attract) startAttract();
  state = 'title';
  const h = save.hat;
  showCard(`<h1>GETAWAY FLOP</h1><h2>a rubber-hose heist picture</h2>
    <button data-a="p1">1 PLAYER &middot; HEIST No. ${save.stage}</button>
    <button data-a="p2">2 PLAYERS &middot; SAME KEYS</button>
    <div class="row"><button data-a="hl">&#9664;</button><span>${hatOpen(h) ? HAT_NAMES[h].toUpperCase() : 'LOCKED'}</span><button data-a="hr">&#9654;</button></div>
    <p><small>Hats unlock at heists ${HAT_AT.slice(1).join(', ')} &middot; best: No. ${save.best}</small></p>
    <p>Hop to the getaway car. Grab <b>?</b> crates for popguns, blunderbusses and cream pies.
    First to <b>3 getaways</b> takes the loot.</p>
    <p><small>P1: A / D hop &middot; W or S fire &nbsp;|&nbsp; P2: &larr; / &rarr; hop &middot; &uarr; or &darr; fire<br>
    Tap twice for a mid-air hop. Esc = menu.</small></p>`);
}
$('card').addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.a; if (!a) return;
  wake();
  if (a === 'p1') startMatch(1);
  if (a === 'p2') startMatch(2);
  if (a === 'next') startMatch(1);
  if (a === 'again') startMatch(2);
  if (a === 'menu') menu();
  if (a === 'hl' || a === 'hr') {
    const n = HAT_NAMES.length; let h = save.hat;
    for (let i = 0; i < n; i++) { h = (h + (a === 'hr' ? 1 : n - 1)) % n; if (hatOpen(h)) break; }
    save.hat = h; persist(); menu();
  }
});

// ---------- input ----------
let woke = false;
function wake() { if (!woke) { woke = true; if (ac()) music(true); } }
const humans = () => players.filter((p) => p.human);
addEventListener('keydown', (e) => {
  wake();
  if (e.repeat) return;
  const c = e.code;
  if (c === 'Escape') { menu(); return; }
  if (state === 'over' && (c === 'Space' || c === 'Enter')) { e.preventDefault(); startMatch(mode); return; }
  if (state === 'title' && c === 'Enter') { startMatch(1); return; }
  const h = humans(), p1 = h[0], p2 = mode === 2 ? h[1] : h[0];
  if (p1) { if (c === 'KeyA') p1.wantHop = -1; if (c === 'KeyD') p1.wantHop = 1; if (c === 'KeyW' || c === 'KeyS') p1.wantFire = true; }
  if (p2) { if (c === 'ArrowLeft') p2.wantHop = -1; if (c === 'ArrowRight') p2.wantHop = 1; if (c === 'ArrowUp' || c === 'ArrowDown') p2.wantFire = true; }
  if (c.startsWith('Arrow') || c === 'Space') e.preventDefault();
  if (c === 'Space' && p1) p1.wantFire = true;
});
for (const [id, fn] of [['tl', (p) => (p.wantHop = -1)], ['tr', (p) => (p.wantHop = 1)], ['tf', (p) => (p.wantFire = true)]]) {
  $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); wake(); const p = humans()[0]; if (p) fn(p); });
}
addEventListener('pointerdown', wake, { once: true });

// ---------- loop ----------
let last = performance.now(), acc = 0;
const DT = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (slowT > 0) { slowT -= dt; timeScale = 0.3; } else timeScale += (1 - timeScale) * Math.min(1, dt * 6);
  acc += dt * timeScale;
  while (acc >= DT) { step(DT); acc -= DT; }
  render(dt);
}
function render(dt) {
  for (const p of players) pose(p, dt);
  for (const q of puffs) if (q.t > 0) {
    q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.m.position.set(q.x, q.y, q.z);
    q.m.scale.setScalar(q.s * (0.5 + (q.t / q.T) * 0.8)); if (q.t <= 0) q.m.visible = false;
  }
  for (const s of words) if (s.t > 0) {
    s.t -= dt; const a = 1 - s.t / 0.9, sc = a < 0.15 ? a / 0.15 * 1.25 : 1.25 - (a - 0.15) * 0.3;
    s.sp.position.set(s.x, s.y + a * 0.8, 1); s.sp.scale.set(2.2 * sc, 1.375 * sc, 1); s.sp.material.rotation = s.r; s.sp.visible = s.t > 0;
  }
  for (const cr of L.crates) if (cr.mesh.visible) { cr.mesh.position.y = cr.y + Math.sin(T * 3 + cr.x) * 0.12; cr.mesh.rotation.y = Math.sin(T * 1.7 + cr.x) * 0.5; }
  if (L.car) for (const w of L.car.wheels) w.rotation.z -= L.carVX * dt / 0.5;
  if (L.car) L.car.g.position.y = L.carY + (L.carVX > 0 ? Math.abs(Math.sin(T * 25)) * 0.06 : 0);
  if (sayT > 0 && (sayT -= dt) <= 0) $('say').textContent = '';
  updCam(dt); hud(false);
  iris += (irisTarget - iris) * Math.min(1, dt * (irisTarget > iris ? 2.2 : 5));
  flash *= Math.exp(-dt * 8);
  post.u.uIris.value = iris; post.u.uFlash.value = flash;
  post.render(scene, camera, T);
}

// ---------- boot ----------
if (Q.get('stage')) save.stage = Math.max(1, +Q.get('stage') | 0);
if (Q.has('title')) menu(); else startMatch(1);
requestAnimationFrame(frame);

// test hooks
window.__G = {
  get state() { return state; }, get players() { return players; }, get result() { return result; }, get L() { return L; }, get round() { return round; },
  fast(sec) { for (let t = 0; t < sec; t += DT) { step(DT); if (state === 'over') break; } },
  startMatch, menu, save,
};
