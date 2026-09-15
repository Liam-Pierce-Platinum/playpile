// ===================== NIGHT SHIFT :: STREET LIFE =====================
// Cars that drive the actual street network, and people on the pavement.
//
// Traffic here is not a lane simulation - it is a car on a road segment driving
// to the end of it and picking a new one at the junction. That is enough: what
// matters in a city chase is that the streets are occupied, that they stop for
// each other, and that you can put one between yourself and a patrol.

import { Car, boxOut } from './physics.js';
import { buildSpec, CIVILIAN } from './catalog.js';

const KEEP = 240;                 // cull beyond this from the player
const SPAWN_MIN = 70, SPAWN_MAX = 190;

export class CityTraffic {
  constructor(city) {
    this.city = city;
    this.cars = [];
    this.people = [];
    this.parked = [];
  }
  clear() { this.cars.length = 0; this.people.length = 0; this.parked.length = 0; }

  spawn(px, py) {
    const C = this.city;
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      const s = C.surfaceAt(x, y);
      if (!s.onRoad || !s.road) continue;
      const r0 = s.road;
      // drive one way or the other along the road, and sit in the right half
      const dir = Math.random() < 0.5 ? 1 : -1;
      const off = (r0.w * 0.25) * dir;
      const nx = -r0.uy, ny = r0.ux;
      const pick = CIVILIAN[(Math.random() * CIVILIAN.length) | 0];
      const spec = buildSpec(pick, {
        paint: PAINTS[(Math.random() * PAINTS.length) | 0],
        wheel: 'stockw', kit: 'stock',
      });
      const c = new Car(spec, x + nx * off, y + ny * off,
                        Math.atan2(r0.uy * dir, r0.ux * dir));
      c.civilian = true;
      c.gentle = false;
      c.road = r0; c.dir = dir;
      c.cruise = 9 + Math.random() * 7;
      c.speed = c.cruise;
      c.blink = 0;
      this.cars.push(c);
      return c;
    }
    return null;
  }

  // Kerbside, nose along the road, engine off.
  spawnParked(px, py) {
    const C = this.city;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 150;
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      const s = C.surfaceAt(x, y);
      if (!s.road) continue;
      const r0 = s.road;
      if (r0.kind === 'bridge') continue;
      // sit it against the kerb, just inside the carriageway edge
      const side = Math.random() < 0.5 ? 1 : -1;
      const t2 = Math.max(0, Math.min(1,
        ((x - r0.x0) * r0.dx + (y - r0.y0) * r0.dy) / (r0.len * r0.len)));
      const bx = r0.x0 + r0.dx * t2, by = r0.y0 + r0.dy * t2;
      const nx = -r0.uy, ny = r0.ux;
      const off = (r0.w / 2 - 1.5) * side;
      const cx = bx + nx * off, cy = by + ny * off;
      // never on top of something already there
      let clash = false;
      for (const o of this.parked) if (Math.hypot(o.x - cx, o.y - cy) < 7) { clash = true; break; }
      if (clash) continue;
      for (const o of this.cars) if (Math.hypot(o.x - cx, o.y - cy) < 8) { clash = true; break; }
      if (clash) continue;
      const pick = CIVILIAN[(Math.random() * CIVILIAN.length) | 0];
      const spec = buildSpec(pick, {
        paint: PAINTS[(Math.random() * PAINTS.length) | 0],
        wheel: 'stockw', kit: 'stock',
      });
      const c = new Car(spec, cx, cy, Math.atan2(r0.uy * side, r0.ux * side));
      c.civilian = true; c.parked = true; c.gentle = false;
      c.speed = 0; c.headlights = false;
      this.parked.push(c);
      return c;
    }
    return null;
  }

  spawnPerson(px, py) {
    const C = this.city;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 130;
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      const s = C.surfaceAt(x, y);
      // pavement: just off the tarmac, not in a building
      if (s.dist < 1 || s.dist > 5.5) continue;
      this.people.push({
        x, y, h: Math.random() * 7, speed: 0.9 + Math.random() * 0.7,
        wander: Math.random() * 7, step: Math.random() * 6, panic: 0,
        // the things a witness would actually mention
        build: 0.86 + Math.random() * 0.30,
        coat: COATS[(Math.random() * COATS.length) | 0],
        hair: HAIR[(Math.random() * HAIR.length) | 0],
        skin: SKIN[(Math.random() * SKIN.length) | 0],
        bag: Math.random() < 0.34,
        seenT: 0,
      });
      return;
    }
  }

  update(dt, px, py, want, wantPeople, threat, buildings) {
    const C = this.city;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.x - px, c.y - py) > KEEP) { this.cars.splice(i, 1); continue; }

      const s = C.surfaceAt(c.x, c.y);
      // wandered off the tarmac at a junction: find a road and get back on it
      if (!s.onRoad && s.road) c.road = s.road;
      const r0 = c.road || s.road;
      if (!r0) { this.cars.splice(i, 1); continue; }

      // steer to the correct half of the road, pointing along it
      const nx = -r0.uy, ny = r0.ux;
      const side = (c.x - r0.x0) * nx + (c.y - r0.y0) * ny;
      const wantOff = (r0.w * 0.25) * c.dir;
      const corr = clampN((wantOff - side) * 0.06, -0.5, 0.5);
      const along = Math.atan2(r0.uy * c.dir, r0.ux * c.dir);
      let d = along + corr - c.h;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;

      // stop for whatever is in front, including you
      let gap = 60;
      for (const o of this.cars) {
        if (o === c) continue;
        const rx = o.x - c.x, ry = o.y - c.y;
        const f = rx * Math.cos(c.h) + ry * Math.sin(c.h);
        const l = -rx * Math.sin(c.h) + ry * Math.cos(c.h);
        if (f > 0 && f < gap && Math.abs(l) < 2.4) gap = f;
      }
      if (threat) {
        const rx = threat.x - c.x, ry = threat.y - c.y;
        const f = rx * Math.cos(c.h) + ry * Math.sin(c.h);
        const l = -rx * Math.sin(c.h) + ry * Math.cos(c.h);
        if (f > 0 && f < gap && Math.abs(l) < 3.2) gap = f;
      }
      // A following distance rather than a hard stop line: they ease off as
      // the gap closes instead of standing on the brakes at 13 m, which is
      // what made every junction concertina.
      const safe = 6 + c.speed * 0.9;
      let target = gap > safe * 2 ? c.cruise
                 : gap > safe ? c.cruise * ((gap - safe) / safe)
                 : 0;
      // and they slow for the corner they are about to take
      if (Math.abs(d) > 0.35) target = Math.min(target, 7);
      const throttle = c.speed < target - 0.4 ? 0.8 : 0;
      const brake = c.speed > target + 1.2 ? Math.min(1, (c.speed - target) * 0.25) : 0;
      c.braking = brake > 0;
      c.updateFree(dt, { steer: clampN(d * 1.5, -1, 1), throttle, brake }, 1);
      // solid: traffic used to drive through the block like it was not there
      if (buildings) for (const b of buildings) boxOut(b, c, true);

      // reached the end of the segment: pick a new one at the junction
      const t = ((c.x - r0.x0) * r0.dx + (c.y - r0.y0) * r0.dy) / (r0.len * r0.len);
      if (t < 0.02 || t > 0.98) {
        const opts = C.roadsNear(c.x, c.y).filter(rr => rr !== r0);
        if (opts.length) {
          const nr = opts[(Math.random() * opts.length) | 0];
          const tt = ((c.x - nr.x0) * nr.dx + (c.y - nr.y0) * nr.dy) / (nr.len * nr.len);
          if (tt > 0.02 && tt < 0.98) {
            c.road = nr;
            c.dir = Math.cos(c.h) * nr.ux + Math.sin(c.h) * nr.uy > 0 ? 1 : -1;
          }
        }
      }
    }
    let guard = 0;
    while (this.cars.length < want && guard++ < 4) if (!this.spawn(px, py)) break;

    // ---- people ----
    // They scatter when something comes at them fast, which is most of what a
    // pedestrian is for: it tells you how badly you are driving.
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (Math.hypot(p.x - px, p.y - py) > KEEP * 0.7) { this.people.splice(i, 1); continue; }
      if (threat) {
        const d = Math.hypot(threat.x - p.x, threat.y - p.y);
        if (d < 16 && (threat.speed || 0) > 8) p.panic = 1.6;
      }
      p.panic = Math.max(0, p.panic - dt);
      if (p.panic > 0 && threat) {
        p.h = Math.atan2(p.y - threat.y, p.x - threat.x);
        p.x += Math.cos(p.h) * 5.2 * dt;
        p.y += Math.sin(p.h) * 5.2 * dt;
        p.step += dt * 14;
      } else {
        p.wander += (Math.random() - 0.5) * dt * 2.4;
        p.h += Math.sin(p.wander) * dt * 0.9;
        const nx2 = p.x + Math.cos(p.h) * p.speed * dt;
        const ny2 = p.y + Math.sin(p.h) * p.speed * dt;
        const s2 = C.surfaceAt(nx2, ny2);
        // keep to the pavement
        if (s2.dist > 0.6 && s2.dist < 6.5) { p.x = nx2; p.y = ny2; }
        else p.h += 2.2 * dt;
        p.step += p.speed * dt * 2.4;
      }
    }
    let g2 = 0;
    while (this.people.length < wantPeople && g2++ < 3) this.spawnPerson(px, py);

    // ---- parked ----
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const c = this.parked[i];
      if (Math.hypot(c.x - px, c.y - py) > KEEP) { this.parked.splice(i, 1); continue; }
      c.speed = 0; c.vx = 0; c.vy = 0;
    }
    let g3 = 0;
    while (this.parked.length < 40 && g3++ < 4) if (!this.spawnParked(px, py)) break;
  }
}

const PAINTS = ['#8d939c', '#2b3038', '#b9bec6', '#3d4c63', '#6b4a3c',
                '#2f4a3c', '#7a2b2b', '#c9c2b0', '#d8d2c4', '#1d2430',
                '#4a4f57', '#6d7683', '#233042', '#5c3a2e'];
const COATS = ['#2b3038', '#3d4553', '#5a4636', '#22303a', '#4a3040',
               '#6b6257', '#1e2a34', '#54341f', '#2f4038'];
const HAIR = ['#1a140f', '#2a2018', '#3d2b1c', '#5a4632', '#867a6e', '#141416'];
const SKIN = ['#c9b79c', '#a98a6a', '#7d5c40', '#5b402c', '#e0c9ae'];
function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
