// SUSHI CONVEYOR - grab the right plates off the belts and get them to the
// right customers before they storm out. 12 short days, 4 restaurants.
import { DISHES, COLORS, COLOR_KEYS, TAGS, PLACES, DAYS, UPGRADES } from './data.js';
import { OUT, FONT, DISPLAY, rr, coin, star, sparkle, heart, drawDish, drawPlate, drawPlateFull, randomLook, drawPerson, drawChef, drawCat, drawOrderIcon, drawBubble, drawRoom, drawBelt, drawHatch, drawDeco } from './draw.js';
import { Audio } from './audio.js';
import { drawSetting } from './draw.js';
import { UI } from './ui.js';

const SAVE_KEY = 'pd.sushi-conveyor';
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

const STRIKES = 3;
const GOLD_BONUS = 8;

function makeLayout(portrait, aspect) {
  if (!portrait) {
    return {
      portrait, W: 1280, H: 720, top: 58,
      seats: [200, 420, 640, 860, 1080], seatW: 220,
      headY: 250, headR: 42, bubbleY: 134, bubbleW: 150, bubbleH: 92,
      counterY: 318, beltTop: 352, beltBot: 612, laneMax: 94, plateR: 40,
      front: 630, chef: { x: 96, y: 628, R: 34 }, hand: { x: 640, y: 676 }, brake: { x: 1196, y: 672, r: 38 },
      deco: [{ x: 360, y: 714 }, null, { x: 905, y: 714 }, { x: 1040, y: 714 }], hudY: 30,
    };
  }
  // portrait: three big seats, the stage grows to the phone's height
  const H = Math.round(clamp(720 * aspect, 1100, 1400)), front = H - 250;
  return {
    portrait, W: 720, H, top: 96,
    seats: [128, 360, 592], seatW: 232,
    headY: 418, headR: 58, bubbleY: 240, bubbleW: 196, bubbleH: 128,
    counterY: 500, beltTop: 536, beltBot: front - 18, laneMax: 185, laneMaxN: [300, 250, 185], prN: [1.5, 1.28, 1], plateR: 52,
    front, chef: { x: 116, y: front + 62, R: 52 }, hand: { x: 404, y: front + 112 }, brake: { x: 626, y: front + 110, r: 56 },
    deco: [{ x: 250, y: H - 8 }, null, { x: 520, y: H - 8 }, { x: 660, y: H - 8 }], hudY: 46,
  };
}

function fits(item, p) {
  if (p.gold) return true;
  switch (item.kind) {
    case 'dish': return p.dish === item.dish;
    case 'color': return p.color === item.color;
    case 'combo': return p.color === item.color && DISHES[p.dish].price < item.max;
    case 'tag': return DISHES[p.dish].tags.includes(item.tag);
  }
  return false;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio();
    this.save = { unlocked: 1, stars: {}, best: {}, coins: 0, upg: { hand: 0, brake: 0, chef: 0, deco: 0, jar: 0 }, music: 0.55, sfx: 0.9, musicOn: true, muted: false, played: 0 };
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      Object.assign(this.save, s); this.save.upg = Object.assign({ hand: 0, brake: 0, chef: 0, deco: 0, jar: 0 }, s.upg || {});
    } catch (e) { /* storage blocked */ }
    Object.assign(this.audio, { music: this.save.music, sfx: this.save.sfx, musicOn: this.save.musicOn, muted: this.save.muted });
    this.mode = 'title';
    this.time = 0; this.shake = 0; this.hitstop = 0; this.flash = 0;
    this.parts = []; this.pops = []; this.banner = null;
    this.timeScale = +(params.get('fast') || 1);
    this.bot = params.has('bot');
    this.botMode = params.get('bot');
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.startAttract();
    this.ui.show('title');
    if (params.has('play')) this.startDay(+(params.get('day') || this.ui.nextDay()));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play' && !this.ui.open) this.ui.show('pause'); });
    window.__G = this;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  snd(n, p) { if (!this.S || !this.S.demo) this.audio.play(n, p); }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  get U() { return this.save.upg; }
  get slotW() { return this.L.plateR * 2.3; }
  get PR() { return this.S && this.S.pr ? this.S.pr : this.L.plateR; }
  get handSlots() { return 1 + this.U.hand; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    const portrait = innerHeight > innerWidth * 1.05;
    const oldL = this.L;
    this.L = makeLayout(portrait, innerHeight / innerWidth);
    const s = Math.min(innerWidth / this.L.W, innerHeight / this.L.H);
    this.view = { s, ox: (innerWidth - this.L.W * s) / 2, oy: (innerHeight - this.L.H * s) / 2 };
    if (oldL && this.S && (oldL.portrait !== portrait || oldL.H !== this.L.H)) this.relayout(oldL);
    if (this.ui) this.ui.place();
  }
  relayout(oldL) {
    // orientation flipped mid-day: rescale plate x along the belts, rebuild seats
    const S = this.S, k = this.L.W / oldL.W;
    for (const p of S.plates) { p.x *= k; if (p.state !== 'belt') p.y = this.L.H / 2; }
    this.layoutBelts(true);
    const n = this.L.seats.length;
    while (S.custs.length > n) { const c = S.custs.pop(); if (c && c.state === 'wait' && !S.over) { /* quietly leaves */ } }
    while (S.custs.length < n) { S.custs.push(null); S.arriveT.push(rand(0.5, 2)); }
    S.arriveT.length = n; S.selCust = null;
    S.custs.forEach((c, i) => { if (c) c.seat = i; });
  }
  toScreen(x, y) { return { x: this.view.ox + x * this.view.s, y: this.view.oy + y * this.view.s }; }
  // test helper: a visible plate that fits a waiting customer
  findPair() {
    for (const { c, it } of this.unmetItems()) {
      const p = this.S.plates.find((q) => q.state === 'belt' && q.x > 200 && q.x < this.L.W - 200 && fits(it, q));
      if (p) return { p, c };
    }
    return null;
  }
  toWorld(cx, cy) { return { x: (cx - this.view.ox) / this.view.s, y: (cy - this.view.oy) / this.view.s }; }

  // ------------------------------------------------------------ days
  makeDay(n, cfg, demo) {
    const S = {
      n, cfg, demo, place: cfg.place, P: PLACES[cfg.place], t: 0, len: cfg.len,
      tips: 0, shownTips: 0, served: 0, wrong: 0, walk: 0, combo: 0, maxCombo: 0, perfect: 0, catsShooed: 0,
      belts: [], plates: [], custs: [], arriveT: [], specials: [], cat: null, catT: rand(9, 14),
      chef: { cd: 0, cook: 0, item: null, t: 0 }, hand: [], handSel: null, selCust: null, selT: 0,
      brakeT: 0, brakeCD: 0, slow: 1, events: [], over: false, botT: 0, nextId: 1, tickS: -1, goldOn: false,
    };
    this.S = S;
    const nb = cfg.belts[0];
    for (let i = 0; i < 3; i++) S.belts.push({ i, dir: i % 2 ? -1 : 1, y: 0, ty: 0, off: 0, spawnT: rand(0, 0.6) + i * 0.4, active: i < nb, show: i < nb ? 1 : 0, flap: 0, flap2: 0 });
    this.layoutBelts(true);
    const seats = this.L.seats.length;
    const order = [...Array(seats).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < seats; i++) { S.custs.push(null); S.arriveT.push(0); }
    order.forEach((s, k) => { S.arriveT[s] = demo ? 0.2 + k * 0.3 : 0.6 + k * 1.3; });
    if (!demo) {
      if (cfg.addAt) S.events.push({ at: cfg.addAt * cfg.len, kind: 'belt' });
      S.events.push({ at: cfg.len * 0.5, kind: 'speed' });
      if (cfg.sumo) { S.specials.push({ at: rand(0.18, 0.4) * cfg.len, kind: 'sumo' }); if (n >= 9) S.specials.push({ at: rand(0.6, 0.75) * cfg.len, kind: 'sumo' }); }
      if (cfg.critic) S.specials.push({ at: rand(0.4, 0.62) * cfg.len, kind: 'critic' });
    }
    // pre-fill the belts so the counter is never empty
    for (const b of S.belts) {
      if (!b.active) continue;
      const len = this.L.W, gap = this.plateGap();
      for (let x = demo ? 100 : 160; x < len - 80; x += gap * rand(1, 1.6)) this.spawnPlate(b, x);
    }
    return S;
  }
  plateGap() { return Math.max(this.PR * (this.L.portrait ? 2.3 : 2.7), this.L.W * 0.115 * this.PR / this.L.plateR); }
  layoutBelts(snap) {
    const S = this.S, L = this.L;
    const act = S.belts.filter((b) => b.active);
    const n = act.length;
    const lane = Math.min(L.laneMaxN ? L.laneMaxN[n - 1] : L.laneMax, (L.beltBot - L.beltTop) / n);
    const bottom = L.beltTop + n * lane + (L.beltBot - L.beltTop - n * lane) * (L.portrait ? 0.5 : 0.4);
    S.lane = lane;
    S.prT = L.plateR * (L.prN || [1.22, 1.1, 1])[n - 1];
    if (snap || !S.pr) S.pr = S.prT;
    act.forEach((b, k) => { b.ty = bottom - lane * (k + 0.5); if (snap || !b.y) b.y = b.ty; });
    for (const b of S.belts) if (!b.active) { b.ty = L.beltTop - 60; if (snap) b.y = b.ty; }
  }
  startAttract() {
    this.mode = 'title';
    this.makeDay(0, { place: 0, len: 9999, belts: [2], speed: [0.075, 0.075], dishes: ['salmon', 'tuna', 'tamago', 'edamame', 'ramen', 'ebi', 'gyoza', 'dango'], kinds: { dish: 3, color: 1 }, patience: 9999, arrive: [1, 2.5] }, true);
  }
  startDay(n) {
    n = clamp(n | 0, 1, DAYS.length);
    this.ui.close();
    this.mode = 'play';
    this.parts = []; this.pops = [];
    const S = this.makeDay(n, DAYS[n - 1], false);
    this.save.played++; this.persist();
    this.showBanner(`DAY ${n}`, S.P.name, S.P.accent);
    this.ui.hud(true);
    this.tipT = 7;
  }
  restart() { this.startDay(this.S.n || 1); }

  showBanner(text, sub, col = '#ff6b6b') { this.banner = { text, sub, col, t: 0 }; this.snd('banner'); }

  // ------------------------------------------------------------ orders + plates
  genItem(cfg, kind) {
    const k = kind || this.weighted(cfg.kinds);
    const dishes = cfg.dishes;
    if (k === 'color') return { kind: 'color', color: pick(COLOR_KEYS) };
    if (k === 'combo') {
      const maxes = [2, 3, 3, 4].filter((m) => dishes.some((d) => DISHES[d].price < m));
      return { kind: 'combo', color: pick(COLOR_KEYS), max: pick(maxes) };
    }
    if (k === 'tag') {
      const tags = Object.keys(TAGS).filter((t) => dishes.some((d) => DISHES[d].tags.includes(t)));
      return { kind: 'tag', tag: pick(tags) };
    }
    return { kind: 'dish', dish: pick(dishes) };
  }
  weighted(w) {
    const keys = Object.keys(w).filter((k) => k !== 'double');
    let tot = 0; for (const k of keys) tot += w[k];
    let r = Math.random() * tot;
    for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
    return keys[0];
  }
  plateFor(item, dishes) {
    // a random plate that satisfies the item
    let d = pick(dishes), col = pick(COLOR_KEYS);
    if (item.kind === 'dish') d = item.dish;
    else if (item.kind === 'color') col = item.color;
    else if (item.kind === 'combo') { col = item.color; d = pick(dishes.filter((x) => DISHES[x].price < item.max)); }
    else if (item.kind === 'tag') d = pick(dishes.filter((x) => DISHES[x].tags.includes(item.tag)));
    return { dish: d, color: col };
  }
  newPlate(spec, x, y, belt) {
    const S = this.S;
    const p = { id: S.nextId++, dish: spec.dish, color: spec.color, gold: !!spec.gold, x, y, belt, state: 'belt', seed: Math.random() * 10, sq: 0, fly: null, a: 1 };
    S.plates.push(p);
    return p;
  }
  unmetItems() {
    const out = [];
    for (const c of this.S.custs) if (c && c.state === 'wait') for (const it of c.items) if (!it.done) out.push({ c, it });
    return out;
  }
  spawnPlate(b, x) {
    const S = this.S, cfg = S.cfg;
    const want = this.unmetItems();
    let spec;
    // more than half the plates are something somebody is waiting for
    if (want.length && Math.random() < (S.demo ? 0.7 : cfg.match || 0.5)) spec = this.plateFor(pick(want).it, cfg.dishes);
    else spec = { dish: pick(cfg.dishes), color: pick(COLOR_KEYS) };
    if (cfg.gold && !S.goldOn && S.t > 6 && Math.random() < 0.06) { spec.gold = true; S.goldOn = true; }
    return this.newPlate(spec, x == null ? (b.dir > 0 ? -this.PR : this.L.W + this.PR) : x, b.y, b);
  }

  // ------------------------------------------------------------ customers
  spawnCustomer(seat, kind = 'normal') {
    const S = this.S, cfg = S.cfg;
    const items = [];
    if (kind === 'sumo') for (let i = 0; i < 5; i++) items.push(this.genItem(cfg, Math.random() < 0.7 ? 'dish' : 'color'));
    else if (kind === 'critic') items.push({ kind: 'dish', dish: pick(cfg.dishes.filter((d) => DISHES[d].price >= 2)) });
    else {
      items.push(this.genItem(cfg));
      if (cfg.kinds.double && Math.random() < cfg.kinds.double * 0.12) items.push(this.genItem(cfg));
    }
    let pat = cfg.patience * (1 + 0.1 * this.U.deco) * (items.length > 1 ? 1.45 : 1);
    if (kind === 'sumo') pat = cfg.patience * 2.6 * (1 + 0.1 * this.U.deco);
    if (kind === 'critic') pat *= 0.8;
    const c = { seat, kind, look: randomLook(), items, pat, patMax: pat, state: 'arrive', st: 0, moodT: 0, mood: null, bounce: 0, ox: 0 };
    S.custs[seat] = c;
    if (!S.demo) {
      if (kind === 'sumo') { this.showBanner('SUMO!', 'He wants five dishes', '#ff9a5c'); this.snd('sumo'); this.shake = Math.max(this.shake, 10); }
      else if (kind === 'critic') { this.showBanner('VIP CRITIC!', 'Serve fast for a 5-star review', '#ffd23f'); this.snd('critic'); }
      else this.snd('arrive');
    }
    return c;
  }
  custPos(c) {
    const L = this.L;
    return { x: L.seats[c.seat] + c.ox, y: L.headY };
  }
  freeSeat(c, delay) {
    const S = this.S;
    if (S.custs[c.seat] === c) { S.custs[c.seat] = null; S.arriveT[c.seat] = delay; }
    if (S.selCust === c) S.selCust = null;
  }

  // ------------------------------------------------------------ serving
  serveTo(p, c, fromX, fromY) {
    const S = this.S, L = this.L;
    const cp = this.custPos(c);
    p.state = 'fly';
    const dist = Math.hypot(cp.x - fromX, cp.y + L.headR * 0.4 - fromY);
    p.fly = { x0: fromX, y0: fromY, x1: cp.x, y1: cp.y + L.headR * 0.55, t: 0, dur: clamp(dist / 1900, 0.12, 0.3), h: 40, cb: () => this.resolveServe(p, c) };
    this.snd('whoosh');
    if (S.selCust === c) S.selCust = null;
  }
  resolveServe(p, c) {
    const S = this.S, L = this.L;
    if (!c || c.state !== 'wait' || S.custs[c.seat] !== c) { this.toBelt(p, p.x, p.y); return; }
    const it = c.items.find((i) => !i.done && fits(i, p)) || (p.gold ? c.items.find((i) => !i.done) : null);
    const cp = this.custPos(c);
    if (!it) {
      // wrong! they shove it back onto the belt
      c.moodT = 1.3; c.mood = 'grumpy'; c.bounce = 1;
      c.pat = Math.max(0.01, c.pat - c.patMax * 0.25);
      S.combo = 0; S.wrong++;
      this.shake = Math.max(this.shake, 9);
      this.snd('wrong');
      this.pop(cp.x, cp.y - L.headR * 1.4, pick(['YUCK!', 'NOPE!', 'EWW!', 'NOT THAT!']), '#ff4f5f', 30);
      for (let i = 0; i < 6; i++) this.part('puff', cp.x + rand(-30, 30), cp.y - 20, rand(-80, 80), rand(-120, -40), 0.5, 10, '#ffffff');
      this.toBelt(p, cp.x, cp.y + L.headR * 1.5, true);
      return;
    }
    it.done = true;
    S.goldOn = S.goldOn && !p.gold;
    p.state = 'gone';
    const frac = c.pat / c.patMax;
    S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); S.served++;
    const cm = 1 + Math.min(S.combo - 1, 10) * 0.05;
    let tip = (DISHES[p.dish].price + Math.ceil(frac * 3)) * cm;
    if (p.gold) tip += GOLD_BONUS;
    const done = c.items.every((i) => i.done);
    if (done && c.kind === 'sumo') tip += 10;
    if (done && c.kind === 'critic') tip = tip * 2 + 8;
    tip = Math.round(tip * (1 + 0.15 * this.U.jar));
    S.tips += tip;
    const rating = frac > 0.72 ? 'PERFECT!' : frac > 0.42 ? 'GREAT!' : 'OK';
    if (frac > 0.72) S.perfect++;
    c.bounce = 1; c.moodT = done ? 99 : 0.7; c.mood = 'happy';
    if (c.items.length > 1 && !done) c.pat = Math.min(c.patMax, c.pat + c.patMax * 0.22);
    this.hitstop = 0.05;
    this.shake = Math.max(this.shake, p.gold ? 8 : 3);
    this.snd('serve', 1 + Math.min(S.combo, 12) * 0.03);
    if (p.gold) { this.snd('gold'); this.flash = 0.35; for (let i = 0; i < 24; i++) this.part('spark', cp.x, cp.y, rand(-380, 380), rand(-420, 120), rand(0.5, 1), rand(5, 11), '#ffe066'); }
    const hearts = frac > 0.72 ? 3 : frac > 0.42 ? 2 : 1;
    for (let i = 0; i < hearts + 2; i++) this.part('heart', cp.x + rand(-26, 26), cp.y - L.headR * 0.6, rand(-70, 70), rand(-220, -140), rand(0.8, 1.2), rand(8, 12), '#ff5f8f');
    for (let i = 0; i < 10; i++) this.part('spark', cp.x, cp.y + 10, rand(-260, 260), rand(-300, 40), rand(0.3, 0.6), rand(4, 8), pick(['#ffd23f', '#fff', '#5fd08a', '#4fa8ff']));
    this.pop(cp.x, cp.y - L.headR * 1.5, `+${tip}`, '#ffb000', 34);
    this.pop(cp.x, cp.y - L.headR * 2.35, rating, frac > 0.72 ? '#ff5f8f' : '#3cc8b4', 22, 0.1);
    if (S.combo >= 5 && S.combo % 5 === 0) this.pop(L.W / 2, L.H * 0.5, `${S.combo} COMBO!`, '#ffd23f', 46, 0.15);
    if (S.combo >= 3 && S.combo % 5 === 0) this.snd('combo', 1 + S.combo * 0.02);
    // coins fly to the tips counter
    const nc = clamp(Math.round(tip / 3), 3, 14);
    if (!S.demo) for (let i = 0; i < nc; i++) this.parts.push({ kind: 'coinfly', x: cp.x + rand(-20, 20), y: cp.y + rand(-10, 20), sx: cp.x, sy: cp.y, t: -i * 0.035, max: rand(0.55, 0.75), vx: rand(-200, 200), vy: rand(-300, -100), size: 9 });
    if (done) {
      c.state = 'eat'; c.st = 0;
      if (c.kind === 'critic') { this.showBanner('★★★★★', 'The critic loved it!', '#ffd23f'); this.snd('gold'); }
      if (c.kind === 'sumo') this.pop(cp.x, cp.y - L.headR * 3.2, 'FEAST!', '#ff9a5c', 30, 0.3);
    }
  }
  toBelt(p, x, y, bounce) {
    // put a plate back on the nearest active belt
    const S = this.S;
    let best = null, bd = 1e9;
    for (const b of S.belts) if (b.active) { const d = Math.abs(b.y - y); if (d < bd) { bd = d; best = b; } }
    const L = this.L;
    const tx = clamp(x, 90, L.W - 90);
    p.x = x; p.y = y;
    p.state = 'fly'; p.belt = best;
    p.fly = { x0: x, y0: y, x1: tx, y1: best.y, t: 0, dur: bounce ? 0.32 : 0.16, h: bounce ? 70 : 12, cb: () => { p.state = 'belt'; p.sq = 1; this.snd('drop'); } };
  }
  toHand(p) {
    const S = this.S;
    if (S.hand.length >= this.handSlots) {
      // hand full: the oldest plate goes back on the belt
      const old = S.hand.shift();
      const hp = this.handPos(0);
      old.x = hp.x; old.y = hp.y; this.toBelt(old, p.x, p.y);
    }
    S.hand.push(p);
    p.state = 'hand'; p.sq = 1;
    S.handSel = null;
    this.snd('grab', 1.2);
  }
  handPos(i) {
    const L = this.L, n = this.handSlots;
    return { x: L.hand.x + (i - (n - 1) / 2) * this.slotW, y: L.hand.y };
  }

  // ------------------------------------------------------------ input
  input() {
    const cv = this.canvas;
    this.drag = null; this.pend = null;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'play' || this.ui.open || !this.S || this.S.over) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
      const p = this.toWorld(e.clientX, e.clientY);
      this.down(p.x, p.y, e.pointerType === 'touch');
    });
    cv.addEventListener('pointermove', (e) => { const p = this.toWorld(e.clientX, e.clientY); this.hover = p; this.move(p.x, p.y); });
    const up = (e) => { const p = this.toWorld(e.clientX, e.clientY); this.up(p.x, p.y); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.ui.open) { if (this.ui.panel === 'pause') this.ui.close(); else if (this.ui.panel !== 'title' && this.ui.panel !== 'result') this.ui.back(); return; }
        if (this.mode === 'play') { this.ui.show('pause'); return; }
      }
      if (this.ui.open) {
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.ui.primary(); }
        return;
      }
      if (this.mode !== 'play' || !this.S || this.S.over) return;
      if (e.code === 'Space') { e.preventDefault(); this.useBrake(); }
      else if (e.code === 'KeyC') this.useChef();
      else if (e.code === 'KeyR') this.restart();
      else if (/^Digit[1-5]$/.test(e.code)) { const i = +e.code.slice(5) - 1; const c = this.S.custs[i]; if (c) this.tapCustomer(c); }
    });
  }
  hitPlate(x, y) {
    const S = this.S, r = this.PR;
    let best = null, bd = 1e9;
    for (const p of S.plates) {
      if (p.state !== 'belt') continue;
      if (p.x < 70 || p.x > this.L.W - 70) continue;
      const dx = (x - p.x) / (r * 1.2), dy = (y - (p.y - r * 0.3)) / (r * 0.95);
      const d = dx * dx + dy * dy;
      if (d < 1 && d < bd) { bd = d; best = p; }
    }
    return best;
  }
  hitCustomer(x, y) {
    const S = this.S, L = this.L;
    if (y < L.bubbleY - L.bubbleH / 2 - 26 || y > L.counterY + 26) return null;
    let best = null, bd = 1e9;
    for (const c of S.custs) {
      if (!c || c.state !== 'wait') continue;
      const d = Math.abs(x - L.seats[c.seat]);
      const half = c.kind === 'sumo' ? L.seatW * 0.62 : L.seatW / 2;
      if (d < half && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  down(x, y, touch) {
    const S = this.S, L = this.L;
    this.touch = touch;
    // buttons
    if (Math.hypot(x - L.brake.x, y - L.brake.y) < L.brake.r * 1.25) { this.useBrake(); return; }
    if (Math.hypot(x - L.chef.x, y - (L.chef.y + L.chef.R * 0.6)) < L.chef.R * 1.9) { this.useChef(); return; }
    // the cat
    const cat = S.cat;
    if (cat && (cat.state === 'walk' || cat.state === 'stalk' || cat.state === 'run') && Math.hypot(x - cat.x, y - (cat.y - 22)) < 62) { this.shooCat(); return; }
    // plates in hand
    for (let i = 0; i < S.hand.length; i++) {
      const hp = this.handPos(i);
      if (Math.hypot(x - hp.x, y - hp.y) < 46) { this.startDrag(S.hand[i], x, y, 'hand'); return; }
    }
    const p = this.hitPlate(x, y);
    if (p) { this.startDrag(p, x, y, 'belt'); return; }
    const c = this.hitCustomer(x, y);
    if (c) { this.pend = { c, x, y }; return; }
    if (S.selCust) S.selCust = null;
  }
  startDrag(p, x, y, src) {
    const S = this.S;
    const now = performance.now();
    if (src === 'hand') S.hand.splice(S.hand.indexOf(p), 1);
    this.drag = { p, src, sx: x, sy: y, t0: now, samples: [{ x, y, t: now }], moved: 0, ox: p.x - x, oy: (p.y - this.PR * 0.2) - y };
    p.state = 'drag'; p.sq = 1; p.tx = null;
    this.snd('grab');
  }
  move(x, y) {
    const d = this.drag;
    if (!d) return;
    const now = performance.now();
    d.samples.push({ x, y, t: now });
    while (d.samples.length > 2 && now - d.samples[0].t > 110) d.samples.shift();
    d.moved = Math.max(d.moved, Math.hypot(x - d.sx, y - d.sy));
    const lift = this.touch ? -46 * Math.min(1, d.moved / 30) : 0;
    d.p.tx = x + d.ox * 0.4; d.p.ty = y + d.oy * 0.4 + lift;
  }
  up(x, y) {
    const S = this.S, L = this.L;
    if (this.pend) {
      const pc = this.pend; this.pend = null;
      if (Math.hypot(x - pc.x, y - pc.y) < 30) this.tapCustomer(pc.c);
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const p = d.p;
    const dur = performance.now() - d.t0;
    if (d.moved < 14 && dur < 450) {
      // a tap on a plate
      if (S.selCust && S.selCust.state === 'wait') { this.serveTo(p, S.selCust, p.x, p.y); return; }
      if (d.src === 'hand') { S.hand.push(p); p.state = 'hand'; S.handSel = S.handSel === p ? null : p; this.snd('select'); return; }
      this.toHand(p);
      return;
    }
    // dropped on a customer
    const c = this.hitCustomer(x, y) || this.hitCustomer(p.x, p.y);
    if (c) { this.serveTo(p, c, p.x, p.y); return; }
    // a flick towards somebody
    const sm = d.samples, a = sm[0], b = sm[sm.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt, sp = Math.hypot(vx, vy);
    this.lastFlick = { sp: Math.round(sp), vy: Math.round(vy), n: sm.length };
    if (sp > 420 && vy < -200) {
      const ang = Math.atan2(vy, vx);
      let best = null, bd = 0.55;
      for (const cc of S.custs) {
        if (!cc || cc.state !== 'wait') continue;
        const da = Math.atan2(L.headY - p.y, L.seats[cc.seat] - p.x);
        let diff = Math.abs(da - ang); if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < bd) { bd = diff; best = cc; }
      }
      if (best) { this.serveTo(p, best, p.x, p.y); return; }
    }
    // dropped on the hand tray
    if (Math.abs(y - L.hand.y) < 60 && Math.abs(x - L.hand.x) < this.slotW * this.handSlots / 2 + 40) { this.toHand(p); return; }
    this.toBelt(p, p.x, p.y);
  }
  tapCustomer(c) {
    const S = this.S;
    if (!c || c.state !== 'wait') return;
    if (S.hand.length) {
      let p = S.handSel && S.hand.includes(S.handSel) ? S.handSel : null;
      if (!p) p = S.hand.find((h) => c.items.some((i) => !i.done && fits(i, h))) || S.hand[0];
      const hp = this.handPos(S.hand.indexOf(p));
      S.hand.splice(S.hand.indexOf(p), 1); S.handSel = null;
      p.x = hp.x; p.y = hp.y;
      this.serveTo(p, c, hp.x, hp.y);
      return;
    }
    S.selCust = S.selCust === c ? null : c; S.selT = 5;
    this.snd('select');
  }
  useBrake() {
    const S = this.S;
    if (!S || S.brakeCD > 0 || S.brakeT > 0) return;
    S.brakeT = this.U.brake >= 1 ? 5 : 3.5;
    this.snd('brake');
    this.pop(this.L.brake.x - 30, this.L.brake.y - 70, 'SLOW!', '#4fa8ff', 26);
  }
  useChef() {
    const S = this.S;
    if (!S || S.chef.cd > 0 || S.chef.cook > 0) return;
    // cook for whoever is closest to storming out
    let best = null, bp = 1e9;
    for (const c of S.custs) {
      if (!c || c.state !== 'wait') continue;
      const f = c.pat / c.patMax;
      const it = c.items.find((i) => !i.done);
      if (it && f < bp) { bp = f; best = it; }
    }
    S.chef.item = best ? this.plateFor(best, S.cfg.dishes) : { dish: pick(S.cfg.dishes), color: pick(COLOR_KEYS) };
    S.chef.cook = 0.7;
    this.snd('chop');
  }
  shooCat() {
    const S = this.S, cat = S.cat;
    if (cat.carrying) {
      const p = cat.carrying; cat.carrying = null;
      this.S.plates.push(p); p.state = 'belt'; this.toBelt(p, cat.x, cat.y - 30, true);
      this.pop(cat.x, cat.y - 80, 'SAVED!', '#5fd08a', 26);
    } else this.pop(cat.x, cat.y - 80, 'SHOO!', '#ff9a5c', 26);
    cat.state = 'shoo'; cat.t = 0; cat.dir = cat.x < this.L.W / 2 ? -1 : 1; cat.vy = -420;
    S.tips += 3; S.catsShooed++;
    this.snd('hiss');
    this.shake = Math.max(this.shake, 6);
    for (let i = 0; i < 8; i++) this.part('puff', cat.x, cat.y - 10, rand(-160, 160), rand(-160, -20), 0.5, 12, '#fff');
  }

  // ------------------------------------------------------------ fx
  part(kind, x, y, vx, vy, max, size, col) { this.parts.push({ kind, x, y, vx, vy, t: 0, max, size, col, rot: rand(0, 6), vr: rand(-6, 6) }); }
  pop(x, y, text, col, size, delay = 0) { this.pops.push({ x, y, text, col, size, t: -delay, max: 1.0 }); }

  // ------------------------------------------------------------ update
  loop(now) {
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const paused = this.ui.open && this.mode === 'play' && this.ui.panel !== 'result';
    if (!paused) {
      for (let i = 0; i < this.timeScale; i++) this.update(dt);
    }
    this.audio.update(dt, this.mode === 'play' && this.S ? this.S.t / this.S.len : 0.2);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }
  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt);
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    const S = this.S;
    if (!S) return;
    const L = this.L, cfg = S.cfg;
    const playing = this.mode === 'play' && !S.over;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.8) this.banner = null; }
    if (this.tipT > 0) this.tipT -= dt;
    if (playing) {
      S.t += dt;
      // events
      for (const ev of S.events) {
        if (ev.done || S.t < ev.at) continue;
        ev.done = true;
        if (ev.kind === 'belt') { const b = S.belts.find((x) => !x.active); if (b) { b.active = true; b.spawnT = 0.3; this.layoutBelts(false); b.y = L.beltTop - 40; this.showBanner('NEW BELT!', 'Things are getting busy', '#3cc8b4'); this.shake = 8; } }
        if (ev.kind === 'speed') this.showBanner('SPEED UP!', 'The belts go faster', '#ff6b6b');
      }
      for (const sp of S.specials) {
        if (sp.done || S.t < sp.at) continue;
        const free = S.custs.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
        if (!free.length) continue;
        sp.done = true;
        this.spawnCustomer(pick(free), sp.kind);
      }
      if (S.t >= S.len) { this.endDay(false); return; }
      const left = S.len - S.t;
      if (left < 10 && Math.ceil(left) !== S.tickS) { S.tickS = Math.ceil(left); this.snd('tick'); }
      this.audio.tempo = 1 + (S.t / S.len) * 0.18 + (left < 10 ? 0.06 : 0);
    } else if (this.mode === 'title') {
      S.t += dt;
      this.audio.tempo = 1;
    }
    // brake + belt speed
    if (S.brakeT > 0) { S.brakeT -= dt; if (S.brakeT <= 0) S.brakeCD = this.U.brake >= 2 ? 9 : 18; }
    else if (S.brakeCD > 0) S.brakeCD -= dt;
    S.slow = lerp(S.slow, S.brakeT > 0 ? 0.38 : 1, Math.min(1, dt * 6));
    const prog = clamp(S.t / S.len, 0, 1);
    const speed = lerp(cfg.speed[0], cfg.speed[1], prog) * L.W * S.slow * (S.over ? 0.5 : 1);
    S.pr += (S.prT - S.pr) * Math.min(1, dt * 4);
    const gap = this.plateGap();
    for (const b of S.belts) {
      b.y += (b.ty - b.y) * Math.min(1, dt * 6);
      b.show = lerp(b.show, b.active ? 1 : 0, Math.min(1, dt * 5));
      if (!b.active) continue;
      b.off += speed * dt * b.dir;
      b.flap = Math.max(0, b.flap - dt * 2); b.flap2 = Math.max(0, b.flap2 - dt * 2);
      b.spawnT -= dt;
      if (b.spawnT <= 0 && !S.over) {
        const ex = b.dir > 0 ? -this.PR : L.W + this.PR;
        const clear = !S.plates.some((p) => p.belt === b && p.state === 'belt' && Math.abs(p.x - ex) < gap);
        if (clear) { this.spawnPlate(b); b.spawnT = (gap / speed) * (L.portrait ? rand(0.85, 1.2) : rand(0.95, 1.6)); b.flap = 1; }
        else b.spawnT = 0.15;
      }
    }
    // plates
    for (const p of S.plates) {
      p.sq = Math.max(0, p.sq - dt * 4);
      if (p.state === 'belt') {
        p.x += speed * dt * p.belt.dir; p.y = p.belt.y;
        if (!p.belt.active) { p.state = 'gone'; continue; }
        if ((p.belt.dir > 0 && p.x > L.W + this.PR * 1.5) || (p.belt.dir < 0 && p.x < -this.PR * 1.5)) { p.state = 'gone'; p.belt.flap2 = 1; if (p.gold) S.goldOn = false; }
      } else if (p.state === 'drag') {
        if (p.tx != null) { p.x += (p.tx - p.x) * Math.min(1, dt * 30); p.y += (p.ty - p.y) * Math.min(1, dt * 30); }
      } else if (p.state === 'fly') {
        const f = p.fly; f.t += dt;
        const k = clamp(f.t / f.dur, 0, 1);
        p.x = lerp(f.x0, f.x1, k); p.y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * f.h;
        if (Math.random() < 0.6) this.part('trail', p.x, p.y, 0, 0, 0.25, 8, p.gold ? '#ffe066' : COLORS[p.color].c);
        if (k >= 1) { p.fly = null; f.cb(); }
      } else if (p.state === 'hand') {
        const hp = this.handPos(S.hand.indexOf(p));
        p.x += (hp.x - p.x) * Math.min(1, dt * 16); p.y += (hp.y - p.y) * Math.min(1, dt * 16);
      }
    }
    S.plates = S.plates.filter((p) => p.state !== 'gone');
    // chef
    const ch = S.chef; ch.t += dt;
    if (ch.cook > 0) {
      ch.cook -= dt;
      if (ch.cook <= 0) {
        const b0 = S.belts.find((b) => b.active);
        const p = this.newPlate(ch.item, L.chef.x + 40, L.chef.y - 20, b0);
        const tx = b0.dir > 0 ? 150 : L.W - 150;
        p.state = 'fly'; p.fly = { x0: L.chef.x + 30, y0: L.chef.y + 10, x1: tx, y1: b0.y, t: 0, dur: 0.3, h: 70, cb: () => { p.state = 'belt'; p.sq = 1; this.snd('place'); for (let i = 0; i < 6; i++) this.part('spark', p.x, p.y, rand(-150, 150), rand(-200, -40), 0.4, 6, '#fff'); } };
        ch.cd = [4.5, 3.2, 2.2][this.U.chef];
        ch.item = null;
      }
    } else if (ch.cd > 0) ch.cd -= dt;
    // customers
    for (let i = 0; i < S.custs.length; i++) {
      const c = S.custs[i];
      if (!c) {
        if (S.over) continue;
        S.arriveT[i] -= dt;
        if (S.arriveT[i] <= 0 && (S.demo || S.len - S.t > 5)) {
          const sp = S.specials.find((x) => !x.done && S.t >= x.at);
          if (sp) { sp.done = true; this.spawnCustomer(i, sp.kind); }
          else this.spawnCustomer(i);
        }
        continue;
      }
      this.updateCustomer(c, dt);
    }
    if (S.selCust) { S.selT -= dt; if (S.selT <= 0 || S.selCust.state !== 'wait') S.selCust = null; }
    // cat
    if (cfg.cat && playing) this.updateCat(dt);
    else if (S.cat) this.updateCat(dt);
    // bots: the title attract and the test bot
    if (S.demo || (this.bot && playing)) this.runBot(dt);
    // particles
    for (const q of this.parts) {
      q.t += dt;
      if (q.kind === 'coinfly') {
        if (q.t < 0) continue;
        if (q.t > q.max && !q.hit) { q.hit = true; this.coinBump = 1; if (!this._ct || this.time - this._ct > 0.05) { this._ct = this.time; this.snd('coin', rand(0.95, 1.1)); } }
        continue;
      }
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.kind === 'heart' || q.kind === 'steam') { q.vy *= 0.97; q.vx *= 0.95; }
      else if (q.kind === 'petal') { q.vx = Math.sin(q.t * 2 + q.rot) * 30 + 20; }
      else if (q.kind !== 'trail') q.vy += 900 * dt;
    }
    this.parts = this.parts.filter((q) => (q.kind === 'coinfly' ? !q.hit : q.t < q.max));
    for (const q of this.pops) q.t += dt;
    this.pops = this.pops.filter((q) => q.t < q.max);
    this.coinBump = Math.max(0, (this.coinBump || 0) - dt * 5);
    S.shownTips += (S.tips - S.shownTips) * Math.min(1, dt * 8);
    if (Math.abs(S.tips - S.shownTips) < 0.5) S.shownTips = S.tips;
    // ambient particles
    if (S.place === 2 && Math.random() < dt * 4) this.part('petal', rand(-50, L.W), -10, 20, rand(40, 80), 9, rand(5, 8), pick(['#ffb3cf', '#ffd0e0', '#fff']));
    for (const p of S.plates) if (p.dish === 'ramen' && p.state === 'belt' && Math.random() < dt * 1.5) this.part('steam', p.x + rand(-10, 10), p.y - 40, rand(-10, 10), -40, 1.1, rand(6, 10), 'rgba(255,255,255,.5)');
  }
  updateCustomer(c, dt) {
    const S = this.S, L = this.L;
    c.st += dt;
    c.bounce = Math.max(0, c.bounce - dt * 3);
    if (c.moodT < 90) c.moodT -= dt;
    if (c.state === 'arrive') { if (c.st > 0.45) { c.state = 'wait'; c.st = 0; } }
    else if (c.state === 'wait') {
      if (!S.demo && !S.over) c.pat -= dt;
      if (c.pat <= 0) {
        c.state = 'storm'; c.st = 0; c.mood = 'angry'; c.moodT = 99;
        S.walk++; S.combo = 0;
        if (c.kind === 'critic') { S.tips = Math.max(0, S.tips - 20); this.showBanner('BAD REVIEW!', '-20 tips', '#ff4f5f'); }
        this.snd('huff');
        this.shake = Math.max(this.shake, 14);
        const cp = this.custPos(c);
        this.pop(cp.x, cp.y - L.headR * 1.6, 'HMPH!', '#ff3b3b', 34);
        for (let i = 0; i < 10; i++) this.part('puff', cp.x + rand(-40, 40), cp.y - 30, rand(-120, 120), rand(-200, -60), 0.6, 14, '#ffffff');
        if (S.walk >= STRIKES) { setTimeout(() => { if (this.S === S && !S.ended) this.endDay(true); }, 900); S.over = true; }
      }
    } else if (c.state === 'eat') {
      if (Math.random() < dt * 6) { const cp = this.custPos(c); this.part('heart', cp.x + rand(-30, 30), cp.y - 40, rand(-40, 40), -120, 0.9, 8, '#ff7fae'); }
      if (c.st > (c.kind === 'sumo' ? 1.6 : 1.0)) { c.state = 'leave'; c.st = 0; }
    } else if (c.state === 'leave') {
      if (c.st > 0.45) this.freeSeat(c, S.demo ? rand(0.8, 2) : rand(...S.cfg.arrive) * (this.L.portrait ? 0.6 : 1));
    } else if (c.state === 'storm') {
      if (c.st < 0.7) c.ox = Math.sin(c.st * 60) * 6;
      else {
        c.ox += (c.seat < L.seats.length / 2 ? -1 : 1) * 1400 * dt;
        if (Math.random() < 0.5) this.part('puff', L.seats[c.seat] + c.ox, L.headY + 60, 0, -30, 0.4, 12, '#fff');
      }
      if (c.st > 1.3) this.freeSeat(c, rand(...S.cfg.arrive) * (this.L.portrait ? 0.6 : 1) + 1);
    }
  }
  updateCat(dt) {
    const S = this.S, L = this.L;
    const b0 = S.belts.find((b) => b.active);
    if (!S.cat) {
      if (S.over) return;
      S.catT -= dt;
      if (S.catT <= 0) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        S.cat = { x: dir > 0 ? -60 : L.W + 60, y: b0.y + S.lane * 0.5, dir, state: 'walk', t: 0, target: null, carrying: null };
        S.catT = rand(15, 22);
        this.snd('meow');
      }
      return;
    }
    const cat = S.cat;
    cat.t += dt;
    cat.y += (b0.y + S.lane * 0.5 - cat.y) * Math.min(1, dt * 8);
    const offscreen = cat.x < -90 || cat.x > L.W + 90;
    if (cat.state === 'walk') {
      if (!cat.target || cat.target.state !== 'belt') {
        // pick the nearest plate ahead of it on any belt
        let cand = S.plates.filter((p) => p.state === 'belt' && p.belt === b0 && p.x > 120 && p.x < L.W - 120 && (p.x - cat.x) * cat.dir > 40);
        if (!cand.length) cand = S.plates.filter((p) => p.state === 'belt' && p.x > 120 && p.x < L.W - 120 && (p.x - cat.x) * cat.dir > 40);
        cand.sort((a, b) => Math.abs(a.x - cat.x) - Math.abs(b.x - cat.x));
        cat.target = cand[0] || null;
      }
      cat.x += cat.dir * 150 * dt;
      if (cat.target && Math.abs(cat.target.x - cat.x) < 26) { cat.state = 'stalk'; cat.t = 0; this.snd('meow'); }
      if (cat.t > 2 && offscreen) S.cat = null;
    } else if (cat.state === 'stalk') {
      if (cat.target && cat.target.state === 'belt') cat.x += (cat.target.x - cat.x) * Math.min(1, dt * 8);
      if (cat.t > 1.5) {
        if (cat.target && cat.target.state === 'belt' && Math.abs(cat.target.x - cat.x) < 60) {
          cat.carrying = cat.target; cat.target.state = 'stolen'; if (cat.carrying.gold) S.goldOn = false;
          S.plates.splice(S.plates.indexOf(cat.carrying), 1);
          this.snd('steal');
          this.pop(cat.x, cat.y - 90, 'STOLEN!', '#ff9a5c', 26);
          cat.state = 'run'; cat.t = 0; cat.dir = cat.x < L.W / 2 ? -1 : 1;
        } else { cat.state = 'walk'; cat.t = 0; cat.target = null; }
      }
    } else if (cat.state === 'run') {
      cat.x += cat.dir * 420 * dt;
      if (offscreen) S.cat = null;
    } else if (cat.state === 'shoo') {
      cat.x += cat.dir * 600 * dt;
      cat.vy += 1800 * dt; cat.jy = Math.min(0, (cat.jy || 0) + cat.vy * dt);
      if (offscreen) S.cat = null;
    }
  }
  runBot(dt) {
    const S = this.S, L = this.L;
    S.botT -= dt;
    if (S.botT > 0) return;
    S.botT = S.demo ? rand(0.9, 1.6) : this.botMode === 'human' ? rand(0.9, 1.5) : this.botMode === 'slow' ? rand(1.8, 2.8) : 0.32;
    if (S.cat && !S.demo && (S.cat.state === 'stalk' || S.cat.state === 'run')) { this.shooCat(); return; }
    const want = this.unmetItems().sort((a, b) => a.c.pat / a.c.patMax - b.c.pat / b.c.patMax);
    for (const { c, it } of want) {
      const p = S.plates.find((q) => q.state === 'belt' && q.x > 100 && q.x < L.W - 100 && fits(it, q) && (!q.gold || true));
      if (p) {
        if (S.demo) { p.state = 'fly'; this.serveTo(p, c, p.x, p.y); }
        else this.serveTo(p, c, p.x, p.y);
        return;
      }
    }
    if (!S.demo) {
      if (want.length && S.chef.cd <= 0 && S.chef.cook <= 0 && this.botMode !== 'slow') this.useChef();
      const crowded = S.plates.filter((p) => p.state === 'belt').length > 12;
      if (crowded || (want.length > 3 && S.brakeCD <= 0)) this.useBrake();
    }
  }
  endDay(failed) {
    const S = this.S;
    if (S.ended) return;
    S.ended = true; S.over = true;
    const n = S.n, cfg = S.cfg;
    const tips = Math.round(S.tips);
    const stars = failed ? 0 : cfg.targets.filter((t) => tips >= t).length;
    const passed = !failed && stars > 0;
    const sv = this.save;
    const prevBest = sv.best[n] || 0;
    sv.coins += tips;
    sv.best[n] = Math.max(prevBest, tips);
    sv.stars[n] = Math.max(sv.stars[n] || 0, stars);
    if (passed) sv.unlocked = Math.max(sv.unlocked, Math.min(DAYS.length, n + 1));
    this.persist();
    for (const c of S.custs) if (c && c.state === 'wait') { c.state = 'leave'; c.st = 0; c.mood = 'ok'; }
    this.snd(passed ? 'end' : 'fail');
    this.mode = 'result';
    this.ui.hud(false);
    this.lastResult = { n, tips, stars, passed, failed, newBest: tips > prevBest && prevBest > 0, best: sv.best[n], served: S.served, maxCombo: S.maxCombo, walk: S.walk, perfect: S.perfect, targets: cfg.targets, coins: sv.coins };
    setTimeout(() => this.ui.show('result', this.lastResult), failed ? 300 : 700);
    if (!failed) this.showBanner(passed ? 'CLOSING TIME!' : 'NOT ENOUGH TIPS', '', passed ? '#5fd08a' : '#ff6b6b');
  }

  // ------------------------------------------------------------ render
  render() {
    const c = this.ctx, v = this.view, L = this.L, S = this.S;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const P = S ? S.P : PLACES[0];
    c.fillStyle = P.counter2; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    c.setTransform(v.s * this.dpr, 0, 0, v.s * this.dpr, (v.ox + sx * v.s) * this.dpr, (v.oy + sy * v.s) * this.dpr);
    const vb = { x0: -v.ox / v.s - 20, y0: -v.oy / v.s - 20, x1: (innerWidth - v.ox) / v.s + 20, y1: (innerHeight - v.oy) / v.s + 20 };
    if (!S) return;
    const t = this.time;
    drawRoom(c, P, L, t, vb, S.place, { lanterns: this.U.deco >= 2 });
    // customers, sumo last so he sits on top
    const cs = S.custs.filter(Boolean).sort((a, b) => (a.kind === 'sumo') - (b.kind === 'sumo'));
    for (const cu of cs) this.drawCustomer(cu, t);
    // counter
    c.fillStyle = P.counter; c.fillRect(vb.x0, L.counterY, vb.x1 - vb.x0, L.front - L.counterY);
    c.fillStyle = P.counter2; c.fillRect(vb.x0, L.counterY - 4, vb.x1 - vb.x0, 16);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(vb.x0, L.counterY - 4, vb.x1 - vb.x0, 4);
    c.fillStyle = OUT; c.fillRect(vb.x0, L.counterY + 12, vb.x1 - vb.x0, 3);
    c.fillStyle = 'rgba(0,0,0,.05)'; for (let y = L.counterY + 40; y < L.front; y += 28) c.fillRect(vb.x0, y, vb.x1 - vb.x0, 2);
    for (let i = 0; i < L.seats.length; i++) drawSetting(c, L.seats[i], L.counterY + 10, t + i, L.headR / 42);
    // belts, back to front, with their plates
    const act = S.belts.filter((b) => b.show > 0.02).sort((a, b) => a.y - b.y);
    const bh = S.lane - 26;
    for (const b of act) {
      c.save(); c.globalAlpha = b.show;
      drawBelt(c, 0, L.W, b.y, bh, b.off, P, b.dir, S.brakeT > 0);
      c.restore();
      const ps = S.plates.filter((p) => p.state === 'belt' && p.belt === b);
      c.save(); c.beginPath(); c.rect(0, vb.y0, L.W, vb.y1 - vb.y0); c.clip();
      for (const p of ps) this.drawPlateAt(p, p.x, p.y - 6, 1, t);
      c.restore();
      drawHatch(c, 0 + 74, b.y, bh, P, -1, t, b.dir > 0 ? b.flap : b.flap2);
      drawHatch(c, L.W - 74, b.y, bh, P, 1, t, b.dir > 0 ? b.flap2 : b.flap);
    }
    // front counter (our side)
    c.fillStyle = P.counter2; c.fillRect(vb.x0, L.front, vb.x1 - vb.x0, vb.y1 - L.front);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(vb.x0, L.front, vb.x1 - vb.x0, 6);
    c.fillStyle = OUT; c.fillRect(vb.x0, L.front - 3, vb.x1 - vb.x0, 3);
    c.fillStyle = 'rgba(0,0,0,.06)'; for (let y = L.front + 24; y < vb.y1; y += 22) c.fillRect(vb.x0, y, vb.x1 - vb.x0, 2);
    // decorations from the shop
    const U = this.U;
    if (U.deco >= 1 && L.deco[0]) drawDeco(c, 'cat', L.deco[0].x, L.deco[0].y, L.portrait ? 1.1 : 0.9, t);
    if (U.deco >= 3 && L.deco[2]) drawDeco(c, 'bonsai', L.deco[2].x, L.deco[2].y, L.portrait ? 1.1 : 0.9, t);
    if (U.deco >= 4 && L.deco[3]) drawDeco(c, 'koi', L.deco[3].x, L.deco[3].y, L.portrait ? 1.1 : 0.9, t);
    // cat
    if (S.cat) {
      const cat = S.cat;
      drawCat(c, cat.x, cat.y + (cat.jy || 0), L.portrait ? 1.2 : 1, t, cat.state, cat.dir, cat.carrying);
      if (cat.state === 'stalk') {
        const k = 1 + Math.sin(t * 20) * 0.1;
        c.save(); c.translate(cat.x + cat.dir * 26, cat.y - 78); c.scale(k, k);
        rr(c, -16, -18, 32, 32, 10); c.fillStyle = '#ff4f5f'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
        c.fillStyle = '#fff'; c.font = `700 24px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 0, -1);
        c.restore();
      }
    }
    if (this.mode !== 'title') this.drawControls(t);
    // plates in hand, flying and dragged
    for (const p of S.plates) {
      if (p.state === 'hand') this.drawPlateAt(p, p.x, p.y, L.plateR * 0.95 / this.PR, t, p === S.handSel);
    }
    for (const p of S.plates) if (p.state === 'fly') this.drawPlateAt(p, p.x, p.y, 1.05, t);
    if (this.drag) { const p = this.drag.p; this.drawPlateAt(p, p.x, p.y, 1.18, t, true); }
    // particles
    this.drawParts(t);
    for (const q of this.pops) {
      if (q.t < 0) continue;
      const k = q.t / q.max, sc = q.t < 0.12 ? easeOutBack(q.t / 0.12) : 1;
      c.save(); c.translate(q.x, q.y - k * 50); c.scale(sc, sc); c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      c.font = `400 ${q.size}px ${DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = q.size * 0.22; c.strokeStyle = OUT; c.lineJoin = 'round'; c.strokeText(q.text, 0, 0);
      c.fillStyle = q.col; c.fillText(q.text, 0, 0);
      c.restore();
    }
    if (this.flash > 0) { c.fillStyle = `rgba(255,240,180,${this.flash})`; c.fillRect(vb.x0, vb.y0, vb.x1 - vb.x0, vb.y1 - vb.y0); }
    if (this.mode === 'play' && S.n <= 2 && S.served === 0 && !this.drag && S.t > 1.5) this.drawHint(t);
    if (this.mode === 'play' || this.mode === 'result') this.drawHUD(t);
    if (this.banner) this.drawBanner(this.banner, vb);
  }
  drawHint(t) {
    // first-day helper: a ghost hand drags a matching plate to its customer
    const S = this.S, L = this.L, c = this.ctx;
    let h = this.hint;
    const valid = h && h.p.state === 'belt' && h.p.x > 120 && h.p.x < L.W - 120 && h.c.state === 'wait' && S.custs[h.c.seat] === h.c;
    if (!valid) {
      this.hint = null;
      for (const { c: cu, it } of this.unmetItems()) {
        const p = S.plates.find((q) => q.state === 'belt' && q.x > 200 && q.x < L.W - 260 && fits(it, q));
        if (p) { this.hint = h = { p, c: cu, t0: t }; break; }
      }
      if (!this.hint) return;
    }
    const k = ((t - h.t0) % 1.8) / 1.8;
    const px = h.p.x, py = h.p.y - this.PR * 0.3, cx = L.seats[h.c.seat], cy = L.headY + L.headR * 0.3;
    const m = clamp((k - 0.2) / 0.5, 0, 1), e = m * m * (3 - 2 * m);
    const x = lerp(px, cx, e), y = lerp(py, cy, e) - Math.sin(e * Math.PI) * 30;
    c.save();
    c.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    if (k > 0.2) { c.globalAlpha *= 0.55; drawPlateFull(c, h.p, x, y, this.PR, t, false); c.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1; }
    // the hand
    const press = k < 0.2 ? Math.min(1, k / 0.1) : 1;
    c.translate(x + 10, y + 18 + (1 - press) * 10); c.rotate(-0.25); c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = OUT; c.fillStyle = '#fff';
    rr(c, -6, -34, 12, 30, 6); c.fill(); c.stroke();
    rr(c, -14, -10, 32, 30, 10); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(-20, -8); c.stroke();
    c.restore();
    c.save(); c.font = `700 18px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tx = px, ty = h.p.y + this.PR * 0.9 + 14, label = 'Drag it to the customer!';
    const w = c.measureText(label).width + 26;
    rr(c, tx - w / 2, ty - 15, w, 30, 15); c.fillStyle = '#ffb000'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
    c.fillStyle = '#fff'; c.fillText(label, tx, ty + 1);
    c.restore();
  }
  drawPlateAt(p, x, y, s, t, glow) {
    const c = this.ctx, r = this.PR * s;
    const sq = p.sq;
    c.save(); c.translate(x, y);
    c.scale(1 + sq * 0.18, 1 - sq * 0.14);
    if (glow) { c.shadowColor = '#fff6a0'; c.shadowBlur = 22; }
    drawPlateFull(c, p, 0, 0, r, t);
    c.restore();
  }
  drawCustomer(cu, t) {
    const c = this.ctx, L = this.L, S = this.S;
    const R = cu.kind === 'sumo' ? L.headR * 1.2 : L.headR;
    let x = L.seats[cu.seat] + cu.ox, y = L.headY;
    if (cu.state === 'arrive') y += (1 - easeOutBack(clamp(cu.st / 0.45, 0, 1))) * R * 3;
    if (cu.state === 'leave') y += (cu.st / 0.45) * (cu.st / 0.45) * R * 3.5;
    const frac = cu.pat / cu.patMax;
    let mood = frac > 0.6 ? 'ok' : frac > 0.32 ? 'meh' : 'grumpy';
    if (frac < 0.15 && cu.state === 'wait') mood = 'angry';
    if (S.demo) mood = Math.sin(t * 0.7 + cu.seat * 2) > 0.3 ? 'happy' : 'ok';
    if (cu.moodT > 0 && cu.mood) mood = cu.mood;
    if (cu.state === 'eat') mood = 'eat';
    if (cu.state === 'storm') mood = 'angry';
    const b = cu.bounce, idle = Math.sin(t * 2.4 + cu.seat * 1.7) * 0.015;
    c.save(); c.translate(x, y + R * 0.9); c.scale(1 + b * 0.1, 1 - b * 0.1 + idle); c.translate(-x, -(y + R * 0.9));
    drawPerson(c, x, y, R, cu.look, mood, t + cu.seat, cu.kind);
    c.restore();
    if (cu.state === 'eat') {
      // the dish being eaten, on the counter in front
      c.save(); c.globalAlpha = 1 - clamp(cu.st - 0.6, 0, 1);
      drawPlate(c, x, L.counterY + 6, this.PR * 0.75, 'pink', false, t);
      c.restore();
    }
    if (cu.state !== 'wait' && cu.state !== 'arrive') return;
    if (S.demo && cu.state === 'arrive') return;
    // thought bubble
    const n = cu.items.length;
    const cols = Math.min(3, n), rows = Math.ceil(n / 3);
    // two-item bubbles are wide enough that 'ANY FISH' labels never collide, but never wider than a seat
    let bw = n === 1 ? L.bubbleW * 0.82 : n === 2 ? L.bubbleW * 1.36 : L.bubbleW * 1.2;
    if (cu.kind !== 'sumo') bw = Math.min(bw, (L.seats[1] - L.seats[0]) - 14);
    const bh = rows === 1 ? L.bubbleH : L.bubbleH * 1.55;
    const by = L.bubbleY - (rows - 1) * L.bubbleH * 0.32 + (cu.state === 'arrive' ? (1 - clamp(cu.st / 0.45, 0, 1)) * 20 : 0);
    const sel = S.selCust === cu;
    c.save();
    if (cu.state === 'arrive') { const k = easeOutBack(clamp(cu.st / 0.4, 0, 1)); c.translate(x, by); c.scale(k, k); c.translate(-x, -by); }
    drawBubble(c, x, by, bw, bh, x + R * 0.3, y - R * 1.05, S.demo ? 1 : frac, t, sel || cu.kind === 'critic');
    if (sel) { c.lineWidth = 4; c.strokeStyle = '#ffb000'; rr(c, x - bw / 2 - 5, by - bh / 2 - 5, bw + 10, bh + 10, 24); c.stroke(); }
    const sc = n === 1 ? 1.55 : n === 2 ? 1.1 : 0.8;
    const gapX = n === 2 ? bw * 0.42 : 48 * (L.portrait ? 1.18 : 1);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 3), inRow = Math.min(3, n - row * 3), col = i - row * 3;
      const ix = x + (col - (inRow - 1) / 2) * gapX, iy = by - 8 + (row - (rows - 1) / 2) * 44;
      drawOrderIcon(c, cu.items[i], ix, iy, sc * (L.portrait ? 1.18 : 1), t);
    }
    if (cu.kind === 'critic') {
      c.font = `700 13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      rr(c, x - 22, by - bh / 2 - 10, 44, 20, 10); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
      c.fillStyle = OUT; c.fillText('VIP', x, by - bh / 2);
    }
    c.restore();
    if (sel) {
      const ay = by - bh / 2 - 26 + Math.sin(t * 8) * 5;
      c.save(); c.font = `700 15px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      rr(c, x - 52, ay - 13, 104, 26, 13); c.fillStyle = '#ffb000'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
      c.fillStyle = '#fff'; c.fillText('tap a plate', x, ay); c.restore();
    }
  }
  drawControls(t) {
    const c = this.ctx, L = this.L, S = this.S;
    // hand tray
    const n = this.handSlots;
    const tw = n * this.slotW + 20;
    c.save();
    rr(c, L.hand.x - tw / 2, L.hand.y - 40, tw, 74, 22); c.fillStyle = 'rgba(59,35,64,.28)'; c.fill();
    for (let i = 0; i < n; i++) {
      const hp = this.handPos(i);
      c.beginPath(); c.ellipse(hp.x, hp.y + 4, 38, 18, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
      c.setLineDash([6, 6]); c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(); c.setLineDash([]);
    }
    c.font = `700 14px ${FONT}`; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,.9)';
    c.fillText(n > 1 ? 'HANDS' : 'HAND', L.hand.x - tw / 2 - 10, L.hand.y - 3);
    c.restore();
    // chef
    const ch = S.chef, cr = L.chef.R;
    const ready = ch.cd <= 0 && ch.cook <= 0;
    drawChef(c, L.chef.x, L.chef.y, cr, t, ch.cook > 0, ready);
    // cutting board
    rr(c, L.chef.x - cr * 1.6, L.chef.y + cr * 1.75, cr * 3.2, cr * 0.5, 6); c.fillStyle = '#f3d2a2'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
    if (ch.cook > 0 && ch.item) { drawDish(c, ch.item.dish, L.chef.x + cr * 0.4, L.chef.y + cr * 1.65, 0.55, t, false); }
    // chef status bubble
    const bx = L.chef.x + cr * 1.45, byy = L.chef.y + cr * 0.95;
    if (ready) {
      const k = 1 + Math.sin(t * 6) * 0.06;
      c.save(); c.translate(bx, byy); c.scale(k, k);
      rr(c, -6, -16, 78, 32, 16); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
      c.font = `700 14px ${FONT}`; c.fillStyle = OUT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('COOK!', 33, 0);
      c.restore();
    } else {
      const max = [4.5, 3.2, 2.2][this.U.chef];
      const f = ch.cook > 0 ? 0 : 1 - ch.cd / max;
      c.save(); c.translate(bx + 18, byy);
      c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.closePath(); c.fillStyle = ch.cook > 0 ? '#ff6b6b' : '#3cc8b4'; c.fill();
      c.restore();
    }
    // slow lever
    const br = L.brake, on = S.brakeT > 0, rdy = !on && S.brakeCD <= 0;
    c.save(); c.translate(br.x, br.y);
    if (on) { c.shadowColor = '#6bc8ff'; c.shadowBlur = 24; }
    c.beginPath(); c.arc(0, 0, br.r, 0, Math.PI * 2); c.fillStyle = on ? '#4fa8ff' : rdy ? '#fff' : '#d8cfe0'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    c.shadowBlur = 0;
    if (!on && !rdy) {
      const max = this.U.brake >= 2 ? 9 : 18;
      c.beginPath(); c.arc(0, 0, br.r - 5, -Math.PI / 2, -Math.PI / 2 + (1 - S.brakeCD / max) * Math.PI * 2); c.lineWidth = 6; c.strokeStyle = '#4fa8ff'; c.stroke();
    }
    // lever icon
    const ang = on ? 0.6 : -0.6;
    c.save(); c.rotate(ang); c.lineWidth = 6; c.strokeStyle = OUT; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 6); c.lineTo(0, -br.r * 0.5); c.stroke();
    c.beginPath(); c.arc(0, -br.r * 0.55, 8, 0, Math.PI * 2); c.fillStyle = '#ff5f5f'; c.fill(); c.lineWidth = 2.5; c.stroke(); c.restore();
    rr(c, -16, 4, 32, 10, 4); c.fillStyle = OUT; c.fill();
    c.font = `700 13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = on ? '#fff' : OUT;
    c.fillText(on ? 'SLOW' : rdy ? 'SLOW' : '', 0, br.r * 0.58);
    c.restore();
  }
  drawParts(t) {
    const c = this.ctx;
    const tgt = this.tipsPos();
    for (const q of this.parts) {
      if (q.kind === 'coinfly') {
        if (q.t < 0) continue;
        const k = clamp(q.t / q.max, 0, 1), e = k * k;
        const mx = q.sx + q.vx * 0.4, my = q.sy + q.vy * 0.4;
        const x = (1 - e) * (1 - e) * q.x + 2 * (1 - e) * e * mx + e * e * tgt.x;
        const y = (1 - e) * (1 - e) * q.y + 2 * (1 - e) * e * my + e * e * tgt.y;
        coin(c, x, y, q.size * (1 - k * 0.3));
        continue;
      }
      const k = q.t / q.max;
      c.save(); c.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      if (q.kind === 'spark') sparkle(c, q.x, q.y, q.size * (1 - k * 0.5), q.col);
      else if (q.kind === 'heart') heart(c, q.x, q.y, q.size * (0.6 + Math.min(1, q.t * 6) * 0.4), q.col);
      else if (q.kind === 'puff') { c.beginPath(); c.arc(q.x, q.y, q.size * (0.6 + k), 0, Math.PI * 2); c.fillStyle = q.col; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(59,35,64,.35)'; c.stroke(); }
      else if (q.kind === 'trail') { c.globalAlpha = (1 - k) * 0.6; c.beginPath(); c.arc(q.x, q.y, q.size * (1 - k), 0, Math.PI * 2); c.fillStyle = q.col; c.fill(); }
      else if (q.kind === 'steam') { c.globalAlpha = (1 - k) * 0.6; c.beginPath(); c.arc(q.x + Math.sin(q.t * 4) * 4, q.y, q.size * (0.5 + k), 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
      else if (q.kind === 'petal') { c.translate(q.x, q.y); c.rotate(q.rot); c.beginPath(); c.ellipse(0, 0, q.size, q.size * 0.55, 0, 0, Math.PI * 2); c.fillStyle = q.col; c.fill(); }
      c.restore();
    }
  }
  tipsPos() { const L = this.L; return L.portrait ? { x: L.W - 164, y: L.hudY } : { x: L.W - 200, y: L.hudY }; }
  drawHUD(t) {
    const c = this.ctx, L = this.L, S = this.S;
    const y = L.hudY;
    const pill = (x, w, h = 46) => { rr(c, x, y - h / 2, w, h, h / 2); c.fillStyle = 'rgba(255,255,255,.95)'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke(); };
    c.save();
    c.textBaseline = 'middle';
    // day + walkouts (left; the pause button sits at the far left)
    const lx = Math.max(66, (Math.max(38, 46 * this.view.s) + 16) / this.view.s);
    pill(lx, L.portrait ? 196 : 228);
    c.font = `400 18px ${DISPLAY}`; c.fillStyle = S.P.accent === '#ff4fd8' ? '#d93fb8' : '#ff5f5f'; c.textAlign = 'left';
    c.fillText(`DAY ${S.n}`, lx + 16, y + 1);
    for (let i = 0; i < STRIKES; i++) {
      const hx = lx + (L.portrait ? 118 : 128) + i * 30;
      const lost = i >= STRIKES - S.walk;
      c.save(); if (lost) c.globalAlpha = 0.3;
      heart(c, hx, y + 1, 11, lost ? '#9a8aa8' : '#ff5f8f');
      c.restore();
      if (lost) { c.strokeStyle = OUT; c.lineWidth = 3; c.beginPath(); c.moveTo(hx - 7, y - 6); c.lineTo(hx + 7, y + 8); c.moveTo(hx + 7, y - 6); c.lineTo(hx - 7, y + 8); c.stroke(); }
    }
    // timer (center)
    const left = Math.max(0, S.len - S.t);
    const tw = L.portrait ? 150 : 180, tx = L.portrait ? L.W / 2 - tw / 2 + 60 : L.W / 2 - tw / 2;
    const urgent = left < 10 && this.mode === 'play';
    c.save();
    if (urgent) { const k = 1 + Math.max(0, Math.sin(t * Math.PI * 2)) * 0.06; c.translate(tx + tw / 2, y); c.scale(k, k); c.translate(-(tx + tw / 2), -y); }
    pill(tx, tw);
    const f = 1 - left / S.len;
    rr(c, tx + 50, y - 7, tw - 66, 14, 7); c.fillStyle = '#efe4f2'; c.fill();
    rr(c, tx + 50, y - 7, Math.max(14, (tw - 66) * (1 - f)), 14, 7); c.fillStyle = urgent ? '#ff4f5f' : '#3cc8b4'; c.fill();
    c.font = `700 20px ${FONT}`; c.fillStyle = urgent ? '#ff4f5f' : OUT; c.textAlign = 'center';
    c.fillText(`${Math.ceil(left)}`, tx + 27, y + 1);
    c.restore();
    // tips + star targets (right)
    const tp = this.tipsPos(), rw = L.portrait ? 184 : 214, rx = tp.x - 30;
    const bump = 1 + (this.coinBump || 0) * 0.12;
    pill(rx, rw);
    c.save(); c.translate(tp.x, y); c.scale(bump, bump); coin(c, 0, 0, 14); c.restore();
    c.font = `700 24px ${FONT}`; c.fillStyle = OUT; c.textAlign = 'left';
    c.fillText(`${Math.round(S.shownTips)}`, tp.x + 24, y + 2);
    const tg = S.cfg.targets;
    for (let i = 0; i < 3; i++) {
      const sx = rx + rw - 76 + i * 24, got = S.tips >= tg[i];
      star(c, sx, y - 2, 10); c.fillStyle = got ? '#ffd23f' : '#efe4f2'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
      c.font = `700 9px ${FONT}`; c.fillStyle = OUT; c.textAlign = 'center'; c.fillText(tg[i], sx, y + 15);
    }
    if (S.combo >= 2 && this.mode === 'play') {
      const cm = 1 + Math.min(S.combo - 1, 10) * 0.05;
      c.font = `400 16px ${DISPLAY}`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = OUT; c.lineJoin = 'round';
      const cy2 = y + 40;
      c.strokeText(`COMBO ${S.combo}  x${cm.toFixed(1)}`, tx + tw / 2, cy2); c.fillStyle = '#ffd23f'; c.fillText(`COMBO ${S.combo}  x${cm.toFixed(1)}`, tx + tw / 2, cy2);
    }
    // the day's tip, early on
    if (this.tipT > 0 && this.mode === 'play' && S.cfg.tip) {
      c.globalAlpha = Math.min(1, this.tipT);
      c.font = `600 ${L.portrait ? 20 : 18}px ${FONT}`; c.textAlign = 'center';
      const ty = L.counterY + 20;
      const w = c.measureText(S.cfg.tip).width + 34;
      rr(c, L.W / 2 - w / 2, ty - 18, w, 36, 18); c.fillStyle = 'rgba(59,35,64,.9)'; c.fill();
      c.fillStyle = '#fff'; c.fillText(S.cfg.tip, L.W / 2, ty + 1);
    }
    c.restore();
  }
  drawBanner(b, vb) {
    const c = this.ctx, L = this.L;
    const k = b.t / 1.8;
    const sc = b.t < 0.18 ? easeOutBack(b.t / 0.18) * 1.0 : 1;
    const a = k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = L.portrait ? L.H * 0.42 : L.H * 0.44;
    c.save(); c.globalAlpha = a;
    c.fillStyle = 'rgba(59,35,64,.55)'; c.fillRect(vb.x0, y - 60 * sc, vb.x1 - vb.x0, 120 * sc);
    c.translate(L.W / 2, y - (b.sub ? 10 : 0)); c.scale(sc, sc); c.rotate(-0.03);
    c.font = `400 ${L.portrait ? 54 : 64}px ${DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 12; c.strokeStyle = OUT; c.lineJoin = 'round'; c.strokeText(b.text, 0, 0);
    c.fillStyle = b.col; c.fillText(b.text, 0, 0);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillText(b.text, 0, -3);
    if (b.sub) { c.rotate(0.03); c.font = `600 22px ${FONT}`; c.fillStyle = '#fff'; c.fillText(b.sub, 0, 44); }
    c.restore();
  }
}

new Game();
