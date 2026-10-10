// MOWER MADNESS - a ride-on mower against the clock. Cut the lawn to the target,
// draw stripes for multipliers, and dodge the gnomes, sprinklers, dog and cats.
import { LEVELS, MOWERS, DEMO } from './levels.js';
import { Lawn, CELL, inside, rng } from './lawn.js';
import * as D from './render.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Bot } from './bot.js';

const SAVE_KEY = 'pd.mower-madness';
const STEP = 1 / 120;
const TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const GREENS = ['#7cc04a', '#5aa83a', '#9be064', '#4f9e36', '#8acb57', '#3f8a2a'];

// tuning
const BOOST_SPEED = 1.5, BOOST_ACCEL = 1.6, BOOST_BURN = 13, DRIVE_BURN = 0.75, FUEL_CAN = 45, NO_FUEL_SPEED = 0.45;
const GNOME_PENALTY = 3, DOG_PENALTY = 2, CAT_PENALTY = 3, CLOG_TIME = 2.2, FLOWER_POINTS = 100;
const STRIPE_MIN = 150, MAX_CHAIN = 9, PAR_MIN = 0.3, PAR_MAX = 2.2; // parallel = next pass 0.3-2.2 decks over (forgiving: a keyboard U-turn lands 15-110 px over)
const DOG_SPEED = 215, DOG_SIGHT = 300, CAT_WAKE = 80;

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { stars: {}, best: {}, unlocked: 1, mower: 'classic', music: 0.55, sfx: 0.9, muted: false, musicOn: true };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx; this.audio.muted = !!this.save.muted; this.audio.musicOn = this.save.musicOn !== false;
    this.t = 0; this.timeScale = 1; this.acc = 0;
    this.touchUI = matchMedia('(pointer: coarse)').matches;
    this.mode = 'title';
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();
    this.loadLevel(DEMO, 0);
    this.mode = 'title';
    this.ui.show('title');
    window.__G = this;
    if (params.has('level')) this.start(clamp(parseInt(params.get('level'), 10) || 1, 1, LEVELS.length));
    else if (params.has('play')) this.start(this.ui.nextLevel());
    if (params.has('bot')) this.bot = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  get spec() { return MOWERS.find((m) => m.id === this.save.mower) || MOWERS[0]; }
  totalStars() { return Object.values(this.save.stars).reduce((a, st) => a + st.filter(Boolean).length, 0); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr; this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    this.keys = new Set();
    this.stick = null; // {id, bx, by, x, y}
    this.boostHeld = false;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.pointerType === 'touch') this.setTouch(true);
      if (this.mode !== 'play' || this.ui.open) return;
      if (this.stick) return;
      this.stick = { id: e.pointerId, bx: e.clientX, by: e.clientY, x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
    });
    cv.addEventListener('pointermove', (e) => { if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; } });
    const up = (e) => { if (this.stick && e.pointerId === this.stick.id) this.stick = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code.startsWith('Key') || e.code.startsWith('Arrow')) this.setTouch(false);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && !['title', 'result', 'fail'].includes(this.ui.panel)) { this.ui.back(); return; }
        if (this.mode === 'play' && !this.ui.open && this.phase !== 'end') { this.pause(); return; }
      }
      if (this.ui.open) {
        if (e.code === 'Enter' || e.code === 'Space') { if (['result', 'fail', 'title'].includes(this.ui.panel)) this.ui.primary(); }
        if (e.code === 'KeyR' && ['result', 'fail'].includes(this.ui.panel)) this.restart();
        return;
      }
      if (this.mode === 'play' && e.code === 'KeyR') this.restart();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.stick = null; this.boostHeld = false; if (this.mode === 'play' && !this.ui.open && this.phase !== 'end') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play' && !this.ui.open && this.phase !== 'end') this.pause(); });
  }
  setTouch(on) { if (this.touchUI === on) return; this.touchUI = on; this.ui.hud(this.mode === 'play'); }
  pause() { this.audio.play('click'); this.ui.show('pause'); }
  readInput() {
    if (this.bot || this.mode === 'title') {
      if (this.mode !== 'play') return this.botInput();
      if (!this.autopilot) this.autopilot = new Bot(this);
      const [bx, by] = this.autopilot.input();
      const chased = this.dogs.some((d) => d.state === 'chase' && Math.hypot(d.x - this.m.x, d.y - this.m.y) < 140);
      const r = { x: bx, y: by, boost: (chased && this.fuel > 20) || (this.autopilot.phase === 'lane' && this.fuel > 55 && this.clock < this.lv.time * 0.7) };
      // reactive layer: push away from hazards in front of the deck
      const m = this.m, fx = Math.cos(m.a), fy = Math.sin(m.a);
      const hz = [...this.gnomes.filter((g) => g.alive && !g.fly), ...this.toys.filter((t) => !t.gone), ...this.cats.filter((c) => c.state !== 'flee')];
      let ax = 0, ay = 0;
      for (const h of hz) {
        const dx = m.x + fx * 20 - h.x, dy = m.y + fy * 20 - h.y, d = Math.hypot(dx, dy);
        if (d < 46 && d > 0.1 && (h.x - m.x) * fx + (h.y - m.y) * fy > -10) { const k = ((46 - d) / 46) * 1.6; ax += (dx / d) * k; ay += (dy / d) * k; }
      }
      return { x: r.x + ax, y: r.y + ay, boost: r.boost };
    }
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y += 1;
    let boost = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || this.boostHeld;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
    if (this.stick) {
      const dx = this.stick.x - this.stick.bx, dy = this.stick.y - this.stick.by, l = Math.hypot(dx, dy), R = 56;
      if (l > R) { this.stick.bx = this.stick.x - (dx / l) * R; this.stick.by = this.stick.y - (dy / l) * R; }
      if (l > 6) { const s = Math.min(1, l / R); x = (dx / l) * s; y = (dy / l) * s; }
    }
    if (this.forceInput) ({ x, y, boost } = this.forceInput);
    return { x, y, boost };
  }

  // ------------------------------------------------------------------ levels
  loadLevel(lv, n) {
    this.lv = lv; this.n = n;
    this.lawn = new Lawn(lv);
    this.st = D.buildStatic(lv);
    this.tracks = document.createElement('canvas'); this.tracks.width = lv.w; this.tracks.height = lv.h;
    this.tx = this.tracks.getContext('2d');
    const sp = this.spec;
    const [sx, sy, sa] = lv.start;
    this.m = { x: sx, y: sy, a: (sa * Math.PI) / 180, vx: 0, vy: 0, sx: 1, sy: 1, svx: 0, svy: 0, roll: 0, blades: true, clog: 0, flash: 0, hatX: 0, hatY: 0, hvx: 0, hvy: 0, steerVis: 0, r: sp.monster ? 22 : 19, mud: 0, lastStamp: null, boosting: false, speed: 0 };
    this.solids = [];
    const add = (arr, kind) => { for (const s of arr || []) this.solids.push({ ...s, kind }); };
    add(lv.water, 'water'); add(lv.hedges, 'hedge'); add(lv.walls, 'wall'); add(lv.houses, 'house'); add(lv.sheds, 'wood'); add(lv.tents, 'tent');
    add(lv.kennels, 'wood'); add(lv.towers, 'wall'); add(lv.keep, 'wall'); add(lv.fountains, 'water'); add(lv.goals, 'goal'); add(lv.bushes, 'hedge');
    this.trees = (lv.trees || []).map((d) => ({ d }));
    for (const [x, y] of lv.trees || []) this.solids.push({ t: 'c', x, y, r: 13, kind: 'wood' });
    if (lv.flag) this.solids.push({ t: 'c', x: lv.flag[0], y: lv.flag[1], r: 5, kind: 'pole' });
    this.slopes = (lv.slopes || []).map((s) => ({ ...s, gx: Math.cos((s.dir * Math.PI) / 180), gy: Math.sin((s.dir * Math.PI) / 180) }));
    const r = rng(lv.w + lv.h * 3 + (n || 0));
    this.gnomes = (lv.gnomes || []).map(([x, y], i) => ({ x, y, z: 0, c: i, alive: true, fly: false, wob: 0, shaved: 0 }));
    this.toys = (lv.toys || []).map(([x, y, kind]) => ({ x, y, kind, gone: false, rot: r() * TAU }));
    this.fuels = (lv.fuel || []).map(([x, y]) => ({ x, y, gone: false }));
    this.sprinklers = (lv.sprinklers || []).map(([x, y], i) => {
      const blobs = [];
      for (let k = 0; k < 9; k++) { const a = r() * TAU, d = r() * 0.55; blobs.push([Math.cos(a) * d, Math.sin(a) * d, 0.28 + r() * 0.3]); }
      return { x, y, t: 2.5 + i * 1.7, phase: 'idle', up: 0, ang: r() * TAU, base: r() * TAU, mud: { x, y, wet: 0, size: 40, blobs }, splashT: 0 };
    });
    this.dogs = (lv.dogs || []).map(([x, y]) => ({ x, y, hx: x, hy: y, a: Math.PI, state: 'idle', t: 0, bark: 0, wx: x, wy: y, corgi: lv.name.includes('Royal') }));
    const CATS = [['#f29a3a', '#c86a1a'], ['#8a8a92', '#55555c'], ['#3a3438', '#222'], ['#f2efe8', '#c9c2b2']];
    this.cats = (lv.cats || []).map(([x, y], i) => ({ x, y, state: 'sleep', t: 0, a: 0, col: CATS[i % 4][0], stripe: CATS[i % 4][1], tx: x, ty: y, z: 0, hitT: 0 }));
    this.flowers = [];
    for (const b of lv.beds || []) {
      const bx = b.t === 'r' ? b.x : b.x - b.r, by = b.t === 'r' ? b.y : b.y - b.r, bw = b.t === 'r' ? b.w : b.r * 2, bh = b.t === 'r' ? b.h : b.r * 2;
      for (let y = by + 8; y < by + bh - 4; y += 13) for (let x = bx + 8; x < bx + bw - 4; x += 13) {
        const fx = x + (r() - 0.5) * 6, fy = y + (r() - 0.5) * 6;
        if (fx < 4 || fy < 4 || fx > lv.w - 4 || fy > lv.h - 4) continue;
        if (!inside(b, fx, fy, -5)) continue;
        this.flowers.push({ x: fx, y: fy, c: (r() * 6) | 0, alive: true, ph: r() * TAU });
      }
    }
    this.parts = []; this.pops = []; this.banners = [];
    this.score = 0; this.shownScore = 0; this.scorePop = 0; this.mult = 1; this.chain = 0;
    this.run = null; this.lastRun = null; this.runLost = 0; this.runEndT = 0;
    this.spinAcc = 0; this.spinT = 0; this.donutCd = 0;
    this.fuel = 100; this.flowersHit = 0; this.gnomesHit = 0; this.flowerPopT = 0; this.flowerPopN = 0;
    this.clock = lv.time; this.phase = 'count'; this.countT = 1.6; this.endT = 0; this.won = false;
    this.hitstop = 0; this.shake = 0; this.timeFlash = 0; this.timeFlashText = '';
    this.stripePct = 0; this.stripeT = 0; this.hint = null; this.hintOn = false; this.hintT = 0;
    this.cutting = 0; this.mudMsgT = 0; this.trackT = 0; this.lowFuelWarned = false; this.tickT = 0;
    this.scoreParts = { mow: 0, stripes: 0, tricks: 0, penalties: 0 };
    // bot / attract helpers
    this.buildBlock();
    this.botPath = null; this.botT = 0; this.botStuck = { x: sx, y: sy, t: 0, esc: 0, ex: 0, ey: 0 }; this.botAvoid = new Uint8Array(this.lawn.cw * this.lawn.ch);
    this.lanes = null; this.botLane = null; this.autopilot = null;
    const sp2 = this.spec, vw = this.viewSize();
    this.cam = { x: sx, y: sy, z: vw.z };
    this.snapCam();
  }
  buildBlock() {
    const L = this.lawn, N = L.cw * L.ch;
    this.block = new Uint8Array(N); this.hard = new Uint8Array(N); this.near = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const [x, y] = L.cellXY(k);
      if (x < 12 || y < 12 || x > L.w - 12 || y > L.h - 12) { this.block[k] = 1; this.hard[k] = 1; this.near[k] = 1; continue; }
      if (this.solids.some((s) => inside(s, x, y, 12))) { this.block[k] = 1; this.hard[k] = 1; this.near[k] = 1; continue; }
      if (L.kind[k] === 2) { this.block[k] = 1; this.near[k] = 1; continue; }
      if ((this.lv.beds || []).some((s) => inside(s, x, y, 26))) this.block[k] = 1;
      if ((this.lv.beds || []).some((s) => inside(s, x, y, 10))) this.near[k] = 1;
      const hz = [...(this.lv.gnomes || []), ...(this.lv.toys || []), ...(this.lv.cats || [])];
      if (hz.some(([gx, gy]) => Math.hypot(gx - x, gy - y) < 42)) this.near[k] = 1;
      if ([...(this.lv.gnomes || []), ...(this.lv.toys || []), ...(this.lv.cats || [])].some(([gx, gy]) => Math.hypot(gx - x, gy - y) < 50)) this.block[k] = 1;
    }
  }
  start(n) {
    this.mode = 'play';
    this.loadLevel(LEVELS[n - 1], n);
    this.ui.close(); this.ui.hud(true);
    this.audio.unlock();
    this.banner('READY?', 0.8, '#fff8e2', 64);
    this.audio.play('count', 1);
    this.stick = null;
  }
  restart() { if (this.mode === 'play' && this.n) this.start(this.n); }
  toTitle() { this.mode = 'title'; this.bot = params.has('bot'); this.loadLevel(DEMO, 0); this.ui.hud(false); this.ui.show('title'); }

  // ------------------------------------------------------------------ loop
  loop(ts) {
    let dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    this.audio.update(dt, this.mode === 'play' && this.phase === 'go');
    const paused = this.ui.open && this.mode === 'play' && !['result', 'fail'].includes(this.ui.panel) && this.phase !== 'end';
    if (!paused) {
      this.acc += dt * this.timeScale * (this.phase === 'end' && this.endT < 0.7 && this.won ? 0.35 : 1);
      let steps = 0;
      while (this.acc >= STEP && steps < 40 * Math.max(1, this.timeScale)) { this.acc -= STEP; steps++; this.update(STEP); }
      if (this.acc > STEP * 4) this.acc = 0;
    }
    const playingSound = this.mode === 'play' && this.phase === 'go' && !paused;
    const m = this.m;
    this.audio.engine(playingSound || (this.mode === 'play' && this.phase === 'count' && !paused), m.speed / this.spec.speed, this.cutting, m.boosting ? 1 : 0, m.clog > 0);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.t += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.timeFlash = Math.max(0, this.timeFlash - dt);
    this.scorePop = Math.max(0, this.scorePop - dt * 4);
    this.shownScore += (this.score - this.shownScore) * Math.min(1, dt * 10);
    if (this.mode === 'play') {
      if (this.phase === 'count') {
        const before = this.countT;
        this.countT -= dt;
        if (before > 0.8 && this.countT <= 0.8) { this.banner('SET...', 0.7, '#fff8e2', 64); this.audio.play('count', 1); }
        if (this.countT <= 0) { this.phase = 'go'; this.banner('MOW!', 0.9, '#ffd23f', 92); this.audio.play('count', 2); if (this.lv.tip) this.banner(this.lv.tip, 3.6, '#fff8e2', 22, 0.78); }
      } else if (this.phase === 'go') {
        this.clock -= dt;
        if (this.clock < 10 && Math.floor(this.clock) !== Math.floor(this.clock + dt) && this.clock > 0) this.audio.play('tick');
        if (this.lawn.pct >= this.lv.target) this.finish(true);
        else if (this.clock <= 0 && !this.infinite) { this.clock = 0; this.finish(false); }
      } else if (this.phase === 'end') {
        this.endT += dt;
        if (this.endT > 1.5 && !this.resultShown) { this.resultShown = true; this.showResult(); }
      }
    }
    const canDrive = this.mode === 'title' || this.phase === 'go';
    this.physics(dt, canDrive);
    this.hazards(dt);
    this.effects(dt);
    // stripes % (cheap but not every step)
    this.stripeT -= dt;
    if (this.stripeT <= 0) { this.stripeT = 0.4; this.stripePct = this.lawn.stripes(); }
    // hint arrow when nearly done
    this.hintT -= dt;
    this.hintOn = this.mode === 'play' && this.phase === 'go' && this.lawn.pct >= this.lv.target - 0.1;
    if (this.hintOn && this.hintT <= 0) {
      this.hintT = 0.4;
      const p = this.lawn.nearestUncut(this.m.x, this.m.y, this.block);
      this.hint = p ? this.lawn.cellXY(p[p.length - 1]) : null;
    }
    if (this.mode === 'title' && this.lawn.cutCount > this.lawn.grass * 0.97) this.loadLevel(DEMO, 0);
    this.updateCam(dt);
  }

  finish(won) {
    this.phase = 'end'; this.won = won; this.endT = 0; this.resultShown = false;
    this.endRun();
    this.stripePct = this.lawn.stripes();
    if (won) {
      this.banner('LAWN DONE!', 1.6, '#ffd23f', 84);
      this.audio.play('win'); this.shake = 6;
      for (let i = 0; i < 120; i++) { const a = rand(0, TAU), s = rand(80, 420); this.parts.push({ x: this.m.x, y: this.m.y, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(150, 420), life: rand(1, 2), max: 2, col: ['#ffd23f', '#ff5d8f', '#4fb3e8', '#fff8e2', '#9be064'][i % 5], size: rand(3, 6), kind: 'confetti', rot: rand(0, 6), vr: rand(-12, 12) }); }
    } else { this.banner("TIME'S UP!", 1.5, '#ff6a5a', 80); this.audio.play('lose'); }
  }
  showResult() {
    const lv = this.lv, n = this.n;
    if (!this.won) { this.ui.show('fail', { n, pct: this.lawn.pct, target: lv.target }); return; }
    const timeLeft = this.clock;
    const stars = [timeLeft >= lv.starLeft, this.stripePct >= lv.stripeT, this.flowersHit === 0];
    const timeBonus = Math.round(timeLeft * 10) * 10, stripeBonus = Math.round(this.stripePct * 100) * 30;
    const total = Math.max(0, Math.round(this.score) + timeBonus + stripeBonus);
    const before = this.totalStars();
    const old = this.save.stars[n] || [false, false, false];
    this.save.stars[n] = old.map((v, i) => v || stars[i]);
    const prevBest = this.save.best[n] || 0, newBest = total > prevBest;
    if (newBest) this.save.best[n] = total;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, n + 1));
    const after = this.totalStars();
    const newMowers = MOWERS.filter((mw) => mw.need > before && mw.need <= after);
    this.persist();
    this.ui.show('result', { n, stars, timeLeft, stripe: this.stripePct, flowers: this.flowersHit, mow: Math.round(this.score), timeBonus, stripeBonus, total, best: Math.max(prevBest, total), newBest, newMowers, lv });
  }

  // ------------------------------------------------------------------ the mower
  physics(dt, canDrive) {
    const m = this.m, sp = this.spec, L = this.lawn;
    const inp = canDrive ? this.readInput() : { x: 0, y: 0, boost: false };
    let maxS = sp.speed, acc = sp.accel, grip = sp.grip;
    const wantBoost = inp.boost && this.fuel > 0 && this.mode === 'play';
    if (wantBoost && !m.boosting) { this.audio.play('boost'); m.sx = 1.18; m.sy = 0.88; }
    m.boosting = wantBoost;
    if (wantBoost) { maxS *= BOOST_SPEED; acc *= BOOST_ACCEL; grip *= 0.85; }
    if (this.fuel <= 0 && this.mode === 'play') maxS *= NO_FUEL_SPEED;
    const ground = L.kindAt(m.x, m.y);
    if (this.lv.sand && this.lv.sand.some((s) => inside(s, m.x, m.y))) maxS *= sp.monster ? 0.8 : 0.55;
    if (ground === 2) maxS *= 0.8;
    // mud
    let inMud = false;
    for (const s of this.sprinklers) { const md = s.mud; if (md.wet > 0.25 && Math.hypot(m.x - md.x, m.y - md.y) < md.size * 0.95) inMud = true; }
    if (inMud) { grip = sp.monster ? 3 : 1.3; maxS *= 0.85; m.mud = 2.5; }
    if (m.clog > 0) maxS *= 0.55;
    const mag = Math.hypot(inp.x, inp.y);
    let throttle = 0, diff = 0;
    const a0 = m.a;
    if (mag > 0.15) {
      const ta = Math.atan2(inp.y, inp.x);
      diff = wrap(ta - m.a);
      const turn = sp.turn * (inMud ? 0.75 : 1);
      m.a = wrap(m.a + clamp(diff, -turn * dt, turn * dt));
      throttle = mag * Math.max(0.12, Math.cos(diff));
    }
    m.steerVis += (clamp(diff, -1, 1) - m.steerVis) * Math.min(1, dt * 10);
    const fx = Math.cos(m.a), fy = Math.sin(m.a);
    let vf = m.vx * fx + m.vy * fy, vl = -m.vx * fy + m.vy * fx;
    vf += acc * throttle * dt;
    if (throttle === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 420 * dt);
    else if (Math.abs(diff) > 1.1) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 760 * (Math.abs(diff) - 1.1) * dt); // brake into tight turns
    if (vf > maxS) vf -= (vf - maxS) * Math.min(1, 5 * dt);
    if (vf < -maxS * 0.4) vf = -maxS * 0.4;
    vl *= Math.exp(-grip * dt);
    m.vx = fx * vf - fy * vl; m.vy = fy * vf + fx * vl;
    if (!sp.monster) for (const s of this.slopes) if (m.x > s.x && m.x < s.x + s.w && m.y > s.y && m.y < s.y + s.h) { m.vx += s.gx * s.s * dt; m.vy += s.gy * s.s * dt; }
    m.x += m.vx * dt; m.y += m.vy * dt;
    this.collide(m, true);
    m.speed = Math.hypot(m.vx, m.vy);
    m.roll += vf * dt * 0.5;
    // squash spring, hat wobble
    m.svx += ((1 - m.sx) * 220 - m.svx * 14) * dt; m.sx += m.svx * dt;
    m.svy += ((1 - m.sy) * 220 - m.svy * 14) * dt; m.sy += m.svy * dt;
    const accF = (vf - (m.prevVf || 0)) / dt; m.prevVf = vf;
    m.hvx += ((-clamp(accF, -900, 900) * 0.004 - m.hatX) * 120 - m.hvx * 9) * dt; m.hatX += m.hvx * dt;
    m.hvy += ((clamp(vl, -200, 200) * -0.02 + m.steerVis * -1.5 - m.hatY) * 120 - m.hvy * 9) * dt; m.hatY += m.hvy * dt;
    m.flash = Math.max(0, m.flash - dt);
    // fuel
    if (this.mode === 'play' && this.phase === 'go') {
      const before = this.fuel;
      this.fuel = Math.max(0, this.fuel - (throttle * DRIVE_BURN + (wantBoost ? BOOST_BURN : 0)) * sp.fuel * dt);
      if (before > 0 && this.fuel <= 0) { this.audio.play('empty'); this.popup('OUT OF FUEL!', m.x, m.y - 40, 26, '#ff6a5a'); }
      if (before > 20 && this.fuel <= 20) this.popup('LOW FUEL', m.x, m.y - 40, 22, '#ff9a3c');
    }
    // spin tracking for DONUTS
    const dA = wrap(m.a - a0);
    this.donutCd -= dt;
    if (Math.abs(dA) > 0.0005 && (m.speed > 40 || mag > 0.15)) {
      if (Math.sign(dA) !== Math.sign(this.spinAcc) && Math.abs(this.spinAcc) > 0.3) { this.spinAcc = 0; this.spinT = 0; }
      this.spinAcc += dA; this.spinT += dt;
      if (this.spinT > 2.6) { this.spinAcc = 0; this.spinT = 0; }
      if (Math.abs(this.spinAcc) >= TAU && this.mode === 'play') {
        this.spinAcc = 0; this.spinT = 0;
        if (this.donutCd <= 0) { this.donutCd = 3; this.addScore(300, 'tricks'); this.popup('DONUT! +300', m.x, m.y - 44, 30, '#ff5d8f'); this.audio.play('donut'); this.shake = 4; m.sx = 0.85; m.sy = 1.15; }
      }
    } else if (mag < 0.15) { this.spinT += dt; if (this.spinT > 0.6) { this.spinAcc = 0; this.spinT = 0; } }
    // mowing
    this.cutting *= Math.exp(-dt * 6);
    m.blades = canDrive && m.clog <= 0;
    if (m.clog > 0) {
      m.clog -= dt;
      if (Math.random() < dt * 14) this.parts.push({ x: m.x - fx * 20, y: m.y - fy * 20, z: 12, vx: rand(-20, 20), vy: rand(-20, 20), vz: 40, life: 0.8, max: 0.8, col: '#6b6b6b', size: rand(5, 9), kind: 'smoke' });
      if (m.clog <= 0) { this.audio.play('unclog'); this.popup('UNCLOGGED', m.x, m.y - 40, 18, '#fff8e2'); }
    }
    if (m.blades) this.mow(m, sp, fx, fy, diff);
    // muddy tyre tracks
    if (m.mud > 0) {
      m.mud -= dt;
      if (m.speed > 30 && m.mud > 0.5) {
        const tx = this.tx, rx = -fy, ry = fx, wy = sp.monster ? 22 : 15;
        tx.fillStyle = `rgba(90,60,30,${0.09 * Math.min(1, m.mud - 0.5)})`;
        for (const s of [-1, 1]) tx.fillRect(m.x - fx * 18 + rx * s * wy - 3, m.y - fy * 18 + ry * s * wy - 3, 6, 6);
        if (Math.random() < dt * 20) this.parts.push({ x: m.x - fx * 22 + rand(-10, 10), y: m.y - fy * 22 + rand(-10, 10), z: 2, vx: -m.vx * 0.3 + rand(-30, 30), vy: -m.vy * 0.3 + rand(-30, 30), vz: rand(60, 140), life: 0.6, max: 0.6, col: '#6b4a2a', size: rand(2, 4), kind: 'bit' });
      }
    }
    // exhaust puffs
    if (canDrive && Math.random() < dt * (m.boosting ? 30 : 6)) this.parts.push({ x: m.x - fx * 30 - fy * -12, y: m.y - fy * 30 + fx * -12, z: 8, vx: -fx * 40 + rand(-10, 10), vy: -fy * 40 + rand(-10, 10), vz: 20, life: 0.7, max: 0.7, col: m.boosting ? '#e8e2d2' : '#b8b2a6', size: rand(3, 6), kind: 'smoke' });
  }
  mow(m, sp, fx, fy, diff) {
    const L = this.lawn, hw = sp.deck / 2;
    const cx = m.x + fx * 16, cy = m.y + fy * 16;
    const ls = m.lastStamp;
    if (ls && Math.hypot(cx - ls.x, cy - ls.y) < 1.6 && Math.abs(wrap(m.a - ls.a)) < 0.03) { this.trackRun(m, 0, false, 0); return; } // parked: still let a finished run end
    m.lastStamp = { x: cx, y: cy, a: m.a };
    const q = ((Math.round(m.a / (Math.PI / 2)) % 4) + 4) % 4;
    const off = Math.abs(wrap(m.a - q * (Math.PI / 2)));
    const straight = off < 0.2 && Math.abs(diff) < 0.25 && m.speed > 60;
    const fresh = L.mow(cx, cy, fx, fy, 13, hw, q, straight);
    if (this.mode === 'play' && this.phase === 'go') {
      // flowers under the deck
      for (const f of this.flowers) {
        if (!f.alive) continue;
        const dx = f.x - cx, dy = f.y - cy;
        if (Math.abs(dx * fx + dy * fy) < 15 && Math.abs(-dx * fy + dy * fx) < hw + 2) this.killFlower(f);
      }
    } else if (this.mode === 'title') {
      for (const f of this.flowers) if (f.alive && Math.hypot(f.x - cx, f.y - cy) < hw) f.alive = false;
    }
    if (fresh > 0) {
      this.cutting = Math.min(1, this.cutting + fresh * 0.04);
      if (this.mode === 'play') { this.addScore(fresh * 2 * this.mult, 'mow', true); }
      if (this.run) this.run.fresh += fresh;
      // clippings out of the side chute
      const rx = -fy, ry = fx, n = Math.min(4, Math.ceil(fresh * 0.35));
      for (let i = 0; i < n; i++) {
        if (this.parts.length > 1400) break;
        const s = rand(110, 260);
        this.parts.push({ x: cx + rx * (hw + 2) + rand(-5, 5), y: cy + ry * (hw + 2) + rand(-5, 5), z: 6, vx: rx * s + fx * m.speed * 0.4 + rand(-30, 30), vy: ry * s + fy * m.speed * 0.4 + rand(-30, 30), vz: rand(60, 200), life: rand(0.6, 1.3), max: 1.3, col: GREENS[(Math.random() * GREENS.length) | 0], size: rand(2, 3.6), kind: 'clip', rot: rand(0, 6), vr: rand(-15, 15) });
      }
    }
    this.trackRun(m, q, straight, fresh);
  }
  // straight runs -> parallel stripes -> chain multiplier
  trackRun(m, q, straight, fresh) {
    if (this.mode !== 'play' || this.phase !== 'go') return;
    const along = q % 2 === 0 ? m.x : m.y, lat = q % 2 === 0 ? m.y : m.x;
    if (straight) {
      this.runLost = 0;
      if (this.run && this.run.dir === q) { const r = this.run; r.min = Math.min(r.min, along); r.max = Math.max(r.max, along); r.lat += lat; r.n++; }
      else { this.endRun(); this.run = { dir: q, min: along, max: along, lat, n: 1, fresh: 0 }; }
    } else if (this.run) {
      this.runLost += STEP;
      if (this.runLost > 0.2) this.endRun();
    }
  }
  endRun() {
    const r = this.run; this.run = null;
    if (!r || this.mode !== 'play') return;
    const len = r.max - r.min, lat = r.lat / r.n, deck = this.spec.deck;
    if (len < STRIPE_MIN || r.fresh < (len / CELL) * (deck / CELL) * 0.22) return;
    const lr = this.lastRun;
    let parallel = false;
    if (lr && lr.dir % 2 === r.dir % 2 && this.t - lr.t < 9) {
      const d = Math.abs(lat - lr.lat), ov = Math.min(r.max, lr.max) - Math.max(r.min, lr.min);
      parallel = d > deck * PAR_MIN && d < deck * PAR_MAX && ov > 0.4 * Math.min(len, lr.max - lr.min);
    }
    this.chain = parallel ? Math.min(MAX_CHAIN, this.chain + 1) : 1;
    this.mult = 1 + 0.5 * (this.chain - 1);
    const bonus = Math.round(len * 0.5 * this.chain / 10) * 10;
    this.addScore(bonus, 'stripes');
    const m = this.m;
    if (this.chain >= 2) { this.popup(`STRIPE x${this.chain}!  +${bonus}`, m.x, m.y - 46, 24 + Math.min(10, this.chain * 2), '#ffd23f'); this.audio.play('stripe', 1 + this.chain * 0.1); }
    else { this.popup(`STRAIGHT! +${bonus}`, m.x, m.y - 46, 20, '#fff8e2'); this.audio.play('stripe', 0.85); }
    if (len >= 520) { this.addScore(200, 'stripes'); this.popup('LONG STRIPE +200', m.x, m.y - 76, 20, '#9be064'); }
    this.lastRun = { dir: r.dir, min: r.min, max: r.max, lat, t: this.t };
  }
  breakChain() { if (this.chain > 1) this.popup('CHAIN BROKEN', this.m.x, this.m.y + 40, 16, '#ffb0a0'); this.chain = 0; this.mult = 1; this.lastRun = null; this.run = null; }
  addScore(v, part, quiet) { this.score += v; this.scoreParts[part] = (this.scoreParts[part] || 0) + v; if (!quiet) this.scorePop = 1; }
  penalty(sec, text) {
    if (this.mode !== 'play' || this.phase !== 'go') return;
    this.clock = this.infinite ? this.clock - sec : Math.max(0, this.clock - sec);
    this.timeFlash = 1; this.timeFlashText = `-${sec}s`;
    if (text) this.popup(text, this.m.x, this.m.y - 50, 28, '#ff6a5a');
    this.breakChain();
  }
  killFlower(f) {
    f.alive = false;
    this.flowersHit++;
    this.addScore(-FLOWER_POINTS, 'penalties', true);
    for (let i = 0; i < 6; i++) this.parts.push({ x: f.x, y: f.y, z: 4, vx: rand(-90, 90), vy: rand(-90, 90), vz: rand(80, 200), life: rand(0.6, 1.2), max: 1.2, col: ['#ff5d8f', '#ffd23f', '#ff8c42', '#b38cff', '#ffffff', '#e8453c'][f.c], size: rand(2.5, 4), kind: 'clip', rot: 0, vr: rand(-10, 10) });
    if (this.t - this.flowerPopT > 0.5) { this.flowerPopT = this.t; this.popup('OOPS! FLOWERS -100', f.x, f.y - 30, 22, '#ff9ab8'); this.audio.play('flower'); if (this.chain > 1) this.breakChain(); this.shake = Math.max(this.shake, 3); }
  }
  collide(o, isMower) {
    const r = o.r, lv = this.lv;
    let impact = 0, kind = 'fence';
    const push = (nx, ny, d) => {
      o.x += nx * d; o.y += ny * d;
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) { o.vx -= 1.35 * vn * nx; o.vy -= 1.35 * vn * ny; impact = Math.max(impact, -vn); }
    };
    if (o.x < r) push(1, 0, r - o.x); if (o.y < r) push(0, 1, r - o.y);
    if (o.x > lv.w - r) push(-1, 0, o.x - (lv.w - r)); if (o.y > lv.h - r) push(0, -1, o.y - (lv.h - r));
    for (const s of this.solids) {
      if (s.t === 'r') {
        const cx = clamp(o.x, s.x, s.x + s.w), cy = clamp(o.y, s.y, s.y + s.h);
        let dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d < 0.001) { // centre inside: push out the shortest way
          const l = o.x - s.x, rt = s.x + s.w - o.x, t = o.y - s.y, b = s.y + s.h - o.y, mn = Math.min(l, rt, t, b);
          if (mn === l) push(-1, 0, l + r); else if (mn === rt) push(1, 0, rt + r); else if (mn === t) push(0, -1, t + r); else push(0, 1, b + r);
        } else push(dx / d, dy / d, r - d);
        kind = s.kind;
      } else {
        const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy);
        if (d >= r + s.r || d < 0.001) continue;
        push(dx / d, dy / d, r + s.r - d); kind = s.kind;
      }
    }
    if (isMower && impact > 70 && this.mode === 'play') {
      const m = this.m;
      this.audio.play(kind === 'water' ? 'splash' : 'bonk', kind === 'hedge' ? 0.7 : 1);
      this.shake = Math.max(this.shake, Math.min(9, impact / 35));
      m.sx = 0.82; m.sy = 1.16;
      if (kind === 'hedge') for (let i = 0; i < 8; i++) this.parts.push({ x: m.x + Math.cos(m.a) * 26, y: m.y + Math.sin(m.a) * 26, z: 14, vx: rand(-80, 80), vy: rand(-80, 80), vz: rand(50, 160), life: 0.9, max: 0.9, col: '#3f8a36', size: rand(2.5, 4.5), kind: 'clip', rot: 0, vr: 8 });
      if (kind === 'water') for (let i = 0; i < 12; i++) this.parts.push({ x: m.x + Math.cos(m.a) * 22, y: m.y + Math.sin(m.a) * 22, z: 4, vx: rand(-90, 90), vy: rand(-90, 90), vz: rand(100, 240), life: 0.7, max: 0.7, col: '#bfe6f8', size: rand(2, 4), kind: 'drop' });
    }
    return impact;
  }

  // ------------------------------------------------------------------ hazards
  hazards(dt) {
    const m = this.m, sp = this.spec, live = this.mode === 'play' && this.phase === 'go';
    const fx = Math.cos(m.a), fy = Math.sin(m.a), dcx = m.x + fx * 16, dcy = m.y + fy * 16, hw = sp.deck / 2;
    // gnomes
    for (const g of this.gnomes) {
      if (!g.alive) continue;
      g.wob = Math.max(0, g.wob - dt); g.shaved = Math.max(0, g.shaved - dt);
      if (g.fly) {
        g.x += g.vx * dt; g.y += g.vy * dt; g.vz -= 1100 * dt; g.z += g.vz * dt; g.spin += g.sv * dt;
        if (g.z <= 0) {
          g.alive = false;
          const wet = this.solids.some((s) => s.kind === 'water' && inside(s, g.x, g.y));
          this.audio.play(wet ? 'splash' : 'smash');
          for (let i = 0; i < (wet ? 16 : 18); i++) this.parts.push({ x: g.x, y: g.y, z: 3, vx: rand(-140, 140), vy: rand(-140, 140), vz: rand(80, 260), life: rand(0.7, 1.4), max: 1.4, col: wet ? '#bfe6f8' : ['#e8453c', '#3d6fd1', '#ffffff', '#f6c6a0', '#3fa34d'][i % 5], size: rand(2.5, 5), kind: wet ? 'drop' : 'shard', rot: rand(0, 6), vr: rand(-20, 20) });
          this.shake = Math.max(this.shake, 3);
        }
        continue;
      }
      const d = Math.hypot(g.x - m.x, g.y - m.y), gx = g.x - dcx, gy = g.y - dcy, dd = Math.hypot(gx, gy);
      const onDeck = Math.abs(gx * fx + gy * fy) < 14 + 7 && Math.abs(-gx * fy + gy * fx) < hw + 5;
      if ((d < m.r + 10 || onDeck) && (live || this.mode === 'title')) {
        if (this.mode === 'title') { g.wob = 0.5; continue; }
        g.fly = true; g.vx = m.vx * 1.2 + rand(-60, 60) + fx * 120; g.vy = m.vy * 1.2 + rand(-60, 60) + fy * 120; g.vz = 420; g.spin = 0; g.sv = rand(10, 18) * (Math.random() < 0.5 ? -1 : 1);
        m.vx *= 0.4; m.vy *= 0.4; m.flash = 0.12; m.sx = 0.8; m.sy = 1.2;
        this.hitstop = 0.07; this.shake = 10; this.gnomesHit++;
        this.audio.play('thwack');
        const pen = sp.monster ? 1 : GNOME_PENALTY;
        this.penalty(pen, 'GNOME! -' + pen + 's');
      } else if (live && d < m.r + 34 && m.speed > 170 && !g.shaved) {
        g.shaved = 2.5; g.wob = 0.6; this.addScore(75, 'tricks'); this.popup('CLOSE SHAVE +75', g.x, g.y - 36, 18, '#4fe0ff'); this.audio.play('shave');
      }
    }
    // toys
    for (const t of this.toys) {
      if (t.gone) continue;
      const tr = t.kind === 'golf' ? 5 : 11;
      const dx = t.x - dcx, dy = t.y - dcy;
      const under = Math.abs(dx * fx + dy * fy) < 14 + tr && Math.abs(-dx * fy + dy * fx) < hw + tr * 0.5;
      if (!under && Math.hypot(t.x - m.x, t.y - m.y) > m.r + tr) continue;
      if (!live) continue;
      t.gone = true;
      const cols = { ball: ['#e8453c', '#fff', '#3d6fd1'], duck: ['#ffd23f', '#ff8c42'], truck: ['#3d6fd1', '#ffc93c', '#222'], golf: ['#fff'], cone: ['#ff7a1f', '#fff'] }[t.kind];
      for (let i = 0; i < 14; i++) this.parts.push({ x: t.x, y: t.y, z: 5, vx: -fy * rand(80, 220) + rand(-50, 50), vy: fx * rand(80, 220) + rand(-50, 50), vz: rand(100, 260), life: rand(0.6, 1.2), max: 1.2, col: cols[i % cols.length], size: rand(2.5, 5), kind: 'shard', rot: 0, vr: rand(-20, 20) });
      if (sp.monster) { this.addScore(50, 'tricks'); this.popup('CRUNCH! +50', t.x, t.y - 30, 22, '#c9a0ff'); this.audio.play('smash'); this.shake = 4; }
      else { m.clog = CLOG_TIME; this.audio.play('clog'); this.shake = 6; this.hitstop = 0.05; m.sx = 1.12; m.sy = 0.9; this.breakChain(); }
    }
    // fuel cans
    for (const f of this.fuels) {
      if (f.gone || !live) continue;
      if (Math.hypot(f.x - m.x, f.y - m.y) < m.r + 16) {
        f.gone = true; this.fuel = Math.min(100, this.fuel + FUEL_CAN);
        this.popup('+FUEL', f.x, f.y - 30, 26, '#ffd23f'); this.audio.play('fuel');
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; this.parts.push({ x: f.x, y: f.y, z: 8, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, vz: 60, life: 0.5, max: 0.5, col: '#ffe36a', size: 3, kind: 'spark' }); }
      }
    }
    // sprinklers
    for (const s of this.sprinklers) {
      s.t -= dt;
      if (s.phase === 'idle' && s.t <= 0) { s.phase = 'rise'; s.t = 0.3; this.audio.play('pop'); }
      else if (s.phase === 'rise') { s.up = Math.min(1, s.up + dt / 0.3); if (s.t <= 0) { s.phase = 'spray'; s.t = 3.6; } }
      else if (s.phase === 'spray') {
        s.ang = s.base + Math.sin(this.t * 1.7) * 1.6 + this.t * 0.6;
        s.mud.wet = Math.min(1, s.mud.wet + dt * 0.4); s.mud.size = 45 + 45 * s.mud.wet;
        for (let k = 0; k < 2; k++) if (Math.random() < dt * 60) { const a = s.ang + rand(-0.12, 0.12), v = rand(120, 230); this.parts.push({ x: s.x, y: s.y, z: 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(140, 220), life: 1.2, max: 1.2, col: k ? '#d8f2ff' : '#8fd2f2', size: rand(1.8, 3), kind: 'drop' }); }
        if (Math.random() < dt * 3) this.audio.play('spray');
        if (s.t <= 0) { s.phase = 'fall'; s.t = 0.3; }
      } else if (s.phase === 'fall') { s.up = Math.max(0, s.up - dt / 0.3); if (s.t <= 0) { s.phase = 'idle'; s.t = rand(4, 6.5); s.base = rand(0, TAU); } }
      if (s.phase !== 'spray') s.mud.wet = Math.max(0, s.mud.wet - dt * 0.06);
      if (live && s.mud.wet > 0.25 && Math.hypot(m.x - s.mud.x, m.y - s.mud.y) < s.mud.size * 0.95 && this.t - this.mudMsgT > 4) { this.mudMsgT = this.t; this.popup('SLIPPY!', m.x, m.y - 40, 22, '#d9b38a'); this.audio.play('squelch'); }
    }
    // dogs
    for (const d of this.dogs) this.updateDog(d, dt, live);
    // cats
    for (const c of this.cats) this.updateCat(c, dt, live);
    // tree canopies: see through when under
    for (const tr of this.trees) tr.see = Math.hypot(tr.d[0] - m.x, tr.d[1] - m.y) < tr.d[2] + 10;
  }
  updateDog(d, dt, live) {
    const m = this.m; d.t -= dt; d.bark -= dt; d.cool = (d.cool || 0) - dt;
    const dist = Math.hypot(m.x - d.x, m.y - d.y);
    let tx = d.x, ty = d.y, speed = 0;
    if (d.state === 'idle') {
      if (d.t <= 0) { d.t = rand(1, 2.5); d.wx = d.hx + rand(-70, 70); d.wy = d.hy + rand(-70, 70); }
      tx = d.wx; ty = d.wy; speed = 60;
      if (live && dist < DOG_SIGHT && d.cool <= 0) { d.state = 'chase'; d.chaseT = 0; this.audio.play('bark'); this.popup('WOOF!', d.x, d.y - 30, 22, '#fff8e2'); d.bark = 0.7; }
    } else if (d.state === 'chase') {
      tx = m.x + m.vx * 0.25; ty = m.y + m.vy * 0.25; speed = DOG_SPEED; d.chaseT += dt;
      if (d.chaseT > 5) { d.state = 'home'; d.cool = 4; this.popup('*pant pant*', d.x, d.y - 28, 16, '#fff8e2'); }
      if (d.bark <= 0) { d.bark = rand(0.6, 1.1); this.audio.play('bark', rand(0.9, 1.15)); }
      if (dist < m.r + 16 && live) {
        d.state = 'happy'; d.t = 2.4;
        const nx = (m.x - d.x) / (dist || 1), ny = (m.y - d.y) / (dist || 1);
        m.vx = nx * 260; m.vy = ny * 260; m.sx = 0.82; m.sy = 1.18; m.flash = 0.12;
        this.hitstop = 0.06; this.shake = 8; this.audio.play('bark', 1.3); this.audio.play('bonk');
        this.penalty(DOG_PENALTY, 'DOG! -' + DOG_PENALTY + 's');
        for (let i = 0; i < 5; i++) this.parts.push({ x: d.x, y: d.y - 10, z: 20, vx: rand(-40, 40), vy: rand(-60, -20), vz: 80, life: 1.2, max: 1.2, col: '#ff5d8f', size: 6, kind: 'heart' });
      }
      if (dist > DOG_SIGHT * 1.6 || !live) d.state = 'home';
    } else if (d.state === 'happy') {
      if (d.t <= 0) { d.state = 'home'; d.t = 0; d.cool = 6; }
    } else if (d.state === 'home') {
      tx = d.hx; ty = d.hy; speed = 140;
      if (Math.hypot(d.hx - d.x, d.hy - d.y) < 20) { d.state = 'idle'; d.t = 1.5; }
    }
    if (speed > 0) {
      const dx = tx - d.x, dy = ty - d.y, l = Math.hypot(dx, dy);
      if (l > 4) {
        const ta = Math.atan2(dy, dx); d.a = wrap(d.a + clamp(wrap(ta - d.a), -7 * dt, 7 * dt));
        const ox = d.x, oy = d.y;
        d.vx = Math.cos(d.a) * speed; d.vy = Math.sin(d.a) * speed; d.r = 14;
        d.x += d.vx * dt; d.y += d.vy * dt;
        this.collide(d, false);
        if (Math.random() < dt * 8 && speed > 100) this.parts.push({ x: ox - Math.cos(d.a) * 12, y: oy - Math.sin(d.a) * 12, z: 1, vx: rand(-15, 15), vy: rand(-15, 15), vz: 30, life: 0.5, max: 0.5, col: '#e8f0c8', size: rand(2, 4), kind: 'smoke' });
      }
    }
  }
  updateCat(c, dt, live) {
    const m = this.m; c.t -= dt; c.hitT -= dt;
    const dist = Math.hypot(m.x - c.x, m.y - c.y);
    if (live && dist < m.r + 13 && c.hitT <= 0 && c.state !== 'flee') {
      // you ran right into it: big leap, hiss, time penalty
      c.hitT = 2; c.state = 'flee'; c.z = 0; c.vz = 380; c.spin = 0;
      this.pickCatSpot(c);
      m.vx *= 0.5; m.vy *= 0.5; this.hitstop = 0.06; this.shake = 7; this.audio.play('meow');
      this.penalty(CAT_PENALTY, 'MEOWW! -' + CAT_PENALTY + 's');
      return;
    }
    if (c.state === 'sleep') {
      if (live && dist < CAT_WAKE + this.spec.deck * 0.3 && m.speed > 95) { c.state = 'alert'; c.t = 0.35; }
    } else if (c.state === 'alert') {
      if (c.t <= 0) { c.state = 'flee'; c.vz = 160; c.z = 0; this.pickCatSpot(c); this.audio.play('meow'); this.popup('HISS!', c.x, c.y - 30, 20, '#ffd23f'); }
    } else if (c.state === 'flee') {
      const dx = c.tx - c.x, dy = c.ty - c.y, l = Math.hypot(dx, dy);
      c.a = Math.atan2(dy, dx);
      if (c.vz !== undefined) { c.vz -= 1100 * dt; c.z = Math.max(0, c.z + c.vz * dt); if (c.z > 0) c.spin = (c.spin || 0) + dt * 8; else c.spin = 0; }
      if (l < 8) { c.state = 'sleep'; c.t = 0; c.z = 0; c.spin = 0; }
      else { const v = Math.min(l / dt, 360); c.x += (dx / l) * v * dt; c.y += (dy / l) * v * dt; }
    }
  }
  pickCatSpot(c) {
    const L = this.lawn, m = this.m;
    let best = null, bd = -1;
    for (let i = 0; i < 30; i++) {
      const x = rand(40, L.w - 40), y = rand(40, L.h - 40);
      const k = L.idx(x, y);
      if (this.block[k] || L.kind[k] !== 1) continue;
      const d = Math.hypot(x - m.x, y - m.y) - Math.hypot(x - c.x, y - c.y) * 0.3;
      if (d > bd && Math.hypot(x - c.x, y - c.y) < 420) { bd = d; best = [x, y]; }
    }
    if (best) { c.tx = best[0]; c.ty = best[1]; } else { c.tx = c.x; c.ty = c.y; }
  }

  // ------------------------------------------------------------------ bot (attract mode, ?bot=1 and tests)
  botInput() {
    const m = this.m, L = this.lawn;
    if (this.mode === 'title') {
      // lane pattern: back and forth across the lawn
      if (!this.lanes) {
        this.lanes = [];
        const deck = this.spec.deck * 0.9;
        let flip = false;
        for (let y = 48; y < L.h - 20; y += deck) { this.lanes.push(flip ? [L.w - 50, y] : [50, y]); this.lanes.push(flip ? [50, y] : [L.w - 50, y]); flip = !flip; }
        this.laneI = 1;
      }
      const [tx, ty] = this.lanes[this.laneI % this.lanes.length];
      const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy);
      if (l < 22) this.laneI++;
      return { x: dx / (l || 1), y: dy / (l || 1), boost: false };
    }
    const S = this.botStuck;
    this.botT -= STEP;
    S.t += STEP;
    if (S.t > 1.2) { if (Math.hypot(m.x - S.x, m.y - S.y) < 25 && this.phase === 'go') { S.esc = 0.5; const a = rand(0, TAU); S.ex = Math.cos(a); S.ey = Math.sin(a); if (this.botPath) { const k = this.botPath[this.botPath.length - 1]; this.botAvoid[k] = 1; } this.botT = 0; } S.t = 0; S.x = m.x; S.y = m.y; }
    if (S.esc > 0) { S.esc -= STEP; return { x: S.ex, y: S.ey, boost: false }; }
    const fx = Math.cos(m.a), fy = Math.sin(m.a), hw = this.spec.deck / 2;
    const chased = this.dogs.some((d) => d.state === 'chase' && Math.hypot(d.x - m.x, d.y - m.y) < 140);
    const boost = (chased && this.fuel > 25) || (this.fuel > 60 && this.clock < this.lv.time * 0.6);
    const free = (x, y) => { const k = L.idx(x, y); return k >= 0 && !this.block[k]; };
    const uncutAt = (x, y) => { const k = L.idx(x, y); return k >= 0 && L.kind[k] === 1 && !L.cut[k] && !this.botAvoid[k]; };
    const ahead = (x0, y0, dx, dy, n) => {
      let c = 0;
      for (let d = 1; d <= n; d++) {
        const cx = x0 + dx * d * CELL, cy = y0 + dy * d * CELL;
        let ok = true;
        for (const s of [-0.9, 0, 0.9]) if (!free(cx - dy * s * hw, cy + dx * s * hw)) ok = false;
        if (!ok) break;
        for (const s of [-0.7, 0, 0.7]) if (uncutAt(cx - dy * s * hw, cy + dx * s * hw)) c++;
      }
      return c;
    };
    const B = this.botLane || (this.botLane = { state: 'seek', t: 0 });
    if (B.state === 'lane') {
      const [dx, dy] = B.dir;
      B.t -= STEP;
      if (B.t <= 0) { B.t = 0.08; if (ahead(m.x + dx * 16, m.y + dy * 16, dx, dy, 8) === 0) { B.state = 'seek'; this.botPath = null; } }
      if (B.state === 'lane') {
        const err = B.lat - (dx ? m.y : m.x);
        const c = clamp(err * 0.014, -0.3, 0.3);
        return { x: dx + (dx ? 0 : c), y: dy + (dx ? c : 0), boost };
      }
    }
    if (this.botT <= 0 || !this.botPath) {
      this.botT = 0.25;
      this.botPath = L.nearestUncut(m.x + fx * 18, m.y + fy * 18, this.block, this.botAvoid) || L.nearestUncut(m.x, m.y, this.block, this.botAvoid) || L.nearestUncut(m.x, m.y, this.hard, this.botAvoid, this.block);
      if (!this.botPath) this.botAvoid.fill(0);
    }
    if (!this.botPath) return { x: 0, y: 0, boost: false };
    const p = this.botPath;
    const [ex, ey] = L.cellXY(p[p.length - 1]);
    if (Math.hypot(ex - m.x - fx * 16, ey - m.y - fy * 16) < 26) {
      const opts = L.w >= L.h ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
      let best = null, bc = 0;
      opts.forEach((o, i) => { const c = ahead(ex - o[0] * 8, ey - o[1] * 8, o[0], o[1], 16) * (i < 2 ? 1.5 : 1); if (c > bc && c >= 6) { bc = c; best = o; } });
      if (best) {
        const [dx, dy] = best, px = -dy, py = dx;
        let side = 0;
        for (let k = 1; k <= 4; k++) { if (uncutAt(ex + px * k * CELL, ey + py * k * CELL)) side++; if (uncutAt(ex - px * k * CELL, ey - py * k * CELL)) side--; }
        const lat = (dx ? ey : ex) + Math.sign(side) * (dx ? py : px) * (hw - 8);
        this.botLane = { state: 'lane', dir: best, lat, t: 0 };
        return { x: dx, y: dy, boost };
      }
    }
    const idx = Math.min(p.length - 1, 5);
    const [tx, ty] = L.cellXY(p[idx]);
    const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy);
    return { x: dx / (l || 1), y: dy / (l || 1), boost: chased && this.fuel > 30 };
  }

  // ------------------------------------------------------------------ effects
  effects(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      if (p.kind === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += dt * 10; continue; }
      if (p.kind === 'heart') { p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      if (p.kind === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; continue; }
      if (p.z > 0 || p.vz > 0) {
        p.vz -= (p.kind === 'confetti' ? 300 : 700) * dt; p.z += p.vz * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'confetti') { p.vx *= 0.985; p.vy *= 0.985; }
        if (p.rot !== undefined) p.rot += p.vr * dt;
        if (p.z <= 0) { p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; if (p.kind === 'drop') p.life = Math.min(p.life, 0.15); }
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.pops) { p.t += dt; p.y -= dt * 40; }
    this.pops = this.pops.filter((p) => p.t < p.life);
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.life);
  }
  popup(text, x, y, size, col) {
    for (const p of this.pops) if (p.t < 0.5 && Math.abs(p.x - x) < 140 && Math.abs(p.y - y) < size * 1.2) y = Math.min(y, p.y - size * 1.15);
    this.pops.push({ text, x, y, size, col, t: 0, life: 1.1 }); if (this.pops.length > 14) this.pops.shift(); }
  banner(text, life, col, size, yf = 0.4) { this.banners = this.banners.filter((b) => b.yf !== yf); this.banners.push({ text, life, col, size, t: 0, yf }); }

  // ------------------------------------------------------------------ camera + render
  viewSize() {
    const lv = this.lv, W = this.W, H = this.H;
    let z = clamp((Math.min(W, H) / 540) * (H > W * 1.2 ? 1.25 : 1), 0.55, 1.7);
    if (this.mode === 'title') z = Math.max(W / (lv.w - 40), H / (lv.h - 40));
    else { const fit = Math.min(W / (lv.w + 100), H / (lv.h + 140)); if (fit > z * 0.8) z = Math.max(z * 0.8, Math.min(fit, z)); }
    return { z };
  }
  camTarget() {
    const m = this.m, lv = this.lv, z = this.cam.z, hw = this.W / 2 / z, hh = this.H / 2 / z;
    let x = m.x + m.vx * 0.35, y = m.y + m.vy * 0.35;
    const mx = 50, my = 70;
    x = lv.w + mx * 2 <= hw * 2 ? lv.w / 2 : clamp(x, hw - mx, lv.w + mx - hw);
    y = lv.h + my * 2 <= hh * 2 ? lv.h / 2 - (this.mode === 'play' ? 20 / z : 0) : clamp(y, hh - my - 30, lv.h + my - hh);
    return [x, y];
  }
  snapCam() { this.cam.z = this.viewSize().z; const [x, y] = this.camTarget(); this.cam.x = x; this.cam.y = y; }
  updateCam(dt) {
    const c = this.cam;
    c.z += (this.viewSize().z - c.z) * Math.min(1, dt * 3);
    const [x, y] = this.camTarget();
    c.x += (x - c.x) * Math.min(1, dt * 4); c.y += (y - c.y) * Math.min(1, dt * 4);
  }

  render() {
    const x = this.ctx, W = this.W, H = this.H, c = this.cam, lv = this.lv, L = this.lawn, t = this.t;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = { suburb: '#c9c3b5', estate: '#d9ccab', golf: '#3d7a2c', pitch: '#3d6a2c', castle: '#a89f8e' }[lv.theme] || '#c9c3b5';
    x.fillRect(0, 0, W, H);
    x.save();
    const sh = this.shake;
    x.translate(W / 2 + (sh ? rand(-sh, sh) : 0), H / 2 + (sh ? rand(-sh, sh) : 0));
    x.scale(c.z, c.z);
    x.translate(-c.x, -c.y);
    // lawn: cut stripes, long-grass shadow, long grass
    x.drawImage(L.cutCv, 0, 0);
    x.globalAlpha = 0.3; x.drawImage(L.shadeCv, 3, 4); x.globalAlpha = 1;
    x.drawImage(L.tallCv, 0, 0);
    x.drawImage(this.tracks, 0, 0);
    x.drawImage(this.st.ground, -D.M, -D.M);
    for (const s of this.sprinklers) D.drawMud(x, s.mud);
    // animated water
    for (const s of this.solids) if (s.kind === 'water') {
      if (s.t === 'c') {
        const ph = (t * 0.5 + s.x * 0.01) % 1;
        x.strokeStyle = `rgba(255,255,255,${0.35 * (1 - ph)})`; x.lineWidth = 2;
        x.beginPath(); x.arc(s.x + Math.sin(s.x) * s.r * 0.3, s.y + Math.cos(s.x) * s.r * 0.2, 6 + ph * s.r * 0.35, 0, TAU); x.stroke();
        if (lv.fountains && lv.fountains.some((f) => f.x === s.x && f.y === s.y)) {
          for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + t * 0.3, rr = s.r * 0.22 + ((t * 30 + k * 7) % (s.r * 0.55)); x.fillStyle = 'rgba(230,248,255,0.8)'; x.beginPath(); x.arc(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, 2.4, 0, TAU); x.fill(); }
        }
      } else {
        x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 2;
        for (let k = 0; k < s.w; k += 70) { const ox = (t * 20 + k) % s.w; x.beginPath(); x.moveTo(s.x + ox, s.y + s.h / 2); x.lineTo(s.x + ox + 22, s.y + s.h / 2); x.stroke(); }
      }
    }
    D.drawFlowers(x, this.flowers, t);
    if (lv.flag) { const [fx, fy] = lv.flag, wv = Math.sin(t * 5) * 4; x.fillStyle = 'rgba(16,48,8,0.3)'; x.fillRect(fx, fy, 30, 4); x.fillStyle = '#eee'; x.fillRect(fx - 2, fy - 46, 4, 46); x.fillStyle = '#e8453c'; x.beginPath(); x.moveTo(fx + 2, fy - 46); x.quadraticCurveTo(fx + 16, fy - 42 + wv, fx + 30, fy - 38); x.lineTo(fx + 2, fy - 30); x.fill(); }
    for (const s of this.sprinklers) D.drawSprinkler(x, s, t);
    for (const f of this.fuels) D.drawFuel(x, f, t);
    for (const ty of this.toys) D.drawToy(x, ty, t);
    // ground particles under the mower
    this.drawParts(x, false);
    for (const cat of this.cats) if (cat.state !== 'flee') D.drawCat(x, cat, t);
    D.drawMower(x, this.m, t, this.spec);
    for (const d of this.dogs) D.drawDog(x, d, t);
    for (const cat of this.cats) if (cat.state === 'flee') D.drawCat(x, cat, t);
    const sorted = this.gnomes.filter((g) => g.alive).sort((a, b) => a.y - b.y);
    for (const g of sorted) D.drawGnome(x, g, t);
    this.drawParts(x, true);
    x.drawImage(this.st.props, -D.M, -D.M);
    for (const tr of this.trees) D.drawTree(x, tr, t, tr.see);
    // hint arrow towards missed grass
    if (this.hintOn && this.hint) {
      const [hx, hy] = this.hint, m = this.m, dx = hx - m.x, dy = hy - m.y, l = Math.hypot(dx, dy);
      const pul = 1 + Math.sin(t * 8) * 0.15;
      x.strokeStyle = '#ffd23f'; x.lineWidth = 4; x.beginPath(); x.arc(hx, hy, 14 * pul, 0, TAU); x.stroke();
      if (l > 90) {
        const a = Math.atan2(dy, dx);
        x.save(); x.translate(m.x + Math.cos(a) * 52, m.y + Math.sin(a) * 52); x.rotate(a); x.scale(pul, pul);
        x.fillStyle = '#ffd23f'; x.strokeStyle = '#1d3a16'; x.lineWidth = 3; x.beginPath(); x.moveTo(14, 0); x.lineTo(-8, -11); x.lineTo(-3, 0); x.lineTo(-8, 11); x.closePath(); x.stroke(); x.fill();
        x.restore();
      }
    }
    const popTop = c.y + ((H > W ? 150 : 104) - H / 2) / c.z, popL = c.x + (90 - W / 2) / c.z, popR = c.x + (W / 2 - 90) / c.z; // keep popups clear of the HUD and on screen
    for (const p of this.pops) {
      const k = p.t / p.life, s = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : k < 0.25 ? 1.2 - ((k - 0.15) / 0.1) * 0.2 : 1;
      D.drawPop(x, p.text, clamp(p.x, popL, popR), Math.max(p.y, popTop), (p.size / c.z) * clamp(Math.min(W, H) / 650, 0.62, 1), p.col, k > 0.75 ? (1 - k) / 0.25 : 1, s);
    }
    x.restore();
    if (this.mode === 'play') {
      D.drawHUD(x, this, W, H);
      if (this.stick) {
        const s = this.stick;
        x.fillStyle = 'rgba(255,248,226,0.18)'; x.strokeStyle = 'rgba(255,248,226,0.6)'; x.lineWidth = 3;
        x.beginPath(); x.arc(s.bx, s.by, 56, 0, TAU); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,248,226,0.85)'; x.beginPath(); x.arc(s.x, s.y, 24, 0, TAU); x.fill();
      } else if (this.touchUI && this.phase !== 'end') {
        x.fillStyle = 'rgba(255,248,226,0.12)'; x.strokeStyle = 'rgba(255,248,226,0.35)'; x.lineWidth = 3;
        x.beginPath(); x.arc(90, H - 100, 56, 0, TAU); x.fill(); x.stroke();
        D.drawPop(x, 'DRAG TO DRIVE', 90, H - 100, 13, '#fff8e2', 0.7);
      }
    }
    for (const b of this.banners) {
      const k = b.t / b.life, s = k < 0.12 ? 1.6 - (k / 0.12) * 0.6 : 1;
      D.drawBanner(x, b.text, W / 2, H * b.yf, b.size * Math.min(1, Math.max(0.7, W / 900)), b.col, k > 0.8 ? (1 - k) / 0.2 : 1, s, W * 0.88);
    }
  }
  drawParts(x, air) {
    for (const p of this.parts) {
      const isAir = p.z > 0.5 || p.kind === 'smoke' || p.kind === 'heart' || p.kind === 'spark';
      if (isAir !== air) continue;
      const a = Math.min(1, p.life / (p.max * 0.4));
      if (p.kind === 'smoke') { x.globalAlpha = a * 0.35; x.fillStyle = p.col; x.beginPath(); x.arc(p.x, p.y - p.z, p.size, 0, TAU); x.fill(); continue; }
      if (p.kind === 'heart') { x.globalAlpha = a; D.drawPop(x, '♥', p.x, p.y - p.z, 16, p.col); continue; }
      x.globalAlpha = a;
      if (air && p.z > 2) { x.fillStyle = 'rgba(16,48,8,0.25)'; x.fillRect(p.x - p.size / 2 + p.z * 0.15, p.y - p.size / 4 + p.z * 0.2, p.size, p.size / 2); }
      x.fillStyle = p.col;
      if (p.kind === 'drop' || p.kind === 'spark' || p.kind === 'bit') { x.beginPath(); x.arc(p.x, p.y - p.z, p.size / 2, 0, TAU); x.fill(); }
      else { x.save(); x.translate(p.x, p.y - p.z); x.rotate(p.rot || 0); x.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 + (p.kind === 'shard' ? p.size / 3 : 0)); x.restore(); }
    }
    x.globalAlpha = 1;
  }
}

document.fonts && document.fonts.load && document.fonts.load(`20px ${D.FONT}`).catch(() => {});
new Game();
