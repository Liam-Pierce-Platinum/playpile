// NEON DRIFT - WASD drifting down an endless neon road.
// W gas, S brake, A/D steer, Space handbrake, Shift nitro.
import { Track, STEP } from './track.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { drawCar, Rival, STYLES } from './cars.js';

const SAVE_KEY = 'pd.neondrift';
const CYAN = '#ffffff', PINK = '#ff8a3a', PURPLE = '#9aa0b0', YELLOW = '#ffd060', RED = '#ff4a3a';
const ACCEL = 980, BRAKE = 1500, MAXSPD = 1000, NITRO_MAX = 1350, CAR_R = 18;
const RACE_LEN = 2300;   // track points from the start line to the finish banner
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.cv = document.getElementById('c');
    this.x = this.cv.getContext('2d');
    this.audio = new Audio();
    this.save = { best: 0, bestFree: 0, music: 0.6, sfx: 0.85 };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx;
    this.keys = new Set();
    this.touch = { l: false, r: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.mode = 'title';
    this.time = 0;
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.newRun('attack', true);
    this.mode = 'title';
    this.ui.show('title');
    if (params.has('play')) { const pm = params.get('play'); this.start(['race', 'free'].includes(pm) ? pm : 'attack'); }
    window.__ND = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* blocked */ } }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * this.dpr);
    this.cv.height = Math.round(innerHeight * this.dpr);
    this.W = innerWidth; this.H = innerHeight;
  }

  // ------------------------------------------------------------ input
  input() {
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && !['title', 'over'].includes(this.ui.panel)) { this.ui.back(); return; }
        if (this.mode === 'play' && !this.ui.open) { this.ui.show('pause'); return; }
      }
      if (this.ui.open) { if (['Enter', 'Space', 'KeyR'].includes(e.code) && (this.ui.panel === 'over' || this.ui.panel === 'race')) this.ui.primary(); return; }
      if (this.mode === 'play' && e.code === 'KeyR') this.start(this.runMode);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); if (this.mode === 'play' && !this.ui.open) this.ui.show('pause'); });
    // touch: hold the left or right half to steer (gas is automatic); both halves = handbrake
    const set = (e, on) => {
      for (const t of e.changedTouches) {
        const side = t.clientX < innerWidth / 2 ? 'l' : 'r';
        if (on) this.touchIds.set(t.identifier, side); else this.touchIds.delete(t.identifier);
      }
      this.touch.l = [...this.touchIds.values()].includes('l');
      this.touch.r = [...this.touchIds.values()].includes('r');
    };
    this.touchIds = new Map();
    this.cv.addEventListener('touchstart', (e) => { e.preventDefault(); this.audio.unlock(); set(e, true); }, { passive: false });
    this.cv.addEventListener('touchend', (e) => { e.preventDefault(); set(e, false); }, { passive: false });
    this.cv.addEventListener('touchcancel', (e) => set(e, false));
  }
  controls() {
    const k = this.keys, t = this.touch;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    const brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    let hand = k.has('Space');
    const nitro = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.isTouch && (t.l || t.r || this.touchIds.size === 0)) {
      if (t.l && !t.r) steer = -1; else if (t.r && !t.l) steer = 1; else if (t.l && t.r) hand = true;
      throttle = 1;
    }
    return { steer, throttle, brake, hand, nitro };
  }

  // ------------------------------------------------------------ runs
  newRun(mode, demo = false) {
    this.runMode = mode;
    this.track = new Track(demo ? 12345 : undefined);
    const p0 = this.track.pts[5];
    this.car = { x: p0.x, y: p0.y, h: p0.a, vx: 0, vy: 0, speed: 0, drift: 0, idx: 5, nitro: 0, nitroOn: false, hitT: 0 };
    this.score = 0;
    this.mult = 1; this.chain = 0; this.multT = 0;
    this.driftPts = 0; this.driftT = 0; this.calmT = 0; this.driftOn = false; this.gapT = 0;
    this.longest = 0; this.bestMult = 1; this.closeT = 0;
    this.timer = mode === 'attack' ? 45 : Infinity;
    this.rivals = [];
    this.raceClock = 0; this.finishT = null; this.place = 0;
    if (mode === 'race' && !demo) {
      const T0 = this.track;
      T0.ensure(RACE_LEN + 300);
      T0.finish = RACE_LEN;
      // a staggered grid: rivals around you, two rows
      const at = (i, lane) => { const q = T0.pts[i]; return [q.x - Math.sin(q.a) * lane * q.w, q.y + Math.cos(q.a) * lane * q.w, q.a, i]; };
      const grid = [['red', 0.96, at(9, 0.45)], ['blue', 0.93, at(9, -0.45)], ['yellow', 0.89, at(5, 0.45)]];
      this.rivals = grid.map(([st, sk, g]) => new Rival(st, sk, ...g));
    }
    this.trails = [];   // skid marks: { pts: [{x,y}], life }
    this.leftSkid = null; this.rightSkid = null;
    this.parts = [];
    this.pops = [];
    this.shake = 0; this.flash = 0;
    this.count = demo ? 0 : 3.2;
    this.over = false;
    this.cam = { x: p0.x, y: p0.y, h: p0.a, z: 1 };
    if (mode === 'race' && !demo) { const q = this.track.pts[5]; this.car.x = q.x + Math.sin(q.a) * 0.45 * q.w; this.car.y = q.y - Math.cos(q.a) * 0.45 * q.w; this.cam.x = this.car.x; this.cam.y = this.car.y; }
  }
  start(mode) {
    this.newRun(mode);
    this.mode = 'play';
    this.ui.close();
    this.ui.hud(true);
    this.audio.unlock();
  }
  pop(text, color, size = 26, life = 1.1, dy = 0) { this.pops.push({ text, color, size, life, max: life, dy }); }

  // ------------------------------------------------------------ physics
  updateCar(dt, input) {
    const c = this.car, T = this.track;
    const speed = Math.hypot(c.vx, c.vy);
    // nitro
    c.nitroOn = input.nitro && c.nitro > 0 && input.throttle > 0;
    if (c.nitroOn) { c.nitro = Math.max(0, c.nitro - dt * 0.4); if (!this.nitroSnd) { this.nitroSnd = true; this.audio.play('nitro'); } } else this.nitroSnd = false;
    const top = c.nitroOn ? NITRO_MAX : MAXSPD;
    // steering is eased in and out, so a tap of A/D doesn't jerk the car
    c.steer = (c.steer || 0) + (input.steer - (c.steer || 0)) * Math.min(1, dt * 6);
    // drifting: steer hard at speed (or pull the handbrake) and the rear lets go
    const wantDrift = input.hand ? 1 : (Math.abs(c.steer) > 0.5 && speed > 450 && input.throttle) ? 1 : 0;
    c.drift = lerp(c.drift, wantDrift, 1 - Math.exp(-(wantDrift ? 3.5 : 2.6) * dt));
    // 1. turn the car (stronger mid-speed, a little extra rotation while sliding)
    const fwd0 = c.vx * Math.cos(c.h) + c.vy * Math.sin(c.h);
    const sf = clamp(speed / 300, 0, 1) * lerp(1, 0.7, clamp((speed - 600) / 600, 0, 1));
    c.h += c.steer * 2.5 * sf * (1 + c.drift * 0.5) * Math.sign(fwd0 || 1) * dt;
    // let go of the keys and the car gently straightens up along its direction of travel
    if (Math.abs(input.steer) < 0.1 && speed > 120) {
      const va = Math.atan2(c.vy, c.vx);
      let d = va - c.h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.4) c.h += clamp(d, -1, 1) * Math.min(1, dt * 3);
    }
    // 2. split the motion into forward and sideways for the new heading
    const fx = Math.cos(c.h), fy = Math.sin(c.h), rx = -fy, ry = fx;
    let vf = c.vx * fx + c.vy * fy;
    let vl = c.vx * rx + c.vy * ry;
    // 3. engine and brakes push forward; tyres bleed off the sideways slide (less while drifting)
    if (input.throttle) vf += ACCEL * (c.nitroOn ? 1.6 : 1) * dt * (1 - Math.max(0, vf) / top);
    if (input.brake) vf -= (vf > 0 ? BRAKE : ACCEL * 0.5) * dt;
    vf = clamp(vf, -260, top);
    vf *= 1 - 0.25 * dt;
    const grip = lerp(9, 3.2, c.drift) * (input.hand ? 0.7 : 1);
    const lost = vl * (1 - Math.exp(-grip * dt));
    vl -= lost;
    vf += Math.abs(lost) * 0.35 * c.drift;   // some of the slide turns back into drive
    if (input.hand) vf *= 1 - 0.6 * dt;
    c.vx = fx * vf + rx * vl;
    c.vy = fy * vf + ry * vl;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.speed = Math.hypot(c.vx, c.vy);
    // walls
    c.idx = T.nearest(c.x, c.y, c.idx);
    T.ensure(c.idx + 260);
    const p = T.pts[c.idx];
    const off = T.offset(c.x, c.y, c.idx);
    const lim = p.w - CAR_R;
    c.hitT = Math.max(0, c.hitT - dt);
    this.wallDist = lim - Math.abs(off);
    if (this.wallDist < 26 && this.wallDist > 0) {
      const s = Math.sign(off), nx = -Math.sin(p.a) * s, ny = Math.cos(p.a) * s;
      const into = c.vx * nx + c.vy * ny;
      if (into > 0) { const k = into * (1 - Math.exp(-dt * 5)) * (1 - this.wallDist / 26); c.vx -= nx * k; c.vy -= ny * k; }
    }
    if (Math.abs(off) > lim) {
      const s = Math.sign(off), nx = -Math.sin(p.a) * s, ny = Math.cos(p.a) * s;  // outward normal
      c.x -= nx * (Math.abs(off) - lim); c.y -= ny * (Math.abs(off) - lim);
      const into = c.vx * nx + c.vy * ny;
      if (into > 0) {
        c.vx -= nx * into * 1.2; c.vy -= ny * into * 1.2;
        c.vx *= 0.88; c.vy *= 0.88;
        const hard = into > 360;
        if (c.hitT <= 0) {
          this.audio.play(hard ? 'crash' : 'scrape', clamp(into / 600, 0.3, 1));
          c.hitT = 0.25;
          if (hard) { this.shake = Math.max(this.shake, clamp(into / 40, 4, 16)); this.flash = 0.35; }
          if (hard && this.driftPts > 0) this.loseDrift();
        }
        for (let k = 0; k < Math.min(18, into / 25); k++) this.parts.push({ x: c.x + nx * CAR_R, y: c.y + ny * CAR_R, vx: -nx * Math.random() * 300 + (Math.random() - 0.5) * 300 + c.vx * 0.3, vy: -ny * Math.random() * 300 + (Math.random() - 0.5) * 300 + c.vy * 0.3, life: 0.5, max: 0.5, col: k % 2 ? '#ffd060' : '#ffffff', s: 2 });
      }
    }
    // checkpoints
    for (let i = (this.lastIdx ?? c.idx) + 1; i <= c.idx; i++) {
      if (T.pts[i] && T.pts[i].cp && !T.pts[i].hit) {
        T.pts[i].hit = true;
        if (this.runMode === 'attack') {
          const add = Math.max(5, 9 - i / 1500);
          this.timer += add;
          this.pop(`+${add.toFixed(1)}s`, YELLOW, 36, 1.4, -60);
        }
        this.audio.play('check');
      }
    }
    this.lastIdx = c.idx;
    { const f2x = Math.cos(c.h), f2y = Math.sin(c.h); const a2 = c.vx * f2x + c.vy * f2y, l2 = c.vx * -f2y + c.vy * f2x; return Math.atan2(l2, Math.max(1, Math.abs(a2))); }
  }

  // ------------------------------------------------------------ scoring
  loseDrift() {
    this.pop('CRASHED', RED, 34, 1.2, -40);
    this.audio.play('lost');
    this.driftPts = 0; this.driftOn = false; this.driftT = 0;
    this.mult = 1; this.chain = 0;
  }
  bank() {
    const pts = Math.round(this.driftPts);
    if (pts > 0) {
      this.score += pts;
      this.car.nitro = Math.min(1, this.car.nitro + pts / 4000);
      this.pop(`+${pts.toLocaleString()}`, CYAN, clamp(26 + pts / 200, 26, 54), 1.3, -50);
      this.audio.play('bank');
      this.longest = Math.max(this.longest, this.driftT);
    }
    this.driftPts = 0; this.driftOn = false; this.driftT = 0;
    this.gapT = 2.2;   // drift again within this to keep the multiplier
  }
  scoreDrift(dt, slip) {
    const c = this.car;
    const ang = Math.abs(slip);
    const drifting = ang > 0.2 && c.speed > 320;
    if (drifting) {
      if (!this.driftOn) { this.driftOn = true; this.driftT = 0; if (this.gapT <= 0) { this.mult = 1; this.chain = 0; } }
      this.calmT = 0;
      this.driftT += dt;
      this.multT += dt;
      if (this.multT > 1.3 && this.mult < 10) { this.multT = 0; this.mult++; this.bestMult = Math.max(this.bestMult, this.mult); this.audio.play('mult', 1 + this.mult * 0.08); this.pop(`x${this.mult}`, PINK, 30, 0.8, -90); }
      const close = this.wallDist < 42;
      if (close) { this.closeT -= dt; if (this.closeT <= 0) { this.closeT = 0.6; this.pop('CLOSE!', YELLOW, 22, 0.7, 40); this.audio.play('close'); } }
      this.driftPts += c.speed * Math.min(ang, 1.1) * dt * 0.9 * this.mult * (close ? 2 : 1);
    } else {
      this.multT = Math.max(0, this.multT - dt);
      if (this.driftOn) { this.calmT += dt; if (this.calmT > 0.45) this.bank(); }
      this.gapT = Math.max(0, this.gapT - dt);
      if (this.gapT <= 0 && !this.driftOn && this.mult > 1) { this.mult = 1; }
    }
  }

  // ------------------------------------------------------------ frame
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const playing = this.mode === 'play' && !this.ui.open;
    let input = { steer: 0, throttle: 0, brake: 0, hand: false, nitro: false };
    if (playing) {
      if (this.count > -1) {
        const before = Math.ceil(this.count);
        this.count -= dt;
        if (this.count > -dt && Math.ceil(this.count) !== before) this.audio.play(this.count <= 0 ? 'goGo' : 'go');
      }
      if (this.count <= 0 && !this.over) input = this.controls();
      if (!this.over) {
        const slip = this.updateCar(dt, input);
        this.slip = slip;
        if (this.count <= 0) this.scoreDrift(dt, slip);
        if (this.runMode === 'race') this.updateRace(dt);
        if (this.runMode === 'attack' && this.count <= 0) {
          this.timer -= dt;
          if (this.timer <= 0) this.gameOver();
        }
      } else {
        const c = this.car; c.vx *= 0.97; c.vy *= 0.97; c.x += c.vx * dt; c.y += c.vy * dt; c.speed = Math.hypot(c.vx, c.vy);
      }
      this.fx(dt, input);
    } else if (this.mode === 'title') {
      // attract mode: the car drives itself down the road
      const c = this.car, T = this.track;
      const tgt = T.pts[Math.min(T.pts.length - 1, c.idx + 9)];
      const want = Math.atan2(tgt.y - c.y, tgt.x - c.x);
      let d = want - c.h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      input = { steer: clamp(d * 3, -1, 1), throttle: 1, brake: 0, hand: Math.abs(d) > 0.5, nitro: false };
      this.slip = this.updateCar(dt, input);
      this.fx(dt, input);
    }
    this.audio.update(playing || this.mode === 'title' ? { speed: this.car.speed, throttle: input.throttle, drift: Math.abs(this.slip || 0) > 0.2 && this.car.speed > 300 ? Math.min(1, Math.abs(this.slip)) : 0, nitro: this.car.nitroOn } : null);
    this.render(dt);
  }
  updateRace(dt) {
    const T = this.track, c = this.car, go = this.count <= 0;
    if (go && this.finishT === null) this.raceClock += dt;
    const everyone = [c, ...this.rivals];
    for (const r of this.rivals) {
      r.update(dt, T, c, everyone, go);
      if (r.finished === null && r.idx >= RACE_LEN) r.finished = this.raceClock;
      if (Math.abs(r.slip) > 0.22 && r.speed > 300 && Math.random() < dt * 30) {
        const fx = Math.cos(r.h), fy = Math.sin(r.h);
        this.parts.push({ x: r.x - fx * 20, y: r.y - fy * 20, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 1.1, max: 1.1, col: '#ddd', s: 11, smoke: true });
      }
    }
    T.ensure(Math.max(...everyone.map((q) => q.idx)) + 260);
    // bumping: cars are circles; the push is shared, with a little spark
    for (let a = 0; a < everyone.length; a++) for (let b = a + 1; b < everyone.length; b++) {
      const A = everyone[a], B = everyone[b];
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), min = 34;
      if (d >= min || d < 0.01) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
      if (A === c || B === c) {
        const r = A === c ? B : A, s = A === c ? 1 : -1;
        const into = (c.vx * nx + c.vy * ny) * s;
        if (into > 0) { c.vx -= nx * s * into * 0.6; c.vy -= ny * s * into * 0.6; }
        r.speed = Math.max(0, r.speed * 0.985);
        if ((this.bumpT || 0) <= 0) { this.bumpT = 0.4; this.audio.play('scrape'); this.shake = Math.max(this.shake, 4); for (let k = 0; k < 6; k++) this.parts.push({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 0.4, max: 0.4, col: '#ffd060', s: 2 }); }
      }
    }
    this.bumpT = Math.max(0, (this.bumpT || 0) - dt);
    // positions
    const progress = (q) => (q.finished != null ? 1e6 - q.finished : q === c && this.finishT !== null ? 1e6 - this.finishT : q.idx);
    this.place = 1 + this.rivals.filter((r) => progress(r) > progress(c)).length;
    if (this.finishT === null && c.idx >= RACE_LEN) {
      this.finishT = this.raceClock;
      this.finishPlace = this.place;
      if (this.driftOn) this.bank();
      this.audio.play(this.place === 1 ? 'check' : 'bank');
      this.pop(this.place === 1 ? '1ST!' : ['', '', '2ND', '3RD', '4TH'][this.place], this.place === 1 ? '#ffd060' : '#ffffff', 64, 2.2, -40);
      setTimeout(() => this.raceOver(), 1800);
    }
  }
  raceOver() {
    if (this.mode !== 'play' || this.over) return;
    this.over = true;
    const t = this.finishT;
    const rows = [{ name: 'You', style: 'hatch', time: t, you: true }];
    for (const r of this.rivals) rows.push({ name: r.name, style: r.style, time: r.finished != null ? r.finished : t + ((RACE_LEN - r.idx) * STEP) / Math.max(400, r.speed) });
    rows.sort((a, b) => a.time - b.time);
    const place = rows.findIndex((r) => r.you) + 1;
    const newBest = !this.save.raceBest || t < this.save.raceBest;
    if (newBest) this.save.raceBest = t;
    if (place === 1) this.save.wins = (this.save.wins || 0) + 1;
    this.persist();
    this.ui.show('race', { rows, place, time: t, newBest, best: this.save.raceBest, score: this.score, wins: this.save.wins || 0 });
  }
  gameOver() {
    if (this.driftOn) this.bank();
    this.over = true;
    this.audio.play('over');
    const key = this.runMode === 'attack' ? 'best' : 'bestFree';
    const best = this.score > this.save[key];
    if (best) { this.save[key] = this.score; this.persist(); }
    setTimeout(() => this.ui.show('over', { score: this.score, best, top: this.save[key], dist: Math.round(this.car.idx * STEP / 100), longest: this.longest, mult: this.bestMult, mode: this.runMode }), 900);
  }
  fx(dt, input) {
    const c = this.car;
    const sliding = Math.abs(this.slip || 0) > 0.2 && c.speed > 300;
    // skid marks from both rear wheels while sliding
    const fx = Math.cos(c.h), fy = Math.sin(c.h);
    const wheel = (side) => ({ x: c.x - fx * 14 + -fy * side * 11, y: c.y - fy * 14 + fx * side * 11 });
    if (sliding) {
      for (const side of [-1, 1]) {
        const key = side < 0 ? 'leftSkid' : 'rightSkid';
        if (!this[key]) { this[key] = { pts: [], life: 7 }; this.trails.push(this[key]); }
        const w = wheel(side), pts = this[key].pts;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(last.x - w.x, last.y - w.y) > 6) pts.push(w);
        this[key].life = 7;
      }
      if (Math.random() < dt * 45) { const w = wheel(Math.random() < 0.5 ? -1 : 1); this.parts.push({ x: w.x, y: w.y, vx: (Math.random() - 0.5) * 70 - c.vx * 0.08, vy: (Math.random() - 0.5) * 70 - c.vy * 0.08, life: 1.3, max: 1.3, col: '#ddd', s: 12, smoke: true }); }
    } else { this.leftSkid = null; this.rightSkid = null; }
    for (const t of this.trails) if (t !== this.leftSkid && t !== this.rightSkid) t.life -= dt;
    this.trails = this.trails.filter((t) => t.life > 0);
    if (c.nitroOn && Math.random() < dt * 40) this.parts.push({ x: c.x - fx * 24, y: c.y - fy * 24, vx: -fx * 300 + (Math.random() - 0.5) * 80, vy: -fy * 300 + (Math.random() - 0.5) * 80, life: 0.3, max: 0.3, col: Math.random() < 0.5 ? '#6ac8ff' : '#ffffff', s: 3 });
    for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const p of this.pops) p.life -= dt;
    this.pops = this.pops.filter((p) => p.life > 0);
    this.shake *= Math.pow(0.003, dt);
    this.flash = Math.max(0, this.flash - dt);
    // camera follows behind, turning with the car, zooming out with speed
    const cam = this.cam;
    let dh = c.h - cam.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    cam.h += dh * Math.min(1, dt * 4.5);
    cam.x = lerp(cam.x, c.x + c.vx * 0.18, Math.min(1, dt * 8));
    cam.y = lerp(cam.y, c.y + c.vy * 0.18, Math.min(1, dt * 8));
    const scr = Math.min(this.W, this.H);
    cam.z = lerp(cam.z, (scr / 760) * lerp(1.05, 0.72, clamp(c.speed / 1200, 0, 1)), Math.min(1, dt * 2));
  }

  // ------------------------------------------------------------ drawing
  // A Japanese mountain pass at dusk, seen from above: asphalt, white lines,
  // steel guardrails, cedar forest, street lamps, and a white-and-black
  // 80s hatchback with pop-up headlights.
  textures() {
    if (this.tex) return this.tex;
    const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
    const asphalt = mk(256, 256, (x, w, h) => {
      x.fillStyle = '#45464c'; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 2600; k++) { const v = 50 + Math.random() * 40; x.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + Math.random() * 0.4})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      for (let k = 0; k < 4; k++) { x.fillStyle = 'rgba(25,25,30,0.08)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 8 + Math.random() * 20, Math.random() * 3, 0, 7); x.fill(); }
    });
    const ground = mk(256, 256, (x, w, h) => {
      x.fillStyle = '#2f4a2a'; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 1800; k++) { const g = 60 + Math.random() * 50; x.fillStyle = `rgba(${g * 0.55},${g},${g * 0.45},0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
      for (let k = 0; k < 40; k++) { x.fillStyle = 'rgba(70,58,40,0.35)'; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 8, 0, 7); x.fill(); }
    });
    this.tex = { asphalt: this.x.createPattern(asphalt, 'repeat'), ground: this.x.createPattern(ground, 'repeat') };
    this.light = document.createElement('canvas');
    return this.tex;
  }
  render(dt) {
    const x = this.x, W = this.W, H = this.H, c = this.car, T = this.track, cam = this.cam;
    const tex = this.textures();
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = '#1d2a1c'; x.fillRect(0, 0, W, H);
    x.save();
    const sh = this.shake;
    const ox = W / 2 + (Math.random() - 0.5) * sh, oy = H * 0.64 + (Math.random() - 0.5) * sh;
    const world = (ctx) => { ctx.translate(ox, oy); ctx.scale(cam.z, cam.z); ctx.rotate(-cam.h - Math.PI / 2); ctx.translate(-cam.x, -cam.y); };
    world(x);
    const R = Math.hypot(W, H) / cam.z;
    // forest floor
    x.fillStyle = tex.ground; x.fillRect(cam.x - R, cam.y - R, R * 2, R * 2);
    const i0 = Math.max(0, c.idx - 45), i1 = Math.min(T.pts.length - 1, c.idx + 170);
    const side = (off) => { const out = []; for (let i = i0; i <= i1; i++) { const p = T.pts[i], nx = -Math.sin(p.a), ny = Math.cos(p.a); out.push([p.x + nx * off(p), p.y + ny * off(p)]); } return out; };
    const band = (inner, outer, fill) => {
      const A = side(inner), B = side(outer);
      x.fillStyle = fill; x.beginPath(); x.moveTo(A[0][0], A[0][1]);
      for (const q of A) x.lineTo(q[0], q[1]);
      for (let k = B.length - 1; k >= 0; k--) x.lineTo(B[k][0], B[k][1]);
      x.closePath(); x.fill();
    };
    // gravel shoulders, then the asphalt
    band((p) => -p.w - 16, (p) => p.w + 16, '#6c6658');
    band((p) => -p.w, (p) => p.w, tex.asphalt);
    const line = (pts, col, w, dash) => {
      x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash || []);
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const q of pts) x.lineTo(q[0], q[1]); x.stroke();
      x.setLineDash([]);
    };
    // painted lines: solid white edges, dashed white centre (solid yellow through tight corners)
    line(side((p) => -p.w + 7), '#e8e6dc', 3);
    line(side((p) => p.w - 7), '#e8e6dc', 3);
    line(side(() => 0), 'rgba(240,238,228,0.85)', 3, [30, 30]);
    for (let i = i0; i < i1; i++) {
      const p = T.pts[i];
      if (Math.abs(p.k * 20) > 0.045) { const q = T.pts[i + 1]; x.strokeStyle = '#e8b830'; x.lineWidth = 3; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke(); }
    }
    // checkpoint: a chequered strip across the road
    for (let i = i0; i <= i1; i++) {
      const p = T.pts[i];
      if (!p.cp) continue;
      const nx = -Math.sin(p.a), ny = Math.cos(p.a), fx = Math.cos(p.a), fy = Math.sin(p.a);
      const n = Math.floor((p.w * 2) / 14);
      for (let k = 0; k < n; k++) for (let r2 = 0; r2 < 2; r2++) {
        x.fillStyle = (k + r2) % 2 ? (p.hit ? '#555' : '#111') : (p.hit ? '#999' : '#f4f4f0');
        const sx = p.x + nx * (-p.w + k * 14) + fx * r2 * 10, sy = p.y + ny * (-p.w + k * 14) + fy * r2 * 10;
        x.save(); x.translate(sx, sy); x.rotate(p.a); x.fillRect(0, 0, 10, 14); x.restore();
      }
    }
    // rubber on the road
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const t of this.trails) {
      if (t.pts.length < 2) continue;
      x.strokeStyle = `rgba(18,18,20,${0.55 * Math.min(1, t.life / 2.4)})`; x.lineWidth = 6;
      x.beginPath(); x.moveTo(t.pts[0].x, t.pts[0].y); for (const q of t.pts) x.lineTo(q.x, q.y); x.stroke();
    }
    // guardrails with posts
    for (const s of [-1, 1]) {
      const rail = side((p) => s * (p.w + 14));
      line(rail, 'rgba(0,0,0,0.35)', 7);
      line(rail, '#c3c7cf', 4);
      line(rail, '#eef0f4', 1.2);
      x.fillStyle = '#5a5e66';
      for (let k = 0; k < rail.length; k += 3) x.fillRect(rail[k][0] - 2.5, rail[k][1] - 2.5, 5, 5);
    }
    // roadside things
    const deco = T.slice(T.deco, i0, i1);
    for (const d of deco) {
      if (d.kind === 'rock') { x.fillStyle = '#6e6c66'; x.beginPath(); for (let k = 0; k < 7; k++) { const a = d.a + (k / 7) * 6.28, rr = d.r * (0.75 + ((k * 37) % 10) / 30); x.lineTo(d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr); } x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(d.x - d.r * 0.25, d.y - d.r * 0.25, d.r * 0.4, 0, 7); x.fill(); }
      else if (d.kind === 'chev') {
        x.save(); x.translate(d.x, d.y); x.rotate(d.a);
        x.fillStyle = '#f2c230'; x.fillRect(-9, -3, 18, 6);
        x.strokeStyle = '#111'; x.lineWidth = 2; x.beginPath(); x.moveTo(-4 * d.dir, -3); x.lineTo(2 * d.dir, 0); x.lineTo(-4 * d.dir, 3); x.stroke();
        x.restore();
      } else if (d.kind === 'vend') {
        x.save(); x.translate(d.x, d.y); x.rotate(d.a);
        x.fillStyle = d.c; x.fillRect(-9, -6, 18, 12); x.fillStyle = '#f4f4f0'; x.fillRect(-7, -6 * -d.side - 1 * d.side, 14, 3);
        x.restore();
      } else if (d.kind === 'lamp') {
        x.fillStyle = '#2c2c30'; x.beginPath(); x.arc(d.x, d.y, 3.5, 0, 7); x.fill();
        const nx = -Math.sin(d.a) * -d.side, ny = Math.cos(d.a) * -d.side;
        x.strokeStyle = '#2c2c30'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(d.x, d.y); x.lineTo(d.x + nx * 30, d.y + ny * 30); x.stroke();
        x.fillStyle = '#ffe6a8'; x.beginPath(); x.arc(d.x + nx * 30, d.y + ny * 30, 4, 0, 7); x.fill();
      }
    }
    // particles under the car: tyre smoke billows white-grey, sparks bright
    for (const q of this.parts) {
      const a = q.life / q.max;
      if (q.smoke) { x.fillStyle = `rgba(220,222,226,${a * 0.32})`; x.beginPath(); x.arc(q.x, q.y, q.s * (2.6 - a * 1.6), 0, 7); x.fill(); }
      else { x.fillStyle = q.col; x.globalAlpha = a; x.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); x.globalAlpha = 1; }
    }
    // the cars
    for (const r of this.rivals) drawCar(x, { x: r.x, y: r.y, h: r.drawH, steer: r.steer }, r.style, { braking: r.braking });
    drawCar(x, { x: c.x, y: c.y, h: c.h, steer: c.steer }, 'hatch', { braking: input_brake(this) });
    // finish banner
    if (T.finish && T.finish >= i0 && T.finish <= i1) {
      const p = T.pts[T.finish], nx = -Math.sin(p.a), ny = Math.cos(p.a);
      x.save(); x.translate(p.x, p.y); x.rotate(p.a);
      for (let k = 0; k < Math.floor(p.w * 2 / 12); k++) for (let r2 = 0; r2 < 3; r2++) { x.fillStyle = (k + r2) % 2 ? '#111' : '#f4f4f0'; x.fillRect(r2 * 10 - 15, -p.w + k * 12, 10, 12); }
      x.fillStyle = '#c81e24'; x.fillRect(-4, -p.w - 30, 8, p.w * 2 + 60);
      x.fillStyle = '#333'; x.fillRect(-6, -p.w - 34, 12, 8); x.fillRect(-6, p.w + 26, 12, 8);
      x.rotate(Math.PI / 2); x.fillStyle = '#ffffff'; x.font = 'italic 16px "Russo One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('F I N I S H', 0, 0);
      x.restore();
    }
    // cedar canopies over everything near the road edge
    const trees = T.slice(T.trees, i0, i1);
    const greens = [['#1f3d24', '#2c5530'], ['#24452a', '#33623a'], ['#1a3620', '#284a2c'], ['#2a4a26', '#3a6634']];
    for (const t of trees) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(t.x + 7, t.y + 9, t.r, 0, 7); x.fill(); }
    for (const t of trees) {
      const [d, l] = greens[t.t];
      x.fillStyle = d; x.beginPath(); x.arc(t.x, t.y, t.r, 0, 7); x.fill();
      x.fillStyle = l; x.beginPath(); x.arc(t.x - t.r * 0.22, t.y - t.r * 0.22, t.r * 0.62, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.arc(t.x - t.r * 0.35, t.y - t.r * 0.35, t.r * 0.28, 0, 7); x.fill();
    }
    x.restore();
    // ---- dusk lighting: darken everything, then cut out lamp pools and headlights
    const L = this.light, lx = L.getContext('2d');
    if (L.width !== this.cv.width || L.height !== this.cv.height) { L.width = this.cv.width; L.height = this.cv.height; }
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, L.width, L.height);
    lx.fillStyle = 'rgba(16,20,48,0.5)'; lx.fillRect(0, 0, L.width, L.height);
    lx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    world(lx);
    lx.globalCompositeOperation = 'destination-out';
    const hole = (px, py, r, a) => { const g = lx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = g; lx.beginPath(); lx.arc(px, py, r, 0, 7); lx.fill(); };
    const lamps = deco.filter((d) => d.kind === 'lamp');
    for (const d of lamps) { const nx = -Math.sin(d.a) * -d.side, ny = Math.cos(d.a) * -d.side; hole(d.x + nx * 40, d.y + ny * 40, 130, 0.85); }
    for (const r of this.rivals) {
      lx.save(); lx.translate(r.x, r.y); lx.rotate(r.drawH);
      const rb = lx.createLinearGradient(20, 0, 240, 0); rb.addColorStop(0, 'rgba(0,0,0,0.85)'); rb.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = rb; lx.beginPath(); lx.moveTo(18, -10); lx.lineTo(240, -80); lx.lineTo(240, 80); lx.lineTo(18, 10); lx.closePath(); lx.fill();
      lx.restore();
    }
    lx.save(); lx.translate(c.x, c.y); lx.rotate(c.h);
    const hb = lx.createLinearGradient(20, 0, 300, 0); hb.addColorStop(0, 'rgba(0,0,0,0.95)'); hb.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = hb; lx.beginPath(); lx.moveTo(18, -10); lx.lineTo(300, -95); lx.lineTo(300, 95); lx.lineTo(18, 10); lx.closePath(); lx.fill();
    lx.restore();
    hole(c.x, c.y, 60, 0.6);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(L, 0, 0);
    // warm light colour on top of the holes, and the red tail-light glow
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.save(); world(x);
    x.globalCompositeOperation = 'lighter';
    for (const d of lamps) { const nx = -Math.sin(d.a) * -d.side, ny = Math.cos(d.a) * -d.side, px = d.x + nx * 40, py = d.y + ny * 40; const g = x.createRadialGradient(px, py, 0, px, py, 120); g.addColorStop(0, 'rgba(255,190,90,0.22)'); g.addColorStop(1, 'rgba(255,190,90,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, 120, 0, 7); x.fill(); }
    x.translate(c.x, c.y); x.rotate(c.h);
    const tg = x.createRadialGradient(-24, 0, 0, -24, 0, 34); tg.addColorStop(0, `rgba(255,40,40,${input_brake(this) ? 0.6 : 0.3})`); tg.addColorStop(1, 'rgba(255,40,40,0)');
    x.fillStyle = tg; x.beginPath(); x.arc(-24, 0, 34, 0, 7); x.fill();
    x.restore();
    // ---- screen space
    if (c.speed > 760) {
      const k = clamp((c.speed - 760) / 500, 0, 1);
      x.strokeStyle = `rgba(255,255,255,${0.14 * k})`; x.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + this.time * 0.3, r1 = Math.max(W, H) * (0.45 + ((this.time * 3 + i * 0.37) % 1) * 0.3);
        x.beginPath(); x.moveTo(W / 2 + Math.cos(a) * r1, H * 0.6 + Math.sin(a) * r1); x.lineTo(W / 2 + Math.cos(a) * (r1 + 70), H * 0.6 + Math.sin(a) * (r1 + 70)); x.stroke();
      }
    }
    const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    if (this.flash > 0) { x.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`; x.fillRect(0, 0, W, H); }
    if (this.mode === 'play' && this.rivals.length) {
      const cs = Math.cos(-cam.h - Math.PI / 2), sn = Math.sin(-cam.h - Math.PI / 2);
      for (const r of this.rivals) {
        const dx = r.x - cam.x, dy = r.y - cam.y;
        const sx = ox + (dx * cs - dy * sn) * cam.z, sy = oy + (dx * sn + dy * cs) * cam.z;
        if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;
        this.label(r.name, sx, sy - 34, 13, STYLES[r.style].top === '#f2c21e' ? '#ffd060' : '#ffffff');
      }
    }
    if (this.mode === 'play') this.hud();
  }
  // racing-style text: bold italic white with a heavy dark outline
  label(s, px, py, size, col = '#ffffff', align = 'center') {
    const x = this.x;
    x.font = `italic ${size}px "Russo One", "Segoe UI", sans-serif`;
    x.textAlign = align; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = Math.max(3, size * 0.16); x.strokeStyle = 'rgba(10,10,14,0.9)';
    x.strokeText(s, px, py);
    x.fillStyle = col; x.fillText(s, px, py);
  }
  hud() {
    const x = this.x, W = this.W, H = this.H, c = this.car;
    const s = Math.min(1, W / 900);
    if (this.runMode === 'race') { this.raceHud(); return; }
    this.label(this.score.toLocaleString(), W / 2, 46 * s + 8, 44 * s + 10, '#ffffff');
    if (this.runMode === 'attack') {
      const t = Math.max(0, this.timer), bw = Math.min(420, W * 0.5), bx = W / 2 - bw / 2, by = 90 * s + 12;
      x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(bx - 2, by - 2, bw + 4, 12);
      x.fillStyle = t < 8 ? (Math.sin(this.time * 14) > 0 ? '#ff4040' : '#ffb020') : '#ffb020';
      x.fillRect(bx, by, bw * Math.min(1, t / 45), 8);
      this.label(t.toFixed(1), W / 2, by + 28, 20, t < 8 ? '#ff6050' : '#ffd060');
    } else this.label('FREE RUN', W / 2, 98 * s + 12, 16, '#ffd060');
    if (this.driftPts > 1) this.label(Math.round(this.driftPts).toLocaleString(), W / 2, H * 0.64 + 72, 30, '#ffe060');
    if (this.mult > 1) this.label(`x${this.mult}`, W / 2, H * 0.64 + 106, 24, this.gapT > 0 && !this.driftOn ? '#9aa0b0' : '#ff8a3a');
    for (const p of this.pops) {
      const k = p.life / p.max, sc = 1 + (1 - k) * 0.25;
      x.globalAlpha = Math.min(1, k * 2);
      this.label(p.text, W / 2, H * 0.5 + p.dy - (1 - k) * 40, p.size * sc, p.color);
    }
    x.globalAlpha = 1;
    this.gauge();
    this.label(`BEST ${(this.runMode === 'attack' ? this.save.best : this.save.bestFree).toLocaleString()}`, 20, 30, 15, '#ffd060', 'left');
    if (this.count > 0) {
      const n = Math.ceil(this.count), k = this.count - Math.floor(this.count);
      x.globalAlpha = Math.min(1, k * 3);
      this.label(n > 3 ? '' : `${n}`, W / 2, H * 0.42, 110 + (1 - k) * 40, n === 1 ? '#ff6a3a' : '#ffffff');
      x.globalAlpha = 1;
      this.label(this.isTouch ? 'HOLD LEFT / RIGHT SIDE TO STEER  ·  BOTH = HANDBRAKE' : 'W GAS  ·  A / D STEER  ·  TURN AT SPEED TO DRIFT  ·  SPACE HANDBRAKE', W / 2, H * 0.42 + 100, 15, '#ffd060');
    } else if (this.count > -0.8) {
      x.globalAlpha = Math.max(0, 1 + this.count / 0.8);
      this.label('GO!', W / 2, H * 0.42, 120, '#ff8a3a');
      x.globalAlpha = 1;
    }
  }
}

Game.prototype.gauge = function () {
  const x = this.x, W = this.W, H = this.H, c = this.car;
  // rev gauge, bottom right
  const gx = W - 92, gy = H - 86, gr = 66;
  x.fillStyle = 'rgba(10,10,14,0.75)'; x.beginPath(); x.arc(gx, gy, gr + 8, 0, 7); x.fill();
  x.strokeStyle = '#3a3a44'; x.lineWidth = 8; x.beginPath(); x.arc(gx, gy, gr - 6, Math.PI * 0.75, Math.PI * 2.25); x.stroke();
  const sp = clamp(c.speed / 1300, 0, 1);
  x.strokeStyle = sp > 0.78 ? '#ff4a3a' : '#ffb020'; x.beginPath(); x.arc(gx, gy, gr - 6, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * sp)); x.stroke();
  x.strokeStyle = '#ffffff'; x.lineWidth = 2;
  for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.75 + 1.5 * k / 8); x.beginPath(); x.moveTo(gx + Math.cos(a) * (gr - 14), gy + Math.sin(a) * (gr - 14)); x.lineTo(gx + Math.cos(a) * (gr - 20), gy + Math.sin(a) * (gr - 20)); x.stroke(); }
  const na = Math.PI * (0.75 + 1.5 * sp);
  x.strokeStyle = '#ff3a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + Math.cos(na) * (gr - 12), gy + Math.sin(na) * (gr - 12)); x.stroke();
  this.label(`${Math.round(c.speed * 0.2)}`, gx, gy + 22, 26);
  this.label('km/h', gx, gy + 44, 11, '#bbbbbb');
  // nitro
  const nb = 140;
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(W - 24 - nb - 150, H - 30, nb, 8);
  x.fillStyle = c.nitro > 0.05 ? '#4ab8ff' : '#2a4a66'; x.fillRect(W - 24 - nb - 150, H - 30, nb * c.nitro, 8);
  this.label(this.isTouch ? 'NITRO' : 'SHIFT NITRO', W - 24 - 150, H - 44, 12, c.nitro > 0.05 ? '#8fd4ff' : '#7a8899', 'right');
};

Game.prototype.raceHud = function () {
  const x = this.x, W = this.W, H = this.H, c = this.car, T = this.track;
  // position, big, top left
  const suf = ['', 'ST', 'ND', 'RD', 'TH'][this.place] || 'TH';
  this.label(`${this.place}`, 34, 52, 64, this.place === 1 ? '#ffd060' : '#ffffff', 'left');
  this.label(`${suf} / ${this.rivals.length + 1}`, 34 + (this.place === 1 ? 30 : 40), 66, 20, '#ffffff', 'left');
  // race clock
  const t = this.finishT ?? this.raceClock;
  this.label(`${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`, W / 2, 40, 32, '#ffffff');
  // progress strip with everyone's dot
  const bw = Math.min(460, W * 0.55), bx = W / 2 - bw / 2, by = 72;
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(bx - 2, by - 2, bw + 4, 10);
  x.fillStyle = '#3a3a44'; x.fillRect(bx, by, bw, 6);
  for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#111' : '#eee'; x.fillRect(bx + bw - 4, by - 4 + k * 2, 4, 2); }
  for (const r of this.rivals) { const f = Math.min(1, r.idx / RACE_LEN); x.fillStyle = STYLES[r.style].top; x.beginPath(); x.arc(bx + bw * f, by + 3, 6, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.5; x.stroke(); }
  const f = Math.min(1, c.idx / RACE_LEN); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(bx + bw * f, by + 3, 7.5, 0, 7); x.fill(); x.strokeStyle = '#ff8a1e'; x.lineWidth = 3; x.stroke();
  // drift bonus and speed gauge from the normal HUD
  if (this.driftPts > 1) this.label(Math.round(this.driftPts).toLocaleString(), W / 2, H * 0.64 + 72, 26, '#ffe060');
  for (const p of this.pops) { const k = p.life / p.max; x.globalAlpha = Math.min(1, k * 2); this.label(p.text, W / 2, H * 0.5 + p.dy - (1 - k) * 40, p.size * (1 + (1 - k) * 0.25), p.color); }
  x.globalAlpha = 1;
  this.gauge();
  if (this.count > 0) {
    // start lights: three reds, then green
    const n = Math.ceil(this.count);
    const lx = W / 2 - 75, ly = H * 0.36;
    x.fillStyle = 'rgba(10,10,14,0.85)'; x.beginPath(); x.roundRect(lx - 16, ly - 30, 182, 60, 10); x.fill();
    for (let k = 0; k < 3; k++) { x.fillStyle = 3 - k >= n && n <= 3 ? '#ff2a2a' : '#3a1a1a'; x.beginPath(); x.arc(lx + 15 + k * 60, ly, 20, 0, 7); x.fill(); }
    this.label(this.isTouch ? 'HOLD LEFT / RIGHT TO STEER' : 'W GAS  ·  A / D STEER  ·  BEAT THE RIVALS TO THE FINISH', W / 2, ly + 60, 15, '#ffd060');
  } else if (this.count > -0.8) {
    const lx = W / 2 - 75, ly = H * 0.36;
    x.globalAlpha = Math.max(0, 1 + this.count / 0.8);
    x.fillStyle = 'rgba(10,10,14,0.85)'; x.beginPath(); x.roundRect(lx - 16, ly - 30, 182, 60, 10); x.fill();
    for (let k = 0; k < 3; k++) { x.fillStyle = '#2aff6a'; x.beginPath(); x.arc(lx + 15 + k * 60, ly, 20, 0, 7); x.fill(); }
    x.globalAlpha = 1;
  }
};

function input_brake(g) { return g.keys.has('KeyS') || g.keys.has('ArrowDown'); }

new Game();
