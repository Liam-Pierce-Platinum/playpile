// WRECKING BALL - swing a crane's wrecking ball through a city block and do
// as much damage as you can in 30 seconds. Real rigid-body physics: blocks
// are welded together and the welds snap, so floors pancake and towers topple.
import { World, Body } from './physics.js';
import { LEVELS, DISTRICTS, MATS, UPG, buildLevel } from './levels.js';
import { FX, money } from './fx.js';
import { Renderer, OUT } from './draw.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'pd.wrecking-ball';
const ROUND = 30, SETTLE = 2.6, READY = 1.0;
const MAX_BODIES = 440, SUBDT = 1 / 120;
const VMAX = 8, ACC = 20, WINCH = 6.5;
const IMPACT_THR = 2.6, FALL_THR = 4.2, FALL_K = 0.55, COMBO_WINDOW = 1.2, COMBO_STEP = 0.25;
const TIPS = [
  'rock the trolley back and forth in time with the swing to build real speed.',
  'take out the ground-floor columns and everything above comes down.',
  'gas tanks set off chain reactions. Swing into them.',
  'topple a tall building into its neighbour for a big chain.',
  'upgrades in the Garage make every hit count.',
  'lower the cable for the bottom of the swing, raise it to whip the ball up.',
];
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.fx = new FX();
    this.r = new Renderer(this.ctx);
    this.save = { bank: 0, best: {}, stars: {}, unlocked: 1, upg: { weight: 0, cable: 0, spike: 0, chain: 0 }, use: { spike: true, chain: true }, music: 0.55, sfx: 0.9, muted: false, rounds: 0 };
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      for (const k of Object.keys(s)) this.save[k] = (typeof s[k] === 'object' && s[k] && !Array.isArray(s[k])) ? Object.assign(this.save[k] || {}, s[k]) : s[k];
    } catch (e) { /* storage blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx; this.audio.muted = !!this.save.muted;
    this.mode = 'title';
    this.rt = 0; this.bot = params.has('bot'); this.speed = clamp(parseInt(params.get('speed') || '1', 10) || 1, 1, 8);
    this.cam = { x: 0, y: 0, s: 20, ox: 0, oy: 0 };
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.attract();
    this.ui.show('title');
    if (params.has('play')) this.start(clamp(parseInt(params.get('level') || params.get('play'), 10) || 1, 1, LEVELS.length));
    window.__G = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr; this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
  }

  // ------------------------------------------------------------ input
  input() {
    this.keys = new Set(); this.drag = null; this.wheel = 0;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'play' || this.ui.open) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    cv.addEventListener('pointermove', (e) => { if (this.drag && this.drag.id === e.pointerId) { this.drag.x = e.clientX; this.drag.y = e.clientY; } });
    const up = (e) => { if (this.drag && this.drag.id === e.pointerId) this.drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { if (this.mode === 'play') { this.wheel += Math.sign(e.deltaY) * 0.9; e.preventDefault(); } }, { passive: false });
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open) { if (this.ui.panel === 'pause') this.ui.close(); else if (this.ui.panel !== 'title' && this.ui.panel !== 'result') this.ui.back(); return; }
        if (this.mode === 'play' && this.phase !== 'done') { this.audio.play('click'); this.ui.show('pause'); }
        return;
      }
      if (e.code === 'KeyR' && this.mode === 'play' && (!this.ui.open || this.ui.panel === 'result' || this.ui.panel === 'pause')) { this.start(this.levelN); return; }
      if ((e.code === 'Enter' || e.code === 'Space') && this.ui.open) { this.ui.primary(); return; }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.drag = null; if (this.mode === 'play' && !this.ui.open && this.phase !== 'done') this.ui.show('pause'); });
  }
  cableInput(v) { if (this.crane) this.cableTarget = this.crane.Lmin + (1 - v) * (this.crane.Lmax - this.crane.Lmin); }
  screenToWorldX(px) { return (px - this.W / 2 - this.cam.ox) / this.cam.s + this.cam.x; }

  // ------------------------------------------------------------ setup
  attract() { this.load(1, true); this.mode = 'title'; this.demoT = 0; }
  toTitle() { this.ui.hud(false); this.attract(); this.ui.show('title'); }
  start(n) {
    this.levelN = n;
    this.load(n, false);
    this.mode = 'play';
    this.ui.close(); this.ui.hud(true);
    this.say('READY', DISTRICTS[this.L.district].name + ' · ' + this.L.lv.name, '#ffe066', READY + 0.2);
    this.save.rounds = (this.save.rounds || 0) + 1;
  }
  load(n, demo) {
    this.demo = demo; this.levelN = n;
    const w = this.world = new World();
    const L = this.L = buildLevel(w, n);
    w.onImpact = (a, vn) => this.impact(a, vn);
    w.onBreak = (j) => this.jointBreak(j);
    w.impactMin = Math.min(IMPACT_THR, FALL_THR);
    this.fx.clear();
    const up = demo ? { weight: 1, cable: 1, spike: 0, chain: 0 } : this.save.upg;
    const T = UPG.weight.tiers[up.weight || 0];
    const mastX = L.minX - 3.4, jibY = L.maxH + 4.4;
    const cr = this.crane = { mastX, jibY, minX: mastX + 1.8, maxX: L.maxX + 2.4, jibEnd: L.maxX + 3.3, cjEnd: mastX - 5.4, x: mastX + 2.4, vx: 0, Lmin: 2.2 };
    cr.Lfull = jibY - 0.45 - T.r - 0.35;
    cr.Lmax = Math.max(cr.Lmin + 2, cr.Lfull * UPG.cable.tiers[up.cable || 0].k);
    cr.L = Math.min(cr.Lmax, 4.5);
    this.cableTarget = null;
    this.spiked = !!(up.spike && (demo || this.save.use.spike));
    this.chained = !!(up.chain && (demo || this.save.use.chain));
    const dens = T.m / (Math.PI * T.r * T.r);
    const ball = w.add(new Body({ x: cr.x, y: jibY - 0.45 - cr.L, r: T.r, density: dens, friction: 0.5, noSleep: true, data: { ball: true } }));
    this.rope = w.rope(ball, null, cr.L);
    this.balls = [ball];
    if (this.chained) {
      const b2 = w.add(new Body({ x: cr.x, y: ball.y - 2.1, r: T.r * 0.76, density: dens, friction: 0.5, noSleep: true, data: { ball: true } }));
      w.rope(b2, ball, 2.1);
      this.balls.push(b2);
    }
    this.ballMul = 1.4 * Math.sqrt(T.m / 26) * (this.spiked ? 2 : 1);
    // round state
    this.damage = 0; this.combo = 0; this.comboT = 0; this.gt = 0; this.chainAt = 0; this.maxCombo = 0; this.levelled = 0;
    this.time = ROUND; this.phase = 'ready'; this.phaseT = 0;
    this.slowT = 0; this.slowAmt = 0; this.slowCd = 0; this.stop = 0; this.shake = 0;
    this.dmgWin = []; this.trail = []; this.pendExpl = []; this.banner = null; this.lastTick = 99;
    this.botT = 0; this.drag = null; this.wheel = 0;
    this.camInit = false;
    this.ui.setCable(1 - (cr.L - cr.Lmin) / (cr.Lmax - cr.Lmin));
  }
  mult() { return 1 + Math.min(this.combo, 50) * 0.04; }
  buy(k) {
    const s = this.save, U = UPG[k], lvl = s.upg[k] || 0, nx = U.tiers[lvl + 1];
    if (!nx || s.bank < nx.cost) return false;
    s.bank -= nx.cost; s.upg[k] = lvl + 1; if (U.toggle) s.use[k] = true; this.persist(); return true;
  }

  // ------------------------------------------------------------ damage
  impact(a, vn) {
    const b1 = a.b1, b2 = a.b2;
    const im = (b1.static ? 0 : b1.im) + (b2.static ? 0 : b2.im);
    if (!im) return;
    const ballHit = (b1.data && b1.data.ball) || (b2.data && b2.data.ball);
    // falls and debris hurt less than the ball does: rubble should pile up, not vanish
    const thr = ballHit ? IMPACT_THR : FALL_THR;
    if (vn <= thr) return;
    const E = 0.5 * (1 / im) * (vn - thr) ** 2 * (ballHit ? 1 : FALL_K);
    if (E < 0.4) return;
    for (const [b, o] of [[b1, b2], [b2, b1]]) {
      const d = b.data; if (!d || !d.mat || d.dead) continue;
      let dmg = E;
      if (o.data && o.data.ball) {
        dmg *= this.ballMul;
        if (this.spiked && vn > 3) for (const j of b.joints.slice()) if (Math.random() < 0.6) this.world.breakJoint(j);
      }
      this.hurt(b, dmg);
    }
    const x = a.px, y = a.py;
    const blk = b1.data && b1.data.mat ? b1 : b2.data && b2.data.mat ? b2 : null;
    if (ballHit) {
      this.shake = Math.min(1.6, this.shake + Math.min(0.8, E * 0.006));
      if (E > 90) this.stop = Math.max(this.stop, 0.05);
      if (E > 8) this.audio.play('ball', E / 120);
      const bb = b1.data && b1.data.ball ? b1 : b2;
      if (E > 6) { const c = a.cs[0]; bb.data.sq = Math.min(0.28, Math.max(bb.data.sq || 0, E / 400)); bb.data.sqA = Math.atan2(c.ny, c.nx); }
      if (!blk && E > 6) { this.fx.puff(x, y, 0.8, '#b8a8c0', 2); }
    }
    if (blk && E > 1.2) {
      const M = MATS[blk.data.mat];
      if (E > 3.5) this.fx.puff(x, y, 0.3 + Math.min(1, E / 60), M.dust, E > 25 ? 2 : 1);
      if ((blk.data.mat === 'steel' || blk.data.mat === 'metal' || blk.data.mat === 'lamp' || blk.data.mat === 'car' || blk.data.mat === 'tank') && vn > 4) this.fx.sparks(x, y, Math.min(14, 3 + vn), 0, 1, 6 + vn * 0.4);
      if (E > 10) this.fx.chunks(x, y, 2, M.chunk, 3, 0.08);
      this.audio.play(M.snd, Math.min(1, E / 40));
    }
  }
  hurt(b, dmg) {
    const d = b.data;
    if (d.part === 'car') {
      if (dmg < 1.5) return;
      const was = d.crumple;
      d.crumple = Math.min(1, d.crumple + dmg / 60);
      if (was < 0.12 && d.crumple >= 0.12) { d.alarm = 4; this.audio.play('alarm'); }
      this.audio.play('car', dmg / 40);
      this.pay(b);
      return;
    }
    d.hp -= dmg;
    if (d.hp <= 0) { this.kill(b); return; }
    const k = Math.max(0.3, d.hp / d.hpMax);
    for (const j of b.joints) j.weak = Math.min(j.weak, k);
    this.pay(b);
  }
  pay(b) {
    const d = b.data; if (!d.val) return;
    let frac;
    if (d.part === 'car') frac = Math.min(1, d.crumple + (d.wrecked ? 0.3 : 0));
    else frac = d.dead ? 1 : Math.min(1, (d.wrecked ? 0.5 : 0) + 0.5 * (1 - Math.max(0, d.hp) / d.hpMax));
    if (frac <= d.paid + 1e-4) return;
    const gain = (frac - d.paid) * d.val; d.paid = frac;
    this.credit(gain, b.x, b.y, d.noBld ? null : d.bld);
  }
  credit(v, x, y, bld) {
    if (this.phase === 'done') return;
    if (v >= 1200) {
      // the chain grows at most once per COMBO_STEP of game time, so it measures how long
      // the destruction keeps going, not how many bits of rubble one collapse makes
      if (this.comboT <= 0) { this.combo = 1; this.chainAt = this.gt; }
      else if (this.gt - this.chainAt >= COMBO_STEP) { this.combo++; this.chainAt = this.gt; }
      this.comboT = COMBO_WINDOW;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      if (this.combo > 2) this.audio.play('chain', this.combo);
    }
    const add = v * this.mult();
    this.damage += add;
    if (add >= 900) this.fx.pop(x, y + 0.6, add, this.combo >= 10 ? '#ff9b5e' : '#ffe066');
    this.dmgWin.push([this.rt, add]);
    if (bld) {
      bld.paid += v;
      if (!bld.done && bld.paid >= bld.value * 0.62) {
        bld.done = true; this.levelled++;
        const bonus = bld.value * 0.25 * this.mult();
        this.damage += bonus;
        this.say('DEMOLISHED!', bld.name + ' +' + money(bonus), '#ffc233');
        this.audio.play('demolish'); this.audio.play('rumble', 1);
        this.shake = Math.min(1.8, this.shake + 0.6);
      }
    }
  }
  say(text, sub, col = '#ffe066', life = 1.6) { this.banner = { text, sub, col, t: 0, life }; }
  kill(b) {
    const d = b.data; if (d.dead) return;
    d.dead = true; this.pay(b);
    const M = MATS[d.mat], area = 4 * b.hw * b.hh;
    this.world.remove(b);
    if (d.part === 'tank') { this.pendExpl.push({ x: b.x, y: b.y, t: 0.07 }); return; }
    if (d.mat === 'glass') { this.fx.shards(b.x, b.y, Math.min(30, 6 + (area * 12) | 0), b.hw, b.hh, b.vx, b.vy); this.audio.play('glass', 1); return; }
    if (d.part === 'watertank') {
      this.fx.water(b.x, b.y, 110); this.fx.puff(b.x, b.y, 1.6, '#d8f3ff', 5, 1.5); this.fx.chunks(b.x, b.y, 10, M.chunk, 6, 0.14);
      this.audio.play('splash'); this.fx.pop(b.x, b.y + 1.5, 'SPLASH!', '#9fe3ff', 1.4); this.shake = Math.min(1.6, this.shake + 0.5);
      return;
    }
    this.fx.chunks(b.x, b.y, Math.min(18, 4 + (area * 7) | 0), M.chunk, 4.5, 0.08 + Math.min(0.12, area * 0.05));
    this.fx.puff(b.x, b.y, 0.5 + Math.min(1.2, area * 0.35), M.dust, 2);
    if (!d.frag && area > 0.45 && this.world.bodies.length < MAX_BODIES && d.mat !== 'car') {
      const long = b.hw >= b.hh;
      for (const s of [-1, 1]) {
        const hw = long ? b.hw / 2 : b.hw, hh = long ? b.hh : b.hh / 2;
        const [wx, wy] = b.toWorld(long ? s * b.hw / 2 : 0, long ? 0 : s * b.hh / 2);
        const f = new Body({ x: wx, y: wy, hw: hw * 0.94, hh: hh * 0.94, a: b.a + rand(-0.1, 0.1), density: M.d, friction: M.fr });
        f.vx = b.vx - b.w * (wy - b.y) + rand(-1.5, 1.5); f.vy = b.vy + b.w * (wx - b.x) + rand(0, 2); f.w = b.w + rand(-3, 3);
        f.data = { mat: d.mat, part: d.part === 'stack' ? 'stack' : d.part === 'roof' ? 'roof' : 'frag', hp: M.hp * 0.45, hpMax: M.hp * 0.45, val: 0, paid: 1, frag: true, seed: Math.random(), hx: wx, hy: wy, ha: f.a, wrecked: true };
        this.world.add(f);
      }
    }
  }
  explode(x, y) {
    const R = 4.6;
    for (const o of this.world.near(x, y, R)) {
      if (o.dead) continue;
      const dx = o.x - x, dy = o.y - y, dist = Math.hypot(dx, dy) || 0.1, f = 1 - dist / R;
      if (f <= 0) continue;
      const J = 32 * f * Math.sqrt(o.m);
      o.applyImpulse((dx / dist) * J, (dy / dist) * J + J * 0.35, o.x + rand(-0.1, 0.1), o.y + rand(-0.1, 0.1));
      if (o.data && o.data.mat) {
        for (const j of o.joints.slice()) if (Math.random() < f * 1.2) this.world.breakJoint(j);
        this.hurt(o, 46 * f);
      }
    }
    this.fx.fire(x, y, 46, 1.2); this.fx.puff(x, y, 1.8, '#5a4a60', 6, 1.6); this.fx.puff(x, y, 1.2, '#ffb15c', 3, 1);
    this.fx.ring(x, y, R * 1.2); this.fx.sparks(x, y, 26, 0, 1, 14); this.fx.chunks(x, y, 10, '#8a1c27', 9, 0.12);
    this.fx.flash = 0.7; this.shake = Math.min(2.2, this.shake + 1.3); this.stop = Math.max(this.stop, 0.07);
    this.audio.play('boom'); this.fx.pop(x, y + 1.8, 'KABOOM!', '#ff9b5e', 1.6); this.lastBoom = this.rt;
  }
  jointBreak(j) {
    if (Math.random() < 0.5) this.audio.play('snap', 0.6);
    const b = j.b1; if (Math.random() < 0.4) this.fx.puff(b.x, b.y, 0.35, MATS[(b.data && b.data.mat) || 'concrete'].dust, 1);
  }

  // ------------------------------------------------------------ loop
  loop(t) {
    let dt = (t - this.last) / 1000; this.last = t;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 1 / 30);
    this.rt += dt; this.frames = (this.frames || 0) + 1;
    const sp = this.speed || 1;
    for (let i = 0; i < sp; i++) { try { this.update(dt); } catch (e) { console.error(e); } }
    this.draw(dt);
    requestAnimationFrame((tt) => this.loop(tt));
  }
  update(dt) {
    const paused = this.ui.open && this.mode === 'play';
    this.audio.intensity = clamp(this.combo / 20, 0, 1);
    const ball = this.balls[0];
    this.audio.update(this.crane.vx, Math.hypot(ball.vx, ball.vy), this.mode === 'play' && !paused, this.slowAmt > 0.3);
    if (paused) return;
    // time scale: hit-stop, then slow-mo
    this.slowT -= dt; this.slowCd -= dt;
    this.slowAmt += ((this.slowT > 0 ? 1 : 0) - this.slowAmt) * Math.min(1, dt * 6);
    let ts = 1 - 0.72 * this.slowAmt;
    if (this.stop > 0) { this.stop -= dt; ts = 0.06; }
    const gdt = dt * ts;

    if (this.mode === 'play') this.phaseLogic(dt, gdt);
    else { this.demoT += dt; if (this.demoT > 26 || (this.demoT > 12 && this.levelled >= this.L.blds.length - 1)) this.attract(); }

    const n = Math.max(1, Math.ceil(gdt / SUBDT - 1e-6)), h = gdt / n;
    for (let i = 0; i < n && gdt > 0; i++) {
      this.controlCrane(h);
      this.world.step(h);
      for (let k = this.pendExpl.length - 1; k >= 0; k--) { const e = this.pendExpl[k]; e.t -= h; if (e.t <= 0) { this.pendExpl.splice(k, 1); this.explode(e.x, e.y); } }
    }
    this.postStep(gdt, dt);
    this.fx.update(gdt);
  }
  phaseLogic(dt, gdt) {
    this.phaseT += dt;
    if (this.phase === 'ready') {
      if (this.phaseT >= READY) { this.phase = 'live'; this.phaseT = 0; this.say('WRECK IT!', 'Target ' + money(this.L.target), '#ffc233', 1.1); this.audio.play('go'); }
    } else if (this.phase === 'live') {
      this.time -= gdt;
      const sec = Math.ceil(this.time);
      if (sec <= 5 && sec < this.lastTick && sec > 0) { this.lastTick = sec; this.audio.play('tick'); }
      if (this.time <= 0) { this.time = 0; this.phase = 'settle'; this.phaseT = 0; this.say('TIME!', 'damage still counts while it falls', '#ff6b6b', 1.4); this.audio.play('buzzer'); }
    } else if (this.phase === 'settle') {
      if (this.phaseT >= SETTLE) this.finish();
    }
  }
  controlCrane(h) {
    const cr = this.crane;
    const live = this.mode !== 'play' || this.phase === 'live' || this.phase === 'ready';
    let want = 0, kdir = 0;
    if (live && (this.bot || this.mode !== 'play')) { [want, kdir] = this.botControl(h); }
    else if (live) {
      const dir = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      if (this.drag) want = clamp((this.screenToWorldX(this.drag.x) - cr.x) * 5, -VMAX, VMAX);
      else want = dir * VMAX;
      kdir = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
      if (this.wheel) { this.cableTarget = clamp((this.cableTarget ?? cr.L) + this.wheel, cr.Lmin, cr.Lmax); this.wheel = 0; }
    }
    cr.vx += clamp(want - cr.vx, -ACC * h, ACC * h);
    cr.x += cr.vx * h;
    if (cr.x < cr.minX) { cr.x = cr.minX; cr.vx = Math.max(0, cr.vx); }
    if (cr.x > cr.maxX) { cr.x = cr.maxX; cr.vx = Math.min(0, cr.vx); }
    if (kdir) { cr.L += kdir * WINCH * h; this.cableTarget = null; }
    else if (this.cableTarget != null) { const d = this.cableTarget - cr.L; cr.L += clamp(d, -WINCH * h, WINCH * h); }
    cr.L = clamp(cr.L, cr.Lmin, cr.Lmax);
    const r = this.rope; r.len = cr.L; r.ax = cr.x; r.ay = cr.jibY - 0.45; r.avx = cr.vx; r.avy = 0;
  }
  // a simple pumping bot: drive the trolley against the ball's swing to add energy,
  // centred on a target building. Used for the title attract and for tests.
  botControl(h) {
    const cr = this.crane, b = this.balls[0];
    this.botT -= h;
    if (this.botT <= 0 || this.botX == null) {
      const open = this.L.blds.filter((x) => !x.done);
      const pickFrom = this.world.bodies.filter((o) => o.data && o.data.val && !o.data.dead && !o.data.wrecked);
      const tgt = pickFrom.length ? pickFrom[Math.floor(Math.random() * pickFrom.length)] : null;
      this.botX = tgt ? tgt.x : (this.L.minX + this.L.maxX) / 2;
      this.botY = tgt ? tgt.y : 2;
      this.botT = rand(3.5, 6) * (open.length ? 1 : 0.5);
    }
    const vrel = b.vx - cr.vx;
    const want = clamp(-Math.sign(vrel) * VMAX * 0.95 + (this.botX - cr.x) * 1.2, -VMAX, VMAX);
    const Lw = clamp(cr.jibY - 0.45 - this.botY, cr.Lmin, cr.Lmax);
    this.cableTarget = Lw;
    return [want, 0];
  }
  postStep(gdt, dt) {
    const w = this.world;
    this.gt += gdt;
    // wreck check + chimney smoke + cleanup
    let frags = 0;
    for (const b of w.bodies) {
      const d = b.data; if (!d || !d.mat) continue;
      if (d.frag) frags++;
      if (b.y < -8) { w.remove(b); continue; }
      if (d.alarm > 0) d.alarm -= gdt;
      if (d.smoke && !d.dead && Math.abs(b.a) < 0.5) { d.st = (d.st || 0) - gdt; if (d.st <= 0) { d.st = 0.14; this.fx.smoke(b.x + rand(-0.2, 0.2), b.y + b.hh + 0.2, 0.35); } }
      if (!b.awake || d.wrecked || !d.val) continue;
      if (Math.hypot(b.x - d.hx, b.y - d.hy) > 0.7 || Math.abs(b.a - d.ha) > 0.35) { d.wrecked = true; this.pay(b); }
    }
    if (w.bodies.length > MAX_BODIES - 10) {
      for (const b of w.bodies) if (b.data && b.data.frag && !b.awake) { w.remove(b); this.fx.chunks(b.x, b.y, 3, MATS[b.data.mat].chunk, 2); if (w.bodies.length < MAX_BODIES - 40) break; }
    }
    // combo decay
    if (this.comboT > 0) { this.comboT -= gdt; if (this.comboT <= 0) { this.comboT = 0; this.combo = 0; } }
    // slow-mo on huge collapses
    while (this.dmgWin.length && this.dmgWin[0][0] < this.rt - 0.7) this.dmgWin.shift();
    if (this.mode === 'play' && this.phase !== 'done' && this.slowCd <= 0) {
      let sum = 0; for (const e of this.dmgWin) sum += e[1];
      if (sum > Math.max(this.L.target * 0.12, 60000)) { this.slowT = 1.1; this.slowCd = 4.5; this.audio.play('slow'); this.audio.play('rumble', 1); this.say(this.rt - (this.lastBoom || -9) < 0.8 ? 'CHAIN REACTION!' : 'MEGA COLLAPSE!', '', '#ff9b5e', 1.1); }
    }
    // ball trail + squash recovery
    for (const b of this.balls) {
      if (b.data.sq) b.data.sq = Math.max(0, b.data.sq - dt * 1.6);
      b.trail = b.trail || [];
      const sp = Math.hypot(b.vx, b.vy);
      b.trail.unshift({ x: b.x, y: b.y, s: sp });
      if (b.trail.length > 7) b.trail.pop();
    }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
    this.shake *= Math.exp(-dt * 5);
    this.ui.setCable(1 - (this.crane.L - this.crane.Lmin) / (this.crane.Lmax - this.crane.Lmin));
  }
  finish() {
    this.phase = 'done';
    const n = this.levelN, L = this.L, s = this.save;
    const dmg = Math.round(this.damage);
    const stars = L.stars.filter((t) => dmg >= t).length;
    const newBest = dmg > (s.best[n] || 0);
    if (newBest) s.best[n] = dmg;
    s.stars[n] = Math.max(s.stars[n] || 0, stars);
    if (stars > 0) s.unlocked = Math.max(s.unlocked, Math.min(LEVELS.length, n + 1));
    s.bank += dmg;
    this.persist();
    this.ui.hud(false);
    this.result = { n, damage: dmg, stars, newBest, thr: L.stars, chain: this.maxCombo, levelled: this.levelled, blds: L.blds.length, tip: TIPS[(s.rounds || 0) % TIPS.length] };
    this.ui.show('result', this.result);
    this.audio.play(stars ? 'cash' : 'deny');
  }

  // ------------------------------------------------------------ camera + draw
  camera(dt) {
    const cr = this.crane, W = this.W, H = this.H, cam = this.cam;
    const left = cr.cjEnd - 0.4, right = cr.jibEnd + 0.8, top = cr.jibY + 3.6, bottom = -1.9;
    const ww = right - left, wh = top - bottom;
    const hudH = 64 * this.u;
    let s = Math.min(W / ww, (H - hudH) / wh);
    if (W < H) s = Math.max(s, Math.min((H - hudH) * 0.72 / wh, W / 12));
    s = Math.max(s, 14);
    s *= 1 + 0.06 * this.slowAmt;
    cam.s = s;
    const vw = W / s, vh = H / s, b = this.balls[0];
    let tx = vw >= ww ? (left + right) / 2 : clamp(b.x * 0.65 + cr.x * 0.35, left + vw / 2, right - vw / 2);
    let ty = vh >= wh ? bottom + vh / 2 : clamp(b.y + 2, bottom + vh / 2, top - vh / 2);
    if (!this.camInit) { cam.x = tx; cam.y = ty; this.camInit = true; }
    const k = Math.min(1, dt * 4);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    const sh = this.shake * 10 * this.u;
    cam.ox = (Math.random() - 0.5) * sh; cam.oy = (Math.random() - 0.5) * sh;
  }
  draw(dt) {
    const g = this.ctx, r = this.r;
    this.u = clamp(Math.min(this.W, this.H) / 720, 0.62, 1.3);
    this.camera(dt);
    r.setCam(this.cam, this.W, this.H, this.dpr); r.t = this.rt;
    r.background(this.L.district);
    const cr = this.crane;
    r.street(cr.cjEnd - 60, cr.jibEnd + 60);
    for (const b of this.world.bodies) if (b.data && b.data.mat) r.body(b);
    // ball motion trail
    r.world();
    for (const b of this.balls) {
      if (!b.trail) continue;
      for (let i = b.trail.length - 1; i >= 1; i--) {
        const p = b.trail[i]; if (p.s < 9) continue;
        g.globalAlpha = 0.16 * (1 - i / b.trail.length) * Math.min(1, (p.s - 9) / 8);
        g.fillStyle = '#fff0d8'; g.beginPath(); g.arc(p.x, p.y, b.r * (1 - i * 0.06), 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
    r.crane(cr, this.balls, this.spiked);
    r.particles(this.fx);
    if (this.mode === 'play') r.popups(this.fx);
    r.screen();
    if (this.fx.flash > 0) { g.fillStyle = `rgba(255,240,210,${this.fx.flash * 0.3})`; g.fillRect(0, 0, this.W, this.H); }
    if (this.slowAmt > 0.02) {
      const a = this.slowAmt, bh = this.H * 0.06 * a;
      g.fillStyle = OUT; g.fillRect(0, 0, this.W, bh); g.fillRect(0, this.H - bh, this.W, bh);
      const vg = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.3, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      vg.addColorStop(0, 'rgba(29,22,48,0)'); vg.addColorStop(1, `rgba(29,22,48,${0.5 * a})`);
      g.fillStyle = vg; g.fillRect(0, 0, this.W, this.H);
    }
    if (this.mode === 'play') this.hud();
  }
  text(t, x, y, size, fill, align = 'center', stroke = OUT, sw = 0.2) {
    const g = this.ctx;
    g.font = `400 ${size}px Bungee, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = size * sw; g.strokeStyle = stroke; g.strokeText(t, x, y);
    g.fillStyle = fill; g.fillText(t, x, y);
  }
  hud() {
    const g = this.ctx, u = this.u, W = this.W, H = this.H, L = this.L;
    const pad = 14 * u;
    // damage + target bar
    this.text('DAMAGE', pad, pad + 10 * u, 13 * u, '#fff4e0', 'left');
    const dm = money(this.damage);
    this.text(dm, pad, pad + 38 * u, 34 * u, '#ffe066', 'left', OUT, 0.18);
    const bw = Math.min(W * 0.36, 300 * u), bh = 12 * u, by = pad + 62 * u;
    g.fillStyle = 'rgba(29,22,48,.75)'; g.fillRect(pad - 2, by - 2, bw + 4, bh + 4);
    const top = L.stars[2];
    const f = clamp(this.damage / top, 0, 1);
    g.fillStyle = this.damage >= L.stars[0] ? '#ffc233' : '#ff7b5a'; g.fillRect(pad, by, bw * f, bh);
    for (let i = 0; i < 3; i++) {
      const x = pad + bw * (L.stars[i] / top), on = this.damage >= L.stars[i];
      g.fillStyle = OUT; g.fillRect(x - 1.5, by - 3, 3, bh + 6);
      this.text('★', x, by + bh + 11 * u, 15 * u, on ? '#ffe066' : 'rgba(255,244,224,.45)', 'center', OUT, 0.25);
    }
    this.text('TARGET ' + money(L.target), pad, by + bh + 30 * u, 11 * u, '#fff4e0', 'left');
    // timer
    const cx = W / 2, cy = pad + 30 * u, R = 28 * u;
    const tl = this.phase === 'ready' ? ROUND : this.time;
    const low = tl <= 5 && this.phase === 'live';
    g.fillStyle = 'rgba(29,22,48,.82)'; g.beginPath(); g.arc(cx, cy, R + 5 * u, 0, 7); g.fill();
    g.strokeStyle = low ? '#ff5a5f' : '#ffc233'; g.lineWidth = 6 * u; g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (tl / ROUND)); g.stroke();
    const pulse = low ? 1 + 0.15 * Math.max(0, Math.sin(this.rt * 12)) : 1;
    this.text(String(Math.ceil(tl)), cx, cy + 2 * u, 24 * u * pulse, low ? '#ff8a8a' : '#fff4e0');
    // chain meter
    if (this.combo >= 2) {
      const k = this.comboT / COMBO_WINDOW, cy2 = cy + R + 26 * u;
      const big = this.combo >= 10;
      this.text('CHAIN ' + this.combo, cx, cy2, (big ? 20 : 16) * u, big ? '#ff9b5e' : '#ffe066');
      this.text('×' + this.mult().toFixed(1), cx, cy2 + 21 * u, 13 * u, '#fff4e0');
      g.fillStyle = 'rgba(29,22,48,.7)'; g.fillRect(cx - 50 * u, cy2 + 33 * u, 100 * u, 5 * u);
      g.fillStyle = big ? '#ff9b5e' : '#ffe066'; g.fillRect(cx - 50 * u, cy2 + 33 * u, 100 * u * k, 5 * u);
    }
    // block name, top right (left of the pause button)
    this.text(`${this.levelN} · ${L.lv.name.toUpperCase()}`, W - pad - 64, pad + 12 * u, 12 * u, '#fff4e0', 'right');
    // banner
    const bn = this.banner;
    if (bn) {
      const k = bn.t / bn.life, sc = bn.t < 0.15 ? 1.6 - (bn.t / 0.15) * 0.6 : 1;
      g.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
      const by2 = H * 0.36;
      this.text(bn.text, W / 2, by2, Math.min(64 * u, W / (bn.text.length * 0.75)) * sc, bn.col, 'center', OUT, 0.16);
      if (bn.sub) this.text(bn.sub, W / 2, by2 + 42 * u, 15 * u, '#fff4e0');
      g.globalAlpha = 1;
    }
    // first-time controls hint
    if (this.levelN <= 2 && this.phase !== 'done' && (ROUND - this.time) < 7) {
      const coarse = matchMedia('(pointer: coarse)').matches;
      const msg = coarse ? 'DRAG to move the trolley · SLIDER for the cable · rock it to swing!' : 'A / D or drag: move · W / S or wheel: cable · rock it to swing!';
      g.globalAlpha = 0.9;
      const fs = Math.min(14 * u, W / (msg.length * 0.62));
      this.text(msg, W / 2, H - pad - 14 * u, fs, '#fff4e0');
      g.globalAlpha = 1;
    }
  }
}

new Game();
