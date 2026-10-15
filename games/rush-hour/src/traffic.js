// Traffic on the one connected road: same-direction cars you overtake (lanes j >= 0) and oncoming cars
// (lanes j < 0; behind the median wall on divided stretches). Car-following, blinkered lane changes,
// cut-ins ahead of the player, sudden braking, merging before roadworks and lane drops, and slowing for
// tight corners so they bunch up where you are cornering hardest. All in road space (s, lat).
import { makeCarMesh, TRAFFIC_COLORS, MAT } from './cars.js';
import { LANE_W } from './world.js';

const TYPES = ['sedan', 'sedan', 'hatch', 'suv', 'suv', 'sports', 'van', 'pickup', 'taxi'];

export class Traffic {
  constructor(root, T, works, rand) {
    this.root = root; this.T = T; this.works = works; this.R = rand;
    this.cars = []; this.pool = new Map(); this.t = 0;
  }
  sameLanes(s) { const a = []; for (let j = 0; j < 4; j++) if (this.T.laneOpen(j, s)) a.push(j); return a; }
  oncLanes(s) { const a = []; for (let j = -1; j >= -2; j--) if (this.T.laneOpen(j, s)) a.push(j); return a; }
  // lane j unusable at s (works or lane drop), looking 'lead' metres ahead in direction dir
  closed(j, s, lead = 0, dir = 1) {
    if (j >= 0) { const z = this.works?.closed(j, s, lead); if (z) return { open: z.open }; }
    for (const f of [0, 0.35, 0.7, 1]) if (!this.T.laneOpen(j, s + dir * lead * f)) return { open: j >= 0 ? -1 : 1 };
    return null;
  }

  take(type, color) {
    const key = type + color, list = this.pool.get(key);
    if (list && list.length) { const m = list.pop(); m.grp.visible = true; return m; }
    const m = makeCarMesh(type, color); m.key = key; this.root.add(m.grp); return m;
  }
  release(c) { c.m.grp.visible = false; if (!this.pool.has(c.m.key)) this.pool.set(c.m.key, []); this.pool.get(c.m.key).push(c.m); }
  pooled() { let n = 0; for (const l of this.pool.values()) n += l.length; return n; }

  spawn(s, lane, dir) {
    const T = this.T, st = T.STAGES[T.stageAt(s)], R = this.R;
    const type = R() < T.param(s, 'truck') ? (R() < 0.75 ? 'truck' : 'bus') : TYPES[(R() * TYPES.length) | 0];
    const color = type === 'taxi' ? '#f2c218' : type === 'bus' ? (R() < 0.5 ? '#e0e3e6' : '#2f6fd6') : TRAFFIC_COLORS[(R() * TRAFFIC_COLORS.length) | 0];
    const m = this.take(type, color);
    let v;
    if (dir > 0) {
      const [a, b] = st.speed;
      v = b - (lane / Math.max(1, st.lanes - 1)) * (b - a) * 0.8 + (R() - 0.5) * 3;
      if (type === 'truck' || type === 'bus') v = Math.min(v, a + 2);
    } else v = (T.wall(s) ? 27 : 24) + R() * 8;
    const c = { m, type, s, lane, lat: T.laneLat(lane), toLane: lane, dir, v, vDes: v, len: m.len, wid: m.wid,
      blink: 0, blinkSide: 0, change: 0, brakeT: 0, braking: false, spin: 0, spinV: 0, hitT: 0, passed: null, latV: 0 };
    this.cars.push(c);
    return c;
  }

  free(lane, s, back, front, except) {
    for (const c of this.cars) {
      if (c === except) continue;
      if (c.lane !== lane && c.toLane !== lane) continue;
      if (c.s + c.len / 2 > s - back && c.s - c.len / 2 < s + front) return false;
    }
    return true;
  }
  // never spawn a car that would leave no open same-direction lane around s (no rolling roadblocks)
  wallOk(j, s, lanes) {
    if (lanes.length <= 1) return true;
    let open = 0;
    for (const k of lanes) if (k !== j && !this.closed(k, s, 0) && this.free(k, s, 30, 30)) open++;
    return open >= 1;
  }
  fill(ps) { for (let s = ps + 70; s < ps + 430; s += 4) this.trySpawn(s); this._front = ps + 430; }
  trySpawn(s) {
    const T = this.T, R = this.R;
    const same = this.sameLanes(s), rate = T.param(s, 'density') * 4 / 100;
    for (const j of same) if (R() < rate && !this.closed(j, s, 60) && this.free(j, s, 14, 18) && this.wallOk(j, s, same)) this.spawn(s, j, 1);
    const oRate = (T.wall(s) ? 0.16 : T.param(s, 'oncDensity', 0.16)) * 4 / 100;
    for (const j of this.oncLanes(s)) if (R() < oRate && this.free(j, s, 30, 30)) this.spawn(s, j, -1);
  }

  update(dt, P) {
    this.t += dt;
    const T = this.T, R = this.R;
    this._front = this._front ?? P.s + 430;
    while (this._front < P.s + 430) { this.trySpawn(this._front); this._front += 4; }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.s < P.s - 90 || c.s > P.s + 700) { this.release(c); this.cars.splice(i, 1); }
    }
    const cars = this.cars;
    for (const c of cars) {
      if (c.hitT > 0) { // knocked: slide, spin, recover
        c.hitT -= dt; c.spin += c.spinV * dt; c.spinV *= 1 - 2.5 * dt;
        c.lat += c.latV * dt; c.latV *= 1 - 3 * dt;
        const lo = c.dir > 0 && T.wall(c.s) ? 0.5 : T.edgeL(c.s), hi = c.dir < 0 && T.wall(c.s) ? -0.5 : T.edgeR(c.s);
        c.lat = Math.max(lo + c.wid / 2, Math.min(hi - c.wid / 2, c.lat));
        c.v += (c.vDes * 0.5 - c.v) * dt * 1.5;
        c.s += c.v * c.dir * dt;
        if (c.hitT <= 0) {
          let j = T.laneOf(c.lat); if (c.dir > 0) j = Math.max(0, j); else j = Math.min(-1, j);
          if (!T.laneOpen(j, c.s)) j = c.dir > 0 ? 0 : -1;
          c.lane = c.toLane = j; c.change = 1; c.spin = 0;
        }
        c.braking = true;
        continue;
      }
      let gap = 1e9, lead = null;
      for (const o of cars) {
        if (o === c || o.dir !== c.dir) continue;
        if (o.lane !== c.lane && o.toLane !== c.lane && o.lane !== c.toLane && o.toLane !== c.toLane) continue;
        const d = (o.s - c.s) * c.dir - (o.len + c.len) / 2;
        if (d > -0.5 && d < gap) { gap = d; lead = o; }
      }
      let target = c.vDes;
      // corner speed: look a little ahead, lateral accel ~ 1.1 g (trucks 0.8 g)
      const k = Math.max(Math.abs(T.curv(c.s + c.dir * 25)), Math.abs(T.curv(c.s + c.dir * 8)));
      if (k > 1e-4) target = Math.min(target, Math.sqrt((c.type === 'truck' || c.type === 'bus' ? 8 : 11) / k));
      if (c.brakeT > 0) { c.brakeT -= dt; target = c.vDes * 0.35; }
      const safe = 6 + c.v * 0.9;
      if (lead && gap < safe) target = Math.min(target, lead.v * (gap < safe * 0.5 ? 0.7 : 1));
      if (gap < 2) target = 0;
      const acc = target > c.v ? 3.5 : (gap < safe * 0.5 ? 14 : 7);
      c.braking = target < c.v - 0.5;
      c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), acc * dt);
      c.s += c.v * c.dir * dt;

      if (c.change === 0 && c.blink <= 0) {
        const st = T.STAGES[T.stageAt(c.s)];
        const closed = this.closed(c.lane, c.s, 130, c.dir);
        let want = 0;
        if (closed) want = closed.open;
        else if (c.dir > 0) {
          const ahead = c.s - P.s;
          if (R() < st.lc * dt) want = R() < 0.5 ? -1 : 1;
          else if (st.cut > 0 && ahead > 22 && ahead < 70 && Math.abs(P.lat - c.lat) > LANE_W * 0.6 && Math.abs(P.lat - c.lat) < LANE_W * 1.4 && R() < st.cut * dt) want = Math.sign(P.lat - c.lat);
          else if (lead && gap < safe && R() < 0.4 * dt && c.type !== 'truck') want = R() < 0.5 ? -1 : 1;
        }
        if (want) {
          const nl = c.lane + want, okSide = c.dir > 0 ? nl >= 0 : nl <= -1;
          const forced = !!closed && this.closed(c.lane, c.s, 50, c.dir);
          if (okSide && T.laneOpen(nl, c.s) && !this.closed(nl, c.s, 30, c.dir) && (forced || this.free(nl, c.s, 10 + c.len, 12 + c.len, c))) {
            c.toLane = nl; c.blink = closed ? 0.6 : 1.0; c.blinkSide = want;
          }
        }
        if (c.dir > 0 && st.brake > 0 && c.brakeT <= 0 && R() < st.brake * dt && c.s - P.s > 40 && c.s - P.s < 120) c.brakeT = 1.6;
      } else if (c.blink > 0) {
        c.blink -= dt; if (c.blink <= 0) c.change = 1;
      }
      if (c.change) {
        const tl = T.laneLat(c.toLane), d = tl - c.lat, sp = 2.4 * dt;
        if (Math.abs(d) <= sp) { c.lat = tl; c.lane = c.toLane; c.change = 0; c.blinkSide = 0; }
        else c.lat += Math.sign(d) * sp;
      }
    }
  }

  sync(time) {
    const T = this.T;
    for (const c of this.cars) {
      const g = c.m.grp, f = T.frame(c.s);
      T.pos(c.s, c.lat, 0, g.position);
      const steer = c.change ? Math.sign(T.laneLat(c.toLane) - c.lat) * 0.06 : 0;
      g.rotation.set(0, f.yaw + (c.dir < 0 ? Math.PI : 0) - steer * c.dir + c.spin, Math.atan(f.b) * c.dir, 'YXZ');
      const u = g.userData;
      u.tail.material = c.braking ? MAT.tailOn : MAT.tailOff;
      const on = (Math.sin(time * 10) > 0), side = c.blinkSide * c.dir;
      u.bl.material = (side < 0 && on) || (c.hitT > 0 && on) ? MAT.ambOn : MAT.ambOff;
      u.br.material = (side > 0 && on) || (c.hitT > 0 && on) ? MAT.ambOn : MAT.ambOff;
    }
  }
  clear() { for (const c of this.cars) this.release(c); this.cars = []; this._front = undefined; }
}
