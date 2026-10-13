// FRONTLINE AI. Every NPC (ally or enemy) runs one Brain; brains in a Squad share a
// contact board via radio call-outs. A Brain:
//  - PERCEIVES: vision cone + line of sight with a detection meter (distance, stance,
//    movement, muzzle flashes, smoke/foliage), hearing (gunshots, footsteps, explosions,
//    bullets cracking past), and remembers each enemy's last known position.
//  - DECIDES (4 Hz) with priorities: dodge grenades > revive > retreat when hurt >
//    hide when suppressed > fight (cover / peek / grenade / flank / suppress) >
//    search last known position > investigate sounds > play the objective.
//  - ACTS every frame by writing the same `intent` the player's keyboard writes.
import { Nav } from './nav.js';
import { clamp, lerp, DEG, angDiff, approachAng, yawTo, fwdX, fwdZ, R, segDist } from './util.js';
import { WEAPONS } from './weapons.js';

export const DIFF = {
  recruit: { name: 'RECRUIT', react: 0.85, err: 4.4, settle: 1.6, turn: 3.0, view: 70, hear: 0.75, gren: 0.25, spread: 1.45, detect: 0.75, adv: 10, open: 2.4 },
  regular: { name: 'REGULAR', react: 0.5, err: 2.7, settle: 1.0, turn: 4.8, view: 88, hear: 1.0, gren: 0.55, spread: 1.08, detect: 1.0, adv: 7, open: 2.0 },
  veteran: { name: 'VETERAN', react: 0.33, err: 1.9, settle: 0.75, turn: 6.5, view: 105, hear: 1.2, gren: 0.8, spread: 0.95, detect: 1.25, adv: 5, open: 1.5 },
  elite: { name: 'ELITE', react: 0.21, err: 1.3, settle: 0.5, turn: 8.5, view: 120, hear: 1.4, gren: 1.0, spread: 0.85, detect: 1.5, adv: 3.5, open: 1.15 },
};

export const ROLE_KIT = {
  rifleman: { primary: ['ar', 'burst'], secondary: 'pistol', grenade: 'frag' },
  support: { primary: ['lmg'], secondary: 'pistol', grenade: 'frag' },
  flanker: { primary: ['smg', 'shotgun'], secondary: 'pistol', grenade: 'frag' },
  marksman: { primary: ['dmr', 'sniper'], secondary: 'pistol', grenade: 'frag' },
  medic: { primary: ['ar', 'smg'], secondary: 'pistol', grenade: 'smoke' },
};
export function roleLoadout(role, rnd = Math.random) {
  const k = ROLE_KIT[role];
  const p = k.primary[Math.floor(rnd() * k.primary.length)];
  const att = [];
  if (p === 'dmr' || (p === 'ar' && rnd() < 0.3)) att.push('scope');
  if (rnd() < 0.4 && p !== 'shotgun') att.push('grip');
  if (role === 'flanker' && rnd() < 0.4) att.push('suppressor');
  return { primary: { id: p, att }, secondary: { id: k.secondary, att: [] }, grenade: k.grenade };
}

const MEMORY = 22; // seconds before an unseen contact is forgotten
let THINK_SEED = 0;

export class Squad {
  constructor(id, team, name) {
    this.id = id; this.team = team; this.name = name;
    this.members = []; this.order = null; // { type:'attack'|'defend'|'hunt', point, x, z }
    this.lastCallout = new Map();
  }
  get leader() { return this.members.find((m) => m.alive && !m.downed) || this.members[0]; }
}

class Mem {
  constructor(s) { this.s = s; this.x = 0; this.y = 0; this.z = 0; this.t = -99; this.seen = false; this.vis = 0; this.src = 'none'; this.firstSeen = -99; this.vx = 0; this.vz = 0; this.stillSince = 0; this.err = 0; }
}

export class Brain {
  constructor(me, match, squad, diff) {
    this.me = me; this.match = match; this.squad = squad; this.d = diff;
    this.role = me.role;
    this.mem = new Map();
    this.state = 'objective'; this.sub = ''; this.stateT = 0;
    this.target = null;
    this.cover = null;
    this.path = null; this.pi = 0; this.dest = null; this.destKey = ''; this.repathT = 0;
    this.moveMode = 'run';
    this.percT = (THINK_SEED++ % 8) * 0.017; this.thinkT = (THINK_SEED % 5) * 0.05;
    this.aimYaw = 0; this.aimPitch = 0; this.errY = 0; this.errP = 0; this.errTY = 0; this.errTP = 0; this.errT = 0; this.trackT = 0;
    this.reactT = 0; this.burst = 0; this.burstPause = 0;
    this.gCD = 4 + R() * 6; this.calloutCD = 0;
    this.suppress = 0; this.alertT = 0;
    this.stuckT = 0; this.lastPX = 0; this.lastPZ = 0;
    this.peekFails = 0; this.hideT = 0; this.peekT = 0;
    this.flankDone = false; this.flankSide = R() < 0.5 ? -1 : 1;
    this.searchT = 0; this.lookT = 0; this.lookYaw = 0;
    this.hurtT = -99; this.retreating = false;
    this.reviveTarget = null; this.reviveSmoke = false;
    this.dbg = { line: '', cover: null, peek: null, path: null, lkp: null, heard: [], vis: [] };
    this.say = null; // last radio line
  }
  onSpawn() {
    this.mem.clear(); this.target = null; this.cover = null; this.path = null; this.dest = null;
    this.state = 'objective'; this.stateT = 0; this.suppress = 0; this.retreating = false; this.flankDone = false;
    this.aimYaw = this.me.yaw; this.aimPitch = 0; this.reviveTarget = null; this.perch = null; this.perchFor = null;
    this.gCD = 3 + R() * 5;
  }
  // multiplier on weapon spread for this bot (difficulty + suppression)
  spreadMul() { return this.d.spread * (1 + this.suppress * 0.9) * (this.me.hp < 40 ? 1.15 : 1); }

  // ------------------------------------------------------------------ perception
  memOf(s) { let m = this.mem.get(s.id); if (!m) { m = new Mem(s); this.mem.set(s.id, m); } return m; }
  note(s, x, y, z, src, err = 0) {
    const m = this.memOf(s);
    const now = this.match.time;
    if (m.seen && src !== 'seen') return m;
    if (src !== 'seen' && m.t > now - 0.5 && m.err <= err) return m;
    const ex = err ? (R() - 0.5) * 2 * err : 0, ez = err ? (R() - 0.5) * 2 * err : 0;
    if (src === 'seen') {
      const dt = Math.max(0.05, now - m.t);
      if (m.t > now - 1) { m.vx = lerp(m.vx, (x - m.x) / dt, 0.5); m.vz = lerp(m.vz, (z - m.z) / dt, 0.5); }
      if (Math.hypot(x - m.x, z - m.z) > 1.2) m.stillSince = now;
    } else if (m.t < now - 3) m.stillSince = now;
    m.x = x + ex; m.y = y; m.z = z + ez; m.t = now; m.src = src; m.err = err;
    return m;
  }
  perceive(dt) {
    const me = this.me, M = this.match, W = M.world, now = M.time;
    const eye = me.eye(this._eye || (this._eye = me.pos.clone()));
    const alert = now < this.alertT;
    const view = this.d.view * (M.fogVis || 1);
    this.dbg.vis.length = 0;
    for (const e of M.soldiers) {
      if (e.team === me.team || !e.alive) continue;
      const m = this.mem.get(e.id);
      if (e.downed) { if (m) m.seen = false; continue; }
      const c = e.chest(this._c || (this._c = me.pos.clone()));
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      let visible = false;
      if (d < view) {
        const ad = Math.abs(angDiff(this.aimYaw, yawTo(dx, dz)));
        const half = (alert ? 80 : 62) * DEG;
        let periph = ad < half ? 1 : ad < 115 * DEG ? 0.3 : d < 4 ? 0.5 : 0;
        if (periph > 0) {
          const h = e.head(this._h || (this._h = me.pos.clone()));
          const chestVis = W.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z, true);
          const headVis = chestVis || W.clear(eye.x, eye.y, eye.z, h.x, h.y, h.z, true);
          if (headVis) {
            visible = true;
            const mm = this.memOf(e);
            let rate = (1.0 + 5.5 * Math.pow(1 - d / view, 1.6)) * periph * this.d.detect;
            rate *= lerp(1, 0.55, e.crouchK);
            rate *= e.speedNow > 2.5 ? 1.35 : e.speedNow < 0.4 ? 0.7 : 1;
            if (now - e.lastShot < 0.5 && !e.w.s.suppressed) rate *= 4;
            if (alert) rate *= 1.6;
            if (mm.t > now - 4) rate *= 2.5; // already know roughly where they are
            mm.vis = Math.min(1.2, mm.vis + rate * dt);
            mm.headOnly = !chestVis;
            if (mm.vis >= 1) {
              const wasSeen = mm.seen;
              const fresh = mm.t < now - 2.5;
              this.note(e, e.pos.x, e.pos.y, e.pos.z, 'seen');
              mm.seen = true;
              if (!wasSeen) {
                mm.firstSeen = now;
                if (fresh || this.target !== mm) this.reactT = this.d.react * (alert ? 0.75 : 1) * (0.8 + R() * 0.45);
                if (fresh) this.callContact(e);
              }
            }
            this.dbg.vis.push([e, mm.vis]);
          }
        }
      }
      if (!visible && m) {
        m.seen = false;
        m.vis = Math.max(0, m.vis - dt * 0.4);
      }
    }
    // hearing
    const hear = this.d.hear;
    for (const s of M.sounds) {
      if (s.t <= this.lastHeard) continue;
      if (!s.src || s.src.team === me.team || !s.src.alive) continue;
      const d = Math.hypot(s.x - me.pos.x, s.z - me.pos.z);
      if (d > s.r * hear) continue;
      const m = this.memOf(s.src);
      if (m.seen) continue;
      const err = Math.min(8, d * (s.kind === 'shot' ? 0.08 : 0.14));
      this.note(s.src, s.x, s.y, s.z, 'heard', err);
      if (s.kind === 'shot' || s.kind === 'boom') this.alertT = now + 12;
      else this.alertT = Math.max(this.alertT, now + 5);
      this.dbg.heard.push({ x: s.x, z: s.z, t: now });
    }
    this.lastHeard = M.soundClock;
    while (this.dbg.heard.length && this.dbg.heard[0].t < now - 1.5) this.dbg.heard.shift();
    // forget
    for (const [id, m] of this.mem) if (!m.s.alive || (m.t < now - MEMORY && m.vis <= 0.01)) { if (this.target === m) this.target = null; this.mem.delete(id); }
  }
  onNearMiss(shooter, amount) {
    const now = this.match.time;
    this.suppress = Math.min(1.3, this.suppress + amount);
    this.alertT = now + 12;
    const m = this.memOf(shooter);
    if (!m.seen) this.note(shooter, shooter.pos.x, shooter.pos.y, shooter.pos.z, 'heard', 2.5);
  }
  onDamage(attacker, dmg) {
    const now = this.match.time;
    this.hurtT = now;
    this.suppress = Math.min(1.3, this.suppress + 0.25 + dmg / 120);
    this.alertT = now + 15;
    if (attacker && attacker.team !== this.me.team) {
      const m = this.memOf(attacker);
      if (!m.seen) this.note(attacker, attacker.pos.x, attacker.pos.y, attacker.pos.z, 'hit', 1.2);
      m.lastHurtMe = now;
      if (this.state === 'incover' && this.sub === 'hide' && this.cover && this.cover.c) { this.cover.c.badT = now + 8; this.thinkT = 0; }
      // turn toward the shooter immediately
      this.lookYaw = yawTo(attacker.pos.x - this.me.pos.x, attacker.pos.z - this.me.pos.z);
      this.lookT = now + 1.2;
    }
    if (this.state === 'objective' || this.state === 'investigate') this.thinkT = 0;
  }
  // ---------------------------------------------------------------- squad radio
  radio(text, key, cd = 6) {
    const now = this.match.time;
    // contact call-outs are shared by the whole team, so five soldiers never shout the same spot
    const M = this.match;
    const book = key.startsWith('contact:') ? ((M.teamCallouts || (M.teamCallouts = [new Map(), new Map()]))[this.me.team]) : this.squad.lastCallout;
    if ((book.get(key) || -99) > now - cd) return false;
    book.set(key, now);
    this.say = { text, t: now };
    this.match.radio(this.me, text);
    return true;
  }
  callContact(e) {
    const now = this.match.time;
    const delay = 0.4 + R() * 0.6;
    const pos = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
    this.match.later(delay, () => {
      if (!this.me.alive || this.me.downed) return;
      const where = this.match.regionName(pos.x, pos.z);
      const n = this.countSeen();
      const label = e.isPlayer && this.me.team !== this.match.playerTeam ? 'Hostile' : (n > 1 ? `${n} contacts` : 'Contact');
      this.radio(`${label}, ${where}!`, 'contact:' + Math.round(pos.x / 15) + ':' + Math.round(pos.z / 15), 7);
      // share with squad (exact-ish) and nearby team (vaguer)
      for (const s of this.match.soldiers) {
        if (s === this.me || s.team !== this.me.team || !s.brain || !s.alive) continue;
        const sameSquad = s.brain.squad === this.squad;
        const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
        if (!sameSquad && d > 70) continue;
        s.brain.note(e, pos.x, pos.y, pos.z, 'callout', sameSquad ? 1.0 : 3.5);
        s.brain.alertT = Math.max(s.brain.alertT, this.match.time + 10);
      }
      this.match.onCallout(this.me, e, pos);
    });
    return now;
  }
  countSeen() { let n = 0; for (const m of this.mem.values()) if (m.seen) n++; return n; }

  // -------------------------------------------------------------- target choice
  chooseTarget() {
    const me = this.me, now = this.match.time;
    let best = null, bs = -1e9;
    for (const m of this.mem.values()) {
      const e = m.s;
      if (!e.alive || e.downed || m.t < 0 && !m.seen) continue;
      const age = now - m.t;
      if (age > MEMORY) continue;
      const d = Math.hypot(m.x - me.pos.x, m.z - me.pos.z);
      let s = (m.seen ? 120 : 0) - age * 4 - d * 0.6;
      // is it aiming at me?
      if (m.seen) { const a = Math.abs(angDiff(e.yaw, yawTo(me.pos.x - e.pos.x, me.pos.z - e.pos.z))); if (a < 0.25) s += 25; }
      if (m.lastHurtMe && now - m.lastHurtMe < 4) s += 35;
      if (e.hp < 40) s += 10;
      if (m === this.target) s += 18;
      if (s > bs) { bs = s; best = m; }
    }
    if (best !== this.target) { this.trackT = 0; this.peekFails = 0; }
    this.target = best;
    return best;
  }

  // ------------------------------------------------------------------ cover
  // threat: {x,y,z}. Returns best cover candidate or null.
  findCover(threat, o = {}) {
    const me = this.me, M = this.match, W = M.world, nav = M.nav, now = M.time;
    const maxD = o.maxD || 16;
    const list = nav.coverNear(o.cx ?? me.pos.x, o.cz ?? me.pos.z, maxD, this._cl || (this._cl = []));
    const tdMe = Math.hypot(threat.x - me.pos.x, threat.z - me.pos.z);
    const pref = this.prefRange();
    const cand = [];
    for (const c of list) {
      if (c.claim && c.claim !== me && c.claimT > now && c.claim.alive) continue;
      if (c.badT > now) continue;
      const tdx = threat.x - c.x, tdz = threat.z - c.z;
      const dT = Math.hypot(tdx, tdz);
      if (dT < 5) continue;
      const cf = Nav.coverFrom(c, tdx, tdz);
      if (cf <= 0) continue;
      const dMe = Math.hypot(c.x - me.pos.x, c.z - me.pos.z);
      let s = cf * 22 - dMe * 1.3;
      if (o.retreat) s += (dT - tdMe) * 1.8; // further from the threat
      else s -= Math.abs(dT - pref) * 0.35;
      if (!o.retreat && dT < tdMe - 10 && this.role !== 'flanker') s -= (tdMe - dT) * 0.8; // don't run at them
      if (this.role === 'marksman') s += (c.h - M.world.groundY(c.x, c.z) + Math.max(0, c.h)) * 4;
      if (o.goal) { const dg = Math.hypot(c.x - o.goal.x, c.z - o.goal.z); s -= Math.max(0, dg - (o.goal.r || 8)) * 0.7;
        if (o.advance) { const dgMe = Math.hypot(me.pos.x - o.goal.x, me.pos.z - o.goal.z); if (dg > dgMe - 3.5) continue; s += (dgMe - dg) * 3; } }
      // keep distance from squadmates' cover
      for (const s2 of this.squad.members) if (s2 !== me && s2.brain && s2.brain.cover) { const dd = Math.hypot(s2.brain.cover.x - c.x, s2.brain.cover.z - c.z); if (dd < 3) s -= (3 - dd) * 6; }
      // avoid known grenades
      for (const g of M.grenades) if (g.type === 'frag' && Math.hypot(g.pos.x - c.x, g.pos.z - c.z) < 7) s -= 60;
      cand.push([s, c, cf]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    let best = null, bs = -1e9;
    const ty = threat.y + 1.5;
    for (let k = 0; k < Math.min(9, cand.length); k++) {
      const [s0, c, cf] = cand[k];
      const low = cf < 1.5;
      const hideY = c.h + (low ? 0.85 : 1.35);
      const protectedNow = !W.clear(threat.x, ty, threat.z, c.x, hideY, c.z, false);
      if (!protectedNow) continue;
      let s = s0 + 40;
      // exposed to another enemy we know about? heavy penalty
      for (const m of this.freshThreats(threat)) if (W.clear(m.x, m.y + 1.5, m.z, c.x, hideY, c.z, true)) s -= 45;
      let peek = null;
      if (!o.retreat) {
        if (low) {
          if (W.clear(c.x, c.h + 1.6, c.z, threat.x, ty - 0.3, threat.z, true)) { s += 18; peek = { x: c.x, z: c.z, stand: true }; }
        } else {
          // try side steps perpendicular to the threat
          const L = Math.hypot(threat.x - c.x, threat.z - c.z) || 1;
          const px = -(threat.z - c.z) / L, pz = (threat.x - c.x) / L;
          for (const off of [1.1, -1.1, 1.7, -1.7]) {
            const qx = c.x + px * off, qz = c.z + pz * off;
            if (!M.nav.isWalk(qx, qz)) continue;
            const qh = M.nav.heightAt(qx, qz);
            if (Math.abs(qh - c.h) > 0.5) continue;
            if (W.clear(qx, qh + 1.55, qz, threat.x, ty - 0.3, threat.z, true)) { s += 14; peek = { x: qx, z: qz, stand: false }; break; }
          }
        }
        if (!peek) s -= 25;
      }
      if (s > bs) { bs = s; best = { c, x: c.x, z: c.z, h: c.h, low, peek, tx: threat.x, tz: threat.z, score: s }; }
    }
    return best;
  }
  claimCover(cv) {
    if (this.cover && this.cover.c) { this.cover.c.claim = null; }
    this.cover = cv;
    if (cv) { cv.c.claim = this.me; cv.c.claimT = this.match.time + 15; }
  }
  // is my current cover still protecting me from this threat position?
  coverHolds(threat) {
    const cv = this.cover;
    if (!cv) return false;
    if (Math.hypot(this.me.pos.x - cv.x, this.me.pos.z - cv.z) > 1.6) return false;
    if (cv.c.badT > this.match.time) return false;
    const W = this.match.world, hy = cv.h + (cv.low ? 0.85 : 1.35);
    if (!W.clear(threat.x, threat.y + 1.5, threat.z, cv.x, hy, cv.z, false)) {
      // also safe from the other enemies we know are watching us?
      for (const m of this.freshThreats(threat)) if (W.clear(m.x, m.y + 1.5, m.z, cv.x, hy, cv.z, true)) return false;
      return true;
    }
    return false;
  }
  // other enemies we currently see or that hurt us in the last few seconds (max 3)
  freshThreats(except) {
    const now = this.match.time, out = this._ft || (this._ft = []);
    out.length = 0;
    for (const m of this.mem.values()) {
      if (m === except || !m.s.alive || m.s.downed) continue;
      if (m.seen || (m.lastHurtMe && now - m.lastHurtMe < 3)) { out.push(m); if (out.length >= 3) break; }
    }
    return out;
  }
  prefRange() {
    const w = this.me.w.s;
    const base = w.aiRange || 25;
    return this.role === 'marksman' ? Math.max(base, 40) : this.role === 'flanker' ? Math.min(base, 15) : base;
  }

  // ------------------------------------------------------------------ movement
  goTo(x, z, mode = 'run', o = {}) {
    const key = Math.round(x * 2) + ':' + Math.round(z * 2) + (o.danger ? 'd' : '');
    this.moveMode = mode;
    const now = this.match.time;
    if (this.destKey === key && this.path && now < this.repathT) return;
    if (this.destKey === key && this.path && this.pi < this.path.length && now < this.repathT + 2) { this.repathT = now + 3; return; }
    this.destKey = key;
    this.dest = { x, z };
    this.path = this.match.nav.findPath(this.me.pos.x, this.me.pos.z, x, z, o.danger ? { danger: o.danger } : undefined);
    this.pi = 0;
    this.repathT = now + 3 + R();
    this.dbg.path = this.path;
  }
  stop() { this.path = null; this.dest = null; this.destKey = ''; }
  arrived(r = 0.8) { return !this.dest || Math.hypot(this.dest.x - this.me.pos.x, this.dest.z - this.me.pos.z) < r; }
  steer(dt) {
    const me = this.me, it = me.intent;
    it.mx = 0; it.mz = 0;
    if (!this.path || !this.dest) return 0;
    while (this.pi < this.path.length) {
      const p = this.path[this.pi];
      const d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
      if (d < (this.pi === this.path.length - 1 ? 0.35 : 0.9)) this.pi++; else break;
    }
    if (this.pi >= this.path.length) { return 0; }
    const p = this.path[this.pi];
    let dx = p.x - me.pos.x, dz = p.z - me.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    // separation from nearby soldiers
    for (const o of this.match.soldiers) {
      if (o === me || !o.alive) continue;
      const ox = me.pos.x - o.pos.x, oz = me.pos.z - o.pos.z, od = Math.hypot(ox, oz);
      if (od < 1.2 && od > 0.01) { dx += ox / od * (1.2 - od) * 1.5; dz += oz / od * (1.2 - od) * 1.5; }
    }
    const L2 = Math.hypot(dx, dz) || 1;
    let k = 1;
    const last = this.pi === this.path.length - 1;
    if (last && L < 1.5) k = Math.max(0.35, L / 1.5);
    it.mx = dx / L2 * k; it.mz = dz / L2 * k;
    // stuck detection
    const moved = Math.hypot(me.pos.x - this.lastPX, me.pos.z - this.lastPZ);
    this.lastPX = me.pos.x; this.lastPZ = me.pos.z;
    if (moved < 0.4 * dt) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.8) { it.jump = true; }
    if (this.stuckT > 2.0) { this.stuckT = 0; this.repathT = 0; this.destKey = ''; this.path = this.match.nav.findPath(me.pos.x, me.pos.z, this.dest.x, this.dest.z); this.pi = 0; }
    return L;
  }
  moveYaw() {
    const me = this.me;
    if (this.path && this.pi < this.path.length) { const p = this.path[this.pi]; return yawTo(p.x - me.pos.x, p.z - me.pos.z); }
    return me.yaw;
  }

  // ------------------------------------------------------------------ think
  setState(s, sub = '') { if (this.state !== s) { this.state = s; this.stateT = this.match.time; } this.sub = sub; }
  think() {
    const me = this.me, M = this.match, now = M.time;
    const T = this.chooseTarget();
    const age = T ? now - T.t : 99;
    const vis = T && T.seen;
    const hpK = me.hp / me.maxHp;
    // 1. dodge live frags
    const g = this.noticedGrenade();
    if (g) {
      if (this.state !== 'evade') this.radio('Grenade!', 'grenade', 3);
      const dx = me.pos.x - g.pos.x, dz = me.pos.z - g.pos.z, L = Math.hypot(dx, dz) || 1;
      this.setState('evade');
      this.goTo(me.pos.x + dx / L * 9, me.pos.z + dz / L * 9, 'sprint');
      return;
    }
    // 2. revive downed teammates (medics go further, everyone helps when close and calm)
    const rv = this.pickRevive(T, vis);
    if (rv) { this.reviveTarget = rv; if (this.state !== 'revive') { this.reviveSmoke = false; this.radio(rv.isPlayer ? 'Hang on, I\'ve got you!' : `Moving to ${rv.name}!`, 'revive' + rv.id, 8); } this.setState('revive'); return; }
    this.reviveTarget = null;
    // 3. retreat when badly hurt
    if (hpK < (this.role === 'flanker' ? 0.3 : 0.4) && T && age < 8 && !this.retreating) {
      const cv = this.findCover(T, { retreat: true, maxD: 22 });
      if (cv) { this.claimCover(cv); this.retreating = true; this.radio('I\'m hit, falling back!', 'retreat', 10); this.setState('retreat'); return; }
    }
    if (this.retreating) {
      if (hpK > 0.75 || (!T || age > 12)) { this.retreating = false; }
      else { this.setState('retreat'); return; }
    }
    // 4. suppressed: get down
    const suppLimit = this.role === 'support' ? 0.9 : 0.6;
    if (this.suppress > suppLimit && T) {
      if (this.cover && this.coverHolds(T)) { this.setState('incover', 'hide'); this.hideT = now + 1.2 + this.suppress; return; }
      const cv = this.findCover(T, { maxD: 10 });
      if (cv) { this.claimCover(cv); this.setState('cover', 'urgent'); return; }
    }
    // a flank in progress keeps going unless the target is right on top of us
    if (this.state === 'flank' && T && !this.flankDone && now - this.stateT < 20 && hpK > 0.35) {
      const dist = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
      if (!(vis && dist < 12)) return;
    }
    // marksman: keep heading for the perch unless the fight is close or hurting us
    const onPerch = this.perch && this.cover === this.perch && Math.hypot(me.pos.x - this.perch.x, me.pos.z - this.perch.z) < 1.6;
    if (this.role === 'marksman' && this.perch && !onPerch && T && now - this.hurtT > 3 && this.suppress < 0.4 && Math.hypot(T.x - me.pos.x, T.z - me.pos.z) > 28) { this.setState('objective'); return; }
    // attacking an objective: far-off enemies are not worth stopping for, keep pushing
    // (shooting on the move); an all-in push (stalled squad) only stops for close fights
    {
      const o = this.squad.order;
      if (o && o.point && o.type === 'attack' && this.role !== 'marksman' && T && hpK > 0.45 && this.suppress < 0.6 && (o.point.owner !== me.team || o.point.contested)) {
        const dT = Math.hypot(T.x - me.pos.x, T.z - me.pos.z), dObj = Math.hypot(o.point.x - me.pos.x, o.point.z - me.pos.z);
        const far = o.push ? 15 : Math.max(32, this.prefRange() * 1.3);
        const hurtByT = T.lastHurtMe && now - T.lastHurtMe < 2.5;
        if (dObj > o.point.r * 0.7 && dT > far && !hurtByT && !(this.state === 'flank' && !this.flankDone)) { this.setState('objective', 'push'); return; }
      }
    }
    // 5. engaged
    if (T && (vis || age < 1.5)) {
      const dist = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
      if (onPerch && dist > 15 && this.suppress < 0.75) { if (this.state !== 'incover') { this.setState('incover', 'peek'); this.peekT = now + 2.5; } return; }
      // close-quarters weapons push in
      const cqb = me.w.s.aiRange <= 16 && dist < 14;
      if (this.wantGrenade(T, vis, dist)) { this.throwAt(T); return; }
      if (this.role === 'flanker' && !this.flankDone && dist > 14 && dist < 45 && this.squadEngaging(T) && hpK > 0.5 && this.startFlank(T)) return;
      if (cqb) { this.setState('engage', 'rush'); return; }
      if (this.tryAdvance(T, hpK)) return;
      if (this.cover && this.coverHolds(T) && !this.coverFlanked(T)) { if (this.state !== 'incover') { this.setState('incover', 'peek'); this.peekT = now + 1.5; } return; }
      if (this.state === 'cover' && this.cover && !this.arrived(1.0)) return; // keep moving to chosen cover
      const cv = this.findCover(T, { maxD: this.role === 'marksman' ? 24 : 14, goal: this.goalInfo() });
      if (cv && (!this.cover || cv.c !== this.cover.c)) { this.claimCover(cv); this.setState('cover', 'move'); this.radio(R() < 0.5 ? 'Moving to cover!' : 'Covering!', 'cover' + me.id, 12); return; }
      this.setState('engage', 'strafe');
      return;
    }
    // 6. known but hidden
    if (T && age < 14) {
      const dist = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
      if (this.wantGrenade(T, false, dist)) { this.throwAt(T); return; }
      if (this.role === 'support' && age < 5 && dist < 60) { this.setState('suppress'); if (this.radio('Suppressing!', 'supp', 9)) {} return; }
      if (this.role === 'flanker' && !this.flankDone && hpK > 0.5 && dist > 10 && dist < 45 && this.startFlank(T)) return;
      if (this.tryAdvance(T, hpK)) return;
      const hold = this.role === 'marksman' ? 9 : this.role === 'support' ? 6 : 3.5;
      if (age < hold && this.cover && this.coverHolds(T)) { this.setState('incover', this.sub === 'hide' ? 'hide' : 'peek'); return; }
      if (age < hold) { this.setState('hold'); return; }
      this.setState('search');
      return;
    }
    // 7. investigate sounds (only real alert sources)
    if (T && age < MEMORY && (T.src === 'heard' || T.src === 'callout')) {
      this.setState('investigate');
      return;
    }
    // 8. objective
    this.flankDone = false;
    this.setState('objective');
  }
  // a live frag near us that we have seen land, or that a squadmate yelled about
  noticedGrenade() {
    const me = this.me, M = this.match, now = M.time;
    const g = M.grenadeNear(me.pos, 7, me.team);
    if (!g) return null;
    g.notice = g.notice || new Map();
    let at = g.notice.get(me.id);
    if (at === undefined) {
      const e = me.eye(this._eye6 || (this._eye6 = me.pos.clone()));
      const seen = M.world.clear(e.x, e.y, e.z, g.pos.x, g.pos.y + 0.1, g.pos.z, true) && (Math.abs(angDiff(this.aimYaw, yawTo(g.pos.x - me.pos.x, g.pos.z - me.pos.z))) < 75 * DEG || Math.hypot(g.pos.x - me.pos.x, g.pos.z - me.pos.z) < 3);
      let warned = false;
      for (const [id, t] of g.notice) if (t <= now) { const o = M.soldiers.find((q) => q.id === id); if (o && o.team === me.team && Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z) < 20) warned = true; }
      if (!seen && !warned) return null;
      at = now + this.d.react * (seen ? 0.9 : 1.2) + R() * 0.35;
      g.notice.set(me.id, at);
    }
    return at <= now ? g : null;
  }
  // bounding overwatch: while attacking an objective, one squadmate at a time moves up to
  // cover that is closer to the point; the others peek and lay down covering fire.
  tryAdvance(T, hpK) {
    const me = this.me, now = this.match.time, o = this.squad.order;
    if (!o || !o.point || this.role === 'marksman') return false;
    const attacking = o.point.owner !== me.team || o.point.contested;
    if (!attacking) return false;
    if (this.state !== 'incover' && this.state !== 'hold') return false;
    if (now - this.stateT < (this.advDelay || this.d.adv) * (o.push ? 0.5 : 1)) return false;
    if (hpK < 0.5 || this.suppress > (o.push ? 0.6 : 0.45) || (this.squad.moverUntil || 0) > now) return false;
    const goal = { x: o.point.x, z: o.point.z, r: o.point.r };
    if (Math.hypot(me.pos.x - goal.x, me.pos.z - goal.z) < goal.r * 0.8) return false;
    const cv = this.findCover(T, { maxD: 18, goal, advance: true });
    this.advDelay = this.d.adv * (0.7 + R() * 0.6);
    if (!cv) { this.stateT = now - this.advDelay * 0.5; return false; }
    this.claimCover(cv);
    this.squad.moverUntil = now + 3.5;
    this.squad.mover = me;
    this.radio(R() < 0.5 ? 'Moving up, cover me!' : 'Pushing forward!', 'adv' + me.id, 8);
    this.setState('cover', 'advance');
    return true;
  }
  // marksman perch: an elevated cover point (tower, roof, hill) within 60 m of the objective
  // with a clear sightline onto it, preferably on our side
  findPerch(p, ax, az) {
    const me = this.me, M = this.match, W = M.world, now = M.time;
    const py = p.y || 0;
    const list = M.nav.coverNear(p.x, p.z, 60, this._pl || (this._pl = []));
    const cand = [];
    for (const c of list) {
      const el = c.h - py;
      if (el < 1.8) continue;
      if (c.claim && c.claim !== me && c.claimT > now && c.claim.alive) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 10) continue;
      const side = ((c.x - p.x) * ax + (c.z - p.z) * az) / d; // >0 = enemy side
      cand.push([el * 3 - Math.abs(d - 35) * 0.4 - side * 18 - Math.hypot(c.x - me.pos.x, c.z - me.pos.z) * 0.08, c]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < Math.min(8, cand.length); k++) {
      const c = cand[k][1];
      const rr = (p.r || 8) * 0.6;
      let seen = 0;
      for (const [qx, qz] of [[0, 0], [rr, 0], [-rr, 0], [0, rr], [0, -rr]]) if (W.clear(c.x, c.h + 1.5, c.z, p.x + qx, M.world.groundY(p.x + qx, p.z + qz) + 1.2, p.z + qz, true)) seen++;
      if (seen >= 2) {
        const tx = p.x + ax * 12, tz = p.z + az * 12;
        return { c, x: c.x, z: c.z, h: c.h, low: !(Nav.coverFrom(c, tx - c.x, tz - c.z) >= 1.5), peek: { x: c.x, z: c.z, stand: true }, tx, tz, score: cand[k][0], perch: true };
      }
    }
    return null;
  }
  startFlank(T) {
    this._fp = null; this.flankSide = this.flankSide || 1;
    // try the remembered side first, then the other one; the route must actually exist
    for (let k = 0; k < 2; k++) {
      const fp = this.flankPoint(T);
      const path = this.match.nav.findPath(this.me.pos.x, this.me.pos.z, fp.x, fp.z);
      if (path && !path.partial) { this.setState('flank'); this._flankAnnounced = 0; return true; }
      this.flankSide *= -1; this._fp = null;
    }
    this.flankDone = true; // no route round: fight from here
    return false;
  }
  squadEngaging(T) {
    for (const s of this.squad.members) if (s !== this.me && s.alive && s.brain && s.brain.target && s.brain.target.s === T.s && s.brain.target.seen) return true;
    return false;
  }
  coverFlanked(T) {
    // enemy has moved so far round that our cover point no longer faces them
    if (!this.cover) return true;
    return Nav.coverFrom(this.cover.c, T.x - this.cover.x, T.z - this.cover.z) <= 0;
  }
  goalInfo() {
    const o = this.squad.order;
    if (!o || !o.point) return null;
    return { x: o.point.x, z: o.point.z, r: o.point.r };
  }
  wantGrenade(T, vis, dist) {
    const me = this.me, now = this.match.time;
    if (this.gCD > 0 || me.grenades <= 0 || me.grenadeType !== 'frag') return false;
    if (dist < 8 || dist > 32) return false;
    // they are holed up: not visible right now, position fresh, been still for a while
    const still = now - T.stillSince;
    const holed = (!vis && now - T.t < 4 && still > 2.0) || (vis && still > 4 && T.s.crouchK > 0.5);
    if (!holed) return false;
    // don't blast teammates
    for (const s of this.match.soldiers) if (s.team === me.team && s.alive && Math.hypot(s.pos.x - T.x, s.pos.z - T.z) < 8) return false;
    if (R() > this.d.gren) { this.gCD = 3; return false; }
    const sol = this.solveThrow(T.x + T.vx * 0.4, T.y, T.z + T.vz * 0.4);
    if (!sol) { this.gCD = 2.5; return false; }
    this._throwVel = sol;
    return true;
  }
  throwAt(T) {
    const me = this.me;
    this.gCD = 14 + R() * 10;
    this.radio(R() < 0.5 ? 'Frag out!' : 'Grenade, flush them out!', 'frag', 4);
    me.intent.grenade = true;
    me.throwVel = this._throwVel;
    this.aimYaw = yawTo(T.x - me.pos.x, T.z - me.pos.z);
  }
  // find a lob (angle + speed) whose first impact lands within 'tol' metres of the target,
  // simulating the same gravity the grenade uses and ray-testing every segment
  solveThrow(tx, ty, tz, tol = 3) {
    const me = this.me, W = this.match.world;
    const eye = me.eye(this._eye5 || (this._eye5 = me.pos.clone()));
    const yaw = yawTo(tx - eye.x, tz - eye.z);
    const ox = eye.x - Math.cos(yaw) * 0.2, oy = eye.y, oz = eye.z + Math.sin(yaw) * 0.2;
    const dx = tx - ox, dz = tz - oz, d = Math.hypot(dx, dz), h = ty + 0.2 - oy, g = 20;
    if (d < 1) return null;
    const hit = this._rcg || (this._rcg = {});
    let best = null;
    for (const deg of [40, 52, 64, 30, 72]) {
      const th = deg * DEG;
      const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h);
      if (den <= 0) continue;
      const v = Math.sqrt(g * d * d / den);
      if (v > 25) continue;
      const vx = dx / d * Math.cos(th) * v, vy = Math.sin(th) * v, vz = dz / d * Math.cos(th) * v;
      let px = ox, py = oy, pz = oz, wy = vy, landed = null;
      for (let t = 0; t < 3; t += 0.06) {
        const nx = px + vx * 0.06, nwy = wy - g * 0.06, ny = py + (wy + nwy) * 0.03, nz = pz + vz * 0.06;
        const sx = nx - px, sy = ny - py, sz = nz - pz, L = Math.hypot(sx, sy, sz);
        const r = W.raycast(px, py, pz, sx / L, sy / L, sz / L, L, false, hit);
        if (r) { landed = [r.x, r.z]; break; }
        px = nx; py = ny; pz = nz; wy = nwy;
      }
      if (!landed) continue;
      const err = Math.hypot(landed[0] - tx, landed[1] - tz);
      if (err < tol && (!best || err < best.err)) { best = { x: vx, y: vy, z: vz, err }; if (err < 1.2) break; }
    }
    return best;
  }
  pickRevive(T, vis) {
    const me = this.me, now = this.match.time;
    let best = null, bd = 1e9;
    for (const s of this.match.soldiers) {
      if (s === me || s.team !== me.team || !s.alive || !s.downed) continue;
      const d = Math.hypot(s.pos.x - me.pos.x, s.pos.z - me.pos.z);
      const range = this.role === 'medic' ? 45 : vis ? 6 : 18;
      if (d > range) continue;
      if (this.role !== 'medic' && vis && d > 3) continue;
      if (s.reviver && s.reviver !== me && s.reviver.alive && !s.reviver.downed && now - s.reviverT < 1) continue;
      if (s.reviveClaim && s.reviveClaim !== me && s.reviveClaim.alive && !s.reviveClaim.downed && s.reviveClaimT > now) continue;
      if (d < bd) { bd = d; best = s; }
    }
    if (best && this.me.hp < 30) return null;
    if (best) { best.reviveClaim = me; best.reviveClaimT = now + 1.5; }
    return best;
  }

  // ------------------------------------------------------------------ act
  update(dt) {
    const me = this.me, M = this.match, now = M.time;
    const it = me.intent;
    this.suppress = Math.max(0, this.suppress - dt * (this.cover ? 0.55 : 0.4));
    this.gCD -= dt;
    this.percT -= dt;
    if (this.percT <= 0) { this.perceive(0.125); this.percT = 0.125; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.think(); this.thinkT = 0.25 + R() * 0.05; }
    // regenerate a little when out of danger
    if (now - me.lastHurt > 6 && me.hp < me.maxHp) me.hp = Math.min(me.maxHp, me.hp + dt * 7);
    it.fire = false; it.ads = false; it.sprint = false; it.crouch = false; it.jump = false;
    it.mx = 0; it.mz = 0; // states that stop() must not keep walking on the last steer
    const T = this.target;
    let aimAt = null; // {x,y,z}
    let allowFire = false;
    let lookYaw = null;
    switch (this.state) {
      case 'evade': {
        this.steer(dt); it.sprint = true;
        if (this.arrived(1.5)) this.thinkT = 0;
        if (T && T.seen) aimAt = this.aimPoint(T);
        break;
      }
      case 'revive': {
        const s = this.reviveTarget;
        if (!s || !s.downed || !s.alive) { this.thinkT = 0; break; }
        const d = Math.hypot(s.pos.x - me.pos.x, s.pos.z - me.pos.z);
        // smoke screen first if the area is hot
        if (!this.reviveSmoke && me.grenadeType === 'smoke' && me.grenades > 0 && T && now - T.t < 6 && d < 30) {
          this.reviveSmoke = true;
          const mx = (s.pos.x * 2 + T.x) / 3, mz = (s.pos.z * 2 + T.z) / 3;
          me.throwTarget = { x: mx, y: s.pos.y, z: mz };
          me.throwVel = this.solveThrow(mx, s.pos.y, mz, 5);
          this.aimYaw = yawTo(mx - me.pos.x, mz - me.pos.z);
          it.grenade = true;
          this.radio('Popping smoke!', 'smoke', 6);
        }
        if (d > 1.4) { this.goTo(s.pos.x, s.pos.z, 'sprint'); this.steer(dt); it.sprint = d > 4; }
        else { this.stop(); it.crouch = true; M.reviveTick(me, s, dt); lookYaw = yawTo(s.pos.x - me.pos.x, s.pos.z - me.pos.z); }
        if (T && T.seen && d > 1.4 && R() < 0.02) aimAt = this.aimPoint(T);
        break;
      }
      case 'retreat': {
        const cv = this.cover;
        if (cv && !this.arrived(0.6)) { this.goTo(cv.x, cv.z, 'sprint'); this.steer(dt); it.sprint = !(T && T.seen && Math.hypot(T.x - me.pos.x, T.z - me.pos.z) < 15); }
        else { this.stop(); it.crouch = true; }
        if (T) { aimAt = T.seen ? this.aimPoint(T) : { x: T.x, y: T.y + 1.2, z: T.z }; allowFire = T.seen && me.w.mag > 0 && this.arrived(1); }
        if (me.w.mag < me.w.s.mag * 0.5) it.reload = true;
        break;
      }
      case 'cover': {
        const cv = this.cover;
        if (!cv) { this.thinkT = 0; break; }
        this.goTo(cv.x, cv.z, this.sub === 'urgent' ? 'sprint' : 'run');
        const L = this.steer(dt);
        const urgent = this.sub === 'urgent';
        it.sprint = urgent || (L > 6 && !(T && T.seen));
        if (T) { aimAt = T.seen ? this.aimPoint(T) : { x: T.x, y: T.y + 1.2, z: T.z }; allowFire = T.seen && !it.sprint; }
        if (this.arrived(0.5) || (this.path && this.pi >= this.path.length)) { this.setState('incover', 'hide'); this.hideT = now + 0.5 + R() * 0.6; }
        break;
      }
      case 'incover': {
        const cv = this.cover;
        if (!cv) { this.thinkT = 0; break; }
        const tgt = T || null;
        if (this.sub === 'hide') {
          this.goTo(cv.x, cv.z, 'walk'); this.steer(dt);
          it.crouch = true;
          if (me.w.mag < me.w.s.mag * 0.6 && me.w.reserve > 0) it.reload = true;
          if (tgt) lookYaw = yawTo(tgt.x - me.pos.x, tgt.z - me.pos.z);
          if ((this.squad.moverUntil || 0) > now && this.squad.mover !== me && this.suppress < 0.8) this.hideT = Math.min(this.hideT, now);
          if (now > this.hideT && me.reloadT <= 0 && this.suppress < 0.55) { this.sub = 'peek'; this.peekT = now + 1.4 + R() * 1.4; this.peekSeen = false; }
        } else {
          // peek: stand up over low cover / step out from high cover
          const pk = cv.peek;
          if (pk && !pk.stand) { this.goTo(pk.x, pk.z, 'walk'); this.steer(dt); }
          else { this.goTo(cv.x, cv.z, 'walk'); this.steer(dt); }
          it.crouch = false;
          if (tgt) {
            aimAt = tgt.seen ? this.aimPoint(tgt) : { x: tgt.x, y: tgt.y + 1.2, z: tgt.z };
            allowFire = tgt.seen;
            if (tgt.seen) this.peekSeen = true;
            it.ads = Math.hypot(tgt.x - me.pos.x, tgt.z - me.pos.z) > 10;
          }
          const hurtRecently = now - this.hurtT < 0.6;
          if (now > this.peekT || this.suppress > 0.65 || hurtRecently || me.w.mag === 0) {
            if (!this.peekSeen) this.peekFails++; else this.peekFails = 0;
            this.sub = 'hide'; this.hideT = now + 0.7 + R() * 1.2 + (hurtRecently ? 0.8 : 0);
            if (this.peekFails >= 3) { this.peekFails = 0; this.claimCover(null); this.thinkT = 0; this.setState(this.role === 'flanker' ? 'flank' : 'search'); }
          }
        }
        break;
      }
      case 'engage': {
        if (!T) { this.thinkT = 0; break; }
        aimAt = T.seen ? this.aimPoint(T) : { x: T.x, y: T.y + 1.2, z: T.z };
        allowFire = T.seen;
        const dist = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
        if (this.sub === 'rush') {
          if (dist > 4) { this.goTo(T.x, T.z, 'run'); this.steer(dt); }
          else this.strafe(dt, T);
        } else {
          this.strafe(dt, T);
          it.crouch = dist > 18 && ((now * 0.7 + me.id) % 3) < 1.6;
          it.ads = dist > 12;
        }
        break;
      }
      case 'flank': {
        if (!T) { this.thinkT = 0; break; }
        // pick a flank point off to the side of the target, path avoids the direct line
        const fp = this.flankPoint(T);
        if (!this._flankAnnounced || now - this._flankAnnounced > 15) { this._flankAnnounced = now; this.radio(this.flankSide > 0 ? 'Flanking right!' : 'Flanking left!', 'flank' + me.id, 15); }
        const sx = me.pos.x, sz = me.pos.z, tx = T.x, tz = T.z;
        this.goTo(fp.x, fp.z, 'run', { danger: (x, z) => { const dd = segDist(x, z, sx, sz, tx, tz); const dt2 = Math.hypot(x - tx, z - tz); return (dd < 9 ? (9 - dd) * 0.8 : 0) + (dt2 < 10 ? (10 - dt2) * 0.6 : 0); } });
        const L = this.steer(dt);
        it.sprint = L > 8 && !(T.seen);
        if (T.seen) { aimAt = this.aimPoint(T); allowFire = Math.hypot(T.x - me.pos.x, T.z - me.pos.z) < 30; }
        if (this.arrived(1.5) || (this.path && this.pi >= this.path.length)) { this.flankDone = true; this.thinkT = 0; this.setState('search'); }
        if (now - this.stateT > 20) { this.flankDone = true; this.thinkT = 0; }
        break;
      }
      case 'suppress': {
        if (!T) { this.thinkT = 0; break; }
        // fire at the last known position even without a clear shot; stay put or in cover
        it.crouch = !!(this.cover && this.cover.low) ? false : true;
        aimAt = { x: T.x, y: T.y + 1.0, z: T.z };
        const ok = M.world.clear(me.pos.x, me.pos.y + 1.4, me.pos.z, T.x, T.y + 1.2, T.z, false) || Math.hypot(T.x - me.pos.x, T.z - me.pos.z) > 15;
        allowFire = ok && me.w.mag > me.w.s.mag * 0.2;
        this.stop();
        it.ads = true;
        break;
      }
      case 'hold': {
        this.stop();
        it.crouch = true;
        if (T) { aimAt = { x: T.x, y: T.y + 1.3, z: T.z }; it.ads = Math.hypot(T.x - me.pos.x, T.z - me.pos.z) > 15; }
        if (me.w.mag < me.w.s.mag * 0.7) it.reload = true;
        break;
      }
      case 'search': {
        if (!T) { this.thinkT = 0; break; }
        const dist = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
        if (dist > 3) {
          this.goTo(T.x, T.z, dist > 14 ? 'run' : 'sneak');
          this.steer(dt);
          it.crouch = dist < 12;
          aimAt = { x: T.x, y: T.y + 1.3, z: T.z };
        } else {
          // arrived and nothing: sweep the area, then give up on this contact
          this.stop();
          if (!this.searchT || now - this.searchT > 6) this.searchT = now;
          lookYaw = this.me.yaw + Math.sin((now - this.searchT) * 1.4) * 1.6;
          if (now - this.searchT > 4) { T.t = now - MEMORY - 1; this.target = null; this.thinkT = 0; this.searchT = 0; }
        }
        if (me.w.mag < me.w.s.mag * 0.5) it.reload = true;
        break;
      }
      case 'investigate': {
        if (!T) { this.thinkT = 0; break; }
        const dist = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
        // don't wander off the objective: approach partway, look
        const o = this.squad.order;
        const anchor = o && o.point ? o.point : null;
        let gx = T.x, gz = T.z;
        if (anchor && Math.hypot(gx - anchor.x, gz - anchor.z) > 35 && this.role !== 'flanker') { gx = lerp(me.pos.x, T.x, 0.4); gz = lerp(me.pos.z, T.z, 0.4); }
        if (dist > 4) { this.goTo(gx, gz, 'walk'); this.steer(dt); }
        aimAt = { x: T.x, y: T.y + 1.3, z: T.z };
        it.crouch = dist < 15;
        if (now - this.stateT > 10 || dist < 4) { T.t = Math.min(T.t, now - 15); this.thinkT = 0; }
        break;
      }
      default: { // objective
        this.objective(dt);
        lookYaw = this.lookYawObjective();
        if (T && T.seen) {
          const d = Math.hypot(T.x - me.pos.x, T.z - me.pos.z);
          if (d < Math.max(45, this.prefRange() * 1.8)) { aimAt = this.aimPoint(T); allowFire = true; it.sprint = false; it.ads = d > 25 && me.speedNow < 2; }
        }
        break;
      }
    }
    if (now < this.lookT && !aimAt) lookYaw = this.lookYaw;
    this.aim(dt, aimAt, lookYaw);
    // shooting discipline
    if (allowFire && aimAt && now > this.reactT + (T ? T.firstSeen : 0) && this.onTarget(aimAt)) this.trigger(dt, aimAt);
    else { this.burst = 0; }
    // weapon management: empty primary with no reserve -> pistol
    const w = me.w;
    if (w.mag === 0 && w.reserve === 0 && me.cur !== 1 && me.slots[1] && (me.slots[1].mag > 0 || me.slots[1].reserve > 0)) it.slot = 1;
    if (me.cur === 1 && me.slots[0] && (me.slots[0].mag > 0 || me.slots[0].reserve > 0) && !(T && T.seen)) it.slot = 0;
    if (me.cur === 3) it.slot = 0;
    // sprint bookkeeping by move mode
    if (this.moveMode === 'sprint' && !aimAt) it.sprint = true;
    if (this.moveMode === 'sneak') it.crouch = true;
    // debug
    this.dbg.line = this.state + (this.sub ? ':' + this.sub : '');
    this.dbg.cover = this.cover; this.dbg.lkp = T && !T.seen ? T : null;
  }
  aimPoint(T) {
    const e = T.s;
    // elite aim for heads more often
    const headK = this.d.err < 2 ? 0.35 : this.d.err < 3 ? 0.15 : 0.05;
    const p = (this._ap || (this._ap = { x: 0, y: 0, z: 0 }));
    const useHead = T.headOnly || ((this.me.id * 7 + Math.floor(this.match.time * 0.5)) % 100) / 100 < headK;
    const c = useHead ? e.head(this._hv || (this._hv = e.pos.clone())) : e.chest(this._cv || (this._cv = e.pos.clone()));
    p.x = c.x; p.y = c.y - (useHead ? 0 : 0.1); p.z = c.z;
    // lead moving targets for slow projectiles
    if (this.me.w.s.proj) { const d = Math.hypot(c.x - this.me.pos.x, c.z - this.me.pos.z) / this.me.w.s.proj.speed; p.x += e.vel.x * d; p.z += e.vel.z * d; p.y = e.pos.y + 0.4; }
    return p;
  }
  aim(dt, at, lookYaw) {
    const me = this.me, now = this.match.time;
    let yaw, pitch;
    if (at) {
      const eye = me.eye(this._eye2 || (this._eye2 = me.pos.clone()));
      const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
      yaw = yawTo(dx, dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
      // aim error: wanders, shrinks the longer we track
      this.trackT += dt;
      const settle = clamp(this.trackT / this.d.settle, 0, 1);
      const T = this.target;
      const tSpeed = T && T.s ? T.s.speedNow : 0;
      const dist = Math.hypot(dx, dz);
      let errDeg = this.d.err * lerp(1, 0.28, settle) * (1 + this.suppress * 1.5) * (me.speedNow > 1 ? 1.35 : 1) * (1 + tSpeed * 0.07) * (1 + dist / 90);
      // opening shots on a human player go wide (tracers + cracks warn them), so a human gets a fair
      // half-second to react; AI-vs-AI fights are untouched
      if (T && T.s && T.s.isPlayer && !T.s.brain && this.trackT < 0.55) errDeg *= lerp(this.d.open || 1, 1, this.trackT / 0.55);
      if (now > this.errT) { this.errT = now + 0.3 + R() * 0.3; this.errTY = (R() - 0.5) * 2 * errDeg * DEG; this.errTP = (R() - 0.5) * 1.4 * errDeg * DEG; }
      this.errY = lerp(this.errY, this.errTY, dt * 5); this.errP = lerp(this.errP, this.errTP, dt * 5);
      yaw += this.errY; pitch += this.errP;
    } else {
      this.trackT = Math.max(0, this.trackT - dt * 2);
      yaw = lookYaw !== null && lookYaw !== undefined ? lookYaw : this.moveYaw();
      pitch = -0.05;
    }
    const turn = this.d.turn * (at ? 1 : 0.7) * dt;
    this.aimYaw = approachAng(this.aimYaw, yaw, turn);
    this.aimPitch = approachAng(this.aimPitch, pitch, turn * 0.7);
    me.intent.yaw = this.aimYaw; me.intent.pitch = this.aimPitch;
  }
  onTarget(at) {
    const me = this.me;
    const eye = me.eye(this._eye3 || (this._eye3 = me.pos.clone()));
    const dx = at.x - eye.x, dz = at.z - eye.z;
    const yaw = yawTo(dx, dz);
    const tol = Math.max(3.5 * DEG, Math.atan2(1.0, Math.hypot(dx, dz)));
    return Math.abs(angDiff(this.aimYaw, yaw)) < tol + Math.abs(this.errY);
  }
  // line of fire: bullets must have a clear path to the aim point (suppressive fire only needs
  // the first few metres clear so we never empty a magazine into our own cover)
  lineOfFire(at) {
    const me = this.me, W = this.match.world, now = this.match.time;
    if (this._lofT > now) return this._lof;
    const e = me.eye(this._eye4 || (this._eye4 = me.pos.clone()));
    let ok;
    if (this.state === 'suppress') {
      const dx = at.x - e.x, dy = at.y - e.y, dz = at.z - e.z, L = Math.hypot(dx, dy, dz) || 1;
      ok = !W.raycast(e.x, e.y, e.z, dx / L, dy / L, dz / L, Math.min(L, 4), false, this._rcl || (this._rcl = {}));
    } else ok = W.clear(e.x, e.y, e.z, at.x, at.y, at.z, false);
    this._lof = ok; this._lofT = now + 0.1;
    if (!ok) this.blockedT = (this.blockedT || 0) + 0.1; else this.blockedT = 0;
    return ok;
  }
  trigger(dt, at) {
    const me = this.me, s = me.w.s, now = this.match.time, it = me.intent;
    if (!this.lineOfFire(at)) return;
    // friendly in the line of fire?
    for (const o of this.match.soldiers) {
      if (o === me || o.team !== me.team || !o.alive) continue;
      const d = segDist(o.pos.x, o.pos.z, me.pos.x, me.pos.z, at.x, at.z);
      const along = (o.pos.x - me.pos.x) * (at.x - me.pos.x) + (o.pos.z - me.pos.z) * (at.z - me.pos.z);
      if (d < 0.8 && along > 0 && Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z) < Math.hypot(at.x - me.pos.x, at.z - me.pos.z)) return;
    }
    if (s.proj && Math.hypot(at.x - me.pos.x, at.z - me.pos.z) < 8) return; // no point-blank rockets
    const dist = Math.hypot(at.x - me.pos.x, at.z - me.pos.z);
    if (this.burstPause > now) return;
    if (s.mode === 'auto') {
      if (this.burst <= 0) this.burst = dist < 10 ? 8 + R() * 6 : dist < 30 ? 4 + R() * 4 : 2 + R() * 3;
      it.fire = true;
      if (me.lastShot >= now - dt * 1.01) { this.burst--; if (this.burst <= 0) this.burstPause = now + (dist < 10 ? 0.15 : 0.3 + R() * 0.4) * (this.role === 'support' ? 0.6 : 1); }
    } else {
      // tap fire with a human-ish cadence
      const gap = s.mode === 'bolt' ? 0.4 : s.mode === 'pump' ? 0.15 : s.mode === 'burst' ? 0.18 : 0.12 + dist * 0.006;
      if (me.fireCD <= 0 && !me.fireHeld) { it.fire = true; this.burstPause = now + gap + R() * gap; }
    }
    if (dist > 14 && s.mode !== 'melee') it.ads = true;
  }
  strafe(dt, T) {
    const me = this.me, it = me.intent, now = this.match.time;
    // side-step perpendicular to the threat, switching direction every second or so
    if (!this._strafeT || now > this._strafeT) { this._strafeT = now + 0.7 + R() * 1.1; this._strafeDir = R() < 0.5 ? -1 : 1; }
    const dx = T.x - me.pos.x, dz = T.z - me.pos.z, L = Math.hypot(dx, dz) || 1;
    let sx = -dz / L * this._strafeDir, sz = dx / L * this._strafeDir;
    // keep preferred distance
    const pref = this.prefRange();
    const k = clamp((L - pref) / 10, -0.7, 0.7);
    sx += dx / L * k; sz += dz / L * k;
    if (!this.match.nav.isWalk(me.pos.x + sx * 1.5, me.pos.z + sz * 1.5)) { this._strafeDir *= -1; sx = -sx; sz = -sz; }
    this.stop();
    it.mx = sx * 0.6; it.mz = sz * 0.6;
  }
  flankPoint(T) {
    if (this._fp && this._fpT === T && this.match.time - this._fpTime < 6) return this._fp;
    const me = this.me;
    const dx = me.pos.x - T.x, dz = me.pos.z - T.z, L = Math.hypot(dx, dz) || 1;
    const px = -dz / L * this.flankSide, pz = dx / L * this.flankSide;
    let best = null;
    for (const r of [13, 10, 16, 8]) {
      const x = T.x + px * r + dx / L * 5, z = T.z + pz * r + dz / L * 5;
      if (this.match.nav.nearestWalkable(x, z, 3) >= 0) { best = { x, z }; break; }
    }
    if (!best) { this.flankSide *= -1; best = { x: T.x + dx / L * 8, z: T.z + dz / L * 8 }; }
    this._fp = best; this._fpT = T; this._fpTime = this.match.time;
    return best;
  }
  // ------------------------------------------------------------------ objective play
  objective(dt) {
    const me = this.me, M = this.match, now = M.time, it = me.intent;
    const o = this.squad.order;
    if (!o) { this.stop(); return; }
    const leader = this.squad.leader;
    const idx = this.squad.members.indexOf(me);
    // marksman: overwatch from elevated cover on our side of the objective
    if (this.role === 'marksman' && o.point) {
      const p = o.point, ax = o.ax ?? 0, az = o.az ?? (me.team === 0 ? -1 : 1);
      const ox = p.x - ax * 20, oz = p.z - az * 20;
      if (this.perchFor !== p || now - (this._owT || 0) > 35 || (!this.perch && (!this.cover || Math.hypot(this.cover.x - ox, this.cover.z - oz) > 32))) {
        this._owT = now; this.perchFor = p;
        const threat = { x: p.x + ax * 12, y: p.y || 0, z: p.z + az * 12 };
        this.perch = this.findPerch(p, ax, az);
        const cv = this.perch || this.findCover(threat, { cx: ox, cz: oz, maxD: 28, goal: { x: ox, z: oz, r: 22 } });
        this.claimCover(cv || null);
      }
      if (this.perch && this.cover !== this.perch) this.claimCover(this.perch);
      const cv = this.cover;
      const tx = cv ? cv.x : ox, tz = cv ? cv.z : oz;
      if (Math.hypot(tx - me.pos.x, tz - me.pos.z) > 0.7) { this.goTo(tx, tz, 'run'); const L = this.steer(dt); it.sprint = L > 10; this._watch = null; }
      else { this.stop(); it.crouch = !!(cv && cv.low); it.ads = true; this._watch = yawTo(p.x + ax * 15 - me.pos.x, p.z + az * 15 - me.pos.z) + Math.sin(now * 0.35 + me.id) * 0.35; }
      return;
    }
    if (o.type === 'defend' || (o.type === 'attack' && o.point && o.point.owner === me.team && !o.point.contested)) {
      // hold: take a cover spot around the point facing the expected approach
      const p = o.point;
      const ax = o.ax ?? 0, az = o.az ?? -Math.sign(me.team === 0 ? 1 : -1);
      if (!this.cover || Math.hypot(this.cover.x - p.x, this.cover.z - p.z) > p.r + 14 || now - (this._defendT || 0) > 25) {
        this._defendT = now;
        const threat = { x: p.x + ax * 40, y: p.y || 0, z: p.z + az * 40 };
        const cv = this.findCover(threat, { cx: p.x, cz: p.z, maxD: this.role === 'marksman' ? 30 : p.r + 8, goal: { x: p.x, z: p.z, r: this.role === 'marksman' ? 30 : p.r } });
        if (cv) this.claimCover(cv); else this.claimCover(null);
      }
      const cv = this.cover;
      const tx = cv ? cv.x : p.x + Math.cos(idx * 1.7) * p.r * 0.5, tz = cv ? cv.z : p.z + Math.sin(idx * 1.7) * p.r * 0.5;
      if (Math.hypot(tx - me.pos.x, tz - me.pos.z) > 0.7) { this.goTo(tx, tz, 'run'); const L = this.steer(dt); it.sprint = L > 10; }
      else { this.stop(); it.crouch = !!(cv && cv.low); this._watch = yawTo(ax, az) + Math.sin(now * 0.4 + me.id) * 0.6; }
      return;
    }
    // attack / hunt: move to the point (spread out); followers stay near the leader
    let tx = o.x, tz = o.z;
    if (o.point) {
      const a = idx * 2.1 + me.team;
      const rr = o.point.r * 0.55;
      tx = o.point.x + Math.cos(a) * rr; tz = o.point.z + Math.sin(a) * rr;
    }
    if (leader !== me && leader && leader.alive) {
      const dl = Math.hypot(leader.pos.x - me.pos.x, leader.pos.z - me.pos.z);
      const dLeaderGoal = Math.hypot(leader.pos.x - tx, leader.pos.z - tz), dMeGoal = Math.hypot(me.pos.x - tx, me.pos.z - tz);
      if (dl > 22 && dLeaderGoal < dMeGoal - 6) { tx = leader.pos.x + Math.cos(idx * 2) * 3; tz = leader.pos.z + Math.sin(idx * 2) * 3; }
      if (dMeGoal < dLeaderGoal - 12 && dl > 14) { this.stop(); it.crouch = true; this._watch = yawTo(tx - me.pos.x, tz - me.pos.z); return; } // wait for the squad
    }
    const d = Math.hypot(tx - me.pos.x, tz - me.pos.z);
    if (d > 1.0) {
      this.goTo(tx, tz, 'run');
      const L = this.steer(dt);
      it.sprint = L > 3 && d > 14 && now > this.alertT - 6;
      this._watch = null;
    } else if (o.type === 'hunt') {
      // reached the search spot: pick another one nearby
      const nav = M.nav, a = R() * Math.PI * 2, rr = 6 + R() * 10;
      const j = nav.nearestWalkable(o.x + Math.cos(a) * rr, o.z + Math.sin(a) * rr, 4);
      if (j >= 0) { o.x = nav.cx(j); o.z = nav.cz(j); }
    } else { this.stop(); it.crouch = true; this._watch = yawTo((o.ax ?? 0), (o.az ?? 1)) + Math.sin(now * 0.5 + me.id) * 1.2; }
  }
  lookYawObjective() {
    if (this._watch !== null && this._watch !== undefined && !this.path) return this._watch;
    // glance at recent sounds
    if (this.match.time < this.lookT) return this.lookYaw;
    return null;
  }
}
export { WEAPONS, fwdX, fwdZ };
