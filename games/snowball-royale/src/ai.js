// AI kids. Each has a personality; all of them reload when empty, use cover
// relative to their target, lob over walls they can't see past, dodge flat
// throws and knock snow out of trees onto people standing underneath.
import { clamp, rand, W, H, EDGE } from './world.js';
import { newIntent, FLAT_RANGE, FLAT_SPEED, TAP_T, CHARGE_T, LOB_MAX0, LOB_MAX1, MAX_AMMO, KID_R } from './kid.js';

export const PERSONAS = {
  sniper: { label: 'Sniper', tip: 'hangs back and lobs', min: 360, max: 600, lob: 0.6, err: 0.05, rate: 1.0, cover: 0.85, dodge: 0.55, build: 0.06, roll: 0.02, dive: 0.15, flee: false, tree: 0.6 },
  rusher: { label: 'Rusher', tip: 'charges right at you', min: 100, max: 230, lob: 0.05, err: 0.12, rate: 0.42, cover: 0.08, dodge: 0.75, build: 0, roll: 0.25, dive: 0.55, flee: false, tree: 0.1 },
  builder: { label: 'Builder', tip: 'builds walls and big balls', min: 230, max: 420, lob: 0.35, err: 0.09, rate: 0.75, cover: 0.6, dodge: 0.5, build: 0.5, roll: 0.18, dive: 0.2, flee: false, tree: 0.3 },
  coward: { label: 'Coward', tip: 'hides, flees when hurt', min: 440, max: 680, lob: 0.5, err: 0.11, rate: 0.9, cover: 1, dodge: 0.9, build: 0.22, roll: 0.03, dive: 0.4, flee: true, tree: 0.4 },
};
export const PERSONA_KEYS = Object.keys(PERSONAS);

export class Brain {
  constructor(kid, persona) {
    this.k = kid; this.p = PERSONAS[persona]; this.key = persona;
    this.it = newIntent();
    this.thinkT = rand(0, 0.3); this.goal = null; this.target = null; this.holdT = 0; this.fireCd = rand(1.0, 2.2);
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1, 3); this.dodgeT = 0; this.dodgeX = 0; this.dodgeY = 0;
    this.seen = new WeakSet(); this.lastX = kid.x; this.lastY = kid.y; this.stuck = 0; this.detourT = 0; this.rollT = 0; this.zoneSpot = null;
    this.aimX = kid.x; this.aimY = kid.y; this.wantWall = false;
  }
  enemies(g) { const k = this.k; return g.kids.filter((o) => o !== k && o.alive && (!g.teams || o.team !== k.team)); }

  update(dt, g) {
    const k = this.k, it = this.it, w = g.world, sk = g.skill;
    it.fire = false; it.dive = false; it.wall = false; it.scoop = false; it.mx = 0; it.my = 0;
    if (!k.alive) return it;
    this.thinkT -= dt; this.fireCd -= dt; this.strafeT -= dt; this.dodgeT -= dt; this.detourT -= dt;
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = rand(1.2, 3); }
    if (this.thinkT <= 0) { this.thinkT = rand(0.2, 0.34) / (0.7 + sk * 0.4); this.think(g); }
    const t = this.target;

    // hold the throw for as long as the plan says, then let go
    if (this.holdT > 0) { this.holdT -= dt; it.fire = true; it.ax = this.aimX; it.ay = this.aimY; this.releasing = true; }
    else if (this.releasing) { it.ax = this.aimX; it.ay = this.aimY; this.releasing = false; }
    else if (t && t.alive) { it.ax = t.x; it.ay = t.y; }

    // start a throw?
    if (t && t.alive && this.holdT <= 0 && !k.charging && k.ammo > 0 && k.throwCd <= 0 && this.fireCd <= 0 && !k.ballRef && k.scoopT <= 0 && !g.frozen) this.planThrow(g, t);

    // movement toward the goal, steering round things
    let gx = this.goal ? this.goal.x : k.x, gy = this.goal ? this.goal.y : k.y;
    if (this.detourT > 0) { gx = this.detour.x; gy = this.detour.y; }
    let dx = gx - k.x, dy = gy - k.y, d = Math.hypot(dx, dy);
    if (d > 10) {
      dx /= d; dy /= d;
      const st = this.steer(w, dx, dy);
      const sp = d < 40 ? d / 40 : 1;
      it.mx = st.x * sp; it.my = st.y * sp;
    } else if (this.goal && this.goal.strafe && t) {
      // sidestep around the target while in range
      const ax = t.x - k.x, ay = t.y - k.y, al = Math.hypot(ax, ay) || 1;
      const st = this.steer(w, -ay / al * this.strafe, ax / al * this.strafe);
      it.mx = st.x * 0.7; it.my = st.y * 0.7;
    }
    // dodging beats everything
    if (this.dodgeT > 0) { it.mx = this.dodgeX; it.my = this.dodgeY; }
    else this.watchShots(g);
    if (this.goal && this.goal.scoop && d < 16) { it.mx = 0; it.my = 0; it.scoop = true; }
    // rolling a big one at someone
    if (this.rollT > 0) {
      this.rollT -= dt; it.roll = true;
      if (t && t.alive) { const ax = t.x - k.x, ay = t.y - k.y, al = Math.hypot(ax, ay) || 1; const st = this.steer(w, ax / al, ay / al); it.mx = st.x; it.my = st.y; if (al < 120 && k.ballRef) this.rollT = 0; }
      if (k.ballRef && (k.ballRef.r > 30 + sk * 14)) { if (!t || Math.hypot(t.x - k.x, t.y - k.y) < 320) this.rollT = Math.min(this.rollT, 0.25); }
      if (this.rollT <= 0) it.roll = false;
    } else it.roll = false;
    if (this.wantWall) { this.wantWall = false; it.wall = true; if (t) { it.ax = t.x; it.ay = t.y; } }
    if (!t || !t.alive) { if (!this.releasing && this.holdT <= 0) { it.ax = k.x + it.mx * 50; it.ay = k.y + it.my * 50; } }
    return it;
  }

  steer(w, dx, dy) {
    const k = this.k;
    if (w.freeAt(k.x + dx * 26, k.y + dy * 26, 12)) return { x: dx, y: dy };
    for (const a of [0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.3, -2.3]) {
      const s = this.strafe > 0 ? a : -a;
      const c = Math.cos(s), sn = Math.sin(s), x = dx * c - dy * sn, y = dx * sn + dy * c;
      if (w.freeAt(k.x + x * 26, k.y + y * 26, 12)) return { x, y };
    }
    return { x: dx, y: dy };
  }

  think(g) {
    const k = this.k, w = g.world, p = this.p;
    const foes = this.enemies(g);
    // stuck?
    const moved = Math.hypot(k.x - this.lastX, k.y - this.lastY);
    if (this.goal && Math.hypot(this.goal.x - k.x, this.goal.y - k.y) > 30 && moved < 6 && !k.charging && k.scoopT <= 0) this.stuck++; else this.stuck = 0;
    this.lastX = k.x; this.lastY = k.y;
    if (this.stuck >= 3) { this.stuck = 0; const a = rand(0, 6.28); this.detour = { x: clamp(k.x + Math.cos(a) * 140, EDGE + 30, W - EDGE - 30), y: clamp(k.y + Math.sin(a) * 140, EDGE + 30, H - EDGE - 30) }; this.detourT = 0.8; }

    // target: closest, with a pull toward wounded kids, the player and fort holders
    let best = null, bs = 1e9;
    for (const o of foes) {
      let s = Math.hypot(o.x - k.x, o.y - k.y);
      if (!w.losClear(k.x, k.y, o.x, o.y)) s += 160;
      s -= (o.maxhp - o.hp) * 50;
      if (o.isPlayer) s += 240 * (1 - g.skill); // easy maps: the AI picks on each other a lot more
      // don't dogpile: every other kid already after this one makes it less attractive
      let piled = 0; for (const b of g.brains.values()) if (b !== this && b.target === o && b.k.alive) piled++;
      s += piled * (o.isPlayer ? 150 : 70);
      if (g.modeKey === 'king' && g.inZone(o)) s -= 220;
      if (o === this.target) s -= 60;
      if (s < bs) { bs = s; best = o; }
    }
    this.target = best;
    const t = best, dist = t ? Math.hypot(t.x - k.x, t.y - k.y) : 1e9;

    // reload
    if (k.ammo === 0 || (k.ammo < 3 && dist > p.max + 120) || (k.ammo < MAX_AMMO - 1 && !t)) {
      if (!this.goal || !this.goal.scoop || w.snowAt(this.goal.x, this.goal.y) < 0.3) this.goal = this.findSnow(g, foes);
      if (this.goal) return;
    }
    if (this.goal && this.goal.scoop && k.ammo < 4 && w.snowAt(this.goal.x, this.goal.y) > 0.3) return;

    if (!t) { this.goal = g.modeKey === 'king' ? this.zoneGoal(g) : this.wanderGoal(g); return; }

    // king of the fort: get in there
    if (g.modeKey === 'king' && !g.inZone(k) && Math.random() < 0.85) { this.goal = this.zoneGoal(g); return; }

    // flee when hurt
    if (p.flee && k.hp <= 1) {
      const cv = this.findCover(g, t, 0);
      if (cv) { this.goal = cv; return; }
      const ax = k.x - t.x, ay = k.y - t.y, al = Math.hypot(ax, ay) || 1;
      this.goal = { x: clamp(k.x + ax / al * 200, EDGE + 40, W - EDGE - 40), y: clamp(k.y + ay / al * 200, EDGE + 40, H - EDGE - 40) };
      return;
    }

    // build a wall facing them when out in the open
    if (k.ammo >= 5 && dist < 520 && dist > 160 && Math.random() < p.build * 0.35 && w.losClear(k.x, k.y, t.x, t.y) && !this.nearCover(g, 70) && k.buildCd <= 0) {
      k.face = Math.atan2(t.y - k.y, t.x - k.x); this.wantWall = true; this.goal = { x: k.x, y: k.y }; return;
    }
    // roll a big one at them
    if (!k.ballRef && this.rollT <= 0 && Math.random() < p.roll * 0.25 && w.snowAt(k.x, k.y) > 0.5 && dist < 560 && dist > 160) { this.rollT = 3.2; return; }

    // take cover, or keep at our favourite range and strafe
    if (Math.random() < p.cover * 0.9) {
      const cv = this.findCover(g, t, (p.min + p.max) / 2);
      if (cv) { this.goal = cv; return; }
    }
    const want = (p.min + p.max) / 2;
    const ax = t.x - k.x, ay = t.y - k.y, al = Math.hypot(ax, ay) || 1;
    if (dist > p.max) this.goal = { x: t.x - ax / al * want, y: t.y - ay / al * want };
    else if (dist < p.min) this.goal = { x: clamp(k.x - ax / al * 120, EDGE + 30, W - EDGE - 30), y: clamp(k.y - ay / al * 120, EDGE + 30, H - EDGE - 30) };
    else this.goal = { x: k.x, y: k.y, strafe: true };
  }

  nearCover(g, r) { const k = this.k; return g.world.coverList().some((c) => Math.hypot(c.x - k.x, c.y - k.y) < c.r + r); }

  findCover(g, t, want) {
    const k = this.k, w = g.world;
    let best = null, bs = 1e9;
    for (const c of w.coverList()) {
      const dk = Math.hypot(c.x - k.x, c.y - k.y); if (dk > 420) continue;
      const ax = c.x - t.x, ay = c.y - t.y, al = Math.hypot(ax, ay) || 1;
      const off = c.rect ? Math.max(c.rect.w, c.rect.h) / 2 * 0.55 + 22 : c.r + 22;
      const x = c.x + ax / al * off, y = c.y + ay / al * off;
      if (!w.freeAt(x, y, KID_R)) continue;
      // claimed by someone else?
      if (g.kids.some((o) => o !== k && o.alive && Math.hypot(o.x - x, o.y - y) < 30)) continue;
      const s = dk + Math.abs(al - want) * 0.6 + (w.losClear(x, y, t.x, t.y) ? 120 : 0);
      if (s < bs) { bs = s; best = { x, y, cover: true }; }
    }
    return best;
  }

  findSnow(g, foes) {
    const k = this.k, w = g.world;
    let best = null, bs = -1e9;
    for (let i = 0; i < 18; i++) {
      const a = rand(0, 6.28), r = rand(20, 300);
      const x = clamp(k.x + Math.cos(a) * r, EDGE + 30, W - EDGE - 30), y = clamp(k.y + Math.sin(a) * r, EDGE + 30, H - EDGE - 30);
      const s0 = w.snowAt(x, y); if (s0 < 0.45 || !w.freeAt(x, y, KID_R)) continue;
      let threat = 0; for (const o of foes) { const d = Math.hypot(o.x - x, o.y - y); if (d < 260) threat += 260 - d; }
      const s = s0 * 120 - r * 0.25 - threat * 0.5;
      if (s > bs) { bs = s; best = { x, y, scoop: true }; }
    }
    return best;
  }
  zoneGoal(g) {
    const f = g.world.fort;
    if (!this.zoneSpot || Math.random() < 0.15) { const a = rand(0, 6.28), r = rand(0, f.r * 0.6); this.zoneSpot = { x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r * 0.8 }; }
    return this.zoneSpot;
  }
  wanderGoal(g) { return { x: rand(EDGE + 80, W - EDGE - 80), y: rand(EDGE + 80, H - EDGE - 80) }; }

  updateAim(g, t) {
    if (this.lobbing) return;
    const k = this.k, d = Math.hypot(t.x - k.x, t.y - k.y), tof = d / FLAT_SPEED;
    this.aimX = t.x + t.vx * tof * this.lead; this.aimY = t.y + t.vy * tof * this.lead;
  }

  planThrow(g, t) {
    const k = this.k, w = g.world, p = this.p, sk = g.skill;
    this.treeShot = false; this.lobbing = false;
    const d = Math.hypot(t.x - k.x, t.y - k.y);
    this.lead = 0.4 + sk * 0.6;
    // a tree full of snow over their head?
    if (Math.random() < p.tree * sk) {
      for (const tr of w.trees) {
        if (tr.snow < 0.8) continue;
        if (Math.hypot(t.x - tr.x, t.y - tr.y) > 62 * tr.s) continue;
        const dt2 = Math.hypot(tr.x - k.x, tr.y - k.y);
        if (dt2 < FLAT_RANGE * 0.9 && w.losClear(k.x, k.y, tr.x, tr.y)) {
          this.aimX = tr.x; this.aimY = tr.y; this.holdT = 0.05; this.treeShot = true; this.lobbing = true;
          this.fireCd = p.rate * rand(0.8, 1.3) / (0.35 + sk * 0.8); return;
        }
      }
    }
    const los = w.losClear(k.x, k.y, t.x, t.y);
    const err = p.err * (2.0 - sk * 1.3);
    if (los && d < FLAT_RANGE * 0.92 && !(d > 300 && Math.random() < p.lob)) {
      const tof = d / FLAT_SPEED;
      let ax = t.x + t.vx * tof * this.lead, ay = t.y + t.vy * tof * this.lead;
      const a = Math.atan2(ay - k.y, ax - k.x) + rand(-err, err), r = Math.hypot(ax - k.x, ay - k.y);
      this.aimX = k.x + Math.cos(a) * r; this.aimY = k.y + Math.sin(a) * r;
      this.holdT = 0.05; this.lobbing = true;
    } else if (d < LOB_MAX1 * 0.96 && d > 120) {
      const T = 0.55 + d / 1500;
      const ax = t.x + t.vx * T * this.lead * 0.8, ay = t.y + t.vy * T * this.lead * 0.8;
      const need = clamp((Math.hypot(ax - k.x, ay - k.y) - LOB_MAX0) / (LOB_MAX1 - LOB_MAX0), 0, 1);
      const e = d * err * 0.9;
      this.aimX = ax + rand(-e, e); this.aimY = ay + rand(-e, e);
      this.holdT = TAP_T + 0.02 + need * CHARGE_T + 0.03; this.lobbing = true;
    } else { this.fireCd = 0.3; return; }
    this.fireCd = p.rate * rand(0.8, 1.3) / (0.35 + sk * 0.8);
  }

  watchShots(g) {
    const k = this.k, p = this.p, sk = g.skill;
    for (const s of g.shots) {
      if (s.dead || s.owner === k || this.seen.has(s)) continue;
      if (g.teams && s.owner.team === k.team) continue;
      if (s.lob) {
        if (s.t < 0.35) continue;
        const d = Math.hypot(s.tx - k.x, s.ty - k.y);
        if (d < 48) { this.seen.add(s); if (Math.random() < p.dodge * (0.4 + sk * 0.6)) { const a = Math.atan2(k.y - s.ty, k.x - s.tx); this.dodgeX = Math.cos(a); this.dodgeY = Math.sin(a); this.dodgeT = 0.35; } }
        continue;
      }
      const rx = k.x - s.x, ry = k.y - s.y, vx = s.dx, vy = s.dy;
      const along = rx * vx + ry * vy; if (along < 0 || along > 260) continue;
      const perp = rx * vy - ry * vx; if (Math.abs(perp) > 30) continue;
      this.seen.add(s);
      if (Math.random() < p.dodge * (0.35 + sk * 0.55)) {
        const side = perp >= 0 ? 1 : -1;
        this.dodgeX = vy * side; this.dodgeY = -vx * side; this.dodgeT = 0.28;
        if (Math.random() < p.dive && k.diveCd <= 0 && along < 170) { this.it.dive = true; this.it.mx = this.dodgeX; this.it.my = this.dodgeY; }
      }
      break;
    }
  }
}
