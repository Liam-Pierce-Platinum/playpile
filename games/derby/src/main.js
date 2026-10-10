// DEMOLITION DERBY - top-down, eight cars in a dirt arena, last one driving wins.
// W gas, S brake/reverse, A/D steer, Space handbrake, Shift boost, R restart, Esc pause.
import { CARS, PAINTS, DRIVERS, ARENAS, PAYOUT } from './data.js';
import { buildArena, bakeGround, GS, wallDist, inPuddle } from './arena.js';
import { SUB, drive, carVsCar, carVsArena, carVsBody, bodyVsArena, bodyVsBody, toWorld } from './physics.js';
import { Car, drawCar, drawShadow, drawDebris, enginePos } from './car.js';
import { Brain } from './ai.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { clamp, lerp, TAU } from './util.js';

const SAVE_KEY = 'pd.derby';
const params = new URLSearchParams(location.search);
// --- the key numbers (see README)
const ZONE_MULT = [0.45, 1.1, 1.25, 1.25];   // front bumper is armoured; sides and rear crumple
const DMG_K = 0.085, DMG_MIN = 85;            // damage = (closing speed - 85) * 0.085 * zone mult * mass factor
const WALL_MIN = 160, WALL_K = 0.035;         // walls: (impact - 160) * 0.035 * zone mult * wall softness
const SD_START = 75, SD_LEN = 40, RING_MIN = 230, OVERHEAT = 6;   // sudden death ring, then engines cook
const FIRE_AT = 0.18, BURN = 1.6;             // engine below 18% catches fire and burns out
const PLAYER_TAKE = 0.85, PLAYER_DEAL = 1.1;   // arcade assist for the human
const IDLE = { steer: 0, throttle: 0, brake: 0, hand: false, boost: false };

// AI paint must read as different from yours: any driver too close to your colour gets the
// spare colour that is furthest from you and from everyone else on the grid
const SPARE = ['#b8242c', '#3fb4e8', '#8a3ad8', '#5d6b30', '#18a090', '#e8781a', '#f06aa8', '#2a62d0', '#f2c21e', '#eeede6', '#7ad230', '#232327', '#8a5a3a', '#00c8c8', '#c8c8d0', '#ff4fa0'];
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function colDist(a, b) { const p = rgb(a), q = rgb(b), r = (p[0] + q[0]) / 2; return Math.sqrt((2 + r / 256) * (p[0] - q[0]) ** 2 + 4 * (p[1] - q[1]) ** 2 + (2 + (255 - r) / 256) * (p[2] - q[2]) ** 2); }
function recolour(drivers, mine) {
  for (const d of drivers) {
    if (colDist(d.top, mine) > 160) continue;
    let best = null, bestS = -1;
    for (const c of SPARE) {
      const s = Math.min(colDist(c, mine), ...drivers.filter((o) => o !== d).map((o) => colDist(c, o.top)) );
      if (s > bestS) { bestS = s; best = c; }
    }
    d.top = best;
    if (colDist(d.stripe, best) < 150) d.stripe = colDist('#ffffff', best) > colDist('#141414', best) ? '#ffffff' : '#141414';
  }
}

class Game {
  constructor() {
    this.cv = document.getElementById('c');
    this.x = this.cv.getContext('2d');
    this.audio = new Audio();
    this.save = { coins: 0, owned: ['hatch'], car: 'hatch', paint: 0, paints: [0, 1, 2, 3], arena: 0, unlocked: 1, wins: 0, rounds: 0, wrecks: 0, vol: 0.8, muted: false };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
    if (params.has('unlock')) { this.save.unlocked = 3; this.save.coins = Math.max(this.save.coins, 9999); }
    this.audio.vol = this.save.vol; this.audio.muted = this.save.muted;
    this.keys = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, on: false };
    this.btn = { boost: null, rev: null };
    this.fast = clamp(+params.get('fast') || 1, 1, 16);
    this.autoPlayer = params.has('auto');
    this.mode = 'title';
    this.rt = 0; this.acc = 0;
    this.stats = { maxPen: 0, outside: 0, steps: 0 };
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.setupRound(clamp(+params.get('arena') || 0, 0, 2), true);
    this.ui.show('title');
    if (params.has('play')) {
      const a = params.has('arena') ? clamp(+params.get('arena'), 0, 2) : this.save.arena;
      if (params.has('car') && CARS[params.get('car')]) this.save.car = params.get('car');
      this.startRound(a);
    }
    window.__DD = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * this.dpr);
    this.cv.height = Math.round(innerHeight * this.dpr);
    this.W = innerWidth; this.H = innerHeight;
    this.small = Math.min(this.W, this.H) < 560;
  }

  // ------------------------------------------------------------ input
  input() {
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && ['pause', 'howto'].includes(this.ui.panel)) { this.ui.back(); return; }
        if (this.mode === 'play' && !this.ui.open) { this.ui.show('pause'); return; }
        if (this.ui.panel === 'garage' || this.ui.panel === 'howto') { this.ui.show('title'); return; }
      }
      if (this.ui.open) { if (['Enter', 'Space', 'KeyR'].includes(e.code)) this.ui.primary(e.code); return; }
      if (this.mode === 'play' && e.code === 'KeyR') this.startRound(this.arenaIdx);
      if (this.mode === 'play' && this.spectate && !this.over && (e.code === 'Space' || e.code === 'Enter')) this.showResults();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); if (this.mode === 'play' && !this.ui.open && !this.over) this.ui.show('pause'); });
    // touch: a floating stick on the left half, BOOST and REVERSE buttons on the right
    const btnAt = (tx, ty) => {
      for (const [k, b] of Object.entries(this.touchButtons())) if (Math.hypot(tx - b.x, ty - b.y) < b.r * 1.25) return k;
      return null;
    };
    this.cv.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.audio.unlock();
      this.isTouch = true;
      if (this.mode === 'play' && this.spectate && !this.over && !this.ui.open) { this.showResults(); return; }
      for (const t of e.changedTouches) {
        const b = btnAt(t.clientX, t.clientY);
        if (b) { this.btn[b] = t.identifier; continue; }
        if (this.stick.id === null && t.clientX < innerWidth * 0.6) { Object.assign(this.stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, on: true }); }
      }
    }, { passive: false });
    this.cv.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.stick.id) { this.stick.x = t.clientX; this.stick.y = t.clientY; }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.on = false; }
        for (const k of Object.keys(this.btn)) if (this.btn[k] === t.identifier) this.btn[k] = null;
      }
    };
    this.cv.addEventListener('touchend', (e) => { e.preventDefault(); end(e); }, { passive: false });
    this.cv.addEventListener('touchcancel', end);
  }
  touchButtons() {
    const r = Math.min(52, this.W * 0.1);
    return { boost: { x: this.W - r - 24, y: this.H - r - 30, r, label: 'BOOST' }, rev: { x: this.W - r * 3.3 - 24, y: this.H - r * 0.8 - 30, r: r * 0.8, label: 'REV' } };
  }
  controls(c) {
    const k = this.keys;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    const hand = k.has('Space');
    let boost = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.isTouch) {
      const s = this.stick, rev = this.btn.rev !== null;
      if (this.btn.boost !== null) { boost = true; throttle = 1; }
      if (s.on) {
        const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy);
        if (m > 10) {
          // the stick points where you want the nose to go; gas is automatic
          let d = Math.atan2(dy, dx) - c.h; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          steer = clamp(d * 2.6, -1, 1) * (c.vf < -20 ? -1 : 1);
          if (!rev) throttle = 1;
        }
      }
      if (rev) { brake = 1; throttle = 0; }
    }
    return { steer, throttle, brake, hand, boost };
  }

  // ------------------------------------------------------------ rounds
  setupRound(ai, attract) {
    this.arenaIdx = ai;
    this.arena = buildArena(ai);
    this.ground = bakeGround(this.arena);
    this.gctx = this.ground.getContext('2d');
    this.gctx.setTransform(GS, 0, 0, GS, -this.arena.minX * GS, -this.arena.minY * GS);
    this.gctx.lineCap = 'round';
    this.attract = attract;
    this.cars = []; this.brains = [];
    const spawns = this.arena.spawns.slice();
    for (let i = spawns.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spawns[i], spawns[j]] = [spawns[j], spawns[i]]; }
    const place = (c, s) => { c.x = s.x; c.y = s.y; c.h = s.h; };
    if (!attract) {
      const P = PAINTS[this.save.paint] || PAINTS[0];
      this.player = new Car(this.save.car, { top: P.top, stripe: P.stripe, num: 7, name: 'YOU' }, true);
      place(this.player, spawns.pop());
      this.cars.push(this.player);
      if (this.autoPlayer) { this.player.brain = new Brain(this.player, 'brawler'); this.brains.push(this.player.brain); }
    } else this.player = null;
    const drivers = DRIVERS.map((d) => ({ ...d }));
    if (this.player) recolour(drivers, this.player.livery.top);
    if (attract) drivers.push({ name: 'ACE', num: 7, kind: 'brawler', top: '#eeede6', stripe: '#d8322a', car: 'hatch' });
    for (const d of drivers) {
      const c = new Car(d.car, { top: d.top, stripe: d.stripe, num: d.num, name: d.name });
      place(c, spawns.pop());
      c.brain = new Brain(c, d.kind);
      this.brains.push(c.brain);
      this.cars.push(c);
    }
    this.hay = this.arena.hay.map((h) => ({ x: h.x, y: h.y, r: h.r, mass: 0.9, vx: 0, vy: 0, a: Math.random() * TAU, w: 0 }));
    this.debris = []; this.pickups = []; this.pops = []; this.feed = [];
    this.fx = new FX();
    this.time = 0; this.count = attract ? 0 : 3.6; this.over = false; this.endT = null; this.focus = null;
    this.ring = null; this.deaths = [];
    this.hitStop = 0; this.slowT = 0; this.shake = 0; this.flash = 0;
    this.pickupT = 8; this.spectate = false; this.spectateFast = false; this.watchT = 0; this.watchCar = null;
    this.results = null;
    const f = this.player || { x: 0, y: 0 };
    this.cam = { x: f.x * 0.5, y: f.y * 0.5, z: this.baseZoom() * (attract ? 0.6 : 1) };
    this.stats = { maxPen: 0, outside: 0, steps: 0, overlapFrames: 0 };
  }
  startRound(ai) {
    this.save.arena = ai; this.persist();
    this.setupRound(ai, false);
    this.mode = 'play';
    this.ui.close();
    this.ui.hud(true);
    this.audio.unlock();
  }
  toTitle() {
    this.mode = 'title';
    this.ui.hud(false);
    this.setupRound(this.save.arena || 0, true);
    this.ui.show('title');
  }
  alive() { return this.cars.filter((c) => c.alive); }
  baseZoom() { return Math.min(this.W, this.H) / (this.small ? 430 : 690); }
  // collision callouts: at most one per 0.35 s; a bigger hit replaces the last one instead of piling on top
  callout(text, wx, wy, col, size, life, weight) {
    const last = this.lastCallout;
    if (last && last.life > last.max - 0.35 && this.pops.includes(last)) {
      if (weight <= last.weight) return;
      this.pops.splice(this.pops.indexOf(last), 1);
    }
    this.pop(text, wx, wy, col, size, life);
    this.lastCallout = this.pops[this.pops.length - 1]; this.lastCallout.weight = weight;
  }
  pop(text, wx, wy, col, size = 28, life = 1.1) { this.pops.push({ text, x: wx, y: wy, col, size, life, max: life }); if (this.pops.length > 14) this.pops.shift(); }
  // how loud / visible an event at a world point is, from the camera
  near(wx, wy) { return clamp(1 - Math.hypot(wx - this.cam.x, wy - this.cam.y) / 1500, 0.08, 1); }
  pan(wx) { return clamp((wx - this.cam.x) / 700, -0.8, 0.8); }

  // ------------------------------------------------------------ the simulation step
  step(dt) {
    this.stats.steps++;
    const A = this.arena;
    if (this.count > 0) {
      const before = Math.ceil(this.count);
      this.count -= dt;
      if (Math.ceil(this.count) !== before && this.count < 3) this.audio.beep(this.count <= 0);
      if (this.count <= 0) { this.pop('SMASH!', this.player ? this.player.x : 0, (this.player ? this.player.y : 0) - 60, '#ffd23a', 64, 1.1); this.audio.ooh(0.8); }
      for (const c of this.cars) drive(c, dt, IDLE, { grip: 1, accel: 1, drag: 0 }, this.time);
      return;
    }
    this.time += dt;
    // inputs and handling
    for (const c of this.cars) {
      c.input = !c.alive ? IDLE : c.brain ? c.brain.control(this, dt) : this.controls(c);
      const wet = A.puddles.length && inPuddle(A, c.x, c.y);
      c.wet = wet;
      drive(c, dt, c.input, wet ? { grip: 0.32, accel: 0.75, drag: 0.5 } : { grip: 1, accel: 1, drag: 0 }, this.time);
      if (c.alive) c.stats.survived = this.time;
    }
    // collisions: car vs car, then the arena, then loose stuff
    const C = this.cars;
    for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
      const r = carVsCar(C[i], C[j]);
      if (r) { if (r.vrel > 0) this.impact(C[i], C[j], r); if (r.depth > this.stats.maxPen) this.stats.maxPen = r.depth; }
    }
    // second pass: pile-ups of three or more cars need another push apart
    for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) { const r = carVsCar(C[i], C[j]); if (r && r.vrel > 0) this.impact(C[i], C[j], r); }
    for (const c of C) carVsArena(c, A, (car, px, py, nx, ny, v, soft) => this.wallHit(car, px, py, nx, ny, v, soft));
    for (const h of this.hay) {
      h.x += h.vx * dt; h.y += h.vy * dt; const k = Math.exp(-2.2 * dt); h.vx *= k; h.vy *= k; h.a += h.w * dt; h.w *= k;
      for (const c of C) { const v = carVsBody(c, h, 0.25); if (v > 140) this.fx.dust(h.x, h.y, 4, 120, 'dust'); }
      bodyVsArena(h, A);
    }
    for (let i = 0; i < this.hay.length; i++) for (let j = i + 1; j < this.hay.length; j++) bodyVsBody(this.hay[i], this.hay[j]);
    for (const d of this.debris) {
      d.x += d.vx * dt; d.y += d.vy * dt; const k = Math.exp(-3 * dt); d.vx *= k; d.vy *= k; d.a += d.w * dt; d.w *= Math.exp(-2 * dt);
      for (const c of C) {
        if (c.speed < 20) continue;
        const v = carVsBody(c, d, 0.2);
        if (v > 160 && Math.random() < 0.25 && c === this.player) this.audio.clank(0.18, this.pan(d.x));
      }
      bodyVsArena(d, A);
    }
    for (const h of this.hay) for (const d of this.debris) bodyVsBody(h, d);
    // sanity counters for the test sim: cars poking through walls or each other
    for (const c of C) { const w = wallDist(A, c.x, c.y); if (w.d < -4) this.stats.outside++; }
    this.pickupsStep(dt);
    this.damageStep(dt);
    this.marks();
    // sudden death: a ring of fire closes in, then the engines cook
    if (this.time >= SD_START && !this.over) {
      if (!this.ring) {
        this.ring = { x: 0, y: 0, r: A.ringR, r0: A.ringR };
        this.pop('SUDDEN DEATH!', this.cam.x, this.cam.y - 80, '#ff4a3a', 54, 2.2);
        this.audio.horn();
      }
      const R = this.ring;
      R.r = lerp(R.r0, RING_MIN, clamp((this.time - SD_START) / SD_LEN, 0, 1));
      for (const c of this.alive()) {
        const dx = c.x - R.x, dy = c.y - R.y, d = Math.hypot(dx, dy);
        if (d > R.r) { c.engine -= 10 * dt; c.vx -= (dx / d) * 260 * dt; c.vy -= (dy / d) * 260 * dt; if (Math.random() < dt * 20) this.fx.fire(c.x, c.y); }
        if (this.time > SD_START + SD_LEN) c.engine -= OVERHEAT * dt;
      }
    }
    // deaths
    for (const c of C) if (c.alive && c.engine <= 0) this.kill(c);
    if (this.spectate && !this.over) { this.watchT -= dt; }
  }

  // two cars meet. r = { px, py, nx (A->B), ny, vrel }
  impact(A, B, r) {
    const v = r.vrel;
    if (v < 40) return;
    const zA = A.zoneAt(r.px, r.py), zB = B.zoneAt(r.px, r.py);
    const base = Math.max(0, v - DMG_MIN) * DMG_K;
    // heavier cars dish out more and take less, softened so the bus is not a god
    const mA = clamp(((2 * B.mass) / (A.mass + B.mass)) ** 0.6, 0.6, 1.4), mB = clamp(((2 * A.mass) / (A.mass + B.mass)) ** 0.6, 0.6, 1.4);
    let dA = base * ZONE_MULT[zA] * mA, dB = base * ZONE_MULT[zB] * mB;
    // arcade assist: you take a bit less and dish out a bit more
    if (A.isPlayer) { dA *= PLAYER_TAKE; dB *= PLAYER_DEAL; }
    if (B.isPlayer) { dB *= PLAYER_TAKE; dA *= PLAYER_DEAL; }
    if (A.spikes > 0 && zA === 0) dB *= 1.7;
    if (B.spikes > 0 && zB === 0) dA *= 1.7;
    A.stun = Math.max(A.stun, clamp(v / 1400, 0, 0.35) * (zA === 0 ? 0.5 : 1));
    B.stun = Math.max(B.stun, clamp(v / 1400, 0, 0.35) * (zB === 0 ? 0.5 : 1));
    // sparks and dust whatever the damage
    this.fx.sparks(r.px, r.py, r.nx * (Math.random() < 0.5 ? 1 : -1), r.ny, Math.min(30, Math.floor(v / 22)), 260 + v * 0.4);
    if (v > 120) this.fx.dust(r.px, r.py, Math.min(10, Math.floor(v / 60)), 90, A.wet ? 'mudd' : 'dust');
    if (base <= 0) { if (v > 60 && (A === this.player || B === this.player)) this.audio.scrape(0.4); return; }
    const aliveA = A.alive, aliveB = B.alive;
    if (aliveA && dB > 0.5) { B.lastHitBy = A; B.lastHitT = this.time; }
    if (aliveB && dA > 0.5) { A.lastHitBy = B; A.lastHitT = this.time; }
    if (aliveA && aliveB) { A.stats.dealt += dB; B.stats.dealt += dA; if (dB > 6) A.stats.hits++; if (dA > 6) B.stats.hits++; }
    else if (aliveA) A.stats.dealt += dB * 0.25; else if (aliveB) B.stats.dealt += dA * 0.25;
    this.spawnLost(A, A.damage(dA, zA, r.px, r.py), r.px, r.py);
    this.spawnLost(B, B.damage(dB, zB, r.px, r.py), r.px, r.py);
    if (A.brain) { if (zA === 0) A.brain.onRam(B); else A.brain.onHit(B); }
    if (B.brain) { if (zB === 0) B.brain.onRam(A); else B.brain.onHit(A); }
    if (dA > 3) A.flash = 0.25; if (dB > 3) B.flash = 0.25;
    const big = dA + dB, mid = { x: r.px, y: r.py };
    const nearV = this.near(mid.x, mid.y);
    this.audio.crunch(clamp(big / 45, 0.08, 1) * nearV, this.pan(mid.x));
    const pl = A === this.player || B === this.player;
    if (pl || (nearV > 0.6 && big > 40)) {
      if (big > 20) this.hitStop = Math.max(this.hitStop, clamp(big / 450, 0.035, 0.1) * (pl ? 1 : 0.6));
      this.shake = Math.max(this.shake, clamp(big * 0.45, 3, 22) * (pl ? 1 : 0.5));
      if (big > 35 && pl) this.flash = 0.18;
    }
    // what kind of hit was it?
    let label = null, col = '#ffffff';
    const att = zA === 0 && zB !== 0 ? A : zB === 0 && zA !== 0 ? B : null;
    const vic = att === A ? B : att === B ? A : null;
    const vz = att === A ? zB : zA;
    const dmgOnVic = att === A ? dB : dA;
    if (att && dmgOnVic > 9) label = vz === 1 ? 'REAR-ENDED!' : 'T-BONE!';
    else if (zA === 0 && zB === 0 && big > 16) label = 'HEAD-ON!';
    else if (big > 28) label = ['SMASH!', 'CRUNCH!', 'WHAM!'][Math.floor(Math.random() * 3)];
    if (label) {
      if (pl) {
        const good = (att === this.player) || (label === 'HEAD-ON!' && dA + dB > 0 && (A === this.player ? dB > dA : dA > dB));
        if (vic === this.player) { label = vz === 1 ? 'REAR-ENDED' : 'T-BONED!'; col = '#ff5a4a'; } else if (good) col = '#ffd23a';
        const num = att === this.player || (good && label === 'HEAD-ON!') ? ` +${Math.round(dmgOnVic || Math.max(dA, dB))}` : '';
        this.callout(label + num, mid.x, mid.y - 30, col, clamp(26 + big * 0.5, 28, 58), 1.2, big);
      } else if (big > 32 && nearV > 0.5) this.callout(label, mid.x, mid.y - 20, 'rgba(255,255,255,0.85)', 20, 0.9, big * 0.5);
    }
  }
  wallHit(c, px, py, nx, ny, v, soft) {
    if (v < 90) return;
    if (v > 160) { this.fx.sparks(px, py, nx, ny, Math.min(14, Math.floor(v / 40)), 200); this.fx.dust(px, py, 3, 80, c.wet ? 'mudd' : 'dust'); }
    if (c === this.player) { this.audio.scrape(clamp(v / 500, 0.1, 0.6)); if (v > 300) this.shake = Math.max(this.shake, clamp(v / 50, 3, 12)); }
    if (v < WALL_MIN || !c.alive) return;
    const z = c.zoneAt(px, py);
    const d = (v - WALL_MIN) * WALL_K * ZONE_MULT[z] * soft * (c.isPlayer ? PLAYER_TAKE : 1);
    this.spawnLost(c, c.damage(d, z, px, py), px, py);
    if (d > 6) this.audio.crunch(clamp(d / 45, 0.05, 0.7) * this.near(px, py), this.pan(px));
    c.stun = Math.max(c.stun, 0.12);
  }
  spawnLost(c, parts, px, py) {
    if (!parts.length) return;
    const top = c.livery.top;
    for (const k of parts) {
      let lx = 0, ly = 0, len = 10, wid = 6, mass = 0.12, kind = 'panel', stripe = null, col = top;
      if (k === 'glass') { this.fx.glass(px, py, 14, c.vx, c.vy); continue; }
      if (k === 'bumperF') { lx = c.L + 2; len = c.W * 2 - 4; wid = 5; kind = 'bumper'; }
      else if (k === 'bumperR') { lx = -c.L - 2; len = c.W * 2 - 4; wid = 5; kind = 'bumper'; }
      else if (k === 'bonnet') { lx = c.L * 0.62; len = c.L * 0.6; wid = c.W * 1.7; mass = 0.2; stripe = c.livery.stripe; this.fx.smoke(px, py, false); }
      else if (k === 'boot') { lx = -c.L * 0.8; len = c.L * 0.38; wid = c.W * 1.6; mass = 0.16; }
      else if (k === 'doorL') { lx = -c.L * 0.1; ly = -c.W - 2; len = c.L * 0.5; wid = 9; mass = 0.15; }
      else if (k === 'doorR') { lx = -c.L * 0.1; ly = c.W + 2; len = c.L * 0.5; wid = 9; mass = 0.15; }
      else if (k === 'hubcap') { lx = (Math.random() < 0.5 ? 1 : -1) * c.L * 0.6; ly = (Math.random() < 0.5 ? 1 : -1) * c.W; len = 8; wid = 8; mass = 0.04; kind = 'hubcap'; }
      const p = toWorld(c, lx, ly);
      const ox = p.x - c.x, oy = p.y - c.y, ol = Math.hypot(ox, oy) || 1;
      const s = 120 + Math.random() * 180;
      // swap the long axis for side panels so they lie along the car
      const a = c.h + (kind === 'bumper' ? Math.PI / 2 : 0) + (Math.random() - 0.5) * 0.6;
      this.debris.push({ x: p.x, y: p.y, vx: c.vx * 0.5 + (ox / ol) * s, vy: c.vy * 0.5 + (oy / ol) * s, a, w: (Math.random() - 0.5) * 14, kind, len, wid, col, stripe, r: kind === 'hubcap' ? 4 : Math.max(5, Math.min(len, wid) * 0.5 + 2), mass });
      if (this.debris.length > 90) this.debris.shift();
      this.audio.clank(clamp(this.near(p.x, p.y), 0.15, 0.8), this.pan(p.x));
      if (c === this.player && kind !== 'hubcap') this.pop(k.startsWith('bumper') ? 'BUMPER GONE' : k === 'bonnet' ? 'BONNET GONE' : k === 'boot' ? 'BOOT GONE' : 'DOOR GONE', c.x, c.y + 40, '#ff9a6a', 16, 1);
    }
  }
  damageStep(dt) {
    for (const c of this.cars) {
      c.flash = Math.max(0, (c.flash || 0) - dt * 2);
      if (c.spikes > 0) c.spikes -= dt;
      const ep = enginePos(c), ef = c.ef;
      if (c.alive) {
        if (ef < FIRE_AT) { c.engine -= BURN * dt; if (Math.random() < dt * 40) this.fx.fire(ep.x, ep.y, c.vx, c.vy); if (Math.random() < dt * 14) this.fx.smoke(ep.x, ep.y, true, c.vx, c.vy); }
        else if (ef < 0.4) { if (Math.random() < dt * 16) this.fx.smoke(ep.x, ep.y, true, c.vx, c.vy); }
        else if (ef < 0.65) { if (Math.random() < dt * 8) this.fx.smoke(ep.x, ep.y, false, c.vx, c.vy); }
        // dust (or mud) off the wheels
        if (c.speed > 220 && Math.random() < dt * (Math.abs(c.slip) > 0.25 ? 30 : 6)) {
          const back = toWorld(c, -c.L * 0.7, (Math.random() < 0.5 ? -1 : 1) * c.W);
          if (c.wet) this.fx.mud(back.x, back.y, 2, -c.vx * 0.3, -c.vy * 0.3); else this.fx.dust(back.x, back.y, 1, 30, 'dust', -c.vx * 0.15, -c.vy * 0.15);
        }
      } else {
        c.deadT += dt;
        const rate = c.deadT < 6 ? 10 : c.deadT < 20 ? 4 : 1.2;
        if (Math.random() < dt * rate) this.fx.smoke(ep.x, ep.y, c.deadT < 20, 0, 0);
        if (c.deadT < 4 && Math.random() < dt * 30) this.fx.fire(ep.x, ep.y);
      }
    }
  }
  kill(c) {
    c.alive = false; c.engine = 0; c.deathTime = this.time;
    const left = this.alive().length;
    c.place = left + 1;
    this.deaths.push(c);
    const killer = c.lastHitBy && this.time - c.lastHitT < 6 && c.lastHitBy !== c ? c.lastHitBy : null;
    if (killer) killer.stats.wrecks++;
    this.feed.unshift({ text: killer ? `${killer.name} wrecked ${c.name}` : `${c.name} is out`, col: c.livery.top, t: 5 });
    if (this.feed.length > 5) this.feed.pop();
    const ep = enginePos(c);
    this.fx.boom(ep.x, ep.y);
    this.gctx.fillStyle = 'rgba(20,14,10,0.35)'; this.gctx.beginPath(); this.gctx.ellipse(c.x, c.y, c.L * 1.3, c.L, c.h, 0, TAU); this.gctx.fill();
    const nv = this.near(c.x, c.y);
    if (nv > 0.3) this.audio.boom(); else this.audio.crunch(0.4 * nv);
    if (killer === this.player) { this.pop('WRECKED!', c.x, c.y - 40, '#ffd23a', 60, 1.6); this.shake = Math.max(this.shake, 16); this.hitStop = Math.max(this.hitStop, 0.12); }
    else if (c === this.player) { this.pop("YOU'RE WRECKED", c.x, c.y - 40, '#ff4a3a', 50, 2); this.shake = Math.max(this.shake, 18); }
    else if (nv > 0.4) this.pop('WRECKED!', c.x, c.y - 30, '#ffffff', 30, 1.2);
    if (c === this.player && left > 1 && !this.attract) {
      this.spectate = true;
      setTimeout(() => { if (this.mode === 'play' && this.spectate && !this.over && !this.results) this.ui.show('out', { place: c.place }); }, 1400 / this.fast);
    }
    if (left <= 1) this.finish(c);
  }
  finish(lastDead) {
    if (this.over) return;
    this.over = true;
    const w = this.alive()[0] || lastDead;
    w.place = 1;
    this.winner = w;
    if (this.attract) { setTimeout(() => { if (this.mode === 'title') this.setupRound(this.arenaIdx, true); }, 3500); return; }
    if (this.results) return;   // you already left for the results screen
    this.slowT = 1.3;
    this.focus = { x: lastDead.x, y: lastDead.y };
    this.endT = 2.6;
    if (w === this.player) { this.audio.horn(); this.pop('WINNER!', w.x, w.y - 60, '#ffd23a', 72, 2.5); }
    else this.audio.cheer();
    this.ui.close();
  }
  roundResults() {
    if (this.results) return this.results;
    const p = this.player;
    const place = p.alive && this.over ? 1 : p.place || this.alive().length + 1;
    const survived = p.deathTime ?? this.time;
    const coins = { place: PAYOUT[place] || 0, damage: Math.round(p.stats.dealt * 0.4), wrecks: p.stats.wrecks * 60, time: Math.round(survived) };
    const total = coins.place + coins.damage + coins.wrecks + coins.time;
    const s = this.save;
    s.coins += total; s.rounds++; s.wrecks += p.stats.wrecks;
    let unlocked = null;
    if (place === 1) { s.wins++; if (this.arenaIdx + 2 > s.unlocked && this.arenaIdx < 2) { s.unlocked = this.arenaIdx + 2; unlocked = ARENAS[this.arenaIdx + 1].name; } }
    this.persist();
    const order = this.cars.slice().sort((a, b) => (a.place || 1) - (b.place || 1));
    this.results = { place, survived, dealt: Math.round(p.stats.dealt), wrecks: p.stats.wrecks, coins, total, unlocked, order, arena: ARENAS[this.arenaIdx].name };
    return this.results;
  }
  showResults() {
    const r = this.roundResults();
    this.spectate = false;
    this.ui.show('results', r);
  }

  pickupsStep(dt) {
    const A = this.arena;
    this.pickupT -= dt;
    if (this.pickupT <= 0 && this.pickups.length < 2 && !this.over) {
      this.pickupT = 9 + Math.random() * 5;
      for (let t = 0; t < 30; t++) {
        const px = (Math.random() - 0.5) * (A.inner.maxX - A.inner.minX) * 0.8, py = (Math.random() - 0.5) * (A.inner.maxY - A.inner.minY) * 0.8;
        if (wallDist(A, px, py).d < 110) continue;
        if (A.avoid.some((o) => Math.hypot(o.x - px, o.y - py) < o.r + 50)) continue;
        if (this.ring && Math.hypot(px - this.ring.x, py - this.ring.y) > this.ring.r - 60) continue;
        const r = Math.random();
        this.pickups.push({ type: r < 0.45 ? 'wrench' : r < 0.8 ? 'nitro' : 'spikes', x: px, y: py, t: 0 });
        break;
      }
    }
    for (const p of this.pickups) {
      p.t += dt;
      for (const c of this.cars) {
        if (!c.alive || Math.hypot(c.x - p.x, c.y - p.y) > c.W + 22) continue;
        p.taken = true;
        let msg;
        if (p.type === 'wrench') msg = `REPAIRED ${c.repair().toUpperCase()}`;
        else if (p.type === 'nitro') { c.boost = 1; msg = 'NITRO FULL'; }
        else { c.spikes = 10; msg = 'SPIKED BUMPER'; }
        if (c === this.player) { this.audio.pickup(); this.pop(msg, c.x, c.y - 40, '#7ae0ff', 26, 1.3); }
        else if (this.near(p.x, p.y) > 0.6) this.pop(`${c.name}: ${p.type === 'wrench' ? 'REPAIR' : p.type === 'nitro' ? 'NITRO' : 'SPIKES'}`, c.x, c.y - 30, 'rgba(160,230,255,0.9)', 16, 1);
        break;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken && p.t < 22);
  }
  // tyre tracks: soft dirt always takes a faint print, slides and wheelspin dig in
  marks() {
    const g = this.gctx;
    for (const c of this.cars) {
      if (c.speed < 25) { c.marks.fill(null); continue; }
      const slide = Math.min(1, Math.abs(c.slip) * 2 + (c.input.hand ? 0.5 : 0));
      const a = 0.03 + slide * 0.15;
      const wheels = [[-c.L * 0.6, -c.W + 2], [-c.L * 0.6, c.W - 2], [c.L * 0.6, -c.W + 2], [c.L * 0.6, c.W - 2]];
      for (let i = 0; i < 4; i++) {
        if (i > 1 && slide < 0.4) { c.marks[i] = null; continue; }
        const w = toWorld(c, wheels[i][0], wheels[i][1]), m = c.marks[i];
        if (!m) { c.marks[i] = w; continue; }
        const d = Math.hypot(w.x - m.x, w.y - m.y);
        if (d < 5) continue;
        if (d < 50) {
          g.strokeStyle = c.wet ? `rgba(40,26,14,${a + 0.1})` : `rgba(66,40,20,${a})`; g.lineWidth = c.M.shape === 'bus' ? 7 : 5.5;
          g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(w.x, w.y); g.stroke();
        }
        c.marks[i] = w;
      }
    }
  }

  // ------------------------------------------------------------ frame
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const rdt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.rt += rdt;
    const running = (this.mode === 'play' && !(this.ui.open && this.ui.blocking)) || this.mode === 'title';
    if (running) {
      if (this.hitStop > 0) this.hitStop -= rdt;
      else {
        if (this.slowT > 0) this.slowT -= rdt;
        const scale = this.fast * (this.slowT > 0 ? 0.28 : 1) * (this.spectateFast ? 2.5 : 1);
        this.acc += rdt * scale;
        let n = 0;
        while (this.acc >= SUB && this.hitStop <= 0 && n < 80 * this.fast) { this.step(SUB); this.acc -= SUB; n++; }
        if (this.hitStop > 0) this.acc = 0;
      }
      this.fx.update(rdt * (this.slowT > 0 ? 0.35 : 1) * this.fast);
      for (const p of this.pops) p.life -= rdt;
      this.pops = this.pops.filter((p) => p.life > 0);
      for (const f of this.feed) f.t -= rdt;
      this.feed = this.feed.filter((f) => f.t > 0);
      this.shake *= Math.pow(0.002, rdt);
      this.flash = Math.max(0, this.flash - rdt);
      this.camera(rdt);
      if (this.endT !== null) { this.endT -= rdt; if (this.endT <= 0) { this.endT = null; this.showResults(); } }
    }
    const p = this.player;
    if (this.mode === 'play' && p && !(this.ui.open && this.ui.blocking)) this.audio.update({ speed: p.speed, throttle: p.input.throttle, boost: p.boostOn, alive: p.alive, slide: p.alive ? Math.min(1, Math.abs(p.slip)) * clamp(p.speed / 400, 0, 1) : 0, heavy: p.mass > 1.6 });
    else this.audio.update(null);
    this.render();
  }
  camera(dt) {
    const cam = this.cam, A = this.arena, base = this.baseZoom();
    let tx, ty, tz;
    if (this.mode === 'title' || !this.player) {
      const fitZ = Math.min(this.W / (A.inner.maxX - A.inner.minX + 260), this.H / (A.inner.maxY - A.inner.minY + 260));
      tx = Math.sin(this.rt * 0.13) * 120; ty = Math.cos(this.rt * 0.1) * 60; tz = Math.max(fitZ * 1.25, base * 0.55);
    } else if (this.focus) {
      tx = this.focus.x; ty = this.focus.y; tz = base * 1.25;
    } else if (this.player.alive) {
      const p = this.player;
      tx = p.x + p.vx * 0.32; ty = p.y + p.vy * 0.32;
      // pull back to keep the nearest rival in shot
      let nd = Infinity; for (const c of this.cars) if (c !== p && c.alive) nd = Math.min(nd, Math.hypot(c.x - p.x, c.y - p.y));
      const keep = Math.min(this.W, this.H) * 0.5 / (Math.min(nd, 700) * 0.55 + 150);
      tz = clamp(Math.min(base, keep), base * 0.72, base);
      if (this.count > 0) tz = base * 1.1;
    } else {
      // spectating: follow whoever is in the thick of it
      if (!this.watchCar || !this.watchCar.alive || this.watchT <= 0) {
        const al = this.alive(); this.watchCar = al.sort((a, b) => b.lastHitT - a.lastHitT)[0]; this.watchT = 4;
      }
      const c = this.watchCar || this.player;
      tx = c.x; ty = c.y; tz = base * 0.8;
    }
    const k = Math.min(1, dt * (this.focus ? 3 : 5));
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
    cam.z = lerp(cam.z, tz, Math.min(1, dt * 2));
  }

  // ------------------------------------------------------------ drawing
  render() {
    const x = this.x, W = this.W, H = this.H, cam = this.cam, A = this.arena;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = A.outside; x.fillRect(0, 0, W, H);
    const sh = this.shake, ox = W / 2 + (Math.random() - 0.5) * sh, oy = H / 2 + (Math.random() - 0.5) * sh;
    this.view = { ox, oy };
    x.save();
    x.translate(ox, oy); x.scale(cam.z, cam.z); x.translate(-cam.x, -cam.y);
    x.imageSmoothingEnabled = true;
    x.drawImage(this.ground, A.minX, A.minY, this.ground.width / GS, this.ground.height / GS);
    const t = this.rt;
    // pickups
    for (const p of this.pickups) this.drawPickup(x, p, t);
    for (const d of this.debris) drawDebris(x, d);
    this.fx.drawUnder(x);
    // hay bales (round), rolling about
    for (const h of this.hay) {
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(h.x + 5, h.y + 7, h.r, 0, TAU); x.fill();
      x.save(); x.translate(h.x, h.y); x.rotate(h.a);
      x.fillStyle = '#c99a3e'; x.fillRect(-h.r, -h.r * 0.8, h.r * 2, h.r * 1.6);
      x.fillStyle = '#e0b85c'; x.fillRect(-h.r + 2, -h.r * 0.8 + 2, h.r * 2 - 4, h.r * 1.6 - 4);
      x.strokeStyle = 'rgba(120,80,20,0.5)'; x.lineWidth = 1; for (let k = -3; k <= 3; k++) { x.beginPath(); x.moveTo(-h.r + 3, k * 4); x.lineTo(h.r - 3, k * 4 + 1); x.stroke(); }
      x.fillStyle = '#e8c46a'; x.beginPath(); x.ellipse(-h.r, 0, 3, h.r * 0.8, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(h.r, 0, 3, h.r * 0.8, 0, 0, TAU); x.fill();
      x.restore();
    }
    // cars: wrecks first, you on top
    const order = this.cars.slice().sort((a, b) => (a.alive - b.alive) || (a.isPlayer - b.isPlayer));
    for (const c of order) drawShadow(x, c);
    for (const c of order) {
      if (c.isPlayer && c.alive) {
        // pulsing marker ring so you never lose your car in the pile-up
        x.strokeStyle = `rgba(255,210,58,${0.5 + Math.sin(t * 6) * 0.25})`; x.lineWidth = 3;
        x.beginPath(); x.arc(c.x, c.y, c.L + 12, 0, TAU); x.stroke();
      }
      drawCar(x, c, t, { flash: c.flash > 0 ? c.flash * 0.6 : 0 });
      if (c.boostOn) { const b = toWorld(c, -c.L - 4, 0); for (let k = 0; k < 2; k++) this.fx.add({ t: 'fire', x: b.x, y: b.y, vx: -Math.cos(c.h) * 240 + (Math.random() - 0.5) * 60, vy: -Math.sin(c.h) * 240 + (Math.random() - 0.5) * 60, life: 0.18, max: 0.3, s: 3, drag: 0.9 }); }
    }
    this.fx.drawOver(x);
    // sudden death ring
    if (this.ring) {
      const R = this.ring;
      x.save();
      x.beginPath(); x.rect(A.minX, A.minY, A.maxX - A.minX, A.maxY - A.minY); x.arc(R.x, R.y, R.r, 0, TAU, true);
      x.fillStyle = 'rgba(200,30,10,0.22)'; x.fill('evenodd');
      x.strokeStyle = `rgba(255,${120 + Math.floor(Math.sin(t * 10) * 50)},40,0.9)`; x.lineWidth = 6; x.setLineDash([22, 14]); x.lineDashOffset = -t * 60;
      x.beginPath(); x.arc(R.x, R.y, R.r, 0, TAU); x.stroke(); x.setLineDash([]);
      x.restore();
      if (this.mode === 'play') for (let k = 0; k < 3; k++) { const a = Math.random() * TAU; this.fx.fire(R.x + Math.cos(a) * R.r, R.y + Math.sin(a) * R.r); }
    }
    // flags on the wall
    for (const f of A.flags) {
      const wv = Math.sin(t * 6 + f.ph) * 3;
      x.fillStyle = f.col; x.beginPath(); x.moveTo(f.x, f.y); x.lineTo(f.x + 22, f.y - 6 + wv); x.lineTo(f.x + 3, f.y - 13); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1; x.stroke();
    }
    // camera flashes in the crowd (more when it gets loud)
    for (let k = 0; k < 3; k++) {
      const s = A.stands[Math.floor(Math.random() * A.stands.length)];
      if (s && Math.random() < 0.5) { x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(s.x + Math.random() * s.w, s.y + Math.random() * s.h, 3, 3); }
    }
    x.restore();
    // floodlit night: tint everything down, then add warm light pools
    x.fillStyle = 'rgba(12,14,38,0.30)'; x.fillRect(0, 0, W, H);
    x.save(); x.translate(ox, oy); x.scale(cam.z, cam.z); x.translate(-cam.x, -cam.y);
    x.globalCompositeOperation = 'lighter';
    for (const l of A.lights) {
      const px = l.x * 0.55, py = l.y * 0.55, r = 900;
      const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,226,170,0.10)'); g.addColorStop(1, 'rgba(255,226,170,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
      const g2 = x.createRadialGradient(l.x, l.y, 0, l.x, l.y, 90); g2.addColorStop(0, 'rgba(255,240,200,0.55)'); g2.addColorStop(1, 'rgba(255,240,200,0)');
      x.fillStyle = g2; x.beginPath(); x.arc(l.x, l.y, 90, 0, TAU); x.fill();
    }
    for (const c of this.cars) {
      if (!c.alive || c.lost.bumperF) continue;
      x.save(); x.translate(c.x, c.y); x.rotate(c.h);
      const hb = x.createLinearGradient(c.L, 0, c.L + 120, 0); hb.addColorStop(0, 'rgba(255,240,200,0.08)'); hb.addColorStop(1, 'rgba(255,240,200,0)');
      x.fillStyle = hb; x.beginPath(); x.moveTo(c.L, -c.W + 3); x.lineTo(c.L + 120, -42); x.lineTo(c.L + 120, 42); x.lineTo(c.L, c.W - 3); x.closePath(); x.fill();
      x.restore();
    }
    x.restore();
    // vignette and hit flash
    const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    if (this.flash > 0) { x.fillStyle = `rgba(255,240,220,${this.flash * 0.6})`; x.fillRect(0, 0, W, H); }
    // names over the rivals, popups
    if (this.mode === 'play') {
      for (const c of this.cars) {
        if (c.isPlayer || !c.alive) continue;
        const s = this.toScreen(c.x, c.y);
        if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) continue;
        this.label(c.name, s.x, s.y - (c.L + 16) * cam.z, 11, c.livery.top === '#5d6b30' ? '#c8d890' : c.livery.top);
      }
      const placed = [], M = 16;
      for (const p of this.pops) {
        const k = p.life / p.max, s = this.toScreen(p.x, p.y);
        let size = p.size * (1 + Math.max(0, k - 0.8) * 1.5);
        x.font = `${size}px Bungee, 'Russo One', sans-serif`;
        let w = x.measureText(p.text).width + size * 0.4;
        if (w > W - 2 * M) { size *= (W - 2 * M) / w; w = W - 2 * M; }
        const hgt = size * 1.15;
        const px = clamp(s.x, M + w / 2, W - M - w / 2);
        let py = clamp(s.y - (1 - k) * 50, M + hgt / 2 + 40, H - M - hgt / 2);
        for (let tries = 0; tries < 12; tries++) {
          const hit = placed.find((r) => Math.abs(r.x - px) < (r.w + w) / 2 && Math.abs(r.y - py) < (r.h + hgt) / 2);
          if (!hit) break;
          py = hit.y - (hit.h + hgt) / 2 - 2;
        }
        if (py < M + hgt / 2) py = M + hgt / 2;
        placed.push({ x: px, y: py, w, h: hgt });
        x.globalAlpha = Math.min(1, k * 2.5);
        this.label(p.text, px, py, size, p.col);
      }
      x.globalAlpha = 1;
      this.hud();
    }
  }
  toScreen(wx, wy) { return { x: this.view.ox + (wx - this.cam.x) * this.cam.z, y: this.view.oy + (wy - this.cam.y) * this.cam.z }; }
  drawPickup(x, p, t) {
    const bob = Math.sin(t * 4 + p.x) * 2, fade = p.t > 18 ? (Math.sin(t * 20) > 0 ? 1 : 0.3) : 1;
    x.save(); x.translate(p.x, p.y + bob); x.globalAlpha = fade;
    const col = p.type === 'wrench' ? '#3ad070' : p.type === 'nitro' ? '#3aa8ff' : '#ff5a3a';
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 34); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 0.45 * fade; x.fillStyle = g; x.beginPath(); x.arc(0, 0, 34, 0, TAU); x.fill(); x.globalAlpha = fade;
    x.fillStyle = '#141414'; x.beginPath(); x.arc(0, 0, 15, 0, TAU); x.fill();
    x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 15, 0, TAU); x.stroke();
    x.rotate(t * 1.5);
    x.fillStyle = '#ffffff'; x.strokeStyle = '#ffffff'; x.lineCap = 'round';
    if (p.type === 'wrench') { x.lineWidth = 3.5; x.beginPath(); x.moveTo(-6, 6); x.lineTo(5, -5); x.stroke(); x.beginPath(); x.arc(6, -6, 4.5, 0, TAU); x.fill(); x.fillStyle = '#141414'; x.fillRect(5, -11, 3, 6); }
    else if (p.type === 'nitro') { x.fillRect(-4, -9, 8, 15); x.fillRect(-2, -12, 4, 3); x.fillStyle = '#3aa8ff'; x.fillRect(-4, -2, 8, 4); }
    else { x.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; x.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); x.lineTo(Math.cos(a + 0.52) * 4, Math.sin(a + 0.52) * 4); } x.closePath(); x.fill(); }
    x.restore();
  }
  label(s, px, py, size, col = '#ffffff', align = 'center', font = 'Bungee') {
    const x = this.x;
    x.font = `${size}px ${font}, "Russo One", sans-serif`;
    x.textAlign = align; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = Math.max(3, size * 0.2); x.strokeStyle = 'rgba(12,10,8,0.92)';
    x.strokeText(s, px, py);
    x.fillStyle = col; x.fillText(s, px, py);
  }
  hud() {
    const x = this.x, W = this.W, H = this.H, p = this.player;
    const sc = this.small ? 0.8 : 1;
    // cars left: number plus a row of liveries (crossed out when wrecked)
    const left = this.alive().length;
    this.label('CARS LEFT', 20, 24 * sc + 4, 12 * sc, '#ffd23a', 'left');
    this.label(`${left}`, 20, 58 * sc + 4, 44 * sc, '#ffffff', 'left');
    this.cars.forEach((c, i) => {
      const cx = 20 + 7 + (i % 8) * 17 * sc, cy = 92 * sc + 6;
      x.fillStyle = c.alive ? c.livery.top : '#333'; x.strokeStyle = c.isPlayer ? '#ffd23a' : '#111'; x.lineWidth = c.isPlayer ? 2.5 : 1.5;
      x.beginPath(); x.roundRect(cx - 6 * sc, cy - 8 * sc, 12 * sc, 16 * sc, 3); x.fill(); x.stroke();
      if (!c.alive) { x.strokeStyle = '#ff4a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 6, cy - 7); x.lineTo(cx + 6, cy + 7); x.moveTo(cx + 6, cy - 7); x.lineTo(cx - 6, cy + 7); x.stroke(); }
    });
    // clock / sudden death
    const tt = this.time, mm = Math.floor(tt / 60), ss = Math.floor(tt % 60);
    this.label(`${mm}:${String(ss).padStart(2, '0')}`, W / 2, 30 * sc + 4, 26 * sc, '#ffffff');
    if (this.ring) this.label('SUDDEN DEATH', W / 2, 60 * sc + 4, 16 * sc, Math.sin(this.rt * 8) > 0 ? '#ff4a3a' : '#ffd23a');
    else if (tt > SD_START - 10 && this.count <= 0) this.label(`SUDDEN DEATH IN ${Math.ceil(SD_START - tt)}`, W / 2, 60 * sc + 4, 13 * sc, '#ffb04a');
    // kill feed
    this.feed.forEach((f, i) => { x.globalAlpha = Math.min(1, f.t); this.label(f.text, W - 20, 82 + i * 22, 12 * sc, '#ffffff', 'right'); });
    x.globalAlpha = 1;
    // damage diagram
    if (p) this.diagram(p, this.isTouch ? 20 : 24, this.isTouch ? 150 * sc : H - 190, this.isTouch ? sc * 0.75 : sc);
    // countdown
    if (this.count > 0) {
      const n = Math.ceil(this.count), k = this.count - Math.floor(this.count);
      if (n <= 3) { x.globalAlpha = Math.min(1, k * 3); this.label(`${n}`, W / 2, H * 0.4, (110 + (1 - k) * 40) * sc, n === 1 ? '#ff6a3a' : '#ffffff'); x.globalAlpha = 1; }
      this.label(this.isTouch ? 'DRAG LEFT SIDE TO STEER  ·  BOOST / REV ON THE RIGHT' : 'WASD DRIVE  ·  SPACE HANDBRAKE  ·  SHIFT BOOST  ·  LAST CAR RUNNING WINS', W / 2, H * 0.4 + 100 * sc, 13 * sc, '#ffd23a');
    }
    if (this.spectate && !this.over && !this.ui.open) this.label(`SPECTATING  ·  ${this.isTouch ? 'TAP' : 'SPACE'} FOR RESULTS`, W / 2, H - 40, 14 * sc, '#ffd23a');
    if (this.isTouch && p && p.alive) this.touchHud();
  }
  diagram(c, x0, y0, sc) {
    const x = this.x, w = 64 * sc, h = 112 * sc;
    x.save(); x.translate(x0, y0);
    x.fillStyle = 'rgba(10,10,12,0.7)'; x.beginPath(); x.roundRect(-8, -26, w + 92 * sc, h + 40, 8); x.fill();
    this.label('DAMAGE', 0, -12, 11 * sc, '#ffd23a', 'left');
    const col = (f) => (f <= 0 ? '#2a2a2e' : f < 0.25 ? '#ff3a2a' : f < 0.5 ? '#ff8a1e' : f < 0.75 ? '#ffd23a' : '#3ad070');
    const zf = [c.zf(0), c.zf(1), c.zf(2), c.zf(3)], g = 4 * sc;
    const cx = w / 2;
    // nose up: front on top
    const blink = (f) => (f < 0.25 && Math.sin(this.rt * 10) > 0 ? 0.55 : 1);
    x.globalAlpha = blink(zf[0]); x.fillStyle = col(zf[0]); x.beginPath(); x.roundRect(g, 0, w - 2 * g, h * 0.2, [10, 10, 2, 2]); x.fill();
    x.globalAlpha = blink(zf[1]); x.fillStyle = col(zf[1]); x.beginPath(); x.roundRect(g, h * 0.8, w - 2 * g, h * 0.2, [2, 2, 8, 8]); x.fill();
    x.globalAlpha = blink(zf[2]); x.fillStyle = col(zf[2]); x.fillRect(0, h * 0.22, w * 0.22, h * 0.56);
    x.globalAlpha = blink(zf[3]); x.fillStyle = col(zf[3]); x.fillRect(w * 0.78, h * 0.22, w * 0.22, h * 0.56);
    x.globalAlpha = 1;
    // engine block
    const ef = c.ef;
    x.fillStyle = ef <= 0 ? '#2a2a2e' : ef < FIRE_AT ? (Math.sin(this.rt * 14) > 0 ? '#ff3a2a' : '#ffb020') : ef < 0.4 ? '#ff8a1e' : ef < 0.65 ? '#ffd23a' : '#3ad070';
    x.beginPath(); x.roundRect(w * 0.27, h * 0.24, w * 0.46, h * 0.3, 4); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(cx - 7 * sc + k * 7 * sc, h * 0.39, 2.2 * sc, 0, TAU); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(w * 0.27, h * 0.58, w * 0.46, h * 0.18);
    // numbers and the boost bar
    const tx = w + 10;
    this.label(`ENGINE ${Math.max(0, Math.round(ef * 100))}%`, tx, h * 0.12, 10 * sc, ef < 0.4 ? '#ff8a5a' : '#ffffff', 'left');
    this.label(ef < FIRE_AT && c.alive ? 'ON FIRE!' : ef < 0.4 ? 'BLACK SMOKE' : ef < 0.65 ? 'SMOKING' : 'RUNNING', tx, h * 0.27, 9 * sc, ef < FIRE_AT ? '#ff4a3a' : '#bbbbbb', 'left');
    this.label('BOOST', tx, h * 0.5, 10 * sc, '#7ad0ff', 'left');
    x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(tx, h * 0.6, 72 * sc, 8);
    x.fillStyle = c.boostOn ? '#ffffff' : c.boost > 0.3 ? '#3aa8ff' : '#2a5a80'; x.fillRect(tx, h * 0.6, 72 * sc * c.boost, 8);
    if (c.spikes > 0) this.label(`SPIKES ${Math.ceil(c.spikes)}`, tx, h * 0.82, 10 * sc, '#ff7a5a', 'left');
    x.restore();
  }
  touchHud() {
    const x = this.x, s = this.stick;
    if (s.on) {
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 3;
      x.beginPath(); x.arc(s.ox, s.oy, 56, 0, TAU); x.fill(); x.stroke();
      const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy), k = m > 56 ? 56 / m : 1;
      x.fillStyle = 'rgba(255,210,58,0.8)'; x.beginPath(); x.arc(s.ox + dx * k, s.oy + dy * k, 24, 0, TAU); x.fill();
    } else this.label('DRAG TO STEER', 90, this.H - 50, 12, 'rgba(255,255,255,0.6)');
    for (const [k, b] of Object.entries(this.touchButtons())) {
      const on = this.btn[k] !== null;
      x.fillStyle = on ? 'rgba(255,210,58,0.85)' : 'rgba(10,10,12,0.55)'; x.strokeStyle = k === 'boost' ? '#3aa8ff' : '#ffffff'; x.lineWidth = 3;
      x.beginPath(); x.arc(b.x, b.y, b.r, 0, TAU); x.fill(); x.stroke();
      this.label(b.label, b.x, b.y, b.r * 0.32, '#ffffff');
    }
  }

  // ------------------------------------------------------------ test hook: run a whole round headless, as fast as possible
  simulate(arena = 0, maxSec = 240, opts = {}) {
    this.autoPlayer = !!opts.auto;
    this.setupRound(arena, false);
    this.mode = 'sim';
    if (opts.idle && this.player) this.player.brain = { control: () => IDLE, onRam() {}, onHit() {} };
    const t0 = performance.now();
    let steps = 0;
    while (!this.over && this.time < maxSec) {
      this.hitStop = 0;
      this.step(SUB); steps++;
      if (this.spectate && opts.stopOnPlayerDeath) break;
    }
    const res = {
      arena: ARENAS[arena].name, over: this.over, time: +this.time.toFixed(1), winner: this.winner ? this.winner.name : null,
      deaths: this.deaths.map((c) => `${c.name}@${c.deathTime.toFixed(0)}`), playerPlace: this.player.place || (this.player.alive ? 1 : null),
      maxPen: +this.stats.maxPen.toFixed(1), outside: this.stats.outside, debris: this.debris.length, ms: Math.round(performance.now() - t0), steps,
    };
    this.mode = 'title';
    this.autoPlayer = params.has('auto');
    return res;
  }
}

// wait (briefly) for the poster font so the baked stand banners use it
Promise.race([document.fonts.load('16px Bungee'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {}).then(() => new Game());
