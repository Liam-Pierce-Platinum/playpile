// BOMB SQUAD: game loop, state, input, effects and the campaign/endless/daily flow.
import { genBomb, keypadColumn, MODULE_NAMES, TAP_MAX, DIRS, MAZES, STRIP_DIGIT } from './rules.js';
import { createModule, act, tick, codeShown } from './modules.js';
import { CAMPAIGN, campaignSpec, endlessSpec, dailySpec, dailySeed, todayKey, newSeed } from './levels.js';
import { rng, shuffle } from './rng.js';
import * as D from './draw.js';
import { Audio } from './audio.js';
import { Manual } from './manual.js';
import { UI, fmtT } from './ui.js';

const SAVE_KEY = 'pd.bomb-squad';
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const SIMON_TONE = { red: 523, blue: 659, green: 784, yellow: 440 };
const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.cv = document.getElementById('c');
    this.c = this.cv.getContext('2d');
    this.audio = new Audio();
    this.ui = new UI(this);
    this.manual = new Manual(document.getElementById('manual'), () => this.resize());
    this.manual.onFlip = () => this.audio.play('ui');
    this.save = { unlocked: 1, stars: [], best: [], endless: 0, daily: null, music: 0.5, sfx: 0.9, muted: false };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
    this.audio.music = this.save.music; this.audio.sfx = this.save.sfx; this.audio.muted = this.save.muted;
    this.state = 'title'; this.paused = false;
    this.t = 0; this.anim = {}; this.parts = []; this.pops = []; this.shake = 0; this.hitStop = 0; this.flashRed = 0; this.tScale = 1;
    this.focus = -1; this.hover = null; this.kb = false; this.strikes = 0; this.timeLeft = 59; this.total = 60;
    this.makeDemo();
    window.__G = this;
    this.bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play' && !this.paused) this.setPause(true); });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    // boot
    if (params.has('mods')) {
      const mods = params.get('mods').split(',').filter(Boolean);
      this.startSpec({ name: 'Test bomb', mods, needy: params.get('needy') === '1', time: +(params.get('time') || 60), diff: {} }, 'test', +(params.get('seed') || newSeed()));
    } else if (params.has('bomb')) this.startCampaign(Math.max(0, Math.min(CAMPAIGN.length - 1, +params.get('bomb') - 1)));
    else if (params.has('endless')) this.startEndless(true);
    else if (params.has('daily')) this.startDaily();
    else if (params.get('play') === '1') this.startCampaign(Math.min(this.save.unlocked, CAMPAIGN.length) - 1);
    else this.toTitle();
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  saveVol() { this.save.music = this.audio.music; this.save.sfx = this.audio.sfx; this.save.muted = this.audio.muted; this.persist(); }

  // ---------- flow ----------
  makeDemo() {
    const b = genBomb({ mods: ['wires', 'button', 'keypad', 'simon'], needy: true, time: 59 }, 4242);
    this.demo = { bomb: b, mods: b.modules.map(m => createModule(m, b.widgets)) };
    const v = this.demo.mods[4]; v.active = true; v.left = 9; v.color = 'blue';
  }
  toTitle() {
    this.state = 'title'; this.paused = false; this.mode = null;
    this.bomb = this.demo.bomb; this.mods = this.demo.mods;
    this.focus = -1; this.boomFx = null; this.defused = false; this.strikes = 0;
    this.manual.root.classList.add('hidden');
    this.ui.setHud(''); this.ui.title(); this.audio.mode = 'menu'; this.resize();
  }
  action(a, v) {
    switch (a) {
      case 'campaign': this.startCampaign(+v); break;
      case 'select': this.state = 'title'; this.bomb = this.demo.bomb; this.mods = this.demo.mods; this.manual.root.classList.add('hidden'); this.ui.setHud(''); this.audio.mode = 'menu'; this.resize(); this.ui.select(); break;
      case 'endless': this.startEndless(true); break;
      case 'daily': this.startDaily(); break;
      case 'title': this.toTitle(); break;
      case 'settings': this.ui.settings(); break;
      case 'keys': this.keysBack = this.ui.screen; this.ui.keys(this.ui.screen === 'pause' ? 'backpause' : this.state === 'play' ? 'closekeys' : 'title'); if (this.state === 'play' && !this.paused) this.setPause(true, true); break;
      case 'backpause': this.ui.pause(); break;
      case 'closekeys': if (this.state === 'play') this.setPause(false); else this.toTitle(); break;
      case 'pause': this.setPause(true); break;
      case 'resume': this.setPause(false); break;
      case 'retry': this.retry(); break;
      case 'next': this.next(); break;
      case 'manual': this.manual.setOpen(!this.manual.open); break;
    }
  }
  startCampaign(i) { this.mode = 'campaign'; this.level = i; const seed = +(params.get('seed') || newSeed()); this.startSpec(campaignSpec(i, seed), 'campaign', seed); }
  startEndless(fresh) { if (fresh) { this.endlessN = 0; } this.mode = 'endless'; const seed = newSeed(); this.startSpec(endlessSpec(this.endlessN, seed), 'endless', seed); }
  startDaily() { this.mode = 'daily'; const seed = dailySeed(); this.startSpec(dailySpec(seed), 'daily', seed); }
  retry() {
    if (this.mode === 'campaign') this.startCampaign(this.level);
    else if (this.mode === 'endless') this.startEndless(this.state === 'boom' || this.state === 'play');
    else if (this.mode === 'daily') this.startDaily();
    else if (this.lastSpec) this.startSpec(this.lastSpec, this.mode, newSeed());
  }
  next() {
    if (this.mode === 'campaign') { if (this.level + 1 < CAMPAIGN.length) this.startCampaign(this.level + 1); else this.action('select'); }
    else if (this.mode === 'endless') { this.endlessN++; this.startEndless(false); }
    else this.toTitle();
  }
  startSpec(spec, mode, seed) {
    this.mode = mode; this.spec = spec; this.lastSpec = spec;
    this.bomb = genBomb(spec, seed);
    const order = shuffle(rng(seed ^ 0xabc), this.bomb.modules.map((m, i) => i));
    this.mods = order.map(i => createModule(this.bomb.modules[i], this.bomb.widgets));
    this.mods.forEach(M => { M.anim = {}; if (M.type === 'simon') M.anim.sim = -0.6; if (M.type === 'code') M.anim.cursor = 0; });
    this.state = 'play'; this.paused = false; this.defused = false; this.boomFx = null; this.endT = 0; this.resultShown = false;
    this.total = this.timeLeft = spec.time; this.strikes = 0; this.speed = 1; this.lastSec = -1; this.beepT = 1; this.tick2 = false;
    this.intro = 0.55; this.parts = []; this.pops = []; this.tScale = 1; this.hitStop = 0; this.flashRed = 0; this.anim = {};
    this.focus = 0; this.hover = null; this.lastStrike = -1; this.autoNext = 0;
    this.manual.root.classList.remove('hidden');
    this.manual.setTypes(this.mods.map(m => m.type));
    this.manual.show(this.mods[0].type, { wires: this.mods[0].data.colors?.length }, true);
    this.ui.clear();
    const label = mode === 'campaign' ? `BOMB <b>${this.level + 1}</b>/20 · ${spec.name}` : mode === 'endless' ? `ENDLESS · BOMB <b>${this.endlessN + 1}</b>` : mode === 'daily' ? `DAILY · <b>${todayKey()}</b>` : 'TEST BOMB';
    const touch = matchMedia('(pointer: coarse)').matches;
    const tip = mode === 'campaign' && spec.tip ? `<div class="tipbar">${touch ? spec.tip.replace(/^Click/, 'Tap').replace(' Click ', ' Tap ') : spec.tip}</div>` : '';
    this.ui.setHud(`<div class="hudbar"><span class="tag">${label}</span></div><div class="hudbtns"><button class="ibtn" data-a="keys" title="Keys (H)">?</button><button class="ibtn" data-a="pause" title="Pause (Esc)">II</button></div>${tip}`);
    this.tipT = tip ? 6 : 0;
    this.audio.mode = 'play';
    this.resize();
  }
  setPause(v, quiet) {
    if (this.state !== 'play') return;
    this.paused = v;
    this.manual.root.classList.toggle('hidden', v);
    if (v) { if (!quiet) this.ui.pause(); this.releaseButtons(); this.audio.mode = 'menu'; }
    else { this.ui.clear(); this.audio.mode = 'play'; }
  }

  // ---------- layout ----------
  resize() {
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = W * dpr; this.cv.height = H * dpr;
    this.port = W < H * 1.05 || W < 560;
    document.body.classList.toggle('port', this.port); document.body.classList.toggle('land', !this.port);
    const showManual = this.state !== 'title' && !this.manual.root.classList.contains('hidden');
    let view;
    if (!this.port) {
      const mw = Math.round(Math.max(290, Math.min(460, W * 0.36)));
      document.body.style.setProperty('--mw', mw + 'px');
      view = showManual ? { x: 0, y: 54, w: W - mw - 24, h: H - 64 } : { x: 0, y: 40, w: W, h: H - 50 };
    } else {
      const mh = Math.round(H * 0.42);
      document.body.style.setProperty('--mh', mh + 'px');
      const used = showManual ? (this.manual.open ? mh : 50) : 0;
      view = { x: 0, y: 56, w: W, h: H - used - 62 };
    }
    if (this.state === 'title') view = this.port ? { x: 0, y: H * 0.25, w: W, h: H * 0.36 } : { x: W * 0.46, y: H * 0.08, w: W * 0.52, h: H * 0.84 };
    this.view = view;
    if (this.mods) {
      this.L = D.layoutBomb(this.mods.length, view);
      const L = this.L;
      this.sc = Math.min(view.w * (this.port ? 0.97 : 0.94) / L.cw, view.h * 0.95 / L.ch, 1.45);
      this.ox = view.x + view.w / 2 - (L.x0 + L.cw / 2) * this.sc;
      this.oy = view.y + view.h / 2 - (L.y0 + L.ch / 2) * this.sc;
    }
  }
  toBomb(px, py) { return [(px - this.ox) / this.sc, (py - this.oy) / this.sc]; }
  slotAt(bx, by) {
    return this.L.slots.findIndex((s, i) => i < this.mods.length && bx >= s.x && bx <= s.x + D.SLOT && by >= s.y && by <= s.y + D.SLOT);
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.state === 'title' && this.ui.screen === 'title') { this.action('campaign', Math.min(this.save.unlocked, CAMPAIGN.length) - 1); return; }
      if (this.state !== 'play' || this.paused || this.intro > 0) {
        if ((this.state === 'boom' || this.state === 'defused') && this.resultShown && this.endT > 0.8 && this.ui.screen === 'result') { /* clicks on the desk do nothing; use the card */ }
        return;
      }
      e.preventDefault();
      const [bx, by] = this.toBomb(e.clientX, e.clientY);
      const i = this.slotAt(bx, by);
      if (i < 0) return;
      this.kb = false;
      this.select(i);
      const s = this.L.slots[i], M = this.mods[i];
      let el = D.hitModule(M, bx - s.x, by - s.y);
      if (!el && e.pointerType !== 'mouse') el = M.type === 'wires' ? this.nearestWire(M, bx - s.x, by - s.y) : this.nearestHit(M, bx - s.x, by - s.y);
      if (el) { try { cv.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } this.use(i, el); }
    });
    const up = () => this.releaseButtons();
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !this.mods || this.state !== 'play') { this.hover = null; return; }
      const [bx, by] = this.toBomb(e.clientX, e.clientY), i = this.slotAt(bx, by);
      this.hover = null;
      if (i >= 0) { const s = this.L.slots[i], el = D.hitModule(this.mods[i], bx - s.x, by - s.y); if (el) this.hover = { mi: i, el }; }
      cv.style.cursor = this.hover ? 'pointer' : i >= 0 ? 'default' : 'default';
    });
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
  }
  nearestWire(M, x, y) { // fat-finger help on touch: the closest uncut wire within 22 units
    let best = null, bd = 22;
    M.data.colors.forEach((_, i) => { if (M.cut[i]) return; for (const [px, py] of D.wirePts(M, i, 30)) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = { k: 'wire', i }; } } });
    return best;
  }
  nearestHit(M, x, y) { // fat-finger help on touch for every other module: probe rings round the tap, nearest first
    if (M.type === 'simon' || M.type === 'button') return null; // big targets; a near-miss there should not press
    for (const r of [6, 12, 18]) for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, el = D.hitModule(M, x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (el) return el;
    }
    return null;
  }
  select(i) {
    if (i === this.focus) return;
    this.focus = i;
    const M = this.mods[i];
    this.manual.show(M.type, { wires: M.data.colors?.length });
  }
  releaseButtons() {
    if (!this.mods || this.state !== 'play') return;
    this.mods.forEach((M, i) => { if (M.type === 'button' && M.down) { this.audio.play('release'); M.anim.press = 1; this.result(i, act(M, { t: 'up' }, { digit: this.digit() })); } });
  }
  key(e, down) {
    const k = e.key;
    if (down) this.audio.unlock();
    if (!down) { if (k === ' ' && this.state === 'play') { const i = this.mods.findIndex(M => M.type === 'button' && M.down); if (i >= 0) this.releaseButtons(); } return; }
    if (e.repeat && k === ' ') { e.preventDefault(); return; }
    const scr = this.ui.screen;
    if (k === 'Escape') {
      if (scr === 'keys') { this.action(this.state === 'play' ? 'backpause' : 'title'); return; }
      if (this.state === 'play') this.setPause(!this.paused);
      else if (scr === 'select' || scr === 'settings') this.toTitle();
      return;
    }
    if (this.state === 'title') {
      if (scr === 'title' && (k === 'Enter' || k === ' ')) { e.preventDefault(); this.action('campaign', Math.min(this.save.unlocked, CAMPAIGN.length) - 1); }
      if (scr === 'title' && (k === 'h' || k === '?')) this.action('keys');
      return;
    }
    if (scr === 'result') {
      if (k === 'r' || k === 'R') this.retry();
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (this.state === 'defused' && (this.mode === 'endless' || this.mode === 'campaign' && this.level + 1 < CAMPAIGN.length)) this.next(); else this.retry(); }
      return;
    }
    if (this.state !== 'play') return;
    if (this.paused) { if (k === 'r' || k === 'R') this.retry(); return; }
    if (k === 'h' || k === 'H' || k === '?') { this.action('keys'); return; }
    if (k === 'm' || k === 'M') { this.manual.setOpen(!this.manual.open); return; }
    if (this.intro > 0) return;
    this.kb = true;
    if (k === 'Tab') {
      e.preventDefault(); const n = this.mods.length; let f = this.focus < 0 ? 0 : this.focus;
      for (let g = 0; g < n; g++) { f = (f + (e.shiftKey ? n - 1 : 1)) % n; if (!this.mods[f].solved || this.mods[f].needy) break; }
      this.select(f); this.audio.play('ui'); return;
    }
    const vi = this.mods.findIndex(M => M.type === 'vent');
    if (vi >= 0 && 'zxcZXC'.includes(k) && k.length === 1) { this.use(vi, { k: 'valve', i: 'zxc'.indexOf(k.toLowerCase()) }); return; }
    if (this.focus < 0) { if (k >= '1' && k <= String(this.mods.length)) this.select(+k - 1); return; }
    const M = this.mods[this.focus], n = +k, num = k >= '1' && k <= '9';
    const arrow = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' }[k];
    if (arrow || k === ' ' || k === 'Enter') e.preventDefault();
    switch (M.type) {
      case 'wires': if (num && n <= M.data.colors.length) this.use(this.focus, { k: 'wire', i: n - 1 }); break;
      case 'button': if (k === ' ' || k === 'Enter') this.use(this.focus, { k: 'button' }); break;
      case 'switches': if (num && n <= 5) this.use(this.focus, { k: 'switch', i: n - 1 }); else if (k === 'Enter') this.use(this.focus, { k: 'set' }); break;
      case 'keypad': if (num && n <= 4) this.use(this.focus, { k: 'key', i: n - 1 }); break;
      case 'simon': { const c = arrow ? { up: 'red', right: 'blue', down: 'green', left: 'yellow' }[arrow] : num && n <= 4 ? ['red', 'blue', 'green', 'yellow'][n - 1] : null; if (c) this.use(this.focus, { k: 'pad', color: c }); break; }
      case 'maze': if (arrow) this.use(this.focus, { k: 'arrow', dir: arrow }); break;
      case 'code': {
        const a = M.anim;
        if (arrow === 'left' || arrow === 'right') { a.cursor = (a.cursor + (arrow === 'left' ? 3 : 1)) % 4; this.audio.play('ui'); }
        else if (arrow === 'up' || arrow === 'down') this.use(this.focus, { k: 'wheel', i: a.cursor, d: arrow === 'up' ? -1 : 1 });
        else if (num && n <= 4) { a.cursor = n - 1; this.use(this.focus, { k: 'wheel', i: n - 1, d: 1 }); }
        else if (k === 'Enter') this.use(this.focus, { k: 'submit' });
        break;
      }
      case 'vent': if (num && n <= 3) this.use(this.focus, { k: 'valve', i: n - 1 }); break;
    }
  }

  // ---------- using a module ----------
  digit() { return Math.max(0, Math.ceil(this.timeLeft)) % 10; }
  clockStr() { return fmtT(this.timeLeft); }
  slotPt(i, x, y) { const s = this.L.slots[i]; return [s.x + x, s.y + y]; }
  use(i, el) {
    const M = this.mods[i], a = M.anim, A = this.audio;
    if (M.solved && !M.needy) return;
    let r;
    switch (el.k) {
      case 'wire': {
        r = act(M, { t: 'cut', i: el.i });
        if (r === 'none') return;
        A.play('snip'); a['cut' + el.i] = 0.001;
        const p = D.wirePts(M, el.i)[12], [x, y] = this.slotPt(i, p[0], p[1]);
        this.sparks(x, y, 16, ['#ffe9a8', '#ffb347', '#fff'], 260);
        this.shake = Math.max(this.shake, 3);
        break;
      }
      case 'button': r = act(M, { t: 'down' }); if (r === 'none') return; A.play('press'); a.stripOn = false; break;
      case 'switch': r = act(M, { t: 'flip', i: el.i }); a['sw' + el.i] = 0.001; A.play('clack'); break;
      case 'set': r = act(M, { t: 'set' }); a.press = 1; A.play('press'); break;
      case 'key': r = act(M, { t: 'press', i: el.i }); if (r === 'none') return; a['k' + el.i] = 1; A.play('key'); break;
      case 'pad': r = act(M, { t: 'press', color: el.color }); a.flash = el.color; a.flashT = 0.28; a.sim = -1.5; A.play('simon', SIMON_TONE[el.color]); break;
      case 'arrow': {
        const before = M.pos; r = act(M, { t: 'move', dir: el.dir }); a['a' + el.dir] = 1;
        if (r === 'strike') { a.bumpDir = DIRS[el.dir]; a.bumpT = 0.5; } else if (before !== M.pos) A.play('blip'); else A.play('key');
        break;
      }
      case 'wheel': r = act(M, { t: 'spin', i: el.i, d: el.d }); a['w' + el.i] = el.d; a.cursor = el.i; A.play('ratchet'); break;
      case 'submit': r = act(M, { t: 'submit' }); a.press = 1; A.play('press'); break;
      case 'valve': {
        r = act(M, { t: 'valve', i: el.i }); a['v' + el.i] = 1; A.play('valve');
        const [x, y] = this.slotPt(i, D.VALVE_X[el.i], D.VALVE_Y - 20);
        for (let k = 0; k < 10; k++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 120, life: 0.9, max: 0.9, col: 'rgba(235,235,235,.6)', size: 8 + Math.random() * 10, grav: -40, puff: true });
        if (r === 'ok') this.pop(i, 'VENTED', '#bfe9ff');
        break;
      }
    }
    this.result(i, r);
  }
  result(i, r) {
    const M = this.mods[i];
    if (r === 'strike') this.strike(i);
    else if (r === 'solved') this.solved(i);
    else if (r === 'stage') { this.audio.play('solved'); M.anim.sim = -1.0; M.anim.bump = 0.3; }
    else if (r === 'ok' && M.type === 'keypad') M.anim.bump = 0.2;
  }
  strike(i) {
    if (this.state !== 'play') return;
    this.strikes++; this.lastStrike = i;
    const M = this.mods[i];
    M.anim.strikeT = 0.9; this.anim.strikeT = 0.7; this.shake = 18; this.hitStop = 0.09; this.flashRed = 1;
    this.audio.play('strike'); this.pop(i, 'STRIKE!', '#ff5a48', 1.2);
    this.speed = 1 + 0.25 * this.strikes;
    if (this.strikes >= 3) this.explode('Three strikes.');
  }
  solved(i) {
    const M = this.mods[i];
    M.anim.solveT = 1; M.anim.bump = 0.5;
    this.audio.play('solved');
    const [x, y] = this.slotPt(i, 196, 24);
    this.sparks(x, y, 22, ['#7dffa0', '#36c25a', '#fff'], 300);
    this.pop(i, 'CLEAR', '#7dffa0');
    if (this.mods.every(m => m.solved || m.needy)) this.defuse();
  }
  pop(i, text, col, scale = 1) { const s = this.L.slots[i]; this.pops.push({ x: s.x + D.SLOT / 2, y: s.y + D.SLOT / 2, text, col, t: 0, scale }); }
  sparks(x, y, n, cols, sp) { for (let k = 0; k < n; k++) { const a = Math.random() * 7, v = sp * (0.3 + Math.random()); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.5 + Math.random() * 0.4, max: 0.9, col: cols[k % cols.length], size: 2 + Math.random() * 3, grav: 700 }); } }

  defuse() {
    document.querySelector('.tipbar')?.remove();
    this.state = 'defused'; this.defused = true; this.endT = 0; this.hitStop = 0.12; this.tScale = 0.22;
    this.releaseButtons();
    this.mods.forEach(M => { if (M.needy) { M.active = false; M.solved = true; } });
    this.audio.play('defuse'); this.audio.mode = 'off';
    const r = { mode: this.mode, left: this.timeLeft, total: this.total, strikes: this.strikes };
    if (this.mode === 'campaign') {
      const i = this.level, s = this.save;
      r.stars = 1 + (this.strikes === 0 ? 1 : 0) + (this.timeLeft >= this.total * 0.34 ? 1 : 0);
      s.stars[i] = Math.max(s.stars[i] || 0, r.stars);
      s.best[i] = Math.max(s.best[i] || 0, Math.ceil(this.timeLeft)); r.best = s.best[i];
      if (s.unlocked < i + 2 && i + 1 < CAMPAIGN.length) { s.unlocked = i + 2; r.unlock = `Bomb ${i + 2} · ${CAMPAIGN[i + 1].name}`; }
      if (i + 1 >= CAMPAIGN.length) s.unlocked = Math.max(s.unlocked, CAMPAIGN.length);
      r.hasNext = i + 1 < CAMPAIGN.length;
      this.persist();
    } else if (this.mode === 'endless') {
      r.count = this.endlessN + 1; r.auto = 2;
      if (r.count > this.save.endless) { this.save.endless = r.count; this.persist(); }
      this.autoNext = 2;
    } else if (this.mode === 'daily') {
      const s = this.save; if (!s.daily || s.daily.key !== todayKey()) s.daily = { key: todayKey(), best: null };
      s.daily.best = Math.max(s.daily.best ?? 0, Math.ceil(this.timeLeft)); r.best = s.daily.best; this.persist();
    }
    this.pendingResult = () => { this.ui.defused(r); if (r.stars) setTimeout(() => { for (let k = 1; k <= r.stars; k++) setTimeout(() => this.audio.play('star', 1 + k * 0.12), 150 + k * 220); }, 0); };
  }
  explode(reason) {
    if (this.state !== 'play') return;
    this.releaseButtons();
    document.querySelector('.tipbar')?.remove();
    this.state = 'boom'; this.endT = 0; this.hitStop = 0.16; this.shake = 46;
    const [cx, cy] = [this.ox + (this.L.x0 + this.L.cw / 2) * this.sc, this.oy + (this.L.y0 + this.L.ch / 2) * this.sc];
    this.boomFx = D.makeBoom(cx, cy, Math.max(0.6, this.sc * 1.2));
    this.audio.play('boom'); this.audio.mode = 'off';
    const r = { mode: this.mode, reason };
    if (reason.startsWith('Out')) {
      const live = this.mods.filter(M => !M.solved && !M.needy).map(M => MODULE_NAMES[M.type]);
      r.why = 'Still live: ' + live.join(', ') + '. ' + this.explain(this.mods.find(M => !M.solved && !M.needy));
    } else if (this.lastStrike >= 0) r.why = this.explain(this.mods[this.lastStrike]);
    if (this.mode === 'endless') { r.count = this.endlessN; r.best = this.save.endless; r.newBest = this.endlessN > 0 && this.endlessN >= this.save.endless; }
    this.pendingResult = () => this.ui.boom(r);
  }
  explain(M) {
    if (!M) return '';
    const d = M.data, nm = MODULE_NAMES[M.type];
    switch (M.type) {
      case 'wires': return `${nm}: the right one was the ${ORD[M.answer]} wire.`;
      case 'button': return M.act === 'tap' ? `${nm}: it wanted a quick TAP.` : `${nm}: HOLD it, then let go on a ${M.digit} (${d.strip} strip).`;
      case 'switches': return `${nm}: ${M.target.map(u => (u ? 'UP' : 'DOWN')).join(' · ')}.`;
      case 'keypad': return `${nm}: it was column ${'ABCDE'[keypadColumn(d.syms)]}.`;
      case 'simon': return `${nm}: ${this.bomb.widgets.batteries} batteries, so the ${this.bomb.widgets.batteries % 2 ? 'odd' : 'even'} table.`;
      case 'maze': return `${nm}: that ring meant maze ${d.maze + 1}.`;
      case 'code': return `${nm}: the word was ${M.word}.`;
      case 'vent': return `${nm}: ${M.color}${M.blink ? ' blinking' : ''} lamp = the ${['LEFT', 'MIDDLE', 'RIGHT'][(({ red: 0, green: 1, blue: 2 })[M.color] + (M.blink ? 1 : 0)) % 3]} valve.`;
    }
    return '';
  }

  // ---------- test helpers ----------
  autoSolve(i) {
    const M = this.mods[i];
    if (!M || M.solved || M.needy) return;
    switch (M.type) {
      case 'wires': this.use(i, { k: 'wire', i: M.answer }); break;
      case 'button':
        if (M.act === 'tap') { this.use(i, { k: 'button' }); this.releaseButtons(); }
        else { this.use(i, { k: 'button' }); M.held = 1; this.result(i, act(M, { t: 'up' }, { digit: M.digit })); M.anim.press = 1; }
        break;
      case 'switches': M.state.forEach((s, k) => { if (s !== M.target[k]) this.use(i, { k: 'switch', i: k }); }); this.use(i, { k: 'set' }); break;
      case 'keypad': M.order.slice(M.step).forEach(k => this.use(i, { k: 'key', i: k })); break;
      case 'simon': while (!M.solved) this.use(i, { k: 'pad', color: M.table[M.data.seq[M.input]] }); break;
      case 'maze': {
        const open = MAZES[M.data.maze].open, prev = { [M.pos]: null }, q = [M.pos];
        while (q.length) { const c = q.shift(); for (const [dir, [dx, dy, bit]] of Object.entries(DIRS)) if (open[c] & bit) { const n = c + dx + dy * 5; if (!(n in prev)) { prev[n] = [c, dir]; q.push(n); } } }
        const path = []; for (let c = M.data.goal; prev[c]; c = prev[c][0]) path.unshift(prev[c][1]);
        path.forEach(dir => this.use(i, { k: 'arrow', dir })); break;
      }
      case 'code': [...M.word].forEach((ch, k) => { let g = 0; while (M.data.wheels[k][M.pos[k]] !== ch && g++ < 6) this.use(i, { k: 'wheel', i: k, d: 1 }); }); this.use(i, { k: 'submit' }); break;
    }
  }
  solveAll() { this.mods.forEach((M, i) => this.autoSolve(i)); }
  info() { return { state: this.state, mode: this.mode, level: this.level, timeLeft: this.timeLeft, strikes: this.strikes, mods: this.mods.map(M => ({ type: M.type, solved: M.solved })), screen: this.ui.screen, endlessN: this.endlessN, save: this.save }; }

  // ---------- update ----------
  frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now;
    this.update(dt); this.render(dt);
    requestAnimationFrame((t) => this.frame(t));
  }
  update(dt) {
    this.t += dt;
    this.audio.update(dt);
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) { const tb = document.querySelector('.tipbar'); if (tb) tb.remove(); } }
    if (this.state === 'title') { this.timeLeft = 59.99 - (this.t % 60); this.animDemo(dt); return; }
    if (this.paused) return;
    let gdt = dt;
    if (this.hitStop > 0) { this.hitStop -= dt; gdt = 0; }
    if (this.state === 'defused') { this.tScale += (1 - this.tScale) * Math.min(1, dt * (this.endT > 1.1 ? 3 : 0.4)); gdt *= this.tScale; }
    this.shake = Math.max(0, this.shake - dt * 60);
    this.flashRed = Math.max(0, this.flashRed - dt * 2.5);
    if (this.anim.strikeT > 0) this.anim.strikeT -= dt;
    this.stepAnims(gdt, dt);
    if (this.state === 'play') {
      if (this.intro > 0) {
        this.intro -= dt;
        if (this.intro <= 0) { this.audio.play('thunk'); this.shake = 8; }
        return;
      }
      this.timeLeft -= gdt * this.speed;
      const sec = Math.ceil(this.timeLeft);
      if (sec !== this.lastSec) { this.lastSec = sec; if (this.timeLeft > 0) { this.tick2 = !this.tick2; this.audio.play(this.tick2 ? 'tick' : 'tock'); } }
      this.beepT -= gdt * this.speed;
      if (this.beepT <= 0) {
        const f = Math.max(0, this.timeLeft / this.total);
        this.beepT = this.timeLeft < 10 ? 0.25 + 0.04 * this.timeLeft : 0.5 + 1.5 * f;
        this.audio.play('beep', this.timeLeft < 10 ? 1.2 : 1); this.anim.beep = 1;
      }
      this.audio.intensity = Math.min(1, 1 - this.timeLeft / this.total + this.strikes * 0.2);
      for (let i = 0; i < this.mods.length && this.state === 'play'; i++) {
        const M = this.mods[i], r = tick(M, gdt);
        if (r === 'start') { this.audio.play('hiss'); this.pop(i, 'HISS!', '#ffd86a'); M.anim.bump = 0.5; }
        else if (r === 'strike') { this.pop(i, 'TOO SLOW', '#ff5a48'); this.strike(i); }
        if (M.type === 'button' && M.down && M.held >= TAP_MAX && !M.anim.stripOn) { M.anim.stripOn = true; this.audio.play('blip'); }
        if (M.type === 'vent' && M.active && Math.random() < gdt * 8) {
          const [x, y] = this.slotPt(i, 110 + (Math.random() - 0.5) * 120, 40);
          this.parts.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 60, life: 1, max: 1, col: 'rgba(230,230,230,.35)', size: 6 + Math.random() * 8, grav: -30, puff: true });
        }
      }
      if (this.timeLeft <= 0 && this.state === 'play') { this.timeLeft = 0; this.explode('Out of time.'); }
    } else if (this.state === 'defused' || this.state === 'boom') {
      this.endT += dt;
      if (!this.resultShown && this.endT > (this.state === 'boom' ? 1.7 : 1.15)) { this.resultShown = true; this.pendingResult?.(); if (this.state === 'boom') this.audio.play('cough'); }
      if (this.autoNext > 0 && this.ui.screen === 'result') { this.autoNext -= dt; if (this.autoNext <= 0) this.next(); }
    }
  }
  stepAnims(gdt, dt) {
    for (const M of this.mods) {
      const a = M.anim;
      for (const k in a) {
        if (k.startsWith('cut') && a[k] > 0 && a[k] < 1) a[k] = Math.min(1, a[k] + dt * 1.6);
        else if (k.startsWith('sw') && a[k] > 0 && a[k] < 1) a[k] = Math.min(1, a[k] + dt * 2.5);
        else if (/^(k\d|a(up|down|left|right)|v\d)$/.test(k)) a[k] = Math.max(0, a[k] - dt * 5);
        else if (/^w\d$/.test(k)) a[k] *= Math.pow(0.0005, dt);
      }
      if (a.press > 0) a.press = Math.max(0, a.press - dt * 6);
      if (a.strikeT > 0) a.strikeT -= dt;
      if (a.solveT > 0) a.solveT -= dt * 1.5;
      if (a.bump > 0) a.bump -= dt * 1.5;
      if (a.bumpT > 0) a.bumpT -= dt;
      if (a.flashT > 0) { a.flashT -= dt; if (a.flashT <= 0) a.flash = null; }
      if (M.type === 'simon' && !M.solved && this.state === 'play' && this.intro <= 0) {
        const prev = a.sim; a.sim += gdt;
        const n = M.stage + 1, slot = 0.62, cyc = n * slot + 1.9;
        if (a.sim > cyc) a.sim = 0;
        const idx = Math.floor(a.sim / slot), on = a.sim >= 0 && idx < n && (a.sim % slot) < 0.42;
        a.lit = on ? M.data.seq[idx] : null;
        if (on && (prev < 0 || Math.floor(prev / slot) !== idx || (prev % slot) >= 0.42)) this.audio.play('simon', SIMON_TONE[a.lit]);
      } else if (M.type === 'simon') a.lit = null;
    }
    for (const p of this.parts) { p.life -= gdt; p.vy += p.grav * gdt; p.x += p.vx * gdt; p.y += p.vy * gdt; if (p.puff) p.size += gdt * 14; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 1.1);
  }
  animDemo(dt) {
    const s = this.mods.find(M => M.type === 'simon');
    if (s) { s.anim.sim = (s.anim.sim || 0) + dt; const cyc = 3 * 0.62 + 1.4, ph = s.anim.sim % cyc, idx = Math.floor(ph / 0.62); s.anim.lit = idx < 3 && ph % 0.62 < 0.42 ? s.data.seq[idx] : null; }
    const v = this.mods.find(M => M.type === 'vent'); if (v) { v.left = 9 - (this.t % 9); v.color = ['red', 'green', 'blue'][Math.floor(this.t / 9) % 3]; }
    const sec = Math.ceil(this.timeLeft); if (sec !== this.lastSec) { this.lastSec = sec; }
  }

  // ---------- render ----------
  render(dt) {
    const c = this.c, W = this.W, H = this.H;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    D.drawDesk(c, W, H, this.dpr);
    const bcx = this.ox + (this.L.x0 + this.L.cw / 2) * this.sc, bcy = this.oy + (this.L.y0 + this.L.ch / 2) * this.sc;
    const flick = 0.96 + Math.sin(this.t * 13) * 0.015 + Math.sin(this.t * 2.1) * 0.02;
    const blown = this.state === 'boom' && this.boomFx && this.boomFx.t > 0.12;
    D.drawLamp(c, W, H, bcx, bcy, this.t, blown ? 0.5 : flick);
    if (blown) { // scorch mark where the bomb was
      const g = c.createRadialGradient(bcx, bcy, 10, bcx, bcy, this.L.cw * this.sc * 0.6);
      g.addColorStop(0, 'rgba(10,6,4,.95)'); g.addColorStop(0.6, 'rgba(20,12,8,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (!blown) {
      c.save();
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      let offY = 0;
      if (this.state === 'play' && this.intro > 0) { const k = this.intro / 0.55; offY = -k * k * H * 0.9; }
      c.translate(this.ox + sx, this.oy + sy + offY);
      let s = this.sc;
      if (this.state === 'defused') s *= 1 + Math.min(0.03, this.endT * 0.02);
      if (this.state === 'title') c.rotate(Math.sin(this.t * 0.6) * 0.012);
      c.scale(s, s);
      if (this.paused) this.drawCover(c); else this.drawBomb(c);
      c.restore();
    }
    if (this.flashRed > 0) { c.fillStyle = `rgba(255,40,20,${this.flashRed * 0.28})`; c.fillRect(0, 0, W, H); }
    if (this.state === 'play' && this.timeLeft < 10 && !this.paused && this.intro <= 0) {
      const p = (this.anim.beep || 0); this.anim.beep = Math.max(0, p - dt * 4);
      const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(255,0,0,0)'); v.addColorStop(1, `rgba(200,10,0,${0.18 + p * 0.25})`); c.fillStyle = v; c.fillRect(0, 0, W, H);
    }
    if (this.state === 'defused') this.drawStamp(c, bcx, bcy);
    if (this.state === 'boom' && this.boomFx) {
      c.save(); c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      D.drawBoom(c, this.boomFx, W, H, this.hitStop > 0 ? 0 : dt); c.restore();
      if (this.endT > 1.0) D.drawSoot(c, W, H, Math.min(1, (this.endT - 1.0) / 0.7), this.endT, bcx, this.port ? bcy : H * 0.3);
    }
  }
  drawBomb(c) {
    const L = this.L, G = this;
    D.drawCasing(c, L, this.bomb.widgets, this.t);
    c.save(); c.translate(L.timer.x, L.timer.y); D.drawTimer(c, G, this.t); c.restore();
    L.slots.forEach((s, i) => {
      c.save(); c.translate(s.x, s.y);
      const M = this.mods[i];
      if (!M) D.drawBlank(c);
      else D.drawModule(c, M, { sel: this.state === 'play' && i === this.focus && this.mods.length > 1, hover: this.hover && this.hover.mi === i ? this.hover.el : null, t: this.t, kb: this.kb, simonLit: M.anim.lit });
      c.restore();
    });
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      c.globalAlpha = a; c.fillStyle = p.col;
      if (p.puff) { c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); }
      else { c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy, p.vx)); c.fillRect(-p.size * 2, -p.size / 2, p.size * 4, p.size); c.restore(); }
    }
    c.globalAlpha = 1;
    for (const p of this.pops) {
      const k = p.t / 1.1, sc = (k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15))) * p.scale;
      c.save(); c.globalAlpha = Math.min(1, (1 - k) * 2.5); c.translate(p.x, p.y - 40 - k * 50); c.scale(sc, sc); c.rotate(-0.06);
      c.font = '34px "Black Ops One", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 8; c.strokeStyle = '#140d08'; c.strokeText(p.text, 0, 0); c.fillStyle = p.col; c.fillText(p.text, 0, 0);
      c.restore();
    }
  }
  drawCover(c) {
    const L = this.L;
    c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 40; c.shadowOffsetY = 20;
    D.rr(c, L.x0 - 20, L.y0 - 10, L.cw + 40, L.ch + 30, 30); c.fillStyle = '#3b4a2a'; c.fill(); c.restore();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3;
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(L.x0 + k * L.cw / 6, L.y0); c.quadraticCurveTo(L.x0 + k * L.cw / 6 + 40, L.y0 + L.ch / 2, L.x0 + k * L.cw / 6 - 10, L.y0 + L.ch); c.stroke(); }
  }
  drawStamp(c, cx, cy) {
    const k = Math.min(1, this.endT / 0.25), s = (2.4 - 1.4 * (1 - Math.pow(1 - k, 3))) * Math.max(0.6, this.sc);
    const fade = this.resultShown ? Math.max(0, 1 - (this.endT - 1.15) * 3) : 1;
    if (fade <= 0) return;
    if (this.endT < 1.4) { const g = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(this.W, this.H) * 0.7); g.addColorStop(0, `rgba(120,255,160,${0.22 * Math.max(0, 1 - this.endT / 1.4)})`); g.addColorStop(1, 'rgba(120,255,160,0)'); c.fillStyle = g; c.fillRect(0, 0, this.W, this.H); }
    c.save(); c.translate(cx, cy); c.rotate(-0.12); c.scale(s, s); c.globalAlpha = Math.min(1, k * 1.5) * fade;
    c.font = '84px "Black Ops One", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText('DEFUSED').width + 50;
    D.rr(c, -w / 2, -58, w, 116, 14); c.fillStyle = 'rgba(16,40,22,.55)'; c.fill();
    c.lineWidth = 9; c.strokeStyle = '#4fe07a'; D.rr(c, -w / 2, -58, w, 116, 14); c.stroke();
    c.fillStyle = '#5cf08a'; c.shadowColor = '#3cff7a'; c.shadowBlur = 24; c.fillText('DEFUSED', 0, 6);
    c.restore();
    if (k < 1 && !this.stampDust) { this.stampDust = true; }
    if (this.endT < 0.05) this.stampDust = false;
  }
}

const start = () => new Game();
if (document.fonts && document.fonts.load) Promise.race([Promise.all(['20px "Black Ops One"', '20px "Special Elite"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).then(start, start);
else start();
