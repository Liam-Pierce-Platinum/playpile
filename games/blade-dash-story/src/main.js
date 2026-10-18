// BLADE DASH: CASTLE - tap to dash-slash. Break in through a window, cut your
// way across every floor of the castle, climb, and beat Kage on the roof.
import { W, H, FLOOR, FLOORS, ROOF, CHAPTERS, buildFloor, buildRoof, chapterOf } from './levels.js';
import { paintFloor, paintRoof, drawFigure, pose, lerpPose, splat, stamp, BRUSH, DISPLAY } from './draw.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Boss } from './boss.js';
import { SCENES, AFTER, PW, PH, drawClimb } from './story.js';
import { DEFAULT_OUTFIT, DEFAULT_OWNED, look } from './outfit.js';

const SAVE_KEY = 'pd.bladedashcastle';
const G = 2500, MAXFALL = 1500, DASH_SPEED = 2600, DASH_LEN = 300, ASSIST_LEN = 480, MAX_CHARGES = 2;
const R_PLAYER = 18;
const FOCUS_MAX = 2.5, FOCUS_SCALE = 0.3, FOCUS_REGEN = 0.2, FOCUS_PER_KILL = 0.5;
const ENEMY_R = { grunt: 24, flyer: 24, archer: 24, shield: 26, bomber: 25, general: 34 };
// enemies never kill by touch: they wind up (red !) and then swing through this reach
const REACH = { grunt: 85, shield: 78, bomber: 72, general: 120 };
const WINDUP = { grunt: 0.55, shield: 0.5, bomber: 0.6, general: 0.42 };
const TRAP_CYCLE = 2.6, TRAP_WARN = 1.6, TRAP_UP = 2.1;
const CLIMB_DUR = 2.3;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { stars: {}, best: {}, unlocked: 1, coins: 0, outfit: { ...DEFAULT_OUTFIT }, owned: [...DEFAULT_OWNED], bossBeaten: false, seenIntro: false, music: 0.6, sfx: 0.9 };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* blocked */ }
    this.save.outfit = { ...DEFAULT_OUTFIT, ...this.save.outfit };
    for (const k of DEFAULT_OWNED) if (!this.save.owned.includes(k)) this.save.owned.push(k);
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx;
    this.mode = 'title';
    this.time = 0; this.camX = 0;
    this.vig = this.makeVignette();
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.ambient = [];
    for (let i = 0; i < 26; i++) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 6, v: 20 + Math.random() * 40 });
    this.loadFloor(1, false);
    document.fonts.ready.then(() => { this.fontsReady = true; });
    window.__BD = this;
    this.manual = params.has('manual');   // tests drive step() themselves
    // first visit lands straight in the story and then the first window; ?title shows the menu
    if (params.has('floor')) this.goFloor(clamp(parseInt(params.get('floor'), 10) || 1, 1, ROOF), !params.has('climb'));
    else if (params.has('boss')) this.goFloor(ROOF, true);
    else if (params.has('wardrobe')) { this.mode = 'title'; this.ui.show('wardrobe'); }
    else if (params.has('ending')) this.playScene('ending', () => this.toTitle());
    else if (params.has('title') || this.save.seenIntro) { this.mode = 'title'; this.ui.show('title'); }
    else this.newGame();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* blocked */ } }
  get pal() { return CHAPTERS[this.stage.chapter]; }
  get look() { return look(this.save.outfit); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    const s = Math.min(innerWidth / W, innerHeight / H);
    this.view = { s, ox: (innerWidth - W * s) / 2, oy: (innerHeight - H * s) / 2 };
  }
  toWorld(cx, cy) { return { x: (cx - this.view.ox) / this.view.s + this.camX, y: (cy - this.view.oy) / this.view.s }; }
  makeVignette() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const v = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,20,10,0.3)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    return c;
  }

  // ------------------------------------------------------------ input
  input() {
    this.keys = new Set();
    this.mouse = null;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.ui.open) return;
      if (this.mode === 'scene') { this.advanceScene(); return; }
      if (this.mode === 'climb') { this.climb.t = Math.max(this.climb.t, CLIMB_DUR - 0.25); return; }
      if (this.mode !== 'play') return;
      const p = this.toWorld(e.clientX, e.clientY);
      this.tap(p.x, p.y);
    });
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.mouse = { cx: e.clientX, cy: e.clientY }; });
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (this.mode === 'scene' && !this.ui.open) {
        if (e.code === 'Escape') this.skipScene(); else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.advanceScene(); }
        return;
      }
      if (this.mode === 'climb' && !this.ui.open) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); this.climb.t = CLIMB_DUR; } return; }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && !['title', 'result'].includes(this.ui.panel)) { this.ui.back(); return; }
        if (this.mode === 'play' && !this.ui.open) { this.ui.show('pause'); return; }
      }
      if (this.ui.open) { if ((e.code === 'Enter' || e.code === 'Space') && this.ui.panel === 'result') { e.preventDefault(); this.ui.primary(); } return; }
      if (this.mode !== 'play') return;
      if (e.code === 'KeyR') { this.respawn(); return; }
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
        else if (this.mouse) { const m = this.toWorld(this.mouse.cx, this.mouse.cy); this.tap(m.x, m.y); }
        else { const e2 = this.nearestEnemy(); if (e2) this.tap(e2.x, this.ecy(e2)); else this.tap(cx + p.face * 300, cy - 120); }
      }
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space') this.setFocus(false); });
    addEventListener('blur', () => { this.keys.clear(); this.setFocus(false); if (this.mode === 'play' && !this.ui.open) this.ui.show('pause'); });
  }

  // ------------------------------------------------------------ flow: story -> climb -> window -> floor -> result
  newGame() { this.playScene('intro', () => { this.save.seenIntro = true; this.persist(); this.goFloor(1); }); }
  toTitle() { this.mode = 'title'; this.boss = null; this.ui.hud(false); this.ui.skip(false); this.ui.show('title'); }
  playScene(name, then) {
    this.ui.close(); this.ui.hud(false);
    this.mode = 'scene';
    this.scene = { list: SCENES[name], i: 0, t: 0, then, name };
    this.ui.skip(true);
  }
  advanceScene() {
    const s = this.scene; if (!s) return;
    if (s.t < 0.25) return;
    this.audio.play('click');
    s.i++; s.t = 0;
    if (s.i >= s.list.length) this.skipScene();
  }
  skipScene() { const s = this.scene; if (!s) return; this.scene = null; this.ui.skip(false); s.then(); }
  goFloor(f, direct = false) {
    this.ui.close(); this.ui.hud(false);
    this.audio.unlock();
    if (direct) { this.startFloor(f); return; }
    this.mode = 'climb';
    this.climb = { f, t: 0 };
    this.ui.skip(true);
    this.audio.play('dash', 0.7);
  }
  startFloor(f) {
    this.ui.skip(false);
    this.loadFloor(f, true);
    this.mode = 'play';
    this.ui.close();
    this.ui.hud(true);
    this.audio.intensity = 0.2;
  }
  afterFloor() {
    const f = this.floorN;
    if (f >= ROOF) { this.toTitle(); return; }
    if (AFTER[f]) this.playScene(AFTER[f], () => this.goFloor(f + 1));
    else this.goFloor(f + 1);
  }

  // ------------------------------------------------------------ floors
  loadFloor(f, entry) {
    const stage = f >= ROOF ? buildRoof() : buildFloor(f);
    this.floorN = f;
    this.stage = stage;
    this.bg = stage.roof ? paintRoof(stage, CHAPTERS[3]) : paintFloor(stage, CHAPTERS[stage.chapter]);
    this.decal = document.createElement('canvas'); this.decal.width = stage.width; this.decal.height = H;
    this.dctx = this.decal.getContext('2d');
    this.gates = stage.rooms.slice(0, -1).map((r, i) => ({ x: r.x1, state: 'sealed', t: 0, i }));
    this.stairsOpen = false;
    this.traps = stage.traps.map((t) => ({ ...t, k: t.phase }));
    this.cp = 0;
    this.deaths = 0;
    this.clock = 0;
    this.runCoins = 0;
    this.windowState = stage.roof ? 'none' : 'whole';
    this.shards = [];
    this.bossCut = false;
    this.boss = null; this.princess = null; this.started = false; this.bossPhaseHp = 9;
    this.spawn(entry && !stage.roof);
    this.intro = entry && !stage.roof ? 0 : 0.9;
    if (stage.roof) { this.boss = new Boss(this); this.princess = { x: 1160, t: 0 }; }
    this.camX = 0;
  }
  // (re)spawn at the checkpoint room: everything from that room on is reset, rooms behind you stay cleared
  spawn(entry) {
    const st = this.stage, cp = this.cp;
    this.solids = st.floor.map(([a, b]) => ({ x: a, y: FLOOR, w: b - a, h: 400 }));
    for (const g of this.gates) {
      if (g.i >= cp) { g.state = 'sealed'; g.t = 0; }
      if (g.state !== 'broken') this.solids.push({ x: g.x - 15, y: 0, w: 30, h: FLOOR, gate: g });
    }
    this.stairsOpen = false;
    this.enemies = st.enemies.filter((e) => e.room >= cp).map((e) => this.makeEnemy(e.type, e.x, e.y, e));
    this.total = st.enemies.length;
    const sx = cp === 0 ? st.start.x : st.rooms[cp].x0 + 70;
    this.player = { x: entry ? -90 : sx, y: entry ? 470 : FLOOR, vx: 0, vy: 0, onGround: !entry, charges: MAX_CHARGES, dash: null, face: 1, alive: true, float: 0, slashT: 0, ghosts: [], ghostT: 0, queued: null, inv: 0 };
    this.player.scarf = Array.from({ length: 7 }, () => ({ x: this.player.x, y: this.player.y - 66, px: this.player.x, py: this.player.y - 66 }));
    this.entry = entry ? { t: 0 } : null;
    this.arrows = []; this.halves = []; this.parts = []; this.texts = []; this.trails = [];
    this.combo = 0; this.maxCombo = 0;
    this.started = this.started && !entry;
    this.hitstop = 0; this.slow = 0; this.shake = 0; this.zoomTo = null; this.zoomT = 0;
    this.comboPop = 0; this.tipFade = 1;
    this.focus = FOCUS_MAX; this.focusAmt = 0;
    this.clearT = 0; this.deadT = 0;
    this.banner = null;
    if (this.boss) {
      const hp = this.bossPhaseHp;
      this.boss = new Boss(this, hp);
      this.boss.set('idle', 1.0);
    }
    if (this.traps) for (const t of this.traps) t.k = t.phase;
  }
  respawn() { if (this.clearT > 0) return; this.spawn(false); this.started = true; this.camX = clamp(this.player.x - W * 0.4, 0, this.stage.width - W); }
  restartFloor() { if (this.boss) this.bossPhaseHp = 9; this.loadFloor(this.floorN, false); this.mode = 'play'; this.ui.close(); this.ui.hud(true); }
  get roomIdx() { return clamp(Math.floor(this.player.x / W), 0, this.stage.rooms.length - 1); }
  get kills() { return this.total - this.enemies.filter((e) => e.alive).length; }
  makeEnemy(type, x, y, src = {}) {
    return {
      type, x, y, r: ENEMY_R[type], alive: true, t: Math.random() * 10, room: src.room ?? 0,
      face: src.face || -1, x0: src.x0 ?? x - 60, x1: src.x1 ?? x + 60,
      bx: x, by: y, phase: src.phase ?? Math.random() * 6.28,
      hp: type === 'general' ? 3 : 1, flash: 0, shootT: rand(2.2, 3.4), spawn: 0, walk: 0, inv: 0,
    };
  }
  setFocus(on) {
    if (on === this.focusHeld) return;
    this.focusHeld = on;
    if (on && this.mode === 'play' && !this.ui.open && this.focus > 0.05) this.audio.play('focusIn');
  }
  ecy(e) { return e.type === 'flyer' ? e.y - 40 : e.y - (e.type === 'general' ? 50 : 38); }
  nearestEnemy() {
    if (this.boss) return { x: this.boss.x, y: this.boss.y, type: 'grunt' };
    let best = null, bd = 1e9;
    for (const e of this.enemies) if (e.alive && e.room === this.roomIdx) { const d = Math.hypot(e.x - this.player.x, this.ecy(e) - this.player.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ------------------------------------------------------------ dashing
  tap(tx, ty) {
    const p = this.player;
    if (!p.alive || this.intro > 0 || this.clearT > 0 || this.entry) return;
    if (p.dash) { p.queued = { x: tx, y: ty, t: 0.18 }; return; }
    if (p.charges <= 0) { this.puff(p.x, p.y - 36, 6, this.pal.ink); return; }
    const cx = p.x, cy = p.y - 36;
    let dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    let len = DASH_LEN;
    // aim assist: snap to the enemy closest to where you pointed (in this room only)
    let best = null, bs = 1e9;
    const room = this.roomIdx;
    const cands = this.enemies.filter((e) => e.alive && e.spawn <= 0 && e.room === room).map((e) => ({ x: e.x, y: this.ecy(e) }));
    // only snap onto Kage while he is open: a dodge flicked near him must never be dragged into a parry
    if (this.boss && this.boss.open) cands.push({ x: this.boss.x, y: this.boss.cy });
    for (const e of cands) {
      const ex = e.x - cx, ey = e.y - cy, ed = Math.hypot(ex, ey);
      if (ed > ASSIST_LEN || ed < 1) continue;
      const ang = Math.acos(clamp((ex * dx + ey * dy) / ed, -1, 1));
      if (ang > 0.45) continue;
      const sc = ang * 320 + ed * 0.35;
      if (sc < bs) { bs = sc; best = { ex, ey, ed }; }
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
    // x, in small steps so a fast dash can't tunnel through a door
    const n = Math.max(1, Math.ceil(Math.abs(mx) / 10));
    for (let i = 0; i < n; i++) {
      p.x += mx / n;
      p.x = clamp(p.x, this.entry ? -200 : 14, this.stage.width - 14);
      let blocked = false;
      for (const s of this.solids) {
        if (p.x + 12 > s.x && p.x - 12 < s.x + s.w && p.y > s.y + 2 && p.y - 58 < s.y + s.h) {
          if (s.gate && s.gate.state === 'open') { this.breakGate(s); continue; }
          p.x = mx > 0 ? s.x - 12 : s.x + s.w + 12;
          if (s.gate) this.bump(s.gate);
          if (p.dash) this.endDash(false);
          blocked = true;
        }
      }
      if (blocked) break;
    }
    // y
    const prevY = p.y;
    p.y += my;
    let landed = false;
    if (my > 0) {
      for (const s of this.solids) if (!s.gate && p.x + 10 > s.x && p.x - 10 < s.x + s.w && prevY <= s.y + 1 && p.y >= s.y) { p.y = s.y; landed = true; }
      if (!p.dash) for (const pl of this.stage.plats) if (p.x + 10 > pl.x && p.x - 10 < pl.x + pl.w && prevY <= pl.y + 1 && p.y >= pl.y) { p.y = pl.y; landed = true; }
    }
    if (p.y - 60 < 46 && !this.stage.roof) { p.y = 106; if (p.vy < 0) p.vy = 0; if (p.dash && p.dash.dy < 0) this.endDash(false); }
    if (p.y - 60 < 0) { p.y = 60; if (p.vy < 0) p.vy = 0; if (p.dash && p.dash.dy < 0) this.endDash(false); }
    return landed;
  }
  bump(g) {
    if (this.time - (g.bumpT || -9) < 0.6) return;
    g.bumpT = this.time;
    this.audio.play('thud');
    this.text(g.x, 300, g.state === 'sealed' ? '封 SEALED' : '', 22, this.pal.accent);
    this.shake = Math.max(this.shake, 4);
  }
  breakGate(s) {
    const g = s.gate;
    g.state = 'broken';
    this.solids = this.solids.filter((q) => q !== s);
    this.audio.play('break');
    this.hitstop = Math.max(this.hitstop, 0.04);
    this.shake = Math.max(this.shake, 10);
    const pal = this.pal;
    for (let k = 0; k < 40; k++) this.shards.push({ x: g.x + rand(-12, 12), y: rand(60, FLOOR - 10), vx: rand(150, 700) * (this.player.dash ? Math.sign(this.player.dash.dx) || 1 : 1), vy: rand(-400, 100), rot: rand(0, 6), vr: rand(-12, 12), size: rand(6, 16), kind: k % 4 === 0 ? 'wood' : 'paper', life: rand(1.2, 2.2), color: k % 4 === 0 ? pal.wood : pal.paper });
    this.text(g.x + 40, 380, '破', 60, pal.accent);
  }
  endDash(keep = true) {
    const p = this.player, d = p.dash;
    if (!d) return;
    p.dash = null;
    p.vx = keep ? d.dx * 420 : 0;
    p.vy = keep ? d.dy * 420 - 120 : 0;
    p.slashT = 0.12;
    if (this.boss) p.inv = Math.max(p.inv, 0.12);   // a short afterglow: a dodge that ends a hair early still counts
  }
  updateEntry(dt) {
    // flying in through the window: the whole thing is on rails and in slow motion
    const p = this.player, e = this.entry;
    e.t += dt;
    const x0 = p.x;
    p.x += 1300 * dt;
    p.y = 470 + Math.pow(clamp((p.x + 90) / 240, 0, 1), 2) * (FLOOR - 470);
    p.face = 1;
    p.ghostT -= dt;
    if (p.ghostT <= 0) { p.ghostT = 0.02; p.ghosts.push({ x: p.x, y: p.y, rot: 0.2, face: 1, life: 0.25 }); }
    if (x0 < 18 && p.x >= 18 && this.windowState === 'whole') this.breakWindow();
    if (p.x >= 150) { p.x = 150; p.y = FLOOR; p.onGround = true; this.entry = null; this.land(); this.intro = 0.9; }
  }
  breakWindow() {
    this.windowState = 'broken';
    this.audio.play('glass');
    this.slow = 0.55; this.hitstop = 0.06; this.shake = 14;
    const pal = this.pal;
    for (let k = 0; k < 70; k++) {
      const glass = k % 3 === 0;
      this.shards.push({ x: 20 + rand(-6, 10), y: rand(380, 600), vx: rand(200, 900), vy: rand(-500, 150), rot: rand(0, 6), vr: rand(-14, 14), size: rand(5, 18), kind: glass ? 'glass' : k % 3 === 1 ? 'paper' : 'wood', life: rand(1.4, 2.6), color: glass ? '#cfe6f2' : k % 3 === 1 ? '#fbf3e0' : pal.wood });
    }
    this.text(240, 300, '破!', 96, pal.accent);
  }
  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    if (this.entry) { this.updateEntry(dt); this.updateScarf(); for (const g of p.ghosts) g.life -= dt; p.ghosts = p.ghosts.filter((g) => g.life > 0); return; }
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
      this.sweep(x0, y0, p.x, p.y - 36, d);
      if (p.dash === d) {
        d.trail.pts.push({ x: p.x, y: p.y - 36 });
        p.ghostT -= dt;
        if (p.ghostT <= 0) { p.ghostT = 0.018; p.ghosts.push({ x: p.x, y: p.y, rot: Math.atan2(d.dy, Math.abs(d.dx)) * p.face, face: p.face, life: 0.2 }); }
        if (landed) { p.dash = null; p.vx = 0; p.vy = 0; this.land(); }
        else if (d.left <= 0) this.endDash(true);
      }
      if (!p.dash && p.queued) { const q = p.queued; p.queued = null; this.tap(q.x, q.y); }
    } else {
      p.vy = Math.min(MAXFALL, p.vy + G * (p.float > 0 ? 0.15 : 1) * dt);
      if (p.onGround) { p.vx *= Math.pow(0.0001, dt); p.vy = 0; }
      else p.vx *= Math.pow(0.4, dt);
      const wasGround = p.onGround;
      const landed = this.moveBody(p, p.vx * dt, p.vy * dt);
      if (landed) { if (!wasGround) this.land(); p.onGround = true; p.vy = 0; }
      else if (p.onGround) {
        const under = this.solids.some((s) => !s.gate && p.x + 10 > s.x && p.x - 10 < s.x + s.w && Math.abs(p.y - s.y) < 2) || this.stage.plats.some((pl) => p.x + 10 > pl.x && p.x - 10 < pl.x + pl.w && Math.abs(p.y - pl.y) < 2);
        if (!under) p.onGround = false;
      }
    }
    for (const g of p.ghosts) g.life -= dt;
    p.ghosts = p.ghosts.filter((g) => g.life > 0);
    this.updateScarf();
    // hazards
    if (p.y > H + 40 || (p.y > H - 30 && !this.solids.some((s) => !s.gate && p.x > s.x && p.x < s.x + s.w))) this.die('fell');
    for (const t of this.traps) if (t.k % TRAP_CYCLE > TRAP_UP && p.x > t.x - 6 && p.x < t.x + t.w + 6 && p.y > FLOOR - 46 && p.inv <= 0) this.die('spikes');
    // walking into the next room moves your checkpoint up
    const ri = this.roomIdx;
    if (ri > this.cp && p.x > this.stage.rooms[ri].x0 + 40 && this.gates[ri - 1].state === 'broken') this.cp = ri;
    // the stairs
    if (this.stage.stairs && this.stairsOpen && p.x > this.stage.stairs.x + 40 && this.clearT <= 0) this.finishFloor();
  }
  updateScarf() {
    const p = this.player, nk = this.neck(), sc = p.scarf;
    sc[0].x = nk.x; sc[0].y = nk.y;
    for (let i = 1; i < sc.length; i++) {
      const q = sc[i];
      const vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9;
      q.px = q.x; q.py = q.y;
      q.x += vx - p.face * 1.1; q.y += vy + 0.55;
    }
    for (let it = 0; it < 3; it++) for (let i = 1; i < sc.length; i++) {
      const a = sc[i - 1], b = sc[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - 7) / d;
      b.x -= dx * k; b.y -= dy * k;
    }
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
    if (this.combo > 0) this.combo = 0;
    this.audio.play('land');
    for (let k = 0; k < 6; k++) this.parts.push({ x: p.x + rand(-12, 12), y: p.y - 2, vx: rand(-90, 90), vy: rand(-120, -30), life: 0.4, max: 0.4, size: rand(2, 4), color: this.pal.ink, g: 400 });
  }
  sweep(x0, y0, x1, y1, d) {
    const p = this.player;
    if (!d) return;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    const near = (cx, cy) => { const t = clamp(((cx - x0) * dx + (cy - y0) * dy) / L2, 0, 1); return Math.hypot(cx - (x0 + dx * t), cy - (y0 + dy * t)); };
    const b = this.boss;
    if (b && !d.hit.has(b) && near(b.x, b.cy) < 30 + R_PLAYER) {
      const r = b.struck(d);
      if (r !== 'pass') d.hit.add(b);
      if (r === 'hit') this.bossHit(d);
      else if (r === 'kill') this.bossKill(d);
      else if (r === 'parry') this.parried(d);
      if (p.dash !== d) return;
    }
    for (const e of this.enemies) {
      if (!e.alive || e.spawn > 0 || d.hit.has(e) || e.inv > 0) continue;
      if (near(e.x, this.ecy(e)) > e.r + R_PLAYER) continue;
      d.hit.add(e);
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
      for (let k = 0; k < 6; k++) this.parts.push({ x: a.x, y: a.y, vx: rand(-200, 200), vy: rand(-200, 0), life: 0.4, max: 0.4, size: 2, color: this.pal.ink, g: 800 });
    }
  }
  bounce(dx, dy) {
    const p = this.player;
    p.dash = null;
    p.vx = -dx * 460;
    p.vy = Math.min(-480, -dy * 400 - 360);
    p.onGround = false;
    p.inv = 0.5;
    p.slashT = 0.12;
    p.charges = MAX_CHARGES; p.float = 0.25;
  }
  hit(e, dx, dy) {
    if (e.type === 'general' && e.hp > 1) {
      e.hp--; e.flash = 0.2; e.inv = 0.12;
      e.x = clamp(e.x + dx * 50, e.x0, e.x1);
      e.stun = 0.8;
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboPop = 1;
      this.bounce(dx, dy);
      this.hitstop = 0.07; this.shake = Math.max(this.shake, 9);
      this.audio.play('clang'); this.audio.play('slash', 0.8);
      splat(this.dctx, e.x, this.ecy(e), 12, this.pal.accent, dx, dy);
      this.text(e.x, this.ecy(e) - 60, `${e.hp} more!`, 24, this.pal.accent);
      return;
    }
    this.kill(e, dx, dy, false);
  }
  addCoins(n, x, y) {
    this.save.coins += n; this.runCoins += n;
    if (x != null) { this.texts.push({ x, y, s: `+${n} 銭`, size: 18, color: '#c9962a', life: 0.8, max: 0.8 }); this.audio.play('coin', 1 + Math.min(this.combo, 8) * 0.05); }
  }
  kill(e, dx, dy, byBlast) {
    if (!e.alive) return;
    const p = this.player;
    e.alive = false;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboPop = 1;
    p.charges = MAX_CHARGES;
    p.float = 0.24;
    p.inv = Math.max(p.inv, 0.15);
    this.focus = Math.min(FOCUS_MAX, this.focus + FOCUS_PER_KILL);
    const cy = this.ecy(e);
    const img = document.createElement('canvas'); img.width = 160; img.height = 160;
    this.drawEnemy(img.getContext('2d'), e, 80, e.type === 'flyer' ? 120 : 118, true);
    const ang = Math.atan2(dy, dx);
    for (const s of [-1, 1]) {
      const nx = -Math.sin(ang) * s, ny = Math.cos(ang) * s;
      this.halves.push({ img, x: e.x, y: cy, vx: nx * 220 + dx * 180, vy: ny * 220 + dy * 120 - 220, rot: 0, vr: s * rand(4, 9), ang, side: s, life: 1.6, o: 80 });
    }
    splat(this.dctx, e.x + dx * 20, cy + dy * 20, e.type === 'general' ? 26 : 16, this.pal.accent, dx, dy);
    if (Math.random() < 0.6) splat(this.dctx, e.x + dx * 70, Math.min(FLOOR - 4, cy + 40), 8, this.pal.accent, dx, 0.2);
    for (let k = 0; k < 16; k++) this.parts.push({ x: e.x, y: cy, vx: dx * rand(200, 600) + rand(-150, 150), vy: dy * rand(200, 500) + rand(-300, 100), life: rand(0.3, 0.7), max: 0.7, size: rand(2, 5), color: Math.random() < 0.6 ? this.pal.accent : this.pal.ink, g: 1200 });
    this.trails.push({ slash: true, x: e.x, y: cy, ang, life: 0.25, max: 0.25 });
    this.hitstop = Math.max(this.hitstop, byBlast ? 0.02 : 0.055);
    this.shake = Math.max(this.shake, byBlast ? 5 : 7);
    this.audio.play('slash', 1 + Math.min(this.combo, 12) * 0.05);
    if (this.combo >= 2) this.audio.play('combo', 1 + Math.min(this.combo, 10) * 0.1);
    this.text(e.x, cy - 46, this.combo >= 2 ? `×${this.combo}` : '', 26, this.pal.ink);
    this.addCoins(5 + Math.min(10, this.combo - 1) + (e.type === 'general' ? 20 : 0), e.x + 30, cy - 70);
    if (e.type === 'bomber') setTimeout(() => this.blast(e.x, cy, e.room), 110);
    if (!this.enemies.some((q) => q.alive && q.room === e.room)) this.roomCleared(e.room, e.x, cy);
  }
  roomCleared(i, x, y) {
    const last = i === this.stage.rooms.length - 1;
    if (last) this.stairsOpen = true;
    else if (this.gates[i] && this.gates[i].state === 'sealed') { this.gates[i].state = 'open'; this.gates[i].t = 0; }
    this.slow = 0.5; this.zoomTo = { x, y }; this.zoomT = 1;
    this.audio.play('seal');
    this.text(last ? this.stage.stairs.x : this.gates[i].x - 60, 250, last ? '上 STAIRS OPEN' : '破 BREAK THROUGH →', 26, this.pal.accent);
  }
  strike(e) {
    const p = this.player, reach = REACH[e.type], cy = this.ecy(e);
    this.trails.push({ slash: true, enemy: true, x: e.x + e.face * reach * 0.55, y: cy - 6, ang: e.face > 0 ? 0.35 : Math.PI - 0.35, life: 0.18, max: 0.18 });
    this.audio.play('dash', 0.6);
    if (!p.alive || p.dash || p.inv > 0) return;
    const fx = (p.x - e.x) * e.face, dy = (p.y - 36) - cy;
    if (fx > -26 && fx < reach + 24 && Math.abs(dy) < 82) this.die('hit');
  }
  blast(x, y, room) {
    this.audio.play('boom');
    this.shake = Math.max(this.shake, 16);
    this.trails.push({ ring: true, x, y, life: 0.4, max: 0.4 });
    splat(this.dctx, x, y, 34, this.pal.ink, 0, 0);
    for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = rand(200, 700); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, size: rand(3, 7), color: k % 3 ? this.pal.ink : '#ff8a2a', g: 300 }); }
    for (const e of this.enemies) if (e.alive && e.room === room && !e.spawn && Math.hypot(e.x - x, this.ecy(e) - y) < 170) { if (e.type === 'general') { e.hp = Math.max(1, e.hp - 1); e.flash = 0.2; } else this.kill(e, Math.sign(e.x - x) || 1, -0.3, true); }
  }
  die(why) {
    const p = this.player;
    if (!p.alive || this.clearT > 0) return;
    p.alive = false;
    this.deaths++;
    this.audio.play('die');
    this.shake = 14; this.hitstop = 0.12;
    splat(this.dctx, p.x, p.y - 36, 22, this.pal.accent, 0, -0.3);
    for (let k = 0; k < 24; k++) this.parts.push({ x: p.x, y: p.y - 36, vx: rand(-400, 400), vy: rand(-500, 100), life: rand(0.4, 0.9), max: 0.9, size: rand(2, 6), color: k % 2 ? this.pal.ink : this.pal.accent, g: 1200 });
    this.deadT = 1.0;
    this.deathWhy = why;
    this.persist();
  }
  finishFloor() {
    this.clearT = 2.0;
    this.slow = 0.9;
    this.zoomTo = { x: this.player.x, y: this.player.y - 40 }; this.zoomT = 1.6;
    const time = Math.round(this.clock * 100) / 100;
    const n = this.floorN;
    const stars = [true, time <= this.stage.par, this.deaths === 0];
    const old = this.save.stars[n] || [false, false, false];
    const newStars = stars.map((s, i) => s && !old[i]);
    this.addCoins(20 + n * 2 + newStars.filter(Boolean).length * 15);
    this.save.stars[n] = stars.map((s, i) => s || old[i]);
    const prevBest = this.save.best[n];
    this.save.best[n] = prevBest ? Math.min(prevBest, time) : time;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(ROOF, n + 1));
    this.persist();
    this.result = { n, time, par: this.stage.par, stars, newStars, best: this.save.best[n], newBest: !prevBest || time < prevBest, deaths: this.deaths, coins: this.runCoins };
    this.audio.play('clear');
  }

  // ------------------------------------------------------------ the boss
  perfectDodge(x, y) {
    const p = this.player;
    this.slow = Math.max(this.slow, 0.3);
    p.charges = MAX_CHARGES;
    p.inv = Math.max(p.inv, 0.2);
    this.focus = Math.min(FOCUS_MAX, this.focus + 0.5);
    this.audio.play('dodge');
    this.text(x, y - 60, 'DODGE!', 30, '#fff4d0');
    for (let k = 0; k < 10; k++) this.parts.push({ x, y, vx: rand(-200, 200), vy: rand(-200, 200), life: 0.4, max: 0.4, size: 2.5, color: '#fff4d0', g: 0 });
  }
  bossHit(d) {
    const b = this.boss;
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboPop = 1;
    this.bounce(d.dx, d.dy);
    this.hitstop = 0.13; this.shake = Math.max(this.shake, 14);
    this.audio.play('bossHit');
    splat(this.dctx, b.x, b.cy, 22, this.pal.accent, d.dx, d.dy);
    splat(this.dctx, b.x + d.dx * 60, Math.min(FLOOR - 4, b.cy + 30), 12, this.pal.accent, d.dx, 0.3);
    for (let k = 0; k < 24; k++) this.parts.push({ x: b.x, y: b.cy, vx: d.dx * rand(200, 700) + rand(-150, 150), vy: d.dy * rand(200, 500) + rand(-300, 100), life: rand(0.3, 0.8), max: 0.8, size: rand(2, 6), color: Math.random() < 0.7 ? this.pal.accent : this.pal.ink, g: 1200 });
    this.trails.push({ slash: true, x: b.x, y: b.cy, ang: Math.atan2(d.dy, d.dx), life: 0.3, max: 0.3 });
    this.text(b.x, b.cy - 90, 'HIT!', 40, this.pal.accent);
    this.addCoins(30, b.x + 40, b.cy - 120);
    if (b.hp === 6 || b.hp === 3) this.bossPhaseHp = b.hp;
  }
  bossKill(d) {
    const b = this.boss;
    this.bossCut = true;
    this.bounce(d.dx, d.dy);
    this.hitstop = 0.3; this.slow = 1.8; this.shake = 22;
    this.zoomTo = { x: b.x, y: b.cy }; this.zoomT = 2.4;
    this.audio.play('bossHit'); this.audio.play('win');
    const img = b.cutImage(), ang = Math.atan2(d.dy, d.dx);
    for (const s of [-1, 1]) {
      const nx = -Math.sin(ang) * s, ny = Math.cos(ang) * s;
      this.halves.push({ img, x: b.x, y: b.cy, vx: nx * 260 + d.dx * 200, vy: ny * 260 + d.dy * 140 - 260, rot: 0, vr: s * rand(3, 6), ang, side: s, life: 3.5, o: 100 });
    }
    for (let k = 0; k < 4; k++) splat(this.dctx, b.x + rand(-80, 80), b.cy + rand(-60, 60), 30 + k * 6, this.pal.accent, d.dx, d.dy);
    for (let k = 0; k < 60; k++) this.parts.push({ x: b.x, y: b.cy, vx: rand(-900, 900), vy: rand(-900, 300), life: rand(0.5, 1.4), max: 1.4, size: rand(3, 8), color: k % 3 ? this.pal.accent : this.pal.ink, g: 900 });
    this.trails.push({ slash: true, x: b.x, y: b.cy, ang, life: 0.6, max: 0.6, big: true });
    this.clearT = 3.6;
    this.save.bossBeaten = true;
    this.addCoins(500);
    this.save.stars[ROOF] = [true, this.deaths === 0, this.boss.stats.parries === 0];
    this.persist();
    this.result = null;
  }
  parried(d) {
    const p = this.player, b = this.boss;
    this.audio.play('clang');
    for (let k = 0; k < 18; k++) this.parts.push({ x: b.x - d.dx * 20, y: b.cy, vx: rand(-320, 320), vy: rand(-360, 60), life: 0.4, max: 0.4, size: rand(1.5, 3.5), color: '#ffcf3a', g: 600 });
    p.dash = null; p.vx = -d.dx * 640; p.vy = -420; p.inv = 0.3; p.onGround = false;
    p.charges = MAX_CHARGES;
    this.shake = Math.max(this.shake, 10); this.hitstop = 0.06;
    this.text(b.x, b.cy - 80, 'PARRIED!', 30, this.pal.ink);
  }
  phaseBanner(ph) {
    this.banner = { ph, t: 1.6 };
    this.audio.play('phase');
    this.shake = Math.max(this.shake, 12);
  }
  puffSmoke(x, y) { for (let k = 0; k < 18; k++) this.parts.push({ x: x + rand(-20, 20), y: y + rand(-30, 30), vx: rand(-90, 90), vy: rand(-120, 20), life: rand(0.4, 0.8), max: 0.8, size: rand(8, 16), color: '#2a2438', g: -40 }); }

  // ------------------------------------------------------------ enemies
  updateEnemies(dt) {
    const p = this.player, room = this.roomIdx;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.inv = Math.max(0, e.inv - dt);
      if (e.type === 'flyer') {
        e.x = e.bx + Math.sin(e.t * 0.8 + e.phase) * 34;
        e.y = e.by + Math.sin(e.t * 1.6 + e.phase) * 16;
        e.face = p.x > e.x ? 1 : -1;
        continue;
      }
      if (e.room !== room) continue;   // other rooms wait behind their doors
      if (e.type === 'archer') {
        e.face = p.x > e.x ? 1 : -1;
        if (!p.alive || this.clearT > 0 || !this.started || this.intro > 0) continue;
        e.shootT -= dt;
        if (e.shootT <= 0) {
          const sx = e.x + e.face * 20, sy = e.y - 50;
          const tx = p.x, ty = p.y - 36;
          const d = Math.hypot(tx - sx, ty - sy) || 1;
          this.arrows.push({ x: sx, y: sy, vx: (tx - sx) / d * 600, vy: (ty - sy) / d * 600, life: 2.6 });
          this.audio.play('twang');
          e.shootT = rand(2.2, 3.0);
        }
        continue;
      }
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
      let sp = e.type === 'grunt' ? 55 : e.type === 'general' ? 75 : e.type === 'bomber' ? 40 : 30;
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
      if (a.life <= 0 || a.x < -20 || a.x > this.stage.width + 20 || a.y > H) { a.dead = true; continue; }
      if (this.solids.some((s) => a.x > s.x && a.x < s.x + s.w && a.y > s.y)) { a.dead = true; continue; }
      if (p.alive && !p.dash && p.inv <= 0 && Math.hypot(a.x - p.x, a.y - (p.y - 36)) < 15) { a.dead = true; this.die('arrow'); }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);
    for (const t of this.traps) {
      const before = t.k % TRAP_CYCLE;
      t.k += dt;
      const now = t.k % TRAP_CYCLE;
      if (t.room === room && before < TRAP_UP && now >= TRAP_UP) this.audio.play('clang', 0.5);
    }
    for (const g of this.gates) g.t += dt;
  }

  // ------------------------------------------------------------ fx helpers
  text(x, y, s, size, color) { if (s) this.texts.push({ x, y, s, size, color, life: 0.9, max: 0.9 }); }
  puff(x, y, n, color) { for (let k = 0; k < n; k++) this.parts.push({ x, y, vx: rand(-80, 80), vy: rand(-80, 40), life: 0.3, max: 0.3, size: 3, color, g: 0 }); }

  // ------------------------------------------------------------ loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (!this.manual) this.step(dt);
  }
  step(dt) {
    this.time += dt;
    const playing = this.mode === 'play' && !this.ui.open;
    if (playing) this.update(dt);
    if (this.mode === 'scene' && this.scene && !this.ui.open) this.scene.t += dt;
    if (this.mode === 'climb' && !this.ui.open) { this.climb.t += dt; if (this.climb.t >= CLIMB_DUR) this.startFloor(this.climb.f); }
    this.audio.intensity = playing ? Math.min(1, (this.boss ? 0.55 : 0.25) + this.combo * 0.12) : 0.15;
    this.audio.update(dt, playing);
    this.render(dt);
  }
  update(dtReal) {
    if (this.hitstop > 0) { this.hitstop -= dtReal; this.shake *= 0.9; return; }
    let dt = dtReal;
    if (this.slow > 0) { this.slow -= dtReal; dt *= 0.22; }
    const focusing = this.focusHeld && this.focus > 0 && this.player.alive && this.clearT <= 0;
    if (focusing) { this.focus = Math.max(0, this.focus - dtReal); if (this.slow <= 0) dt *= FOCUS_SCALE; if (this.focus <= 0) this.audio.play('focusOut'); }
    else this.focus = Math.min(FOCUS_MAX, this.focus + dtReal * FOCUS_REGEN);
    this.focusAmt += ((focusing ? 1 : 0) - this.focusAmt) * Math.min(1, dtReal * 10);
    if (this.intro > 0) this.intro -= dtReal;
    if (this.started && this.clearT <= 0 && this.player.alive && !this.entry) this.clock += dtReal;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    if (this.boss && this.intro <= 0) this.boss.update(dt);
    if (this.banner) { this.banner.t -= dtReal; if (this.banner.t <= 0) this.banner = null; }
    if (this.princess) this.princess.t += dt;
    for (const h of this.halves) {
      h.vy += 1300 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.life -= dt;
      if (h.y > FLOOR - 12 && this.solids.some((s) => !s.gate && h.x > s.x && h.x < s.x + s.w)) { h.y = FLOOR - 12; h.vy *= -0.25; h.vx *= 0.6; h.vr *= 0.5; }
    }
    this.halves = this.halves.filter((h) => h.life > 0);
    for (const s of this.shards) {
      s.vy += 1400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.life -= dt;
      if (s.y > FLOOR - 3 && this.solids.some((q) => !q.gate && s.x > q.x && s.x < q.x + q.w)) { s.y = FLOOR - 3; s.vy *= -0.2; s.vx *= 0.5; s.vr *= 0.4; }
    }
    this.shards = this.shards.filter((s) => s.life > 0);
    for (const q of this.parts) { q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const t of this.texts) { t.y -= 40 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const t of this.trails) t.life -= dtReal;
    this.trails = this.trails.filter((t) => t.life > 0);
    this.comboPop = Math.max(0, this.comboPop - dtReal * 4);
    if (this.kills > 0) this.tipFade = Math.max(0, this.tipFade - dtReal * 0.8);
    this.shake *= Math.pow(0.002, dtReal);
    this.zoomT = Math.max(0, this.zoomT - dtReal);
    // camera: lead a little in the direction you face
    const target = clamp(this.player.x - W * (this.player.face > 0 ? 0.38 : 0.62), 0, this.stage.width - W);
    this.camX += (target - this.camX) * Math.min(1, dtReal * 7);
    if (this.clearT > 0) {
      this.clearT -= dtReal;
      if (this.clearT <= 0) {
        if (this.boss) this.playScene('ending', () => this.toTitle());
        else this.ui.show('result', this.result);
      }
    }
    if (this.deadT > 0) {
      this.deadT -= dtReal;
      if (this.deadT <= 0) this.respawn();
    }
  }

  // ------------------------------------------------------------ drawing
  drawEnemy(x, e, px, py, still) {
    const pal = this.pal;
    let P = pose('idle');
    if (e.type === 'archer') P = pose('aim');
    else if (e.atk && !still) P = lerpPose(pose('idle'), pose('raise'), Math.min(1, (1 - e.atk.t / e.atk.max) * 1.6));
    else if (e.strikeT > 0 && !still) P = pose('slash');
    else if (!still && e.type !== 'flyer') P = lerpPose(pose('walkA'), pose('walkB'), (Math.sin(e.walk * 2) + 1) / 2);
    const draw = e.type === 'archer' ? clamp(1 - e.shootT / 0.8, 0, 1) : 0;
    drawFigure(x, px, py, { pose: P, face: e.face, scale: e.type === 'general' ? 1.35 : 1, ink: e.flash > 0 ? pal.accent : pal.ink, paper: pal.paper, accent: pal.accent, mask: e.flash > 0 ? pal.accent : (this.stage.chapter >= 2 ? '#2a3248' : '#fffaf0'), kind: e.type, t: e.t, draw });
  }
  heroOpts(P, extra = {}) {
    const pal = this.pal;
    return { pose: P, face: 1, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: this.time, look: this.look, ...extra };
  }
  // the wardrobe preview uses the same figure as play
  drawPreview(canvas, outfit) {
    const x = canvas.getContext('2d'), w = canvas.width, h = canvas.height, pal = CHAPTERS[0];
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = pal.paper; x.fillRect(0, 0, w, h);
    x.fillStyle = pal.ink; x.fillRect(0, h - 30, w, 30);
    const L = look(outfit);
    x.save(); x.translate(w / 2, h - 30); x.scale(2.15, 2.15);
    // scarf trailing back
    x.strokeStyle = L.scarf; x.lineCap = 'round';
    for (let i = 0; i < 6; i++) { x.lineWidth = 5 - i * 0.6; x.beginPath(); x.moveTo(3 - i * 7, -70 + i * 3 + Math.sin(this.time * 4 + i) * 1.5); x.lineTo(3 - (i + 1) * 7, -70 + (i + 1) * 3 + Math.sin(this.time * 4 + i + 1) * 1.5); x.stroke(); }
    drawFigure(x, 0, 0, { pose: lerpPose(pose('idle'), pose('aim'), (Math.sin(this.time * 2) + 1) * 0.1), face: 1, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: this.time, look: L });
    x.restore();
  }
  render(dt) {
    const x = this.ctx, v = this.view;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = '#0d0a08';
    x.fillRect(0, 0, innerWidth, innerHeight);
    x.setTransform(this.dpr * v.s, 0, 0, this.dpr * v.s, this.dpr * v.ox, this.dpr * v.oy);
    if (this.mode === 'scene' && this.scene) { this.renderScene(x); return; }
    if (this.mode === 'climb') {
      const c = this.climb, f = c.f;
      x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip();
      drawClimb(x, W, H, f, clamp(c.t / (CLIMB_DUR - 0.3), 0, 1), this.time, this.look, CHAPTERS[chapterOf(f)]);
      const k = clamp((c.t - (CLIMB_DUR - 0.3)) / 0.3, 0, 1);
      if (k > 0) { x.globalAlpha = k; x.fillStyle = '#0d0a08'; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
      x.restore();
      return;
    }
    this.renderPlay(x, dt);
  }
  renderScene(x) {
    const s = this.scene, panel = s.list[Math.min(s.i, s.list.length - 1)];
    x.fillStyle = '#0d0a08'; x.fillRect(0, 0, W, H);
    const px = (W - PW) / 2, py = 40;
    const k = Math.min(1, s.t * 4);
    x.save();
    x.translate(px + PW / 2, py + PH / 2); x.scale(0.96 + k * 0.04, 0.96 + k * 0.04); x.rotate((1 - k) * -0.02); x.translate(-PW / 2, -PH / 2);
    x.globalAlpha = k;
    x.save(); x.beginPath(); x.rect(0, 0, PW, PH); x.clip();
    const z = 1 + s.t * 0.012; x.translate(PW / 2, PH / 2); x.scale(z, z); x.translate(-PW / 2, -PH / 2);
    panel.draw(x, s.t, this.look);
    x.restore();
    x.lineWidth = 8; x.strokeStyle = '#f4ead6'; x.strokeRect(0, 0, PW, PH);
    x.lineWidth = 3; x.strokeStyle = '#16120f'; x.strokeRect(6, 6, PW - 12, PH - 12);
    x.restore();
    // caption
    x.globalAlpha = Math.min(1, s.t * 3);
    x.fillStyle = '#f4ead6'; x.font = `26px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const words = panel.text.split(' '), lines = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > PW - 60) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.forEach((l, i) => x.fillText(l, W / 2, py + PH + 48 + i * 36 - (lines.length - 1) * 10));
    x.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.3; x.font = `16px ${DISPLAY}`;
    x.fillText(`${s.i + 1} / ${s.list.length}  ·  tap to continue`, W / 2, H - 22);
    x.globalAlpha = 1;
  }
  renderPlay(x, dt) {
    const pal = this.pal, p = this.player;
    x.save();
    x.beginPath(); x.rect(0, 0, W, H); x.clip();
    const sh = this.shake;
    x.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    if (this.zoomTo && this.zoomT > 0) {
      const zt = Math.min(1, this.zoomT * 2) * Math.min(1, (2.4 - this.zoomT) * 4);
      const z = 1 + 0.16 * clamp(zt, 0, 1), cx = this.zoomTo.x - this.camX, cy = this.zoomTo.y;
      x.translate(cx, cy); x.scale(z, z); x.translate(-cx, -cy);
    }
    const cam = Math.round(this.camX);
    x.translate(-cam, 0);
    const sx = clamp(cam - 60, 0, this.stage.width), sw = Math.min(W + 120, this.stage.width - sx);
    x.drawImage(this.bg, sx, 0, sw, H, sx, 0, sw, H);
    x.drawImage(this.decal, sx, 0, sw, H, sx, 0, sw, H);
    this.drawWindow(x);
    this.drawGates(x);
    this.drawTraps(x);
    if (this.princess) drawFigure(x, this.princess.x, FLOOR, { pose: pose('idle'), face: -1, ink: '#16120f', paper: pal.paper, accent: pal.accent, kind: 'princess', t: this.princess.t, tied: !this.bossCut, scale: 1.1 });
    // archer aim lines
    for (const e of this.enemies) {
      if (!e.alive || e.type !== 'archer' || e.room !== this.roomIdx || !this.started || !p.alive) continue;
      if (e.shootT < 0.8) {
        const k = 1 - e.shootT / 0.8;
        x.strokeStyle = pal.accent; x.globalAlpha = 0.25 + k * 0.6; x.lineWidth = 1 + k * 2; x.setLineDash([8, 8]);
        x.beginPath(); x.moveTo(e.x + e.face * 20, e.y - 50); x.lineTo(p.x, p.y - 36); x.stroke();
        x.setLineDash([]); x.globalAlpha = 1;
      }
    }
    for (const e of this.enemies) {
      if (!e.alive || e.x < cam - 100 || e.x > cam + W + 100) continue;
      if (e.atk) {
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
    if (this.boss) this.boss.draw(x);
    x.strokeStyle = pal.ink; x.lineWidth = 2.5;
    for (const a of this.arrows) {
      const d = Math.hypot(a.vx, a.vy);
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(a.x - a.vx / d * 26, a.y - a.vy / d * 26); x.stroke();
      x.fillStyle = pal.accent; x.beginPath(); x.arc(a.x - a.vx / d * 26, a.y - a.vy / d * 26, 3, 0, 7); x.fill();
    }
    for (const h of this.halves) {
      x.save(); x.globalAlpha = Math.min(1, h.life * 1.5);
      x.translate(h.x, h.y); x.rotate(h.rot);
      x.rotate(h.ang); x.beginPath(); x.rect(-150, h.side > 0 ? 0 : -150, 300, 150); x.rotate(-h.ang); x.clip();
      x.drawImage(h.img, -h.o, -h.o);
      x.restore();
    }
    for (const s of this.shards) {
      x.save(); x.translate(s.x, s.y); x.rotate(s.rot); x.globalAlpha = Math.min(1, s.life * 2);
      x.fillStyle = s.color; x.strokeStyle = pal.ink; x.lineWidth = 1;
      x.beginPath();
      if (s.kind === 'wood') x.rect(-s.size, -2, s.size * 2, 4);
      else { x.moveTo(-s.size / 2, -s.size / 3); x.lineTo(s.size / 2, -s.size / 2); x.lineTo(s.size / 4, s.size / 2); x.closePath(); }
      x.fill(); if (s.kind !== 'glass') x.stroke();
      if (s.kind === 'glass') { x.strokeStyle = '#ffffff'; x.globalAlpha *= 0.8; x.stroke(); }
      x.restore();
    }
    for (const t of this.trails) {
      const k = t.life / t.max;
      if (t.ring) { x.strokeStyle = pal.ink; x.globalAlpha = k; x.lineWidth = 10 * k; x.beginPath(); x.arc(t.x, t.y, 170 * (1 - k) + 20, 0, 7); x.stroke(); x.globalAlpha = 1; continue; }
      if (t.slash) {
        const L = t.big ? 2.6 : 1;
        x.save(); x.translate(t.x, t.y); x.rotate(t.ang); x.globalAlpha = k;
        x.fillStyle = t.enemy ? pal.accent : pal.ink; x.beginPath(); x.ellipse(0, 0, 80 * L * (1.2 - k * 0.2), (9 * k + 2) * L, 0, 0, 7); x.fill();
        x.fillStyle = pal.paper; x.beginPath(); x.ellipse(0, 0, 70 * L * (1.2 - k * 0.2), (3 * k + 1) * L, 0, 0, 7); x.fill();
        x.restore(); x.globalAlpha = 1; continue;
      }
      if (t.pts.length < 2) continue;
      const a = t.pts[0], b = t.pts[t.pts.length - 1];
      x.globalAlpha = k;
      x.strokeStyle = pal.ink; x.lineWidth = 16 * k + 2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
      x.strokeStyle = this.stage.chapter >= 2 ? '#1a2030' : '#fffaf0'; x.lineWidth = 6 * k + 1;
      x.beginPath(); x.moveTo(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3); x.lineTo(b.x, b.y); x.stroke();
      x.globalAlpha = 1;
    }
    if (p.alive) {
      for (const g of p.ghosts) { x.globalAlpha = g.life / 0.2 * 0.35; drawFigure(x, g.x, g.y, this.heroOpts(pose('dash'), { face: g.face, rot: g.rot })); }
      x.globalAlpha = 1;
      const sc = p.scarf;
      x.strokeStyle = this.look.scarf || pal.accent; x.lineCap = 'round';
      for (let i = 1; i < sc.length; i++) { x.lineWidth = 5 - i * 0.5; x.beginPath(); x.moveTo(sc[i - 1].x, sc[i - 1].y); x.lineTo(sc[i].x, sc[i].y); x.stroke(); }
      let P, rot = 0;
      if (p.dash || this.entry) { P = pose('dash'); rot = p.dash ? Math.atan2(p.dash.dy, Math.abs(p.dash.dx)) * p.face : 0.2; }
      else if (p.slashT > 0) P = pose('slash');
      else if (!p.onGround) P = pose('air');
      else P = lerpPose(pose('idle'), pose('aim'), (Math.sin(this.time * 2) + 1) * 0.08);
      if (p.inv > 0 && this.boss && !p.dash && Math.floor(this.time * 30) % 2) x.globalAlpha = 0.6;
      drawFigure(x, p.x, p.y, this.heroOpts(P, { face: p.face, rot }));
      x.globalAlpha = 1;
      if (this.focus < FOCUS_MAX - 0.01 || this.focusAmt > 0.05) {
        const fw = 50, fx = p.x - fw / 2, fy = p.y - 118;
        x.strokeStyle = pal.ink; x.lineWidth = 2; x.strokeRect(fx, fy, fw, 6);
        x.fillStyle = this.focus < 0.4 ? pal.ink : pal.accent; x.fillRect(fx + 1, fy + 1, (fw - 2) * (this.focus / FOCUS_MAX), 4);
      }
      for (let k = 0; k < MAX_CHARGES; k++) {
        x.beginPath(); x.arc(p.x - 7 + k * 14, p.y - 104, 5, 0, 7);
        if (k < p.charges) { x.fillStyle = pal.accent; x.fill(); } else { x.strokeStyle = pal.ink; x.lineWidth = 1.5; x.stroke(); }
      }
    }
    for (const q of this.parts) { x.globalAlpha = Math.min(1, q.life / q.max * 1.5); x.fillStyle = q.color; x.beginPath(); x.arc(q.x, q.y, q.size, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const t of this.texts) {
      x.globalAlpha = Math.min(1, t.life / t.max * 2);
      x.font = `${t.size}px ${DISPLAY}`;
      x.lineWidth = 5; x.strokeStyle = pal.paper; x.strokeText(t.s, t.x, t.y);
      x.fillStyle = t.color; x.fillText(t.s, t.x, t.y);
    }
    x.globalAlpha = 1;
    x.translate(cam, 0);
    // ambient dust / petals / embers, in screen space
    for (const a of this.ambient) {
      a.y += a.v * dt; a.x += Math.sin(this.time + a.s) * 20 * dt - 12 * dt;
      if (a.y > H + 10) { a.y = -10; a.x = Math.random() * W; }
      if (a.x < -10) a.x = W + 10;
      x.save(); x.translate(a.x, a.y); x.rotate(this.time * 1.5 + a.s);
      if (pal.fx === 'dust') { x.fillStyle = pal.wash; x.globalAlpha = 0.35; x.fillRect(-1.5, -1.5, 3, 3); }
      else if (pal.fx === 'petal') { x.fillStyle = '#f2a0b8'; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(0, 0, 5, 3, 0, 0, 7); x.fill(); }
      else { x.fillStyle = '#ff8a3a'; x.globalAlpha = 0.5 + Math.sin(this.time * 6 + a.s) * 0.3; x.fillRect(-1.5, -1.5, 3, 3); }
      x.restore();
    }
    x.globalAlpha = 1;
    x.restore();
    x.drawImage(this.vig, 0, 0);
    if (this.focusAmt > 0.01) {
      const a = this.focusAmt;
      const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(10,6,4,${0.55 * a})`);
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.1 * a; x.fillStyle = pal.accent; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.18 * a; x.font = `220px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = pal.ink;
      x.fillText('集中', W / 2, H / 2 + 20);
      x.globalAlpha = 1;
    }
    if (this.mode === 'play') this.drawHud(x);
  }
  drawWindow(x) {
    if (this.windowState === 'none') return;
    const pal = this.pal, y0 = 370, y1 = 610;
    if (this.windowState === 'whole') {
      x.fillStyle = '#fbf3e0'; x.fillRect(4, y0, 30, y1 - y0);
      x.fillStyle = 'rgba(160,210,235,0.45)'; x.fillRect(4, y0, 30, y1 - y0);
      x.strokeStyle = pal.wood; x.lineWidth = 3;
      for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(4, y0 + (y1 - y0) * k / 4); x.lineTo(34, y0 + (y1 - y0) * k / 4); x.stroke(); }
      x.beginPath(); x.moveTo(19, y0); x.lineTo(19, y1); x.stroke();
      x.strokeStyle = '#ffffff'; x.globalAlpha = 0.7; x.lineWidth = 2; x.beginPath(); x.moveTo(8, y0 + 20); x.lineTo(28, y0 + 6); x.stroke(); x.globalAlpha = 1;
    } else {
      // the hole you made: the night outside, jagged glass at the edges
      x.fillStyle = pal.sky ? pal.sky[0] : '#1a2036'; x.fillRect(0, y0, 34, y1 - y0);
      x.fillStyle = '#cfe6f2';
      for (const [yy, d] of [[y0, 1], [y1, -1]]) { x.beginPath(); x.moveTo(0, yy); for (let k = 0; k <= 6; k++) x.lineTo(k * 6, yy + d * (k % 2 ? 22 : 6)); x.lineTo(34, yy); x.closePath(); x.fill(); }
    }
    x.strokeStyle = pal.wood; x.lineWidth = 6; x.strokeRect(2, y0 - 3, 34, y1 - y0 + 6);
  }
  drawGates(x) {
    const pal = this.pal;
    for (const g of this.gates) {
      if (g.x < this.camX - 60 || g.x > this.camX + W + 60) continue;
      const gx = g.x - 15;
      if (g.state === 'broken') {
        x.fillStyle = pal.wood; x.fillRect(gx, 46, 30, 18); x.fillRect(gx, FLOOR - 16, 30, 16);
        x.fillStyle = pal.paper; x.globalAlpha = 0.8;
        for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(gx + k * 8, 64); x.lineTo(gx + k * 8 + 6, 64); x.lineTo(gx + k * 8 + 3, 64 + 20 + (k * 13) % 30); x.fill(); }
        x.globalAlpha = 1;
        continue;
      }
      x.fillStyle = this.stage.chapter >= 2 ? '#3a3448' : '#fbf3e0';
      x.fillRect(gx, 46, 30, FLOOR - 46);
      x.strokeStyle = pal.wood; x.lineWidth = 3;
      for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(gx, 46 + (FLOOR - 46) * k / 8); x.lineTo(gx + 30, 46 + (FLOOR - 46) * k / 8); x.stroke(); }
      x.beginPath(); x.moveTo(gx + 15, 46); x.lineTo(gx + 15, FLOOR); x.stroke();
      x.lineWidth = 6; x.strokeRect(gx, 46, 30, FLOOR - 46);
      if (g.state === 'sealed') {
        // a paper talisman and crossed red cords
        x.strokeStyle = pal.accent; x.lineWidth = 4;
        x.beginPath(); x.moveTo(gx - 6, 200); x.lineTo(gx + 36, 460); x.moveTo(gx + 36, 200); x.lineTo(gx - 6, 460); x.stroke();
        x.fillStyle = '#f6e9c8'; x.fillRect(gx - 4, 280, 38, 100);
        x.strokeStyle = pal.accent; x.lineWidth = 2; x.strokeRect(gx - 1, 283, 32, 94);
        x.fillStyle = pal.accent; x.font = `30px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('封', gx + 15, 330);
      } else {
        const a = 0.5 + Math.sin(this.time * 6) * 0.4;
        x.globalAlpha = a; x.strokeStyle = pal.accent; x.lineWidth = 5; x.strokeRect(gx - 4, 42, 38, FLOOR - 38);
        x.font = `40px ${DISPLAY}`; x.fillStyle = pal.accent; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('→', gx - 50 + Math.sin(this.time * 6) * 8, 330);
        x.globalAlpha = 1;
      }
    }
    // the stairs: roped off until the last room is clear
    if (this.stage.stairs) {
      const sx = this.stage.stairs.x;
      if (!this.stairsOpen) {
        x.strokeStyle = pal.accent; x.lineWidth = 4;
        x.beginPath(); x.moveTo(sx - 10, 470); x.quadraticCurveTo(sx + 30, 520, sx + 70, 470); x.stroke();
        x.fillStyle = '#f6e9c8'; x.fillRect(sx + 14, 490, 32, 70);
        x.fillStyle = pal.accent; x.font = `26px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('封', sx + 30, 525);
      } else {
        x.globalAlpha = 0.5 + Math.sin(this.time * 6) * 0.4; x.fillStyle = pal.accent; x.font = `44px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('↗', sx + 40 + Math.sin(this.time * 6) * 6, 420); x.globalAlpha = 1;
      }
    }
  }
  drawTraps(x) {
    const pal = this.pal;
    for (const t of this.traps) {
      const ph = t.k % TRAP_CYCLE;
      if (ph < TRAP_WARN) continue;
      const up = ph > TRAP_UP, k = up ? 1 - (ph - TRAP_UP) / (TRAP_CYCLE - TRAP_UP) * 0.3 : (ph - TRAP_WARN) / (TRAP_UP - TRAP_WARN);
      const hgt = up ? 46 * Math.min(1, (ph - TRAP_UP) * 20) : 8;
      x.fillStyle = up ? pal.ink : (Math.floor(this.time * 16) % 2 ? pal.accent : pal.ink);
      for (let px = t.x + 4; px < t.x + t.w - 8; px += 14) { x.beginPath(); x.moveTo(px, FLOOR); x.lineTo(px + 7, FLOOR - hgt); x.lineTo(px + 14, FLOOR); x.fill(); }
      if (up) { x.fillStyle = pal.accent; for (let px = t.x + 4; px < t.x + t.w - 8; px += 14) { x.beginPath(); x.arc(px + 7, FLOOR - hgt + 3, 2, 0, 7); x.fill(); } }
      void k;
    }
  }
  drawHud(x) {
    const pal = this.pal, p = this.player, boss = this.boss;
    x.textBaseline = 'middle';
    x.textAlign = 'left';
    x.font = `30px ${DISPLAY}`; x.fillStyle = pal.ink;
    x.fillText(boss ? 'THE ROOF' : `FLOOR ${this.floorN}`, 28, 76);
    x.font = `16px ${DISPLAY}`; x.fillStyle = pal.wash;
    x.fillText(boss ? 'KAGE, THE SHADOW BLADE' : CHAPTERS[this.stage.chapter].name.toUpperCase(), 30, 106);
    // rooms on this floor: filled = cleared
    if (!boss) for (let i = 0; i < this.stage.rooms.length; i++) {
      const cleared = i < this.stage.rooms.length - 1 ? this.gates[i].state !== 'sealed' : this.stairsOpen;
      x.strokeStyle = pal.ink; x.lineWidth = 2; x.strokeRect(30 + i * 22, 122, 16, 10);
      if (cleared) { x.fillStyle = pal.accent; x.fillRect(31 + i * 22, 123, 14, 8); }
      if (i === this.roomIdx) { x.fillStyle = pal.ink; x.beginPath(); x.moveTo(38 + i * 22, 140); x.lineTo(33 + i * 22, 146); x.lineTo(43 + i * 22, 146); x.fill(); }
    }
    x.textAlign = 'right'; x.font = `30px ${DISPLAY}`; x.fillStyle = pal.ink;
    x.fillText(this.clock.toFixed(2), W - 28, 76);
    x.font = `16px ${DISPLAY}`; x.fillStyle = pal.wash;
    if (!boss) x.fillText(`PAR ${this.stage.par.toFixed(1)}   ·   ${this.kills}/${this.total}`, W - 30, 106);
    x.fillStyle = '#c9962a'; x.font = `20px ${DISPLAY}`; x.fillText(`銭 ${this.save.coins}`, W - 30, 134);
    if (boss) {
      // nine pips in three groups
      const bw = 420, bx = W / 2 - bw / 2, by = 128;
      x.textAlign = 'center'; x.font = `20px ${DISPLAY}`; x.fillStyle = pal.ink; x.fillText('影  KAGE', W / 2, 112);
      for (let k = 0; k < 9; k++) {
        const gx = bx + k * (bw / 9) + Math.floor(k / 3) * 6 - 6;
        x.strokeStyle = pal.ink; x.lineWidth = 2; x.strokeRect(gx, by, bw / 9 - 6, 12);
        if (k < boss.hp) { x.fillStyle = pal.accent; x.fillRect(gx + 1, by + 1, bw / 9 - 8, 10); }
      }
    }
    if (this.combo >= 2 && !boss) {
      const s = 1 + this.comboPop * 0.5;
      x.save(); x.translate(W / 2, 96); x.scale(s, s);
      x.textAlign = 'center';
      x.font = `64px ${BRUSH}`; x.lineWidth = 8; x.strokeStyle = pal.paper; x.strokeText(`${this.combo}`, -18, 0);
      x.fillStyle = pal.accent; x.fillText(`${this.combo}`, -18, 0);
      x.font = `34px ${BRUSH}`; x.fillStyle = pal.ink; x.fillText('連', 40, 6);
      x.restore();
    }
    if (this.stage.tip && this.tipFade > 0 && this.roomIdx === 0) {
      x.globalAlpha = this.tipFade; x.textAlign = 'center'; x.font = `24px ${DISPLAY}`;
      x.lineWidth = 6; x.strokeStyle = pal.paper; x.strokeText(this.stage.tip, W / 2, 190);
      x.fillStyle = pal.ink; x.fillText(this.stage.tip, W / 2, 190);
      x.globalAlpha = 1;
    }
    if (this.intro > 0) {
      const k = Math.min(1, this.intro * 3);
      x.globalAlpha = k;
      stamp(x, W / 2, H / 2 - 30, 120, boss ? '影' : CHAPTERS[this.stage.chapter].kanji, pal.accent, pal.paper, -0.1);
      x.textAlign = 'center'; x.font = `44px ${DISPLAY}`; x.fillStyle = pal.ink;
      x.fillText(boss ? 'KAGE' : `FLOOR ${this.floorN}`, W / 2, H / 2 + 70);
      x.globalAlpha = 1;
    }
    if (this.banner) {
      const k = Math.min(1, (1.6 - this.banner.t) * 5);
      x.globalAlpha = Math.min(1, this.banner.t * 3);
      stamp(x, W / 2, H / 2 - 40, 140 + (1 - k) * 200, this.banner.ph === 2 ? '弐' : '参', pal.accent, pal.paper, -0.1);
      x.textAlign = 'center'; x.font = `34px ${DISPLAY}`; x.fillStyle = pal.ink; x.lineWidth = 6; x.strokeStyle = pal.paper;
      const msg = this.banner.ph === 2 ? 'He doubles his dashes' : 'Feints. Triple dashes. Faster.';
      x.strokeText(msg, W / 2, H / 2 + 70); x.fillText(msg, W / 2, H / 2 + 70);
      x.globalAlpha = 1;
    }
    if (this.clearT > 0 && this.clearT < (boss ? 3.0 : 1.6)) {
      const k = Math.min(1, ((boss ? 3.0 : 1.6) - this.clearT) * 5);
      const sz = (boss ? 260 : 200) + (1 - k) * 260;
      x.globalAlpha = Math.min(1, k * 1.5);
      stamp(x, W / 2, H / 2 - 20, sz, '斬', pal.accent, pal.paper, -0.14);
      x.globalAlpha = 1;
    }
    if (!p.alive && this.deadT > 0) {
      x.globalAlpha = Math.min(1, (1 - this.deadT) * 4) * 0.5; x.fillStyle = pal.accent; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
      x.textAlign = 'center'; x.font = `56px ${DISPLAY}`; x.fillStyle = pal.ink;
      x.lineWidth = 8; x.strokeStyle = pal.paper;
      const msg = { fell: 'FELL!', arrow: 'SHOT!', spikes: 'SPIKED!', boss: 'TOO SLOW!' }[this.deathWhy] || 'CUT DOWN!';
      x.strokeText(msg, W / 2, H / 2); x.fillText(msg, W / 2, H / 2);
      x.font = `20px ${DISPLAY}`; x.fillText(boss ? 'dash when the line goes solid...' : 'back to this room...', W / 2, H / 2 + 46);
    }
  }
}

new Game();
