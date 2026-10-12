// Core simulation: tanks, turns, projectiles, weapons, damage, bot.
import { W, H, THEME_KEYS } from './terrain.js';
import { WEAPONS, WEAPON_BY_ID, freshAmmo } from './weapons.js';

export const GRAV = 500;          // px/s^2
export const POWER_K = 9.8;       // speed per power point
export const WIND_K = 14;         // px/s^2 per wind unit
export const TURN_TIME = 30;
export const ROUNDS_TO_WIN = 3;
export const RANKS = [
  { id: 'rookie', name: 'Rookie', ang: 7, pow: 9, special: 0.25, think: 0.6 },
  { id: 'gunner', name: 'Gunner', ang: 3.8, pow: 5, special: 0.45, think: 0.5 },
  { id: 'ace', name: 'Ace', ang: 1.9, pow: 2.4, special: 0.6, think: 0.45 },
  { id: 'general', name: 'General', ang: 0.8, pow: 1.1, special: 0.75, think: 0.4 },
];
const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEP = 1 / 240;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Game {
  constructor(terrain, fx, sfx) {
    this.terrain = terrain; this.fx = fx; this.sfx = sfx;
    this.tanks = []; this.proj = []; this.fires = []; this.burns = [];
    this.phase = 'idle'; this.t = 0; this.timeScale = 1; this.slowT = 0; this.hitstop = 0;
    this.listeners = {};
    this.wind = 0; this.turn = 0; this.round = 0; this.score = [0, 0];
    this.mode = 'bot'; this.rank = 0;
  }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, a) { (this.listeners[ev] || []).forEach((f) => f(a)); }

  newMatch(mode = 'bot', rank = 0) {
    this.mode = mode; this.rank = rank; this.score = [0, 0]; this.round = 0;
    const names = mode !== 'pvp' ? ['YOU', RANKS[rank].name.toUpperCase()] : ['PLAYER 1', 'PLAYER 2'];
    this.tanks = [0, 1].map((i) => ({
      i, name: names[i], col: i === 0 ? '#3d8bff' : '#ff5a4a', col2: i === 0 ? '#2563c9' : '#c93a2e',
      isBot: (mode === 'bot' && i === 1) || mode === 'demo', ammo: freshAmmo(), weapon: 'shell', x: 0, y: 0, hp: 100, shownHp: 100,
      angle: i === 0 ? 50 : 130, power: 62, vy: 0, falling: false, fallFrom: 0, recoil: 0, tilt: 0, moves: 2, dead: false, moveT: 0, moveDir: 0, hurt: 0,
    }));
    this.stats = { shots: [0, 0], hits: [0, 0], dmg: [0, 0], best: [0, 0], direct: [0, 0] };
    this.startingSide = Math.random() < 0.5 ? 0 : 1;
    if (mode === 'bot') this.startingSide = 0;
    this.newRound();
  }
  newRound() {
    this.round++;
    const seed = (Math.random() * 1e9) | 0;
    const rng = mulberry(seed);
    this.themeKey = THEME_KEYS[(this.round - 1 + (seed & 3)) % THEME_KEYS.length];
    this.terrain.generate(rng, this.themeKey, !!this.compact);
    this.proj.length = 0; this.fires.length = 0; this.burns.length = 0; this.fx.clear(); this.lastImpact = null;
    this.tanks.forEach((tk, i) => {
      tk.x = this.terrain.pads[i]; tk.y = this.terrain.topAt(tk.x); tk.hp = 100; tk.shownHp = 100; tk.dead = false;
      tk.vy = 0; tk.falling = false; tk.moves = 2; tk.angle = i === 0 ? 50 : 130; tk.power = 62; tk.recoil = 0; tk.hurt = 0; tk.moveT = 0;
      if (!tk.ammo[tk.weapon]) tk.weapon = 'shell';
      this.updateTilt(tk);
    });
    this.turn = (this.startingSide + this.round - 1) % 2;
    this.bot = { err: 1, plan: null, think: 0 };
    this.roundWinner = -1;
    this.timeScale = 1; this.slowT = 0;
    this.beginTurn(true);
    this.emit('round', this.round);
  }
  beginTurn(first = false) {
    this.phase = 'aim';
    this.turnT = TURN_TIME;
    // wind: mostly gentle, sometimes strong
    const u = Math.random() * 2 - 1;
    this.wind = Math.round(u * Math.abs(u) * 10 + (Math.random() - 0.5) * 2);
    this.wind = clamp(this.wind, -10, 10);
    const tk = this.tanks[this.turn];
    if (tk.isBot) { this.bot.plan = null; this.bot.solver = null; this.bot.sol = undefined; this.bot.think = RANKS[this.rank].think; }
    this.emit('turn', { first });
  }
  get cur() { return this.tanks[this.turn]; }
  get other() { return this.tanks[1 - this.turn]; }

  // ------------------------------------------------------------ tanks
  updateTilt(tk) {
    const l = this.terrain.surfaceBelow(tk.x - 13, tk.y - 18), r = this.terrain.surfaceBelow(tk.x + 13, tk.y - 18);
    tk.tilt = clamp(Math.atan2(r - l, 26), -0.55, 0.55);
  }
  grounded(tk) {
    for (let dx = -12; dx <= 12; dx += 3) if (this.terrain.solid(tk.x + dx, tk.y + 1)) return true;
    return false;
  }
  stepTank(tk, dt) {
    if (tk.dead) return;
    // pop up if buried a little
    let n = 0;
    while (this.terrain.solid(tk.x, tk.y) && n < 30) { tk.y--; n++; }
    if (tk.moveT > 0) {
      tk.moveT -= dt;
      const nx = clamp(tk.x + tk.moveDir * 75 * dt, 18, W - 18);
      const ny = this.terrain.surfaceBelow(nx, tk.y - 10);
      if (ny >= tk.y - 9) { tk.x = nx; if (ny <= tk.y + 2) tk.y = ny; }
      else tk.moveT = 0; // wall
      if (Math.random() < 0.3) this.fx.dust(tk.x - tk.moveDir * 14, tk.y, 1);
    }
    if (!this.grounded(tk)) {
      if (!tk.falling) { tk.falling = true; tk.fallFrom = tk.y; tk.vy = 0; }
      tk.vy += GRAV * 1.6 * dt; tk.y += tk.vy * dt;
      if (tk.y > H - 8) tk.y = H - 8;
    } else if (tk.falling) {
      tk.falling = false;
      const d = tk.y - tk.fallFrom;
      if (d > 36) {
        const dmg = Math.min(25, Math.round((d - 36) * 0.2));
        if (dmg > 0) this.damage(tk, dmg, null, false);
        this.fx.dust(tk.x, tk.y, 12); this.fx.shake(4); this.sfx.thud();
      }
      tk.vy = 0;
    }
    this.updateTilt(tk);
    tk.recoil *= Math.pow(0.001, dt);
    tk.hurt = Math.max(0, tk.hurt - dt);
    tk.shownHp += (tk.hp - tk.shownHp) * Math.min(1, dt * 6);
  }
  move(dir) {
    const tk = this.cur;
    if (this.phase !== 'aim' || tk.moves <= 0 || tk.moveT > 0) return false;
    tk.moves--; tk.moveT = 0.7; tk.moveDir = dir; this.sfx.engine();
    return true;
  }
  pivot(tk) { return { x: tk.x + Math.sin(tk.tilt) * 17, y: tk.y - Math.cos(tk.tilt) * 17 }; }
  muzzlePos(tk, ang = tk.angle) {
    const p = this.pivot(tk), a = ang * Math.PI / 180;
    return { x: p.x + Math.cos(a) * 26, y: p.y - Math.sin(a) * 26 };
  }

  // ------------------------------------------------------------ firing
  setAim(angle, power) {
    const tk = this.cur;
    tk.angle = clamp(angle, 0, 180); tk.power = clamp(power, 5, 100);
  }
  selectWeapon(id) {
    const tk = this.cur;
    if (tk.ammo[id] > 0) { tk.weapon = id; return true; }
    return false;
  }
  cycleWeapon(d) {
    const tk = this.cur; let i = Math.max(0, WEAPONS.findIndex((w) => w.id === tk.weapon));
    for (let k = 0; k < WEAPONS.length; k++) { i = (i + d + WEAPONS.length) % WEAPONS.length; if (tk.ammo[WEAPONS[i].id] > 0) { tk.weapon = WEAPONS[i].id; return; } }
  }
  fire() {
    if (this.phase !== 'aim') return false;
    const tk = this.cur;
    if (!(tk.ammo[tk.weapon] > 0)) tk.weapon = 'shell';
    const w = WEAPON_BY_ID[tk.weapon];
    tk.ammo[w.id]--;
    if (!(tk.ammo[w.id] > 0)) tk.weapon = 'shell'; // spent the last one: back to the basic round for next turn
    const m = this.muzzlePos(tk), a = tk.angle * Math.PI / 180;
    const sp = tk.power * POWER_K * (w.id === 'sniper' ? 1.9 : 1);
    this.proj.push(this.makeProj(w, m.x, m.y, Math.cos(a) * sp, -Math.sin(a) * sp, tk.i, true));
    tk.recoil = 1;
    this.fx.muzzle(m.x, m.y, a); this.fx.shake(w.id === 'nuke' ? 8 : 4);
    this.sfx.fire(w.id === 'nuke' || w.id === 'big' ? 1.4 : 1);
    this.sfx.whistleStart();
    this.stats.shots[tk.i]++;
    this.phase = 'fly'; this.flyT = 0; this.shotHit = false; this.shotDmg = 0; this.lastBoomT = 0;
    if (!tk.isBot) this.lastHumanShot = { angle: tk.angle, power: tk.power };
    this.emit('fire', w);
    return true;
  }
  makeProj(w, x, y, vx, vy, owner, main = false, extra = {}) {
    return Object.assign({ w, x, y, vx, vy, owner, main, age: 0, mode: 'fly', bounces: 0, hops: 0, r: w.r, dmg: w.dmg, grav: w.id === 'sniper' ? 0.25 : 1, windK: w.id === 'sniper' ? 0 : 1, size: w.size || 5, trailT: 0, dead: false, apex: false }, extra);
  }

  // ------------------------------------------------------------ main update
  update(dt) {
    if (this.phase === 'idle') return;
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowT > 0 ? 0.3 : 1; }
    if (this.hitstop > 0) { this.hitstop -= dt; this.fx.update(dt * 0.3, this.wind, this.terrain); return; }
    const sdt = dt * this.timeScale;
    this.t += sdt;
    let left = sdt;
    while (left > 1e-6) { const h = Math.min(STEP, left); this.substep(h); left -= h; }
    this.fx.update(sdt, this.wind, this.terrain);
    this.phaseLogic(sdt);
  }
  substep(h) {
    for (const tk of this.tanks) this.stepTank(tk, h);
    for (const p of this.proj) if (!p.dead) this.stepProj(p, h);
    if (this.proj.some((p) => p.dead)) this.proj = this.proj.filter((p) => !p.dead);
    this.stepFires(h);
  }
  phaseLogic(dt) {
    if (this.phase === 'aim') {
      const tk = this.cur;
      if (tk.isBot) this.botThink(dt);
      else {
        this.turnT -= dt;
        if (this.turnT <= 0) this.fire();
      }
    } else if (this.phase === 'fly') {
      this.flyT += dt;
      const main = this.proj.find((p) => p.main) || this.proj[0];
      if (main) this.sfx.whistle(main.vy, H - main.y); else this.sfx.whistleStop();
      if (this.proj.length === 0 && this.fires.length === 0) { this.phase = 'settle'; this.settleT = 0; this.sfx.whistleStop(); }
      if (this.flyT > 14) { this.proj.length = 0; this.fires.length = 0; } // safety
    } else if (this.phase === 'settle') {
      this.settleT += dt;
      const moving = this.tanks.some((tk) => tk.falling);
      if (!moving && this.settleT > 0.55 && !this.fx.busy()) this.endTurn();
      if (this.settleT > 6) this.endTurn();
    } else if (this.phase === 'roundEnd') {
      this.endT -= dt;
      if (this.endT <= 0) {
        if (this.score[0] >= ROUNDS_TO_WIN || this.score[1] >= ROUNDS_TO_WIN) { this.phase = 'matchEnd'; this.emit('matchEnd', this.score[0] > this.score[1] ? 0 : 1); }
        else this.newRound();
      }
    }
  }
  endTurn() {
    const tk = this.cur;
    if (!this.shotHit && this.stats.shots[tk.i] > 0) { if (tk.isBot) this.bot.err *= 0.85; }
    else if (tk.isBot) this.bot.err *= 0.7;
    const dead = this.tanks.filter((t) => t.hp <= 0);
    if (dead.length) {
      this.phase = 'roundEnd'; this.endT = 2.6;
      if (dead.length === 2) this.roundWinner = -1;
      else { this.roundWinner = 1 - dead[0].i; this.score[this.roundWinner]++; }
      this.emit('roundEnd', this.roundWinner);
      return;
    }
    this.turn = 1 - this.turn;
    this.beginTurn();
  }

  // ------------------------------------------------------------ projectiles
  hitTank(p) {
    for (const tk of this.tanks) {
      if (tk.dead) continue;
      if (tk.i === p.owner && p.age < 0.25) continue;
      // hitScale = how much bigger the renderer draws tanks on small screens, so what you see is what you hit
      const k = this.hitScale || 1, dx = p.x - tk.x, dy = p.y - (tk.y - 9 * k);
      if (dx * dx + dy * dy < 19 * 19 * k * k) return tk;
    }
    return null;
  }
  stepProj(p, h) {
    p.age += h;
    const T = this.terrain;
    if (p.mode === 'fly') {
      const prevVy = p.vy;
      // exact for constant acceleration, so the aim preview / bot sim match at any step size
      const ax = this.wind * WIND_K * p.windK, ay = GRAV * p.grav;
      p.x += p.vx * h + 0.5 * ax * h * h; p.y += p.vy * h + 0.5 * ay * h * h;
      p.vx += ax * h; p.vy += ay * h;
      p.trailT -= h;
      if (p.trailT <= 0) { p.trailT = 0.018; this.fx.trail(p.x, p.y, p.w.id === 'napalm' || p.w.id === 'volcano' ? '#ff9a3c' : null); }
      if (p.w.id === 'mirv' && p.main && !p.apex && prevVy < 0 && p.vy >= 0) { this.splitMirv(p); return; }
      if (p.x < -400 || p.x > W + 400 || p.y > H + 50) {
        p.dead = true;
        if (p.main) this.fx.text(clamp(p.x, 60, W - 60), clamp(p.y, 120, H - 60), 'MISS', '#ffffff', 30);
        return;
      }
      const tk = this.hitTank(p);
      if (tk) { p.direct = tk; this.impact(p, true); return; }
      if (T.solid(p.x, p.y)) this.impact(p, false);
    } else if (p.mode === 'roll') {
      p.rollT += h;
      const nx = p.x + p.dir * p.speed * h;
      const ny = T.surfaceBelow(nx, p.y - 12);
      if (ny < p.y - 10 || nx < 2 || nx > W - 2) { this.explode(p.x, p.y - 4, p.r, p.dmg, p); p.dead = true; return; }
      const slope = (ny - p.y) / Math.max(0.001, Math.abs(nx - p.x));
      p.x = nx; p.y = Math.min(ny, H - 8);
      p.speed = clamp(p.speed + slope * 420 * h - 30 * h, 0, 380);
      p.spin = (p.spin || 0) + p.dir * p.speed * h / 6;
      if (Math.random() < 0.2) this.fx.dust(p.x, p.y, 1);
      const tk = this.hitTank(p);
      if (tk) { p.direct = tk; this.explode(p.x, p.y - 4, p.r, p.dmg, p); p.dead = true; return; }
      if ((p.speed < 12 && p.rollT > 0.35) || p.rollT > 4) { this.explode(p.x, p.y - 4, p.r, p.dmg, p); p.dead = true; }
    } else if (p.mode === 'dig') {
      p.digT += h;
      p.vy += GRAV * 0.15 * h;
      p.x += p.vx * h; p.y += p.vy * h;
      p.carveAcc += Math.hypot(p.vx, p.vy) * h;
      if (p.carveAcc > 4) { p.carveAcc = 0; T.carve(p.x, p.y, 10); if (Math.random() < 0.5) this.fx.dust(p.x, p.y, 1); }
      const tk = this.hitTank(p);
      if (tk) { p.direct = tk; this.explode(p.x, p.y, p.r, p.dmg, p); p.dead = true; return; }
      if (p.digT > 1.25 || p.y > H - 12 || p.x < 0 || p.x > W) { this.explode(p.x, p.y, p.r, p.dmg, p); p.dead = true; }
    }
  }
  splitMirv(p) {
    p.dead = true; p.apex = true;
    for (let k = -2; k <= 2; k++) this.proj.push(this.makeProj(p.w, p.x, p.y, p.vx + k * 70, p.vy + Math.abs(k) * 12, p.owner, k === 0, { apex: true }));
    this.fx.text(p.x, p.y - 20, 'SPLIT!', '#d6b4ff', 24, 0.8); this.sfx.pop(); this.fx.shake(3);
    for (let i = 0; i < 6; i++) this.fx.ember(p.x, p.y);
  }
  impact(p, onTank) {
    const id = p.w.id, T = this.terrain;
    // back up out of the ground a little for a nicer crater centre
    if (id === 'roller' && !onTank && p.main) {
      const n = T.normal(p.x, p.y);
      p.mode = 'roll'; p.rollT = 0;
      p.y = T.surfaceBelow(p.x, p.y - 20);
      const l = T.surfaceBelow(p.x - 6, p.y - 20), r = T.surfaceBelow(p.x + 6, p.y - 20);
      p.dir = l > r ? -1 : r > l ? 1 : Math.sign(p.vx) || 1;
      p.speed = Math.min(220, Math.abs(p.vx) * 0.5 + 60);
      if (Math.sign(p.vx) !== p.dir) p.speed = 60;
      void n; this.sfx.thud(); return;
    }
    if (id === 'digger' && !onTank && p.main) {
      const s = Math.hypot(p.vx, p.vy) || 1;
      p.mode = 'dig'; p.digT = 0; p.carveAcc = 0;
      p.vx = p.vx / s * 280; p.vy = p.vy / s * 280;
      this.sfx.drill(); return;
    }
    if (id === 'bouncer' && !onTank && p.bounces < 3) {
      p.bounces++;
      const n = T.normal(p.x, p.y);
      const dot = p.vx * n.x + p.vy * n.y;
      p.vx = (p.vx - 2 * dot * n.x) * 0.72; p.vy = (p.vy - 2 * dot * n.y) * 0.72;
      if (p.vy > -120) p.vy = Math.min(p.vy, -160);
      for (let k = 0; k < 20 && T.solid(p.x, p.y); k++) { p.x += n.x * 2; p.y += n.y * 2; }
      this.explode(p.x, p.y, 16, 6, p, true);
      this.sfx.pop(); return;
    }
    if (id === 'skipper' && !onTank && p.hops < 3) {
      p.hops++;
      this.explode(p.x, p.y, p.r, p.dmg, p);
      p.vy = -Math.max(260, Math.abs(p.vy) * 0.55); p.vx = p.vx * 0.85 + Math.sign(p.vx || 1) * 40;
      for (let k = 0; k < 30 && T.solid(p.x, p.y); k++) p.y -= 2;
      return;
    }
    p.dead = true;
    if (id === 'cluster' && p.main) {
      this.explode(p.x, p.y, p.r, p.dmg, p);
      for (let k = 0; k < 5; k++) this.proj.push(this.makeProj(p.w, p.x, p.y - 8, (k - 2) * 95 + rnd(-25, 25), rnd(-430, -330), p.owner, false, { r: 24, dmg: 10, size: 3.5 }));
      return;
    }
    if (id === 'volcano' && p.main) {
      this.explode(p.x, p.y, p.r, p.dmg, p);
      for (let k = 0; k < 9; k++) this.proj.push(this.makeProj(p.w, p.x, p.y - 10, rnd(-170, 170), rnd(-680, -420), p.owner, false, { r: 18, dmg: 8, size: 3.5 }));
      return;
    }
    if (id === 'napalm' && p.main) {
      this.explode(p.x, p.y, p.r, p.dmg, p);
      const burn = { dealt: [0, 0], cap: 42, acc: [0, 0] };
      this.burns.push(burn);
      for (let k = 0; k < 26; k++) {
        const fx = p.x + rnd(-30, 30);
        this.fires.push({ x: fx, y: T.surfaceBelow(fx, p.y - 40), life: rnd(2.6, 3.8), age: 0, burn, v: rnd(30, 70), dir: 0 });
      }
      this.sfx.sizzle(3);
      return;
    }
    if (id === 'sniper') {
      if (onTank) this.explode(p.x, p.y, p.r, p.w.direct, p);
      else this.explode(p.x, p.y, p.r, p.dmg, p);
      return;
    }
    this.explode(p.x, p.y, p.r, p.dmg, p);
  }
  stepFires(h) {
    const T = this.terrain;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.age += h;
      if (f.age >= f.life) { this.fires.splice(i, 1); continue; }
      // flow downhill
      const l = T.surfaceBelow(f.x - 3, f.y - 8), r = T.surfaceBelow(f.x + 3, f.y - 8);
      const dir = l > r + 0.5 ? -1 : r > l + 0.5 ? 1 : 0;
      if (dir) f.x += dir * f.v * h;
      f.y = Math.min(H - 8, T.surfaceBelow(f.x, f.y - 8));
      if (Math.random() < h * 6) this.fx.ember(f.x, f.y - 4);
      for (const tk of this.tanks) {
        if (tk.dead) continue;
        if (Math.abs(f.x - tk.x) < 20 && Math.abs(f.y - tk.y) < 24) {
          const b = f.burn;
          if (b.dealt[tk.i] >= b.cap) continue;
          b.acc[tk.i] += 1.4 * h * 3;
          if (b.acc[tk.i] >= 6) {
            const d = Math.min(6, b.cap - b.dealt[tk.i]);
            b.acc[tk.i] = 0; b.dealt[tk.i] += d;
            this.damage(tk, d, this.cur, false, true);
          }
        }
      }
    }
  }
  explode(x, y, r, dmg, p, small = false) {
    const T = this.terrain;
    T.carve(x, y, r);
    this.fx.explosion(x, y, r, T, this.wind);
    if (!small) this.sfx.boom(r); else this.sfx.pop();
    this.lastBoomT = this.t; this.lastImpact = { x, y };
    const shooter = p ? this.tanks[p.owner] : null;
    if (r >= 100) { this.slowT = Math.max(this.slowT, 0.5); this.fx.shake(34); }
    for (const tk of this.tanks) {
      if (tk.dead) continue;
      const cx = tk.x, cy = tk.y - 9;
      const d = Math.hypot(cx - x, cy - y);
      const direct = p && p.direct === tk;
      const reach = r + 16;
      if (d >= reach && !direct) continue;
      let f = direct ? 1 : clamp(1 - Math.max(0, d - 10) / (reach - 10), 0, 1);
      f = Math.pow(f, 0.8);
      const amt = Math.round(dmg * f);
      if (amt > 0) this.damage(tk, amt, shooter, direct);
    }
  }
  damage(tk, amt, shooter, direct, burn = false) {
    if (tk.dead) return;
    const before = tk.hp;
    tk.hp = Math.max(0, tk.hp - amt);
    tk.hurt = 0.35;
    const real = before - tk.hp;
    if (shooter && shooter.i !== tk.i) {
      this.stats.dmg[shooter.i] += real; this.shotDmg += real;
      if (!this.shotHit) this.stats.hits[shooter.i]++;
      this.shotHit = true;
      this.stats.best[shooter.i] = Math.max(this.stats.best[shooter.i], this.shotDmg);
      if (direct) this.stats.direct[shooter.i]++;
    }
    if (!burn) {
      this.hitstop = Math.max(this.hitstop, Math.min(0.14, 0.04 + amt * 0.002));
      this.fx.text(tk.x, tk.y - 50, '-' + real, shooter && shooter.i === tk.i ? '#ffd23f' : '#ffffff', 26 + Math.min(26, real * 0.5), 1.2, tk.y);
      if (direct) this.fx.text(tk.x, tk.y - 92, 'DIRECT HIT!', '#ffe14d', 34, 1.4, tk.y);
      else if (shooter && shooter.i === tk.i && real > 0) this.fx.text(tk.x, tk.y - 92, 'OOPS!', '#ffb0b0', 26, 1.2, tk.y);
      this.sfx.hit();
    } else this.fx.text(tk.x + rnd(-10, 10), tk.y - 40, '-' + real, '#ffb347', 18, 0.7);
    if (tk.hp <= 0 && before > 0) this.killTank(tk);
  }
  killTank(tk) {
    tk.dead = true;
    this.slowT = 1.1; this.hitstop = 0.18;
    this.fx.explosion(tk.x, tk.y - 10, 55, this.terrain, this.wind);
    this.terrain.carve(tk.x, tk.y - 4, 26);
    this.fx.text(tk.x, tk.y - 140, 'KO!', '#ff4d6d', 56, 2, tk.y);
    this.fx.shake(26);
    this.sfx.boom(90);
    this.emit('ko', tk.i);
  }

  // ------------------------------------------------------------ prediction (aim preview + bot)
  simulate(tk, angle, power, wid, maxT = 8, dtS = 1 / 60, target = null) {
    const w = WEAPON_BY_ID[wid] || WEAPON_BY_ID.shell;
    const m = this.muzzlePos(tk, angle), a = angle * Math.PI / 180;
    const sp = power * POWER_K * (w.id === 'sniper' ? 1.9 : 1);
    let x = m.x, y = m.y, vx = Math.cos(a) * sp, vy = -Math.sin(a) * sp;
    const grav = w.id === 'sniper' ? 0.25 : 1, wk = w.id === 'sniper' ? 0 : 1;
    const ax = this.wind * WIND_K * wk, ay = GRAV * grav;
    const pts = [];
    for (let t = 0; t < maxT; t += dtS) {
      // sub-sample the segment (exact constant-acceleration steps) so thin hills are not tunnelled through
      const n = Math.max(1, Math.ceil(Math.hypot(vx, vy) * dtS / 3)), hs = dtS / n;
      for (let k = 0; k < n; k++) {
        x += vx * hs + 0.5 * ax * hs * hs; y += vy * hs + 0.5 * ay * hs * hs; vx += ax * hs; vy += ay * hs;
        if (target) { const hk = this.hitScale || 1, dx = x - target.x, dy = y - (target.y - 9 * hk); if (dx * dx + dy * dy < 19 * 19 * hk * hk && t > 0.1) return { x, y, t, pts, hit: true }; }
        if (this.terrain.solid(x, y)) return { x, y, t, pts, hit: false };
        if (x < -400 || x > W + 400 || y > H + 50) return { x, y, t, pts, hit: false, lost: true };
      }
      pts.push(x, y);
    }
    return { x, y, t: maxT, pts, hit: false, lost: true };
  }
  preview(tk) {
    const w = tk.weapon === 'sniper' ? 0.8 : 0.42;
    return this.simulate(tk, tk.angle, tk.power, tk.weapon, w, 1 / 60).pts;
  }
  botSolve(tk, wid) { const it = this.botSolveGen(tk, wid); let r; do { r = it.next(); } while (!r.done); return r.value; }
  // generator: yields after each row so the bot can spread the search over frames
  *botSolveGen(tk, wid) {
    const tgt = this.tanks[1 - tk.i];
    let best = null;
    const dirSign = tgt.x > tk.x ? 1 : -1;
    for (let ang = 10; ang <= 85; ang += 2.5) {
      const angle = dirSign > 0 ? ang : 180 - ang;
      for (let pw = 20; pw <= 100; pw += 2.5) {
        const r = this.simulate(tk, angle, pw, wid, 6, 1 / 45, tgt);
        let d = r.hit ? 0 : Math.hypot(r.x - tgt.x, r.y - tgt.y);
        if (r.lost) d += 2000;
        // prefer lower flight times slightly (snappier turns)
        const score = d + r.t * 3;
        if (!best || score < best.score) best = { angle, power: pw, score, d };
      }
      yield null;
    }
    // refine around the best
    if (best) {
      const b0 = best;
      for (let da = -2.5; da <= 2.5; da += 0.5) { yield null; for (let dp = -2.5; dp <= 2.5; dp += 0.5) {
        const angle = b0.angle + da, pw = clamp(b0.power + dp, 5, 100);
        const r = this.simulate(tk, angle, pw, wid, 6, 1 / 90, tgt);
        let d = r.hit ? 0 : Math.hypot(r.x - tgt.x, r.y - tgt.y);
        if (r.lost) d += 2000;
        const score = d + r.t * 3;
        if (score < best.score) best = { angle, power: pw, score, d };
      } }
    }
    return best;
  }
  botPickWeapon(tk) {
    const R = RANKS[this.rank];
    const tgt = this.tanks[1 - tk.i];
    // digger and bouncer travel on after landing, so the landing-point solver cannot aim them
    const avail = WEAPONS.filter((w) => !['shell', 'digger', 'bouncer'].includes(w.id) && tk.ammo[w.id] > 0);
    if (!avail.length || Math.random() > R.special) return 'shell';
    // finishing blow: cheap weapon; big hp: heavy hitters
    let pool = avail;
    if (tgt.hp <= 30) pool = avail.filter((w) => ['big', 'sniper', 'roller', 'bouncer'].includes(w.id));
    else if (tgt.hp >= 70) pool = avail.filter((w) => ['nuke', 'big', 'mirv', 'cluster', 'napalm', 'volcano', 'roller'].includes(w.id));
    if (!pool.length) pool = avail;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
  botThink(dt) {
    const tk = this.cur, b = this.bot, R = RANKS[this.rank];
    if (!b.plan && !b.solver && b.sol === undefined) { tk.weapon = this.botPickWeapon(tk); b.solver = this.botSolveGen(tk, tk.weapon); b.sol = undefined; }
    if (b.solver) { // ~5 ms of search per frame
      const t0 = performance.now();
      while (performance.now() - t0 < 5) { const r = b.solver.next(); if (r.done) { b.sol = r.value; b.solver = null; break; } }
    }
    if (b.think > 0) { b.think -= dt; return; }
    if (b.solver) return;
    if (!b.plan) {
      const sol = b.sol || { angle: tk.x < W / 2 ? 50 : 130, power: 60 };
      const e = b.err;
      b.plan = { angle: clamp(sol.angle + gauss() * R.ang * e, 2, 178), power: clamp(sol.power + gauss() * R.pow * e, 10, 100), t: 0, a0: tk.angle, p0: tk.power };
      this.emit('botAim', b.plan);
    }
    const P = b.plan;
    P.t += dt;
    const u = clamp(P.t / 0.65, 0, 1), e = u * u * (3 - 2 * u);
    tk.angle = P.a0 + (P.angle - P.a0) * e; tk.power = P.p0 + (P.power - P.p0) * e;
    if (P.t > 0.9) this.fire();
  }
  focus() {
    const ps = this.proj;
    if (ps.length) { const m = ps.find((p) => p.main) || ps[0]; return { x: m.x, y: m.y }; }
    if (this.fires.length) return { x: this.fires[0].x, y: this.fires[0].y };
    if ((this.phase === 'settle' || this.phase === 'roundEnd') && this.lastImpact) return this.lastImpact;
    const tk = this.cur; return { x: tk.x, y: tk.y };
  }
}
