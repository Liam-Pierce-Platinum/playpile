// The thing's brain. It hunts by sight (needs light and an unbroken line, sees through
// chain-link, not through doors) and by sound (sprinting, slammed doors, things you knock over).
// It paths through the same streets, yards and buildings you do on a 0.5 m nav grid, prices a
// shut door by how long it takes to smash (so it will go round if round is quicker), leaps fences,
// crawls under roll gates, trips over things you knocked into its way.
// Lose it and it goes to where it last saw you, then searches - in stop-motion, head snapping
// round - in widening circles that drift toward you. It never gives up. The longer you last
// the faster it is, the quicker it gets over fences and through doors, and the more it runs to
// where you are going instead of where you are.
import * as THREE from 'three';
import { F_VAULT, F_DUCK } from './nav.js';
import { SOLID } from './collide.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = {};

export class Hunter {
  constructor(stage, monster, player, doors) {
    this.stage = stage; this.nav = stage.nav; this.S = stage.W.statics; this.props = stage.props;
    this.M = monster; this.P = player; this.doors = doors;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.lkp = new THREE.Vector3(); this.lkpVel = new THREE.Vector3();
    this.goal = new THREE.Vector3(); this.events = [];
    this.reset(0, 0, 0, 0);
  }
  reset(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.speed = 0;
    this.mode = 'intro'; this.modeT = 0; this.path = null; this.pathI = 0; this.repathT = 0; this.pathGoal = -1;
    this.seeing = false; this.lastSeen = 99; this.senseT = 0; this.searchT = 0; this.pauseT = 0; this.searchNode = -1;
    this.burstT = 0; this.burstCD = 3; this.crawlPref = 1; this.crawlFlip = 3; this.trip = new Map(); this.slowT = 0;
    this.vaultInfo = null; this.doorT = null; this.level = 0; this.direct = false; this.dist = 99; this.searchCenter = new THREE.Vector3();
    this.grabT = 0; this.clickT = 2; this.ambushCD = 9; this.duck = false; this.screamNext = 'chase'; this.stuckT = 0; this.farT = 0;
  }
  setMode(m) { if (this.mode !== m) { this.prev = this.mode; this.mode = m; this.modeT = 0; this.events.push({ type: 'mode', mode: m }); } }

  get base() { return Math.min(8.4, 5.6 + 0.33 * this.level); }

  perceive(dt, noises) {
    const P = this.P, S = this.S;
    const crawl = this.M.w.crawl > 0.5;
    const eye = _v.set(this.pos.x, this.pos.y + (crawl ? 1.2 : 2.2), this.pos.z);
    const pe = _w.set(P.pos.x, P.camY, P.pos.z);
    const dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    this.dist = dist;
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.1;
      const toP = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      let da = toP - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      const chasing = this.lastSeen < 3;
      const fovOK = Math.abs(da) < 1.3 || dist < 7 || chasing;
      const light = this.stage.lightAt(pe);
      const vis = clamp(light * 1.8, 0.3, 1);
      const range = (chasing ? 60 : lerp(13, 42, vis) * (P.crouch > 0.5 ? 0.55 : 1)) + this.level * 2;
      let see = dist < range && fovOK && !S.blocked(eye.x, eye.y, eye.z, pe.x, pe.y, pe.z) && !this.doors.blocksSight(eye, pe);
      // a second ray to the chest so a fence top or car roof does not hide you
      if (!see && dist < range && fovOK) see = !S.blocked(eye.x, eye.y, eye.z, pe.x, P.pos.y + 1.1, pe.z) && !this.doors.blocksSight(eye, _w.set(pe.x, P.pos.y + 1.1, pe.z));
      this.seeing = see;
    }
    if (this.seeing) { this.lastSeen = 0; this.lkp.copy(P.pos); this.lkpVel.copy(P.vel).setY(0); }
    else this.lastSeen += dt;
    // hearing
    const hearK = 1 + this.level * 0.1;
    let heard = null;
    if (!this.seeing && P.noise > 0 && dist < P.noise * hearK) heard = P.pos;
    for (const n of noises) if (Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z) < n.r * hearK) heard = n.pos;
    if (heard && !this.seeing) {
      const err = Math.min(4, Math.hypot(heard.x - this.pos.x, heard.z - this.pos.z) * 0.12) / (1 + this.level * 0.3);
      this.lkp.set(heard.x + (Math.random() - 0.5) * err, heard.y, heard.z + (Math.random() - 0.5) * err);
      this.lkpVel.copy(P.vel).setY(0).multiplyScalar(0.5);
      if (this.mode === 'search' || this.mode === 'hunt') { this.setMode('chase'); this.lastSeen = Math.max(this.lastSeen, 1.5); this.events.push({ type: 'heard' }); }
      else if (this.mode === 'chase' && this.lastSeen > 1) this.lastSeen = Math.min(this.lastSeen, 2);
    }
  }

  update(dt, t, level, noises) {
    this.level = level;
    this.modeT += dt;
    const P = this.P, M = this.M, nav = this.nav;
    if (this.mode === 'intro' || this.mode === 'grab' || this.mode === 'idle') { this.syncBody(dt, t); return; }
    this.perceive(dt, noises);

    // ---- special modes ----
    if (this.mode === 'scream') {
      this.speed = 0; this.vel.set(0, 0, 0);
      this.faceToward(P.pos, dt, 6);
      if (this.modeT > 0.55 - Math.min(0.25, level * 0.04)) { this.setMode('chase'); this.burstT = 1.3; this.burstCD = 2.5; }
      this.syncBody(dt, t); return;
    }
    if (this.mode === 'stumble') {
      this.speed *= Math.exp(-dt * 6);
      this.move(dt, this.yaw);
      if (this.modeT > this.stumbleDur) this.setMode('chase');
      this.syncBody(dt, t); return;
    }
    if (this.mode === 'smash') {
      const d = this.doorT;
      this.speed = 0; this.vel.set(0, 0, 0);
      this.faceToward(_v.set(d.cx, d.y, d.cz), dt, 8);
      const breakT = Math.max(0.45, 1.05 - 0.1 * level);
      const hitsWanted = Math.floor(this.modeT / (breakT / 3));
      if (hitsWanted > d.hits && d.hits < 3) this.doors.pound(d);
      if (this.modeT > breakT || d.broken || !this.doors.isShut(d)) {
        if (!d.broken && this.doors.isShut(d)) this.doors.smash(d, this.pos.x, this.pos.z);
        this.doorT = null; this.setMode('chase'); this.repathT = 0;
      }
      this.syncBody(dt, t); return;
    }
    if (this.mode === 'vault') {
      const v = this.vaultInfo; v.t += dt;
      const k = clamp(v.t / v.dur, 0, 1);
      this.pos.x = lerp(v.x0, v.x1, k); this.pos.z = lerp(v.z0, v.z1, k);
      const arc = Math.sin(k * Math.PI);
      this.pos.y = lerp(v.y0, v.y1, k) + arc * Math.max(0.3, v.top - Math.min(v.y0, v.y1) - 0.6);
      this.vel.set((v.x1 - v.x0) / v.dur, 0, (v.z1 - v.z0) / v.dur);
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      if (k >= 1) { this.setMode('chase'); this.pathI = Math.max(this.pathI, v.after); this.speed = this.base * 0.8; }
      this.syncBody(dt, t); this.checkCatch(); return;
    }

    // ---- choose a goal ----
    let goal = this.goal, speedK = 1;
    if (this.mode === 'chase') {
      if (this.seeing) {
        const lead = Math.min(1.1, 0.45 + 0.08 * level);
        goal.copy(P.pos).addScaledVector(P.vel.clone().setY(0), lead * clamp(this.dist / 10, 0, 1));
      } else if (this.lastSeen < 2.5) {
        // run on to where you were heading
        const k = level >= 1 ? 2.2 : 1.6;
        goal.copy(this.lkp).addScaledVector(this.lkpVel, Math.min(this.lastSeen + 0.5, 1.6) * k);
      } else goal.copy(this.lkp);
      const toGoal = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
      if (!this.seeing && this.lastSeen > 1.5 && toGoal < 1.6) {
        this.setMode('search'); this.searchT = 0; this.searchCenter.copy(this.pos); this.searchNode = -1; this.pauseT = 0.8;
      }
      // bursts of speed: on all fours, skittering
      this.burstCD -= dt;
      if (this.seeing && this.burstCD <= 0 && this.dist > 3 && this.dist < 26) { this.burstT = 1.0 + level * 0.06; this.burstCD = Math.max(2, 4.5 - 0.3 * level); this.events.push({ type: 'burst' }); }
      this.burstT -= dt;
      if (this.burstT > 0) speedK = 1.35;
      // rubber band: never let you get comfortably away
      if (this.dist > 10) speedK *= 1 + Math.min(0.5, (this.dist - 10) * 0.035);
      this.crawlFlip -= dt;
      if (this.crawlFlip <= 0) { this.crawlPref = Math.random() < 0.6 ? 1 : 0; this.crawlFlip = 2.5 + Math.random() * 4; }
    } else if (this.mode === 'search') {
      this.searchT += dt;
      speedK = 0.6;
      if (this.pauseT > 0) { this.pauseT -= dt; speedK = 0; }
      const reached = this.searchNode < 0 || Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 1.2;
      if (reached && this.pauseT <= 0) {
        if (this.searchNode >= 0) { this.pauseT = 0.8 + Math.random() * 1.6; this.events.push({ type: 'sniff' }); }
        // pick somewhere new, drifting toward where you really are the longer it looks
        const pull = clamp(0.15 + this.searchT / 30 + level * 0.06, 0, 0.85);
        const cx = lerp(this.searchCenter.x, P.pos.x, pull), cz = lerp(this.searchCenter.z, P.pos.z, pull);
        const r = Math.min(26, 7 + this.searchT * 0.8);
        const n = nav.randomNear(cx, P.pos.y, cz, r);
        if (n >= 0) { this.searchNode = n; nav.pos(n, goal); this.repathT = 0; }
      }
      if (this.searchT > 4 + Math.max(0, 4 - level)) { this.setMode('hunt'); }
    } else if (this.mode === 'hunt') {
      goal.copy(P.pos); speedK = 0.85 + 0.04 * level;
    }

    // ---- path toward the goal ----
    const myNode = nav.nodeAt(this.pos.x, this.pos.y, this.pos.z, 4);
    const goalNode = nav.nodeAt(goal.x, goal.y, goal.z, 6);
    this.direct = false;
    if (this.seeing && this.mode === 'chase' && this.dist < 26 && myNode >= 0 && goalNode >= 0 && Math.abs(P.pos.y - this.pos.y) < 1.2 && nav.clearLine(myNode, goalNode)) this.direct = true;
    let steer = null;
    if (this.direct) { steer = goal; this.path = null; }
    else {
      this.repathT -= dt;
      const goalMoved = this.pathGoal !== goalNode;
      if (!this.path || this.repathT <= 0 || (goalMoved && this.repathT < 0.25)) {
        this.repathT = 0.45;
        const breakT = Math.max(0.45, 1.05 - 0.1 * level);
        const res = nav.path(myNode, goalNode, { doorCost: d => (this.doors.isShut(d) ? 2 + breakT * this.base : 0), vaultCost: 3.2 - Math.min(1.5, level * 0.25) });
        this.path = res && res.nodes.length ? res.nodes : null; this.pathI = 0; this.pathGoal = goalNode;
      }
      if (this.path) steer = this.followPath();
    }

    // ---- what is just ahead on the path: fences, doors, crawlspaces ----
    this.duck = myNode >= 0 && !!(nav.flagOf(myNode) & F_DUCK);
    if (this.path && !this.direct) {
      for (let i = this.pathI; i < Math.min(this.path.length, this.pathI + 6); i++) {
        const n = this.path[i]; nav.pos(n, _v);
        const d = Math.hypot(_v.x - this.pos.x, _v.z - this.pos.z);
        if (d > 1.4) break;
        const fl = nav.flagOf(n);
        if (fl & F_DUCK) this.duck = true;
        const di = nav.doorOf(n);
        if (di >= 0) { const door = nav.doors[di]; if (this.doors.isShut(door) && d < 1.25) { this.doorT = door; door.hits = 0; this.setMode('smash'); this.syncBody(dt, t); return; } }
        if ((fl & F_VAULT) && d < 1.0) { if (this.startVault(i)) { this.syncBody(dt, t); return; } }
      }
    }

    // ---- never stuck: if it cannot find or follow a way to you, it comes out of the dark somewhere else ----
    const progress = this.speed > 0.6 || this.pauseT > 0;
    this.stuckT = progress ? Math.max(0, (this.stuckT || 0) - dt * 2) : (this.stuckT || 0) + dt;
    this.farT = this.dist > 30 && !this.seeing ? (this.farT || 0) + dt : 0;
    if ((this.stuckT > 2 || this.farT > 4) && this.relocate()) { this.syncBody(dt, t); return; }
    // cut you off: lose sight of it for a moment and it comes out of a side street AHEAD of you
    this.ambushCD -= dt;
    if (this.mode !== 'search' && this.ambushCD <= 0 && !this.seeing && this.lastSeen > 1 && this.dist > 11 && Math.hypot(P.vel.x, P.vel.z) > 3 && this.relocate(true)) { this.syncBody(dt, t); return; }

    // ---- move ----
    let want = this.base * speedK;
    if (this.duck) want *= 0.6;
    if (this.slowT > 0) { this.slowT -= dt; want *= 0.45; }
    if (!steer) want = 0;
    let yawT = this.yaw;
    if (steer) yawT = Math.atan2(steer.x - this.pos.x, steer.z - this.pos.z);
    this.turnTo(yawT, dt, this.M.w.crawl > 0.5 ? 13 : 10);
    // do not charge off sideways: slow when the heading is wrong
    let da = yawT - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    want *= clamp(1.2 - Math.abs(da) * 0.7, 0.25, 1);
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want > this.speed ? 5 : 8)));
    this.move(dt, this.yaw);

    // ---- props in the way ----
    this.props.near(this.pos.x, this.pos.z, 0.6, (p, d) => {
      if (Math.abs(p.pos.y - this.pos.y - 0.4) > 1.4) return;
      const fp = this.props.footprint(p);
      const r = Math.max(fp.ex, fp.ez) * 0.75 + 0.35;
      if (d > r) return;
      const up = this.props.upright(p);
      const last = this.trip.get(p.id) ?? -99;
      if (up > 0.75 && fp.ey > 0.25) {
        // standing: swat it aside
        if (t - last > 1) {
          this.trip.set(p.id, t);
          const dir = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
          this.props.impulse(p, dir.multiplyScalar(p.T.mass * (3 + this.speed * 0.6)).setY(p.T.mass * 1.2), p.pos.clone().setY(p.pos.y + fp.ey * 0.6));
          this.slowT = Math.max(this.slowT, 0.18 + p.T.mass * 0.01);
          this.events.push({ type: 'swat', p });
        }
      } else if (t - last > 5 && this.speed > 1.5) {
        // lying in its path: it goes down
        this.trip.set(p.id, t);
        const big = p.T.mass > 10 ? 1.25 : p.T.mass > 5 ? 1 : 0.65;
        this.stumbleDur = Math.max(0.55, (1.35 - level * 0.07) * big);
        this.setMode('stumble');
        const dir = new THREE.Vector3(Math.sin(this.yaw), 0.2, Math.cos(this.yaw));
        this.props.impulse(p, dir.multiplyScalar(p.T.mass * 2.5), p.pos);
        this.events.push({ type: 'trip', p });
      }
    });
    this.checkCatch();
    this.syncBody(dt, t);
  }

  followPath() {
    const nav = this.nav, path = this.path;
    // advance past nodes we are on, and skip ahead along straight runs
    while (this.pathI < path.length - 1) {
      nav.pos(path[this.pathI], _v);
      if (Math.hypot(_v.x - this.pos.x, _v.z - this.pos.z) < 0.55) this.pathI++; else break;
    }
    let best = this.pathI;
    const cur = nav.nodeAt(this.pos.x, this.pos.y, this.pos.z, 2);
    if (cur >= 0) for (let i = Math.min(path.length - 1, this.pathI + 10); i > this.pathI; i--) {
      if (nav.flagOf(path[i]) || nav.doorOf(path[i]) >= 0) continue;
      let ok = true;
      for (let k = this.pathI; k <= i; k++) if (nav.flagOf(path[k]) || nav.doorOf(path[k]) >= 0) { ok = false; break; }
      if (ok && nav.clearLine(cur, path[i])) { best = i; break; }
    }
    return nav.pos(path[best], this._steer || (this._steer = new THREE.Vector3()));
  }

  startVault(i) {
    const nav = this.nav, path = this.path;
    let j = i;
    while (j < path.length && (nav.flagOf(path[j]) & F_VAULT)) j++;
    if (j >= path.length) return false;
    // land a little past the fence
    const after = Math.min(path.length - 1, j + 1);
    nav.pos(path[after], _w);
    let top = 0;
    for (let k = i; k < j; k++) top = Math.max(top, nav.hOf(path[k]) + (nav.vaultH[path[k] % nav.N] || 1.2));
    const dur = Math.max(0.28, 0.6 - 0.04 * this.level) * (top - this.pos.y > 1.6 ? 1.1 : 0.85);
    this.vaultInfo = { t: 0, dur, x0: this.pos.x, z0: this.pos.z, y0: this.pos.y, x1: _w.x, z1: _w.z, y1: _w.y, top, after };
    this.yaw = Math.atan2(_w.x - this.pos.x, _w.z - this.pos.z);
    this.setMode('vault');
    this.events.push({ type: 'vault', pos: this.pos.clone(), top });
    return true;
  }

  // jump to a reachable spot 14-24 m from the player, preferably out of their view, and hunt from there
  relocate(ahead = false) {
    const P = this.P, nav = this.nav;
    let fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const pv = Math.hypot(P.vel.x, P.vel.z);
    if (ahead && pv > 1) { fx = P.vel.x / pv; fz = P.vel.z / pv; }
    const pn = nav.nodeAt(P.pos.x, P.pos.y, P.pos.z, 6);
    let best = -1, bs = -1e9;
    const want = ahead ? 22 : 18, rad = ahead ? 28 : 24;
    for (let k = 0; k < 50; k++) {
      const n = nav.randomNear(P.pos.x, P.pos.y, P.pos.z, rad);
      if (n < 0) continue;
      nav.pos(n, _v);
      const d = Math.hypot(_v.x - P.pos.x, _v.z - P.pos.z);
      if (d < (ahead ? 17 : 14)) continue;
      if (Math.abs(_v.y - P.pos.y) > 1.5) continue;
      const inView = ((_v.x - P.pos.x) * fx + (_v.z - P.pos.z) * fz) / d;
      let sc;
      if (ahead) {
        if (inView < 0.55) continue;
        // round a corner ahead of you, not standing in the open
        const hid = this.S.blocked(P.pos.x, P.camY, P.pos.z, _v.x, _v.y + 1.8, _v.z);
        sc = inView * 10 + (hid ? 6 : 0) - Math.abs(d - want) + Math.random();
      } else sc = -inView * 10 - Math.abs(d - want) + Math.random();
      if (sc > bs) { bs = sc; best = n; }
    }
    if (best < 0) { if (ahead) this.ambushCD = 3; return false; }
    if (pn >= 0) { const r = this.nav.path(best, pn, {}); if (!r || !r.nodes.length) return false; }
    nav.pos(best, _v);
    this.pos.copy(_v); this.vel.set(0, 0, 0); this.speed = 0;
    this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    this.path = null; this.repathT = 0; this.stuckT = 0; this.farT = 0;
    this.lkp.copy(P.pos); this.lastSeen = 2;
    this.setMode('chase');
    for (const L of this.M.limbs) L.init = false;
    this.ambushCD = Math.max(9, 20 - this.level * 1.5) + Math.random() * 6;
    if (ahead) { this.burstT = 1.2; this.burstCD = 2; }
    this.events.push({ type: ahead ? 'ambush' : 'relocate', pos: this.pos.clone() });
    return true;
  }

  faceToward(p, dt, rate) { this.turnTo(Math.atan2(p.x - this.pos.x, p.z - this.pos.z), dt, rate); }
  turnTo(y, dt, rate) { let d = y - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += clamp(d, -rate * dt, rate * dt); }
  move(dt, yaw) {
    this.vel.set(Math.sin(yaw) * this.speed, 0, Math.cos(yaw) * this.speed);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // keep out of walls (fences / gates are handled by vaulting and crawling)
    this.S.resolveCircle(this.pos, 0.26, this.pos.y + 0.45, this.pos.y + 1.6, _o, b => b.k !== SOLID);
    const g = this.S.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.55, 0.1);
    this.pos.y += (g - this.pos.y) * Math.min(1, dt * 14);
  }
  checkCatch() {
    const P = this.P;
    if (this.mode === 'grab' || P.caught) return;
    const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z), dy = Math.abs(P.pos.y - this.pos.y);
    const reach = 1.15 + (this.M.w.crawl > 0.5 ? 0.15 : 0) + (this.mode === 'vault' ? 0.2 : 0);
    if (d < reach && dy < 1.4) this.events.push({ type: 'catch' });
  }

  // drive the body from the brain
  syncBody(dt, t) {
    const st = this.M.st, P = this.P;
    st.x = this.pos.x; st.y = this.pos.y; st.z = this.pos.z; st.yaw = this.yaw;
    st.vx = this.vel.x; st.vz = this.vel.z; st.speed = this.speed;
    const m = this.mode;
    st.crawl = (m === 'chase' && (this.burstT > 0 || this.crawlPref)) || this.duck || m === 'stumble' ? 1 : (m === 'vault' ? this.M.w.crawl : 0);
    st.stop = m === 'search' || (m === 'hunt' && this.dist > 12) || (m === 'idle');
    st.rear = m === 'scream' || m === 'smash' ? 1 : 0;
    st.scream = m === 'scream' ? 1 : 0;
    st.smash = m === 'smash' ? 1 : 0;
    st.vault = m === 'vault' ? 1 : 0;
    st.stumble = m === 'stumble' ? 1 : 0;
    st.reach = (m === 'chase' && this.dist < 3.2) ? 1 : 0;
    if (m !== 'intro' && m !== 'grab') st.jaw = m === 'scream' ? 1 : m === 'smash' ? 0.6 : m === 'chase' ? (this.dist < 6 ? 0.85 : 0.25 + 0.15 * Math.sin(t * 3)) : 0.08;
    st.look = (this.seeing || m === 'scream' || m === 'grab' || m === 'intro') ? (this._look || (this._look = new THREE.Vector3())).set(P.pos.x, P.camY, P.pos.z) : null;
    st.twitch = m === 'search' ? 1.5 : m === 'hunt' ? 1.1 : 0.7;
    st.ceiling = this.S.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.2) - this.pos.y;
  }
}
