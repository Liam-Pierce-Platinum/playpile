// GRAZE - hold to climb, let go to dive. Scrape the walls to charge Phase,
// then ghost straight through one. App shell: loop, input, modes, saving.
import { Game, START_TIER } from './game.js';
import { Renderer, PORTAL_COL } from './render.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { loadSave, writeSave, packGhost, unpackGhost, checkMissions } from './meta.js';
import { WORLDS, dailyInfo } from './levels.js';
import { STEP, clamp, hexToRgb, dayKey } from './util.js';
import { SHOP, byId } from './cosmetics.js';

const params = new URLSearchParams(location.search);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const HOLD_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const BASE_BPM = 124;
const TEACH_RUNS = 1;   // the 9 s teaching tunnel opens only the very first run ever; every retry after that gets the 2 s intro

class App {
  constructor() {
    this.cv = document.getElementById('c');
    this.save = loadSave();
    this.audio = new Audio();
    this.fx = new FX();
    this.game = new Game();
    this.r = new Renderer(this.cv);
    this.ui = new UI(this);
    this.state = 'title'; this.paused = false;
    this.acc = 0; this.trail = []; this.realT = 0; this.missionT = 0; this.scrapeSfx = 0;
    this.keys = new Set(); this.pointers = new Set();
    this.deathInfo = null; this.resultTimer = -1; this.result = null;
    this.game.on((t, d, g) => this.onEvent(t, d, g));
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.applySettings(false);
    const lv = params.get('level');
    if (params.has('unlock')) { for (let w = 0; w < 4; w++) for (let l = 0; l < 6; l++) this.save.levels[`${w}-${l}`] ||= { stars: [1, 0, 0], best: 100, att: 1 }; }
    if (lv) { const [w, l] = lv.split('-').map((n) => parseInt(n, 10) - 1); this.startLevel(clamp(w || 0, 0, 3), clamp(l || 0, 0, 5), params.has('practice')); }
    else if (params.get('mode') === 'daily') this.startDaily();
    else if (params.has('play')) this.startRun();
    else this.toTitle();
    window.__G = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  persist() { writeSave(this.save); }
  applySettings(save = true) {
    const s = this.save.set;
    this.audio.setVolumes(s.music, s.sfx);
    this.fx.reduced = !s.shake;
    if (save) this.persist();
  }
  get look() {
    const e = this.save.eq;
    return { accent: this.game.accentNow, arrow: e.arrow, trail: e.trail, death: e.death, portalCol: (k) => PORTAL_COL[k] || '#a9b8ff' };
  }
  setAccentCss() {
    const a = this.game.accentNow;
    document.documentElement.style.setProperty('--a', a);
    document.documentElement.style.setProperty('--ar', hexToRgb(a).join(','));
  }
  resize() {
    this.r.resize(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 3));
  }

  // ---------------------------------------------------------------- modes
  begin(spec, attract = false) {
    const g = this.game;
    g.bot = attract || params.has('bot');
    g.botLean = attract ? 9 : 0;
    g.load(spec);
    this.state = attract ? 'title' : 'play';
    this.paused = false; this.acc = 0; this.trail = []; this.deathInfo = null; this.resultTimer = -1;
    this.fx.reset();
    if (!attract) { this.ui.close(); this.ui.setHud(true); }
    this.loadGhost();
    this.setAccentCss();
    this.audio.setSong(g.songSeed, g.root, BASE_BPM * g.speedMul);
    this.audio.start();
  }
  // startTier: 0 = from the start; START_TIER = "START AT TIER 3" (unlocked once tier 3 has been reached)
  startRun(startTier = 0) {
    this.audio.unlock();
    if (startTier && !this.tier3Unlocked()) startTier = 0;
    this.begin({ mode: 'run', seed: params.has('seed') ? +params.get('seed') : undefined, short: this.save.runs >= TEACH_RUNS, startTier });
  }
  tier3Unlocked() { return this.save.run.bestTier >= START_TIER || params.has('unlock'); }
  startDaily() { this.audio.unlock(); this.begin({ mode: 'daily' }); }
  startLevel(w, l, practice = false) { this.audio.unlock(); this.lastLevel = { w, l }; this.begin({ mode: 'level', w, l, practice }); }
  toTitle() {
    this.ui.setHud(false);
    const w = Math.floor(Math.random() * 4), l = 1 + Math.floor(Math.random() * 4);
    this.begin({ mode: 'attract', w, l }, true);
    this.ui.title();
  }
  nextLevel() {
    let { w, l } = this.lastLevel;
    if (l < 5) l++; else if (w < 3) { w++; l = 0; }
    this.startLevel(w, l);
  }
  retryLevel(practice) { this.startLevel(this.lastLevel.w, this.lastLevel.l, practice); }
  restartFromMenu() {
    if (this.state === 'result') { const s = this.game.spec; this.begin({ ...s }); return; }
    this.resume(); this.restartAttempt(true);
  }
  // all 6 levels of a world are open at once; a world opens when ANY level of the previous world is cleared
  worldUnlocked(w) { return w === 0 || params.has('unlock') || [0, 1, 2, 3, 4, 5].some((l) => this.save.levels[`${w - 1}-${l}`] && this.save.levels[`${w - 1}-${l}`].stars[0]); }
  levelUnlocked(w, l) { return this.worldUnlocked(w); }
  levelUnlockedAfter(r) { return !r.practice && this.save.levels[`${r.w}-${r.l}`].stars[0]; }

  pause() {
    if (this.state !== 'play' || this.paused) return;
    this.paused = true; this.pointers.clear(); this.keys.clear();
    this.audio.stop();
    this.ui.pause();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false; this.ui.close(); this.audio.start();
    this.last = performance.now();
  }

  ghostKey() {
    const g = this.game;
    if (g.mode === 'level') return `L${g.spec.w}-${g.spec.l}`;
    if (g.mode === 'daily') return 'D' + g.daily.key;
    return null;
  }
  loadGhost() {
    const k = this.ghostKey(), g = this.game;
    g.ghost = k && !g.practice ? unpackGhost(this.save.ghosts[k]) : null;
  }

  restartAttempt(manual = false) {
    const g = this.game;
    if (manual && g.p.alive && g.grazes > 0) { this.save.sparks += g.grazes; this.save.total.grazes += g.grazes; this.persist(); }
    if (g.mode === 'run') {
      const short = this.save.runs >= TEACH_RUNS;
      if (short !== !!g.spec.short) { g.spec.short = short; if (!g.spec.startTier) g.build(); } // the teaching tunnel is never replayed
    }
    g.reset();
    this.acc = 0; this.trail = []; this.deathInfo = null;
    this.loadGhost();
    this.setAccentCss();
    if (g.mode === 'run') this.audio.setBpm(BASE_BPM * g.speedMul);
  }

  // test hook: jump to the first chunk of a type (warp('saws')) or an x position
  warp(what) {
    const g = this.game, c = g.course;
    if (g.extend) g.extend(typeof what === 'number' ? what + 5000 : 60000);
    const ch = typeof what === 'number' ? c.chunkAt(what) : c.chunks.find((k) => k.type === what);
    if (!ch) return false;
    g.reset(ch.x0); this.trail = []; this.deathInfo = null; this.acc = 0;
    return ch.x0;
  }

  // ---------------------------------------------------------------- events
  onEvent(type, d, g) {
    this.fx.onEvent(type, d, g, this.look);
    const A = this.audio;
    if (this.state === 'title') {
      if (type === 'death' || type === 'finish') this.attractEnd = 0.9;
      return;
    }
    switch (type) {
      case 'graze': A.play('graze', d.combo); break;
      case 'scrape': if (this.realT - this.scrapeSfx > 0.07) { this.scrapeSfx = this.realT; A.play('scrape'); } break;
      case 'mult': A.play('mult', d.mult); break;
      case 'phaseReady':
        A.play('ready');
        if (this.save.hints < 3) { this.save.hints++; this.fx.banner('PHASE READY', 'your next crash ghosts straight through', '#ffffff', 2.2); }
        break;
      case 'phase': A.play('phase'); break;
      case 'phaseThrough': A.play('phaseThrough'); break;
      case 'portal': A.play('portal'); break;
      case 'tier': A.play('tier'); A.setBpm(BASE_BPM * g.speedMul); this.setAccentCss(); break;
      case 'checkpoint': A.play('check'); break;
      case 'comboLost': A.play('combolost'); break;
      case 'death': A.play('death'); this.attemptEnd(d.summary, false); break;
      case 'finish': A.play('finish'); this.attemptEnd(d, true); break;
    }
  }

  attemptEnd(s, finished) {
    const sv = this.save, g = this.game;
    sv.runs++;
    sv.sparks += s.grazes; sv.total.grazes += s.grazes; sv.total.phases += s.phases;
    let big = '', sub = '', record = false;
    const prog = Math.floor(s.progress * 100);
    if (g.mode === 'run') {
      const best = sv.run.best;
      record = s.score > best && s.score > 0;
      if (record) sv.run.best = s.score;
      sv.run.bestDist = Math.max(sv.run.bestDist, s.dist);
      sv.run.bestTier = Math.max(sv.run.bestTier, s.tier);
      if (s.score > 0) { // local top-5 table (score, tier reached, date)
        sv.run.top = (sv.run.top || []).concat([{ s: s.score, t: s.tier + 1, d: dayKey() }]).sort((a, b) => b.s - a.s).slice(0, 5);
      }
      if (s.tier >= START_TIER && sv.run.bestTier >= START_TIER && !sv.tier3Seen) { sv.tier3Seen = true; this.ui.toast('UNLOCKED', 'Start at tier 3 from the title screen'); }
      big = fmt(s.score);
      sub = record ? (best ? 'NEW BEST!' : 'FIRST SCORE!') : best ? `${Math.floor((s.score / best) * 100)}% OF BEST` : 'GRAZE THE WALLS TO SCORE';
    } else if (g.mode === 'level') {
      const key = `${g.spec.w}-${g.spec.l}`;
      const rec = (sv.levels[key] ||= { stars: [0, 0, 0], best: 0, att: 0 });
      big = prog + '%';
      if (g.practice) sub = 'PRACTICE';
      else {
        rec.att++;
        record = prog > rec.best;
        if (record) { rec.best = prog; sv.ghosts['L' + key] = packGhost(g.rec); }
        sub = record ? 'NEW BEST!' : `BEST ${rec.best}%`;
      }
      if (finished) {
        const got = [true, s.grazes >= 30, s.phases === 0];
        const fresh = got.map((x, i) => !g.practice && x && !rec.stars[i]);
        if (!g.practice) {
          rec.stars = rec.stars.map((x, i) => (x || got[i] ? 1 : 0));
          s.threeStar = rec.stars.every(Boolean) && got.every(Boolean);
          sv.total.clears++;
          if (!sv.ghosts['L' + key] || record) sv.ghosts['L' + key] = packGhost(g.rec);
        }
        this.result = { kind: 'level', w: g.spec.w, l: g.spec.l, practice: g.practice, got, fresh, score: s.score, grazes: s.grazes, phases: s.phases, attempts: s.attempts };
        this.resultTimer = 1.1;
      }
    } else if (g.mode === 'daily') {
      const k = g.daily.key;
      const dd = (sv.daily[k] ||= { best: 0, bestScore: 0, attempts: 0, finished: false, grazes: 0, phases: 0, strip: '' });
      dd.attempts++;
      const better = finished ? (!dd.finished || s.score > dd.bestScore) : (!dd.finished && (prog > dd.best || (prog === dd.best && s.score > dd.bestScore)));
      record = finished ? better : prog > dd.best;
      if (better) {
        Object.assign(dd, { best: prog, bestScore: s.score, finished: finished || dd.finished, grazes: s.grazes, phases: s.phases, strip: this.strip(s, finished) });
        sv.ghosts['D' + k] = packGhost(g.rec);
      }
      for (const key of Object.keys(sv.ghosts)) if (key[0] === 'D' && key !== 'D' + k) delete sv.ghosts[key];
      const dk = Object.keys(sv.daily).sort(); while (dk.length > 10) delete sv.daily[dk.shift()];
      big = prog + '%';
      sub = record ? 'NEW BEST!' : `BEST ${dd.best}%`;
      if (finished) { this.result = { kind: 'daily' }; this.resultTimer = 1.1; }
    }
    if (!finished) { this.deathInfo = { big, sub, record, t: 0 }; if (record) setTimeout(() => this.audio.play('best'), 160); }
    for (const m of checkMissions(sv, s, true)) this.missionToast(m);
    this.persist();
  }
  missionToast(m) { this.ui.toast('MISSION COMPLETE  +' + m.reward, m.text); this.audio.play('mission'); }

  strip(s, finished) {
    return s.seg.map((q) => (q.died ? '💥' : !q.reached ? '⬛' : q.ph ? '🟪' : q.g >= 4 ? '🟨' : '🟦')).join('') + (finished ? '🏁' : '');
  }
  shareText() {
    const di = this.game.daily || dailyInfo(), dd = this.save.daily[di.key];
    if (!dd) return '';
    return `GRAZE Daily #${di.num} ${dd.finished ? '🏁' : dd.best + '%'} ${fmt(dd.bestScore)} pts\n${dd.strip}\n⚡${dd.grazes} grazes · 💠${dd.phases} phases · ${dd.attempts} ${dd.attempts === 1 ? 'try' : 'tries'}`;
  }
  copyShare() {
    const t = this.shareText();
    const done = () => this.ui.toast('COPIED', 'Paste it anywhere');
    try { navigator.clipboard.writeText(t).then(done, () => this.ui.toast('COPY BLOCKED', 'Select the text and copy it')); } catch (e) { this.ui.toast('COPY BLOCKED', 'Select the text and copy it'); }
  }
  showResult() {
    const r = this.result; this.result = null;
    this.state = 'result'; this.ui.setHud(false); this.pointers.clear();
    if (r.kind === 'level') this.ui.levelResult(r);
    else {
      const dd = this.save.daily[this.game.daily.key], s = this.game.summary();
      this.ui.dailyResult({ num: this.game.daily.num, key: this.game.daily.key, score: s.score, grazes: s.grazes, phases: s.phases, attempts: dd.attempts, share: this.shareText() });
    }
  }

  shopItem(k, id) {
    const sv = this.save, it = byId(SHOP[k], id);
    if (sv.owned[k].includes(id)) { sv.eq[k] = id; this.audio.play('click'); }
    else if (sv.sparks >= it.price) { sv.sparks -= it.price; sv.owned[k].push(id); sv.eq[k] = id; this.audio.play('buy'); this.ui.toast('UNLOCKED', it.name); }
    else { this.ui.toast('NOT ENOUGH SPARKS', `${fmt(it.price - sv.sparks)} more. Graze to earn them`); return; }
    this.persist();
  }
  drawPreview(cv, k, id) {
    const c = cv.getContext('2d'), r = this.r;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, 80); bg.addColorStop(0, '#1c1050'); bg.addColorStop(1, '#070417');
    c.fillStyle = bg; c.fillRect(0, 0, 160, 80);
    const acc = hexToRgb('#22e3ff'), arrowId = k === 'arrow' ? id : this.save.eq.arrow;
    const tr = []; for (let i = 0; i <= 40; i++) { const x = 10 + i * 2.6; tr.push([x, 40 + (Math.abs(((x / 26) % 2) - 1) - 0.5) * 34]); }
    if (k === 'arrow') {
      // the arrow big and alone so the six shapes actually differ at a glance
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(r.sprite('#22e3ff'), 80 - 44, 40 - 44, 88, 88); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      r.arrow(c, 80, 40, 0, 30, id, '#fff', '#22e3ff', 0, 1);
    } else if (k !== 'death') {
      r.drawTrail(c, tr, acc, k === 'trail' ? id : this.save.eq.trail, 1, 0.5, 0);
      const [hx, hy] = tr[tr.length - 1], [px, py] = tr[tr.length - 2];
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(r.sprite('#22e3ff'), hx - 26, hy - 26, 52, 52); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      r.arrow(c, hx, hy, Math.atan2(hy - py, hx - px), 14, arrowId, '#fff', '#22e3ff', 0, 1);
    } else {
      c.globalCompositeOperation = 'lighter';
      const cx = 80, cy = 40;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + (i % 3), d = 12 + (i * 37) % 26;
        if (id === 'pixel') { c.fillStyle = i % 2 ? '#22e3ff' : '#fff'; c.fillRect(cx + Math.cos(a) * d - 2, cy + Math.sin(a) * d - 2, 4, 4); }
        else if (id === 'glitch') { c.fillStyle = i % 2 ? 'rgba(255,42,109,0.8)' : 'rgba(42,246,255,0.8)'; c.fillRect(cx + Math.cos(a) * d * 1.6 - 14, cy + Math.sin(a) * d * 0.8, 28, 3); }
        else { c.strokeStyle = i % 2 ? '#22e3ff' : '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); c.lineTo(cx + Math.cos(a) * (d + (id === 'nova' ? 12 : 7)), cy + Math.sin(a) * (d + (id === 'nova' ? 12 : 7))); c.stroke(); }
      }
      if (id === 'nova') { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, 30, 0, Math.PI * 2); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------------------------------------------------------- input
  holding() { return this.pointers.size > 0 || [...this.keys].some((k) => HOLD_KEYS.has(k)); }
  input() {
    const cv = this.cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.state !== 'play' || this.paused) return;
      e.preventDefault();
      this.pointers.add(e.pointerId);
      this.pressDead();
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('blur', () => { this.pointers.clear(); this.keys.clear(); if (this.state === 'play') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      const k = e.code;
      if (HOLD_KEYS.has(k) || k === 'Enter') e.preventDefault();
      if (k === 'Escape' || k === 'KeyP') {
        if (this.state === 'play') { this.paused ? this.resume() : this.pause(); }
        else if (this.ui.panel && this.ui.panel !== 'title' && this.state === 'title') this.ui.title();
        return;
      }
      if (e.repeat) return;
      if (this.state === 'title' && this.ui.panel === 'title' && (k === 'Space' || k === 'Enter')) { this.keys.add(k); this.startRun(); return; }
      if (this.state === 'result' && (k === 'Space' || k === 'Enter')) { const b = document.querySelector('#ui .btn.primary'); if (b) b.click(); return; }
      if (this.state !== 'play' || this.paused) return;
      if (k === 'KeyR' || k === 'Enter') { this.restartAttempt(true); return; }
      if (HOLD_KEYS.has(k)) { this.keys.add(k); this.pressDead(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
  }
  // a press after death restarts at once; a press inside the 0.1 s guard (an accidental tap
  // at the crash) is latched and restarts the moment the guard ends, never lost
  pressDead() {
    const g = this.game;
    if (g.p.alive) return;
    if (g.deadT > 0.1) this.restartAttempt(); else g.restartQueued = true;
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)); // a hitch slows the game instead of teleporting the arrow
    this.last = now; this.realT += dt;
    const g = this.game, fx = this.fx;
    const running = (this.state === 'play' && !this.paused) || this.state === 'title' || this.state === 'result';
    let dtGame = 0;
    if (running) {
      const ts = fx.timeScale();
      dtGame = dt * ts;
      if (g.p.alive && !g.finished) {
        g.hold = this.state === 'play' && this.holding();
        this.acc += dtGame;
        let n = 0;
        while (this.acc >= STEP && n < 20 && g.p.alive && !g.finished) {
          g.step();
          this.trail.push([g.p.x, g.p.y]);
          if (this.trail.length > 52) this.trail.shift();
          this.acc -= STEP; n++;
        }
        if (n >= 20) this.acc = 0;
        if (this.look.trail === 'comet' && Math.random() < 0.6) fx.part({ x: g.p.x - 6, y: g.p.y + (Math.random() - 0.5) * 8, vx: -60 - Math.random() * 80, vy: (Math.random() - 0.5) * 60, life: 0.5, max: 0.5, type: 'dot', size: 1.4, col: g.accentNow });
        if (this.state === 'play') {
          this.missionT += dtGame;
          if (this.missionT > 0.5) {
            this.missionT = 0;
            const done = checkMissions(this.save, g.summary(), false);
            if (done.length) { done.forEach((m) => this.missionToast(m)); this.persist(); }
          }
        }
      } else if (!g.p.alive) {
        g.deadT += dt;
        if (this.deathInfo) this.deathInfo.t += dt;
        if (this.state === 'play' && (g.deadT >= 0.6 || (g.restartQueued && g.deadT >= 0.1))) this.restartAttempt();
      } else if (g.finished) {
        g.p.ox = g.p.x; g.p.oy = g.p.y;
        g.p.x += g.vx * dt; g.p.y += (g.p.y < 225 ? 1 : -1) * Math.min(Math.abs(225 - g.p.y), g.vx * dt * 0.5);
        this.trail.push([g.p.x, g.p.y]); if (this.trail.length > 52) this.trail.shift();
      }
      if (this.state === 'title' && this.attractEnd > 0) {
        this.attractEnd -= dt;
        if (this.attractEnd <= 0) { this.attractEnd = 0; const w = Math.floor(Math.random() * 4); g.botLean = 9; g.load({ mode: 'attract', w, l: 1 + Math.floor(Math.random() * 4) }); this.trail = []; this.setAccentCss(); }
      }
      if (this.resultTimer > 0) { this.resultTimer -= dt; if (this.resultTimer <= 0) this.showResult(); }
    }
    fx.update(running ? dt : 0, dtGame);
    this.audio.setIntensity((g.mult - 1) / 6 + (g.meter >= 1 ? 0.2 : 0));
    this.render(dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  beatPulse() {
    const b = this.audio.beatPos();
    if (b < 0) return 0;
    const f = b - Math.floor(b);
    return Math.pow(1 - f, 4);
  }
  render(dt) {
    const g = this.game, play = this.state !== 'title';
    let corner = [], bestX = 0, bestProg = 0, hint = 0;
    if (play) {
      if (g.mode === 'run') {
        corner = [`BEST ${fmt(this.save.run.best)}`, `TIER ${g.tier + 1}`];
        bestX = this.save.run.bestDist > 600 ? this.save.run.bestDist : 0;
        const teachEnd = g.course.chunks[0] ? g.course.chunks[0].x1 : 0;
        if (g.p.x < teachEnd - 300) hint = this.save.runs < 6 ? 1 : g.t < 4 ? 0.45 : 0;
      } else if (g.mode === 'level') {
        const L = WORLDS[g.spec.w].levels[g.spec.l], rec = this.save.levels[`${g.spec.w}-${g.spec.l}`];
        corner = [`${g.spec.w + 1}-${g.spec.l + 1}  ${L.name.toUpperCase()}`, `ATTEMPT ${g.attempts}`];
        if (rec && !g.practice) { bestProg = rec.best / 100; if (!rec.stars[0] && rec.best > 3) bestX = bestProg * g.course.length; }
        if (g.spec.w === 0 && g.spec.l === 0 && g.p.x < 520 && this.save.runs < 10) hint = 1;
      } else if (g.mode === 'daily') {
        const dd = this.save.daily[g.daily.key];
        corner = [`DAILY #${g.daily.num}`, `ATTEMPT ${g.attempts}`];
        if (dd) { bestProg = dd.best / 100; if (!dd.finished && dd.best > 3) bestX = bestProg * g.course.length; }
      }
    }
    this.r.draw({
      g, fx: this.fx, look: this.look, t: this.realT, dt, alpha: this.acc / STEP,
      trail: this.trail, bands: this.audio.bands(40), hud: play, corner, bestX, bestProg,
      ghost: play && !!g.ghost, death: this.deathInfo, attemptLabel: play && !g.practice ? `ATTEMPT ${g.attempts}` : '',
      holdHint: hint, beat: (g.t * BASE_BPM * g.speedMul) / 60, beatPulse: this.beatPulse(),
    });
  }
}

new App();
