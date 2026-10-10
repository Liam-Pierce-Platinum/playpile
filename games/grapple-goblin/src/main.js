// GRAPPLE GOBLIN - hold to hook, let go to fling. One button, a cave full of gold.
import { THEMES, LEVELS, FLOOR, buildLevel, buildEndless } from './levels.js';
import { World, T, flingVel } from './world.js';
import { botHold } from './bot.js';
import * as D from './draw.js';
import { Audio } from './audio.js';
import { UI, fmt } from './ui.js';

const SAVE_KEY = 'pd.grapple-goblin';
const N = LEVELS.length;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const BANNER = 1.4;   // the cave-name banner: 1.0 s, then a fade (cut short by the first hook)
const STAR2 = 0.7;    // second star: this share of the gold
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { stars: {}, best: {}, gold: {}, unlocked: 1, deep: 0, music: true, sfx: true };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
    this.audio.musicOn = this.save.music !== false; this.audio.sfxOn = this.save.sfx !== false;
    this.layers = new Map();
    this.parts = []; this.texts = []; this.dots = [];
    this.t = 0; this.shake = 0; this.hitstop = 0; this.slow = 1; this.slowT = 0;
    this.bot = params.has('bot');
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.toTitle();
    if (params.has('level')) this.startLevel(clamp(parseInt(params.get('level'), 10) || 1, 1, N));
    else if (params.has('deep')) this.startDeep();
    else if (params.has('play')) this.startLevel(this.ui.nextLevel());
    window.__G = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    // the cave is 720 tall. In portrait, fit 680 world units across (hook reach is 470, so the next
    // anchor is always in view) and stack: HUD, the cave, then a HOLD band at the bottom for the thumb.
    this.portrait = innerHeight > innerWidth * 1.15;
    this.s = this.portrait ? Math.min(innerWidth / 680, innerHeight / 900) : Math.min(innerHeight / 720, innerWidth / 540);
    this.vw = innerWidth / this.s; this.vh = innerHeight / this.s;
    const k = Math.min(1.2, this.s * dpr);
    if (!this.layerK || Math.abs(k - this.layerK) > 0.15) { this.layerK = k; this.layers.clear(); }
    this.vig = null;
  }
  layer(ti) { let l = this.layers.get(ti); if (!l) { l = D.makeLayers(ti, this.layerK); this.layers.set(ti, l); } return l; }

  // ------------------------------------------------------------ input: one button
  input() {
    this.pointers = new Set(); this.keyHold = new Set();
    const cv = this.canvas;
    const down = (e) => { this.audio.unlock(); if (this.mode !== 'play' || this.ui.open) return; e.preventDefault(); this.pointers.add(e.pointerId); };
    const up = (e) => { this.pointers.delete(e.pointerId); };
    cv.addEventListener('pointerdown', down);
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    const HOLD = ['Space', 'Enter', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyX', 'KeyJ'];
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && this.ui.panel !== 'title' && this.ui.panel !== 'result' && this.ui.panel !== 'deep') { this.ui.back(); return; }
        if (this.mode === 'play' && !this.ui.open) { this.ui.show('pause'); return; }
      }
      if (this.ui.open) {
        if (!e.repeat && (e.code === 'Enter' || e.code === 'Space') && this.ui.panel !== 'levels') { e.preventDefault(); this.ui.primary(); }
        return;
      }
      if (this.mode !== 'play') return;
      if (e.code === 'KeyR' && !e.repeat) { this.restart(); return; }
      if (HOLD.includes(e.code)) { e.preventDefault(); this.keyHold.add(e.code); }
    });
    addEventListener('keyup', (e) => this.keyHold.delete(e.code));
    addEventListener('blur', () => { this.pointers.clear(); this.keyHold.clear(); if (this.mode === 'play' && !this.ui.open && this.w && !this.w.done) this.ui.show('pause'); });
  }
  get holding() { return this.pointers.size > 0 || this.keyHold.size > 0; }

  // ------------------------------------------------------------ flow
  setWorld(w) {
    this.w = w;
    this.parts.length = 0; this.texts.length = 0;
    const g = w.g;
    this.cam = { x: g.x + this.vw * 0.2, y: 360 };
    this.vis = { rot: 0, face: 1, sq: 1, sqV: 0, earF: 0, earB: 0, earFV: 0, earBV: 0, blink: 0, blinkT: 2, run: 0, kick: 0, mood: 'cheeky', look: [1, 0], hand: [3, -24] };
    this.finishT = 0; this.overT = 0; this.shown = false; this.banner = 0; this.coinBump = 0;
    this.slow = 1; this.slowT = 0; this.hitstop = 0;
  }
  startLevel(n) {
    this.levelN = n; this.deep = false;
    this.setWorld(new World(buildLevel(n)));
    this.mode = 'play'; this.ui.close(); this.ui.hud(true);
    this.banner = BANNER; this.pointers.clear(); this.keyHold.clear();
    this.audio.unlock();
  }
  startDeep() {
    this.levelN = 0; this.deep = true;
    const b = buildEndless((Math.random() * 1e6) | 0);
    this.setWorld(new World(b.L, { builder: b }));
    this.mode = 'play'; this.ui.close(); this.ui.hud(true);
    this.banner = BANNER; this.pointers.clear(); this.keyHold.clear();
    this.audio.unlock();
  }
  restart() { if (this.deep) this.startDeep(); else this.startLevel(this.levelN); }
  toTitle() {
    this.mode = 'title'; this.deep = false;
    this.attractN = ((this.attractN || 0) % 4) + 1;
    this.setWorld(new World(buildLevel([1, 6, 11, 16][this.attractN - 1])));
    this.ui.hud(false);
    this.ui.show('title');
  }

  // ------------------------------------------------------------ loop
  loop(now) {
    const rdt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    this.t += rdt;
    this.tick(rdt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }
  tick(rdt) {
    const w = this.w;
    const paused = this.mode === 'play' && this.ui.open && this.ui.panel === 'pause';
    if (!paused) {
      if (this.slowT > 0) { this.slowT -= rdt; if (this.slowT <= 0) this.slow = 1; }
      let dt = rdt * this.slow;
      if (this.hitstop > 0) { this.hitstop -= rdt; dt = 0; }
      let hold;
      if (this.mode === 'title') hold = botHold(w);
      else hold = this.bot ? botHold(w) : this.holding;
      if (dt > 0) w.update(dt, hold && !(this.mode === 'play' && this.ui.open));
      this.handleEvents();
      if (this.mode === 'play') this.ambient(rdt);
      this.updateVis(dt);
      this.updateFx(dt);
      this.updateCam(rdt);
    }
    this.shake = Math.max(0, this.shake - rdt * 40);
    this.banner = Math.max(0, this.banner - rdt);
    this.coinBump = Math.max(0, this.coinBump - rdt * 4);
    // music follows the cave you are in
    this.audio.update(this.themeAt(w.g.x));
    // flow
    if (this.mode === 'title') {
      if (w.done) { this.finishT += rdt; if (this.finishT > 2) { this.attractN = this.attractN % 4; const n = [1, 6, 11, 16][this.attractN]; this.attractN++; this.setWorld(new World(buildLevel(n))); } }
      if (w.deaths > 5) { const n = [1, 6, 11, 16][this.attractN % 4]; this.attractN++; this.setWorld(new World(buildLevel(n))); }
    } else if (this.mode === 'play') {
      if (w.done && !this.shown) { this.finishT += rdt; if (this.finishT > 1.5) { this.shown = true; this.levelDone(); } }
      if (w.over && !this.shown) { this.overT += rdt; if (this.overT > 0.9) { this.shown = true; this.deepDone(); } }
    }
  }
  // sounds that come from the cave itself: the gust warning build-up and bat wing flaps
  ambient(dt) {
    const w = this.w, cam = this.cam, half = this.vw / 2 + 60;
    for (const z of w.L.winds) {
      if (!z.period) continue;
      if (z.x + z.w < cam.x - half || z.x > cam.x + half) { z.st = null; continue; }
      const ph = (w.t + z.phase) % z.period, st = ph <= z.on ? 'on' : z.period - ph < 1 ? 'warn' : 'off';
      if (st !== z.st) { if (z.st != null) { if (st === 'warn') this.audio.play('gustwarn'); else if (st === 'on') this.audio.play('wind'); } z.st = st; }
    }
    this.flapT = (this.flapT || 0) - dt;
    if (this.flapT <= 0) {
      let best = 1e9;
      for (const b of w.L.bats) if (b.x > cam.x - half && b.x < cam.x + half) best = Math.min(best, Math.abs(b.x - w.g.x));
      if (best < 1e9) { this.audio.play('flap', clamp(1 - best / 800, 0.2, 1)); this.flapT = 0.3; } else this.flapT = 0.2;
    }
  }
  themeAt(x) { let th = 0; for (const z of this.w.L.zones) if (z.x <= x) th = z.theme; return th; }
  levelDone() {
    const w = this.w, n = this.levelN, s = this.save;
    const need = Math.ceil(w.L.totalCoins * STAR2);
    const stars = [true, w.coins >= need, w.bigGot];
    const prev = s.stars[n] || [false, false, false];
    s.stars[n] = prev.map((v, i) => v || stars[i]);
    const best = s.best[n], newBest = !best || w.clock < best;
    if (newBest) s.best[n] = w.clock;
    s.gold[n] = Math.max(s.gold[n] || 0, w.coins);
    s.unlocked = Math.max(s.unlocked, Math.min(N, n + 1));
    this.persist();
    this.ui.hud(false);
    this.ui.show('result', { n, name: `${n}. ${w.L.name}`, time: w.clock, best: s.best[n], newBest: newBest && !!best, stars, need, coins: w.coins, total: w.L.totalCoins, gems: w.gems, gemTotal: w.L.gems.length, deaths: w.deaths });
  }
  deepDone() {
    const w = this.w, dist = w.distance(), top = this.save.deep, best = dist > top;
    if (best) { this.save.deep = dist; this.persist(); }
    this.ui.hud(false);
    this.ui.show('deep', { dist, best, top, coins: w.coins, gems: w.gems });
  }

  // ------------------------------------------------------------ events -> juice
  handleEvents() {
    const w = this.w, g = w.g, ev = w.events;
    const sfx = this.mode === 'play';
    const play = (n, p) => { if (sfx) this.audio.play(n, p); };
    for (const e of ev) {
      switch (e.type) {
        case 'fire': play('fire'); if (this.mode === 'play') this.banner = Math.min(this.banner, 0.3); break;
        case 'whiff': play('whiff'); break;
        case 'attach': play('attach'); this.vis.sq = 1.18; this.ring(e.x, e.y, '#fff', 26); this.burst(e.x, e.y, 5, '#ffe9a0', 160, 'star'); break;
        case 'taut': play('taut', 0.8 + Math.min(0.6, e.v / 1500)); this.shake = Math.max(this.shake, Math.min(5, e.v / 250)); break;
        case 'release': if (!e.quiet) { play('release', clamp(e.speed / 900, 0.4, 1.4)); this.vis.sq = 1.32; if (e.speed > 1150) { if (this.t - (this.wheeT || 0) > 2.5) { this.wheeT = this.t; this.text(g.x + 80 * Math.sign(g.vx || 1), g.y - 50, e.speed > 1350 ? 'WHEEE!' : 'ZOOM!', 26, '#fff', true); } play('whoosh'); } } break;
        case 'coin': play('coin'); this.coinBump = 1; this.burst(e.x, e.y, 6, '#ffd23a', 180, 'star'); this.ring(e.x, e.y, '#ffe68a', 18); break;
        case 'perfect': play('perfect'); this.hitstop = Math.max(this.hitstop, 0.03); this.shake = Math.max(this.shake, 3); this.burst(e.x, e.y, 12, '#ffe066', 320, 'star'); this.ring(e.x, e.y, '#ffe066', 34); this.text(e.x + 70, e.y - 60, 'PERFECT!', 30, '#ffe066', true); this.wheeT = this.t; break;
        case 'gem': play('gem'); this.hitstop = 0.05; this.burst(e.x, e.y, 14, THEMES[this.themeAt(e.x)].gem, 300, 'star'); this.text(e.x, e.y - 30, 'GEM!', 28, THEMES[this.themeAt(e.x)].gem); this.shake = Math.max(this.shake, 5); break;
        case 'big': play('big'); this.hitstop = 0.12; this.burst(e.x, e.y, 30, '#ffffff', 420, 'star'); this.burst(e.x, e.y, 20, THEMES[this.themeAt(e.x)].gem, 360, 'star'); this.ring(e.x, e.y, '#fff', 80); this.text(e.x, e.y - 40, 'BIG GEM!', 40, '#fff6a8'); this.shake = 12; break;
        case 'boing': play('boing'); this.vis.sq = 0.6; this.burst(e.x, e.y, 8, THEMES[this.themeAt(e.x)].mushSpot, 220, 'dot'); break;
        case 'land': play('land', clamp(e.v / 900, 0.3, 1)); this.vis.sq = clamp(1 - e.v / 1800, 0.55, 0.85); this.dust(e.x, e.y, Math.min(10, 3 + e.v / 120)); if (e.v > 700) this.shake = Math.max(this.shake, 4); break;
        case 'bonk': play('bonk'); this.vis.sq = 0.75; this.burst(e.x, e.y, 6, '#fff', 200, 'star'); this.shake = Math.max(this.shake, 4); break;
        case 'crumble': play('crumble'); this.debris(e.x, e.y, THEMES[e.a.theme]); this.shake = Math.max(this.shake, 6); break;
        case 'snap': this.text(e.x, e.y + 20, 'CRACK!', 24, '#ffd8a8'); break;
        case 'die': play('die'); this.puff(e.x, e.y, 22); this.burst(e.x, e.y, 14, '#8ee05a', 380, 'dot'); this.shake = 14; this.hitstop = 0.06; this.text(e.x, e.y - 30, ['POP!', 'OOF!', 'YIKES!', 'OUCH!'][(w.deaths + 3) % 4], 30, '#fff'); break;
        case 'respawn': play('respawn'); this.puff(e.x, e.y, 12); this.ring(e.x, e.y, '#fff', 40); this.vis.sq = 1.3; break;
        case 'flag': play('flag'); this.burst(e.x + 20, FLOOR - 70, 16, '#9dff8a', 260, 'star'); this.text(e.x + 20, FLOOR - 120, 'CHECKPOINT', 24, '#c8ffb0'); break;
        case 'cartgo': play('cart'); break;
        case 'board': play('board'); this.vis.sq = 0.7; this.text(e.x + 60, FLOOR - 120, 'ALL ABOARD!', 26, '#fff', true); break;
        case 'launch': play('whoosh'); this.vis.sq = 1.35; this.shake = 8; this.text(e.x + 80, e.y - 70, 'LAUNCH!', 32, '#ffd23a', true); break;
        case 'crash': play('crash'); this.burst(e.x, e.y, 18, '#ffcc3a', 360, 'star'); this.shake = Math.max(this.shake, 9); break;
        case 'finish':
          play('finish'); this.slow = 0.35; this.slowT = 0.9; this.shake = 8;
          for (let i = 0; i < 40; i++) this.parts.push({ x: e.x + rand(-20, 20), y: e.y - 20, vx: rand(-260, 260), vy: rand(-900, -400), life: rand(1, 1.8), max: 1.8, size: 1, color: '#ffd23a', g: 1500, type: 'coin', ph: rand(0, 6) });
          this.text(e.x, e.y - 110, 'TREASURE!', 46, '#ffe66a');
          break;
        case 'over': break;
      }
    }
    ev.length = 0;
  }
  burst(x, y, n, color, sp, type = 'dot') { for (let i = 0; i < n; i++) { const a = rand(0, TAU), v = rand(0.3, 1) * sp; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.6), max: 0.6, size: rand(3, 7), color, g: 300, type, rot: rand(0, 6) }); } }
  ring(x, y, color, r) { this.parts.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: r, color, g: 0, type: 'ring' }); }
  puff(x, y, n) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), v = rand(40, 260); this.parts.push({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: rand(0.35, 0.7), max: 0.7, size: rand(10, 22), color: '#f4efe6', g: -80, type: 'puff' }); } }
  dust(x, y, n) { for (let i = 0; i < n; i++) this.parts.push({ x: x + rand(-14, 14), y: y - 3, vx: rand(-160, 160), vy: rand(-120, -20), life: rand(0.25, 0.45), max: 0.45, size: rand(5, 10), color: '#d8cfc0', g: 120, type: 'puff' }); }
  debris(x, y, P) { for (let i = 0; i < 12; i++) this.parts.push({ x: x + rand(-14, 14), y: y + rand(-14, 14), vx: rand(-200, 200), vy: rand(-300, 50), life: rand(0.6, 1.1), max: 1.1, size: rand(4, 9), color: P.key === 'crystal' ? '#ff9ad8' : P.key === 'ice' ? '#cfeeff' : P.key === 'lava' ? '#8a5a34' : P.rock, g: 1400, type: 'chunk', rot: rand(0, 6), vr: rand(-10, 10) }); }
  // popups: 'follow' ones ride along with the camera; all are kept inside the view when drawn
  text(x, y, s, size, col, follow = false) { if (follow) this.texts = this.texts.filter((t) => t.s !== s); this.texts.push({ x, y, s, size, col, life: 0.9, max: 0.9, follow }); }

  updateFx(dt) {
    const w = this.w, g = w.g;
    for (const p of this.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.type === 'puff') { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; } if (p.vr) p.rot += p.vr * dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (!g.alive || dt <= 0) return;
    const sp = Math.hypot(g.vx, g.vy);
    // gold sparkle trail and speed streaks
    if (sp > 650 && Math.random() < dt * (sp / 18)) this.parts.push({ x: g.x + rand(-8, 8), y: g.y + rand(-8, 8), vx: -g.vx * 0.1, vy: -g.vy * 0.1, life: 0.45, max: 0.45, size: rand(3, 6), color: Math.random() < 0.6 ? '#ffd23a' : '#ffffff', g: 0, type: 'star', rot: rand(0, 6) });
    if (sp > 880) {
      const n = Math.random() < dt * (sp / 30) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(g.vy, g.vx), off = rand(-260, 260);
        this.parts.push({ x: g.x + Math.cos(a) * rand(100, 420) - Math.sin(a) * off, y: g.y + Math.sin(a) * rand(100, 420) + Math.cos(a) * off, vx: -g.vx * 0.6, vy: -g.vy * 0.6, life: 0.22, max: 0.22, size: clamp((sp - 800) / 6, 30, 120), color: '#ffe9a0', g: 0, type: 'line', ang: a });
      }
    }
    // lava embers
    const th = THEMES[this.themeAt(g.x)];
    if (th.key === 'lava' && Math.random() < dt * 6) this.parts.push({ x: this.cam.x + rand(-this.vw / 2, this.vw / 2), y: 680, vx: rand(-20, 20), vy: rand(-140, -60), life: 2, max: 2, size: rand(2, 4), color: '#ffb04a', g: -10, type: 'ember' });
    if (th.key === 'ice' && Math.random() < dt * 8) this.parts.push({ x: this.cam.x + rand(-this.vw / 2, this.vw * 0.7), y: -10, vx: rand(-40, 10), vy: rand(30, 70), life: 7, max: 7, size: rand(2, 4), color: '#ffffff', g: 0, type: 'snow', ph: rand(0, 6) });
  }

  // squash/stretch, floppy ears, eyes, rotation
  updateVis(dt) {
    const w = this.w, g = w.g, v = this.vis;
    if (dt <= 0) return;
    v.sqV += (1 - v.sq) * 320 * dt; v.sqV *= Math.exp(-11 * dt); v.sq += v.sqV * dt;
    v.sq = clamp(v.sq, 0.5, 1.5);
    const sp = Math.hypot(g.vx, g.vy);
    const earT = clamp(-g.vy / 1400, -0.5, 0.65) + (g.rope ? 0.1 : 0);
    v.earFV += (earT - v.earF) * 220 * dt; v.earFV *= Math.exp(-6 * dt); v.earF += v.earFV * dt;
    v.earBV += (earT * 0.9 - v.earB) * 180 * dt; v.earBV *= Math.exp(-5 * dt); v.earB += v.earBV * dt;
    v.blinkT -= dt; if (v.blinkT <= 0) { v.blink = 0.12; v.blinkT = rand(1.8, 4); } v.blink = Math.max(0, v.blink - dt);
    if (g.onGround) v.run += Math.abs(g.vx) * dt * 0.075;
    v.kick = 0.5 + 0.5 * Math.sin(this.t * 7);
    if (Math.abs(g.vx) > 40) v.face = g.vx > 0 ? 1 : -1;
    let rt = 0;
    if (g.rope) {
      const a = g.rope.a; rt = Math.atan2(a.x - g.x, -(a.y - g.y));
    } else if (g.riding) rt = 0;
    else if (!g.onGround) rt = clamp(g.vx / 2200, -0.4, 0.4) + clamp(g.vy / 3000, -0.3, 0.3) * v.face;
    if (g.teeter > 0.05) rt = Math.sin(this.t * 13) * 0.22 - 0.12;   // arms-out wobble at the edge
    if (g.spin > 0) rt += (1 - g.spin) * TAU * v.face;
    v.rot += angDiff(v.rot, rt) * Math.min(1, dt * (g.spin > 0 ? 30 : g.rope ? 18 : 10));
    v.mood = sp > 950 ? 'whee' : (!g.rope && !g.onGround && g.vy > 600 && g.y > 470) || g.teeter > 0.05 ? 'scared' : 'cheeky';
    // eyes look at the target anchor or where we are going
    const tgt = g.rope ? null : w.pick(g.x, g.y);
    let lx = g.vx, ly = g.vy;
    if (tgt) { lx = tgt.x - g.x; ly = tgt.y - g.y; }
    const ll = Math.hypot(lx, ly) || 1;
    lx /= ll; ly /= ll;
    const c = Math.cos(-v.rot), s = Math.sin(-v.rot);
    let rx = lx * c - ly * s, ry = lx * s + ly * c;
    rx *= v.face;
    v.look[0] += (rx - v.look[0]) * Math.min(1, dt * 12); v.look[1] += (ry - v.look[1]) * Math.min(1, dt * 12);
    this.target = tgt;
  }
  updateCam(dt) {
    const w = this.w, g = w.g, cam = this.cam;
    const lead = this.vw * (this.portrait ? 0.22 : 0.16) + clamp(g.vx * 0.22, -120, this.portrait ? 160 : 230);
    let tx = g.x + lead;
    if (this.mode === 'title' && !this.portrait) tx = g.x - this.vw * 0.18;   // the attract run plays to the right of the menu
    // while swinging, keep the anchor in shot too
    if (g.rope) tx = Math.min(tx, Math.min(g.x, g.rope.a.x) - 70 + this.vw / 2);
    // and the anchor you hang from / the one you would hook next, on the right edge
    const far = Math.max(g.rope ? g.rope.a.x : -1e9, this.target ? this.target.x : -1e9);
    if (far > -1e9) tx = Math.max(tx, far + 70 - this.vw / 2);
    tx = Math.max(tx, -380 + this.vw / 2);
    if (w.L.end < 1e8) tx = Math.min(tx, w.L.end + 40 - this.vw / 2);
    const k = g.alive ? 1 - Math.exp(-dt * 4.2) : 1 - Math.exp(-dt * 2);
    const cx0 = cam.x;
    cam.x += (tx - cam.x) * k;
    // keep the goblin on screen no matter what
    cam.x = clamp(cam.x, g.x - this.vw * 0.42 + 60, g.x + this.vw * 0.3);
    for (const t of this.texts) if (t.follow) t.x += cam.x - cx0;
    let ty = 360;
    if (this.portrait) {
      // play: the cave sits just under the HUD, the HOLD band below it. title: the cave sits under the menu
      ty = this.mode === 'title' ? 735 - (innerHeight / 2 - 8) / this.s : 30 + (innerHeight / 2 - this.hudPx()) / this.s;
    } else if (this.vh < 700) ty = clamp(g.y - 20, this.vh / 2 - 30, 740 - this.vh / 2);
    cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 4));
    const sp = Math.hypot(g.vx, g.vy);
    const zt = 1 - clamp((sp - 700) / 900, 0, 1) * 0.07;
    this.zoom = (this.zoom || 1) + (zt - (this.zoom || 1)) * (1 - Math.exp(-dt * 2.5));
  }

  hudPx() { return 78; }   // portrait: screen px from the top to world y=30 (the HUD sits over the ceiling rock)
  // ------------------------------------------------------------ render
  render() {
    const c = this.ctx, w = this.w, g = w.g, cam = this.cam, dpr = this.dpr;
    const W = this.canvas.width, H = this.canvas.height;
    const th = this.themeAt(cam.x), P = THEMES[th];
    // backdrop gradient
    c.setTransform(1, 0, 0, 1, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, P.bg0); bg.addColorStop(0.5, P.bg1); bg.addColorStop(1, P.bg0);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const s = this.s * this.zoom, sh = this.shake;
    const ox = W / 2 - cam.x * s * dpr + (sh ? rand(-sh, sh) * dpr : 0), oy = H / 2 - cam.y * s * dpr + (sh ? rand(-sh, sh) * dpr : 0);
    this.oy = H / 2 - cam.y * s * dpr;
    const vw = this.vw / this.zoom, vh = this.vh / this.zoom;
    const vx0 = cam.x - vw / 2 - 30, vx1 = cam.x + vw / 2 + 30, vb = cam.y + vh / 2 + 30;
    c.setTransform(s * dpr, 0, 0, s * dpr, ox, oy);
    // parallax layers (cross-fade between cave themes in the deep dive)
    const zones = w.L.zones;
    let nextZ = null; for (const z of zones) if (z.x > cam.x) { nextZ = z; break; }
    this.drawLayers(c, th, 1, vx0, vx1);
    if (nextZ && nextZ.x - cam.x < 700) this.drawLayers(c, nextZ.theme, clamp(1 - (nextZ.x - cam.x) / 700, 0, 1), vx0, vx1);
    const t = this.t;
    // world
    D.drawCeiling(c, w, vx0, vx1, w.t);
    for (const p of w.L.pits) if (p.x1 > vx0 && p.x0 < vx1) D.drawPit(c, p, w.t, vb);
    for (const z of w.L.winds) if (z.x + z.w > vx0 && z.x < vx1) D.drawWind(c, z, w.t);
    for (const s2 of w.L.solids) if (s2.x + s2.w > vx0 - 40 && s2.x < vx1 + 40 && s2.y < vb) D.drawSolid(c, s2, w.t, vb);
    for (const sp of w.L.spikes) if (sp.x + sp.w > vx0 && sp.x < vx1) D.drawSpikes(c, sp);
    for (const f of w.L.flags) if (f.x > vx0 - 60 && f.x < vx1) D.drawFlag(c, f, t);
    if (w.L.chest && w.L.chest.x > vx0 - 200 && w.L.chest.x < vx1 + 200) D.drawChest(c, w.L.chest, t);
    for (const k of w.L.carts) if (k.x > vx0 - 60 && k.x < vx1 + 60) D.drawCart(c, k, t);
    const target = g.alive && !g.rope && !g.hook && this.mode === 'play' ? this.target : null;
    for (const a of w.L.anchors) if (a.x > vx0 - 120 && a.x < vx1 + 120) D.drawAnchor(c, a, w, w.t, a === target);
    for (const m of w.L.coins) if (!m.got && m.x > vx0 && m.x < vx1) D.drawCoin(c, m.x, m.y, t, m.ph);
    for (const m of w.L.gems) if (!m.got && m.x > vx0 && m.x < vx1) D.drawGem(c, m.x, m.y, t, THEMES[m.theme].gem);
    const big = w.L.big;
    if (big && !big.got && big.x > vx0 - 50 && big.x < vx1 + 50) D.drawGem(c, big.x, big.y, t, THEMES[this.themeAt(big.x)].gem, true);
    for (const h of w.L.hints) if (h.x > vx0 - 300 && h.x < vx1) this.hintText(c, h, t);
    for (const b of w.L.bats) if (b.x > vx0 - 50 && b.x < vx1 + 50) D.drawBat(c, b, w.t);
    // release preview: where a fling right now would take you (subtle)
    if (g.rope && g.alive && this.mode === 'play') this.preview(c, w);
    // the rope, the hook and the goblin
    if (g.alive) {
      const v = this.vis;
      if (g.rope) {
        const a = g.rope.a, dx = a.x - g.x, dy = a.y - g.y, d = Math.hypot(dx, dy) || 1;
        const hx = g.x + (dx / d) * 26, hy = g.y + (dy / d) * 26;
        const slack = g.rope.taut ? 0 : clamp((g.rope.L - d) * 0.5, 0, 50);
        D.drawRope(c, hx, hy, a.x, a.y, slack, g.rope.wob, w.t, false);
        v.hand = [2, -17];
        v.onRope = true;
      } else {
        v.onRope = false;
        if (g.hook) {
          const hk = g.hook, sx = g.x + 8 * v.face, sy = g.y - 10;
          const tx = sx + Math.cos(hk.dir) * hk.len, ty = sy + Math.sin(hk.dir) * hk.len;
          D.drawRope(c, sx, sy, tx, ty, hk.state === 'out' ? 0 : 6, 0, w.t, true);
        }
      }
      v.ground = g.onGround || !!g.riding;
      if (g.riding) { D.drawGoblin(c, g.x, g.y - 6, v, t); D.drawCart(c, g.riding, t); }
      else D.drawGoblin(c, g.x, g.y, v, t);
      if (g.teeter > 0.12 && !g.hook && this.mode === 'play') D.drawBubble(c, g.x + 4, g.y - 64, 'HOLD!', t);
    }
    // particles
    this.drawParts(c);
    // foreground rocks that hide the big gem
    for (const f of w.L.fg) if (f.x > vx0 - 150 && f.x < vx1 + 150) D.drawCover(c, f, t, Math.hypot(f.x - g.x, f.y - g.y) < 190, w.ceilY(f.x));
    for (const tx of this.texts) {
      const k = tx.life / tx.max, pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1;
      c.font = `${tx.size}px 'Lilita One', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      // keep every popup inside the view, fully opaque until its last 0.35 s
      const hw = c.measureText(tx.s).width / 2 + 12, hx0 = cam.x - vw / 2 + hw, hx1 = cam.x + vw / 2 - hw;
      const px = hx0 < hx1 ? clamp(tx.x, hx0, hx1) : cam.x, py = clamp(tx.y, cam.y - vh / 2 + 40 + (this.portrait ? 0 : 50), cam.y + vh / 2 - 30);
      c.save(); c.translate(px, py); c.scale(pop, pop); c.globalAlpha = tx.life > 0.35 ? 1 : tx.life / 0.35;
      c.lineWidth = 6; c.strokeStyle = D.INK; c.lineJoin = 'round'; c.strokeText(tx.s, 0, 0); c.fillStyle = tx.col; c.fillText(tx.s, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
    // screen space: vignette and HUD
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vig) this.vig = this.makeVig(W, H);
    c.drawImage(this.vig, 0, 0);
    this.gustFx(c, W, H, ox, s);
    if (this.portrait) this.band(c, W, H, oy, s);
    if (this.mode === 'play') this.hud(c, W, H);
  }
  // icy gusts: a frost tint creeps in from the right for 1 s before a gust, then the zone goes blue while it blows
  gustFx(c, W, H, ox, s) {
    const w = this.w, dpr = this.dpr;
    for (const z of w.L.winds) {
      if (!z.period) continue;
      const sx0 = ox + z.x * s * dpr, sx1 = ox + (z.x + z.w) * s * dpr;
      if (sx1 < 0 || sx0 > W) continue;
      const ph = (w.t + z.phase) % z.period, active = ph <= z.on, warn = !active && z.period - ph < 1;
      if (!active && !warn) continue;
      const k = active ? 1 : 1 - (z.period - ph);          // 0 -> 1 over the warning second
      const fw = W * (active ? 0.5 : 0.12 + 0.3 * k);
      const g = c.createLinearGradient(W - fw, 0, W, 0);
      g.addColorStop(0, 'rgba(190,235,255,0)'); g.addColorStop(1, `rgba(190,235,255,${active ? 0.34 : 0.12 + 0.22 * k})`);
      c.fillStyle = g; c.fillRect(W - fw, 0, fw, H);
      if (active) { c.fillStyle = 'rgba(160,215,255,0.10)'; c.fillRect(Math.max(0, sx0), 0, Math.min(W, sx1) - Math.max(0, sx0), H); }
      // the big arrow: pulses during the warning, solid while it blows
      const u = dpr * clamp(Math.min(innerWidth, innerHeight * 1.6) / 900, 0.7, 1.25);
      const ax = W - 70 * u, ay = this.oy + 330 * this.s * dpr, sc = u * (active ? 1.1 : 0.8 + 0.25 * Math.abs(Math.sin(this.t * 10)));
      c.save(); c.translate(ax, ay); c.scale(sc, sc); c.globalAlpha = active ? 0.95 : 0.55 + 0.45 * k;
      c.lineJoin = 'round'; c.fillStyle = '#e6f8ff'; c.strokeStyle = D.INK; c.lineWidth = 5;
      c.beginPath(); c.moveTo(-44, 0); c.lineTo(-8, -32); c.lineTo(-8, -14); c.lineTo(40, -14); c.lineTo(40, 14); c.lineTo(-8, 14); c.lineTo(-8, 32); c.closePath(); c.fill(); c.stroke();
      c.font = "22px 'Lilita One', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 5; c.strokeText('GUST!', 0, 54); c.fillStyle = '#e6f8ff'; c.fillText('GUST!', 0, 54);
      c.restore(); c.globalAlpha = 1;
      break;
    }
  }
  // portrait: everything under the cave is the HOLD band (the whole screen still works as the button)
  band(c, W, H, oy, s) {
    const dpr = this.dpr, top = Math.max(0, oy + 728 * s * dpr), w = this.w, P = THEMES[this.themeAt(w.g.x)];
    if (top >= H - 10) return;
    const g = c.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, P.rock2); g.addColorStop(0.18, P.bg1); g.addColorStop(1, P.bg0);
    c.fillStyle = g; c.fillRect(0, top, W, H - top);
    c.fillStyle = D.INK; c.fillRect(0, top - 2 * dpr, W, 5 * dpr);
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let i = 0; i < 14; i++) { const h1 = D.hash(i * 3.7), h2 = D.hash(i * 9.1 + 2); c.beginPath(); c.ellipse(h1 * W, top + 20 * dpr + h2 * (H - top), (30 + h1 * 60) * dpr, (12 + h2 * 16) * dpr, 0, 0, TAU); c.fill(); }
    if (this.mode !== 'play' || this.ui.open) return;
    const u = dpr, bh = H - top;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const txt = (t2, x, y, size, col) => { c.font = `${size * u}px 'Lilita One', sans-serif`; c.lineWidth = 6 * u; c.strokeStyle = D.INK; c.strokeText(t2, x, y); c.fillStyle = col; c.fillText(t2, x, y); };
    if (!this.deep) {
      const x0 = 34 * u, x1 = W - 34 * u, y = top + 30 * u, sx = w.L.spawn.x, ex = w.L.chest ? w.L.chest.x : w.L.end;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.roundRect(x0 - 5 * u, y - 7 * u, x1 - x0 + 10 * u, 14 * u, 7 * u); c.fill();
      const k = clamp((w.maxX - sx) / (ex - sx), 0, 1);
      c.fillStyle = '#ffd23a'; c.beginPath(); c.roundRect(x0, y - 4 * u, (x1 - x0) * k, 8 * u, 4 * u); c.fill();
      for (const f of w.L.flags) { const fk = (f.x - sx) / (ex - sx); c.fillStyle = f.on ? '#5ee06a' : '#e8473a'; c.fillRect(x0 + (x1 - x0) * fk - 2 * u, y - 10 * u, 4 * u, 14 * u); }
      c.fillStyle = '#9a5a2c'; c.strokeStyle = D.INK; c.lineWidth = 2 * u; c.fillRect(x1 - 7 * u, y - 8 * u, 14 * u, 12 * u); c.strokeRect(x1 - 7 * u, y - 8 * u, 14 * u, 12 * u);
      const gk = clamp((w.g.x - sx) / (ex - sx), 0, 1);
      c.fillStyle = '#8ee05a'; c.lineWidth = 2.5 * u; c.beginPath(); c.arc(x0 + (x1 - x0) * gk, y, 8 * u, 0, TAU); c.fill(); c.stroke();
      const best = this.save.best[this.levelN];
      txt(best ? `best ${fmt(best)}` : 'first run!', W / 2, y + 28 * u, 17, '#d8d0ff');
    }
    const held = this.holding, py = top + Math.max(120 * u, bh * 0.6), pr = Math.min(W * 0.28, bh * 0.3, 110 * u);
    if (bh > 170 * u) {
      const pulse = held ? 1.05 : 1 + Math.sin(this.t * 3) * 0.025;
      c.save(); c.translate(W / 2, py); c.scale(pulse, pulse);
      c.globalAlpha = held ? 0.95 : 0.6;
      c.fillStyle = held ? '#ffd23a' : 'rgba(255,255,255,0.07)'; c.strokeStyle = held ? D.INK : 'rgba(255,255,255,0.35)'; c.lineWidth = 4 * u;
      c.setLineDash(held ? [] : [10 * u, 8 * u]);
      c.beginPath(); c.roundRect(-pr * 1.5, -pr * 0.62, pr * 3, pr * 1.24, pr * 0.5); c.fill(); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 1;
      txt(held ? 'HOLDING' : 'HOLD', 0, -8 * u, 34, held ? '#fff' : '#fff6c8');
      c.font = `600 ${14 * u}px Fredoka, sans-serif`; c.fillStyle = held ? D.INK : 'rgba(255,255,255,0.7)'; c.fillText(held ? 'let go to fling' : 'tap & hold anywhere', 0, 24 * u);
      c.restore();
    }
    c.restore();
  }
  drawLayers(c, ti, alpha, vx0, vx1) {
    const L = this.layer(ti), cam = this.cam;
    c.globalAlpha = alpha;
    for (const [img, pf] of [[L.far, 0.25], [L.mid, 0.5]]) {
      const base = cam.x * (1 - pf), y = D.TILE_Y0 + (cam.y - 360) * (1 - pf);
      let i = Math.floor((vx0 - base) / D.TILE_W);
      for (let x = base + i * D.TILE_W; x < vx1; x += D.TILE_W) c.drawImage(img, x - 1, y, D.TILE_W + 2, D.TILE_H);
    }
    c.globalAlpha = 1;
  }
  makeVig(W, H) {
    const v = document.createElement('canvas'); v.width = W; v.height = H;
    const x = v.getContext('2d'), r = Math.hypot(W, H) / 2;
    const g = x.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    return v;
  }
  preview(c, w) {
    const g = w.g;
    let x = g.x, y = g.y;
    const f = flingVel(g);
    let vx = f.vx, vy = f.vy;
    const dt = 1 / 60;
    // the dots turn gold (and brighter) while a release right now would be PERFECT
    c.fillStyle = f.perfect ? '#ffe066' : '#ffffff';
    for (let i = 1; i <= 36; i++) {
      vy += T.GRAV * dt; x += vx * dt; y += vy * dt;
      if (y > 700 || y < w.ceilY(x)) break;
      if (i % 3 === 0) { c.globalAlpha = (f.perfect ? 0.85 : 0.32) * (1 - i / 38); c.beginPath(); c.arc(x, y, (f.perfect ? 4.4 : 3.2) - i * 0.05, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
  }
  hintText(c, h, t) {
    c.save(); c.translate(h.x, h.y + Math.sin(t * 3) * 5);
    c.font = "34px 'Lilita One', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = D.INK; c.lineJoin = 'round'; c.strokeText(h.text, 0, 0);
    c.fillStyle = '#fff6c8'; c.fillText(h.text, 0, 0);
    c.restore();
  }
  drawParts(c) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      c.globalAlpha = Math.min(1, k * 1.6);
      if (p.type === 'star') { c.fillStyle = p.color; D.star(c, p.x, p.y, p.size * (0.4 + k * 0.6)); }
      else if (p.type === 'ring') { c.strokeStyle = p.color; c.lineWidth = 3 * k; c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k * 0.8), 0, TAU); c.stroke(); }
      else if (p.type === 'puff') { c.fillStyle = p.color; c.globalAlpha = k * 0.85; c.beginPath(); c.arc(p.x, p.y, p.size * (1.2 - k * 0.4), 0, TAU); c.fill(); }
      else if (p.type === 'chunk') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.strokeStyle = D.INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-p.size, -p.size * 0.6); c.lineTo(p.size * 0.8, -p.size); c.lineTo(p.size, p.size * 0.7); c.lineTo(-p.size * 0.5, p.size); c.closePath(); c.fill(); c.stroke(); c.restore(); }
      else if (p.type === 'line') { c.strokeStyle = p.color; c.globalAlpha = k * 0.22; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.cos(p.ang) * p.size, p.y - Math.sin(p.ang) * p.size); c.stroke(); }
      else if (p.type === 'coin') D.drawCoin(c, p.x, p.y, this.t * 3, p.ph);
      else if (p.type === 'ember') { c.globalAlpha = k; D.drawGlow(c, p.x, p.y, p.size * 4, '#ff8a2a', k * 0.8); c.fillStyle = p.color; c.fillRect(p.x - 1, p.y - 1, p.size * 0.7, p.size * 0.7); }
      else if (p.type === 'snow') { c.globalAlpha = 0.7; c.fillStyle = p.color; c.beginPath(); c.arc(p.x + Math.sin(this.t * 2 + p.ph) * 10, p.y, p.size, 0, TAU); c.fill(); }
      else { c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * k, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
  }
  hud(c, W, H) {
    const w = this.w, dpr = this.dpr, u = dpr * clamp(Math.min(innerWidth, innerHeight * 1.6) / 900, 0.7, 1.25);
    c.save();
    c.textBaseline = 'middle'; c.lineJoin = 'round';
    const txt = (s, x, y, size, col = '#fff', align = 'left') => { c.font = `${size * u}px 'Lilita One', sans-serif`; c.textAlign = align; c.lineWidth = 6 * u; c.strokeStyle = D.INK; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); };
    const pad = 16 * u + (dpr * 6);
    // coins
    c.save(); c.translate(pad + 14 * u, pad + 16 * u); const b = 1 + this.coinBump * 0.35; c.scale(u * 1.4 * b, u * 1.4 * b); D.drawCoin(c, 0, 0, 0, 0); c.restore();
    txt(this.deep ? `${w.coins}` : `${w.coins}/${w.L.totalCoins}`, pad + 34 * u, pad + 17 * u, 28 * (1 + this.coinBump * 0.15));
    // gems + big gem slot
    let gx = pad + 14 * u, gy = pad + 54 * u;
    c.save(); c.translate(gx, gy); c.scale(u, u); D.drawGem(c, 0, 0, 0, THEMES[this.themeAt(w.g.x)].gem, false, true); c.restore();
    txt(this.deep ? `${w.gems}` : `${w.gems}/${w.L.gems.length}`, gx + 20 * u, gy + 2 * u, 22);
    if (!this.deep && w.L.big) {
      const bx = gx + 92 * u;
      if (w.bigGot) { c.save(); c.translate(bx, gy); c.scale(u * 0.8, u * 0.8); D.drawGem(c, 0, 0, this.t, '#fff6a8', true, true); c.restore(); }
      else { c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2.5 * u; c.setLineDash([4 * u, 4 * u]); c.beginPath(); c.moveTo(bx - 14 * u, gy - 4 * u); c.lineTo(bx - 8 * u, gy - 12 * u); c.lineTo(bx + 8 * u, gy - 12 * u); c.lineTo(bx + 14 * u, gy - 4 * u); c.lineTo(bx, gy + 14 * u); c.closePath(); c.stroke(); c.setLineDash([]); txt('?', bx, gy, 16, 'rgba(255,255,255,0.6)', 'center'); }
    }
    // time (left of the pause button) or distance
    if (this.deep) {
      txt(`${w.distance()} m`, W / 2, pad + 20 * u, 40, '#ffe66a', 'center');
      txt(`best ${this.save.deep} m`, W / 2, pad + 52 * u, 18, '#d8d0ff', 'center');
    } else {
      txt(fmt(w.clock), W - 76 * dpr, pad + 18 * u, 28, '#fff', 'right');
      // progress strip (in portrait it is drawn in the HOLD band instead)
      if (!this.portrait) {
      const narrow = innerWidth < 640, half = narrow ? W * 0.3 : 140 * u, x0 = W / 2 - half, x1 = W / 2 + half, y = narrow ? pad + 92 * u : pad + 12 * u, sx = w.L.spawn.x, ex = w.L.chest ? w.L.chest.x : w.L.end;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.roundRect(x0 - 4 * u, y - 6 * u, x1 - x0 + 8 * u, 12 * u, 6 * u); c.fill();
      const k = clamp((w.maxX - sx) / (ex - sx), 0, 1);
      c.fillStyle = '#ffd23a'; c.beginPath(); c.roundRect(x0, y - 3 * u, (x1 - x0) * k, 6 * u, 3 * u); c.fill();
      for (const f of w.L.flags) { const fk = (f.x - sx) / (ex - sx); c.fillStyle = f.on ? '#5ee06a' : '#e8473a'; c.fillRect(x0 + (x1 - x0) * fk - 2 * u, y - 9 * u, 4 * u, 12 * u); }
      c.fillStyle = '#9a5a2c'; c.fillRect(x1 - 6 * u, y - 7 * u, 12 * u, 10 * u);
      const gk = clamp((w.g.x - sx) / (ex - sx), 0, 1);
      c.fillStyle = '#8ee05a'; c.strokeStyle = D.INK; c.lineWidth = 2.5 * u; c.beginPath(); c.arc(x0 + (x1 - x0) * gk, y, 7 * u, 0, TAU); c.fill(); c.stroke();
      }
    }
    // level banner
    if (this.banner > 0) {
      // sits in the open air between the anchor row and the floor (world y ~440), never over the anchors
      const k = this.banner, a = Math.min(1, k / 0.4), pop = k > BANNER - 0.15 ? 1 + (k - (BANNER - 0.15)) * 3 : 1;
      const by = this.oy + 440 * this.s * (this.zoom || 1) * dpr;
      c.globalAlpha = a;
      c.save(); c.translate(W / 2, by); c.scale(pop, pop);
      const L = w.L;
      txt(this.deep ? 'DEEP DIVE' : `CAVE ${L.n}`, 0, -26 * u, 26, '#ffe66a', 'center');
      txt(this.deep ? 'how far can you swing?' : L.name, 0, 14 * u, 46, '#fff', 'center');
      if (!this.deep && L.n % 5 === 1) txt(THEMES[L.theme].name, 0, 50 * u, 20, '#c8ffb0', 'center');
      c.restore();
      c.globalAlpha = 1;
    }
    c.restore();
  }
  // ------------------------------------------------------------ test hooks
  // run the sim fast with the autopilot (no rendering): __G.fast(30)
  fast(seconds, useBot = true) {
    const w = this.w, dt = 1 / 120;
    for (let i = 0; i < seconds * 120 && !w.done && !w.over; i++) { w.step(dt, useBot ? botHold(w) : this.holding); this.handleEvents(); }
    this.updateCam(1);
    return { done: w.done, x: Math.round(w.g.x), coins: w.coins, deaths: w.deaths, clock: +w.clock.toFixed(2) };
  }
  win() { const w = this.w; if (!w.L.chest) return; w.g = w.goblin(w.L.chest.x - 30, FLOOR - 15); w.coins = w.L.totalCoins; w.bigGot = true; w.step(1 / 120, false); }
}

new Game();
