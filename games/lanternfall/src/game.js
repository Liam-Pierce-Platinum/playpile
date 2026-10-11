// The simulation: fixed 60 Hz steps. Movement, the lantern's burn, every weapon,
// enemies, embers, chests, the spawn director, the boss and dawn.
import { RNG, TAU, clamp, angDiff } from './util.js';
import { UP, ACTIVES, PASSIVES, ENEMY, CHARS, WEAPON_IDX, WEAPON_N, RUN_LEN, BOSS_AT, ELITE_AT, STAG_FLEE_AT, ACTIVE_SLOTS, PASSIVE_SLOTS, xpNeed, PHASES } from './data.js';
import { World } from './world.js';

export const DT = 1 / 60;
const MAXE = 640;
const CONE_HALF = 0.4;

class Pool {
  constructor(make, cap) { this.a = []; this.n = 0; this.make = make; this.cap = cap; }
  get() {
    if (this.n >= this.cap) return null;
    if (this.n < this.a.length) return this.a[this.n++];
    const o = this.make(); this.a.push(o); this.n++; return o;
  }
  kill(i) { const t = this.a[i]; this.a[i] = this.a[this.n - 1]; this.a[this.n - 1] = t; this.n--; }
  clear() { this.n = 0; }
}

const GC = 64, GN = 44;

export class Game {
  constructor(o) {
    this.o = o; this.cb = o.cb || {};
    this.seed = o.seed >>> 0;
    this.rng = new RNG(this.seed);
    this.charKey = o.char; this.char = CHARS[o.char];
    this.lantern = this.char.lantern;
    this.mapKey = o.map; this.moonless = !!o.moonless; this.daily = !!o.daily; this.attract = !!o.attract;
    this.shed = o.shed || {};
    this.god = !!o.god;                 // test hook: hurtPlayer() is a no-op, the hp number stays sane
    this.seen = o.seen || {};           // one-time in-world callouts already shown (persisted next to save.seenChest)
    this.hints = [];                    // short lines floated under the player
    this.world = new World(o.map, this.seed ^ 0x2545f491, o.bake || 1.5);
    this.time = 0; this.state = 'play'; this.endT = 0; this.over = false;
    this.p = { x: 0, y: 0, vx: 0, vy: 0, hp: 100, face: 1, walkT: 0, moving: false, inv: 0, hurtT: 0, aim: 0, inWater: false };
    this.input = { x: 0, y: 0 };
    this.items = {}; this.actives = []; this.passives = []; this.ws = {};
    this.level = 1; this.xp = 0; this.need = xpNeed(1); this.pendingLv = 0;
    this.kills = 0; this.embersGot = 0; this.chestsOpened = 0; this.evolutions = 0; this.dmgBy = {}; this.levelTimes = [];
    this.rerolls = 1 + (this.shed.reroll || 0); this.banishes = this.shed.banish || 0; this.banished = new Set();
    this.pool = o.pool || null;  // daily: restricted upgrade pool
    this.damageTaken = 0; this.bossKilled = false; this.boss = null; this.elite = null;
    this.E = new Pool(() => ({ hitT: new Float32Array(WEAPON_N) }), MAXE);
    this.embers = new Pool(() => ({}), 700);
    this.parts = new Pool(() => ({}), 1400);
    this.nums = new Pool(() => ({}), 110);
    this.bolts = new Pool(() => ({}), 160);
    this.orbs = new Pool(() => ({}), 200);
    this.zones = []; this.rings = []; this.beams = []; this.pickups = []; this.grasps = [];
    this.gHead = new Int32Array(GN * GN); this.gNext = new Int32Array(MAXE); this.gox = 0; this.goy = 0;
    this.shake = 0; this.flash = 0; this.flashCol = '255,220,150'; this.hitstop = 0; this.slow = 0;
    this.spawnAcc = 1.5; this.dpsAcc = 0; this.dpsEst = 12; this.dpsT = 0; this.ringId = 1;
    this.banner = null; this.phase = 0; this.creep = 0; this.dawnK = 0; this.deathK = 0; this.dyingReal = 0;
    this.viewHW = 640; this.viewHH = 400;
    this.emberStreak = 0; this.emberStreakT = 0;
    this.R = this.char.radius; this.burnMul = 1; this.lightT = 0;
    // the first second already has moths closing in, so the loop (approach -> burn -> ember) is taught by 0:05
    this.events = [
      { t: 1, f: 'openRing', n: 8 }, { t: 2, f: 'hint', id: 'burn', text: 'Anything that steps into your light burns' },
      { t: 60, f: 'mothRing', n: 26 }, { t: 80, f: 'chest' }, { t: 100, f: 'wolfPack', n: 6 }, { t: 116, f: 'lumen' },
      { t: ELITE_AT, f: 'elite' }, { t: 172, f: 'mothRing', n: 44 }, { t: 196, f: 'lumen' }, { t: 205, f: 'wolfPack', n: 14 },
      { t: STAG_FLEE_AT, f: 'stagFlee' },
      { t: 232, f: 'treeRing', n: 9 }, { t: 246, f: 'lumen' }, { t: BOSS_AT, f: 'boss' }, { t: 285, f: 'mothRing', n: 40 },
    ];
    this.recalc();
    this.p.hp = this.s.maxHp;
    if (this.charKey === 'child') this.take('wisps', true), this.take('wisps', true);
    if (this.o.startWith) for (const id of this.o.startWith) this.take(id, true);
    this.pilot = this.shed.pilot || 0;
    this.banner = { text: this.attract ? '' : PHASES[0].banner, t: 0 };
  }

  // ---------- stats ----------
  L(id) { return this.items[id] || 0; }
  recalc() {
    const L = (id) => this.items[id] || 0, S = (id) => this.shed[id] || 0, ch = this.char;
    const lant = L('lantern'), radLv = Math.ceil(lant / 2), burnLv = Math.floor(lant / 2);
    const s = this.s || (this.s = {});
    const oldMax = s.maxHp || 0;
    s.maxHp = ch.hp + S('vigor') * 10 + L('moonsilk') * 20;
    if (oldMax && s.maxHp > oldMax && this.p) this.p.hp += s.maxHp - oldMax;
    s.speed = ch.spd * (1 + L('feather') * 0.08 + S('boots') * 0.03);
    s.radius = ch.radius * (1 + L('wick') * 0.10 + radLv * 0.08 + S('wick') * 0.04) * (this.moonless ? 0.75 : 1);
    s.dmg = 1 + L('kindling') * 0.08 + S('might') * 0.04;
    s.burn = ch.burn * (1 + L('oil') * 0.15 + burnLv * 0.15 + S('oil') * 0.05) * s.dmg;
    s.area = 1 + L('mirror') * 0.08;
    s.cd = Math.max(0.5, 1 - L('echo') * 0.06 - S('haste') * 0.03);
    s.dur = 1 + L('tinder') * 0.12;
    s.proj = 1 + L('lens') * 0.10;
    s.crit = 0.05 + L('lens') * 0.06 + L('clover') * 0.03;
    s.armor = L('bark');
    s.magnet = 84 * (1 + L('lodestone') * 0.25 + S('magnet') * 0.08);
    s.regen = L('heartwood') * 0.3 + S('mending') * 0.1;
    s.luck = 1 + L('clover') * 0.1;
  }

  // ---------- light ----------
  updateLight() {
    const t = this.time, s = this.s;
    let R = s.radius;
    this.burnMul = 1;
    if (this.lantern === 'tiny') R *= 0.72;
    if (this.lantern === 'pulse') { const k = Math.sin(t * TAU / 2.6); R *= 1.06 + 0.32 * k; this.burnMul = 1.05 + 0.2 * k; }
    if (this.lantern === 'cone') this.burnMul = 1.4;
    // breathing + flicker
    R *= 1 + 0.022 * Math.sin(t * 1.7) + 0.012 * Math.sin(t * 11.3) * Math.sin(t * 7.1);
    if (this.moonless) R *= 1 - 0.24 * this.creep;
    if (this.mapKey === 'marsh') R *= 1 - 0.22 * this.world.fogAt(this.p.x, this.p.y);
    if (this.state === 'dying') R *= Math.max(0, 1 - this.deathK);
    if (this.state === 'dawn') R *= 1 + this.dawnK * 6;
    this.R = R;
  }
  inLight(x, y, pad) {
    const dx = x - this.p.x, dy = y - this.p.y, d2 = dx * dx + dy * dy;
    if (this.lantern === 'cone') {
      const R0 = this.R * 0.42 + pad; if (d2 < R0 * R0) return true;
      const Lc = this.R * 2.25 + pad; if (d2 > Lc * Lc) return false;
      const d = Math.sqrt(d2);
      return Math.abs(angDiff(Math.atan2(dy, dx), this.p.aim)) < CONE_HALF + pad / d;
    }
    const R = this.R + pad;
    return d2 < R * R;
  }

  // ---------- spatial grid ----------
  buildGrid() {
    const h = this.gHead; h.fill(-1);
    this.gox = this.p.x - GN * GC / 2; this.goy = this.p.y - GN * GC / 2;
    const A = this.E.a;
    for (let i = 0; i < this.E.n; i++) {
      const e = A[i];
      const cx = clamp(Math.floor((e.x - this.gox) / GC), 0, GN - 1), cy = clamp(Math.floor((e.y - this.goy) / GC), 0, GN - 1);
      const c = cy * GN + cx; this.gNext[i] = h[c]; h[c] = i;
    }
  }
  near(x, y, r, fn) {
    const A = this.E.a, h = this.gHead, nx = this.gNext;
    const x0 = clamp(Math.floor((x - r - this.gox) / GC), 0, GN - 1), x1 = clamp(Math.floor((x + r - this.gox) / GC), 0, GN - 1);
    const y0 = clamp(Math.floor((y - r - this.goy) / GC), 0, GN - 1), y1 = clamp(Math.floor((y + r - this.goy) / GC), 0, GN - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = h[cy * GN + cx]; i !== -1; i = nx[i]) {
        const e = A[i];
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, rr = r + e.r;
        if (dx * dx + dy * dy < rr * rr) { if (fn(e) === false) return; }
      }
    }
  }
  nearest(x, y, maxD, skip) {
    let best = null, bd = maxD * maxD;
    const A = this.E.a;
    for (let i = 0; i < this.E.n; i++) {
      const e = A[i]; if (e.dead || (skip && skip.has(e))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------- main step ----------
  step(dt) {
    if (this.state === 'play' || this.state === 'dying' || this.state === 'dawn') this.tick(dt);
  }
  tick(dt) {
    const p = this.p, s = this.s;
    this.time += (this.state === 'play') ? dt : 0;
    this.lightT += dt;
    const t = this.time;
    // death: 0.35 s hitstop, 0.6 s at quarter speed (main.js), the dark closes in 0.35 s of sim time; ~1.4 s real time to the card
    if (this.state === 'dying') { this.deathK = Math.min(1, this.deathK + dt / 0.35); this.endT += dt; if (this.endT > 0.6 && !this.over) this.finish(false); }
    if (this.state === 'dawn') { this.dawnK = Math.min(1, this.dawnK + dt / 2.2); this.endT += dt; if (this.endT > 3.6 && !this.over) this.finish(true); }

    // moonless: the shadows creep in for 8 s out of every 45
    if (this.moonless) { const c = (t - 30) % 45; const tgt = t > 30 && c < 8 ? 1 : 0; this.creep += (tgt - this.creep) * Math.min(1, dt * 1.5); if (tgt && c < dt * 1.5) this.say('The shadows creep in...'); }
    this.world.updateFog(dt, p.x, p.y, Math.hypot(this.viewHW, this.viewHH));
    this.updateLight();

    // ---- player ----
    if (this.state === 'play') {
      let ix = this.input.x, iy = this.input.y; const m = Math.hypot(ix, iy);
      if (m > 1) { ix /= m; iy /= m; }
      p.inWater = this.world.waterAt(p.x, p.y + 4);
      const sp = s.speed * (p.inWater ? 0.72 : 1);
      p.vx += (ix * sp - p.vx) * Math.min(1, dt * 14); p.vy += (iy * sp - p.vy) * Math.min(1, dt * 14);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.moving = Math.hypot(p.vx, p.vy) > 15;
      if (p.moving) { p.walkT += dt * Math.hypot(p.vx, p.vy) / 26; if (Math.abs(p.vx) > 8) p.face = p.vx > 0 ? 1 : -1; }
      p.inv = Math.max(0, p.inv - dt); p.hurtT = Math.max(0, p.hurtT - dt);
      p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);
    } else { p.vx *= 0.9; p.vy *= 0.9; }

    this.buildGrid();
    // miner's head turns toward the nearest threats
    if (this.lantern === 'cone') {
      let ax = 0, ay = 0;
      this.near(p.x, p.y, this.R * 2.3, (e) => { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) + 20; ax += dx / (d * d); ay += dy / (d * d); });
      if (ax || ay) { const tgt = Math.atan2(ay, ax); p.aim += angDiff(tgt, p.aim) * Math.min(1, dt * 5); }
      else if (p.moving) p.aim += angDiff(Math.atan2(p.vy, p.vx), p.aim) * Math.min(1, dt * 4);
    }

    if (this.state === 'play') { this.director(dt); this.runEvents(); }
    this.updateEnemies(dt);
    if (this.state === 'play') this.updateWeapons(dt);
    this.updateZones(dt);
    this.updateBolts(dt);
    this.updateOrbs(dt);
    this.updateEmbers(dt);
    this.updatePickups();
    this.updateFx(dt);
    this.compact();

    // dps estimate drives the spawn budget
    this.dpsT += dt;
    if (this.dpsT >= 1) { this.dpsEst = this.dpsEst * 0.75 + (this.dpsAcc / this.dpsT) * 0.25; this.dpsAcc = 0; this.dpsT = 0; }

    if (this.hints.length) { const h = this.hints[0]; h.t += dt; if (h.t > h.life) this.hints.shift(); }
    if (this.state === 'play') {
      if (this.banner) this.banner.t += dt;
      for (let i = this.phase + 1; i < PHASES.length; i++) if (t >= PHASES[i].t) { this.phase = i; if (PHASES[i].banner) this.say(PHASES[i].banner, i === PHASES.length - 1); }
      // fixed early reward beats (0:12, 0:30, 0:50): if the player is behind, the lantern flares and draws every ember in
      for (const [bt, lv] of [[12, 2], [30, 3], [50, 4]]) {
        if (t >= bt && t - dt < bt && this.level < lv && !this.attract) {
          for (let i = 0; i < this.embers.n; i++) this.embers.a[i].mag = true;
          this.xp = Math.max(this.xp, this.need); this.checkLevel();
          this.ring(p.x, p.y, this.R * 1.4, '#ffe2a0', 10); this.sfx('pulse');
        }
      }
      // an evolution is ready: make sure a chest-carrier turns up soon
      if (!this.attract && t - (this.lastLumen || 0) > 18 && this.evolvable() && !this.pickups.some((k) => k.kind === 'chest') && !this.lumenAlive()) {
        this.lastLumen = t; const [x, y] = this.spawnPoint(-220); const e = this.spawn('lumen', x, y, 26 + t * 0.15); if (e) { e.life = 0; e.keen = true; }
        this.say('A golden moth is drawn to your power! Catch it.');
      }
      if (t >= 120 && this.damageTaken === 0) this.achieve('untouched');
      if (t >= 150) this.achieve('survive150');
      if (this.kills >= 1000) this.achieve('kills1000run');
      if (p.hp <= 0 && !this.attract) this.die();
      if (t >= RUN_LEN) this.startDawn();
      if (this.attract && t > 200) { this.time = 30; }
      if (this.pendingLv > 0 && !this.attract) { this.state = 'levelup'; this.cb.levelup && this.cb.levelup(this); }
      else if (this.pendingLv > 0 && this.attract) { this.pendingLv--; const ch = this.offer(); if (ch.length) this.take(ch[0].id); }
    }
  }
  checkLevel() {
    while (this.xp >= this.need && !this.over) { this.xp -= this.need; this.level++; this.need = xpNeed(this.level); this.pendingLv++; this.p.hp = Math.min(this.s.maxHp, this.p.hp + this.s.maxHp * 0.1); this.levelTimes.push(+this.time.toFixed(1)); }
  }
  embersWorth() { let v = 0; for (let i = 0; i < this.embers.n; i++) v += this.embers.a[i].v; return v; }
  lumenAlive() { for (let i = 0; i < this.E.n; i++) if (this.E.a[i].type === 'lumen' && !this.E.a[i].dead) return true; return false; }
  say(text, big) { this.banner = { text, t: 0, big: !!big }; }
  // a one-time in-world callout (floats under the player); `once` is a key remembered across runs
  hint(text, once, life = 3.4) {
    if (this.attract) return;
    if (once) { if (this.seen[once]) return; this.seen[once] = true; this.cb.seen && this.cb.seen(once); }
    if (this.hints.length < 3) this.hints.push({ text, t: 0, life });   // queued: one shows at a time
  }
  achieve(id) { if (!this.attract && this.cb.achieve) this.cb.achieve(id); }

  // ---------- spawning ----------
  hpMul() { const t = this.time; return (1 + t / 150 + Math.pow(t / 300, 2) * 1.5) * (this.moonless ? 1.15 : 1); }
  spawnPoint(margin = 60) {
    const hw = this.viewHW + margin, hh = this.viewHH + margin, r = this.rng;
    const per = 4 * (hw + hh), u = r.f() * per;
    let x, y;
    if (u < 2 * hw) { x = -hw + u; y = -hh; }
    else if (u < 2 * hw + 2 * hh) { x = hw; y = -hh + (u - 2 * hw); }
    else if (u < 4 * hw + 2 * hh) { x = hw - (u - 2 * hw - 2 * hh); y = hh; }
    else { x = -hw; y = hh - (u - 4 * hw - 2 * hh); }
    // a bias toward where you are walking, so running away does not empty the screen
    if (this.p.moving && r.chance(0.3)) { const a = Math.atan2(this.p.vy, this.p.vx) + r.range(-0.7, 0.7), d = Math.hypot(hw, hh); x = Math.cos(a) * d; y = Math.sin(a) * d; }
    return [this.p.x + x, this.p.y + y];
  }
  director(dt) {
    const t = this.time;
    // 3.0/s for the opening, easing into the curve by 0:20 (the first ten seconds must not be dead air)
    let rate = t < 20 ? 3.0 + (2.26 - 3.0) * (t / 20) : 1.5 + t * 0.038;
    if (t > 20) rate *= clamp(Math.sqrt(this.dpsEst / (12 + t * 1.2)), 0.85, 1.35);
    if (this.boss && !this.boss.dead) rate *= 0.45;
    if (this.attract) rate *= 0.55;
    if (this.moonless) rate *= 1.1;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.E.n >= MAXE - 20) { this.spawnAcc = 0; break; }
      const w = { moth: 1, wolf: t > 40 ? Math.min(0.38, (t - 40) / 120) : 0, tree: t > 90 ? 0.16 + (t - 90) / 900 : 0, wraith: t > 120 ? 0.28 : 0, brood: t > 200 ? 0.035 : 0 };
      let sum = 0; for (const k in w) sum += w[k];
      let u = this.rng.f() * sum, type = 'moth';
      for (const k in w) { u -= w[k]; if (u <= 0) { type = k; break; } }
      const [x, y] = this.spawnPoint();
      this.spawn(type, x, y);
      if (type === 'wraith') this.hint('Wraiths lunge through the light. Keep moving', 'wraith');
    }
  }
  spawn(type, x, y, hpOverride) {
    const e = this.E.get(); if (!e) return null;
    const d = ENEMY[type];
    e.type = type; e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
    e.maxhp = e.hp = hpOverride || d.hp * this.hpMul();
    e.r = d.r; e.spd = d.spd * (0.9 + this.rng.f() * 0.2); e.dmg = d.dmg; e.xp = d.xp; e.mass = d.mass;
    e.dead = false; e.flash = 0; e.t = this.rng.f() * 10; e.face = x < this.p.x ? 1 : -1; e.st = 'go'; e.tt = 0; e.stun = 0; e.slow = 0;
    e.ign = 0; e.igDps = 0; e.summoned = false; e.second = false; e.struck = false; e.bacc = 0; e.bt = 0; e.lit = false; e.dx = 0; e.dy = 0; e.cd = 1.5 + this.rng.f() * 2; e.orb = this.rng.f() * TAU; e.life = 0; e.keen = false;
    e.hitT.fill(0);
    return e;
  }
  runEvents() {
    const t = this.time;
    while (this.events.length && t >= this.events[0].t) {
      const ev = this.events.shift();
      if (this.attract && ev.f !== 'mothRing') continue;
      const p = this.p, R = Math.hypot(this.viewHW, this.viewHH) * 0.85;
      if (ev.f === 'mothRing') {
        for (let i = 0; i < ev.n; i++) { const a = i / ev.n * TAU; this.spawn('moth', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); }
        this.say('A ring of moths closes in!');
      } else if (ev.f === 'openRing') {
        // opening ring at 0.55 x the screen radius (~290 px): the first moth reaches the light in about two seconds
        const r0 = Math.max(this.R + 120, Math.hypot(this.viewHW, this.viewHH) * 0.55), a0 = this.rng.f() * TAU;
        for (let i = 0; i < ev.n; i++) { const a = a0 + i / ev.n * TAU; this.spawn('moth', p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0 * 0.8); }
      } else if (ev.f === 'hint') {
        this.hint(ev.text, ev.id);
      } else if (ev.f === 'stagFlee') {
        // the elite is still alive at 3:30: it bolts, and a golden moth brings the chest instead
        const e = this.elite;
        if (e && !e.dead) {
          e.st = 'flee'; e.tt = 0; e.dmg = 0; this.elite = null;
          const [x, y] = this.spawnPoint(-80);
          const m = this.spawn('lumen', x, y, 26 + this.time * 0.15); if (m) m.life = 0;
          this.lastLumen = this.time;
          this.say('The Stag bolts into the dark. A golden moth carries its chest!');
          this.sfx('roar', 0.8);
        }
      } else if (ev.f === 'treeRing') {
        for (let i = 0; i < ev.n; i++) { const a = i / ev.n * TAU; this.spawn('tree', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); }
        this.say('The trees close ranks.');
      } else if (ev.f === 'wolfPack') {
        const a0 = this.rng.f() * TAU;
        for (let i = 0; i < ev.n; i++) { const a = a0 + (i - ev.n / 2) * 0.12; this.spawn('wolf', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); }
        this.say('A wolf pack!'); this.sfx('dash');
      } else if (ev.f === 'chest') {
        // the teaching chest: always close, always one item
        const a = this.p.moving ? Math.atan2(this.p.vy, this.p.vx) : this.rng.f() * TAU;
        this.pickups.push({ kind: 'chest', x: p.x + Math.cos(a) * 170, y: p.y + Math.sin(a) * 170, t: 0, first: true });
        this.say('A chest glimmers nearby. Walk into it!');
      } else if (ev.f === 'lumen') {
        this.lastLumen = this.time;
        const [x, y] = this.spawnPoint(-80);
        const e = this.spawn('lumen', x, y, 26 + this.time * 0.15); if (e) e.life = 0;
        this.say('A golden moth! Catch it for a chest.');
      } else if (ev.f === 'elite') {
        // hp is a few seconds of TOTAL dps: only part of it lands on one target, and it must die to drop its chest
        const [x, y] = this.spawnPoint(0);
        this.elite = this.spawn('stag', x, y, Math.max(700, this.dpsEst * 4));
        this.shake = 10; this.sfx('roar', 1.4);   // the banner and its over-head label both say it carries a chest
      } else if (ev.f === 'boss') {
        const [x, y] = this.spawnPoint(-40);
        // hp is a budget of TOTAL dps, and only the share that reaches one target counts. At 26x a strong evolved build
        // still left it at 92% after the whole 30 s window (measured 2026-10-11), so the Witch was unreachable. 7x plus
        // the lantern burning it hot (updateEnemies) lets a good build that stands its ground kill it with seconds to spare.
        // Scaling by total dps punished the big AoE builds hardest (dps 5800 -> 40k hp, untouched), so the budget is capped:
        // 5,000 for a thin build up to 11,000 for a wide one. Engaged single-target damage runs 200-500/s by 4:30.
        this.boss = this.spawn('warden', x, y, Math.max(5000, Math.min(11000, this.dpsEst * 5)) * (this.moonless ? 1.2 : 1));
        if (this.boss) { this.boss.st = 'walk'; this.boss.tt = 2.5; }
        this.shake = 18; this.flash = 0.5; this.flashCol = '120,60,200'; this.sfx('roar');
        this.hint('The Warden fears your light. Stand your ground', null, 4.5);   // every run: the fight is winnable, and this is how
        this.cb.boss && this.cb.boss(this);
      }
    }
  }

  // ---------- enemies ----------
  updateEnemies(dt) {
    const p = this.p, A = this.E.a, n = this.E.n, t = this.time, s = this.s;
    const dmgScale = 0.85 + t / 600;
    const creepSp = 1 + 0.15 * this.creep;
    const dawnR = this.state === 'dawn' ? this.dawnK * 1600 : -1;
    for (let i = 0; i < n; i++) {
      const e = A[i]; if (e.dead) continue;
      e.t += dt; e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      if (dawnR >= 0) { if (d < dawnR) { this.kill(e, 'dawn', true); continue; } }
      // the lantern burns what it lights
      const lit = this.state !== 'dying' && this.inLight(e.x, e.y, e.r * 0.5);
      e.lit = lit;
      if (this.state === 'play') {
        let burn = 0;
        if (lit) { burn = s.burn * this.burnMul * dt * (e.type === 'warden' ? 3 : 1); if (this.lantern === 'green') { e.ign = 2.5; e.igDps = Math.max(e.igDps, s.burn * 0.6); } }   // the Warden fears the light most: it burns 3x in it
        if (e.ign > 0) { e.ign -= dt; if (!lit) burn += e.igDps * dt; }
        if (burn > 0) this.tickDmg(e, burn, this.lantern === 'green' && !lit ? 'ignite' : 'lantern');
        if (e.dead) continue;
        // burning reads at a glance: a couple of ember sparks a second rise off anything in the light
        if (lit && this.parts.n < 800 && this.rng.f() < dt * 2.4) this.emberSpark(e);
      }
      // movement
      let mx = 0, my = 0, sp = e.spd * creepSp;
      if (e.stun > 0) { e.stun -= dt; sp = 0; }
      if (e.slow > 0) sp *= 1 - e.slow;
      if (lit) sp *= e.mass >= 20 ? 0.88 : 0.7;   // shadows recoil from the light
      e.slow = 0;
      switch (e.type) {
        case 'moth': {
          const w = Math.sin(e.t * 4 + e.orb) * 0.8;
          mx = ux - uy * w; my = uy + ux * w; break;
        }
        case 'wolf': {
          e.cd -= dt;
          if (e.st === 'go') { mx = ux; my = uy; if (e.cd <= 0 && d < 210) { e.st = 'wind'; e.tt = 0.45; this.sfx('dash'); } }
          else if (e.st === 'wind') { e.tt -= dt; e.dx = ux; e.dy = uy; if (e.tt <= 0) { e.st = 'dash'; e.tt = 0.36; } }
          else if (e.st === 'dash') { e.tt -= dt; mx = e.dx; my = e.dy; sp *= 3.4; if (e.tt <= 0) { e.st = 'go'; e.cd = 3 + this.rng.f() * 1.6; } }
          break;
        }
        case 'tree': case 'brood': {
          mx = ux; my = uy;
          if (e.type === 'brood') { e.cd -= dt; if (e.cd <= 0 && this.state === 'play') { e.cd = 3.2; for (let k = 0; k < 3; k++) { const a = this.rng.f() * TAU; this.spawn('moth', e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26); } } }
          break;
        }
        case 'wraith': {
          // hover just beyond the edge of the light, then lunge through it
          const edge = (this.lantern === 'cone' ? this.R * 0.6 : this.R) + 50;
          if (e.st === 'go') {
            e.orb += dt * 0.6;
            const tx = p.x + Math.cos(e.orb) * edge, ty = p.y + Math.sin(e.orb) * edge;
            const ddx = tx - e.x, ddy = ty - e.y, dd = Math.hypot(ddx, ddy) || 1;
            mx = ddx / dd; my = ddy / dd; if (dd < 20) sp *= dd / 20;
            e.cd -= dt; if (e.cd <= 0 && d < edge + 60) { e.st = 'lunge'; e.tt = 0.8; e.dx = ux; e.dy = uy; }
          } else if (e.st === 'lunge') { e.tt -= dt; mx = e.dx; my = e.dy; sp *= 2.3; if (e.tt <= 0) { e.st = 'go'; e.cd = 2.5 + this.rng.f() * 2; e.orb = Math.atan2(e.y - p.y, e.x - p.x); } }
          break;
        }
        case 'lumen': {
          e.life += dt;
          // it drifts toward you, then flits away when you get close. A moth drawn by a READY evolution instead
          // hovers just outside the light so the reward is a step away, never a chase.
          const w = Math.sin(e.t * 3) * 0.9;
          if (e.keen) {
            const edge = this.R + 30;
            if (d > edge + 20) { mx = ux - uy * w * 0.6; my = uy + ux * w * 0.6; sp *= 0.8; }
            else { mx = -uy * 0.8 + ux * (d < edge - 20 ? -0.5 : 0); my = ux * 0.8 + uy * (d < edge - 20 ? -0.5 : 0); sp *= 0.6; }
          } else if (d < 200) { mx = -ux - uy * w; my = -uy + ux * w; sp *= 0.72; } else { mx = ux * 0.5 - uy * w; my = uy * 0.5 + ux * w; sp *= 0.6; }
          if (e.life > 30) { e.dead = true; continue; }
          break;
        }
        case 'stag': {
          e.cd -= dt;
          if (e.st === 'go') { mx = ux; my = uy; if (e.cd <= 0 && d < 420) { e.st = 'wind'; e.tt = 0.7; this.sfx('dash'); } }
          else if (e.st === 'wind') { e.tt -= dt; e.dx = ux; e.dy = uy; if (e.tt <= 0) { e.st = 'dash'; e.tt = 0.9; } }
          else if (e.st === 'dash') { e.tt -= dt; mx = e.dx; my = e.dy; sp *= 4.6; if (e.tt <= 0) { e.st = 'stand'; e.tt = 1.6; } }
          else if (e.st === 'stand') {
            // after the charge it closes in and stands its ground INSIDE the light, where the lantern and wisps can hurt it
            e.tt -= dt;
            if (d > this.R * 0.6) { mx = ux; my = uy; sp *= 1.3; } else sp = 0;
            if (e.tt <= 0) { e.st = 'go'; e.cd = 2.4; }
          } else if (e.st === 'flee') { mx = -ux; my = -uy; sp *= 2.4; if (d > 1500) { e.dead = true; continue; } }
          break;
        }
        case 'warden': { const r = this.bossAI(e, dt, ux, uy, d); mx = r[0]; my = r[1]; sp = r[2]; break; }
      }
      if (this.state === 'dying') sp *= 0.4;
      e.vx = mx * sp; e.vy = my * sp;
      e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
      const kd = Math.pow(0.002, dt); e.kx *= kd; e.ky *= kd;
      if (Math.abs(e.vx) > 5 && e.type !== 'lumen') e.face = e.vx > 0 ? 1 : -1; else if (e.type === 'lumen') e.face = e.vx > 0 ? 1 : -1;
      // separation (cheap, a few neighbours)
      if (e.mass < 20) {
        let c = 0;
        this.near(e.x, e.y, e.r, (o) => {
          if (o === e) return;
          const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy) || 0.01, ov = e.r + o.r - od;
          if (ov > 0) { const k = ov * 0.5 * (o.mass / (o.mass + e.mass)) * 1.6; e.x += ox / od * k; e.y += oy / od * k; }
          if (++c > 10) return false;
        });
      }
      // too far behind: wrap round in front, the way survivor games keep the pressure on
      const far = Math.hypot(this.viewHW, this.viewHH) * 1.7;
      if (d > far && e.type !== 'warden' && e.type !== 'stag') { e.x = p.x + ux * far * 0.62; e.y = p.y + uy * far * 0.62; }
      // contact damage
      if (this.state === 'play' && e.dmg > 0 && d < e.r + 9) this.contact(e, e.dmg * dmgScale);
    }
  }
  contact(e, dmg) {
    const p = this.p;
    if (p.inv > 0) return;
    // shield moths take the hit
    const ms = this.ws.moths || this.ws.lunar;
    if (ms && ms.list) {
      const m = ms.list.find((m) => m.alive);
      if (m) {
        m.alive = false; m.re = ms.re;
        this.hit(e, ms.dmg, ms.id, -(p.x - e.x), -(p.y - e.y), 300);
        this.burst(p.x + Math.cos(m.a) * 30, p.y + Math.sin(m.a) * 30, 14, '#e9e1ff', 160);
        this.sfx('block'); p.inv = 0.25; return;
      }
    }
    this.hurtBy = e.type;
    this.hurtPlayer(dmg);
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    e.kx += dx / d * 220 / e.mass; e.ky += dy / d * 220 / e.mass;
  }
  hurtPlayer(dmg) {
    const p = this.p;
    if (this.attract || this.god || p.inv > 0 || this.state !== 'play') return;
    const v = Math.max(1, dmg - this.s.armor);
    p.hp -= v; p.inv = 0.6; this.taken = this.taken || {}; const hb = this.hurtBy || 'other'; this.taken[hb] = (this.taken[hb] || 0) + v; this.hurtBy = null; p.hurtT = 0.35; this.damageTaken += v;
    this.shake = Math.max(this.shake, 7); this.sfx('hurt');
    this.num(p.x, p.y - 30, v, '#ff5a4a', 1.1);
  }
  bossAI(e, dt, ux, uy, d) {
    e.tt -= dt;
    const p = this.p;
    if (e.st === 'walk') {
      if (e.tt <= 0) {
        const opts = ['ring', 'grasp', 'charge'];
        if (this.time > 282 && !e.summoned) opts.push('summon');
        e.st = this.rng.pick(opts); e.tt = e.st === 'ring' ? 0.8 : e.st === 'charge' ? 0.7 : 0.3;
        if (e.st === 'grasp') { for (let k = 0; k < 3; k++) this.grasps.push({ x: p.x + (k ? this.rng.range(-90, 90) : 0), y: p.y + (k ? this.rng.range(-90, 90) : 0), r: 66, t: 0, fire: 1.0 + k * 0.25 }); this.sfx('warn'); }
        if (e.st === 'charge') this.sfx('dash');
      }
      return [ux, uy, e.spd];
    }
    if (e.st === 'ring') {
      if (e.tt <= 0) {
        const n = 18, off = this.rng.f() * TAU;
        for (let k = 0; k < n; k++) { const a = off + k / n * TAU; this.orb(e.x, e.y - 60, Math.cos(a) * 135, Math.sin(a) * 135); }
        if (!e.second) { e.second = true; e.tt = 0.45; } else { e.second = false; e.st = 'walk'; e.tt = 2.6; }
        this.sfx('pulse');
      }
      return [0, 0, 0];
    }
    if (e.st === 'grasp') { if (e.tt <= 0) { e.st = 'walk'; e.tt = 3; } return [ux, uy, e.spd * 0.5]; }
    if (e.st === 'charge') {
      if (e.tt > 0) { e.dx = ux; e.dy = uy; return [0, 0, 0]; }
      if (e.tt > -1.0) return [e.dx, e.dy, 290];
      e.st = 'walk'; e.tt = 2.4; return [ux, uy, e.spd];
    }
    if (e.st === 'summon') {
      e.summoned = true;
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; this.spawn('wraith', p.x + Math.cos(a) * (this.R + 90), p.y + Math.sin(a) * (this.R + 90)); }
      this.say('The Warden calls its wraiths!'); this.sfx('roar', 1.6);
      e.st = 'walk'; e.tt = 2.5; return [0, 0, 0];
    }
    e.st = 'walk'; return [ux, uy, e.spd];
  }
  orb(x, y, vx, vy) { const o = this.orbs.get(); if (!o) return; o.x = x; o.y = y; o.vx = vx; o.vy = vy; o.life = 7; o.r = 10; o.trail = o.trail || []; o.trail.length = 0; o.tt = 0; }

  // ---------- damage ----------
  tickDmg(e, v, src) {
    e.hp -= v; e.bacc += v; e.bt += v > 0 ? 1 / 60 : 0;
    this.dmgBy[src] = (this.dmgBy[src] || 0) + v; this.dpsAcc += v;
    if (e.bt > 0.7) { if (e.bacc >= 3 && this.nums.n < 50) this.num(e.x, e.y - e.r * 1.6, e.bacc, src === 'lantern' ? (this.lantern === 'green' ? '#a8ff8a' : '#ffcf7a') : '#ff9a4a', 0.75); e.bacc = 0; e.bt = 0; }
    if (e.hp <= 0) this.kill(e, src);
  }
  hit(e, dmg, src, kx = 0, ky = 0, kb = 0) {
    if (e.dead) return;
    let v = dmg * this.s.dmg, crit = false;
    if (this.rng.f() < this.s.crit) { v *= 2; crit = true; }
    e.hp -= v; e.flash = 0.09;
    this.dmgBy[src] = (this.dmgBy[src] || 0) + v; this.dpsAcc += v;
    if (kb && e.mass < 20) { const d = Math.hypot(kx, ky) || 1; e.kx += kx / d * kb / e.mass; e.ky += ky / d * kb / e.mass; }
    // crits always show; ordinary hits only while the screen is not already busy with numbers
    if (crit || this.nums.n < 36) this.num(e.x, e.y - e.r * 1.7, v, crit ? '#fff3a0' : '#ffb35a', crit ? 1.3 : 0.9);
    if (e.hp <= 0) this.kill(e, src);
  }
  kill(e, src, quiet) {
    if (e.dead) return;
    e.dead = true; this.kills++;
    const d = ENEMY[e.type];
    if (e.xp > 0 && src !== 'dawn') this.dropEmber(e.x, e.y, e.xp);
    if (this.kills === 1) this.hint('Walk over the embers it dropped', 'ember', 3);
    if (src === 'dawn' && e.xp > 0) this.embersGot += e.xp * 0.5;
    this.burst(e.x, e.y - e.r * 0.8, e.type === 'moth' ? 8 : 14, d.rim, 120 + e.r * 4);
    this.burst(e.x, e.y - e.r * 0.8, 5, '#ffb347', 90);
    if (!quiet) this.sfx('pop', e.type === 'moth' ? 1.2 : e.r > 20 ? 0.6 : 1);
    if (e.ign > 0 && (this.lantern === 'green' || src === 'wildfire')) {
      let c = 0;
      this.near(e.x, e.y, 80, (o) => { if (o !== e && o.ign <= 0) { o.ign = 3; o.igDps = Math.max(o.igDps, e.igDps); this.spark(o.x, o.y, '#8fff6a'); if (++c >= 2) return false; } });
    }
    if (e.type === 'lumen') { this.pickups.push({ kind: 'chest', x: e.x, y: e.y, t: 0 }); this.sfx('chest'); this.ring(e.x, e.y, 90, '#ffe27a'); }
    if (e.type === 'stag') { this.stagKilled = +this.time.toFixed(1); this.elite = null; this.pickups.push({ kind: 'chest', x: e.x, y: e.y, t: 0 }); this.hitstop = 0.15; this.shake = 14; this.sfx('big'); this.ring(e.x, e.y, 200, '#ffd27a'); this.say('The Grey Stag falls! It dropped a chest.'); }
    if (e.type === 'brood') { this.ring(e.x, e.y, 70, d.rim); }
    if (e.type === 'warden' && src !== 'dawn') { this.bossKilled = true; this.hitstop = 0.3; this.shake = 24; this.sfx('big'); this.achieve('wardenbane'); this.startDawn(); }
    if ((e.type === 'tree' || e.type === 'brood') && src !== 'dawn' && this.rng.f() < 0.012 * this.s.luck) this.pickups.push({ kind: 'chest', x: e.x, y: e.y, t: 0 });
    else if (src !== 'dawn' && this.rng.f() < 0.008 * this.s.luck) this.pickups.push({ kind: 'flask', x: e.x, y: e.y, t: 0 });
  }
  dropEmber(x, y, v) {
    let em = this.embers.get();
    if (!em) { let b = null, bd = 1e18; for (let k = 0; k < 8; k++) { const c = this.embers.a[(Math.random() * this.embers.n) | 0], dd = (c.x - x) ** 2 + (c.y - y) ** 2; if (dd < bd) { bd = dd; b = c; } } b.v += v; return; }
    em.x = x + (Math.random() - 0.5) * 6; em.y = y + (Math.random() - 0.5) * 6; em.v = v; em.mag = false; em.sp = 0; em.t = 0;
    em.vx = (Math.random() - 0.5) * 80; em.vy = -40 - Math.random() * 60;
  }
  num(x, y, v, col, size = 1) {
    const n = this.nums.get(); if (!n) return;
    n.x = x + (Math.random() - 0.5) * 10; n.y = y; n.v = Math.max(1, Math.round(v)); n.col = col; n.t = 0; n.size = size;
  }
  burst(x, y, n, col, sp) {
    for (let i = 0; i < n; i++) {
      const q = this.parts.get(); if (!q) return;
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.8);
      q.x = x; q.y = y; q.vx = Math.cos(a) * v; q.vy = Math.sin(a) * v - 30; q.life = q.max = 0.35 + Math.random() * 0.45; q.col = col; q.size = 1.5 + Math.random() * 2.5; q.kind = 0;
    }
  }
  spark(x, y, col) { this.burst(x, y, 3, col, 60); }
  // a single ember that drifts up off a burning enemy
  emberSpark(e) {
    const q = this.parts.get(); if (!q) return;
    q.x = e.x + (this.rng.f() - 0.5) * e.r * 1.4; q.y = e.y - e.r * (0.4 + this.rng.f());
    q.vx = (this.rng.f() - 0.5) * 30; q.vy = -50 - this.rng.f() * 50; q.life = q.max = 0.45 + this.rng.f() * 0.35;
    q.col = this.lantern === 'green' ? '#b8ff8a' : this.rng.f() < 0.5 ? '#ffb347' : '#ff7a2a'; q.size = 1.8 + this.rng.f() * 1.6; q.kind = 1;
  }
  ring(x, y, r, col, w = 6) { this.rings.push({ x, y, r: 0, max: r, t: 0, life: 0.45, col, w, vis: true }); }
  sfx(n, p) { if (!this.attract && this.cb.sfx) this.cb.sfx(n, p); }

  // ---------- weapons ----------
  wstate(id) { return this.ws[id] || (this.ws[id] = { t: 0.4, a: 0, id }); }
  updateWeapons(dt) {
    const p = this.p, s = this.s;
    for (const id of this.actives) {
      const st = this.wstate(id), evo = UP[id].kind === 'evo', base = evo ? UP[id].base : id;
      const Lv = evo ? null : UP[id].L[this.items[id] - 1];
      const idx = WEAPON_IDX[id];
      switch (base) {
        case 'flicker': {
          st.t -= dt;
          const cfg = evo ? { dmg: 70, cd: 2.0, reach: 1.9, n: 1 } : Lv;
          if (st.t <= 0) { st.t = cfg.cd * s.cd; this.pulse(id, cfg, evo); if (cfg.n > 1) st.echo = 0.28; }
          if (st.echo > 0) { st.echo -= dt; if (st.echo <= 0) this.pulse(id, cfg, evo); }
          break;
        }
        case 'beacon': {
          const cfg = evo ? { dps: 92, len: 380, half: 0.24, rot: 1.25, n: 3 } : Lv;
          st.a += cfg.rot * dt;
          st.beams = [];
          for (let k = 0; k < cfg.n; k++) {
            const a = st.a + k * TAU / cfg.n, len = cfg.len * s.area, half = cfg.half;
            st.beams.push({ a, len, half });
            this.near(p.x, p.y, len, (e) => {
              const ea = Math.atan2(e.y - p.y, e.x - p.x);
              if (Math.abs(angDiff(ea, a)) < half + e.r / (Math.hypot(e.x - p.x, e.y - p.y) + 1)) this.tickDmg(e, cfg.dps * s.dmg * dt, id);
            });
          }
          break;
        }
        case 'wisps': {
          const rings = evo ? [{ n: 4, r: 72, spd: 3.4, dmg: 32 }, { n: 4, r: 128, spd: -2.6, dmg: 32 }] : [{ n: Lv.n, r: Lv.r, spd: Lv.spd, dmg: Lv.dmg }];
          st.a += dt; st.pos = [];
          for (let ri = 0; ri < rings.length; ri++) {
            const R = rings[ri];
            for (let k = 0; k < R.n; k++) {
              const a = st.a * R.spd + k * TAU / R.n + ri * 0.4, rr = R.r * s.area;
              const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
              st.pos.push(x, y);
              this.near(x, y, evo ? 16 : 11, (e) => { if (e.hitT[idx] <= this.time) { e.hitT[idx] = this.time + 0.42; this.hit(e, R.dmg, id, e.x - p.x, e.y - p.y, 60); } });
            }
          }
          break;
        }
        case 'firefly': {
          st.t -= dt;
          if (evo) {
            if (st.t <= 0) {
              const tg = this.nearest(p.x, p.y, 540);
              if (tg) {
                st.t = 0.9 * s.cd;
                const a0 = Math.atan2(tg.y - p.y, tg.x - p.x), len = 580 * s.area;
                const cols = ['#ff7a7a', '#ffe27a', '#7ab8ff'];
                for (let k = -1; k <= 1; k++) {
                  const a = a0 + k * 0.17, ex = p.x + Math.cos(a) * len, ey = p.y + Math.sin(a) * len;
                  this.beams.push({ x: p.x, y: p.y - 16, x2: ex, y2: ey, t: 0, life: 0.3, col: cols[k + 1] });
                  this.lineHit(p.x, p.y, a, len, 44, id);
                }
                this.sfx('bolt');
              } else st.t = 0.2;
            }
          } else if (st.t <= 0) {
            const skip = new Set();
            let fired = 0;
            for (let k = 0; k < Lv.n; k++) {
              const tg = this.nearest(p.x, p.y, 470, skip) || (skip.size ? [...skip][k % skip.size] : null);
              if (!tg) break;
              skip.add(tg);
              const b = this.bolts.get(); if (!b) break;
              const a = Math.atan2(tg.y - p.y, tg.x - p.x) + (k - (Lv.n - 1) / 2) * 0.25, sp = 430 * s.proj;
              b.x = p.x; b.y = p.y - 16; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.tg = tg; b.dmg = Lv.dmg; b.pierce = Lv.pierce; b.life = 1.3; b.id = this.ringId++; b.src = id; b.trail = [];
              fired++;
            }
            st.t = fired ? Lv.cd * s.cd : 0.2;
            if (fired) this.sfx('bolt');
          }
          break;
        }
        case 'trail': {
          const cfg = evo ? { r: 33, life: 4.2, dps: 52 } : Lv;
          st.dist = (st.dist || 0) + Math.hypot(p.vx, p.vy) * dt;
          st.t -= dt;
          if (st.dist > 18 || st.t <= 0) {
            st.dist = 0; st.t = 0.5;
            this.zones.push({ kind: 'fire', x: p.x + (Math.random() - 0.5) * 6, y: p.y + (Math.random() - 0.5) * 4, r: cfg.r * s.area, life: cfg.life * s.dur, t: 0, dps: cfg.dps, src: id, ign: evo });
            let nf = 0; for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i].kind === 'fire' && ++nf > 70) { this.zones.splice(i, 1); }
          }
          break;
        }
        case 'runes': {
          st.t -= dt;
          const cfg = evo ? { r: 66, life: 3, dps: 50, cd: 2, n: 3 } : Lv;
          if (evo) {
            if (!st.big) { st.big = { kind: 'rune', x: p.x, y: p.y, r: 128 * s.area, life: 1e9, t: 0, dps: 46, slow: 0.5, src: id, follow: true }; this.zones.push(st.big); }
            st.big.r = 128 * s.area;
          }
          if (st.t <= 0) {
            st.t = cfg.cd * s.cd;
            for (let k = 0; k < cfg.n; k++) {
              let best = null, bc = -1;
              for (let tries = 0; tries < 7; tries++) {
                if (!this.E.n) break;
                const e = this.E.a[this.rng.int(this.E.n)];
                if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > 380) continue;
                let c = 0; this.near(e.x, e.y, 55, () => { c++; });
                if (c > bc) { bc = c; best = e; }
              }
              if (!best) { st.t = 0.3; break; }
              this.zones.push({ kind: 'rune', x: best.x, y: best.y, r: cfg.r * s.area, life: cfg.life * s.dur, t: 0, dps: cfg.dps, slow: 0.45, src: id, rot: Math.random() * TAU });
            }
          }
          break;
        }
        case 'thorns': {
          if (evo) {
            st.a += dt * 0.7; st.pos = [];
            const n = 12, r = 106 * s.area;
            for (let k = 0; k < n; k++) {
              const a = st.a + k * TAU / n, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
              st.pos.push(x, y);
              this.near(x, y, 17, (e) => { this.thornHit(e, x, y, 17, 70, id, idx); });
            }
          } else {
            st.t -= dt;
            if (st.t <= 0) {
              st.t = Lv.cd * s.cd;
              const r = Lv.r * s.area, a0 = Math.random() * TAU;
              for (let k = 0; k < Lv.n; k++) { const a = a0 + k * TAU / Lv.n; this.zones.push({ kind: 'thorn', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, r: 16, life: Lv.life * s.dur, t: 0, dmg: Lv.dmg, src: id, rot: a }); }
              this.sfx('thorn');
            }
          }
          break;
        }
        case 'moths': {
          const cfg = evo ? { n: 6, dmg: 42, re: 2 } : Lv;
          if (!st.list) st.list = [];
          while (st.list.length < cfg.n) st.list.push({ alive: true, re: 0, a: 0, sx: 0, sy: 0, k: 0, cd: Math.random() });
          st.dmg = cfg.dmg; st.re = cfg.re; st.a += dt * 2.4;
          st.list.forEach((m, k) => {
            m.a = st.a + k * TAU / st.list.length;
            if (!m.alive) { m.re -= dt; if (m.re <= 0) { m.alive = true; this.burst(p.x, p.y - 12, 6, '#e9e1ff', 60); } }
            m.ox = p.x + Math.cos(m.a) * 34; m.oy = p.y - 12 + Math.sin(m.a) * 22;
            if (evo && m.alive) {
              m.cd -= dt;
              if (m.cd <= 0) { const tg = this.nearest(m.ox, m.oy, 175); if (tg) { m.tg = tg; m.k = 0; m.cd = 0.6; } else m.cd = 0.2; }
              if (m.tg) {
                m.k += dt / 0.3;
                if (m.k >= 0.5 && !m.struck) { m.struck = true; if (!m.tg.dead) this.hit(m.tg, cfg.dmg, id, m.tg.x - p.x, m.tg.y - p.y, 80); }
                if (m.k >= 1) { m.tg = null; m.struck = false; }
              }
            }
            const kk = m.tg ? Math.sin(Math.min(1, m.k) * Math.PI) : 0;
            m.x = m.ox + (m.tg ? (m.tg.x - m.ox) * kk : 0); m.y = m.oy + (m.tg ? (m.tg.y - m.tg.r - m.oy) * kk : 0);
          });
          st.id = id;
          break;
        }
        case 'bell': {
          st.t -= dt;
          const cfg = evo ? { dmg: 120, r: 330, cd: 3.5, stun: 2 } : Lv;
          if (st.t <= 0) {
            st.t = cfg.cd * s.cd;
            const r = cfg.r * s.area;
            this.near(p.x, p.y, r, (e) => { this.hit(e, cfg.dmg, id, e.x - p.x, e.y - p.y, 90); if (!e.dead) e.stun = Math.max(e.stun, cfg.stun * s.dur * (e.type === 'warden' ? 0.25 : 1)); });
            this.rings.push({ x: p.x, y: p.y, r: 0, max: r, t: 0, life: 0.6, col: '#c9b8ff', w: 10, bell: true });
            if (evo) { for (let i = 0; i < this.embers.n; i++) this.embers.a[i].mag = true; }
            this.sfx('bell', evo ? 0.7 : 1);
          }
          break;
        }
      }
    }
    // the Shed's pilot wisp
    if (this.pilot) {
      const st = this.wstate('pilot'); st.a += dt * 2.6;
      const x = p.x + Math.cos(st.a) * 46, y = p.y - 8 + Math.sin(st.a) * 46;
      st.x = x; st.y = y;
      const idx = WEAPON_IDX.pilot;
      this.near(x, y, 9, (e) => { if (e.hitT[idx] <= this.time) { e.hitT[idx] = this.time + 0.5; this.hit(e, 4 + this.pilot * 4, 'pilot', e.x - p.x, e.y - p.y, 40); } });
    }
  }
  pulse(id, cfg, evo) {
    const p = this.p, max = Math.max(this.R, 120) * cfg.reach * this.s.area;
    this.rings.push({ x: p.x, y: p.y, r: 0, max, t: 0, life: 0.42, col: evo ? '#fff2b0' : '#ffd27a', w: evo ? 18 : 9, dmg: cfg.dmg, kb: evo ? 260 : 170, src: id, rid: this.ringId++, idx: WEAPON_IDX[id], light: true });
    this.sfx('pulse');
    if (evo) this.flash = Math.max(this.flash, 0.15), this.flashCol = '255,240,190';
  }
  lineHit(x, y, a, len, dmg, id) {
    const cx = Math.cos(a), cy = Math.sin(a);
    const A = this.E.a;
    for (let i = 0; i < this.E.n; i++) {
      const e = A[i]; if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, along = dx * cx + dy * cy;
      if (along < 0 || along > len) continue;
      const perp = Math.abs(dx * cy - dy * cx);
      if (perp < e.r + 8) this.hit(e, dmg, id, cx, cy, 50);
    }
  }
  thornHit(e, x, y, r, dmg, id, idx) {
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1, ov = r + e.r - d;
    if (ov > 0 && e.mass < 20) { e.x += dx / d * ov * 0.8; e.y += dy / d * ov * 0.8; }
    if (e.hitT[idx] <= this.time) { e.hitT[idx] = this.time + 0.5; this.hit(e, dmg, id, dx, dy, 120); }
  }

  updateZones(dt) {
    const p = this.p;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      if (z.follow) { z.x = p.x; z.y = p.y; }
      if (z.t >= z.life) { this.zones.splice(i, 1); continue; }
      if (this.state !== 'play') continue;
      if (z.kind === 'fire' || z.kind === 'rune') {
        const grow = Math.min(1, z.t / 0.15);
        this.near(z.x, z.y, z.r * grow, (e) => {
          this.tickDmg(e, z.dps * this.s.dmg * dt, z.src);
          if (z.slow) e.slow = Math.max(e.slow, z.slow);
          if (z.ign && !e.dead) { e.ign = 3; e.igDps = Math.max(e.igDps, 20); }
        });
      } else if (z.kind === 'thorn') {
        const idx = WEAPON_IDX.thorns;
        this.near(z.x, z.y, z.r, (e) => this.thornHit(e, z.x, z.y, z.r, z.dmg, z.src, idx));
      }
    }
    // the boss's grasping hands
    for (let i = this.grasps.length - 1; i >= 0; i--) {
      const g = this.grasps[i]; g.t += dt;
      if (g.t >= g.fire && !g.done) {
        g.done = true; this.sfx('slam'); this.shake = Math.max(this.shake, 9);
        this.burst(g.x, g.y, 18, '#9a7dff', 200);
        if (Math.hypot(p.x - g.x, p.y - g.y) < g.r) { this.hurtBy = 'warden'; this.hurtPlayer(24 * (1 + this.time / 600)); }
      }
      if (g.t > g.fire + 0.5) this.grasps.splice(i, 1);
    }
  }
  updateBolts(dt) {
    const B = this.bolts;
    for (let i = B.n - 1; i >= 0; i--) {
      const b = B.a[i];
      b.life -= dt;
      if (b.tg && !b.tg.dead) {
        const a = Math.atan2(b.tg.y - b.tg.r * 0.6 - b.y, b.tg.x - b.x), sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(a, cur), -9 * dt, 9 * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.trail.push(b.x, b.y); if (b.trail.length > 12) b.trail.splice(0, 2);
      let gone = b.life <= 0;
      if (!gone) {
        const idx = WEAPON_IDX[b.src];
        this.near(b.x, b.y + 8, 5, (e) => {
          if (e.hitT[idx] === b.id) return;
          e.hitT[idx] = b.id;
          this.hit(e, b.dmg, b.src, b.vx, b.vy, 70);
          if (--b.pierce < 0) { gone = true; return false; }
          b.tg = null;
        });
      }
      if (gone) { this.burst(b.x, b.y, 4, '#fff1a0', 70); B.kill(i); }
    }
  }
  updateOrbs(dt) {
    const O = this.orbs, p = this.p;
    const ms = this.ws.moths || this.ws.lunar;
    for (let i = O.n - 1; i >= 0; i--) {
      const o = O.a[i];
      o.life -= dt; o.x += o.vx * dt; o.y += o.vy * dt;
      o.tt += dt; if (o.tt > 0.04) { o.tt = 0; o.trail.unshift(o.x, o.y); if (o.trail.length > 8) o.trail.length = 8; }
      let gone = o.life <= 0 || this.state !== 'play';
      if (!gone && Math.hypot(o.x - p.x, o.y - (p.y - 14)) < o.r + 9) {
        const m = ms && ms.list && ms.list.find((m) => m.alive);
        if (m) { m.alive = false; m.re = ms.re; this.sfx('block'); }
        else { this.hurtBy = 'warden'; this.hurtPlayer(12 * (1 + this.time / 600)); }
        gone = true;
      }
      if (gone) { this.burst(o.x, o.y, 6, '#b49cff', 80); O.kill(i); }
    }
  }
  updateEmbers(dt) {
    const p = this.p, s = this.s, M = this.embers;
    const mag2 = s.magnet * s.magnet, R = this.lantern === 'cone' ? this.R * 0.9 : this.R;
    this.emberStreakT -= dt; if (this.emberStreakT <= 0) this.emberStreak = 0;
    for (let i = M.n - 1; i >= 0; i--) {
      const m = M.a[i];
      m.t += dt;
      if (m.t < 0.3) { m.x += m.vx * dt; m.y += m.vy * dt; m.vy += 300 * dt; m.vx *= 0.9; if (m.t + dt >= 0.3) { m.vx = 0; m.vy = 0; } continue; }
      const dx = p.x - m.x, dy = p.y - 10 - m.y, d2 = dx * dx + dy * dy;
      if (d2 < mag2 || this.state === 'dawn') m.mag = true;
      const d = Math.sqrt(d2) || 1;
      if (m.mag) { m.sp = Math.min(m.sp + 1600 * dt, 900); m.x += dx / d * m.sp * dt; m.y += dy / d * m.sp * dt; }
      else if (d < R * 1.15) { m.x += dx / d * 90 * dt; m.y += dy / d * 90 * dt; } // the light draws embers in
      if (d < 14 && this.state !== 'dying') {
        this.xp += m.v; this.embersGot += m.v;
        this.emberStreak++; this.emberStreakT = 0.6;
        this.sfx('ember', 1 + Math.min(this.emberStreak, 24) * 0.035);
        M.kill(i);
        this.checkLevel();
      }
    }
  }
  updatePickups() {
    const p = this.p;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.t += DT;
      if (this.state !== 'play') continue;
      if (Math.hypot(p.x - k.x, p.y - k.y) < 26) {
        this.pickups.splice(i, 1);
        if (k.kind === 'flask') { p.hp = Math.min(this.s.maxHp, p.hp + 30); this.sfx('heal'); this.num(p.x, p.y - 34, 30, '#7dff9a', 1.1); }
        else if (k.kind === 'chest') { this.chestsOpened++; this.chestRes = this.openChest(k.first); this.state = 'chest'; this.cb.chest && this.cb.chest(this, this.chestRes, k.first); }
      }
    }
  }
  updateFx(dt) {
    const P = this.parts;
    for (let i = P.n - 1; i >= 0; i--) { const q = P.a[i]; q.life -= dt; if (q.life <= 0) { P.kill(i); continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy = q.vy * 0.94 - 20 * dt; }
    const N = this.nums;
    for (let i = N.n - 1; i >= 0; i--) { const n = N.a[i]; n.t += dt; if (n.t > 0.7) N.kill(i); }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const k = Math.min(1, r.t / r.life), prev = r.r; r.r = r.max * (1 - Math.pow(1 - k, 2));
      if (r.dmg && this.state === 'play') {
        // damage the band the ring swept through this step
        this.near(r.x, r.y, r.r, (e) => {
          const d = Math.hypot(e.x - r.x, e.y - r.y);
          if (d + e.r >= prev && e.hitT[r.idx] !== r.rid) { e.hitT[r.idx] = r.rid; this.hit(e, r.dmg, r.src, e.x - r.x, e.y - r.y, r.kb); }
        });
      }
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; b.t += dt; if (b.t >= b.life) this.beams.splice(i, 1); }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }
  compact() { const E = this.E; for (let i = E.n - 1; i >= 0; i--) if (E.a[i].dead) E.kill(i); if (this.boss && this.boss.dead) this.bossDead = true; }

  // ---------- level-ups ----------
  canTake(id) {
    const d = UP[id], lv = this.items[id] || 0;
    if (this.banished.has(id)) return false;
    if (this.pool && !this.pool.includes(id)) return false;
    if (lv >= d.max) return false;
    if (d.kind === 'active') { if (this.items[d.evo]) return false; if (!lv && this.actives.length >= ACTIVE_SLOTS) return false; }
    if (d.kind === 'passive' && !lv && this.passives.length >= PASSIVE_SLOTS) return false;
    return true;
  }
  offer(prev) {
    // Weighted toward what you already own (the way Vampire Survivors converges a build): after level 3 an owned
    // weapon is 2.5x as likely as a new one, its partner charm 2x, and no 4th new weapon is offered while any owned
    // weapon is still below level 4. Target: a focused build evolves by ~2:45.
    const pool = [];
    const focus = this.level > 3;
    const partners = new Set(this.actives.map((a) => UP[a].with).filter(Boolean));
    const lowWeapon = this.actives.some((a) => UP[a].kind === 'active' && (this.items[a] || 0) < 4);
    const weapons = this.actives.filter((a) => UP[a].kind === 'active').length;
    for (const id of ACTIVES) {
      if (!this.canTake(id)) continue;
      if (this.items[id]) pool.push({ id, w: focus ? 7.5 : 3 });
      else if (weapons >= 3 && lowWeapon) continue;
      else pool.push({ id, w: this.actives.length < 3 ? 2.2 : 1.1 });
    }
    // a maxed weapon whose partner charm you do not own yet: that charm is offered almost every hand
    const wanted = new Set(this.actives.filter((a) => UP[a].kind === 'active' && (this.items[a] || 0) >= UP[a].max && !this.items[UP[a].with]).map((a) => UP[a].with));
    for (const id of PASSIVES) {
      if (!this.canTake(id)) continue;
      let w = this.items[id] ? 2 : (this.level < 4 ? 0.6 : 1);
      if (partners.has(id) && focus) w *= 2;
      if (wanted.has(id)) w = 9;
      pool.push({ id, w });
    }
    if (this.canTake('lantern')) pool.push({ id: 'lantern', w: 1.1 });
    let n = 3;
    if (this.rng.f() < (this.s.luck - 1) * 0.6) n = 4;
    const out = [];
    // onboarding: the first two offers always include two new weapons when possible
    if (this.level <= 3) {
      const news = pool.filter((c) => UP[c.id].kind === 'active' && !this.items[c.id]);
      this.rng.shuffle(news);
      for (const c of news.slice(0, 2)) { out.push(c.id); pool.splice(pool.indexOf(c), 1); }
    }
    // avoid showing the exact same hand after a reroll
    if (prev) for (const c of pool) if (prev.includes(c.id)) c.w *= 0.25;
    while (out.length < n && pool.length) {
      let sum = 0; for (const c of pool) sum += c.w;
      let u = this.rng.f() * sum, k = 0;
      for (; k < pool.length - 1; k++) { u -= pool[k].w; if (u <= 0) break; }
      out.push(pool[k].id); pool.splice(k, 1);
    }
    if (!out.length) out.push('lampoil', 'purse');
    this.rng.shuffle(out);
    return out.map((id) => ({ id, lv: (this.items[id] || 0) + 1 }));
  }
  take(id, silent) {
    const d = UP[id];
    if (d.kind === 'filler') {
      if (id === 'lampoil') { this.p.hp = Math.min(this.s.maxHp, this.p.hp + this.s.maxHp * 0.3); }
      if (id === 'purse') { this.embersGot += 30; }
      return;
    }
    const lv = (this.items[id] || 0) + 1;
    this.items[id] = lv;
    if (lv === 1 && d.kind === 'active') { this.actives.push(id); const st = this.wstate(id); st.t = 0.2; }
    if (lv === 1 && d.kind === 'passive') this.passives.push(id);
    this.recalc();
    if (this.actives.length >= ACTIVE_SLOTS) this.achieve('fullkit');
    if (!silent && !this.attract) { this.ring(this.p.x, this.p.y, 120, '#ffe6a0', 5); this.burst(this.p.x, this.p.y - 16, 24, '#ffd27a', 220); }
  }
  pickCard(id) {
    this.take(id);
    this.pendingLv = Math.max(0, this.pendingLv - 1);
    this.state = 'play';
  }
  banish(id) { this.banished.add(id); this.banishes--; }
  evolvable() {
    for (const a of this.actives) {
      const d = UP[a];
      if (d.kind !== 'active') continue;
      if ((this.items[a] || 0) >= d.max && (this.items[d.with] || 0) > 0 && (!this.pool || true)) return a;
    }
    return null;
  }
  openChest(first) {
    const ev = first ? null : this.evolvable();
    if (ev) {
      const evo = UP[ev].evo;
      this.actives[this.actives.indexOf(ev)] = evo;
      this.items[evo] = 1;
      const old = this.ws[ev]; delete this.ws[ev];
      if (old && old.big) { const i = this.zones.indexOf(old.big); if (i >= 0) this.zones.splice(i, 1); }
      this.evolutions++; (this.evoTimes = this.evoTimes || []).push(+this.time.toFixed(1));
      this.achieve('evolve1'); if (this.evolutions >= 2) this.achieve('twosuns');
      return [{ id: evo, evo: true, from: ev }];
    }
    let n = 1;
    if (!first) { const u = this.rng.f() / this.s.luck; n = u < 0.06 ? 5 : u < 0.3 ? 3 : 1; }
    const res = [];
    for (let k = 0; k < n; k++) {
      const can = [...this.actives, ...this.passives, 'lantern'].filter((id) => UP[id].kind !== 'evo' && (this.items[id] || 0) < UP[id].max && (!this.pool || this.pool.includes(id) || id === 'lantern'));
      // a first chest with an empty satchel gives a new weapon
      if (!can.length && this.actives.length < ACTIVE_SLOTS) { const nw = ACTIVES.filter((a) => this.canTake(a)); if (nw.length) can.push(this.rng.pick(nw)); }
      if (!can.length) { res.push({ id: 'purse' }); this.take('purse'); continue; }
      // chests lean toward the weapon you have invested in most, so a build converges instead of scattering
      const lead = can.filter((c) => UP[c].kind === 'active').sort((a, b) => (this.items[b] || 0) - (this.items[a] || 0))[0];
      const id = lead && (this.items[lead] || 0) >= 2 && this.rng.f() < 0.6 ? lead : this.rng.pick(can);
      this.take(id, true);
      res.push({ id, lv: this.items[id] });
    }
    return res;
  }
  closeChest() {
    const r = this.chestRes; this.chestRes = null; this.state = 'play';
    if (r && r[0] && r[0].evo) {
      this.slow = 0.8; this.flash = 0.9; this.flashCol = '255,236,170'; this.shake = 12;
      this.ring(this.p.x, this.p.y, 420, '#fff2b0', 22); this.burst(this.p.x, this.p.y - 16, 60, '#ffe27a', 420);
      this.say(UP[r[0].id].name.toUpperCase() + '!', true); this.sfx('evo');
    }
  }

  // ---------- endings ----------
  die() {
    if (this.state !== 'play') return;
    this.state = 'dying'; this.endT = 0; this.deathK = 0; this.dyingReal = 0; this.sfx('death'); this.shake = 12;
    // the beat: hitstop, slow motion, the flame pops out, the dark closes in; the result card lands ~1.4 s later
    this.hitstop = 0.35; this.slow = 0.6;
    this.burst(this.p.x + 9 * this.p.face, this.p.y - 6, 30, '#ffd27a', 260);
    this.burst(this.p.x + 9 * this.p.face, this.p.y - 6, 12, '#ff7a2a', 160);
    for (let i = 0; i < this.hints.length; i++) this.hints[i].life = 0;
    this.banner = null;
    this.cb.ending && this.cb.ending(this, false);
  }
  // what killed you, for the result card
  killer() {
    const t = this.taken || {}; let best = null, bv = 0;
    for (const k in t) if (t[k] > bv) { bv = t[k]; best = k; }
    if (!best) return null;
    const names = { moth: 'moths', wolf: 'wolves', tree: 'hollow trees', wraith: 'wraiths', brood: 'brood nests', stag: 'the Grey Stag', warden: 'the Night Warden', lumen: 'a golden moth', other: 'the dark' };
    return { who: names[best] || best, dmg: Math.round(bv) };
  }
  startDawn() {
    if (this.state !== 'play') return;
    this.state = 'dawn'; this.endT = 0; this.dawnK = 0; this.sfx('dawn'); this.flash = 0.6; this.flashCol = '255,210,150';
    for (let i = 0; i < this.orbs.n; i++) this.orbs.a[i].life = 0;
    this.grasps.length = 0;
    this.say(this.bossKilled ? 'The Warden falls. Dawn breaks early!' : 'DAWN', true);
    this.cb.ending && this.cb.ending(this, true);
  }
  finish(dawn) {
    this.over = true;
    const time = Math.min(RUN_LEN, this.time);
    const score = Math.round(this.kills * (1 + time / 60) * (dawn ? 2 : 1) * (this.bossKilled ? 1.5 : 1) * (this.moonless ? 1.5 : 1));
    const greed = 1 + (this.shed.greed || 0) * 0.08;
    const oil = Math.round((this.embersGot * 0.2 + (dawn ? 40 : 0) + (this.bossKilled ? 30 : 0)) * greed * (this.moonless ? 1.5 : 1));
    this.result = { dawn, time, kills: this.kills, level: this.level, embers: Math.round(this.embersGot), score, oil, bossKilled: this.bossKilled,
      char: this.charKey, map: this.mapKey, moonless: this.moonless, daily: this.daily, dmgBy: this.dmgBy, actives: [...this.actives], passives: [...this.passives], evolutions: this.evolutions, levelTimes: this.levelTimes,
      taken: this.taken || {}, killer: dawn ? null : this.killer() };
    this.state = 'over';
    this.cb.over && this.cb.over(this, this.result);
  }
}
