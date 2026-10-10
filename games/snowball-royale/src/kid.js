// A kid: movement, throwing (tap = flat, hold = lob), diving, scooping snow,
// rolling a big snowball and building walls. The player and the AI both
// drive a kid through the same "intent" object.
import { clamp, rand } from './world.js';

export const KID_R = 14, SPEED = 228, MAX_AMMO = 8, START_AMMO = 4, SCOOP_GAIN = 2, WALL_COST = 3, MAX_WALLS = 3;
export const FLAT_SPEED = 820, FLAT_RANGE = 470, LOB_MIN = 130, LOB_MAX0 = 280, LOB_MAX1 = 760, TAP_T = 0.17, CHARGE_T = 0.6;
export const THROW_CD = 0.28, DIVE_CD = 1.1, DIVE_SPEED = 560, SCOOP_T = 0.34, STILL_SCOOP = 0.4;
export const BALL_MIN = 11, BALL_MAX = 56, BIG_HIT_R = 22;
export const lobRange = (c) => LOB_MAX0 + (LOB_MAX1 - LOB_MAX0) * c;

export function newIntent() { return { mx: 0, my: 0, ax: 0, ay: 0, flatOff: 0, fire: false, dive: false, scoop: false, roll: false, wall: false }; }

let nextId = 1;
export class Kid {
  constructor(o) {
    this.id = nextId++;
    this.name = 'Kid'; this.team = 0; this.isPlayer = false; this.persona = null;
    this.coat = '#e5483d'; this.skin = '#f7d5bd'; this.hair = '#4a2e1f'; this.hat = 'beanie'; this.hatColor = null; this.scarf = 'red'; this.ring = '#fff';
    Object.assign(this, o);
    this.maxhp = 3; this.lives = 3; this.kos = 0; this.hits = 0; this.score = 0; this.hold = 0; this.elim = false; this.elimAt = 0;
    this.spawn(this.x || 0, this.y || 0, true);
  }
  spawn(x, y, first) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = this.maxhp; this.ammo = START_AMMO;
    this.stun = 0; this.prone = 0; this.dive = 0; this.diveCd = 0; this.throwCd = 0; this.throwAnim = 0; this.flash = 0; this.splatT = 0;
    this.invuln = first ? 0 : 1.6; this.squash = 0; this.sinceHit = 99; this.regenT = 0; this.buildCd = 0;
    this.charging = false; this.chargeT = 0; this.chargeAmt = 0; this.scoopT = 0; this.stillT = 0;
    this.ballRef = null; this.ko = false; this.koT = 0; this.out = false; this.outT = 0; this.fade = null;
    this.step = Math.random() * 6; this.stepDist = 0; this.footSide = 1; this.moving = false; this.breathT = rand(0.3, 1.4);
    this.face = this.face ?? 0; this.lieDir = 1; this.tackled = new Set();
  }
  get alive() { return !this.ko && !this.out && !this.elim; }

  update(dt, g, it) {
    const w = g.world;
    this.stun = Math.max(0, this.stun - dt); this.prone = Math.max(0, this.prone - dt); this.dive = Math.max(0, this.dive - dt);
    this.diveCd -= dt; this.throwCd -= dt; this.throwAnim -= dt; this.flash -= dt; this.splatT -= dt; this.invuln -= dt; this.buildCd -= dt;
    this.squash *= Math.exp(-12 * dt);
    this.sinceHit += dt;
    if (this.ko) {
      this.koT += dt;
      const f = Math.exp(-4 * dt); this.vx *= f; this.vy *= f;
      this.x += this.vx * dt; this.y += this.vy * dt; w.push(this, KID_R);
      if (this.koT > 1.1) this.fade = clamp(1 - (this.koT - 1.1) / 0.5, 0, 1);
      if (this.koT > 1.6) { this.out = true; this.ko = false; }
      return;
    }
    if (this.hp < this.maxhp && this.sinceHit > 6) { this.regenT += dt; if (this.regenT > 3.5) { this.regenT = 0; this.hp++; if (this.isPlayer) g.fx.text(this.x, this.y - 70, '+1 ♥', '#ff8fb0', 18); } }

    let mx = it.mx, my = it.my;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const busy = this.stun > 0 || this.prone > 0 || g.frozen;
    if (busy) { mx = 0; my = 0; }
    if (this.scoopT > 0 && Math.hypot(mx, my) > 0.3) this.scoopT = 0;

    // facing: aim, or the push direction while rolling
    if (!(this.prone > 0)) {
      if (this.ballRef) { if (Math.hypot(mx, my) > 0.2) this.face = turnTo(this.face, Math.atan2(my, mx), 9 * dt); }
      else if (it.ax != null && Math.hypot(it.ax - this.x, it.ay - this.y) > 4) { const a = Math.atan2(it.ay - this.y, it.ax - this.x); if (isFinite(a)) this.face = a; }
    }

    // throwing (a click cancels a scoop)
    if (it.fire && !this.firePrev && this.scoopT > 0 && this.ammo > 0) this.scoopT = 0;
    if (!busy && !this.ballRef && this.scoopT <= 0) {
      if (it.fire && !this.charging && this.throwCd <= 0) {
        if (this.ammo > 0) { this.charging = true; this.chargeT = 0; } else if (!this.firePrev) g.noAmmo(this);
      }
      if (this.charging) {
        this.chargeT += dt;
        if (!it.fire) { this.release(g, it); this.charging = false; }
      }
    } else if (this.charging && (busy || this.ballRef)) this.charging = false;
    this.firePrev = it.fire;
    this.chargeAmt = this.charging ? clamp((this.chargeT - TAP_T) / CHARGE_T, 0, 1) : 0;

    // dive / slide
    if (it.dive && !busy && this.diveCd <= 0 && !this.ballRef) {
      let dx = mx, dy = my;
      if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(this.face); dy = Math.sin(this.face); }
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const ice = w.onIce(this.x, this.y);
      this.vx = dx * DIVE_SPEED * (ice ? 1.15 : 1); this.vy = dy * DIVE_SPEED * (ice ? 1.15 : 1);
      this.dive = ice ? 0.9 : 0.45; this.prone = this.dive + 0.16; this.diveCd = DIVE_CD; this.lieDir = dx >= 0 ? 1 : -1;
      this.charging = false; this.scoopT = 0; this.tackled.clear(); this.diveSnow = 0;
      g.audio.play('dive', 1, g.vol(this)); g.fx.puff(this.x, this.y, 4, 14, 6);
    }
    // wall
    if (it.wall && !busy && !this.ballRef) g.buildWall(this);
    // roll a big one
    if (it.roll && !busy && this.scoopT <= 0) { if (!this.ballRef && !this.charging) g.grabBall(this); }
    else if (this.ballRef) g.releaseBall(this);

    // speed
    let speed = SPEED;
    if (this.charging) speed *= 0.72;
    if (this.ballRef) speed *= clamp(1 - (this.ballRef.r - BALL_MIN) / 80, 0.42, 1);
    if (this.scoopT > 0) speed = 0;

    // scooping: E, or just stand still on snow
    const still = Math.hypot(mx, my) < 0.1 && !this.charging && !this.ballRef && !busy && this.dive <= 0;
    this.stillT = still ? this.stillT + dt : 0;
    if (this.scoopT <= 0 && !busy && this.ammo < MAX_AMMO && !this.ballRef && !this.charging && this.dive <= 0 && (it.scoop || this.stillT > STILL_SCOOP)) {
      if (w.snowNear(this.x, this.y + 4, 14) > 0.22) { this.scoopT = SCOOP_T; this.scoopDone = false; }
      else if (it.scoop && this.isPlayer && !this.scoopWarned) { this.scoopWarned = true; g.fx.text(this.x, this.y - 74, 'No snow here!', '#bfe3ff', 16); }
    }
    if (!it.scoop) this.scoopWarned = false;
    if (this.scoopT > 0) {
      this.scoopT -= dt;
      if (this.scoopT <= 0) {
        const sx = this.x + Math.cos(this.face) * 12, sy = this.y + 5 + Math.sin(this.face) * 7;
        w.scoop(sx, sy);
        this.ammo = Math.min(MAX_AMMO, this.ammo + SCOOP_GAIN);
        this.stillT = STILL_SCOOP - 0.05; this.squash = 0.12;
        g.fx.burst(sx, sy, 2, 6, { speed: 70, up: 0.6 });
        g.audio.play('scoop', 1, g.vol(this));
        if (this.isPlayer) g.fx.text(this.x, this.y - 74, '+' + SCOOP_GAIN, '#ffffff', 18, 0.6);
      }
    }

    // movement
    const ice = w.onIce(this.x, this.y);
    if (this.dive > 0 || this.prone > 0) {
      const f = Math.exp(-(ice ? 0.7 : this.dive > 0 ? 2.6 : 7) * dt); this.vx *= f; this.vy *= f;
      // belly-slide through snow scoops one up
      if (this.dive > 0 && !ice && w.snowAt(this.x, this.y) > 0.4) {
        this.diveSnow = (this.diveSnow || 0) + Math.hypot(this.vx, this.vy) * dt;
        w.dig(this.x, this.y, 10, 0.35);
        if (this.diveSnow > 90 && this.ammo < MAX_AMMO && !this.diveGot) { this.diveGot = true; this.ammo++; if (this.isPlayer) g.fx.text(this.x, this.y - 40, '+1', '#fff', 16, 0.5); }
      }
    } else {
      this.diveGot = false;
      const k = ice ? 2.0 : 12;
      this.vx += (mx * speed - this.vx) * Math.min(1, k * dt);
      this.vy += (my * speed - this.vy) * Math.min(1, k * dt);
    }
    const hf = w.hillForce(this.x, this.y);
    if (hf && this.dive <= 0) { this.vx += hf.x * dt * 0.5; this.vy += hf.y * dt * 0.5; }
    if (hf && this.dive > 0) { this.vx += hf.x * dt * 1.2; this.vy += hf.y * dt * 1.2; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    w.push(this, KID_R, this.ballRef);

    const sp = Math.hypot(this.vx, this.vy);
    this.moving = sp > 30 && this.prone <= 0;
    if (this.moving) {
      this.step += sp * dt * 0.085;
      this.stepDist += sp * dt;
      if (this.stepDist > 14) {
        this.stepDist = 0; this.footSide = -this.footSide;
        w.footprint(this.x, this.y + 1, Math.atan2(this.vy, this.vx), this.footSide);
        if (this.isPlayer && !ice) g.audio.play('step');
      }
    }
    this.breathT -= dt;
    if (this.breathT <= 0) { this.breathT = rand(1.0, 1.7) * (this.moving ? 0.7 : 1); const back = Math.sin(this.face) < -0.4; if (!back && this.prone <= 0) g.fx.breath(this.x + Math.cos(this.face) * 9, this.y - 35, this.face); }
  }

  release(g, it) {
    let dx = it.ax - this.x, dy = it.ay + (this.chargeT < TAP_T ? it.flatOff : 0) - this.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (this.chargeT < TAP_T) g.throwFlat(this, dx, dy);
    else { const L = clamp(d, LOB_MIN, lobRange(this.chargeAmt)); g.throwLob(this, this.x + dx * L, this.y + dy * L); }
    this.ammo--; this.throwCd = THROW_CD; this.throwAnim = 0.14; this.squash = -0.12; this.stillT = 0;
  }
}

function turnTo(a, b, k) {
  let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * Math.min(1, k);
}
