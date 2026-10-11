// LANTERNFALL: boot, the fixed-step loop, run setup, saves and achievements.
import { Game, DT } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { load, save as store } from './save.js';
import { buildSprites } from './sprites.js';
import { botMove, botPick } from './bot.js';
import { ACH, CHARS, CHAR_ORDER, MAPS, ACTIVES, PASSIVES, UP } from './data.js';
import { RNG, dateSeed, dateKey } from './util.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
buildSprites();
const R = new Renderer(canvas);
const input = new Input(canvas);
const audio = new Audio();

const app = {
  save: load(), audio, mode: 'title', game: null, bot: qs.has('bot'), god: qs.has('god'), turbo: +(qs.get('turbo') || 1),
  lastResult: null, lastExtra: null, lastOpts: null, paused: false,
  persist() { store(this.save); },

  // ---------------- runs ----------------
  newGame(opts) {
    const s = this.save;
    const g = new Game({
      char: opts.char, map: opts.map, moonless: opts.moonless, daily: opts.daily, attract: opts.attract,
      seed: opts.seed ?? ((Math.random() * 4294967295) >>> 0), pool: opts.pool, shed: opts.daily || opts.attract ? {} : s.shed,
      bake: Math.min(2, Math.max(1, Math.round(R.zoom * R.dpr * 2) / 2)),
      startWith: opts.startWith, god: this.god && !opts.attract, seen: s.seen,
      cb: opts.attract ? {} : {
        levelup: (g) => this.offerCards(g),
        chest: (g, res, first) => { audio.play('chest'); this.ui.chest(g, res, first); this.save.seenChest = true; if (this.bot) setTimeout(() => this.closeChest(), 30); },
        seen: () => this.persist(),
        over: (g, r) => this.over(g, r),
        achieve: (id) => this.achieve(id),
        sfx: (n, p) => audio.play(n, p),
        boss: () => { audio.intensity = 2; },
        ending: (g, dawn) => { if (dawn) { audio.stopMusic(); } else audio.stopMusic(); },
      },
    });
    if (opts.t) { g.time = +opts.t; g.events = g.events.filter((e) => e.t >= g.time); }
    return g;
  },
  startRun(opts) {
    audio.unlock(); audio.apply();
    const s = this.save, sel = s.sel;
    opts = opts || { char: sel.char, map: sel.map, moonless: sel.moonless && !!s.ach.marshdawn };
    if (CHARS[opts.char].unlock && !s.ach[CHARS[opts.char].unlock] && !opts.daily && !qs.has('char')) opts.char = 'lamplighter';
    this.lastOpts = opts;
    this.game = this.newGame(opts);
    if (qs.has('t')) { this.game.time = +qs.get('t'); this.game.events = this.game.events.filter((e) => e.t >= this.game.time); }
    this.mode = 'run'; this.paused = false; input.clear();
    R.cam.x = 0; R.cam.y = 0;
    audio.intensity = 0; audio.startMusic();
    this.ui.hud();
  },
  dailySetup() {
    const seed = dateSeed(), r = new RNG(seed * 7 + 13);
    const char = r.pick(CHAR_ORDER), map = r.chance(0.5) ? 'forest' : 'marsh';
    const acts = r.shuffle([...ACTIVES]).slice(0, 6), pas = r.shuffle([...PASSIVES]).slice(0, 8);
    return { char, map, pool: [...acts, ...pas, 'lantern'], seed, daily: true, moonless: false };
  },
  startDaily() { this.startRun(this.dailySetup()); },
  again() { this.startRun(this.lastOpts && this.lastOpts.daily ? this.dailySetup() : null); },
  restart() { this.paused = false; this.startRun(this.lastOpts && this.lastOpts.daily ? this.dailySetup() : this.lastOpts); },
  quit() { this.paused = false; this.toTitle(); },
  toTitle() {
    this.mode = 'title'; this.paused = false;
    this.attract = this.newGame({ char: this.save.sel.char, map: this.save.sel.map, attract: true, seed: 12345, startWith: ['wisps', 'firefly', 'flicker'] });
    this.attract.time = 40; this.attract.events = this.attract.events.filter((e) => e.t >= 40);
    this.game = this.attract;
    audio.intensity = 0; if (audio.ctx) audio.startMusic();
    this.ui.title();
  },
  pause() {
    if (this.mode !== 'run' || !this.game || this.game.state !== 'play') return;
    this.paused = true; input.clear(); this.ui.pause(this.game);
  },
  resume() { this.paused = false; input.clear(); this.ui.hud(); },

  // ---------------- cards & chests ----------------
  offerCards(g) {
    input.clear();
    this.cards = g.offer();
    audio.play('level');
    if (this.bot) { setTimeout(() => { if (g.state === 'levelup') this.pick(this.cards[botPick(g, this.cards)].id); }, 30); }
    this.ui.levelUp(g, this.cards);
  },
  pick(id) {
    const g = this.game; if (!g || g.state !== 'levelup') return;
    audio.play('pick');
    g.pickCard(id);
    this.ui.hud();
  },
  reroll() {
    const g = this.game; if (!g || g.state !== 'levelup' || g.rerolls <= 0) return;
    g.rerolls--; const prev = this.cards.map((c) => c.id);
    this.cards = g.offer(prev); audio.play('flip');
    this.ui.levelUp(g, this.cards);
  },
  banish(i) {
    const g = this.game; if (!g || g.banishes <= 0) return;
    const id = this.cards[i].id; if (UP[id].kind === 'filler') return;
    g.banish(id); audio.play('banish');
    this.cards = g.offer(this.cards.map((c) => c.id));
    this.ui.levelUp(g, this.cards);
  },
  skip() { const g = this.game; if (!g || g.state !== 'levelup') return; g.pendingLv = Math.max(0, g.pendingLv - 1); g.state = 'play'; g.embersGot += 10; this.ui.hud(); },
  closeChest() { const g = this.game; if (!g || g.state !== 'chest') return; g.closeChest(); input.clear(); this.ui.hud(); },

  // ---------------- results & meta ----------------
  achieve(id) {
    const s = this.save;
    if (s.ach[id]) return;
    const a = ACH.find((x) => x.id === id); if (!a) return;
    s.ach[id] = dateKey(); this.persist();
    this.newUnlocks && this.newUnlocks.push(a);
    audio.play('achieve');
    this.ui.toast('Achievement: ' + a.name, a.reward || a.desc);
  },
  over(g, r) {
    this.mode = 'result';
    const s = this.save, st = s.stats;
    this.newUnlocks = [];
    const before = Object.keys(s.ach).length;
    st.runs++; st.kills += r.kills; st.evolves += r.evolutions;
    s.oil += r.oil;
    if (r.dawn) { st.dawns++; st.dawnChars[r.char] = 1; }
    st.bestTime = Math.max(st.bestTime, r.time);
    const best = st.bestScore; const newBest = r.score > best; if (newBest) st.bestScore = r.score;
    const extra = { best, newBest, unlocks: [] };
    if (r.daily) {
      const today = dateKey(), y = new Date(); y.setDate(y.getDate() - 1);
      const yk = dateKey(y), d = s.daily;
      if (d.last !== today) { d.streak = d.last === yk ? d.streak + 1 : 1; d.last = today; }
      d.bestStreak = Math.max(d.bestStreak || 0, d.streak);
      const prev = d.scores[today];
      extra.best = prev || 0; extra.newBest = prev === undefined || r.score > prev;
      if (extra.newBest) d.scores[today] = r.score;
      const keys = Object.keys(d.scores).sort(); while (keys.length > 60) delete d.scores[keys.shift()];
    }
    this.persist();
    // achievements decided at the end
    this.newUnlocks = [];
    if (r.dawn) this.achieve('dawn1');
    if (r.dawn && r.map === 'marsh') this.achieve('marshdawn');
    if (r.dawn && r.moonless) this.achieve('moonlessdawn');
    if (st.kills >= 3000) this.achieve('kills3000');
    if (CHAR_ORDER.every((k) => st.dawnChars[k])) this.achieve('allchars');
    if (r.daily) { this.achieve('daily1'); if (s.daily.streak >= 3) this.achieve('streak3'); }
    // everything unlocked during this run (including mid-run ones)
    const runStart = this.runAchBefore || {};
    extra.unlocks = ACH.filter((a) => s.ach[a.id] && !runStart[a.id]);   // every achievement from this run, reward or not
    this.ui.toasts = this.ui.toasts.filter((t) => !/^Achievement/.test(t.title));   // the card lists them; no toast over it
    this.mode = 'result'; this.lastResult = r; this.lastExtra = extra;
    window.__lastResult = r;
    setTimeout(() => { if (this.mode === 'result') this.ui.result(r, extra); }, 120);
  },
};
app.ui = new UI(app);
{ const o = app.save.opt; audio.music = o.music; audio.sfx = o.sfx; audio.muted = o.muted; }

// first gesture unlocks audio
const unlock = () => { audio.unlock(); audio.apply(); if (!audio.playing) audio.startMusic(); };
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// hook so the result screen knows what was unlocked during this run
const _start = app.startRun.bind(app);
app.startRun = function (o) { app.runAchBefore = { ...app.save.ach }; return _start(o); };

window.addEventListener('resize', () => R.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) app.pause(); });

// ---------------- loop ----------------
let last = performance.now(), acc = 0;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  const g = app.game;
  if (g) {
    let dt = real;
    if (g.hitstop > 0) { g.hitstop -= real; dt = 0; }
    if (g.slow > 0) { g.slow -= real; dt *= 0.25; }
    if (g.state === 'dying' && !app.paused) g.dyingReal += real;   // the death stamp is timed in real seconds
    const running = !app.paused && (g.state === 'play' || g.state === 'dying' || g.state === 'dawn');
    if (running) {
      acc += dt * (app.turbo || 1);
      let steps = 0;
      const ps = [R.sx(g.p.x), R.sy(g.p.y - 14)];
      while (acc >= DT && steps < 8 * (app.turbo || 1)) {
        if (g.attract || app.bot) g.input = botMove(g); else g.input = input.vector(ps[0], ps[1]);
        g.step(DT); acc -= DT; steps++;
        if (g.state !== 'play' && g.state !== 'dying' && g.state !== 'dawn') { acc = 0; break; }
      }
      if (steps >= 8 * (app.turbo || 1)) acc = 0;
    } else acc = 0;
    if (app.mode === 'run') audio.intensity = g.boss && !g.boss.dead ? 2 : g.time > 150 ? 1 : 0;
    const o = app.save.opt;
    R.draw(g, running ? dt : 0, { shake: o.shake, numbers: o.numbers, stick: app.mode === 'run' && input.stick && g.state === 'play' ? input.stick : null, hud: app.mode !== 'title' });
  }
  audio.update();
  requestAnimationFrame(frame);
}

// ---------------- test hooks ----------------
window.__G = {
  app, get game() { return app.game; }, get save() { return app.save; }, R, audio, input, UP,
  step(n = 60) { for (let i = 0; i < n; i++) { const g = app.game; if (!g || (g.state !== 'play' && g.state !== 'dying' && g.state !== 'dawn')) break; g.input = app.bot ? botMove(g) : g.input; g.step(DT); } },
  setBot(on) { app.bot = !!on; },
  botPick: (g, c) => botPick(g, c),
  botMove: (g) => botMove(g),   // steer one step with the autopilot without turning on auto-picking
  // play to the end with the autopilot (tests)
  autoplay(maxSteps = 30000) {
    let n = 0;
    while (n < maxSteps) {
      const g = app.game; if (!g || g.state === 'over') break;
      if (g.state === 'levelup') { app.pick(app.cards[botPick(g, app.cards)].id); continue; }
      if (g.state === 'chest') { app.closeChest(); continue; }
      g.input = botMove(g); g.step(DT); n++;
    }
    return n;
  },
};

if (qs.has('play') || qs.has('daily')) {
  const sel = app.save.sel;
  if (qs.has('char')) sel.char = qs.get('char');
  if (qs.has('map')) sel.map = qs.get('map');
  if (qs.has('daily')) app.startDaily();
  else app.startRun({ char: qs.get('char') || sel.char, map: qs.get('map') || sel.map, moonless: qs.get('moonless') === '1', seed: qs.has('seed') ? +qs.get('seed') : undefined });
} else app.toTitle();
requestAnimationFrame(frame);
