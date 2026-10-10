// BLADE DASH - tap to dash-slash. Every hit refills your dash, so chain the
// whole room without touching the ground.
import { W, H, FLOOR, CHAPTERS, buildStage, buildArena, waveSpawns } from './levels.js';
import { paintRoom, drawFigure, pose, lerpPose, splat, stamp, BRUSH, DISPLAY } from './draw.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const STAGES = 30;
const SAVE_KEY = 'pd.bladedash';
const G = 2500, MAXFALL = 1500, DASH_SPEED = 2600, DASH_LEN = 300, ASSIST_LEN = 480, MAX_CHARGES = 2;
const R_PLAYER = 18;
const FOCUS_MAX = 2.5, FOCUS_SCALE = 0.3, FOCUS_REGEN = 0.2, FOCUS_PER_KILL = 0.5;
const ENEMY_R = { grunt: 24, flyer: 24, archer: 24, shield: 26, bomber: 25, general: 34 };
// enemies never kill by touch: they wind up (red !) and then swing through this reach
const REACH = { grunt: 85, shield: 78, bomber: 72, general: 120 };
const WINDUP = { grunt: 0.55, shield: 0.5, bomber: 0.6, general: 0.42 };
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { stars: {}, best: {}, endless: 0, unlocked: 1, music: 0.6, sfx: 0.9 };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx;
    this.decal = document.createElement('canvas'); this.decal.width = W; this.decal.height = H;
    this.dctx = this.decal.getContext('2d');
    this.mode = 'title';
    this.time = 0;
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.ambient = [];
    for (let i = 0; i < 26; i++) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 6, v: 20 + Math.random() * 40 });
    this.loadStage(buildStage(1), false);
    this.mode = 'title';
    document.fonts.ready.then(() => { this.fontsReady = true; });
    this.ui.show('title');
    if (params.has('stage')) this.startStage(parseInt(params.get('stage'), 10) || 1);
    if (params.has('endless')) this.startEndless();
    window.__BD = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* blocked */ } }
  get pal() { return CHAPTERS[this.stage.chapter]; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    const s = Math.min(innerWidth / W, innerHeight / H);
    this.view = { s, ox: (innerWidth - W * s) / 2, oy: (innerHeight - H * s) / 2 };
  }
  toWorld(cx, cy) { return { x: (cx - this.view.ox) / this.view.s, y: (cy - this.view.oy) / this.view.s }; }

  // ------------------------------------------------------------ input
  input() {
    this.keys = new Set();
    this.mouse = null;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'play' || this.ui.open) return;
      const p = this.toWorld(e.clientX, e.clientY);
      this.tap(p.x, p.y);
    });
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.mouse = this.toWorld(e.clientX, e.clientY); });
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && this.ui.panel !== 'title' && this.ui.panel !== 'result') { this.ui.back(); return; }
        if (this.mode === 'play' && !this.ui.open) { this.ui.show('pause'); return; }
      }
      if (this.ui.open) { if ((e.code === 'Enter' || e.code === 'Space') && this.ui.panel === 'result') { e.preventDefault(); this.ui.primary(); } return; }
      if (this.mode !== 'play') return;
      if (e.code === 'KeyR') { this.restart(); return; }
      if (e.code === 'Space') { e.preventDefault(); this.setFocus(true); return; }
      if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'Enter') {
        e.preventDefault();
        let dx = 0, dy = 0;
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
        if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
        if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
        const p = this.player, cx = p.x, cy = p.y - 36;
        if (dx || dy) this.tap(cx + dx * 300, cy + dy * 300);
        else if (this.mouse) this.tap(this.mouse.x, this.mouse.y);
        else { const e2 = this.nearestEnemy(); if (e2) this.tap(e2.x, this.ecy(e2)); else this.tap(cx + p.face * 300, cy - 120); }
      }
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space') this.setFocus(false); });
    addEventListener('blur', () => { this.keys.clear(); this.setFocus(false); if (this.mode === 'play' && !this.ui.open) this.ui.show('pause'); });
  }

  // ------------------------------------------------------------ rooms
  loadStage(stage, endless) {
    this.stage = stage;
    this.endless = endless;
    this.bg = paintRoom(stage, CHAPTERS[stage.chapter]);
    this.dctx.clearRect(0, 0, W, H);
    this.solids = stage.floor.map(([a, b]) => ({ x: a, y: FLOOR, w: b - a, h: 400 }));
    this.enemies = stage.enemies.map((e) => this.makeEnemy(e.type, e.x, e.y, e));
    const P = stage.start;
    this.player = { x: P.x, y: P.y, vx: 0, vy: 0, onGround: true, charges: MAX_CHARGES, dash: null, face: 1, alive: true, float: 0, landT: 0, slashT: 0, ghosts: [], ghostT: 0, queued: null, inv: 0 };
    this.player.scarf = Array.from({ length: 7 }, () => ({ x: P.x, y: P.y - 66, px: P.x, py: P.y - 66 }));
    this.arrows = []; this.halves = []; this.parts = []; this.texts = []; this.trails = [];
    this.combo = 0; this.maxCombo = 0; this.kills = 0; this.total = this.enemies.length;
    this.clock = 0; this.started = false;
    this.hitstop = 0; this.slow = 0; this.shake = 0; this.zoom = 1; this.zoomTo = null;
    this.comboPop = 0; this.tipFade = 1;
    this.intro = 0.9;
    this.focus = FOCUS_MAX; this.focusAmt = 0;
    this.score = 0; this.wave = 0; this.waveT = 1.2;
    this.clearT = 0; this.deadT = 0;
  }
  makeEnemy(type, x, y, src = {}) {
    return {
      type, x, y, r: ENEMY_R[type], alive: true, t: Math.random() * 10,
      face: src.face || (x > W / 2 ? -1 : 1), x0: src.x0 ?? x - 60, x1: src.x1 ?? x + 60,
      bx: x, by: y, phase: src.phase ?? Math.random() * 6.28,
      hp: type === 'general' ? 3 : 1, flash: 0, shootT: rand(2.2, 3.4), spawn: 0, walk: 0, inv: 0,
    };
  }
  startStage(n) {
    this.stageN = n;
    this.loadStage(buildStage(n), false);
    this.mode = 'play';
    this.ui.close();
    this.ui.hud(true);
    this.audio.unlock();
    this.audio.intensity = 0.2;
  }
  startEndless() {
    this.stageN = 0;
    this.loadStage(buildArena(), true);
    this.mode = 'play';
    this.ui.close();
    this.ui.hud(true);
    this.audio.unlock();
  }
  setFocus(on) {
    if (on === this.focusHeld) return;
    this.focusHeld = on;
    if (on && this.mode === 'play' && !this.ui.open && this.focus > 0.05) this.audio.play('focusIn');
  }
  restart() { if (this.endless) this.startEndless(); else this.startStage(this.stageN); }
  ecy(e) { return e.type === 'flyer' ? e.y - 40 : e.y - (e.type === 'general' ? 50 : 38); }
  nearestEnemy() {
    let best = null, bd = 1e9;
    for (const e of this.enemies) if (e.alive && !e.spawn) { const d = Math.hypot(e.x - this.player.x, this.ecy(e) - this.player.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ------------------------------------------------------------ dashing
  tap(tx, ty) {
    const p = this.player;
    if (!p.alive || this.intro > 0 || this.clearT > 0) return;
    if (p.dash) { p.queued = { x: tx, y: ty, t: 0.18 }; return; }
    if (p.charges <= 0) { this.puff(p.x, p.y - 36, 6, this.pal.ink); return; }
    const cx = p.x, cy = p.y - 36;
    let dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    let len = DASH_LEN;
    // aim assist: snap to the enemy closest to where you pointed
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (!e.alive || e.spawn > 0) continue;
      const ex = e.x - cx, ey = this.ecy(e) - cy, ed = Math.hypot(ex, ey);
      if (ed > ASSIST_LEN || ed < 1) continue;
      const ang = Math.acos(clamp((ex * dx + ey * dy) / ed, -1, 1));
      if (ang > 0.45) continue;
      const sc = ang * 320 + ed * 0.35;
      if (sc < bs) { bs = sc; best = { e, ex, ey, ed }; }
    }
    if (best) { dx = best.ex / best.ed; dy = best.ey / best.ed; len = Math.min(ASSIST_LEN, best.ed + 46); }
    p.charges--;
    const trail = { pts: [{ x: cx, y: cy }], life: 0.22, max: 0.22 };
    p.dash = { dx, dy, left: len, hit: new Set(), trail };
    p.onGround = false;
    p.face = dx >= 0 ? 1 : -1;
    if (!this.started) this.started = true;
    this.audio.play('dash', 1 + this.combo * 0.04);
    this.trails.push(trail);
  }

  // ------------------------------------------------------------ physics
  moveBody(p, mx, my) {
    // x
    p.x += mx;
    p.x = clamp(p.x, 14, W - 14);
    for (const s of this.solids) {
      if (p.x + 12 > s.x && p.x - 12 < s.x + s.w && p.y > s.y + 2 && p.y - 58 < s.y + s.h) {
        p.x = mx > 0 ? s.x - 12 : s.x + s.w + 12;
        if (p.dash) this.endDash(false);
      }
    }
    // y
    const prevY = p.y;
    p.y += my;
    let landed = false;
    if (my > 0) {
      for (const s of this.solids) if (p.x + 10 > s.x && p.x - 10 < s.x + s.w && prevY <= s.y + 1 && p.y >= s.y) { p.y = s.y; landed = true; }
      // dashes cut straight through floating platforms; you only land on them when falling
      if (!p.dash) for (const pl of this.stage.plats) if (p.x + 10 > pl.x && p.x - 10 < pl.x + pl.w && prevY <= pl.y + 1 && p.y >= pl.y) { p.y = pl.y; landed = true; }
    }
    if (p.y - 60 < 0) { p.y = 60; if (p.vy < 0) p.vy = 0; if (p.dash && p.dash.dy < 0) this.endDash(false); }
    return landed;
  }
  endDash(keep = true) {
    const p = this.player, d = p.dash;
    if (!d) return;
    p.dash = null;
    p.vx = keep ? d.dx * 420 : 0;
    p.vy = keep ? d.dy * 420 - 120 : 0;
    p.slashT = 0.12;
  }
  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    p.inv = Math.max(0, p.inv - dt);
    p.float = Math.max(0, p.float - dt);
    p.slashT = Math.max(0, p.slashT - dt);
    if (p.queued) { p.queued.t -= dt; if (p.queued.t <= 0) p.queued = null; }
    if (p.dash) {
      const d = p.dash;
      const step = Math.min(d.left, DASH_SPEED * dt);
      const x0 = p.x, y0 = p.y - 36;
      const landed = this.moveBody(p, d.dx * step, d.dy * step);
      d.left -= step;
      this.sweep(x0, y0, p.x, p.y - 36, d);   // pass the dash in: hitting a wall can end it mid-frame
      d.trail.pts.push({ x: p.x, y: p.y - 36 });
      p.ghostT -= dt;
      if (p.ghostT <= 0) { p.ghostT = 0.018; p.ghosts.push({ x: p.x, y: p.y, rot: Math.atan2(d.dy, Math.abs(d.dx)) * p.face, face: p.face, life: 0.2 }); }
      if (landed) { p.dash = null; p.vx = 0; p.vy = 0; this.land(); }
      else if (p.dash && d.left <= 0) this.endDash(true);
      if (!p.dash && p.queued) { const q = p.queued; p.queued = null; this.tap(q.x, q.y); }
    } else {
      p.vy = Math.min(MAXFALL, p.vy + G * (p.float > 0 ? 0.15 : 1) * dt);
      if (p.onGround) { p.vx *= Math.pow(0.0001, dt); p.vy = 0; }
      else p.vx *= Math.pow(0.4, dt);
      const wasGround = p.onGround;
      const landed = this.moveBody(p, p.vx * dt, p.vy * dt);
      if (landed) { if (!wasGround) this.land(); p.onGround = true; p.vy = 0; }
      else if (p.onGround) {
        // walked off an edge?
        const under = this.solids.some((s) => p.x + 10 > s.x && p.x - 10 < s.x + s.w && Math.abs(p.y - s.y) < 2) || this.stage.plats.some((pl) => p.x + 10 > pl.x && p.x - 10 < pl.x + pl.w && Math.abs(p.y - pl.y) < 2);
        if (!under) p.onGround = false;
      }
    }
    for (const g of p.ghosts) g.life -= dt;
    p.ghosts = p.ghosts.filter((g) => g.life > 0);
    // scarf: a little verlet rope off the neck
    const nk = this.neck();
    const sc = p.scarf;
    sc[0].x = nk.x; sc[0].y = nk.y;
    for (let i = 1; i < sc.length; i++) {
      const q = sc[i];
      const vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9;
      q.px = q.x; q.py = q.y;
      q.x += vx - p.face * 1.1; q.y += vy + 0.55;   // drift back off the shoulder and hang down
    }
    for (let it = 0; it < 3; it++) for (let i = 1; i < sc.length; i++) {
      const a = sc[i - 1], b = sc[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - 7) / d;
      b.x -= dx * k; b.y -= dy * k;
    }
    // hazards
    if (p.y > H + 40 || (p.y > H - 30 && !this.solids.some((s) => p.x > s.x && p.x < s.x + s.w))) this.die('fell');

  }
  neck() {
    const p = this.player;
    if (p.dash) return { x: p.x + p.dash.dx * 14, y: p.y - 36 + p.dash.dy * 14 - 20 };
    return { x: p.x + p.face * 3, y: p.y - 70 };
  }
  land() {
    const p = this.player;
    p.onGround = true;
    p.charges = MAX_CHARGES;
    if (this.combo > 0 && this.kills < this.total) this.combo = 0;
    this.audio.play('land');
    for (let k = 0; k < 6; k++) this.parts.push({ x: p.x + rand(-12, 12), y: p.y - 2, vx: rand(-90, 90), vy: rand(-120, -30), life: 0.4, max: 0.4, size: rand(2, 4), color: this.pal.ink, g: 400 });
  }
  sweep(x0, y0, x1, y1, d) {
    const p = this.player;
    if (!d) return;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    const near = (cx, cy) => { const t = clamp(((cx - x0) * dx + (cy - y0) * dy) / L2, 0, 1); return Math.hypot(cx - (x0 + dx * t), cy - (y0 + dy * t)); };
    for (const e of this.enemies) {
      if (!e.alive || e.spawn > 0 || d.hit.has(e) || e.inv > 0) continue;
      if (near(e.x, this.ecy(e)) > e.r + R_PLAYER) continue;
      d.hit.add(e);
      // shields block a dash that comes at their face (unless it comes down from above)
      if (e.type === 'shield' && d.dx * e.face < -0.3 && d.dy < 0.3) {
        this.audio.play('clang');
        for (let k = 0; k < 12; k++) this.parts.push({ x: e.x + e.face * 14, y: this.ecy(e), vx: rand(-260, 260), vy: rand(-300, 60), life: 0.35, max: 0.35, size: rand(1.5, 3), color: '#ffcf3a', g: 600 });
        p.dash = null; p.vx = -d.dx * 520; p.vy = -380; p.inv = 0.25;
        this.shake = Math.max(this.shake, 8);
        this.text(e.x, this.ecy(e) - 40, 'CLANG!', 26, this.pal.ink);
        return;
      }
      this.hit(e, d.dx, d.dy);
      if (p.dash !== d) return;
    }
    for (const a of this.arrows) {
      if (a.dead || near(a.x, a.y) > 22) continue;
      a.dead = true;
      this.audio.play('parry');
      this.text(a.x, a.y - 20, 'CUT!', 22, this.pal.accent);
      this.score += 50;
      for (let k = 0; k < 6; k++) this.parts.push({ x: a.x, y: a.y, vx: rand(-200, 200), vy: rand(-200, 0), life: 0.4, max: 0.4, size: 2, color: this.pal.ink, g: 800 });
    }
  }
  hit(e, dx, dy) {
    const p = this.player;
    if (e.type === 'general' && e.hp > 1) {
      e.hp--; e.flash = 0.2; e.inv = 0.12;
      // stagger him back, and bounce the player clear: the dash would otherwise end inside him
      e.x = clamp(e.x + dx * 50, e.x0, e.x1);
      e.stun = 0.8;
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboPop = 1;
      p.dash = null;
      p.vx = -dx * 460;
      p.vy = Math.min(-480, -dy * 400 - 360);
      p.onGround = false;
      p.inv = 0.5;
      p.slashT = 0.12;
      p.charges = MAX_CHARGES; p.float = 0.25;
      this.hitstop = 0.07; this.shake = Math.max(this.shake, 9);
      this.audio.play('clang'); this.audio.play('slash', 0.8);
      splat(this.dctx, e.x, this.ecy(e), 12, this.pal.accent, dx, dy);
      this.text(e.x, this.ecy(e) - 60, `${e.hp} more!`, 24, this.pal.accent);
      return;
    }
    this.kill(e, dx, dy, false);
  }
  kill(e, dx, dy, byBlast) {
    if (!e.alive) return;
    const p = this.player;
    e.alive = false;
    this.kills++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboPop = 1;
    p.charges = MAX_CHARGES;
    p.float = 0.24;
    p.inv = Math.max(p.inv, 0.15);
    this.focus = Math.min(FOCUS_MAX, this.focus + FOCUS_PER_KILL);   // a dash that ends inside the next enemy shouldn't kill you on the spot
    const cy = this.ecy(e);
    // cut the enemy in two along the slash
    const img = document.createElement('canvas'); img.width = 160; img.height = 160;
    const ix = img.getContext('2d');
    this.drawEnemy(ix, e, 80, e.type === 'flyer' ? 120 : 118, true);
    const ang = Math.atan2(dy, dx);
    for (const s of [-1, 1]) {
      const nx = -Math.sin(ang) * s, ny = Math.cos(ang) * s;
      this.halves.push({ img, x: e.x, y: cy, vx: nx * 220 + dx * 180, vy: ny * 220 + dy * 120 - 220, rot: 0, vr: s * rand(4, 9), ang, side: s, life: 1.6 });
    }
    splat(this.dctx, e.x + dx * 20, cy + dy * 20, e.type === 'general' ? 26 : 16, this.pal.accent, dx, dy);
    if (Math.random() < 0.6) splat(this.dctx, e.x + dx * 70, Math.min(FLOOR - 4, cy + 40), 8, this.pal.accent, dx, 0.2);
    for (let k = 0; k < 16; k++) this.parts.push({ x: e.x, y: cy, vx: dx * rand(200, 600) + rand(-150, 150), vy: dy * rand(200, 500) + rand(-300, 100), life: rand(0.3, 0.7), max: 0.7, size: rand(2, 5), color: Math.random() < 0.6 ? this.pal.accent : this.pal.ink, g: 1200 });
    this.trails.push({ slash: true, x: e.x, y: cy, ang, life: 0.25, max: 0.25 });
    this.hitstop = Math.max(this.hitstop, byBlast ? 0.02 : 0.055);
    this.shake = Math.max(this.shake, byBlast ? 5 : 7);
    this.audio.play('slash', 1 + Math.min(this.combo, 12) * 0.05);
    if (this.combo >= 2) this.audio.play('combo', 1 + Math.min(this.combo, 10) * 0.1);
    const pts = 100 * this.combo;
    this.score += pts;
    this.text(e.x, cy - 46, this.endless ? `+${pts}` : this.combo >= 2 ? `×${this.combo}` : '', 26, this.pal.ink);
    if (e.type === 'bomber') setTimeout(() => this.blast(e.x, cy), 110);
    const left = this.enemies.filter((q) => q.alive).length;
    if (!this.endless && left === 0) this.finishRoom(e.x, cy);
  }
  strike(e) {
    const p = this.player, reach = REACH[e.type], cy = this.ecy(e);
    this.trails.push({ slash: true, enemy: true, x: e.x + e.face * reach * 0.55, y: cy - 6, ang: e.face > 0 ? 0.35 : Math.PI - 0.35, life: 0.18, max: 0.18 });
    this.audio.play('dash', 0.6);
    if (!p.alive || p.dash || p.inv > 0) return;
    const fx = (p.x - e.x) * e.face, dy = (p.y - 36) - cy;
    if (fx > -26 && fx < reach + 24 && Math.abs(dy) < 82) this.die('hit');
  }
  blast(x, y) {
    this.audio.play('boom');
    this.shake = Math.max(this.shake, 16);
    this.trails.push({ ring: true, x, y, life: 0.4, max: 0.4 });
    splat(this.dctx, x, y, 34, this.pal.ink, 0, 0);
    for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = rand(200, 700); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, size: rand(3, 7), color: k % 3 ? this.pal.ink : '#ff8a2a', g: 300 }); }
    for (const e of this.enemies) if (e.alive && !e.spawn && Math.hypot(e.x - x, this.ecy(e) - y) < 170) { if (e.type === 'general') { e.hp = Math.max(1, e.hp - 1); e.flash = 0.2; } else this.kill(e, Math.sign(e.x - x) || 1, -0.3, true); }
  }
  die(why) {
    const p = this.player;
    if (!p.alive || this.clearT > 0) return;
    p.alive = false;
    this.audio.play('die');
    this.shake = 14; this.hitstop = 0.12;
    splat(this.dctx, p.x, p.y - 36, 22, this.pal.accent, 0, -0.3);
    for (let k = 0; k < 24; k++) this.parts.push({ x: p.x, y: p.y - 36, vx: rand(-400, 400), vy: rand(-500, 100), life: rand(0.4, 0.9), max: 0.9, size: rand(2, 6), color: k % 2 ? this.pal.ink : this.pal.accent, g: 1200 });
    this.deadT = 1.0;
    this.deathWhy = why;
    if (this.endless) {
      const best = this.score > this.save.endless;
      if (best) { this.save.endless = this.score; this.persist(); }
      this.endResult = { score: this.score, wave: this.wave, best, top: this.save.endless, chain: this.maxCombo };
    }
  }
  finishRoom(x, y) {
    this.clearT = 2.0;
    this.slow = 0.9;
    this.zoomTo = { x, y };
    const time = Math.round(this.clock * 100) / 100;
    const n = this.stageN;
    const stars = [true, time <= this.stage.par, this.maxCombo >= this.total];
    const old = this.save.stars[n] || [false, false, false];
    const newStars = stars.map((s, i) => s && !old[i]);
    this.save.stars[n] = stars.map((s, i) => s || old[i]);
    const prevBest = this.save.best[n];
    this.save.best[n] = prevBest ? Math.min(prevBest, time) : time;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(STAGES, n + 1));
    this.persist();
    this.result = { n, time, par: this.stage.par, stars, newStars, best: this.save.best[n], newBest: !prevBest || time < prevBest, chain: this.maxCombo, total: this.total };
    this.audio.play('clear');
  }

  // ------------------------------------------------------------ enemies
  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.inv = Math.max(0, e.inv - dt);
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      if (e.type === 'flyer') {
        e.x = e.bx + Math.sin(e.t * 0.8 + e.phase) * 34;
        e.y = e.by + Math.sin(e.t * 1.6 + e.phase) * 16;
        e.face = p.x > e.x ? 1 : -1;
        continue;
      }
      if (e.type === 'archer') {
        e.face = p.x > e.x ? 1 : -1;
        if (!p.alive || this.clearT > 0 || !this.started) continue;
        e.shootT -= dt;
        if (e.shootT <= 0) {
          const sx = e.x + e.face * 20, sy = e.y - 50;
          const tx = p.x, ty = p.y - 36;   // aim where you are, not where you are going
          const d = Math.hypot(tx - sx, ty - sy) || 1;
          this.arrows.push({ x: sx, y: sy, vx: (tx - sx) / d * 600, vy: (ty - sy) / d * 600, life: 2.6 });
          this.audio.play('twang');
          e.shootT = rand(2.2, 3.0);
        }
        continue;
      }
      // walkers: grunt, shield, bomber, general
      if (e.stun > 0) { e.stun -= dt; e.atk = null; continue; }
      e.cool = Math.max(0, (e.cool || 0) - dt);
      if (e.atk) {
        e.atk.t -= dt;
        e.face = e.atk.face;
        if (e.atk.t <= 0) { e.atk = null; e.cool = 0.95; e.strikeT = 0.2; this.strike(e); }
        continue;
      }
      if (e.strikeT > 0) { e.strikeT -= dt; continue; }
      if (this.started && p.alive && !p.dash && e.cool <= 0 && this.clearT <= 0) {
        const ddx = p.x - e.x, ddy = (p.y - 36) - this.ecy(e);
        if (Math.abs(ddx) < REACH[e.type] && Math.abs(ddy) < 80) {
          e.atk = { t: WINDUP[e.type], max: WINDUP[e.type], face: ddx >= 0 ? 1 : -1 };
          this.audio.play('warn');
          continue;
        }
      }
      let sp =e.type === 'grunt' ? 55 : e.type === 'general' ? 75 : e.type === 'bomber' ? 40 : 30;
      if (e.type === 'general' || e.type === 'shield') {
        if (e.type === 'general') e.face = p.x > e.x ? 1 : -1;
        else { e.turnT = (e.turnT ?? 1.2) - dt; if (e.turnT <= 0) { e.turnT = 2.2; e.face = p.x > e.x ? 1 : -1; } }
        if (e.type === 'general' && Math.abs(p.x - e.x) < 30) sp = 0;
      }
      if (!this.started && e.type !== 'grunt') sp = 0;
      e.x += e.face * sp * dt;
      if (e.x < e.x0) { e.x = e.x0; if (e.type !== 'general') e.face = 1; }
      if (e.x > e.x1) { e.x = e.x1; if (e.type !== 'general') e.face = -1; }
      e.walk += dt * sp * 0.12;
    }
    for (const a of this.arrows) {
      if (a.dead) continue;
      a.x += a.vx * dt; a.y += a.vy * dt; a.vy += 120 * dt; a.life -= dt;
      if (a.life <= 0 || a.x < -20 || a.x > W + 20 || a.y > H) { a.dead = true; continue; }
      if (this.solids.some((s) => a.x > s.x && a.x < s.x + s.w && a.y > s.y)) { a.dead = true; continue; }
      if (p.alive && !p.dash && p.inv <= 0 && Math.hypot(a.x - p.x, a.y - (p.y - 36)) < 15) { a.dead = true; this.die('arrow'); }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);
  }

  // endless waves
  updateWaves(dt) {
    if (!this.enemies.some((e) => e.alive)) {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.wave++;
        this.waveT = 1.2;
        this.enemies = [];
        this.audio.play('star');
        this.text(W / 2, 200, `WAVE ${this.wave}`, 54, this.pal.accent);
        const spots = [{ x0: 40, x1: W - 40, y: FLOOR }, ...this.stage.plats.map((p) => ({ x0: p.x + 30, x1: p.x + p.w - 30, y: p.y }))];
        for (const type of waveSpawns(this.wave)) {
          for (let t = 0; t < 30; t++) {
            let x, y;
            if (type === 'flyer') { x = rand(120, W - 120); y = rand(140, 520); }
            else { const s = spots[Math.floor(Math.random() * spots.length)]; x = rand(s.x0, s.x1); y = s.y; }
            if (Math.hypot(x - this.player.x, y - this.player.y) < 260) continue;
            const e = this.makeEnemy(type, x, y, spots.find((s) => s.y === y) ? { x0: spots.find((s) => s.y === y).x0, x1: spots.find((s) => s.y === y).x1 } : {});
            e.spawn = 0.8;
            this.enemies.push(e);
            break;
          }
        }
        this.total = this.enemies.length;
      }
    }
  }

  // ------------------------------------------------------------ fx helpers
  text(x, y, s, size, color) { if (s) this.texts.push({ x, y, s, size, color, life: 0.9, max: 0.9 }); }
  puff(x, y, n, color) { for (let k = 0; k < n; k++) this.parts.push({ x, y, vx: rand(-80, 80), vy: rand(-80, 40), life: 0.3, max: 0.3, size: 3, color, g: 0 }); }

  // ------------------------------------------------------------ loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const playing = this.mode === 'play' && !this.ui.open;
    if (playing) this.update(dt);
    this.audio.intensity = playing ? Math.min(1, 0.25 + this.combo * 0.12) : 0.15;
    this.audio.update(dt, playing);
    this.render(dt);
  }
  update(dtReal) {
    if (this.hitstop > 0) { this.hitstop -= dtReal; this.shake *= 0.9; return; }
    let dt = dtReal;
    if (this.slow > 0) { this.slow -= dtReal; dt *= 0.22; }
    // focus (Space / hold button): bullet-time while the meter lasts; it refills slowly and on kills
    const focusing = this.focusHeld && this.focus > 0 && this.player.alive && this.clearT <= 0;
    if (focusing) { this.focus = Math.max(0, this.focus - dtReal); if (this.slow <= 0) dt *= FOCUS_SCALE; if (this.focus <= 0) this.audio.play('focusOut'); }
    else this.focus = Math.min(FOCUS_MAX, this.focus + dtReal * FOCUS_REGEN);
    this.focusAmt += ((focusing ? 1 : 0) - this.focusAmt) * Math.min(1, dtReal * 10);
    if (this.intro > 0) { this.intro -= dtReal; }
    if (this.started && this.clearT <= 0 && this.player.alive) this.clock += dtReal;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    if (this.endless && this.player.alive) this.updateWaves(dtReal);
    for (const h of this.halves) {
      h.vy += 1300 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.life -= dt;
      if (h.y > FLOOR - 12 && this.solids.some((s) => h.x > s.x && h.x < s.x + s.w)) { h.y = FLOOR - 12; h.vy *= -0.25; h.vx *= 0.6; h.vr *= 0.5; }
    }
    this.halves = this.halves.filter((h) => h.life > 0);
    for (const q of this.parts) { q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const t of this.texts) { t.y -= 40 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const t of this.trails) t.life -= dtReal;
    this.trails = this.trails.filter((t) => t.life > 0);
    this.comboPop = Math.max(0, this.comboPop - dtReal * 4);
    if (this.kills > 0) this.tipFade = Math.max(0, this.tipFade - dtReal * 0.8);
    this.shake *= Math.pow(0.002, dtReal);
    if (this.clearT > 0) {
      this.clearT -= dtReal;
      if (this.clearT <= 0) { this.ui.show('result', this.result); }
    }
    if (this.deadT > 0) {
      this.deadT -= dtReal;
      if (this.deadT <= 0) {
        if (this.endless) this.ui.show('endless', this.endResult);
        else this.restart();
      }
    }
  }

  // ------------------------------------------------------------ drawing
  drawEnemy(x, e, px, py, still) {
    const pal = this.pal;
    let P = pose('idle');
    if (e.type === 'archer') P = pose('aim');
    else if (e.atk && !still) P = lerpPose(pose('idle'), pose('raise'), Math.min(1, (1 - e.atk.t / e.atk.max) * 1.6));
    else if (e.strikeT > 0 && !still) P = pose('slash');
    else if (!still && (e.type === 'grunt' || e.type === 'shield' || e.type === 'bomber' || e.type === 'general')) P = lerpPose(pose('walkA'), pose('walkB'), (Math.sin(e.walk * 2) + 1) / 2);
    const draw = e.type === 'archer' ? clamp(1 - e.shootT / 0.8, 0, 1) : 0;
    drawFigure(x, px, py, { pose: P, face: e.face, scale: e.type === 'general' ? 1.35 : 1, ink: e.flash > 0 ? pal.accent : pal.ink, paper: pal.paper, accent: pal.accent, mask: e.flash > 0 ? pal.accent : (this.stage.chapter === 2 ? '#2a3248' : '#fffaf0'), kind: e.type, t: e.t, draw });
  }
  render(dt) {
    const x = this.ctx, v = this.view, pal = this.pal, p = this.player;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = this.stage.chapter === 2 ? '#0d111c' : '#1a1410';
    x.fillRect(0, 0, innerWidth, innerHeight);
    x.setTransform(this.dpr * v.s, 0, 0, this.dpr * v.s, this.dpr * v.ox, this.dpr * v.oy);
    x.save();
    x.beginPath(); x.rect(0, 0, W, H); x.clip();
    // camera: shake and a punch-in on the final kill
    const sh = this.shake;
    x.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    const zt = this.clearT > 0 ? Math.min(1, (2.0 - this.clearT) * 3) * Math.min(1, this.clearT * 2) : 0;
    if (this.zoomTo && zt > 0) { const z = 1 + 0.18 * zt; x.translate(this.zoomTo.x, this.zoomTo.y); x.scale(z, z); x.translate(-this.zoomTo.x, -this.zoomTo.y); }
    x.drawImage(this.bg, 0, 0);
    x.drawImage(this.decal, 0, 0);
    // archer aim lines
    for (const e of this.enemies) {
      if (!e.alive || e.type !== 'archer' || e.spawn > 0 || !this.started || !p.alive) continue;
      if (e.shootT < 0.8) {
        const k = 1 - e.shootT / 0.8;
        x.strokeStyle = pal.accent; x.globalAlpha = 0.25 + k * 0.6; x.lineWidth = 1 + k * 2; x.setLineDash([8, 8]);
        x.beginPath(); x.moveTo(e.x + e.face * 20, e.y - 50); x.lineTo(p.x, p.y - 36); x.stroke();
        x.setLineDash([]); x.globalAlpha = 1;
      }
    }
    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.spawn > 0) {
        const k = 1 - e.spawn / 0.8;
        x.globalAlpha = 0.6; x.fillStyle = pal.ink;
        x.beginPath(); x.arc(e.x, this.ecy(e), 40 * (1 - k) + 6, 0, 7); x.fill();
        x.globalAlpha = k; this.drawEnemy(x, e, e.x, e.y, true); x.globalAlpha = 1;
        continue;
      }
      if (e.atk) {
        // telegraph: a red arc where the swing will land, and a pulsing !
        const k = 1 - e.atk.t / e.atk.max, cy = this.ecy(e), reach = REACH[e.type];
        x.save();
        x.globalAlpha = 0.12 + k * 0.28; x.fillStyle = pal.accent;
        x.beginPath(); x.moveTo(e.x, cy);
        if (e.face > 0) x.arc(e.x, cy, reach * (0.6 + k * 0.4), -0.9, 0.9); else x.arc(e.x, cy, reach * (0.6 + k * 0.4), Math.PI - 0.9, Math.PI + 0.9);
        x.closePath(); x.fill();
        x.restore();
      }
      this.drawEnemy(x, e, e.x, e.y, false);
      if (e.atk) {
        const k = 1 - e.atk.t / e.atk.max, hy = e.y - (e.type === 'general' ? 150 : 108);
        const s = 1 + Math.sin(this.time * 30) * 0.12 + k * 0.3;
        x.save(); x.translate(e.x, hy); x.scale(s, s);
        x.font = `40px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 6; x.strokeStyle = pal.paper; x.strokeText('!', 0, 0);
        x.fillStyle = pal.accent; x.fillText('!', 0, 0);
        x.restore();
      }
      if (e.type === 'general') for (let k = 0; k < e.hp; k++) { x.fillStyle = pal.accent; x.beginPath(); x.arc(e.x - 12 + k * 12, e.y - 128, 4.5, 0, 7); x.fill(); }
    }
    // arrows
    x.strokeStyle = pal.ink; x.lineWidth = 2.5;
    for (const a of this.arrows) {
      const d = Math.hypot(a.vx, a.vy);
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(a.x - a.vx / d * 26, a.y - a.vy / d * 26); x.stroke();
      x.fillStyle = pal.accent; x.beginPath(); x.arc(a.x - a.vx / d * 26, a.y - a.vy / d * 26, 3, 0, 7); x.fill();
    }
    // halves
    for (const h of this.halves) {
      x.save(); x.globalAlpha = Math.min(1, h.life * 1.5);
      x.translate(h.x, h.y); x.rotate(h.rot);
      x.rotate(h.ang); x.beginPath(); x.rect(-120, h.side > 0 ? 0 : -120, 240, 120); x.rotate(-h.ang); x.clip();
      x.drawImage(h.img, -80, -80);
      x.restore();
    }
    // dash trails: a white-hot stroke edged in ink
    for (const t of this.trails) {
      const k = t.life / t.max;
      if (t.ring) { x.strokeStyle = pal.ink; x.globalAlpha = k; x.lineWidth = 10 * k; x.beginPath(); x.arc(t.x, t.y, 170 * (1 - k) + 20, 0, 7); x.stroke(); x.globalAlpha = 1; continue; }
      if (t.slash) {
        x.save(); x.translate(t.x, t.y); x.rotate(t.ang); x.globalAlpha = k;
        x.fillStyle = t.enemy ? pal.accent : pal.ink; x.beginPath(); x.ellipse(0, 0, 80 * (1.2 - k * 0.2), 9 * k + 2, 0, 0, 7); x.fill();
        x.fillStyle = pal.paper; x.beginPath(); x.ellipse(0, 0, 70 * (1.2 - k * 0.2), 3 * k + 1, 0, 0, 7); x.fill();
        x.restore(); x.globalAlpha = 1; continue;
      }
      if (t.pts.length < 2) continue;
      const a = t.pts[0], b = t.pts[t.pts.length - 1];
      x.globalAlpha = k;
      x.strokeStyle = pal.ink; x.lineWidth = 16 * k + 2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
      x.strokeStyle = this.stage.chapter === 2 ? '#1a2030' : '#fffaf0'; x.lineWidth = 6 * k + 1;
      x.beginPath(); x.moveTo(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3); x.lineTo(b.x, b.y); x.stroke();
      x.globalAlpha = 1;
    }
    // player: afterimages, scarf, body
    if (p.alive) {
      for (const g of p.ghosts) { x.globalAlpha = g.life / 0.2 * 0.35; drawFigure(x, g.x, g.y, { pose: pose('dash'), face: g.face, rot: g.rot, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: this.time }); }
      x.globalAlpha = 1;
      const sc = p.scarf;
      x.strokeStyle = pal.accent; x.lineCap = 'round';
      for (let i = 1; i < sc.length; i++) { x.lineWidth = 5 - i * 0.5; x.beginPath(); x.moveTo(sc[i - 1].x, sc[i - 1].y); x.lineTo(sc[i].x, sc[i].y); x.stroke(); }
      let P, rot = 0;
      if (p.dash) { P = pose('dash'); rot = Math.atan2(p.dash.dy, Math.abs(p.dash.dx)) * p.face; }
      else if (p.slashT > 0) P = pose('slash');
      else if (!p.onGround) P = pose('air');
      else P = lerpPose(pose('idle'), pose('aim'), (Math.sin(this.time * 2) + 1) * 0.08);
      drawFigure(x, p.x, p.y, { pose: P, face: p.face, rot, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: this.time });
      // focus meter
      if (this.focus < FOCUS_MAX - 0.01 || this.focusAmt > 0.05) {
        const fw = 50, fx = p.x - fw / 2, fy = p.y - 118;
        x.strokeStyle = pal.ink; x.lineWidth = 2; x.strokeRect(fx, fy, fw, 6);
        x.fillStyle = this.focus < 0.4 ? pal.ink : pal.accent; x.fillRect(fx + 1, fy + 1, (fw - 2) * (this.focus / FOCUS_MAX), 4);
      }
      // dash charges as two ink dots
      for (let k = 0; k < MAX_CHARGES; k++) {
        x.beginPath(); x.arc(p.x - 7 + k * 14, p.y - 104, 5, 0, 7);
        if (k < p.charges) { x.fillStyle = pal.accent; x.fill(); } else { x.strokeStyle = pal.ink; x.lineWidth = 1.5; x.stroke(); }
      }
    }
    // particles
    for (const q of this.parts) { x.globalAlpha = Math.min(1, q.life / q.max * 1.5); x.fillStyle = q.color; x.beginPath(); x.arc(q.x, q.y, q.size, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    // ambient leaves / petals / embers
    for (const a of this.ambient) {
      a.y += a.v * dt; a.x += Math.sin(this.time + a.s) * 20 * dt - 12 * dt;
      if (a.y > H + 10) { a.y = -10; a.x = Math.random() * W; }
      if (a.x < -10) a.x = W + 10;
      x.save(); x.translate(a.x, a.y); x.rotate(this.time * 1.5 + a.s);
      if (pal.fx === 'leaf') { x.fillStyle = pal.ink; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(0, 0, 8, 2.5, 0, 0, 7); x.fill(); }
      else if (pal.fx === 'petal') { x.fillStyle = '#f2a0b8'; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(0, 0, 5, 3, 0, 0, 7); x.fill(); }
      else { x.fillStyle = '#ff8a3a'; x.globalAlpha = 0.5 + Math.sin(this.time * 6 + a.s) * 0.3; x.fillRect(-1.5, -1.5, 3, 3); }
      x.restore();
    }
    x.globalAlpha = 1;
    // floating text
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const t of this.texts) {
      x.globalAlpha = Math.min(1, t.life / t.max * 2);
      x.font = `${t.size}px ${DISPLAY}`;
      x.lineWidth = 5; x.strokeStyle = pal.paper; x.strokeText(t.s, t.x, t.y);
      x.fillStyle = t.color; x.fillText(t.s, t.x, t.y);
    }
    x.globalAlpha = 1;
    x.restore();
    if (this.focusAmt > 0.01) {
      const a = this.focusAmt;
      const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(10,6,4,${0.55 * a})`);
      x.fillStyle = v; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.1 * a; x.fillStyle = pal.accent; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.18 * a; x.font = `220px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = pal.ink;
      x.fillText('集中', W / 2, H / 2 + 20);
      x.globalAlpha = 1;
    }
    if (this.mode === 'play') this.drawHud(x);
  }
  drawHud(x) {
    const pal = this.pal, p = this.player;
    x.textBaseline = 'middle';
    // top-left: stage
    x.textAlign = 'left';
    x.font = `30px ${DISPLAY}`; x.fillStyle = pal.ink;
    x.fillText(this.endless ? `WAVE ${Math.max(1, this.wave)}` : `STAGE ${this.stageN}`, 28, 40);
    x.font = `16px ${DISPLAY}`; x.fillStyle = pal.wash;
    x.fillText(this.endless ? `BEST ${this.save.endless}` : CHAPTERS[this.stage.chapter].name.toUpperCase(), 30, 70);
    // top-right: time or score
    x.textAlign = 'right'; x.font = `30px ${DISPLAY}`; x.fillStyle = pal.ink;
    x.fillText(this.endless ? `${this.score}` : this.clock.toFixed(2), W - 28, 40);
    x.font = `16px ${DISPLAY}`; x.fillStyle = pal.wash;
    if (!this.endless) x.fillText(`PAR ${this.stage.par.toFixed(1)}   ·   ${this.kills}/${this.total}`, W - 30, 70);
    else x.fillText('SCORE', W - 30, 70);
    // combo
    if (this.combo >= 2) {
      const s = 1 + this.comboPop * 0.5;
      x.save(); x.translate(W / 2, 64); x.scale(s, s);
      x.textAlign = 'center';
      x.font = `64px ${BRUSH}`; x.lineWidth = 8; x.strokeStyle = pal.paper; x.strokeText(`${this.combo}`, -18, 0);
      x.fillStyle = pal.accent; x.fillText(`${this.combo}`, -18, 0);
      x.font = `34px ${BRUSH}`; x.fillStyle = pal.ink; x.fillText('連', 40, 6);
      x.restore();
      x.textAlign = 'center'; x.font = `14px ${DISPLAY}`; x.fillStyle = pal.ink; x.fillText(this.combo >= this.total && !this.endless ? 'PERFECT CHAIN' : 'CHAIN', W / 2, 108);
    }
    // tutorial tip
    if (this.stage.tip && this.tipFade > 0 && !this.endless) {
      x.globalAlpha = this.tipFade; x.textAlign = 'center'; x.font = `24px ${DISPLAY}`;
      x.lineWidth = 6; x.strokeStyle = pal.paper; x.strokeText(this.stage.tip, W / 2, 168);
      x.fillStyle = pal.ink; x.fillText(this.stage.tip, W / 2, 168);
      x.globalAlpha = 1;
    }
    // stage intro card
    if (this.intro > 0) {
      const k = Math.min(1, this.intro * 3);
      x.globalAlpha = k;
      stamp(x, W / 2, H / 2 - 30, 120, this.endless ? '戦' : CHAPTERS[this.stage.chapter].kanji, pal.accent, pal.paper, -0.1);
      x.textAlign = 'center'; x.font = `44px ${DISPLAY}`; x.fillStyle = pal.ink;
      x.fillText(this.endless ? 'ENDLESS' : `STAGE ${this.stageN}`, W / 2, H / 2 + 70);
      x.globalAlpha = 1;
    }
    // clear stamp
    if (this.clearT > 0 && this.clearT < 1.6) {
      const k = Math.min(1, (1.6 - this.clearT) * 5);
      const sz = 200 + (1 - k) * 260;
      x.globalAlpha = Math.min(1, k * 1.5);
      stamp(x, W / 2, H / 2 - 20, sz, '斬', pal.accent, pal.paper, -0.14);
      x.globalAlpha = 1;
    }
    if (!p.alive && this.deadT > 0) {
      x.globalAlpha = Math.min(1, (1 - this.deadT) * 4) * 0.5; x.fillStyle = pal.accent; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
      x.textAlign = 'center'; x.font = `56px ${DISPLAY}`; x.fillStyle = pal.ink;
      x.lineWidth = 8; x.strokeStyle = pal.paper;
      const msg = this.deathWhy === 'fell' ? 'FELL!' : this.deathWhy === 'arrow' ? 'SHOT!' : 'CUT DOWN!';
      x.strokeText(msg, W / 2, H / 2); x.fillText(msg, W / 2, H / 2);
      if (!this.endless) { x.font = `20px ${DISPLAY}`; x.fillText('again...', W / 2, H / 2 + 46); }
    }
  }
}

new Game();
