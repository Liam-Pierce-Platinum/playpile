'use strict';
// menus.js - home screens, fish book, save data, music, transitions, and the main loop.

// ---------------------------------------------------------------- save data
function loadStats() {
  const base = { book: {}, bestDist: 0, runs: 0, total: 0, coins: 0, up: { speed: 0, carry: 0 }, diff: 1, seen: {}, dodges: 0, earned: 0, caveHome: 0, unlocked: [] };
  try {
    const s = JSON.parse(localStorage.getItem('pd_stats') || 'null');
    if (s && s.book) return { ...base, ...s, up: { ...base.up, ...(s.up || {}) }, seen: { ...(s.seen || {}) }, unlocked: s.unlocked || [] };
  } catch (e) { }
  return base;
}
const STATS = loadStats();
function saveStats() { try { localStorage.setItem('pd_stats', JSON.stringify(STATS)); } catch (e) { } }
const ALL_FISH = FISH_LIST.map(f => f[0]);
const foundCount = () => ALL_FISH.filter(k => STATS.book[k] && STATS.book[k].n > 0).length;
let run = { newSpecies: [], coins: 0 };

// ---- penguin unlocks: the first nine are free, the rest are earned by reaching goals
const SKIN_GOALS = {
  KING: [s => s.total >= 10, 'BRING 10 FISH HOME'],
  MACARONI: [s => s.bestDist >= 5000, 'SWIM 500M OUT'],
  CHINSTRAP: [() => foundCount() >= 8, 'FIND 8 KINDS OF FISH'],
  MAGELLANIC: [s => s.runs >= 5, 'PLAY 5 RUNS'],
  AFRICAN: [s => s.earned >= 100, 'EARN 100 POINTS IN ALL'],
  ROYAL: [s => s.bestDist >= 10000, 'SWIM 1000M OUT'],
  'YELLOW-EYED': [s => Object.values(s.book).some(b => b.shiny), 'CATCH A SHINY FISH'],
  NINJA: [s => s.dodges >= 5, 'DODGE 5 NARWHAL CHARGES'],
  PIRATE: [s => s.caveHome >= 1, 'BRING A CAVERN FISH HOME'],
  VIKING: [s => s.up.speed >= 5 || s.up.carry >= 5, 'MAX OUT AN UPGRADE'],
  GENTLEMAN: [() => best >= 60, 'PILE UP 60 IN ONE RUN'],
  GHOST: [() => foundCount() >= 20, 'FIND 20 KINDS OF FISH'],
  RAINBOW: [() => foundCount() >= ALL_FISH.length, 'FIND EVERY FISH IN THE BOOK'],
};
const skinLocked = i => !!SKIN_GOALS[SKINS[i].name] && !STATS.unlocked.includes(SKINS[i].name);
const unlockedCount = () => SKINS.filter((_, i) => !skinLocked(i)).length;
const toasts = [];
function toast(msg, col = '#ffd23f') { toasts.push({ msg, col, t: 3.4 }); }
function checkUnlocks() {
  for (const [name, [test]] of Object.entries(SKIN_GOALS)) {
    if (STATS.unlocked.includes(name) || !test(STATS)) continue;
    STATS.unlocked.push(name); saveStats();
    toast('NEW PENGUIN UNLOCKED: ' + name + '!');
    SFX.tone(660, 1320, 0.2, 'triangle', 0.05); SFX.tone(990, 1980, 0.25, 'triangle', 0.04, 0.12);
  }
}
function drawToasts() {
  toasts.forEach((t, i) => {
    const a = clamp(t.t / 0.4, 0, 1), y = H - 46 - i * 16, w = textWidth(t.msg) + 16;
    ctx.globalAlpha = a; frameBox(Math.round(W / 2 - w / 2), y, w, 13, 'rgba(16,19,24,0.92)', t.col);
    drawText(t.msg, W / 2, y + 4, t.col, 1, 'center', null); ctx.globalAlpha = 1;
  });
}
// every run starts here: apply the chosen difficulty and the bought upgrades
function startRun() {
  if (skinLocked(skinIdx)) { skinIdx = 0; saveSkin(); }
  diff = DIFFS[STATS.diff]; upSpeed = STATS.up.speed; upCarry = STATS.up.carry;
  newGame(); run = { newSpecies: [], coins: 0 }; clickQueued = false;
}

// hooks called from game.js / creatures.js
function onFishCaught(c) {
  const e = STATS.book[c.type] || (STATS.book[c.type] = { n: 0, big: false, shiny: false });
  const isNew = e.n === 0;
  e.n++; if (c.size === 2) e.big = true; if (c.shiny) e.shiny = true;
  saveStats();
  if (isNew) { run.newSpecies.push(c.type); addText(P.x, P.y - 24, 'NEW! ADDED TO YOUR FISH BOOK', '#c9a2ff', 2.2); SFX.tone(880, 1760, 0.15, 'triangle', 0.04, 0.12); }
  checkUnlocks();
}
function onFishHome(c, v) {
  const pts = Math.round(v * diff.pts);
  STATS.total++; STATS.coins += pts; STATS.earned += pts; run.coins += pts; colonyCheer = 1.4;
  if (FISH[c.type].cave) STATS.caveHome++;
  saveStats();
  addText(PILE_X, SHELF_Y - 44, '+' + pts + ' POINTS', '#7be0b8', 1.8);
  checkUnlocks();
}
function onDodge() { STATS.dodges++; saveStats(); addText(P.x, P.y - 14, 'DODGED!', '#7be0b8', 1); checkUnlocks(); }
function onGameOver() { STATS.runs++; STATS.bestDist = Math.max(STATS.bestDist, deepest); saveStats(); overT = 0; checkUnlocks(); }

// ---------------------------------------------------------------- music: a slow, generative arctic lullaby
const MUSIC = {
  master: null, filt: null, bus: null, next: 0, step: 0, note: 3,
  start() {
    if (this.master || !SFX.c) return;
    const c = SFX.c;
    this.master = c.createGain(); this.master.gain.value = SFX.on ? 0.55 : 0;
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 5000;
    this.bus = c.createGain();
    const delay = c.createDelay(); delay.delayTime.value = 0.45;
    const fb = c.createGain(); fb.gain.value = 0.4;
    const wet = c.createGain(); wet.gain.value = 0.4;
    this.bus.connect(this.filt); this.bus.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(this.filt);
    this.filt.connect(this.master).connect(c.destination);
    for (const f of [73.42, 110, 146.83]) { // a soft drone that breathes
      const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.018;
      lfo.frequency.value = 0.05 + Math.random() * 0.06; lg.gain.value = 0.012;
      lfo.connect(lg).connect(g.gain); o.connect(g).connect(this.bus); o.start(); lfo.start();
    }
    this.next = c.currentTime + 0.3;
  },
  pluck(t, f, vol) {
    const c = SFX.c, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g); o2.connect(g); g.connect(this.bus); o.start(t); o2.start(t); o.stop(t + 1.9); o2.stop(t + 1.9);
  },
  tick() {
    if (!this.master) return;
    const c = SFX.c, SCALE = [220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33, 698.46];
    const under = mode === 'play' && P && (P.state === 'swim');
    this.filt.frequency.setTargetAtTime(under ? 900 : 5000, c.currentTime, 0.4);
    while (this.next < c.currentTime + 0.25) {
      const beat = this.step % 16;
      if (beat === 0) this.pluck(this.next, [73.42, 87.31, 98, 65.41][(this.step / 16 | 0) % 4] * 2, 0.05);
      if (Math.random() < (beat % 4 === 0 ? 0.75 : 0.35)) {
        this.note = clamp(this.note + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)], 0, SCALE.length - 1);
        this.pluck(this.next, SCALE[this.note], 0.035);
      }
      this.step++; this.next += 0.32;
    }
  },
};
function toggleSound() {
  SFX.on = !SFX.on;
  if (MUSIC.master) MUSIC.master.gain.setTargetAtTime(SFX.on ? 0.55 : 0, SFX.c.currentTime, 0.1);
}

// ---------------------------------------------------------------- immediate-mode buttons (mouse + keyboard)
const ui = { focus: 0, count: 0, idx: 0, click: false, enter: false, nav: 0, lmx: -1, lmy: -1, moved: false };
function uiBegin() {
  ui.count = ui.idx; ui.idx = 0;
  if (ui.nav && ui.count) ui.focus = (ui.focus + ui.nav + ui.count * 4) % ui.count;
  ui.nav = 0;
  ui.moved = mouse.sx !== ui.lmx || mouse.sy !== ui.lmy; ui.lmx = mouse.sx; ui.lmy = mouse.sy;
}
const over = (x, y, w, h) => mouse.sx >= x && mouse.sx < x + w && mouse.sy >= y && mouse.sy < y + h;
function button(label, x, y, w, h, opt = {}) {
  const i = ui.idx++, hov = over(x, y, w, h);
  if (hov && ui.moved) ui.focus = i;
  const f = ui.focus === i, hit = !opt.disabled && ((ui.click && hov) || (ui.enter && f));
  const yy = y - (f ? 1 : 0);
  ctx.fillStyle = 'rgba(5,7,9,0.55)'; ctx.fillRect(x + 2, y + 2, w, h);
  if (opt.disabled) opt.primary = false;
  const fill = opt.primary ? (f ? '#8be8c6' : '#62d0a8') : opt.disabled ? '#15191d' : (f ? '#2e363e' : '#1c2127');
  const edge = opt.primary ? '#e2fff3' : opt.disabled ? '#3b434a' : (f ? '#ffffff' : '#76808a');
  frameBox(x, yy, w, h, fill, edge);
  if (opt.primary) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 1, yy + 1, w - 2, 2); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 1, yy + h - 3, w - 2, 2); }
  const tc = opt.primary ? '#123329' : opt.disabled ? '#5d656d' : f ? '#ffffff' : '#c9d2d9';
  if (opt.icon) opt.icon(x + 8, yy + h / 2);
  drawBig(label, x + w / 2 + (opt.icon ? 5 : 0), yy + Math.floor((h - 7) / 2), tc, 1, 'center', opt.primary ? null : '#0b0e12');
  if (f) { // bobbing pointer
    const bx = x - 7 + Math.round(Math.sin(time * 6)), by = yy + Math.floor(h / 2);
    ctx.fillStyle = '#ffffff'; for (let k = 0; k < 4; k++) ctx.fillRect(bx + k, by - 3 + k, 1, 7 - k * 2);
  }
  if (hit) { SFX.click(); ui.click = false; ui.enter = false; }
  return hit;
}

// ---------------------------------------------------------------- logo: snow-capped letters with icicles
let LOGO_FILL = null;
const LOGO = (() => {
  const words = [['PENGUIN', 3, ['#ffffff', '#eef2f5', '#d3dce3', '#b4c2cd']], ['DASH', 4, ['#effff8', '#bff3df', '#7ddcb9', '#47b490']]];
  const Wd = Math.max(...words.map(([w, sc]) => w.length * 6 * sc)) + 16, Hd = 7 * 3 + 7 * 4 + 30;
  const b = new Pix(Wd, Hd), letter = new Uint8Array(Wd * Hd);
  let y = 6;
  for (const [word, sc, grad] of words) {
    const ww = word.length * 6 * sc - sc, x0 = Math.floor((Wd - ww) / 2);
    for (let i = 0; i < word.length; i++) {
      const g = BIG[word[i]];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r * 5 + c] === '1')
        for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) {
          const px = x0 + i * 6 * sc + c * sc + xx, py = y + r * sc + yy, t = (r * sc + yy) / (7 * sc);
          b.set(px, py, grad[Math.min(3, Math.floor(t * 4))]); letter[py * Wd + px] = 1;
        }
    }
    y += 7 * sc + 5;
  }
  const L = (x, y) => x >= 0 && y >= 0 && x < Wd && y < Hd && letter[y * Wd + x];
  for (let y = 1; y < Hd - 1; y++) for (let x = 0; x < Wd; x++) {
    if (!L(x, y)) continue;
    if (!L(x, y - 1)) { b.set(x, y, '#ffffff'); if (hash(x, 7) > 0.55) b.set(x, y - 1, '#ffffff'); if (hash(x, 8) > 0.85) b.set(x, y - 2, '#ffffff'); }
    // a few icicles, only off the very bottom of each word
    if (!L(x, y + 1) && !L(x, y + 2) && !L(x, y + 4) && hash(x, y) > 0.86) { const n = 1 + Math.floor(hash(y, x) * 3); for (let k = 1; k <= n; k++) b.set(x, y + k, k === n ? '#ffffff' : '#d6e6ee'); }
  }
  LOGO_FILL = silhouette(b.canvas(), '#ffffff'); // letters only, for the shine
  b.outline('#11151a'); b.outline('#11151a');
  return b.canvas();
})();
const LOGO_SHADOW = silhouette(LOGO, '#07090c');

// ---------------------------------------------------------------- transitions (diamond wipe)
const trans = { t: -1, fn: null };
function goTo(fn) { if (trans.t >= 0) return; trans.t = 0; trans.fn = fn; }
function drawTransition() {
  if (trans.t < 0) return;
  const k = trans.t < 0.3 ? trans.t / 0.3 : 1 - (trans.t - 0.3) / 0.3;
  ctx.fillStyle = '#121519';
  const S = 16;
  for (let gy = 0; gy <= H / S + 1; gy++) for (let gx = 0; gx <= W / S + 1; gx++) {
    const r = Math.round(clamp(k * 1.9 - (gx / (W / S)) * 0.9, 0, 1) * (S + 1));
    if (r <= 0) continue;
    const cx = gx * S, cy = gy * S;
    for (let dy = -r; dy <= r; dy++) { const h = r - Math.abs(dy); ctx.fillRect(cx - h, cy + dy, h * 2, 1); }
  }
}
function setScreen(s) { menuScreen = s; ui.focus = 0; }

// ---------------------------------------------------------------- shared screen chrome
function dimmer(a = 0.6) { ctx.fillStyle = 'rgba(12,15,19,' + a + ')'; ctx.fillRect(0, 0, W, H); }
function heading(title, sub) {
  drawBig(title, W / 2, 9, '#ffffff', 2, 'center');
  ctx.fillStyle = '#7ddcb9'; ctx.fillRect(W / 2 - bigWidth(title, 2) / 2, 26, bigWidth(title, 2), 1);
  if (sub) drawText(sub, W / 2, 30, '#9aa6af', 1, 'center', null);
}

// ---------------------------------------------------------------- HOME
let menuScreen = 'home';
const home = { leaps: [], leapT: 1.5, heroAct: 'stand', heroT: 2, heroFace: -1 };
const HERO_FLOE = prettyFloe(30), HERO_X = 92;
function updateHome(dt) {
  cam.x = lerp(cam.x, -40 + Math.sin(time * 0.06) * 10, Math.min(1, dt * 2)); cam.y = lerp(cam.y, -73, Math.min(1, dt * 2));
  home.heroT -= dt;
  if (home.heroT <= 0) {
    home.heroAct = ['stand', 'stand', 'flap', 'walk', 'look'][Math.floor(Math.random() * 5)];
    home.heroT = home.heroAct === 'stand' ? 1.5 + Math.random() * 2 : 0.8 + Math.random();
    if (home.heroAct === 'look') { home.heroFace *= -1; home.heroAct = 'front'; home.heroT = 0.25; }
  }
  // fish jump out of the sea now and then
  home.leapT -= dt;
  if (home.leapT <= 0) {
    home.leapT = 1.8 + Math.random() * 3;
    const x0 = OX + 250 + Math.random() * 130, dir = Math.random() < 0.5 ? -1 : 1;
    const type = OPEN_FISH[Math.floor(Math.random() * 12)].key;
    home.leaps.push({ x0, dx: dir * (20 + Math.random() * 25), h: 16 + Math.random() * 20, dur: 0.8 + Math.random() * 0.4, age: 0, type });
    addPart(x0, 0, 0, 0, 1, '#d9e0e5', 'ripple');
    for (let i = 0; i < 4; i++) addPart(x0, -1, (Math.random() - 0.5) * 30, -30 - Math.random() * 30, 0.6, '#ffffff', 'drop');
  }
  for (let i = home.leaps.length - 1; i >= 0; i--) {
    const l = home.leaps[i]; l.age += dt;
    if (l.age >= l.dur) {
      addPart(l.x0 + l.dx, 0, 0, 0, 1, '#d9e0e5', 'ripple');
      for (let k = 0; k < 4; k++) addPart(l.x0 + l.dx, -1, (Math.random() - 0.5) * 30, -20 - Math.random() * 25, 0.5, '#ffffff', 'drop');
      SFX.noise(0.12, 1800, 600, 0.015);
      home.leaps.splice(i, 1);
    }
  }
  updateParts(dt);
}
function drawHomeExtras() {
  for (const l of home.leaps) {
    const t = l.age / l.dur, x = l.x0 + l.dx * t, y = -l.h * 4 * t * (1 - t);
    const vy = -l.h * 4 * (1 - 2 * t) / l.dur, vx = l.dx / l.dur;
    const img = FISH_SPR[l.type][1][Math.floor(l.age * 10) % 4], a = Math.atan2(vy, vx);
    drawSprite(img, x - OX, y - OY, a, Math.cos(a) < 0, img.width / 2, img.height / 2);
  }
}
function drawHero() {
  const wl = sy(0), bob = Math.round(Math.sin(time * 1.6) * 1.5);
  const fx = sx(HERO_X), top = wl - 10 + bob;
  ctx.drawImage(HERO_FLOE, fx - 32, top - 2, HERO_FLOE.width * 2, HERO_FLOE.height * 2);
  foam(fx - 33, wl, -1); foam(fx + 33, wl, 1);
  drawPenguinAt(skinIdx, fx + (home.heroAct === 'walk' ? Math.round(Math.sin(time * 3) * 6) : 0), top - 14, home.heroAct, 0, home.heroFace, time, 1, 0, 2);
}
function drawHomeScreen() {
  // a soft dark band behind the logo so it reads against the clouds
  const g = ctx.createLinearGradient(0, 0, 0, 80); g.addColorStop(0, 'rgba(14,17,21,0.55)'); g.addColorStop(1, 'rgba(14,17,21,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 80);
  const lx = Math.floor(W / 2 - LOGO.width / 2), ly = 4 + Math.round(Math.sin(time * 1.4) * 1.5);
  ctx.globalAlpha = 0.6; ctx.drawImage(LOGO_SHADOW, lx + 3, ly + 3); ctx.globalAlpha = 1;
  ctx.drawImage(LOGO, lx, ly);
  // a glint sweeping across the logo every few seconds
  const gx = Math.floor(((time * 80) % 520) - 60); // a shine sweeping across the letters
  if (gx > -40 && gx < LOGO.width + 40) {
    ctx.globalAlpha = 0.55;
    for (let y = 0; y < LOGO.height; y += 2) { const sx0 = gx - Math.floor(y * 0.5); if (sx0 >= 0 && sx0 + 4 <= LOGO.width) ctx.drawImage(LOGO_FILL, sx0, y, 4, 2, lx + sx0, ly + y, 4, 2); }
    ctx.globalAlpha = 1;
  }

  const bx = W / 2 - 56, bw = 112, bh = 16;
  if (button('PLAY', bx, 72, bw, bh, { primary: true })) goTo(startRun);
  if (button('UPGRADES', bx, 92, bw, bh)) goTo(() => setScreen('shop'));
  if (button('PENGUINS', bx, 112, bw, bh)) goTo(() => { wardSel = skinIdx; setScreen('skins'); });
  if (button('FISH BOOK', bx, 132, bw, bh)) goTo(() => { setScreen('book'); book.sel = 0; book.tab = 'fish'; });
  if (button('HOW TO PLAY', bx, 152, bw, bh)) goTo(() => { setScreen('help'); help.page = 0; });
  drawDifficulty(bx, 174, bw);

  frameBox(4, H - 15, 282, 12, 'rgba(14,17,21,0.7)', '#4b545c');
  drawText('POINTS ' + STATS.coins + '  BEST ' + best + '  FARTHEST ' + Math.round(STATS.bestDist / 10) + 'M  FISH ' + foundCount() + '/' + ALL_FISH.length + '  PENGUINS ' + unlockedCount() + '/' + SKINS.length, 9, H - 11, '#c9d2d9', 1, 'left', null);
  drawText((SFX.on ? 'SOUND ON' : 'SOUND OFF') + '  (M)', W - 6, H - 11, '#8f99a2', 1, 'right');
}

function setDiff(d) { STATS.diff = clamp(d, 0, DIFFS.length - 1); saveStats(); SFX.click(); }
function drawDifficulty(x, y, w) {
  const D = DIFFS[STATS.diff];
  frameBox(x, y, w, 14, 'rgba(16,19,24,0.85)', '#5d656d');
  const arrow = (ax, dirn, on) => {
    const hov = over(ax - 2, y, 14, 14);
    ctx.fillStyle = !on ? '#3b434a' : hov ? '#ffffff' : '#9aa4ad';
    for (let k = 0; k < 4; k++) ctx.fillRect(ax + (dirn < 0 ? k : 3 - k), y + 7 - k, 1, k * 2 + 1);
    if (on && hov && ui.click) { setDiff(STATS.diff + dirn); ui.click = false; }
  };
  arrow(x + 6, -1, STATS.diff > 0); arrow(x + w - 10, 1, STATS.diff < DIFFS.length - 1);
  drawText('DIFFICULTY', x + 16, y + 5, '#8f99a2', 1, 'left', null);
  drawBig(D.name, x + w - 16, y + 4, D.col, 1, 'right');
}

// ---------------------------------------------------------------- UPGRADES (shop)
const UPGRADES = [
  { key: 'speed', name: 'SPEED', tbl: SPEED_LV, unit: '', blurb: 'HOW FAST YOU SWIM. SEALS AND SHARKS SWIM AT 150, ORCAS AT 166.' },
  { key: 'carry', name: 'STRENGTH', tbl: CARRY_LV, unit: 'KG', blurb: 'THE HEAVIEST FISH YOU CAN LIFT. HEAVY FISH SLOW YOU DOWN AND WEAKEN YOUR DASH.' },
];
function drawShopScreen() {
  dimmer(0.6);
  heading('UPGRADES', 'BRING FISH HOME TO EARN POINTS');
  frameBox(W / 2 - 52, 36, 104, 14, 'rgba(16,19,24,0.9)', '#ffd23f');
  drawBig(STATS.coins + ' PTS', W / 2, 40, '#ffd23f', 1, 'center');
  UPGRADES.forEach((u, i) => {
    const x = 14 + i * 190, y = 56, w = 182, h = 136, lv = STATS.up[u.key], maxed = lv >= UPGRADE_COST.length;
    frameBox(x, y, w, h, 'rgba(16,19,24,0.9)');
    // picture
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, 40); ctx.clip();
    ctx.drawImage(WATER, 0, 120, w - 4, 40, x + 2, y + 2, w - 4, 40);
    if (u.key === 'speed') {
      const px = x + 2 + ((time * (60 + lv * 25)) % (w + 20)) - 10;
      for (let k = 1; k < 6; k++) { ctx.fillStyle = '#dfe7ec'; ctx.globalAlpha = 0.5 - k * 0.08; ctx.fillRect(Math.round(px - 8 - k * 6), y + 21 + (k % 2) * 3, 4, 1); }
      ctx.globalAlpha = 1;
      drawPenguinAt(skinIdx, px, y + 22, 'swim', 0, 1, time * (1.5 + lv * 0.3));
    } else {
      const fk = ['herring', 'char', 'salmon', 'halibut', 'toothfish', 'abyss'][Math.min(lv, 5)], img = FISH_SPR[fk][1][Math.floor(time * 6) % 4];
      const py = y + 22 + Math.round(Math.sin(time * 2) * 2);
      drawHeldFish({ type: fk, size: 1, shiny: false }, x + w / 2 - 6, py, 'swim', 0, 1, 1);
      drawPenguinAt(skinIdx, x + w / 2 - 6, py, 'swim', 0, 1, time * 1.4);
    }
    ctx.restore();
    drawBig(u.name, x + 8, y + 47, '#7ddcb9');
    for (let p = 0; p < UPGRADE_COST.length; p++) { // level pips
      ctx.fillStyle = '#0b0e12'; ctx.fillRect(x + w - 70 + p * 13, y + 47, 11, 7);
      ctx.fillStyle = p < lv ? '#7be0b8' : '#2e363e'; ctx.fillRect(x + w - 69 + p * 13, y + 48, 9, 5);
    }
    const now = u.tbl[lv] + u.unit, next = maxed ? null : u.tbl[lv + 1] + u.unit;
    drawText('NOW', x + 8, y + 62, '#8f99a2', 1, 'left', null); drawBig(now, x + 26, y + 61, '#ffffff');
    if (next) { drawText('NEXT', x + 92, y + 62, '#8f99a2', 1, 'left', null); drawBig(next, x + 114, y + 61, '#7be0b8'); }
    wrapText(u.blurb, w - 16).forEach((l, j) => drawText(l, x + 8, y + 75 + j * 7, '#aab4bc', 1, 'left', null));
    if (u.key === 'carry') {
      const fits = OPEN_FISH.concat(CAVE_FISH).filter(t => fishKg({ type: t.key, size: 1, shiny: false }) <= u.tbl[lv]).length;
      drawText('CAN LIFT ' + fits + ' OF ' + ALL_FISH.length + ' KINDS (NORMAL SIZE)', x + 8, y + 97, '#ffd23f', 1, 'left', null);
    }
    const cost = maxed ? 0 : UPGRADE_COST[lv], afford = !maxed && STATS.coins >= cost;
    if (button(maxed ? 'MAXED' : 'BUY  ' + cost + ' PTS', x + 8, y + h - 24, w - 16, 17, { primary: afford, disabled: !afford })) {
      STATS.coins -= cost; STATS.up[u.key]++; saveStats(); checkUnlocks();
      SFX.deposit(); for (let k = 0; k < 3; k++) SFX.tone(880 + k * 220, 1320 + k * 220, 0.1, 'triangle', 0.03, 0.25 + k * 0.06);
    }
  });
  if (button('BACK', 14, 200, 60, 17)) goTo(() => setScreen('home'));
  if (button('PLAY', W - 74, 200, 60, 17, { primary: true })) goTo(startRun);
}

// ---------------------------------------------------------------- PENGUINS (wardrobe)
const SKIN_BLURB = {
  EMPEROR: 'THE CLASSIC. TALL, PROUD AND A LITTLE BIT YELLOW AROUND THE EARS.',
  ADELIE: 'WEARS A RED SCARF. NEVER COLD. ALWAYS HUNGRY.',
  ROCKHOPPER: 'SPIKY YELLOW EYEBROWS AND A BAD ATTITUDE. A GREAT JUMPER.',
  GENTOO: 'THE FASTEST SWIMMER OF ALL PENGUINS IN REAL LIFE. HONEST.',
  'LITTLE BLUE': 'THE SMALLEST PENGUIN IN THE WORLD, WITH THE BIGGEST HEART.',
  BUBBLEGUM: 'NOBODY KNOWS HOW SHE GOT PINK. SHE WILL NOT SAY.',
  SANTA: 'DELIVERS FISH, NOT PRESENTS. STILL VERY JOLLY.',
  GOLDIE: 'ROYALTY OF THE ICE. ONLY EATS GOLDEN FISH (NOT TRUE).',
  MINTY: 'COOL, CALM AND VERY, VERY FRESH.',
  KING: 'TALL AND ELEGANT, WITH BRIGHT ORANGE EAR PATCHES.',
  MACARONI: 'NAMED AFTER A HAIRSTYLE. THE HAIR IS NOT OPTIONAL.',
  CHINSTRAP: 'WEARS ITS HELMET STRAP ALL DAY. SAFETY FIRST.',
  MAGELLANIC: 'TWO STRIPES, ZERO REGRETS.',
  AFRICAN: 'FROM WARMER SHORES. SPOTTY. BRAYS LIKE A DONKEY.',
  ROYAL: 'A WHITE FACE AND A GOLDEN CREST. VERY SERIOUS.',
  'YELLOW-EYED': 'ONE OF THE RAREST PENGUINS ALIVE. SHY. LOOKS SUSPICIOUS.',
  NINJA: 'YOU DID NOT SEE THIS PENGUIN.',
  PIRATE: 'ARR. FOR ONCE, SOMEBODY STEALS FROM THE SKUAS.',
  VIKING: 'SAILED HERE ON AN ICE FLOE. HORNS INCLUDED.',
  GENTLEMAN: 'ONLY EVER SWIMS IN FORMAL WEAR.',
  GHOST: 'OOOOOH. (IT IS JUST A VERY PALE PENGUIN.)',
  RAINBOW: 'EVERY COLOUR AT ONCE. THE PRIZE FOR FINDING EVERY FISH.',
};
let wardSel = -1;
const SKIN_SIL = [];
const skinSil = i => SKIN_SIL[i] || (SKIN_SIL[i] = silhouette((Array.isArray(PENGUIN_SPR[i]) ? PENGUIN_SPR[i][0] : PENGUIN_SPR[i]).stand[0], '#2a3036'));
function pickSkin(i) { wardSel = i; if (!skinLocked(i)) { skinIdx = i; saveSkin(); } SFX.click(); }
function skinsKey(dx, dy) { if (wardSel < 0) wardSel = skinIdx; pickSkin((wardSel + dx + dy * 5 + SKINS.length) % SKINS.length); }
function drawSkinsScreen() {
  if (wardSel < 0) wardSel = skinIdx;
  const sel = wardSel, locked = skinLocked(sel), sk = SKINS[sel];
  dimmer(0.55);
  heading('PENGUINS', unlockedCount() + ' OF ' + SKINS.length + ' UNLOCKED');
  // stage: spotlight + snow mound + the penguin at 4x
  frameBox(10, 36, 184, 160, 'rgba(16,19,24,0.82)');
  ctx.save(); ctx.beginPath(); ctx.rect(11, 37, 182, 158); ctx.clip();
  for (let y = 0; y < 86; y++) { const w = 18 + y * 0.55; ctx.globalAlpha = 0.05 + 0.07 * (y / 86); ctx.fillStyle = '#e8eef2'; ctx.fillRect(Math.round(102 - w), 37 + y, Math.round(w * 2), 1); }
  ctx.globalAlpha = 1; ctx.restore();
  for (let y = 0; y < 8; y++) { const w = Math.round(46 * Math.sqrt((y + 1) / 8)); ctx.fillStyle = y === 0 ? '#ffffff' : y < 3 ? '#e6ebee' : '#c9d2d9'; ctx.fillRect(102 - w, 112 + y, w * 2, 1); }
  if (locked) {
    const img = skinSil(sel);
    ctx.save(); ctx.translate(102, 89); ctx.scale(4, 4); ctx.drawImage(img, -(PAD + 6), -(PAD + 7)); ctx.restore();
    drawBig('?', 102, 70, '#8f99a2', 2, 'center');
    drawBig(sk.name, 102, 124, '#8f99a2', 1, 'center');
    frameBox(22, 136, 160, 22, 'rgba(10,12,15,0.9)', '#ffd23f');
    drawText('LOCKED - TO UNLOCK:', 102, 140, '#ffd23f', 1, 'center', null);
    drawText(SKIN_GOALS[sk.name][1], 102, 149, '#ffffff', 1, 'center', null);
  } else {
    const act = Math.sin(time * 0.9) > 0.6 ? 'flap' : Math.sin(time * 0.5) > 0.3 ? 'walk' : Math.sin(time * 0.37) > 0.85 ? 'front' : 'stand';
    drawPenguinAt(sel, 102, 113 - 24, act, 0, Math.sin(time * 0.3) > -0.2 ? 1 : -1, time, 1, 0, 4);
    drawBig(sk.name, 102, 124, '#ffffff', 1, 'center');
    wrapText(SKIN_BLURB[sk.name] || '', 168).forEach((l, i) => drawText(l, 102, 135 + i * 7, '#aab4bc', 1, 'center', null));
    // swim preview, with a fish in the beak
    const wx = 20, wy = 160, ww = 164, wh = 30;
    ctx.drawImage(WATER, 0, 160, ww, wh, wx, wy, ww, wh);
    ctx.fillStyle = '#76808a'; ctx.fillRect(wx, wy - 1, ww, 1); ctx.fillRect(wx, wy + wh, ww, 1);
    const px = wx + ((time * 50) % (ww + 40)) - 20, py = wy + 15 + Math.sin(time * 3) * 4;
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    drawHeldFish({ type: 'herring', size: 1, shiny: false }, px, py, 'swim', Math.cos(time * 3) * 0.25, 1, 1);
    drawPenguinAt(sel, px, py, 'swim', Math.cos(time * 3) * 0.25, 1, time * 1.4);
    ctx.restore();
  }
  // the wardrobe grid: 5 across
  for (let i = 0; i < SKINS.length; i++) {
    const cx = 200 + (i % 5) * 38, cy = 36 + Math.floor(i / 5) * 32, isSel = i === sel, hov = over(cx, cy, 36, 30), lk = skinLocked(i);
    if (hov && ui.click) { pickSkin(i); ui.click = false; }
    frameBox(cx, cy, 36, 30, isSel ? 'rgba(98,208,168,0.22)' : hov ? 'rgba(255,255,255,0.08)' : 'rgba(16,19,24,0.8)', isSel ? '#8be8c6' : i === skinIdx ? '#ffd23f' : hov ? '#c9d2d9' : '#4b545c');
    ctx.save(); ctx.beginPath(); ctx.rect(cx + 1, cy + 1, 34, 28); ctx.clip();
    if (lk) {
      ctx.save(); ctx.translate(cx + 18, cy + 15); ctx.scale(2, 2); ctx.drawImage(skinSil(i), -(PAD + 6), -(PAD + 7)); ctx.restore();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx + 26, cy + 20, 6, 5); ctx.fillStyle = '#0b0e12'; ctx.fillRect(cx + 28, cy + 22, 2, 2); // padlock
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx + 27, cy + 17, 1, 3); ctx.fillRect(cx + 30, cy + 17, 1, 3); ctx.fillRect(cx + 27, cy + 17, 4, 1);
    } else drawPenguinAt(i, cx + 18, cy + 15 - (isSel ? Math.round(Math.abs(Math.sin(time * 5)) * 2) : 0), isSel ? 'walk' : 'stand', 0, 1, time + i, 1, 0, 2);
    ctx.restore();
  }
  drawText('YELLOW = WEARING', 200, 197, '#8f99a2', 1, 'left', null);
  if (button('BACK', 10, 202, 60, 17)) goTo(() => setScreen('home'));
  if (button('PLAY', W - 72, 202, 62, 17, { primary: true })) goTo(startRun);
}

// ---------------------------------------------------------------- FISH BOOK (fish + creatures)
const book = { sel: 0, tab: 'fish', csel: 0 };
const SIL = {}; for (const k of ALL_FISH) SIL[k] = silhouette(FISH_SPR[k][1][1], '#3a4249');
const PORTRAIT_SC = { seal: 0.8, shark: 0.7, orca: 0.55, sealion: 0.8, walrus: 0.6, narwhal: 0.5, sleeper: 0.45, squid: 0.3, crab: 0.55, lionsmane: 0.55, jelly: 1, skua: 1, angler: 0.9, eel: 0.9 };
function bookKey(dx, dy) {
  if (book.tab === 'fish') book.sel = clamp(book.sel + dx + dy * 9, 0, ALL_FISH.length - 1);
  else book.csel = clamp(book.csel + dx + dy * 7, 0, BESTIARY.length - 1);
  SFX.click();
}
function tabButton(label, x, y, w, on) {
  const hov = over(x, y, w, 12);
  frameBox(x, y, w, 12, on ? 'rgba(98,208,168,0.25)' : hov ? 'rgba(255,255,255,0.08)' : 'rgba(16,19,24,0.85)', on ? '#8be8c6' : '#5d656d');
  drawText(label, x + w / 2, y + 4, on ? '#ffffff' : '#9aa4ad', 1, 'center', null);
  if (hov && ui.click && !on) { ui.click = false; SFX.click(); return true; }
  return false;
}
function drawBookScreen() {
  dimmer(0.6);
  const met = BESTIARY.filter(b => STATS.seen[b[0]]).length;
  heading('FISH BOOK', book.tab === 'fish' ? foundCount() + ' OF ' + ALL_FISH.length + ' FISH FOUND' : met + ' OF ' + BESTIARY.length + ' CREATURES MET');
  if (tabButton('FISH', W / 2 - 82, 37, 78, book.tab === 'fish')) book.tab = 'fish';
  if (tabButton('CREATURES', W / 2 + 4, 37, 78, book.tab === 'creatures')) book.tab = 'creatures';
  if (book.tab === 'fish') drawFishTab(); else drawCreatureTab();
  if (button('BACK', 13, 205, 60, 16)) goTo(() => setScreen('home'));
  drawText('ARROWS TO BROWSE', W - 13, 211, '#6c757d', 1, 'right', null);
}
function drawFishTab() {
  for (let i = 0; i < ALL_FISH.length; i++) {
    const k = ALL_FISH[i], T = FISH[k], e = STATS.book[k], found = e && e.n > 0;
    const cx = 11 + (i % 9) * 42, cy = 52 + Math.floor(i / 9) * 32, sel = i === book.sel, hov = over(cx, cy, 40, 30);
    if (hov && ui.moved) book.sel = i;
    frameBox(cx, cy, 40, 30, sel ? 'rgba(30,36,42,0.96)' : 'rgba(16,19,24,0.94)', sel ? '#ffffff' : T.cave ? '#8a6fb0' : '#4b545c');
    const img = found ? FISH_SPR[k][1][sel ? Math.floor(time * 8) % 4 : 1] : SIL[k];
    ctx.save(); ctx.beginPath(); ctx.rect(cx + 1, cy + 1, 38, 28); ctx.clip();
    if (!found && sel) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4);
    ctx.drawImage(img, cx + 20 - Math.floor(img.width / 2), cy + 12 - Math.floor(img.height / 2) + (sel ? Math.round(Math.sin(time * 3)) : 0));
    ctx.restore();
    if (found) {
      drawText('+' + T.val, cx + 37, cy + 23, '#ffd23f', 1, 'right', null);
      if (e.shiny) { ctx.fillStyle = '#ffe46a'; ctx.fillRect(cx + 4, cy + 3, 1, 3); ctx.fillRect(cx + 3, cy + 4, 3, 1); }
      if (e.big) drawText('B', cx + 3, cy + 23, '#bfe3ff', 1, 'left', null);
    } else drawText('?', cx + 20, cy + 23, '#5d656d', 1, 'center', null);
  }
  const k = ALL_FISH[book.sel], T = FISH[k], e = STATS.book[k], found = e && e.n > 0;
  frameBox(11, 182, 378, 20, 'rgba(16,19,24,0.92)', T.cave ? '#8a6fb0' : '#76808a');
  const where = T.cave ? 'ONLY IN THE DEEP CAVERNS' : Math.round(T.min / 10) + 'M TO ' + Math.round(T.max / 10) + 'M OUT';
  const kg = fishKg({ type: k, size: 1, shiny: false }), lift = kg <= CARRY_LV[STATS.up.carry];
  if (found) {
    drawBig(T.name, 16, 185, T.cave ? '#d9c2ff' : '#ffffff');
    drawText('WORTH ' + T.val + ' - ' + kg + 'KG' + (lift ? '' : ' (TOO HEAVY)') + ' - ' + where + ' - CAUGHT ' + e.n + (e.shiny ? ' - SHINY!' : ''), 16, 195, lift ? '#c9d2d9' : '#ff9a9a', 1, 'left', null);
  } else {
    drawBig('???', 16, 185, '#8f99a2');
    drawText('NOT FOUND YET. LOOK ' + where + (T.cave ? ' - MIND THE GUARDS.' : '.'), 16, 195, '#8f99a2', 1, 'left', null);
  }
}
function drawCreatureTab() {
  BESTIARY.forEach(([k, name], i) => {
    const cx = 11 + (i % 7) * 54, cy = 52 + Math.floor(i / 7) * 52, sel = i === book.csel, hov = over(cx, cy, 52, 50), seen = STATS.seen[k];
    if (hov && ui.moved) book.csel = i;
    frameBox(cx, cy, 52, 50, sel ? 'rgba(60,70,80,0.9)' : 'rgba(16,19,24,0.82)', sel ? '#ffffff' : '#4b545c');
    ctx.save(); ctx.beginPath(); ctx.rect(cx + 1, cy + 1, 50, 38); ctx.clip();
    const cave = k === 'angler' || k === 'eel' || k === 'squid' || k === 'crab';
    ctx.drawImage(WATER, 0, cave ? 560 : k === 'skua' ? 0 : 160, 50, 38, cx + 1, cy + 1, 50, 38);
    if (k === 'skua') { ctx.drawImage(SKY_NEAR, 0, SKY_H - 38, 50, 38, cx + 1, cy + 1, 50, 38); }
    if (seen) creaturePortrait(k, cx + 26, cy + 20 + (k === 'crab' ? 6 : 0), PORTRAIT_SC[k] || 0.8);
    else drawBig('?', cx + 26, cy + 14, '#5d656d', 2, 'center');
    ctx.restore();
    drawText(seen ? name : '???', cx + 26, cy + 42, seen ? '#ffffff' : '#5d656d', 1, 'center', null);
  });
  const [k, name, where, tip] = BESTIARY[book.csel], seen = STATS.seen[book.csel >= 0 ? k : ''];
  frameBox(11, 158, 378, 44, 'rgba(16,19,24,0.92)', '#76808a');
  if (seen) {
    drawBig(name, 16, 162, '#ff9a9a');
    drawText(where, 384, 163, '#8f99a2', 1, 'right', null);
    wrapText(tip, 366).forEach((l, j) => drawText(l, 16, 174 + j * 8, '#c9d2d9', 1, 'left', null));
  } else {
    drawBig('???', 16, 162, '#8f99a2');
    drawText('NOT MET YET. SEEN ' + where + '.', 16, 176, '#8f99a2', 1, 'left', null);
  }
}

// ---------------------------------------------------------------- HOW TO PLAY (illustrated)

const help = { page: 0 };
function miniSea(x, y, w, h, surf) { // sky above, sea below, inside a clip
  ctx.drawImage(SKY_NEAR, 0, SKY_H - surf, w, surf, x, y, w, surf);
  ctx.drawImage(WATER, 0, 0, w, h - surf, x, y + surf, w, h - surf);
  for (let i = 0; i < w; i++) { const o = Math.round(Math.sin(i * 0.15 + time * 2.5) * 0.7); ctx.fillStyle = '#e4e9ec'; ctx.fillRect(x + i, y + surf + o - 1, 1, 1); ctx.fillStyle = '#a3afb7'; ctx.fillRect(x + i, y + surf + o, 1, 1); }
}
function cursorIcon(x, y) { ctx.fillStyle = OUTLINE; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, 1, 1); }
function helpPanel(x, y, w, h, title, text, scene) {
  frameBox(x, y, w, h, 'rgba(16,19,24,0.9)');
  ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, 48); ctx.clip(); scene(x + 2, y + 2, w - 4, 48); ctx.restore();
  ctx.fillStyle = '#4b545c'; ctx.fillRect(x + 2, y + 50, w - 4, 1);
  drawBig(title, x + 6, y + 54, '#7ddcb9');
  wrapText(text, w - 12).forEach((l, i) => drawText(l, x + 6, y + 64 + i * 7, '#c9d2d9', 1, 'left', null));
}
function drawHelpScreen() {
  dimmer(0.62);
  const sk = skinIdx;
  if (help.page === 0) {
    heading('HOW TO PLAY', 'PAGE 1 OF 3 - MOVING AND FISHING');
    helpPanel(10, 38, 186, 78, 'SWIM', 'MOVE THE MOUSE. YOUR PENGUIN SWIMS TOWARD IT, WITH MOMENTUM.', (x, y, w, h) => {
      miniSea(x, y, w, h, 6);
      const cx = x + w / 2 + Math.cos(time * 0.9) * 60, cy = y + 28 + Math.sin(time * 1.8) * 10;
      const px = x + w / 2 + Math.cos(time * 0.9 - 0.5) * 60, py = y + 28 + Math.sin(time * 1.8 - 1) * 10;
      drawPenguinAt(sk, px, py, 'swim', Math.atan2(cy - py, cx - px), 1, time * 1.5);
      cursorIcon(Math.round(cx), Math.round(cy));
    });
    helpPanel(204, 38, 186, 78, 'DASH', 'CLICK OR SPACE TO DASH WITH A BARREL ROLL. IT TAKES A COUPLE OF SECONDS TO RECHARGE.', (x, y, w, h) => {
      miniSea(x, y, w, h, 6);
      const ph = (time % 1.6) / 1.6, px = x + 20 + ph * (w - 40), roll = ph < 0.4 ? ph / 0.4 : 0;
      for (let k = 1; k < 4 && ph < 0.5; k++) drawPenguinAt(sk, px - k * 9, y + 28, 'swim', 0, 1, time, 0.25, roll);
      drawPenguinAt(sk, px, y + 28, 'swim', 0, 1, time * 2, 1, roll);
    });
    helpPanel(10, 120, 186, 78, 'LEAP', 'SWIM UP FAST TO FLY OUT OF THE WATER. NOTHING CAN BITE YOU IN THE AIR.', (x, y, w, h) => {
      const surf = 26; miniSea(x, y, w, h, surf);
      const ph = (time % 2.4) / 2.4, X = x + 20 + ph * (w - 40);
      const Y = y + surf + 12 - Math.sin(ph * Math.PI) * 34;
      const dY = -Math.cos(ph * Math.PI) * 34 * Math.PI;
      drawPenguinAt(sk, X, Y, Y < y + surf ? 'air' : 'swim', Math.atan2(dY, (w - 40)), 1, time * 2);
      const sh = ENEMY_SPR.shark.shut[Math.floor(time * 6) % 8];
      ctx.save(); ctx.translate(Math.round(x + w / 2), y + surf + 15); ctx.scale(0.5, 0.5); ctx.drawImage(sh, -sh.width / 2, -sh.height / 2); ctx.restore();
    });
    helpPanel(204, 120, 186, 78, 'BRING IT HOME', 'GRAB A FISH, JUMP ONTO THE SHORE, DROP IT ON THE PILE FOR POINTS. HEAVY FISH SLOW YOU DOWN.', (x, y, w, h) => {
      miniSea(x, y, w, h, 22);
      ctx.fillStyle = '#e4e9ec'; ctx.fillRect(x, y + 16, 46, 32); ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + 15, 46, 2);
      ctx.fillStyle = '#7a5d44'; ctx.fillRect(x + 10, y + 11, 22, 5);
      for (let k = 0; k < 4; k++) ctx.drawImage(FISH_SPR.herring[1][1], x + 8 + k * 5, y + 5 + (k % 2) * 2);
      const ph = (time % 3) / 3;
      const fx = x + w - 30 - ph * (w - 70), fy = y + 34 - Math.max(0, (ph - 0.6) / 0.4) * 30;
      const fa = ph > 0.6 ? -2.4 : Math.PI;
      drawHeldFish({ type: 'salmon', size: 1, shiny: false }, fx, fy, 'swim', fa, -1, -1);
      drawPenguinAt(sk, fx, fy, ph > 0.6 ? 'air' : 'swim', fa, -1, time * 2);
    });
  } else if (help.page === 1) {
    heading('HOW TO PLAY', 'PAGE 2 OF 3 - WHAT WANTS TO EAT YOU');
    const foes = [
      ['seal', 'SEAL', 'AS FAST AS YOU. CUTS YOU OFF AND WAITS WHERE YOU LAND.'],
      ['shark', 'SHARK', 'AS FAST AS YOU. CALLS EVERY HUNTER NEARBY TO YOU.'],
      ['sealion', 'SEA LION', 'SPRINTS FASTER THAN YOU, THEN TIRES. OUTLAST IT.'],
      ['narwhal', 'NARWHAL', 'AIMS, THEN CHARGES. WATCH THE TUSK GLINT. SIDESTEP.'],
      ['orca', 'ORCAS', 'RARE, FASTER THAN YOU, HUNT IN PACKS OF 3+.'],
    ];
    foes.forEach(([k, name, note], i) => {
      const x = 8 + i * 77, y = 38, w = 74;
      frameBox(x, y, w, 86, 'rgba(16,19,24,0.9)');
      ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, 36); ctx.clip();
      ctx.drawImage(WATER, 0, 90, w - 4, 36, x + 2, y + 2, w - 4, 36);
      creaturePortrait(k, x + w / 2 + Math.sin(time + i) * 3, y + 20 + Math.sin(time * 1.3 + i) * 2, PORTRAIT_SC[k] || 0.8);
      ctx.restore();
      drawBig(name, x + w / 2, y + 42, '#ff9a9a', 1, 'center');
      wrapText(note, w - 10).forEach((l, j) => drawText(l, x + 5, y + 53 + j * 7, '#c9d2d9', 1, 'left', null));
    });
    const safe = [
      ['ICE FLOES', 'HOP ON ONE TO REST. MOSTLY SAFE - WATCH FOR WALRUSES.', (x, y, w, h) => {
        miniSea(x, y, w, h, 24); const f = HERO_FLOE; ctx.drawImage(f, x + w / 2 - 16, y + 18 + Math.round(Math.sin(time * 1.6)));
        drawPenguinAt(sk, x + w / 2, y + 11 + Math.round(Math.sin(time * 1.6)), Math.sin(time) > 0.7 ? 'flap' : 'stand', 0, 1, time);
      }],
      ['ICEBERGS', 'TOO SLIPPERY TO STAND ON, AND YOU CAN NOT JUMP UP THROUGH THEM.', (x, y, w, h) => {
        miniSea(x, y, w, h, 18); const b = bergs[0];
        ctx.save(); ctx.translate(x + w / 2, y + 18); ctx.scale(0.22, 0.22); ctx.drawImage(b.img, b.x0 - b.cx, b.y0); ctx.restore();
      }],
      ['CAVERNS', 'PAST 1220M. GUARDED TREASURE ROOMS, ANGLERFISH, EELS IN THE WALLS.', (x, y, w, h) => {
        ctx.drawImage(GROUND, 0, 0, w, h, x, y, w, h);
        for (let i = 0; i < w; i++) {
          const t = Math.round(y + 9 + Math.sin(i * 0.06) * 4), b2 = Math.round(y + 27 + Math.sin(i * 0.05 + 1) * 3);
          ctx.fillStyle = '#7a838b'; ctx.fillRect(x + i, t - 1, 1, 1); ctx.fillRect(x + i, b2, 1, 1);
          ctx.fillStyle = '#121519'; ctx.fillRect(x + i, t, 1, b2 - t);
        }
        CREATURES.angler.glow({ face: 1, t: time }, x + w / 2 - 15, y + 30);
        const g = FISH_SPR.crystal[1][Math.floor(time * 8) % 4]; ctx.drawImage(g, x + ((time * 25) % (w + 20)) - 10, y + 15);
      }],
    ];
    safe.forEach(([t, n, scene], i) => {
      const x = 10 + i * 128, y = 128;
      frameBox(x, y, 124, 68, 'rgba(16,19,24,0.9)');
      ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, 120, 32); ctx.clip(); scene(x + 2, y + 2, 120, 32); ctx.restore();
      drawBig(t, x + 6, y + 37, '#7ddcb9');
      wrapText(n, 114).forEach((l, j) => drawText(l, x + 6, y + 47 + j * 7, '#c9d2d9', 1, 'left', null));
    });
  } else {
    heading('HOW TO PLAY', 'PAGE 3 OF 3 - TRICKS, TROUBLE AND PRIZES');
    const tips = [
      ['BUBBLE RINGS', 'SWIM THROUGH ONE FOR A BURST OF SPEED AND A FRESH DASH.', (x, y, w, h) => {
        miniSea(x, y, w, h, 4);
        const rx = x + w / 2, ry = y + 18;
        for (let k = 0; k < 18; k++) { const a = k / 18 * TAU + time * 1.5; ctx.fillStyle = '#dff4ff'; ctx.fillRect(Math.round(rx + Math.cos(a) * 3), Math.round(ry + Math.sin(a) * 9), 1, 1); }
        const px = x + ((time * 60) % (w + 30)) - 15;
        drawPenguinAt(sk, px, ry, 'swim', 0, 1, time * 2);
      }],
      ['STREAKS', 'BRING FISH HOME BACK TO BACK WITHOUT BEING EATEN: UP TO X2 POINTS EACH.', (x, y, w, h) => {
        miniSea(x, y, w, h, 30);
        for (let k = 0; k < 5; k++) ctx.drawImage(FISH_SPR[['herring', 'salmon', 'char', 'mackerel', 'sprat'][k]][1][1], x + 14 + k * 14, y + 12 - (k % 2) * 3);
        drawBig('X' + (1 + (Math.floor(time) % 5) * 0.25), x + w - 30, y + 10, '#ff9a6e', 1, 'center');
      }],
      ['JELLYFISH', 'A STING STUNS YOU: SLOW, AND NO DASH. NOT DEADLY - BUT THE SEALS ARE.', (x, y, w, h) => {
        miniSea(x, y, w, h, 2); creaturePortrait('jelly', x + w / 2 - 22, y + 12, 1); creaturePortrait('jelly', x + w / 2 + 18, y + 16, 1);
      }],
      ['WALRUS', 'A WALRUS UNDER YOUR FLOE WILL BUMP YOU OFF IT. MOVE ALONG.', (x, y, w, h) => {
        miniSea(x, y, w, h, 12);
        const j = Math.sin(time * 30) * (Math.sin(time) > 0.4 ? 1 : 0);
        ctx.drawImage(HERO_FLOE, x + w / 2 - 16, y + 6 + Math.round(j));
        drawPenguinAt(sk, x + w / 2, y - 1 + Math.round(j), 'stand', 0, 1, time);
        creaturePortrait('walrus', x + w / 2 + 4, y + 26, 0.5);
      }],
      ['SKUA', 'LEAP WITH A FISH AND A SKUA MAY STEAL IT. JUMP INTO IT TO GET IT BACK.', (x, y, w, h) => {
        ctx.drawImage(SKY_NEAR, 0, SKY_H - h, w, h, x, y, w, h);
        CREATURES.skua.draw({ face: 1, t: time, st: 'flee', carry: { type: 'salmon', size: 1, shiny: false } }, x + w / 2, y + 12);
      }],
      ['NEW PENGUINS', 'REACH GOALS TO UNLOCK ' + Object.keys(SKIN_GOALS).length + ' MORE PENGUINS IN THE WARDROBE.', (x, y, w, h) => {
        miniSea(x, y, w, h, 32);
        [9, 10, 16, 18, 19].forEach((s2, k) => { if (skinLocked(s2)) { ctx.save(); ctx.translate(x + 14 + k * 23, y + 17); ctx.drawImage(skinSil(s2), -(PAD + 6), -(PAD + 7)); ctx.restore(); } else drawPenguinAt(s2, x + 14 + k * 23, y + 17, 'stand', 0, 1, time + k); });
      }],
    ];
    tips.forEach(([t, n, scene], i) => {
      const x = 10 + (i % 3) * 128, y = 38 + Math.floor(i / 3) * 82;
      frameBox(x, y, 124, 78, 'rgba(16,19,24,0.9)');
      ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, 120, 32); ctx.clip(); scene(x + 2, y + 2, 120, 32); ctx.restore();
      drawBig(t, x + 6, y + 37, '#7ddcb9');
      wrapText(n, 114).forEach((l, j) => drawText(l, x + 6, y + 47 + j * 7, '#c9d2d9', 1, 'left', null));
    });
  }
  if (button('BACK', 10, 202, 60, 17)) goTo(() => setScreen('home'));
  if (help.page > 0 && button('PREV', W - 136, 202, 60, 17)) help.page--;
  if (help.page < 2 && button('NEXT', W - 70, 202, 60, 17, { primary: true })) help.page++;
}

// ---------------------------------------------------------------- PAUSE + GAME OVER
let overT = 0;
function drawPause() {
  dimmer(0.55);
  frameBox(W / 2 - 80, 50, 160, 116, 'rgba(16,19,24,0.92)');
  drawBig('PAUSED', W / 2, 60, '#ffffff', 2, 'center');
  drawText('PILE ' + pile + '   -   ' + Math.round(P.x / 10) + 'M OUT', W / 2, 80, '#c9d2d9', 1, 'center', null);
  if (button('RESUME', W / 2 - 50, 94, 100, 17, { primary: true })) mode = 'play';
  if (button('HOME', W / 2 - 50, 118, 100, 17)) goTo(() => { mode = 'menu'; setScreen('home'); });
  drawText('ESC TO RESUME  -  ' + diff.name, W / 2, 146, '#6c757d', 1, 'center', null);
}
function drawOver() {
  const k = clamp(overT / 0.5, 0, 1);
  dimmer(0.6 * k);
  const py = Math.round(lerp(-160, 22, 1 - (1 - k) ** 3));
  frameBox(W / 2 - 130, py, 260, 182, 'rgba(16,19,24,0.94)', '#c4504a');
  drawBig('CHOMPED!', W / 2, py + 9, '#ff6f7e', 3, 'center');
  const killer = P && P.killer ? ENEMY[P.killer].name : null;
  drawText(killer ? 'YOUR PENGUIN WAS LUNCH FOR A ' + killer + '.' : 'YOUR PENGUIN HAS BECOME LUNCH.', W / 2, py + 34, '#8f99a2', 1, 'center', null);
  const row = (label, val, y, col = '#ffffff') => { drawText(label, W / 2 - 110, py + y, '#aab4bc', 1, 'left', null); drawBig(val, W / 2 + 110, py + y - 1, col, 1, 'right'); };
  row('PILE', String(pile), 46, '#ffd23f');
  row('FISH BROUGHT HOME', String(pileFish.length), 57);
  row('FARTHEST OUT', Math.round(deepest / 10) + 'M', 68);
  row('POINTS EARNED' + (diff.pts !== 1 ? ' (' + diff.name + ' X' + diff.pts + ')' : ''), '+' + run.coins, 79, '#7be0b8');
  // this run's catch, fish by fish
  ctx.fillStyle = '#4b545c'; ctx.fillRect(W / 2 - 110, py + 91, 220, 1);
  const shown = pileFish.slice(0, 22);
  if (!shown.length) {
    drawText('NO FISH MADE IT HOME THIS TIME.', W / 2, py + 99, '#6c757d', 1, 'center', null);
    if (P && P.killer) {
      creaturePortrait(P.killer, W / 2, py + 120, Math.min(1, (PORTRAIT_SC[P.killer] || 0.8) * 1.4));
    }
  }
  shown.forEach((c, i) => { const img = fishImg(c, 1); ctx.drawImage(img, W / 2 - 108 + (i % 11) * 20 + 10 - Math.floor(img.width / 2), py + 98 + Math.floor(i / 11) * 12); });
  if (pileFish.length > 22) drawText('+' + (pileFish.length - 22) + ' MORE', W / 2 + 110, py + 124, '#8f99a2', 1, 'right', null);
  if (run.newSpecies.length) drawText(run.newSpecies.length + ' NEW ' + (run.newSpecies.length === 1 ? 'SPECIES' : 'SPECIES') + ' ADDED TO YOUR FISH BOOK!', W / 2, py + 132, '#c9a2ff', 1, 'center', null);
  if (overT > 0.7) {
    if (button('GO AGAIN', W / 2 - 120, py + 150, 76, 17, { primary: true })) goTo(startRun);
    if (button('UPGRADES', W / 2 - 38, py + 150, 76, 17)) goTo(() => { mode = 'menu'; setScreen('shop'); });
    if (button('HOME', W / 2 + 44, py + 150, 76, 17)) goTo(() => { mode = 'menu'; setScreen('home'); });
  }
}

// ---------------------------------------------------------------- input
addEventListener('keydown', e => {
  const k = e.code;
  if (k === 'KeyM') toggleSound();
  if (trans.t >= 0) return;
  if (k === 'Escape' || k === 'KeyP') {
    if (mode === 'play') { mode = 'pause'; ui.focus = 0; }
    else if (mode === 'pause') mode = 'play';
    else if (mode === 'over' && k === 'Escape') goTo(() => { mode = 'menu'; setScreen('home'); });
    else if (mode === 'menu' && menuScreen !== 'home' && k === 'Escape') goTo(() => setScreen('home'));
    return;
  }
  if (mode === 'play') return;
  const dir = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[k];
  if (dir) {
    e.preventDefault();
    if (mode === 'menu' && menuScreen === 'skins') skinsKey(dir[0], dir[1]);
    else if (mode === 'menu' && menuScreen === 'book') bookKey(dir[0], dir[1]);
    else if (mode === 'menu' && menuScreen === 'help' && dir[0]) { help.page = clamp(help.page + dir[0], 0, 2); SFX.click(); }
    else if (mode === 'menu' && menuScreen === 'home' && dir[0]) setDiff(STATS.diff + dir[0]);
    else ui.nav += dir[0] + dir[1];
  }
  if (k === 'Enter' || k === 'Space') {
    e.preventDefault();
    if (mode === 'menu' && menuScreen === 'skins') goTo(startRun);
    else ui.enter = true;
  }
});

// ---------------------------------------------------------------- main loop
parts = []; texts = []; pileFish = []; enemies = []; fishes = [];
cam.x = -40; cam.y = -73;

function tick(dt) {
  time += dt;
  if (SFX.c && !MUSIC.master) MUSIC.start();
  MUSIC.tick();
  if (mode !== 'play') { ui.click = clickQueued; clickQueued = false; }
  if (trans.t >= 0) {
    trans.t += dt;
    if (trans.fn && trans.t >= 0.3) { const f = trans.fn; trans.fn = null; f(); }
    if (trans.t >= 0.6) trans.t = -1;
    ui.click = false; ui.enter = false;
  }
  colonyCheer = Math.max(0, colonyCheer - dt);
  for (let i = toasts.length - 1; i >= 0; i--) if ((toasts[i].t -= dt) <= 0) toasts.splice(i, 1);
  if (mode === 'play') {
    updatePlay(dt);
    farK = lerp(farK, clamp((P.x - 3000) / 12000, 0, 1), dt);
  } else if (mode === 'over') { overT += dt; updateParts(dt); }
  else if (mode === 'menu') { farK = lerp(farK, 0, dt * 2); updateHome(dt); }
  shake = Math.max(0, shake - dt);
}

function render() {
  let shx = 0, shy = 0;
  if (shake > 0) { shx = Math.round((Math.random() - 0.5) * shake * 8); shy = Math.round((Math.random() - 0.5) * shake * 8); }
  setView(shx, shy);
  const inGame = mode === 'play' || mode === 'pause' || mode === 'over';
  drawWorld(inGame, mode === 'menu' && menuScreen === 'home' ? () => { drawHomeExtras(); drawHero(); } : null);
  uiBegin();
  if (mode === 'play' || mode === 'pause') drawHUD();
  if (mode === 'menu') {
    if (menuScreen === 'home') drawHomeScreen();
    else if (menuScreen === 'skins') drawSkinsScreen();
    else if (menuScreen === 'book') drawBookScreen();
    else if (menuScreen === 'shop') drawShopScreen();
    else drawHelpScreen();
  }
  if (mode === 'pause') drawPause();
  if (mode === 'over') drawOver();
  ui.click = false; ui.enter = false;
  drawTransition();
  drawToasts();
  drawCursor();
}

function drawCursor() {
  const x = Math.round(mouse.sx), y = Math.round(mouse.sy);
  if (mode === 'play') {
    ctx.fillStyle = OUTLINE; ctx.fillRect(x - 4, y - 1, 9, 3); ctx.fillRect(x - 1, y - 4, 3, 9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 3, y, 2, 1); ctx.fillRect(x + 2, y, 2, 1); ctx.fillRect(x, y - 3, 1, 2); ctx.fillRect(x, y + 2, 1, 2);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, 1, 1);
    return;
  }
  // a little pixel arrow for the menus
  const A = ['X.......', 'XX......', 'XWX.....', 'XWWX....', 'XWWWX...', 'XWWWWX..', 'XWWWWWX.', 'XWWXXXX.', 'XWX.....', 'XX......'];
  for (let r = 0; r < A.length; r++) for (let c = 0; c < 8; c++) {
    const ch = A[r][c]; if (ch === '.') continue;
    ctx.fillStyle = ch === 'X' ? OUTLINE : '#ffffff'; ctx.fillRect(x + c, y + r, 1, 1);
  }
}

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  tick(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook for headless checks
window.__pd = {
  rings: () => rings, CREATURES, BESTIARY, checkUnlocks, bergs, floes, caves, cam, newGame, STATS, setScreen, goTo, spawnOrcaPack,
  get pile() { return pile; }, get lives() { return lives; }, set lives(v) { lives = v; }, get P() { return P; }, get mode() { return mode; }, set mode(v) { mode = v; },
  get enemies() { return enemies; }, get fishes() { return fishes; }, get screen() { return menuScreen; },
  setMouse(x, y) { mouse.sx = x; mouse.sy = y; }, click() { clickQueued = true; },
};
