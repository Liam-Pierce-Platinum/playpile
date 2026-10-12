// Pure game state + rules. No DOM, no drawing. main.js drives it and draws it.
import { makeStage } from './stages.js';
import { RUSTY, skinById } from './skins.js';

const TAU = Math.PI * 2;
export const SPEED = 3800;      // axe flight speed, design px/s
export const EMBED = 26;        // how deep the head sinks past the bark
export const HIT_SEP = 0.2;     // radians: closer than this to a stuck axe = clang
export const APPLE_SEP = 0.25;  // radians: within this of an apple = sliced
export const COMBO_GAP = 0.5;   // seconds between hits to keep a swift combo
const angN = (a) => ((a % TAU) + TAU) % TAU;
export const angDiff = (a, b) => { const d = Math.abs(angN(a) - angN(b)); return d > Math.PI ? TAU - d : d; };
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export class Game {
  constructor(L, fx) {
    this.L = L; this.fx = fx;
    this.state = 'idle';
    this.parts = []; this.texts = []; this.debris = []; this.pieces = [];
    this.shake = 0; this.time = 0; this.freeze = 0; this.slow = 1;
    this.skin = skinById('classic');
    this.stageN = 1; this.score = 0; this.coinsRun = 0; this.applesRun = 0;
    this.queued = -9; // time of a tap that came in a moment too early (input buffer)
  }

  // ---------------------------------------------------------------- run flow
  newRun(skinId) {
    this.skin = skinById(skinId);
    this.stageN = 1; this.score = 0; this.coinsRun = 0; this.applesRun = 0; this.continued = false;
    this.bestCombo = 0; this.bossesRun = 0;
    this.parts.length = 0; this.texts.length = 0; this.debris.length = 0; this.pieces.length = 0;
    this.loadStage();
  }
  // A slow decorative log for the title screen.
  attract(skinId) {
    this.skin = skinById(skinId);
    this.stageN = 1; this.loadStage();
    this.st.spin = () => 0.7;
    for (let i = 0; i < 4; i++) this.axes.push({ a: i * 1.6 + 0.4, skin: this.skin, wob: 0 });
    this.state = 'attract'; this.drop = 1;
  }
  loadStage() {
    const st = makeStage(this.stageN);
    this.st = st;
    this.rot = Math.random() * TAU; this.t = 0;
    this.axes = st.obstacles.map((a) => ({ a, skin: RUSTY, wob: 0 }));
    this.apples = st.apples.map((a) => ({ a }));
    this.need = st.need; this.thrown = 0; this.hits = 0;
    this.flying = []; this.ready = 1; this.drop = 0; this.kick = 0; this.flash = 0;
    this.introT = st.boss ? 1.5 : 0;
    this.combo = 0; this.lastHit = -9; this.freeze = 0; this.slow = 1;
    this.failAxe = null; this.pieces.length = 0;
    this.state = 'play';
    if (st.boss) this.fx.boss(st);
  }
  continueRun() { this.continued = true; this.parts.length = 0; this.debris.length = 0; this.loadStage(); }

  // ---------------------------------------------------------------- geometry
  get R() { return this.st.R; }
  logY() { const d = this.drop >= 1 ? 1 : easeOutBack(this.drop); return this.L.cy - (1 - d) * (this.L.cy + 200) - this.kick * 9; }
  contactY() { return this.logY() + this.R; }
  readyY() { return this.L.axeY + (1 - this.ready) * 70; }

  canThrow() {
    return this.state === 'play' && this.thrown < this.need && this.ready >= 0.6 && this.drop >= 0.55 && this.introT < 0.7;
  }
  throw() {
    if (!this.canThrow()) {
      // A tap a moment too early (log still dropping in, axe still sliding up) is kept for
      // 0.4 s and fired as soon as it can be, so taps never feel swallowed.
      if (this.state === 'play' && this.thrown < this.need && this.introT < 1.0) this.queued = this.time;
      return false;
    }
    this.queued = -9;
    this.flying.push({ y: this.readyY(), trail: 0 });
    this.thrown++; this.ready = 0;
    this.fx.sfx('throw');
    return true;
  }
  // Where would an axe thrown right now land, and would it clang? (for the bot)
  predict() {
    if (!this.st) return null;
    const T = (this.readyY() - (this.logY() + this.R - EMBED)) / SPEED;
    let r = this.rot, t = this.t;
    const n = 10;
    for (let i = 0; i < n; i++) { r += this.st.spin(t) * (T / n); t += T / n; }
    const a = angN(Math.PI / 2 - r);
    let minD = 9;
    for (const e of this.axes) minD = Math.min(minD, angDiff(a, e.a));
    return { a, minD, apple: this.apples.some((p) => angDiff(a, p.a) < APPLE_SEP) };
  }
  safe(margin = 0.05) {
    if (!this.canThrow() || this.flying.length) return false;
    const p = this.predict();
    return p.minD > HIT_SEP + margin;
  }

  // ---------------------------------------------------------------- update
  update(rawDt) {
    this.time += rawDt;
    this.shake *= Math.exp(-rawDt * 9);
    this.updateFx(rawDt);
    if (this.freeze > 0) { this.freeze -= rawDt; return; }
    this.slow += (1 - this.slow) * Math.min(1, rawDt * 4);
    const dt = rawDt * this.slow;
    if (this.state === 'idle') return;
    const s = this.state;
    if (s !== 'clear') { this.rot += this.st.spin(this.t) * dt; this.t += dt; }
    this.drop = Math.min(1, this.drop + dt / 0.5);
    this.introT = Math.max(0, this.introT - dt);
    this.ready = Math.min(1, this.ready + dt / 0.08);
    this.kick *= Math.exp(-dt * 16);
    if (this.time - this.queued < 0.4 && this.canThrow()) this.throw();
    this.flash = Math.max(0, this.flash - dt * 5);
    for (const e of this.axes) e.wob *= Math.exp(-dt * 7);
    if (s === 'attract') return;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]; if (!f) continue;
      f.y -= SPEED * dt; f.trail = Math.min(1, f.trail + dt * 12);
      if (this.state === 'play' && f.y <= this.contactY() - EMBED) { this.flying.splice(i, 1); this.land(); }
    }
    if (this.failAxe) {
      const f = this.failAxe;
      f.vy += 2600 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
    }
    for (const p of this.pieces) { p.vy += 1500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
    for (const d of this.debris) { d.vy += 1700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; }
    if (s === 'clear') {
      this.clearT -= dt;
      if (this.clearT <= 0) { this.stageN++; this.debris.length = 0; this.loadStage(); this.fx.stage(this); }
    } else if (s === 'fail') {
      this.failT -= dt;
      if (this.failT <= 0) { this.state = 'over'; this.fx.over(this); }
    }
  }
  updateFx(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += (p.g ?? 1400) * dt; p.vx *= Math.exp(-dt * (p.drag ?? 1)); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt; t.y -= 70 * dt; if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- events
  land() {
    const a = angN(Math.PI / 2 - this.rot);
    const cx = this.L.cx, cy = this.contactY();
    let near = 9;
    for (const e of this.axes) { const d = angDiff(a, e.a); if (d < HIT_SEP) { this.fail(e); return; } near = Math.min(near, d); }
    const ai = this.apples.findIndex((p) => angDiff(a, p.a) < APPLE_SEP);
    if (ai >= 0) this.slice(ai);
    this.axes.push({ a, skin: this.skin, wob: 1 });
    this.hits++;
    this.kick = 1; this.flash = 1; this.freeze = 0.03; this.shake = Math.min(14, this.shake + 3.5);
    this.combo = this.time - this.lastHit < COMBO_GAP ? this.combo + 1 : 1;
    this.lastHit = this.time; this.bestCombo = Math.max(this.bestCombo || 0, this.combo);
    let pts = this.combo >= 3 ? 2 : 1;
    if (near < HIT_SEP + 0.07) {
      // a hair's breadth from a clang: reward it
      pts += 1; this.nearRun = (this.nearRun || 0) + 1; this.shake = Math.min(16, this.shake + 4);
      this.texts = this.texts.filter((t) => !t.close);
      this.texts.push({ x: cx - 80, y: cy + 70, txt: 'CLOSE! +1', life: 0.8, max: 0.8, size: 26, color: '#7dffb0', close: true });
      this.fx.sfx('close');
    }
    this.score += pts;
    for (let i = 0; i < 12; i++) {
      const ang = -Math.PI / 2 + Math.PI + rand(-1.1, 1.1);
      const sp = rand(200, 620);
      this.parts.push({ kind: 'chip', x: cx + rand(-8, 8), y: cy + 4, vx: Math.cos(ang) * sp * 0.9, vy: -Math.sin(ang) * sp * 0.6 + rand(50, 250),
        life: rand(0.35, 0.7), max: 0.7, size: rand(3, 7), rot: rand(0, TAU), vr: rand(-20, 20), color: Math.random() < 0.5 ? this.st.look.wood : this.st.look.bark });
    }
    this.parts.push({ kind: 'ring', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0.25, max: 0.25, size: 10, rot: 0 });
    if (this.combo >= 3) { this.texts = this.texts.filter((t) => !t.swift); this.texts.push({ x: cx + 70, y: cy + 40, txt: `SWIFT x${this.combo}`, life: 0.7, max: 0.7, size: 26, color: '#ffe14d', swift: true }); }
    this.fx.sfx('hit', this.combo);
    if (this.hits >= this.need) this.clear();
  }
  slice(i) {
    const p = this.apples.splice(i, 1)[0];
    const wa = p.a + this.rot, R = this.R + 14;
    const x = this.L.cx + Math.cos(wa) * R, y = this.logY() + Math.sin(wa) * R;
    this.applesRun++; this.coinsRun += 2;
    for (const side of [-1, 1]) this.debris.push({ kind: 'apple', half: side, x, y, vx: side * rand(180, 280), vy: rand(-520, -380), rot: wa + Math.PI / 2, vr: side * rand(6, 10) });
    for (let k = 0; k < 14; k++) {
      const ang = rand(0, TAU), sp = rand(80, 380);
      this.parts.push({ kind: 'drop', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 150, life: rand(0.4, 0.8), max: 0.8, size: rand(3, 6), rot: 0, color: Math.random() < 0.6 ? '#ff4a3a' : '#fff3c8' });
    }
    this.texts.push({ x, y: y - 20, txt: '+2', coin: true, life: 0.9, max: 0.9, size: 30, color: '#ffe14d' });
    this.fx.sfx('apple');
  }
  fail(e) {
    this.state = 'fail'; this.failT = 1.05; this.flying = [];
    const cx = this.L.cx, cy = this.contactY();
    this.failAxe = { x: cx, y: cy - EMBED + 40, vx: (Math.random() < 0.5 ? -1 : 1) * rand(260, 420), vy: 520, rot: 0, vr: (Math.random() < 0.5 ? -1 : 1) * rand(12, 18), skin: this.skin };
    e.wob = 2;
    this.shake = 22; this.freeze = 0.09; this.slow = 0.25; this.flash = 0;
    for (let i = 0; i < 18; i++) {
      const ang = rand(0, TAU), sp = rand(250, 750);
      this.parts.push({ kind: 'spark', x: cx, y: cy + 50, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 600, drag: 3, life: rand(0.2, 0.45), max: 0.45, size: rand(10, 22), rot: ang, color: Math.random() < 0.5 ? '#fff6b0' : '#ffb03a' });
    }
    this.texts.push({ x: cx, y: cy + 110, txt: 'CLANG!', life: 0.9, max: 0.9, size: 46, color: '#ff5a3c' });
    this.fx.sfx('clang');
    this.fx.vibrate(120);
  }
  clear() {
    const boss = this.st.boss;
    this.state = 'clear'; this.clearT = boss ? 1.5 : 0.95;
    this.freeze = boss ? 0.14 : 0.06; this.shake = boss ? 26 : 12; this.slow = boss ? 0.35 : 0.6;
    const cx = this.L.cx, cy = this.logY(), R = this.R;
    this.burstRot = this.rot; this.burstY = cy;
    const n = boss ? 9 : 6, base = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a0 = base + (i * TAU) / n, a1 = a0 + TAU / n, mid = (a0 + a1) / 2 + this.rot;
      const sp = rand(380, 620) * (boss ? 1.25 : 1);
      this.pieces.push({ a0, a1, x: 0, y: 0, vx: Math.cos(mid) * sp, vy: Math.sin(mid) * sp - 380, rot: 0, vr: rand(-6, 6) });
    }
    for (const e of this.axes) {
      const wa = e.a + this.rot, sp = rand(450, 800);
      this.debris.push({ kind: 'axe', skin: e.skin, x: cx + Math.cos(wa) * (R - EMBED), y: cy + Math.sin(wa) * (R - EMBED), rot: wa - Math.PI / 2,
        vx: Math.cos(wa) * sp, vy: Math.sin(wa) * sp - 420, vr: rand(-14, 14) });
    }
    for (const p of this.apples) {
      const wa = p.a + this.rot;
      this.debris.push({ kind: 'apple', half: 0, x: cx + Math.cos(wa) * (R + 14), y: cy + Math.sin(wa) * (R + 14), rot: wa + Math.PI / 2, vx: Math.cos(wa) * 400, vy: Math.sin(wa) * 400 - 400, vr: rand(-8, 8) });
    }
    this.axes = []; this.apples = [];
    for (let i = 0; i < (boss ? 70 : 40); i++) {
      const ang = rand(0, TAU), sp = rand(150, boss ? 900 : 650);
      this.parts.push({ kind: Math.random() < 0.25 ? 'dust' : 'chip', x: cx + Math.cos(ang) * rand(0, R), y: cy + Math.sin(ang) * rand(0, R), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 200,
        life: rand(0.5, 1.1), max: 1.1, size: rand(4, 10), rot: rand(0, TAU), vr: rand(-15, 15), color: Math.random() < 0.5 ? this.st.look.wood : this.st.look.bark, drag: 1.5 });
    }
    if (boss) {
      for (let i = 0; i < 60; i++) {
        const ang = rand(0, TAU), sp = rand(200, 800);
        this.parts.push({ kind: 'confetti', x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 300, g: 700, drag: 2, life: rand(1, 1.6), max: 1.6, size: rand(6, 11), rot: rand(0, TAU), vr: rand(-12, 12),
          color: ['#ffe14d', '#ff5a3c', '#5fd36a', '#4fb4ff', '#ffffff'][i % 5] });
      }
    }
    const coins = boss ? 15 : 1;
    this.coinsRun += coins;
    this.texts.push({ x: cx, y: cy, txt: boss ? 'BOSS DOWN!' : 'TIMBER!', life: boss ? 1.3 : 0.9, max: boss ? 1.3 : 0.9, size: boss ? 54 : 44, color: '#fff8ea', big: true });
    if (boss) this.bossesRun++;
    this.fx.cleared(this, boss);
    this.fx.sfx('crack', boss);
    this.fx.vibrate(boss ? 80 : 30);
  }
}
