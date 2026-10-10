// STACK ATTACK - catch falling burger parts on a wobbly bun, in the order on
// the ticket, then catch the top bun to serve. The tower sways.
import { FOOD, INGREDIENTS, JUNK, SHIFTS, rushShift, SKINS, makeOrder, CUSTOMERS } from './levels.js';
import { Stack, P } from './sim.js';
import { drawFood, drawSauceBlob, paintBackdrop, drawGull, drawFace, drawCustomer, roundRect, O } from './draw.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'pd.stack-attack';
const MAXV = 1500, MAXA = 6500, DT = 1 / 240;
const KEY_SPEED = 950;
const INTRO = 2.2;                  // the shift card; the first drop starts falling during GO!
const FALL_DIST = 1060;            // spawn height above the counter, whatever the screen shape
const CATCH = 0.86;                 // catch if you land within this share of the top piece's half-width
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const CRUMB = { patty: ['#7a3c1c', '#a9622f'], cheese: ['#ffc52b', '#ffe476'], lettuce: ['#5bbf38', '#9ae35e'], tomato: ['#e5352a', '#ff7b5f'], onion: ['#f6ebff', '#a65ac4'], pickles: ['#80bd3d', '#c9ec7a'], bacon: ['#d4433a', '#ffb7a3'], egg: ['#fffaf0', '#ffb41f'], top: ['#f0a33c', '#fff3d6'], bun: ['#f0a33c', '#ffe9bb'], boot: ['#6d4421', '#9b6a3d'], fish: ['#7db6d8', '#e6f3f7'], sock: ['#e8412c', '#f5f0e6'] };
const HUES = ['#ffd9b8', '#f2c49b', '#c98f62', '#8d5a3a', '#ffe0c9', '#e8b48a'];
const PRAISE = ['NICE!', 'YUM!', 'SWEET!', 'TASTY!', 'NAILED IT!', 'CHEF\'S KISS!', 'DELISH!'];

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { stars: {}, best: {}, unlocked: 1, rush: 0, rushUnlocked: false, skin: 'classic', music: 0.55, sfx: 0.9, mutedMusic: false, mutedSfx: false, seenHow: false };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
    Object.assign(this.audio, { music: this.save.music, sfx: this.save.sfx, mutedMusic: this.save.mutedMusic, mutedSfx: this.save.mutedSfx });
    this.bg = document.createElement('canvas');
    this.time = 0;
    this.fast = +(params.get('fast') || 1);
    this.botOn = params.has('bot');
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.mode = 'title';
    this.newRound(2, true);
    this.ui.show('title');
    if (params.has('shift')) this.startShift(clamp(parseInt(params.get('shift'), 10) || 1, 1, SHIFTS.length));
    else if (params.has('rush')) this.startRush();
    else if (params.has('play')) this.startShift(this.nextShift());
    window.__G = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  get skin() { return SKINS.find((s) => s.id === this.save.skin) || SKINS[0]; }
  totalStars() { let n = 0; for (const k in this.save.stars) n += this.save.stars[k] || 0; return n; }
  nextShift() { for (let i = 1; i <= SHIFTS.length; i++) if (!this.save.stars[i]) return Math.min(i, this.save.unlocked); return SHIFTS.length; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    this.dpr = dpr;
    this.scale = Math.min(H / (H < 560 ? 780 : 920), W / 560);
    this.VW = W / this.scale; this.VH = H / this.scale;
    this.gy = this.VH - 120;
    this.colW = Math.min(this.VW, 1050); this.colL = (this.VW - this.colW) / 2;
    this.narrow = this.VW < 1000;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.bg.width = this.canvas.width; this.bg.height = this.canvas.height;
    const b = this.bg.getContext('2d');
    b.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    paintBackdrop(b, this.VW, this.VH, this.gy, this.colL, this.colW);
    if (this.stack) { this.stack.y = this.gy; this.stack.x = clamp(this.stack.x, this.minX, this.maxX); this.target = this.stack.x; this.stack.fk(); }
  }
  get minX() { return this.colL + 84; }
  get maxX() { return this.colL + this.colW - 84; }
  toWorld(cx) { return cx / this.scale; }

  // ------------------------------------------------------------ input
  input() {
    this.keys = new Set();
    this.drag = null;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.pointerType === 'mouse') { this.target = this.toWorld(e.clientX); this.mouseOn = true; }
      else this.drag = { id: e.pointerId, x: this.toWorld(e.clientX), t: this.target };
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.target = this.toWorld(e.clientX); this.mouseOn = true; }
      else if (this.drag && this.drag.id === e.pointerId) this.target = this.drag.t + (this.toWorld(e.clientX) - this.drag.x) * 1.15;
    });
    const up = (e) => { if (this.drag && this.drag.id === e.pointerId) this.drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open) { if (this.mode === 'play' && (this.ui.panel === 'pause')) this.ui.close(); else if (this.ui.panel !== 'title' && this.ui.panel !== 'result') this.ui.back(); }
        else if (this.mode === 'play') { this.audio.play('click'); this.ui.show('pause'); }
        return;
      }
      if (e.code === 'KeyR' && (this.mode === 'play' || this.mode === 'over')) { this.restart(); return; }
      if ((e.code === 'Space' || e.code === 'Enter') && this.ui.open) { e.preventDefault(); this.ui.primary(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); if (this.mode === 'play' && !this.ui.open) this.ui.show('pause'); });
  }
  keyDir() {
    const k = this.keys;
    return (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  }

  // ------------------------------------------------------------ rounds
  newRound(shiftN, demo = false, rush = false) {
    this.demo = demo; this.rush = rush; this.shiftN = shiftN;
    this.sh = rush ? rushShift(0) : SHIFTS[shiftN - 1];
    this.timeLeft = this.sh.time; this.elapsed = 0;
    this.cash = 0; this.shownCash = 0; this.served = 0; this.perfects = 0; this.streak = 0; this.bestStreak = 0; this.plates = 3;
    this.stats = { caught: 0, wrong: 0, junk: 0, topples: 0, steals: 0, missed: 0, served: 0 };
    this.items = []; this.debris = []; this.parts = []; this.pops = []; this.coins = []; this.flyers = []; this.streaks = [];
    const x = this.stack ? clamp(this.stack.x, this.minX, this.maxX) : this.VW / 2;
    this.stack = new Stack(x, this.gy); this.target = x;
    this.bunIn = true; this.bunDrop = 0;
    this.orderNo = 0; this.order = null; this.newOrder();
    this.dropT = demo ? 0.4 : 0; this.sinceNeed = 0; this.firstDrop = !demo;
    this.gull = null; this.gullT = this.sh.gull ? this.sh.gull * 0.6 : 0;
    this.wind = 0; this.windTarget = 0; this.windT = 2;
    this.combo = 0;
    this.cust = { joy: 0, yuck: 0, say: '', sayT: 0, sayK: 0, leave: 0, prev: null };
    this.introT = demo ? 0 : INTRO;
    this.ended = false; this.endT = 0;
    this.slowT = 0; this.freeze = 0; this.shake = 0;
    this.creakT = 0; this.tickS = 0;
    this.acc = 0;
  }
  startShift(n) {
    this.ui.close();
    this.mode = 'play';
    this.newRound(n, false, false);
    this.ui.hud(true);
    if (!navigator.userActivation || navigator.userActivation.hasBeenActive) this.audio.unlock(); this.audio.play('go');
  }
  startRush() {
    this.ui.close();
    this.mode = 'play';
    this.newRound(0, false, true);
    this.ui.hud(true);
    if (!navigator.userActivation || navigator.userActivation.hasBeenActive) this.audio.unlock(); this.audio.play('go');
  }
  restart() { if (this.rush) this.startRush(); else this.startShift(this.shiftN); }
  toTitle() { this.mode = 'title'; this.ui.hud(false); this.newRound(2 + Math.floor(Math.random() * 6), true); this.ui.show('title'); }

  newOrder() {
    this.orderNo++;
    const items = makeOrder(this.sh);
    this.order = { items, progress: 0, mistakes: 0, tip: 1, n: this.orderNo, name: pick(CUSTOMERS), hue: pick(HUES), slide: 1, mood: 0.8, flash: 0, seed: Math.floor(Math.random() * 1000) };
  }
  get custOn() { return this.colL >= 170; }
  custX() { return this.colL / 2; }
  say(text, t = 1.3) { const c = this.cust; if (!c) return; c.say = text; c.sayT = t; c.sayK = 0.3; }
  custLeave(mood) { const c = this.cust, o = this.order; c.prev = { seed: o.seed, hue: o.hue, mood, say: c.say, sayK: c.sayK }; c.leave = 1; c.say = ''; c.sayT = 0; }
  needed() { const o = this.order; return o.progress >= o.items.length ? 'top' : o.items[o.progress]; }
  recount() {
    const o = this.order; let ok = 0, bad = 0;
    for (const p of this.stack.pieces) { if (p.kind === 'bun') continue; if (p.ok) ok++; else bad++; }
    o.progress = ok; o.mistakes = bad;
  }

  // ------------------------------------------------------------ spawning
  spawn() {
    const sh = this.sh, o = this.order;
    const need = this.needed();
    if (this.firstDrop) { // the very first drop: the piece you need, close to the bun, so the first catch comes in ~3 s
      this.firstDrop = false; this.sinceNeed = 0;
      this.addItem(need, null, clamp(this.stack.x + rand(-160, 160), this.colL + 90, this.colL + this.colW - 90));
      return;
    }
    const fallingNeed = this.items.some((it) => it.kind === need && !it.passed);
    let kind;
    const r = Math.random();
    if (r < sh.junk) kind = pick(JUNK);
    else if (r < sh.junk + sh.sauce) kind = 'sauce';
    else {
      let pNeed = need === 'top' ? Math.min(0.75, sh.need + 0.1) : sh.need;
      if (fallingNeed) pNeed = 0.22;
      if ((this.sinceNeed >= 2 && !fallingNeed) || Math.random() < pNeed) kind = need;
      else if (need !== 'top' && o.progress > 0 && Math.random() < 0.08) kind = 'top';
      else { const pool = INGREDIENTS.slice(0, sh.kinds).filter((k) => k !== need); kind = pick(pool); }
    }
    if (kind === need) this.sinceNeed = 0; else this.sinceNeed++;
    this.addItem(kind);
    if (sh.multi && Math.random() < sh.multi) {
      const pool = INGREDIENTS.slice(0, sh.kinds);
      this.addItem(Math.random() < 0.3 && sh.junk ? pick(JUNK) : pick(pool), this.items[this.items.length - 1].x);
    }
  }
  addItem(kind, awayFrom, atX) {
    const L = this.colL + 90, R = this.colL + this.colW - 90;
    let x = atX ?? rand(L, R);
    const last = this.items[this.items.length - 1];
    for (let k = 0; k < 8 && atX == null; k++) {
      const bad = (awayFrom != null && Math.abs(x - awayFrom) < 300) || (last && last.y < this.spawnY + 140 && Math.abs(x - last.x) < 170);
      if (!bad) break;
      x = rand(L, R);
    }
    const f = FOOD[kind] || { w: 36, h: 36 };
    const fall = this.sh.fall * clamp((this.gy - this.spawnY) / (FALL_DIST - 70), 0.65, 1);
    this.items.push({
      kind, x, y: this.spawnY, vx: 0, vy: fall * 0.55, vmax: fall * 1.5, rot: 0, rot0: rand(-0.2, 0.2), vr: rand(-0.8, 0.8), t: 0,
      w: f.w, h: f.h, passed: false, sauce: kind === 'sauce' ? pick(['#d8231b', '#d8231b', '#ffb000']) : null, seed: Math.random() * 10,
    });
  }
  get spawnY() { return Math.max(this.narrow ? this.ticketBottom() + 100 : -70, this.gy - FALL_DIST); }

  // ------------------------------------------------------------ main loop
  loop(now) {
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const paused = this.mode === 'play' && this.ui.open;
    if (!paused) this.frame(dt * this.fast);
    this.render();
    this.audio.intensity = this.mode === 'play' ? clamp(0.25 + this.elapsed / Math.max(60, this.sh.time === Infinity ? 200 : this.sh.time) * 0.6 + (this.timeLeft < 15 ? 0.25 : 0), 0, 1) : 0.2;
    this.audio.update(dt, this.mode === 'play' && !paused);
    requestAnimationFrame((t) => this.loop(t));
  }

  frame(dt) {
    this.time += dt;
    if (this.freeze > 0) { this.freeze -= dt; this.fx(dt * 0.15); return; }
    let ts = 1;
    if (this.slowT > 0) { this.slowT -= dt; ts = 0.35; }
    this.acc += dt * ts;
    let n = 0;
    while (this.acc >= DT && n < 120) { this.tick(DT); this.acc -= DT; n++; }
    if (n >= 120) this.acc = 0;
    this.fx(dt * ts);
    // the cash counter rolls up
    this.shownCash = this.shownCash + (this.cash - this.shownCash) * Math.min(1, dt * 6);
    if (Math.abs(this.cash - this.shownCash) < 0.01) this.shownCash = this.cash;
  }

  tick(dt) {
    const playing = this.mode === 'play' || this.demo;
    if (this.mode === 'play' && !this.ended) {
      this.elapsed += dt;
      if (this.introT > 0) this.introT -= dt;
      else if (!this.rush) {
        const before = Math.ceil(this.timeLeft);
        this.timeLeft -= dt;
        if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== before && this.timeLeft > 0) this.audio.play('tick');
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.endShift(); }
      }
      if (this.rush) { const r = rushShift(this.elapsed); Object.assign(this.sh, r); }
    }
    if (this.ended) { this.endT += dt; }

    // ---- bun control
    const st = this.stack;
    if (this.demo || (this.botOn && this.mode === 'play')) this.bot();
    const kd = this.keyDir();
    if (kd) { this.target = clamp((this.keyTarget ?? st.x) + kd * KEY_SPEED * dt, st.x - 140, st.x + 140); this.keyTarget = this.target; }
    else this.keyTarget = null;
    this.target = clamp(this.target, this.minX, this.maxX);
    // a taller tower is heavier: the bun gets a little less twitchy
    const vmax = MAXV / (1 + 0.03 * st.count), amax = MAXA / (1 + 0.09 * st.count);
    const dv = clamp((this.target - st.x) * 12, -vmax, vmax);
    let a = clamp((dv - st.vx) / dt, -amax, amax);
    st.vx += a * dt; st.x += st.vx * dt;
    if (st.x < this.minX || st.x > this.maxX) { st.x = clamp(st.x, this.minX, this.maxX); a = -st.vx / dt * 0.3; st.vx = 0; }
    st.ax = a;

    // ---- wind
    if (this.sh.wind) {
      this.windT -= dt;
      if (this.windT <= 0) {
        this.windT = rand(2.5, 5.5);
        this.windTarget = Math.random() < 0.25 ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1) * this.sh.wind;
        if (Math.abs(this.windTarget) > 0.4 && playing && !this.demo) this.audio.play('whoosh');
      }
    } else this.windTarget = 0;
    this.wind += (this.windTarget - this.wind) * Math.min(1, dt * 1.2);

    // ---- stack physics
    if (this.bunIn) {
      const broke = st.step(dt, this.wind);
      if (broke >= 1) this.topple(broke);
    } else {
      st.fk();
      this.bunDrop -= dt;
      if (this.bunDrop <= 0) { this.bunIn = true; st.pieces[0].sq = 0.5; this.audio.play('squish'); this.puff(st.x, this.gy, '#fff6e2', 8); }
    }
    if (st.danger > 0.72 && this.bunIn) {
      this.creakT -= dt;
      if (this.creakT <= 0) { this.creakT = 0.35 - st.danger * 0.2; this.audio.play('creak'); }
    }

    // ---- order clock (tip drains)
    const o = this.order;
    if (this.introT <= 0 && !this.ended) o.tip = Math.max(0, o.tip - dt / (8 + 2.6 * o.items.length));
    o.slide = Math.max(0, o.slide - dt * 3.5);
    o.flash = Math.max(0, o.flash - dt * 2.5);
    o.mood = lerp(o.mood, o.tip, Math.min(1, dt * 3));

    // ---- spawning
    const canSpawn = playing && this.introT <= 0.7 && !this.ended;
    if (canSpawn) {
      this.dropT -= dt;
      if (this.dropT <= 0) { this.spawn(); this.dropT = this.sh.drop * rand(0.85, 1.15); }
    }

    // ---- falling things
    this.updateItems(dt);
    // ---- gull
    if (this.sh.gull && canSpawn) {
      if (!this.gull) { this.gullT -= dt; if (this.gullT <= 0 && st.count >= 2 && this.bunIn) this.spawnGull(); }
    }
    if (this.gull) this.updateGull(dt);
    // ---- debris
    this.updateDebris(dt);
    // ---- served burgers flying off
    for (const f of this.flyers) f.t += dt;
    this.flyers = this.flyers.filter((f) => f.t < f.dur);

    if (this.ended && this.endT > 1.3 && !this.resultShown) { this.resultShown = true; this.showResult(); }
    if (this.demo && this.stack.count > 13) this.topple(1);
  }

  updateItems(dt) {
    const st = this.stack;
    for (const it of this.items) {
      it.t += dt;
      it.vy = Math.min(it.vmax, it.vy + 300 * dt);
      it.vx += this.wind * 110 * dt; it.vx *= Math.pow(0.6, dt);
      it.x += it.vx * dt; it.y += it.vy * dt;
      if (it.passed) it.rot += it.vr * dt; else it.rot = it.rot0 + Math.sin(it.t * 2.4 + it.seed) * 0.2;
      const L = this.colL + 40, R = this.colL + this.colW - 40;
      if (it.x < L) { it.x = L; it.vx = Math.abs(it.vx) * 0.5; } else if (it.x > R) { it.x = R; it.vx = -Math.abs(it.vx) * 0.5; }
      if (it.passed || it.dead) { if (it.y + it.h / 2 > this.gy) { this.toDebris(it); it.dead = true; if (!this.demo) this.audio.play('splat'); } continue; }
      if (!this.bunIn) continue;
      const hh = it.kind === 'sauce' ? 16 : it.h / 2;
      const { lx, ly } = st.local(it.x, it.y + hh);
      const top = st.top, thw = top.w / 2, ihw = it.kind === 'sauce' ? 16 : it.w / 2;
      if (ly >= -2) {
        if (ly > 44 || Math.abs(lx) > thw + ihw * 0.55) { if (ly > 44) { it.passed = true; if (it.kind === this.needed()) { this.stats.missed++; this.sinceNeed = 9; } } continue; }
        if (it.kind === 'sauce') { if (Math.abs(lx) < thw * 0.98) this.catchSauce(it); else it.passed = true; continue; }
        if (Math.abs(lx) <= thw * CATCH && !(it.kind === 'top' && st.count === 0)) this.catchItem(it, lx);
        else this.bonk(it, lx);
      }
    }
    this.items = this.items.filter((it) => !it.dead && !it.caught && it.y < this.VH + 100);
  }

  catchItem(it, lx) {
    const st = this.stack, o = this.order;
    it.caught = true;
    const vxRel = it.vx - st.vx;
    const p = st.add(it.kind, lx, it.vy, vxRel);
    const top = st.top;
    this.stats.caught++;
    this.crumbs(top.tx, top.ty + top.h * 0.5, it.kind, 10);
    this.ring(top.tx, top.ty + top.h * 0.4, '#ffffff');
    if (FOOD[it.kind].junk) { this.junk(p); return; }
    if (it.kind === 'top') { this.serve(); return; }
    const need = this.needed();
    if (it.kind === need) {
      p.ok = true; o.progress++; this.combo++;
      o.tip = Math.min(1, o.tip + 0.05);
      this.audio.play('catch', 1 + o.progress * 0.07);
      if (o.progress === o.items.length) { this.pop('TOP BUN!', top.tx, top.ty - 60, '#ffc52b', 46); this.audio.play('perfect'); }
      else if (this.combo > 0 && this.combo % 4 === 0) this.pop(pick(PRAISE), top.tx, top.ty - 50, '#fff6e2', 38);
      else this.pop('+' + FOOD[it.kind].name, top.tx + rand(-20, 20), top.ty - 30, '#7be37b', 26);
      this.sparkles(top.tx, top.ty, 5);
    } else {
      p.ok = false; o.mistakes++; this.combo = 0; this.stats.wrong++;
      o.tip = Math.max(0, o.tip - 0.12); o.flash = 1;
      this.audio.play('catch', 0.8); this.audio.play('wrong');
      this.pop('WRONG!', top.tx, top.ty - 40, '#ff5a4a', 34);
      this.say(pick(['I said ' + FOOD[need].name.toLowerCase() + '!', 'Huh?', 'Not that!']), 1.1);
      this.shake = Math.max(this.shake, 4);
    }
    if (Math.abs(lx) > top.w * 0.36) this.pop('wobble!', top.tx + Math.sign(lx) * 90, top.ty - 10, '#fff6e2', 22);
  }
  catchSauce(it) {
    const st = this.stack;
    it.caught = true;
    st.top.sauced = it.sauce;
    st.top.sq = Math.max(st.top.sq, 0.25);
    this.audio.play('sauce');
    for (let i = 0; i < 12; i++) this.parts.push({ x: st.top.tx, y: st.top.ty, vx: rand(-260, 260), vy: rand(-380, -60), life: rand(0.4, 0.8), max: 0.8, c: it.sauce, r: rand(3, 7), g: 1400 });
    this.pop('SLIPPERY!', st.top.tx, st.top.ty - 50, it.sauce === '#ffb000' ? '#ffd23a' : '#ff6b5a', 34);
  }
  bonk(it, lx) {
    it.passed = true;
    const st = this.stack;
    if (it.kind === 'top' && st.count === 0) { this.pop('Fill it first!', it.x, it.y - 40, '#fff6e2', 26); }
    it.vx = Math.sign(lx || 1) * rand(260, 420) + st.vx * 0.3; it.vy = -Math.abs(it.vy) * 0.35; it.vr = Math.sign(lx || 1) * rand(5, 9);
    // a nudge to the tower
    for (let i = 1; i < st.pieces.length; i++) st.pieces[i].av -= Math.sign(lx) * 0.4 * (i / st.pieces.length);
    st.top.sq = Math.max(st.top.sq, 0.15);
    this.audio.play('bonk');
    this.crumbs(it.x, it.y + it.h / 2, it.kind, 4);
  }

  serve() {
    const st = this.stack, o = this.order, len = o.items.length;
    const complete = o.progress / len, perfect = o.progress === len && o.mistakes === 0;
    const base = 1.5 + 1.25 * len;
    const accuracy = complete * Math.max(0, 1 - 0.25 * o.mistakes);
    let pay = base * accuracy;
    let tip = (perfect ? base * 0.8 : base * 0.4 * accuracy) * o.tip;
    if (perfect) { this.streak++; this.perfects++; pay += 1 + 0.5 * (this.streak - 1); } else this.streak = 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    pay = Math.round(pay * 4) / 4; tip = Math.round(tip * 4) / 4;
    const total = pay + tip;
    this.cash += this.demo ? 0 : total;
    this.served++; this.stats.served++;
    const top = st.top;
    // the burger zips off to the ticket
    const snap = st.pieces.map((p) => ({ kind: p.kind, w: p.w, h: p.h, sauced: p.sauced, seed: p.seed, rx: p.px - st.x, ry: p.py - st.y, phi: p.phi }));
    const toCust = this.custOn;
    this.flyers.push({ pieces: snap, x0: st.x, y0: st.y, x1: toCust ? this.custX() : this.VW / 2, y1: toCust ? this.gy - 120 : (this.narrow ? 90 : 80), t: 0, dur: 0.6 });
    this.cust.joy = accuracy >= 0.75 ? 1 : 0.4;
    this.say(perfect ? pick(['PERFECT!', 'Delish!', 'Mmm-MM!', 'Chef!']) : accuracy >= 0.75 ? pick(['Yum!', 'Thanks!', 'Not bad!']) : pick(['Huh?', 'Weird...', 'Ugh.']), 1.2);
    const label = perfect ? 'PERFECT!' : accuracy >= 0.75 ? 'ORDER UP!' : accuracy > 0.3 ? 'Meh...' : 'Is this a joke?';
    this.pop(label, top.tx, top.ty - 70, perfect ? '#ffc52b' : accuracy >= 0.75 ? '#fff6e2' : '#ff8a6a', perfect ? 56 : 44);
    this.pop('+$' + total.toFixed(2), top.tx, top.ty - 15, '#7be37b', 40);
    if (perfect && this.streak > 1) this.pop(this.streak + ' IN A ROW!', top.tx, top.ty + 30, '#ff7aa8', 28);
    this.audio.play('serve');
    setTimeout(() => this.audio.play('cash'), 280);
    if (perfect) { this.freeze = 0.07; this.audio.play('perfect'); this.sparkles(top.tx, top.ty, 16); }
    this.shake = Math.max(this.shake, 6);
    const coins = Math.min(14, 3 + Math.round(total / 2));
    for (let i = 0; i < coins; i++) this.coins.push({ x: top.tx + rand(-40, 40), y: top.ty + rand(-20, 20), vx: rand(-300, 300), vy: rand(-500, -200), t: -i * 0.03, home: 0 });
    // a fresh bottom bun drops in
    this.stack = new Stack(st.x, this.gy); this.stack.vx = st.vx;
    this.bunIn = false; this.bunDrop = 0.32;
    this.combo = 0;
    this.custLeave(1);
    this.newOrder();
  }

  junk(p) {
    const st = this.stack;
    this.stats.junk++;
    this.audio.play('yuck');
    this.pop('YUCK!', st.top.tx, st.top.ty - 60, '#9be26b', 60);
    this.pop(this.order.name + ' walked out', st.top.tx, st.top.ty - 10, '#fff6e2', 24);
    this.shake = Math.max(this.shake, 12);
    this.order.flash = 1;
    // fling the whole thing
    this.collapse(1, 1.6);
    this.streak = 0; this.combo = 0;
    if (this.rush && !this.demo) this.losePlate();
    this.cust.yuck = 1; this.say('EWW!', 1.2); this.custLeave(0);
    this.newOrder();
  }
  topple(i) {
    const lost = this.stack.pieces.length - i;
    (this.stats.log = this.stats.log || []).push({ ...this.stack.why, wind: +this.wind.toFixed(2) });
    const fresh = this.time - (this.lastTopple || -9) > 0.6;
    this.lastTopple = this.time;
    this.collapse(i, 1);
    this.recount();
    if (!fresh) return;
    this.say(pick(['My burger!', 'Noooo!', 'Oh no!']), 1.2);
    this.stats.topples++;
    this.slowT = 0.55;
    this.shake = Math.max(this.shake, 16);
    if (!this.demo || Math.random() < 0.5) this.audio.play('topple');
    this.pop(pick(['TIMBER!', 'OOPS!', 'KERSPLAT!', 'WHOOPS!']), this.stack.x, this.gy - 260, '#ff5a4a', 60);
    this.recount();
    this.order.tip = Math.max(0, this.order.tip - 0.2);
    this.combo = 0;
    if (this.rush && !this.demo && lost >= 2) this.losePlate();
  }
  losePlate() {
    if (this.ended || this.plates <= 0) return;
    this.plates--;
    this.pop(this.plates > 0 ? this.plates + (this.plates === 1 ? ' PLATE LEFT' : ' PLATES LEFT') : 'OUT OF PLATES!', this.VW / 2, this.gy - 420, '#ff5a4a', 36);
    if (this.plates <= 0 && !this.ended) { this.ended = true; this.endT = 0; this.audio.play('lose'); }
  }
  // turn pieces i.. into tumbling debris
  collapse(i, force) {
    const st = this.stack;
    const lean = st.top.tx - st.x;
    const dir = Math.abs(lean) > 6 ? Math.sign(lean) : (Math.random() < 0.5 ? -1 : 1);
    const vels = st.pieces.map((_, k) => st.vel(k, DT));
    const cut = st.cut(i);
    cut.forEach((p, k) => {
      const v = vels[i + k];
      const up = (k + 1) / cut.length;
      this.debris.push({
        kind: p.kind, w: p.w, h: p.h, sauced: p.sauced, seed: p.seed,
        x: p.cx, y: p.cy, ang: p.phi,
        vx: clamp(v.x, -900, 900) + dir * rand(80, 260) * (0.5 + up) * force + rand(-60, 60),
        vy: clamp(v.y, -600, 600) - rand(80, 320) * force * (0.4 + up),
        av: dir * rand(2, 7) * (0.5 + up) * force, life: 3.2, bounces: 0,
      });
      this.crumbs(p.cx, p.cy, p.kind, 3);
    });
    st.fk();
  }
  toDebris(it) {
    this.debris.push({ kind: it.kind, w: it.w, h: it.h, sauced: false, seed: it.seed, x: it.x, y: this.gy - 6, ang: it.rot, vx: it.vx * 0.5, vy: -Math.abs(it.vy) * 0.25, av: it.vr, life: 2.2, bounces: 1, sauce: it.sauce });
    this.crumbs(it.x, this.gy - 4, it.kind === 'sauce' ? 'tomato' : it.kind, 5);
  }
  updateDebris(dt) {
    const gy = this.gy;
    for (const d of this.debris) {
      d.life -= dt;
      d.vy += 2400 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.ang += d.av * dt;
      const r = d.sauce ? 10 : d.h / 2 + Math.abs(Math.sin(d.ang)) * (d.w / 2 - d.h / 2) * 0.9;
      if (d.y + r > gy) {
        d.y = gy - r;
        if (d.vy > 120) {
          if (d.bounces < 3 && !this.demo) this.audio.play('thud', Math.min(1, d.vy / 900));
          d.bounces++;
          d.vy = -d.vy * 0.32; d.vx *= 0.7; d.av = d.av * 0.5 + d.vx * 0.004;
          this.crumbs(d.x, gy - 2, d.kind === 'sauce' ? 'tomato' : d.kind, 2);
        } else {
          d.vy = 0; d.vx *= Math.pow(0.02, dt);
          // settle flat
          const flat = Math.round(d.ang / Math.PI) * Math.PI;
          d.ang += (flat - d.ang) * Math.min(1, dt * 8); d.av *= Math.pow(0.01, dt);
        }
      }
    }
    this.debris = this.debris.filter((d) => d.life > 0 && d.x > -300 && d.x < this.VW + 300);
    if (this.debris.length > 50) this.debris.splice(0, this.debris.length - 50);
  }

  // ------------------------------------------------------------ seagull
  spawnGull() {
    const face = Math.random() < 0.5 ? 1 : -1;
    this.gull = { state: 'in', x: face > 0 ? -80 : this.VW + 80, y: this.gy - 520, face, t: 0, flap: 0, carry: null, tx: 0, ty: 0, sx: 0, sy: 0 };
    this.audio.play('gull');
  }
  updateGull(dt) {
    const g = this.gull, st = this.stack, top = st.top;
    g.flap += dt * (g.state === 'dive' ? 8 : 14);
    g.t += dt;
    const hoverY = Math.max(this.spawnY + 200, top.ty - 230);
    if (g.state === 'in') {
      const dx = top.tx - g.x;
      g.x += clamp(dx * 2.2, -650, 650) * dt;
      g.y += (hoverY - g.y) * Math.min(1, dt * 3);
      g.face = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) < 40 || g.t > 3) { g.state = 'warn'; g.t = 0; this.audio.play('warn'); }
    } else if (g.state === 'warn') {
      g.x += (top.tx - g.x) * Math.min(1, dt * 1.6);
      g.y = hoverY + Math.sin(g.t * 9) * 6;
      if (g.t > 1.15) {
        if (st.count === 0 || !this.bunIn) { g.state = 'out'; g.t = 0; }
        else { g.state = 'dive'; g.t = 0; g.sx = g.x; g.sy = g.y; g.tx = top.tx; g.ty = top.ty - 6; this.audio.play('gull'); }
      }
    } else if (g.state === 'dive') {
      const k = Math.min(1, g.t / 0.45), e = k * k;
      g.x = lerp(g.sx, g.tx, k); g.y = lerp(g.sy, g.ty, e);
      if (k >= 1) {
        const cur = st.top;
        if (this.bunIn && st.count > 0 && Math.abs(cur.tx - g.x) < 70 && Math.abs(cur.ty - g.y) < 70) {
          const [p] = st.cut(st.pieces.length - 1);
          st.fk();
          g.carry = p; this.stats.steals++;
          this.recount();
          this.audio.play('steal');
          this.pop('STOLEN!', g.x, g.y - 60, '#ff5a4a', 44);
          this.say('Hey! Shoo!', 1.1);
          this.feathers(g.x, g.y, 8);
          for (let i = 1; i < st.pieces.length; i++) st.pieces[i].av += rand(-1, 1);
          this.shake = Math.max(this.shake, 6);
        } else {
          this.pop('MISSED!', g.x, g.y - 50, '#7be37b', 36);
          this.feathers(g.x, g.y, 4);
          this.audio.play('gull');
        }
        g.state = 'out'; g.t = 0;
      }
    } else {
      g.x += g.face * 520 * dt; g.y -= 420 * dt;
      if (g.y < -150 || g.x < -200 || g.x > this.VW + 200) { this.gull = null; this.gullT = this.sh.gull * rand(0.8, 1.25); }
    }
  }

  // ------------------------------------------------------------ the bot (attract mode, ?bot=1 tests)
  bot() {
    const st = this.stack, top = st.top;
    const need = this.needed();
    const surfY = top.ty;
    const offTop = top.tx - st.x;
    // centre of mass of the stack, relative to the bun
    let m = 0, mx = 0;
    for (const p of st.pieces) { m += p.m; mx += p.m * p.cx; }
    const comOff = mx / m - st.x;
    let best = null;
    for (const it of this.items) {
      if (it.passed || it.caught) continue;
      const tLand = (surfY - (it.y + it.h / 2)) / Math.max(60, it.vy);
      if (tLand < 0) continue;
      if (it.kind === need && (need !== 'top' || st.count > 0)) {
        const reach = Math.abs(it.x - st.x) / (MAXV / (1 + 0.03 * st.count)) + 0.15 + st.count * 0.02;
        if (reach < tLand + 0.05 && (!best || tLand < best.t)) best = { it, t: tLand };
      }
    }
    // land the piece where it pulls the weight back over the bun
    const hw = top.w / 2;
    const d = clamp(-comOff * 1.4, offTop - hw * 0.5, offTop + hw * 0.5);
    let tx = st.x;
    if (best) tx = best.it.x - d;
    else tx = lerp(st.x, (this.colL + this.colW / 2), 0.01);
    // dodge bad stuff that would land on us soon
    for (const it of this.items) {
      if (it.passed || it.caught || it === (best && best.it)) continue;
      if (it.kind === need && it.kind !== 'top') continue;
      if (it.kind === 'top' && need === 'top' && st.count > 0) continue;
      const tLand = (surfY - (it.y + it.h / 2)) / Math.max(60, it.vy);
      if (tLand < 0 || tLand > 0.75) continue;
      const reachW = hw + (it.kind === 'sauce' ? 16 : it.w / 2 * 0.55) + 24;
      const px = tx + offTop;
      if (Math.abs(it.x - px) < reachW) tx = it.x > px ? it.x - offTop - reachW - 12 : it.x - offTop + reachW + 12;
    }
    // gull: slide away while it dives
    if (this.gull && (this.gull.state === 'dive' || (this.gull.state === 'warn' && this.gull.t > 0.8))) {
      const gx = this.gull.state === 'dive' ? this.gull.tx : this.gull.x;
      if (Math.abs(gx - top.tx) < 170) tx = st.x + (gx > top.tx ? -240 : 240);
    }
    tx = clamp(tx, this.minX, this.maxX);
    // smooth hands: tall stacks get gentler moves
    const lead = Math.max(160, 440 - st.count * 28);
    this.target = clamp(tx, st.x - lead, st.x + lead);
  }

  // ------------------------------------------------------------ end of shift
  endShift() {
    if (this.ended) return;
    this.ended = true; this.endT = 0;
    this.audio.play('bell');
    this.pop('CLOSING TIME!', this.VW / 2, this.gy - 450, '#ffc52b', 64);
  }
  showResult() {
    const s = this.save;
    if (this.rush) {
      const best = this.cash > (s.rush || 0);
      if (best) s.rush = this.cash;
      this.persist();
      this.ui.show('rushover', { cash: this.cash, best, top: s.rush, served: this.served, perfects: this.perfects, time: this.elapsed });
      this.mode = 'over';
      return;
    }
    const n = this.shiftN, th = this.sh.stars;
    const stars = th.filter((t) => this.cash >= t).length;
    const before = this.totalStars();
    const prevBest = s.best[n] || 0;
    if (stars > (s.stars[n] || 0)) s.stars[n] = stars;
    if (this.cash > prevBest) s.best[n] = this.cash;
    if (stars >= 1) s.unlocked = Math.max(s.unlocked, Math.min(SHIFTS.length, n + 1));
    const newRush = !s.rushUnlocked && (s.stars[2] || 0) >= 1;
    if (newRush) s.rushUnlocked = true;
    const after = this.totalStars();
    const newSkins = SKINS.filter((k) => k.need > before && k.need <= after);
    this.persist();
    this.mode = 'over';
    this.ui.show('result', { n, cash: this.cash, stars, th, best: Math.max(prevBest, this.cash), newBest: this.cash > prevBest && prevBest > 0, served: this.served, perfects: this.perfects, streak: this.bestStreak, newSkins, newRush, last: n >= SHIFTS.length, unlockedNext: stars >= 1 });
  }

  // ------------------------------------------------------------ effects
  pop(text, x, y, color, size = 32) {
    const near = this.pops.filter((p) => p.t < 0.5 && Math.abs(p.x - x) < 220 && Math.abs(p.y - y) < 50).length;
    y -= near * (size * 0.9 + 6);
    this.pops.push({ text, x, y, color, size, t: 0, life: 1.1 }); }
  crumbs(x, y, kind, n) {
    const cols = CRUMB[kind] || ['#ffffff', '#dddddd'];
    for (let i = 0; i < n; i++) this.parts.push({ x: x + rand(-30, 30), y, vx: rand(-280, 280), vy: rand(-420, -120), life: rand(0.35, 0.7), max: 0.7, c: pick(cols), r: rand(2.5, 6), g: 1500, sq: Math.random() < 0.5 });
  }
  sparkles(x, y, n) { for (let i = 0; i < n; i++) this.parts.push({ x: x + rand(-60, 60), y: y + rand(-30, 10), vx: rand(-80, 80), vy: rand(-220, -80), life: rand(0.4, 0.8), max: 0.8, c: '#fff6b0', r: rand(4, 8), g: 200, star: true }); }
  feathers(x, y, n) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: rand(-200, 200), vy: rand(-200, 50), life: rand(0.8, 1.4), max: 1.4, c: '#ffffff', r: rand(4, 7), g: 120, feather: true, rot: rand(0, 6) }); }
  puff(x, y, c, n) { for (let i = 0; i < n; i++) this.parts.push({ x: x + rand(-80, 80), y: y - 4, vx: rand(-120, 120), vy: rand(-60, -10), life: rand(0.3, 0.5), max: 0.5, c, r: rand(6, 12), g: 0, soft: true }); }
  ring(x, y, c) { this.parts.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, c, r: 10, g: 0, ring: true }); }
  fx(dt) {
    for (const p of this.parts) { p.life -= dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > this.gy && p.g > 500) { p.y = this.gy; p.vy *= -0.3; p.vx *= 0.6; } if (p.rot != null) p.rot += dt * 4; }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < p.life);
    const cash = this.cashPos();
    for (const c of this.coins) {
      c.t += dt;
      if (c.t < 0) continue;
      if (c.t < 0.35) { c.vy += 1400 * dt; c.x += c.vx * dt; c.y += c.vy * dt; }
      else { c.home = Math.min(1, c.home + dt * 2.8); c.x = lerp(c.x, cash.x, c.home * 0.35); c.y = lerp(c.y, cash.y, c.home * 0.35); }
      if (c.home > 0.6 && Math.hypot(c.x - cash.x, c.y - cash.y) < 30) { c.done = true; this.cashBump = 1; if (!this.demo) this.audio.play('pop', 1.5 + Math.random() * 0.5); }
    }
    this.coins = this.coins.filter((c) => !c.done);
    this.cashBump = Math.max(0, (this.cashBump || 0) - dt * 4);
    // wind streaks
    if (Math.abs(this.wind) > 0.15 && Math.random() < Math.abs(this.wind) * dt * 30) {
      const dir = Math.sign(this.wind);
      this.streaks.push({ x: dir > 0 ? this.colL - 100 : this.colL + this.colW + 100, y: rand(this.spawnY + 60, this.gy - 60), v: dir * rand(900, 1400), len: rand(60, 160), life: 1.6 });
    }
    for (const s of this.streaks) { s.x += s.v * dt; s.life -= dt; }
    this.streaks = this.streaks.filter((s) => s.life > 0);
    this.shake = Math.max(0, this.shake - dt * 40);
    const c = this.cust;
    if (c) {
      c.joy = Math.max(0, c.joy - dt * 0.9); c.yuck = Math.max(0, c.yuck - dt * 0.9); c.leave = Math.max(0, c.leave - dt * 1.4);
      c.sayT -= dt; c.sayK += ((c.sayT > 0 ? 1 : 0) - c.sayK) * Math.min(1, dt * 14);
      if (c.prev) { c.prev.sayK = Math.max(0, c.prev.sayK - dt * 1.2); if (c.leave <= 0) c.prev = null; }
      if (this.mode === 'play' && this.order.tip < 0.25 && !this.order.nagged && this.introT <= 0) { this.order.nagged = true; this.say(pick(['Hurry up!', 'Any day now...', "I'm starving!"]), 1.4); }
    }
  }
  cashPos() { return this.narrow ? { x: 70, y: this.ticketBottom() + 40 } : { x: 120, y: 60 }; }
  ticketBottom() { return this.narrow ? 164 : 154; }

  // ------------------------------------------------------------ rendering
  render() {
    const ctx = this.ctx, s = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    const sx = this.shake ? rand(-1, 1) * this.shake : 0, sy = this.shake ? rand(-1, 1) * this.shake : 0;
    ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
    const t = this.time;
    // wind streaks
    ctx.lineCap = 'round';
    for (const w of this.streaks) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.55, w.life * 0.5)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - Math.sign(w.v) * w.len, w.y + Math.sin(w.x * 0.02) * 6); ctx.stroke();
    }
    // debris on the counter
    for (const d of this.debris) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang);
      ctx.globalAlpha = clamp(d.life / 0.6, 0, 1);
      if (d.kind === 'sauce') { ctx.scale(1.6, 0.5); drawSauceBlob(ctx, 14, d.sauce, t); }
      else { ctx.translate(0, d.h / 2); drawFood(ctx, d.kind, d.w, d.h, { skin: this.skin, seed: d.seed, sauced: d.sauced, t }); }
      ctx.restore();
    }
    // shadows of falling food on the counter
    for (const it of this.items) {
      if (it.passed) continue;
      const k = clamp(1 - (this.gy - it.y) / FALL_DIST, 0, 1);
      ctx.fillStyle = `rgba(59,30,20,${0.05 + 0.12 * k})`;
      ctx.beginPath(); ctx.ellipse(it.x, this.gy + 8, (it.w || 30) * (0.25 + 0.25 * k), 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (this.custOn) this.drawCustomers(ctx, t);
    this.drawStack(ctx, t);
    for (const f of this.flyers) this.drawFlyer(ctx, f, t);
    // falling food
    const need = this.needed();
    for (const it of this.items) this.drawItem(ctx, it, it.kind === need && !it.passed && (need !== 'top' || this.stack.count > 0), t);
    if (this.gull) this.drawGullObj(ctx, this.gull, t);
    this.drawParts(ctx);
    // HUD
    if (this.mode === 'play' || this.mode === 'over') this.drawHUD(ctx, t);
    for (const c of this.coins) if (c.t >= 0) this.drawCoin(ctx, c.x, c.y, 13);
    this.drawPops(ctx);
    if (this.mode === 'play' && this.introT > 0) this.drawIntro(ctx, t);
  }

  drawStack(ctx, t) {
    const st = this.stack, skin = this.skin;
    // shadow
    ctx.fillStyle = 'rgba(59,30,20,0.22)';
    ctx.beginPath(); ctx.ellipse(st.x, this.gy + 6, 100 + Math.abs(st.top.tx - st.x) * 0.3, 11, 0, 0, Math.PI * 2); ctx.fill();
    let dropY = 0;
    if (!this.bunIn) { const k = clamp(this.bunDrop / 0.32, 0, 1); dropY = -k * k * 500; }
    const danger = this.bunIn ? st.danger : 0;
    for (let i = 0; i < st.pieces.length; i++) {
      const p = st.pieces[i];
      ctx.save();
      ctx.translate(p.px, p.py + dropY);
      ctx.rotate(p.phi);
      ctx.scale(1 + p.sq * 0.35, 1 - p.sq * 0.6);
      drawFood(ctx, p.kind, p.w, p.h, { skin, seed: p.seed, sauced: p.sauced, t });
      if (p.kind === 'bun') { // a spatula handle so it reads as "yours"
      }
      ctx.restore();
    }
    // danger: wobble warning
    if (danger > 0.68 && st.count > 0) {
      const p = st.pieces[Math.max(1, st.dangerAt)];
      const top = st.top;
      const k = clamp((danger - 0.68) / 0.32, 0, 1);
      const x = clamp(top.tx + Math.sign(top.tx - st.x || 1) * 120, 40, this.VW - 40), y = top.ty - 30;
      ctx.save(); ctx.translate(x, y); const sc = 0.8 + k * 0.4 + Math.sin(t * 22) * 0.08; ctx.scale(sc, sc);
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fillStyle = '#ff4a3a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = O; ctx.stroke();
      this.text(ctx, '!', 0, 14, 40, '#fff', 'center');
      ctx.restore();
      void p;
    }
  }
  drawCustomers(ctx, t) {
    const c = this.cust, o = this.order, x = this.custX(), y = this.gy - 4;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.VW, this.gy + 22); ctx.clip();
    if (c.prev) { const k = 1 - c.leave; drawCustomer(ctx, x - k * 60, y + k * k * 260, { t, seed: c.prev.seed, hue: c.prev.hue, mood: c.prev.mood, joy: c.prev.mood > 0.5 ? c.leave : 0, yuck: c.prev.mood < 0.5 ? c.leave : 0, say: c.prev.say, sayK: c.prev.sayK }); }
    const up = c.prev ? clamp(1 - c.leave * 1.4, 0, 1) : 1;
    if (up > 0) { const e = 1 - Math.pow(1 - up, 3); drawCustomer(ctx, x, y + (1 - e) * 260, { t, seed: o.seed, hue: o.hue, mood: o.mood, joy: c.prev ? 0 : c.joy, yuck: c.prev ? 0 : c.yuck, say: c.prev ? '' : c.say, sayK: c.sayK }); }
    ctx.restore();
    // name tag
  }
  drawFlyer(ctx, f, t) {
    const k = clamp(f.t / f.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
    const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 120;
    const sc = lerp(1, 0.25, e);
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(Math.sin(k * Math.PI) * 0.3);
    ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    for (const p of f.pieces) {
      ctx.save(); ctx.translate(p.rx, p.ry); ctx.rotate(p.phi);
      drawFood(ctx, p.kind, p.w, p.h, { skin: this.skin, seed: p.seed, sauced: p.sauced, t });
      ctx.restore();
    }
    ctx.restore();
  }
  drawItem(ctx, it, glow, t) {
    ctx.save(); ctx.translate(it.x, it.y);
    if (it.kind === 'sauce') { ctx.rotate(it.vx * 0.001); drawSauceBlob(ctx, 16, it.sauce, t); ctx.restore(); return; }
    ctx.rotate(it.rot);
    // falling food is drawn plump; it squashes flat when it lands
    const wob = 1 + Math.sin(it.t * 9) * 0.05;
    ctx.scale(0.94 * wob, 1.55 * (2 - wob));
    if (glow) {
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 8) * 0.2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, it.w / 2 + 16, it.h / 2 + 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.translate(0, it.h / 2);
    drawFood(ctx, it.kind, it.w, it.h, { skin: this.skin, seed: it.seed, t });
    ctx.restore();
    if (FOOD[it.kind].junk) { // stink lines
      ctx.strokeStyle = 'rgba(110,170,60,0.8)'; ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const yy = it.y - it.h / 2 - 12 - k * 6, xx = it.x + i * 22 + Math.sin(t * 8 + k + i) * 5; if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
        ctx.stroke();
      }
    }
  }
  drawGullObj(ctx, g, t) {
    if (g.state === 'warn' || g.state === 'dive') {
      // target marker on the stack top
      const top = this.stack.top;
      const x = g.state === 'dive' ? g.tx : top.tx;
      ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(t * 20) * 0.3;
      ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 5; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.ellipse(x, top.ty - 6, 70, 18, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      if (g.state === 'warn') {
        ctx.save(); ctx.translate(g.x, g.y - 64); const sc = 1 + Math.sin(t * 18) * 0.12; ctx.scale(sc, sc);
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fillStyle = '#ff4a3a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = O; ctx.stroke();
        this.text(ctx, '!', 0, 12, 34, '#fff', 'center'); ctx.restore();
      }
    }
    ctx.save(); ctx.translate(g.x, g.y);
    if (g.state === 'dive') ctx.rotate(0.5 * g.face);
    if (g.state === 'out') ctx.rotate(-0.3 * g.face);
    drawGull(ctx, g.flap, !!g.carry, g.face);
    if (g.carry) { ctx.translate(g.face * 56, 10); ctx.rotate(0.3 * g.face); ctx.scale(0.55, 0.55); drawFood(ctx, g.carry.kind, g.carry.w, g.carry.h, { skin: this.skin, seed: g.carry.seed, sauced: g.carry.sauced, t }); }
    ctx.restore();
  }
  drawParts(ctx) {
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      if (p.ring) { ctx.strokeStyle = p.c; ctx.lineWidth = 5 * a; ctx.beginPath(); ctx.arc(p.x, p.y, 20 + (1 - a) * 90, 0, Math.PI * 2); ctx.stroke(); }
      else if (p.star) { this.star(ctx, p.x, p.y, p.r * (0.5 + a)); }
      else if (p.feather) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.8, p.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = O; ctx.stroke(); ctx.restore(); }
      else if (p.soft) { ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill(); }
      else if (p.sq) { ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  drawCoin(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#ffc52b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.stroke();
    ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  text(ctx, str, x, y, size, fill, align = 'left', lw) {
    ctx.font = `${size}px "Lilita One", "Arial Black", sans-serif`;
    ctx.textAlign = align; ctx.lineJoin = 'round';
    ctx.lineWidth = lw ?? Math.max(4, size * 0.2); ctx.strokeStyle = O; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }
  drawPops(ctx) {
    for (const p of this.pops) {
      const k = p.t / p.life;
      const sc = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : k < 0.25 ? 1.2 - (k - 0.15) * 2 : 1;
      ctx.save(); ctx.translate(clamp(p.x, 140, this.VW - 140), p.y - k * 60); ctx.scale(sc, sc); ctx.rotate(Math.sin(p.t * 3 + p.x) * 0.04);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      this.text(ctx, p.text, 0, 0, p.size, p.color, 'center');
      ctx.restore();
    }
  }

  drawHUD(ctx, t) {
    const o = this.order;
    // ---- ticket
    const len = o.items.length;
    // on narrow screens the ticket sits left of the pause button
    const L = 12, R = this.narrow ? this.VW - 70 / this.scale - 4 : this.VW - 12;
    const maxW = Math.min(R - L, 760), cx = this.narrow ? (L + R) / 2 : this.VW / 2;
    const icon = clamp((maxW - 110) / (len + 1.4), 30, 58);
    const tw = Math.min(maxW, 100 + icon * (len + 1.4)), th = icon + 84;
    const tx = cx - tw / 2 + o.slide * (this.VW * 0.7), ty = 12;
    ctx.save();
    ctx.translate(cx + o.slide * this.VW * 0.7, ty); ctx.rotate(Math.sin(t * 1.7) * 0.008 + o.flash * Math.sin(t * 40) * 0.03); ctx.translate(-cx - o.slide * this.VW * 0.7, -ty);
    // rail + clip
    ctx.fillStyle = '#c9d3d6'; ctx.fillRect(tx - 20, ty - 12, tw + 40, 10); ctx.strokeStyle = O; ctx.lineWidth = 3; ctx.strokeRect(tx - 20, ty - 12, tw + 40, 10);
    // paper with a torn bottom edge
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + tw, ty); ctx.lineTo(tx + tw, ty + th);
    for (let x = tx + tw, k = 0; x > tx; x -= 14, k++) ctx.lineTo(x - 7, ty + th + (k % 2 ? 0 : 7));
    ctx.lineTo(tx, ty + th); ctx.closePath();
    ctx.fillStyle = o.flash > 0 ? `rgb(255,${Math.round(250 - o.flash * 90)},${Math.round(238 - o.flash * 110)})` : '#fffaee'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = O; ctx.stroke();
    ctx.fillStyle = 'rgba(232,65,44,0.15)'; ctx.fillRect(tx + 4, ty + 30, tw - 8, 2);
    // header
    ctx.font = '600 17px "Fredoka", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8412c';
    ctx.fillText(`ORDER #${o.n} · ${o.name.toUpperCase()}`, tx + 70, ty + 24);
    if (o.mistakes) { ctx.textAlign = 'right'; ctx.fillStyle = '#e8412c'; ctx.fillText('✗'.repeat(Math.min(5, o.mistakes)), tx + tw - 14, ty + 24); }
    drawFace(ctx, tx + 36, ty + th / 2 + 4, 24, o.mood, o.hue, t);
    // icon labels: shrink the font so the longest name fits its slot; too small and only the current one gets a tag
    ctx.font = '700 12px "Fredoka", sans-serif';
    const longest = Math.max(...o.items.map((k) => ctx.measureText(FOOD[k].name.toUpperCase()).width), ctx.measureText('TOP BUN').width * 0.8);
    const labSize = Math.min(12.5, 12 * (icon - 5) / longest), allLabels = labSize >= 8.5;
    // icons: bottom of the burger first
    const ix0 = tx + 72, iy = ty + 36;
    for (let i = 0; i <= len; i++) {
      const kind = i < len ? o.items[i] : 'top';
      const x = ix0 + i * icon + (i === len ? icon * 0.3 : 0);
      const done = i < o.progress, cur = i === o.progress;
      const bob = cur ? Math.sin(t * 8) * 3 : 0;
      if (cur) { roundRect(ctx, x + 1, iy - 1, icon - 2, icon, 10); ctx.fillStyle = '#ffe38a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#e8a400'; ctx.stroke(); }
      if (i === len) { ctx.fillStyle = O; ctx.font = '700 18px "Fredoka", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('→', x - icon * 0.15, iy + icon / 2 + 6); }
      const f = FOOD[kind];
      const sc = (icon - 8) / f.w * 1.12, sy = sc * Math.min(2.2, Math.max(1, (icon * 0.5) / (f.h * sc)));
      ctx.save(); ctx.translate(x + icon / 2, iy + icon / 2 + f.h * sy / 2 + bob);
      ctx.scale(sc, sy); if (done) ctx.globalAlpha = 0.35;
      drawFood(ctx, kind, f.w, f.h, { skin: this.skin, t });
      ctx.restore();
      // name under each icon: thin slices (onion, egg, cheese) are hard to read edge-on
      const lab = kind === 'top' ? 'TOP BUN' : f.name.toUpperCase();
      ctx.font = `700 ${allLabels ? labSize.toFixed(1) : 11}px "Fredoka", sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = cur ? '#e8412c' : done ? 'rgba(59,30,20,0.35)' : 'rgba(59,30,20,0.75)';
      if (allLabels || cur) {
        const lx = clamp(x + icon / 2, tx + 40, tx + tw - 40);
        if (!allLabels) { const w = ctx.measureText(lab).width + 10; roundRect(ctx, lx - w / 2, iy + icon + 2, w, 15, 7); ctx.fillStyle = '#e8412c'; ctx.fill(); ctx.fillStyle = '#fffaee'; }
        ctx.fillText(lab, lx, iy + icon + 13);
      }
      if (done) { ctx.strokeStyle = '#3aa845'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + icon * 0.3, iy + icon * 0.5); ctx.lineTo(x + icon * 0.45, iy + icon * 0.68); ctx.lineTo(x + icon * 0.75, iy + icon * 0.3); ctx.stroke(); }
    }
    // tip meter
    const bx = tx + 72, by = ty + th - 18, bw = tw - 72 - 18;
    roundRect(ctx, bx, by, bw, 10, 5); ctx.fillStyle = '#eadfc8'; ctx.fill();
    const tc = o.tip > 0.6 ? '#4cc35a' : o.tip > 0.3 ? '#ffc52b' : '#ff5a4a';
    if (o.tip > 0.01) { roundRect(ctx, bx, by, Math.max(10, bw * o.tip), 10, 5); ctx.fillStyle = tc; ctx.fill(); }
    roundRect(ctx, bx, by, bw, 10, 5); ctx.lineWidth = 2.5; ctx.strokeStyle = O; ctx.stroke();
    ctx.font = '700 13px "Fredoka", sans-serif'; ctx.fillStyle = O; ctx.textAlign = 'left'; ctx.fillText('TIP', bx - 34, by + 10);
    ctx.restore();

    // ---- cash
    const cp = this.cashPos();
    ctx.save(); ctx.translate(cp.x, cp.y); const cb = 1 + (this.cashBump || 0) * 0.15; ctx.scale(cb, cb);
    this.drawCoin(ctx, -38, -12, 20);
    this.text(ctx, '$' + this.shownCash.toFixed(2), -10, 2, 40, '#fff6e2', 'left');
    ctx.restore();
    if (!this.rush && this.sh.stars) {
      // star targets under the cash
      const th3 = this.sh.stars;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = this.cash >= th3[i] ? '#ffc52b' : 'rgba(59,30,20,0.25)'; this.star(ctx, cp.x - 38 + i * 26, cp.y + 30, 11); }
      const nextT = th3.find((x) => this.cash < x);
      if (nextT != null) { ctx.font = '600 15px "Fredoka", sans-serif'; ctx.fillStyle = O; ctx.textAlign = 'left'; ctx.fillText('next ★ $' + nextT, cp.x + 40, cp.y + 36); }
    }
    // ---- timer / plates
    const tp = this.narrow ? { x: this.VW - 120, y: this.ticketBottom() + 40 } : { x: this.VW - 70 / this.scale - 120, y: 60 };
    if (this.rush) {
      for (let i = 0; i < 3; i++) {
        const x = tp.x - 30 + i * 44, y = tp.y - 8, on = i < this.plates;
        ctx.beginPath(); ctx.ellipse(x, y, 19, 12, 0, 0, Math.PI * 2); ctx.fillStyle = on ? '#ffffff' : 'rgba(59,30,20,0.25)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.stroke();
        if (on) { ctx.beginPath(); ctx.ellipse(x, y, 11, 6, 0, 0, Math.PI * 2); ctx.strokeStyle = '#2fb7b0'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      ctx.font = '600 15px "Fredoka", sans-serif'; ctx.fillStyle = O; ctx.textAlign = 'center';
      ctx.fillText('RUSH HOUR · ' + Math.floor(this.elapsed) + 's', tp.x + 14, tp.y + 30);
    } else {
      const left = this.timeLeft, frac = left / this.sh.time, hot = left <= 10 && left > 0;
      const r = 28 * (hot ? 1 + Math.max(0, Math.sin(t * 12)) * 0.08 : 1);
      ctx.beginPath(); ctx.arc(tp.x, tp.y - 6, r, 0, Math.PI * 2); ctx.fillStyle = '#fffaee'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tp.x, tp.y - 6); ctx.arc(tp.x, tp.y - 6, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.closePath(); ctx.fillStyle = hot ? '#ff5a4a' : '#2fb7b0'; ctx.fill();
      ctx.beginPath(); ctx.arc(tp.x, tp.y - 6, r, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = O; ctx.stroke();
      this.text(ctx, String(Math.ceil(left)), tp.x + 44, tp.y + 6, 36, hot ? '#ff5a4a' : '#fff6e2', 'left');
    }
    // ---- wind arrow
    if (this.sh.wind && Math.abs(this.wind) > 0.08) {
      const wx = tp.x + 30, wy = tp.y + 70;
      const dir = Math.sign(this.wind), mag = Math.min(1, Math.abs(this.wind) / 1.3);
      ctx.save(); ctx.translate(wx, wy); ctx.globalAlpha = 0.5 + mag * 0.5;
      ctx.font = '700 16px "Fredoka", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = O; ctx.fillText('WIND', 0, -16);
      ctx.scale(dir, 1);
      ctx.beginPath(); const L = 40 + mag * 50; ctx.moveTo(-L, -6); ctx.lineTo(L - 10, -6); ctx.lineTo(L - 10, -14); ctx.lineTo(L + 12, 0); ctx.lineTo(L - 10, 14); ctx.lineTo(L - 10, 6); ctx.lineTo(-L, 6); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.stroke();
      ctx.restore();
    }
  }
  drawIntro(ctx, t) {
    const k = this.introT, cx = this.VW / 2, cy = this.gy - 500;
    const inK = clamp((INTRO - k) / 0.3, 0, 1), outK = clamp(k / 0.35, 0, 1);
    const a = Math.min(inK, outK);
    if (k < 0.7) { // GO!
      const g = clamp((0.7 - k) / 0.7, 0, 1);
      ctx.save(); ctx.translate(cx, cy + 40); ctx.scale(0.6 + g * 0.8, 0.6 + g * 0.8); ctx.globalAlpha = 1 - g * 0.6;
      this.text(ctx, 'GO!', 0, 0, 110, '#ffc52b', 'center'); ctx.restore();
      return;
    }
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(0.8 + 0.2 * inK, 0.8 + 0.2 * inK);
    const w = Math.min(this.VW - 30, 640);
    roundRect(ctx, -w / 2, -80, w, 170, 24); ctx.fillStyle = '#fffaee'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = O; ctx.stroke();
    ctx.fillStyle = '#e8412c'; roundRect(ctx, -w / 2, -80, w, 46, 24); ctx.fill(); ctx.fillRect(-w / 2, -50, w, 16);
    ctx.lineWidth = 5; ctx.strokeStyle = O; roundRect(ctx, -w / 2, -80, w, 170, 24); ctx.stroke();
    this.text(ctx, this.rush ? 'RUSH HOUR' : `SHIFT ${this.shiftN}`, 0, -45, 32, '#fff6e2', 'center');
    this.text(ctx, this.sh.name, 0, 12, 44, '#ffc52b', 'center');
    ctx.font = '600 19px "Fredoka", sans-serif'; ctx.fillStyle = O; ctx.textAlign = 'center';
    wrap(ctx, this.sh.tip, 0, 44, w - 50, 23);
    ctx.restore();
  }
}

function wrap(ctx, str, x, y, maxW, lh) {
  const words = str.split(' '); let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

window.__P = P;
new Game();
