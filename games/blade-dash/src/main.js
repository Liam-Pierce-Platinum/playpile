// BLADE DASH - tap to dash-slash. Every hit refills your dash, so chain the
// whole room without touching the ground.
import { W, H, FLOOR, STAGES, CHAPTERS, BOSSES, buildStage, buildArena, waveSpawns, chapterOf } from './levels.js';
import { paintRoom, drawFigure, drawScarf, drawVent, drawCoin, pose, lerpPose, splat, stamp, BRUSH, DISPLAY } from './draw.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { outfitOf, migrateWardrobe, checkAchievements } from './wardrobe.js';
import { initPlatform, platform } from './platform.js';

const SAVE_KEY = 'pd.bladedash';
const G = 2500, MAXFALL = 1500, DASH_SPEED = 2600, DASH_LEN = 300, ASSIST_LEN = 480, MAX_CHARGES = 2;
const R_PLAYER = 18;
const FOCUS_MAX = 2.5, FOCUS_SCALE = 0.3, FOCUS_REGEN = 0.2, FOCUS_PER_KILL = 0.5;
const ENEMY_R = { grunt: 24, flyer: 24, archer: 24, shield: 26, bomber: 25, general: 34, ninja: 22, boss: 46 };
// enemies never kill by touch: they wind up (red !) and then swing through this reach
const REACH = { grunt: 85, shield: 78, bomber: 72, general: 120, ninja: 80, boss: 150 };
const WINDUP = { grunt: 0.55, shield: 0.5, bomber: 0.6, general: 0.42, ninja: 0.45, boss: 0.6 };
const SPEED = { grunt: 55, general: 75, bomber: 40, shield: 30, ninja: 45, boss: 80 };
const VMIN = 600;          // the narrowest slice of the room a portrait screen shows
const CLEAR_T = 1.15;      // slow-mo + 斬 stamp before the results card
const VENT_CYCLE = 3.2, VENT_OFF = 1.6, VENT_WARN = 0.7;   // then it burns for the rest of the cycle
const BOSS_TRIM = { 40: '#8ac8ff', 50: '#ff7a1a', 60: '#e0b030' };
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

function loadSave() {
  const s = { v: 2, stars: {}, best: {}, endless: 0, unlocked: 1, music: 0.6, sfx: 0.9, coins: 0, owned: {}, equip: {}, stats: {} };
  try {
    const o = JSON.parse(platform.load(SAVE_KEY) || '{}');
    if (o && typeof o === 'object' && !Array.isArray(o)) Object.assign(s, o);
  } catch (e) { /* corrupt or blocked: start fresh */ }
  if (!s.stars || typeof s.stars !== 'object') s.stars = {};
  if (!s.best || typeof s.best !== 'object') s.best = {};
  for (const k of ['music', 'sfx']) s[k] = typeof s[k] === 'number' ? clamp(s[k], 0, 1) : 0.7;
  if (typeof s.endless !== 'number') s.endless = 0;
  // v1 saves capped `unlocked` at 30: open whatever comes after the furthest clear
  let top = 0; for (const k of Object.keys(s.stars)) if (s.stars[k]) top = Math.max(top, +k || 0);
  s.unlocked = clamp(Math.max(+s.unlocked || 1, top + 1), 1, STAGES);
  migrateWardrobe(s);
  s.v = 2;
  return s;
}

class Game {
  constructor(save) {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = save;
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx;
    this.audio.muted = platform.muted();
    platform.onSettings((st) => { if (st && 'muteAudio' in st) { this.audio.muted = !!st.muteAudio; this.audio.apply(); } });
    this.outfit = outfitOf(this.save.equip);
    this.decal = document.createElement('canvas'); this.decal.width = W; this.decal.height = H;
    this.dctx = this.decal.getContext('2d');
    this.mode = 'title';
    this.time = 0;
    this.camX = 0;
    this.coinShown = this.save.coins; this.coinPulse = 0; this.flyCoins = [];
    this.flash = 0; this.flashT = 5;
    this.ui = new UI(this);
    this.safe = { t: 0, r: 0, b: 0, l: 0 };
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    this.input();
    this.ambient = [];
    for (let i = 0; i < 70; i++) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 6, v: 20 + Math.random() * 40 });
    document.fonts.ready.then(() => { this.fontsReady = true; });
    let boot = 'play';
    /*DEV*/
    window.__BD = this;
    if (params.has('cover')) boot = 'cover';
    else if (params.has('stage')) boot = 'stage';
    else if (params.has('endless')) boot = 'endless';
    else if (params.has('menu')) boot = 'menu';
    /*END-DEV*/
    // CrazyGames: land straight in gameplay. A first visit starts stage 1; a
    // returning player picks up at their next stage. The menu is one tap away (II).
    if (boot === 'play') this.startStage(this.ui.nextStage());
    /*DEV*/
    if (boot === 'stage') this.startStage(clamp(parseInt(params.get('stage'), 10) || 1, 1, STAGES));
    if (boot === 'endless') this.startEndless();
    if (boot === 'menu') { this.loadStage(buildStage(1), false); this.ui.show('title'); }
    if (boot === 'cover') this.coverScene(params.get('cover'));
    /*END-DEV*/
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  persist() { try { platform.store(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* blocked */ } }
  get pal() { return CHAPTERS[this.stage.chapter]; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const iw = this.iw = innerWidth, ih = this.ih = innerHeight;
    this.canvas.width = Math.round(iw * dpr);
    this.canvas.height = Math.round(ih * dpr);
    // read the notch / home-bar insets from CSS
    if (!this.safeProbe) { this.safeProbe = document.createElement('div'); this.safeProbe.className = 'safeprobe'; document.body.appendChild(this.safeProbe); }
    const cs = getComputedStyle(this.safeProbe);
    this.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    // always show the full height of the room; on a tall screen show a slice of
    // its width (at least VMIN) and let the camera follow the player
    let s = Math.min(ih / H, iw / VMIN);
    if (this.coverFit) s = ih / H;
    const vw = Math.min(W, iw / s);
    this.view = { s, vw, ox: (iw - vw * s) / 2, oy: (ih - H * s) / 2 };
    this.band = this.view.oy > 64;      // portrait: the HUD lives in the band above the room
    this.u = this.band ? clamp(iw / 440, 0.72, 1.2) : clamp(s, 0.68, 1.6);
    this.ui.layout(this.band);
    if (this.player) this.camX = this.camTarget();
  }
  toWorld(cx, cy) { const v = this.view; return { x: (cx - v.ox) / v.s + this.camX, y: (cy - v.oy) / v.s }; }
  toScreen(wx, wy) { const v = this.view; return { x: v.ox + (wx - this.camX) * v.s, y: v.oy + wy * v.s }; }
  camTarget() {
    const v = this.view;
    if (v.vw >= W - 0.5) return 0;
    const p = this.player;
    let look = p.face * 70;
    if (p.dash) look = p.dash.dx * 150;
    else { // lean toward the nearest enemy so it is on screen, keeping the player in frame
      let best = null, bd = 1e9;
      for (const e of this.enemies) if (e.alive) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 0.5; if (d < bd) { bd = d; best = e; } }
      if (best) look = clamp((best.x - p.x) / 2, -v.vw / 2 + 90, v.vw / 2 - 90);
    }
    if (this.zoomTo && this.clearT > 0) return clamp(this.zoomTo.x - v.vw / 2, 0, W - v.vw);
    return clamp(p.x + look - v.vw / 2, 0, W - v.vw);
  }

  // ------------------------------------------------------------ input
  input() {
    this.keys = new Set();
    this.mouse = null;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'play' || this.ui.open) return;
      if (!this.player.alive && this.deadT > 0 && this.deadT < 0.75 && !this.endless) { this.restart(); return; }   // tap to skip the death beat
      const p = this.toWorld(e.clientX, e.clientY);
      this.tap(p.x, p.y);
    });
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.mouse = this.toWorld(e.clientX, e.clientY); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();   // never scroll the host page
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
    addEventListener('blur', () => { this.keys.clear(); this.setFocus(false); if (this.mode === 'play' && !this.ui.open && !this.cover) this.ui.show('pause'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play' && !this.ui.open && !this.cover) this.ui.show('pause'); });
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
    this.buildScarf();
    this.arrows = []; this.halves = []; this.parts = []; this.texts = []; this.trails = []; this.waves = [];
    this.combo = 0; this.maxCombo = 0; this.kills = 0; this.total = this.enemies.length;
    this.clock = 0; this.started = false; this.ventT = 0;
    this.hitstop = 0; this.slow = 0; this.shake = 0; this.zoom = 1; this.zoomTo = null;
    this.comboPop = 0; this.tipFade = 1;
    const newChapter = !endless && stage.n > 1 && (stage.n - 1) % 10 === 0;
    this.intro = stage.boss ? 1.5 : newChapter ? 1.4 : 0.9;
    this.introMax = this.intro;
    this.focus = FOCUS_MAX; this.focusAmt = 0;
    this.score = 0; this.wave = 0; this.waveT = 1.2;
    this.clearT = 0; this.deadT = 0;
    this.runCoins = 0;
    this.boss = this.enemies.find((e) => e.type === 'boss') || null;
    this.camX = this.camTarget();
  }
  buildScarf() {
    const p = this.player, it = this.outfit.scarf, n = it.len;
    const mk = () => Array.from({ length: n }, () => ({ x: p.x, y: p.y - 66, px: p.x, py: p.y - 66 }));
    p.scarf = mk();
    p.scarf2 = it.twin ? mk() : null;
  }
  setOutfit(equip) {
    this.outfit = outfitOf(equip);
    if (this.player) this.buildScarf();
  }
  makeEnemy(type, x, y, src = {}) {
    const e = {
      type, x, y, r: ENEMY_R[type], alive: true, t: Math.random() * 10,
      face: src.face || (x > W / 2 ? -1 : 1), x0: src.x0 ?? x - 60, x1: src.x1 ?? x + 60,
      bx: x, by: y, phase: src.phase ?? Math.random() * 6.28,
      hp: type === 'general' ? 3 : 1, flash: 0, shootT: rand(2.2, 3.4), spawn: 0, walk: 0, inv: 0,
    };
    if (type === 'ninja') e.hopT = rand(1.2, 2.2);
    if (type === 'boss') {
      const b = BOSSES[src.boss];
      Object.assign(e, { hp: b.hp, maxHp: b.hp, cfg: b, bossN: src.boss, bphase: 1, castT: 3.2, leapT: 4.5, scale: b.scale, trim: BOSS_TRIM[src.boss] });
    }
    return e;
  }
  startStage(n) {
    this.stageN = n;
    this.loadStage(buildStage(n), false);
    this.mode = 'play';
    this.ui.close();
    this.ui.hud(true);
    this.audio.unlock();
    this.audio.intensity = 0.2;
    if (this.stage.boss) this.audio.play('gong');
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
  ecy(e) { return e.type === 'flyer' ? e.y - 40 : e.type === 'boss' ? e.y - 50 * e.scale : e.y - (e.type === 'general' ? 50 : 38); }
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
    p.x += mx;
    p.x = clamp(p.x, 14, W - 14);
    for (const s of this.solids) {
      if (p.x + 12 > s.x && p.x - 12 < s.x + s.w && p.y > s.y + 2 && p.y - 58 < s.y + s.h) {
        p.x = mx > 0 ? s.x - 12 : s.x + s.w + 12;
        if (p.dash) this.endDash(false);
      }
    }
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
        const under = this.solids.some((s) => p.x + 10 > s.x && p.x - 10 < s.x + s.w && Math.abs(p.y - s.y) < 2) || this.stage.plats.some((pl) => p.x + 10 > pl.x && p.x - 10 < pl.x + pl.w && Math.abs(p.y - pl.y) < 2);
        if (!under) p.onGround = false;
      }
    }
    for (const g of p.ghosts) g.life -= dt;
    p.ghosts = p.ghosts.filter((g) => g.life > 0);
    this.updateScarf(dt);
    // hazards
    if (p.y > H + 40 || (p.y > H - 30 && !this.solids.some((s) => p.x > s.x && p.x < s.x + s.w))) this.die('fell');
  }
  // the scarf: a verlet rope off the neck that streams out behind every dash
  updateScarf(dt) {
    const p = this.player, nk = this.neck(), it = this.outfit.scarf;
    const wind = p.dash ? 3.2 : 0;
    const k = Math.min(2, dt * 60);
    for (const [sc, off] of [[p.scarf, 0], [p.scarf2, 1]]) {
      if (!sc) continue;
      sc[0].x = nk.x - p.face * off * 3; sc[0].y = nk.y + off * 4;
      for (let i = 1; i < sc.length; i++) {
        const q = sc[i];
        const vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9;
        q.px = q.x; q.py = q.y;
        q.x += vx + (-p.face * 1.1 - (p.dash ? p.dash.dx * wind : 0) + Math.sin(this.time * 7 + i * 0.7 + off) * 0.25) * k;
        q.y += vy + (0.55 - (p.dash ? p.dash.dy * wind : 0) - off * 0.12) * k;
      }
      for (let n = 0; n < 3; n++) for (let i = 1; i < sc.length; i++) {
        const a = sc[i - 1], b = sc[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 7) / d;
        b.x -= dx * f; b.y -= dy * f;
      }
    }
    // the fancier scarves shed embers, petals or shadow wisps while dashing
    if (p.dash && (it.embers || it.petals || it.wisps) && Math.random() < dt * 40) {
      const tail = p.scarf[p.scarf.length - 1];
      const color = it.embers ? (Math.random() < 0.5 ? '#ffd23a' : '#ff7a1a') : it.petals ? '#f2a0b8' : '#5a2d8a';
      this.parts.push({ x: tail.x, y: tail.y, vx: rand(-60, 60), vy: rand(-80, 20), life: 0.5, max: 0.5, size: it.wisps ? rand(3, 6) : rand(1.5, 3), color, g: it.petals ? 60 : -40 });
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
    if (this.combo > 0 && this.kills < this.total) this.combo = 0;
    this.audio.play('land');
    for (let k = 0; k < 6; k++) this.parts.push({ x: p.x + rand(-12, 12), y: p.y - 2, vx: rand(-90, 90), vy: rand(-120, -30), life: 0.4, max: 0.4, size: rand(2, 4), color: this.chapterDust(), g: 400 });
  }
  chapterDust() { return this.stage.chapter === 3 ? '#fbfcfc' : this.pal.ink; }
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
    if ((e.type === 'general' || e.type === 'boss') && e.hp > 1) {
      const big = e.type === 'boss';
      e.hp--; e.flash = 0.2; e.inv = big ? 0.2 : 0.12;
      // stagger him back, and bounce the player clear: the dash would otherwise end inside him
      e.x = clamp(e.x + dx * (big ? 40 : 50), e.x0, e.x1);
      e.stun = big ? 0.7 : 0.8;
      if (big) { e.atk = null; e.cast = null; if (e.leap && e.leap.stage !== 'air') e.leap = null; }
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboPop = 1;
      p.dash = null;
      p.vx = -dx * 460;
      p.vy = Math.min(big ? -560 : -480, -dy * 400 - 360);
      p.onGround = false;
      p.inv = 0.5;
      p.slashT = 0.12;
      p.charges = MAX_CHARGES; p.float = 0.25;
      this.hitstop = big ? 0.09 : 0.07; this.shake = Math.max(this.shake, big ? 12 : 9);
      this.audio.play('clang'); this.audio.play('slash', 0.8);
      splat(this.dctx, e.x, this.ecy(e), big ? 16 : 12, this.pal.accent, dx, dy);
      if (big) this.bossPhaseCheck(e);
      else this.text(e.x, this.ecy(e) - 60, `${e.hp} more!`, 24, this.pal.accent);
      return;
    }
    this.kill(e, dx, dy, false);
  }
  bossPhaseCheck(e) {
    const f = e.hp / e.maxHp;
    const ph = Math.min(e.cfg.phases, f <= 1 / 3 ? 3 : f <= 2 / 3 ? 2 : 1);
    if (ph <= e.bphase) return;
    e.bphase = ph;
    e.stun = 1.3; e.inv = 1.0; e.castT = 1.8; e.leapT = 3.2;
    this.shake = 18; this.flash = 0.25;
    this.audio.play('gong');
    this.text(e.x, this.ecy(e) - 110, ph === 2 ? '第二 · PHASE II' : '第三 · PHASE III', 34, this.pal.accent);
    // fresh lanterns to chain off, and on the final stage the Shogun calls for help
    const lanterns = this.enemies.filter((q) => q.alive && q.type === 'flyer').length;
    for (let k = lanterns; k < 2; k++) this.spawnAdd('flyer', k === 0 ? 380 : 900, k === 0 ? 300 : 240);
    if (e.cfg.summons) { this.spawnAdd('grunt', 300, FLOOR); this.spawnAdd('ninja', 1050, FLOOR); }
  }
  spawnAdd(type, x, y) {
    const e = this.makeEnemy(type, x, y, type === 'flyer' ? {} : { x0: 240, x1: W - 60 });
    e.spawn = 0.8; e.add = true;
    this.enemies.push(e);
    this.total++;
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
    p.inv = Math.max(p.inv, 0.15);   // a dash that ends inside the next enemy shouldn't kill you on the spot
    this.focus = Math.min(FOCUS_MAX, this.focus + FOCUS_PER_KILL);
    const cy = this.ecy(e);
    const isBoss = e.type === 'boss';
    // cut the enemy in two along the slash
    const sz = isBoss ? 320 : 160;
    const img = document.createElement('canvas'); img.width = sz; img.height = sz;
    const ix = img.getContext('2d');
    this.drawEnemy(ix, e, sz / 2, isBoss ? sz * 0.82 : e.type === 'flyer' ? 120 : 118, true);
    const ang = Math.atan2(dy, dx);
    for (const s of [-1, 1]) {
      const nx = -Math.sin(ang) * s, ny = Math.cos(ang) * s;
      this.halves.push({ img, sz, x: e.x, y: cy, vx: nx * 220 + dx * 180, vy: ny * 220 + dy * 120 - 220, rot: 0, vr: s * rand(4, 9), ang, side: s, life: isBoss ? 2.4 : 1.6 });
    }
    splat(this.dctx, e.x + dx * 20, cy + dy * 20, isBoss ? 40 : e.type === 'general' ? 26 : 16, this.pal.accent, dx, dy);
    if (Math.random() < 0.6) splat(this.dctx, e.x + dx * 70, Math.min(FLOOR - 4, cy + 40), 8, this.pal.accent, dx, 0.2);
    for (let k = 0; k < (isBoss ? 40 : 16); k++) this.parts.push({ x: e.x, y: cy, vx: dx * rand(200, 600) + rand(-150, 150), vy: dy * rand(200, 500) + rand(-300, 100), life: rand(0.3, 0.7), max: 0.7, size: rand(2, 5), color: Math.random() < 0.6 ? this.pal.accent : this.pal.ink, g: 1200 });
    if (this.outfit.blade.petals) for (let k = 0; k < 8; k++) this.parts.push({ x: e.x, y: cy, vx: rand(-200, 200), vy: rand(-260, -40), life: 0.9, max: 0.9, size: rand(2, 3.5), color: '#f2a0b8', g: 120 });
    this.trails.push({ slash: true, x: e.x, y: cy, ang, life: 0.25, max: 0.25 });
    this.hitstop = Math.max(this.hitstop, isBoss ? 0.2 : byBlast ? 0.02 : 0.055);
    this.shake = Math.max(this.shake, isBoss ? 20 : byBlast ? 5 : 7);
    this.audio.play('slash', 1 + Math.min(this.combo, 12) * 0.05);
    if (this.combo >= 2) this.audio.play('combo', 1 + Math.min(this.combo, 10) * 0.1);
    const pts = 100 * this.combo;
    this.score += pts;
    this.text(e.x, cy - 46, this.endless ? `+${pts}` : this.combo >= 2 ? `×${this.combo}` : '', 26, this.pal.ink);
    // a coin for every kill (two for a general), flying up to the counter
    const coins = isBoss ? 0 : e.type === 'general' ? 2 : 1;
    if (coins) this.giveCoins(coins, e.x, cy - 20);
    this.save.stats.kills++;
    if (e.type === 'bomber') setTimeout(() => this.blast(e.x, cy), 110);
    if (isBoss) {
      this.save.stats.bosses++;
      platform.happytime();
      this.audio.play('gong');
      this.flash = 0.35;
      this.text(e.x, cy - 140, `${e.cfg.name.toUpperCase()} FALLS`, 40, this.pal.accent);
      // his army breaks and runs: everything left falls with him
      for (const q of this.enemies) if (q.alive && q !== e) this.kill(q, Math.sign(q.x - e.x) || 1, -0.4, true);
    }
    const left = this.enemies.filter((q) => q.alive).length;
    if (!this.endless && left === 0 && this.clearT <= 0) this.finishRoom(e.x, cy);
  }
  giveCoins(n, wx, wy) {
    this.save.coins += n;
    this.save.stats.coinsEarned += n;
    this.runCoins += n;
    const s = this.toScreen(wx, wy);
    for (let i = 0; i < Math.min(n, 6); i++) this.flyCoins.push({ x0: s.x + rand(-10, 10), y0: s.y + rand(-10, 10), t: -i * 0.06, d: 0.55, n: i === Math.min(n, 6) - 1 ? n - (Math.min(n, 6) - 1) : 1, arc: rand(-80, 80) });
  }
  strike(e) {
    const p = this.player, reach = REACH[e.type] * (e.type === 'boss' ? 1 : 1), cy = this.ecy(e);
    this.trails.push({ slash: true, enemy: true, x: e.x + e.face * reach * 0.55, y: cy - 6, ang: e.face > 0 ? 0.35 : Math.PI - 0.35, life: 0.18, max: 0.18, big: e.type === 'boss' });
    this.audio.play('dash', 0.6);
    if (!p.alive || p.dash || p.inv > 0) return;
    const fx = (p.x - e.x) * e.face, dy = (p.y - 36) - cy;
    if (fx > -26 && fx < reach + 24 && Math.abs(dy) < (e.type === 'boss' ? 110 : 82)) this.die('hit');
  }
  blast(x, y) {
    this.audio.play('boom');
    this.shake = Math.max(this.shake, 16);
    this.trails.push({ ring: true, x, y, life: 0.4, max: 0.4 });
    splat(this.dctx, x, y, 34, this.pal.ink, 0, 0);
    for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = rand(200, 700); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, size: rand(3, 7), color: k % 3 ? this.pal.ink : '#ff8a2a', g: 300 }); }
    for (const e of this.enemies) if (e.alive && !e.spawn && Math.hypot(e.x - x, this.ecy(e) - y) < 170) { if (e.type === 'general' || e.type === 'boss') { e.hp = Math.max(1, e.hp - 1); e.flash = 0.2; if (e.type === 'boss') this.bossPhaseCheck(e); } else this.kill(e, Math.sign(e.x - x) || 1, -0.3, true); }
  }
  die(why) {
    const p = this.player;
    if (!p.alive || this.clearT > 0 || this.god) return;
    p.alive = false;
    this.audio.play('die');
    this.shake = 14; this.hitstop = 0.12;
    splat(this.dctx, p.x, p.y - 36, 22, this.pal.accent, 0, -0.3);
    for (let k = 0; k < 24; k++) this.parts.push({ x: p.x, y: p.y - 36, vx: rand(-400, 400), vy: rand(-500, 100), life: rand(0.4, 0.9), max: 0.9, size: rand(2, 6), color: k % 2 ? this.pal.ink : this.pal.accent, g: 1200 });
    this.deadT = 1.0;
    this.deathWhy = why;
    if (this.endless) {
      const best = this.score > this.save.endless;
      if (best) this.save.endless = this.score;
      const bonus = this.wave * 3;
      if (bonus) { this.save.coins += bonus; this.save.stats.coinsEarned += bonus; }
      this.save.stats.bestWave = Math.max(this.save.stats.bestWave, this.wave);
      const unlocks = checkAchievements(this.save);
      this.persist();
      this.endResult = { score: this.score, wave: this.wave, best, top: this.save.endless, chain: this.maxCombo, coins: this.runCoins + bonus, unlocks };
    } else this.persist();   // coins picked up before the fall are kept
  }
  finishRoom(x, y) {
    this.clearT = CLEAR_T;
    this.slow = 0.9;
    this.zoomTo = { x, y };
    const time = Math.round(this.clock * 100) / 100;
    const n = this.stageN;
    const perfect = this.maxCombo >= this.total;
    const stars = [true, time <= this.stage.par, perfect];
    const old = this.save.stars[n] || [false, false, false];
    const firstClear = !this.save.stars[n];
    const newStars = stars.map((s, i) => s && !old[i]);
    this.save.stars[n] = stars.map((s, i) => s || old[i]);
    const prevBest = this.save.best[n];
    this.save.best[n] = prevBest ? Math.min(prevBest, time) : time;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(STAGES, n + 1));
    // clear bonus: 10, +5 a star, +15 for a perfect chain, +10 the first time, +60 for a boss
    const bonus = { clear: 10, stars: stars.filter(Boolean).length * 5, perfect: perfect ? 15 : 0, first: firstClear ? 10 : 0, boss: this.stage.boss ? 60 : 0 };
    const bonusTotal = Object.values(bonus).reduce((a, b) => a + b, 0);
    const killCoins = this.runCoins;
    this.save.coins += bonusTotal; this.save.stats.coinsEarned += bonusTotal;
    if (perfect) { this.save.stats.perfect++; if (!this.stage.boss) platform.happytime(); }
    const unlocks = checkAchievements(this.save);
    this.persist();
    this.result = { n, time, par: this.stage.par, stars, newStars, best: this.save.best[n], newBest: !prevBest || time < prevBest, chain: this.maxCombo, total: this.total, killCoins, bonus, bonusTotal, coins: this.save.coins, perfect, unlocks, boss: this.stage.boss };
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
      if (e.type === 'ninja' && this.updateNinja(e, dt)) continue;
      if (e.type === 'boss' && this.updateBoss(e, dt)) continue;
      // walkers: grunt, shield, bomber, general, ninja and the boss's sword arm
      if (e.stun > 0) { e.stun -= dt; e.atk = null; continue; }
      e.cool = Math.max(0, (e.cool || 0) - dt);
      if (e.atk) {
        e.atk.t -= dt;
        e.face = e.atk.face;
        if (e.atk.t <= 0) { e.atk = null; e.cool = e.type === 'boss' ? 0.8 : 0.95; e.strikeT = 0.2; this.strike(e); }
        continue;
      }
      if (e.strikeT > 0) { e.strikeT -= dt; continue; }
      if (this.started && p.alive && !p.dash && e.cool <= 0 && this.clearT <= 0 && !this.stage.calm) {
        const ddx = p.x - e.x, ddy = (p.y - 36) - this.ecy(e);
        if (Math.abs(ddx) < REACH[e.type] && Math.abs(ddy) < (e.type === 'boss' ? 110 : 80)) {
          const wu = e.type === 'boss' && e.bphase >= 3 ? 0.45 : WINDUP[e.type];
          e.atk = { t: wu, max: wu, face: ddx >= 0 ? 1 : -1 };
          this.audio.play('warn');
          continue;
        }
      }
      let sp = SPEED[e.type] * (e.type === 'boss' && e.bphase >= 3 ? 1.35 : 1);
      if (e.type === 'general' || e.type === 'boss' || e.type === 'shield') {
        if (e.type !== 'shield') e.face = p.x > e.x ? 1 : -1;
        else { e.turnT = (e.turnT ?? 1.2) - dt; if (e.turnT <= 0) { e.turnT = 2.2; e.face = p.x > e.x ? 1 : -1; } }
        if (e.type !== 'shield' && Math.abs(p.x - e.x) < 30) sp = 0;
      }
      if (!this.started && e.type !== 'grunt') sp = 0;
      e.x += e.face * sp * dt;
      if (e.x < e.x0) { e.x = e.x0; if (e.type !== 'general' && e.type !== 'boss') e.face = 1; }
      if (e.x > e.x1) { e.x = e.x1; if (e.type !== 'general' && e.type !== 'boss') e.face = -1; }
      e.walk += dt * sp * 0.12;
    }
    for (const a of this.arrows) {
      if (a.dead) continue;
      a.x += a.vx * dt; a.y += a.vy * dt; a.vy += (a.kind ? 0 : 120) * dt; a.life -= dt; a.spin = (a.spin || 0) + dt * 20;
      if (a.life <= 0 || a.x < -20 || a.x > W + 20 || a.y > H) { a.dead = true; continue; }
      if (this.solids.some((s) => a.x > s.x && a.x < s.x + s.w && a.y > s.y)) { a.dead = true; continue; }
      if (p.alive && !p.dash && p.inv <= 0 && Math.hypot(a.x - p.x, a.y - (p.y - 36)) < 15) { a.dead = true; this.die('arrow'); }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);
    // boss shockwaves roll along the floor; jump or dash over them
    for (const w of this.waves) {
      w.x += w.vx * dt; w.life -= dt;
      if (w.x < -40 || w.x > W + 40) w.life = 0;
      if (p.alive && !p.dash && p.inv <= 0 && p.y > FLOOR - 34 && Math.abs(p.x - w.x) < 24) this.die('wave');
    }
    this.waves = this.waves.filter((w) => w.life > 0);
    // fire vents
    if (this.started) this.ventT += dt;
    for (const v of this.stage.vents) {
      const st = this.ventState(v);
      if (st.s === 'burn' && !v.lit) { v.lit = true; this.audio.play('flame'); }
      if (st.s !== 'burn') v.lit = false;
      if (st.s === 'burn' && st.k > 0.08 && st.k < 0.9 && p.alive && !p.dash && p.inv <= 0 && Math.abs(p.x - v.x) < v.w / 2 + 6 && p.y > FLOOR - 150) this.die('burned');
    }
  }
  ventState(v) {
    if (!this.started) return { s: 'off', k: 0 };
    const t = (this.ventT + v.phase) % VENT_CYCLE;
    if (t < VENT_OFF) return { s: 'off', k: t / VENT_OFF };
    if (t < VENT_OFF + VENT_WARN) return { s: 'warn', k: (t - VENT_OFF) / VENT_WARN };
    return { s: 'burn', k: (t - VENT_OFF - VENT_WARN) / (VENT_CYCLE - VENT_OFF - VENT_WARN) };
  }
  // ninja: leaps from ledge to ledge. Returns true while it is busy in the air.
  updateNinja(e, dt) {
    const p = this.player;
    if (e.hop) {
      const h = e.hop;
      h.t += dt;
      const k = Math.min(1, h.t / h.d);
      e.x = h.x0 + (h.x1 - h.x0) * k;
      e.y = h.y0 + (h.y1 - h.y0) * k - Math.sin(Math.PI * k) * h.hgt;
      if (k >= 1) { e.hop = null; e.y = h.y1; e.x0 = h.s.x0; e.x1 = h.s.x1; e.hopT = rand(1.8, 2.8); this.puff(e.x, e.y - 4, 6, this.pal.ink); }
      return true;
    }
    if (!this.started || e.atk || e.stun > 0 || !p.alive || this.clearT > 0) return false;
    e.hopT -= dt;
    if (e.hopT > 0) return false;
    const spots = this.stage.spots.filter((s) => s.x1 - s.x0 > 20);
    for (let t = 0; t < 12; t++) {
      const s = spots[Math.floor(Math.random() * spots.length)];
      const tx = rand(s.x0, s.x1);
      if (Math.hypot(tx - p.x, s.y - p.y) < 170 || Math.abs(tx - e.x) < 120 || Math.abs(tx - e.x) > 620) continue;
      e.hop = { x0: e.x, y0: e.y, x1: tx, y1: s.y, t: 0, d: 0.7, hgt: 120 + Math.max(0, e.y - s.y) * 0.6, s };
      e.face = tx > e.x ? 1 : -1;
      this.audio.play('hop');
      return true;
    }
    e.hopT = 0.6;
    return false;
  }
  // boss: a general with phases. Phase II throws a fan of blades, phase III adds a leap slam
  // that sends shockwaves along the floor. Returns true while a special move is running.
  updateBoss(e, dt) {
    const p = this.player;
    if (!this.started || !p.alive || this.clearT > 0) return false;
    if (e.stun > 0) return false;
    if (e.leap) {
      const L = e.leap;
      L.t += dt;
      if (L.stage === 'crouch') { if (L.t >= 0.45) { L.stage = 'air'; L.t = 0; this.audio.play('dash', 0.5); } return true; }
      const k = Math.min(1, L.t / 0.75);
      e.x = L.x0 + (L.x1 - L.x0) * k;
      e.y = FLOOR - Math.sin(Math.PI * k) * 280;
      if (k >= 1) {
        e.y = FLOOR; e.leap = null; e.leapT = rand(4.5, 6); e.cool = 0.6;
        this.shake = 16; this.audio.play('boom');
        splat(this.dctx, e.x, FLOOR - 4, 20, this.pal.ink, 0, 0);
        for (const dir of [-1, 1]) this.waves.push({ x: e.x + dir * 40, vx: dir * 540, life: 3 });
        for (let k2 = 0; k2 < 20; k2++) this.parts.push({ x: e.x + rand(-40, 40), y: FLOOR - 4, vx: rand(-300, 300), vy: rand(-400, -100), life: 0.6, max: 0.6, size: rand(2, 5), color: this.chapterDust(), g: 1200 });
      }
      return true;
    }
    if (e.cast) {
      e.cast.t -= dt;
      if (e.cast.t <= 0) {
        e.cast = null; e.castT = e.bphase >= 3 ? 2.8 : 3.6;
        const sx = e.x + e.face * 30, sy = this.ecy(e) - 40;
        const base = Math.atan2((p.y - 36) - sy, p.x - sx);
        const kind = e.bossN === 40 ? 'ice' : e.bossN === 50 ? 'fire' : 'star';
        for (const off of [-0.22, 0, 0.22]) this.arrows.push({ x: sx, y: sy, vx: Math.cos(base + off) * 480, vy: Math.sin(base + off) * 480, life: 3, kind });
        this.audio.play('twang');
      }
      return true;
    }
    if (e.atk) return false;
    if (e.bphase >= 2) e.castT -= dt;
    if (e.bphase >= 3) e.leapT -= dt;
    if (e.bphase >= 3 && e.leapT <= 0) {
      e.leap = { stage: 'crouch', t: 0, x0: e.x, x1: clamp(p.x, e.x0, e.x1) };
      e.face = p.x > e.x ? 1 : -1;
      this.audio.play('warn');
      return true;
    }
    if (e.bphase >= 2 && e.castT <= 0 && Math.abs(p.x - e.x) > 140) {
      e.cast = { t: 0.6, max: 0.6 };
      e.face = p.x > e.x ? 1 : -1;
      this.audio.play('warn');
      return true;
    }
    return false;
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
        const spots = this.stage.spots;
        for (const type of waveSpawns(this.wave)) {
          for (let t = 0; t < 30; t++) {
            let x, y, s = null;
            if (type === 'flyer') { x = rand(120, W - 120); y = rand(140, 520); }
            else { s = spots[Math.floor(Math.random() * spots.length)]; x = rand(s.x0, s.x1); y = s.y; }
            if (Math.hypot(x - this.player.x, y - this.player.y) < 260) continue;
            const e = this.makeEnemy(type, x, y, s ? { x0: s.x0, x1: s.x1 } : {});
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
    const playing = this.mode === 'play' && !this.ui.open && !this.cover;
    platform.setPlaying(playing && !!this.loaded);
    if (playing) this.update(dt);
    this.updateCoins(dt);
    this.audio.intensity = playing ? Math.min(1, 0.25 + this.combo * 0.12 + (this.boss && this.boss.alive ? 0.35 : 0)) : 0.15;
    this.audio.update(dt, playing);
    if (this.stage) this.render(dt);
    if (!this.loaded && this.fontsReady) { this.loaded = true; platform.loadingStop(); document.body.classList.add('ready'); }
  }
  updateCoins(dt) {
    this.coinPulse = Math.max(0, this.coinPulse - dt * 4);
    for (const c of this.flyCoins) {
      c.t += dt;
      if (c.t >= c.d && !c.done) { c.done = true; this.coinShown += c.n; this.coinPulse = 1; this.audio.play('coin', 1 + Math.random() * 0.1); }
    }
    this.flyCoins = this.flyCoins.filter((c) => !c.done);
    // anything not in flight (bonuses, purchases) settles straight onto the counter
    if (!this.flyCoins.length && this.coinShown !== this.save.coins) this.coinShown = this.save.coins;
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
    this.flash = Math.max(0, this.flash - dtReal);
    if (this.stage.chapter === 5) { this.flashT -= dtReal; if (this.flashT <= 0) { this.flashT = rand(4, 9); this.flash = 0.18; this.audio.play('thunder'); } }
    // camera
    this.camX += (this.camTarget() - this.camX) * Math.min(1, dtReal * (this.player.dash ? 9 : 5));
    if (this.clearT > 0) {
      this.clearT -= dtReal;
      if (this.clearT <= 0) { this.ui.show(this.stageN >= STAGES ? 'finale' : 'result', this.result); }
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
    else if (e.type === 'ninja' && e.hop) P = pose('air');
    else if (e.type === 'boss' && e.leap) P = e.leap.stage === 'crouch' ? pose('crouch') : pose('air');
    else if (e.type === 'boss' && e.cast) P = pose('raise');
    else if (e.atk && !still) P = lerpPose(pose('idle'), pose('raise'), Math.min(1, (1 - e.atk.t / e.atk.max) * 1.6));
    else if (e.strikeT > 0 && !still) P = pose('slash');
    else if (e.stun > 0 && e.type === 'boss' && !still) P = pose('guard');
    else if (!still && e.type !== 'flyer') P = lerpPose(pose('walkA'), pose('walkB'), (Math.sin(e.walk * 2) + 1) / 2);
    const draw = e.type === 'archer' ? clamp(1 - e.shootT / 0.8, 0, 1) : 0;
    const scale = e.type === 'boss' ? e.scale : e.type === 'general' ? 1.35 : 1;
    drawFigure(x, px, py, { pose: P, face: e.face, scale, ink: e.flash > 0 ? pal.accent : pal.ink, paper: pal.paper, accent: pal.accent, mask: e.flash > 0 ? pal.accent : (pal.dark ? '#2a3248' : '#fffaf0'), kind: e.type, t: e.t, draw, trim: e.trim });
  }
  drawPlayer(x, p, pal) {
    let P, rot = 0;
    if (p.dash) { P = pose('dash'); rot = Math.atan2(p.dash.dy, Math.abs(p.dash.dx)) * p.face; }
    else if (p.slashT > 0) P = pose('slash');
    else if (!p.onGround) P = pose('air');
    else P = lerpPose(pose('idle'), pose('aim'), (Math.sin(this.time * 2) + 1) * 0.08);
    drawScarf(x, p.scarf2, this.outfit.scarf, pal.ink);
    drawScarf(x, p.scarf, this.outfit.scarf, pal.ink);
    drawFigure(x, p.x, p.y, { pose: P, face: p.face, rot, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: this.time, outfit: this.outfit });
  }
  render(dt) {
    const x = this.ctx, v = this.view, pal = this.pal, p = this.player, dpr = this.dpr;
    const iw = this.iw, ih = this.ih;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = pal.bg;
    x.fillRect(0, 0, iw, ih);
    x.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * (v.ox - this.camX * v.s), dpr * v.oy);
    x.save();
    x.beginPath(); x.rect(0, 0, W, H); x.clip();
    // camera: shake and a punch-in on the final kill
    const sh = this.shake;
    x.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    const zt = this.clearT > 0 ? Math.min(1, (CLEAR_T - this.clearT) * 3) * Math.min(1, this.clearT * 2) : 0;
    if (this.zoomTo && zt > 0) { const z = 1 + 0.18 * zt; x.translate(this.zoomTo.x, this.zoomTo.y); x.scale(z, z); x.translate(-this.zoomTo.x, -this.zoomTo.y); }
    x.drawImage(this.bg, 0, 0);
    x.drawImage(this.decal, 0, 0);
    // fire vents
    for (const vt of this.stage.vents) { const st = this.ventState(vt); drawVent(x, vt, st.s, st.k, this.time); }
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
    // boss tells: the landing shadow of a leap
    if (this.boss && this.boss.alive && this.boss.leap) {
      const L = this.boss.leap, k = L.stage === 'crouch' ? L.t / 0.45 : 1;
      x.globalAlpha = 0.25 + 0.35 * k; x.fillStyle = pal.accent;
      x.beginPath(); x.ellipse(L.x1, FLOOR - 2, 50 + 30 * k, 9, 0, 0, 7); x.fill(); x.globalAlpha = 1;
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
      const tell = e.atk || e.cast || (e.leap && e.leap.stage === 'crouch');
      if (tell) {
        const hy = e.type === 'boss' ? e.y - 82 * e.scale - 40 : e.y - (e.type === 'general' ? 150 : 108);
        const s = 1 + Math.sin(this.time * 30) * 0.12 + (e.atk ? (1 - e.atk.t / e.atk.max) * 0.3 : 0.2);
        x.save(); x.translate(e.x, hy); x.scale(s, s);
        x.font = `40px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 6; x.strokeStyle = pal.paper; x.strokeText('!', 0, 0);
        x.fillStyle = pal.accent; x.fillText('!', 0, 0);
        x.restore();
      }
      if (e.type === 'general') for (let k = 0; k < e.hp; k++) { x.fillStyle = pal.accent; x.beginPath(); x.arc(e.x - 12 + k * 12, e.y - 128, 4.5, 0, 7); x.fill(); }
    }
    // shockwaves
    for (const w of this.waves) {
      const dir = Math.sign(w.vx);
      x.fillStyle = pal.ink;
      x.beginPath(); x.moveTo(w.x - dir * 30, FLOOR); x.quadraticCurveTo(w.x - dir * 6, FLOOR - 44, w.x + dir * 14, FLOOR - 8); x.lineTo(w.x + dir * 22, FLOOR); x.closePath(); x.fill();
      x.fillStyle = pal.accent; x.beginPath(); x.moveTo(w.x - dir * 10, FLOOR - 18); x.quadraticCurveTo(w.x + dir * 4, FLOOR - 34, w.x + dir * 14, FLOOR - 8); x.lineTo(w.x, FLOOR - 6); x.fill();
    }
    // arrows and boss projectiles
    for (const a of this.arrows) {
      const d = Math.hypot(a.vx, a.vy);
      if (a.kind) {
        x.save(); x.translate(a.x, a.y); x.rotate(a.kind === 'star' ? a.spin : Math.atan2(a.vy, a.vx));
        if (a.kind === 'star') { x.fillStyle = pal.ink; for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 2); x.beginPath(); x.moveTo(0, -3); x.lineTo(13, 0); x.lineTo(0, 3); x.fill(); } x.fillStyle = pal.accent; x.beginPath(); x.arc(0, 0, 3, 0, 7); x.fill(); }
        else if (a.kind === 'ice') { x.fillStyle = '#d8f0ff'; x.strokeStyle = pal.ink; x.lineWidth = 2; x.beginPath(); x.moveTo(16, 0); x.lineTo(-10, -6); x.lineTo(-6, 0); x.lineTo(-10, 6); x.closePath(); x.fill(); x.stroke(); }
        else { x.fillStyle = '#ff7a1a'; x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fill(); x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(2, 0, 5, 0, 7); x.fill(); x.globalAlpha = 0.5; x.fillStyle = '#c8281e'; x.beginPath(); x.ellipse(-12, 0, 12, 5, 0, 0, 7); x.fill(); }
        x.restore();
        continue;
      }
      x.strokeStyle = pal.ink; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(a.x - a.vx / d * 26, a.y - a.vy / d * 26); x.stroke();
      x.fillStyle = pal.accent; x.beginPath(); x.arc(a.x - a.vx / d * 26, a.y - a.vy / d * 26, 3, 0, 7); x.fill();
    }
    // halves
    for (const h of this.halves) {
      const sz = h.sz || 160;
      x.save(); x.globalAlpha = Math.min(1, h.life * 1.5);
      x.translate(h.x, h.y); x.rotate(h.rot);
      x.rotate(h.ang); x.beginPath(); x.rect(-sz * 0.75, h.side > 0 ? 0 : -sz * 0.75, sz * 1.5, sz * 0.75); x.rotate(-h.ang); x.clip();
      x.drawImage(h.img, -sz / 2, -sz / 2);
      x.restore();
    }
    // dash trails: a hot stroke edged in ink, cored in the blade's colour
    const core = this.outfit.blade.core || (pal.dark ? '#1a2030' : '#fffaf0');
    for (const t of this.trails) {
      const k = t.life / t.max;
      if (t.ring) { x.strokeStyle = pal.ink; x.globalAlpha = k; x.lineWidth = 10 * k; x.beginPath(); x.arc(t.x, t.y, 170 * (1 - k) + 20, 0, 7); x.stroke(); x.globalAlpha = 1; continue; }
      if (t.slash) {
        const L = t.big ? 1.8 : 1;
        x.save(); x.translate(t.x, t.y); x.rotate(t.ang); x.globalAlpha = k;
        x.fillStyle = t.enemy ? pal.accent : pal.ink; x.beginPath(); x.ellipse(0, 0, 80 * L * (1.2 - k * 0.2), 9 * k + 2, 0, 0, 7); x.fill();
        x.fillStyle = t.enemy ? pal.paper : core; x.beginPath(); x.ellipse(0, 0, 70 * L * (1.2 - k * 0.2), 3 * k + 1, 0, 0, 7); x.fill();
        x.restore(); x.globalAlpha = 1; continue;
      }
      if (t.pts.length < 2) continue;
      const a = t.pts[0], b = t.pts[t.pts.length - 1];
      x.globalAlpha = k;
      x.strokeStyle = pal.ink; x.lineWidth = 16 * k + 2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
      if (this.outfit.blade.glow) { x.save(); x.shadowColor = this.outfit.blade.glow; x.shadowBlur = 16; }
      x.strokeStyle = core; x.lineWidth = 6 * k + 1;
      x.beginPath(); x.moveTo(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3); x.lineTo(b.x, b.y); x.stroke();
      if (this.outfit.blade.glow) x.restore();
      x.globalAlpha = 1;
    }
    // player: afterimages, scarf, body
    if (p.alive) {
      for (const g of p.ghosts) { x.globalAlpha = g.life / 0.2 * 0.35; drawFigure(x, g.x, g.y, { pose: pose('dash'), face: g.face, rot: g.rot, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: this.time, outfit: this.outfit }); }
      x.globalAlpha = 1;
      this.drawPlayer(x, p, pal);
      // focus meter
      if (!this.cover && (this.focus < FOCUS_MAX - 0.01 || this.focusAmt > 0.05)) {
        const fw = 50, fx = p.x - fw / 2, fy = p.y - 118;
        x.strokeStyle = pal.ink; x.lineWidth = 2; x.strokeRect(fx, fy, fw, 6);
        x.fillStyle = this.focus < 0.4 ? pal.ink : pal.accent; x.fillRect(fx + 1, fy + 1, (fw - 2) * (this.focus / FOCUS_MAX), 4);
      }
      // dash charges as two ink dots
      for (let k = 0; k < (this.cover ? 0 : MAX_CHARGES); k++) {
        x.beginPath(); x.arc(p.x - 7 + k * 14, p.y - 104, 5, 0, 7);
        if (k < p.charges) { x.fillStyle = pal.accent; x.fill(); } else { x.strokeStyle = pal.ink; x.lineWidth = 1.5; x.stroke(); }
      }
    }
    // particles
    for (const q of this.parts) { x.globalAlpha = Math.min(1, q.life / q.max * 1.5); x.fillStyle = q.color; x.beginPath(); x.arc(q.x, q.y, q.size, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    this.drawAmbient(x, dt, pal);
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
    if (this.band) this.drawTornEdges(x, pal);
    // screen-space overlays
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.focusAmt > 0.01) {
      const a = this.focusAmt, cx = iw / 2, cy = v.oy + H * v.s / 2, R = Math.max(iw, ih);
      const g = x.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(10,6,4,${0.55 * a})`);
      x.fillStyle = g; x.fillRect(0, 0, iw, ih);
      x.globalAlpha = 0.1 * a; x.fillStyle = pal.accent; x.fillRect(0, 0, iw, ih);
      x.globalAlpha = 0.18 * a; x.font = `${Math.round(220 * Math.min(v.s, iw / 700))}px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = pal.ink;
      x.fillText('集中', cx, cy + 20 * v.s);
      x.globalAlpha = 1;
    }
    if (this.flash > 0) { x.globalAlpha = Math.min(0.5, this.flash * 1.4); x.fillStyle = '#fffaf0'; x.fillRect(0, 0, iw, ih); x.globalAlpha = 1; }
    if (this.mode === 'play' && !this.cover) this.drawHud(x);
  }
  drawAmbient(x, dt, pal) {
    const fx = pal.fx, n = fx === 'rain' ? 70 : fx === 'snow' ? 50 : 26;
    for (let i = 0; i < n; i++) {
      const a = this.ambient[i];
      const fall = fx === 'rain' ? 700 + a.v * 6 : fx === 'snow' ? a.v * 0.9 : a.v;
      a.y += fall * dt; a.x += (fx === 'rain' ? -180 : Math.sin(this.time + a.s) * 20 - 12) * dt;
      if (a.y > H + 10) { a.y = -10; a.x = Math.random() * (W + 200); }
      if (a.x < -10) a.x = W + 10;
      if (fx === 'rain') { x.strokeStyle = '#c8d0e0'; x.globalAlpha = 0.25; x.lineWidth = 1.2; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(a.x - 6, a.y + 24); x.stroke(); continue; }
      x.save(); x.translate(a.x, a.y); x.rotate(this.time * 1.5 + a.s);
      if (fx === 'leaf') { x.fillStyle = pal.ink; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(0, 0, 8, 2.5, 0, 0, 7); x.fill(); }
      else if (fx === 'petal') { x.fillStyle = '#f2a0b8'; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(0, 0, 5, 3, 0, 0, 7); x.fill(); }
      else if (fx === 'snow') { x.fillStyle = '#ffffff'; x.globalAlpha = 0.9; x.beginPath(); x.arc(0, 0, 1.5 + a.s * 0.4, 0, 7); x.fill(); x.strokeStyle = '#8a98a4'; x.globalAlpha = 0.4; x.lineWidth = 0.8; x.stroke(); }
      else if (fx === 'ash') { if (i % 3) { x.fillStyle = '#5a4a40'; x.globalAlpha = 0.5; x.fillRect(-3, -1.5, 6, 3); } else { x.fillStyle = '#ff8a3a'; x.globalAlpha = 0.5 + Math.sin(this.time * 6 + a.s) * 0.3; x.fillRect(-1.5, -1.5, 3, 3); } }
      else { x.fillStyle = '#ff8a3a'; x.globalAlpha = 0.5 + Math.sin(this.time * 6 + a.s) * 0.3; x.fillRect(-1.5, -1.5, 3, 3); }
      x.restore();
    }
    x.globalAlpha = 1;
  }
  // portrait: the room sits in the middle of the screen like a torn sheet of paper
  drawTornEdges(x, pal) {
    if (!this.torn) { const R = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); this.torn = Array.from({ length: 140 }, () => R()); }
    x.fillStyle = pal.bg;
    for (const top of [true, false]) {
      x.beginPath();
      const y0 = top ? -2 : H + 2;
      x.moveTo(-10, top ? -40 : H + 40);
      for (let i = 0; i <= 130; i++) { const wx = -10 + i * (W + 20) / 130; x.lineTo(wx, y0 + (top ? 1 : -1) * this.torn[i] * 7); }
      x.lineTo(W + 10, top ? -40 : H + 40); x.closePath(); x.fill();
    }
  }
  drawHud(x) {
    const pal = this.pal, p = this.player, v = this.view, u = this.u, sa = this.safe, iw = this.iw, ih = this.ih;
    const band = this.band;
    const inkC = band ? '#f4ead6' : pal.ink, subC = band ? '#b8a890' : pal.wash;
    const pad = 16 * Math.min(1.75, u), L = Math.max(pad + sa.l, band ? 0 : v.ox + pad), R = Math.min(iw - pad - sa.r, band ? iw : v.ox + v.vw * v.s - pad), T = sa.t;
    x.textBaseline = 'middle';
    // top-left: stage
    x.textAlign = 'left';
    x.font = `${Math.round(28 * u)}px ${DISPLAY}`; x.fillStyle = inkC;
    x.fillText(this.endless ? `WAVE ${Math.max(1, this.wave)}` : this.stage.boss ? `BOSS · ${this.stageN}` : `STAGE ${this.stageN}`, L, T + 28 * u);
    x.font = `${Math.round(15 * u)}px ${DISPLAY}`; x.fillStyle = subC;
    x.fillText(this.endless ? `BEST ${this.save.endless}` : CHAPTERS[this.stage.chapter].name.toUpperCase(), L + 2, T + 54 * u);
    // coins, under the stage name
    const cs = 1 + this.coinPulse * 0.25, cy = T + 82 * u;
    drawCoin(x, L + 10 * u, cy, 9 * u * cs, band ? '#16120f' : pal.dark ? '#16120f' : pal.ink);
    x.font = `${Math.round(20 * u * cs)}px ${DISPLAY}`; x.fillStyle = inkC;
    x.fillText(`${this.coinShown}`, L + 25 * u, cy + 1);
    this.coinAnchor = { x: L + 10 * u, y: cy };
    // top-right: time or score
    x.textAlign = 'right'; x.font = `${Math.round(28 * u)}px ${DISPLAY}`; x.fillStyle = inkC;
    x.fillText(this.endless ? `${this.score}` : this.clock.toFixed(2), R, T + 28 * u);
    x.font = `${Math.round(15 * u)}px ${DISPLAY}`; x.fillStyle = subC;
    if (!this.endless) x.fillText(`PAR ${this.stage.par.toFixed(1)}  ·  ${this.kills}/${this.total}`, R, T + 54 * u);
    else x.fillText('SCORE', R, T + 54 * u);
    // flying coins (screen space, they arc up to the counter)
    for (const c of this.flyCoins) {
      if (c.t < 0) continue;
      const k = Math.min(1, c.t / c.d), e = k * k * (3 - 2 * k);
      const tx = this.coinAnchor.x, ty = this.coinAnchor.y;
      const cx2 = c.x0 + (tx - c.x0) * e + Math.sin(Math.PI * k) * c.arc, cy2 = c.y0 + (ty - c.y0) * e - Math.sin(Math.PI * k) * 60;
      drawCoin(x, cx2, cy2, (7 + 4 * Math.sin(Math.PI * k)) * Math.max(0.8, u), '#16120f');
    }
    // combo
    const comboY = T + 56 + 34 * u;
    if (this.combo >= 2) {
      const s = 1 + this.comboPop * 0.5;
      x.save(); x.translate(iw / 2, comboY); x.scale(s * u, s * u);
      x.textAlign = 'center';
      x.font = `64px ${BRUSH}`; x.lineWidth = 8; x.strokeStyle = band ? '#16120f' : pal.paper; x.strokeText(`${this.combo}`, -18, 0);
      x.fillStyle = pal.accent; x.fillText(`${this.combo}`, -18, 0);
      x.font = `34px ${BRUSH}`; x.fillStyle = inkC; x.fillText('連', 40, 6);
      x.restore();
      x.textAlign = 'center'; x.font = `${Math.round(14 * u)}px ${DISPLAY}`; x.fillStyle = inkC;
      x.fillText(this.combo >= this.total && !this.endless ? 'PERFECT CHAIN' : 'CHAIN', iw / 2, comboY + 42 * u);
    }
    // boss health: a brush bar along the bottom
    if (this.boss && this.boss.alive && this.intro <= 0) {
      const b = this.boss, bw = Math.min(560, iw * 0.62), bx = iw / 2 - bw / 2, by = band ? v.oy + H * v.s + 34 : ih - sa.b - 34 * u;
      x.textAlign = 'center'; x.font = `${Math.round(18 * Math.min(u, 1.2))}px ${DISPLAY}`;
      x.lineWidth = 5; x.strokeStyle = '#16120f'; x.strokeText(b.cfg.name.toUpperCase(), iw / 2, by - 18); x.fillStyle = '#f4ead6'; x.fillText(b.cfg.name.toUpperCase(), iw / 2, by - 18);
      x.fillStyle = '#16120f'; x.fillRect(bx - 4, by - 4, bw + 8, 18);
      const segW = bw / b.maxHp;
      for (let k = 0; k < b.maxHp; k++) { x.fillStyle = k < b.hp ? (b.flash > 0 ? '#fffaf0' : pal.accent) : '#3a3028'; x.fillRect(bx + k * segW + 1, by, segW - 2, 10); }
      x.fillStyle = '#f4ead6';
      for (let k = 1; k < b.cfg.phases; k++) { const px = bx + bw * (1 - k / 3); x.fillRect(px - 1, by - 6, 2, 22); }
    }
    // offscreen enemies (portrait): a red chevron on the edge they're past
    if (v.vw < W - 1) {
      for (const e of this.enemies) {
        if (!e.alive || e.spawn > 0) continue;
        const sx = v.ox + (e.x - this.camX) * v.s;
        if (sx > v.ox - 4 && sx < v.ox + v.vw * v.s + 4) continue;
        const left = sx < v.ox, ex = left ? v.ox + 12 : v.ox + v.vw * v.s - 12, ey = clamp(v.oy + this.ecy(e) * v.s, v.oy + 20, v.oy + H * v.s - 20);
        const danger = e.atk || e.cast || (e.type === 'archer' && e.shootT < 0.8);
        x.fillStyle = danger ? pal.accent : band ? '#f4ead6' : pal.ink; x.globalAlpha = danger ? 1 : 0.7;
        x.beginPath(); x.moveTo(ex + (left ? -8 : 8), ey); x.lineTo(ex + (left ? 6 : -6), ey - 9); x.lineTo(ex + (left ? 6 : -6), ey + 9); x.closePath(); x.fill();
        x.globalAlpha = 1;
      }
    }
    // tutorial tip
    if (this.stage.tip && this.tipFade > 0 && !this.endless) {
      const fs = Math.round(clamp(22 * (band ? u : v.s), 14, 30));
      x.font = `${fs}px ${DISPLAY}`; x.textAlign = 'center';
      const lines = wrap(x, this.stage.tip, Math.min(iw - 32 - sa.l - sa.r, W * v.s * 0.85));
      const y0 = band ? v.oy - 18 - (lines.length - 1) * fs * 1.2 : v.oy + 168 * v.s;
      x.globalAlpha = this.tipFade;
      lines.forEach((ln, i) => {
        x.lineWidth = 6; x.strokeStyle = band ? '#16120f' : pal.paper; x.strokeText(ln, iw / 2, y0 + i * fs * 1.2);
        x.fillStyle = inkC; x.fillText(ln, iw / 2, y0 + i * fs * 1.2);
      });
      x.globalAlpha = 1;
    }
    const cxs = iw / 2, cys = v.oy + H * v.s / 2, ks = Math.max(v.s, 0.62);
    // stage intro card
    if (this.intro > 0) {
      const k = Math.min(1, this.intro * 3);
      x.globalAlpha = k;
      const ch = CHAPTERS[this.stage.chapter];
      stamp(x, cxs, cys - 30 * ks, 120 * ks, this.endless ? '戦' : this.stage.boss ? this.stage.boss.kanji : ch.kanji, pal.accent, pal.paper, -0.1);
      x.textAlign = 'center'; x.font = `${Math.round(44 * ks)}px ${DISPLAY}`; x.fillStyle = pal.ink;
      x.lineWidth = 6; x.strokeStyle = pal.paper;
      const title = this.endless ? 'ENDLESS' : this.stage.boss ? this.stage.boss.name.toUpperCase() : `STAGE ${this.stageN}`;
      x.strokeText(title, cxs, cys + 70 * ks); x.fillText(title, cxs, cys + 70 * ks);
      if (!this.endless && (this.introMax > 1 || this.stageN === 1)) {
        x.font = `${Math.round(20 * ks)}px ${DISPLAY}`;
        const sub = this.stage.boss ? `STAGE ${this.stageN} · ${ch.name.toUpperCase()}` : `CHAPTER ${this.stage.chapter + 1} · ${ch.name.toUpperCase()}`;
        x.strokeText(sub, cxs, cys + 110 * ks); x.fillText(sub, cxs, cys + 110 * ks);
      }
      x.globalAlpha = 1;
    }
    // clear stamp
    if (this.clearT > 0 && this.clearT < CLEAR_T - 0.2) {
      const k = Math.min(1, (CLEAR_T - 0.2 - this.clearT) * 5);
      const sz = (200 + (1 - k) * 260) * ks;
      x.globalAlpha = Math.min(1, k * 1.5);
      stamp(x, cxs, cys - 20 * ks, sz, '斬', pal.accent, pal.paper, -0.14);
      x.globalAlpha = 1;
    }
    if (!p.alive && this.deadT > 0) {
      x.globalAlpha = Math.min(1, (1 - this.deadT) * 4) * 0.5; x.fillStyle = pal.accent; x.fillRect(0, 0, iw, ih); x.globalAlpha = 1;
      x.textAlign = 'center'; x.font = `${Math.round(56 * ks)}px ${DISPLAY}`; x.fillStyle = pal.ink;
      x.lineWidth = 8; x.strokeStyle = pal.paper;
      const msg = { fell: 'FELL!', arrow: 'SHOT!', burned: 'BURNED!', wave: 'CRUSHED!' }[this.deathWhy] || 'CUT DOWN!';
      x.strokeText(msg, cxs, cys); x.fillText(msg, cxs, cys);
      if (!this.endless) { x.font = `${Math.round(20 * ks)}px ${DISPLAY}`; x.strokeText('again...', cxs, cys + 46 * ks); x.fillText('again...', cxs, cys + 46 * ks); }
    }
  }

  /*DEV*/
  // Key art for the store covers (?cover=1): a frozen mid-dash moment, no HUD.
  coverScene() {
    this.cover = true; this.coverFit = true;
    this.setOutfit({ hat: 'hachimaki', robe: 'crimson', sash: 'black', scarf: 'flame', blade: 'crimson' });
    this.stageN = 41;
    const st = buildStage(41);
    st.vents = []; st.tip = null;
    st.enemies = [
      { type: 'grunt', x: 700, y: FLOOR, face: -1 },
      { type: 'shield', x: 1010, y: FLOOR, face: -1 },
      { type: 'flyer', x: 860, y: 300, phase: 1 },
      { type: 'archer', x: 330, y: FLOOR, face: 1 },
    ];
    st.plats = [];
    st.floor = [[0, W]];
    this.loadStage(st, false);
    this.mode = 'play';
    this.intro = 0;
    this.ui.hud(false);
    this.resize();
    const p = this.player;
    p.x = 560; p.y = 430; p.onGround = false; p.face = 1;
    p.dash = { dx: 0.93, dy: -0.37, left: 200, hit: new Set(), trail: null };
    p.ghosts = [0.04, 0.08, 0.12, 0.16].map((t) => ({ x: p.x - t * 900, y: p.y + t * 360, rot: Math.atan2(-0.37, 0.93), face: 1, life: 0.2 - t }));
    this.trails.push({ pts: [{ x: 300, y: 500 }, { x: p.x, y: p.y - 36 }], life: 0.18, max: 0.22 });
    const victim = this.enemies[0];
    this.kill(victim, 0.93, -0.37, false);
    this.combo = 3;
    this.halves.forEach((h) => { h.x += h.vx * 0.12; h.y += h.vy * 0.12; h.rot = h.vr * 0.12; });
    splat(this.dctx, 720, 560, 24, this.pal.accent, 1, -0.3);
    splat(this.dctx, 820, 600, 12, this.pal.accent, 1, 0);
    for (let k = 0; k < 40; k++) this.updateScarf(1 / 60);
    this.flyCoins = []; this.texts = [];
    this.camX = clamp(640 - this.view.vw / 2, 0, W - this.view.vw);
    document.body.classList.add('cover');
  }
  /*END-DEV*/
}

function wrap(x, text, maxW) {
  const words = text.split(' '), out = [];
  let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}

// boot: the SDK first (so saves come from the portal's data module), then the game
await initPlatform();
platform.loadingStart();
new Game(loadSave());
