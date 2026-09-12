/* =====================================================================
   KICKBACK — the game
   =====================================================================
   Six floors of an unfinished tower over the harbour. You have a
   sawed-off with two shells in it, and the shells are your legs.

   Shoot down and you go up. Shoot up on the way down and you arrive hard
   enough to matter. Shoot into a wall and it throws you off it. The
   stairs exist for when you would rather keep the ammunition, and the
   whole game is that trade, made about forty times on the way to the
   roof.

   The people in the way have the same gun and get NONE of the kick. That
   asymmetry is the design: they out-shoot you, you out-manoeuvre them,
   and the moment you run dry you are just a man standing on a floor.
   ===================================================================== */
import {
  W, H, P, initCanvas, gfx, present, clear, rect, px, poly, circle,
  cam, toScreenX, toScreenY, toWorldX, toWorldY, PPM, snapCamera, rng, hash,
} from './pix.js';
import { drawCity, buildCity } from './city.js';
import { buildLevel, drawBackWall, drawStructure, drawCrate, L, HX, TOP, stairSpan } from './level2d.js';
import { B, SKINS, makeAnim, stepAnim, drawFigure } from './rig2d.js';

/* ---- the numbers that make it a game ------------------------------------- */
export const G = {
  gravity: 27, walk: 4.2, accel: 44, friction: 15, airAccel: 11, airDrag: 0.4,
  maxFall: 36, step: 0.44, halfW: 0.30, height: 1.26,
};
export const GUN = {
  shells: 2, kick: 10.8, wallBonus: 5.0, wallNear: 1.6,
  reload: 0.95, refire: 0.17, pellets: 7, spread: 0.13,
  range: 18, damage: 11, maxWound: 62, barrel: 0.30,
};

/* =====================================================================
   UPGRADES
   Every one of them modifies the ONE verb. There is no upgrade here that
   makes you shoot better without also changing how you move, because
   moving and shooting are the same button and an upgrade that only
   touched one of them would not be a choice.
   ===================================================================== */
export const UPGRADES = [
  {
    id: 'mag', name: 'MAGAZINE EXTENDER', max: 3,
    blurb: '+1 shell.\nMore climb, more fight,\nlonger to fill.',
    apply: (m) => { m.shells += 1; m.reload += 0.22; },
  },
  {
    id: 'saw', name: 'SHORTER BARREL', max: 2,
    blurb: 'Harder kick, wider spread.\nYou go further.\nYou hit less.',
    apply: (m) => { m.kick += 3.2; m.spread *= 1.34; m.barrel -= 0.075; m.range -= 3; },
  },
  {
    id: 'choke', name: 'CHOKE', max: 2,
    blurb: 'Tighter pattern,\nlonger reach.\nDuelling, not brawling.',
    apply: (m) => { m.spread *= 0.56; m.range += 5; },
  },
  {
    id: 'quick', name: 'QUICK HANDS', max: 2,
    blurb: 'Break it open\nand fill it\nhalf again as fast.',
    apply: (m) => { m.reload *= 0.64; m.refire *= 0.7; },
  },
  {
    id: 'slug', name: 'SLUG LOADS', max: 1,
    blurb: 'One ball, not seven.\nHits like a truck.\nNo forgiveness.',
    apply: (m) => { m.pellets = 2; m.damage *= 3.4; m.kick += 2.0; m.range += 6; m.spread *= 0.4; },
  },
  {
    id: 'brace', name: 'BRACED STOCK', max: 1,
    blurb: 'On your feet, the kick\nbarely moves you.\nIn the air it still does.',
    apply: (m) => { m.groundKick = 0.3; },
  },
  {
    id: 'feather', name: 'LIGHT BOOTS', max: 2,
    blurb: 'You fall slower.\nEvery shot carries\nyou further.',
    apply: (m) => { m.gravity *= 0.86; },
  },
  {
    id: 'twin', name: 'TWIN TRIGGER', max: 1,
    blurb: 'RIGHT CLICK fires both\nat once. Double the kick,\ndouble the hole.',
    apply: (m) => { m.twin = true; },
  },
];

export function rollMods(owned) {
  const m = {
    shells: GUN.shells, kick: GUN.kick, reload: GUN.reload, refire: GUN.refire,
    pellets: GUN.pellets, spread: GUN.spread, range: GUN.range, damage: GUN.damage,
    barrel: GUN.barrel, gravity: G.gravity, groundKick: 1, twin: false,
  };
  for (const id in owned)
    for (let i = 0; i < owned[id]; i++) UPGRADES.find((u) => u.id === id).apply(m);
  return m;
}

/* =====================================================================
   COLLISION — swept AABB, one axis at a time, against a list of boxes.
   The building is axis-aligned so this is exact, never tunnels at any
   speed, and stair climbing falls out of it: if a sideways move is
   blocked by something whose top is within a boot's height of your feet,
   you step onto it instead of stopping.
   ===================================================================== */
function sweep(e, dx, dy, solids) {
  const R = G.halfW, Ht = G.height;
  const hit = { x: false, ground: false, ceil: false, wall: 0 };
  if (dx) {
    e.x += dx;
    for (const b of solids) {
      if (b.noWalk) continue;
      if (e.y >= b.y1 - 0.001 || e.y + Ht <= b.y0 + 0.001) continue;
      if (e.x + R <= b.x0 || e.x - R >= b.x1) continue;
      if (b.y1 - e.y > 0 && b.y1 - e.y <= G.step) { e.y = b.y1; continue; }
      e.x = dx > 0 ? b.x0 - R : b.x1 + R;
      hit.x = true; hit.wall = dx > 0 ? 1 : -1;
    }
  }
  if (dy) {
    e.y += dy;
    for (const b of solids) {
      if (b.noWalk) continue;
      if (e.x + R <= b.x0 || e.x - R >= b.x1) continue;
      if (e.y >= b.y1 - 0.001 || e.y + Ht <= b.y0 + 0.001) continue;
      if (dy < 0) { e.y = b.y1; hit.ground = true; } else { e.y = b.y0 - Ht; hit.ceil = true; }
    }
  }
  return hit;
}
function onGround(e, solids) {
  for (const b of solids) {
    if (b.noWalk) continue;
    if (e.x + G.halfW <= b.x0 || e.x - G.halfW >= b.x1) continue;
    if (Math.abs(e.y - b.y1) < 0.07) return true;
  }
  return false;
}
/* a ray against the boxes. A ray that STARTS inside one hits it at zero,
   which is what makes a muzzle held against a wall register as a wall. */
export function rayBoxes(ox, oy, dx, dy, maxT, solids) {
  let best = maxT, hit = null;
  for (const b of solids) {
    let t0 = -1e9, t1 = 1e9, ok = true;
    for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) { ok = false; break; }
    }
    if (!ok) continue;
    if (t0 < 0 && t1 >= 0) t0 = 0;
    if (t0 >= 0 && t0 < best) { best = t0; hit = b; }
  }
  return hit ? { t: best, box: hit } : null;
}
/* and against a person, who is a capsule stood on end */
function rayActor(ox, oy, dx, dy, maxT, a) {
  const r = 0.34;
  /* slab test against the body box, fattened - exact enough at this size
     and it never misses a corner */
  const b = { x0: a.x - r, x1: a.x + r, y0: a.y + 0.05, y1: a.y + G.height };
  return rayBoxes(ox, oy, dx, dy, maxT, [b]);
}

/* =====================================================================
   EFFECTS — pooled boxes. At this resolution a coloured rectangle in the
   right place for four frames beats any particle system.
   ===================================================================== */
class FX {
  constructor() {
    this.bits = []; this.streaks = []; this.pops = [];
    for (let i = 0; i < 260; i++) this.bits.push({ t: 0 });
    for (let i = 0; i < 60; i++) this.streaks.push({ t: 0 });
    for (let i = 0; i < 24; i++) this.pops.push({ t: 0 });
    this.shake = 0;
  }
  bit(x, y, vx, vy, life, col, g) {
    const b = this.bits.find((q) => q.t <= 0);
    if (!b) return;
    Object.assign(b, { x, y, vx, vy, t: life, life, col, g: g === undefined ? 1 : g });
  }
  burst(x, y, n, spd, life, cols, g) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, s = spd * (0.3 + Math.random());
      this.bit(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random()),
        cols[(Math.random() * cols.length) | 0], g);
    }
  }
  streak(x0, y0, x1, y1, life) {
    const s = this.streaks.find((q) => q.t <= 0);
    if (!s) return;
    Object.assign(s, { x0, y0, x1, y1, t: life, life });
  }
  pop(x, y, r, life, col) {
    const p = this.pops.find((q) => q.t <= 0);
    if (!p) return;
    Object.assign(p, { x, y, r, t: life, life, col, star: 0, ang: 0 });
  }
  /* THE MUZZLE FLASH. Not a circle - a four-pointed star lying along the
     barrel, long on the axis and short across it, which is what a shotgun
     actually throws and what reads at four frames. */
  star(x, y, r, ang, life) {
    const p = this.pops.find((q) => q.t <= 0);
    if (!p) return;
    Object.assign(p, { x, y, r, t: life, life, col: P.hot, star: 1, ang });
  }
  update(dt) {
    for (const b of this.bits) {
      if (b.t <= 0) continue;
      b.t -= dt; b.vy -= 24 * b.g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    for (const s of this.streaks) if (s.t > 0) s.t -= dt;
    for (const p of this.pops) if (p.t > 0) p.t -= dt;
    this.shake = Math.max(0, this.shake - dt * 5);
  }
  draw() {
    const g = gfx();
    for (const s of this.streaks) {
      if (s.t <= 0) continue;
      g.strokeStyle = s.t / s.life > 0.5 ? P.hot : P.flame;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(toScreenX(s.x0), toScreenY(s.y0));
      g.lineTo(toScreenX(s.x1), toScreenY(s.y1));
      g.stroke();
    }
    for (const p of this.pops) {
      if (p.t <= 0) continue;
      const f = 1 - p.t / p.life;
      if (p.star) {
        const s = p.r * (1 - f * 0.55);
        const col = f < 0.35 ? P.hot : (f < 0.7 ? P.flame : P.gold);
        /* long on the barrel axis, short across it, plus a hot core */
        poly([[-s * 0.25, 0], [0, -s * 0.42], [s * 1.9, 0], [0, s * 0.42]], p.x, p.y, p.ang, col);
        poly([[0, -s * 0.9], [s * 0.5, 0], [0, s * 0.9], [-s * 0.5, 0]], p.x, p.y, p.ang, col);
        poly([[-s * 0.2, 0], [0, -s * 0.3], [s * 0.9, 0], [0, s * 0.3]], p.x, p.y, p.ang, P.white);
      } else {
        circle(p.x, p.y, p.r * (0.3 + f * 1.1), f < 0.45 ? P.hot : (f < 0.75 ? P.flame : P.rust3));
      }
    }
    for (const b of this.bits) {
      if (b.t <= 0) continue;
      const s = Math.max(1, Math.round((b.t / b.life) * 3));
      px(toScreenX(b.x) - (s >> 1), toScreenY(b.y) - (s >> 1), s, s, b.col);
    }
  }
}

/* =====================================================================
   PEOPLE
   ===================================================================== */
class Actor {
  constructor(x, y, pal) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.facing = 1; this.aim = 0; this.grounded = false; this.landed = false;
    this.hp = 100; this.alive = true; this.iframe = 0; this.flash = 0;
    this.shells = 2; this.reload = 0; this.refire = 0;
    this.an = makeAnim(); this.pal = pal; this.fired = false; this.dieT = 0;
  }
  muzzle() {
    /* computed from the aim, never read off the drawing - the drawing
       happens after the physics and would be a frame stale */
    return [this.x + Math.cos(this.aim) * B.muzzle, this.y + B.shoulder + Math.sin(this.aim) * B.muzzle];
  }
  hurt(d, kx, ky, world) {
    if (!this.alive || this.iframe > 0) return;
    this.iframe = 0.1;
    this.hp -= d; this.flash = 0.14;
    /* A hit knocks them out of whatever they were about to do. That is
       what makes shooting first win an exchange rather than merely deal
       damage, and it is the difference between a duel and a trade. */
    this.stagger = Math.max(this.stagger || 0, 0.34);
    /* and the whole world stops for a few frames, which is the oldest
       trick there is for making a hit land */
    world.freeze = Math.max(world.freeze || 0, this === world.player ? 0.075 : 0.05);
    this.vx += kx * 1.1; this.vy += Math.max(0, ky) * 0.6;
    world.fx.burst(this.x, this.y + 0.7, 5, 4, 0.3, [P.red, P.foe3], 1);
    if (this.hp <= 0 && this.alive) {
      this.alive = false; this.dieT = 0;
      world.fx.burst(this.x, this.y + 0.7, 16, 6, 0.6, [P.red, P.foe3, P.foe1], 1);
      world.fx.shake = Math.min(1.4, world.fx.shake + 0.4);
    }
  }
  physics(dt, solids, grav) {
    this.vy = Math.max(-G.maxFall, this.vy - (grav || G.gravity) * dt);
    const wasAir = !this.grounded;
    const h = sweep(this, this.vx * dt, this.vy * dt, solids);
    if (h.ground) this.vy = 0;
    if (h.ceil) this.vy = Math.min(0, this.vy);
    if (h.x) this.vx = 0;
    this.touchWall = h.wall;
    this.grounded = onGround(this, solids) && this.vy <= 0.01;
    this.landed = this.grounded && wasAir;
    this.floor = Math.max(0, Math.round(this.y / L.storey));
  }
  animate(dt) {
    stepAnim(this.an, {
      vx: this.vx, vy: this.vy, ax: this.ax || 0, grounded: this.grounded,
      landed: this.landed, fired: this.fired, aim: this.aim,
    }, dt);
    this.fired = false; this.landed = false;
    this.iframe = Math.max(0, this.iframe - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (!this.alive) this.dieT += dt;
  }
  draw(mods) {
    const g = gfx();
    if (this.flash > 0) g.globalAlpha = 0.999;
    const pal = this.flash > 0
      ? Object.assign({}, this.pal, { coat: P.white, coatLit: P.white, coatDark: P.pale, skin: P.white })
      : this.pal;
    if (!this.alive) {
      /* a body on the floor: the figure laid over, drawn once and left */
      const t = Math.min(1, this.dieT * 3);
      const s = { x: this.x, y: this.y + 0.02, facing: this.facing, aim: this.facing > 0 ? -0.15 : Math.PI + 0.15,
        vx: 0, vy: 0, grounded: true, shells: 0, gunLen: (mods && mods.barrel) || GUN.barrel };
      const an = this.an;
      an.land = 0.9 * t;
      drawFigure(s, an, Object.assign({}, pal, { coat: pal.coatDark, coatLit: pal.coat }));
      return;
    }
    drawFigure({
      x: this.x, y: this.y, facing: this.facing, aim: this.aim, vx: this.vx, vy: this.vy,
      ax: this.ax || 0, grounded: this.grounded, shells: this.shells,
      gunLen: (mods && mods.barrel) || GUN.barrel,
    }, this.an, pal);
    g.globalAlpha = 1;
  }
}

/* =====================================================================
   FIRING — one call does the flash, the pellets, the damage and the kick,
   and returns the impulse so the caller decides whether it is the sort of
   thing that gets pushed by it. The player is. The enemies are not.
   ===================================================================== */
export function fire(world, sh) {
  const m = sh.mods;
  const [ox, oy] = sh.shooter.muzzle();
  const aim = sh.aim;
  const fx = world.fx;
  fx.star(ox + Math.cos(aim) * 0.1, oy + Math.sin(aim) * 0.1, 0.38, aim, 0.085);
  for (let i = 0; i < 7; i++) {
    const a = aim + (Math.random() - 0.5) * 1.1;
    fx.bit(ox, oy, Math.cos(a) * 7, Math.sin(a) * 7, 0.16, i % 2 ? P.flame : P.bone, 0.4);
  }
  /* the spent shell, thrown out sideways and left on the floor */
  const side = Math.sin(aim + Math.PI / 2), up = -Math.cos(aim + Math.PI / 2);
  fx.bit(ox - Math.cos(aim) * 0.3, oy - Math.sin(aim) * 0.3,
    side * 3.5 + (Math.random() - 0.5), up * 3.5 + 3, 1.1, P.gold, 1);
  fx.shake = Math.min(1.5, fx.shake + (sh.shooter === world.player ? 0.7 : 0.25));

  let nearestWall = m.range;
  const wounds = new Map();
  for (let p = 0; p < m.pellets; p++) {
    const a = aim + (Math.random() - 0.5) * 2 * m.spread;
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = m.range, kind = null, victim = null;
    const hb = rayBoxes(ox, oy, dx, dy, t, world.solids);
    if (hb) { t = hb.t; kind = hb.box.kind; victim = hb.box; }
    for (const q of sh.targets) {
      if (!q.alive || q === sh.shooter) continue;
      const hc = rayActor(ox, oy, dx, dy, t, q);
      if (hc) { t = hc.t; kind = 'body'; victim = q; }
    }
    if (kind && kind !== 'body' && kind !== 'barrel') nearestWall = Math.min(nearestWall, t);
    const ex = ox + dx * t, ey = oy + dy * t;
    fx.streak(ox + dx * 0.3, oy + dy * 0.3, ex, ey, 0.06);
    if (kind === 'body') {
      const fall = Math.max(0.3, 1 - Math.max(0, t - m.range * 0.5) / (m.range * 0.5));
      const wv = wounds.get(victim) || { d: 0, kx: 0, ky: 0, n: 0 };
      wv.d += m.damage * fall; wv.kx += dx; wv.ky += dy; wv.n++;
      wounds.set(victim, wv);
    } else if (kind === 'barrel') {
      const bar = world.level.barrels.find((q) => q.solid === victim);
      if (bar && bar.alive) world.blow(bar);
    } else if (kind) {
      fx.burst(ex, ey, 3, 4.5, 0.22, [P.flame, P.bone, P.cret4], 1);
    }
  }
  for (const [v, wv] of wounds) {
    v.hurt(Math.min(m.maxWound || GUN.maxWound, wv.d), wv.kx / wv.n, wv.ky / wv.n, world);
  }
  let k = m.kick;
  if (nearestWall < GUN.wallNear) k += GUN.wallBonus * (1 - nearestWall / GUN.wallNear);
  return { ix: -Math.cos(aim) * k, iy: -Math.sin(aim) * k, wall: nearestWall };
}

/* the world owns one of these; the class stays private to this file */
export function makeFX() { return new FX(); }

/* ===================================================================== */
export class Player extends Actor {
  constructor(x, y) {
    super(x, y, SKINS.player);
    this.owned = {}; this.mods = rollMods({});
    this.shells = this.mods.shells;
    this.hp = 100;
  }
  regear() {
    this.mods = rollMods(this.owned);
    this.shells = Math.min(this.shells, this.mods.shells);
  }
  update(dt, IN, world) {
    if (!this.alive) { this.physics(dt, world.solids, this.mods.gravity); this.animate(dt); return; }
    this.refire = Math.max(0, this.refire - dt);
    this.aim = IN.aim;
    const fa = Math.cos(this.aim);
    if (Math.abs(fa) > 0.15) this.facing = fa > 0 ? 1 : -1;

    const wx = (IN.right ? 1 : 0) - (IN.left ? 1 : 0);
    const tx = wx * G.walk;
    const A = this.grounded ? G.accel : G.airAccel;
    this.ax = (tx - this.vx) * 20;
    /* Walking never fights the recoil: it can only push you up to walking
       pace, so a shot that threw you at fourteen metres a second stays
       thrown. That one rule is what stops the gimmick being cancelled by
       holding a direction. */
    if (Math.abs(this.vx) < G.walk || Math.sign(tx) !== Math.sign(this.vx))
      this.vx += (tx - this.vx) * Math.min(1, A * dt / G.walk);
    if (this.grounded && !wx) this.vx -= this.vx * Math.min(1, G.friction * dt);
    if (!this.grounded) this.vx -= this.vx * G.airDrag * dt;

    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) { this.shells = this.mods.shells; world.fx.bit(this.x, this.y + 0.9, 0, 2, 0.3, P.gold, 1); }
    } else if (IN.reload && this.shells < this.mods.shells) {
      this.reload = this.mods.reload;
    } else if (IN.fire && this.shells > 0 && this.refire <= 0) {
      this.shoot(world, 1);
    } else if (IN.fire2 && this.mods.twin && this.shells >= 2 && this.refire <= 0) {
      this.shoot(world, 2);
    }
    if (this.shells === 0 && this.reload <= 0) this.reload = this.mods.reload;

    this.physics(dt, world.solids, this.mods.gravity);
    if (this.y < -8) { this.hp = 0; this.alive = false; }
    this.animate(dt);
  }
  shoot(world, barrels) {
    for (let i = 0; i < barrels; i++) {
      const r = fire(world, { shooter: this, aim: this.aim, mods: this.mods, targets: world.enemies });
      const damp = this.grounded ? this.mods.groundKick : 1;
      this.vx += r.ix * damp;
      this.vy += r.iy * damp;
      this.lastWall = r.wall;
      this.shells--;
    }
    if (this.vy > 1) { this.y += 0.03; this.grounded = false; }
    this.refire = this.mods.refire;
    this.fired = true;
    if (this.shells === 0) this.reload = this.mods.reload;
  }
}

export class Enemy extends Actor {
  constructor(x, y, tier, kind) {
    super(x, y, kind === 'heavy' ? SKINS.heavy : SKINS.thug);
    this.hp = kind === 'heavy' ? 120 + tier * 14 : 58 + tier * 12;
    this.tier = tier; this.kind = kind;
    this.homeY = y;
    this.state = 'idle'; this.t = 0;
    this.lockAim = 0; this.stagger = 0;
    this.think = 0.3 + Math.random() * 0.6;
    this.dir = 0;
    this.mark = 0;
    /* the telegraph gets shorter as you climb, and that is the whole
       difficulty curve: floor one gives you three quarters of a second to
       be somewhere else, floor six gives you a third */
    this.tell = Math.max(0.30, 0.78 - tier * 0.085);
    this.mods = Object.assign({}, GUN, {
      gravity: G.gravity, groundKick: 0, spread: GUN.spread * (kind === 'heavy' ? 1.1 : 1.45),
      damage: kind === 'heavy' ? 12 : 9, pellets: 6, maxWound: kind === 'heavy' ? 46 : 38,
      barrel: GUN.barrel, range: GUN.range,
    });
  }
  sees(player, world) {
    const dx = player.x - this.x, dy = (player.y + 0.7) - (this.y + B.shoulder);
    const d = Math.hypot(dx, dy);
    if (d > this.mods.range) return 0;
    const hit = rayBoxes(this.x, this.y + B.shoulder, dx / d, dy / d, d - 0.4, world.solids);
    return hit ? 0 : d;
  }
  update(dt, world, player) {
    if (!this.alive) { this.physics(dt, world.solids); this.animate(dt); return; }
    this.t -= dt;
    this.stagger = Math.max(0, this.stagger - dt);
    this.mark = Math.max(0, this.mark - dt);
    this.refire = Math.max(0, this.refire - dt);

    const dx = player.x - this.x, dy = (player.y + 0.7) - (this.y + B.shoulder);
    const dist = Math.hypot(dx, dy);
    const onMyFloor = Math.abs(player.y - this.homeY) < L.storey * 0.9;
    const los = player.alive && onMyFloor ? this.sees(player, world) : 0;
    this.awake = !!los || (onMyFloor && dist < 12 && player.alive);

    /* ---- the aim ---------------------------------------------------------
       Free to swing while tracking, LOCKED once the telegraph starts. */
    if (this.state !== 'aim' && this.state !== 'shoot') {
      const want = Math.atan2(dy, dx);
      let d = want - this.aim;
      while (d > Math.PI) d -= 6.2832;
      while (d < -Math.PI) d += 6.2832;
      if (this.awake) this.aim += d * Math.min(1, (2.2 + this.tier * 0.7) * dt);
    }
    this.facing = Math.cos(this.aim) > 0 ? 1 : -1;

    /* ---- the state machine ------------------------------------------------ */
    if (this.stagger > 0) {
      /* knocked out of whatever it was doing */
      if (this.state === 'aim') world.releaseToken(this);
      this.state = 'stagger';
      this.dir = 0;
    } else if (this.state === 'stagger') {
      this.state = 'track'; this.t = 0.2;
    } else if (this.state === 'idle') {
      if (this.awake) { this.state = 'alert'; this.t = 0.3; this.mark = 0.6; }
    } else if (this.state === 'alert') {
      if (this.t <= 0) { this.state = 'track'; this.t = 0.25; }
    } else if (this.state === 'track') {
      if (!this.awake) { this.state = 'idle'; }
      else if (this.shells <= 0) { this.state = 'reload'; this.t = 2.0; this.dir = 0; }
      else if (this.t <= 0) {
        this.think -= dt;
        if (this.think <= 0) {
          this.think = 0.4 + Math.random() * 0.6;
          /* close if far, back off if you are on top of them, and always
             move toward getting a line rather than away from one */
          this.dir = !los ? Math.sign(dx)
            : (dist > 9 ? Math.sign(dx) : (dist < 3.5 ? -Math.sign(dx) : 0));
        }
        /* commit, if there is a line and the floor's turn is free */
        const lined = Math.abs(Math.atan2(dy, dx) - this.aim) < 0.16;
        if (los && lined && this.refire <= 0 && world.takeToken(this)) {
          this.state = 'aim';
          this.t = this.tell;
          this.lockAim = Math.atan2(dy, dx);
          this.mark = this.tell;
          this.dir = 0;
        }
      }
    } else if (this.state === 'aim') {
      /* the barrel drifts the last little way onto the locked angle and
         then stops dead - that stillness is the tell */
      let d = this.lockAim - this.aim;
      while (d > Math.PI) d -= 6.2832;
      while (d < -Math.PI) d += 6.2832;
      this.aim += d * Math.min(1, 14 * dt);
      if (this.t <= 0) {
        fire(world, { shooter: this, aim: this.lockAim, mods: this.mods, targets: [player] });
        /* AND NO IMPULSE. Same gun, same kick, bolted to the floor. */
        this.shells--;
        this.fired = true;
        this.refire = this.kind === 'heavy' ? 0.55 : 0.8;
        world.releaseToken(this);
        this.state = 'recover';
        this.t = 0.32;
      }
    } else if (this.state === 'recover') {
      if (this.t <= 0) { this.state = this.shells > 0 ? 'track' : 'reload'; this.t = this.shells > 0 ? 0.2 : 2.0; }
    } else if (this.state === 'reload') {
      this.mark = 0.2;
      if (this.t <= 0) { this.shells = 2; this.state = 'track'; this.t = 0.25; }
    }

    /* ---- moving ------------------------------------------------------------
       They keep off each other. Two men standing in the same place is one
       silhouette with two guns coming out of it, and you cannot read which
       of them is the one about to fire - which undoes the whole point of
       putting a mark over their heads. */
    for (const o of world.enemies) {
      if (o === this || !o.alive) continue;
      if (Math.abs(o.homeY - this.homeY) > 1) continue;
      const gap = this.x - o.x;
      if (Math.abs(gap) < 1.3) this.vx += (gap >= 0 ? 1 : -1) * 5.5 * dt;
    }
    const sp = (this.kind === 'heavy' ? 1.4 : 2.2) + this.tier * 0.14;
    const target = (this.state === 'track' && this.awake) ? this.dir * sp : 0;
    this.vx += (target - this.vx) * Math.min(1, 9 * dt);
    this.ax = (target - this.vx) * 18;
    this.physics(dt, world.solids);
    this.animate(dt);
  }
}

/* what the crosshair over a man's head is telling you */
export function enemyMark(e) {
  if (!e.alive || e.mark <= 0) return null;
  if (e.state === 'alert') return { kind: 'spot', t: e.mark };
  if (e.state === 'aim') return { kind: 'aim', t: e.mark, of: e.tell };
  if (e.state === 'reload') return { kind: 'load', t: e.mark };
  return null;
}
