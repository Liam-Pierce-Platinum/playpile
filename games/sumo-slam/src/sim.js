// SUMO SLAM rules and physics. No three.js here: plain numbers so a headless
// bot (or a test) can run whole matches fast. Units are metres and seconds.
// The ring lives in the XZ plane, centred on the origin; y is up.

export const RING_R0 = 8.5;
export const WIN_ROUNDS = 3;
export const BODY_R = 1;
const G = 26; // gravity for falling and hops (game-feel, not 9.8)

export const TIERS = [
  { name: 'ROOKIE', react: 0.42, aim: 0.42, aggro: 0.45, caution: 1.15, dodge: 0.1, charge: [0.15, 0.35], speed: 0.86, focus: -0.3 },
  { name: 'CONTENDER', react: 0.28, aim: 0.26, aggro: 0.6, caution: 1.35, dodge: 0.3, charge: [0.2, 0.5], speed: 0.93, focus: -0.2 },
  { name: 'CHAMPION', react: 0.18, aim: 0.14, aggro: 0.75, caution: 1.55, dodge: 0.5, charge: [0.25, 0.6], speed: 0.98, focus: -0.1 },
  { name: 'YOKOZUNA', react: 0.11, aim: 0.07, aggro: 0.9, caution: 1.75, dodge: 0.7, charge: [0.3, 0.7], speed: 1.0, focus: -0.02 },
];

export const POWERS = {
  giant: { label: 'GIANT!', dur: 7 },
  heavy: { label: 'HEAVY!', dur: 7 },
  spring: { label: 'SPRING!', dur: 12 },
};
const POWER_KEYS = Object.keys(POWERS);

export const BOT_NAMES = ['Big Mochi', 'Dumpling', 'Tofu Tank', 'Rice Ball', 'Wasabi', 'Bao Bao', 'Udon', 'Yuzu', 'Daifuku', 'Miso'];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len = (x, z) => Math.sqrt(x * x + z * z);

// Ring radius over the round: steady for 4 s, shrinks to 44% by 48 s, then
// collapses so no round reaches a minute.
export function ringRadius(t) {
  if (t < 4) return RING_R0;
  if (t < 48) return RING_R0 * (1 - ((t - 4) / 44) * 0.56);
  return Math.max(0, RING_R0 * (0.44 - (t - 48) * 0.05));
}
function tiltAmp(t) {
  if (t < 6) return 0;
  return Math.min(0.13, (t - 6) * 0.0075);
}

export class Sim {
  constructor(opts = {}) {
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.rand = mulberry32(this.seed);
    this.tierIx = clamp(opts.tier ?? 0, 0, TIERS.length - 1);
    this.tier = TIERS[this.tierIx];
    this.events = [];
    this.ws = [];
    this.items = [];
    this.round = 0;
    this.phase = 'idle';
    this.t = 0;
    this.R = RING_R0;
    this.tiltX = 0; this.tiltZ = 0; this.tiltPhase = 0;
    this.matchWinner = null;
    this.roundWinner = null;
    this.itemTimer = 0;
    this.attract = !!opts.attract;
  }

  rnd(a = 0, b = 1) { return a + (b - a) * this.rand(); }

  // players: [{ name, color, human: 0|1|null, hat }]
  setupMatch(players) {
    this.ws = players.map((p, i) => ({
      id: i, name: p.name, color: p.color, hat: p.hat || 'knot', human: p.human ?? null,
      score: 0, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, face: 0,
      r: BODY_R, m: 1, alive: true, falling: false, out: false, outOrder: -1,
      charge: 0, charging: false, dashT: 0, dashPow: 0, cd: 0, stun: 0, air: 0,
      power: null, powerT: 0, lastHitBy: -1, lastHitT: -9, teeter: 0,
      input: { x: 0, z: 0, dash: false }, prevDash: false,
      ai: { t: 0, mx: 0, mz: 0, wantCharge: 0, target: -1, holdFor: 0 },
      stats: { slams: 0, outs: 0, dashes: 0 },
    }));
    this.round = 0;
    this.matchWinner = null;
  }

  startRound() {
    this.round++;
    this.phase = 'intro';
    this.t = 0;
    this.introT = 1.25;
    this.endT = 0;
    this.R = RING_R0;
    this.tiltX = this.tiltZ = 0;
    this.tiltPhase = this.rnd(0, Math.PI * 2);
    this.tiltDir = this.rand() < 0.5 ? 1 : -1;
    this.items = [];
    this.itemTimer = 4 + this.rnd(0, 1.5);
    this.roundWinner = null;
    this.outCount = 0;
    const n = this.ws.length;
    const off = this.rnd(0, Math.PI * 2);
    this.ws.forEach((w, i) => {
      const a = off + (i / n) * Math.PI * 2;
      w.x = Math.cos(a) * RING_R0 * 0.6; w.z = Math.sin(a) * RING_R0 * 0.6; w.y = 0;
      w.vx = w.vz = w.vy = 0;
      w.face = Math.atan2(-w.x, -w.z);
      w.r = BODY_R; w.m = 1;
      w.alive = true; w.falling = false; w.out = false; w.outOrder = -1;
      w.charge = 0; w.charging = false; w.release = false; w.dashT = 0; w.cd = 0.2; w.stun = 0; w.air = 0;
      w.power = null; w.powerT = 0; w.lastHitBy = -1; w.lastHitT = -9; w.teeter = 0;
      w.prevDash = false; w.input.dash = false;
      w.ai.t = this.rnd(0, 0.2); w.ai.wantCharge = 0;
    });
    this.emit({ type: 'roundStart', round: this.round });
  }

  emit(e) { this.events.push(e); }

  alive() { return this.ws.filter((w) => w.alive && !w.falling); }

  step(dt) {
    if (this.phase === 'idle' || this.phase === 'over') return;
    if (this.phase === 'intro') {
      this.introT -= dt;
      // you can already charge during the countdown, but not move
      for (const w of this.ws) this.updateCharge(w, dt, true);
      if (this.introT <= 0) { this.phase = 'fight'; this.emit({ type: 'go' }); }
      return;
    }
    if (this.phase === 'fight' || this.phase === 'end') this.t += dt;
    const prevR = this.R;
    this.R = this.phase === 'end' ? this.R : ringRadius(this.t);
    if (this.R < prevR) this.emit({ type: 'shrink', from: prevR, to: this.R });

    // tilt swings round the ring; the swing speeds up as the round goes on
    const amp = this.phase === 'end' ? 0 : tiltAmp(this.t);
    this.tiltPhase += dt * this.tiltDir * (0.32 + this.t * 0.006);
    const wob = 1 + 0.25 * Math.sin(this.t * 1.7);
    const tx = amp * wob * Math.cos(this.tiltPhase), tz = amp * wob * Math.sin(this.tiltPhase);
    this.tiltX += (tx - this.tiltX) * Math.min(1, dt * 3);
    this.tiltZ += (tz - this.tiltZ) * Math.min(1, dt * 3);

    // items
    if (this.phase === 'fight') {
      this.itemTimer -= dt;
      if (this.itemTimer <= 0 && this.items.length < 2 && this.R > 3.5) {
        this.itemTimer = 6.5 + this.rnd(0, 3);
        const a = this.rnd(0, Math.PI * 2), d = this.rnd(0, this.R * 0.55);
        const kind = POWER_KEYS[(this.rand() * POWER_KEYS.length) | 0];
        this.items.push({ id: (this.itemSeq = (this.itemSeq || 0) + 1), kind, x: Math.cos(a) * d, z: Math.sin(a) * d, t: 0, drop: 1 });
        this.emit({ type: 'itemSpawn', kind });
      }
    }
    for (const it of this.items) { it.t += dt; it.drop = Math.max(0, it.drop - dt * 2.2); }
    this.items = this.items.filter((it) => {
      if (len(it.x, it.z) > this.R - 0.4) { this.emit({ type: 'itemLost', x: it.x, z: it.z }); return false; }
      return it.t < 14;
    });

    for (const w of this.ws) {
      if (!w.alive) continue;
      if (w.human === null || this.autoHumans) this.think(w, dt);
      this.updateWrestler(w, dt);
    }
    this.collide();
    this.checkRing(dt);
    this.checkRoundEnd(dt);
  }

  updateCharge(w, dt, frozen) {
    const held = !!w.input.dash;
    if (w.cd > 0) w.cd -= dt;
    if (w.falling) { w.charging = false; w.release = false; return; }
    if (w.charging) {
      w.charge = Math.min(1, w.charge + dt / 0.6);
      if (!held) w.release = true;
      // a release while stunned or mid-air is kept and fires as soon as you can move
      if (w.release && w.stun <= 0 && w.dashT <= 0 && w.air <= 0) {
        w.charging = false; w.release = false;
        if (!frozen) this.dash(w);
        else { w.charge = 0; this.emit({ type: 'chargeStop', id: w.id }); }
      }
    } else if (held && w.stun <= 0 && w.dashT <= 0 && w.cd <= 0 && w.air <= 0) {
      w.charging = true; w.release = false; w.charge = 0;
      this.emit({ type: 'chargeStart', id: w.id });
    }
  }

  dash(w) {
    let dx = w.input.x, dz = w.input.z;
    const l = len(dx, dz);
    if (l < 0.2) { dx = Math.sin(w.face); dz = Math.cos(w.face); } else { dx /= l; dz /= l; }
    const pow = 0.35 + 0.65 * w.charge;
    w.face = Math.atan2(dx, dz);
    w.stats.dashes++;
    if (w.power === 'spring') {
      // leap: fly forward, land with a shockwave
      const sp = 7 + 6 * w.charge;
      w.vx = dx * sp; w.vz = dz * sp; w.vy = 11; w.air = 1; w.y = 0.01;
      w.power = null; w.powerT = 0;
      w.cd = 0.5;
      this.emit({ type: 'leap', id: w.id, x: w.x, z: w.z });
      return;
    }
    const sp = 9 + 7 * w.charge;
    w.vx = dx * sp; w.vz = dz * sp;
    w.dashT = 0.3; w.dashPow = pow;
    w.cd = 0.75;
    w.charge = 0;
    this.emit({ type: 'dash', id: w.id, pow, x: w.x, z: w.z, dx, dz });
  }

  updateWrestler(w, dt) {
    if (w.falling) {
      w.vy -= G * dt;
      w.x += w.vx * dt; w.z += w.vz * dt; w.y += w.vy * dt;
      w.vx *= Math.exp(-0.6 * dt); w.vz *= Math.exp(-0.6 * dt);
      if (w.y < -30) { w.alive = false; w.out = true; }
      return;
    }
    const frozen = this.phase === 'end' && w !== this.roundWinnerW;
    this.updateCharge(w, dt, false);
    if (w.powerT > 0) {
      w.powerT -= dt;
      if (w.powerT <= 0 && w.power) { this.emit({ type: 'powerEnd', id: w.id, kind: w.power }); w.power = null; }
    }
    const tr = w.power === 'giant' ? 1.55 : 1;
    w.r += (tr - w.r) * Math.min(1, dt * 8);
    w.m = w.power === 'heavy' ? 3.2 : w.power === 'giant' ? 2 : 1;
    if (w.stun > 0) w.stun -= dt;
    if (w.dashT > 0) w.dashT -= dt;

    // vertical (leap / hop)
    if (w.air > 0 || w.y > 0) {
      w.vy -= G * dt; w.y += w.vy * dt;
      if (w.y <= 0) {
        w.y = 0;
        const wasLeap = w.air > 0;
        const hard = w.vy < -6;
        w.vy = 0; w.air = 0;
        if (wasLeap) this.shockwave(w);
        else if (hard) this.emit({ type: 'land', id: w.id, x: w.x, z: w.z });
      }
    }

    // movement
    let ax = 0, az = 0;
    const control = (w.stun > 0 ? 0.15 : 1) * (w.charging ? 0.35 : 1) * (w.dashT > 0 ? 0.2 : 1) * (w.air > 0 ? 0.3 : 1) * (frozen ? 0 : 1);
    const il = len(w.input.x, w.input.z);
    if (il > 0.05 && this.phase !== 'intro') {
      const s = Math.min(1, il);
      const ux = w.input.x / il, uz = w.input.z / il;
      const acc = 34 * (w.power === 'heavy' ? 0.8 : 1);
      ax += ux * s * acc * control; az += uz * s * acc * control;
      if (!w.charging || true) {
        const tf = Math.atan2(ux, uz);
        let d = tf - w.face; d = Math.atan2(Math.sin(d), Math.cos(d));
        w.face += d * Math.min(1, dt * (w.charging ? 9 : 14));
      }
    }
    // slope: the tilted ring pulls everyone downhill
    if (w.y <= 0.05) {
      az += G * 0.42 * Math.sin(this.tiltX);
      ax += -G * 0.42 * Math.sin(this.tiltZ);
    }
    w.vx += ax * dt; w.vz += az * dt;
    let fr = w.y > 0.05 ? 0.3 : w.dashT > 0 ? 1.4 : w.stun > 0 ? 3.6 : 4.5;
    // feet dig in at the edge: sliding outward near the lip gets extra grip
    if (w.teeter > 0 && w.y <= 0.05) { const dd = len(w.x, w.z) || 1; if ((w.vx * w.x + w.vz * w.z) / dd > 0) fr += 14 * w.teeter; }
    const k = Math.exp(-fr * dt);
    w.vx *= k; w.vz *= k;
    w.x += w.vx * dt; w.z += w.vz * dt;
  }

  shockwave(w) {
    this.emit({ type: 'shock', id: w.id, x: w.x, z: w.z });
    for (const o of this.ws) {
      if (o === w || !o.alive || o.falling) continue;
      const dx = o.x - w.x, dz = o.z - w.z, d = len(dx, dz);
      if (d > 5 || d < 0.001) continue;
      const f = (1 - d / 5) * 17 / Math.max(1, o.m * 0.75);
      o.vx += (dx / d) * f; o.vz += (dz / d) * f;
      o.vy = 5; o.y = 0.01;
      o.stun = 0.45; o.lastHitBy = w.id; o.lastHitT = this.t;
      w.stats.slams++;
      this.emit({ type: 'hit', a: w.id, b: o.id, power: 1, x: o.x, z: o.z, shock: true });
    }
  }

  collide() {
    const ws = this.ws;
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i];
      if (!a.alive || a.falling) continue;
      for (let j = i + 1; j < ws.length; j++) {
        const b = ws[j];
        if (!b.alive || b.falling) continue;
        if (Math.abs(a.y - b.y) > 1.4) continue;
        let dx = b.x - a.x, dz = b.z - a.z;
        let d = len(dx, dz);
        const rr = a.r + b.r;
        if (d >= rr) continue;
        if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; }
        const nx = dx / d, nz = dz / d;
        // separate by inverse mass
        const ov = rr - d, im = 1 / a.m + 1 / b.m;
        a.x -= nx * ov * (1 / a.m) / im; a.z -= nz * ov * (1 / a.m) / im;
        b.x += nx * ov * (1 / b.m) / im; b.z += nz * ov * (1 / b.m) / im;
        const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // >0 closing
        if (vrel <= 0) continue;
        const e = 0.4;
        const J = ((1 + e) * vrel) / im;
        a.vx -= (J / a.m) * nx; a.vz -= (J / a.m) * nz;
        b.vx += (J / b.m) * nx; b.vz += (J / b.m) * nz;
        // a dash adds a big shove to whoever it hits, and a little recoil
        const aDash = a.dashT > 0 ? a.dashPow : 0, bDash = b.dashT > 0 ? b.dashPow : 0;
        let power = Math.min(1, vrel / 22);
        const shove = (src, dst, p, sign) => {
          const ratio = clamp(src.m / dst.m, 0.3, 2.6);
          const B = 3.4 * p * ratio;
          dst.vx += nx * sign * B; dst.vz += nz * sign * B;
          src.vx -= nx * sign * B * 0.18 / ratio; src.vz -= nz * sign * B * 0.18 / ratio;
          dst.stun = Math.max(dst.stun, (0.2 + 0.35 * p) * (dst.power === 'heavy' ? 0.3 : 1));
          dst.vy = Math.max(dst.vy, 2.5 + 3 * p); if (dst.y <= 0) dst.y = 0.01;
          dst.lastHitBy = src.id; dst.lastHitT = this.t;
          src.dashT = Math.min(src.dashT, 0.06);
          src.stats.slams++;
        };
        if (aDash && bDash) {
          shove(a, b, aDash * 0.75, 1); shove(b, a, bDash * 0.75, -1);
          power = 1;
          this.emit({ type: 'clash', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        } else if (aDash) { shove(a, b, aDash, 1); power = Math.max(power, 0.45 + 0.55 * aDash); }
        else if (bDash) { shove(b, a, bDash, -1); power = Math.max(power, 0.45 + 0.55 * bDash); }
        else {
          // a plain bump still pops a bit so walking into someone feels bouncy
          const pop = Math.min(3, vrel * 0.25);
          a.vx -= nx * pop / a.m; a.vz -= nz * pop / a.m; b.vx += nx * pop / b.m; b.vz += nz * pop / b.m;
          if (vrel > 3) { a.lastHitBy = b.id; a.lastHitT = this.t; b.lastHitBy = a.id; b.lastHitT = this.t; }
        }
        if (vrel > 1.5 || aDash || bDash) {
          this.emit({ type: 'hit', a: aDash >= bDash ? a.id : b.id, b: aDash >= bDash ? b.id : a.id, power, x: a.x + nx * a.r, z: a.z + nz * a.r, dash: !!(aDash || bDash) });
        }
      }
    }
  }

  checkRing() {
    for (const w of this.ws) {
      if (!w.alive || w.falling) continue;
      const d = len(w.x, w.z);
      w.teeter = clamp((d - (this.R - w.r * 0.8)) / (w.r * 0.8), 0, 1);
      if (w.y > 0.3) continue; // airborne over the edge is fine until you come down
      if (d > this.R + 0.12) {
        w.falling = true; w.charging = false; w.power = null;
        w.outOrder = this.outCount++;
        if (w.vy <= 0) w.vy = 1.5;
        // push a touch further out so they clear the lip
        w.vx += (w.x / d) * 2; w.vz += (w.z / d) * 2;
        const by = w.lastHitBy >= 0 && this.t - w.lastHitT < 3 ? w.lastHitBy : -1;
        if (by >= 0) this.ws[by].stats.outs++;
        this.emit({ type: 'fall', id: w.id, by, x: w.x, z: w.z, last: this.alive().length <= 1 });
      }
    }
    for (const it of this.items) {
      for (const w of this.ws) {
        if (!w.alive || w.falling || w.y > 1.5) continue;
        if (len(w.x - it.x, w.z - it.z) < w.r + 0.75) {
          w.power = it.kind; w.powerT = POWERS[it.kind].dur;
          it.taken = true;
          this.emit({ type: 'pickup', id: w.id, kind: it.kind, x: it.x, z: it.z });
          break;
        }
      }
    }
    this.items = this.items.filter((i) => !i.taken);
  }

  checkRoundEnd(dt) {
    if (this.phase === 'fight') {
      const al = this.alive();
      if (al.length <= 1) {
        this.phase = 'end';
        this.endT = 0;
        let win = al[0] || null;
        if (!win) {
          // everyone went over: the last one to leave the ring takes it,
          // unless two went over on the same frame
          const f = this.ws.filter((w) => w.outOrder >= 0).sort((a, b) => b.outOrder - a.outOrder);
          win = f.length ? f[0] : null;
        }
        this.roundWinnerW = al[0] || null;
        this.roundWinner = win ? win.id : null;
        if (win) win.score++;
        if (win && win.score >= WIN_ROUNDS) this.matchWinner = win.id;
        this.emit({ type: 'roundEnd', winner: this.roundWinner, match: this.matchWinner });
      }
    } else if (this.phase === 'end') {
      this.endT += dt;
      const w = this.roundWinnerW;
      if (w && w.alive && !w.falling && w.y <= 0 && this.endT > 0.35 && this.endT < 1.6 && ((this.endT * 10) | 0) % 6 === 0) {
        w.vy = 6.5; w.y = 0.01; // victory bounce
      }
    }
  }

  // a short grace at the start of each round: bots fight each other first, so a new
  // player who is still reading the screen is not knocked out before they touch a key
  safeStart() { return this.round === 1 ? 2.5 : this.tierIx <= 1 ? 1.8 : 1.0; }

  // ---------- bots ----------
  think(w, dt) {
    if (w.falling) return;
    const T = w.brain != null ? TIERS[w.brain] : this.attract ? TIERS[1] : this.tier;
    const ai = w.ai;
    ai.t -= dt;
    // manage an in-progress charge
    if (ai.wantCharge > 0) {
      ai.wantCharge -= dt;
      w.input.dash = true;
      const tg = this.ws[ai.target];
      if (tg && tg.alive && !tg.falling) {
        const dx = tg.x + tg.vx * 0.15 - w.x, dz = tg.z + tg.vz * 0.15 - w.z, l = len(dx, dz) || 1;
        w.input.x = dx / l + ai.ex; w.input.z = dz / l + ai.ez;
      }
      if (ai.wantCharge <= 0) {
        // last look: is this dash going to carry me off? then cancel by aiming in
        const dl = len(w.input.x, w.input.z) || 1;
        const reach = 2.2 + 3.6 * w.charge;
        const ex = w.x + (w.input.x / dl) * reach, ez = w.z + (w.input.z / dl) * reach;
        if (len(ex, ez) > this.R - 0.3 && (!tg || len(tg.x - w.x, tg.z - w.z) > reach)) {
          w.input.x = -w.x; w.input.z = -w.z;
        }
        w.input.dash = false;
      }
      return;
    }
    w.input.dash = false;
    if (ai.t > 0) { w.input.x = ai.mx; w.input.z = ai.mz; return; }
    ai.t = T.react * this.rnd(0.7, 1.3);
    const R = this.R;
    const d = len(w.x, w.z);
    let mx = 0, mz = 0;
    // downhill vector (where the tilt pulls)
    const hx = -Math.sin(this.tiltZ), hz = Math.sin(this.tiltX);
    const edgeSafe = R - T.caution * w.r - 0.8;
    const opps = this.ws.filter((o) => o !== w && o.alive && !o.falling);
    // dodge an incoming dash
    for (const o of opps) {
      if (o.dashT > 0 || o.charging) {
        const dx = w.x - o.x, dz = w.z - o.z, dd = len(dx, dz);
        if (dd < 5.5 && this.rand() < T.dodge) {
          const fx = Math.sin(o.face), fz = Math.cos(o.face);
          if ((dx * fx + dz * fz) / dd > 0.75) {
            // sidestep toward the centre side
            let px = -fz, pz = fx;
            if (px * -w.x + pz * -w.z < 0) { px = -px; pz = -pz; }
            ai.mx = px; ai.mz = pz; w.input.x = px; w.input.z = pz;
            ai.t = 0.25;
            return;
          }
        }
      }
    }
    if (d > edgeSafe) {
      mx = -w.x / (d || 1); mz = -w.z / (d || 1);
      // dash back to safety if really close to falling
      if (d > R - w.r * 0.6 && w.cd <= 0 && this.rand() < T.aggro * 0.6) {
        ai.wantCharge = 0.05; ai.target = -1; ai.ex = 0; ai.ez = 0;
        w.input.x = mx; w.input.z = mz; w.input.dash = true;
        return;
      }
    } else {
      // power-ups nearby?
      let item = null, best = 7;
      if (!w.power) for (const it of this.items) { const dd = len(it.x - w.x, it.z - w.z); if (dd < best && it.drop < 0.3) { best = dd; item = it; } }
      // pick a target: whoever is nearest the edge and close to me
      let tg = null, ts = -1e9;
      for (const o of opps) {
        const od = len(o.x, o.z);
        const dist = len(o.x - w.x, o.z - w.z);
        const s = (od / Math.max(1, R)) * 2 - dist * 0.12 + (o.human !== null ? T.focus - (this.t < this.safeStart() ? 4 : 0) : 0) + (o.id === ai.target ? 0.3 : 0);
        if (s > ts) { ts = s; tg = o; }
      }
      if (item && (!tg || best < 3 || this.rand() < 0.5)) {
        mx = item.x - w.x; mz = item.z - w.z;
      } else if (tg) {
        ai.target = tg.id;
        const od = len(tg.x, tg.z) || 1;
        const ox = tg.x / od, oz = tg.z / od; // target's outward dir
        // go to the centre side of the target so a shove sends them out
        const gx = tg.x - ox * 2.4, gz = tg.z - oz * 2.4;
        const dx = tg.x - w.x, dz = tg.z - w.z, dist = len(dx, dz) || 1;
        const lined = (dx * ox + dz * oz) / dist; // 1 = target directly outward of me
        const range = 3.2 + 3.2 * T.aggro;
        if (w.cd <= 0 && dist < range && (lined > 0.35 || (dist < 2.8 && lined > -0.2)) && this.rand() < T.aggro * 0.7) {
          const [c0, c1] = T.charge;
          ai.wantCharge = Math.min(0.6, this.rnd(c0, c1) * (dist / range + 0.3));
          ai.ex = this.rnd(-T.aim, T.aim); ai.ez = this.rnd(-T.aim, T.aim);
          w.input.x = dx / dist; w.input.z = dz / dist; w.input.dash = true;
          return;
        }
        mx = gx - w.x; mz = gz - w.z;
        if (len(mx, mz) < 0.6) { mx = dx; mz = dz; }
      } else {
        mx = -w.x; mz = -w.z;
      }
      // lean against the tilt a little
      mx -= hx * 0.35 * T.caution; mz -= hz * 0.35 * T.caution;
    }
    const l = len(mx, mz) || 1;
    ai.mx = (mx / l) * T.speed; ai.mz = (mz / l) * T.speed;
    w.input.x = ai.mx; w.input.z = ai.mz;
  }
}
