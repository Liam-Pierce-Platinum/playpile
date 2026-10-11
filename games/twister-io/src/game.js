// The round simulation: storms, lifting, debris rings, flings, stripping and
// absorbing, respawns, scoring. Fixed 60 Hz; no physics engine, just
// sphere-vs-grid-cell lifting and polar maths around each funnel.
import * as THREE from 'three';
import { World, S, canLift } from './world.js';
import { Funnel, funnelH, funnelR, SPR } from './fx.js';
import { think } from './bots.js';
import { PITCH, BLOCK, SLAB } from './town.js';
import { mulberry32 } from './rng.js';

export const TIER_MASS = [0, 12, 50, 170, 520, 1500, 4200];
export const ROUND_TIME = 120;
export const CHASE_LIMIT = 240;
export const CHASE_MEDALS = [100, 140, 190]; // gold, silver, bronze seconds
export const TIER_COLORS = ['#ffcc4d', '#3cc3b5', '#ff7a6b', '#5b8cff', '#ff7fb0', '#a05cff', '#ff4d2e'];
export const sizeOf = (m) => 1.15 * Math.pow(1 + m / 14, 0.4);
export const tierOf = (m) => { let t = 0; for (let i = 0; i < TIER_MASS.length; i++) if (m >= TIER_MASS[i]) t = i; return t; };
// One-word name for narrow leaderboards: the longest word, last on ties.
export const shortName = (n) => n.split(' ').reduce((a, w) => (w.replace(/\W/g, '').length >= a.replace(/\W/g, '').length ? w : a), '');

export const SKINS = [
  { id: 'classic', name: 'Classic', dust: '#e9e4da', skin: '#8fd3ff', spr: SPR.PUFF, pc: [1, 1, 1], stars: 0 },
  { id: 'fire', name: 'Fire-nado', dust: '#ffd08a', skin: '#ff4d2e', spr: SPR.EMBER, pc: [1, 0.85, 0.6], stars: 4 },
  { id: 'fish', name: 'Fish Storm', dust: '#d8f2ff', skin: '#2f7dd6', spr: SPR.FISH, pc: [1, 1, 1], stars: 10 },
  { id: 'candy', name: 'Candy Storm', dust: '#fff0f7', skin: '#ff6fb0', spr: SPR.CANDY, pc: [1, 1, 1], stars: 18 },
  { id: 'snow', name: 'Snow Storm', dust: '#ffffff', skin: '#9fdcff', spr: SPR.SNOW, pc: [1, 1, 1], stars: 28 },
  { id: 'galaxy', name: 'Galaxy Storm', dust: '#c9b8ff', skin: '#4a2a9a', spr: SPR.STAR, pc: [1, 0.95, 0.7], stars: 40 },
];
export const PERKS = [
  { id: 'suction', name: '+10% Suction', desc: 'Bigger pull radius, faster rips', stars: 0 },
  { id: 'debris', name: '+1 Starting Debris', desc: 'Start with a car in your ring', stars: 6 },
  { id: 'fling', name: 'Faster Fling', desc: 'Faster shots, shorter cooldown', stars: 15 },
];
const BOT_COLORS = ['#ff4d5e', '#ff9a3c', '#f2c200', '#2fc46a', '#1fb8dc', '#4e6cff', '#a05cff', '#ff5cc8', '#9b6a3a', '#56607a', '#00a37a', '#c0392b'];
const BOT_NAMES = ['Gusty', 'Twirlina', 'Mr. Whirl', 'Cyclonda', 'Zephyr', 'Big Bertha', 'Dustin', 'Swirly Shirley', 'Vortexx', 'Breezy B', 'Nado Nate', 'Typhoonie', 'Captain Gale', 'Hurricane Hank', 'Spinderella', 'Whirlwind Wu'];
const PERSONAS = ['greedy', 'hunter', 'coward', 'wanderer', 'greedy', 'hunter', 'wanderer', 'greedy', 'coward'];

const lighten = (hex, k) => { const c = new THREE.Color(hex); return '#' + c.lerp(new THREE.Color('#ffffff'), k).getHexString(); };

export class Game {
  constructor(scene, particles, sound) {
    this.scene = scene; this.fx = particles; this.snd = sound;
    this.world = null; this.storms = []; this.events = [];
    this.time = 0; this.stepN = 0; this.state = 'idle';
    this.wobbling = new Set(); this.moving = new Set();
    this.shake = 0; this.hitstop = 0;
  }
  // opt: { mode:'classic'|'daily'|'chase'|'attract', seed, skin, perk, botSkill, easy, sleepy }
  start(opt) {
    this.dispose();
    this.opt = opt;
    this.mode = opt.mode;
    const chase = opt.mode === 'chase';
    this.world = new World(this.scene, opt.seed, { N: chase ? 4 : 8, chase, easy: opt.easy });
    this.rnd = mulberry32(opt.seed * 7 + 1);
    this.time = 0; this.stepN = 0;
    this.timeLeft = chase ? CHASE_LIMIT : ROUND_TIME;
    this.state = 'play';
    this.events = []; this.wobbling.clear(); this.moving.clear();
    this.storms = [];
    this.origLeft = this.world.objs.length;
    const b = this.world.bounds;
    if (opt.mode !== 'attract') {
      const sk = SKINS.find((s) => s.id === opt.skin) || SKINS[0];
      this.player = this.addStorm({ name: 'YOU', isPlayer: true, dust: sk.dust, skin: sk.skin, skinDef: sk, perk: opt.perk });
    } else this.player = null;
    const nBots = chase ? 0 : 9;
    const names = [...BOT_NAMES];
    const pc = this.player ? new THREE.Color(this.player.color) : null;
    const cols = BOT_COLORS.filter((c) => { if (!pc) return true; const k = new THREE.Color(c); return Math.abs(k.r - pc.r) + Math.abs(k.g - pc.g) + Math.abs(k.b - pc.b) > 0.45; });
    for (let i = 0; i < nBots; i++) {
      const name = names.splice((this.rnd() * names.length) | 0, 1)[0];
      const col = cols[i % cols.length];
      const skill = opt.sleepy ? 0.08 : Math.max(0.08, Math.min(0.95, (opt.botSkill ?? 0.45) + (this.rnd() - 0.5) * 0.3));
      this.addStorm({ name, isPlayer: false, dust: lighten(col, 0.72), skin: col, pers: PERSONAS[i], skill, sleepy: !!opt.sleepy, skinDef: { spr: SPR.PUFF, pc: [1, 1, 1] } });
    }
    // spawn: the player on the town's pre-scored busy spot (see town.js), bots
    // spread out away from each other and from the player
    const spots = [];
    const tsp = this.world.town.spawn;
    for (const st of this.storms) {
      let best = null, bd = -1;
      if (st.isPlayer && (tsp || chase)) best = tsp ? [tsp.x, tsp.z] : [(this.rnd() - 0.5) * 10, (this.rnd() - 0.5) * 10];
      else for (let k = 0; k < 30; k++) {
        const x = b.minX + 20 + this.rnd() * (b.maxX - b.minX - 40);
        const z = Math.max(this.world.town.harbour ? this.world.town.waterZ + 8 : -1e9, b.minZ + 20 + this.rnd() * (b.maxZ - b.minZ - 40));
        let md = 1e9;
        for (const p of spots) md = Math.min(md, Math.hypot(p[0] - x, p[1] - z));
        if (md > bd) { bd = md; best = [x, z]; }
      }
      spots.push(best);
      st.x = best[0]; st.z = best[1];
    }
    if (this.player && opt.perk === 'debris') this.giftCar(this.player);
    // chase: the woods round the edge are scenery, not part of the 100%
    const t = this.world.town;
    if (chase) for (const o of this.world.objs) if (Math.abs(o.x) > t.edge + 1 || Math.abs(o.z) > t.edge + 1) { o.orig = false; o.decor = true; this.origLeft--; }
    this.chaseTotal = this.origLeft;
    // town life: people stroll (and run from storms), road cars drive their lane
    this.movers = [];
    for (const o of this.world.objs) {
      if (o.def.key.startsWith('person')) { o.walk = { hx: o.x, hz: o.z, a: o.rot, sp: 0.9 + this.rnd() * 0.6, t: this.rnd() * 3 }; this.movers.push(o); }
      else if (o.def.key.startsWith('car') && o.base === 0 && Math.abs(o.x) < t.edge && Math.abs(o.z) < t.edge && this.rnd() < 0.6) {
        const fx = Math.round(Math.cos(o.rot)), fz = Math.round(-Math.sin(o.rot));
        if (fx * fx + fz * fz === 1) { o.drive = { fx, fz, sp: 5 + this.rnd() * 3 }; this.movers.push(o); }
      }
    }
  }
  moveTown(dt) {
    const W = this.world, t = W.town;
    for (const o of this.movers) {
      if (o.state !== S.GROUND || o.rip > 0) continue;
      // nearest storm that is big enough to scare this thing
      let fx = 0, fz = 0, fear = 0;
      for (const st of this.storms) {
        if (st.dead) continue;
        const dx = o.x - st.x, dz = o.z - st.z, d = Math.hypot(dx, dz);
        const r = st.R + 7;
        if (d < r && d > 0.01) { const k = 1 - d / r; if (k > fear) { fear = k; fx = dx / d; fz = dz / d; } }
      }
      if (o.walk) {
        const w = o.walk;
        w.t -= dt;
        if (fear > 0) { w.a = Math.atan2(-fz, fx); }
        else if (w.t <= 0) { w.t = 1.5 + this.rnd() * 3; w.a = this.rnd() * Math.PI * 2; if (Math.hypot(o.x - w.hx, o.z - w.hz) > 3) w.a = Math.atan2(-(w.hz - o.z), w.hx - o.x); }
        const sp = fear > 0 ? 3.4 : w.sp;
        const nx = o.x + Math.cos(w.a) * sp * dt, nz = o.z - Math.sin(w.a) * sp * dt;
        if (Math.hypot(nx - w.hx, nz - w.hz) < (fear > 0 ? 7 : 3.5)) { o.x = nx; o.z = nz; }
        o.rot = w.a;
        o.rz = Math.sin(this.time * (fear > 0 ? 16 : 8) + o.id) * 0.08;
        o.y = o.base + Math.abs(Math.sin(this.time * (fear > 0 ? 16 : 8) + o.id)) * 0.08;
      } else if (o.drive) {
        const dv = o.drive;
        const sp = dv.sp * (1 + fear * 1.4);
        let nx = o.x + dv.fx * sp * dt, nz = o.z + dv.fz * sp * dt;
        const lim = t.edge - 3;
        let blocked = Math.abs(nx) > lim || Math.abs(nz) > lim;
        if (!blocked && t.stad) {
          const sx = (t.stad.i + 1) * 30 - t.half, sz = (t.stad.j + 1) * 30 - t.half;
          blocked = Math.abs(nx - sx) < 27 && Math.abs(nz - sz) < 27;
        }
        if (blocked) {
          // U-turn into the other lane
          dv.fx = -dv.fx; dv.fz = -dv.fz;
          const line = (v) => Math.round((v + t.half) / 30) * 30 - t.half;
          if (dv.fz === 0) o.z = 2 * line(o.z) - o.z; else o.x = 2 * line(o.x) - o.x;
          o.rot += Math.PI;
          continue;
        }
        o.x = nx; o.z = nz;
      }
      const c = W.cellOf(o.x, o.z);
      if (c !== o.cell) { W.gridRemove(o); W.gridAdd(o); }
      W.writeMatrix(o);
    }
  }
  addStorm(o) {
    const st = {
      id: this.storms.length, name: o.name, isPlayer: o.isPlayer, pers: o.pers || 'player', skill: o.skill ?? 1, sleepy: o.sleepy,
      color: o.skin, dust: o.dust, skinDef: o.skinDef, perk: o.perk || null,
      x: 0, z: 0, vx: 0, vz: 0, mass: 0, s: sizeOf(0), tier: 0, h: funnelH(sizeOf(0)), R: 2, ring: [], leanX: 0, leanZ: 0,
      dead: false, respawn: 0, inv: 1.5, kills: 0, deaths: 0, destroyed: 0, lifts: 0, best: null, flingCD: 0, dashing: false, stun: 0,
      flash: 0, flashT: 1 + Math.random() * 3, stripT: 0, stripN: 0, clashT: 0, hits: 0, cars: 0, cows: 0, peak: 0, liftedKeys: new Set(),
      threat: null, threatAt: -9, flyCol: new THREE.Color(o.skin).lerp(new THREE.Color('#ffffff'), 0.25).toArray(),
      steerX: 0, steerZ: 0, thr: 0, wantDash: false, wantFling: false, ai: { t: 0, tx: 0, tz: 0, wander: 0, target: null }, killer: null,
    };
    st.funnel = new Funnel(this.scene, st.dust, st.color, st.id * 13.7 + 1);
    this.storms.push(st);
    return st;
  }
  giftCar(st) {
    let best = null, bd = 1e9;
    for (const o of this.world.objs) if (o.def.tier === 2 && o.def.key.startsWith('car') && o.state === S.GROUND) { const d = Math.hypot(o.x - st.x, o.z - st.z); if (d < bd) { bd = d; best = o; } }
    if (best) { this.world.gridRemove(best); this.beginLift(best, st, true); }
  }
  dispose() {
    for (const st of this.storms) st.funnel.dispose(this.scene);
    this.storms = [];
    if (this.world) { this.world.dispose(); this.world = null; }
    this.fx.clear();
  }
  ripTime(o, st) {
    const diff = st.tier - o.def.tier;
    let t = o.def.tier === 6 ? 2.2 : diff < 0 ? 1.5 : [0.7, 0.36, 0.16, 0.08][Math.min(3, diff)];
    if (st.perk === 'suction') t *= 0.88;
    return t * (1 - 0.25 * this.catchUp(st)) * (1 + 0.6 * this.leadBrake(st));
  }
  suction(st) { return (st.s * 1.45 + 1.5) * (st.perk === 'suction' ? 1.1 : 1) * (1 + 0.15 * this.catchUp(st)); }
  // Catch-up (Hole.io keeps the leader within reach): a bot far below the
  // player's mass rips faster, pulls wider and gains more per lift. 0 at <=1.6x
  // behind, 1 at >=4x behind. Deterministic, so the Daily stays the same for all.
  catchUp(st) {
    const p = this.player;
    if (!p || st.isPlayer || this.mode === 'chase' || this.mode === 'attract') return 0;
    const r = p.mass / Math.max(4, st.mass);
    return Math.max(0, Math.min(1, (r - 1.6) / 2.4));
  }
  // Lead brake (the other half of the rubber band): a bot already well ahead of
  // the player rips slower and banks less per lift, so one runaway bot cannot
  // lap a normal human. 0 at <=1.15x the player's mass, full at >=2.5x, scaled
  // by opt.brake (stronger at low MMR and on the first round). Deterministic.
  leadBrake(st) {
    const p = this.player, k = this.opt && this.opt.brake;
    if (!p || !k || st.isPlayer || this.mode === 'chase' || this.mode === 'attract') return 0;
    const r = st.mass / Math.max(8, p.mass);
    return k * Math.max(0, Math.min(1, (r - 1.15) / 1.35));
  }
  ringCap(st) { return 6 + st.tier * 3; }

  step(dt) {
    if (this.state !== 'play') return;
    this.stepN++;
    this.time += dt;
    if (this.mode !== 'attract') this.timeLeft -= dt;
    const W = this.world;
    // ---- brains + movement ----
    for (const st of this.storms) {
      if (st.dead) {
        st.respawn -= dt;
        if (st.respawn <= 0) this.respawn(st);
        continue;
      }
      if (!st.isPlayer || this.autopilot) think(st, this, dt);
      st.flingCD -= dt; st.stun -= dt; st.inv -= dt; st.clashT -= dt;
      if (st.wantFling) { this.fling(st); st.wantFling = false; }
      const big = Math.min(1, (st.s - 1) / 10);
      let sp = 14.5 * (1 - 0.26 * big);
      const canDash = st.wantDash && st.mass > 6 && st.stun <= 0;
      if (canDash && !st.dashing && st.isPlayer) this.snd.dash();
      st.dashing = canDash;
      if (st.dashing) { sp *= 1.75; st.mass = Math.max(5, st.mass - (0.5 + st.mass * 0.03) * dt); }
      if (st.stun > 0) sp *= 0.45;
      const tx = st.steerX * st.thr * sp, tz = st.steerZ * st.thr * sp;
      const k = Math.min(1, dt * (st.dashing ? 9 : 6));
      st.vx += (tx - st.vx) * k; st.vz += (tz - st.vz) * k;
      st.x += st.vx * dt; st.z += st.vz * dt;
      const b = W.bounds;
      st.x = Math.max(b.minX, Math.min(b.maxX, st.x)); st.z = Math.max(b.minZ, Math.min(b.maxZ, st.z));
      // grow smoothly
      const sT = sizeOf(st.mass);
      st.s += (sT - st.s) * Math.min(1, dt * 2.5);
      st.h = funnelH(st.s);
      st.R = this.suction(st);
      const lx = -st.vx * 0.2 * (st.h / 10), lz = -st.vz * 0.2 * (st.h / 10);
      st.leanX += (lx - st.leanX) * Math.min(1, dt * 3); st.leanZ += (lz - st.leanZ) * Math.min(1, dt * 3);
      const nt = tierOf(st.mass);
      if (nt > st.tier) { st.tier = nt; this.events.push({ type: 'tier', st, tier: nt }); }
      st.peak = Math.max(st.peak, st.mass);
      // lightning in the bigger funnels
      st.flashT -= dt;
      if (st.flashT <= 0 && st.tier >= 3) { st.flash = 1; st.flashT = 0.6 + Math.random() * (5 - st.tier * 0.5); this.events.push({ type: 'zap', st }); this.bolt(st); }
      st.flash = Math.max(0, st.flash - dt * 5);
    }
    // ---- suction ----
    const sn = this.stepN;
    for (const st of this.storms) {
      if (st.dead) continue;
      const R = st.R;
      W.near(st.x, st.z, R + 2, (o) => {
        if (o.state !== S.GROUND || !canLift(o, st)) return;
        const dx = o.x - st.x, dz = o.z - st.z, d = Math.hypot(dx, dz);
        const reach = R + o.def.size * 0.5;
        if (d > reach) return;
        if (o.ripTouched === sn && o.ripBy !== st) return;
        o.ripBy = st; o.ripTouched = sn;
        o.rip += dt / (this.ripTime(o, st) * (0.6 + 0.4 * (d / reach)));
        if (o.rip > 0 && !this.wobbling.has(o)) { this.wobbling.add(o); if (o.def.tier >= 3 && st.isPlayer) this.snd.rip(); }
        if (o.rip >= 1) { this.wobbling.delete(o); W.gridRemove(o); this.beginLift(o, st); }
      });
    }
    for (const o of this.wobbling) {
      if (o.state !== S.GROUND) { this.wobbling.delete(o); continue; }
      if (o.ripTouched !== sn) {
        o.rip -= dt * 1.5;
        if (o.rip <= 0) { o.rip = 0; o.rx = o.rz = 0; o.peel = 0; o.sy = 1; W.writeMatrix(o); this.wobbling.delete(o); }
      }
    }
    // ---- storm vs storm ----
    const P = this.player;
    if (P && !P.dead) {
      // threat: a clearly bigger storm close enough that it is about to drag us in
      let th = null, thd = 1e9;
      for (const o of this.storms) {
        if (o === P || o.dead) continue;
        const d = Math.hypot(o.x - P.x, o.z - P.z), reach = (P.s + o.s) * 0.75 + 0.8 + 5 + o.s;
        if (o.mass > P.mass * 1.1 + 2 && d < reach && d < thd) { th = o; thd = d; }
      }
      if (th && !P.threat && P.inv <= 0 && this.time - (P.threatAt || -9) > 4) { P.threatAt = this.time; this.events.push({ type: 'threat', st: P, by: th }); }
      P.threat = th;
    }
    for (let i = 0; i < this.storms.length; i++) {
      const A = this.storms[i];
      if (A.dead) continue;
      for (let j = i + 1; j < this.storms.length; j++) {
        const B = this.storms[j];
        if (B.dead) continue;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 0.01;
        const touch = (A.s + B.s) * 0.75 + 0.8;
        if (d > touch) continue;
        const nx = dx / d, nz = dz / d;
        let big = null, small = null;
        if (A.mass > B.mass * 1.1 + 2) { big = A; small = B; } else if (B.mass > A.mass * 1.1 + 2) { big = B; small = A; }
        if (!big) {
          // evenly matched: bounce apart, each sheds a piece
          const push = (touch - d) * 4 + 4;
          A.vx -= nx * push * dt * 8; A.vz -= nz * push * dt * 8; B.vx += nx * push * dt * 8; B.vz += nz * push * dt * 8;
          if (A.clashT <= 0 && B.clashT <= 0) {
            A.clashT = B.clashT = 0.6;
            for (const st of [A, B]) if (st.ring.length) this.knock(st, st.ring[st.ring.length - 1], (st === A ? -1 : 1) * nx, (st === A ? -1 : 1) * nz);
            this.burst((A.x + B.x) / 2, 2, (A.z + B.z) / 2, 10, SPR.PUFF, [1, 1, 1], 6);
            if (A.isPlayer || B.isPlayer) { this.shake = Math.max(this.shake, 0.4); this.snd.hit(); }
          }
          continue;
        }
        if (small.inv > 0) continue;
        // the smaller storm is dragged in and stripped
        const sgn = small === A ? 1 : -1;
        small.vx += nx * sgn * 9 * dt; small.vz += nz * sgn * 9 * dt;
        small.stripT -= dt;
        if (small.stripT <= 0) {
          small.stripT = 0.13;
          if (small.ring.length) {
            const o = small.ring.pop();
            small.mass = Math.max(0, small.mass - o.def.mass);
            // every other piece is stolen; the rest land near the victim so a
            // storm that escapes can pick its armour back up (Slither-style comeback)
            small.stripN = (small.stripN || 0) + 1;
            if (small.stripN % 2) this.beginLift(o, big, false, true);
            else { o.owner = small; this.drop(o, -nx * sgn * 10, -nz * sgn * 10); }
            if (small.isPlayer) this.shake = Math.max(this.shake, 0.25);
          } else this.absorb(small, big);
        }
      }
    }
    // ---- town life (every other step) ----
    if (this.stepN % 2 === 0) this.moveTown(dt * 2);
    // ---- moving objects ----
    for (const o of this.moving) this.updateObj(o, dt);
    // ---- ambient particles ----
    if (this.stepN % 2 === 0) for (const st of this.storms) if (!st.dead) this.ambient(st);
    // ---- end conditions ----
    if (this.mode === 'chase') {
      if (this.origLeft <= 0 || this.timeLeft <= 0) this.finish();
    } else if (this.mode !== 'attract' && this.timeLeft <= 0) this.finish();
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  beginLift(o, st, gift = false, stolen = false) {
    o.state = S.LIFT; o.owner = st; o.t = 0;
    const dx = o.x - st.x, dz = o.z - st.z;
    o.r0 = Math.max(0.3, Math.hypot(dx, dz)); o.ang = Math.atan2(dz, dx); o.y0 = o.y; o.sc0 = o.sc;
    o.dur = (stolen ? 0.35 : 0.5) + o.def.tier * 0.07;
    o.spx = (Math.random() - 0.5) * 6; o.spz = (Math.random() - 0.5) * 6; o.spy = (Math.random() - 0.5) * 4;
    o.rh = 0.18 + Math.random() * 0.55; o.rj = Math.random();
    o.stolen = stolen;
    o.rip = 0; o.peel = Math.max(o.peel, 0.3);
    this.moving.add(o);
    if (o.orig) { o.orig = false; this.origLeft--; o.firstBy = st; }
    if (!stolen && !gift) {
      // a puff of dust where it tore free
      this.burst(o.x, o.base + 0.4, o.z, 3 + o.def.tier * 2, SPR.PUFF, [0.95, 0.92, 0.85], 2 + o.def.tier);
      if (o.def.key === 'tree' || o.def.key === 'pine' || o.def.key === 'bush') this.burst(o.x, 2, o.z, 6, SPR.LEAF, [1, 1, 1], 5, 0.8);
    }
  }
  debrisScale(o, st) { return Math.min(1, (st.s * 0.62) / Math.max(0.5, o.def.size)); }
  ringPos(o, st, out) {
    const f = o.rh;
    const r = funnelR(st.s, f) * 1.18 + o.def.size * this.debrisScale(o, st) * 0.5 + 0.4 + o.rj * 0.6;
    out.x = st.x + Math.cos(o.ang) * r + st.leanX * f * f;
    out.z = st.z + Math.sin(o.ang) * r + st.leanZ * f * f;
    out.y = f * st.h;
    return r;
  }
  updateObj(o, dt) {
    const W = this.world;
    const st = o.owner;
    if (o.state === S.LIFT || o.state === S.RING) {
      if (!st || st.dead) { this.drop(o, 0, 0); return; }
      const omega = 2.8 - Math.min(1.4, st.s * 0.09);
      if (o.state === S.LIFT) {
        o.t += dt / o.dur;
        const e = Math.min(1, o.t), ee = e * e * (3 - 2 * e);
        o.ang += dt * (omega + 5 * (1 - e));
        const tgt = _v;
        const rr = this.ringPos(o, st, tgt);
        const r = o.r0 + (rr - o.r0) * ee;
        o.x = st.x + Math.cos(o.ang) * r + st.leanX * o.rh * o.rh * ee;
        o.z = st.z + Math.sin(o.ang) * r + st.leanZ * o.rh * o.rh * ee;
        o.y = o.y0 + (tgt.y - o.y0) * ee + Math.sin(e * Math.PI) * 1.5;
        o.sc = o.sc0 + (this.debrisScale(o, st) - o.sc0) * ee;
        o.rx += o.spx * dt * e; o.rz += o.spz * dt * e; o.rot += o.spy * dt;
        o.peel = Math.min(1, o.peel + dt * 3);
        o.sy = 1;
        if (o.t >= 1) this.arrive(o, st);
      } else {
        o.ang += dt * omega;
        this.ringPos(o, st, _v);
        o.x = _v.x; o.z = _v.z; o.y = _v.y + Math.sin(this.time * 2 + o.rj * 6) * 0.3;
        o.sc += (this.debrisScale(o, st) - o.sc) * Math.min(1, dt * 2);
        o.rx += o.spx * dt * 0.35; o.rz += o.spz * dt * 0.35; o.rot += o.spy * dt * 0.5;
      }
    } else if (o.state === S.EAT) {
      o.t += dt / 0.5;
      const e = Math.min(1, o.t);
      o.ang += dt * 6;
      const r = funnelR(st.s, 0.9) * (1 - e * 0.8);
      o.x = st.x + Math.cos(o.ang) * r + st.leanX; o.z = st.z + Math.sin(o.ang) * r + st.leanZ;
      o.y += dt * st.h * 0.7;
      o.sc *= Math.exp(-dt * 5);
      o.rx += o.spx * dt; o.rz += o.spz * dt;
      if (o.t >= 1) { o.state = S.GONE; this.moving.delete(o); }
    } else if (o.state === S.FLY) {
      o.life -= dt;
      const tg = o.target;
      if (tg && !tg.dead) {
        const dx = tg.x - o.x, dz = tg.z - o.z, d = Math.hypot(dx, dz) || 1;
        const sp = Math.hypot(o.vx, o.vz);
        const turn = Math.min(1, dt * 3.2);
        o.vx += ((dx / d) * sp - o.vx) * turn; o.vz += ((dz / d) * sp - o.vz) * turn;
      }
      o.x += o.vx * dt; o.z += o.vz * dt;
      o.y += (2.4 + o.def.size * 0.3 - o.y) * Math.min(1, dt * 6);
      o.rx += 14 * dt; o.rot += 9 * dt;
      // a flung piece is never a speck: scale it up so it reads at >= 1.6 units
      o.sc = Math.max(o.sc, Math.min(3.2, 1.6 / Math.max(0.3, o.def.size)));
      // ribbon trail: a dark underlay (so it reads on pale slabs and grass alike)
      // with the thrower's colour on top, plus a bright head spark
      const col = o.from.flyCol;
      for (let k = 0; k < 3; k++) {
        const f = k / 3, tx = o.x - o.vx * dt * f, tz = o.z - o.vz * dt * f;
        this.fx.emit(tx, o.y + 0.1, tz, 0, 0.6, 0, { life: 0.5, size: 3.0, size1: 0.6, alpha: 0.55, spr: SPR.PUFF, color: [0.15, 0.19, 0.27] });
        this.fx.emit(tx, o.y + 0.3, tz, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, { life: 0.45, size: 2.2, size1: 0.3, alpha: 0.95, spr: SPR.PUFF, color: col });
      }
      this.fx.emit(o.x, o.y + 0.3, o.z, 0, 0, 0, { life: 0.12, size: 2.8, size1: 1.2, alpha: 1, spr: SPR.STAR, color: [1, 1, 0.85] });
      if (o.from.isPlayer && o.from.skinDef && this.stepN % 2 === 0) this.fx.emit(o.x, o.y, o.z, (Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3, { life: 0.5, size: 1.0, alpha: 0.95, spr: o.from.skinDef.spr, color: o.from.skinDef.pc });
      for (const t of this.storms) {
        if (t === o.from || t.dead) continue;
        if (Math.hypot(t.x - o.x, t.z - o.z) < t.s * 1.0 + 1.6 + o.def.size * 0.3 * o.sc) { this.hit(o, t); return; }
      }
      if (o.life <= 0) this.drop(o, o.vx * 0.3, o.vz * 0.3);
    } else if (o.state === S.FALL) {
      o.vy -= 32 * dt;
      o.x += o.vx * dt; o.z += o.vz * dt; o.y += o.vy * dt;
      o.rx += o.spx * dt; o.rz += o.spz * dt;
      o.sc += (1 - o.sc) * Math.min(1, dt * 4);
      const base = this.baseAt(o);
      if (o.y <= base && o.vy < 0) this.land(o, base);
    }
    W.writeMatrix(o);
  }
  arrive(o, st) {
    if (!o.stolen) {
      st.mass += o.def.mass * (1 + 0.6 * this.catchUp(st)) * (1 - 0.5 * this.leadBrake(st)); st.lifts++;
      if (o.firstBy === st && !o.counted) { st.destroyed += o.def.mass; o.counted = true; }
    } else st.mass += o.def.mass;
    o.stolen = false;
    if (!st.best || o.def.tier > st.best.tier || (o.def.tier === st.best.tier && o.def.mass > st.best.mass)) st.best = o.def;
    if (o.def.key.startsWith('car')) st.cars++;
    if (o.def.key === 'cow') st.cows++;
    st.liftedKeys.add(o.def.key);
    this.events.push({ type: 'lift', st, def: o.def });
    if (st.ring.length < this.ringCap(st)) { o.state = S.RING; st.ring.push(o); }
    else { o.state = S.EAT; o.t = 0; }
  }
  baseAt(o) {
    const t = this.world.town;
    if (t.harbour && o.z < t.waterZ) {
      if (t.light && Math.abs(o.x - t.light.x) < 3.5 && o.z < t.waterZ && o.z > t.light.z - 3.5 && (Math.abs(o.x - t.light.x) < 1.6 || o.z < t.light.z + 3.5)) return SLAB;
      return o.def.water ? -0.12 : -3;
    }
    const lx = o.x + t.half, lz = o.z + t.half;
    const i = Math.floor(lx / PITCH), j = Math.floor(lz / PITCH);
    if (i < 0 || j < 0 || i >= t.N || j >= t.N) return t.harbour && o.z < t.waterZ + 4 ? SLAB : 0;
    const fx = lx - i * PITCH - PITCH / 2, fz = lz - j * PITCH - PITCH / 2;
    if (t.zone[i][j] === 'stadium') return SLAB;
    return Math.abs(fx) < BLOCK / 2 && Math.abs(fz) < BLOCK / 2 ? SLAB : 0;
  }
  land(o, base) {
    if (base < -1) { // splash into the sea
      this.burst(o.x, 0.2, o.z, 8, SPR.PUFF, [0.75, 0.92, 1], 6, 0.6);
      o.state = S.GONE; o.sc = 0; this.moving.delete(o); this.world.writeMatrix(o);
      return;
    }
    o.y = o.base = base; o.state = S.GROUND; o.rx = o.rz = 0; o.sc = 1; o.peel = 0; o.sy = 1; o.owner = null; o.rip = 0;
    this.moving.delete(o);
    this.world.gridAdd(o);
    this.world.writeMatrix(o);
    this.burst(o.x, base + 0.3, o.z, 3 + o.def.tier, SPR.PUFF, [0.95, 0.92, 0.85], 3, 0.6);
  }
  drop(o, vx, vz) {
    const st = o.owner;
    if (st) { const i = st.ring.indexOf(o); if (i >= 0) st.ring.splice(i, 1); }
    o.state = S.FALL; o.owner = null;
    o.vx = vx + (Math.random() - 0.5) * 6; o.vz = vz + (Math.random() - 0.5) * 6; o.vy = 6 + Math.random() * 6;
    o.spx = (Math.random() - 0.5) * 8; o.spz = (Math.random() - 0.5) * 8;
    this.moving.add(o);
  }
  knock(st, o, nx, nz) {
    const i = st.ring.indexOf(o);
    if (i >= 0) st.ring.splice(i, 1);
    st.mass = Math.max(0, st.mass - o.def.mass);
    o.owner = st;
    this.drop(o, nx * 14, nz * 14);
  }
  fling(st) {
    if (st.dead || st.flingCD > 0 || !st.ring.length) { if (st.isPlayer && !st.ring.length) this.events.push({ type: 'empty', st }); return false; }
    // throw the heaviest piece we can afford (<= 12% of our mass) so the shot
    // is big enough to see and hits hard; fall back to the lightest piece
    const cap = Math.max(2, st.mass * 0.12);
    let oi = -1, om = -1, li = 0, lm = 1e9;
    for (let i = 0; i < st.ring.length; i++) {
      const m = st.ring[i].def.mass;
      if (m <= cap && m > om) { om = m; oi = i; }
      if (m < lm) { lm = m; li = i; }
    }
    const o = st.ring.splice(oi >= 0 ? oi : li, 1)[0];
    st.mass = Math.max(0, st.mass - o.def.mass);
    st.flingCD = st.perk === 'fling' ? 0.28 : 0.45;
    // aim: nearest rival roughly ahead of us
    let best = null, bs = 1e9;
    const hx = st.steerX || st.vx, hz = st.steerZ || st.vz, hl = Math.hypot(hx, hz) || 1;
    for (const t of this.storms) {
      if (t === st || t.dead) continue;
      const dx = t.x - st.x, dz = t.z - st.z, d = Math.hypot(dx, dz);
      if (d > 48) continue;
      const score = d - ((dx * hx + dz * hz) / (d * hl || 1)) * 14;
      if (score < bs) { bs = score; best = t; }
    }
    let dx, dz;
    if (best) {
      const lead = Math.hypot(best.x - o.x, best.z - o.z) / 55;
      dx = best.x + best.vx * lead - o.x; dz = best.z + best.vz * lead - o.z;
    } else { dx = hx; dz = hz; }
    const dl = Math.hypot(dx, dz) || 1;
    const sp = st.perk === 'fling' ? 72 : 52;
    o.state = S.FLY; o.from = st; o.target = best; o.owner = null;
    o.vx = (dx / dl) * sp + st.vx * 0.5; o.vz = (dz / dl) * sp + st.vz * 0.5; o.life = 1.0;
    // launch puff at the thrower so the shot visibly leaves the ring
    this.burst(o.x, o.y, o.z, 6, SPR.PUFF, st.flyCol, 4, 0.4);
    this.events.push({ type: 'fling', st, target: best });
    return true;
  }
  hit(o, t) {
    const n = Math.max(1, Math.min(4, 1 + Math.round(o.def.mass / (t.mass * 0.06 + 2))));
    const dx = t.x - o.x, dz = t.z - o.z, d = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < n && t.ring.length; k++) {
      const a = Math.random() * Math.PI * 2;
      this.knock(t, t.ring[(Math.random() * t.ring.length) | 0], Math.cos(a) * 0.6 + dx / d, Math.sin(a) * 0.6 + dz / d);
    }
    if (!t.ring.length) t.mass = Math.max(0, t.mass * 0.97 - 1);
    t.stun = 0.5; t.vx += (dx / d) * 14; t.vz += (dz / d) * 14;
    o.from.hits++;
    this.burst(o.x, o.y, o.z, 18, SPR.CHIP, [0.9, 0.9, 0.95], 13, 0.7);
    this.burst(o.x, o.y, o.z, 22, SPR.STAR, [1, 0.95, 0.6], 14, 0.6);
    this.burst(o.x, o.y, o.z, 6, SPR.PUFF, [1, 1, 1], 6, 0.5);
    if (o.from.isPlayer) { this.hitstop = Math.max(this.hitstop, 0.08); this.shake = Math.max(this.shake, 0.3); }
    this.events.push({ type: 'hit', st: o.from, target: t, n });
    o.owner = null;
    this.drop(o, -o.vx * 0.1, -o.vz * 0.1);
  }
  absorb(v, k) {
    const gain = v.mass * 0.5 + 4;
    k.mass += gain; k.kills++;
    v.dead = true; v.deaths++; v.respawn = 2.6; v.killer = k;
    v.mass = Math.max(4, v.mass * 0.35);
    this.burst(v.x, v.h * 0.4, v.z, 40, SPR.CHIP, new THREE.Color(v.color).toArray(), 18, 1.2);
    this.burst(v.x, 1, v.z, 30, SPR.PUFF, [1, 1, 1], 14, 1.2);
    this.burst(v.x, v.h * 0.5, v.z, 14, SPR.STAR, [1, 1, 0.8], 16, 0.8);
    if (v.isPlayer || k.isPlayer) { this.shake = 1; this.hitstop = 0.18; }
    this.events.push({ type: 'absorb', killer: k, victim: v, gain });
  }
  respawn(st) {
    const b = this.world.bounds;
    let best = null, bd = -1;
    for (let k = 0; k < 24; k++) {
      const x = b.minX + 20 + this.rnd() * (b.maxX - b.minX - 40);
      const z = Math.max(this.world.town.harbour ? this.world.town.waterZ + 8 : -1e9, b.minZ + 20 + this.rnd() * (b.maxZ - b.minZ - 40));
      let md = 1e9;
      for (const o of this.storms) if (o !== st && !o.dead) md = Math.min(md, Math.hypot(o.x - x, o.z - z) / (1 + o.s * 0.2));
      // the player respawns somewhere safe AND with food it can lift right away,
      // never into a block the late game has already stripped bare
      if (st.isPlayer) { let food = 0; const tier = tierOf(st.mass); this.world.near(x, z, 14, (o) => { if (o.state === S.GROUND && !o.decor && (o.def.tier <= tier || (o.def.tier === 1 && tier === 0))) food++; }); md = Math.min(md, 40) + Math.min(food, 25) * 2; }
      if (md > bd) { bd = md; best = [x, z]; }
    }
    st.x = best[0]; st.z = best[1]; st.vx = st.vz = 0;
    st.dead = false; st.inv = 2.5; st.s = sizeOf(st.mass); st.tier = tierOf(st.mass);
    this.events.push({ type: 'respawn', st });
  }
  ambient(st) {
    const P = this.fx;
    const n = 1 + Math.min(3, (st.s * 0.3) | 0);
    const sk = st.skinDef || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      P.swirl(st, a, st.R * (0.55 + Math.random() * 0.45), 0.2 + Math.random() * 0.5, 2.6 + Math.random() * 1.5, -st.R * 0.5, 0.4 + Math.random() * 1.2, { life: 0.9 + Math.random() * 0.5, size: 1.1 + st.s * 0.22, size1: 2.0 + st.s * 0.32, alpha: 0.42, spr: SPR.PUFF, color: [0.97, 0.95, 0.9] });
    }
    if (Math.random() < 0.5) {
      const a = Math.random() * 6.283, f = 0.2 + Math.random() * 0.7;
      const spr = st.isPlayer ? sk.spr : Math.random() < 0.4 ? SPR.LEAF : SPR.CHIP;
      const col = st.isPlayer ? sk.pc : spr === SPR.CHIP ? new THREE.Color(st.color).toArray() : [1, 1, 1];
      P.swirl(st, a, funnelR(st.s, f) * 1.05, f * st.h, 3.2, 0.2, 1.5, { life: 1.1, size: 0.6 + st.s * 0.12, alpha: 0.95, spr, color: col });
    }
    if (st.dashing) P.emit(st.x + (Math.random() - 0.5) * st.s, 0.4, st.z + (Math.random() - 0.5) * st.s, -st.vx * 0.2, 1, -st.vz * 0.2, { life: 0.7, size: 1.5 + st.s * 0.4, size1: 3 + st.s * 0.6, alpha: 0.6, spr: SPR.PUFF, color: [1, 1, 1] });
  }
  // a jagged chain of bright sparks inside the funnel
  bolt(st) {
    let a = Math.random() * 6.283, y = st.h * (0.85 + Math.random() * 0.1);
    const y1 = st.h * (0.2 + Math.random() * 0.25);
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const f = y / st.h;
      const r = funnelR(st.s, f) * (0.35 + Math.random() * 0.4);
      this.fx.emit(st.x + Math.cos(a) * r + st.leanX * f * f, y, st.z + Math.sin(a) * r + st.leanZ * f * f, 0, 0, 0, { life: 0.22, size: 0.9 + st.s * 0.12, size1: 0.2, alpha: 1, spr: SPR.STAR, color: [1, 1, 0.85] });
      a += (Math.random() - 0.5) * 1.6; y -= (y - y1) / (n - i + 1) * (0.7 + Math.random() * 0.6);
    }
  }
  burst(x, y, z, n, spr, col, speed = 6, life = 0.9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, u = Math.random();
      this.fx.emit(x, y, z, Math.cos(a) * speed * (0.4 + u), speed * (0.3 + Math.random() * 0.7), Math.sin(a) * speed * (0.4 + u), { life: life * (0.6 + Math.random() * 0.6), size: spr === SPR.PUFF ? 1.4 : 0.7, size1: spr === SPR.PUFF ? 2.6 : 0.3, alpha: 0.9, spr, color: col, drag: 1.8, grav: spr === SPR.PUFF ? -1 : 14 });
    }
  }
  standings() {
    return [...this.storms].sort((a, b) => b.mass - a.mass);
  }
  finish() {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.events.push({ type: 'over' });
  }
}
const _v = { x: 0, y: 0, z: 0 };
