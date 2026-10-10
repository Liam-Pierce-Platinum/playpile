// SNOWBALL ROYALE - a top-down snowball fight at dusk. Duck behind snow
// walls, scoop snow, lob over cover, and roll a big one to flatten people.
import { W, H, EDGE, clamp, rand, World, segPoint } from './world.js';
import { MAPS, MODES } from './maps.js';
import { Kid, newIntent, KID_R, FLAT_SPEED, FLAT_RANGE, TAP_T, lobRange, LOB_MIN, MAX_AMMO, WALL_COST, MAX_WALLS, BALL_MIN, BALL_MAX, BIG_HIT_R } from './kid.js';
import { Brain, PERSONAS, PERSONA_KEYS } from './ai.js';
import { drawKid, drawSnowball, drawBigBall, drawWall, drawWallShadow, drawTree, drawSnowman, drawRect, drawPost, drawWashing, drawDog, COATS, SKINS, HAIRS, TEAM, HATS, SCARVES, INK, star } from './draw.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'pd.snowball-royale';
const ROUND_T = 90, RESPAWN_T = 3.2, COUNT_T = 2.7;
const NAMES = ['Mia', 'Leo', 'Ava', 'Sam', 'Zoe', 'Max', 'Ruby', 'Finn', 'Ivy', 'Theo', 'Nora', 'Ollie', 'Isla', 'Alfie', 'Pip', 'Jude'];
const HIT_WORDS = ['SPLAT!', 'THWUMP!', 'POW!', 'SPLOOSH!', 'BONK!', 'FWUMP!'];
const FFA_BONUS = [300, 180, 100, 50, 25, 0], KING_BONUS = [300, 150, 80, 40, 20, 0];
const params = new URLSearchParams(location.search);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[(Math.random() * a.length) | 0];

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { coins: 0, hat: 'bobble', scarf: 'red', coat: 1, owned: { hats: ['beanie', 'bobble'], scarves: ['red', 'white'] }, unlocked: 1, best: { ffa: 0, duo: 0, trio: 0, king: 0 }, wins: 0, played: 0, music: 0.55, sfx: 0.9, muted: false, lastMode: 'ffa', lastMap: 0, hints: 0 };
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); Object.assign(this.save, s); this.save.best = Object.assign({ ffa: 0, duo: 0, trio: 0, king: 0 }, s.best || {}); this.save.owned = Object.assign({ hats: ['beanie', 'bobble'], scarves: ['red', 'white'] }, s.owned || {}); } catch (e) { /* storage blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx; this.audio.muted = this.save.muted;
    this.fx = new FX();
    this.bot = params.get('bot') || null; if (this.bot === '1') this.bot = 'builder';
    this.speed = clamp(parseInt(params.get('speed'), 10) || 1, 1, 8);
    this.T = 0; this.state = 'title';
    this.keys = new Set(); this.mouse = null; this.mouseDown = false; this.queue = { dive: false, wall: false };
    this.touch = { on: false, move: null, aim: null, roll: false, scoop: false, lastAim: null };
    this.pit = newIntent();
    this.flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(1, 3.2), v: rand(18, 50), ph: rand(0, 6) }));
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.startDemo();
    this.ui.show('title');
    document.fonts && document.fonts.ready.then(() => { this.fontsReady = true; });
    if (params.has('play')) {
      const mode = MODES[params.get('mode')] ? params.get('mode') : this.save.lastMode;
      const map = params.has('map') ? clamp(parseInt(params.get('map'), 10) || 0, 0, MAPS.length - 1) : Math.min(this.save.lastMap, this.save.unlocked - 1);
      this.startMatch({ mode, map });
    }
    window.__G = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr; this.cw = innerWidth; this.ch = innerHeight;
    this.canvas.width = Math.round(innerWidth * dpr); this.canvas.height = Math.round(innerHeight * dpr);
    const short = Math.min(innerWidth, innerHeight);
    const vis = clamp(400 + short * 0.4, 600, 820);
    const s = Math.max(Math.min(innerWidth / W, innerHeight / H), short / vis, innerWidth / W, innerHeight / H);
    this.view = { s, vw: innerWidth / s, vh: innerHeight / s };
  }
  toWorld(sx, sy) { return { x: (sx - this.cw / 2) / this.view.s + this.camX, y: (sy - this.ch / 2) / this.view.s + this.camY }; }
  toScreen(x, y) { return { x: (x - this.camX) * this.view.s + this.cw / 2, y: (y - this.camY) * this.view.s + this.ch / 2 }; }
  vol(k) {
    if (!this.player || this.demo) return 0.5;
    const d = Math.hypot(k.x - this.camX, k.y - this.camY);
    return clamp(1.25 - d / 900, 0.15, 1);
  }

  // ------------------------------------------------------------ input
  input() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.pointerType === 'mouse') {
        this.mouse = { x: e.clientX, y: e.clientY };
        if (e.button === 0) this.mouseDown = true;
        if (e.button === 2) this.queue.dive = true;
        return;
      }
      e.preventDefault();
      this.setTouch(true);
      const st = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
      if (e.clientX < this.cw * 0.5) { if (!this.touch.move) this.touch.move = st; }
      else if (!this.touch.aim) this.touch.aim = st;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mouse = { x: e.clientX, y: e.clientY }; return; }
      for (const k of ['move', 'aim']) { const s = this.touch[k]; if (s && s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; } }
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mouseDown = false; return; }
      if (this.touch.move && this.touch.move.id === e.pointerId) this.touch.move = null;
      if (this.touch.aim && this.touch.aim.id === e.pointerId) this.touch.aim = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) this.mouseDown = false; });
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.state === 'play') e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open && !['title', 'result'].includes(this.ui.panel)) { this.ui.back(); return; }
        if (this.state === 'play' && !this.ui.open) { this.pause(); return; }
      }
      if (this.ui.open) {
        if (this.ui.panel === 'result' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) { e.preventDefault(); this.ui.primary(); }
        else if (this.ui.panel === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.ui.primary(); }
        return;
      }
      if (this.state !== 'play') return;
      if (e.code === 'Space' || e.code === 'ShiftLeft') this.queue.dive = true;
      if (e.code === 'KeyQ') this.queue.wall = true;
      if (e.code === 'KeyT') this.setTouch(false);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; if (this.state === 'play' && !this.ui.open) this.pause(); });
  }
  setTouch(on) { if (this.touch.on === on) return; this.touch.on = on; document.body.classList.toggle('touch', on); }
  pause() { if (this.state === 'play' && !this.ui.open) { this.audio.play('click'); this.ui.show('pause'); } }

  playerIntent() {
    const it = this.pit, K = this.keys, p = this.player;
    let mx = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0);
    let my = (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0) - (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0);
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const tm = this.touch.move;
    if (tm) { const dx = tm.x - tm.ox, dy = tm.y - tm.oy, d = Math.hypot(dx, dy), R = 56; if (d > 6) { const m = Math.min(1, d / R); mx = dx / d * m; my = dy / d * m; } if (d > R) { tm.ox = tm.x - dx / d * R; tm.oy = tm.y - dy / d * R; } }
    it.mx = mx; it.my = my;
    const ta = this.touch.aim;
    if (ta || (this.touch.on && !this.mouse)) {
      // right stick: drag to aim (auto-aims at the nearest kid on a quick tap); hold to charge a lob
      if (ta) {
        const dx = ta.x - ta.ox, dy = ta.y - ta.oy, d = Math.hypot(dx, dy);
        let ax, ay;
        if (d < 14) { const e = this.autoTarget(p, null); if (e) { ax = e.x; ay = e.y; } else { ax = p.x + Math.cos(p.face) * 300; ay = p.y + Math.sin(p.face) * 300; } }
        else {
          const ux = dx / d, uy = dy / d, m = Math.min(1, d / 80);
          const e = this.autoTarget(p, Math.atan2(uy, ux));
          if (p.charging && p.chargeT > TAP_T) { const L = LOB_MIN + m * (lobRange(1) - LOB_MIN); ax = p.x + ux * L; ay = p.y + uy * L; }
          else if (e) { ax = e.x; ay = e.y; } else { ax = p.x + ux * 300; ay = p.y + uy * 300; }
        }
        this.touch.lastAim = { x: ax, y: ay };
      }
      const la = this.touch.lastAim || { x: p.x + Math.cos(p.face) * 200, y: p.y + Math.sin(p.face) * 200 };
      it.ax = la.x; it.ay = la.y; it.fire = !!ta; it.flatOff = 0;
    } else if (this.mouse) {
      const m = this.toWorld(this.mouse.x, this.mouse.y);
      it.ax = m.x; it.ay = m.y; it.fire = this.mouseDown; it.flatOff = 16;
    } else { it.ax = p.x + Math.cos(p.face) * 100; it.ay = p.y + Math.sin(p.face) * 100; it.fire = false; }
    it.dive = this.queue.dive; this.queue.dive = false;
    it.wall = this.queue.wall; this.queue.wall = false;
    it.roll = K.has('KeyR') || this.touch.roll;
    it.scoop = K.has('KeyE') || this.touch.scoop;
    return it;
  }
  autoTarget(p, ang) {
    let best = null, bs = 1e9;
    for (const o of this.kids) {
      if (o === p || !o.alive || (this.teams && o.team === p.team)) continue;
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
      if (d > 640) continue;
      let s = d;
      if (ang != null) { let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = 2 * Math.PI - da; if (da > 0.4) continue; s = d * 0.4 + da * 400; }
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }

  // ------------------------------------------------------------ matches
  startDemo() {
    this.startMatch({ mode: pick(['ffa', 'ffa', 'trio', 'king']), map: (Math.random() * MAPS.length) | 0, demo: true });
  }
  startMatch(cfg) {
    this.cfg = cfg;
    this.modeKey = cfg.mode; this.M = MODES[cfg.mode]; this.mapIdx = cfg.map; this.demo = !!cfg.demo;
    this.teams = this.M.teams;
    this.world = new World(MAPS[cfg.map], cfg.mode);
    this.fx.clear(); this.shots = []; this.kids = []; this.brains = new Map();
    this.skill = this.demo ? 0.75 : clamp(0.3 + cfg.map * 0.08 + Math.min(this.save.wins, 12) * 0.012, 0.28, 1);
    const n = this.M.kids, names = shuffle(NAMES.slice());
    const pcoat = COATS[this.save.coat % COATS.length];
    const coats = shuffle(COATS.filter((c) => c !== pcoat));
    const personas = shuffle(PERSONA_KEYS.slice()).concat(shuffle(PERSONA_KEYS.slice()));
    const hats = Object.keys(HATS), scarves = Object.keys(SCARVES);
    const spawns = this.spawnPoints(n);
    this.pit = newIntent();
    for (let i = 0; i < n; i++) {
      const isP = i === 0 && !this.demo;
      const team = this.teams ? (i < n / 2 ? 0 : 1) : i;
      const k = new Kid({
        name: isP ? 'You' : names[i], isPlayer: isP, team,
        coat: isP ? pcoat : coats[i % coats.length], skin: pick(SKINS), hair: pick(HAIRS),
        hat: isP ? this.save.hat : pick(hats.slice(0, 7)), scarf: isP ? this.save.scarf : pick(scarves.slice(0, 6)),
        x: spawns[i].x, y: spawns[i].y, face: Math.atan2(H / 2 - spawns[i].y, W / 2 - spawns[i].x),
      });
      k.hatColor = isP ? null : pick(COATS);
      k.ring = isP ? '#ffd23f' : this.teams ? TEAM[team] : k.coat;
      if (this.teams && isP) k.ring = '#ffd23f';
      if (!isP) { const pk = personas[i % personas.length]; k.persona = pk; this.brains.set(k, new Brain(k, pk)); }
      else if (this.bot) { const b = new Brain(k, this.bot); this.brains.set(k, b); this.pit = b.it; }      this.kids.push(k);
    }
    this.player = this.demo ? null : this.kids[0];
    this.time = ROUND_T; this.phase = 'count'; this.countT = this.demo ? 0.01 : COUNT_T; this.frozen = true; this.lastBeep = 4;
    this.score = 0; this.teamKO = [0, 0]; this.elimOrder = []; this.endT = 0; this.result = null;
    this.dog = { on: false, t: rand(9, 15), x: 0, y: 0, vx: 0, vy: 0, hits: new Map() };
    this.feed = []; this.banner = null; this.shake = 0; this.hitstop = 0; this.slow = 1; this.zoneHolder = null;
    this.stats = { hits: 0, kos: 0, flat: 0, thrown: 0 };
    const f = this.player || this.kids[0];
    this.camX = f.x; this.camY = f.y; this.demoFollow = 0; this.demoT = 6;
    this.audio.intensity = 0.2;
    if (!this.demo) {
      this.state = 'play';
      this.ui.close(); this.ui.hud(true);
      this.save.lastMode = cfg.mode; this.save.lastMap = cfg.map; this.persist();
      this.audio.unlock();
      this.hintT = this.save.hints < 3 ? 14 : 0;
    } else this.state = 'title';
  }
  restart() { this.startMatch({ mode: this.cfg.mode, map: this.cfg.map }); }
  quickPlay() { this.startMatch({ mode: this.save.lastMode, map: Math.min(this.save.lastMap, this.save.unlocked - 1) }); }
  toTitle() { this.ui.hud(false); this.startDemo(); this.ui.show('title'); }

  findFree(x, y) {
    for (let r = 0; r < 400; r += 18) for (let a = 0; a < 6.28; a += r ? 18 / r * 2 : 7) {
      const px = clamp(x + Math.cos(a) * r, EDGE + 30, W - EDGE - 30), py = clamp(y + Math.sin(a) * r, EDGE + 30, H - EDGE - 30);
      if (this.world.freeAt(px, py, KID_R + 4)) return { x: px, y: py };
    }
    return { x, y };
  }
  spawnPoints(n) {
    const out = [];
    if (this.teams) {
      const per = n / 2;
      for (let i = 0; i < n; i++) { const side = i < per ? 0 : 1, j = i % per; out.push(this.findFree(side ? W - 170 : 170, H / 2 + (j - (per - 1) / 2) * 170)); }
    } else {
      const a0 = Math.PI / 2;
      for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2; out.push(this.findFree(W / 2 + Math.cos(a) * 590, H / 2 + Math.sin(a) * 340)); }
    }
    return out;
  }
  respawnPoint(k) {
    let best = null, bs = -1;
    const foes = this.kids.filter((o) => o !== k && o.alive && (!this.teams || o.team !== k.team));
    for (let i = 0; i < 12; i++) {
      let x, y;
      if (this.teams) { x = k.team ? rand(W - 260, W - 120) : rand(120, 260); y = rand(160, H - 160); }
      else { const a = rand(0, 6.28); x = W / 2 + Math.cos(a) * 600; y = H / 2 + Math.sin(a) * 350; }
      const p = this.findFree(x, y);
      let md = 1e9; for (const o of foes) md = Math.min(md, Math.hypot(o.x - p.x, o.y - p.y));
      if (md > bs) { bs = md; best = p; }
    }
    return best;
  }
  inZone(k) { const f = this.world.fort; return Math.hypot(k.x - f.x, (k.y - f.y) / 0.86) < f.r; }

  // ------------------------------------------------------------ actions
  throwFlat(k, dx, dy) {
    this.shots.push({ x: k.x + dx * 14, y: k.y + dy * 10, z: 18, dx, dy, dz: 0, dist: 0, range: FLAT_RANGE, owner: k, lob: false, dead: false });
    this.audio.play('throw', rand(0.9, 1.15), this.vol(k));
    if (k.isPlayer) this.stats.thrown++;
  }
  throwLob(k, tx, ty) {
    const d = Math.hypot(tx - k.x, ty - k.y) || 1;
    this.shots.push({ x0: k.x, y0: k.y, x: k.x, y: k.y, z: 18, tx, ty, t: 0, T: 0.5 + d / 1500, peak: 46 + d * 0.22, lob: true, owner: k, dx: (tx - k.x) / d, dy: (ty - k.y) / d, dz: 0, dead: false, big: true });
    this.audio.play('lob', 1, this.vol(k));
    if (k.isPlayer) this.stats.thrown++;
  }
  noAmmo(k) {
    if (!k.isPlayer) return;
    this.audio.play('empty');
    const w = this.world;
    this.fx.text(k.x, k.y - 76, w.snowNear(k.x, k.y + 4, 14) > 0.22 ? 'Out of snow! Stand still or E' : 'Out of snow! Find fresh snow', '#bfe3ff', 15, 1.1);
  }
  buildWall(k) {
    if (k.buildCd > 0) return;
    k.buildCd = 0.45;
    if (k.ammo < WALL_COST) { if (k.isPlayer) { this.audio.play('empty'); this.fx.text(k.x, k.y - 76, `Walls cost ${WALL_COST} snowballs`, '#bfe3ff', 15); } return; }
    const fx = Math.cos(k.face), fy = Math.sin(k.face);
    const cx = k.x + fx * 36, cy = k.y + fy * 32;
    if (cx < EDGE + 20 || cx > W - EDGE - 20 || cy < EDGE + 20 || cy > H - EDGE - 20 || this.world.rects.some((q) => cx > q.x - 10 && cx < q.x + q.w + 10 && cy > q.y - 10 && cy < q.y + q.h + 10)) { if (k.isPlayer) this.fx.text(k.x, k.y - 76, "Can't build here", '#bfe3ff', 15); return; }
    const L = 42;
    const mine = this.world.walls.filter((wl) => wl.owner === k && !wl.dead);
    if (mine.length >= MAX_WALLS) this.breakWall(mine[0], null);
    this.world.addWall(cx - fy * L, cy + fx * L, cx + fy * L, cy - fx * L, k, false);
    k.ammo -= WALL_COST; k.squash = 0.2;
    this.fx.burst(cx, cy, 4, 14, { speed: 120 }); this.fx.puff(cx, cy, 6, 30, 8);
    this.audio.play('build', 1, this.vol(k));
    if (k.isPlayer) this.fx.text(cx, cy - 40, 'WALL!', '#ffffff', 18, 0.6);
  }
  grabBall(k) {
    const w = this.world;
    for (const b of w.balls) if (!b.dead && !b.pusher && Math.hypot(b.x - k.x, b.y - k.y) < b.r + KID_R + 18) { b.pusher = k; b.owner = k; k.ballRef = b; return; }
    if (k.rollTry > this.T) return;
    k.rollTry = this.T + 0.4;
    const fx = Math.cos(k.face), fy = Math.sin(k.face), x = k.x + fx * (KID_R + 14), y = k.y + fy * (KID_R + 12);
    if (w.snowNear(x, y, 12) > 0.3 && w.freeAt(x, y, BALL_MIN)) {
      if (w.balls.length >= 8) { const old = w.balls.find((b) => !b.pusher); if (old) this.destroyBall(old); }
      const b = { x, y, r: BALL_MIN, vx: 0, vy: 0, pusher: k, owner: k, ownerT: 0, rot: 0, seed: rand(0, 9), dead: false, hitT: new Map(), sndT: 0, crushT: 0 };
      w.balls.push(b); k.ballRef = b; w.dig(x, y, 10, 0.6);
    } else if (k.isPlayer) this.fx.text(k.x, k.y - 76, 'Need fresh snow to roll', '#bfe3ff', 15);
  }
  releaseBall(k) {
    const b = k.ballRef; k.ballRef = null; if (!b) return;
    b.pusher = null; b.owner = k; b.ownerT = 0.45;
    const fx = Math.cos(k.face), fy = Math.sin(k.face), sp = Math.hypot(k.vx, k.vy);
    b.vx = fx * (sp * 1.35 + 40); b.vy = fy * (sp * 1.35 + 40);
    if (b.r > 20) this.audio.play('roll', 1, this.vol(k));
  }
  destroyBall(b) {
    b.dead = true;
    if (b.pusher) { b.pusher.ballRef = null; b.pusher = null; }
    this.fx.burst(b.x, b.y, b.r, Math.round(8 + b.r * 0.6), { speed: 80 + b.r * 3, size: 1 + b.r / 40 });
    this.fx.puff(b.x, b.y, b.r * 0.5, b.r, 6);
    this.world.addSnow(b.x, b.y, Math.max(12, b.r * 0.8), true);
    this.audio.play('poof', 1, 0.7);
  }
  addScore(k, pts, x, y, label, col = '#ffd23f') {
    if (!k || !k.isPlayer || this.phase === 'end') return;
    this.score += pts;
    if (label !== false) this.fx.text(x, y, label || '+' + pts, col, 18, 0.8);
  }
  addFeed(a, verb, b) { this.feed.unshift({ a, verb, b, t: 4 }); if (this.feed.length > 4) this.feed.pop(); }
  enemiesOf(a, b) { return a && b && a !== b && (!this.teams || a.team !== b.team); }

  hitKid(k, dmg, from, kind, dx = 0, dy = 0) {
    if (!k.alive || k.invuln > 0) return false;
    if (from && !this.enemiesOf(from, k) && kind !== 'dump') return false;
    k.hp -= dmg; k.sinceHit = 0; k.regenT = 0; k.flash = 0.12; k.splatT = 1.2; k.splatX = rand(-4, 4); k.squash = 0.28;
    const stun = { flat: 0.32, lob: 0.55, dump: 1.0, big: 1.1, tackle: 0.6 }[kind] || 0.4;
    k.stun = Math.max(k.stun, stun);
    const kb = { flat: 230, lob: 120, big: 460, dump: 0, tackle: 300 }[kind] || 150;
    k.vx += dx * kb; k.vy += dy * kb;
    if (kind === 'big') { k.prone = 1.0; k.lieDir = dx >= 0 ? 1 : -1; }
    k.charging = false;
    if (k.ballRef) this.releaseBall(k);
    const big = kind === 'big';
    this.fx.burst(k.x, k.y, 30, big ? 40 : 14, { speed: big ? 320 : 180, size: big ? 1.6 : 1 });
    this.fx.puff(k.x, k.y, 30, big ? 34 : 16, big ? 10 : 5);
    this.world.splat(k.x + rand(-8, 8), k.y + rand(0, 8), big ? 2.2 : 1);
    this.audio.play(big ? 'bigsplat' : 'splat', rand(0.9, 1.15), this.vol(k));
    if (k.isPlayer) { this.hurtT = 0.35; this.audio.play('hurt'); this.shake = Math.max(this.shake, big ? 14 : 6); this.hitstop = Math.max(this.hitstop, big ? 0.1 : 0.04); }
    if (from && from !== k && this.enemiesOf(from, k)) {
      from.hits++;
      if (from.isPlayer) {
        this.stats.hits++;
        this.shake = Math.max(this.shake, big ? 12 : 3); this.hitstop = Math.max(this.hitstop, big ? 0.1 : 0.035);
        this.addScore(from, big ? 60 : kind === 'dump' ? 20 : 10, k.x, k.y - 66, big ? 'FLATTENED!' : pick(HIT_WORDS), big ? '#ffd23f' : '#ffffff');
        if (big) this.stats.flat++;
      } else if (!k.isPlayer && big) this.fx.text(k.x, k.y - 66, 'FLATTENED!', '#ffffff', 22);
    }
    if (k.isPlayer && from && from !== k) this.fx.text(k.x, k.y - 70, pick(HIT_WORDS), '#ff8f8f', 18, 0.6);
    if (k.hp <= 0) this.knockOut(k, from, kind, dx);
    return true;
  }
  knockOut(k, from, kind, dx) {
    k.hp = 0; k.ko = true; k.koT = 0; k.lieDir = dx >= 0 ? 1 : -1; k.prone = 0; k.charging = false;
    if (k.ballRef) this.releaseBall(k);
    const credit = from && from !== k && this.enemiesOf(from, k) ? from : null;
    if (credit) { credit.kos++; if (this.teams) this.teamKO[credit.team]++; }
    else if (this.teams) this.teamKO[1 - k.team]++;
    if (this.modeKey === 'ffa') { k.lives--; if (k.lives <= 0) { k.elim = true; this.elimOrder.push(k); } }
    this.fx.burst(k.x, k.y, 30, 30, { speed: 260, size: 1.4 }); this.fx.stars(k.x, k.y, 40, 7);
    this.fx.text(k.x, k.y - 80, k.elim ? 'OUT!' : 'KO!', k.isPlayer ? '#ff8f8f' : '#ffd23f', 30, 1.2);
    this.audio.play('ko', 1, this.vol(k));
    this.addFeed(credit ? credit : null, kind === 'big' ? 'flattened' : kind === 'dump' ? 'snow-dumped' : 'splatted', k);
    if (credit && credit.isPlayer) { this.stats.kos++; this.addScore(credit, 50, k.x, k.y - 104, k.elim ? 'ELIMINATED! +50' : 'KNOCKOUT! +50', '#ffd23f'); this.hitstop = Math.max(this.hitstop, 0.09); this.shake = Math.max(this.shake, 10); }
    if (k.isPlayer) { this.audio.play('koyou'); this.hitstop = 0.12; this.shake = 16; }
    k.outT = RESPAWN_T;
  }
  damageWall(wl, amt, by, quiet) {
    if (wl.dead) return;
    wl.hp -= amt; wl.shake = 0.3;
    if (!quiet) { const m = { x: (wl.x1 + wl.x2) / 2, y: (wl.y1 + wl.y2) / 2 }; this.audio.play('wallhit', 1, this.vol(m)); }
    if (wl.hp <= 0) this.breakWall(wl, by);
  }
  breakWall(wl, by) {
    if (wl.dead) return;
    wl.dead = true;
    const m = { x: (wl.x1 + wl.x2) / 2, y: (wl.y1 + wl.y2) / 2 };
    for (let i = 0; i <= 4; i++) { const t = i / 4, x = wl.x1 + (wl.x2 - wl.x1) * t, y = wl.y1 + (wl.y2 - wl.y1) * t; this.fx.burst(x, y, 14, 8, { speed: 200, size: 1.3 }); this.fx.puff(x, y, 10, 20, 2); if (i % 2 === 0) this.world.addSnow(x, y, 16); }
    this.audio.play('wallbreak', 1, this.vol(m));
    if (by && by.isPlayer) { this.addScore(by, 5, m.x, m.y - 40, 'WALL DOWN!', '#ffffff'); this.shake = Math.max(this.shake, 6); }
    else if (this.player && Math.hypot(m.x - this.player.x, m.y - this.player.y) < 300) this.shake = Math.max(this.shake, 4);
  }
  treeHit(tr, by) {
    tr.shake = 1;
    if (tr.snow < 0.6) return;
    tr.snow = 0;
    this.fx.dump(tr.x, tr.y - 10, 70 * tr.s);
    this.audio.play('tree', 1, this.vol(tr));
    for (const k of this.kids) {
      if (!k.alive) continue;
      if (Math.hypot(k.x - tr.x, (k.y - tr.y) * 1.2) < 66 * tr.s) this.hitKid(k, 1, by && this.enemiesOf(by, k) ? by : null, 'dump', 0, 0);
    }
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; this.world.addSnow(tr.x + Math.cos(a) * 40 * tr.s, tr.y + Math.sin(a) * 26 * tr.s, 14); }
  }
  snowmanHit(s, by) {
    s.hp--; s.shake = 0.4;
    if (s.hp === 4) { this.fx.burst(s.x, s.y, 76, 16, { speed: 150 }); if (this.player && Math.hypot(s.x - this.player.x, s.y - this.player.y) < 500) this.fx.text(s.x, s.y - 100, 'His head!', '#ffffff', 18); }
    if (s.hp <= 0) { this.fx.burst(s.x, s.y, 30, 34, { speed: 220, size: 1.5 }); this.fx.puff(s.x, s.y, 20, 30, 10); this.world.addSnow(s.x, s.y, 30, true); this.audio.play('wallbreak', 1, this.vol(s)); if (by && by.isPlayer) this.addScore(by, 5, s.x, s.y - 60, 'Sorry, snowman!', '#ffffff'); }
  }
  // what a snowball does when it hits a thing
  shotBlocked(s, b) {
    const o = b.o;
    switch (b.kind) {
      case 'wall': this.damageWall(o, 1, s.owner); this.fx.burst(s.x, s.y, s.z, 10, { speed: 140, col: '#eef2fb' }); break;
      case 'tree': this.treeHit(o, s.owner); break;
      case 'snowman': this.snowmanHit(o, s.owner); break;
      case 'ball': o.r -= 2.4; if (o.r < 10) this.destroyBall(o); break;
      default: this.audio.play('poof', 1, this.vol(s) * 0.6);
    }
    this.fx.burst(s.x, s.y, s.z, 8, { speed: 120 }); this.fx.puff(s.x, s.y, s.z, 10, 3);
    s.dead = true;
  }
  kidHitByShot(s, k) {
    if (k === s.owner || !k.alive || k.invuln > 0) return false;
    if (this.teams && s.owner.team === k.team) return false;
    if (k.prone > 0 && !s.lob) return false; // diving kids duck under flat throws
    const dy = s.y - k.y;
    return Math.abs(s.x - k.x) < 16 && dy > -26 && dy < 13;
  }
  landLob(s) {
    const w = this.world, x = s.tx, y = s.ty;
    let any = false;
    for (const k of this.kids) {
      if (k === s.owner || !k.alive || k.invuln > 0 || (this.teams && s.owner.team === k.team)) continue;
      if (Math.hypot(k.x - x, (k.y - y) * 1.25) < 34) { this.hitKid(k, 1, s.owner, 'lob', (k.x - x) / 40, (k.y - y) / 40); any = true; }
    }
    for (const wl of w.walls) if (!wl.dead && wl.build > 0.3 && segPoint(x, y, wl.x1, wl.y1, wl.x2, wl.y2).d < wl.r + 12) this.damageWall(wl, 1, s.owner);
    for (const tr of w.trees) if (Math.hypot(x - tr.x, y - tr.y) < 50 * tr.s) this.treeHit(tr, s.owner);
    for (const sm of w.snowmen) if (sm.hp > 0 && Math.hypot(x - sm.x, y - sm.y) < sm.r + 12) this.snowmanHit(sm, s.owner);
    for (const b of w.balls) if (!b.dead && Math.hypot(x - b.x, y - b.y) < b.r + 6) { b.r -= 2.4; if (b.r < 10) this.destroyBall(b); }
    if (this.dog.on && Math.hypot(x - this.dog.x, y - this.dog.y) < 30) this.dogHit(s.owner);
    w.splat(x, y, 1.4);
    this.fx.burst(x, y, 4, 14, { speed: 150 }); this.fx.puff(x, y, 4, 18, 5);
    if (!any) this.audio.play('splat', 1.2, this.vol({ x, y }) * 0.6);
    s.dead = true;
  }
  dogHit(by) {
    const d = this.dog; if (!d.on || d.scared) return;
    d.scared = true; d.speed = 470; d.chase = null; d.exit = d.x < W / 2 ? -1 : 1;
    this.audio.play('yelp', 1, this.vol(d)); this.fx.text(d.x, d.y - 40, 'YIP!', '#ffffff', 20);
    if (by && by.isPlayer) this.addScore(by, 0, d.x, d.y - 60, 'Poor doggo!', '#ffffff');
  }

  // ------------------------------------------------------------ simulation
  loop(t) {
    const dt = clamp((t - this.last) / 1000, 0, 0.05);
    this.last = t;
    try { for (let i = 0; i < this.speed; i++) this.update(dt); this.render(); } catch (e) { console.error(e); }
    requestAnimationFrame((tt) => this.loop(tt));
  }
  update(dt) {
    this.T += dt;
    this.audio.update(dt, this.state === 'play');
    for (const f of this.flakes) { f.y += f.v * dt / 600; f.x += Math.sin(this.T * 0.7 + f.ph) * dt * 0.01; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
    if (!this.world) return;
    if (this.state === 'play' && this.ui.open) return; // paused
    if (this.state === 'results') { this.fx.update(dt); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.phase === 'end') { this.endT += dt; this.slow = this.endT < 1.4 ? 0.3 : 1; if (this.endT > 1.7 && !this.demo && this.state === 'play') this.finish(); if (this.demo && this.endT > 2.5) { this.startDemo(); return; } }
    this.sim(dt * this.slow, dt);
  }
  sim(dt, rdt) {
    const w = this.world;
    // countdown
    if (this.phase === 'count') {
      this.countT -= rdt; this.frozen = true;
      const n = Math.ceil(this.countT);
      if (n < this.lastBeep && n > 0) { this.lastBeep = n; this.audio.play('beep'); }
      if (this.countT <= 0) { this.phase = 'play'; this.frozen = false; for (const b of this.brains.values()) if (!b.k.isPlayer) b.fireCd = rand(0.9, 2.0); if (!this.demo) { this.banner = { text: 'SNOW!', t: 1.1, col: '#ffffff' }; this.audio.play('go'); this.audio.play('whistle'); } }
    } else this.frozen = false;
    if (this.phase === 'play') {
      this.time -= dt;
      if (this.time < 10 && Math.ceil(this.time) !== this.lastTick && !this.demo) { this.lastTick = Math.ceil(this.time); this.audio.play('tick'); }
      this.audio.intensity = this.time < 20 ? 1 : this.time < 50 ? 0.6 : 0.35;
    }
    if (this.hintT > 0) this.hintT -= dt;
    // kids
    for (const k of this.kids) {
      if (k.elim && k.out) continue;
      if (k.out) {
        k.outT -= dt;
        if (k.outT <= 0 && !k.elim && this.phase !== 'end') { const p = this.respawnPoint(k); k.spawn(p.x, p.y, false); this.fx.puff(k.x, k.y, 10, 26, 8); if (k.isPlayer) this.fx.text(k.x, k.y - 80, 'Back in!', '#ffd23f', 22); }
        continue;
      }
      const br = this.brains.get(k); const it = br ? br.update(dt, this) : this.playerIntent();
      k.update(dt, this, it);
    }
    this.separate();
    this.updateShots(dt);
    this.updateBalls(dt);
    for (const wl of w.walls) { if (wl.build < 1) wl.build = Math.min(1, wl.build + dt / 0.35); wl.shake = Math.max(0, wl.shake - dt); }
    w.walls = w.walls.filter((wl) => !wl.dead);
    for (const tr of w.trees) { tr.shake = Math.max(0, tr.shake - dt * 2); if (tr.snow < 1) tr.snow = Math.min(1, tr.snow + dt / 14); }
    for (const s of w.snowmen) s.shake = Math.max(0, s.shake - dt);
    w.balls = w.balls.filter((b) => !b.dead);
    this.updateDog(dt);
    if (this.modeKey === 'king' && this.phase === 'play') {
      const inside = this.kids.filter((k) => k.alive && this.inZone(k));
      if (inside.length === 1) {
        const k = inside[0];
        const before = Math.floor(k.hold); k.hold += dt; this.zoneHolder = k;
        if (k.isPlayer && Math.floor(k.hold) > before) { this.score += 8; this.fx.text(k.x, k.y - 84, '+1 fort', '#ffd23f', 15, 0.6); }
      } else this.zoneHolder = inside.length > 1 ? 'contested' : null;
    }
    for (const f of this.feed) f.t -= dt;
    this.feed = this.feed.filter((f) => f.t > 0);
    if (this.banner) { this.banner.t -= rdt; if (this.banner.t <= 0) this.banner = null; }
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - rdt * 40);
    if (this.hurtT > 0) this.hurtT -= rdt;
    this.checkEnd();
    this.updateCam(rdt);
  }
  separate() {
    const ks = this.kids;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i]; if (!a.alive) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = KID_R * 2;
        if (d >= m || d < 0.01) continue;
        // a dive into someone is a tackle
        for (const [p, q] of [[a, b], [b, a]]) {
          if (p.dive > 0.05 && q.prone <= 0 && !p.tackled.has(q) && this.enemiesOf(p, q)) {
            p.tackled.add(q);
            q.stun = Math.max(q.stun, 0.6); q.prone = 0.5; q.lieDir = p.vx >= 0 ? 1 : -1; q.vx += p.vx * 0.6; q.vy += p.vy * 0.6; q.charging = false;
            if (q.ballRef) this.releaseBall(q);
            this.audio.play('tackle', 1, this.vol(q)); this.fx.burst(q.x, q.y, 10, 12, { speed: 140 }); this.fx.stars(q.x, q.y, 30, 4);
            this.addScore(p, 5, q.x, q.y - 66, 'TACKLE!', '#ffffff');
            if (q.isPlayer) this.shake = Math.max(this.shake, 6);
          }
        }
        const push = (m - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
  }
  updateShots(dt) {
    const w = this.world, d = this.dog;
    for (const s of this.shots) {
      if (s.dead) continue;
      if (s.lob) {
        s.t += dt / s.T;
        const t = Math.min(1, s.t), pz = s.z;
        s.x = s.x0 + (s.tx - s.x0) * t; s.y = s.y0 + (s.ty - s.y0) * t;
        s.z = 18 * (1 - t) + s.peak * 4 * t * (1 - t); s.dz = s.z - pz;
        if (t > 0.82) for (const k of this.kids) if (s.z < 34 && this.kidHitByShot(s, k)) { this.hitKid(k, 1, s.owner, 'lob', s.dx, s.dy); s.dead = true; break; }
        if (!s.dead && t >= 1) this.landLob(s);
        continue;
      }
      const steps = Math.ceil(FLAT_SPEED * dt / 10), st = FLAT_SPEED * dt / steps;
      for (let i = 0; i < steps && !s.dead; i++) {
        s.x += s.dx * st; s.y += s.dy * st; s.dist += st;
        if (s.dist > s.range * 0.8) s.z -= st * 0.09;
        if (s.z <= 0) { w.splat(s.x, s.y, 0.9); this.fx.burst(s.x, s.y, 2, 6, { speed: 90 }); s.dead = true; break; }
        for (const k of this.kids) if (this.kidHitByShot(s, k)) { this.hitKid(k, 1, s.owner, 'flat', s.dx, s.dy); s.dead = true; break; }
        if (s.dead) break;
        if (d.on && Math.abs(s.x - d.x) < 22 && s.y - d.y > -20 && s.y - d.y < 10) { this.dogHit(s.owner); this.fx.burst(s.x, s.y, s.z, 8); s.dead = true; break; }
        const b = w.blockAt(s.x, s.y, s.z);
        if (b) this.shotBlocked(s, b);
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }
  updateBalls(dt) {
    const w = this.world;
    for (const b of w.balls) {
      if (b.dead) continue;
      b.ownerT -= dt;
      const ox = b.x, oy = b.y;
      let hit = null;
      if (b.pusher) {
        const k = b.pusher;
        if (!k.alive || k.stun > 0 || k.prone > 0 || k.ballRef !== b) { if (k.ballRef === b) this.releaseBall(k); else b.pusher = null; continue; }
        const D = KID_R + b.r * 0.9 + 3, fx = Math.cos(k.face), fy = Math.sin(k.face);
        const tx = k.x + fx * D, ty = k.y + fy * D * 0.95;
        b.x += (tx - b.x) * Math.min(1, 22 * dt); b.y += (ty - b.y) * Math.min(1, 22 * dt);
        hit = w.push(b, b.r * 0.9, null);
        b.vx = (b.x - ox) / Math.max(dt, 1e-4); b.vy = (b.y - oy) / Math.max(dt, 1e-4);
        // keep the pusher behind the ball
        const dx = k.x - b.x, dy = k.y - b.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < D - 2) { k.x = b.x + dx / dd * (D - 2); k.y = b.y + dy / dd * (D - 2); }
        if (hit && hit.x1 !== undefined && Math.hypot(k.vx, k.vy) > 20) {
          this.damageWall(hit, dt * b.r * 0.075, k, true);
          b.crushT -= dt; if (b.crushT <= 0) { b.crushT = 0.18; this.fx.burst(b.x + fx * b.r, b.y + fy * b.r, 10, 4, { speed: 120 }); this.audio.play('wallhit', 1, this.vol(b) * 0.5); }
        }
      } else {
        const ice = w.onIce(b.x, b.y), f = Math.exp(-(ice ? 0.3 : 1.05) * dt);
        b.vx *= f; b.vy *= f;
        const hf = w.hillForce(b.x, b.y); if (hf) { b.vx += hf.x * dt * 1.6; b.vy += hf.y * dt * 1.6; }
        const sp0 = Math.hypot(b.vx, b.vy);
        if (sp0 < 4) { b.vx = 0; b.vy = 0; }
        // little abandoned ones crumble away so the map doesn't fill up
        b.idle = sp0 < 5 && b.r < 20 ? (b.idle || 0) + dt : 0;
        if (b.idle > 3.5) { this.destroyBall(b); continue; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        hit = w.push(b, b.r * 0.9, null);
        if (hit && hit.x1 !== undefined && sp0 > 40) { this.damageWall(hit, dt * b.r * 0.06 * Math.min(2, sp0 / 120) + (sp0 > 200 ? 1.5 : 0), b.owner, true); if (sp0 > 200) { b.vx *= 0.5; b.vy *= 0.5; } }
      }
      const moved = Math.hypot(b.x - ox, b.y - oy);
      if (moved > 0.4) {
        b.rot += moved / b.r;
        const sn = w.snowAt(b.x, b.y + 2);
        if (sn > 0.15) {
          w.dig(b.x, b.y + 2, b.r * 0.62, 0.75);
          b.r = Math.min(BALL_MAX, b.r + moved * 0.062 * sn * clamp(20 / b.r, 0.45, 1.3) * (b.pusher ? 1 : 0.6));
        }
        b.sndT -= dt; if (b.sndT <= 0 && moved / dt > 30) { b.sndT = 0.16; this.audio.play('roll', b.r / BALL_MAX, this.vol(b) * 0.7); }
      }
      // flatten anyone it runs into
      const sp = Math.hypot(b.vx, b.vy);
      if (b.r >= BIG_HIT_R && sp > 50) {
        for (const k of this.kids) {
          if (!k.alive || k === b.pusher || k.invuln > 0) continue;
          if (b.owner && (k === b.owner && b.ownerT > 0)) continue;
          if (this.teams && b.owner && b.owner.team === k.team) continue;
          if ((b.hitT.get(k) || -9) > this.T - 1) continue;
          if (Math.hypot(k.x - b.x, k.y - b.y) < b.r * 0.9 + KID_R + 3) {
            b.hitT.set(k, this.T);
            this.hitKid(k, b.r >= 40 ? 3 : 2, b.owner && b.owner !== k ? b.owner : null, 'big', b.vx / sp, b.vy / sp);
            if (!b.pusher) { b.vx *= 0.65; b.vy *= 0.65; }
            this.fx.burst(k.x, k.y, 10, 30, { speed: 300, size: 1.6 });
            if (this.player) this.shake = Math.max(this.shake, Math.hypot(k.x - this.camX, k.y - this.camY) < 600 ? 10 : 3);
          }
        }
      }
    }
  }
  updateDog(dt) {
    const d = this.dog, w = this.world;
    if (!d.on) {
      d.t -= dt;
      if (d.t <= 0 && this.phase === 'play') {
        const side = Math.random() < 0.5 ? -1 : 1;
        d.x = side < 0 ? EDGE + 4 : W - EDGE - 4; d.y = rand(220, H - 220); d.vx = -side * 300; d.vy = 0;
        d.on = true; d.life = 0; d.speed = 310; d.exit = -side; d.scared = false; d.stepT = 0;
        const alive = this.kids.filter((k) => k.alive); d.chase = Math.random() < 0.7 && alive.length ? pick(alive) : null;
        this.audio.play('bark', 1, 0.8); this.fx.text(d.x, d.y - 40, 'WOOF!', '#ffffff', 22);
        if (this.player && !this.demo && !this.dogSeen) { this.dogSeen = true; this.banner = { text: 'A dog got in!', t: 1.4, col: '#ffd23f', small: true }; }
      }
      return;
    }
    d.life += dt;
    let tx, ty;
    if (d.chase && d.chase.alive && d.life < 2.4) { tx = d.chase.x; ty = d.chase.y; }
    else { tx = d.exit > 0 ? W + 40 : -40; ty = d.y + Math.sin(d.life * 2) * 60; }
    const dx = tx - d.x, dy = ty - d.y, dl = Math.hypot(dx, dy) || 1;
    d.vx += (dx / dl * d.speed - d.vx) * Math.min(1, 5 * dt); d.vy += (dy / dl * d.speed - d.vy) * Math.min(1, 5 * dt);
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.x > EDGE + 20 && d.x < W - EDGE - 20) w.push(d, 12);
    d.y = clamp(d.y, EDGE + 20, H - EDGE - 20);
    d.tongue = true;
    d.stepT -= dt; if (d.stepT <= 0) { d.stepT = 0.07; w.footprint(d.x, d.y, Math.atan2(d.vy, d.vx), Math.random() < 0.5 ? 1 : -1); }
    for (const k of this.kids) {
      if (!k.alive || k.prone > 0) continue;
      if ((d.hits.get(k) || -9) > this.T - 1.2) continue;
      if (Math.hypot(k.x - d.x, k.y - d.y) < 24) {
        d.hits.set(k, this.T);
        k.stun = Math.max(k.stun, 0.5); k.prone = 0.45; k.lieDir = d.vx >= 0 ? 1 : -1; k.vx += d.vx * 0.7; k.vy += d.vy * 0.7; k.charging = false;
        if (k.ballRef) this.releaseBall(k);
        this.audio.play('bark', 1.1, this.vol(k)); this.fx.text(k.x, k.y - 66, 'WOOF!', '#ffffff', 20); this.fx.burst(k.x, k.y, 8, 10, { speed: 120 });
        if (d.chase === k) d.chase = null;
        if (k.isPlayer) this.shake = Math.max(this.shake, 5);
      }
    }
    if ((d.life > 1.2 && (d.x < EDGE - 10 || d.x > W - EDGE + 10)) || d.life > 12) { d.on = false; d.t = rand(15, 25); }
  }
  checkEnd() {
    if (this.phase !== 'play') return;
    const M = this.M;
    let reason = null;
    if (this.modeKey === 'ffa') {
      if (this.kids.filter((k) => !k.elim).length <= 1) reason = 'last';
      else if (this.player && this.player.elim && this.player.out) reason = 'out';
    } else if (this.teams) { if (this.teamKO[0] >= M.target || this.teamKO[1] >= M.target) reason = 'target'; }
    else if (this.modeKey === 'king') { if (this.kids.some((k) => k.hold >= M.target)) reason = 'target'; }
    if (!reason && this.time <= 0) { this.time = 0; reason = 'time'; }
    if (reason) this.endRound(reason);
  }
  ranking() {
    if (this.modeKey === 'ffa') {
      const alive = this.kids.filter((k) => !k.elim).sort((a, b) => b.lives - a.lives || b.hp - a.hp || b.kos - a.kos);
      return alive.concat(this.elimOrder.slice().reverse());
    }
    if (this.modeKey === 'king') return this.kids.slice().sort((a, b) => b.hold - a.hold || b.kos - a.kos);
    return this.kids.slice().sort((a, b) => b.kos - a.kos);
  }
  endRound(reason) {
    this.phase = 'end'; this.endT = 0; this.frozen = true;
    for (const k of this.kids) k.charging = false;
    this.audio.play('whistle');
    const rank = this.ranking();
    if (this.demo) { this.banner = { text: reason === 'time' ? 'TIME!' : rank[0].name + ' wins!', t: 2, col: '#fff' }; return; }
    const p = this.player, place = rank.indexOf(p);
    let win = false, title = '', sub = '', bonus = 0;
    if (this.modeKey === 'ffa') {
      win = place === 0; bonus = FFA_BONUS[place] || 0;
      title = win ? 'Last kid standing!' : `${ord(place + 1)} place`;
      sub = win ? 'Snowball royalty.' : reason === 'out' ? 'Knocked out of the fight.' : 'So close. One more go?';
    } else if (this.teams) {
      const d = this.teamKO[0] - this.teamKO[1];
      win = d > 0; bonus = win ? 250 : d === 0 ? 100 : 0;
      title = win ? 'Blue team wins!' : d === 0 ? "It's a draw" : 'Red team wins';
      sub = `${this.teamKO[0]} - ${this.teamKO[1]} knockouts`;
    } else {
      win = place === 0; bonus = KING_BONUS[place] || 0;
      title = win ? 'King of the fort!' : `${ord(place + 1)} place`;
      sub = `You held the fort for ${Math.floor(p.hold)}s`;
    }
    this.score += bonus;
    this.banner = { text: win ? (this.modeKey === 'ffa' ? 'VICTORY!' : this.teams ? 'YOU WIN!' : 'KING!') : reason === 'time' ? 'TIME!' : reason === 'out' ? 'OUT!' : 'GAME!', t: 2, col: win ? '#ffd23f' : '#ffffff' };
    this.audio.play(win ? 'win' : 'lose');
    const coins = Math.floor(this.score / 20) + (win ? 5 : 0);
    const S = this.save;
    const best = S.best[this.modeKey] || 0, newBest = this.score > best;
    if (newBest) S.best[this.modeKey] = this.score;
    S.coins += coins; S.played++; if (win) S.wins++;
    S.hints = (S.hints || 0) + 1;
    let unlock = null;
    const good = this.teams ? win : this.modeKey === 'king' ? place <= 1 : place <= 2;
    if (good && this.mapIdx + 1 < MAPS.length && this.mapIdx + 1 >= S.unlocked) { S.unlocked = this.mapIdx + 2; unlock = MAPS[this.mapIdx + 1].name; }
    this.persist();
    const rows = rank.map((k, i) => ({ name: k.name, coat: k.coat, persona: k.persona ? PERSONAS[k.persona].label : 'You', isPlayer: k.isPlayer, team: k.team, kos: k.kos, extra: this.modeKey === 'king' ? Math.floor(k.hold) + 's' : this.modeKey === 'ffa' ? (k.elim ? 'out' : '♥'.repeat(Math.max(0, k.lives))) : '', rank: i + 1 }));
    this.result = { title, sub, win, rows, score: this.score, bonus, best: Math.max(best, this.score), newBest, coins, unlock, mode: this.modeKey, stats: this.stats, place, next: this.mapIdx + 1 < S.unlocked ? this.mapIdx + 1 : null };
  }
  finish() {
    this.state = 'results';
    this.ui.hud(false);
    this.ui.show('result', this.result);
  }
  updateCam(dt) {
    let tx, ty;
    const p = this.player;
    if (p && !this.demo) {
      let f = p;
      if (!p.alive) { const o = this.kids.find((k) => k.alive && (!this.teams || k.team === p.team)) || this.kids.find((k) => k.alive); if (o && p.elim) f = o; }
      tx = f.x; ty = f.y - 20;
      if (f === p && this.pit) { tx += clamp(this.pit.ax - p.x, -300, 300) * 0.18; ty += clamp(this.pit.ay - p.y, -300, 300) * 0.18; }
    } else {
      this.demoT -= dt;
      if (this.demoT <= 0) { this.demoT = 7; this.demoFollow++; }
      const alive = this.kids.filter((k) => k.alive);
      const f = alive.length ? alive[this.demoFollow % alive.length] : null;
      tx = f ? f.x : W / 2; ty = f ? f.y : H / 2;
    }
    const k = Math.min(1, (this.demo ? 1.5 : 6) * dt);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    const { vw, vh } = this.view;
    this.camX = vw >= W ? W / 2 : clamp(this.camX, vw / 2, W - vw / 2);
    this.camY = vh >= H ? H / 2 : clamp(this.camY, vh / 2, H - vh / 2);
  }

  // ------------------------------------------------------------ rendering
  render() {
    const c = this.ctx, dpr = this.dpr, cw = this.cw, ch = this.ch;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#2a2b4a'; c.fillRect(0, 0, cw, ch);
    if (!this.world) return;
    const w = this.world, s = this.view.s, T = this.T;
    const sx = this.shake ? rand(-1, 1) * this.shake * 0.5 : 0, sy = this.shake ? rand(-1, 1) * this.shake * 0.5 : 0;
    c.save();
    c.translate(cw / 2, ch / 2); c.scale(s, s); c.translate(-this.camX + sx, -this.camY + sy);
    c.drawImage(w.ground, 0, 0);
    c.drawImage(w.lip, 0, 4);
    c.drawImage(w.snow, 0, 0);
    c.drawImage(w.props, 0, 0);
    if (this.modeKey === 'king') this.drawZone(c);
    for (const wl of w.walls) drawWallShadow(c, wl);
    const p = this.player;
    // y-sorted world
    const L = [];
    for (const wl of w.walls) L.push([Math.max(wl.y1, wl.y2) - 4, 0, wl]);
    for (const k of this.kids) if (!k.out) L.push([k.y, 1, k]);
    for (const b of w.balls) L.push([b.y, 2, b]);
    for (const tr of w.trees) L.push([tr.y, 3, tr]);
    for (const sm of w.snowmen) if (sm.hp > 0) L.push([sm.y, 4, sm]);
    for (const q of w.rects) L.push([q.y + q.h, 5, q]);
    for (const q of w.posts) L.push([q.y + (q.kind === 'bandstand' ? q.r * 0.4 : 0), 6, q]);
    for (const d of w.decor) if (d.kind === 'washing') L.push([d.y1, 7, d]);
    if (this.dog.on) L.push([this.dog.y, 8, this.dog]);
    L.sort((a, b) => a[0] - b[0]);
    const viewer = p && p.alive ? p : null;
    for (const [, kind, o] of L) {
      switch (kind) {
        case 0: drawWall(c, o, T); break;
        case 1: drawKid(c, o, T, { arrow: this.phase === 'count' || o.invuln > 0 }); break;
        case 2: drawBigBall(c, o, T); break;
        case 3: {
          let a = 1;
          const hid = viewer ? [viewer] : [];
          for (const k of hid) if (Math.abs(k.x - o.x) < 50 * o.s && k.y < o.y - 2 && k.y > o.y - 130 * o.s) a = 0.42;
          drawTree(c, o, T, a); break;
        }
        case 4: drawSnowman(c, o, T); break;
        case 5: drawRect(c, o, T); break;
        case 6: drawPost(c, o, T); break;
        case 7: drawWashing(c, o, T); break;
        case 8: drawDog(c, o, T); break;
      }
    }
    for (const sh of this.shots) drawSnowball(c, sh);
    this.fx.draw(c);
    c.drawImage(w.front, 0, 0);
    // dusk light
    c.globalCompositeOperation = 'multiply';
    c.drawImage(w.light, 0, 0);
    c.globalCompositeOperation = 'screen';
    c.drawImage(w.glow, 0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    for (const q of w.lamps) {
      const g = c.createRadialGradient(q.x, q.y - 100, 4, q.x, q.y - 60, 160);
      g.addColorStop(0, 'rgba(255,170,80,.35)'); g.addColorStop(1, 'rgba(255,170,80,0)');
      c.fillStyle = g; c.fillRect(q.x - 170, q.y - 240, 340, 360);
    }
    c.globalCompositeOperation = 'source-over';
    // incoming lobs: a landing ring that closes in, so you can step out of the way
    for (const sh of this.shots) {
      if (!sh.lob || sh.dead || this.demo) continue;
      const mine = sh.owner === p, friend = !mine && this.teams && p && sh.owner.team === p.team;
      const f = clamp(sh.t, 0, 1), danger = !mine && !friend && p && p.alive && Math.hypot(p.x - sh.tx, (p.y - sh.ty) * 1.25) < 60;
      c.globalAlpha = (mine || friend ? 0.35 : 0.55) + f * 0.4;
      c.strokeStyle = mine ? '#ffd23f' : friend ? '#9fd0ff' : '#ff5a6e'; c.lineWidth = danger ? 3.2 : 2.2;
      c.setLineDash([6, 5]); c.lineDashOffset = -T * 30;
      c.beginPath(); c.ellipse(sh.tx, sh.ty, 34 + (1 - f) * 22, (34 + (1 - f) * 22) * 0.8, 0, 0, 7); c.stroke();
      c.setLineDash([]);
      c.fillStyle = c.strokeStyle; c.globalAlpha *= 0.18 + f * 0.2;
      c.beginPath(); c.ellipse(sh.tx, sh.ty, 34 * f, 34 * f * 0.8, 0, 0, 7); c.fill();
      c.globalAlpha = 1;
    }
    // player marker over the light so you never lose yourself
    if (p && p.alive && this.state === 'play') this.drawAim(c, p);
    if (p && p.alive && !this.demo) { c.strokeStyle = 'rgba(255,210,63,.55)'; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y + 1, 20, 8.5, 0, 0, 7); c.stroke(); }
    this.fx.drawPops(c);
    c.restore();
    // vignette + flakes
    if (!this.vig || this.vig.w !== cw || this.vig.h !== ch) {
      const v = document.createElement('canvas'); v.width = Math.ceil(cw / 4); v.height = Math.ceil(ch / 4);
      const vc = v.getContext('2d'), vw = v.width, vh = v.height;
      const vg = vc.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      vg.addColorStop(0, 'rgba(20,16,50,0)'); vg.addColorStop(1, 'rgba(20,16,50,.32)');
      vc.fillStyle = vg; vc.fillRect(0, 0, vw, vh);
      this.vig = { c: v, w: cw, h: ch };
    }
    c.drawImage(this.vig.c, 0, 0, cw, ch);
    if (this.hurtT > 0) { c.globalAlpha = Math.min(1, this.hurtT * 3) * 0.5; c.drawImage(this.hurtVig(), 0, 0, cw, ch); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (const f of this.flakes) { c.globalAlpha = 0.35 + f.s * 0.15; c.beginPath(); c.arc(f.x * cw, f.y * ch, f.s, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    if (this.state === 'play' || (this.state === 'results' && false)) this.drawHUD(c);
  }
  hurtVig() {
    if (this.hv) return this.hv;
    const v = this.hv = document.createElement('canvas'); v.width = 160; v.height = 90;
    const c = v.getContext('2d'), g = c.createRadialGradient(80, 45, 30, 80, 45, 95);
    g.addColorStop(0, 'rgba(255,60,90,0)'); g.addColorStop(1, 'rgba(255,60,90,.9)');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    return v;
  }
  drawZone(c) {
    const f = this.world.fort, h = this.zoneHolder;
    const col = h === 'contested' ? '255,120,120' : h ? (h.isPlayer ? '255,210,63' : '255,255,255') : '180,200,255';
    c.save();
    c.fillStyle = `rgba(${col},${0.12 + Math.sin(this.T * 4) * 0.04})`;
    c.beginPath(); c.ellipse(f.x, f.y, f.r, f.r * 0.86, 0, 0, 7); c.fill();
    c.strokeStyle = `rgba(${col},.8)`; c.lineWidth = 4; c.setLineDash([14, 10]); c.lineDashOffset = -this.T * 30;
    c.stroke(); c.setLineDash([]);
    // flag in the middle
    c.fillStyle = '#5a3a22'; c.fillRect(f.x - 2, f.y - 70, 4, 70);
    c.fillStyle = h && h !== 'contested' ? h.coat : '#ffffff'; c.strokeStyle = INK; c.lineWidth = 2;
    const wv = Math.sin(this.T * 6) * 3;
    c.beginPath(); c.moveTo(f.x + 2, f.y - 70); c.quadraticCurveTo(f.x + 18, f.y - 64 + wv, f.x + 32, f.y - 60); c.lineTo(f.x + 2, f.y - 48); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  drawAim(c, p) {
    const it = this.pit;
    if (!it) return;
    const touchAim = this.touch.on && !this.mouse;
    if (p.charging && p.chargeT >= TAP_T) {
      const R = lobRange(p.chargeAmt);
      c.save();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.setLineDash([6, 8]);
      c.beginPath(); c.ellipse(p.x, p.y, R, R, 0, 0, 7); c.stroke();
      let dx = it.ax - p.x, dy = it.ay - p.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const Lr = clamp(d, LOB_MIN, R), tx = p.x + dx * Lr, ty = p.y + dy * Lr;
      // arc preview
      const peak = 46 + Lr * 0.22;
      c.setLineDash([3, 7]); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.beginPath();
      for (let i = 0; i <= 20; i++) { const t = i / 20, x = p.x + (tx - p.x) * t, y = p.y + (ty - p.y) * t, z = 18 * (1 - t) + peak * 4 * t * (1 - t); i ? c.lineTo(x, y - z) : c.moveTo(x, y - z); }
      c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath(); c.ellipse(tx, ty, 34, 27, 0, 0, 7); c.stroke();
      c.fillStyle = 'rgba(255,210,63,.2)'; c.fill();
      c.strokeStyle = 'rgba(255,210,63,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(tx - 8, ty); c.lineTo(tx + 8, ty); c.moveTo(tx, ty - 7); c.lineTo(tx, ty + 7); c.stroke();
      c.restore();
    } else if (touchAim || p.charging) {
      const a = p.face;
      c.save(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 3; c.setLineDash([4, 8]);
      c.beginPath(); c.moveTo(p.x + Math.cos(a) * 24, p.y - 18 + Math.sin(a) * 24); c.lineTo(p.x + Math.cos(a) * 110, p.y - 18 + Math.sin(a) * 110); c.stroke(); c.restore();
    }
  }
  drawHUD(c) {
    const cw = this.cw, ch = this.ch, p = this.player, T = this.T;
    const small = Math.min(cw, ch) < 520;
    const sc = small ? 0.8 : 1;
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const txt = (t, x, y, size, col = '#fff', align = 'center', stroke = 5) => { c.textAlign = align; c.font = `700 ${size}px Fredoka, sans-serif`; c.lineWidth = stroke; c.strokeStyle = INK; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y); };
    // timer pill
    const tm = Math.max(0, Math.ceil(this.time)), tstr = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`;
    const top = 14;
    c.fillStyle = 'rgba(44,40,70,.78)'; c.beginPath(); c.roundRect(cw / 2 - 52 * sc, top, 104 * sc, 40 * sc, 20 * sc); c.fill();
    txt(tstr, cw / 2, top + 21 * sc, 26 * sc, this.time < 10 && Math.floor(T * 4) % 2 ? '#ff8f8f' : '#ffffff', 'center', 0.01);
    // mode line
    const my = top + 40 * sc + 18 * sc;
    if (this.modeKey === 'ffa') {
      const n = this.kids.length, gap = 34 * sc;
      for (let i = 0; i < n; i++) {
        const k = this.kids[i], x = cw / 2 + (i - (n - 1) / 2) * gap;
        c.globalAlpha = k.elim ? 0.35 : 1;
        c.fillStyle = k.coat; c.strokeStyle = k.isPlayer ? '#ffd23f' : INK; c.lineWidth = k.isPlayer ? 3 : 2;
        c.beginPath(); c.arc(x, my, 10 * sc, 0, 7); c.fill(); c.stroke();
        for (let l = 0; l < 3; l++) { c.fillStyle = l < k.lives ? '#ffffff' : 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(x + (l - 1) * 6 * sc, my + 15 * sc, 2.2 * sc, 0, 7); c.fill(); }
        if (k.elim) { c.strokeStyle = '#ff8f8f'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 7, my - 7); c.lineTo(x + 7, my + 7); c.moveTo(x + 7, my - 7); c.lineTo(x - 7, my + 7); c.stroke(); }
        c.globalAlpha = 1;
      }
    } else if (this.teams) {
      txt(String(this.teamKO[0]), cw / 2 - 40 * sc, my + 2, 26 * sc, TEAM[0]);
      txt(`first to ${this.M.target}`, cw / 2, my + 2, 13 * sc, '#ffffff', 'center', 4);
      txt(String(this.teamKO[1]), cw / 2 + 40 * sc, my + 2, 26 * sc, TEAM[1]);
    } else {
      const lead = this.kids.slice().sort((a, b) => b.hold - a.hold)[0];
      const h = this.zoneHolder;
      const status = h === 'contested' ? 'FORT CONTESTED' : h ? (h.isPlayer ? 'YOU HOLD THE FORT' : `${h.name} holds the fort`) : 'Fort is empty';
      txt(status, cw / 2, my, 14 * sc, h && h !== 'contested' && h.isPlayer ? '#ffd23f' : h === 'contested' ? '#ff9f9f' : '#ffffff', 'center', 4);
      const bw = 150 * sc, bx = cw / 2 - bw / 2, by = my + 14 * sc;
      for (const [k, i] of [[p, 0], [lead === p ? this.kids.filter((o) => o !== p).sort((a, b) => b.hold - a.hold)[0] : lead, 1]]) {
        if (!k) continue;
        const y = by + i * 14 * sc;
        c.fillStyle = 'rgba(44,40,70,.7)'; c.beginPath(); c.roundRect(bx, y, bw, 10 * sc, 5); c.fill();
        c.fillStyle = k.isPlayer ? '#ffd23f' : k.coat; c.beginPath(); c.roundRect(bx, y, bw * Math.min(1, k.hold / this.M.target), 10 * sc, 5); c.fill();
        txt(`${k.isPlayer ? 'You' : k.name} ${Math.floor(k.hold)}`, bx - 6, y + 5 * sc, 12 * sc, '#ffffff', 'right', 3);
      }
    }
    // player panel: hearts, snowballs
    if (p) {
      const x0 = 16, y0 = cw < 600 ? 108 : small ? 16 : 18;
      c.fillStyle = 'rgba(44,40,70,.72)'; c.beginPath(); c.roundRect(x0 - 6, y0 - 6, 216 * sc, 62 * sc, 14); c.fill();
      for (let i = 0; i < p.maxhp; i++) heart(c, x0 + 12 * sc + i * 26 * sc, y0 + 12 * sc, 9 * sc, i < p.hp ? '#ff5a7a' : 'rgba(255,255,255,.18)');
      if (this.modeKey === 'ffa') txt(`lives ${p.lives}`, x0 + 94 * sc, y0 + 12 * sc, 13 * sc, '#ffffff', 'left', 3);
      for (let i = 0; i < MAX_AMMO; i++) {
        const x = x0 + 10 * sc + i * 24 * sc, y = y0 + 38 * sc, on = i < p.ammo;
        c.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,.14)'; c.strokeStyle = on ? '#8ea0cc' : 'transparent'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, 8 * sc, 0, 7); c.fill(); if (on) c.stroke();
        if (on) { c.fillStyle = 'rgba(150,165,215,.55)'; c.beginPath(); c.arc(x + 2, y + 2, 4.4 * sc, 0, 3.14); c.fill(); }
        if (i === WALL_COST - 1) { c.strokeStyle = 'rgba(255,210,63,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 12 * sc, y - 10 * sc); c.lineTo(x + 12 * sc, y + 10 * sc); c.stroke(); }
      }
      if (p.ammo === 0 && Math.floor(T * 3) % 2) txt('NO SNOW', x0 + 100 * sc, y0 + 38 * sc, 14 * sc, '#ff9f9f', 'center', 4);
      if (p.scoopT > 0) { const f = 1 - p.scoopT / 0.34; c.strokeStyle = '#ffffff'; c.lineWidth = 3; const sp = this.toScreen(p.x, p.y - 80); c.beginPath(); c.arc(sp.x, sp.y, 9, -1.57, -1.57 + f * 6.28); c.stroke(); }
    }
    // score
    txt(String(this.score), cw - 18, small ? 76 : 30, 26 * sc, '#ffd23f', 'right');
    txt('score', cw - 18, small ? 96 : 52, 12 * sc, '#ffffff', 'right', 3);
    // feed
    let fy = small ? 116 : 76;
    for (const f of this.feed) {
      c.globalAlpha = Math.min(1, f.t);
      const a = f.a ? (f.a.isPlayer ? 'You' : f.a.name) : 'Snow';
      const b = f.b.isPlayer ? 'you' : f.b.name;
      txt(`${a} ${f.verb} ${b}`, cw - 18, fy, 13 * sc, f.b.isPlayer ? '#ff9f9f' : f.a && f.a.isPlayer ? '#ffd23f' : '#ffffff', 'right', 3);
      fy += 18 * sc;
    }
    c.globalAlpha = 1;
    // off-screen kids
    if (p) for (const k of this.kids) {
      if (k === p || !k.alive) continue;
      const sp = this.toScreen(k.x, k.y - 24);
      if (sp.x > 0 && sp.x < cw && sp.y > 0 && sp.y < ch) continue;
      const ax = clamp(sp.x, 26, cw - 26), ay = clamp(sp.y, 90, ch - 26), an = Math.atan2(sp.y - ch / 2, sp.x - cw / 2);
      c.save(); c.translate(ax, ay); c.rotate(an);
      c.fillStyle = this.teams ? TEAM[k.team] : k.coat; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.moveTo(12, 0); c.lineTo(-6, -8); c.lineTo(-6, 8); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    // countdown / banners / out
    if (this.phase === 'count') {
      const n = Math.ceil(this.countT), f = this.countT - Math.floor(this.countT);
      txt(String(n), cw / 2, ch * 0.42, (80 + f * 40) * sc, '#ffffff', 'center', 8);
      txt(this.M.name, cw / 2, ch * 0.42 + 70 * sc, 22 * sc, '#ffd23f', 'center', 5);
      txt(this.M.blurb, cw / 2, ch * 0.42 + 100 * sc, 15 * sc, '#ffffff', 'center', 4);
    }
    if (this.banner) {
      const b = this.banner; if (!b.t0) b.t0 = b.t; const age = b.t0 - b.t, pop = age < 0.15 ? 0.5 + age / 0.15 * 0.7 : age < 0.25 ? 1.2 - (age - 0.15) : 1.1;
      c.globalAlpha = Math.min(1, b.t * 5);
      txt(b.text, cw / 2, ch * (b.small ? 0.3 : 0.4), (b.small ? 30 : 76) * sc * pop, b.col, 'center', b.small ? 5 : 9);
      c.globalAlpha = 1;
    }
    if (p && !p.alive && this.phase === 'play') {
      if (p.elim) txt("You're out! Watching...", cw / 2, ch * 0.62, 22 * sc, '#ffffff');
      else if (p.out) txt(`Back in ${Math.max(0, p.outT).toFixed(1)}`, cw / 2, ch * 0.62, 24 * sc, '#ffffff');
    }
    if (this.hintT > 0 && this.phase === 'play' && !this.touch.on && cw > 760) {
      c.globalAlpha = Math.min(1, this.hintT / 1.5);
      txt('WASD move · click throw · HOLD click to lob · Space dive · E scoop · R roll · Q wall', cw / 2, ch - 22, 14, '#ffffff', 'center', 4);
      c.globalAlpha = 1;
    }
    // touch sticks
    if (this.touch.on) {
      for (const [st, col] of [[this.touch.move, 'rgba(255,255,255,'], [this.touch.aim, 'rgba(255,210,63,']]) {
        if (!st) continue;
        c.fillStyle = col + '.12)'; c.strokeStyle = col + '.5)'; c.lineWidth = 3;
        c.beginPath(); c.arc(st.ox, st.oy, 56, 0, 7); c.fill(); c.stroke();
        const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), m = Math.min(1, 56 / (d || 1));
        c.fillStyle = col + '.55)'; c.beginPath(); c.arc(st.ox + dx * m, st.oy + dy * m, 24, 0, 7); c.fill();
      }
      if (!this.touch.move && this.time > ROUND_T - 8) { txt('drag here to move', cw * 0.22, ch - 60, 14, 'rgba(255,255,255,.8)', 'center', 3); txt('drag to aim · let go to throw · hold = lob', cw * 0.62, ch - 60, 13, 'rgba(255,255,255,.8)', 'center', 3); }
    } else if (this.mouse && this.state === 'play') {
      const m = this.mouse;
      c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(m.x, m.y, 9, 0, 7); c.stroke();
      c.strokeStyle = p && p.ammo ? '#ffffff' : '#ff9f9f'; c.lineWidth = 2; c.beginPath(); c.arc(m.x, m.y, 9, 0, 7); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(m.x, m.y, 2, 0, 7); c.fill();
      if (p && p.charging) { const f = p.chargeT < TAP_T ? 0 : p.chargeAmt; c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath(); c.arc(m.x, m.y, 15, -1.57, -1.57 + f * 6.28); c.stroke(); }
    }
    c.restore();
  }
}

function heart(c, x, y, r, col) {
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  c.fill(); c.stroke();
}
function ord(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

new Game();
