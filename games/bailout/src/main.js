// BAILOUT - a ragdoll stunt-bike racer. Two inputs: gas and brake. In the air
// gas spins you backward and brake spins you forward. Every full flip takes
// 1 s off your time; land on your head and the rider goes flying.
import { Bike, Ragdoll, DT, GRAV, predictLanding } from './physics.js';
import { BIKE, BIKES, HELMET, SUIT, HELMETS, SUITS, riderPose } from './bikes.js';
import { LEVELS, MEDALS, MEDAL_COLS, medalFor, THEMES, WORLDS, buildLevel, buildDaily, dailyInfo, EndlessGen } from './levels.js';
import { World } from './world.js';
import { Backdrop } from './backdrop.js';
import { drawTerrain, drawProps, drawLava, drawLoops, drawObjects, drawCheckpoint, drawBike, drawRagdoll, setLineWidth } from './draw.js';
import { FX, outlined } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { TROPHIES, unlockedTrophies } from './trophies.js';
import { clamp, wrapAngle, TAU, fmtTime, mix, OUTLINE } from './util.js';

const SAVE_KEY = 'pd.bailout';
const params = new URLSearchParams(location.search);
const RESPAWN_DELAY = 1.6;   // seconds (real time) from bailout to checkpoint respawn; any input after 0.3 s skips
const SLOWMO = 0.3, SLOWMO_T = 0.55;
const CRASH_ZOOM = 1.4, CRASH_ZOOM_T = 1.3;
const HINTS = { release: 'LET GO IN THE AIR - THE BIKE LEVELS ITSELF', flip: 'IN THE AIR: TAP + HOLD GAS TO BACKFLIP' };
const CLEAN_DEG = 25;
const FLIP_NAMES = ['', 'FLIP!', 'DOUBLE!', 'TRIPLE!', 'QUAD!', 'QUINTUPLE!', 'INSANE!'];
const OOFS = ['OOF!', 'BAILOUT!', 'OUCH!', 'YIKES!', 'BONK!', 'WHOOPS!', 'NOPE!', 'OWIE!'];
const PX_PER_M = 40;

function defaultSave() {
  return { v: 1, coins: 0, levels: {}, bike: 'dirt', owned: { dirt: 1 }, helmet: 'classic', suit: 'rookie', ownedH: { classic: 1 }, ownedS: { rookie: 1 },
    daily: { day: 0, best: null, runs: [], streak: 0, lastDay: 0, rewarded: 0, hist: [] }, endless: { best: 0 },
    gallery: { bailouts: 0, air: 0, slide: 0, flips: 0, combo: 0, tnt: 0, lava: 0, boulder: 0, speed: 0, runs: 0, clean: 0 },
    tut: { release: 0, flip: 0 }, trophies: {},
    ghosts: {}, music: 0.55, sfx: 0.9, muted: false, pedals: false };
}
// older saves (same version) may lack newer sub-objects
function upgradeSave(s) {
  const d = defaultSave();
  for (const k of ['daily', 'gallery', 'tut']) s[k] = Object.assign(d[k], s[k] || {});
  s.trophies = s.trophies || {};
  return s;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = defaultSave();
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && s.v === 1) this.save = upgradeSave(Object.assign(defaultSave(), s)); } catch (e) { /* storage blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx; this.audio.muted = this.save.muted;
    this.fx = new FX();
    this.keys = new Set();
    this.pointers = new Map();
    this.mode = 'title';
    this.paused = false;
    this.t = 0; this.acc = 0;
    this.cam = { x: 0, y: 0, y0: 0, zoom: 1, punch: 0, shake: 0, sx: 0, sy: 0 };
    this.timeScale = 1; this.slowT = 0; this.hitstop = 0;
    this.bot = null;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.showPedals = this.coarse || this.save.pedals;
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();
    window.__G = this;
    if (params.has('bot')) this.bot = { flips: params.get('bot') === 'flips' };
    const lv = params.get('level');
    if (params.has('play') || lv != null) this.startLevel(lv != null ? clamp(+lv - 1, 0, 39) : this.nextLevel());
    else if (params.has('daily')) this.startDaily();
    else if (params.has('endless')) this.startEndless();
    else this.toTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  get look() { return { helmet: HELMET[this.save.helmet] || HELMETS[0], suit: SUIT[this.save.suit] || SUITS[0] }; }
  nextLevel() { for (let i = 0; i < LEVELS.length; i++) if (!this.save.levels[i]) return i; return LEVELS.length - 1; }
  unlocked(i) { return i === 0 || !!this.save.levels[i - 1] || !!params.get('unlock'); }
  allGold() { return LEVELS.every((l, i) => this.save.levels[i] && this.save.levels[i].medal >= 3); }
  trophyCount() { return unlockedTrophies(this.save).length; }
  bikeOwned(id) { return id === 'rocket' ? this.allGold() || !!this.save.owned.rocket : !!this.save.owned[id]; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.portrait = this.H > this.W * 1.1;
    // portrait phones: scale by width so the bike stays readable (the speed zoom-out keeps the look-ahead)
    this.base = this.portrait ? Math.max(Math.min(this.H / 660, this.W / 900), this.W / 560) : Math.min(this.H / 660, this.W / 900);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const cv = this.canvas;
    const side = (e) => (e.clientX > this.W / 2 ? 'gas' : 'brake');
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.pointerType === 'mouse' && !this.showPedals) { this.showPedals = true; }
      this.pointers.set(e.pointerId, side(e));
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.anyInput();
    });
    cv.addEventListener('pointermove', (e) => { if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, side(e)); });
    const up = (e) => this.pointers.delete(e.pointerId);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open) { this.ui.back(); return; }
        if (this.mode === 'play') { this.pause(); return; }
      }
      if (this.ui.open) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.ui.primary(); } else if (e.code === 'KeyR' && this.ui.panel === 'result') this.ui.act('retry'); return; }
      if (this.mode !== 'play') return;
      if (e.code === 'KeyR') { this.restart(); return; }
      if (e.code === 'Enter') { this.respawn(true); return; }
      this.anyInput();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); if (this.mode === 'play' && !this.ui.open) this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play' && !this.ui.open) this.pause(); });
  }
  anyInput() {
    const r = this.run;
    if (this.mode === 'play' && r && !r.bike.riderOn && r.crashT > 0.3 && r.kind !== 'endless') this.respawn();
  }
  input() {
    if (this.bot && this.run) return this.botInput();
    let gas = false, brake = false;
    const k = this.keys;
    if (k.has('ArrowRight') || k.has('KeyD') || k.has('ArrowUp') || k.has('KeyW')) gas = true;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('ArrowDown') || k.has('KeyS')) brake = true;
    for (const v of this.pointers.values()) { if (v === 'gas') gas = true; else brake = true; }
    return { gas, brake };
  }

  // ------------------------------------------------------------------ runs
  makeRun(kind, res, themeKey, extra = {}) {
    const fxApi = this.fxApi();
    const world = new World(res, themeKey, fxApi, { gen: extra.gen });
    const spec = BIKE[this.save.bike] && this.bikeOwned(this.save.bike) ? BIKE[this.save.bike] : BIKE.dirt;
    const bike = new Bike(spec);
    bike.airMul = extra.airMul || 1;
    const sx = world.startX;
    bike.place(sx, world.terrain.surfaceY(sx), world.terrain.slopeAt(sx));
    if (!this.backdrop || this.backdrop.key !== themeKey) this.backdrop = new Backdrop(themeKey, THEMES[themeKey]);
    const r = { kind, world, bike, ragdoll: null, time: 0, started: false, done: false, bonus: 0, flips: 0, bailouts: 0, cp: -1, airRot: 0, airFlips: 0, airT: 0,
      crashT: 0, pendingBank: null, landWait: 0, ghostRec: [], ghostPlay: null, recT: 0, maxCombo: 0, lostMedal: 0, medalAnim: 0, medalIdx: -1, finishT: 0, burnt: false, distance: 0, theme: THEMES[themeKey], themeKey, spec,
      hints: res.hints || [], props: res.props || [], hint: null, showTargets: false, ...extra };
    this.run = r;
    this.cam.x = bike.c.x + 200; this.cam.y = bike.c.y - 60; this.cam.y0 = this.cam.y; this.cam.zoom = 1; this.cam.punch = 0;
    this.fx.clear();
    this.timeScale = 1; this.slowT = 0; this.acc = 0;
    this.audio.setSong(THEMES[themeKey].music);
    return r;
  }
  startLevel(i) {
    this.ui.close();
    const L = LEVELS[i];
    const res = buildLevel(i);
    // medal targets are shown on the HUD only once the level has been finished once
    const r = this.makeRun('level', res, L.world, { levelId: i, medals: MEDALS[i] || estimateMedals(res, L), airMul: L.airMul, showTargets: !!this.save.levels[i] });
    const g = this.save.ghosts[i];
    if (g) r.ghostPlay = decodeGhost(g);
    this.mode = 'play'; this.paused = false;
    this.ui.hud(true);
  }
  startDaily() {
    this.ui.close();
    const info = dailyInfo();
    const res = buildDaily(info.day);
    const D = this.save.daily;
    this.makeRun('daily', res, res.world, { day: info.day, medals: estimateMedals(res, { flips: 6 }), showTargets: D.day === info.day && !!D.best });
    this.mode = 'play'; this.paused = false; this.ui.hud(true);
  }
  startEndless() {
    this.ui.close();
    const seed = (Math.random() * 1e9) | 0;
    const gen = new EndlessGen(seed);
    gen.extend(6000);
    const b = gen.b;
    const res = { terrain: b.T, objs: b.objs, cps: [], pits: b.pits, fans: b.fans, finish: Infinity, startX: b.startX };
    this.makeRun('endless', res, 'glacier', { gen });
    this.run.world.cps = [];
    this.mode = 'play'; this.paused = false; this.ui.hud(true);
  }
  restart() {
    const r = this.run;
    if (!r) return;
    this.audio.play('respawn');
    if (r.kind === 'level') this.startLevel(r.levelId);
    else if (r.kind === 'daily') this.startDaily();
    else if (r.kind === 'endless') this.startEndless();
  }
  toTitle() {
    this.mode = 'title';
    this.paused = false;
    // attract mode: the autopilot does flips (and occasionally eats dirt) behind the menu
    const demo = [1, 9, 18, 26, 33][Math.floor(Math.random() * 5)];
    this.makeRun('demo', buildLevel(demo), LEVELS[demo].world, { levelId: demo, medals: [0, 0, 0, 0] });
    this.run.started = true;
    this.ui.hud(false);
    this.ui.show('title');
  }
  pause() { if (this.mode !== 'play' || this.ui.open) return; this.audio.play('click'); this.ui.show('pause'); }

  fxApi() {
    const g = this;
    return {
      thud: (x, y, v) => { g.fx.dust(x, y, 6 + v * 8, g.run ? g.run.theme.top2 : '#fff', 0.8 + v); g.sfxAt('thud', x, v); },
      shake: (n) => { g.cam.shake = Math.max(g.cam.shake, n); },
      sfx: (n, x) => g.sfxAt(n, x, 1),
      chips: (x, y, col) => g.fx.debris(x, y, 6, [col, '#7a4a24'], 0.4),
      smash: (x, y) => { g.fx.debris(x, y, 14, ['#d99a55', '#9a6232', '#e8b070'], 0.9); g.fx.dust(x, y, 10, '#e8c79a', 1.4); g.sfxAt('smash', x, 1); g.cam.shake = Math.max(g.cam.shake, 6); g.hitstop = Math.max(g.hitstop, 0.04); },
      explode: (x, y) => g.explosion(x, y),
      shatter: (x, y, r) => { const k = g.run ? g.run.themeKey : ''; const c = k === 'volcano' ? ['#4b3f4a', '#ff6a2a', '#2a2431'] : k === 'glacier' ? ['#e9f7ff', '#9be7ff'] : ['#a0684a', '#7a4a32']; g.fx.debris(x, y + r * 0.5, 12, c, 0.8); g.fx.dust(x, y + r, 12, g.run ? g.run.theme.top2 : '#fff', 1.5); g.sfxAt('smash', x, 1); g.sfxAt('thud', x, 1); g.cam.shake = Math.max(g.cam.shake, 8); },
      pop: (t, x, y, c) => g.fx.pop(t, x, y, c, 30),
    };
  }
  sfxAt(n, x, v) {
    if (!this.run || this.mode === 'title') return;
    const d = x == null ? 0 : Math.abs(x - this.run.bike.c.x);
    if (d > 1600) return;
    this.audio.play(n, v * (1 - d / 2000));
  }
  explosion(x, y) {
    const r = this.run;
    this.fx.fire(x, y, 26); this.fx.ring(x, y, '#fff1a8', 220); this.fx.debris(x, y, 12, ['#e8433a', '#2b2b3d', '#ffd23f'], 1.2);
    this.cam.shake = Math.max(this.cam.shake, 22); this.hitstop = 0.07; this.flash = 0.35;
    this.sfxAt('boom', x, 1);
    if (!r) return;
    const b = r.bike, dx = b.c.x - x, dy = b.c.y - y, d = Math.hypot(dx, dy);
    if (d < 260) {
      const k = (1 - d / 260);
      const kx = (dx / (d || 1)) * 700 * k, ky = -900 * k - 300;
      b.c.vx += kx; b.c.vy += ky; b.c.w += (Math.random() - 0.5) * 12 * k;
      for (const w of b.wh) { w.vx += kx; w.vy += ky; }
      if (r.ragdoll) r.ragdoll.kick(kx * 1.2, ky * 1.3, (Math.random() - 0.5) * 10);
    }
  }

  // ------------------------------------------------------------------ simulation
  step(dt) {
    const r = this.run, b = r.bike, w = r.world;
    const inp = r.done ? { gas: false, brake: r.finishT > 0.4 } : this.mode === 'title' ? this.botInput() : this.input();
    if (!r.started && (inp.gas || inp.brake)) { r.started = true; this.audio.play('go'); }
    if (r.started && !r.done && r.kind !== 'demo') r.time += dt;
    w.update(dt, b);
    const wasAir = b.air;
    b.step(dt, inp, w);
    // --- events: landings, scrapes, suspension bottoming
    for (const ev of b.events) {
      if (ev.t === 'touch' && ev.impact > 220) {
        const v = Math.min(1, ev.impact / 1100);
        this.fx.dust(ev.x, ev.y, 4 + v * 10, ev.seg.kind === 'ice' ? '#ffffff' : r.theme.top2, 0.6 + v, b.c.vx);
        if (v > 0.25) this.audio.play('land', v);
        if (v > 0.55) this.cam.shake = Math.max(this.cam.shake, v * 7);
      } else if (ev.t === 'scrape') {
        if (Math.random() < 0.5) this.fx.sparks(ev.x, ev.y, 2, b.c.vx, b.c.vy);
        if (Math.random() < 0.2) this.audio.play('scrape', Math.min(1, ev.v / 600));
      } else if (ev.t === 'bottom') {
        this.audio.play('thud', 0.4);
      }
    }
    // --- air time, flips, landings
    if (b.riderOn) {
      if (b.air > 0.06) {
        r.airT += dt;
        r.airRot += b.c.w * dt;
        const n = Math.floor((Math.abs(r.airRot) + 0.6) / TAU);
        if (n > r.airFlips) {
          r.airFlips = n;
          const name = n === 1 ? (r.airRot < 0 ? 'BACKFLIP!' : 'FRONTFLIP!') : FLIP_NAMES[Math.min(n, 6)];
          this.fx.pop(name, b.c.x, b.c.y - 90, n >= 3 ? '#ff5ad2' : n === 2 ? '#2ef2ff' : '#ffd23f', 34 + n * 6, 1.1);
          this.audio.play('flip', 1 + n * 0.15);
        }
      } else if (wasAir > 0.25) {
        // first touch after a real jump: judge the landing over the next instant
        r.landWait = 0.18; r.landAir = r.airT; r.landFlips = r.airFlips; r.landDir = r.airRot;
        r.airRot = 0; r.airFlips = 0; r.airT = 0;
      } else if (b.air === 0) { r.airRot = 0; r.airFlips = 0; r.airT = 0; }
      if (r.landWait > 0) {
        r.landWait -= dt;
        const both = b.wh.every((q) => q.air === 0);
        if (both || r.landWait <= 0) {
          const n = b.wh[0].surfN;
          const tangent = Math.atan2(n[1], n[0]) + Math.PI / 2;
          const diff = Math.abs(wrapAngle(b.c.a - tangent)) * 180 / Math.PI;
          const clean = both && diff < CLEAN_DEG;
          if (r.landFlips > 0) r.pendingBank = { n: r.landFlips, t: 0.22, clean };
          // tutorial: a clean no-flip landing after a real jump teaches "let go in the air"
          // (only landings at or past the hint spot count, so a hop on the rollers before it does not)
          if (clean && r.landAir > 0.3 && !r.landFlips && r.kind !== 'demo' && !this.save.tut.release) {
            const hn = r.hints.find((q) => q.kind === 'release');
            if (!hn || b.c.x > hn.x) { this.save.tut.release = 1; this.persist(); }
          }
          if (clean && r.landAir > 0.4) {
            b.boost = 0.9;
            this.fx.pop(r.landFlips ? 'PERFECT!' : 'CLEAN!', b.c.x + 40, b.c.y - 60, '#7dff6a', r.landFlips ? 34 : 26, 0.9);
            this.audio.play('perfect');
            const ca = Math.cos(b.c.a), sa = Math.sin(b.c.a), kick = 110;
            b.c.vx += ca * kick; b.c.vy += sa * kick; for (const q of b.wh) { q.vx += ca * kick; q.vy += sa * kick; }
          }
          r.landWait = 0;
        }
      }
      if (r.pendingBank) {
        r.pendingBank.t -= dt;
        if (r.pendingBank.t <= 0) this.bankFlips(r.pendingBank.n);
      }
    }
    // --- in-world hints: shown approaching the spot until the player has done the thing once
    r.hint = null;
    if (b.riderOn && !r.done && r.kind !== 'demo') {
      for (const hn of r.hints) {
        if (this.save.tut[hn.kind]) continue;
        if (b.c.x > hn.x - 700 && b.c.x < hn.x + 600) { r.hint = hn.kind; break; }
      }
    }
    // --- bail checks
    if (b.riderOn && !r.done) {
      const cause = b.crash || w.interact(b);
      if (cause) this.bail(cause);
    }
    if (r.ragdoll) {
      r.ragdoll.step(dt, w);
      for (const im of r.ragdoll.impacts) {
        if (im.v > 420 && Math.random() < 0.6) { this.audio.play('bonk', 0.7 + Math.random() * 0.6); this.fx.dust(im.x, im.y, 4, r.theme.top2, 0.6); }
        if (im.k === 0 && im.v > 600) { this.fx.pop('★', im.x, im.y - 20, '#ffd23f', 26, 0.6); }
      }
      if (r.burnt && Math.random() < 0.3) this.fx.smoke(r.ragdoll.p[0].x, r.ragdoll.p[0].y - 10);
    }
    // --- checkpoints + finish
    if (b.riderOn && !r.done) {
      const cps = w.cps;
      for (let i = r.cp + 1; i < cps.length; i++) {
        if (b.c.x > cps[i].x) {
          r.cp = i; cps[i].anim = 1;
          if (r.kind !== 'demo') { this.audio.play('checkpoint'); this.fx.pop('CHECKPOINT', cps[i].x, cps[i].y - 150, '#7dff6a', 22, 1.0); this.fx.confetti(cps[i].x, cps[i].y - 120, 14); }
        }
      }
      if (r.kind !== 'endless' && b.c.x >= w.finish) this.finish();
      if (r.kind === 'endless') r.distance = Math.max(r.distance, (b.c.x - w.startX) / PX_PER_M);
    }
    if (r.done) r.finishT += dt;
    // --- ghost recording (20 Hz)
    if (r.started && !r.done && r.kind === 'level') {
      r.recT += dt;
      if (r.recT >= 0.05) { r.recT -= 0.05; r.ghostRec.push(Math.round(b.c.x), Math.round(b.c.y), Math.round(b.c.a * 100), b.riderOn ? 1 : 0); }
    }
    // exhaust puffs + speed lines
    if (b.riderOn && inp.gas && !b.spec.pedal && Math.random() < 0.35) {
      const p = b.toWorld(-48, -8, [0, 0]);
      this.fx.smoke(p[0], p[1], b.boost > 0 ? 'rgba(255,170,60,0.7)' : 'rgba(90,90,110,0.35)');
    }
    if (b.speed > 950 && Math.random() < 0.5) this.fx.speedline(b.c.x + (Math.random() - 0.5) * 300, b.c.y + (Math.random() - 0.5) * 200, b.c.vx, b.c.vy);
  }

  bankFlips(n) {
    const r = this.run, b = r.bike;
    r.pendingBank = null;
    if (!b.riderOn) return;
    r.flips += n; r.maxCombo = Math.max(r.maxCombo, n);
    if (r.kind === 'demo') return;
    this.save.gallery.flips += n; this.save.gallery.combo = Math.max(this.save.gallery.combo, n);
    if (!this.save.tut.flip) { this.save.tut.flip = 1; this.persist(); }
    this.audio.play('bank');
    const sp = this.worldToScreen(b.c.x, b.c.y - 70);
    const add = n;
    this.fx.fly('-' + add.toFixed(1) + 's', sp[0], sp[1], 90, 34, '#ffd23f', () => { r.bonus += add; r.bonusFlash = 0.5; this.audio.play('coin'); });
  }

  bail(cause) {
    const r = this.run, b = r.bike;
    if (!b.riderOn) return;
    b.riderOn = false;
    const rd = r.ragdoll = new Ragdoll(b);
    r.burnt = cause === 'lava';
    const sp = b.speed, c = b.c;
    if (cause === 'lava') { rd.kick(c.vx * 0.3, -950, (Math.random() - 0.5) * 8); this.audio.play('sizzle'); this.fx.fire(c.x, c.y + 10, 10); }
    else if (cause === 'tnt') { rd.kick(250 + c.vx * 0.2, -1000, (Math.random() - 0.5) * 14); }
    else if (cause === 'fell') { rd.kick(c.vx * 0.15, -120, c.w * 0.4); }
    // a normal head-plant launches the rider forward over the bars, scaled by speed, spinning with the bike
    else rd.kick(c.vx * 0.6 + 60, -300 - sp * 0.5, c.w * 0.8 + (Math.random() - 0.5) * 4);
    r.crashT = 0; r.bailouts++;
    (r.log || (r.log = [])).push([Math.round(b.c.x), cause]);
    r.pendingBank = null; r.airRot = 0; r.airFlips = 0;
    if (r.kind !== 'demo') {
      const G = this.save.gallery; G.bailouts++; if (cause === 'tnt') G.tnt++; if (cause === 'lava') G.lava++; if (cause === 'boulder') G.boulder++;
    }
    this.slowT = SLOWMO_T; this.cam.punch = 1; this.cam.shake = Math.max(this.cam.shake, 12); this.hitstop = 0.05;
    this.audio.play('crash');
    this.audio.voice(['oof', 'ow', 'ugh', 'whoa'][Math.floor(Math.random() * 4)], 0.9 + Math.random() * 0.3);
    // the OOF goes above the whole body (not over the helmet) and a little ahead, where he is flying
    const h = rd.p[0];
    let top = Infinity, cx = 0; for (const q of rd.p) { top = Math.min(top, q.y); cx += q.x / rd.p.length; }
    this.fx.pop(OOFS[Math.floor(Math.random() * OOFS.length)], cx + c.vx * 0.12, top - 58, '#ff5a4a', 40, 1.0);
    this.fx.dust(h.x, h.y, 10, r.theme.top2, 1.3);
    if (r.kind === 'endless') r.endT = 1.6;
  }

  respawn(manual) {
    const r = this.run, b = r.bike, w = r.world;
    if (r.done) return;
    if (manual && b.riderOn) { r.bailouts++; }
    this.recordRagdoll();
    if (r.kind === 'endless') { if (manual) this.endEndless(); return; }
    const cp = r.cp >= 0 ? w.cps[r.cp] : null;
    let x = cp ? cp.x + 20 : w.startX;
    let y = w.terrain.surfaceY(x);
    if (!isFinite(y)) { x = w.startX; y = w.terrain.surfaceY(x); }
    w.reset(x);
    for (let i = 0; i <= r.cp; i++) w.cps[i].anim = 1;
    b.place(x, y, w.terrain.slopeAt(x));
    r.ragdoll = null; r.burnt = false; r.landWait = 0; r.pendingBank = null; r.airRot = 0; r.airFlips = 0;
    this.cam.punch = 0; this.slowT = 0; this.timeScale = 1;
    this.fx.ring(b.c.x, b.c.y, '#ffffff', 90); this.fx.dust(b.c.x, y, 8, r.theme.top2, 1);
    this.audio.play('respawn');
  }
  recordRagdoll() {
    const r = this.run;
    if (!r || !r.ragdoll || r.kind === 'demo') return;
    const G = this.save.gallery, rd = r.ragdoll;
    G.air = Math.max(G.air, rd.bestAir); G.slide = Math.max(G.slide, rd.slide / PX_PER_M); G.speed = Math.max(G.speed, rd.maxSpeed / PX_PER_M);
    this.persist();
  }

  finish() {
    const r = this.run, b = r.bike;
    r.done = true; r.finishT = 0;
    if (r.pendingBank) this.bankFlips(r.pendingBank.n);
    this.fx.confetti(b.c.x + 100, b.c.y - 120, 60);
    this.audio.play('finish');
    if (r.kind === 'demo') { setTimeout(() => { if (this.run === r && this.mode === 'title') this.toTitleDemoNext(); }, 1500); return; }
    setTimeout(() => this.showResult(), 1300);
  }
  toTitleDemoNext() { const keep = this.ui.panel; this.toTitle(); if (keep && keep !== 'title') this.ui.show(keep); }

  showResult() {
    const r = this.run;
    if (this.run !== r || !r.done) return;
    // fly-in bonuses that are still travelling count too
    const pend = this.fx.flyers.length; this.fx.flyers.forEach((f) => f.onArrive && f.onArrive()); this.fx.flyers.length = 0;
    const final = Math.max(0, r.time - r.bonus);
    const S = this.save;
    const res = { kind: r.kind, time: final, raw: r.time, bonus: r.bonus, flips: r.flips, bailouts: r.bailouts, combo: r.maxCombo, coins: 0, medals: r.medals, pend };
    const medal = medalFor(final, r.medals);
    res.medal = medal;
    const trophiesBefore = this.trophyCount();
    let coins = 5 + Math.min(20, r.flips * 2);
    if (r.kind === 'level') {
      const id = r.levelId, prev = S.levels[id] || null;
      res.prevMedal = prev ? prev.medal : 0;
      res.prevBest = prev ? prev.best : null;
      const MC = [0, 15, 35, 70, 110];
      if (medal > res.prevMedal) coins += MC[medal] - MC[res.prevMedal];
      res.newBest = !prev || final < prev.best;
      S.levels[id] = { best: res.newBest ? final : prev.best, medal: Math.max(medal, res.prevMedal), flips: Math.max(r.flips, prev ? prev.flips || 0 : 0), clean: (prev && prev.clean) || r.bailouts === 0 ? 1 : 0 };
      if (r.bailouts === 0) S.gallery.clean++;
      if (res.newBest && r.ghostRec.length) S.ghosts[id] = encodeGhost(r.ghostRec);
      res.best = S.levels[id].best;
      res.levelId = id;
      res.hasNext = id < LEVELS.length - 1;
      if (!prev && id < LEVELS.length - 1 && (id + 1) % 8 === 0) res.worldUnlocked = WORLDS[(id + 1) / 8];
      if (this.allGold() && !S.owned.rocket) { S.owned.rocket = 1; res.rocket = true; }
    } else if (r.kind === 'daily') {
      const D = S.daily;
      if (D.day !== r.day) { D.day = r.day; D.runs = []; D.best = null; }
      D.runs.push({ t: final, f: r.flips, b: r.bailouts });
      D.runs.sort((a, b) => a.t - b.t); D.runs = D.runs.slice(0, 5);
      res.newBest = D.best == null || final < D.best.t;
      if (res.newBest) D.best = { t: final, f: r.flips, b: r.bailouts };
      if (D.rewarded !== r.day) {
        D.streak = D.lastDay === r.day - 1 ? D.streak + 1 : 1;
        D.lastDay = r.day; D.rewarded = r.day;
        coins += 30 + 10 * Math.min(7, D.streak);
        res.firstToday = true;
      }
      res.day = r.day; res.streak = D.streak; res.runs = D.runs; res.best = D.best;
      // personal history: best time per day for the last 7 days, so there is a "beat yesterday" line
      D.hist = (D.hist || []).filter((h) => h.day !== r.day && h.day > r.day - 8);
      D.hist.push({ day: r.day, t: D.best.t, f: D.best.f }); D.hist.sort((a, b) => a.day - b.day);
      res.hist = D.hist; res.yesterday = D.hist.find((h) => h.day === r.day - 1) || null;
      res.share = `BAILOUT Daily #${r.day}: ${final.toFixed(2)}s, ${r.flips} flips, ${r.bailouts} bailout${r.bailouts === 1 ? '' : 's'}`;
    }
    res.coins = coins;
    S.coins += coins; S.gallery.runs++;
    this.recordRagdoll();
    res.newTrophies = unlockedTrophies(S).slice(trophiesBefore);
    this.persist();
    this.ui.show('result', res);
    this.ui.hud(false);
    this.mode = 'result';
  }
  endEndless() {
    const r = this.run;
    if (r.over) return;
    r.over = true;
    this.recordRagdoll();
    const m = Math.floor(r.distance), S = this.save;
    const res = { kind: 'endless', dist: m, prev: S.endless.best, flips: r.flips, coins: Math.floor(m / 25) + Math.min(20, r.flips * 2) };
    res.newBest = m > S.endless.best;
    if (res.newBest) S.endless.best = m;
    const trophiesBefore = this.trophyCount();
    S.coins += res.coins; S.gallery.runs++;
    res.newTrophies = unlockedTrophies(S).slice(trophiesBefore);
    this.persist();
    this.ui.show('result', res);
    this.ui.hud(false);
    this.mode = 'result';
  }

  // ------------------------------------------------------------------ autopilot (title demo + tests)
  predictLanding(b) { return predictLanding(this.run.world, b.c.x, b.c.y, b.c.vx, b.c.vy); }
  botInput() {
    const r = this.run, b = r.bike, c = b.c, w = r.world;
    if (!b.riderOn || r.done) return { gas: false, brake: false };
    const flips = this.mode === 'title' || (this.bot && this.bot.flips);
    if (b.air > 0.06) {
      if (!r.botPlan) {
        const p = this.predictLanding(b);
        const turns = flips ? Math.floor((p.t - 0.35) / (TAU / b.airMax + 0.12)) : 0;
        r.botPlan = { turns: Math.max(0, Math.min(3, turns)), a0: c.a };
        // let go for one frame at take-off, like a thumb lifting: the next press is a fresh one
        return { gas: false, brake: false };
      }
      const plan = r.botPlan;
      const done = c.a - plan.a0;
      if (plan.turns > 0 && done > -(plan.turns * TAU - 1.6)) return { gas: true, brake: false };
      const p = this.predictLanding(b);
      const err = wrapAngle(c.a - p.slope);
      const want = -err * 9 - c.w * 1.5;
      if (want < -1.5) return { gas: true, brake: false };
      if (want > 1.5) return { gas: false, brake: true };
      return { gas: false, brake: false };
    }
    r.botPlan = null;
    // inside a loop: hold the throttle, the loop assist does the rest
    if (b.wh.some((q) => q.air === 0 && q.lastSeg && q.lastSeg.kind === 'loop')) return { gas: true, brake: false };
    const slope = w.terrain.slopeAt(c.x);
    const rel = wrapAngle(c.a - slope);
    // drawbridges: only commit when it will stay down for the whole crossing
    for (const o of w.objs) {
      if (o.constructor.name !== 'Drawbridge') continue;
      const d = o.hx - o.L - (c.x + 40);
      if (d < -60 || d > 900) continue;
      const v = Math.max(0, c.vx), a = 800;
      const eta = d > 0 ? (-v + Math.sqrt(v * v + 2 * a * d)) / a : 0;
      const cross = (o.L + 120) / Math.max(v + a * eta, 300);
      let downFor = 0;
      for (let s = 0; s < 5; s += 0.05) { if (o.raise(o.t + s) > 0.001) break; downFor = s; }
      const ok = downFor >= eta + cross + 0.25;
      if (!ok && d > -50) { if (d < 160 + (v * v) / 2200) return { gas: false, brake: true }; return { gas: v < 150, brake: false }; }
    }
    if (rel < -0.55) return { gas: false, brake: false };
    return { gas: true, brake: false };
  }

  // ------------------------------------------------------------------ frame
  frame(now) {
    const realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.simulating) this.tick(realDt);
    this.updateAudio();
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }
  // headless fast-forward for tests: runs the same logic without drawing
  simulate(sec, dt = 1 / 60) {
    this.simulating = true;
    const r0 = this.run;
    for (let t = 0; t < sec; t += dt) { this.tick(dt); if (!this.run || this.run !== r0 || this.run.done || this.run.over) break; }
    this.simulating = false;
    const r = this.run, b = r.bike;
    const marks = r.world.res.marks || [];
    const at = (x) => { let t = ''; for (const [mx, tok] of marks) if (mx <= x) t = tok; return t; };
    const log = (r.log || []).slice(0, 4).map(([x, c]) => x + ':' + c + '@' + at(x));
    return { at: at(b.c.x), log, kind: r.kind, x: Math.round(b.c.x), fin: r.world.finish, time: +r.time.toFixed(2), bonus: r.bonus, flips: r.flips, bails: r.bailouts, done: r.done, cp: r.cp, rider: b.riderOn, dist: Math.round(r.distance) };
  }
  tick(realDt) {
    this.t += realDt;
    const r = this.run;
    const running = r && (this.mode === 'title' || ((this.mode === 'play' || this.mode === 'result') && !(this.ui.open && this.ui.panel !== 'result')));
    if (running) {
      if (this.slowT > 0) { this.slowT -= realDt; this.timeScale = this.slowT > 0.15 ? SLOWMO : 1 - (this.slowT / 0.15) * (1 - SLOWMO); } else this.timeScale = 1;
      if (this.hitstop > 0) this.hitstop -= realDt;
      else {
        this.acc += realDt * this.timeScale;
        let n = 0;
        while (this.acc >= DT && n < 10) { this.step(DT); this.acc -= DT; n++; }
      }
      this.fx.update(realDt * this.timeScale);
      if (r.ragdoll && !r.done) {
        r.crashT += realDt;
        if (r.kind === 'endless') { r.endT -= realDt; if (r.endT <= 0 && !r.over) this.endEndless(); }
        else if (r.crashT > RESPAWN_DELAY) this.respawn();
      }
      for (const cp of r.world.cps) if (cp.anim) cp.anim2 = (cp.anim2 || 0) + realDt;
      if (r.bonusFlash) r.bonusFlash = Math.max(0, r.bonusFlash - realDt);
    }
    this.updateCamera(realDt);
  }

  updateCamera(dt) {
    const r = this.run, cam = this.cam;
    if (!r) return;
    const b = r.bike, c = b.c;
    let tx, ty;
    if (r.ragdoll && cam.punch > 0) { const p = r.ragdoll.p[2]; tx = p.x + clamp((p.x - p.px) / DT * 0.15, -120, 160); ty = p.y - 30; }
    else {
      // look where you are going: bias the camera toward the ground 350-650 px ahead so
      // cliffs and tables are on screen before the kicker
      const T = r.world.terrain;
      let ahead = 0, n = 0;
      for (const d of [350, 650]) { const y = T.surfaceY(c.x + d); if (isFinite(y)) { ahead += y; n++; } }
      const bias = n ? clamp((ahead / n - c.y) * 0.3, -160, 220) : 0;
      tx = c.x + clamp(c.vx * 0.3, -150, 330) + (this.portrait ? 40 : 90); ty = c.y - 50 + clamp(c.vy * 0.12, -120, 160) + bias;
    }
    const k = Math.min(1, dt * (r.ragdoll ? 5 : 4.5));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * Math.min(1, dt * 3.8);
    // portrait zooms out further with speed: at least ~700 world px of look-ahead at top speed
    const zT = r.ragdoll && cam.punch > 0 ? CRASH_ZOOM : this.portrait ? clamp(1.0 - b.speed / 1900, 0.6, 1.0) : clamp(1.06 - b.speed / 2600, 0.74, 1.04);
    cam.zoom += (zT - cam.zoom) * Math.min(1, dt * (r.ragdoll ? 6 : 1.6));
    if (r.ragdoll && r.crashT > CRASH_ZOOM_T) cam.punch = 0;
    cam.shake = Math.max(0, cam.shake - dt * 30);
    cam.sx = (Math.random() - 0.5) * cam.shake; cam.sy = (Math.random() - 0.5) * cam.shake;
    if (this.flash) this.flash = Math.max(0, this.flash - dt * 1.6);
  }
  updateAudio() {
    const A = this.audio;
    if (!A.ctx) return;
    A.update(this.mode !== 'title');
    const r = this.run;
    if (!r || this.mode === 'title' || this.ui.open && this.ui.panel !== 'result') { A.engine({ on: false, rpm: 0, load: 0 }); return; }
    const b = r.bike, w = b.wh[0];
    const raw = Math.abs(w.spin) * w.r / b.spec.vmax;
    let rpm = raw;
    if (!b.air && raw > 0.05) rpm = 0.25 + ((raw * 3.1) % 1) * 0.75 + Math.floor(raw * 3.1) * 0.05;
    A.engine({ on: b.riderOn || b.speed > 50, rpm: Math.min(1.4, rpm), load: b.throttle, kind: b.spec.style });
  }

  get anchorX() { return this.W * (this.portrait ? 0.22 : 0.36); }
  worldToScreen(x, y) {
    const s = this.base * this.cam.zoom;
    const ox = this.anchorX, oy = this.H * (this.portrait ? 0.5 : 0.56);
    return [ox + (x - this.cam.x) * s, oy + (y - this.cam.y) * s];
  }

  // ------------------------------------------------------------------ render
  render() {
    const ctx = this.ctx, W = this.W, H = this.H, r = this.run;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!r) { ctx.fillStyle = '#7fd3ff'; ctx.fillRect(0, 0, W, H); return; }
    const cam = this.cam, s = this.base * cam.zoom;
    this.backdrop.draw(ctx, W, H, cam, s, this.t, this.dpr);
    const ox = this.anchorX, oy = H * (this.portrait ? 0.5 : 0.56);
    ctx.save();
    ctx.translate(ox + cam.sx, oy + cam.sy); ctx.scale(s, s); ctx.translate(-cam.x, -cam.y);
    setLineWidth(s);
    const view = { x0: cam.x - ox / s - 100, x1: cam.x + (W - ox) / s + 100 };
    const w = r.world, b = r.bike;
    drawObjects(ctx, w, view, this.t, 0);
    for (let i = 0; i < w.cps.length; i++) { const cp = w.cps[i]; if (cp.x > view.x0 - 100 && cp.x < view.x1 + 100) drawCheckpoint(ctx, cp, i <= r.cp, this.t, r.theme); }
    this.fx.draw(ctx, false);
    drawLoops(ctx, w, view, false);
    drawTerrain(ctx, w, view, this.t);
    drawProps(ctx, w, r.props, view, this.t);
    drawLava(ctx, w, view, this.t);
    drawLoops(ctx, w, view, true);
    drawObjects(ctx, w, view, this.t, 1);
    // ghost of your best run
    if (r.ghostPlay && r.started && r.kind === 'level') this.drawGhost(ctx, r);
    drawBike(ctx, b, this.look, this.t);
    if (r.ragdoll) drawRagdoll(ctx, r.ragdoll, this.look, r.burnt);
    this.fx.draw(ctx, true);
    this.fx.drawPops(ctx, s);
    ctx.restore();
    if (this.flash) { ctx.fillStyle = `rgba(255,240,200,${this.flash})`; ctx.fillRect(0, 0, W, H); }
    // vignette (gradient built once per screen size)
    if (!this.vg || this.vgW !== W || this.vgH !== H) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,20,0.28)');
      this.vg = vg; this.vgW = W; this.vgH = H;
    }
    ctx.fillStyle = this.vg; ctx.fillRect(0, 0, W, H);
    if (this.mode === 'play' || (this.mode === 'result' && r.kind !== 'demo')) this.drawHUD(ctx, r);
    this.fx.drawFlyers(ctx);
  }

  drawGhost(ctx, r) {
    const g = r.ghostPlay, f = r.time * 20, i = Math.floor(f), k = f - i;
    if (i * 4 + 7 >= g.length) return;
    const a = (j) => g[i * 4 + j], bb = (j) => g[(i + 1) * 4 + j];
    if (!a(3)) return;
    if (!this.ghostBike || this.ghostBike.spec !== r.bike.spec) this.ghostBike = new Bike(r.bike.spec);
    const gb = this.ghostBike;
    const x = a(0) + (bb(0) - a(0)) * k, y = a(1) + (bb(1) - a(1)) * k, an = (a(2) + (bb(2) - a(2)) * k) / 100;
    gb.c.x = x; gb.c.y = y; gb.c.a = an; gb.lean = 0;
    const ca = Math.cos(an), sa = Math.sin(an);
    for (const wq of gb.wh) { const lx = wq.lx, ly = wq.ly; wq.x = x + ca * lx - sa * ly; wq.y = y + sa * lx + ca * ly; wq.rot = x / wq.r; }
    drawBike(ctx, gb, this.look, this.t, { ghost: true });
  }

  drawHUD(ctx, r) {
    const W = this.W, H = this.H;
    const sc = clamp(Math.min(W / 900, H / 600), 0.62, 1.2);
    ctx.save();
    ctx.scale(sc, sc);
    const w = W / sc, h = H / sc;
    if (r.kind === 'endless') {
      outlined(ctx, Math.floor(r.distance) + ' m', 24, 40, 46, '#ffffff', 'left');
      outlined(ctx, 'BEST ' + this.save.endless.best + ' m', 26, 84, 20, '#ffd23f', 'left');
    } else {
      const disp = Math.max(0, r.time - r.bonus);
      const bf = r.bonusFlash || 0;
      outlined(ctx, fmtTime(disp), 24, 42, 50 + bf * 16, bf ? '#ffd23f' : '#ffffff', 'left');
      // medal ghost: the best medal still in reach, ticking as it slips away. Only
      // once the level has been finished before (a first attempt is not a demand),
      // and platinum only shows once gold is in the bag.
      const M = r.medals;
      if (M && M[0] && r.showTargets) {
        const haveGold = r.kind === 'level' && this.save.levels[r.levelId] && this.save.levels[r.levelId].medal >= 3;
        const tiers = [[M[0], 'GOLD', MEDAL_COLS[3]], [M[1], 'SILVER', MEDAL_COLS[2]], [M[2], 'BRONZE', MEDAL_COLS[1]]];
        if (haveGold && M[3]) tiers.unshift([M[3], 'PLATINUM', MEDAL_COLS[4]]);
        let idx = tiers.findIndex((tr) => disp <= tr[0]); if (idx < 0) idx = tiers.length;
        if (idx !== r.medalIdx) { if (r.medalIdx >= 0 && idx > r.medalIdx && r.started) { r.lostMedal = 1; r.lostCol = tiers[r.medalIdx][2]; this.audio.play('deny'); } r.medalIdx = idx; }
        if (idx < tiers.length) {
          const [tt, name, col] = tiers[idx];
          const left = tt - disp;
          const tick = left < 3 && r.started ? 1 + 0.18 * Math.max(0, 1 - ((left % 1) * 4)) : 1;
          if (left < 3 && r.started && Math.floor(left * 1) !== r.lastTick) { r.lastTick = Math.floor(left); this.audio.play('tick'); }
          ctx.save(); ctx.translate(40, 92); ctx.scale(tick, tick);
          medalIcon(ctx, 0, 0, 15, col);
          ctx.restore();
          outlined(ctx, name + ' ' + fmtTime(tt), 64, 93, 20, col, 'left');
        } else outlined(ctx, 'NO MEDAL', 24, 93, 20, '#ff8a7a', 'left');
        if (r.lostMedal > 0) {
          r.lostMedal -= 0.02;
          const u = 1 - r.lostMedal;
          ctx.save(); ctx.globalAlpha = r.lostMedal; ctx.translate(40 + u * 20, 92 + u * u * 120); ctx.rotate(u * 3);
          medalIcon(ctx, 0, 0, 15, r.lostCol); ctx.restore();
        }
      }
      outlined(ctx, '⟲ ' + r.flips + '   ✖ ' + r.bailouts, 24, 128, 18, '#ffffff', 'left');
      // progress bar
      if (r.world.finish && isFinite(r.world.finish)) {
        const bw = Math.min(360, w * 0.36), bx = w / 2 - bw / 2, by = 26;
        const x0 = r.world.startX, x1 = r.world.finish;
        ctx.fillStyle = 'rgba(27,27,42,0.55)'; ctx.beginPath(); ctx.roundRect(bx - 4, by - 7, bw + 8, 14, 7); ctx.fill();
        const u = clamp((r.bike.c.x - x0) / (x1 - x0), 0, 1);
        ctx.fillStyle = r.theme.accent; ctx.beginPath(); ctx.roundRect(bx, by - 3, Math.max(6, bw * u), 6, 3); ctx.fill();
        for (let i = 0; i < r.world.cps.length; i++) { const cu = (r.world.cps[i].x - x0) / (x1 - x0); ctx.fillStyle = i <= r.cp ? '#7dff6a' : '#ffffff'; ctx.beginPath(); ctx.arc(bx + bw * cu, by, 4, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx + bw * u, by, 8, 0, TAU); ctx.fill(); ctx.stroke();
        // checkered end
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#1b1b2a' : '#ffffff'; ctx.fillRect(bx + bw + 8 + i * 6, by - 6 + j * 6, 6, 6); }
        const label = r.kind === 'daily' ? 'DAILY #' + r.day : (WORLDS.indexOf(LEVELS[r.levelId].world) + 1) + '-' + LEVELS[r.levelId].num + '  ' + LEVELS[r.levelId].name.toUpperCase();
        outlined(ctx, label, w / 2, by + 26, 16, '#ffffff');
      }
    }
    // one-time tutorial hint banner
    if (r.hint && this.mode === 'play' && r.started) {
      const txt = HINTS[r.hint], size = 22;
      ctx.font = `${size}px "Lilita One", "Arial Black", sans-serif`;
      const tw = ctx.measureText(txt).width + 70;
      const y = h * 0.22, bob = Math.sin(this.t * 5) * 3;
      ctx.save(); ctx.translate(w / 2, y + bob);
      ctx.fillStyle = 'rgba(27,27,42,0.78)'; ctx.beginPath(); ctx.roundRect(-tw / 2, -24, tw, 48, 14); ctx.fill();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.stroke();
      pedalIcon(ctx, -tw / 2 + 26, 0, 0.42, true, r.hint === 'flip' ? 1 : 0.5);
      if (r.hint === 'release') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-tw / 2 + 26, 8); ctx.lineTo(-tw / 2 + 26, -14); ctx.moveTo(-tw / 2 + 18, -6); ctx.lineTo(-tw / 2 + 26, -14); ctx.lineTo(-tw / 2 + 34, -6); ctx.stroke(); }
      outlined(ctx, txt, 20, 1, size, '#ffd23f');
      ctx.restore();
    }
    // start hint: pulsing pedal + key cap, no words
    if (!r.started && this.mode === 'play') {
      const p = 1 + 0.08 * Math.sin(this.t * 8);
      ctx.save(); ctx.translate(w / 2, h * 0.3); ctx.scale(p, p);
      pedalIcon(ctx, -34, 0, 1, true, 1);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(14, -26, 52, 52, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(28, -12); ctx.lineTo(52, 0); ctx.lineTo(28, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // pedals (touch / mouse)
    if (this.showPedals && this.mode === 'play') {
      const ps = clamp(Math.min(W, H) / 380, 0.8, 1.5);
      const inp = this.input();
      pedalIcon(ctx, 70 * ps, H - 80 * ps, ps, false, inp.brake ? 0.85 : 0.4);
      pedalIcon(ctx, W - 70 * ps, H - 80 * ps, ps, true, inp.gas ? 0.85 : 0.4);
    }
  }
}

function medalIcon(ctx, x, y, r, col) {
  ctx.fillStyle = '#e8433a'; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 1.9); ctx.lineTo(x - r * 0.1, y - r * 0.6); ctx.lineTo(x + r * 0.1, y - r * 0.6); ctx.lineTo(x + r * 0.7, y - r * 1.9); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.strokeStyle = 'rgba(27,27,42,0.35)'; ctx.lineWidth = 2; ctx.stroke();
}
export function pedalIcon(ctx, x, y, s, gas, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = alpha;
  ctx.fillStyle = gas ? '#36c46a' : '#e8433a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(-30, -42, 60, 84, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) ctx.fillRect(-18, -28 + i * 16, 36, 7);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  ctx.beginPath();
  if (gas) { ctx.moveTo(40, -14); ctx.lineTo(58, 0); ctx.lineTo(40, 14); } else { ctx.moveTo(-40, -14); ctx.lineTo(-58, 0); ctx.lineTo(-40, 14); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// medal times when no calibrated entry exists (daily): from course length and flip
// spots, with the same shape as the calibrated table [gold, silver, bronze, platinum]
export function estimateMedals(res, L) {
  const len = res.finish - res.startX;
  const par = len / 640 + 1.5;
  const fl = L.flips || res.flipSpots || 0;
  return [round1(par), round1(par * 1.15 + 2), round1(par * 1.5 + 8), round1(par * 0.92 - fl * 0.7)];
}
const round1 = (v) => Math.round(v * 10) / 10;

function encodeGhost(a) { return a.map((v) => v.toString(36)).join(','); }
function decodeGhost(s) { try { return s.split(',').map((v) => parseInt(v, 36)); } catch (e) { return null; } }

new Game();
